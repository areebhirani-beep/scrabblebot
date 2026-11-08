# Frozen evaluation protocol — 2026-11-07

Frozen before reading held-out output: candidate uses hold length 7, exact bounded partition planning, completion marginal coefficient 0.8, unchanged pacing constants, censored price updates. Development seeds 101–112 only. No deep model or additional future-sampling policy selected: no dataset or measured advantage justifies that latency/complexity on this deadline. This is a bounded search plus online price-estimation system, not a trained neural model.

Run sequentially, nice 15, one process, 512 MiB JS heap:

| File | Seeds | Opponents | Reference | Auction |
| --- | --- | --- | --- | --- |
| heldout-starter | 10001–10024 | mixed six-player | original starter | Vickrey |
| heldout-completion | 20001–20024 | strong six-player | completion bids + immediate best word | Vickrey |
| heldout-firstprice | 30001–30024 | mixed six-player | original starter | FirstPrice |
| heldout-duel | 40001–40024 | patient two-player | hold length 5 | Vickrey |
| heldout-price | 50001–50024 | strong six-player | frozen price prior | FirstPrice |

All seats rotated, candidate/reference share each exogenous seed, models reset every match. 24 independent seed blocks per comparison; 2000 fixed-seed percentile bootstrap resamples whole blocks. These are per-comparison exploratory intervals, without family-wise correction. Ties get fractional first-place share; Swiss points retain shared higher placement. Eight paired 12-entrant tournaments with seeds 10001–10008 are exploratory only, using official phase aggregation. No optional stopping or tuning on these results.

Simulator uses the pinned source rules: unsold discard, no external post-award final-tile word, five initial tiles, 100 cash. Equal idealized word windows allow three acknowledged words before bids; no network/SDK/deadline model. This is favorable timing compared with the asynchronous deployed controller. Results establish relative policy performance under those assumptions, not real tournament win probability. Opponents are specified heuristics, not unknown entrants. Starter's choices are preserved but its scan is accelerated and transport bugs are absent, making it a stronger comparison than the unmodified runtime.

Shared public dictionary caches and deterministic operation caps ensure reproducibility. Simulation decision timings have cache/order bias and are not deployed latency claims. A separate runtime benchmark uses production wall-clock budgets on 5/8/12/18/24/40/68-tile racks, reporting first-pass and repeated-call distributions. The SDK check uses only an anonymous disposable loopback database. It exercises actual subscriptions/actions but not reconnect fault injection.

Follow-up validation, not additional independent evidence: after the frozen deterministic runs, repeated the strong-field comparison on the same seeds with production wall-clock budgets (`--runtime=1`), without tuning. Replayed all deterministic blocks only to record missing cash/rack diagnostics and asserted identical scores/wins/Swiss values.
