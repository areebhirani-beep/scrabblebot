import { WordEngine, plus, type Rack, type SearchBudget } from './engine.js';

export interface ImmediateCompletion {
  word: string;
  score: number;
  baselineScore: number;
  gain: number;
}

/**
 * Actual one-tile 7+ completion, not a predicted future draw. Requires no 7+
 * word in the old rack and a new single-word score beating exact old-rack
 * liquidation. This proves attainable score gain, not an optimal bid or cash
 * timing. Small-domain/time/operation limits fail closed.
 */
export function immediateCompletion(
  engine: WordEngine,
  rack: Rack,
  letter: string,
  budget: SearchBudget = {},
): ImmediateCompletion | undefined {
  if (!/^[A-Z]$/.test(letter)) return undefined;
  let size = 0;
  for (const [tile, count] of rack) {
    if (!/^[A-Z]$/.test(tile) || !Number.isInteger(count) || count < 0 || count > 10) return undefined;
    size += count;
  }
  if (size < 6 || size > 10) return undefined;
  const now = budget.now ?? (() => performance.now());
  const started = now();
  const ms = budget.budgetMs ?? 3;
  const requestedOps = budget.maxOperations ?? 20_000;
  if (!Number.isFinite(started) || !Number.isFinite(ms) || ms <= 0
    || !Number.isSafeInteger(requestedOps) || requestedOps <= 0) return undefined;
  const deadlineMs = Math.min(budget.deadlineMs ?? Infinity, started + Math.min(ms, 5));
  const tracker = budget.tracker ?? { operations: 0, exhausted: false };
  const maxOperations = Math.min(requestedOps, 30_000);
  const healthy = () => !tracker.exhausted && Number.isSafeInteger(tracker.operations)
    && tracker.operations >= 0 && tracker.operations < maxOperations && now() < deadlineMs;
  if (!healthy()) return undefined;
  const shared: SearchBudget = { now, deadlineMs, maxOperations, tracker };
  if (size >= 7) {
    const existing = engine.spellable(rack, 7, shared);
    if (existing.length > 0 || !healthy()) return undefined;
  }
  const baseline = engine.bestPlayout(rack, Infinity, Math.floor(size / 2), shared);
  if (!baseline.exact || !healthy()) return undefined;
  const completed = engine.spellable(plus(rack, letter), 7, shared);
  if (!healthy()) return undefined;
  const word = completed[0];
  if (!word || word.score <= baseline.score) return undefined;
  return { ...word, baselineScore: baseline.score, gain: word.score - baseline.score };
}
