# Seven-letter word evidence — 2026-11-08 00:09 UTC

The user and cofounder identified seven-letter words as a likely source of the leaders' advantage. We checked 200 completed public LUCENT v3 matches spanning November 7 18:33 to November 8 00:06 UTC. The public collection includes all participants and word plays; it contains no hidden racks or live bids. All word reward sums match final scores and there are no duplicate word IDs.

LUCENT won 93/200 (46.5%) and averaged 122.74 points. Exactly seven-letter words supplied 68.38% of its points; seven or more supplied 86.66%. It played 2.02 exact-seven words and 2.52 seven-plus words per match. Among its 93 wins, 92 included exactly seven letters and all 93 included seven or more. Those wins averaged 154.30 points, 3.06 seven-plus words, and 135.55 points from those long words.

This supports prioritizing repeated high-value long-word completions. It does not establish that a new policy will average 130–140. The 53 matched tables are a useful check on opponent mix: LUCENT averaged 91.45 points versus our 81.42, with 1.717 versus 1.660 long words per game and 41.31 versus 40.02 points per long word. Our versions changed during this historical cohort. These figures are not the current WIN30 trial's metrics.

The bot's accepted dictionary contains 172,820 unique words, including 23,109 of length seven and 28,420 of length eight. Every observed played word is present. It uses all word lengths, with anagrams collapsed only when their letters and rewards are identical. Lexicon coverage is not evidence that every deadline-limited search finds the best completion. Midgame cashLen7 already favors long words; simply enabling that existing setting is not a new improvement.

Next experiments should measure win rate and mean score alongside completed seven-plus words, points per long word, acquired tiles and leftover cash. Investigate under-acquisition and overoptimistic future-tile assumptions. Preserve useful short cashouts when they demonstrably fund later long words; do not impose a blanket ban on short words. No automatic deployment from this observational finding.

Evidence: `experiments/lucent-public-200-20261108.json`, `experiments/lucent-word-length-pattern-200.json`. Public examples include LUCENT's EQUINOX (69 points) in match 42693 and EXARCHY (66 points) in match 42863. Reproduce with `fetch_public_word_history.py` and `analyze_word_lengths.py`.
