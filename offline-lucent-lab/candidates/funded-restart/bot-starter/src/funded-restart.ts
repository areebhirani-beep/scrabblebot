/** Experimental acquisition capacity, not a calibrated prediction of tile wins. */
export interface RestartState {
  balance: number;
  score: number;
  rackSize: number;
  bagLeft: number;
  bagStart: number;
  seatCount: number;
  wordPending?: boolean;
  /** Positive paid prices from CLOSED auctions, in chronological order. */
  restartAcquisitionPrices?: readonly number[];
}

export function fundedRestartHorizon(baseline: number, v: RestartState): number {
  if (!Number.isFinite(baseline) || baseline < 0) return 0;
  if (![v.balance, v.score, v.rackSize, v.bagLeft, v.bagStart, v.seatCount].every(Number.isFinite)
    || v.balance <= 0 || v.score <= 0 || v.wordPending !== false || v.seatCount !== 6
    || !Number.isInteger(v.rackSize) || v.rackSize < 0 || v.rackSize > 2
    || !Number.isInteger(v.bagLeft) || !Number.isInteger(v.bagStart) || v.bagStart <= 0
    || v.bagLeft < 3 || v.bagLeft > Math.ceil(v.bagStart * .30)) return baseline;

  // No zero-price/free future tiles and no assumed future word income. Reserve
  // one acquisition for the offered tile before funding any additional draws.
  const observed = v.restartAcquisitionPrices?.slice(-16);
  if (!observed || observed.length < 8
    || observed.some(x => !Number.isFinite(x) || x < 1 || !Number.isInteger(x))) return baseline;
  const sorted = observed.slice().sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[half]! : (sorted[half - 1]! + sorted[half]!) / 2;
  const cost = Math.ceil(median);
  const affordableFuture = Math.max(0, Math.floor(v.balance / cost) - 1);
  const usableFuture = Math.max(0, v.bagLeft - 1); // external client cannot use final award
  // At most one third of usable opportunities; cap six to bound MC work.
  // This deliberately optimistic capture cap is an experimental hypothesis.
  const capacity = Math.min(6, Math.floor(usableFuture / 3), affordableFuture);
  return Math.max(baseline, capacity);
}
