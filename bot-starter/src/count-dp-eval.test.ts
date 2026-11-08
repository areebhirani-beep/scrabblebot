import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CountDpEval } from './count-dp-eval.js';
import { FastEval, WordEngine, reward, type Candidate, type Rack, type SearchBudget } from './engine.js';

const dictionary = ['GET', 'TUX', 'GUEST', 'GEST'];
const countsFor = (letters: string): Uint8Array => {
  const counts = new Uint8Array(26);
  for (const letter of letters) counts[letter.charCodeAt(0) - 65]!++;
  return counts;
};
const budget = () => ({ now: () => 0, maxOperations: 1_000_000, budgetMs: 8 });
const make = () => new CountDpEval(new FastEval(dictionary), new WordEngine(dictionary));

test('DP adapter improves the greedy trap with consistent score, words and residuals', () => {
  const evaluator = make();
  const counts = countsFor('GETTUXS');
  const words: string[] = ['earlier'];
  assert.equal(evaluator.evalCounts(counts, 3, words, budget()), 17);
  assert.deepEqual(new Set(words.slice(1)), new Set(['GEST', 'TUX']));
  assert.equal(words.slice(1).reduce((sum, word) => sum + reward(word), 0), 17);
  assert.deepEqual(counts, new Uint8Array(26));
  assert.equal(evaluator.lastCompletion.completeForMaxWords, true);
  assert.equal(evaluator.lastCompletion.usedRefinement, true);
  assert.equal(evaluator.stats.improvements, 1);
});

test('disabled or out-of-domain refinement preserves baseline outputs exactly', () => {
  for (const config of [{ maxRack: 0 }, { maxRack: 6 }, { refineMs: 0 }, { maxRefineOperations: 0 }]) {
    const baseline = new FastEval(dictionary);
    const evaluator = new CountDpEval(baseline, new WordEngine(dictionary), config);
    const expectedCounts = countsFor('GETTUXS');
    const actualCounts = expectedCounts.slice();
    const expectedWords: string[] = [];
    const actualWords: string[] = [];
    const expectedScore = baseline.evalCounts(expectedCounts, 3, expectedWords, budget());
    assert.equal(evaluator.evalCounts(actualCounts, 3, actualWords, budget()), expectedScore);
    assert.deepEqual(actualCounts, expectedCounts);
    assert.deepEqual(actualWords, expectedWords);
    assert.equal(evaluator.lastCompletion.refined, false);
  }
});

test('explicit completion respects maxWords even when usable letters remain', () => {
  const evaluator = new CountDpEval(new FastEval(['AT']), new WordEngine(['AT']));
  const counts = countsFor('AAAATTTT');
  const words: string[] = [];
  assert.equal(evaluator.evalCounts(counts, 3, words, budget()), 6);
  assert.deepEqual(words, ['AT', 'AT', 'AT']);
  assert.deepEqual(counts, countsFor('AT'));
  assert.equal(evaluator.lastCompletion.completeForMaxWords, true);
  assert.equal(evaluator.stats.completedForMaxWords, 1);
  assert.equal(evaluator.lastCompletion.usedRefinement, false);
});

test('one-word objective and unsupported word limits retain the correct baseline contract', () => {
  const evaluator = make();
  const counts = countsFor('GETTUXS');
  const words: string[] = [];
  assert.equal(evaluator.evalCounts(counts, 1, words, budget()), 12);
  assert.deepEqual(words, ['GUEST']);
  assert.deepEqual(counts, countsFor('TX'));
  assert.equal(evaluator.lastCompletion.completeForMaxWords, true);
  for (const maxWords of [0, 4]) {
    const expected = countsFor('GETTUXS');
    const actual = expected.slice();
    const expectedWords: string[] = [];
    const actualWords: string[] = [];
    const expectedScore = new FastEval(dictionary).evalCounts(expected, maxWords, expectedWords, budget());
    assert.equal(evaluator.evalCounts(actual, maxWords, actualWords, budget()), expectedScore);
    assert.deepEqual(actual, expected);
    assert.deepEqual(actualWords, expectedWords);
    assert.equal(evaluator.lastCompletion.refined, false);
    assert.equal(evaluator.lastCompletion.completeForMaxWords, false);
  }
});

test('optional child exhaustion does not poison the shared parent tracker', () => {
  const evaluator = new CountDpEval(new FastEval(dictionary), new WordEngine(dictionary),
    { maxRefineOperations: 1 });
  const tracker = { operations: 0, exhausted: false };
  const counts = countsFor('GETTUXS');
  const words: string[] = [];
  assert.equal(evaluator.evalCounts(counts, 3, words, { ...budget(), tracker }), 12);
  assert.deepEqual(words, ['GUEST']);
  assert.deepEqual(counts, countsFor('TX'));
  assert.equal(tracker.exhausted, false);
  assert.equal(evaluator.lastCompletion.softSliceExhausted, true);
  assert.equal(evaluator.lastCompletion.hardBudgetExhausted, false);
  assert.equal(evaluator.lastCompletion.completeForMaxWords, false);
});

// A deterministic stand-in for partially enumerated legal candidates allows
// testing interruption bookkeeping without depending on machine timing.
class PartialEngine extends WordEngine {
  constructor(private readonly candidate: Candidate, private readonly advance?: () => void) { super(['AT', 'CAT']); }
  override spellable(_rack: Rack, _minLen = 2, options: SearchBudget = {}): Candidate[] {
    options.tracker!.operations += 7;
    options.tracker!.exhausted = true;
    this.advance?.();
    return [this.candidate];
  }
}

test('a feasible truncated improvement is accepted and child operations merge exactly once', () => {
  const baseline = new FastEval(['AT']);
  const baselineTracker = { operations: 0, exhausted: false };
  baseline.evalCounts(countsFor('CAT'), 3, undefined, { ...budget(), tracker: baselineTracker });
  const evaluator = new CountDpEval(baseline, new PartialEngine({ word: 'CAT', score: 5 }));
  const tracker = { operations: 0, exhausted: false };
  const counts = countsFor('CAT');
  const words: string[] = [];
  assert.equal(evaluator.evalCounts(counts, 3, words, { ...budget(), tracker }), 5);
  assert.deepEqual(words, ['CAT']);
  assert.deepEqual(counts, new Uint8Array(26));
  assert.equal(tracker.operations, baselineTracker.operations + 8);
  assert.equal(tracker.exhausted, false);
  assert.equal(evaluator.stats.truncatedImprovements, 1);
  assert.equal(evaluator.lastCompletion.completeForMaxWords, false);
});

test('malformed refinement cannot underflow inventory or replace the baseline', () => {
  for (const candidate of [{ word: 'CATT', score: 9 }, { word: 'CAT', score: 99 }]) {
    const evaluator = new CountDpEval(new FastEval(['AT']), new PartialEngine(candidate));
    const counts = countsFor('CAT');
    const words: string[] = [];
    assert.equal(evaluator.evalCounts(counts, 3, words, budget()), 2);
    assert.deepEqual(words, ['AT']);
    assert.deepEqual(counts, countsFor('C'));
    assert.equal(evaluator.stats.invalidRefinements, 1);
    assert.equal(evaluator.lastCompletion.completeForMaxWords, false);
  }
});

test('actual hard deadline expiry during refinement exhausts the parent', () => {
  let clock = 0;
  const evaluator = new CountDpEval(new FastEval(['AT']),
    new PartialEngine({ word: 'CAT', score: 5 }, () => { clock = 10; }));
  const tracker = { operations: 0, exhausted: false };
  const counts = countsFor('CAT');
  const words: string[] = [];
  assert.equal(evaluator.evalCounts(counts, 3, words,
    { now: () => clock, deadlineMs: 8, maxOperations: 1000, tracker }), 5);
  assert.equal(tracker.exhausted, true);
  assert.equal(evaluator.lastCompletion.hardBudgetExhausted, true);
  assert.equal(evaluator.lastCompletion.completeForMaxWords, false);
  assert.equal(evaluator.stats.hardBudgetExhaustions, 1);
  assert.deepEqual(counts, new Uint8Array(26));
});

test('an already expired parent prevents baseline consumption and refinement', () => {
  const evaluator = make();
  const counts = countsFor('GETTUXS');
  const before = counts.slice();
  const tracker = { operations: 0, exhausted: false };
  assert.equal(evaluator.evalCounts(counts, 3, undefined,
    { now: () => 0, deadlineMs: 0, maxOperations: 1000, tracker }), 0);
  assert.deepEqual(counts, before);
  assert.equal(tracker.exhausted, true);
  assert.equal(evaluator.stats.refinements, 0);
});
