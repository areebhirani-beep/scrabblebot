#!/usr/bin/env python3
"""Offline-only metric gate. Reads existing synthetic results; never runs a bot."""
import argparse
import json
import math
from pathlib import Path
import random
import statistics


def interval(values, seed=110729, draws=3000):
    rnd = random.Random(seed)
    n = len(values)
    means = sorted(sum(values[rnd.randrange(n)] for _ in range(n)) / n for _ in range(draws))
    return [means[int(.025 * draws)], means[int(.975 * draws)]]


def wilson(wins, n):
    p, z = wins / n, 1.959963984540054
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    radius = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return [100 * (center - radius), 100 * (center + radius)]


def summarize(rows):
    n = len(rows)
    scores = [r['score'] for r in rows]
    strict = sum(r['score'] > max(r['fieldScores'][1:]) for r in rows)
    tied = sum(r['score'] == max(r['fieldScores'][1:]) for r in rows)
    wr = 100 * strict / n
    ci = wilson(strict, n)
    official_wr = 100 * (strict + tied) / n
    official_ci = wilson(strict + tied, n)
    sc = statistics.mean(scores)
    sci = interval(scores)
    unique_worlds = n
    if all('worldIndex' in r for r in rows):
        groups = {}
        for r in rows: groups.setdefault(r['worldIndex'], []).append(r)
        unique_worlds = len(groups)
        sci = interval([statistics.mean(r['score'] for r in rs) for rs in groups.values()])
        ci = interval([100 * statistics.mean(r['score'] > max(r['fieldScores'][1:]) for r in rs) for rs in groups.values()])
        official_ci = interval([100 * statistics.mean(r['win'] for r in rs) for rs in groups.values()])
    return {'N': n, 'strictWinPercent': wr, 'strictWins': strict, 'tiedFirst': tied,
            'uniqueWorlds': unique_worlds, 'uncertaintyUnit': 'world; repeats clustered',
            'winPercentIncludingTies': official_wr, 'win95IncludingTies': official_ci,
            'strictWin95': ci, 'winIntervalMethod': 'cluster bootstrap' if unique_worlds < n else 'Wilson',
            'score': sc, 'scoreBootstrap95': sci,
            'averagePlace': statistics.mean(r['place'] for r in rows),
            'averageFinalCash': statistics.mean(r['balance'] for r in rows),
            'pointTargetsMet': official_wr > 42 and sc > 124.4,
            'strictPointTargetsMet': wr > 42 and sc > 124.4,
            'conditionalLowerBoundsMeetTargets': official_ci[0] > 42 and sci[0] > 124.4}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    payload = json.loads(args.input.read_text())
    if payload.get('status') != 'complete':
        raise ValueError('Refusing incomplete experiment')
    report = {'source': str(args.input.resolve()), 'sourceSha256': payload['sourceSha256'],
              'target': {'winPercentIncludingTiesGreaterThan': 42, 'meanScoreGreaterThan': 124.4},
              'warning': 'Synthetic reactive matches, not a leaderboard estimate. Intervals omit model uncertainty; screening arms are selection data. Repeated executions are clustered by world, not independent games. A tied first is not counted as a strict win.',
              'fields': {}}
    lines = ['# Offline LUCENT target check', '', report['warning'], '',
             '| Field | Arm | Games | Wins incl. ties | Strict wins | Mean score | Target met |',
             '|---|---|---:|---:|---:|---:|---|']
    for field, data in payload['fields'].items():
        display_field = {'live': 'Strong synthetic field', 'gauntlet': 'Weaker scripted field',
                         'mc': 'Mixed synthetic field', 'mchu': 'Synthetic heads-up',
                         'mcbig': 'Synthetic nine-player field'}.get(field, field)
        report['fields'][field] = {}
        for label, arm in data['arms'].items():
            row = summarize(arm['fullOutcomes'])
            report['fields'][field][label] = row
            count = str(row['N']) if row['uniqueWorlds'] == row['N'] else f"{row['uniqueWorlds']} worlds / {row['N']} runs"
            lines.append(f"| {display_field} | {label} | {count} | {row['winPercentIncludingTies']:.2f}% | {row['strictWinPercent']:.2f}% | {row['score']:.2f} | {'yes' if row['pointTargetsMet'] else 'no'} |")
        report['fields'][field]['pairedComparisons'] = data['comparisons']
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    args.output.with_suffix('.md').write_text('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
