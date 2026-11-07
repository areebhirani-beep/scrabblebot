// Monte Carlo letter valuation + shadow-price budget pacing.
//
// This is the heart of the strong bot, and it mirrors what the Cal Hacks
// champion (K-13) and the runner-up did, rebuilt from scratch:
//
//   value(L) = E[ bestScore(rack + L + futureDraws) ] - E[ bestScore(rack + futureDraws) ]
//
// We don't know the future tiles, so we sample them from the *unseen* pool
// (every tile not in our rack and not already revealed in a public auction),
// evaluate the best words with and without L on the SAME sampled future
// (common random numbers, so the noise cancels), and average the gain.
//
// Coins, not points, are the binding constraint: tiles clear around 12 coins
// while being worth ~4 points, and the average bot leaves ~31 coins unspent.
// So we convert a letter's point value into a coin bid with a shadow price
// lambda (points per coin): bid = value / lambda. Lambda is chosen so the
// whole balance gets spent across the auctions that remain, and it falls as
// the bag empties, because unspent coins at match end are worth nothing.

import { FastEval, type Rack, toCounts } from "./engine.js";

export interface Unseen {
  // letters still available to be drawn: count per letter
  counts: Record<string, number>;
  total: number;
}

// Mulberry32: tiny fast seedable RNG so runs are reproducible in the sim.
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const A = 65;

// Draw `k` tiles from the unseen pool without replacement, into a 26-counts
// array. Returns the drawn counts; does not mutate `pool`.
function sampleFuture(pool: Record<string, number>, total: number, k: number, rnd: () => number): Uint8Array {
  const letters: string[] = [];
  const counts: number[] = [];
  for (const [l, n] of Object.entries(pool)) if (n > 0) { letters.push(l); counts.push(n); }
  const out = new Uint8Array(26);
  let remaining = total;
  const draw = Math.min(k, remaining);
  const work = counts.slice();
  for (let d = 0; d < draw; d++) {
    let idx = Math.floor(rnd() * remaining);
    for (let i = 0; i < work.length; i++) {
      if (idx < work[i]!) { out[letters[i]!.charCodeAt(0) - A]!++; work[i]!--; remaining--; break; }
      idx -= work[i]!;
    }
  }
  return out;
}

export interface MCResult {
  value: number; // expected point gain from winning this letter
}

export class MonteCarlo {
  constructor(private evalr: FastEval) {}

  // Expected marginal value of adding `letter` to `rack`, given how many more
  // tiles we expect to win before the match ends (`futureWins`) and the
  // unseen pool to sample them from.
  // Stops early once `budgetMs` is spent, so a busy CPU can't make us miss
  // the 1-second auction window. Always runs at least 4 samples.
  value(rack: Rack, letter: string, unseen: Unseen, futureWins: number, samples: number, seed: number, budgetMs = 300): number {
    const t0 = performance.now();
    const base = toCounts(rack);
    const li = letter.charCodeAt(0) - A;
    const rnd = rng(seed);
    const k = Math.max(0, Math.round(futureWins));
    let sum = 0;
    let done = 0;
    const tmp = new Uint8Array(26);
    for (let s = 0; s < samples; s++) {
      if (s >= 4 && performance.now() - t0 > budgetMs) break;
      const fut = sampleFuture(unseen.counts, unseen.total, k, rnd); // common random numbers
      // without the letter
      for (let i = 0; i < 26; i++) tmp[i] = base[i]! + fut[i]!;
      const without = this.evalr.evalCounts(tmp, 3);
      // with the letter
      for (let i = 0; i < 26; i++) tmp[i] = base[i]! + fut[i]!;
      tmp[li]!++;
      const withL = this.evalr.evalCounts(tmp, 3);
      sum += withL - without;
      done++;
    }
    return sum / Math.max(1, done);
  }
}

// Shadow price: points per coin. We want to spend our whole balance over the
// auctions that remain, so lambda ~= (total value we can still capture) /
// (coins we can still spend). In practice we calibrate it from how valuable
// the current letter is relative to a running estimate, but the simple,
// robust version used here: lambda decays with the fraction of the bag left,
// so late tiles get bid up (coins are about to be worthless) and early tiles
// are bid conservatively (save coins for better letters).
//
//   bid = value / lambda,  lambda = base * (0.3 + 0.7 * bagFraction)
//
// base is tuned in the simulator.
export function shadowBid(value: number, bagLeft: number, bagStart: number, base: number): number {
  const frac = bagStart > 0 ? bagLeft / bagStart : 0;
  const lambda = base * (0.3 + 0.7 * frac);
  return value / Math.max(0.05, lambda);
}
