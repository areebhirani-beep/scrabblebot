// Bidding and word strategy.
//
// The whole idea in four lines:
//   1. Score only ever goes up. Paying for a letter lowers balance, never
//      score, so money is worth nothing once the bag is empty. Spend it.
//   2. A tile in a 7+ letter word pays 3x its face value; in a 3-letter word
//      it pays 1x. So hold tiles and only cash in words of 7+ letters.
//   3. Tiles left in the rack when the last auction closes score 0. When the
//      final auction opens, play out the whole rack in the best split.
//   4. Bid what a letter is worth to THIS rack: how much it adds to the best
//      words we could make, plus what it is likely to be worth later.

import {
  FULL_BAG,
  LETTER_VALUE,
  WordEngine,
  plus,
  rackSize,
  type Rack,
} from "./engine.js";

export { LETTER_VALUE };

export interface View {
  rack: Rack;
  balance: number;
  score: number;
  // Tiles still in the bag, not counting the letter being auctioned now.
  // 0 means this auction is the last one of the match.
  bagLeft: number;
  // Letters we haven't seen yet: still in the bag or hidden in an
  // opponent's starting rack.
  unseen: Record<string, number>;
}

export interface Params {
  minCashLen: number; // shortest word we cash in mid-match
  futureWeight: number; // how much the "later" value of a tile counts
  moneyFactor: number; // bid = value * moneyFactor (Vickrey: bid your value)
  maxBidShare: number; // never bid more than this share of balance
  vowelTarget: number; // ideal share of vowels in the rack
  paceLate: number; // bid multiplier as the bag empties (1 = off); coins are worthless at match end
  starveCoins: number; // under this many coins with 10+ auctions left, cash a 5+ letter word (0 = off)
}

export const DEFAULT_PARAMS: Params = {
  minCashLen: 7,
  futureWeight: 1.0,
  moneyFactor: 1.0,
  maxBidShare: 0.6,
  vowelTarget: 0.4,
  paceLate: 1,
  starveCoins: 0,
};

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

// How likely a tile of this letter is to end up inside a long word, rough
// prior. Common letters slot into almost anything; J/Q/X/Z rarely do.
const FIT: Record<string, number> = {
  E: 0.9, A: 0.85, I: 0.85, O: 0.75, U: 0.5, S: 0.9, R: 0.9, T: 0.9,
  N: 0.9, L: 0.85, D: 0.75, G: 0.65, C: 0.7, M: 0.65, P: 0.65, B: 0.55,
  H: 0.6, F: 0.45, Y: 0.5, W: 0.4, K: 0.35, V: 0.35, X: 0.25, J: 0.15,
  Q: 0.1, Z: 0.2,
};

export class Strategy {
  constructor(
    private engine: WordEngine,
    public p: Params = DEFAULT_PARAMS,
  ) {}

  // What the rack is worth if we keep building it: the best split we could
  // play right now, plus a smaller credit for loose tiles that may still
  // land in a long word before the match ends.
  potential(rack: Rack, bagLeft: number): number {
    const now = this.engine.bestPlayout(rack, 8, 3).score;
    const time = Math.min(1, bagLeft / 40); // late in the match, loose tiles are worth less
    let loose = 0;
    let vowels = 0;
    const n = rackSize(rack);
    for (const [c, k] of rack) {
      if (VOWELS.has(c)) vowels += k;
      for (let i = 0; i < k; i++) {
        // the third copy of a letter is worth much less than the first
        const dup = i === 0 ? 1 : i === 1 ? 0.6 : 0.25;
        loose += 3 * (LETTER_VALUE[c] ?? 1) * (FIT[c] ?? 0.4) * dup;
      }
    }
    // racks with too few or too many vowels rarely spell long words
    const vshare = n === 0 ? this.p.vowelTarget : vowels / n;
    const balance = 1 - Math.min(0.6, Math.abs(vshare - this.p.vowelTarget) * 1.5);
    return Math.max(now, now * 0.5 + this.p.futureWeight * time * loose * balance);
  }

  decideBid(v: View, letter: string): number {
    if (v.bagLeft === 0) return 0; // last letter can't be played: match ends on close
    const before = this.potential(v.rack, v.bagLeft);
    const after = this.potential(plus(v.rack, letter), v.bagLeft);
    // Spend-down pacing: ramps from 1x (full bag) to paceLate (empty bag).
    const frac = Math.min(1, v.bagLeft / 68);
    const pace = 1 + (this.p.paceLate - 1) * (1 - frac);
    const value = Math.max(0, after - before) * this.p.moneyFactor * pace;
    const cap = Math.floor(v.balance * this.p.maxBidShare);
    return Math.max(0, Math.min(Math.round(value), cap, v.balance));
  }

  // Words to play right now. Mid-match: only long words (3x). When the last
  // auction opens: everything, in the best split.
  chooseWords(v: View): string[] {
    if (v.bagLeft === 0) return this.engine.bestPlayout(v.rack, 16, 5).words;
    const out: string[] = [];
    let rack = v.rack;
    const starving = this.p.starveCoins > 0 && v.balance < this.p.starveCoins && v.bagLeft >= 10;
    const minLen = starving ? 5 : this.p.minCashLen;
    for (;;) {
      const cands = this.engine.spellable(rack, minLen);
      if (cands.length === 0) break;
      const w = cands[0]!.word;
      out.push(w);
      const next = new Map(rack);
      for (const c of w) {
        const k = next.get(c)! - 1;
        if (k === 0) next.delete(c);
        else next.set(c, k);
      }
      rack = next;
    }
    return out;
  }
}

export function freshUnseen(): Record<string, number> {
  return { ...FULL_BAG };
}
