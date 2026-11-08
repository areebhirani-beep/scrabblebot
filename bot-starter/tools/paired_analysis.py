#!/usr/bin/env python3
"""Offline paired bootstrap; never runs a bot or deploys.

python3 -I tools/paired_analysis.py .runtime-odysseus/cash9-validation-BASE.json \
    .runtime-odysseus/cash9-validation-CASH9.json --import-registry
"""
import argparse
import hashlib
import importlib.util
import json
import math
import pathlib
import random
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
WARNING = ("Conditional paired-bootstrap uncertainty only: fixed historical dataset and "
           "nonreactive market model. Surrogate exceedance is not live win probability "
           "or rating gain. Intervals do not cover input/model uncertainty, reused-cohort "
           "selection, multiple testing or optional stopping. No automatic deployment.")


def finite_number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    return value


def paired_rows(base, candidate):
    for key in ("seed", "calibrationDataset", "cohort"):
        if key not in base or key not in candidate or base[key] != candidate[key]:
            raise ValueError(f"Top-level {key} missing or mismatched")
    if base.get("metric") != "historicalScoreExceedance" or candidate.get("metric") != base["metric"]:
        raise ValueError("Both inputs must identify historicalScoreExceedance")
    left = base.get("result", {}).get("games")
    right = candidate.get("result", {}).get("games")
    if not isinstance(left, list) or not isinstance(right, list) or not left or len(left) != len(right):
        raise ValueError("Game arrays must be nonempty and have equal lengths")
    rows = []
    seen = set()
    for x, y in zip(left, right):
        for key in ("seed", "matchIndex", "historicalScore", "calibrationDataset", "cohort"):
            if key not in x or key not in y or x[key] != y[key]:
                raise ValueError(f"Paired game {key} missing or mismatched")
        if type(x["matchIndex"]) is not int or x["matchIndex"] < 0:
            raise ValueError("matchIndex must be a nonnegative integer")
        if x["matchIndex"] in seen:
            raise ValueError("Duplicate matchIndex")
        seen.add(x["matchIndex"])
        for record, envelope in ((x, base), (y, candidate)):
            for key in ("seed", "calibrationDataset", "cohort"):
                if record[key] != envelope[key]:
                    raise ValueError(f"Game {key} differs from top-level metadata")
            finite_number(record["score"], "score")
            finite_number(record["historicalScore"], "historicalScore")
            exceed = record.get("historicalScoreExceedance")
            if type(exceed) is not bool or exceed != (record["score"] > record["historicalScore"]):
                raise ValueError("Exceedance must be boolean and equal score > historicalScore")
        rows.append({
            "matchIndex": x["matchIndex"], "historicalScore": x["historicalScore"],
            "baseScore": x["score"], "candidateScore": y["score"],
            "scoreDelta": y["score"] - x["score"],
            "surrogateDeltaPP": 100 * (int(y["historicalScoreExceedance"]) -
                                       int(x["historicalScoreExceedance"])),
            "baseExceedance": x["historicalScoreExceedance"],
            "candidateExceedance": y["historicalScoreExceedance"],
        })
    return rows


def percentile(sorted_values, probability):
    position = (len(sorted_values) - 1) * probability
    low = int(position)
    high = min(low + 1, len(sorted_values) - 1)
    fraction = position - low
    return sorted_values[low] * (1 - fraction) + sorted_values[high] * fraction


def exact_discordance_p(gained, lost):
    """Two-sided exact conditional binomial test (paired binary/McNemar).

    H0: each discordant pair has probability 1/2 in either direction.
    Evaluate the smaller binomial tail by recurrence from its largest term;
    no factorials or huge binomial integers. Floating-point underflow can
    represent extremely small probabilities as zero.
    """
    if any(type(v) is not int or v < 0 for v in (gained, lost)):
        raise ValueError("Discordance counts must be nonnegative integers")
    n = gained + lost
    if n == 0 or gained == lost:
        return 1.0
    k = min(gained, lost)
    log_term = (math.lgamma(n + 1) - math.lgamma(k + 1) -
                math.lgamma(n - k + 1) - n * math.log(2))

    def tail_terms():
        term = math.exp(log_term)
        yield term
        for index in range(k, 0, -1):
            term *= index / (n - index + 1)
            yield term

    return min(1.0, 2 * math.fsum(tail_terms()))


def analyze(base, candidate, repetitions=2000, bootstrap_seed=8441):
    if type(repetitions) is not int or repetitions < 100:
        raise ValueError("At least 100 bootstrap repetitions are required")
    rows = paired_rows(base, candidate)
    n = len(rows)
    score = [r["scoreDelta"] for r in rows]
    surrogate = [r["surrogateDeltaPP"] for r in rows]
    rng = random.Random(bootstrap_seed)
    boot_score, boot_surrogate = [], []
    # One index sample is shared by both metrics; game pairing is never broken.
    for _ in range(repetitions):
        score_sum = surrogate_sum = 0
        for _ in range(n):
            index = rng.randrange(n)
            score_sum += score[index]
            surrogate_sum += surrogate[index]
        boot_score.append(score_sum / n)
        boot_surrogate.append(surrogate_sum / n)
    boot_score.sort()
    boot_surrogate.sort()
    gained = sum(d > 0 for d in surrogate)
    lost = sum(d < 0 for d in surrogate)
    discordant = gained + lost
    return {
        "metric_type": "surrogate", "N": n,
        "baseLabel": base.get("label"), "candidateLabel": candidate.get("label"),
        "seed": base["seed"], "cohort": base["cohort"],
        "calibrationDataset": base["calibrationDataset"],
        "baseParameters": base.get("parameters"), "candidateParameters": candidate.get("parameters"),
        "baseScore": sum(r["baseScore"] for r in rows) / n,
        "candidateScore": sum(r["candidateScore"] for r in rows) / n,
        "baseSurrogatePercent": 100 * sum(r["baseExceedance"] for r in rows) / n,
        "candidateSurrogatePercent": 100 * sum(r["candidateExceedance"] for r in rows) / n,
        "scoreDelta": sum(score) / n,
        "scoreConditional95": [percentile(boot_score, .025), percentile(boot_score, .975)],
        "surrogateDeltaPP": sum(surrogate) / n,
        "surrogateConditional95": [percentile(boot_surrogate, .025), percentile(boot_surrogate, .975)],
        "higherScoreGames": sum(d > 0 for d in score),
        "lowerScoreGames": sum(d < 0 for d in score),
        "equalScoreGames": sum(d == 0 for d in score),
        "exceedanceGainedGames": gained,
        "exceedanceLostGames": lost,
        "discordantGames": discordant,
        "exactDiscordanceP": exact_discordance_p(gained, lost),
        "exactDiscordanceMethod": "Two-sided conditional binomial test on discordant pairs; p=0.5 null",
        "exactDiscordanceLimit": "Assumes independent paired games; unadjusted for selection/multiple tests and model uncertainty.",
        "smallDiscordantWarning": (
            "Fewer than 20 discordant games: percentile bootstrap may exclude zero with very few changed events. "
            "Do not interpret that interval alone as reliable evidence; inspect exactDiscordanceP and counts."
            if discordant < 20 else None),
        "changedCases": [r for r in rows if r["scoreDelta"] or r["surrogateDeltaPP"]],
        "bootstrap": {"method": "paired game-resampling percentile", "repetitions": repetitions,
                      "seed": bootstrap_seed, "confidenceLevel": .95,
                      "sameResampleForBothMetrics": True},
        "pairingChecks": ["same order/index", "unique indices", "same seed",
                          "same historical score", "same dataset/cohort metadata"],
        "pairingLimit": "Metadata checks do not independently prove identical all-exogenous streams.",
        "independentValidationEstablished": False,
        "warning": WARNING,
    }


def read_input(path):
    if path.stat().st_size > 64 * 1024 * 1024:
        raise ValueError("Input exceeds 64 MiB")
    raw = path.read_bytes()
    if len(raw) > 64 * 1024 * 1024:
        raise ValueError("Input exceeds 64 MiB")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("Input must be a JSON object")
    return value, hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", type=pathlib.Path)
    parser.add_argument("candidate", type=pathlib.Path)
    parser.add_argument("--output", type=pathlib.Path)
    parser.add_argument("--repetitions", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=8441, help="Bootstrap RNG seed, not game seed")
    parser.add_argument("--import-registry", action="store_true")
    parser.add_argument("--db", type=pathlib.Path, default=ROOT / ".runtime-odysseus/experiments.sqlite")
    args = parser.parse_args()
    if not args.base.name.endswith("-BASE.json") and args.output is None:
        parser.error("--output is required unless base ends in -BASE.json")
    prefix = args.base.name.removesuffix("-BASE.json")
    default_output = args.base.with_name(prefix + "-analysis.json")
    output = args.output or default_output
    if output.resolve() in (args.base.resolve(), args.candidate.resolve()):
        parser.error("Output cannot overwrite an input")
    summary = args.base.with_name(prefix + "-screen-summary.json")
    if args.import_registry and (not summary.is_file() or output.resolve() != default_output.resolve()):
        parser.error("Registry import requires matching screen-summary and default analysis output path")
    base, base_hash = read_input(args.base)
    candidate, candidate_hash = read_input(args.candidate)
    if args.import_registry:
        summary_value, _ = read_input(summary)
        label = candidate.get("label")
        if not isinstance(label, str) or label not in summary_value.get("arms", {}):
            parser.error("Candidate label must be present in matching screen summary")
        expected_candidate = args.base.with_name(prefix + "-" + label + ".json")
        if args.candidate.resolve() != expected_candidate.resolve():
            parser.error("Registry import requires the campaign's own candidate detail path")
    result = analyze(base, candidate, args.repetitions, args.seed)
    result["at"] = datetime.now(timezone.utc).isoformat()
    result["inputFiles"] = {
        "base": {"path": str(args.base.resolve()), "sha256": base_hash},
        "candidate": {"path": str(args.candidate.resolve()), "sha256": candidate_hash},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_name(output.name + ".tmp")
    temp.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    temp.replace(output)
    compact = {k: v for k, v in result.items()
               if k not in ("changedCases", "baseParameters", "candidateParameters", "inputFiles")}
    compact["output"] = str(output)
    if args.import_registry:
        spec = importlib.util.spec_from_file_location(
            "experiment_store", pathlib.Path(__file__).with_name("experiment_store.py"))
        registry = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(registry)
        db = registry.connect(args.db)
        try:
            compact["registry"] = registry.import_summary(db, summary)
        finally:
            db.close()
    print(json.dumps(compact, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
