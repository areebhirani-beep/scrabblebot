# Local evaluation results — 2026-11-07

See [frozen protocol](evaluation-protocol.md) for seeds, opponents, assumptions and limitations. Five comparisons use 24 independent seed blocks each, all seats rotated: 1,248 games. Scores, wins and Swiss outcomes replayed identically when adding omitted cash/rack diagnostic metrics; repeated games are not additional independent evidence. No policy was changed after the protocol freeze.

| Comparison | First-place share, candidate / reference | Paired score gain [95% seed-block bootstrap interval] | Unused tiles, candidate / reference |
| --- | --- | --- | --- |
| [Mixed field, Vickrey; starter reference](heldout-starter.json) | 100.0% / 0.0% | +163.9 [157.1, 170.6] | 0.22 / 4.79 |
| [Strong field, Vickrey; immediate-word reference](heldout-completion.json) | 74.3% / 0.0% | +93.8 [88.4, 98.8] | 0.11 / 0.12 |
| [Mixed field, FirstPrice; starter reference](heldout-firstprice.json) | 91.7% / 0.9% | +83.1 [79.5, 86.6] | 0.38 / 5.29 |
| [Two players, Vickrey; hold-5 reference](heldout-duel.json) | 87.5% / 50.0% | +59.0 [47.6, 69.6] | 0.94 / 0.71 |
| [Strong field, FirstPrice; frozen-price reference](heldout-price.json) | 69.8% / 67.0% | +2.9 [0.8, 5.0] | 0.13 / 0.12 |

These are replacement comparisons against fixed opponents, not candidate and reference sharing the same match. Win shares split ties. Intervals are exploratory per comparison, without multiple-comparison adjustment; bootstrap intervals can collapse on constant observed outcomes and do not establish certainty. The price-learning score effect is positive in this sample, but its win-share difference interval crosses zero. No tournament-wide win probability can be inferred.

Eight paired 12-entrant tournament simulations: candidate won 6/8; starter replacement won 0/8. This tiny heuristic field is exploratory, with full Swiss/cut/elimination/aggregate-final logic, not evidence against real entrants. The counterfactual roster changes can alter later Swiss pairings as intended.

A follow-up audit enabled production wall-clock search budgets on the same strong-field seeds (no tuning): first-place share 73.6%, versus 0% for the immediate-word replacement, mean score advantage +93.5. See [runtime-quality-strong.json](runtime-quality-strong.json). This shares the original seeds and is not extra independent evidence; timing makes exact replay hardware dependent.

The [production runtime benchmark](runtime-benchmark.json) checked 560 synthetic racks and repeated decisions, with zero invalid proposed actions. Index startup 417 ms on this run. Combined bid + word first-pass p95: 0.28 ms at 5 tiles, 3.45 ms at 8, 12.08 ms at 12; 40-tile stress p95 23.44 ms and observed maximum 32.86 ms. These are soft budgets, not real-time guarantees. Sampled peak RSS 482 MiB. Node old-space limited to 512 MiB; one process/worker at a time. OS and GC timing can vary.

Verification: 54/54 bot tests and TypeScript build; 183/183 server tests (including five new differential fixtures). The actual SDK 2.12.0 smoke on anonymous loopback bots verified credential claim, production discovery/subscriptions, won auction, private rack and positive score. It passed before the server was stopped. Raw log is local and ignored; reconnect fault injection and large historical deployment load were not exercised. Controller replay/retry behavior has deterministic unit coverage.

A fresh independent final review found no Critical/Important production defect. Its alternate-final-tile simulator propagation finding was reproduced by a failing AX fixture and fixed (RED→GREEN). FirstPrice tournament-mode propagation also has a regression fixture.

The bot uses only its own rack and public auction results. Exact dictionary legality/reward are distinct from heuristic strategy: incomplete searches return legal lower bounds, and marginal bids use only fully solved base/acquired plans. No neural training, future particle search or live model/API inference was retained. The tested combined policy and word-holding variants have measured benefits here; global optimality and first prize are not established.
