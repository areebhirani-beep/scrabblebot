"""Read-only analysis of completed public tables shared with one rival. No network.

python3 -I tools/compare_rival.py [--rival 171] [--input FILE] [--status FILE]
Output: .runtime-odysseus/rival-171-comparison.json (or --output).
"""
import argparse
import bisect
import collections
import datetime
import json
import pathlib
import statistics

ROOT = pathlib.Path(__file__).resolve().parents[1]
FACE = dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", [1, 3, 3, 2, 1, 4, 2, 4, 1, 8, 5, 1, 3, 1, 1, 3, 10, 1, 1, 1, 1, 4, 4, 8, 4, 10]))


def stamp(value):
    if isinstance(value, list) and len(value) == 1:
        return int(value[0])
    if isinstance(value, list) and len(value) == 2 and value[0] == 0:
        return stamp(value[1])
    raise ValueError("Malformed timestamp")


def winner(value):
    if isinstance(value, list) and len(value) == 2:
        if value[0] == 0:
            return int(value[1])
        if value[0] == 1:
            return None
    raise ValueError("Malformed winner option")


def group(rows, key):
    out = collections.defaultdict(list)
    for row in rows:
        out[int(row[key])].append(row)
    return out


def mean(values):
    return statistics.mean(values) if values else None


def summarize_player(rows):
    count = len(rows)
    if not count:
        return {"matches": 0}
    sales = [sale for row in rows for sale in row["purchases"]]
    words = [word for row in rows for word in row["words"]]
    def sales_summary(selected):
        return {"tiles": len(selected), "tilesPerMatch": len(selected) / count,
                "meanPrice": mean([sale["paid"] for sale in selected]),
                "spendPerMatch": sum(sale["paid"] for sale in selected) / count,
                "facePointsPerMatch": sum(sale["face"] for sale in selected) / count}
    return {"matches": count, "score": mean([row["score"] for row in rows]),
        "place": mean([row["place"] for row in rows]), "winsIncludingTies": sum(row["place"] == 1 for row in rows),
        "finalBalance": mean([row["finalBalance"] for row in rows]),
        "finalAuctionRewards": mean([row["finalAuctionRewards"] for row in rows]),
        "balanceAtFinalAuctionOpen": mean([row["balanceAtFinalAuctionOpen"] for row in rows]),
        "purchases": sales_summary(sales),
        "byFaceClass": {name: sales_summary([sale for sale in sales if sale["faceClass"] == name])
                        for name in ("1-2", "3-5", "8-10")},
        "vowels": sales_summary([sale for sale in sales if sale["vowel"]]),
        "consonants": sales_summary([sale for sale in sales if not sale["vowel"]]),
        "byLetter": {letter: sales_summary([sale for sale in sales if sale["letter"] == letter]) for letter in FACE
                     if any(sale["letter"] == letter for sale in sales)},
        "byQuarter": [{"quarter": q + 1,
            **sales_summary([sale for sale in sales if sale["quarter"] == q]),
            "wordPointsPerMatch": sum(word["reward"] for word in words if word["quarter"] == q) / count,
            "wordsPerMatch": sum(word["quarter"] == q for word in words) / count,
            "meanBalanceAtQuarterStart": mean([row["balanceAtQuarterStart"][q] for row in rows])} for q in range(4)],
        "byWordLength": {str(length): {"count": sum(word["length"] == length for word in words),
            "pointsPerMatch": sum(word["reward"] for word in words if word["length"] == length) / count}
            for length in sorted({word["length"] for word in words})},
        "winningBidDiagnostics": {
            "observedWinningTopBids": sum(sale["topBid"] is not None for sale in sales),
            "meanWinningTopBid": mean([sale["topBid"] for sale in sales if sale["topBid"] is not None]),
            "meanTopBidShareOfReconstructedCloseBalance": mean([sale["topBidCloseBalanceShare"] for sale in sales
                                                               if sale["topBidCloseBalanceShare"] is not None]),
            "warning": "Only bids that won are archived here. Reconstructed close balance may differ from balance when bid was submitted."}}


def compare(data, status, rival):
    if data.get("publicOnly") is not True:
        raise ValueError("Expected public telemetry")
    ours = int(data.get("botId", 172))
    names = {int(row["id"]): row["name"] for row in data.get("bots", [])}
    local = {int(row["id"]): row.get("commit", "unknown") for row in status.get("completedLocalMatches", [])}
    participants = group(data.get("participants", []), "match_id")
    auctions = group(data.get("auctions", []), "match_id")
    results = group(data.get("results", []), "match_id")
    plays = group(data.get("plays", []), "match_id")
    top = {int(row["auction_id"]): int(row["top_bid"]) for row in data.get("archive", [])}
    paired, skipped = [], []
    for match in sorted(data.get("matches", []), key=lambda row: int(row["id"])):
        mid = int(match["id"])
        table = participants[mid]
        ids = [int(row["bot_id"]) for row in table]
        if match.get("status") != [2, []] or ours not in ids or rival not in ids:
            continue
        try:
            rounds = sorted(auctions[mid], key=lambda row: (stamp(row["opens_at"]), int(row["id"])))
            sales = results[mid]
            if len(ids) != len(set(ids)) or len(rounds) != len(sales) or len(sales) != int(match["current_round"]) or not rounds:
                raise ValueError("Incomplete shared match")
            positions = {int(row["id"]): i for i, row in enumerate(rounds)}
            if len(positions) != len(rounds) or {int(row["auction_id"]) for row in sales} != set(positions):
                raise ValueError("Missing/duplicate auction")
            opens = [stamp(row["opens_at"]) for row in rounds]
            end = stamp(match["ended_at"])
            quarter = lambda index: min(3, (index * 4) // len(rounds))
            pair = {"matchId": mid, "source": local.get(mid, "public-history-unassigned"),
                    "auctionType": match.get("auction_type"), "players": {}}
            for pid in (ours, rival):
                part = next(row for row in table if int(row["bot_id"]) == pid)
                won = [row for row in sales if winner(row["winner_bot_id"]) == pid]
                words = [row for row in plays[mid] if int(row["bot_id"]) == pid]
                score, balance = int(part["score"]), int(part["balance"])
                if sum(int(row["total_reward"]) for row in words) != score or 100 + score - sum(int(row["paid"]) for row in won) != balance:
                    raise ValueError("Scores/cash do not reconcile")
                def cash_at(timestamp, inclusive=True):
                    before = (lambda at: at <= timestamp) if inclusive else (lambda at: at < timestamp)
                    return 100 + sum(int(row["total_reward"]) for row in words if before(stamp(row["played_at"]))) - sum(int(row["paid"]) for row in won if before(stamp(row["closed_at"])))
                purchases = []
                for row in sorted(won, key=lambda row: positions[int(row["auction_id"])]):
                    aid = int(row["auction_id"])
                    face = FACE[row["letter"]]
                    close_balance = cash_at(stamp(row["closed_at"]), inclusive=False)
                    purchases.append({"round": positions[aid], "quarter": quarter(positions[aid]), "letter": row["letter"],
                        "face": face, "faceClass": "1-2" if face <= 2 else "3-5" if face <= 5 else "8-10",
                        "vowel": row["letter"] in "AEIOU", "paid": int(row["paid"]), "topBid": top.get(aid),
                        "closeBalanceBeforeAward": close_balance,
                        "topBidCloseBalanceShare": top[aid] / close_balance if aid in top and close_balance > 0 else None})
                word_details = [{"word": row["word"], "length": len(row["word"]), "reward": int(row["total_reward"]),
                    "quarter": quarter(max(0, bisect.bisect_right(opens, stamp(row["played_at"])) - 1)),
                    "secondsFromStart": (stamp(row["played_at"]) - opens[0]) / 1e6,
                    "inFinalAuction": opens[-1] < stamp(row["played_at"]) <= end} for row in words]
                pair["players"][str(pid)] = {"score": score, "place": 1 + sum(int(row["score"]) > score for row in table),
                    "finalBalance": balance, "finalAuctionRewards": sum(row["reward"] for row in word_details if row["inFinalAuction"]),
                    "balanceAtFinalAuctionOpen": cash_at(opens[-1]),
                    "balanceAtQuarterStart": [cash_at(opens[min(len(rounds) - 1, (q * len(rounds) + 3) // 4)]) for q in range(4)],
                    "purchases": purchases, "words": word_details}
            pair["scoreGapRivalMinusOurs"] = pair["players"][str(rival)]["score"] - pair["players"][str(ours)]["score"]
            paired.append(pair)
        except (KeyError, TypeError, ValueError) as error:
            skipped.append({"matchId": mid, "reason": str(error)})
    cohorts = {"allShared": paired, "localShared": [row for row in paired if row["matchId"] in local]}
    for source in sorted({row["source"] for row in paired if row["matchId"] in local}):
        cohorts[source] = [row for row in paired if row["source"] == source]
    summaries = {}
    for label, rows in cohorts.items():
        summaries[label] = {"sharedMatches": len(rows), "meanScoreGapRivalMinusOurs": mean([row["scoreGapRivalMinusOurs"] for row in rows]),
            "rivalOutscoresUs": sum(row["scoreGapRivalMinusOurs"] > 0 for row in rows),
            "usOutscoreRival": sum(row["scoreGapRivalMinusOurs"] < 0 for row in rows),
            "ties": sum(row["scoreGapRivalMinusOurs"] == 0 for row in rows),
            "ours": summarize_player([row["players"][str(ours)] for row in rows]),
            "rival": summarize_player([row["players"][str(rival)] for row in rows])}
    return {"generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "snapshotCollectedAt": data.get("collectedAt"),
        "ours": {"id": ours, "name": names.get(ours)}, "rival": {"id": rival, "name": names.get(rival)},
        "activeCommit": status.get("activeCommit"), "summaries": summaries, "matches": paired, "skipped": skipped,
        "limitations": ["Observational shared tables, not randomized A/B. Rival source/version changes are unknown.",
            "Word timing quarters follow auction openings; same-transaction server events may sit exactly on boundaries.",
            "Balance reconstructed from100 + public rewards - public payments, not private racks or losing bids.",
            "Winning bid archives alone cannot identify full bidding policy; conditioning on wins biases observed bid averages.",
            "Collection is a dated non-atomic snapshot; no current leaderboard claims."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rival", type=int, default=171)
    parser.add_argument("--input", type=pathlib.Path, default=ROOT / "../../docs/research/odysseus-public-followup.json")
    parser.add_argument("--status", type=pathlib.Path, default=ROOT / ".runtime-odysseus/status.json")
    parser.add_argument("--output", type=pathlib.Path)
    args = parser.parse_args()
    report = compare(json.loads(args.input.read_text()), json.loads(args.status.read_text()) if args.status.exists() else {}, args.rival)
    destination = args.output or ROOT / f".runtime-odysseus/rival-{args.rival}-comparison.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n")
    concise = {label: {"n": row["sharedMatches"], "scoreGapRivalMinusOurs": row["meanScoreGapRivalMinusOurs"],
        "oursScore": row["ours"].get("score"), "rivalScore": row["rival"].get("score")}
        for label, row in report["summaries"].items()}
    print(json.dumps({"output": str(destination), "cohorts": concise, "skipped": report["skipped"]}, indent=2))


if __name__ == "__main__":
    main()
