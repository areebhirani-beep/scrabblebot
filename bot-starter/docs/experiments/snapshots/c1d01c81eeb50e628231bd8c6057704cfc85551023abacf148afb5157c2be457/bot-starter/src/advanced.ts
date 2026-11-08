// The strong bot: Monte Carlo letter value + shadow-price bidding + hoarding
// + cash-starve rule + exact endgame playout. Tuned in the simulator.

import { FastEval, LETTER_VALUE, WordEngine, minus, plus, rackKey, reward, type Rack, rackSize } from "./engine.js";
import { MonteCarlo, type Unseen } from "./montecarlo.js";
import { firstPriceBid } from "./prices.js";
import { proveTerminalGain } from "./terminal-proof.js";
import { chooseLongWords } from "./word-packing.js";
import { ExactSmallEval } from "./exact-small-eval.js";
import { CountDpEval } from "./count-dp-eval.js";
import { expectedFutureWins } from "./horizon.js";

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
  /** Experimental switches, off unless an evaluation explicitly selects them. */
  packLongWords?: boolean;
  valuableSixMinScore?: number;
  refineSmallRacks?: boolean;
  rareFacePremium?: number;
  neutralSixHorizon?: boolean;
  /** Offline challenger: bounded count-state refinement; disabled by default. */
  countDpRefinement?: boolean;
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
  decisionBudgetMs?: number; // actual remaining time from the action scheduler
  terminalEligible?: boolean; // known external-only table and no word awaiting receipt
  matchKey?: string; // scopes a certified liquidation plan to its match
}

export class AdvancedBot {
  private mc: MonteCarlo;
  private seed = 0x9e3779b9;
  private terminalPlan?: {
    matchKey: string; rackKey: string; word: string;
    continuations?: Map<string, string[]>;
  };

  constructor(
    private evalr: FastEval,
    private engine: WordEngine,
    public p: AdvParams = ADV_DEFAULTS,
  ) {
    this.mc = new MonteCarlo(p.countDpRefinement
      ? new CountDpEval(evalr, engine)
      : p.refineSmallRacks ? new ExactSmallEval(evalr, engine) : evalr);
  }

  decideBid(v: AdvView, letter: string): number {
    if (v.bagLeft === 0) return 0; // last tile can't be played: match ends on close
    const p = forTable(this.p, v.seatCount);
    // Expected tiles we still win: fewer as the bag shrinks and more seats
    // split the pool. Cap by the horizon so the MC rack never explodes.
    const expWins = expectedFutureWins(v.bagLeft, v.seatCount, p.futureHorizon, !!p.neutralSixHorizon);
    const budgetMs = Math.max(0, Math.min(300, 0.3 * (v.auctionMs ?? 1000), v.decisionBudgetMs ?? Infinity));
    if (budgetMs <= 0) return 0;
    const deadline = performance.now() + budgetMs;
    if (v.bagLeft === 1 && v.terminalEligible && v.matchKey && v.balance >= 1) {
      const proof = proveTerminalGain(this.engine, v.rack, letter, {
        deadlineMs: deadline, budgetMs: Math.min(20, budgetMs),
      });
      if (proof) {
        this.terminalPlan = { matchKey: v.matchKey, rackKey: rackKey(plus(v.rack, letter)), word: proof.word };
        // No later external player can use a purchased tile. Coins have no
        // terminal value; one certified word beats every old-rack split.
        return Math.max(0, Math.floor(v.balance));
      }
    }
    const value = this.mc.value(v.rack, letter, v.unseen, expWins, p.samples, (this.seed = (this.seed * 1103515245 + 12345) >>> 0), Math.max(0, deadline - performance.now()));
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
    if ((p.rareFacePremium ?? 0) > 0 && face >= 8)
      bid += p.rareFacePremium! * (face - 1) * pace;
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
    const budgetMs = Math.max(0, Math.min(30, v.decisionBudgetMs ?? 30));
    const deadlineMs = performance.now() + budgetMs;
    if (budgetMs <= 0) return [];
    if (v.bagLeft <= 1 && this.terminalPlan && this.terminalPlan.matchKey === v.matchKey) {
      const key = rackKey(v.rack);
      const incumbent = this.terminalPlan.continuations?.get(key)
        ?? (this.terminalPlan.rackKey === key ? [this.terminalPlan.word] : undefined);
      if (incumbent) {
        // The certificate beats the old rack; it need not be the best split
        // of the newly won rack. Improve it without losing a known legal plan
        // when bounded search runs out of time.
        const incumbentScore = incumbent.reduce((score, word) => score + reward(word), 0);
        const refined = this.engine.bestPlayout(v.rack, 16, 6, { deadlineMs });
        const chosen = refined.score > incumbentScore ? refined.words : incumbent;
        const continuations = this.terminalPlan.continuations ??= new Map();
        let remaining = v.rack;
        // Actions send one word at a time. Cache each resulting inventory so
        // receipts can continue a short-word split even while bagLeft is 1.
        // Keep the current-rack entry too: a rejected call consumes nothing.
        for (let index = 0; index <= chosen.length; index++) {
          continuations.set(rackKey(remaining), chosen.slice(index));
          if (index < chosen.length) remaining = minus(remaining, chosen[index]!);
        }
        return chosen.slice();
      }
    }
    // Endgame: the last auction is open, so dump the whole rack in the best
    // split (exact search over the small rack).
    if (v.bagLeft === 0) return this.engine.bestPlayout(v.rack, 16, 6, { deadlineMs }).words;

    const out: string[] = [];
    let rack = v.rack;

    // Cash-starve: too few coins to keep bidding, so sell the best long word
    // now rather than hold it uselessly.
    const starving = v.balance < this.p.starveCoins && v.bagLeft >= this.p.starveMinBagLeft;
    const selectiveSix = !starving && (this.p.valuableSixMinScore ?? 0) > 0 && this.p.cashLen > 6;
    const minLen = starving ? 5 : selectiveSix ? 6 : this.p.cashLen;
    if (this.p.packLongWords && !starving && !selectiveSix)
      return chooseLongWords(this.engine, rack, minLen, { deadlineMs });

    for (;;) {
      const cands = this.engine.spellable(rack, minLen, { deadlineMs }).filter(c =>
        !selectiveSix || c.word.length >= this.p.cashLen ||
        c.word.length === 6 && c.score >= this.p.valuableSixMinScore!);
      if (cands.length === 0) break;
      const w = cands[0]!.word;
      out.push(w);
      rack = minus(rack, w);
      if (!starving && rackSize(rack) < minLen) break;
    }
    return out;
  }
}
