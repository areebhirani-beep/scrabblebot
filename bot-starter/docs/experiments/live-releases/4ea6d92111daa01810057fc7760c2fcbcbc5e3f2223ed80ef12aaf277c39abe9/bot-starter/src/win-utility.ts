// A training-only prior used to shape marginal value, not a live win forecast.
// Keep the linear point term so exceeding a threshold never makes points worthless.
export function mixedScoreUtility(score: number, bonus: number, thresholds: readonly number[], bandwidth = 12): number {
  if (!(bonus > 0) || !thresholds.length) return score;
  if (!Number.isFinite(score) || !Number.isFinite(bonus) || !(bandwidth > 0) || !Number.isFinite(bandwidth))
    throw new Error('Invalid score utility parameters');
  let cdf = 0;
  for (const threshold of thresholds) {
    if (!Number.isFinite(threshold)) throw new Error('Invalid training threshold');
    cdf += Math.max(0, Math.min(1, .5 + (score - threshold) / (2 * bandwidth)));
  }
  return score + bonus * cdf / thresholds.length;
}
