import unittest
import repeated_campaign as repeated
import report


def rows(delta=0):
    return [{'worldIndex': w, 'trial': t, 'matchIndex': 3*w+t, 'score': score+delta,
             'fieldScores': [score+delta, 15], 'place': 1 if score+delta >= 15 else 2,
             'win': score+delta >= 15, 'balance': 40}
            for w, score in enumerate([10, 20]) for t in range(3)]


class RepeatedTests(unittest.TestCase):
    def test_repeats_are_not_counted_as_independent_worlds(self):
        result = repeated.compare(rows(), rows(2))
        self.assertEqual(result['N'], 2)
        self.assertEqual(result['rawTrialsPerArm'], 6)
        self.assertEqual(result['scoreDelta'], 2)
        self.assertEqual(result['scoreConditional95'], [2, 2])
        self.assertEqual(result['winPPDelta'], 0)

    def test_target_report_clusters_repeated_worlds(self):
        result = report.summarize(rows())
        self.assertEqual(result['uniqueWorlds'], 2)
        self.assertEqual(result['N'], 6)
        self.assertEqual(result['winIntervalMethod'], 'cluster bootstrap')

    def test_missing_worlds_fail_pairing(self):
        with self.assertRaises(ValueError): repeated.compare(rows(), rows()[:3])


if __name__ == '__main__': unittest.main()
