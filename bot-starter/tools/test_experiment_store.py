import importlib.util
import json
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "experiment_store", pathlib.Path(__file__).with_name("experiment_store.py"))
store = importlib.util.module_from_spec(spec)
spec.loader.exec_module(store)


class ExperimentStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.runtime = self.root / ".runtime-odysseus"
        self.runtime.mkdir()
        (self.root / "data").mkdir()
        self.write(self.root / "data" / "validation.json", {"matches": [1, 2]})
        self.db = store.connect(self.runtime / "experiments.sqlite")

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def write(self, path, data):
        path.write_text(json.dumps(data))
        return path

    def fixture(self, prefix="trial", seed=17):
        self.write(self.runtime / (prefix + "-config.json"), {
            "dataset": "data/validation.json", "seed": seed, "N": 2,
            "base": {"samples": 4},
            "arms": [["BASE", {}], ["GAIN", {"bidGain": 1.1}]]})
        summary = self.write(self.runtime / (prefix + "-screen-summary.json"), {
            "source": "frozen-source", "seed": seed, "samples": 4,
            "arms": {"BASE": {"N": 2, "score": 90, "surrogatePercent": 25},
                     "GAIN": {"N": 2, "score": 92, "surrogatePercent": 50,
                              "scoreDelta": 2}}})
        for label in ("BASE", "GAIN"):
            self.write(self.runtime / (prefix + "-" + label + ".json"), {
                "label": label, "seed": seed,
                "calibrationDataset": str(self.root / "data" / "validation.json"),
                "parameters": {"samples": 4, "bidGain": 1.1 if label == "GAIN" else 1.3},
                "result": {"games": [{"score": 80}, {"score": 100}]}})
        return summary

    def test_idempotent_import_preserves_surrogate_and_exact_metadata(self):
        path = self.fixture()
        first = store.import_summary(self.db, path, self.root)
        second = store.import_summary(self.db, path, self.root)
        self.assertTrue(first["inserted"])
        self.assertFalse(second["inserted"])
        self.assertEqual(first["id"], second["id"])
        report = store.compare(self.db)
        self.assertEqual(len(report["arms"]), 2)
        for row in report["arms"]:
            self.assertEqual(row["metric_type"], "surrogate")
            self.assertEqual(row["source_reference"], "frozen-source")
            self.assertEqual(row["n"], 2)
            self.assertEqual(row["samples"], 4)
            self.assertEqual(row["seed"], 17)
            self.assertEqual(len(row["dataset_sha256"]), 64)
            self.assertEqual(row["same_dataset_other_experiments"], 0)
            self.assertFalse(row["independent_validation_established"])

    def test_revision_kept_but_comparison_only_latest(self):
        path = self.fixture()
        original = store.import_summary(self.db, path, self.root)
        payload = json.loads(path.read_text())
        payload["arms"]["GAIN"]["score"] = 93
        self.write(path, payload)
        changed = store.import_summary(self.db, path, self.root)
        self.assertNotEqual(original["id"], changed["id"])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM experiments").fetchone()[0], 2)
        rows = store.compare(self.db)["arms"]
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(r["id"] == changed["id"] for r in rows))

    def test_dataset_reuse_is_tracked_even_with_new_seed(self):
        for prefix, seed in (("one", 17), ("two", 99), ("three", 17)):
            store.import_summary(self.db, self.fixture(prefix, seed), self.root)
        row = store.compare(self.db, "one")["arms"][0]
        self.assertEqual(row["same_dataset_other_experiments"], 2)
        self.assertEqual(row["same_dataset_seed_other_experiments"], 1)
        self.assertFalse(row["independent_validation_established"])

    def test_missing_optional_files_do_not_invent_parameters_or_dataset(self):
        path = self.write(self.runtime / "bare-screen-summary.json", {
            "source": "abc", "arms": {"BASE": {"score": 2, "N": 1}}})
        store.import_summary(self.db, path, self.root)
        row = store.compare(self.db)["arms"][0]
        self.assertIsNone(row["dataset_sha256"])
        self.assertIsNone(row["parameters"])
        self.assertIsNone(row["seed"])
        self.assertTrue(any("not inferred" in w for w in row["warnings"]))

    def test_malformed_detail_cannot_partially_import(self):
        path = self.fixture()
        detail = self.runtime / "trial-GAIN.json"
        value = json.loads(detail.read_text())
        value["seed"] = 999
        self.write(detail, value)
        with self.assertRaisesRegex(ValueError, "seed differs"):
            store.import_summary(self.db, path, self.root)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM experiments").fetchone()[0], 0)

    def test_dataset_content_change_creates_revision(self):
        path = self.fixture()
        first = store.import_summary(self.db, path, self.root)
        self.write(self.root / "data" / "validation.json", {"matches": [3, 4]})
        changed = store.import_summary(self.db, path, self.root)
        self.assertNotEqual(first["id"], changed["id"])
        self.assertTrue(changed["inserted"])

    def test_optional_analysis_is_hashed_and_preserved(self):
        path = self.fixture()
        analysis = {"scoreDeltaCI": [0.1, 3.0], "warning": "Conditional only"}
        self.write(self.runtime / "trial-analysis.json", analysis)
        store.import_summary(self.db, path, self.root)
        row = self.db.execute("SELECT analysis_json,analysis_sha256 FROM experiments").fetchone()
        self.assertEqual(json.loads(row["analysis_json"]), analysis)
        self.assertEqual(len(row["analysis_sha256"]), 64)

    def test_path_traversal_arm_is_rejected(self):
        path = self.write(self.runtime / "bad-screen-summary.json", {
            "arms": {"../token": {"N": 1}}})
        with self.assertRaisesRegex(ValueError, "Unsafe arm"):
            store.import_summary(self.db, path, self.root)

    def test_outside_dataset_is_not_opened(self):
        path, content_hash, warning = store.dataset_reference(
            str(self.root / ".token-odysseus"), self.root)
        self.assertIsNone(content_hash)
        self.assertIn("not read", warning)

    def test_partial_summary_is_marked(self):
        path = self.fixture()
        value = json.loads(path.read_text())
        del value["arms"]["GAIN"]
        self.write(path, value)
        store.import_summary(self.db, path, self.root)
        self.assertTrue(any("partial" in w for w in store.compare(self.db)["arms"][0]["warnings"]))



    def reactive_fixture(self, prefix="reactive", seed=23):
        manifest = {"bot-starter/src/sim.ts": "a" * 64,
                    "spacetimedb/wordlist.txt": "b" * 64}
        config = {"N": 2, "seed": seed, "fields": ["live"],
                  "arms": [["BASE", {}], ["GAIN", {"bidGain": 1.3}]]}
        arms = {}
        for label in ("BASE", "GAIN"):
            arms[label] = {
                "score": 12, "place": 1.5, "syntheticWinPercent": 50,
                "elapsedSeconds": 1, "effectivePolicy": {"samples": 8},
                "effectiveRival": {"samples": 8, "bidGain": 1.3},
                "fullOutcomes": [
                    {"matchIndex": 0, "score": 14, "place": 1, "win": True},
                    {"matchIndex": 1, "score": 10, "place": 2, "win": False}]}
        summary = {
            "metric_type": "synthetic_reactive_simulation", "status": "complete",
            "sourceSha256": store.digest(store.canonical(manifest).encode()),
            "sourceManifest": manifest, "config": config, "configSha256": "c" * 64,
            "fields": {"live": {"arms": arms, "comparisons": {
                "GAIN": {"scoreDelta": 0, "winPPDelta": 0, "exactDiscordanceP": 1}}}}}
        return self.write(self.runtime / (prefix + "-reactive-summary.json"), summary)

    def test_reactive_import_is_separate_idempotent_and_hashed(self):
        market_path = self.fixture()
        store.import_summary(self.db, market_path, self.root)
        path = self.reactive_fixture()
        first = store.import_summary(self.db, path, self.root)
        again = store.import_summary(self.db, path, self.root)
        self.assertEqual(first["metric_type"], "synthetic_reactive")
        self.assertFalse(again["inserted"])
        self.assertEqual(first["id"], again["id"])
        report = store.compare(self.db)
        self.assertEqual(len(report["arms"]), 2)
        self.assertEqual(len(report["reactive_arms"]), 2)
        for row in report["reactive_arms"]:
            self.assertEqual(row["metric_type"], "synthetic_reactive")
            self.assertEqual(row["dictionary_sha256"], "b" * 64)
            self.assertEqual(row["recorded_config_sha256"], "c" * 64)
            self.assertEqual(len(row["canonical_config_sha256"]), 64)
            self.assertEqual(row["metrics"]["syntheticWinPercent"], 50)
            self.assertNotIn("surrogatePercent", row["metrics"])
            self.assertNotIn("outcomes_json", row)
            self.assertFalse(row["independent_validation_established"])
        stored = self.db.execute("SELECT outcomes_json FROM reactive_arms LIMIT 1").fetchone()[0]
        self.assertIs(json.loads(stored)[0]["win"], True)

    def test_reactive_source_manifest_mismatch_is_rejected_atomically(self):
        path = self.reactive_fixture()
        value = json.loads(path.read_text())
        value["sourceSha256"] = "d" * 64
        self.write(path, value)
        with self.assertRaisesRegex(ValueError, "Source hash"):
            store.import_summary(self.db, path, self.root)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM reactive_experiments").fetchone()[0], 0)

    def test_reactive_revision_only_latest_and_separate_prefix_filter(self):
        path = self.reactive_fixture()
        first = store.import_summary(self.db, path, self.root)
        value = json.loads(path.read_text())
        value["status"] = "reviewed-offline"
        self.write(path, value)
        second = store.import_summary(self.db, path, self.root)
        self.assertNotEqual(first["id"], second["id"])
        report = store.compare(self.db, "reactive")
        self.assertEqual(report["arms"], [])
        self.assertEqual(len(report["reactive_arms"]), 2)
        self.assertTrue(all(r["id"] == second["id"] for r in report["reactive_arms"]))

    def test_reactive_reused_world_seed_is_flagged(self):
        for name in ("first-reactive", "second-reactive"):
            store.import_summary(self.db, self.reactive_fixture(name), self.root)
        row = store.compare_reactive(self.db, "first-reactive")[0]
        self.assertEqual(row["same_source_field_seed_other_experiments"], 1)

    def test_reactive_bad_boolean_or_count_is_rejected(self):
        path = self.reactive_fixture()
        value = json.loads(path.read_text())
        value["fields"]["live"]["arms"]["GAIN"]["fullOutcomes"][0]["win"] = 1
        self.write(path, value)
        with self.assertRaisesRegex(ValueError, "boolean"):
            store.import_summary(self.db, path, self.root)
        value["fields"]["live"]["arms"]["GAIN"]["fullOutcomes"].pop()
        self.write(path, value)
        with self.assertRaisesRegex(ValueError, "count differs"):
            store.import_summary(self.db, path, self.root)

    def test_additive_migration_preserves_existing_market_records(self):
        store.import_summary(self.db, self.fixture(), self.root)
        original_count = self.db.execute("SELECT COUNT(*) FROM arms").fetchone()[0]
        self.db.execute("DROP TABLE reactive_arms")
        self.db.execute("DROP TABLE reactive_experiments")
        self.db.commit()
        self.db.close()
        self.db = store.connect(self.runtime / "experiments.sqlite")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM arms").fetchone()[0], original_count)
        store.import_summary(self.db, self.reactive_fixture(), self.root)
        self.assertEqual(len(store.compare_reactive(self.db)), 2)


if __name__ == "__main__":
    unittest.main()
