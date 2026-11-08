# Bot and offline evaluation

Read the repository's `AGENTS.md`, `LEARNINGS.md`, `docs/offline-incumbent.json` and `../offline-lucent-lab/LESSONS.md` first.

Keep the team's `TUNED_ADV` gain1.3/facePremium2 baseline unless a user explicitly selects a reviewed candidate. Optional policy experiments are disabled by default. Statistical evidence from the synthetic model does not establish live win probability.

Use `tools/reactive_compare.py` for paired reactive comparisons and `tools/experiment_store.py` for append-only provenance. `tools/update_learning.py` maintains persistent lessons. Respect the shared offline-worker lock, the power guard and 512 MiB Node old-space bound. Do not run parallel test or benchmark farms.

Runtime credentials and identity files are local only. A single user-authorized runner may own a bot identity; never start one as a side effect of tests, imports, pushes or offline experiments.
