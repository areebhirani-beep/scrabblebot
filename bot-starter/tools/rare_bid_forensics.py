"""Join completed public rare-letter sales with our own bid and final-rack logs.
No network, secrets, reducer calls or simulation. Logs prove attempts, not acceptance.
"""
import argparse
import collections
import json
import math
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]


def time(row, field):
    return int(row[field][0])


def winner(row):
    value = row["winner_bot_id"]
    return int(value[1]) if value[0] == 0 else None


def letters(counter):
    return "".join(letter * count for letter, count in sorted(counter.items()) if count > 0)


def diagnose(data, status, log, source_prefix="0890"):
    if data.get("publicOnly") is not True:
        raise ValueError("Expected explicitly public telemetry")
    own = int(data.get("botId", 172))
    locals_by_id = {int(row["id"]): row for row in status.get("completedLocalMatches", [])}
    bids = collections.defaultdict(list)
    for match in re.finditer(r"\[odysseus\] match (\d+): bid (\d+) on auction (\d+)", log):
        mid, amount, aid = map(int, match.groups())
        bids[mid, aid].append(amount)
    results = collections.defaultdict(list)
    plays = collections.defaultdict(list)
    auctions = {int(row["id"]): row for row in data.get("auctions", [])}
    top = {int(row["auction_id"]): int(row["top_bid"]) for row in data.get("archive", [])}
    for row in data.get("results", []):
        results[int(row["match_id"])].append(row)
    for row in data.get("plays", []):
        plays[int(row["match_id"])].append(row)
    output = []
    for mid, local in sorted(locals_by_id.items()):
        if not local.get("commit", "").startswith(source_prefix):
            continue
        sales, words = results[mid], plays[mid]
        own_won = [row for row in sales if winner(row) == own]
        own_words = [row for row in words if int(row["bot_id"]) == own]
        # Our final rack comes from our own client, never an opponent's view.
        start = collections.Counter(local.get("unplayed", ""))
        start.update("".join(row["word"] for row in own_words))
        start.subtract(row["letter"] for row in own_won)
        initial_valid = sum(start.values()) == 5 and all(count >= 0 for count in start.values()) and "unplayed" in local
        for sale in sales:
            rival = winner(sale)
            if sale["letter"] not in "JQXZ" or rival not in (18, 171):
                continue
            aid = int(sale["auction_id"])
            if aid not in auctions or aid not in top:
                continue
            opened, closed = time(auctions[aid], "opens_at"), time(sale, "closed_at")
            def own_state(at, inclusive):
                before = (lambda timestamp: timestamp <= at) if inclusive else (lambda timestamp: timestamp < at)
                won = [row for row in own_won if before(time(row, "closed_at"))]
                used = [row for row in own_words if before(time(row, "played_at"))]
                cash = 100 + sum(int(row["total_reward"]) for row in used) - sum(int(row["paid"]) for row in won)
                rack = start.copy()
                rack.update(row["letter"] for row in won)
                rack.subtract("".join(row["word"] for row in used))
                valid = initial_valid and all(count >= 0 for count in rack.values())
                return cash, letters(rack) if valid else None
            open_cash, open_rack = own_state(opened, True)
            close_cash, close_rack = own_state(closed, False)
            rival_won = [row for row in sales if winner(row) == rival]
            rival_words = [row for row in words if int(row["bot_id"]) == rival]
            lower = collections.Counter(row["letter"] for row in rival_won if time(row, "closed_at") <= opened)
            lower.subtract("".join(row["word"] for row in rival_words if time(row, "played_at") <= opened))
            later = sorted([row for row in rival_words if time(row, "played_at") >= closed and sale["letter"] in row["word"]],
                           key=lambda row: time(row, "played_at"))
            use = later[0] if later else None
            amounts = bids[mid, aid]
            output.append({"matchId": mid, "source": local["commit"], "auctionId": aid, "letter": sale["letter"],
                "rivalId": rival, "rivalTopBid": top[aid], "rivalPaid": int(sale["paid"]),
                "ourLoggedBidAttempts": amounts, "ourCashAtOpen": open_cash, "ourCashBeforeClose": close_cash,
                "ourCapAtOpen": math.floor(.7 * open_cash), "ourCapBeforeClose": math.floor(.7 * close_cash),
                "ourLastAttemptEqualsClosingCap": bool(amounts) and amounts[-1] == math.floor(.7 * close_cash),
                "fullCloseBalanceCouldStrictlyBeatWinner": close_cash > top[aid],
                "ourOwnLogReconstructedInitialRack": letters(start) if initial_valid else None,
                "ourOwnLogReconstructedRackAtOpen": open_rack, "ourOwnLogReconstructedRackBeforeClose": close_rack,
                "rivalPublicRackLowerBoundAtOpen": letters(lower),
                "rivalLaterWord": use["word"] if use else None,
                "rivalWordReward": int(use["total_reward"]) if use else None,
                "secondsFromAwardToRivalWord": (time(use, "played_at") - closed) / 1e6 if use else None})
    return {"snapshotCollectedAt": data.get("collectedAt"), "sourcePrefix": source_prefix, "rows": output,
        "limitations": ["Logged amounts are submitted attempts, not proof of accepted final bids.",
            "Cap comparison assumes source0890's maxBidShare0.7; source filter must change only with a reviewed cap setting.",
            "Own starting rack is reconstructed only when own final-rack log plus public plays minus own wins yields five nonnegative tiles.",
            "Opponent rack is only a public lower bound. Unobserved private starting tiles remain unknown.",
            "Whole-word reward is not marginal tile profit. Winning-bid selection and competing private racks prevent policy identification.",
            "Cash at opening/close can differ from cash when a bid was sent; raw logs lack per-bid timestamps."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=pathlib.Path, default=ROOT / "../../docs/research/odysseus-public-followup.json")
    parser.add_argument("--status", type=pathlib.Path, default=ROOT / ".runtime-odysseus/status.json")
    parser.add_argument("--log", type=pathlib.Path, default=ROOT / ".runtime-odysseus/live.log")
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / ".runtime-odysseus/rare-bid-forensics.json")
    args = parser.parse_args()
    report = diagnose(json.loads(args.input.read_text()), json.loads(args.status.read_text()), args.log.read_text())
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "rareAuctions": len(report["rows"]),
        "apparentlyCapLimited": sum(row["ourLastAttemptEqualsClosingCap"] for row in report["rows"]),
        "strictlyAffordableWinningBid": sum(row["fullCloseBalanceCouldStrictlyBeatWinner"] for row in report["rows"])}, indent=2))


if __name__ == "__main__":
    main()
