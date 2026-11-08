#!/usr/bin/env python3
"""Bounded public top-team continuation audit. No authentication or bot actions."""
import collections, concurrent.futures, datetime as dt, json, math, pathlib, statistics
from fetch_public_word_history import q
from leader_watch import rating, spread, micros

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'experiments/leader-cycle-audit-20261108'
TABLES = {'participants':'match_participant','plays':'word_play','results':'auction_result','archive':'auction_top_bid_archive','auctions':'auction'}
def save(name, obj):
    (OUT / name).write_text(json.dumps(obj, indent=2)+'\n')
def parallel(queries):
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs = {k:pool.submit(q,v) for k,v in queries.items()}
        return {k:v.result() for k,v in jobs.items()}
def winner(row):
    x=row['winner_bot_id']; return x[1] if x[0]==0 else None
def fetch_rows(table, ids):
    rows=[]
    for i in range(0,len(ids),50):
        rows += q('SELECT * FROM '+table+' WHERE '+' OR '.join(f'match_id = {x}' for x in ids[i:i+50]))
    return rows
def profile(bot, m):
    match=m['match']; mid=match['id']; start=micros(match['started_at']); end=micros(match['ended_at'])
    own=next(p for p in m['participants'] if p['bot_id']==bot)
    words=sorted([w for w in m['plays'] if w['bot_id']==bot],key=lambda w:micros(w['played_at']))
    auctions=sorted(m['auctions'],key=lambda a:micros(a['opens_at']))
    positions={a['id']:i for i,a in enumerate(auctions)}
    buys=sorted([r for r in m['results'] if winner(r)==bot],key=lambda r:micros(r['closed_at']))
    # Reconstruct public cash exactly from 100 starting coins. Opponent private rack is unknown.
    events=[{'t':micros(w['played_at']),'kind':'word','amount':w['total_reward'],'word':w['word']} for w in words]
    events += [{'t':micros(r['closed_at']),'kind':'purchase','amount':-r['paid'],'letter':r['letter'],'round':positions[r['auction_id']]+1} for r in buys]
    events.sort(key=lambda x:(x['t'],x['kind']))
    cash=100; previous=start; cash10seconds=0; timeline=[]
    for event in events:
        if cash<10: cash10seconds+=(event['t']-previous)/1e6
        cash+=event['amount']; previous=event['t']
        timeline.append({**event,'seconds':(event['t']-start)/1e6,'cashAfter':cash})
    if cash<10: cash10seconds+=(end-previous)/1e6
    enriched=[]
    for i,w in enumerate(words):
        t=micros(w['played_at']); next_t=micros(words[i+1]['played_at']) if i+1<len(words) else end
        following=[r for r in buys if t<micros(r['closed_at'])<next_t]
        row=next(e for e in timeline if e['kind']=='word' and e['word']==w['word'] and e['t']==t)
        enriched.append({'word':w['word'],'length':len(w['word']),'points':w['total_reward'],'seconds':(t-start)/1e6,
                         'secondsBeforeEnd':(end-t)/1e6,'cashAfter':row['cashAfter'],
                         'nextWordGapSeconds':(next_t-t)/1e6 if i+1<len(words) else None,
                         'buysUntilNextWordOrEnd':len(following),'paidUntilNextWordOrEnd':sum(r['paid'] for r in following)})
    first_t=micros(words[0]['played_at']) if words else end
    first_points=words[0]['total_reward'] if words else 0
    long=[w for w in words if len(w['word'])>=7]
    return {'botId':bot,'matchId':mid,'at':dt.datetime.fromtimestamp(start/1e6,dt.timezone.utc).isoformat(),
            'seats':len(m['participants']),'score':own['score'],'place':1+sum(p['score']>own['score'] for p in m['participants']),
            'win':own['score']==max(p['score'] for p in m['participants']), 'endCash':own['balance'],
            'cashReconstructionValid':cash==own['balance'],'wordScoreValid':sum(w['total_reward'] for w in words)==own['score'],
            'cashUnder10Seconds':cash10seconds,'firstWordPoints':first_points,'afterFirstPoints':own['score']-first_points,
            'afterFirstBuys':sum(micros(r['closed_at'])>first_t for r in buys),
            'pointsByQuarter':[sum(w['total_reward'] for w in words if min(3,int(4*(micros(w['played_at'])-start)/max(1,end-start)))==i) for i in range(4)],
            'tilesByQuarter':[sum(min(3,positions[r['auction_id']]*4//max(1,len(auctions)))==i for r in buys) for i in range(4)],
            'paidByQuarter':[sum(r['paid'] for r in buys if min(3,positions[r['auction_id']]*4//max(1,len(auctions)))==i) for i in range(4)],
            'tilesBought':len(buys),'paid':sum(r['paid'] for r in buys),'points7Plus':sum(w['total_reward'] for w in long),
            'words7Plus':len(long),'words':enriched,'timeline':timeline,
            'opponents':[{'botId':p['bot_id'],'score':p['score']} for p in m['participants'] if p['bot_id']!=bot]}
def summarize(rows):
    if not rows:return {'matches':0}
    def avg(key):return statistics.mean(r[key] for r in rows)
    ws=[w for r in rows for w in r['words']]; long=[w for w in ws if w['length']>=7]
    return {'matches':len(rows),'wins':sum(r['win'] for r in rows),'winRate':avg('win'),'meanScore':avg('score'),'meanPlace':avg('place'),
            'dateRange':[min(r['at'] for r in rows),max(r['at'] for r in rows)],'seatCounts':dict(collections.Counter(r['seats'] for r in rows)),
            **{key:avg(key) for key in ['firstWordPoints','afterFirstPoints','afterFirstBuys','tilesBought','paid','endCash','cashUnder10Seconds','points7Plus','words7Plus']},
            'meanFirstWordSeconds':statistics.mean(r['words'][0]['seconds'] for r in rows if r['words']),
            'firstWord7PlusRate':statistics.mean(r['words'][0]['length']>=7 for r in rows if r['words']),
            'secondWordPoints':statistics.mean(r['words'][1]['points'] if len(r['words'])>1 else 0 for r in rows),
            'thirdPlusPoints':statistics.mean(sum(w['points'] for w in r['words'][2:]) for r in rows),
            'meanLongWordPoints':statistics.mean(w['points'] for w in long) if long else None,
            'longWords45PlusFraction':statistics.mean(w['points']>=45 for w in long) if long else None,
            'meanFirstToSecondSeconds':statistics.mean(r['words'][1]['seconds']-r['words'][0]['seconds'] for r in rows if len(r['words'])>1) if any(len(r['words'])>1 for r in rows) else None,
            'wordPositionPoints':[[statistics.mean(r['words'][i]['points'] if len(r['words'])>i else 0 for r in rows),sum(len(r['words'])>i for r in rows)] for i in range(5)],
            'pointsByQuarter':[statistics.mean(r['pointsByQuarter'][i] for r in rows) for i in range(4)],
            'tilesByQuarter':[statistics.mean(r['tilesByQuarter'][i] for r in rows) for i in range(4)],
            'paidByQuarter':[statistics.mean(r['paidByQuarter'][i] for r in rows) for i in range(4)],
            'validationErrors':sum(not r['cashReconstructionValid'] or not r['wordScoreValid'] for r in rows)}
def main():
    OUT.mkdir(exist_ok=True)
    snap=parallel({'bots':'SELECT id, name, is_simulated FROM bot','stats':'SELECT bot_id, matches_played, wins, total_score, openskill_mu, openskill_sigma FROM bot_stats'})
    bots={b['id']:b for b in snap['bots']}
    ranked=sorted([dict(s,name=bots[s['bot_id']]['name'],rating=rating(s['openskill_mu']),spread=spread(s['openskill_sigma'])) for s in snap['stats'] if s['bot_id'] in bots and spread(s['openskill_sigma'])<=175],key=lambda r:(-r['rating'],-r['openskill_mu']))
    for r in ranked:r['rank']=1+sum(x['rating']>r['rating'] for x in ranked)
    top=ranked[:5]; captured=dt.datetime.now(dt.timezone.utc).isoformat(); save('leaderboard.json',dict(snap,capturedAt=captured,ranked=ranked))
    print(json.dumps({'snapshot':captured,'top5':[(r['bot_id'],r['name'],r['rating']) for r in top]}),flush=True)
    ids=[r['bot_id'] for r in top]+[172]
    histories=parallel({b:f'SELECT match_state.* FROM match_state JOIN match_participant ON match_state.id = match_participant.match_id WHERE match_participant.bot_id = {b} AND match_state.id >= 40000' for b in ids})
    histories={b:sorted([m for m in ms if m['status'][0]==2],key=lambda m:m['id'])[-100:] for b,ms in histories.items()}
    cache={}
    for file in sorted((ROOT/'experiments/leader-watch-20261108').glob('matches-*.json')):
        chunk=json.loads(file.read_text())
        for m in chunk['matches']:cache[m['id']]={'match':m,**{k:[r for r in chunk.get(k,[]) if r['match_id']==m['id']] for k in TABLES}}
    missing=sorted({m['id'] for ms in histories.values() for m in ms if m['id'] not in cache})
    fetched=fetch_rows('match_participant',missing)
    participants=collections.defaultdict(list)
    for p in fetched:participants[p['match_id']].append(p)
    for ms in histories.values():
        for m in ms:
            if m['id'] not in cache:cache[m['id']]={'match':m,'participants':participants[m['id']]}
    cohorts={}
    for b in ids:
        hs=histories[b]
        won=[m['id'] for m in hs if next(p for p in cache[m['id']]['participants'] if p['bot_id']==b)['score']==max(p['score'] for p in cache[m['id']]['participants'])]
        cohorts[str(b)]={'last20':[m['id'] for m in hs[-20:]],'last10Wins':won[-10:]}
    selected=sorted({mid for c in cohorts.values() for values in c.values() for mid in values})
    incomplete=[mid for mid in selected if not cache[mid].get('auctions')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs={k:pool.submit(fetch_rows,table,incomplete) for k,table in TABLES.items() if k!='participants'}
        for key,job in jobs.items():
            indexed=collections.defaultdict(list)
            for row in job.result():indexed[row['match_id']].append(row)
            for mid in incomplete:cache[mid][key]=indexed[mid]
    save('raw-matches.json',{'capturedAt':captured,'publicOnly':True,'cohorts':cohorts,'matches':[cache[mid] for mid in selected]})
    profiles={}; summaries={}
    for b in ids:
        for label,mids in cohorts[str(b)].items():
            rows=[profile(b,cache[mid]) for mid in mids]
            profiles[f'{b}:{label}']=rows; summaries[f'{b}:{label}']=summarize(rows)
            if label=='last20':
                summaries[f'{b}:recentWins']=summarize([r for r in rows if r['win']]); summaries[f'{b}:recentLosses']=summarize([r for r in rows if not r['win']])
    # Same-table comparison supplies context without matching on winning outcomes.
    matched={}
    for b in ids[:-1]:
        common=[mid for mid in selected if any(p['bot_id']==172 for p in cache[mid]['participants']) and any(p['bot_id']==b for p in cache[mid]['participants'])]
        matched[str(b)]={'matchIds':common,'leader':summarize([profile(b,cache[mid]) for mid in common]),'ours':summarize([profile(172,cache[mid]) for mid in common])}
    report={'status':'complete','capturedAt':captured,'leaders':top,'ours':next(r for r in ranked if r['bot_id']==172),'cohorts':cohorts,'summaries':summaries,'matched':matched,'profiles':profiles,
            'limitations':['Current top5 frozen at snapshot; rating ranks may change.','Last10wins are deliberately selected wins and cannot estimate win rate; last20 cohorts include every outcome.','Historical public data does not reveal private initial racks, rejected bids or opponent source versions.','Starting coins100 verified by final balance reconstruction for each case; validation failures must be inspected.','No causal policy claim or guaranteed uplift; unmatched periods and opponent mix differ.']}
    save('analysis.json',report)
    print(json.dumps({'output':str(OUT),'games':len(selected),'summaries':summaries}),flush=True)
if __name__=='__main__':main()
