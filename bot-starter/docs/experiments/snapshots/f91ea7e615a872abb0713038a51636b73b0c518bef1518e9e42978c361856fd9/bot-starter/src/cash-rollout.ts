import { FastEval, WordEngine, minus, toCounts, type Rack, type SearchBudget } from './engine.js';
import { rng, type Unseen } from './montecarlo.js';

export interface CashRolloutOptions {
  tileCost: number;
  futureWins: number;
  samples?: number;
  minLength?: number;
  maxCandidates?: number;
  margin?: number;
  standardErrors?: number;
  budgetMs?: number;
  now?: () => number;
}
export interface CashRolloutDecision {
  word: string;
  gain: number;
  standardError: number;
  samples: number;
  holdDraws: number;
  saleDraws: number;
}

// One-step liquidity rollout, NOT an optimal policy or learned rival model.
// The price is a declared calibration parameter. Only available cash funds
// sampled draws; sale rewards enter score once and cash only for affordability.
export function pricedCashout(engine: WordEngine, evalr: FastEval, rack: Rack,
  balance: number, unseen: Unseen, seed: number, options: CashRolloutOptions): CashRolloutDecision | undefined {
  if (!Number.isFinite(options.tileCost) || options.tileCost <= 0 ||
      !Number.isFinite(options.futureWins) || options.futureWins <= 0 ||
      !Number.isFinite(balance) || balance < 0 || (options.budgetMs ?? 12) <= 0) return;
  const now = options.now ?? (() => performance.now());
  const tracker = { operations: 0, exhausted: false };
  const budget: SearchBudget = { deadlineMs: now() + (options.budgetMs ?? 12), now,
    tracker, maxOperations: 250_000 };
  const pool: number[] = [];
  for (let i = 0; i < 26; i++) {
    const count = Math.max(0, Math.floor(unseen.counts[String.fromCharCode(65 + i)] ?? 0));
    for (let j = 0; j < count; j++) pool.push(i);
  }
  // Physical auction horizon bounds affordability; hidden opponent tiles in
  // the public unseen pool are a distributional assumption, never known draws.
  const future = Math.min(12, pool.length, Math.max(0, options.futureWins));
  const holdDraws = Math.min(future, balance / options.tileCost);
  if (future <= holdDraws) return;
  const candidates = engine.spellable(rack, options.minLength ?? 4, budget);
  // Preserve incumbent seven-letter cashouts rather than delaying them.
  if (tracker.exhausted || candidates.some(c => c.word.length >= 7)) return;
  const short = candidates.filter(c => c.word.length <= 6).slice(0, options.maxCandidates ?? 4);
  if (!short.length) return;
  const base = toCounts(rack);
  const arms = short.map(candidate => ({ ...candidate, residual: toCounts(minus(rack, candidate.word)),
    saleDraws: Math.min(future, (balance + candidate.score) / options.tileCost), sum: 0, sumSq: 0 }));
  const random = rng(seed);
  const samples = Math.max(0, Math.min(64, Math.floor(options.samples ?? 8)));
  let completed = 0;
  for (let sample = 0; sample < samples; sample++) {
    if (tracker.exhausted || now() >= budget.deadlineMs!) break;
    const rounding = random();
    const count = (n: number) => Math.min(pool.length, Math.floor(n) + Number(rounding < n % 1));
    const holdingCount = count(holdDraws);
    const samplePool = pool.slice();
    const futureTiles: number[] = [];
    const maxDraw = Math.max(...arms.map(a => count(a.saleDraws)));
    for (let d = 0; d < maxDraw; d++) {
      const index = Math.floor(random() * (samplePool.length - d)) + d;
      [samplePool[d], samplePool[index]] = [samplePool[index]!, samplePool[d]!];
      futureTiles.push(samplePool[d]!);
    }
    const scoreWith = (counts: Uint8Array, n: number): number => {
      const work = counts.slice();
      for (let d = 0; d < n; d++) work[futureTiles[d]!]!++;
      return evalr.evalCounts(work, 3, undefined, budget);
    };
    const holdingScore = scoreWith(base, holdingCount);
    const gains: number[] = [];
    for (const arm of arms) {
      // Keeping the rack permits this same split. Retain that feasible plan
      // so a greedy evaluator's discontinuity cannot fabricate a cash gain.
      const keepSplit = arm.score + scoreWith(arm.residual, holdingCount);
      const sold = arm.score + scoreWith(arm.residual, count(arm.saleDraws));
      gains.push(sold - Math.max(holdingScore, keepSplit));
      if (tracker.exhausted || now() >= budget.deadlineMs!) break;
    }
    // Every compared arm gets the same completed sample prefix.
    if (gains.length !== arms.length || tracker.exhausted || now() >= budget.deadlineMs!) break;
    for (let i = 0; i < arms.length; i++) {
      arms[i]!.sum += gains[i]!;
      arms[i]!.sumSq += gains[i]! ** 2;
    }
    completed++;
  }
  if (completed < Math.min(4, samples) || completed === 0) return;
  let best: CashRolloutDecision | undefined;
  let bestBound = options.margin ?? 1.5;
  for (const arm of arms) {
    const gain = arm.sum / completed;
    const variance = completed > 1 ? Math.max(0, (arm.sumSq - arm.sum ** 2 / completed) / (completed - 1)) : 0;
    const standardError = Math.sqrt(variance / completed);
    const bound = gain - (options.standardErrors ?? 1) * standardError;
    if (bound > bestBound) {
      bestBound = bound;
      best = { word: arm.word, gain, standardError, samples: completed, holdDraws, saleDraws: arm.saleDraws };
    }
  }
  return best;
}
