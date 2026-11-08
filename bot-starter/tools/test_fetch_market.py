"""Offline fixtures: python3 -I -m unittest discover -s tools -p test_fetch_market.py."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("fetch_market", Path(__file__).with_name("fetch_market.py"))
fetch_market = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch_market)


class CalibrationRowsTests(unittest.TestCase):
    def setUp(self):
        self.parts = [{"match_id": 9, "bot_id": bot, "score": bot % 100} for bot in [172, 2, 3, 4, 5, 6]]
        self.matches = [{"id": 9, "status": [2, []], "bag_total": 0, "current_round": 2, "auction_type": [1, []]}]
        self.results = [
            {"match_id": 9, "auction_id": 20, "letter": "A", "winner_bot_id": [0, 172], "paid": 1},
            {"match_id": 9, "auction_id": 21, "letter": "B", "winner_bot_id": [0, 2], "paid": 8},
        ]
        self.archive = [{"auction_id": 20, "top_bid": 10}, {"auction_id": 21, "top_bid": 12}]

    def build(self):
        return fetch_market.build_market_rows(self.parts, self.results, self.archive, self.matches)

    def test_option_decoder(self):
        self.assertEqual(fetch_market.decode_option([0, 172]), 172)
        self.assertIsNone(fetch_market.decode_option([1, []]))
        self.assertEqual(fetch_market.decode_option({"some": 172}), 172)
        self.assertIsNone(fetch_market.decode_option({"none": []}))
        with self.assertRaises(ValueError):
            fetch_market.decode_option([0])

    def test_valid_prices_and_reserve_bounds(self):
        rows = self.build()
        self.assertEqual([(r["i"], r["n"]) for r in rows], [(0, 2), (1, 2)])
        self.assertEqual((rows[0]["cmax"], rows[0]["cmaxLo"], rows[0]["cmaxHi"]), (1, 0, 1))
        self.assertEqual((rows[1]["cmax"], rows[1]["cmaxLo"], rows[1]["cmaxHi"]), (12, 12, 12))
        self.assertTrue(all(r["us"] and r["bestOther"] == 6 for r in rows))

    def test_only_ended_complete_vickrey_matches(self):
        for field, value in [("status", [1, []]), ("bag_total", 1), ("current_round", 3), ("auction_type", [0, []])]:
            with self.subTest(field=field):
                old = self.matches[0][field]
                self.matches[0][field] = value
                self.assertEqual(self.build(), [])
                self.matches[0][field] = old

    def test_missing_archive_rejects_entire_match(self):
        self.archive.pop()
        self.assertEqual(self.build(), [])
        self.archive = [{"auction_id": 21, "top_bid": 12}]
        self.assertEqual(self.build(), [])

    def test_unsold_zero_is_distinct_from_missing_positive_archive(self):
        self.results[1].update(winner_bot_id=[1, []], paid=0)
        self.archive.pop()
        row = self.build()[1]
        self.assertIsNone(row["w"])
        self.assertEqual((row["cmax"], row["cmaxLo"], row["cmaxHi"]), (0, 0, 0))

    def test_requires_our_bot_and_six_unique_participants(self):
        self.parts[0]["bot_id"] = 173
        self.assertEqual(self.build(), [])
        self.parts[0]["bot_id"] = 172
        self.parts.pop()
        self.assertEqual(self.build(), [])
        self.parts.append(dict(self.parts[-1]))
        self.assertEqual(self.build(), [])

    def test_rejects_duplicate_results_and_unknown_winners(self):
        self.results[1]["auction_id"] = 20
        self.assertEqual(self.build(), [])
        self.results[1]["auction_id"] = 21
        self.results[1]["winner_bot_id"] = [0, 999]
        self.assertEqual(self.build(), [])

    def test_excludes_multiple_simulated_fillers(self):
        self.assertEqual(fetch_market.build_market_rows(self.parts, self.results, self.archive, self.matches, {2, 3}), [])


if __name__ == "__main__":
    unittest.main()
