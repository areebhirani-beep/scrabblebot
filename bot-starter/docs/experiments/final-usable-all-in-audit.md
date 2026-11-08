# Experimental final-usable all-in audit

The flag finalUsableAllIn is optional and defaults off. This is an offline experiment, not a rank-dominance theorem.

Mathematical statement: for exact attainable own terminal score F(R), F(R+tile)>=F(R), since all old feasible word partitions remain available. In the current official server, spendable coins are not a final score/tie-break reward; FirstPrice changes payment, not this inventory inclusion. Raising a sealed bid weakly raises win probability under the random-tie mechanism. These facts motivate spending at the final usable auction, conditional on no future usable acquisitions and preserving an executable incumbent.

They do NOT establish unconditional improvement in realized score or rank. Counterexample: own banked score13, no playable rack, coins2; opponent holds GETTUX and bids1 for S. A legal heuristic opponent that chooses greedy GUEST after receiving S scores12, while without S it chooses GET+TUX for14. Passing wins; all-in denies S and loses. All three words are in ENABLE. This counterexample works with either pricing mechanism. It does not assume the opponent's word selection is optimal.

Other boundaries:
- Only bagLeft=1, known external-only table, valid match context and no word awaiting receipt qualify. Built-in simulated winners can play the final awarded tile inside closeAuction, so mixed tables invalidate the no-future-use premise.
- Actual all-in amount is floor(balance). Invalid letter/rack/balance fails closed.
- Random ties can still be lost. No award means no new-rack cache match, and ordinary final liquidation applies.
- Preserve the old feasible plan only under the expected POST-AWARD rack key. Otherwise selectWords may execute it before the award, violating the intended experiment.
- The 16-beam/6-word baseline is bounded and approximate; it is a feasible incumbent, not an optimal old-rack certificate. Its computation must finish without exhausting its 20ms/remaining-deadline slice before this experiment activates.
- Added inventory can change approximate search choices. Comparing against the retained incumbent prevents lower estimated total score from replacing it. This still does not guarantee all sequential word receipts arrive: a higher-total plan with more words can lose under latency.
- The existing positive-gain certificate path remains the default. Its own guarantee concerns score potential, not network delivery or rank.

Implementation: advanced.ts adds the optional flag and stores terminal plans as word arrays (including empty arrays). Existing continuation behavior applies after an award. terminal-all-in.test.ts adds seven focused cases, including the counterexample; they were written but not executed by the implementing agent.

Primary rule locations: [closeAuction and match scoring](https://github.com/clockworklabs/scrabblebot/blob/main/spacetimedb/src/game.ts), [tournament standings and tie-breaks](https://github.com/clockworklabs/scrabblebot/blob/main/spacetimedb/src/tournament.ts). Local source audit found no cash-based final tie-break.

Evaluation should compare the isolated flag with baseline on the same worlds and varied heuristic opponents, including this adversarial case. Measure score, rank, bid/payment changes and delivered terminal words. Friend remains the sole live runner.
