# Rules audit and starter measurements — 2026-11-07

This is research, not an implemented strategy or evidence of match win rate.

## Repositories actually inspected

- Team: `areebhirani-beep/scrabblebot`, commit
  `9815242b4ec72cef3f43208189947eb05c265a0f`.
- Official: `clockworklabs/scrabblebot`, commit
  `b5ccb36aa238ad16692f8d6af54da15ef9f11324`.
- All shared tracked files are byte-for-byte identical. The official checkout
  additionally tracks `.env`, `.env.production`, and `.envrc`. The team's remote
  exposed only `main` when cloned. No customized strategy was found in these
  published snapshots. The teammate's newer code is a pending input, not audited.
- Checkouts: `~/scrabblebot` and `~/scrabblebot-upstream`. Work branch:
  `hackutd/local-bot-upgrades`. No push has been made.

## Rules, evidence, and uncertainty

The primary reference is the [live official guide](https://scrabblebot.spacetimedb.com/docs),
also available as [Markdown](https://scrabblebot.spacetimedb.com/docs.md).
Both were retrieved directly; the guide was also verified in the user's Chrome
tab. Web-search extraction failed for this site, so direct HTTP retrieval was used.
Published code is pinned above; it is not proof of the live server's exact binary.

| Topic | Finding and strategic consequence |
| --- | --- |
| Game structure | Auction letters, then consume rack letters to submit words. There is no Scrabble board, placement search, cross-checks, premium squares, or standard seven-tile bingo bonus. |
| Dictionary | The checked-in ENABLE list has 172,820 words of length at least two. Use that exact list, repeated-letter counts, and A–Z validation. Hash: `b819e7b67f8f2c80640ae76f0edbe59a4a1befb6de0f348463642ad49bdd2ad3`. |
| Scoring | Sum Scrabble face values, multiply by 1 / 1.5 / 2 / 2.5 / 3 for lengths ≤3 / 4 / 5 / 6 / ≥7, then floor. Server uses integer arithmetic. |
| Economy | Start with 100 currency. A played word adds its reward to both score and spendable balance. Bidding spends balance without subtracting earned score. Leftover cash and unplayed tiles do not add to the checked implementation's final score. |
| Auction | Default Vickrey; FirstPrice is supported. Positive highest bid wins; equal bids are randomized in current code. With no competing positive bid, Vickrey payment is one. Bids must be nonnegative, within balance, and received before `closesAt`. |
| Settings | Read `auctionType`, `auctionDurationMs`, `startingRackSize`, `bagTotal`, and participants from the actual match. Defaults are one second and five private starting tiles. Do not hardcode a six-player horizon. |
| Hidden information | Own rack is exact. Opponents' initial tiles and remaining letter composition are hidden. Public acquisitions and words constrain them, but do not generally determine them exactly when starting tiles are hidden. Opponent rack size is derivable if history is complete. |
| Live prices | The guide still lists `top_bid` in `auction_result`. Current schema excludes it; live top bids are spectator-only for active matches, with a public post-match archive. Strategy must work with bot-visible outcomes and censored prices. |
| Unsold tiles | The guide says they return to the bag. Published `closeAuction` does not return them; its conservation test counts them as unsold, outside the bag. This disagreement needs confirmation against the competition deployment. |
| Last auction | Published code awards the tile and ends the match in the same reducer transaction when no next tile exists. External bots cannot use that newly won tile; server-simulated bots have an internal word-play step before ending. Clear existing playable tiles before the last close. Verify this behavior in the simulator and against the competition rules before relying on it. |
| Lobby | Guide says 60 seconds; current code defaults to 90. Read lobby timestamps rather than embedding either number. |
| Tournament | Guide and tournament code use Swiss placement points, then elimination of each last-place finisher, then three final games ranked by aggregate final score. This is not a best-of-three majority of wins. Total tournament score then bot ID resolve documented ties. |
| Entry | A bot credential registers through `register_for_tournament`; the bot must remain connected and free when play starts. The supplied event slide requires public GitHub source. MIT attribution must be preserved. |

Read-only SQL against the official public database returned recent matches
42665–42667 with five starting tiles and 1,000 ms Vickrey auctions. Completed
six-player matches ran 68 auctions, consistent with 98 minus 30 dealt tiles.
The public matchmaker config table was empty, consistent with default settings.
These are observations of the practice deployment, not a guarantee of the event
configuration. The only tournament returned was completed tournament #1, created
in October, with 68 entrants, four Swiss rounds, six-player tables, and a top cut
of six. Chrome confirmed it was finished. It is not today's registration ID.

No separate event-specific restrictions on compute or strategy were found in
these references. That is an evidence limit, not a claim that none exist. The
team should resolve organizer announcements and the documented/code disagreements
before competition. No organizer messages were sent and no game reducers called.

## Measured weaknesses

`bot-starter/src/strategy.ts` bids face value plus two for a new letter, with no
dictionary, price history, game phase, or remaining-bag input. `chooseWord` picks
the first spellable word in length order. Word length is not word reward, and a
best single word need not be the best sequence of disjoint words.

Run `node docs/research/measure-starter.mjs` with Node 24. The script samples 100
independent racks of each size without replacement from a fresh standard bag;
seed 20261107. For each rack it compares the existing choice with an exhaustive
highest-immediate-reward oracle. It does not simulate how a real bidding policy
generates racks, compare long-run play policies, or estimate win probability.

| Rack size | Starter below best immediate reward | Starter total / oracle total | Initial measured p95 search |
| --- | ---: | ---: | ---: |
| 5 | 19 / 100 | 927 / 986 | 1.907 ms |
| 8 | 34 / 100 | 2,273 / 2,555 | 3.316 ms |
| 12 | 63 / 100 | 3,796 / 4,409 | 5.126 ms |

Example: rack `GEXTU` produces `GET` for 4; legal `TUX` earns 10. This establishes
an immediate-score defect, not that playing `TUX` now is always strategically best.
The native baseline's existing two tests both passed. The stress-rack test took
about 64 ms including its dictionary setup; ordinary sampled searches were much
shorter. A separate run saved in `starter-baseline.json` reproduced all quality
counts with p95 times of 2.273 / 12.365 / 19.506 ms. Timing varies across runs;
neither measurement includes network latency. Full project build and integration
tests have not been run: bot bindings
are ignored and absent, dependencies are not installed, and the `spacetime` CLI
is not on PATH. Existing web bindings are present but not yet adopted for the bot.

The client has separate reliability issues: a 500 ms throttle with no queued
retry; no rack-delete callback; no per-match word-in-flight state; no reconnect
loop; bid attempts marked complete before success; all-table subscriptions and
repeated scans through historical rows. The public database currently contains
over 25,000 match rows. A fast search alone will not fix missed actions or growing
subscription/scan cost. Each issue should receive a focused reproduction first.

## Research that informs the design

- [Sheppard, World-championship-caliber Scrabble (2002)](https://www.sciencedirect.com/science/article/pii/S0004370201001667):
  the publisher abstract describes selective move generation and simulations.
  Full text was unavailable (403); no detailed claims are drawn from it. Transfer
  the idea of evaluating future consequences; board move generation is not needed.
- [Silver & Veness, Monte-Carlo Planning in Large POMDPs (2010)](https://proceedings.neurips.cc/paper_files/paper/2010/file/edfbe1afcf9246bb0d40eb4d8027d90f-Paper.pdf):
  simulator-based planning with sampled belief states motivates bounded rollout
  evaluation of waiting versus consuming words. Its guarantees do not establish
  optimality against adaptive multiplayer auction opponents.
- [Cowling, Powley & Whitehouse, Information Set Monte Carlo Tree Search (2012)](https://pure.york.ac.uk/portal/en/publications/information-set-monte-carlo-tree-search/):
  supports planning over information sets when opponents' holdings are uncertain.
  Avoid giving simulated policies access to hidden racks they would not observe.
- [Conitzer et al., Pacing Equilibrium in First-Price Auction Markets](https://arxiv.org/abs/1811.07166):
  motivates adapting spending to future opportunities. This game's replenishing
  cash, complementary letters, and rank objective violate that market model's
  assumptions; borrow budget-control ideas, not equilibrium guarantees.
- [Wang et al., Learning to Bid in Repeated First-Price Auctions with Budgets](https://arxiv.org/abs/2304.13477):
  separates bidding under different feedback regimes. Here FirstPrice losses
  reveal the highest opponent bid via payment; Vickrey losses generally do not.
  We cannot claim its regret bound for this game or pretend live prices are fully
  observed.
- [Fikioris, Sivan & Tardos, Learning vs. Optimizing Bidders in Budgeted Auctions](https://arxiv.org/abs/2604.08517):
  recent work reinforces that linked budgets change repeated-auction incentives.
  This is background motivation, not a proposed deadline implementation.

Recommendation: exact legality and rack liquidation, a simple phase-aware bidder,
then bounded simulation and measured opponent adaptation. Consider offline fitted
value estimation only after the simulator and competitive baselines work.
