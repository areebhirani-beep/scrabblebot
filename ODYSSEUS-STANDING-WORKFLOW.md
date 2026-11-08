# Odysseus standing improvement workflow

User-requested persistent instructions, recorded 2026-11-08 UTC. Apply these instructions whenever the same situation recurs in this ScrabbleBot project. Read them at session startup and after context compaction. New explicit user instructions and current live ownership supersede older operational directions. These instructions do not authorize unrelated account changes or a second live runner.

## After each completed match

1. Record bot 172's match ID, timestamp, deployed source/configuration hash, bot version, opponents, score, placement, rating before/after, and current-version win rate. Keep source-cohort and rolling metrics separate from lifetime totals. Check whether a version reset or stale observation explains a discontinuity.
2. Automatically flag every negative rating change and every gain from +1 through +10 for investigation. Also inspect repeated low-score games and wins with execution failures. A small gain or loss is an investigation trigger, not proof of a bug or of an achievable +10 alternative.
3. Join local bid selections, sends, acknowledgements, rejections and deadlines with completed public auction results; inspect word submissions/receipts, cash, rack composition, word timing and unused tiles. Preserve unknowns when old logs lack acknowledgements. A reducer acknowledgement does not mean an auction win.
4. Classify the evidence: execution defect; legal lost auction; random tie; valuation or allocation weakness; word-selection/continuation weakness; or opponent/rating variation. Multiple explanations may remain unresolved. Do not call every lost bid underbidding.
5. For lost auctions, compare against the highest competing bid, not merely the Vickrey price paid. A retrospective bid one coin above the observed maximum is a fixed-opponent counterfactual, not a proven optimal action: spending, later bids, reactions, future availability and private information can all change the outcome. Never leak future match data into a live decision.
6. Save the supported cause, evidence, uncertainty, candidate correction and evaluation outcome. Fix reproducible execution defects promptly with a regression check. Evaluate strategic changes against the incumbent before live deployment; do not change parameters blindly after each loss.

## Compare the competitors that matter

- Track the current rating leader, the highest-win-rate teams with adequate samples, and the highest-average-score teams. Include GodOfThudner when identifiable from public data. Refresh rather than assume a historical leader is still first.
- Report sample size, version, date range, seat count, opponent mix and provisional status. Prefer recent matched tables or comparable fields. Do not compare a historical lifetime average with our current-source cohort as if conditions were equal.
- Look for shared mechanisms: points per seven-plus-letter word, high-face letters actually converted into words, first-word timing/quality, acquisition costs, cash starvation, leftovers and placement distribution. Reconstruct plausible causes from available public information; do not claim to know private opponent code or racks.
- Win rate is a primary objective alongside score and placement. Preserve improvements that help competitive placement, but report win-rate uncertainty explicitly. Rating is not cumulative word score, and no policy can guarantee a positive change every match.

## Turn findings into measured improvements

- Use the actual official engine/rules and deployment settings. Exact dictionary legality and scoring come before heuristics. Distinguish Vickrey from first-price auctions and external-client endgame timing from server-simulated bots.
- State a falsifiable mechanism and preselect candidate/configuration and success metrics. Run paired worlds against the current relevant baseline, then fresh held-out seeds and appropriate opponent stress cases. Keep tuning, validation and live evidence separate.
- Preserve all campaigns, including failures, in the experiment database and learning ledger. Do not retry an unchanged rejected idea without a new mechanism, dataset or specific explanation. Read prior lessons before starting another search.
- Synthetic win rate is not a calibrated forecast of live win rate. Report conditional intervals, sample counts, selection effects, simulator limitations and wall-clock search effects. Prefer useful evidence over search or simulation volume.
- Prepare tested immutable releases and rollback checkpoints. The current live owner alone may deploy between matches. Record the exact activation time/hash, then collect a forward source-tagged live cohort; do not reset the bot version/rating to evaluate it.

## Collaboration, resources and reporting

- Read `bot-starter/.runtime-odysseus/live-ownership.json` and the latest user instruction before any live action. Keep exactly one authorized live runner. Cross-session handoffs do not transfer ownership implicitly.
- Share the user's priorities, supported findings, failed hypotheses and candidate evidence with the other authorized session. Maintain `ODYSSEUS-OFFLINE-HANDOFF.md`; include this workflow in future handoffs.
- Share the existing `offlineworker.lock` across sessions. Use one heavy offline worker with the existing memory/power controls; specialist agents may perform bounded independent research and named-file edits. Do not overload the MacBook to increase experiment count.
- During active work, give approximately minute-by-minute verified updates: live timestamp/rating/rank/wins and offline sample counts/results, deployment state and next discriminating check. Label stale or unavailable observations. Never promise first place or continuous monitoring beyond an actually running session/process.
- Keep tokens out of logs, reports, commits and messages. Root remains local-only; the separately authorized integration session owns its GitHub push. Preserve the original checkout.

## Durable entry points

- Workspace `AGENTS.md` and the active bot checkout's `AGENTS.md` link here.
- `LEARNINGS.md` and `bot-starter/docs/lessons.jsonl` preserve evidence-based lessons.
- `ODYSSEUS-OFFLINE-HANDOFF.md` preserves session state; `.runtime-odysseus` stores source-tagged artifacts.
- Another session must open this workspace or receive these files to inherit the instructions. This file is project memory, not a claim of account-wide automatic memory.

Integration copy: generated from the shared workspace workflow. The original workspace retains its odysseus-live path and sole live operator. This repository copy does not transfer live ownership.
