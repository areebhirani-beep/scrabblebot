import { FastEval, WordEngine, type Rack, type SearchBudget } from './engine.js';

export interface ExactSmallEvalConfig {
  maxRack?: number;
  refineMs?: number;
  maxRefineOperations?: number;
}

/**
 * Diagnostic adapter: retain a completed greedy evaluation, then optionally
 * improve its feasible plan on a small rack. It does not promise an exact
 * score or marginal value. In particular, paired racks can receive different
 * refinement coverage; a future live caller must account for that explicitly.
 */
export class ExactSmallEval extends FastEval {
  readonly stats = {
    evaluations: 0,
    refinements: 0,
    improvements: 0,
    completedExact: 0,
    refinementTimeouts: 0,
  };
  private readonly maxRack: number;
  private readonly refineMs: number;
  private readonly maxRefineOperations: number;

  constructor(
    private readonly baseline: FastEval,
    private readonly engine: WordEngine,
    config: ExactSmallEvalConfig = {},
  ) {
    // Reuse the supplied evaluator's dictionary rather than building another.
    super([]);
    this.maxRack = Math.min(10, Math.max(0, Math.floor(config.maxRack ?? 10)));
    this.refineMs = Math.max(0, config.refineMs ?? 3);
    this.maxRefineOperations = Math.max(0, Math.floor(config.maxRefineOperations ?? 20_000));
  }

  override evalCounts(
    counts: Uint8Array,
    maxWords = 3,
    words?: string[],
    budget: SearchBudget = {},
  ): number {
    this.stats.evaluations++;
    const now = budget.now ?? (() => performance.now());
    const tracker = budget.tracker ?? { operations: 0, exhausted: false };
    const deadlineMs = budget.deadlineMs ?? now() + Math.max(0, budget.budgetMs ?? 8);
    const maxOperations = budget.maxOperations ?? 150_000;
    const shared: SearchBudget = { ...budget, now, tracker, deadlineMs, maxOperations };
    const original = counts.slice();
    const baselineCounts = original.slice();
    const baselineWords: string[] = [];
    const baselineScore = this.baseline.evalCounts(baselineCounts, maxWords, baselineWords, shared);
    let chosenScore = baselineScore;
    let chosenWords = baselineWords;
    let chosenCounts = baselineCounts;

    const started = now();
    if (started >= deadlineMs || tracker.operations >= maxOperations) tracker.exhausted = true;
    const size = original.reduce((sum, count) => sum + count, 0);
    if (!tracker.exhausted && size >= 2 && size <= this.maxRack
      && Number.isInteger(maxWords) && maxWords > 0 && maxWords <= 3
      && this.refineMs > 0 && this.maxRefineOperations > 0) {
      // Refinement is optional. Reserve at least three quarters of the hard
      // budget still available for the caller's remaining work/paired rack.
      const childDeadline = Math.min(started + this.refineMs, started + (deadlineMs - started) / 4);
      const childOperations = Math.min(this.maxRefineOperations,
        Math.floor((maxOperations - tracker.operations) / 4));
      if (childOperations > 0 && childDeadline > started) {
        const childTracker = { operations: 0, exhausted: false };
        const inventory: Rack = new Map();
        for (let index = 0; index < original.length; index++) {
          if (original[index]! > 0) inventory.set(String.fromCharCode(65 + index), original[index]!);
        }
        this.stats.refinements++;
        const refined = this.engine.bestPlayout(inventory, Infinity, maxWords,
          { now, deadlineMs: childDeadline, maxOperations: childOperations, tracker: childTracker });
        tracker.operations += childTracker.operations;
        const finished = now();
        // A child slice running out is not exhaustion of the caller's budget.
        if (finished >= deadlineMs || tracker.operations >= maxOperations) tracker.exhausted = true;
        const timedOut = childTracker.exhausted || finished >= childDeadline;
        if (timedOut) this.stats.refinementTimeouts++;
        else {
          // bestPlayout's exact flag also considers its depth limit. Never
          // upgrade a false flag merely because our objective allows 3 words.
          if (refined.exact) this.stats.completedExact++;
          if (refined.score > chosenScore) {
            chosenScore = refined.score;
            chosenWords = refined.words;
            chosenCounts = original.slice();
            for (const word of chosenWords) {
              for (const letter of word) chosenCounts[letter.charCodeAt(0) - 65]!--;
            }
            this.stats.improvements++;
          }
        }
      }
    }

    counts.set(chosenCounts);
    words?.push(...chosenWords);
    return chosenScore;
  }
}
