import { WordEngine, type Rack, type SearchBudget } from './engine.js';

export interface CountDpLimits {
  maxTiles?: number;
  maxStates?: number;
}

export interface CountDpResult {
  words: string[];
  score: number;
  /** Optimal for at most maxWords, not necessarily for an unlimited partition. */
  complete: boolean;
  /** Number of possible residual-count states, excluding word-depth layers. */
  states: number;
}

/**
 * Optional small-rack solver. Enumerates the dictionary once, then memoizes
 * residual counts in mixed radix. Repeated word types remain available when
 * enough copies of their letters remain. Input inventory is never mutated.
 *
 * The result is always a feasible incumbent, including when complete is false.
 * A shared tracker includes enumeration, encoding, greedy seeding and DP work.
 * One operation covers one bounded candidate check (at most 16 letters).
 * Hard ceilings: 16 tiles, 65,536 count states, 262,144 memo cells, 20ms and
 * 1,000,000 total tracker operations. Defaults target racks of at most 10 tiles.
 */
export function countDp(
  engine: WordEngine,
  rack: Rack,
  maxWords = 3,
  budget: SearchBudget = {},
  limits: CountDpLimits = {},
): CountDpResult {
  let states = 1;
  const empty = (): CountDpResult => ({ words: [], score: 0, complete: false, states });
  const tileLimit = limits.maxTiles ?? 10;
  const stateLimit = limits.maxStates ?? 4096;
  if (!Number.isInteger(tileLimit) || tileLimit < 0 || tileLimit > 16
    || !Number.isInteger(stateLimit) || stateLimit < 1 || stateLimit > 65_536
    || !Number.isInteger(maxWords) || maxWords < 0) return empty();

  const letters: string[] = [];
  const bases: number[] = [];
  const strides: number[] = [];
  let tiles = 0;
  for (const [letter, count] of rack) {
    if (!/^[A-Z]$/.test(letter) || !Number.isInteger(count) || count < 0) return empty();
    if (count === 0) continue;
    tiles += count;
    if (tiles > tileLimit) return empty();
    letters.push(letter);
    strides.push(states);
    bases.push(count + 1);
    states *= count + 1;
    if (states > stateLimit) return empty();
  }
  const depth = Math.min(maxWords, Math.floor(tiles / 2));
  if (depth === 0) return { words: [], score: 0, complete: true, states };
  if (states * (depth + 1) > 262_144) return empty();

  const now = budget.now ?? (() => performance.now());
  const started = now();
  const ms = budget.budgetMs ?? 8;
  const requestedOperations = budget.maxOperations ?? 150_000;
  const tracker = budget.tracker ?? { operations: 0, exhausted: false };
  if (!Number.isFinite(started) || !Number.isFinite(ms) || ms < 0
    || !Number.isFinite(requestedOperations) || requestedOperations < 0
    || !Number.isFinite(tracker.operations) || tracker.operations < 0
    || (budget.deadlineMs !== undefined && Number.isNaN(budget.deadlineMs))) return empty();
  const deadlineMs = Math.min(started + Math.min(ms, 20), budget.deadlineMs ?? Infinity);
  const maxOperations = Math.min(Math.floor(requestedOperations), 1_000_000);
  const check = (): boolean => {
    if (tracker.exhausted) return false;
    const time = now();
    if (!Number.isFinite(time) || time >= deadlineMs || tracker.operations >= maxOperations) {
      tracker.exhausted = true;
      return false;
    }
    tracker.operations++;
    return true;
  };
  if (!check()) return empty();
  const candidates = engine.spellable(rack, 2,
    { now, deadlineMs, maxOperations, tracker });
  // Even partial enumeration contains valid, root-feasible words and is sorted.
  let incumbent = candidates.length > 0
    ? { words: [candidates[0]!.word], score: candidates[0]!.score }
    : { words: [] as string[], score: 0 };
  const fallback = (): CountDpResult => ({ ...incumbent, complete: false, states });
  if (!check()) return fallback();
  if (candidates.length === 0) return { ...incumbent, complete: true, states };

  const index = new Map(letters.map((letter, i) => [letter, i]));
  const entries: { word: string; score: number; delta: number; needs: [number, number][] }[] = [];
  for (const candidate of candidates) {
    if (!check()) return fallback();
    const counts = new Uint8Array(letters.length);
    for (const letter of candidate.word) counts[index.get(letter)!]++;
    let delta = 0;
    const needs: [number, number][] = [];
    for (let i = 0; i < counts.length; i++) {
      if (counts[i]! > 0) {
        needs.push([i, counts[i]!]);
        delta += counts[i]! * strides[i]!;
      }
    }
    entries.push({ ...candidate, delta, needs });
  }
  const fits = (state: number, needs: [number, number][]): boolean => {
    for (const [i, count] of needs) {
      if (Math.floor(state / strides[i]!) % bases[i]! < count) return false;
    }
    return true;
  };

  // A complete greedy plan survives interruption anywhere in the DP search.
  let greedyState = states - 1;
  let greedyScore = 0;
  const greedyWords: string[] = [];
  for (let k = 0; k < depth; k++) {
    let chosen = false;
    for (const entry of entries) {
      if (!check()) return fallback();
      if (!fits(greedyState, entry.needs)) continue;
      greedyWords.push(entry.word);
      greedyScore += entry.score;
      greedyState -= entry.delta;
      incumbent = { words: greedyWords.slice(), score: greedyScore };
      chosen = true;
      break;
    }
    if (!chosen) break;
  }

  if (!check()) return fallback();
  const scores = new Int32Array(states * (depth + 1)).fill(-1);
  const choices = new Int32Array(scores.length).fill(-1);
  const solve = (state: number, k: number): number => {
    if (k === 0 || state === 0) return 0;
    const cell = k * states + state;
    if (scores[cell]! >= 0) return scores[cell]!;
    if (!check()) return 0;
    let best = 0;
    for (let i = 0; i < entries.length; i++) {
      if (!check()) break;
      const entry = entries[i]!;
      if (!fits(state, entry.needs)) continue;
      const score = entry.score + solve(state - entry.delta, k - 1);
      if (score > best) {
        best = score;
        choices[cell] = i;
      }
      if (tracker.exhausted) break;
    }
    scores[cell] = best;
    return best;
  };
  const score = solve(states - 1, depth);
  if (score > incumbent.score) {
    const words: string[] = [];
    let state = states - 1;
    for (let k = depth; k > 0; k--) {
      const choice = choices[k * states + state]!;
      if (choice < 0) break;
      const entry = entries[choice]!;
      words.push(entry.word);
      state -= entry.delta;
    }
    incumbent = { words, score };
  }
  // This final check conservatively rejects completeness at the exact deadline.
  const complete = check();
  return { ...incumbent, complete, states };
}
