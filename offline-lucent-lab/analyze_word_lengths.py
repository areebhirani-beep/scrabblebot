#!/usr/bin/env python3
"""Read-only analysis of completed public matches; no hidden racks or live actions."""
import argparse, collections, hashlib, json, statistics
from pathlib import Path

def analyze(path, dictionary):
    data = json.loads(path.read_text())
    if data.get('publicOnly') is not True: raise ValueError('Expected public-only archive')
    completed = set(data['completedMatchIds'])
    players = [p for p in data['participants'] if p['match_id'] in completed]
    by_match = collections.defaultdict(list)
    for p in players: by_match[p['match_id']].append(p)
    words = collections.defaultdict(list)
    for w in data['plays']:
        if w['match_id'] in completed: words[w['match_id'], w['bot_id']].append(w)
    names = {b['id']: b['name'] for b in data['bots']}
    rows = []
    for p in players:
        ws = words[p['match_id'], p['bot_id']]
        rows.append({'match':p['match_id'], 'botId':p['bot_id'], 'name':names.get(p['bot_id']),
            'score':p['score'], 'win':p['score'] == max(q['score'] for q in by_match[p['match_id']]),
            'words':[{'word':w['word'],'score':w['total_reward'],'length':len(w['word'])} for w in ws]})
    def summary(rs):
        ws = [w for r in rs for w in r['words']]
        n = len(rs)
        scored = sum(r['score'] for r in rs)
        seven = [w for w in ws if w['length'] >= 7]
        return {'playerMatches':n,'meanScore':statistics.mean(r['score'] for r in rs) if n else None,
                'winPercent':100*sum(r['win'] for r in rs)/n if n else None,
                'with7PlusPercent':100*sum(any(w['length']>=7 for w in r['words']) for r in rs)/n if n else None,
                'words7PlusPerMatch':len(seven)/n if n else None,
                'points7PlusPerMatch':sum(w['score'] for w in seven)/n if n else None,
                'scoreShare7PlusPercent':100*sum(w['score'] for w in seven)/scored if scored else None,
                'mean7PlusReward':statistics.mean(w['score'] for w in seven) if seven else None,
                'withExactly7Percent':100*sum(any(w['length']==7 for w in r['words']) for r in rs)/n if n else None,
                'wordsExactly7PerMatch':sum(w['length']==7 for w in ws)/n if n else None,
                'scoreShareExactly7Percent':100*sum(w['score'] for w in ws if w['length']==7)/scored if scored else None,
                'wordLengthCounts':dict(sorted(collections.Counter(w['length'] for w in ws).items())),
                'pointsByWordLength':{l:sum(w['score'] for w in ws if w['length']==l) for l in sorted({w['length'] for w in ws})}}
    valid = {w.strip().upper() for w in dictionary.read_text().splitlines() if w.strip().isalpha() and len(w.strip())>=2}
    result = {'archive':str(path), 'archiveSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'collectedAt':data['collectedAt'],'distinctMatches':len(by_match),'tiesCountAsWins':True,
        'all':summary(rows),'winners':summary([r for r in rows if r['win']]),'nonwinners':summary([r for r in rows if not r['win']]),
        'with7Plus':summary([r for r in rows if any(w['length']>=7 for w in r['words'])]),
        'without7Plus':summary([r for r in rows if not any(w['length']>=7 for w in r['words'])]),
        'ours':summary([r for r in rows if r['botId']==172]),
        'lucent':summary([r for r in rows if r['name'] and r['name'].upper()=='LUCENT']),
        'lucentWins':summary([r for r in rows if r['name'] and r['name'].upper()=='LUCENT' and r['win']]),
        'lucentNonwins':summary([r for r in rows if r['name'] and r['name'].upper()=='LUCENT' and not r['win']]),
        'quality':{'duplicateWordIds':len(data['plays'])-len({w['id'] for w in data['plays']}),
                   'scoreMismatches':[{'match':r['match'],'bot':r['botId'],'score':r['score'],'wordScore':sum(w['score'] for w in r['words'])} for r in rows if r['score']!=sum(w['score'] for w in r['words'])]},
        'dictionary':{'sha256':hashlib.sha256(dictionary.read_bytes()).hexdigest(),'uniqueWords':len(valid),
                      'length6to10Counts':{n:sum(len(w)==n for w in valid) for n in range(6,11)},
                      'playedWordsMissing':sorted({w['word'] for r in rows for w in r['words'] if w['word'].upper() not in valid})},
        'topWinningWords':sorted([{'match':r['match'],'bot':r['name'],**w} for r in rows if r['win'] for w in r['words']],key=lambda w:w['score'],reverse=True)[:20],
        'limitations':['Observational tables containing our bot only; selection bias and repeated bots.','Versions and opponents changed. Correlation does not establish a cashout or bidding policy improvement.','No private racks inferred; dictionary coverage does not guarantee timely search completion.'], 'playerMatches':rows}
    shared = {r['match'] for r in rows if r['botId']==172}
    result['matchedOursLucent'] = {str(bot):summary([r for r in rows if r['botId']==bot and r['match'] in shared]) for bot in [172,18]}
    result['target'] = summary([r for r in rows if r['botId']==data['botId']])
    result['targetWins'] = summary([r for r in rows if r['botId']==data['botId'] and r['win']])
    result['status'] = 'complete'
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('archive',type=Path);parser.add_argument('dictionary',type=Path);parser.add_argument('--output',type=Path,required=True);a=parser.parse_args()
    r=analyze(a.archive,a.dictionary);a.output.write_text(json.dumps(r,indent=2)+'\n')
    print(json.dumps({k:v for k,v in r.items() if k not in ('playerMatches','topWinningWords')},indent=2))
