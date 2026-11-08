/**
 * Bounded acquisition lookahead, not an unconstrained prediction of future wins.
 * bagLeft excludes the tile currently on the block. The final future tile cannot
 * be played by an external client, so it is excluded before estimating wins.
 *
 * The opt-in six-seat experiment uses a fixed cap of 10, independent of the
 * finite nonnegative baseHorizon. Other table sizes retain the baseline formula.
 * Invalid numeric inputs fail closed to no future lookahead.
 */
export function expectedFutureWins(
  bagLeft: number,
  seatCount: number,
  baseHorizon: number,
  neutralSix = false,
): number {
  if (!Number.isFinite(bagLeft) || !Number.isFinite(seatCount)
    || !Number.isFinite(baseHorizon)
    || bagLeft < 0 || seatCount < 0 || baseHorizon < 0) return 0;

  const usableFuture = Math.max(0, bagLeft - 1);
  const share = 1 / Math.max(1, seatCount - 1);
  const candidate = neutralSix && seatCount === 6;
  const factor = candidate ? 0.8 : 0.5;
  const horizon = candidate ? 10 : baseHorizon;
  return Math.min(horizon, usableFuture,
    Math.max(0, Math.round(usableFuture * share * factor)));
}
