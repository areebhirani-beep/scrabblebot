#!/usr/bin/env python3
"""Persistent experiment decisions and a restart-safe anti-repeat preflight."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read_records(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()] if path.exists() else []


def preflight(plan, records, root=ROOT):
    errors = []
    if plan.get('offlineOnly') is not True:
        errors.append('This lab is offline only.')
    if not plan.get('family') or not plan.get('hypothesis'):
        errors.append('Name the mechanism family and falsifiable hypothesis.')
    if plan.get('objectives') != ['winRate', 'meanScore']:
        errors.append('Both win rate and mean score must be primary objectives.')
    if not plan.get('baseline') or not plan.get('screenConfig'):
        errors.append('A named frozen baseline and paired screen configuration are required.')
    if plan.get('kind') not in ('screen', 'validation', 'replication'):
        errors.append('Choose screen, validation or replication; no automatic deployment.')
    previous = [r for r in records if r['family'] == plan.get('family') and r['decision'] == 'reject']
    if previous:
        evidence = root / str(plan.get('newEvidence', 'nonexistent'))
        reason = str(plan.get('retestReason', '')).strip()
        if len(reason) < 30 or not evidence.is_file() or not evidence.stat().st_size:
            errors.append('Rejected mechanism: a specific retest reason and a nonempty new evidence artifact are required. A fresh seed alone is not a new mechanism.')
        elif evidence.resolve() in {Path(r['evidence']).resolve() for r in previous}:
            errors.append('Retest evidence is the same rejected result, not new evidence.')
    if plan.get('kind') == 'validation':
        if plan.get('repeatsPerWorld', 0) < 3:
            errors.append('Validation needs >=3 repeats per world; cluster repetitions rather than pooling them.')
        if not plan.get('freshSeed') or not plan.get('heldOutOpponentField'):
            errors.append('Freeze a fresh seed and held-out opponent field before validation.')
    return errors


def render(records, root=ROOT):
    lines = ['# Persistent experiment lessons', '',
             'Read this before proposing an experiment. These are evidence-scoped decisions, not universal claims.', '',
             'Shared experiment provenance: `../bot-starter/.runtime-odysseus/experiments.sqlite`.', '']
    for r in records:
        lines += [f"## {r['id']} — {r['family']} ({r['decision']})", '',
                  f"Hypothesis: {r['hypothesis']}", '', f"Evidence: {r['evidence']}", '',
                  f"Observed: {r['observed']}", '', f"Decision: {r['reason']}", '',
                  f"Uncertainty: {r['uncertainty']}", '', f"Revisit only when: {r['revisitWhen']}", '']
    (root / 'LESSONS.md').write_text('\n'.join(lines))


def record(spec, root=ROOT):
    for key in ('id', 'family', 'hypothesis', 'decision', 'evidence', 'observed', 'reason', 'uncertainty', 'revisitWhen'):
        if not isinstance(spec.get(key), str) or not spec[key].strip():
            raise ValueError('Missing decision field: ' + key)
    if spec['decision'] not in ('reject', 'unproven', 'offlineValidated'):
        raise ValueError('Unsupported decision; no live-promotion state exists')
    evidence = (root / spec['evidence']).resolve()
    raw = evidence.read_bytes()
    payload = json.loads(raw)
    if payload.get('status') != 'complete':
        raise ValueError('Cannot record a verdict from incomplete evidence')
    if spec['decision'] == 'offlineValidated':
        raise ValueError('Validation requires a separately reviewed joint gate; this importer cannot promote.')
    row = {**spec, 'evidence': str(evidence), 'evidenceSha256': hashlib.sha256(raw).hexdigest(),
           'recordedAt': datetime.now(timezone.utc).isoformat(), 'sourceSha256': payload.get('sourceSha256')}
    ledger = root / 'decisions.jsonl'
    with ledger.open('a+') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        handle.seek(0)
        existing = [json.loads(line) for line in handle if line.strip()]
        previous = next((r for r in existing if r['id'] == row['id']), None)
        if previous:
            if any(previous[k] != row[k] for k in spec) or previous['evidenceSha256'] != row['evidenceSha256']:
                raise ValueError('Append-only decision ID conflict; create a new revision ID')
            render(existing, root)
            return {'inserted': False, 'id': row['id']}
        handle.write(json.dumps(row, sort_keys=True) + '\n')
        handle.flush()
        render([*existing, row], root)
    return {'inserted': True, 'id': row['id']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['record', 'preflight', 'resume'])
    parser.add_argument('input', nargs='?', type=Path)
    args = parser.parse_args()
    records = read_records(ROOT / 'decisions.jsonl')
    if args.command == 'resume':
        print(json.dumps({'decisions': len(records), 'rejectedFamilies': sorted({r['family'] for r in records if r['decision'] == 'reject'}),
                          'startup': ['AGENTS.md', 'LESSONS.md', 'SELF-IMPROVEMENT.md', '../LEARNINGS.md'],
                          'targets': {'winRate': '>42%', 'meanScore': '>124.4'}, 'offlineOnly': True}, indent=2))
        return 0
    if not args.input:
        parser.error('An input JSON file is required')
    value = json.loads(args.input.read_text())
    if args.command == 'record':
        print(json.dumps(record(value)))
        return 0
    errors = preflight(value, records)
    print(json.dumps({'allowed': not errors, 'errors': errors}, indent=2))
    return 2 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
