"""Bounded paired early-pace screen; pauses the other owned offline worker only."""
import os,pathlib,subprocess,json,signal,time,statistics
root=pathlib.Path(__file__).resolve().parents[1];os.chdir(root);state=root/'.runtime-odysseus'
commit='6ed86a73c28779a96f0d21214aa97fa7e30fea8b'
entry=state/'releases'/commit/'bot-starter/src/market.ts'
assert entry.exists()
paused=None
try:
 f=state/'comparison.pid'
 if f.exists():
  pid=int(f.read_text());p=subprocess.run(['ps','-p',str(pid),'-o','args='],capture_output=True,text=True)
  if p.returncode==0 and 'compare_share.py' in p.stdout and os.getpgid(pid)==pid:
   os.killpg(pid,signal.SIGSTOP);paused=pid
 print('Starting frozen paired24-game/arm pace screen',commit,'paused other offline worker',paused,flush=True)
 records={};start=time.monotonic()
 for label,pace in [('BASE',.8),('EARLY11',1.1),('EARLY14',1.4)]:
  env=os.environ.copy();env.pop('BOT_TOKEN',None);env.pop('BOT_NONCE',None)
  dest=state/f'quick-{label}.json'
  env.update(MARKET=str(root/'data/market-clean-train.json'),DETAILS=str(dest),COHORT='early-pace-screen-24',PROGRESS='1',ONE=json.dumps({'label':label,'seed':970117,'p':{'samples':4,'bidGain':1.3,'facePremium':2,'cashLen':7,'paceEarly':pace,'paceLate':2.5,'maxBidShare':.7}}))
  subprocess.run(['nice','-n','15','node','--max-old-space-size=384','--import','tsx',str(entry),'24'],env=env,check=True,timeout=180)
  records[label]=json.loads(dest.read_text())['result'];print('Finished',label,'elapsed',round(time.monotonic()-start,1),flush=True)
 base=records['BASE']['games'];summary={}
 for label,r in records.items():
  games=r['games'];assert [g['historicalScore'] for g in games]==[g['historicalScore'] for g in base]
  diffs=[a['score']-b['score'] for a,b in zip(games,base)]
  summary[label]={'score':r['score'],'tiles':r['tiles'],'surrogatePercent':r['historicalScoreExceedance'],'pairedScoreDelta':statistics.mean(diffs),'higherScoreGames':sum(d>0 for d in diffs),'lowerScoreGames':sum(d<0 for d in diffs),'N':len(games)}
 output={'source':commit,'seed':970117,'samples':4,'elapsedSeconds':time.monotonic()-start,'arms':summary,'warning':'Small screening cohort, exogenous opponent surrogate. Requires validation; never auto-deploys.'}
 (state/'quick-screen-summary.json').write_text(json.dumps(output,indent=2)+'\n');print(json.dumps(output),flush=True)
finally:
 if paused:
  try:os.killpg(paused,signal.SIGCONT);print('Resumed original offline comparison',paused,flush=True)
  except ProcessLookupError:pass
