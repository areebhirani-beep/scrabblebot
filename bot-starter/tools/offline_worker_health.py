"""Read-only observation of the shared offline-worker coordination lock."""
import fcntl
import os
import pathlib
import subprocess
from datetime import datetime, timezone

SCOPE = ("Shared offlineworker.lock coordinator only; legacy workers ignoring this lock "
         "are not covered. Process metrics describe the recorded coordinator, not its child.")


def process_health(pid):
    """No argv, environment, credentials or signals are inspected."""
    result = subprocess.run(
        ["ps", "-p", str(pid), "-o", "pid=,stat=,pcpu=,rss=,etime="],
        capture_output=True, text=True, timeout=3, check=False)
    if result.returncode != 0:
        return None
    values = result.stdout.split()
    if len(values) != 5 or int(values[0]) != pid:
        raise ValueError("Unexpected process health response")
    return {"pid": pid, "processState": values[1], "cpuPercent": float(values[2]),
            "rssMiB": round(int(values[3]) / 1024, 1), "elapsed": values[4]}


def offline_worker_health(lock_path, *, flock=None, probe_process=None):
    flock = flock or fcntl.flock
    probe_process = probe_process or process_health
    result = {"status": "unknown", "active": None, "lockHeld": None,
              "observedAt": datetime.now(timezone.utc).isoformat(), "scope": SCOPE}

    def is_held(handle):
        try:
            flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        flock(handle, fcntl.LOCK_UN)
        return False

    path = pathlib.Path(lock_path)
    try:
        # Never create/truncate/write the coordination file.
        with path.open("r") as handle:
            if not is_held(handle):
                return {**result, "status": "inactive", "active": False, "lockHeld": False,
                        "reason": "Shared lock was available; stale PID contents were not read."}
            result["lockHeld"] = True
            text = handle.read(64).strip()
            if not text.isascii() or not text.isdigit() or not 1 <= int(text) <= 2147483647:
                return {**result, "reason": "Lock held but PID record unavailable or invalid; possible startup race."}
            pid = int(text)
            result["pid"] = pid
            health = probe_process(pid)
            handle.seek(0)
            unchanged = handle.read(64).strip() == text
            descriptor, current = os.fstat(handle.fileno()), path.stat()
            same_file = (descriptor.st_dev, descriptor.st_ino) == (current.st_dev, current.st_ino)
            still_held = is_held(handle)
            if not unchanged or not same_file or not still_held:
                return {**result, "lockHeld": still_held if same_file else None,
                        "reason": "Lock or PID changed during observation; retry next refresh."}
            if not health or health.get("pid") != pid:
                return {**result, "reason": "Lock held but recorded PID is not verifiably running; possible transition/stale record."}
            if str(health.get("processState", "")).startswith(("Z", "X")):
                return {**result, "process": health,
                        "reason": "Recorded process is defunct; lock ownership is uncertain."}
            return {**result, "status": "active", "active": True, "process": health,
                    "reason": "Lock remained held with stable recorded PID and observable process.",
                    "identityLimit": "Advisory lock and PID agreement do not independently prove holder identity or exclude PID reuse."}
    except FileNotFoundError:
        # If already locked, disappearance is a race, not proof the worker stopped.
        if result["lockHeld"]:
            return {**result, "reason": "Coordination file disappeared during observation."}
        return {**result, "status": "inactive", "active": False, "lockHeld": False,
                "reason": "No shared coordination file exists."}
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        return {**result, "status": "unavailable" if result["lockHeld"] is None else "unknown",
                "reason": "Offline worker health unavailable: " + type(error).__name__}
