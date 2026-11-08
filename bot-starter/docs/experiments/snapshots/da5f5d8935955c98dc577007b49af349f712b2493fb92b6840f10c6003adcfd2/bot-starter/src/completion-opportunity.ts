import { LETTER_VALUE, WordEngine, plus, type Rack, type SearchBudget } from './engine.js';

export interface OpportunityContext {
  balance: number;
  bagLeft: number;
  unseen: { total: number; counts: Readonly<Record<string, number>> };
  minAvailableUpside?: number;
}

export interface CompletionAlternative {
  letter: string;
  word: string;
  score: number;
  appearanceProbability: number;
  availableUpside: number;
}

/** Uniform unseen-pool appearance probability, not the chance of winning a bid. */
export function appearanceProbability(total: number, copies: number, draws: number): number {
  if (![total, copies, draws].every(Number.isSafeInteger)
    || total <= 0 || total > 1000 || copies < 0 || copies > total || draws < 0) return 0;
  const take = Math.min(draws, total);
  if (!copies || !take) return 0;
  if (take > total - copies) return 1;
  let miss = 1;
  for (let i = 0; i < take; i++) miss *= (total - copies - i) / (total - i);
  return Math.max(0, Math.min(1, 1 - miss));
}

/**
 * A witness against overriding ordinary MC for a cheap immediate completion.
 * Only removes the extra floor; it never changes the ordinary bid/cash policy.
 * Unknown inventory, little cash/time, or incomplete bounded search retains
 * the unguarded floor. Availability is a heuristic, not expected auction gain.
 */
export function betterCompletionOpportunity(
  engine: WordEngine, rack: Rack, offered: string, completionScore: number,
  context: OpportunityContext, budget: SearchBudget = {},
): CompletionAlternative | undefined {
  const threshold = context.minAvailableUpside ?? 12;
  if (!Number.isFinite(completionScore) || completionScore <= 0
    || !Number.isFinite(threshold) || threshold <= 0
    || !Number.isFinite(context.balance) || context.balance < 24
    || !Number.isSafeInteger(context.bagLeft) || context.bagLeft - 1 < 18
    || !/^[A-Z]$/.test(offered)) return undefined;
  let size = 0;
  for (const [tile, count] of rack) {
    if (!/^[A-Z]$/.test(tile) || !Number.isSafeInteger(count) || count < 0 || count > 10) return undefined;
    size += count;
  }
  if (size < 6 || size > 10) return undefined;
  const entries = Object.entries(context.unseen.counts);
  if (!Number.isSafeInteger(context.unseen.total) || context.unseen.total <= 0 || context.unseen.total > 1000
    || entries.some(([letter, count]) => !/^[A-Z]$/.test(letter) || !Number.isSafeInteger(count) || count < 0)
    || entries.reduce((sum, [, count]) => sum + count, 0) !== context.unseen.total) return undefined;
  const now = budget.now ?? (() => performance.now());
  const started = now();
  const duration = budget.budgetMs ?? 2;
  const requestedOps = budget.maxOperations ?? 20_000;
  if (!Number.isFinite(started) || !Number.isFinite(duration) || duration <= 0
    || !Number.isSafeInteger(requestedOps) || requestedOps <= 0) return undefined;
  const deadlineMs = Math.min(budget.deadlineMs ?? Infinity, started + Math.min(3, duration));
  const tracker = budget.tracker ?? { operations: 0, exhausted: false };
  const maxOperations = Math.min(20_000, requestedOps);
  const healthy = () => !tracker.exhausted && Number.isSafeInteger(tracker.operations)
    && tracker.operations >= 0 && tracker.operations < maxOperations && now() < deadlineMs;
  const shared: SearchBudget = { now, deadlineMs, maxOperations, tracker };
  // A single feasible witness suffices; high-face alternatives are checked first.
  entries.sort(([a], [b]) => (LETTER_VALUE[b] ?? 0) - (LETTER_VALUE[a] ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
  for (const [letter, copies] of entries) {
    if (!healthy()) return undefined;
    if (!copies || letter === offered) continue;
    const probability = appearanceProbability(context.unseen.total, copies, context.bagLeft - 1);
    const candidate = engine.spellable(plus(rack, letter), 7, shared)[0];
    if (!healthy()) return undefined;
    if (!candidate) continue;
    const availableUpside = probability * (candidate.score - completionScore);
    if (availableUpside >= threshold) return {
      letter, ...candidate, appearanceProbability: probability, availableUpside,
    };
  }
  return undefined;
}
