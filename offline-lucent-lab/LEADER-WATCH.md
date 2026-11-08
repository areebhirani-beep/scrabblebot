# Current-leader public watch

`leader_watch.py` follows the current top five ranked bots plus Odysseus using public SELECT queries only. The active process refreshes every90seconds until2026-11-08T02:01:00Z (8:01PM Central). Its PID and deadline are in `experiments/leader-watch-20261108/process.json`. It never authenticates, plays, bids or deploys.

Read `experiments/leader-watch-20261108/LATEST.md` or `latest.json` before choosing a new opponent-derived hypothesis. The watch retains ranking snapshots, completed match participants, word plays/timing, auction results, visible top-bid archives and auction windows. It watches new top-five entrants automatically, deduplicates completed match IDs, and reports score-integrity mismatches. Initial history is bounded to match IDs43000onward; this is a recent cohort, not every lifetime match.

Actual observation, 2026-11-08: RackMaw led at2688inChrome, then2628at the first watch refresh. Its72completed-match sample contained38wins and100.10meanpoints. It averaged1.542seven-plus words pergame, worth48.97points each;47.75%containedJ/Q/X/Z. All22two-letter,21three-letter and17four-letter words appeared in the final5seconds. LUCENT's200-match cohort had more long words but different opponents. Compare matching tables before attributing differences to a mechanism.

Acquisition tests must report wins, score, long-word count/value, tiles bought and idle cash. Do not infer private source, private racks or unobserved future auctions. Do not equate increasing matches or ratings with competitors running internal tests. These observations generate hypotheses; held-out paired evaluations decide which changes merit a live trial by the sole live operator.
