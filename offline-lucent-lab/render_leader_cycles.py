#!/usr/bin/env python3
"""Render auditable per-game evidence from a fixed public leaderboard snapshot."""
import collections, json, pathlib, statistics
from audit_leader_cycles import ROOT, OUT

def main():
    d=json.loads((OUT/'analysis.json').read_text())
    raw=json.loads((OUT/'raw-matches.json').read_text())
    matches={m['match']['id']:m for m in raw['matches']}
    names={b['id']:b['name'] for b in json.loads((OUT/'leaderboard.json').read_text())['bots']}
    leaders=d['leaders'];ids=[r['bot_id'] for r in leaders]+[172]
    lines=['# Current leader continuation audit','',f"Public snapshot: {d['capturedAt']}. All games below have six seats.",'',
           'The current top five were RackMaw, LUCENT, aipom, Bron and LexForge-1107. Each last-20 cohort includes losses. Each last-10-wins cohort is selected on victory and is descriptive only, never an estimated win rate. Rankings continue to change. Opponent versions and source code are private.',
           '', '## All outcomes in the last 20 games','',
           '| Bot | Wins / 20 | Mean score | First word | Second word | Third and later | Q4 tiles | Q4 spend |',
           '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for b in ids:
        s=d['summaries'][f'{b}:last20']
        lines.append(f"| {names[b]} | {s['wins']} | {s['meanScore']:.2f} | {s['firstWordPoints']:.2f} | {s['secondWordPoints']:.2f} | {s['thirdPlusPoints']:.2f} | {s['tilesByQuarter'][3]:.2f} | {s['paidByQuarter'][3]:.2f} |")
    lines += ['', '## Findings and falsifiable adaptations','',
      '1. **Continuation is the clearest shared gap.** Odysseus scores 45.15 on its first word, 30.40 on its second and 3.75 thereafter. Every top-five bot buys 3.0–4.75 tiles in Q4 versus our 0.9. Our Q4 spending is10.2 coins versus40.5–66.25. This is observational evidence of a late acquisition bottleneck, not proof that indiscriminate spending wins.',
      '2. **The acquisition weakness begins early too.** Our Q1 buys average0.5, compared with2.15–3.7 for all five leaders. We concentrate purchases in Q2/Q3 (4.2/5.05). Check both slow starts and late restart valuation; merely speeding word submission cannot explain this full pattern.',
      '3. **There is no universal two-seven-letter recipe.** RackMaw has1.15 seven-plus words per game averaging51.65 points each; LUCENT has1.60 averaging39.84. RackMaw wins9/20 at99.3 mean; LUCENT wins5/20 at76.95, below our79.3 in this recent sample. LexForge wins11/20 at102.6 with1.45 seven-plus words averaging48.62. High-value five/six-letter conversions can support a second and third cycle.',
      '4. **Cash starvation and empty-rack restart are distinct.** Match45219: BOWLIKE48 then UNMATED30 left EFLO/cash8; FLOE10 remained until the end. Both the strict starvation threshold and minimum length5 blocked it. Match45248: WHITEYS48 then TAMBURAS36 emptied the rack around49.2s with47 coins; all later logged bids lost and later auctions had no recorded attempt. The first case is a liquidity gate; the second is acquisition/restart valuation with available cash. Old logs cannot prove acknowledgement.',
      '5. **Preserve profitable shorter words and residual inventory when testing.** RackMaw45248 wins with OPAQUED57, CONVEX45 and SKAG13. GodOfThudner45219 wins with DEXTRAN45, QUARTO37, CRYPTO32, BLUSH20 and EF5. A blanket shorter-word ban contradicts these observed wins. An eight-letter cashout can also exhaust useful continuation tiles; compare total attainable continuation, not length alone.',
      '6. **Tests must judge full games, including failures.** The guarded completion floor reduced synthetic score and wins and remains disabled. A cash9/minimum4 candidate fixes the EFLO fixture but also failed its64-world screen; it remains disabled. The next discriminating experiment should target cash-rich small-rack continuation with bounded acquisition costs and remaining auctions, plus high-value conversion quality. Require improved paired wins/score and Q4 useful acquisitions; reject a candidate that merely buys more or chases unfinishable premium letters.',
      '', '## Last ten wins for each current top-five bot','',
      '| Bot | Mean score in selected wins | First | Second | Third and later | Q4 tiles | Q4 spend |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
    for b in ids[:-1]:
        s=d['summaries'][f'{b}:last10Wins'];lines.append(f"| {names[b]} | {s['meanScore']:.2f} | {s['firstWordPoints']:.2f} | {s['secondWordPoints']:.2f} | {s['thirdPlusPoints']:.2f} | {s['tilesByQuarter'][3]:.2f} | {s['paidByQuarter'][3]:.2f} |")
    lines += ['', '## Individual games','', 'Every row records the complete word sequence, points, seconds since start, cash after each word, subsequent purchases, final-quarter activity and remaining cash. The full JSON additionally preserves every purchase and cash transition. The first two sections cover every one of the top two bots’ last20 games; subsequent sections cover all50 requested winning bot-games. Some matches overlap by design.']
    selections=[(b,'last20') for b in [leaders[0]['bot_id'],leaders[1]['bot_id']]]+[(b,'last10Wins') for b in ids[:-1]]+[(172,'last20')]
    for b,label in selections:
        s=d['summaries'][f'{b}:{label}']
        lines += ['',f"### {names[b]} — {label}",'',f"Date range UTC: {s['dateRange'][0]} to {s['dateRange'][1]}",'',
                  '| Match / place | Complete word sequence: points @ seconds; cash after | Purchases after each word until next/end | Q4 tiles / spend | End cash | Per-game observation |',
                  '| --- | --- | --- | --- | ---: | --- |']
        for r in d['profiles'][f'{b}:{label}']:
            words=' → '.join(f"{w['word']} {w['points']}@{w['seconds']:.1f}s (${w['cashAfter']})" for w in r['words'])
            buys=' / '.join(str(w['buysUntilNextWordOrEnd']) for w in r['words'])
            notes=[]
            if r['firstWordPoints']>=45:notes.append('high-value opening')
            if len(r['words'])>=2 and r['words'][1]['points']>=40:notes.append('40+ second conversion')
            if sum(w['points'] for w in r['words'][2:])>=20:notes.append('20+ third/later points')
            if r['tilesByQuarter'][3]>=5:notes.append('5+ late acquisitions')
            if r['cashUnder10Seconds']>=10:notes.append(f"cash<10 for{r['cashUnder10Seconds']:.1f}s")
            if r['tilesByQuarter'][3]==0:notes.append('zero Q4 purchases')
            if not notes:notes.append(f"{r['afterFirstPoints']} points after opening; {r['afterFirstBuys']} later acquisitions")
            lines.append(f"| [{r['matchId']}](https://scrabblebot.spacetimedb.com/matches/{r['matchId']}) / {r['place']} | {words} | {buys} | {r['tilesByQuarter'][3]} / {r['paidByQuarter'][3]} | {r['endCash']} | {'; '.join(notes)} |")
    lines += ['', '## Data checks and limits','',
              'All selected profiles reconcile word totals with public final score and reconstruct final cash from100 starting coins, auction payments and word income with zero mismatches. The raw auction results and highest-bid archive are saved beside this report. Private initial racks and receipt/rejection telemetry are not public.',
              'Our recent cohort spans the original WIN30 client and one match after a client-only reliability release; strategy parameters were unchanged. Same-table comparisons are included in analysis.json (small samples: RackMaw2, LUCENT1, Bron4, LexForge5, aipom0). No comparison here proves causality or estimates tournament rank from synthetic wins. A top-five ranking and selected wins do not make every recent opponent policy successful.',
              'Reproduce with audit_leader_cycles.py for a new snapshot; render this fixed snapshot with render_leader_cycles.py. Raw files are retained, not overwritten by the continuous leaderboard watcher.']
    (OUT/'REPORT.md').write_text('\n'.join(lines)+'\n')
    print(str(OUT/'REPORT.md'))
if __name__=='__main__':main()
