"""Offline calibration audit; no fitting, network calls, credentials or live actions.

Forward eight-match outcomes remain excluded unless --evaluate-forward is given.
This report compares descriptive cohorts, not matched randomized policy effects.
"""
import argparse
import collections
import datetime
import hashlib
import json
import math
import pathlib
import statistics

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime-odysseus"
BOT = 172
FORWARD_IDS = (42958, 42962, 42979, 42984, 42989, 42994, 42998, 43003)
TOP_OPPONENTS = (18, 171)  # Previously identified in the 22:33 research cohort.
SOURCE_POLICIES = {
    "0890ce4e": {"bidGain": 1.3, "samples": 24, "facePremium": 2, "cashLen": 7,
                 "note": "Earlier flat greedy evaluator and scheduler release."},
    "4516da7c": {"bidGain": 1.1, "samples": 24, "facePremium": 2, "cashLen": 7,
                 "note": "Indexed evaluator and terminal-plan improvement; not solely a gain change."},
}


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValueError("expected integer")
    return int(value)


def micros(value):
    if isinstance(value, list) and len(value) == 1:
        return number(value[0])
    if isinstance(value, list) and len(value) == 2 and value[0] == 0:
        return micros(value[1])
    raise ValueError("missing or malformed timestamp")


def winner(value):
    if isinstance(value, list) and len(value) == 2:
        if value[0] == 0:
            return number(value[1])
        if value[0] == 1 and value[1] in (None, []):
            return None
    raise ValueError("malformed winner option")


def grouped(rows, key):
    output = collections.defaultdict(list)
    for row in rows:
        output[number(row[key])].append(row)
    return output


def wilson(wins, count):
    if not count:
        return None
    z = 1.959963984540054
    fraction = wins / count
    denominator = 1 + z * z / count
    middle = (fraction + z * z / (2 * count)) / denominator
    radius = z * math.sqrt(fraction * (1 - fraction) / count + z * z / (4 * count * count)) / denominator
    return [max(0.0, middle - radius), min(1.0, middle + radius)]


def real_records(data, status, top_opponents=TOP_OPPONENTS):
    if number(data.get("botId", BOT)) != BOT or number(status.get("botId", BOT)) != BOT:
        raise ValueError("this audit is restricted to bot172")
    sources = {number(row["id"]): row.get("commit", "unknown") for row in status.get("completedLocalMatches", [])}
    bots = {number(row["id"]): row for row in data.get("bots", [])}
    parts = grouped(data.get("participants", []), "match_id")
    sales = grouped(data.get("results", []), "match_id")
    auctions = grouped(data.get("auctions", []), "match_id")
    plays = grouped(data.get("plays", []), "match_id")
    records, skipped = [], []
    for match in data.get("matches", []):
        if match.get("status") != [2, []]:
            continue
        mid = number(match["id"])
        try:
            table, results, words = parts[mid], sales[mid], plays[mid]
            ids = [number(row["bot_id"]) for row in table]
            if len(ids) < 2 or len(set(ids)) != len(ids) or ids.count(BOT) != 1:
                raise ValueError("missing/duplicate participants")
            rounds = sorted(auctions[mid], key=lambda row: (micros(row["opens_at"]), number(row["id"])))
            auction_ids = [number(row["id"]) for row in rounds]
            result_ids = [number(row["auction_id"]) for row in results]
            if not rounds or len(rounds) != number(match["current_round"]) or number(match["bag_total"]) != 0:
                raise ValueError("incomplete auction history")
            if len(set(auction_ids)) != len(rounds) or len(set(result_ids)) != len(results) or set(auction_ids) != set(result_ids):
                raise ValueError("missing/duplicate auction results")
            if len(rounds) != 98 - number(match.get("starting_rack_size", 5)) * len(ids):
                raise ValueError("auction count inconsistent with 98-tile bag and initial deal")
            rewards = collections.Counter()
            spend = collections.Counter()
            for word in words:
                rewards[number(word["bot_id"])] += number(word["total_reward"])
            for result in results:
                paid = number(result["paid"])
                if paid < 0:
                    raise ValueError("negative payment")
                owner = winner(result["winner_bot_id"])
                if owner is not None:
                    if owner not in ids:
                        raise ValueError("winner not seated in match")
                    spend[owner] += paid
            if any(rewards[number(row["bot_id"])] != number(row["score"])
                   or number(row["balance"]) != 100 + number(row["score"]) - spend[number(row["bot_id"])] for row in table):
                raise ValueError("scores/balances do not reconcile to rewards and payments")
            me = next(row for row in table if number(row["bot_id"]) == BOT)
            score = number(me["score"])
            own_sales = [row for row in results if winner(row["winner_bot_id"]) == BOT]
            own_words = [row for row in words if number(row["bot_id"]) == BOT]
            positions = {number(row["id"]): index for index, row in enumerate(rounds)}
            phases = [{"tiles": 0, "spend": 0} for _ in range(4)]
            for result in own_sales:
                quarter = min(3, positions[number(result["auction_id"])] * 4 // len(rounds))
                phases[quarter]["tiles"] += 1
                phases[quarter]["spend"] += number(result["paid"])
            opponents = [pid for pid in ids if pid != BOT]
            known = [bots[pid] for pid in opponents if pid in bots]
            final_open = micros(rounds[-1]["opens_at"])
            end = micros(match["ended_at"])
            final_words = sum(number(row["total_reward"]) for row in own_words
                              if final_open < micros(row["played_at"]) <= end)
            final_spend = sum(number(row["paid"]) for row in own_sales
                              if number(row["auction_id"]) == number(rounds[-1]["id"]))
            records.append({"matchId": mid, "sourceCommit": sources.get(mid, "unknown"),
                "seats": len(ids), "auctionType": match.get("auction_type"),
                "score": score, "place": 1 + sum(number(row["score"]) > score for row in table),
                "win": score == max(number(row["score"]) for row in table),
                "tiles": len(own_sales), "spend": spend[BOT], "endCash": number(me["balance"]),
                "cashAtFinalOpening": number(me["balance"]) - final_words + final_spend,
                "finalIntervalWordIncome": final_words, "sevenPlusWords": sum(len(row["word"]) >= 7 for row in own_words),
                "phases": phases, "opponentIds": opponents,
                "simulatedOpponents": sum(bool(row.get("is_simulated")) for row in known),
                "unknownOpponentMetadata": len(opponents) - len(known),
                "namedStrongOpponents": sorted(set(opponents) & set(top_opponents)),
                "bestOpponentScore": max(number(row["score"]) for row in table if number(row["bot_id"]) != BOT)})
        except (KeyError, TypeError, ValueError) as error:
            skipped.append({"matchId": mid, "reason": str(error)})
    return records, skipped


def summarize(rows, real=True):
    count = len(rows)
    if not count:
        return {"matches": 0}
    wins = sum(bool(row["win"]) for row in rows)
    metrics = ["score", "place", "endCash", "bestOpponentScore"]
    if real:
        metrics += ["tiles", "spend", "cashAtFinalOpening", "finalIntervalWordIncome", "sevenPlusWords", "simulatedOpponents"]
    result = {"matches": count, "winsIncludingTies": wins, "winRate": wins / count,
              "winRateWilson95": wilson(wins, count),
              "means": {key: statistics.mean(row[key] for row in rows) for key in metrics},
              "placementCounts": dict(sorted(collections.Counter(row["place"] for row in rows).items())),
              "seatCounts": dict(sorted(collections.Counter(row["seats"] for row in rows).items()))}
    if real:
        result.update({"matchIds": sorted(row["matchId"] for row in rows),
            "phaseMeans": [{"quarter": phase + 1,
                            "tiles": statistics.mean(row["phases"][phase]["tiles"] for row in rows),
                            "spend": statistics.mean(row["phases"][phase]["spend"] for row in rows)} for phase in range(4)],
            "simulatedOpponentCountDistribution": dict(sorted(collections.Counter(row["simulatedOpponents"] for row in rows).items())),
            "namedStrongOpponentPresenceRate": sum(bool(row["namedStrongOpponents"]) for row in rows) / count,
            "namedStrongOpponentCounts": dict(collections.Counter(pid for row in rows for pid in row["namedStrongOpponents"])),
            "opponentAppearanceCounts": dict(collections.Counter(pid for row in rows for pid in row["opponentIds"])),
            "unknownOpponentMetadata": sum(row["unknownOpponentMetadata"] for row in rows)})
    return result


def simulation_summary(artifact):
    records = []
    for row in artifact.get("details", []):
        scores = row["fieldScores"]
        if len(scores) < 2 or row["score"] != scores[0]:
            raise ValueError("simulator details do not identify seat-zero candidate")
        place = 1 + sum(score > scores[0] for score in scores)
        win = scores[0] == max(scores)
        if row["place"] != place or row["win"] != win:
            raise ValueError("simulator place/win disagrees with field scores")
        records.append({"score": scores[0], "place": place, "win": win,
                        "endCash": row["balance"], "seats": len(scores), "bestOpponentScore": max(scores[1:])})
    if len(records) != artifact.get("matches"):
        raise ValueError("incomplete simulation details")
    return {"summary": summarize(records, real=False), "effectivePolicy": artifact.get("effectivePolicy"),
            "effectiveRival": artifact.get("effectiveRival"), "config": artifact.get("config"),
            "seed": artifact.get("seed"),
            "missingTelemetry": ["per-game purchased tile count", "per-game auction payments",
                "phase acquisition/spend", "cash before final liquidation", "word timing and search completion",
                "actual opponent identities/versions/ratings", "transport latency and rejected actions"]}


def build_report(data, status, historical_ids, simulations, evaluate_forward=False, top_opponents=TOP_OPPONENTS):
    records, skipped = real_records(data, status, top_opponents)
    historical_ids = set(historical_ids)
    historical = [row for row in records if row["matchId"] in historical_ids]
    forward = [row for row in records if row["matchId"] not in historical_ids]
    by_source = collections.defaultdict(list)
    for row in historical:
        by_source[row["sourceCommit"]].append(row)
    source_summaries = {source: summarize(rows) for source, rows in sorted(by_source.items())}
    sim_reports = {label: simulation_summary(artifact) for label, artifact in simulations.items()}
    comparisons = []
    for prefix, label in [("0890ce4e", "GAIN13"), ("4516da7c", "BASE")]:
        source_rows = [row for row in historical if row["sourceCommit"].startswith(prefix)]
        actual = summarize(source_rows)
        simulated = sim_reports.get(label, {}).get("summary", {})
        comparison = {"realSourcePrefix": prefix, "knownRealPolicy": SOURCE_POLICIES[prefix],
                      "simulationArm": label, "matchedExperiment": False,
                      "real": actual, "synthetic": simulated,
                      "confounders": ["different dates and opponent fields", "unknown rival versions and policies",
                          "different source algorithms", "real MC24 versus screening MC8 when configured",
                          "instant simulated receipts versus real transport and limited bid revisions"]}
        if actual.get("matches") and simulated.get("matches"):
            comparison["descriptiveSyntheticMinusReal"] = {
                "winRatePercentagePoints": 100 * (simulated["winRate"] - actual["winRate"]),
                **{key: simulated["means"][key] - actual["means"][key]
                   for key in ["score", "place", "endCash", "bestOpponentScore"]}}
        comparisons.append(comparison)
    return {"generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "snapshotCollectedAt": data.get("collectedAt"), "botId": BOT, "calibrated": False,
        "purpose": "Describe model-to-real mismatches before any calibration; matching win rate alone is not sufficient.",
        "protocol": {"historicalDiagnosticIds": sorted(historical_ids),
            "historicalIsNotANewTrainingSplit": True,
            "forwardEvaluationOnlyIds": sorted(row["matchId"] for row in forward),
            "forwardOutcomesIncluded": evaluate_forward, "fittingPerformed": False,
            "warning": "Do not tune simulator/opponent weights on forward outcomes; previous train/validation/test cohorts remain distinct."},
        "sourceSummariesHistoricalOnly": source_summaries,
        "namedStrongOpponentDefinition": {"ids": list(top_opponents),
            "basis": "Fixed previously researched IDs, not a current-ranking or hidden-policy reconstruction."},
        "simulationArms": sim_reports, "descriptiveComparisons": comparisons,
        "forwardEvaluation": summarize(forward) if evaluate_forward else {"matches": len(forward), "outcomesWithheld": True},
        "skipped": skipped,
        "dataNeededBeforeClaimingCalibration": [
            "Current deployed friend-runner source hash and exact parameters; unknown history must stay unassigned.",
            "Opponent field mixtures and policy/version changes; four copies of our MC policy do not reproduce actual entrants.",
            "Per-auction simulator purchases/payments and phase cash flow, so score/tiles/spend can be matched jointly.",
            "Real event-to-decision and submit-to-receipt latency, rejection rates, and completed MC samples.",
            "Fresh prospective outcomes after freezing a model; eight forward matches are too small for precise win-rate validation.",
            "Opponent starting racks and losing bids remain hidden; completed public prices cannot identify their full policies."],
        "limitations": ["Source cohorts are small observational samples; intervals omit changing-field dependence and selection.",
            "Source4516 changes the evaluator/terminal plan as well as gain; this is not an isolated gain experiment.",
            "Historical source tags come only from local runner records, never inferred from later bot identity or rating.",
            "Final cash includes late word income; compare cashAtFinalOpening before interpreting it as avoidable waste.",
            "Public SQL collection is not an atomic snapshot; incomplete histories are excluded."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=pathlib.Path, default=RUNTIME / "odysseus-public-forward-2325.json")
    parser.add_argument("--historical-snapshot", type=pathlib.Path, default=RUNTIME / "odysseus-public-handoff.json")
    parser.add_argument("--status", type=pathlib.Path, default=RUNTIME / "status.json")
    parser.add_argument("--sim-prefix", default="reactive-48-v2")
    parser.add_argument("--output", type=pathlib.Path, default=RUNTIME / "calibration-audit.json")
    parser.add_argument("--evaluate-forward", action="store_true")
    args = parser.parse_args()
    data = json.loads(args.input.read_text())
    historical = json.loads(args.historical_snapshot.read_text())
    actual_forward = set(data["completedMatchIds"]) - set(historical["completedMatchIds"])
    if actual_forward != set(FORWARD_IDS):
        raise SystemExit("Snapshot no longer matches the frozen eight-match forward cohort; define a new protocol explicitly.")
    status = json.loads(args.status.read_text())
    paths = sorted(RUNTIME.glob(f"{args.sim_prefix}-live-*-reactive.json"))
    simulations = {path.name[len(args.sim_prefix + '-live-'):-len('-reactive.json')]: json.loads(path.read_text()) for path in paths}
    if not simulations:
        raise SystemExit("No simulation artifacts matched the requested frozen prefix")
    report = build_report(data, status, historical["completedMatchIds"], simulations, args.evaluate_forward)
    report["inputSha256"] = {str(path): hashlib.sha256(path.read_bytes()).hexdigest()
                            for path in [args.input, args.historical_snapshot, args.status, *paths]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "calibrated": False,
        "forwardIdsReserved": report["protocol"]["forwardEvaluationOnlyIds"],
        "forwardOutcomesIncluded": args.evaluate_forward,
        "comparisons": [{"source": row["realSourcePrefix"], "arm": row["simulationArm"],
                         "realMatches": row["real"].get("matches"), "syntheticMatches": row["synthetic"].get("matches"),
                         "gap": row.get("descriptiveSyntheticMinusReal")} for row in report["descriptiveComparisons"]],
        "skipped": len(report["skipped"])}, indent=2))


if __name__ == "__main__":
    main()
