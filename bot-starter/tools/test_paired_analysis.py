import copy
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location(
    "paired_analysis", pathlib.Path(__file__).with_name("paired_analysis.py"))
paired = importlib.util.module_from_spec(spec)
spec.loader.exec_module(paired)


class PairedAnalysisTest(unittest.TestCase):
    def fixture(self, scores, label):
        data = {
            "metric": "historicalScoreExceedance", "label": label, "seed": 11,
            "cohort": "validation", "calibrationDataset": "data/validation.json",
            "parameters": {"samples": 24}, "result": {"games": []}}
        for index, score in enumerate(scores):
            data["result"]["games"].append({
                "seed": 11, "matchIndex": index, "historicalScore": 10,
                "cohort": "validation", "calibrationDataset": "data/validation.json",
                "score": score, "historicalScoreExceedance": score > 10})
        return data

    def test_constant_paired_improvement_has_exact_interval(self):
        result = paired.analyze(self.fixture([9, 9, 9], "BASE"),
                                self.fixture([11, 11, 11], "GAIN"), 100, 7)
        self.assertEqual(result["scoreDelta"], 2)
        self.assertEqual(result["scoreConditional95"], [2, 2])
        self.assertEqual(result["surrogateDeltaPP"], 100)
        self.assertEqual(result["surrogateConditional95"], [100, 100])
        self.assertEqual(result["higherScoreGames"], 3)
        self.assertEqual(len(result["changedCases"]), 3)
        self.assertEqual(result["metric_type"], "surrogate")
        self.assertFalse(result["independentValidationEstablished"])

    def test_identical_arms_and_ties(self):
        result = paired.analyze(self.fixture([10, 11, 7], "BASE"),
                                self.fixture([10, 11, 7], "SAME"), 100, 7)
        self.assertEqual(result["scoreConditional95"], [0, 0])
        self.assertEqual(result["surrogateConditional95"], [0, 0])
        self.assertEqual(result["changedCases"], [])
        self.assertEqual(result["equalScoreGames"], 3)
        self.assertAlmostEqual(result["baseSurrogatePercent"], 100 / 3)

    def test_bootstrap_reproducible_and_signed(self):
        a = self.fixture([9, 15, 11, 0], "BASE")
        b = self.fixture([11, 12, 8, 2], "CANDIDATE")
        first = paired.analyze(a, b, 200, 19)
        second = paired.analyze(a, b, 200, 19)
        self.assertEqual(first, second)
        self.assertEqual(first["scoreDelta"], -.5)
        self.assertEqual(first["surrogateDeltaPP"], 0)
        self.assertEqual(first["exceedanceGainedGames"], 1)
        self.assertEqual(first["exceedanceLostGames"], 1)
        self.assertLess(first["scoreConditional95"][0], 0)
        self.assertGreater(first["scoreConditional95"][1], 0)

    def test_rejects_mismatched_pair_metadata(self):
        a = self.fixture([9, 15], "BASE")
        for key, value in (("seed", 44), ("matchIndex", 22),
                           ("historicalScore", 99), ("cohort", "train"),
                           ("calibrationDataset", "other.json")):
            b = copy.deepcopy(a)
            b["result"]["games"][0][key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, key):
                paired.analyze(a, b, 100)

    def test_rejects_duplicates_even_in_both_arms(self):
        a = self.fixture([9, 15], "BASE")
        a["result"]["games"][1]["matchIndex"] = 0
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            paired.analyze(a, copy.deepcopy(a), 100)

    def test_rejects_bad_flags_and_nonfinite_scores(self):
        a = self.fixture([9], "BASE")
        for score, exceed in ((9, True), (9, 0), (float("nan"), False)):
            b = copy.deepcopy(a)
            b["result"]["games"][0].update(score=score, historicalScoreExceedance=exceed)
            with self.subTest(score=score, exceed=exceed), self.assertRaises(ValueError):
                paired.analyze(a, b, 100)

    def test_rejects_missing_envelope_and_unequal_lengths(self):
        a = self.fixture([9], "BASE")
        b = copy.deepcopy(a)
        del b["cohort"]
        with self.assertRaisesRegex(ValueError, "cohort"):
            paired.analyze(a, b, 100)
        with self.assertRaisesRegex(ValueError, "equal lengths"):
            paired.analyze(a, self.fixture([9, 11], "B"), 100)

    def test_envelope_must_agree_with_both_game_records(self):
        a = self.fixture([9], "BASE")
        b = copy.deepcopy(a)
        a["result"]["games"][0]["seed"] = 12
        b["result"]["games"][0]["seed"] = 12
        with self.assertRaisesRegex(ValueError, "top-level"):
            paired.analyze(a, b, 100)

    def test_percentile_interpolation_and_replication_minimum(self):
        self.assertEqual(paired.percentile([0, 10], .25), 2.5)
        a = self.fixture([9], "BASE")
        with self.assertRaisesRegex(ValueError, "100"):
            paired.analyze(a, a, 99)

    def test_exact_discordance_four_gains_zero_losses(self):
        self.assertAlmostEqual(paired.exact_discordance_p(4, 0), .125, places=12)
        self.assertAlmostEqual(paired.exact_discordance_p(0, 4), .125, places=12)
        result = paired.analyze(self.fixture([9] * 4, "BASE"),
                                self.fixture([11] * 4, "GAIN"), 100, 7)
        self.assertAlmostEqual(result["exactDiscordanceP"], .125, places=12)
        self.assertEqual(result["discordantGames"], 4)
        self.assertIn("very few", result["smallDiscordantWarning"])

    def test_exact_discordance_zero_and_balanced(self):
        self.assertEqual(paired.exact_discordance_p(0, 0), 1)
        self.assertEqual(paired.exact_discordance_p(1, 1), 1)
        self.assertEqual(paired.exact_discordance_p(2000, 2000), 1)
        self.assertAlmostEqual(paired.exact_discordance_p(3, 1), .625, places=12)

    def test_exact_discordance_large_counts_are_stable(self):
        self.assertEqual(paired.exact_discordance_p(100000, 0), 0)
        value = paired.exact_discordance_p(5010, 4990)
        self.assertGreater(value, .8)
        self.assertLessEqual(value, 1)
        self.assertEqual(value, paired.exact_discordance_p(4990, 5010))
        for counts in ((-1, 0), (1.5, 0), (True, 0)):
            with self.subTest(counts=counts), self.assertRaises(ValueError):
                paired.exact_discordance_p(*counts)


if __name__ == "__main__":
    unittest.main()
