#!/usr/bin/env python3
"""Public leaderboard/history watch. Never authenticates, bids, plays or deploys."""
import argparse, concurrent.futures, datetime, fcntl, json, math, os, pathlib, statistics, time
from fetch_public_word_history import q
UTC=datetime.timezone.utc
K=400/(math.log(10)*(25/6)*math.sqrt(2))
def rating(mu): return math.floor(1500+K*(mu-25)+.5)
def spread(sigma): return math.floor(K*sigma+.5)
def atomic(path,value):
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(value,separators=(',',':'))+'\n');temp.replace(path)
def micros(x): return x[0] if len(x)==1 else x[1][0] if x[0]==0 else None
def run(out,until,interval):
    out.mkdir(parents=True,exist_ok=True)
    lock=(out/'watch.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    atomic(out/'process.json',{'pid':os.getpid(),'until':until.isoformat(),'intervalSeconds':interval,'publicOnly':True})
    state=json.loads((out/'state.json').read_text()) if (out/'state.json').exists() else {'seen':[],'cycles':0}
    seen=set(state['seen']);records={}
    for file in sorted(out.glob('matches-*.json')):
        batch=json.loads(file.read_text())
        for m in batch['matches']:records[m['id']]={k:[r for r in batch[k] if r.get('match_id',r.get('id'))==m['id']] for k in ['participants','plays','results'] }|{'match':m}
    while datetime.datetime.now(UTC)<until:
        started=time.monotonic();now=datetime.datetime.now(UTC);stamp=now.strftime('%Y%m%dT%H%M%SZ')
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
                bs=ex.submit(q,'SELECT id, name, is_simulated FROM bot')
                ss=ex.submit(q,'SELECT bot_id, matches_played, wins, total_score, openskill_mu, openskill_sigma FROM bot_stats')
                bots={r['id']:r for r in bs.result()};stats=ss.result()
            ranked=sorted([dict(s,name=bots[s['bot_id']]['name'],rating=rating(s['openskill_mu']),spread=spread(s['openskill_sigma'])) for s in stats if s['bot_id'] in bots and spread(s['openskill_sigma'])<=175],key=lambda r:(-r['rating'],-r['openskill_mu']))
            for r in ranked:r['rank']=1+sum(x['rating']>r['rating'] for x in ranked)
            leaders=ranked[:5];tracked={r['bot_id'] for r in leaders}|{172}
            atomic(out/f'leaderboard-{stamp}.json',{'at':now.isoformat(),'ranked':ranked,'publicOnly':True})
            matches={}
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
                jobs=[ex.submit(q,f'SELECT match_state.* FROM match_state JOIN match_participant ON match_state.id = match_participant.match_id WHERE match_participant.bot_id = {bot} AND match_state.id >= 43000') for bot in tracked]
                for job in jobs:
                    for m in job.result():
                        if m['status'][0]==2 and m['id'] not in seen:matches[m['id']]=m
            ids=sorted(matches)
            for offset in range(0,len(ids),80):
                chunk=ids[offset:offset+80];where=' OR '.join(f'match_id = {i}' for i in chunk)
                tables={'participants':'match_participant','plays':'word_play','results':'auction_result','archive':'auction_top_bid_archive','auctions':'auction'}
                batch={'collectedAt':now.isoformat(),'publicOnly':True,'matches':[matches[i] for i in chunk],'leaderIds':sorted(tracked)}
                with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
                    jobs={key:ex.submit(q,'SELECT * FROM '+table+' WHERE '+where) for key,table in tables.items()}
                    for key,job in jobs.items():batch[key]=job.result()
                atomic(out/f'matches-{stamp}-{offset}.json',batch)
                for mid in chunk:
                    records[mid]={k:[r for r in batch[k] if r['match_id']==mid] for k in ['participants','plays','results']}|{'match':matches[mid]};seen.add(mid)
            summaries=[]
            for bot in tracked:
                selected=[r for _,r in sorted(records.items()) if any(p['bot_id']==bot for p in r['participants'])][-100:]
                games=[];words=[];prices=[]
                for r in selected:
                    p=next(p for p in r['participants'] if p['bot_id']==bot);ws=[w for w in r['plays'] if w['bot_id']==bot]
                    games.append({'score':p['score'],'win':p['score']==max(x['score'] for x in r['participants']),'wordScoreValid':p['score']==sum(w['total_reward'] for w in ws)})
                    end=micros(r['match']['ended_at'])
                    for w in ws:words.append({**w,'secondsBeforeEnd':(end-micros(w['played_at']))/1e6})
                    prices.extend(x for x in r['results'] if x['winner_bot_id'][0]==0 and x['winner_bot_id'][1]==bot)
                n=len(games);long=[w for w in words if len(w['word'])>=7];short=[w for w in words if len(w['word'])<=3]
                summaries.append({'botId':bot,'name':bots[bot]['name'],'matches':n,'wins':sum(g['win'] for g in games),'meanScore':statistics.mean(g['score'] for g in games) if n else None,'words7PlusPerMatch':len(long)/n if n else None,'points7PlusPerMatch':sum(w['total_reward'] for w in long)/n if n else None,'shortWords':len(short),'shortWordsBeforeFinal5Seconds':sum(w['secondsBeforeEnd']>5 for w in short),'tilesBoughtPerMatch':len(prices)/n if n else None,'coinsPaidPerMatch':sum(r['paid'] for r in prices)/n if n else None,'scoreMismatchGames':sum(not g['wordScoreValid'] for g in games),'wordLengthCounts':dict(sorted(__import__('collections').Counter(len(w['word']) for w in words).items()))})
            payload={'at':now.isoformat(),'leaders':leaders,'ours':next((r for r in ranked if r['bot_id']==172),None),'recentPublicCohorts':summaries,'newMatches':len(ids),'retainedMatches':len(seen),'until':until.isoformat(),'limitation':'Read-only public observations. Different opponents, versions and selection periods; no causal policy or automatic deployment claim.'}
            atomic(out/'latest.json',payload)
            lines=['# Current leaderboard watch','',now.isoformat(),'','| Rank | Bot | Rating | Displayed win % | Mean score |','| --- | --- | --- | --- | --- |']
            for r in leaders:lines.append(f"| {r['rank']} | {r['name']} | {r['rating']} | {100*r['wins']/max(1,r['matches_played']):.2f} | {r['total_score']/max(1,r['matches_played']):.2f} |")
            lines+=['','Recent retained cohorts (different opponents; compare cautiously):','',json.dumps(summaries,indent=2),'',payload['limitation']]
            (out/'LATEST.md').write_text('\n'.join(lines)+'\n')
            state={'seen':sorted(seen),'cycles':state['cycles']+1,'updatedAt':now.isoformat()};atomic(out/'state.json',state)
            print(json.dumps({'at':now.isoformat(),'cycle':state['cycles'],'leaders':[(x['name'],x['rating']) for x in leaders],'newMatches':len(ids),'retainedMatches':len(seen)}),flush=True)
        except Exception as error:
            with (out/'errors.jsonl').open('a') as f:f.write(json.dumps({'at':now.isoformat(),'error':type(error).__name__,'detail':str(error)[:300]})+'\n')
            print(type(error).__name__,flush=True)
        remaining=min(interval-(time.monotonic()-started),(until-datetime.datetime.now(UTC)).total_seconds())
        if remaining>0:time.sleep(remaining)
    atomic(out/'finished.json',{'at':datetime.datetime.now(UTC).isoformat(),'cycles':state['cycles'],'retainedMatches':len(seen)})
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--until',required=True);p.add_argument('--interval',type=int,default=90);a=p.parse_args()
    until=datetime.datetime.fromisoformat(a.until)
    if until.tzinfo is None or not(60<=a.interval<=600) or not(0<(until-datetime.datetime.now(UTC)).total_seconds()<=7200):raise ValueError('Require bounded <=2h aware deadline and60–600s interval')
    run(a.output,until,a.interval)
