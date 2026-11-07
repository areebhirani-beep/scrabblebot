// The strong bot: Monte Carlo letter value + shadow-price bidding + hoarding
// + cash-starve rule + exact endgame playout. Tuned in the simulator.

import { FastEval, WordEngine, minus, type Rack, rackSize } from "./engine.js";
import { MonteCarlo, type Unseen } from "./montecarlo.js";

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
};

export interface AdvView {
  rack: Rack;
  balance: number;
  score: number;
  bagLeft: number; // tiles left in bag, not counting the one on the block
  bagStart: number; // tiles the match's bag held after the deal (usually 68)
  unseen: Unseen; // pool to sample futures from
  seatCount: number; // bots at the table (heads-up final = 2)
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
    // Expected tiles we still win: fewer as the bag shrinks and more seats
    // split the pool. Cap by the horizon so the MC rack never explodes.
    const share = 1 / Math.max(1, v.seatCount - 1);
    const expWins = Math.min(this.p.futureHorizon, Math.max(1, Math.round(v.bagLeft * share * 0.5)));
    const value = this.mc.value(v.rack, letter, v.unseen, expWins, this.p.samples, (this.seed = (this.seed * 1103515245 + 12345) >>> 0));
    if (value <= 0) return 0;
    // Pace: spend conservatively while the bag is full, aggressively as it
    // empties, since coins left at match end are worthless. frac 1 -> early,
    // frac 0 -> late.
    const frac = v.bagStart > 0 ? v.bagLeft / v.bagStart : 0;
    const pace = this.p.paceLate + (this.p.paceEarly - this.p.paceLate) * frac;
    let bid = value * this.p.bidGain * pace;
    // Heads-up: a lone bidder pays only the reserve (1), so never overpay past
    // the letter's own value.
    if (v.seatCount <= 2) bid = Math.min(bid, value * this.p.bidGain);
    const cap = Math.floor(v.balance * this.p.maxBidShare);
    return Math.max(0, Math.min(Math.round(bid), cap, v.balance));
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
