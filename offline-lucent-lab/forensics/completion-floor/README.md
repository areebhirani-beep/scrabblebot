# Completion-floor diagnostic replay

The four saved traces reproduce the exact original scores, placements, long-word totals, purchases, spending and ending cash for worlds6 and9, BASE andFLOOR1. The parent source is archived by its SHA256 under bot-starter/docs/experiments/snapshots. Only sim.ts is instrumented: actions are buffered and written after each match.

After installing the bot dependencies, run `python3 offline-lucent-lab/replay_completion_floor.py` from the repository. It reconstructs an ignored source directory from the frozen parent plus this patch, verifies hashes, and acquires the shared nonblocking worker lock before four bounded offline subprocesses. It never starts a live client. A different CPU load can change timing-sensitive search; the summary explicitly checks reproduction before attributing failure.

World6: at round5, rackAEILTU with94coins, the offeredN receives bid3 fromBASE versus11 fromFLOOR. FLOOR wins for8coins and playsALUNITE21 at round6, emptying the rack. BASE later winsQ and playsLIQUATE48 at round12. Final totals are102/first versus48/sixth.

World9: at round37, rackAEMOPTU with71coins, offeredL receives6 versus12. FLOOR wins for9 and playsPLUMATE33 at round38, followed byLECTION27 and terminalQUILL28/ZAG13, totaling101/second. BASE waits until round47 forPANTOUM33 and ends33/sixth.

These paired synthetic traces identify the changed decision and downstream trajectory in these cases. A minimum42-point floor would suppress both the bad21-point early completion and the helpful33-point later completion. A next mechanism must consider opportunity cost and phase as well as word value, and be tested on fresh cases. Neither replay proves a live causal effect or a globally optimal threshold.
