import json
from pathlib import Path
import tempfile
import unittest
import learning


class LearningTests(unittest.TestCase):
    def plan(self):
        return {'kind': 'screen', 'family': 'cash', 'hypothesis': 'fund future words',
                'offlineOnly': True, 'objectives': ['winRate', 'meanScore'],
                'baseline': 'frozen-v1', 'screenConfig': 'campaign.json'}

    def test_both_metrics_and_offline_baseline_are_required(self):
        self.assertEqual(learning.preflight(self.plan(), []), [])
        for changes in ({'objectives': ['meanScore']}, {'baseline': ''}, {'offlineOnly': False}):
            self.assertTrue(learning.preflight({**self.plan(), **changes}, []))

    def test_rejected_family_survives_restarts_and_blocks_blind_repetition(self):
        records = [{'family': 'cash', 'decision': 'reject', 'evidence': '/old/evidence.json'}]
        self.assertTrue(learning.preflight(self.plan(), records))
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); (root / 'new.json').write_text('{"mechanism":"actual paid auctions"}')
            plan = {**self.plan(), 'newEvidence': 'new.json', 'retestReason': 'Full auction paths replace the previous free-draw approximation.'}
            self.assertEqual(learning.preflight(plan, records, root), [])

    def test_validation_requires_repeated_worlds_and_unseen_field(self):
        plan = {**self.plan(), 'kind': 'validation'}
        self.assertTrue(learning.preflight(plan, []))
        plan.update(repeatsPerWorld=3, freshSeed=991, heldOutOpponentField='heterogeneous-new')
        self.assertEqual(learning.preflight(plan, []), [])

    def spec(self):
        return {'id': 'failure-1', 'family': 'cash', 'hypothesis': 'cash helps', 'decision': 'reject',
                'evidence': 'evidence.json', 'observed': 'both metrics decreased', 'reason': 'no promotion',
                'uncertainty': 'small screen', 'revisitWhen': 'new mechanism'}

    def test_append_only_idempotency_and_resume(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); (root / 'evidence.json').write_text(json.dumps({'status': 'complete', 'sourceSha256': 'abc'}))
            self.assertTrue(learning.record(self.spec(), root)['inserted'])
            self.assertFalse(learning.record(self.spec(), root)['inserted'])
            with self.assertRaises(ValueError):
                learning.record({**self.spec(), 'reason': 'rewrite old conclusion'}, root)
            self.assertEqual(len(learning.read_records(root / 'decisions.jsonl')), 1)
            self.assertIn('cash (reject)', (root / 'LESSONS.md').read_text())

    def test_incomplete_reports_and_automatic_promotion_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); (root / 'evidence.json').write_text('{"status":"running"}')
            with self.assertRaises(ValueError): learning.record(self.spec(), root)
            with self.assertRaises(ValueError): learning.record({**self.spec(), 'decision': 'offlineValidated'}, root)
            self.assertFalse((root / 'decisions.jsonl').exists())


if __name__ == '__main__':
    unittest.main()
