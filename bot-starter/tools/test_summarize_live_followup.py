import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("followup", pathlib.Path(__file__).with_name("summarize_live_followup.py"))
followup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(followup)


class FollowupTest(unittest.TestCase):
    def fixture(self):
        return {"publicOnly": True, "botId": 172,
            "matches": [{"id": 1, "status": [2, []], "current_round": 2, "ended_at": [0, [40]]}],
            "participants": [{"match_id": 1, "bot_id": 172, "score": 9, "balance": 101},
                             {"match_id": 1, "bot_id": 2, "score": 6, "balance": 101}],
            "results": [{"match_id": 1, "auction_id": 10, "letter": "B", "paid": 8, "winner_bot_id": [0, 172], "closed_at": [20]},
                        {"match_id": 1, "auction_id": 11, "letter": "C", "paid": 5, "winner_bot_id": [0, 2], "closed_at": [40]}],
            "auctions": [{"match_id": 1, "id": 10, "opens_at": [10]}, {"match_id": 1, "id": 11, "opens_at": [20]}],
            "plays": [{"match_id": 1, "bot_id": 172, "word": "BARS", "total_reward": 9, "played_at": [30]},
                      {"match_id": 1, "bot_id": 2, "word": "ALSO", "total_reward": 6, "played_at": [20]}]}

    def test_boundary_cash_excludes_late_reward_not_previous_purchase(self):
        result = followup.summarize(self.fixture(), {"completedLocalMatches": [{"id": 1, "commit": "tested"}]})
        row = result["localMatches"][0]
        self.assertEqual(row["finalBalance"], 101)
        self.assertEqual(row["finalBalanceMinusLateRewards"], 92)
        self.assertEqual(row["balanceAtFinalAuctionOpen"], 92)
        opponent = result["facedOpponentsBySnapshotMu"][0]["localSharedTableMetrics"]["means"]
        self.assertEqual(opponent["finalAuctionRewards"], 0)
        self.assertEqual(opponent["balanceAtFinalAuctionOpen"], 106)
        self.assertEqual(result["bySource"]["tested"]["winsIncludingTies"], 1)

    def test_incomplete_or_inconsistent_match_is_excluded(self):
        data = self.fixture()
        data["results"].pop()
        result = followup.summarize(data)
        self.assertEqual(result["overall"]["matches"], 0)
        self.assertEqual(len(result["skipped"]), 1)
        data = self.fixture()
        data["participants"][0]["balance"] += 1
        self.assertEqual(followup.summarize(data)["overall"]["matches"], 0)

    def test_optional_status_and_timestamp_decoding(self):
        result = followup.summarize(self.fixture())
        self.assertEqual(result["overall"]["matches"], 1)
        self.assertEqual(result["local"]["matches"], 0)
        self.assertEqual(followup.micros([0, [123]]), 123)
        self.assertIsNone(followup.micros([1, []]))
        self.assertRaises(ValueError, followup.micros, [3, []])


if __name__ == "__main__":
    unittest.main()
