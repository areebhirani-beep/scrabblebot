#!/usr/bin/env python3
"""Exact small-rack final-position audit. No simulation, network or actions."""
import collections, functools, hashlib, itertools, json
from pathlib import Path
VALUES=dict(zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ',[1,3,3,2,1,4,2,4,1,8,5,1,3,1,1,3,10,1,1,1,1,4,4,8,4,10]))
def reward(w):
    b=sum(VALUES[c] for c in w);n=len(w)
    return b if n<=3 else b*3//2 if n==4 else b*2 if n==5 else b*5//2 if n==6 else b*3

def solve(rack, by_key, min_len):
    if len(rack)>10:raise ValueError('Bounded exact audit permits <=10 tiles')
    counts=collections.Counter(rack);letters=sorted(counts);initial=tuple(counts[c] for c in letters);candidates=[]
    for need in itertools.product(*(range(counts[c]+1) for c in letters)):
        if sum(need)<min_len:continue
        key=''.join(c*n for c,n in zip(letters,need));word=by_key.get(key)
        if word:candidates.append((need,word,reward(word)))
    @functools.lru_cache(None)
    def best(state):
        result=(0,())
        for need,word,score in candidates:
            if all(a<=b for a,b in zip(need,state)):
                sub=best(tuple(b-a for a,b in zip(need,state)));proposal=(score+sub[0],(word,)+sub[1])
                if proposal[0]>result[0]:result=proposal
        return result
    score,words=best(initial);return {'score':score,'words':list(words),'states':best.cache_info().currsize,'exact':True}

if __name__=='__main__':
    path=Path('spacetimedb/wordlist.txt');index={}
    for raw in path.read_text().splitlines():
        w=raw.strip().upper()
        if 2<=len(w)<=10 and all(c in VALUES for c in w):index.setdefault(''.join(sorted(w)),w)
    input_path=Path('experiments/win30-terminal-inventories.json');data=json.loads(input_path.read_text());rows=[]
    for row in data['matches']:
        if not row['nonnegative'] or not row['observedWordsFeasible']:raise ValueError('Invalid reconstruction')
        if sum(reward(w) for w in row['observedTerminalWords'])!=row['observedTerminalPoints']:raise ValueError('Observed reward mismatch')
        solutions={str(n):solve(row['rackAtFinalAuctionOpen'],index,n) for n in [2,3,4,7]}
        if solutions['2']['score']<row['observedTerminalPoints']:raise ValueError('Exact solution below observed legal plan')
        rows.append({**row,'minimumLengthSolutions':solutions,'missedTerminalPoints':solutions['2']['score']-row['observedTerminalPoints']})
    out={'status':'complete','dictionarySha256':hashlib.sha256(path.read_bytes()).hexdigest(),'inputSha256':hashlib.sha256(input_path.read_bytes()).hexdigest(),'matches':rows,'summary':{'matches':len(rows),'observedTerminalPoints':sum(r['observedTerminalPoints'] for r in rows),'bestTerminalPoints':{str(n):sum(r['minimumLengthSolutions'][str(n)]['score'] for r in rows) for n in [2,3,4,7]},'missedTerminalPoints':sum(r['missedTerminalPoints'] for r in rows),'matchesWithMissedTerminalPoints':sum(r['missedTerminalPoints']>0 for r in rows)},'limitation':'Exact only for reconstructed inventory at final auction open; acquisitions and earlier plays fixed. It does not evaluate alternate midgame bidding, latency or larger-rack decisions.'}
    Path('experiments/win30-terminal-partition-audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out['summary']));print('improvements',[(r['matchId'],r['missedTerminalPoints'],r['minimumLengthSolutions']['2']) for r in rows if r['missedTerminalPoints']])
