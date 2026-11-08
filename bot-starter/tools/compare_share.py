"""Serial 400-vs-400 offline comparison. Reports only; never deploys or uses tokens."""
import json,os,pathlib,subprocess,time,random,statistics
root=pathlib.Path(__file__).resolve().parents[1];os.chdir(root)
state=root/'.runtime-odysseus';state.mkdir(exist_ok=True)
started=time.monotonic(); results={}
for label,share in [('BASE',.7),('SHARE1',1.)]:
 env=os.environ.copy();env.pop('BOT_TOKEN',None);env.pop('BOT_NONCE',None)
 env.update(MARKET='data/market-clean-train.json',COHORT='calibration-400',PROGRESS='1',DETAILS=str(state/(label+'-400.json')),ONE=json.dumps({'label':label,'seed':880101,'p':{'samples':8,'bidGain':1.3,'facePremium':2,'cashLen':7,'paceEarly':.8,'paceLate':2.5,'maxBidShare':share}}))
 print('START',label,time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),flush=True)
 subprocess.run(['nice','-n','15','node','--max-old-space-size=512','--import','tsx','src/market.ts','400'],env=env,check=True,timeout=3600)
 results[label]=json.loads((state/(label+'-400.json')).read_text())
 print('FINISH',label,'elapsed seconds',round(time.monotonic()-started,1),flush=True)
a=results['BASE']['result']['games'];b=results['SHARE1']['result']['games']
assert len(a)==len(b)==400
for x,y in zip(a,b):assert (x['seed'],x['matchIndex'],x['historicalScore'])==(y['seed'],y['matchIndex'],y['historicalScore'])
diffs=[100*(int(y['historicalScoreExceedance'])-int(x['historicalScoreExceedance'])) for x,y in zip(a,b)]
r=random.Random(8441);boot=sorted(statistics.mean(r.choices(diffs,k=len(diffs))) for _ in range(2000))
summary={'matchesPerArm':400,'MCsamples':8,'seed':880101,'cohort':'34 historical calibration matches only; separate validation/unseen not used','surrogateDeltaPercentagePoints':statistics.mean(diffs),'conditionalBootstrap95':[boot[50],boot[1949]],'meanScoreDelta':statistics.mean(y['score']-x['score'] for x,y in zip(a,b)),'elapsedSeconds':time.monotonic()-started,'warning':'Historical-score exceedance surrogate is not real win/rating improvement. Opponents do not react. No automatic deployment. Calibrated on only34 historical tables; intervals conditional on this data.'}
(state/'share-comparison.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2),flush=True)
