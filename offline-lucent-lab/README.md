# Offline improvement lab

Target: improve match wins and mean score together, with >42% wins and >124.4 points as the user's original comparison. The live goal is a 2600 rating. Offline win rate does not determine a live rating.

This folder contains the second session's offline evaluation workflow. Bot source is in `../bot-starter`; historical frozen sources and reports are in `../bot-starter/docs/experiments`. The live operator owns any live release. These scripts never start or deploy a live bot.

## Resume and evaluate

Run commands from this directory. Read `LESSONS.md`, `RECORDS.json` and `SELF-IMPROVEMENT.md` first. `python3 learning.py resume` prints the saved context. `python3 run_campaign.py experiments/win-plan.json` runs one finite campaign, records its source and results, appends its decision, and refreshes lessons. Use a new campaign prefix and fresh seeds for a new experiment; retained campaigns must not be overwritten.

Only one heavy worker may run on the machine. Campaigns use `../bot-starter/.runtime-odysseus/offlineworker.lock`, freeze the source, remove credential environment variables, enforce a 512 MiB Node old-space cap and respect the battery guard. Coordinate ownership with the live session before starting a worker. The bot's dependencies and generated bindings must be available as described in its README.

## Results

The priced cashout screen was rejected: in saved failure world 21, a 140-point first place became a 90-point third place. The win-utility screen increased wins from 28.13% to 34.38% across 32 distinct worlds but reduced mean score. WIN30 is the user's separately selected live trial, not a proven joint improvement. The 97.66% win and 219.09-point records came from a weaker scripted field and are not live results.

`report.py INPUT --output OUTPUT.json` reports wins including ties, strict wins, mean score and uncertainty. Repeated executions are clustered by world; three repeats do not triple the number of independent worlds. Incomplete experiments cannot pass the report gate.

`decisions.jsonl` retains rejected and unproven candidates. `source-origin.json` identifies the original local source snapshot; archived source hashes remain in the exported evidence. `lucent-comparison.json` is a dated observational comparison across changing versions, not a controlled test or the screenshot cohort. See `../COMBINED-UPDATES.md` for combined test counts and results.
