# Opportunity-aware completion floor — isolated candidate
Never deployed. Existing ordinary MC bids and word cashout are unchanged. All switches remain off unless selected.

The unfiltered floor caused ALUNITE21 to replace the future LIQUATE48 path in a reproduced opening, but helped with PLUMATE33 in a reproduced midgame. A flat high-score cutoff would remove both. This candidate vetoes only the extra floor if another actually feasible one-tile completion has substantial availability-weighted upside.

Conditions: balance>=24; at least18future usable auctions; validated actual rack/unseen counts; alternative differs from current offered tile. P(appears) uses exact without-replacement probability on a uniformly mixed unseen pool. Suppression witness: P(appears)*(alternative word score-current completion score)>=12. This is an opportunity heuristic, NOT expected auction profit or capture probability. Unknown inventories, exhausted search, little cash or little time preserve the prior floor. Search shares the auction deadline, capped2ms/20,000operations. High-face alternatives are checked first; one feasible witness suffices.

20 focused tests and TypeScript build passed. Tests retain the ALUNITE/LIQUATE counterexample and the useful PLUMATE case, plus budget, duplicate, missing-tile and cash/time safeguards. The prepared screen is UNEXECUTED and keeps the exact WIN30 baseline. Source hash and outcomes must be frozen by the existing campaign runner. Parameters were chosen using two selected failures, so in-sample replay is not validation.

The root session owns the live runner and current heavy validation. No parallel campaign may start until the shared worker is available.
