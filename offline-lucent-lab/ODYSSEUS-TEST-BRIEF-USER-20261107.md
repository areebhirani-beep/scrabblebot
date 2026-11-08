# Odysseus Test Brief — supplied by the user

Provenance: user-provided brief received November 7, 2026. Preserve these reported findings for cross-session review. The underlying 209-match dataset and Aurelian source attribution have not yet been independently audited by this integration session. Existing timestamped evidence takes precedence where this brief is stale or conflicts with verified version history.

Team Locki · Odysseus's Voyage · Nov 7

What the live data says about winning, what we fixed, and the versions worth testing live next. All numbers are measured on the live server tonight (209 matches with 5–6 real bots, plus our own 33 matches). Nothing below is a simulator win rate.

## Where we stand

| Version (live) | Matches | Avg place | Wins |
| --- | ---: | ---: | ---: |
| Your latest main (9682c4a, TUNED_ADV) — v2 start | 11 | ≈2.7 | 2 |
| Aurelian versions (5 variants combined) | 33 | 3.61 | 5 |
| Random finish in a 6-bot match | — | 3.50 | 16.7% |

Samples are small (about ±0.45 on 11 matches), but your code's live record is the best we have. The v2 rating peak of 1970 came mostly from those matches.

## Findings

### 1. Matches are decided by 7+ letter words

| 7+ words played | 0 | 1 | 2 | 3 |
| --- | ---: | ---: | ---: | ---: |
| Win rate | 1% | 8% | 30% | 96% |

79% of winners' points come from 7+ letter words. A 6-letter word only helps on top of them: two 7s win 27%, two 7s plus a 6 win 49%.

### 2. The edge is high-value 7s, not more 7s

| Group | Avg points per 7+ word | 4+ point letters per word | Worth 45+ points |
| --- | ---: | ---: | ---: |
| Winners | 47.2 | 1.44 | 62% |
| Everyone else | 38.8 | 0.95 | 32% |
| Us (Aurelian) | 37.2 | 0.89 | 23% |

Winner 7s: QUICKLY, JEWFISH, ANTITAX, PUGMARK, QINDARS. Ours: RETAKING, THORITE, FETATION. A version that targeted 7-letter words made 40% more of them in testing but scored no more, because they were cheap 7s.

### 3. Winners play two 7s first, then a short word, then dump

Winners' first word is 7+ letters 96% of the time and never 4–5 letters; the second is 7+ 80% of the time. Median round: 7+ words ≈39, 6-letter57, 5-letter62, 2–4 letters67 (the final dump). Top sequences: 7→7→4, 7→7→5, 7→7→6. Cashing short words early for coins is something winners do not do.

### 4. 8-letter targets are not worth chasing

The multiplier stops at3× for7 letters, so an8 pays a7 plus one letter's face value but is much less likely to finish (6-tile rack:0.62 /0.46 /0.32 chance to finish the best6 /7 /8). Play the7 and keep the extra tile for the next word.

### 5. Prices are compressed: high-value tiles are cheap per point

| Tile's value to our rack | 2–4 pts | 4–6 | 6–10 | 10+ |
| --- | ---: | ---: | ---: | ---: |
| Coins per point needed to win | 4.6 | 3.0 | 2.3 | 1.7 |
| Points per coin on offer | 0.21 | 0.31 | 0.45 | 0.64 |

About7 tiles per match are worth10+ points to our rack and they cost~146coins in total, but we won only43% of them because cash was already spent on mediocre tiles. Blanket "bid more on premium letters" rules did not help in testing; the value has to come from the rack.

### 6. Spending without feedback swings between broke and hoarding

Our non-wins:7 starved (15+ rounds under10 coins),6 hoarded (30+ coins left),5 outbid. Winners spend32 /56 /58 /45 coins by quarter and buy most tiles in Q3–Q4. Your v1 had the same problem in Q4 (1.5 tiles vs Bron's6.0).

### 7. Bugs found and fixed in Aurelian (check yours)

- Subscribing to all tables made bids arrive after the auction closed (22 rejected, one whole match lost). Per-match subscriptions fixed it (3–15ms lag).
- Empty-rack trap: estimating future wins from our own win rate drove tile values to0, so the bot stopped bidding with90–107coins left. Fixed with a floor on expected future share.
- Cash trap boundary: the bot held a playable OXEN at exactly the threshold for44 rounds. Your branch found the same bug at exactly8 coins.
- Valuation noise:8 Monte Carlo samples give±2.5points of error on a mean value of4.7, and the greedy split undervalues by~15% (30% late).

### 8. Simulators could not rank strategies

A static historical-price simulator predicted2.65 for a version that placed3.86 live. A whole-match replay of tonight's matches matched our live averages but scored ten very different strategies all within3.95–4.3 (±0.2), and put your bot at4.05 against≈2.7 live. Your branch reached the same conclusion. Decisions should come from live blocks.

## Options to test live

Run one version at a time for about20matches (≈35–40minutes), with only one process connected to the bot. Compare average place, win rate, number and average points of7+ words, tiles by quarter and coins left.

- **A · control:** Your main as it is (9682c4a). Best live record so far. Establishes the bar for everything else.
- **B · one change:** Main+NEUTRAL6 horizon. From your branch: expected future wins=min(10,16% of usable bag) instead of min(6,10%). It was your best offline candidate; it has never been checked live.
- **C · one change:** Main+no early short words. Disable cash-starve cashing until the last~18auctions, matching finding3. Keep the endgame dump. Fix the exactly-8 boundary at the same time.
- **D · one change:** Main+stronger final quarter. Winners buy4.0tiles and spend~45coins in Q4; your v1 bought1.5. Raise late pacing (or add a spend-down floor in the last15auctions) and check coins left and Q4tiles.
- **E · our best:** Aurelian H+empty-rack fix. `AUR_PARAMS='{"multMin":1.1,"multMax":1.8,"paceCap":1.5,"lateWindow":20,"minShare":0.2}' BOT_NAME=Odysseus aurelian/run.sh`
- **F · experimental:** Aurelian7-word hunter (6–7targets, phases). Values tiles by explicit target words with exact draw odds. Makes more7s; did not score more offline. Worth one block only if A–D stall.

Not yet built: rack-driven pursuit of high-value7s (finding2), which is the biggest gap between us and the winners.
