"""Public/read-only status reporter; never submits actions or reads a token."""
import datetime,fcntl,importlib.util,json,math,os,pathlib,re,subprocess,time,urllib.request
health_spec=importlib.util.spec_from_file_location('offline_worker_health',pathlib.Path(__file__).with_name('offline_worker_health.py'))
offline_health=importlib.util.module_from_spec(health_spec);health_spec.loader.exec_module(offline_health)
root=pathlib.Path(__file__).resolve().parents[1];state=root/'.runtime-odysseus';state.mkdir(exist_ok=True)
lock=(state/'status.lock').open('a')
try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise SystemExit('Status reporter already running')
(state/'status.pid').write_text(str(os.getpid()))
url='https://maincloud.spacetimedb.com/v1/database/scrabblebot/sql';offset=0;matches={};commit='unknown';events=[];public={};next_poll=0
K=400/(math.log(10)*(25/6)*math.sqrt(2));rounded=lambda x:math.floor(x+.5)
def q(sql):
 req=urllib.request.Request(url,data=sql.encode(),method='POST')
 with urllib.request.urlopen(req,timeout=10) as response:result=json.load(response)
 out=[]
 for table in result:
  names=[e['name']['some'] for e in table['schema']['elements']]
  out.extend(dict(zip(names,row)) for row in table['rows'])
 return out
while True:
 try:
  log=state/'live.log'
  if log.exists():
   with log.open() as f:
    f.seek(offset)
    for line in f:
     version=re.search(r'starting Odysseus source ([0-9a-f]+)',line)
     if version:commit=version.group(1)
     m=re.search(r'match (\d+) ended: score (\d+), place (\d+)/(\d+), unplayed \'([^\']*)\'',line)
     if m:matches[int(m[1])]={'id':int(m[1]),'score':int(m[2]),'place':int(m[3]),'seats':int(m[4]),'unplayed':m[5],'commit':commit}
     if 'submission failed' in line.lower() or 'bid on auction' in line and 'failed' in line:events.append(line.strip())
    offset=f.tell()
  if time.monotonic()>=next_poll:
   try:
    stats=q('SELECT bot_id, openskill_mu, openskill_sigma, wins, matches_played FROM bot_stats')
    ids={b['id'] for b in q('SELECT id FROM bot')}
    mine=next((entry for entry in stats if entry['bot_id']==172),None)
    if mine is None:raise RuntimeError('Bot172stats temporarily absent')
    versions=q('SELECT * FROM bot_version WHERE bot_id = 172')
    version=max(versions,key=lambda row:row['version']) if versions else {'version':1}
    rating=rounded(1500+K*(mine['openskill_mu']-25));spread=rounded(K*mine['openskill_sigma'])
    ranked=[entry for entry in stats if entry['bot_id'] in ids and rounded(K*entry['openskill_sigma'])<=175]
    public={'rating':rating,'spread':spread,'rank':None if spread>175 else 1+sum(rounded(1500+K*(entry['openskill_mu']-25))>rating for entry in ranked),'provisional':spread>175,'rankedBots':len(ranked),'wins':mine['wins'],'matches':mine['matches_played'],'version':version['version'],'versionStartedAt':version.get('started_at'),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stale':False}
    if version['version']>1:public['ratingResetNote']='External new-version reset detected; earlier lifetime stats are not current-version stats.'
    elif matches:
     history=q('SELECT * FROM rating_history WHERE bot_id = 172');history.sort(key=lambda h:h['at'][0]);first=min(matches)
     i=next((i for i,h in enumerate(history) if h['match_id']==first),None)
     if i is not None and i>0:
      before=rounded(1500+K*(history[i-1]['openskill_mu']-25));public.update(ratingBeforeLocalRunner=before,ratingChangeSinceTakeover=rating-before)
    (state/'status-error.txt').unlink(missing_ok=True)
    next_poll=time.monotonic()+60
   except Exception as error:
    public={**public,'stale':True,'refreshError':type(error).__name__}
    (state/'status-error.txt').write_text(type(error).__name__+'\n')
    next_poll=time.monotonic()+30
  health={}
  for name in ['supervisor','child']:
   file=state/(name+'.pid')
   if file.exists():
    pid=file.read_text().strip()
    info=subprocess.run(['ps','-p',pid,'-o','pcpu=,rss=,etime='],capture_output=True,text=True)
    if info.returncode==0:
     cpu,rss,elapsed=info.stdout.split();health[name]={'pid':int(pid),'cpuPercent':float(cpu),'rssMiB':round(int(rss)/1024,1),'elapsed':elapsed}
  power=json.loads((state/'power.json').read_text()) if (state/'power.json').exists() else {}
  offlineWorker=offline_health.offline_worker_health(state/'offlineworker.lock')
  result={'power':power,'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'botId':172,'name':"Odysseus's Voyage",'public':public,'health':health,'activeCommit':commit,'completedLocalMatches':list(matches.values()),'submissionRejectionCount':len(events),'recentRejections':events[-5:],'localRunnerActive':'child' in health,'note':'Public metrics may reflect the cofounder runner. Local runner is active only when child health is present. Offline surrogate results require review before deployment.'}
  result['offlineWorker']=offlineWorker
  (state/'status.json').write_text(json.dumps(result,indent=2)+'\n')
  rows=['# Odysseus live status','',f"Updated {result['updatedAt']}",'',f"Rating **{public.get('rating','?')} ±{public.get('spread','?')}**, rank **{public.get('rank','?')}/{public.get('rankedBots','?')}**, {public.get('wins','?')} wins / {public.get('matches','?')} current-version matches.",f"Rating change since local takeover: {public.get('ratingChangeSinceTakeover','?'):+}" if isinstance(public.get('ratingChangeSinceTakeover'),int) else '',f"Version **{public.get('version','?')}**; provisional={public.get('provisional','?')}; public data stale={public.get('stale','?')}.",f"Completed here: **{len(matches)}**; last local source `{commit[:8]}`. Local runner active={'child' in health}. Supervisor and child health: `{json.dumps(health)}`.",'','| Match | Place | Score | Unplayed | Source |','| --- | --- | --- | --- | --- |']
  rows += [f"| [{m['id']}](https://scrabblebot.spacetimedb.com/matches/{m['id']}) | {m['place']}/{m['seats']} | {m['score']} | {m['unplayed'] or '—'} | {m['commit'][:8]} |" for m in list(matches.values())[-20:]]
  rows += ['',f"Power: {power.get('batteryPercent','?')}% battery; AC connected={power.get('acPower','?')}; offline comparison paused={power.get('offlinePaused','?')}. Local runner active={'child' in health}.",'',f"Submission rejections logged: {len(events)}. The runner retries within bounded deadlines. A packaging-path restart issue was fixed before the current source launched.",'','Full-balance bidding experiment: `.runtime-odysseus/share-comparison.log`; no automatic deployment. Public metrics refresh every60s. Keep laptop powered, lid open and network connected. To stop the live runner, send SIGTERM only to the supervisor PID shown above.']
  rows += ['',f"Shared offline worker: status={offlineWorker['status']}; active={offlineWorker['active']}; lock held={offlineWorker['lockHeld']}. `{json.dumps(offlineWorker)}`"]
  (state/'LIVE-STATUS.md').write_text('\n'.join(rows)+'\n')
 except Exception as error:
  (state/'status-error.txt').write_text(type(error).__name__+'\n')
  next_poll=time.monotonic()+30
 time.sleep(15)
