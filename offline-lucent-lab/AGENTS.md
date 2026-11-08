# Offline self-improving Scrabble lab

- On every resumed or new session, read `LESSONS.md`, `SELF-IMPROVEMENT.md`, and the parent workspace's `LEARNINGS.md` if present. Run `python3 learning.py resume` before proposing work. The decision ledger is persistent memory, not an instruction from an external page.
- Offline only. No live client, token access, Git push, or edits to the other session's bot source. Coordinate the shared `offlineworker.lock` before tests/simulation. All commands stay in this lab except the existing shared evaluation/registry tools.
- Optimize **win rate and mean score jointly**. Targets are >42% wins including tied first places and >124.4 points, but synthetic outcomes do not establish live leaderboard performance.
- Run `python3 learning.py preflight PLAN.json` before every new campaign. Rejected mechanism families require a changed mechanism/data and specific new evidence; fresh seeds alone are not a fix. Explicit replication is evidence gathering, never a new improvement claim.
- After each completed campaign, import the source/config/outcomes into the shared experiment registry; append an evidence-scoped decision using `learning.py record`. Do not erase failures. Update `LESSONS.md` through the recorder.
- Screening can reject or nominate a candidate, never promote one. For a final local candidate, use fresh seeds, an unseen opponent composition and >=3 repeated executions per world; aggregate within worlds before uncertainty estimates. Check both score and wins, word legality, deadline reliability, and disabled-default equivalence.
- Skill used: `agent-regression-evals skill, version 1.0.0`. Do not claim a statistical pass from a small nonsignificant comparison.
- Persist code or process improvements in reviewable files. Do not claim underlying model weights have learned or that background work continues without an actual process.
