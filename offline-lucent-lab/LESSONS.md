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
