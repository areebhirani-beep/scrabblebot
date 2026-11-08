# Price-bounded small-rack restart candidate

Prepared from the immutable client-only WIN30 release1563a4e. No live process or simulation was started by this lab. The root live owner owns the evaluation queue and deployment.

`fundedRestart` is omitted by default. When explicitly enabled, six-player late states with a scored word, no word pending, and0–2 rack tiles can increase Monte Carlo future draws. The candidate uses the median of the last16 positive CLOSED auction payments (at least8 required), rounds estimated cost upward, reserves one acquisition for the current tile, and funds extra draws only from current cash. It excludes the unusable final award, caps capture at one third of remaining usable auctions and caps added lookahead at6. It does not lower the incumbent horizon or change cashout, bid gain, premium, terminal handling or other table sizes.

These are modeling bounds, not guaranteed auction-win probabilities or a guarantee that the median applies to the offered letter. Prices can rise, rare letters can cost more, and rival responses can invalidate the assumed market. No future word income is credited. The capture cap is an explicit hypothesis chosen before the screen, not fitted to outcomes.

The important negative regression is match45248: actual empty rack, cash47, bagLeft18, score84. The last16 observed payments before that state were10,19,10,15,30,10,10,11,10,14,13,22,10,9,11,16, median11. Current purchase plus3 future purchases already costs44 under this estimate. The candidate therefore leaves the baseline3 unchanged. It does NOT claim to fix that exact match. With66 coins and the same conditions, up to5 additional acquisitions plus the current purchase fit the estimate; the candidate explores that cash-rich case.

Public client wiring uses closed results in auction-ID order. Simulator wiring appends paid prices only after each auction resolves. Cache identity includes pending inventory and observed prices only when the feature is enabled. The default cache key remains byte-for-byte equivalent.

Validation:16 focused tests passed and TypeScript build passed. Tests include the actual47-coin limitation, funded boundary66/65, price sensitivity, invalid/unknown/pending inputs, unsupported seat/phase conditions, broad cost/capture invariants and AdvancedBot integration. The initial dependency symlink was incorrect, then corrected before tests ran successfully. No outcome improvement is claimed.

Plan: `../experiments/funded-restart-plan.json`; paired64 screen: `../experiments/funded-restart-screen.json`, seed11076217. Preflight passed. Full dictionary included with source manifest. Only the root may run the shared worker. The immutable parent profile is in PARENT.json; keep both BASE and FUNDED_RESTART arms on this same source. Compare full-game wins, score, placement, useful acquisitions and terminal cash; a larger horizon or purchase count alone is not a win.
