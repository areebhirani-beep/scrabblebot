import copy
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("calibration_report", pathlib.Path(__file__).with_name("calibration_report.py"))
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


def fixture(mid=1):
    auctions = [{"id": mid * 1000 + index, "match_id": mid, "opens_at": [1 + index * 10]}
                for index in range(88)]
    results = [{"auction_id": row["id"], "match_id": mid, "winner_bot_id": [1, []], "paid": 0}
               for row in auctions]
    for index, paid in [(0, 3), (22, 5)]:
        results[index].update(winner_bot_id=[0, 172], paid=paid)
    return {"botId": 172, "matches": [{"id": mid, "status": [2, []], "bag_total": 0,
        "current_round": 88, "starting_rack_size": 5, "ended_at": [0, [881]], "auction_type": [1, []]}],
        "participants": [{"match_id": mid, "bot_id": 172, "score": 10, "balance": 102},
                         {"match_id": mid, "bot_id": 18, "score": 10, "balance": 110}],
        "bots": [{"id": 172, "is_simulated": False}, {"id": 18, "is_simulated": True}],
        "auctions": auctions, "results": results,
        "plays": [{"match_id": mid, "bot_id": bot, "word": "TEST", "total_reward": 10, "played_at": [100]}
                  for bot in [172, 18]]}


class CalibrationReportTests(unittest.TestCase):
    def test_ties_phases_and_fields_use_actual_public_results(self):
        rows, skipped = report.real_records(fixture(), {"botId": 172, "completedLocalMatches": [{"id": 1, "commit": "0890ce4e-test"}]})
        self.assertEqual(skipped, [])
        self.assertTrue(rows[0]["win"])
        self.assertEqual(rows[0]["place"], 1)
        self.assertEqual(rows[0]["phases"], [{"tiles": 1, "spend": 3}, {"tiles": 1, "spend": 5}, {"tiles": 0, "spend": 0}, {"tiles": 0, "spend": 0}])
        self.assertEqual(rows[0]["simulatedOpponents"], 1)
        self.assertEqual(rows[0]["namedStrongOpponents"], [18])

    def test_bad_balance_excludes_whole_match(self):
        data = fixture()
        data["participants"][0]["balance"] = 999
        rows, skipped = report.real_records(data, {})
        self.assertEqual(rows, [])
        self.assertEqual(len(skipped), 1)

    def test_forward_outcomes_never_enter_historical_source_comparison(self):
        data = fixture(1)
        forward = fixture(42958)
        for key in ["matches", "participants", "auctions", "results", "plays"]:
            data[key].extend(forward[key])
        status = {"completedLocalMatches": [{"id": 1, "commit": "0890ce4e-test"}, {"id": 42958, "commit": "4516da7c-test"}]}
        result = report.build_report(data, status, [1], {})
        self.assertEqual(result["protocol"]["forwardEvaluationOnlyIds"], [42958])
        self.assertTrue(result["forwardEvaluation"]["outcomesWithheld"])
        self.assertNotIn("4516da7c-test", result["sourceSummariesHistoricalOnly"])
        self.assertFalse(result["calibrated"])
        evaluated = report.build_report(data, status, [1], {}, evaluate_forward=True)
        self.assertEqual(evaluated["forwardEvaluation"]["winsIncludingTies"], 1)
        self.assertNotIn("4516da7c-test", evaluated["sourceSummariesHistoricalOnly"])

    def test_simulation_ties_and_metadata_consistency(self):
        artifact = {"matches": 1, "details": [{"score": 10, "place": 1, "win": True,
                                              "balance": 102, "fieldScores": [10, 10]}]}
        self.assertEqual(report.simulation_summary(artifact)["summary"]["winsIncludingTies"], 1)
        bad = copy.deepcopy(artifact)
        bad["details"][0]["win"] = False
        with self.assertRaises(ValueError):
            report.simulation_summary(bad)


if __name__ == "__main__":
    unittest.main()
