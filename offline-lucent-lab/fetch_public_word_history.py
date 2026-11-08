#!/usr/bin/env python3
"""Bounded public match/word history; SELECT only, no auth or bot actions."""
import argparse, concurrent.futures, datetime, json, pathlib, urllib.request
URL='https://maincloud.spacetimedb.com/v1/database/scrabblebot/sql'
def q(sql):
    if not sql.startswith('SELECT ') or ';' in sql: raise ValueError('Read-only SELECT required')
    req=urllib.request.Request(URL,data=sql.encode(),headers={'Content-Type':'text/plain'},method='POST')
    with urllib.request.urlopen(req,timeout=25) as response: raw=response.read(12*1024*1024+1)
    if len(raw)>12*1024*1024: raise ValueError('Response too large')
    rows=[]
    for table in json.loads(raw):
        names=[e['name']['some'] for e in table['schema']['elements']]
        rows.extend(dict(zip(names,row)) for row in table['rows'])
    return rows
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--bot',type=int,required=True);p.add_argument('--min-match',type=int,required=True);p.add_argument('--count',type=int,default=200);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    if not(0<a.bot and 0<=a.min_match and 1<=a.count<=250):raise ValueError('Invalid bounded collection request')
    queries={'bots':'SELECT id, name, is_simulated FROM bot','stats':f'SELECT bot_id, matches_played, wins, total_score, openskill_mu, openskill_sigma FROM bot_stats WHERE bot_id = {a.bot}',
      'versions':f'SELECT * FROM bot_version WHERE bot_id = {a.bot}',
      'matches':f'SELECT match_state.* FROM match_state JOIN match_participant ON match_state.id = match_participant.match_id WHERE match_participant.bot_id = {a.bot} AND match_state.id >= {a.min_match}'}
    out={'collectedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'botId':a.bot,'publicOnly':True}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        jobs={key:ex.submit(q,sql) for key,sql in queries.items()}
        for key,job in jobs.items():out[key]=job.result()
    out['matches']=sorted([m for m in out['matches'] if m['status'][0]==2],key=lambda m:m['id'])[-a.count:]
    ended=[m['id'] for m in out['matches']]
    if not ended:raise RuntimeError('No completed matches')
    where=' OR '.join(f'match_id = {i}' for i in ended)
    tail={'participants':'SELECT * FROM match_participant WHERE '+where,'plays':'SELECT * FROM word_play WHERE '+where}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        jobs={key:ex.submit(q,sql) for key,sql in tail.items()}
        for key,job in jobs.items():out[key]=job.result()
    out['completedMatchIds']=ended;out['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();out['queries']={**queries,**tail}
    out['limitation']='Separate public SELECTs, not an atomic snapshot. Latest completed matches in requested ID range, not a randomized or version-controlled comparison.'
    a.output.write_text(json.dumps(out,separators=(',',':'))+'\n')
    print(json.dumps({'path':str(a.output),'bot':a.bot,'matches':len(ended),'words':len(out['plays']),'firstMatch':min(ended),'lastMatch':max(ended),'stats':out['stats']}))
