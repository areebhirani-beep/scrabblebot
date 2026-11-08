# Persistent improvement loop

1. **Resume memory.** Read the startup instructions and lessons; inspect the active shared worker. `python3 learning.py resume` lists rejected mechanisms and next context files.
2. **Diagnose.** Find a concrete failure and save the state/outcomes. State what observation would disprove the proposed fix. Do not equate a static-market score exceedance with match wins.
3. **Preflight.** Save a plan with mechanism family, hypothesis, baseline, both objectives, experiment config and offline-only flag. `python3 learning.py preflight PLAN.json` rejects missing baselines/objectives and unsupported repeats of rejected approaches.
4. **Change one mechanism.** Implement in this isolated source. Preserve the baseline and add a regression case drawn from the failure. Keep experimental switches disabled by default.
5. **Evaluate.** Freeze source/config/dictionary hashes. Run paired worlds under the shared one-worker limit. Screening results are exploratory. Validate a selected candidate on fresh worlds, held-out opponents and at least three executions per world; average repeats within a world rather than treating them as independent games.
6. **Decide on both outcomes.** Reject regressions, record uncertainty, and require the reviewed joint gate before changing a local incumbent. No script here deploys or changes the live bot.
7. **Remember.** Import completed artifacts into `../bot-starter/.runtime-odysseus/experiments.sqlite`; append a verdict to `decisions.jsonl`. The recorder writes `LESSONS.md`. Future preflight checks read that same ledger, so a restart does not erase rejected hypotheses.

This improves the bot policy, evaluation process and persistent context. It does not retrain the assistant's underlying model. File persistence survives sessions; unattended execution is not implied.
