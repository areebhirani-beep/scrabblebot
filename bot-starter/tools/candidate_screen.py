"""Sequential frozen-policy screen. Public historical data only; never deploys."""
import json,os,pathlib,signal,subprocess,time,statistics,sys
root=pathlib.Path(__file__).resolve().parents[1];os.chdir(root);state=root/'.runtime-odysseus'
commit=(state/'campaign-source.txt').read_text().strip();entry=state/'releases'/commit/'bot-starter/src/market.ts'
configs=[('BASE',{}),('LIQUID2',{'starveMinBagLeft':2}),('PACK',{'packLongWords':True}),('REFINE',{'refineSmallRacks':True}),('EARLY_PREM1',{'paceEarly':1.1,'facePremium':1}),('SIX40',{'valuableSixMinScore':40})]
baseparams={'samples':8,'bidGain':1.3,'facePremium':2,'cashLen':7,'paceEarly':.8,'paceLate':2.5,'maxBidShare':.7}
cfg=json.loads(pathlib.Path(sys.argv[1]).read_text()) if len(sys.argv)>1 else {}
configs=cfg.get('arms',configs);N=cfg.get('N',64);seed=cfg.get('seed',970217);prefix=cfg.get('prefix','candidate');dataset=cfg.get('dataset','data/market-clean-train.json');baseparams.update(cfg.get('base',{}))
paused=None;start=time.monotonic();allresults={}
try:
 f=state/'comparison.pid'
 if f.exists():
  pid=int(f.read_text());p=subprocess.run(['ps','-p',str(pid),'-o','args='],capture_output=True,text=True)
  if p.returncode==0 and 'compare_share.py' in p.stdout and os.getpgid(pid)==pid:os.killpg(pid,signal.SIGSTOP);paused=pid
 print('START frozen',commit,str(N)+'games/arm; paused original offlineworker',paused,flush=True)
 for label,overrides in configs:
  env=os.environ.copy();env.pop('BOT_TOKEN',None);env.pop('BOT_NONCE',None);dest=state/f'{prefix}-{label}.json';p={**baseparams,**overrides}
  env.update(MARKET=str(root/dataset),DETAILS=str(dest),COHORT=prefix,PROGRESS='1',ONE=json.dumps({'label':label,'seed':seed,'p':p}))
  print('ARM',label,json.dumps(overrides),flush=True)
  subprocess.run(['nice','-n','15','node','--max-old-space-size=384','--import','tsx',str(entry),str(N)],env=env,check=True,timeout=900)
  r=json.loads(dest.read_text())['result'];allresults[label]=r
  base=allresults['BASE']['games'];assert [(g['matchIndex'],g['historicalScore']) for g in r['games']]==[(g['matchIndex'],g['historicalScore']) for g in base]
  report={'source':commit,'samples':baseparams['samples'],'seed':seed,'elapsedSeconds':time.monotonic()-start,'warning':'Screening surrogate only, not counterfactual live win rate; no automatic deployment','arms':{}}
  for name,out in allresults.items():
   diffs=[g['score']-b['score'] for g,b in zip(out['games'],base)]
   report['arms'][name]={'score':out['score'],'tiles':out['tiles'],'surrogatePercent':out['historicalScoreExceedance'],'scoreDelta':statistics.mean(diffs),'higher':sum(x>0 for x in diffs),'lower':sum(x<0 for x in diffs),'N':N}
  (state/(prefix+'-screen-summary.json')).write_text(json.dumps(report,indent=2)+'\n')
  print('FINISH',label,'elapsed',round(time.monotonic()-start,1),flush=True)
 print(json.dumps(report),flush=True)
finally:
 if paused:
  try:os.killpg(paused,signal.SIGCONT);print('RESUMED original offlineworker',paused,flush=True)
  except ProcessLookupError:pass
