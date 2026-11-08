# Implementation decisions and evidence

| Decision | Evidence | Limits / experiment |
| --- | --- | --- |
| Exact word membership, counts and integer reward | Official /docs and pinned submitWord/playWord/letters.ts | Current dictionary must match organizer deployment |
| Sequence planning rather than longest-word heuristic | Reproduced GEXTU and BEEGNNNVWX counterexamples; multiset partition recurrence | Exact only when bounded search finishes; timing may limit executable words |
| Budget-aware marginal bidding | Official currency/payment rules; Conitzer et al. https://arxiv.org/abs/1811.07166 | Complementarity and replenishing cash differ from paper; tune through held-out matches |
| Sampled future evaluation, optional | Silver/Veness https://proceedings.neurips.cc/paper_files/paper/2010/file/edfbe1afcf9246bb0d40eb4d8027d90f-Paper.pdf | No optimality guarantee for adaptive multiplayer opponents; ablate against simple policy |
| Correctly censored price learning | Wang et al. https://arxiv.org/abs/2304.13477 and actual auction result schema | Vickrey loss does not reveal rival maximum |
| Native SDK reconnect and consistent snapshots | Installed SDK 2.12.0 builder/connection implementation | Initial connect failures need separate handling; no live success claimed |
| Conservative action scheduler | Official reducers permit bid replacement and arbitrary valid word plays; no numeric cap found | Internal maximum two bid attempts, one pending word; event-specific restrictions remain organizer input |

| Hold length 7 over 5, with exact partition planning | Development seeds 101–112 and frozen held-out comparisons; evaluation-results.md | Parameters are empirical hypotheses, not universal optimal values |
| Retain small censored-price estimator | Held-out FirstPrice strong-field mean score +2.88, bootstrap interval [0.80,4.97] | Win-share delta +2.78 points has interval crossing zero; no claim of established win gain |
| Defer neural model and future-sampling policy | No measured incremental advantage on deadline; no training corpus required by current engine | Potential future improvement remains unexplored |
| Bound machine load and avoid unsupported socket hooks | One worker, 512 MiB Node old-space, sequential benchmarks; real SDK local smoke | No large-history live load or reconnect fault-injection evidence |
