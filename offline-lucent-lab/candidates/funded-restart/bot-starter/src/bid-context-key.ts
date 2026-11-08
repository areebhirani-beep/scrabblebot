/** Pure cache identity for one auction decision; no SDK, RNG or timing side effects. */
export interface BidContext {
  fundedRestartEnabled?: boolean;
  auction: { id: bigint; letter: string };
  rack: ReadonlyMap<string, number>;
  balance: number;
  wordPending: boolean;
  view: {
    restartAcquisitionPrices?: readonly number[];
    score: number;
    bagLeft: number;
    bagStart: number;
    seatCount: number;
    firstPrice?: boolean;
    terminalEligible?: boolean;
    unseen: { total: number; counts: Readonly<Record<string, number>> };
  };
}

/**
 * A pending word only changes bid semantics when it disables the penultimate-
 * auction terminal proof. Ordinary Monte Carlo uses the subscribed rack until
 * its receipt arrives; changing pending status alone must not draw new samples
 * and consume the final bid revision. Public unseen changes remain meaningful.
 */
export function bidContextKey(context: BidContext): string {
  const { auction, rack, balance, wordPending, view: v } = context;
  const effectiveTerminalEligible = v.bagLeft === 1 && !!v.terminalEligible && !wordPending;
  return JSON.stringify([
    String(auction.id), auction.letter,
    [...rack].sort(([a], [b]) => a.localeCompare(b)),
    balance, v.score, v.bagLeft, v.bagStart, v.seatCount, v.firstPrice,
    effectiveTerminalEligible, v.unseen.total,
    Object.entries(v.unseen.counts).sort(([a], [b]) => a.localeCompare(b)),
    ...(context.fundedRestartEnabled ? [wordPending, v.restartAcquisitionPrices ?? null] : []),
  ]);
}
