# Implementation ledger — plan: docs/superpowers/plans/2026-11-07-local-engine.md

- User approved local implementation after final rules check; isolated copy created under the requested name, no remotes.
- Official docs fetched again; upstream main remains b5ccb36. No explicit action-count cap found. Published submitBid permits replacement, requires open auction, authenticated participation, nonnegative affordable i64 and unexpired closesAt. submitWord requires Running, A–Z, length≥2, dictionary membership and available inventory.
- Ruling: two bid attempts including retries per auction is an internal anti-spam/deadline policy, not an organizer restriction.
- Ruling: use the existing checked-in generated schema bindings locally instead of installing the CLI just for code generation; type-check the actual 2.12.0 SDK.
- Pre-flight: engine -> strategy -> controller -> simulator use the same exact reward and rack primitives; source reducer differential tests independently check rules.
- SDK inspection: automatic reconnect is opt-in and defaults false. SDK applies table updates before dispatching queued callbacks. Use native reconnect and coalesce application reactions.
- Local dependencies installed from both lockfiles; no remote module or live bot was created.

Task 1: complete — watched six assertion failures on API stubs, then all six engine tests and full bot suite (8 tests) passed; tsc passed. Server baseline: 178/178 passed. Index build is startup-only (~0.35–0.46 s).

Task 2: complete — six targeted assertions failed before implementation; all 16 bot tests and tsc now pass. Added a censored-price estimator and configurable heuristic bid/hold parameters; these are hypotheses pending Task 4 held-out evaluation.

Task 3: controller/startup tests passed after observed failures; SDK adapter compiles against 2.12.0. Independent reviewers found and tests reproduced swallowed retries, historical FirstPrice censoring, and approximate all-in noise; fixed. Idle replay barrier fixed in persistent metadata callback. Bounded replay retries use fresh inventory; server API has no idempotency key, so exactly-once cross-disconnect execution is not promised.
Resource ruling: 16 GB Mac; one test worker with 512 MB JS heap; only root runs builds/benchmarks. Three explicitly requested agents do bounded read-only reviews. Idle local server stopped (61.6 MiB RSS); memory_pressure reported 33% available.

Task 4 underway — seeded headless simulator implemented and 42 bot tests/build passed. Policies get copied own rack/public summaries only; shuffled bag and tie streams are independent. Source vs docs unsold/final-tile behavior remains configurable. Resource adjustment: begin small dev/held-out batches, expand only if runtime/uncertainty justify it; sequential simulations, no worker farm. Agents assigned disjoint validation/policy files; root alone executes checks.


Task 4: complete — simulator/policy/evaluation fixtures passed. Frozen development choices evaluated on 24 seed blocks × all seats for each of five comparisons (1,248 games), plus eight paired full tournaments. Diagnostic replays reproduced every block's scores/wins/Swiss points exactly; not counted as independent evidence. All five mean score differences positive. Price adaptation win-share interval crosses zero. Source-mode defaults retained. Production-budget quality audit shares held-out seeds and preserves strong-field advantage; no retuning. Results and protocol are checked in.

Ruling: do not add deep neural training or sampled future-search to the selected policy — no measured advantage justifies their deadline/latency/integration cost; risk is leaving potential future strength unexplored. Exact partition search plus online price estimation is the current selected system.
Ruling: follow pinned source on unsold discard and external final-tile usability, retaining explicit alternate simulator flags — source reducer fixtures establish implemented behavior; cost if live deployment differs is misvalued endgame and cash pacing until configured/updated.
Ruling: keep large-history load and reconnect fault injection as explicit validation gaps instead of introducing more machine load or unsupported SDK socket hooks — scoped subscriptions and deterministic controller tests reduce but do not eliminate deployment risk.

Task 5: complete within the recorded validation scope — 54/54 bot tests, TypeScript build and 183/183 server tests passed. Actual local SDK smoke passed on six anonymous clients, proving production discovery, won auction, private rack and score. Local server stopped. Runtime stress checked 560 racks, zero invalid actions; 12-tile combined p95 12.08 ms, 40-tile stress p95 23.44 ms, sampled peak RSS 482 MiB. One worker/512 MiB old-space and explicit local-server resource controls used. Missing large-history/reconnect-injection coverage is documented in the runbook, not claimed tested.

Final: fresh independent whole-branch review found no Critical/Important production defect. Regraded alternate-rule propagation as important for the advertised simulator configuration: AX final-tile fixture reproduced 0 instead of 9 points (RED), then observation propagation fix passed (GREEN); full suite 54/54. FirstPrice tournament forwarding regression also passed. No deferred polish findings.
Final local boundary: no Git remotes in this independent copy; original team checkout clean at 03e49c0. Tools, keys, Codex machine configuration, tokens, bundles and logs excluded. All commits stay local.


2026-11-07 follow-up: user provided secret-bearing Areeb handoff (read with JWT redaction), then explicitly authorized live takeover and confirmed sole remote runner stopped. Authenticated gh retrieved private live source b445d5f into independent odysseus-live branch (no remotes); later v2.2 params verified against9682c4a and preserved. Current active frozen checkpoint0890ce4. Original team checkout still clean. New concrete defects reproduced/fixed;26 bot tests/build,8Python fixtures and actual localSDK adapter smoke passed. Live authentication validatedbot172, bids/words/completed rated matches observed; more than five games completed. Dynamic status records current exact rating and all local results. One packaging-path interruption corrected and two bid rejections observed; network margin raised150ms, supervised recovery remains active. No zero-error or first-place guarantee.

Resource ruling: actual power check found27% battery/44minutes remaining, so paused only the heavy offline400/400 comparison group and installed an AC-aware guard; live runner remains active. One worker/max512MiB each. Ongoing experiment is a surrogate on cleaned34-match calibration subset; no automatic promotion. See LIVE-ODYSSEUS.md for runtime controls and candid limits.
