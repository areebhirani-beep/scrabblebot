import { WordEngine, minus, rackSize, type Candidate, type Rack, type SearchBudget } from './engine.js';

interface Plan {
  words: string[];
  score: number;
  complete: boolean;
}

/**
 * Experimental long-word cashing selector. All plays retain the caller's
 * minimum length. It first builds the ordinary greedy plan, then considers
 * at most eight first words with greedy continuations under the same budget.
 * A completed incumbent is replaced only by a legal plan worth more now.
 * This is a bounded packing heuristic, not an estimate of future rack value.
 */
export function chooseLongWords(
  engine: WordEngine,
  rack: Rack,
  minLen: number,
  budget: SearchBudget = {},
): string[] {
  const minimum = Math.max(2, Math.ceil(minLen));
  if (!Number.isFinite(minimum) || rackSize(rack) < minimum) return [];
  const now = budget.now ?? (() => performance.now());
  const tracker = budget.tracker ?? { operations: 0, exhausted: false };
  const shared: SearchBudget = {
    ...budget,
    now,
    tracker,
    deadlineMs: budget.deadlineMs ?? now() + Math.max(0, budget.budgetMs ?? 30),
    maxOperations: budget.maxOperations ?? 150_000,
  };
  const exhausted = (): boolean => {
    if (tracker.exhausted || tracker.operations >= shared.maxOperations! || now() >= shared.deadlineMs!) {
      tracker.exhausted = true;
      return true;
    }
    return false;
  };

  const greedy = (start: Rack, initial?: Candidate[]): Plan => {
    let remaining = start;
    let available = initial;
    const plan: Plan = { words: [], score: 0, complete: true };
    while (rackSize(remaining) >= minimum) {
      if (!available) {
        if (exhausted()) { plan.complete = false; break; }
        available = engine.spellable(remaining, minimum, shared);
      }
      const candidate = available[0];
      // Enumeration may return some legal candidates before its limit. They
      // can provide a valid partial plan, but cannot certify a full baseline.
      if (candidate) {
        plan.words.push(candidate.word);
        plan.score += candidate.score;
        remaining = minus(remaining, candidate.word);
      }
      if (tracker.exhausted) { plan.complete = false; break; }
      if (!candidate) break;
      available = undefined;
    }
    return plan;
  };

  if (exhausted()) return [];
  const firstWords = engine.spellable(rack, minimum, shared);
  let best = greedy(rack, firstWords);
  // If even the baseline hit its limit, return its valid partial plan and
  // spend no more time. No speculative alternative can erase an incumbent.
  if (!best.complete || exhausted()) return best.words;

  for (const first of firstWords.slice(0, 8)) {
    if (exhausted()) break;
    if (first.word === best.words[0]) continue;
    const rest = greedy(minus(rack, first.word));
    const score = first.score + rest.score;
    if (score > best.score) {
      best = { words: [first.word, ...rest.words], score, complete: rest.complete };
    }
    if (!rest.complete) break;
  }
  return best.words;
}
