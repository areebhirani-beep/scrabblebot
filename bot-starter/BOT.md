# Our ScrabbleBot

Built at HackUTD 2026 for the Spacetime ScrabbleBot tournament. The game
server is Clockwork Labs' (MIT, see `../LICENSE`); everything in
`bot-starter/src/` besides the generated bindings is ours.

## How it plays

**Score only goes up.** Paying for a letter lowers your balance, never your
score, and coins left at the end are worth nothing. So the bot spends its
whole balance by the last auction.

**Long words pay triple.** A tile in a 7+ letter word earns 3x its face value,
in a 3-letter word 1x. The bot holds tiles and only cashes 7+ letter words
mid-match, unless it runs out of coins.

**The last auction is special.** The match ends inside the same transaction
that closes the last auction, so the last tile can never be played (we bid 0)
and every tile still in the rack scores 0. The moment the last auction opens,
the bot plays its whole rack in the best split of words it can find.

**What is a letter worth?** Monte Carlo. For each auction we sample possible
futures from the tiles we haven't seen yet, then compare the best words we
could make with and without this letter on the same futures. The average gain
is the letter's value in points. Unseen tiles are rebuilt from public tables:
every auctioned letter, our own starting rack, and opponents' starting tiles
they gave away by playing them.

**Points to coins.** bid = value x gain x pace. Pace starts below 1 when the
bag is full and climbs as it empties, so we save coins early and spend them
down late. The gain changes with table size: heads-up wants a much higher gain
than a 6-seat table, and big tables want harder late spending.

## Tuning

`src/sim.ts` is an offline copy of the module's rules (deal, Vickrey pricing,
discarded unbid tiles, end on empty bag). We tuned against the module's own
sim bots, the starter bot, a tuned heuristic bot, and copies of our own Monte
Carlo bot, at 2, 6 and 9 seats.

```
npx tsx src/sim.ts 50                         # standard tables
ONE='{"bot":"adv","p":{},"field":"mchu"}' npx tsx src/sim.ts 80   # one config
npm test
```

## Running it

```
npm install && npm run generate
BOT_NAME=<name> BOT_TOKEN=<token> npm start      # first run saves the token
BOT_NAME=<name> TOURNAMENT_ID=<id> ./run.sh       # tournament: auto-restarts, keeps the Mac awake
```

The live database holds millions of past auctions, so the bot never subscribes
to all tables. It subscribes to its own seats, then to the rows of the match it
is in, and drops them when the match ends.
