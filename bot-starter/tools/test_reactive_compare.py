import copy
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "reactive_compare", pathlib.Path(__file__).with_name("reactive_compare.py"))
reactive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reactive)


class ReactiveCompareTest(unittest.TestCase):
    def cfg(self):
        return reactive.validate_config({
            "prefix": "check", "N": 2, "seed": 123, "fields": ["mchu"],
            "arms": [["BASE", {}], ["GAIN", {"bidGain": 1.3}]]})

    def test_config_normalizes_supported_fields(self):
        value = self.cfg()
        self.assertEqual(value["bot"], "adv")
        self.assertEqual(value["auctionType"], "Vickrey")
        self.assertEqual(value["bootstrapRepetitions"], 2000)
        value["fields"] = ["live", "mc", "mcbig", "mchu", "gauntlet"]
        self.assertEqual(len(reactive.validate_config(value)["fields"]), 5)

    def test_config_rejects_unsafe_duplicate_or_missing_baseline(self):
        for update in ({"prefix": "../oops"}, {"fields": ["unknown"]},
                       {"fields": ["live", "live"]}, {"N": 0},
                       {"arms": [["GAIN", {}]]},
                       {"arms": [["BASE", {}], ["BASE", {}]]}):
            cfg = self.cfg()
            cfg.update(update)
            with self.subTest(update=update), self.assertRaises(ValueError):
                reactive.validate_config(cfg)

    def test_environment_does_not_inherit_secrets_or_mode_flags(self):
        with patch.dict(os.environ, {"BOT_TOKEN": "secret", "BOT_NONCE": "secret",
                                     "OTHER_API_KEY": "secret", "GRID": "1",
                                     "NODE_OPTIONS": "unsafe"}, clear=False):
            result = reactive.clean_environment({"seed": 1}, pathlib.Path("/tmp/details.json"))
        for key in ("BOT_TOKEN", "BOT_NONCE", "OTHER_API_KEY", "GRID", "NODE_OPTIONS"):
            self.assertNotIn(key, result)
        self.assertEqual(json.loads(result["ONE"]), {"seed": 1})
        self.assertEqual(result["SIM_PROGRESS"], "1")

    def test_snapshot_freezes_source_and_dictionary_without_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            source = root / "bot-starter"
            (source / "src" / "module_bindings").mkdir(parents=True)
            (source / "node_modules").mkdir()
            (root / "spacetimedb").mkdir()
            (source / "src" / "sim.ts").write_text("export const a = 1;")
            (source / "src" / "prices.json").write_text('{"price":12}')
            (source / "src" / "module_bindings" / "table.ts").write_text("export {};")
            (source / "package.json").write_text('{"type":"module"}')
            (source / ".token-odysseus").write_text("not copied")
            (root / "spacetimedb" / "wordlist.txt").write_text("AA\n")
            runtime = source / ".runtime-odysseus"
            first, identity, manifest = reactive.snapshot_sources(source, runtime)
            self.assertEqual(len(identity), 64)
            self.assertIn("bot-starter/src/module_bindings/table.ts", manifest)
            self.assertIn("bot-starter/src/prices.json", manifest)
            self.assertEqual((first / "src" / "prices.json").read_text(), '{"price":12}')
            self.assertFalse((first / ".token-odysseus").exists())
            self.assertTrue((first / "node_modules").is_symlink())
            second, same, _ = reactive.snapshot_sources(source, runtime)
            self.assertEqual((first, identity), (second, same))
            (source / "src" / "sim.ts").write_text("export const a = 2;")
            third, different, _ = reactive.snapshot_sources(source, runtime)
            self.assertNotEqual(identity, different)
            self.assertEqual((first / "src" / "sim.ts").read_text(), "export const a = 1;")

    def test_validation_checks_actual_field_placement_and_win(self):
        config = self.cfg()
        one = {"field": "mchu", "seed": 123}
        payload = {"seed": 123, "matches": 2, "config": one, "details": [
            {"matchIndex": 0, "score": 10, "place": 2, "win": False, "fieldScores": [10, 11]},
            {"matchIndex": 1, "score": 10, "place": 1, "win": True, "fieldScores": [10, 10]}]}
        self.assertEqual(len(reactive.validate_outcomes(payload, config, one)), 2)
        wrong = copy.deepcopy(payload)
        wrong["details"][0]["place"] = 1
        with self.assertRaisesRegex(ValueError, "inconsistent"):
            reactive.validate_outcomes(wrong, config, one)
        wrong = copy.deepcopy(payload)
        wrong["details"][1]["matchIndex"] = 0
        with self.assertRaisesRegex(ValueError, "indices"):
            reactive.validate_outcomes(wrong, config, one)

    def test_paired_metrics_keep_reactive_wins_distinct_from_market_surrogate(self):
        base = [{"matchIndex": i, "score": 10, "place": 2, "win": False} for i in range(4)]
        candidate = [{"matchIndex": i, "score": 12, "place": 1, "win": True} for i in range(4)]
        report = reactive.comparison(base, candidate, 100, 1)
        self.assertEqual(report["metric_type"], "synthetic_reactive_simulation")
        self.assertEqual(report["scoreConditional95"], [2, 2])
        self.assertEqual(report["placeConditional95"], [-1, -1])
        self.assertEqual(report["winPPConditional95"], [100, 100])
        self.assertAlmostEqual(report["exactDiscordanceP"], .125)
        self.assertTrue(report["smallDiscordantWarning"])
        self.assertEqual(report["changedGames"], 4)

    def test_paired_comparison_rejects_indices_and_empty_outcomes(self):
        with self.assertRaises(ValueError):
            reactive.comparison([], [], 100)
        a = [{"matchIndex": 0, "score": 10, "place": 1, "win": True}]
        b = [{"matchIndex": 1, "score": 10, "place": 1, "win": True}]
        with self.assertRaisesRegex(ValueError, "indices"):
            reactive.comparison(a, b, 100)

    def test_power_threshold_and_atomic_report(self):
        self.assertTrue(reactive.low_power({"ac": False, "percent": 29}))
        self.assertFalse(reactive.low_power({"ac": True, "percent": 10}))
        self.assertFalse(reactive.low_power({"ac": False, "percent": 30}))
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "nested" / "report.json"
            reactive.atomic_json(path, {"status": "complete"})
            self.assertEqual(json.loads(path.read_text()), {"status": "complete"})
            self.assertEqual(len(list(path.parent.iterdir())), 1)



    def test_postprocess_runs_registry_then_learning_without_rewriting_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            summary = root / "trial-reactive-summary.json"
            summary.write_text('{"status":"complete"}')
            original = summary.read_bytes()
            calls = []
            def fake(command, **kwargs):
                calls.append((command, kwargs))
                return reactive.subprocess.CompletedProcess(command, 0, '{"ok":true}', "")
            with patch.dict(os.environ, {"BOT_TOKEN": "secret", "BOT_NONCE": "secret",
                                         "API_KEY": "secret"}):
                report = reactive.postprocess_completed(summary, root, runner=fake)
            self.assertEqual(report["status"], "complete")
            self.assertEqual(len(calls), 2)
            self.assertIn("experiment_store.py", calls[0][0][2])
            self.assertEqual(calls[1][0][-1], "--refresh")
            for command, kwargs in calls:
                self.assertEqual(kwargs["timeout"], 30)
                self.assertNotIn("BOT_TOKEN", kwargs["env"])
                self.assertNotIn("BOT_NONCE", kwargs["env"])
                self.assertNotIn("API_KEY", kwargs["env"])
                self.assertNotIn("ONE", kwargs["env"])
            self.assertEqual(summary.read_bytes(), original)
            sidecar = summary.with_name(summary.stem + "-postprocess.json")
            self.assertEqual(json.loads(sidecar.read_text())["status"], "complete")

    def test_postprocess_keeps_results_and_attempts_learning_after_registry_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            summary = root / "trial-reactive-summary.json"
            summary.write_text('{"status":"complete"}')
            calls = []
            def fake(command, **kwargs):
                calls.append(command)
                return reactive.subprocess.CompletedProcess(command, 1 if len(calls) == 1 else 0,
                                                             "", "failure" * 1000)
            with patch("sys.stderr"):
                report = reactive.postprocess_completed(summary, root, runner=fake)
            self.assertEqual(report["status"], "failed")
            self.assertEqual(report["steps"]["learning"]["status"], "complete")
            self.assertEqual(len(report["steps"]["registry"]["stderrTail"]), 2000)
            self.assertEqual(json.loads(summary.read_text())["status"], "complete")

    def test_postprocess_timeout_and_incomplete_campaign(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            summary = root / "trial-reactive-summary.json"
            summary.write_text('{"status":"running"}')
            def timeout(command, **kwargs):
                raise reactive.subprocess.TimeoutExpired(command, kwargs["timeout"])
            with self.assertRaisesRegex(ValueError, "completed"):
                reactive.postprocess_completed(summary, root, runner=timeout)
            self.assertFalse(summary.with_name(summary.stem + "-postprocess.json").exists())
            summary.write_text('{"status":"complete"}')
            with patch("sys.stderr"):
                report = reactive.postprocess_completed(summary, root, runner=timeout)
            self.assertEqual(report["status"], "failed")
            self.assertEqual(report["steps"]["registry"]["error"], "TimeoutExpired")
            self.assertEqual(report["steps"]["learning"]["error"], "TimeoutExpired")


if __name__ == "__main__":
    unittest.main()
