export interface MarketWorld {
  bag: string[];
  rivalBids: number[];
  tieUniforms: number[];
  historicalScore: number;
}

export function createMarketWorld(
  seed: number, matchIndex: number, fullBag: readonly string[],
  pricesFor: (letter: string, round: number, rounds: number) => readonly number[],
  historicalScores: readonly number[], auctionStart = 30,
): MarketWorld {
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(matchIndex) || matchIndex < 0)
    throw new Error("Seed and nonnegative match index must be safe integers");
  if (!fullBag.length || fullBag.some(c => !/^[A-Z]$/.test(c)) || !Number.isInteger(auctionStart) || auctionStart < 0 || auctionStart >= fullBag.length)
    throw new Error("Bag must contain letters and leave at least one auction");
  if (!historicalScores.length || historicalScores.some(x => !Number.isFinite(x) || x < 0))
    throw new Error("Historical score pool must be nonempty and nonnegative");
  const mix = (x: number): number => {
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
  };
  const stream = (id: number): (() => number) => {
    let state = mix((seed >>> 0) ^ mix(matchIndex) ^ Math.imul(id, 0x9e3779b9));
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const deal = stream(1), price = stream(2), tie = stream(3), score = stream(4);
  const bag = [...fullBag];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(deal() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  const auctions = bag.slice(auctionStart), rivalBids: number[] = [], tieUniforms: number[] = [];
  for (let i = 0; i < auctions.length; i++) {
    const pool = pricesFor(auctions[i]!, i, auctions.length);
    if (!pool.length || pool.some(x => !Number.isInteger(x) || x < 0))
      throw new Error("Rival price pool must be nonempty nonnegative integers");
    rivalBids.push(pool[Math.floor(price() * pool.length)]!);
    tieUniforms.push(tie());
  }
  return { bag, rivalBids, tieUniforms, historicalScore: historicalScores[Math.floor(score() * historicalScores.length)]! };
}
