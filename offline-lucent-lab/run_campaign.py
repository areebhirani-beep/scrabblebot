#!/usr/bin/env python3
"""One finite offline campaign: preflight -> simulation -> registry -> persistent lesson.

Never deploys or promotes a policy. The shared harness owns the heavy-worker lock.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import learning

ROOT = Path(__file__).resolve().parent
SHARED = ROOT.parent / 'bot-starter'


def run(plan_path):
    plan = json.loads(plan_path.read_text())
    errors = learning.preflight(plan, learning.read_records(ROOT / 'decisions.jsonl'))
    if errors:
        raise ValueError('; '.join(errors))
    config_path = (ROOT / plan['screenConfig']).resolve()
    config = json.loads(config_path.read_text())
    summary = SHARED / '.runtime-odysseus' / (config['prefix'] + '-reactive-summary.json')
    if summary.exists():
        raise ValueError('Campaign prefix already exists; preserve it and use a new revision. Replications need explicit plans.')
    state = {'plan': str(plan_path.resolve()), 'config': str(config_path), 'status': 'running',
             'startedAt': datetime.now(timezone.utc).isoformat(), 'offlineOnly': True}
    state_path = ROOT / 'STATE.json'
    state_path.write_text(json.dumps(state, indent=2) + '\n')
    try:
        runner = [sys.executable, '-I', str(SHARED / 'tools/reactive_compare.py')]
        if plan.get('repeatsPerWorld', 1) >= 3:
            runner = [sys.executable, str(ROOT / 'repeated_campaign.py')]
        command = [*runner, str(config_path), '--source-root', str(SHARED)]
        if plan.get('repeatsPerWorld', 1) >= 3:
            command.extend(['--repeats', str(plan['repeatsPerWorld'])])
        subprocess.run(command, cwd=SHARED, check=True)
        subprocess.run([sys.executable, '-I', str(SHARED / 'tools/experiment_store.py'),
                        'import', str(summary)], cwd=SHARED, check=True)
        output = ROOT / 'experiments' / (config['prefix'] + '-targets.json')
        subprocess.run([sys.executable, str(ROOT / 'report.py'), str(summary), '--output', str(output)], check=True)
        payload = json.loads(summary.read_text())
        observed, comparisons = [], []
        for field, data in payload['fields'].items():
            for label, arm in data['arms'].items():
                observed.append(f"{field}/{label}: trials={len(arm['fullOutcomes'])}, uniqueWorlds={arm.get('uniqueWorlds', len(arm['fullOutcomes']))}, score={arm['score']:.4f}, winsIncludingTies={arm['syntheticWinPercent']:.4f}%")
            comparisons.extend(data['comparisons'].values())
        negative = bool(comparisons) and all(c['scoreDelta'] <= 0 and c['winPPDelta'] <= 0 for c in comparisons)
        decision = 'reject' if negative else 'unproven'
        result = learning.record({'id': config['prefix'], 'family': plan['family'], 'hypothesis': plan['hypothesis'],
            'decision': decision, 'evidence': str(summary), 'observed': '; '.join(observed),
            'reason': 'No arm improved either joint objective; keep disabled.' if negative else
                      'Screen nominates possibilities only. Review paired intervals, opponent robustness and three-repeat held-out checks before selecting an offline incumbent.',
            'uncertainty': 'Synthetic opponent policies, CPU deadlines and instant actions. A screen is selection data; no real leaderboard or independent validation claim.',
            'revisitWhen': 'A concrete changed mechanism or new calibration evidence explains prior failure; record it before retesting.' if negative else
                           'Freeze a candidate and run fresh worlds, an unseen opponent field and repeated-world stability checks.'})
        state.update(status='complete', decision=decision, summary=str(summary), targetReport=str(output), ledger=result)
    except BaseException as error:
        state.update(status='failed', error=type(error).__name__ + ': ' + str(error))
        raise
    finally:
        state['finishedAt'] = datetime.now(timezone.utc).isoformat()
        state_path.write_text(json.dumps(state, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan', type=Path)
    args = parser.parse_args()
    run(args.plan)
