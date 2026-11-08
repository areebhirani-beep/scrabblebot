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

Combined verification: 134 TypeScript tests, 62 Python evaluation tests, 8 lab workflow tests and TypeScript build passed. Tests use existing generated bindings; regenerate them on a fresh checkout as described by the bot starter documentation. No live match test was run by the integration session.

## Follow-up acquisition screen

An opt-in training-price prior changes the composition of sampled future tiles while keeping their count unchanged. Its strongest setting (`futurePricePower: 2`) scored88.81points with37.5%wins against WIN30's84.13points/21.88% in32pairedworlds repeated3times. Mean points per seven-plus word rose38.67→44.47. Conditional paired intervals still include zero: score delta4.69[-5.56,14.19], win delta15.63pp[-3.13,34.38]. This is a validation candidate, not a proven improvement or a live deployment. All arms, frozen source and the decision remain saved. Fifteen targeted acquisition/MC/utility tests and the TypeScript build passed on the exact pinned live source plus this optional change.
