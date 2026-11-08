#!/usr/bin/env python3
"""Four bounded diagnostic replays, respecting the shared worker lock."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import shutil
from datetime import datetime, timezone

LAB = Path(__file__).resolve().parent
SOURCE = LAB / "floor-forensics-source" / "bot-starter"
RUNTIME = LAB.parent / "bot-starter" / ".runtime-odysseus"
REPORT = LAB.parent / "bot-starter/docs/experiments/completion-floor-win30-screen-reactive-summary.json"
OUTPUT = LAB / "experiments" / "completion-floor-forensics"


def main():
    report = json.loads(REPORT.read_text())
    patch = LAB / "forensics/completion-floor"
    if not SOURCE.exists():
        frozen = REPORT.parent / "snapshots" / report["sourceSha256"]
        shutil.copytree(frozen, SOURCE.parent)
        for name in ("PROVENANCE.json", "BASE.json", "FLOOR1.json"):
            shutil.copyfile(patch / name, SOURCE.parent / name)
        (SOURCE / "src/sim.ts").chmod(0o644)
        shutil.copyfile(patch / "sim.ts", SOURCE / "src/sim.ts")
    modules = SOURCE / "node_modules"
    if not modules.exists():
        modules.symlink_to(LAB.parent / "bot-starter/node_modules", target_is_directory=True)
    RUNTIME.mkdir(exist_ok=True)
    provenance = json.loads((SOURCE.parent / "PROVENANCE.json").read_text())
    assert provenance["parentSourceSha256"] == report["sourceSha256"]
    assert hashlib.sha256((SOURCE / "src/sim.ts").read_bytes()).hexdigest() == provenance["simSha256"]
    OUTPUT.mkdir(exist_ok=True)
    rows = []
    with (RUNTIME / "offlineworker.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another worker owns the lock; no replay started.")
        lock.seek(0)
        lock.truncate()
        lock.write(str(os.getpid()))
        lock.flush()
        for world in (6, 9):
            for arm in ("BASE", "FLOOR1"):
                prefix = OUTPUT / f"world{world}-{arm}"
                config = json.loads((SOURCE.parent / (arm + ".json")).read_text())
                env = dict(os.environ, ONE=json.dumps(config), SIM_MATCH_OFFSET=str(world),
                           SIM_DETAILS=str(prefix.with_suffix(".json")),
                           SIM_TRACE_PATH=str(prefix.with_suffix(".trace.json")))
                with prefix.with_suffix(".log").open("w") as log:
                    subprocess.run(["node", "--max-old-space-size=512", "--import", "tsx", "src/sim.ts", "1"],
                                   cwd=SOURCE, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=30, check=True)
                actual = json.loads(prefix.with_suffix(".json").read_text())["details"][0]
                expected = report["fields"]["live"]["arms"][arm]["fullOutcomes"][world]
                keys = ("score", "place", "points7Plus", "words7Plus", "balance", "tilesPurchased", "totalPaid")
                rows.append({"world": world, "arm": arm, "metrics": {k: actual[k] for k in keys},
                             "expected": {k: expected[k] for k in keys},
                             "reproduced": all(actual[k] == expected[k] for k in keys)})
        fcntl.flock(lock, fcntl.LOCK_UN)
    result = {"status": "complete", "at": datetime.now(timezone.utc).isoformat(),
              "source": provenance, "replays": rows,
              "limitation": "Instrumentation and CPU timing can change policy decisions. Only use an exactly reproduced replay to attribute the saved failure."}
    (OUTPUT / "SUMMARY.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
