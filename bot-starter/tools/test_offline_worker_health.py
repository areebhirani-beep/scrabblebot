import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location(
    "offline_worker_health", pathlib.Path(__file__).with_name("offline_worker_health.py"))
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


def locks(*held_states):
    remaining = iter(held_states)
    def flock(handle, operation):
        if operation == health.fcntl.LOCK_UN:
            return
        if next(remaining):
            raise BlockingIOError()
    return flock


class OfflineWorkerHealthTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = pathlib.Path(self.temp.name) / "offlineworker.lock"
        self.path.write_text("123\n")
        self.process = {"pid": 123, "processState": "S", "cpuPercent": 0.1,
                        "rssMiB": 20.0, "elapsed": "01:20"}

    def tearDown(self):
        self.temp.cleanup()

    def test_unlocked_stale_pid_never_queries_process_or_changes_file(self):
        probe = Mock(side_effect=AssertionError("must not inspect stale PID"))
        before = self.path.read_bytes()
        result = health.offline_worker_health(self.path, flock=locks(False), probe_process=probe)
        self.assertEqual(result["status"], "inactive")
        self.assertFalse(result["active"])
        self.assertNotIn("pid", result)
        probe.assert_not_called()
        self.assertEqual(self.path.read_bytes(), before)

    def test_held_stable_pid_with_health_is_active(self):
        probe = Mock(return_value=self.process)
        result = health.offline_worker_health(self.path, flock=locks(True, True), probe_process=probe)
        self.assertTrue(result["active"])
        self.assertTrue(result["lockHeld"])
        self.assertEqual(result["process"]["pid"], 123)
        probe.assert_called_once_with(123)
        self.assertEqual(self.path.read_text(), "123\n")

    def test_invalid_pid_while_locked_reports_unknown(self):
        self.path.write_text("")
        probe = Mock()
        result = health.offline_worker_health(self.path, flock=locks(True), probe_process=probe)
        self.assertEqual(result["status"], "unknown")
        self.assertIsNone(result["active"])
        probe.assert_not_called()

    def test_pid_changes_or_lock_releases_during_probe_report_unknown(self):
        def changed(pid):
            self.path.write_text("456\n")
            return self.process
        result = health.offline_worker_health(self.path, flock=locks(True, True), probe_process=changed)
        self.assertIsNone(result["active"])
        self.assertIn("changed", result["reason"])
        self.path.write_text("123\n")
        result = health.offline_worker_health(self.path, flock=locks(True, False),
                                             probe_process=lambda pid: self.process)
        self.assertEqual(result["status"], "unknown")
        self.assertFalse(result["lockHeld"])
        self.assertIsNone(result["active"])

    def test_dead_pid_is_not_mistaken_for_active_lock_owner(self):
        result = health.offline_worker_health(self.path, flock=locks(True, True),
                                             probe_process=lambda pid: None)
        self.assertEqual(result["status"], "unknown")
        self.assertTrue(result["lockHeld"])
        self.assertIsNone(result["active"])
        zombie = {**self.process, "processState": "Z"}
        result = health.offline_worker_health(self.path, flock=locks(True, True),
                                             probe_process=lambda pid: zombie)
        self.assertIsNone(result["active"])

    def test_missing_or_unreadable_lock_does_not_create_or_truncate(self):
        self.path.unlink()
        result = health.offline_worker_health(self.path)
        self.assertFalse(result["active"])
        self.assertFalse(self.path.exists())
        with patch.object(pathlib.Path, "open", side_effect=PermissionError()):
            result = health.offline_worker_health(self.path)
        self.assertEqual(result["status"], "unavailable")
        self.assertIsNone(result["active"])

    def test_process_probe_only_requests_safe_health_fields(self):
        completed = health.subprocess.CompletedProcess([], 0, "123 S 1.5 2048 01:03\n", "")
        with patch.object(health.subprocess, "run", return_value=completed) as run:
            result = health.process_health(123)
        self.assertEqual(result["rssMiB"], 2.0)
        command = run.call_args.args[0]
        self.assertEqual(command, ["ps", "-p", "123", "-o", "pid=,stat=,pcpu=,rss=,etime="])
        self.assertEqual(run.call_args.kwargs["timeout"], 3)
        self.assertNotIn("args=", str(command))

    def test_health_timeout_does_not_break_status_report(self):
        def timeout(pid):
            raise health.subprocess.TimeoutExpired(["ps"], 3)
        result = health.offline_worker_health(self.path, flock=locks(True), probe_process=timeout)
        self.assertEqual(result["status"], "unknown")
        self.assertIsNone(result["active"])
        self.assertIn("TimeoutExpired", result["reason"])


if __name__ == "__main__":
    unittest.main()
