#!/usr/bin/env python3
"""Repeated, clustered offline screen using the existing locked harness internals."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import statistics
import sys

ROOT = Path(__file__).resolve().parent
SHARED = ROOT.parent / 'bot-starter'
spec = importlib.util.spec_from_file_location('shared_reactive', SHARED / 'tools/reactive_compare.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)


def grouped(rows):
    out = {}
    for row in rows:
        out.setdefault(row['worldIndex'], []).append(row)
    return {i: {'score': statistics.mean(r['score'] for r in rs),
                'place': statistics.mean(r['place'] for r in rs),
                'win': statistics.mean(int(r['win']) for r in rs)} for i, rs in out.items()}


def compare(base, candidate):
    left, right = grouped(base), grouped(candidate)
    if set(left) != set(right): raise ValueError('World pairing mismatch')
    keys = list(left)
    out = {'N': len(keys), 'rawTrialsPerArm': len(base), 'unit': 'world; repetitions averaged before bootstrap',
           'warning': 'Conditional synthetic screen only; no independent-trial or live-win claim.'}
    rnd = random.Random(8441)
    draws = [[rnd.randrange(len(keys)) for _ in keys] for _ in range(2000)]
    for metric, factor, name in [('score', 1, 'score'), ('place', 1, 'place'), ('win', 100, 'winPP')]:
        values = [factor * (right[k][metric] - left[k][metric]) for k in keys]
        samples = sorted(statistics.mean(values[i] for i in draw) for draw in draws)
        out[name + 'Delta'] = statistics.mean(values)
        out[name + 'Conditional95'] = [samples[50], samples[1950]]
    out['changedGames'] = sum(left[k] != right[k] for k in keys)
    return out


def run(config_path, source_root, repeats):
    if repeats < 3: raise ValueError('At least three repetitions per world')
    config = h.validate_config(json.loads(config_path.read_text()))
    unique = config['N']
    runtime = SHARED / '.runtime-odysseus'
    output = runtime / (config['prefix'] + '-reactive-summary.json')
    if output.exists(): raise ValueError('Refuse replacing an existing campaign')
    with (runtime / 'offlineworker.lock').open('a+') as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: raise RuntimeError('Shared offline worker busy; nothing started')
        snapshot, identity, manifest = h.snapshot_sources(source_root, runtime)
        combined_config = {**config, 'N': unique * repeats, 'uniqueWorlds': unique, 'repeatsPerWorld': repeats}
        report = {'metric_type': 'synthetic_reactive_simulation', 'status': 'running',
                  'warning': h.WARNING + ' Repeats are clustered by world; raw trial count is not independent N.',
                  'config': combined_config, 'configSha256': hashlib.sha256(config_path.read_bytes()).hexdigest(),
                  'sourceSha256': identity, 'sourceManifest': manifest, 'snapshotRoot': str(snapshot),
                  'startedAt': h.now(), 'fields': {}}
        h.atomic_json(output, report)
        try:
            for field in config['fields']:
                group = report['fields'][field] = {'arms': {}, 'comparisons': {}}
                for label, overrides in config['arms']:
                    one = {'bot': config['bot'], 'p': {**config['base'], **overrides}, 'field': field,
                           'label': label, 'seed': config['seed'], 'rival': config['rival'], 'auctionType': config['auctionType']}
                    outcomes, elapsed = [], 0
                    for trial in range(repeats):
                        detail = runtime / f"{config['prefix']}-{field}-{label}-trial{trial + 1}.json"
                        elapsed += h.run_child(snapshot, one, unique, detail, detail.with_suffix('.log'), config['timeoutSeconds'])
                        payload = json.loads(detail.read_text())
                        rows = h.validate_outcomes(payload, config, one)
                        outcomes.extend({**r, 'worldIndex': r['matchIndex'], 'trial': trial + 1} for r in rows)
                    outcomes.sort(key=lambda r: (r['worldIndex'], r['trial']))
                    for i, row in enumerate(outcomes): row['matchIndex'] = i
                    clusters = grouped(outcomes)
                    arm = {'elapsedSeconds': elapsed, 'uniqueWorlds': unique, 'repeatsPerWorld': repeats,
                           'score': statistics.mean(r['score'] for r in clusters.values()),
                           'place': statistics.mean(r['place'] for r in clusters.values()),
                           'syntheticWinPercent': 100 * statistics.mean(r['win'] for r in clusters.values()),
                           'fullOutcomes': outcomes, 'effectivePolicy': payload['effectivePolicy'], 'effectiveRival': payload['effectiveRival'],
                           'flakyWinWorlds': sum(len({r['win'] for r in outcomes if r['worldIndex'] == i}) > 1 for i in clusters)}
                    group['arms'][label] = arm
                    if label != 'BASE': group['comparisons'][label] = compare(group['arms']['BASE']['fullOutcomes'], outcomes)
                    trials_path = ROOT / 'experiments' / f"{config['prefix']}-{field}-{label}-trials.jsonl"
                    trials_path.write_text(''.join(json.dumps({'case_id': f'{field}:{config["seed"]}:{r["worldIndex"]}',
                        'trial': r['trial'], 'passed': r['win'], 'critical': False, 'score': r['score']}) + '\n' for r in outcomes))
                    h.atomic_json(output, report)
                    print(json.dumps({'arm': label, 'field': field, 'uniqueWorlds': unique, 'repeats': repeats,
                                      'score': arm['score'], 'winPercent': arm['syntheticWinPercent'],
                                      'flakyWinWorlds': arm['flakyWinWorlds']}), flush=True)
            report['status'] = 'complete'
        except BaseException as error:
            report.update(status='failed', error=str(error)); raise
        finally:
            report['finishedAt'] = h.now(); h.atomic_json(output, report)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--repeats', type=int, required=True)
    args = parser.parse_args()
    run(args.config, args.source_root, args.repeats)
