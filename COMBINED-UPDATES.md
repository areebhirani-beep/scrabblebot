# Combined ScrabbleBot updates — November 7, 2026

This branch combines the two Codex sessions' bot fixes, offline experiments, evaluation tools and persistent learning records. It preserves the team's existing gain1.3/facePremium2 default. New policy candidates remain opt-in; no bot is deployed by this change.

The bot changes include faster indexed word evaluation, bounded Monte Carlo work, safer receipt-aware word/bid scheduling, scoped subscriptions and recovery handling, certified terminal improvements, an optional count-state solver, corrected reactive simulation and diagnostic telemetry. The second session adds optional priced cashout and win-utility experiments, repeated-world evaluation, a joint metric report and a persistent preflight/decision loop. An opponent-initial-tile inference helper is included as an unused offline diagnostic, with tests; it is not connected to the production tracker.

## Results and decisions

| Model and candidate | Distinct worlds | Wins including ties | Mean score | Decision |
|---|---:|---:|---:|---|
| Strong reactive field, NEUTRAL6 | 128 | 24.22% | 89.61 | Provisional offline incumbent; superiority over gain1.3 remains uncertain |
| Weaker scripted field, original baseline | 128 | 97.66% | 211.91 | Preserve as a separate field's win-rate record |
| Weaker scripted field, NEUTRAL6 | 128 | 94.53% | 219.09 | Preserve as a separate field's average-score record |
| New strong-field screen, NEUTRAL6 baseline | 32, each run 3 times | 28.13% | 94.47 | Paired reference |
| Same screen, WIN30 | 32, each run 3 times | 34.38% | 92.38 | Win/score tradeoff; no joint promotion |
| Same screen, WIN60 | 32, each run 3 times | 34.38% | 93.94 | Win/score tradeoff; no joint promotion |
| Same screen, WIN120 | 32, each run 3 times | 25.00% | 89.36 | Worse on both point estimates |

These are offline results. The high numbers against weaker opponents are not live results or predictions against LUCENT. Repeated executions are clustered by world for uncertainty; they do not triple the independent sample count. No tested candidate establishes >42% wins and >124.4 average score against the strong field.

Priced cashout was rejected after a 192-game screen. Its saved failure world changed a 140-point first place into a 90-point third place. Count-DP integration and final-auction all-in screens also failed to establish a joint gain, so their switches remain off.

## Evidence and continuation

- [Saved incumbent](bot-starter/docs/offline-incumbent.json) and [field-specific frontier](bot-starter/docs/offline-frontier.json).
- [Persistent shared lessons](LEARNINGS.md) and [lab lessons](offline-lucent-lab/LESSONS.md).
- [Experiment export manifest](bot-starter/docs/experiments/EXPORT-MANIFEST.json); reports and exact frozen sources preserve winners, losers and failed campaigns.
- [Offline improvement loop](offline-lucent-lab/SELF-IMPROVEMENT.md).

Combined verification after the completion-floor integration: 170 TypeScript tests, 70 Python evaluation tests, 8 lab workflow tests and TypeScript build passed. Tests use existing generated bindings; regenerate them on a fresh checkout as described by the bot starter documentation. No live match test was run by the integration session.

## Follow-up acquisition screen

An opt-in training-price prior changes the composition of sampled future tiles while keeping their count unchanged. Its strongest setting (`futurePricePower: 2`) scored88.81points with37.5%wins against WIN30's84.13points/21.88% in32pairedworlds repeated3times. Mean points per seven-plus word rose38.67→44.47. Conditional paired intervals still include zero: score delta4.69[-5.56,14.19], win delta15.63pp[-3.13,34.38]. This is a validation candidate, not a proven improvement or a live deployment. All arms, frozen source and the decision remain saved. Fifteen targeted acquisition/MC/utility tests and the TypeScript build passed on the exact pinned live source plus this optional change.

## Client dispatch and cache correction

Word transport begins before synchronous bid computation, while retaining receipt-based inventory protection and bounded retries. Bid-cache identity ignores a pending-word toggle when it does not change the current policy's bid semantics, avoiding an unnecessary fresh Monte Carlo evaluation/revision. Pending status remains meaningful for the penultimate-auction proof and an enabled completion floor. The live strategy remains unchanged by these client edits. Thirty-six focused client, acquisition and completion tests and the integration build passed; the live operator separately validates any assembled release before switching.

A separate exact audit found no missed terminal points in20actual WIN30 racks: observed294points equals the maximum legal partition total294. A minimum-four-letter restriction would reduce that feasible total to235. The other session independently found no playable leftover word in22completed games. Acquisition and long-word quality remain the research priority.

## Immediate seven-plus-letter completion

Across 23 matched live tables, our bot earned 69.52 points per match from seven-plus-letter words versus the winners' 96.52. This 27-point gap accounts for 90% of the observed 30-point total-score gap. These winner-conditioned observations motivate an acquisition change; they do not measure its causal improvement.

The new optional completion floor raises a bid when the currently offered tile completes a legal seven-plus-letter word from the actual rack. Its valuation subtracts the exact existing rack's liquidation score, avoiding double counting. It combines with the ordinary bid by taking the maximum, retains balance/share caps, and rejects pending word inventory, incomplete searches and final-auction cases. Search work is bounded. Live and simulated views both supply receipt state; the bid cache invalidates when receipt state changes eligibility.

The screen candidate uses `completionFloorGain: 1` and `completionFloorMaxBid: 12`. The feature is implemented with 11 regression tests and remains disabled. A full-game-lexicon probe found EQUINOX69 and JAYWALK72 within the three-millisecond budget. The subsequent 32-world screen raised42bids across145opportunities but scored82.66points/21.88%wins versus BASE83.53/25%. Long-word points fell62.72→58.88. Keep this first unfiltered floor off; preserve world6, where both policies played two long words but their combined points fell78→48. Diagnose acquisition quality before proposing a revised floor. This checkpoint does not change the running bot.

## Independent validation and retained failures

The fresh 256-world, three-arm validation completed 768 simulated matches. WIN30 scored89.74points with25.39%wins; gain1.3 scored91.59/29.30%, with both paired uncertainty intervals including zero. Price weighting scored87.13/24.22%, failing to replicate its screening improvement; promotion is rejected. Gain1.3 also lowered seven-plus-letter points70.73→66.50 despite improving total-score point estimates, so it does not establish a fix for the observed long-word gap. All arms, manifests, frozen sources and append-only decisions are archived. This run used one execution per arm per world; it does not satisfy the lab's separate three-repeat final-validation gate.

Public rating-history artifacts preserve the version transition separately from strategy effects. The retired first version had110matches,15wins and9174totalpoints. Attribution uses the game's version-at-match-creation rule; the identity of whoever initiated the version change is unknown. Do not describe the entire rating discontinuity as a strategy regression.

The exact four-case completion-floor replay reproduces the cheap early ALUNITE21 versus later LIQUATE48 failure, and the beneficial midgame PLUMATE33 acquisition. See offline-lucent-lab/forensics/completion-floor for the patch and repeatable replay. The user-supplied Odysseus Test Brief is retained with provenance; its 209-match claims are distinct from independently audited cohorts. Read-only shared-worker health reporting and eight regression tests from the other session are also integrated.

A new optional completion-opportunity guard retains the ordinary MC bid and only suppresses the extra completion floor. It requires sufficient cash/time plus a legal one-tile alternative with material availability-weighted score upside; unknown or exhausted searches retain the previous floor. The appearance calculation is a uniform-unseen-pool heuristic, not auction capture probability. Nine new tests cover the two opposing replay cases and operational bounds. The prepared 32-world screen is unexecuted; no live promotion or performance claim.

The latest public extremes audit found Waupus highest at52.82%wins/248games, but its last200matches were onOctober25; there are no current WIN30 matched tables. Bron's lifetime135.63mean contrasts with99.33in the latest200games tonight (39.5%wins). Both strongly favor high-value long words, but differing periods/fields prevent transferring their aggregate win rates to our live strategy.

The read-only rating observer refreshes every90seconds until the session deadline. It records every small positive and negative rating move with source/version, own/winner long words, quarterly purchases and spending, and available own bid-log attempts compared with archived maximum bids. Logged attempts are not reducer acknowledgments; missing/late/rejected actions remain distinct from valid bids below a rival. The saved checkpoint includes own local log correlation and is explicitly not marked public-only.

The user-requested standing workflow is now linked from root and lab startup instructions: audit every small gain and loss, preserve source/version attribution, separate execution failures from legal lost bids, compare current WR/score leaders with matched cohorts, and retain all evidence across sessions.

The rare-letter bid candidate improved fresh256-world mean score90.55→96.18 (paired95%CI for delta[2.70,8.81]) and placement2.957→2.648. Wins rose29.30%→31.64%, but their delta interval[-2.73,7.81]percentage points includes zero. Seven-plus-letter points fell69.67→66.19 as word count fell1.715→1.586; points per long word increased40.63→41.73. This is evidence of mean-score improvement in this simulator, not proof of a win-rate increase or a fix for the long-word points gap. Both the64-world screen and fresh256-world outcomes/sources are retained.
