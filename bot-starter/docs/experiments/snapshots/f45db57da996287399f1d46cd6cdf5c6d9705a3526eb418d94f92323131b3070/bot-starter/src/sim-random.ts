/** Exogenous match randomness, fixed before any policy acts. */
export interface SimWorld {
  readonly startingRacks: readonly (readonly string[])[];
  readonly auctions: readonly string[];
  /** Each round has a uniform ordering of every seat, not only bidders. */
  readonly tieOrder: readonly (readonly number[])[];
  /** One server-simulated-bot jitter per seat and auction, including skipped bids. */
  readonly bidJitter: readonly (readonly number[])[];
}

export function createSimWorld(seed: number, matchIndex: number, fullBag: readonly string[], seats: number): SimWorld {
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(matchIndex) || matchIndex < 0)
    throw new Error("Seed and nonnegative match index must be safe integers");
  if (!Number.isInteger(seats) || seats < 2 || seats * 5 >= fullBag.length || fullBag.some(l => !/^[A-Z]$/.test(l)))
    throw new Error("Seats must leave at least one valid auction tile after five-tile deals");
  const mix = (value: number): number => {
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
    return (value ^ (value >>> 16)) >>> 0;
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
  const shuffle = <T>(values: T[], random: () => number): T[] => {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j]!, values[i]!];
    }
    return values;
  };
  const deal = shuffle([...fullBag], stream(1));
  const startingRacks = Array.from({ length: seats }, (_, seat) => Object.freeze(deal.slice(seat * 5, seat * 5 + 5)));
  const auctions = deal.slice(seats * 5);
  const tie = stream(2), jitter = stream(3);
  const tieOrder = auctions.map(() => Object.freeze(shuffle(Array.from({ length: seats }, (_, seat) => seat), tie)));
  const bidJitter = auctions.map(() => Object.freeze(Array.from({ length: seats }, () => Math.floor(jitter() * 5) - 2)));
  return Object.freeze({ startingRacks: Object.freeze(startingRacks), auctions: Object.freeze(auctions),
    tieOrder: Object.freeze(tieOrder), bidJitter: Object.freeze(bidJitter) });
}
