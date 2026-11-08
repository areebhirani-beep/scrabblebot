import { FastEval, WordEngine, reward, type Rack, type SearchBudget } from './engine.js';
import { countDp } from './count-dp.js';

export interface CountDpEvalConfig {
  maxRack?: number;
  refineMs?: number;
  maxRefineOperations?: number;
}

export interface CountDpEvalCompletion {
  refined: boolean;
  usedRefinement: boolean;
  /** Exact only for this call's at-most-maxWords objective. */
  completeForMaxWords: boolean;
  softSliceExhausted: boolean;
  hardBudgetExhausted: boolean;
}

/**
 * Optional baseline-first evaluator; constructing it is the opt-in.
 * Both dictionary objects must describe the same game's legal words.
 * A soft refinement timeout cannot exhaust the parent's tracker. Completed
 * and truncated feasible refinements compete with the baseline by score.
 * This does not certify a marginal value between two approximate evaluations.
 */
export class CountDpEval extends FastEval {
  readonly stats = {
    evaluations: 0, refinements: 0, improvements: 0, truncatedImprovements: 0,
    completedForMaxWords: 0, softSliceExhaustions: 0, hardBudgetExhaustions: 0,
    invalidRefinements: 0,
  };
  lastCompletion: CountDpEvalCompletion = {
    refined: false, usedRefinement: false, completeForMaxWords: false,
    softSliceExhausted: false, hardBudgetExhausted: false,
  };
  private readonly maxRack: number;
  private readonly refineMs: number;
  private readonly maxRefineOperations: number;

  constructor(
    private readonly baseline: FastEval,
    private readonly engine: WordEngine,
    config: CountDpEvalConfig = {},
  ) {
    super([]);
    const bounded = (value: number, upper: number): number =>
      Number.isFinite(value) ? Math.max(0, Math.min(upper, value)) : 0;
    this.maxRack = Math.floor(bounded(config.maxRack ?? 10, 10));
    this.refineMs = bounded(config.refineMs ?? 3, 20);
    this.maxRefineOperations = Math.floor(bounded(config.maxRefineOperations ?? 20_000, 1_000_000));
  }

  override evalCounts(
    counts: Uint8Array,
    maxWords = 3,
    words?: string[],
    budget: SearchBudget = {},
  ): number {
    this.stats.evaluations++;
    const completion: CountDpEvalCompletion = {
      refined: false, usedRefinement: false, completeForMaxWords: false,
      softSliceExhausted: false, hardBudgetExhausted: false,
    };
    this.lastCompletion = completion;
    const now = budget.now ?? (() => performance.now());
    const tracker = budget.tracker ?? { operations: 0, exhausted: false };
    const deadlineMs = budget.deadlineMs ?? now() + Math.max(0, budget.budgetMs ?? 8);
    const maxOperations = budget.maxOperations ?? 150_000;
    const shared: SearchBudget = { ...budget, now, tracker, deadlineMs, maxOperations };
    const original = counts.slice();
    let chosenCounts = original.slice();
    let chosenWords: string[] = [];
    let chosenScore = this.baseline.evalCounts(chosenCounts, maxWords, chosenWords, shared);
    const checkParent = (): boolean => {
      if (now() >= deadlineMs || tracker.operations >= maxOperations) tracker.exhausted = true;
      return tracker.exhausted;
    };
    checkParent();
    const size = original.reduce((sum, count) => sum + count, 0);
    if (!tracker.exhausted && original.length === 26 && size >= 2 && size <= this.maxRack
      && Number.isInteger(maxWords) && maxWords >= 1 && maxWords <= 3
      && this.refineMs > 0 && this.maxRefineOperations > 0) {
      const started = now();
      const childMs = Math.min(this.refineMs, Math.max(0, deadlineMs - started) / 4);
      const childOps = Math.min(this.maxRefineOperations,
        Math.floor(Math.max(0, maxOperations - tracker.operations) / 4));
      if (childMs > 0 && childOps > 0) {
        const childDeadline = Math.min(deadlineMs, started + childMs);
        const childTracker = { operations: 0, exhausted: false };
        const rack: Rack = new Map();
        for (let i = 0; i < 26; i++) {
          if (original[i]! > 0) rack.set(String.fromCharCode(65 + i), original[i]!);
        }
        completion.refined = true;
        this.stats.refinements++;
        const refined = countDp(this.engine, rack, maxWords,
          { now, deadlineMs: childDeadline, budgetMs: childMs,
            maxOperations: childOps, tracker: childTracker });
        tracker.operations += childTracker.operations;
        const finished = now();
        completion.softSliceExhausted = childTracker.exhausted || finished >= childDeadline;
        if (completion.softSliceExhausted) this.stats.softSliceExhaustions++;
        checkParent();

        // Validate feasibility before accepting or describing an exact result.
        // This also prevents Uint8 underflow if a future solver regresses.
        const residual = original.slice();
        let valid = refined.words.length <= maxWords && Number.isFinite(refined.score);
        let actualScore = 0;
        for (const word of refined.words) {
          if (word.length < 2 || !/^[A-Z]+$/.test(word)) { valid = false; break; }
          actualScore += reward(word);
          for (const letter of word) {
            const i = letter.charCodeAt(0) - 65;
            if (residual[i]! === 0) { valid = false; break; }
            residual[i]!--;
          }
          if (!valid) break;
        }
        valid = valid && actualScore === refined.score;
        if (!valid) this.stats.invalidRefinements++;
        else {
          if (refined.score > chosenScore) {
            chosenScore = refined.score;
            chosenWords = refined.words;
            chosenCounts = residual;
            completion.usedRefinement = true;
            this.stats.improvements++;
            if (!refined.complete) this.stats.truncatedImprovements++;
          }
          completion.completeForMaxWords = refined.complete && refined.score === chosenScore
            && !completion.softSliceExhausted && !tracker.exhausted;
        }
      }
    }
    checkParent();
    completion.hardBudgetExhausted = tracker.exhausted;
    if (tracker.exhausted) {
      completion.completeForMaxWords = false;
      this.stats.hardBudgetExhaustions++;
    }
    if (completion.completeForMaxWords) this.stats.completedForMaxWords++;
    counts.set(chosenCounts);
    words?.push(...chosenWords);
    return chosenScore;
  }
}
