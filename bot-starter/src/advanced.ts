// The strong bot: Monte Carlo letter value + shadow-price bidding + hoarding
// + cash-starve rule + exact endgame playout. Tuned in the simulator.

import { FastEval, LETTER_VALUE, WordEngine, minus, type Rack, rackSize } from "./engine.js";
import { MonteCarlo, type Unseen } from "./montecarlo.js";
import { firstPriceBid } from "./prices.js";

export interface AdvParams {
  samples: number; // Monte Carlo samples per letter (speed vs. accuracy)
  bidGain: number; // coins bid per expected point of value (before pacing)
  paceEarly: number; // pacing multiplier when the bag is full ...
  paceLate: number; // ... and when it is nearly empty (spend coins down)
  maxBidShare: number; // never bid more than this share of balance
  starveCoins: number; // under this many coins ...
  starveMinBagLeft: number; // ... with at least this many auctions left, cash a word
  cashLen: number; // shortest word we cash mid-match (7 = only 3x words)
  futureHorizon: number; // expected tiles we still win (scales the MC lookahead)
  // Table-size overrides (grid 2: heads-up wants a much higher gain, big
  // tables want harder late spending). 0 = use the base value.
  huGain: number;
  huPaceEarly: number;
  huHorizon: number;
  bigSeats: number; // a table this size or larger counts as "big"
  bigGain: number;
  bigPaceLate: number;
  // Late-game denial: in the last `denyLast` auctions, bid at least
  // denyMult x (balance / auctions left) so no coins are left idle and
  // rivals can't cheaply grab the tiles that finish their long words.
  denyLast: number; // 0 = off
  denyMult: number;
  // Extra coins per face point above 1 for letters worth 3+ (B C M P F H V W
  // Y K ...). Live data: we bought the fewest high-value tiles in the field
  // and the winners bought the most. 0 = off.
  facePremium: number;
}

export const ADV_DEFAULTS: AdvParams = {
  samples: 24,
  bidGain: 1.1,
  paceEarly: 0.8,
  paceLate: 1.6,
  maxBidShare: 0.7,
  starveCoins: 8,
  starveMinBagLeft: 10,
  cashLen: 6,
  futureHorizon: 6,
  huGain: 0,
  huPaceEarly: 0,
  huHorizon: 0,
  bigSeats: 8,
  bigGain: 0,
  bigPaceLate: 0,
  denyLast: 0,
  denyMult: 1,
  facePremium: 0,
};

// The params that actually apply at a table with `seats` bots.
export function forTable(p: AdvParams, seats: number): AdvParams {
  if (seats <= 2) {
    return {
      ...p,
      bidGain: p.huGain || p.bidGain,
      paceEarly: p.huPaceEarly || p.paceEarly,
      futureHorizon: p.huHorizon || p.futureHorizon,
    };
  }
  if (seats >= p.bigSeats) {
    return { ...p, bidGain: p.bigGain || p.bidGain, paceLate: p.bigPaceLate || p.paceLate };
  }
  return p;
}

export interface AdvView {
  rack: Rack;
  balance: number;
  score: number;
  bagLeft: number; // tiles left in bag, not counting the one on the block
  bagStart: number; // tiles the match's bag held after the deal (usually 68)
  unseen: Unseen; // pool to sample futures from
  seatCount: number; // bots at the table (heads-up final = 2)
  firstPrice?: boolean; // match uses first-price auctions (pay your own bid)
  auctionMs?: number; // auction window; the Monte Carlo time cap scales with it
}

export class AdvancedBot {
  private mc: MonteCarlo;
  private seed = 0x9e3779b9;

  constructor(
    private evalr: FastEval,
    private engine: WordEngine,
    public p: AdvParams = ADV_DEFAULTS,
  ) {
    this.mc = new MonteCarlo(evalr);
  }

  decideBid(v: AdvView, letter: string): number {
    if (v.bagLeft === 0) return 0; // last tile can't be played: match ends on close
    const p = forTable(this.p, v.seatCount);
    // Expected tiles we still win: fewer as the bag shrinks and more seats
    // split the pool. Cap by the horizon so the MC rack never explodes.
    const share = 1 / Math.max(1, v.seatCount - 1);
    const expWins = Math.min(p.futureHorizon, Math.max(1, Math.round(v.bagLeft * share * 0.5)));
    const budgetMs = Math.min(300, 0.3 * (v.auctionMs ?? 1000));
    const value = this.mc.value(v.rack, letter, v.unseen, expWins, p.samples, (this.seed = (this.seed * 1103515245 + 12345) >>> 0), budgetMs);
    const denyFloor =
      p.denyLast > 0 && v.bagLeft <= p.denyLast && v.seatCount > 2
        ? Math.floor((p.denyMult * v.balance) / (v.bagLeft + 1))
        : 0;
    if (value <= 0) return Math.min(denyFloor, v.balance);
    // Pace: spend conservatively while the bag is full, aggressively as it
    // empties, since coins left at match end are worthless. frac 1 -> early,
    // frac 0 -> late.
    const frac = v.bagStart > 0 ? v.bagLeft / v.bagStart : 0;
    const pace = p.paceLate + (p.paceEarly - p.paceLate) * frac;
    let bid = value * p.bidGain * pace;
    const face = LETTER_VALUE[letter] ?? 1;
    // Only when the letter has some use to us (MC value > 0) and it's not a
    // dead letter like Q without a U in sight.
    if (p.facePremium > 0 && face >= 3 && face <= 5) bid += p.facePremium * (face - 1) * pace;
    // Heads-up: a lone bidder pays only the reserve (1), so never overpay past
    // the letter's own value.
    if (v.seatCount <= 2) bid = Math.min(bid, value * p.bidGain);
    if (v.firstPrice) {
      // We pay what we bid, so bid the amount that maximizes expected surplus
      // against the real distribution of rival bids, not our full value.
      const quarter = Math.min(3, Math.floor(((v.bagStart - 1 - v.bagLeft) * 4) / Math.max(1, v.bagStart)));
      bid = firstPriceBid(letter, Math.max(0, quarter), bid);
    }
    const cap = Math.floor(v.balance * p.maxBidShare);
    return Math.max(0, Math.min(Math.max(Math.round(bid), denyFloor), Math.max(cap, denyFloor), v.balance));
  }

  chooseWords(v: AdvView): string[] {
    // Endgame: the last auction is open, so dump the whole rack in the best
    // split (exact search over the small rack).
    if (v.bagLeft === 0) return this.engine.bestPlayout(v.rack, 16, 6).words;

    const out: string[] = [];
    let rack = v.rack;

    // Cash-starve: too few coins to keep bidding, so sell the best long word
    // now rather than hold it uselessly.
    const starving = v.balance < this.p.starveCoins && v.bagLeft >= this.p.starveMinBagLeft;
    const minLen = starving ? 5 : this.p.cashLen;

    for (;;) {
      const cands = this.engine.spellable(rack, minLen);
      if (cands.length === 0) break;
      const w = cands[0]!.word;
      out.push(w);
      rack = minus(rack, w);
      if (!starving && rackSize(rack) < this.p.cashLen) break;
    }
    return out;
  }
}
