#!/usr/bin/env python3
"""Public rating/auction evidence with own local bid-log correlation; no bot actions."""
import argparse, datetime as dt, fcntl, json, math, os, pathlib, time
from fetch_public_word_history import q

ROOT = pathlib.Path(__file__).resolve().parent
BOT_ROOT = ROOT.parent / 'odysseus-live/bot-starter'
if not BOT_ROOT.exists(): BOT_ROOT = ROOT.parent / 'bot-starter'
K = 400 / (math.log(10) * (25 / 6) * math.sqrt(2))

def stamp(value):
    if isinstance(value, list):
        return stamp(value[-1]) if value else 0
    return value if isinstance(value, (int, float)) else 0

def rounded_rating(row):
    return math.floor(1500 + K * (row['openskill_mu'] - 25) + .5)

def winner(row):
    value = row.get('winner_bot_id', [1, []])
    return value[1] if value[0] == 0 else None

def profile(bot, match, data):
    own = [p for p in data['plays'] if p['match_id'] == match and p['bot_id'] == bot]
    acquired = [a for a in data['results'] if a['match_id'] == match and winner(a) == bot]
    auctions = sorted([a for a in data['auctions'] if a['match_id'] == match], key=lambda a: stamp(a['opens_at']))
    quarters = {a['id']: min(3, i * 4 // max(1, len(auctions))) for i, a in enumerate(auctions)}
    long = [p for p in own if len(p['word']) >= 7]
    participant = next((p for p in data['participants'] if p['match_id'] == match and p['bot_id'] == bot), {})
    return {'score': participant.get('score'), 'endCash': participant.get('balance'),
            'points7Plus': sum(p['total_reward'] for p in long), 'words7Plus': len(long),
            'longWords': [{'word': p['word'], 'points': p['total_reward']} for p in long],
            'tilesBought': len(acquired), 'rareTilesBought': sum(a['letter'] in 'JQXZ' for a in acquired),
            'paid': sum(a['paid'] for a in acquired),
            'tilesByQuarter': [sum(quarters.get(a['auction_id']) == i for a in acquired) for i in range(4)],
            'paidByQuarter': [sum(a['paid'] for a in acquired if quarters.get(a['auction_id']) == i) for i in range(4)]}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--until', required=True)
    parser.add_argument('--interval', type=float, default=90)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    end = dt.datetime.fromisoformat(args.until)
    out = ROOT / 'experiments/rating-delta-watch-20261108'
    out.mkdir(exist_ok=True)
    lock = (out / '.observer.lock').open('a+')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    (out / 'process.json').write_text(json.dumps({'pid': os.getpid(), 'until': args.until})+'\n')
    seen = set()
    audit_cache = out / '.audit-cache.json'
    attempts = {int(k): v for k, v in json.loads(audit_cache.read_text()).items()} if audit_cache.exists() else {}
    data = {key: [] for key in ['matches', 'participants', 'plays', 'results', 'archive', 'auctions']}
    while dt.datetime.now(dt.timezone.utc) < end:
        started = time.monotonic()
        try:
            for path in sorted((ROOT / 'experiments/leader-watch-20261108').glob('matches-*.json')):
                if path.name in seen: continue
                blob = json.loads(path.read_text())
                for key in data: data[key].extend(blob.get(key, []))
                seen.add(path.name)
            history = sorted(q('SELECT * FROM rating_history WHERE bot_id = 172'), key=lambda r: stamp(r['at']))
            versions = q('SELECT * FROM bot_version WHERE bot_id = 172')
            source_rows = json.loads((BOT_ROOT / '.runtime-odysseus/status.json').read_text())['completedLocalMatches']
            sources = {r['id']: r for r in source_rows}
            matches = {r['id']: r for r in data['matches']}
            audit_path = BOT_ROOT / '.runtime-odysseus/current-policy-bid-audit.json'
            audit = json.loads(audit_path.read_text()) if audit_path.exists() else {'matches': []}
            attempts.update({r['matchId']: r for r in audit['matches']})
            audit_cache.write_text(json.dumps(attempts)+'\n')
            rows = []
            for previous, current in zip(history, history[1:]):
                mid = current['match_id']
                if mid < 43169: continue
                delta = rounded_rating(current) - rounded_rating(previous)
                row = {'matchId': mid, 'ratingBefore': rounded_rating(previous), 'ratingAfter': rounded_rating(current),
                       'delta': delta, 'category': 'negative' if delta < 0 else 'small-positive' if 0 < delta <= 10 else 'zero' if delta == 0 else 'positive',
                       'sourceSha256': sources.get(mid, {}).get('commit'),
                       'version': None, 'atMicros': stamp(current['at']), 'archivePending': mid not in matches}
                if mid in matches:
                    created = stamp(matches[mid]['created_at'])
                    active = [v for v in versions if stamp(v['started_at']) <= created]
                    row['version'] = max(active, key=lambda v: v['version'])['version'] if active else 1
                    participants = [p for p in data['participants'] if p['match_id'] == mid]
                    own = profile(172, mid, data)
                    best = max((p['score'] for p in participants), default=0)
                    leaders = [p for p in participants if p['score'] == best]
                    row.update(ours=own, place=1+sum(p['score'] > own['score'] for p in participants),
                               winners=[{'botId': p['bot_id'], **profile(p['bot_id'], mid, data)} for p in leaders])
                    tops = {a['auction_id']: a['top_bid'] for a in data['archive'] if a['match_id'] == mid and a['top_bid'] > 0}
                    row['otherWinnerAuctions'] = [{'auctionId': a['auction_id'], 'letter': a['letter'],
                        'winnerBotId': winner(a), 'paid': a['paid'], 'recordedTopBid': tops.get(a['auction_id']),
                        'strictlyBeatRecordedTopBid': tops[a['auction_id']]+1 if a['auction_id'] in tops else None}
                        for a in data['results'] if a['match_id'] == mid and winner(a) not in (None, 172)]
                local = attempts.get(mid, {})
                row['localAuditAvailable'] = bool(local)
                row['localAuditSource'] = local.get('source')
                row['localLoggedFailures'] = local.get('failures', [])
                counts = {}
                for auction in row.get('otherWinnerAuctions', []):
                    attempt = local.get('auctions', {}).get(str(auction['auctionId']), {})
                    amount, top = attempt.get('lastLoggedAmount'), auction['recordedTopBid']
                    category = ('no-local-attempt-record' if amount is None else 'archive-unavailable' if top is None
                                else 'logged-below-top' if amount < top else 'logged-tie' if amount == top
                                else 'logged-above-archive-acceptance-unknown')
                    auction.update(lastLoggedAmount=amount, loggedAttempts=attempt.get('attempts', []),
                                   comparison=category, submissionAcknowledged=attempt.get('submissionAcknowledged'))
                    counts[category] = counts.get(category, 0) + 1
                row['bidComparisons'] = counts
                rows.append(row)
            result = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'publicDataWithOwnLocalBidLogs': True, 'until': args.until,
                      'matches': rows, 'count': len(rows),
                      'limitation': 'Rating changes reflect relative outcomes and opponent estimates. Small gains do not imply execution bugs. Public archive does not show our private losing bid or rack valuation. Thresholds hold recorded rivals fixed, do not prove profitable missed purchases, and cannot establish causal extra points. Source may be unknown; match creation determines version. Pending archives refresh later.'}
            target = out / 'latest.json'; temp = out / '.latest.tmp'; temp.write_text(json.dumps(result, indent=2)+'\n'); temp.replace(target)
            last = rows[-10:]
            lines = ['# Public rating delta audit', '', result['at'], '', '| Match | Rating change | Place | Score | Seven-plus points | Source |', '| --- | ---: | ---: | ---: | ---: | --- |']
            for r in last:
                own=r.get('ours', {});lines.append(f"| {r['matchId']} | {r['delta']:+} | {r.get('place','pending')} | {own.get('score','pending')} | {own.get('points7Plus','pending')} | {(r.get('sourceSha256') or 'unknown')[:8]} |")
            lines += ['', result['limitation']]
            (out / 'LATEST.md').write_text('\n'.join(lines)+'\n')
            print(json.dumps({'at':result['at'],'matches':len(rows),'latest':{k:rows[-1][k] for k in ['matchId','ratingAfter','delta']} if rows else None}), flush=True)
        except Exception as exc:
            with (out / 'errors.jsonl').open('a') as f: f.write(json.dumps({'at':dt.datetime.now(dt.timezone.utc).isoformat(),'error':str(exc)})+'\n')
            print(type(exc).__name__+': '+str(exc), flush=True)
        if args.once: break
        time.sleep(max(0, min(args.interval-(time.monotonic()-started), (end-dt.datetime.now(dt.timezone.utc)).total_seconds())))
    (out/'finished.json').write_text(json.dumps({'at':dt.datetime.now(dt.timezone.utc).isoformat()})+'\n')

if __name__ == '__main__': main()
