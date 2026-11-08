#!/usr/bin/env python3
"""Serial offline reactive-model comparison; never connects or deploys.

Config: {"prefix":"reactive-check","N":32,"seed":970901,
 "fields":["live","mc","mcbig","mchu","gauntlet"],"base":{"samples":8},
 "arms":[["BASE",{}],["CASH9",{"starveCoins":9}]],"timeoutSeconds":900}
The legacy field name "live" is a synthetic opponent field, never a live run.
"""
import argparse
import contextlib
import fcntl
import hashlib
import importlib.util
import json
import math
import os
import pathlib
import random
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime-odysseus"
FIELDS = {"live", "mc", "mcbig", "mchu", "gauntlet"}
WARNING = ("Synthetic reactive simulation only, not live win probability, leaderboard "
           "rating or a calibrated forecast. Fixed deal/tie streams pair model worlds; "
           "rivals react to each policy. CPU-dependent search cutoffs, instant actions, "
           "missing transport latency and synthetic rival policies limit realism. "
           "Bootstrap intervals are conditional on this model and omit selection/model "
           "uncertainty. No automatic deployment.")
spec = importlib.util.spec_from_file_location("paired_analysis", pathlib.Path(__file__).with_name("paired_analysis.py"))
paired = importlib.util.module_from_spec(spec)
spec.loader.exec_module(paired)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def now():
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path, value):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, prefix=path.name + ".",
                                     suffix=".tmp", delete=False) as handle:
        temp = pathlib.Path(handle.name)
        json.dump(value, handle, indent=2, allow_nan=False)
        handle.write("\n")
    temp.replace(path)


def validate_config(config):
    if not isinstance(config, dict):
        raise ValueError("Config must be an object")
    result = dict(config)
    for name, default, low, high in (("N", 32, 1, 10000), ("seed", 970901, 0, 4294967295),
                                    ("bootstrapRepetitions", 2000, 100, 10000),
                                    ("timeoutSeconds", 900, 1, 86400)):
        value = config.get(name, default)
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f"Invalid {name}")
        result[name] = value
    result["prefix"] = config.get("prefix", "reactive-check")
    if not isinstance(result["prefix"], str) or not re.fullmatch(r"[A-Za-z0-9_-]+", result["prefix"]):
        raise ValueError("prefix must be filename-safe")
    result["fields"] = config.get("fields", ["live"])
    if (not isinstance(result["fields"], list) or not result["fields"] or
        any(field not in FIELDS for field in result["fields"]) or
        len(set(result["fields"])) != len(result["fields"])):
        raise ValueError("fields must be unique supported synthetic field names")
    result["bot"] = config.get("bot", "adv")
    if result["bot"] not in ("adv", "v1"):
        raise ValueError("bot must be adv or v1")
    result["auctionType"] = config.get("auctionType", "Vickrey")
    if result["auctionType"] not in ("Vickrey", "FirstPrice"):
        raise ValueError("Unsupported auctionType")
    for key in ("base", "rival"):
        result[key] = config.get(key, {})
        if not isinstance(result[key], dict):
            raise ValueError(f"{key} must be an object")
    arms = config.get("arms")
    if not isinstance(arms, list) or not arms:
        raise ValueError("arms must be nonempty")
    seen = set()
    for arm in arms:
        if not isinstance(arm, list) or len(arm) != 2:
            raise ValueError("Each arm must be [label, parameters]")
        label, parameters = arm
        if not isinstance(label, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", label) or label in seen:
            raise ValueError("Arm labels must be unique and filename-safe")
        if not isinstance(parameters, dict):
            raise ValueError("Arm parameters must be objects")
        seen.add(label)
    if arms[0][0] != "BASE":
        raise ValueError("First arm must be BASE")
    canonical(result)
    return result


def snapshot_sources(source_root, runtime):
    """Freeze all source .ts files, bindings included; never copy tokens or env files."""
    source_root = pathlib.Path(source_root).resolve()
    runtime = pathlib.Path(runtime)
    parent = runtime / "reactive-snapshots"
    parent.mkdir(parents=True, exist_ok=True)
    staging = pathlib.Path(tempfile.mkdtemp(prefix="pending-", dir=parent))
    manifest = {}
    try:
        files = [(path, pathlib.Path("bot-starter") / path.relative_to(source_root))
                 for path in sorted((source_root / "src").rglob("*.ts"))]
        # Runtime pricing data is imported through fs, not TypeScript imports.
        # Freeze and hash it alongside the evaluator that consumes it.
        for path in sorted((source_root / "src").glob("*.json")):
            files.append((path, pathlib.Path("bot-starter") / path.relative_to(source_root)))
        if not any(path.name == "sim.ts" for path, _ in files):
            raise ValueError("Source root has no src/sim.ts")
        for name in ("package.json", "package-lock.json", "tsconfig.json"):
            path = source_root / name
            if path.is_file():
                files.append((path, pathlib.Path("bot-starter") / name))
        wordlist = source_root.parent / "spacetimedb" / "wordlist.txt"
        if not wordlist.is_file():
            raise ValueError("Source root lacks sibling spacetimedb/wordlist.txt")
        files.append((wordlist, pathlib.Path("spacetimedb/wordlist.txt")))
        for path, relative in files:
            before = path.stat()
            target = staging / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            hasher = hashlib.sha256()
            with path.open("rb") as src, target.open("wb") as dst:
                for block in iter(lambda: src.read(1024 * 1024), b""):
                    dst.write(block)
                    hasher.update(block)
            after = path.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise ValueError(f"Source changed during snapshot: {relative}")
            manifest[str(relative)] = hasher.hexdigest()
        identity = hashlib.sha256(canonical(manifest).encode()).hexdigest()
        destination = parent / identity
        modules = source_root / "node_modules"
        if not modules.is_dir():
            modules = ROOT / "node_modules"
        if not modules.is_dir():
            raise ValueError("node_modules missing; this harness never installs dependencies")
        (staging / "bot-starter" / "node_modules").symlink_to(modules.resolve(), target_is_directory=True)
        atomic_json(staging / "source-manifest.json", {
            "sha256": identity, "files": manifest, "sourceRoot": str(source_root),
            "capturedAt": now(),
            "dependencyLimit": "node_modules is shared; lockfile hashed, installed dependency bytes not frozen.",
        })
        if destination.exists():
            # A previous snapshot is trusted only after all its content hashes match.
            for relative, expected in manifest.items():
                actual = hashlib.sha256((destination / relative).read_bytes()).hexdigest()
                if actual != expected:
                    raise ValueError("Existing content-addressed snapshot was modified")
            shutil.rmtree(staging)
        else:
            staging.rename(destination)
        return destination / "bot-starter", identity, manifest
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging)
        raise


def clean_environment(one, details_path):
    # Allowlist basic execution environment; no BOT_*, API keys or auth tokens inherited.
    allowed = ("PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TZ")
    env = {key: os.environ[key] for key in allowed if key in os.environ}
    env.update(ONE=canonical(one), SIM_DETAILS=str(details_path), SIM_PROGRESS="1")
    return env


def power_state():
    try:
        text = subprocess.check_output(["pmset", "-g", "batt"], text=True, timeout=3)
    except (FileNotFoundError, subprocess.SubprocessError):
        return None
    found = re.search(r"(\d+)%;", text)
    return {"ac": "AC Power" in text, "percent": int(found[1]) if found else None}


def low_power(power):
    return power is not None and not power["ac"] and power["percent"] is not None and power["percent"] < 30


def stop_owned_child(child):
    if child.poll() is not None:
        return
    with contextlib.suppress(ProcessLookupError):
        os.killpg(child.pid, signal.SIGCONT)
        os.killpg(child.pid, signal.SIGTERM)
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=5)


def run_child(snapshot, one, n, details, logfile, timeout):
    if low_power(power_state()):
        raise RuntimeError("Offline worker refused: battery below 30% and not on AC")
    start = time.monotonic()
    paused = False
    next_power_check = start
    with logfile.open("w") as log:
        child = subprocess.Popen(["nice", "-n", "15", "node", "--max-old-space-size=512",
                                  "--import", "tsx", "src/sim.ts", str(n)],
                                 cwd=snapshot, env=clean_environment(one, details),
                                 stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            while child.poll() is None:
                current = time.monotonic()
                if current - start > timeout:
                    raise TimeoutError(f"Arm exceeded {timeout}s wall-clock timeout")
                if current >= next_power_check:
                    power = power_state()
                    if low_power(power) and not paused:
                        os.killpg(child.pid, signal.SIGSTOP)
                        paused = True
                    elif paused and power is not None and (power["ac"] or
                         power["percent"] is not None and power["percent"] >= 35):
                        os.killpg(child.pid, signal.SIGCONT)
                        paused = False
                    next_power_check = current + 15
                time.sleep(.2)
            if child.returncode != 0:
                raise RuntimeError(f"Simulation exited {child.returncode}; see {logfile.name}")
        finally:
            stop_owned_child(child)
    if not details.is_file():
        raise ValueError("Simulation did not write SIM_DETAILS")
    return time.monotonic() - start


def validate_outcomes(payload, config, one):
    if payload.get("seed") != config["seed"] or payload.get("matches") != config["N"]:
        raise ValueError("Simulation seed/count mismatch")
    if payload.get("config") != one:
        raise ValueError("Simulation configuration mismatch")
    rows = payload.get("details")
    if not isinstance(rows, list) or len(rows) != config["N"]:
        raise ValueError("Missing or incomplete simulation outcomes")
    expected_seats = {"mchu": 2, "mcbig": 9}.get(one["field"], 6)
    for index, row in enumerate(rows):
        if row.get("matchIndex") != index:
            raise ValueError("Simulation indices must be unique and ordered")
        score, place, win = row.get("score"), row.get("place"), row.get("win")
        paired.finite_number(score, "score")
        field_scores = row.get("fieldScores")
        if not isinstance(field_scores, list) or len(field_scores) != expected_seats:
            raise ValueError("Unexpected synthetic field size")
        for value in field_scores:
            paired.finite_number(value, "field score")
        if field_scores[0] != score or type(place) is not int or place != 1 + sum(v > score for v in field_scores):
            raise ValueError("Score/place inconsistent with synthetic field scores")
        if type(win) is not bool or win != (place == 1):
            raise ValueError("Win flag inconsistent with synthetic place")
    return rows


def comparison(base, candidate, repetitions=2000, seed=8441):
    if type(repetitions) is not int or repetitions < 100:
        raise ValueError("At least 100 bootstrap repetitions required")
    if not base or len(base) != len(candidate):
        raise ValueError("Unequal or empty outcome pairs")
    deltas = []
    for left, right in zip(base, candidate):
        if left["matchIndex"] != right["matchIndex"]:
            raise ValueError("Paired match indices differ")
        deltas.append((right["score"] - left["score"], right["place"] - left["place"],
                       100 * (int(right["win"]) - int(left["win"]))))
    n = len(deltas)
    rng = random.Random(seed)
    draws = [[], [], []]
    for _ in range(repetitions):
        totals = [0, 0, 0]
        for _ in range(n):
            values = deltas[rng.randrange(n)]
            for j in range(3):
                totals[j] += values[j]
        for j in range(3):
            draws[j].append(totals[j] / n)
    result = {"metric_type": "synthetic_reactive_simulation", "N": n,
              "placeDirection": "negative candidate-minus-BASE delta is better",
              "warning": WARNING, "bootstrapRepetitions": repetitions, "bootstrapSeed": seed}
    for j, name in enumerate(("score", "place", "winPP")):
        draws[j].sort()
        result[name + "Delta"] = sum(d[j] for d in deltas) / n
        result[name + "Conditional95"] = [paired.percentile(draws[j], .025),
                                          paired.percentile(draws[j], .975)]
    gained = sum(d[2] > 0 for d in deltas)
    lost = sum(d[2] < 0 for d in deltas)
    result.update(winGained=gained, winLost=lost,
                  exactDiscordanceP=paired.exact_discordance_p(gained, lost),
                  smallDiscordantWarning=gained + lost < 20,
                  changedGames=sum(any(v != 0 for v in d) for d in deltas),
                  higherScoreGames=sum(d[0] > 0 for d in deltas),
                  lowerScoreGames=sum(d[0] < 0 for d in deltas),
                  exactTestLimit="Independent paired-world assumption; no multiplicity or selection adjustment.")
    return result



def postprocess_completed(summary, root=ROOT, timeout=30, runner=None):
    """Persist bookkeeping separately; never rewrite the hashed campaign summary."""
    summary = pathlib.Path(summary).resolve()
    root = pathlib.Path(root)
    payload = json.loads(summary.read_text())
    if payload.get("status") != "complete":
        raise ValueError("Only a completed campaign can trigger learning refresh")
    sidecar = summary.with_name(summary.stem + "-postprocess.json")
    report = {"summary": str(summary),
              "summarySha256": hashlib.sha256(summary.read_bytes()).hexdigest(),
              "startedAt": now(), "status": "running", "steps": {}}
    atomic_json(sidecar, report)
    env = {key: value for key, value in clean_environment({}, summary).items()
           if key not in ("ONE", "SIM_DETAILS", "SIM_PROGRESS")}
    commands = [
        ("registry", [sys.executable, "-I", str(root / "tools/experiment_store.py"),
                      "import", str(summary)]),
        ("learning", [sys.executable, "-I", str(root / "tools/update_learning.py"), "--refresh"]),
    ]
    execute = runner or subprocess.run
    for name, command in commands:
        started = time.monotonic()
        try:
            completed = execute(command, cwd=root, env=env, capture_output=True, text=True,
                                timeout=timeout, check=False)
            report["steps"][name] = {
                "status": "complete" if completed.returncode == 0 else "failed",
                "returncode": completed.returncode,
                "stdoutTail": (completed.stdout or "")[-2000:],
                "stderrTail": (completed.stderr or "")[-2000:],
                "elapsedSeconds": time.monotonic() - started}
        except (OSError, subprocess.SubprocessError) as error:
            report["steps"][name] = {"status": "failed", "error": type(error).__name__,
                                     "elapsedSeconds": time.monotonic() - started}
        atomic_json(sidecar, report)
    report["status"] = ("complete" if all(step["status"] == "complete"
                                         for step in report["steps"].values()) else "failed")
    report["finishedAt"] = now()
    atomic_json(sidecar, report)
    if report["status"] != "complete":
        print("WARNING: simulation results are saved, but registry/learning postprocessing "
              f"failed; inspect {sidecar}", file=sys.stderr, flush=True)
    else:
        print(json.dumps({"postprocessing": "complete", "sidecar": str(sidecar)}), flush=True)
    return report

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=pathlib.Path)
    parser.add_argument("--source-root", type=pathlib.Path, default=ROOT,
                        help="bot-starter root, optionally a root-frozen committed release")
    args = parser.parse_args()
    raw = args.config.read_bytes()
    config = validate_config(json.loads(raw))
    RUNTIME.mkdir(exist_ok=True)
    output = RUNTIME / (config["prefix"] + "-reactive-summary.json")
    if output.exists():
        parser.error("Report prefix already exists; choose a new prefix to preserve experiment history")
    def interrupted(signum, frame):
        raise InterruptedError(f"Offline harness interrupted by signal {signum}")
    signal.signal(signal.SIGTERM, interrupted)
    # Shared advisory lock: other offline launchers must also honor this lock.
    with (RUNTIME / "offlineworker.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("An offline worker already holds offlineworker.lock")
        lock.seek(0)
        lock.truncate()
        lock.write(str(os.getpid()) + "\n")
        lock.flush()
        snapshot, source_hash, manifest = snapshot_sources(args.source_root, RUNTIME)
        report = {"metric_type": "synthetic_reactive_simulation", "warning": WARNING,
                  "startedAt": now(), "status": "running", "config": config,
                  "configSha256": hashlib.sha256(raw).hexdigest(),
                  "sourceSha256": source_hash, "sourceManifest": manifest,
                  "snapshotRoot": str(snapshot), "fields": {},
                  "dependencyLimit": "Shared installed node_modules; source and lockfile frozen.",
                  "lockLimit": "Advisory offlineworker.lock; cannot exclude legacy launchers that ignore it."}
        started = time.monotonic()
        atomic_json(output, report)
        try:
            for field in config["fields"]:
                field_report = report["fields"][field] = {"arms": {}, "comparisons": {}}
                for label, overrides in config["arms"]:
                    one = {"bot": config["bot"], "p": {**config["base"], **overrides},
                           "field": field, "label": label, "seed": config["seed"],
                           "rival": config["rival"], "auctionType": config["auctionType"]}
                    detail = RUNTIME / (config["prefix"] + "-" + field + "-" + label + "-reactive.json")
                    logfile = detail.with_suffix(".log")
                    # Unique pending filename prevents stale details being mistaken for success.
                    pending = detail.with_name(detail.name + ".pending-" + str(os.getpid()))
                    pending.unlink(missing_ok=True)
                    try:
                        elapsed = run_child(snapshot, one, config["N"], pending, logfile, config["timeoutSeconds"])
                        payload = json.loads(pending.read_text())
                        outcomes = validate_outcomes(payload, config, one)
                        pending.replace(detail)
                    finally:
                        pending.unlink(missing_ok=True)
                    field_report["arms"][label] = {
                        "elapsedSeconds": elapsed, "detailPath": str(detail),
                        "score": sum(r["score"] for r in outcomes) / len(outcomes),
                        "place": sum(r["place"] for r in outcomes) / len(outcomes),
                        "syntheticWinPercent": 100 * sum(r["win"] for r in outcomes) / len(outcomes),
                        "fullOutcomes": outcomes, "effectivePolicy": payload.get("effectivePolicy"),
                        "effectiveRival": payload.get("effectiveRival"),
                        "timingLimitation": payload.get("timingLimitation")}
                    if label != "BASE":
                        field_report["comparisons"][label] = comparison(
                            field_report["arms"]["BASE"]["fullOutcomes"], outcomes,
                            config["bootstrapRepetitions"])
                    report["elapsedSeconds"] = time.monotonic() - started
                    atomic_json(output, report)
                    print(json.dumps({"field": field, "arm": label,
                                      "elapsedSeconds": elapsed, "output": str(output)}), flush=True)
            report["status"] = "complete"
        except BaseException as error:
            report["status"] = "failed"
            report["error"] = type(error).__name__ + ": " + str(error)
            raise
        finally:
            report["finishedAt"] = now()
            report["elapsedSeconds"] = time.monotonic() - started
            atomic_json(output, report)
        try:
            postprocessing = postprocess_completed(output)
        except (OSError, ValueError) as error:
            print("WARNING: simulation results are saved but persistent learning failed: "
                  + type(error).__name__, file=sys.stderr, flush=True)
            return 2
        if postprocessing["status"] != "complete":
            return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
