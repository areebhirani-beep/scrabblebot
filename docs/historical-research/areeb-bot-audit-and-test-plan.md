# Areeb bot: strengths, defects, improvements, and test plan

Audit target: published team commit `9815242b4ec72cef3f43208189947eb05c265a0f`.
Remote `main` was rechecked during this audit and still pointed at that commit.
No bot behavior was changed. Tests below run offline without the SDK or network.
The full [proposed design](../superpowers/specs/2026-11-07-scrabblebot-design.md)
and [rules evidence](2026-11-07-rules-and-baseline.md) remain the broader references.

## Strengths to preserve

1. **Deterministic local decisions.** No LLM or network lookup on the bidding
   path. The sampled rack searches completed comfortably within a one-second
   auction on this machine, though worst-case timing and callback latency still
   need measurement.
2. **Correct tile multiplicities.** `strategy.ts:56` counts repeated letters.
   It will not spell TREE from TRE. Dictionary-driven selection avoids invented
   words, provided the dictionary matches the deployed server and the rack
   snapshot remains current.
3. **Safe baseline bid bounds.** `strategy.ts:20` limits bids to available balance
   and skips at zero. Tests verified integer bounds for all 26 letters across
   balances 0, 1, 5, and 100.
4. **Useful separation.** Strategy functions are separate from connection code;
   host/database/name/token configuration supports independent test environments.
   Keep this structure and add explicit richer strategy contexts.
5. **Existing lifecycle foundation.** Credential resolution, token persistence,
   tournament registration, lobby entry, and bootstrap processing of existing
   auctions/racks are implemented. Reducer promise failures are caught and logged.
   These are useful starting points, though logging alone is not recovery.
6. **Rules-compatible starting material.** Shared wordlist and TypeScript stack,
   strict compiler settings, and the server's existing reducer test harness give
   us a practical path to validate a stronger external bot without a rewrite.

## Findings, in priority order

| ID | Evidence | Consequence | Improvement | Verification |
| --- | --- | --- | --- | --- |
| C1 | `index.ts:155`: attempts within 500 ms return; no queued retry | A rack can become playable inside that window and remain idle until another event | Coalesce events; keep a pending reconsideration and a scheduled retry | Reproduced with CA becoming CAT 100 ms after a no-word attempt; no word or timer is created |
| C2 | `index.ts:222`: handles rack insertion/update, not deletion | A successful play can leave another word untouched with no trigger to submit it | Handle deletes/own word confirmations and drain executable plans against fresh inventory | Reproduced CATDOG → CAT → remaining DOG with only deletion events |
| C3 | `index.ts:163`: no word-in-flight state | A delayed first word can be sent again after the throttle expires | Track per-match pending submission and confirmed rack/version before another play | Reproduced two pending CAT submissions 600 ms apart |
| C4 | `index.ts:136`: bid deduplication is set before success and never cleared on rejection | A temporary rejection suppresses another attempt even while the auction remains open | Track pending/accepted/failed states; bounded retries before expiry | Reproduced first rejected E bid followed by suppressed second attempt |
| C5 | `index.ts:300`: disconnect callback only logs | No application-level reconnect/rebuild path exists | Add bounded reconnect/backoff and resubscribe/reconstruct current state | Mock disconnect schedules no reconnection and builds only one connection; real SDK behavior remains to be integration-tested |
| C6 | `index.ts:59`: absent wordlist becomes `[]` silently | Bot can keep buying letters while being unable to select any word | Fail startup clearly; validate dictionary path, count, and expected hash | Reproduced zero playable words while a bid is still submitted |
| S1 | `strategy.ts:49`: first spellable word in length order | Longer or alphabetically earlier words can earn fewer points | Enumerate exact rewards; evaluate leftovers and multiple disjoint plays | Full dictionary: GEXTU chooses GET (4), while TUX earns 10 |
| S2 | `strategy.ts:20`: bid uses only face value and whether that letter is already owned | Overvalues unusable expensive letters; undervalues crucial common letters and necessary duplicates | Marginal continuation value, completion opportunities, rack balance, prices, and remaining horizon | Golden contexts plus seeded matches; no win-rate improvement has yet been demonstrated |
| S3 | Bid/word contexts omit auction type, time, opponents, and remaining tiles | Cannot adapt FirstPrice/Vickrey payment, bankroll, or late-game liquidation | Add explicit match context; separate auction policies; shrink cash reserve near the end | Same rack under both auction types, early/late horizons, low/high cash, and different opponent prices |
| S4 | Word selection always plays the available choice immediately | Small plays can destroy long-word opportunities; waiting too long can starve cash | Compare play-now against bounded waiting/continuation estimates | Controlled future scenarios, then held-out matches including loss of the hoped-for letter |
| C7 | `index.ts:217`: all-table subscription; repeated `.iter()` scans | State load and callback work grow with historical matches | Subscribe to relevant state; index/cache participants and active rack; prune ended state | Replay identical active events with 0, 10,000, and 25,000 unrelated historical rows; compare CPU/memory |
| C8 | No participant-balance reconsideration callback or local expiry check | Word income may not fund a revised bid during an already open auction; late callbacks send expired attempts | Reconsider open auction after own income; use measured deadline margin and stale-result guards | Income arrives after initial zero-cash decision; CPU stall; worker result arrives after auction closes |
| C9 | `index.ts:188`: nonce claim is checked after a fixed one-second timeout | A valid claim delayed beyond that window can cause premature exit | Bootstrap on confirmed credential arrival; use a real timeout and error outcome | Delay credential arrival below/above one second; test rejection and eventual success |

C1–C6 have executable offline reproductions. S1 has a full-dictionary
counterexample and the prior 300-rack benchmark. S2–S4 are strategy limitations
visible in the inputs/control flow; their proposed remedies need experiments.
C7–C9 have code evidence but do not yet have full SDK/event-load reproductions.
Mocks establish what the application does under the supplied event sequences;
they do not establish how often those sequences occur on the live deployment.

Even replacing longest-word selection with highest single reward is incomplete.
For the real dictionary and rack `BEEGNNNVWX`, the best single reward is 18
(`NGWEE`), while disjoint `VEX` (13) and `WEB` (8) yield 21. A liquidation planner
should optimize executable word sequences, subject to the remaining time for
multiple reducer round trips. This is a concrete counterexample, not a claim
that immediate liquidation is always the best early-game strategy.

## What can be tested right now

From the repository root, with the installed Node 24:

```sh
node --test docs/research/audit-current-bot.mjs
node docs/research/measure-starter.mjs
```

The audit suite checks two strengths, two scoring counterexamples, and six client
failure modes. It deliberately asserts the current defective behavior so the
reproductions are deterministic. Passing this suite means the audit findings
were reproduced; it does **not** mean those defects are fixed. Turn each into
a desired-behavior regression test when implementing the corresponding fix.

The benchmark samples 100 racks each of size 5/8/12 from the real bag, seed
20261107. Existing results: 19/34/63 below-best-immediate-score choices. It is
an immediate-score comparison, not a complete game, and the sampled racks are
not distributed according to an actual bidding policy. Runtime varies with
machine load. Preserve its source baseline before modifying strategy code.

## Tests to add as implementation proceeds

| Layer | Cases | Pass evidence |
| --- | --- | --- |
| Exact legality/scoring | Empty/no-word racks, all vowels/consonants, repeated letters, rare letters, equal rewards, dictionary normalization, all multiplier boundaries and integer rounding | Every chosen word is in the exact dictionary, tile counts never go negative, reward agrees with server integer arithmetic |
| Search oracle | Exhaustive small-rack states over restricted alphabets; randomized full-alphabet racks; known multiword traps | Candidate enumeration and completed DP match an independent brute-force oracle; time-limited results are marked approximate |
| Bid contract | Both auction types, no cash/one cash, useful duplicate, useless face-value premium, completion tile, early/mid/late game, equal bids, no competing bids | Integers in bounds, correct payment assumptions, explicit deadline handling, no claim that one fixed heuristic is optimal |
| Client state | The six reproduced failures; multiple callbacks in one transaction; own balance update; missing/reordered/duplicate history; slow reducer response; ended match | One pending word per match, confirmed inventory use, bounded retry, stale results discarded, recovery without duplicate live clients |
| Server integration | Existing reducer tests for auction validation, ties, scoring, views, tournament progression, and match end; add disputed edge cases | Simulator transitions agree with the checked module harness and competition-matched configuration |
| Performance | Cold/warm dictionary, large and pathological racks, callback bursts, large history, CPU contention, worker timeout | p50/p95/p99/max CPU and event-loop delay reported separately from network latency; proposed normal-decision p95 target <20 ms, bounded fallback always available |
| Competitive play | Untouched starter, actual teammate bot, score-greedy, completion-aware, aggressive, conservative, adaptive, and prior candidate policies; mixed 2/3/6-player tables | Held-out paired outcomes with uncertainty; no hidden-state leakage; no tuning on final evaluation seeds |
| Tournament | Swiss placement, last-place elimination, three-game aggregate finals, ties, reconnect between games | Advancement/survival and aggregate-score results reflect the documented format, rather than Elo or a single raw-score average |

For search tests, retain separate independent oracle code. Comparing two wrappers
around the same algorithm is not a useful correctness check. Since unlimited
racks make exact partition search potentially expensive, test timeouts and
approximation flags as deliberately as exact cases.

For competitive evaluation, use the same initial deals/bag orders for paired
candidates and rotate seats. Start with 200 development seeds; target 1,000
held-out seed blocks per important matchup if runtime permits. Resample whole
seed blocks, including their paired games/seat rotations, for confidence
intervals. Record tied-first frequency as well as fractional first-place share.
Include our best prior version in the opponent pool to limit overfitting to weak
starters. Tune stage-specific objectives: Swiss placement points, elimination
survival, and final aggregate score difference.

A simulated policy sees only its actual observation history. The simulator may
know all racks and the shuffled bag internally; policies must not receive them.
Model prices as partially observed, and charge for letters won in future rolls.
An evaluation in which our bot gets every desired future letter for free would
give misleading results.

## Build and integration workflow after implementation approval

This checkout currently lacks bot-specific generated bindings, dependencies,
and the `spacetime` executable on PATH. The research tests above need none of
those. The normal strategy build/test workflow, once the official CLI is available:

```sh
cd bot-starter
npm ci
npm run generate
npm run build
npm test
```

The existing server tests run separately:

```sh
npm ci --prefix spacetimedb
npm test --prefix spacetimedb
```

Those commands are documented here and have not been run during this audit.
Install from the lockfiles. Match the CLI/SDK to the module; generated bindings
alone do not prove the production server is the same version.

For a real client smoke test, publish the unmodified official module into an
explicit local test server or verify the user-supplied `locki-w91bw` database is
an appropriate isolated target. Point a test bot there through `STDB_HOST` and
`STDB_DB`; use test credentials. Verify actual subscribe/acknowledgment/reconnect
semantics before treating mock reproductions as a full end-to-end test. Reconcile
the docs/code differences about unsold tiles and the final auction against the
organizer's authoritative competition behavior. The new headless simulator and
live smoke test are proposed work, not existing capabilities.

## Recommended work order

1. Preserve the untouched baseline and locate the team's actual customized code.
2. Repair client recovery, inventory sequencing, and startup validation; prove
   them with desired-behavior regression tests.
3. Add exact reward/candidate/sequence planning, with bounded work and an oracle.
4. Build and validate the seeded simulator; benchmark a simple phase-aware bidder.
5. Add opponent price estimates and bounded rollouts one at a time; retain each
   only if its ablation improves held-out outcomes at the same compute budget.
6. Experiment with offline learned rack values only after a tested candidate is
   ready. A model must beat search-only under the same evaluation conditions.

The audit can cover these mechanics and failure classes systematically. It cannot
prove superiority in every hidden state or against every future opponent.
Implementation and local testing remain pending approval of the proposed design;
all commits stay local until the user says the work is finished.
