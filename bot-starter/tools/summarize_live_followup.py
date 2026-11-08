"""Offline public-history diagnostic. No network, credentials or live actions.

python3 -I tools/summarize_live_followup.py [--input FILE] [--status FILE] [--output FILE]
Source tags require matching completedLocalMatches in the optional status file.
"""
import argparse
import collections
import datetime
import json
import pathlib
import statistics

ROOT = pathlib.Path(__file__).resolve().parents[1]
FACE = dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", [1, 3, 3, 2, 1, 4, 2, 4, 1, 8, 5, 1, 3, 1, 1, 3, 10, 1, 1, 1, 1, 4, 4, 8, 4, 10]))


def micros(value):
    """SQL timestamp [micros], optional timestamp [0,[micros]], or None."""
    if value is None:
        return None
    if isinstance(value, list) and len(value) == 2:
        if value[0] == 1 and value[1] in ([], None):
            return None
        if value[0] == 0:
            return micros(value[1])
    if isinstance(value, list) and len(value) == 1:
        return int(value[0])
    if isinstance(value, (int, str)) and not isinstance(value, bool):
        return int(value)
    raise ValueError("Malformed public timestamp")


def winner(value):
    if value is None:
        return None
    if isinstance(value, list) and len(value) == 2:
        if value[0] == 1 and value[1] in ([], None):
            return None
        if value[0] == 0:
            return int(value[1])
    raise ValueError("Malformed public winner option")


def grouped(rows, key):
    result = collections.defaultdict(list)
    for row in rows:
        result[int(row[key])].append(row)
    return result


MEASURES = ("score", "place", "tiles", "spend", "premiumTiles", "premiumSpend", "sevenPlusWords",
            "finalBalance", "finalAuctionRewards", "finalBalanceMinusLateRewards", "balanceAtFinalAuctionOpen",
            "bestOpponentScore", "scoreGapToBestOpponent")


def aggregate(rows):
    return {"matches": len(rows), "winsIncludingTies": sum(row["win"] for row in rows),
            "winRate": statistics.mean(row["win"] for row in rows) if rows else None,
            "means": {key: statistics.mean(row[key] for row in rows) if rows else None for key in MEASURES},
            "minMatchId": min((row["matchId"] for row in rows), default=None),
            "maxMatchId": max((row["matchId"] for row in rows), default=None)}


def summarize(data, status=None):
    if data.get("publicOnly") is not True:
        raise ValueError("Expected explicitly public telemetry snapshot")
    status = status or {}
    bot = int(data.get("botId", 172))
    local = {int(row["id"]): row for row in status.get("completedLocalMatches", [])}
    names = {int(row["id"]): row["name"] for row in data.get("bots", [])}
    stats = {int(row["bot_id"]): row for row in data.get("stats", [])}
    parts = grouped(data.get("participants", []), "match_id")
    results = grouped(data.get("results", []), "match_id")
    plays = grouped(data.get("plays", []), "match_id")
    auctions = grouped(data.get("auctions", []), "match_id")
    records, skipped = [], []
    opponents = collections.defaultdict(list)
    for match in sorted(data.get("matches", []), key=lambda row: int(row["id"])):
        if match.get("status") != [2, []]:
            continue
        mid = int(match["id"])
        try:
            table, sales, words, rounds = parts[mid], results[mid], plays[mid], auctions[mid]
            ids = [int(row["bot_id"]) for row in table]
            if bot not in ids or len(ids) != len(set(ids)) or len(ids) < 2:
                raise ValueError("missing/duplicate participant")
            if len(sales) != int(match["current_round"]) or not sales:
                raise ValueError("incomplete auction results")
            sale_ids = {int(row["auction_id"]) for row in sales}
            if len(sale_ids) != len(sales) or {int(row["id"]) for row in rounds} != sale_ids or len(rounds) != len(sales):
                raise ValueError("incomplete/duplicate auctions")
            final = max(rounds, key=lambda row: (micros(row["opens_at"]), int(row["id"])))
            final_open = micros(final["opens_at"])
            end = micros(match.get("ended_at"))
            if final_open is None or end is None:
                raise ValueError("missing final interval")
            rewards = collections.Counter()
            for row in words:
                rewards[int(row["bot_id"])] += int(row["total_reward"])
            if any(rewards[int(row["bot_id"])] != int(row["score"]) for row in table):
                raise ValueError("word rewards do not reconcile to final scores")
            source = local.get(mid, {}).get("commit", "public-history-unassigned")
            this_match = []
            for participant in table:
                pid = int(participant["bot_id"])
                owned = [row for row in sales if winner(row["winner_bot_id"]) == pid]
                own_words = [row for row in words if int(row["bot_id"]) == pid]
                # A server-simulated penultimate winner can play inside the same
                # transaction that opens the final auction. Those equal-time
                # rewards already exist at the boundary; do not remove them.
                late = sum(int(row["total_reward"]) for row in own_words if final_open < micros(row["played_at"]) <= end)
                boundary_rewards = sum(int(row["total_reward"]) for row in own_words if micros(row["played_at"]) == final_open)
                # Previous close and next open share a transaction timestamp.
                # Use auction ID, not >= timestamp, to avoid adding the
                # penultimate purchase back to the final-opening balance.
                late_spend = sum(int(row["paid"]) for row in owned if int(row["auction_id"]) == int(final["id"]))
                score, balance = int(participant["score"]), int(participant["balance"])
                spend = sum(int(row["paid"]) for row in owned)
                if balance != 100 + score - spend:
                    raise ValueError("balance does not reconcile to starting100 + rewards - spend")
                premium = [row for row in owned if 3 <= FACE.get(row["letter"], 0) <= 5]
                other_score = max(int(row["score"]) for row in table if int(row["bot_id"]) != pid)
                this_match.append({"matchId": mid, "botId": pid, "name": names.get(pid, str(pid)), "source": source,
                    "seats": len(ids), "score": score, "win": score >= other_score,
                    "place": 1 + sum(int(row["score"]) > score for row in table),
                    "tiles": len(owned), "spend": spend, "premiumTiles": len(premium),
                    "premiumSpend": sum(int(row["paid"]) for row in premium),
                    "sevenPlusWords": sum(len(row["word"]) >= 7 for row in own_words),
                    "finalBalance": balance, "finalAuctionRewards": late,
                    "exactBoundaryRewards": boundary_rewards,
                    "finalBalanceMinusLateRewards": balance - late,
                    "balanceAtFinalAuctionOpen": balance - late + late_spend,
                    "bestOpponentScore": other_score, "scoreGapToBestOpponent": other_score - score})
            records.append(next(row for row in this_match if row["botId"] == bot))
            if mid in local:
                for row in this_match:
                    if row["botId"] != bot:
                        opponents[row["botId"]].append(row)
        except (KeyError, TypeError, ValueError) as error:
            skipped.append({"matchId": mid, "reason": str(error)})
    sources = collections.defaultdict(list)
    for row in records:
        sources[row["source"]].append(row)
    faced = []
    for pid, rows in opponents.items():
        faced.append({"botId": pid, "name": names.get(pid, str(pid)), "snapshotMu": stats.get(pid, {}).get("openskill_mu"),
                      "localSharedTableMetrics": aggregate(rows)})
    faced.sort(key=lambda row: -(row["snapshotMu"] if row["snapshotMu"] is not None else -999))
    local_records = [row for row in records if row["matchId"] in local]
    return {"generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "snapshotCollectedAt": data.get("collectedAt"), "statusUpdatedAt": status.get("updatedAt"), "botId": bot,
        "overall": aggregate(records), "local": aggregate(local_records),
        "bySource": {source: aggregate(rows) for source, rows in sources.items()},
        "localMatchesMissingFromSnapshot": sorted(set(local) - {row["matchId"] for row in records}),
        "skipped": skipped, "localMatches": local_records, "facedOpponentsBySnapshotMu": faced,
        "interpretation": [
            "Source cohorts are observational, not randomized causal comparisons; opponents and dates differ.",
            "Cash earned during the final auction is generally too late to buy a usable tile. Adjusted cash removes those rewards.",
            "balanceAtFinalAuctionOpen adds spending after that boundary back to reconstruct the boundary balance; it is not all avoidable waste.",
            "Boundary reconstruction includes final-auction spending only; previous close can have the same timestamp. Equal-time word rewards remain in boundary balance and are separately flagged.",
            "Opponent metrics use only tables shared with this local runner; snapshotMu is historical snapshot state, not a current leaderboard.",
            "Only complete reconciled ended matches are included. Separate SQL requests were not an atomic snapshot."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=pathlib.Path, default=ROOT / "../../docs/research/odysseus-public-followup.json")
    parser.add_argument("--status", type=pathlib.Path, default=ROOT / ".runtime-odysseus/status.json")
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / ".runtime-odysseus/live-followup-summary.json")
    args = parser.parse_args()
    data = json.loads(args.input.read_text())
    status = json.loads(args.status.read_text()) if args.status.exists() else None
    report = summarize(data, status)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "localMatches": report["local"]["matches"],
                      "skippedMatches": len(report["skipped"]), "bySource": report["bySource"]}, indent=2))


if __name__ == "__main__":
    main()
