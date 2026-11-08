import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FastEval, WordEngine, type Rack, type SearchBudget } from './engine.js';
import { MonteCarlo } from './montecarlo.js';

const rack = (letters: string): Rack => {
  const result: Rack = new Map();
  for (const letter of letters) result.set(letter, (result.get(letter) ?? 0) + 1);
  return result;
};

function countedEvaluator() {
  let calls = 0;
  const evaluator = { evalCounts(counts: Uint8Array) {
    calls++;
    const score = 2 + 3 * counts[0]!;
    // Production evaluation consumes its input. Cache keys must describe the
    // incoming rack, not the emptied array after evaluation.
    counts.fill(0);
    return score;
  } } as unknown as FastEval;
  return { evaluator, calls: () => calls };
}

test('zero-future Monte Carlo evaluates one deterministic pair', () => {
  const counted = countedEvaluator();
  const value = new MonteCarlo(counted.evaluator).value(rack('X'), 'A',
    { counts: {}, total: 0 }, 0, 24, 7, 300, () => 0);
  assert.equal(value, 3);
  assert.equal(counted.calls(), 2);
});

test('repeated sampled racks reuse complete scores despite destructive evaluation', () => {
  const counted = countedEvaluator();
  const value = new MonteCarlo(counted.evaluator).value(rack('X'), 'A',
    { counts: { E: 1 }, total: 1 }, 1, 24, 7, 300, () => 0);
  assert.equal(value, 3);
  assert.equal(counted.calls(), 2);
});

test('evaluation caches belong to one valuation call only', () => {
  const counted = countedEvaluator();
  const mc = new MonteCarlo(counted.evaluator);
  for (let turn = 0; turn < 2; turn++) {
    assert.equal(mc.value(rack('X'), 'A', { counts: { E: 1 }, total: 1 },
      1, 8, turn, 300, () => 0), 3);
  }
  assert.equal(counted.calls(), 4);
});

test('an incomplete pair contributes nothing and cannot poison the next valuation', () => {
  let calls = 0;
  let interrupt = true;
  const evaluator = { evalCounts(counts: Uint8Array, _maxWords: number,
    _words: unknown, budget: SearchBudget) {
    calls++;
    if (interrupt && counts[0]! > 0) {
      budget.tracker!.exhausted = true;
      return 999;
    }
    return 2 + 3 * counts[0]!;
  } } as unknown as FastEval;
  const mc = new MonteCarlo(evaluator);
  const value = () => mc.value(rack('X'), 'A', { counts: { E: 1 }, total: 1 },
    1, 24, 7, 300, () => 0);
  assert.equal(value(), 0);
  interrupt = false;
  assert.equal(value(), 3);
  assert.equal(calls, 4);
});

test('deduplication retains the nonnegative greedy fallback without claiming exact valuation', () => {
  const dictionary = ['GET', 'TUX', 'GUEST', 'GEST'];
  const fast = new FastEval(dictionary);
  const engine = new WordEngine(dictionary);
  // This is a known remaining approximation: GEST(7)+TUX(10) beats the
  // baseline GET(4)+TUX(10), but greedy GUEST(12) masks the improvement.
  assert.equal(engine.bestPlayout(rack('GETTUX'), 16, 6).score, 14);
  assert.equal(engine.bestPlayout(rack('GETTUXS'), 16, 6).score, 17);
  assert.equal(new MonteCarlo(fast).value(rack('GETTUX'), 'S',
    { counts: {}, total: 0 }, 0, 24, 7), 0);
});
