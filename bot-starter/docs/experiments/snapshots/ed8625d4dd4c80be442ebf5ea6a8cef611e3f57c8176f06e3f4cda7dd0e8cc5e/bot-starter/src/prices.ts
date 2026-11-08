// What the strongest rival bid looks like, from live public auction data
// (src/prices.json, rebuilt from the ladder). Used for first-price auctions,
// where you pay your own bid: there the right bid is not your value but the
// bid b that maximizes P(win at b) x (value - b).

import * as fs from "node:fs";
const file = new URL("./prices.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(file, "utf8")) as { q: number[]; t: Record<string, number[]> };

// P(strongest rival bid < b), ties counted half.
export function winProb(letter: string, quarter: number, b: number): number {
  const qs = data.t[`${letter}${quarter}`] ?? data.t[letter];
  if (!qs) return b > 10 ? 0.6 : 0.2;
  let p = 0;
  for (const v of qs) p += v < b ? 1 : v === b ? 0.5 : 0;
  // each quantile stands for 5% of the mass; the outer 5% tails split evenly
  return Math.min(1, (p + (b > qs[qs.length - 1]! ? 1 : 0)) / (qs.length + 1));
}

// Best first-price bid for a letter worth `value` coins to us.
export function firstPriceBid(letter: string, quarter: number, value: number): number {
  let best = 0, bestEv = 0;
  for (let b = 1; b <= Math.floor(value); b++) {
    const ev = winProb(letter, quarter, b) * (value - b);
    if (ev > bestEv) { bestEv = ev; best = b; }
  }
  return best;
}
