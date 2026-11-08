# Persistent experiment lessons

Read this before proposing an experiment. These are evidence-scoped decisions, not universal claims.

Shared experiment provenance: `../odysseus-live/bot-starter/.runtime-odysseus/experiments.sqlite`.

## cash-rollout-screen-20261107-v1 — one-step-priced-cashout (reject)

Hypothesis: Cashing a 4–6-letter word when it funds more sampled future tiles improves both wins and score.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/odysseus-live/bot-starter/.runtime-odysseus/lucentlab-cash-screen-reactive-summary.json

Observed: 48 paired worlds per arm, 192 matches total, 24 MC samples. BASE64.5417 points/12.5% wins incl ties; COST8/COST12 63.5/10.4167%; COST16 63.3333/10.4167%. COST8 changed one world, losing 50 points and one first place.

Decision: Keep default disabled. None of the three assumed-price candidates improves either primary outcome in this screen. Do not rerun price tweaks as a new improvement without a changed mechanism or calibrated evidence.

Uncertainty: Exploratory screen, only 1–2 changed worlds, conditional score CI reaches zero. This rejects promotion, not all possible priced cashout policies. Opponents are synthetic and instant receipts are idealized.

Revisit only when: Use a complete short-horizon auction rollout with explicit future payments and receipt-aware income, or provide new calibrated prices and a concrete failure reproduction. Then evaluate against stronger gain1.3/1.6 incumbents as well.

## cash-rollout-trace-20261107-v2 — one-step-priced-cashout (reject)

Hypothesis: Cashing a 4–6-letter word when it funds more sampled future tiles improves both wins and score.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/odysseus-live/bot-starter/.runtime-odysseus/lucentlab-cash-screen-reactive-summary.json

Observed: Replayed paired world21, same seed11072941: BASE140/first/17tiles/27endcash; COST8 90/third/8tiles/76endcash. At bagLeft29, rackADEEHLOWYZ, balance16, policy sold WHEEZY after estimating +4.5 points (SE1.3229) across8 samples, assuming affordable future draws2->3. Trace saved experiments/cash-trace-COST8.log.

Decision: The extra cash did not turn into additional winning acquisitions in this world. Keep the one-step priced-draw policy disabled; preserve this regression world for future cashout experiments.

Uncertainty: One deterministic paired synthetic world; timing-sensitive search and reacting rivals. The realized -50-point delta does not prove all shorter cashouts are harmful.

Revisit only when: Use a complete short-horizon auction rollout with explicit future payments and receipt-aware income, or provide new calibrated prices and a concrete failure reproduction. Then evaluate against stronger gain1.3/1.6 incumbents as well.

## lucentlab-win-from-neutral-screen — training-prior-win-utility (unproven)

Hypothesis: A monotone points-plus-win-boundary objective increases conversion of competitive positions into first places while retaining average points.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/odysseus-live/bot-starter/.runtime-odysseus/lucentlab-win-from-neutral-screen-reactive-summary.json

Observed: live/BASE: trials=96, uniqueWorlds=32, score=94.4688, winsIncludingTies=28.1250%; live/WIN30: trials=96, uniqueWorlds=32, score=92.3750, winsIncludingTies=34.3750%; live/WIN60: trials=96, uniqueWorlds=32, score=93.9375, winsIncludingTies=34.3750%; live/WIN120: trials=96, uniqueWorlds=32, score=89.3646, winsIncludingTies=25.0000%

Decision: Screen nominates possibilities only. Review paired intervals, opponent robustness and three-repeat held-out checks before selecting an offline incumbent.

Uncertainty: Synthetic opponent policies, CPU deadlines and instant actions. A screen is selection data; no real leaderboard or independent validation claim.

Revisit only when: Freeze a candidate and run fresh worlds, an unseen opponent field and repeated-world stability checks.

## lucent-seven-letter-public-200 — long-word-completion-throughput (unproven)

Hypothesis: Repeated high-value seven-letter completions are associated with strong live outcomes and can guide a tested acquisition policy.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/offline-lucent-lab/experiments/lucent-word-length-pattern-200.json

Observed: LUCENT200publicmatches:46.5%wins122.74points;exact7supplies68.38%score;7+86.66%;92of93winscontainexact7,all93contain7+. Matched53:1.717longwordsLUCENTvs1.660ours.

Decision: Prioritize long-word frequency and value in new paired experiments. Existing cashLen7 and full lexicon already cover long words; no policy promotion from observational data.

Uncertainty: Changing versions/opponent mix; selected recent matches; correlations and winner-conditioned summaries do not identify causal effects or predict130–140mean.

Revisit only when: Test a concrete acquisition/completion mechanism against the current live policy on joint score and win outcomes; retain long-word diagnostics.

## lucentlab-win30-price-future-screen — price-weighted-future-tiles (unproven)

Hypothesis: Discounting expensive letters in sampled future acquisitions values current opportunities more realistically and improves wins plus score against current WIN30. Keep horizon unchanged to isolate composition.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/odysseus-live/bot-starter/.runtime-odysseus/lucentlab-win30-price-future-screen-reactive-summary.json

Observed: live/BASE: trials=96, uniqueWorlds=32, score=84.1250, winsIncludingTies=21.8750%; live/PRICE05: trials=96, uniqueWorlds=32, score=85.3438, winsIncludingTies=21.8750%; live/PRICE1: trials=96, uniqueWorlds=32, score=85.1979, winsIncludingTies=31.2500%; live/PRICE2: trials=96, uniqueWorlds=32, score=88.8125, winsIncludingTies=37.5000%

Decision: Screen nominates possibilities only. Review paired intervals, opponent robustness and three-repeat held-out checks before selecting an offline incumbent.

Uncertainty: Synthetic opponent policies, CPU deadlines and instant actions. A screen is selection data; no real leaderboard or independent validation claim.

Revisit only when: Freeze a candidate and run fresh worlds, an unseen opponent field and repeated-world stability checks.

## win30-terminal-exact20 — terminal-short-word-ban (reject)

Hypothesis: Banning short words at final auction open improves score by allowing a better remaining combination.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/offline-lucent-lab/experiments/win30-terminal-partition-audit.json

Observed: 20actualWIN30finalinventories:observed294points,exactbestallowing2+294;minimum3best265;minimum4best235;minimum7best78. No missedterminalpoints across20checkedracks.

Decision: Do not treat observed endgame two-letter plays as evidence of midgame waste. Prioritize earlier acquisition and long-word opportunities. A terminal short-word ban lowers the exact feasible total on these fixed inventories.

Uncertainty: Retrospective reconstruction of own20smallracks; earlier acquisitions fixed. Does not prove globaloptimalstrategy, allotherterminalracks, or transporttiming reliability.

Revisit only when: A new reproducible case shows an invalid/nonoptimal terminal partition or a changed earlier acquisition policy; do not repeat blanket endgame short bans as an improvement claim.

## price-future-fresh256-validation — price-weighted-future-tiles (reject)

Hypothesis: Price-weighted future acquisition composition improves score and wins against WIN30 on independent worlds.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/offline-lucent-lab/experiments/win30-gain-price-validation-256-reactive-summary.json

Observed: Fresh seed881701,256 unique worlds per arm,768 matches total: BASE89.7422points/25.3906%wins; PRICE2 87.1250/24.2188%. Long-word points70.7344 ->66.9023 and long words1.7539 ->1.5703. Score delta-2.6172; win delta-1.1719pp.

Decision: Reject promotion of PRICE2: the screen improvement did not replicate, with both primary point estimates lower. Preserve the candidate and all failures; keep disabled.

Uncertainty: Synthetic reactive field, one execution per world per arm, CPU-timed search. Conditional score95CI[-6.4965,1.0276],winpp95CI[-7.0313,4.6875]. Intervals include zero; this is rejection of deployment evidence, not proof the mechanism always harms performance.

Revisit only when: Change the mechanism or supply new calibrated acquisition evidence explaining an identifiable failure; fresh seeds alone do not justify repeating this price exponent as a new improvement.

## completion-floor-first32 — unfiltered-immediate-completion-floor (reject)

Hypothesis: A bid floor for an immediately available seven-plus-letter completion improves long-word scoring and both match objectives.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/offline-lucent-lab/experiments/completion-floor-win30-screen-reactive-summary.json

Observed: 32 paired worlds: BASE83.53125points/25%wins vs FLOOR82.65625/21.875%. Seven-plus points62.71875 ->58.875. Checks2112, opportunities145, raisedBids42. Nine changed scores:4higher5lower; no gainedwins,1lostwin. World6 score102first ->48sixth, same2longwords but longpoints78 ->48.

Decision: Implementation triggers, but this unfiltered floor does not improve either primary point estimate or long-word points. Keep disabled and preserve both winning and losing worlds. Diagnose completion quality and subsequent acquisitions before another candidate.

Uncertainty: Small synthetic screen; score95CI[-6.90625,5.75078],winpp95CI[-9.375,0]. No proof of universal harm or causal identification of the world6 sequence.

Revisit only when: Trace a retained failure and change acquisition quality or timing based on the actual missed opportunity. A longer-word count or a higher bid cap alone is not evidence of better total points or wins.

## completion-floor-trace-v2 — unfiltered-immediate-completion-floor (reject)

Hypothesis: A completion floor can overvalue a cheap early seven-letter word while ignoring a better reachable word, even when it helps later cash flow.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/offline-lucent-lab/experiments/completion-floor-forensics/SUMMARY.json

Observed: All four BASE/FLOOR replays match seven recorded metrics exactly. World6 round5 AEILTU+N bids3 vs11: floor buys N for8 then ALUNITE21; baseline later plays LIQUATE48. Final102/first vs48/sixth. World9 round37 AEMOPTU+L bids6 vs12: floor buys L for9 then PLUMATE33, final101/second vs33/sixth.

Decision: Retain the rejection of an unfiltered floor. Value and remaining acquisition opportunities matter jointly; a universal minimum42 completion score would block both this harmful21-point opening and helpful33-point midgame play.

Uncertainty: Two selected, exactly reproduced synthetic trajectories; precise first divergence established but no general threshold, robust average improvement or live causal effect follows.

Revisit only when: Use a mechanism incorporating rack-specific opportunity cost and phase, with fresh worlds, stronger opponents, and long-word quality plus both main metrics. Preserve the two contrasting replay cases as regressions.

## completion-opportunity-fresh32-rejection — opportunity-aware-completion-floor (reject)

Hypothesis: A rack-specific opportunity guard makes immediate completion floors improve wins and total points.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/offline-lucent-lab/experiments/completion-opportunity-screen-reactive-summary.json

Observed: 32 paired fresh worlds: BASE95.71875points/31.25%wins/place2.875 versus GUARDED87.5625/18.75%/3.34375. Score delta-8.15625,95CI[-15.72,-1.78]; win delta-12.5pp,95CI[-25,-3.125]. Zero gained wins and four lost.

Decision: Reject promotion on both primary objectives; preserve both arms and keep the optional guard disabled. Passing two selected trajectory fixtures did not generalize.

Uncertainty: Small synthetic screen with CPU-timed searches and reactive rivals. Conditional intervals do not include simulator or selection uncertainty. No live claim.

Revisit only when: A new traced failure identifies a changed acquisition mechanism accounting for realistic costs and completion/continuation outcomes; do not simply retune this threshold on the same screen.

## cash9-min4-fresh64-rejection — four-letter-starvation-release (reject)

Hypothesis: Raising starvation threshold to9 and reducing its minimum word length to4 unlocks stalled cashflow and improves wins and points.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/offline-lucent-lab/experiments/cash-recovery-win30-screen-reactive-summary.json

Observed: Exact EFLO/cash8 fixture now releases FLOE10. Across64 paired worlds BASE83.625points/21.875%wins versus CASH9LEN4 83.0/20.3125%. Score delta-0.625,95CI[-1.578,.094]; wins-1.5625pp,95CI[-4.688,0]; zero gained wins and one lost.

Decision: Keep disabled: a correct local cash-release change did not improve either full-match primary metric in this screen. Preserve the reproduced fix and losing outcomes separately.

Uncertainty: Synthetic64-world screen, rare changed games and CPU-timed behavior. Not proof every release harms or that a liquidity problem does not exist live.

Revisit only when: Diagnose the changed-game loss and use a continuation model with remaining inventory, payments and future word opportunities; threshold-only re-screening is not a new mechanism.

## current-top5-continuation-20261108 — late-word-cycle-continuation (unproven)

Hypothesis: Winning opponents sustain useful second and later conversions through continued acquisition, while our policy frequently stalls after its opening.

Evidence: /Users/siddarthakodithyala/the scrabble bot for utd hacks/offline-lucent-lab/experiments/leader-cycle-audit-20261108/analysis.json

Observed: Frozen01:13:50UTC top5 RackMaw,LUCENT,aipom,Bron,LexForge. Audited each last20 outcomes and10 selected wins, including each top2 game. Ours20:45.15first-wordpoints,30.4second,3.75third/later;Q4 purchases0.9 versus3.0–4.75 allleaders. Zero cash/score reconciliation failures. 45219 has strictcash8+minimum5 gates;45248 hasemptyrack/cash47 and continuing but losing bids.

Decision: Separate liquidity release, late acquisition valuation and word continuation; do not diagnose every pause as a frozen client. Current LUCENT20 score76.95 is below ours79.3 despite historicalrating, so compare changing leaders and all outcomes. Prepare measured default-off adaptations.

Uncertainty: Observational selected current leaders; winning10-game samples are conditioned on wins and cannot estimate win rate. Opponent private racks/versions unknown. Matched cohorts small. No causal uplift or championship guarantee.

Revisit only when: Collect forward source-tagged game cohorts and evaluate a specific capacity/cashout/acquisition mechanism against the same-source baseline on both wins and score.
