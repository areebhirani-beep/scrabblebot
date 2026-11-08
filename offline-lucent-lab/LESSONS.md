# Persistent experiment lessons

Read this before proposing an experiment. These are evidence-scoped decisions, not universal claims.

Shared experiment provenance: `../bot-starter/.runtime-odysseus/experiments.sqlite`.

## cash-rollout-screen-20261107-v1 — one-step-priced-cashout (reject)

Hypothesis: Cashing a 4–6-letter word when it funds more sampled future tiles improves both wins and score.

Evidence: ../bot-starter/docs/experiments/lucentlab-cash-screen-reactive-summary.json

Observed: 48 paired worlds per arm, 192 matches total, 24 MC samples. BASE64.5417 points/12.5% wins incl ties; COST8/COST12 63.5/10.4167%; COST16 63.3333/10.4167%. COST8 changed one world, losing 50 points and one first place.

Decision: Keep default disabled. None of the three assumed-price candidates improves either primary outcome in this screen. Do not rerun price tweaks as a new improvement without a changed mechanism or calibrated evidence.

Uncertainty: Exploratory screen, only 1–2 changed worlds, conditional score CI reaches zero. This rejects promotion, not all possible priced cashout policies. Opponents are synthetic and instant receipts are idealized.

Revisit only when: Use a complete short-horizon auction rollout with explicit future payments and receipt-aware income, or provide new calibrated prices and a concrete failure reproduction. Then evaluate against stronger gain1.3/1.6 incumbents as well.

## cash-rollout-trace-20261107-v2 — one-step-priced-cashout (reject)

Hypothesis: Cashing a 4–6-letter word when it funds more sampled future tiles improves both wins and score.

Evidence: ../bot-starter/docs/experiments/lucentlab-cash-screen-reactive-summary.json

Observed: Replayed paired world21, same seed11072941: BASE140/first/17tiles/27endcash; COST8 90/third/8tiles/76endcash. At bagLeft29, rackADEEHLOWYZ, balance16, policy sold WHEEZY after estimating +4.5 points (SE1.3229) across8 samples, assuming affordable future draws2->3. Trace saved experiments/cash-trace-COST8.log.

Decision: The extra cash did not turn into additional winning acquisitions in this world. Keep the one-step priced-draw policy disabled; preserve this regression world for future cashout experiments.

Uncertainty: One deterministic paired synthetic world; timing-sensitive search and reacting rivals. The realized -50-point delta does not prove all shorter cashouts are harmful.

Revisit only when: Use a complete short-horizon auction rollout with explicit future payments and receipt-aware income, or provide new calibrated prices and a concrete failure reproduction. Then evaluate against stronger gain1.3/1.6 incumbents as well.

## lucentlab-win-from-neutral-screen — training-prior-win-utility (unproven)

Hypothesis: A monotone points-plus-win-boundary objective increases conversion of competitive positions into first places while retaining average points.

Evidence: ../bot-starter/docs/experiments/lucentlab-win-from-neutral-screen-reactive-summary.json

Observed: live/BASE: trials=96, uniqueWorlds=32, score=94.4688, winsIncludingTies=28.1250%; live/WIN30: trials=96, uniqueWorlds=32, score=92.3750, winsIncludingTies=34.3750%; live/WIN60: trials=96, uniqueWorlds=32, score=93.9375, winsIncludingTies=34.3750%; live/WIN120: trials=96, uniqueWorlds=32, score=89.3646, winsIncludingTies=25.0000%

Decision: Screen nominates possibilities only. Review paired intervals, opponent robustness and three-repeat held-out checks before selecting an offline incumbent.

Uncertainty: Synthetic opponent policies, CPU deadlines and instant actions. A screen is selection data; no real leaderboard or independent validation claim.

Revisit only when: Freeze a candidate and run fresh worlds, an unseen opponent field and repeated-world stability checks.

## lucent-seven-letter-public-200 — long-word-completion-throughput (unproven)

Hypothesis: Repeated high-value seven-letter completions are associated with strong live outcomes and can guide a tested acquisition policy.

Evidence: experiments/lucent-word-length-pattern-200.json

Observed: LUCENT200publicmatches:46.5%wins122.74points;exact7supplies68.38%score;7+86.66%;92of93winscontainexact7,all93contain7+. Matched53:1.717longwordsLUCENTvs1.660ours.

Decision: Prioritize long-word frequency and value in new paired experiments. Existing cashLen7 and full lexicon already cover long words; no policy promotion from observational data.

Uncertainty: Changing versions/opponent mix; selected recent matches; correlations and winner-conditioned summaries do not identify causal effects or predict130–140mean.

Revisit only when: Test a concrete acquisition/completion mechanism against the current live policy on joint score and win outcomes; retain long-word diagnostics.

## lucentlab-win30-price-future-screen — price-weighted-future-tiles (unproven)

Hypothesis: Discounting expensive letters in sampled future acquisitions values current opportunities more realistically and improves wins plus score against current WIN30. Keep horizon unchanged to isolate composition.

Evidence: ../bot-starter/docs/experiments/lucentlab-win30-price-future-screen-reactive-summary.json

Observed: live/BASE: trials=96, uniqueWorlds=32, score=84.1250, winsIncludingTies=21.8750%; live/PRICE05: trials=96, uniqueWorlds=32, score=85.3438, winsIncludingTies=21.8750%; live/PRICE1: trials=96, uniqueWorlds=32, score=85.1979, winsIncludingTies=31.2500%; live/PRICE2: trials=96, uniqueWorlds=32, score=88.8125, winsIncludingTies=37.5000%

Decision: Screen nominates possibilities only. Review paired intervals, opponent robustness and three-repeat held-out checks before selecting an offline incumbent.

Uncertainty: Synthetic opponent policies, CPU deadlines and instant actions. A screen is selection data; no real leaderboard or independent validation claim.

Revisit only when: Freeze a candidate and run fresh worlds, an unseen opponent field and repeated-world stability checks.

## win30-terminal-exact20 — terminal-short-word-ban (reject)

Hypothesis: Banning short words at final auction open improves score by allowing a better remaining combination.

Evidence: experiments/win30-terminal-partition-audit.json

Observed: 20actualWIN30finalinventories:observed294points,exactbestallowing2+294;minimum3best265;minimum4best235;minimum7best78. No missedterminalpoints across20checkedracks.

Decision: Do not treat observed endgame two-letter plays as evidence of midgame waste. Prioritize earlier acquisition and long-word opportunities. A terminal short-word ban lowers the exact feasible total on these fixed inventories.

Uncertainty: Retrospective reconstruction of own20smallracks; earlier acquisitions fixed. Does not prove globaloptimalstrategy, allotherterminalracks, or transporttiming reliability.

Revisit only when: A new reproducible case shows an invalid/nonoptimal terminal partition or a changed earlier acquisition policy; do not repeat blanket endgame short bans as an improvement claim.

## price-future-fresh256-validation — price-weighted-future-tiles (reject)

Hypothesis: Price-weighted future acquisition composition improves score and wins against WIN30 on independent worlds.

Evidence: ../bot-starter/docs/experiments/win30-gain-price-validation-256-reactive-summary.json

Observed: Fresh seed881701,256 unique worlds per arm,768 matches total: BASE89.7422points/25.3906%wins; PRICE2 87.1250/24.2188%. Long-word points70.7344 ->66.9023 and long words1.7539 ->1.5703. Score delta-2.6172; win delta-1.1719pp.

Decision: Reject promotion of PRICE2: the screen improvement did not replicate, with both primary point estimates lower. Preserve the candidate and all failures; keep disabled.

Uncertainty: Synthetic reactive field, one execution per world per arm, CPU-timed search. Conditional score95CI[-6.4965,1.0276],winpp95CI[-7.0313,4.6875]. Intervals include zero; this is rejection of deployment evidence, not proof the mechanism always harms performance.

Revisit only when: Change the mechanism or supply new calibrated acquisition evidence explaining an identifiable failure; fresh seeds alone do not justify repeating this price exponent as a new improvement.

## completion-floor-first32 — unfiltered-immediate-completion-floor (reject)

Hypothesis: A bid floor for an immediately available seven-plus-letter completion improves long-word scoring and both match objectives.

Evidence: ../bot-starter/docs/experiments/completion-floor-win30-screen-reactive-summary.json

Observed: 32 paired worlds: BASE83.53125points/25%wins vs FLOOR82.65625/21.875%. Seven-plus points62.71875 ->58.875. Checks2112, opportunities145, raisedBids42. Nine changed scores:4higher5lower; no gainedwins,1lostwin. World6 score102first ->48sixth, same2longwords but longpoints78 ->48.

Decision: Implementation triggers, but this unfiltered floor does not improve either primary point estimate or long-word points. Keep disabled and preserve both winning and losing worlds. Diagnose completion quality and subsequent acquisitions before another candidate.

Uncertainty: Small synthetic screen; score95CI[-6.90625,5.75078],winpp95CI[-9.375,0]. No proof of universal harm or causal identification of the world6 sequence.

Revisit only when: Trace a retained failure and change acquisition quality or timing based on the actual missed opportunity. A longer-word count or a higher bid cap alone is not evidence of better total points or wins.
