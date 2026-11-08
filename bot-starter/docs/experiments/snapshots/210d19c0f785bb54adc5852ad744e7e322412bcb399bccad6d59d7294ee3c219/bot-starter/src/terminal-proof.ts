import { plus, rackSize, type Rack, type SearchBudget, WordEngine } from './engine.js';

export interface TerminalGainProof {
  /** One legal word to submit after receiving the auctioned letter. */
  word: string;
  score: number;
  /** Proven optimum for liquidating the original rack. */
  baselineScore: number;
  gain: number;
}

/**
 * Certify a single enhanced-rack word beating every original-rack split.
 * This proves score potential, not network delivery or an all-in bid policy.
 * The caller must validate auction timing, opponents and pending word receipts.
 */
export function proveTerminalGain(
  engine: WordEngine,
  rack: Rack,
  letter: string,
  budget: SearchBudget = {},
): TerminalGainProof | undefined {
  if (!/^[A-Z]$/.test(letter)) return undefined;
  let size = 0;
  for (const [tile, count] of rack) {
    if (!/^[A-Z]$/.test(tile) || !Number.isInteger(count) || count < 0 || count > 98) return undefined;
    size += count;
  }
  if (size >= 98) return undefined;

  const now = budget.now ?? (() => performance.now());
  const started = now();
  const duration = budget.budgetMs ?? 20;
  const operations = budget.maxOperations ?? 150_000;
  if (!Number.isFinite(started) || !Number.isFinite(duration) || duration <= 0 ||
      !Number.isSafeInteger(operations) || operations <= 0) return undefined;
  const deadlineMs = Math.min(budget.deadlineMs ?? Infinity, started + duration);
  if (!(deadlineMs > started)) return undefined;
  const tracker = budget.tracker ?? { operations: 0, exhausted: false };
  if (tracker.exhausted || !Number.isSafeInteger(tracker.operations) || tracker.operations < 0) return undefined;
  const shared: SearchBudget = { now, deadlineMs, tracker, maxOperations: Math.min(150_000, operations) };

  // At most floor(n/2) words can consume n tiles. Infinity removes beam
  // pruning, while the shared deadline and operation cap still bound work.
  const baseline = engine.bestPlayout(rack, Infinity, Math.floor(rackSize(rack) / 2), shared);
  if (!baseline.exact || tracker.exhausted || now() >= deadlineMs) return undefined;
  const candidates = engine.spellable(plus(rack, letter), 2, shared);
  if (tracker.exhausted || now() >= deadlineMs) return undefined;
  const word = candidates.find(candidate => candidate.score > baseline.score);
  if (!word) return undefined;
  return { word: word.word, score: word.score, baselineScore: baseline.score, gain: word.score - baseline.score };
}
