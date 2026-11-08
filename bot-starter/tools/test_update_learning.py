import copy
import importlib.util
import json
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("update_learning",
    pathlib.Path(__file__).with_name("update_learning.py"))
learning = importlib.util.module_from_spec(spec)
spec.loader.exec_module(learning)


class LearningTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.workspace = pathlib.Path(self.temp.name)
        self.root = self.workspace / "odysseus-live" / "bot-starter"
        self.runtime = self.root / ".runtime-odysseus"
        self.runtime.mkdir(parents=True)
        self.evidence = self.runtime / "evidence.json"
        self.evidence.write_text("{}")
        self.ledger = self.root / "docs" / "lessons.jsonl"
        self.output = self.workspace / "LEARNINGS.md"
        self.lesson = {"id": "four-discordant", "status": "inconclusive",
                       "evidence": [".runtime-odysseus/evidence.json"],
                       "cause": "Four changed outcomes are insufficient.",
                       "action": "Retain baseline pending independent validation."}

    def tearDown(self):
        self.temp.cleanup()

    def append(self, value):
        return learning.append_lesson(value, self.ledger, self.root, self.workspace)

    def test_append_idempotent_and_conflict_keeps_original(self):
        self.assertTrue(self.append(self.lesson))
        self.assertFalse(self.append(self.lesson))
        changed = {**self.lesson, "action": "Different content"}
        with self.assertRaisesRegex(ValueError, "different content"):
            self.append(changed)
        self.assertEqual(len(learning.read_ledger(self.ledger)), 1)
        self.assertEqual(learning.read_ledger(self.ledger)[0]["action"], self.lesson["action"])

    def test_evidence_and_credential_validation(self):
        for evidence in ("missing.json", str(self.workspace.parent / "outside.json")):
            with self.subTest(evidence=evidence), self.assertRaises(ValueError):
                self.append({**self.lesson, "evidence": [evidence]})
        secret = self.root / ".token-odysseus"
        secret.write_text("do not read")
        with self.assertRaisesRegex(ValueError, "Credential"):
            self.append({**self.lesson, "evidence": [str(secret)]})
        with self.assertRaisesRegex(ValueError, "credential"):
            self.append({**self.lesson, "cause": "BOT_TOKEN=not-for-memory"})

    def test_all_required_fields_and_manual_statuses(self):
        bad = copy.deepcopy(self.lesson)
        del bad["action"]
        with self.assertRaises(ValueError):
            self.append(bad)
        for status in ("confirmed", "inconclusive", "fixed", "blocked", "PROMISING"):
            self.assertEqual(learning.validate_lesson(
                {**self.lesson, "status": status}, self.root, self.workspace)["status"], status)

    def test_refresh_is_atomic_and_refuses_other_file(self):
        self.append(self.lesson)
        result = learning.refresh(self.ledger, self.runtime, self.output, self.workspace)
        self.assertEqual(result["lessons"], 1)
        self.assertTrue(self.output.read_text().startswith(learning.MARKER))
        self.assertIn("sole live runner", self.output.read_text())
        self.output.write_text("Another lab owns this file")
        with self.assertRaisesRegex(ValueError, "refusing"):
            learning.refresh(self.ledger, self.runtime, self.output, self.workspace)
        self.assertEqual(self.output.read_text(), "Another lab owns this file")

    def test_four_favorable_changes_remain_unvalidated(self):
        metrics = {"scoreConditional95": [.1, 2], "surrogateConditional95": [.1, 2],
                   "exceedanceGainedGames": 4, "exceedanceLostGames": 0,
                   "exactDiscordanceP": .125}
        self.assertEqual(learning.triage(metrics), "UNVALIDATED")

    def test_joint_metrics_required_for_promising_and_rejected(self):
        metrics = {"scoreConditional95": [1, 2], "winPPConditional95": [1, 5],
                   "placeConditional95": [-.5, -.1], "winGained": 25, "winLost": 1,
                   "exactDiscordanceP": .001}
        self.assertEqual(learning.triage(metrics, True), "PROMISING")
        self.assertEqual(learning.triage({**metrics, "placeConditional95": [-.1, .1]}, True),
                         "UNVALIDATED")
        self.assertEqual(learning.triage({"scoreConditional95": [-2, -1],
                                         "surrogateConditional95": [-3, -1]}), "REJECTED")

    def test_only_complete_reactive_campaigns_are_summarized(self):
        report = {"status": "running", "config": {"seed": 7}, "sourceSha256": "abc",
                  "fields": {"live": {"comparisons": {"CANDIDATE": {
                      "N": 4, "scoreDelta": 1, "winPPDelta": 0,
                      "scoreConditional95": [-1, 2], "winPPConditional95": [-1, 1]}}}}}
        path = self.runtime / "trial-reactive-summary.json"
        path.write_text(json.dumps(report))
        campaigns, skipped = learning.campaign_records(self.runtime)
        self.assertEqual(campaigns, [])
        self.assertEqual(len(skipped), 1)
        report["status"] = "complete"
        path.write_text(json.dumps(report))
        campaigns, skipped = learning.campaign_records(self.runtime)
        self.assertEqual(len(campaigns), 1)
        self.assertEqual(campaigns[0]["metric_type"], "synthetic_reactive")
        self.assertEqual(campaigns[0]["status"], "UNVALIDATED")

    def test_market_completion_requires_config_and_all_arms(self):
        summary = {"seed": 7, "source": "abc", "arms": {
            "BASE": {"N": 4, "score": 10}, "GAIN": {"N": 4, "score": 11}}}
        path = self.runtime / "market-screen-summary.json"
        path.write_text(json.dumps(summary))
        self.assertEqual(learning.campaign_records(self.runtime)[0], [])
        config = {"N": 4, "arms": [["BASE", {}], ["GAIN", {}]]}
        (self.runtime / "market-config.json").write_text(json.dumps(config))
        records, _ = learning.campaign_records(self.runtime)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["metric_type"], "surrogate")
        self.assertEqual(records[0]["status"], "UNVALIDATED")


if __name__ == "__main__":
    unittest.main()
