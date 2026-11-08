# ScrabbleBot collaboration and experiment memory

- Read `LEARNINGS.md`, `bot-starter/docs/offline-incumbent.json`, and `offline-lucent-lab/LESSONS.md` before proposing another policy experiment.
- Preserve successful and unsuccessful runs, including configuration, source/dictionary hashes, seeds, field definitions, uncertainty and decisions. Continue from the best comparable incumbent; do not erase rejected approaches or repeatedly retest them without new evidence.
- Optimize win rate and average score together. Keep opponent fields separate. The 97.66%/211.91 record is against weaker scripted opponents, not a live result or evidence of beating LUCENT. The stronger-field provisional record is 24.22%/89.61 over 128 worlds.
- Experimental cashout, win utility, count-DP, horizon and terminal options are opt-in. Pushing this branch does not authorize starting a live runner, changing a bot version, or claiming a leaderboard improvement. Confirm sole runner ownership before any live use.
- Use one heavy offline worker at a time with `bot-starter/.runtime-odysseus/offlineworker.lock`, bounded Node memory and the existing power guard. Never stage tokens, environment files, runtime logs, dependency directories or generated credentials.
- Verify with `cd bot-starter && npm test && npm run build`; Python evaluation tests use `python3 -m unittest discover -s tools -p 'test_*.py'`. Lab workflow tests run from `offline-lucent-lab` with `python3 -m unittest test_learning.py test_repeated.py`.
- Frozen experimental sources and reports in `bot-starter/docs/experiments` are historical evidence. Do not edit their source files to fix the current bot; change `bot-starter/src` and run a new experiment.
