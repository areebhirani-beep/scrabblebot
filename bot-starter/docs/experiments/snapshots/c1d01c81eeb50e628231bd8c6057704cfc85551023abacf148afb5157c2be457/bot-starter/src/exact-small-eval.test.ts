import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FastEval, WordEngine, reward } from './engine.js';
import { ExactSmallEval } from './exact-small-eval.js';

const dictionary = ['GET', 'TUX', 'GUEST', 'GEST'];
const makeCounts = (letters: string): Uint8Array => {
  const counts = new Uint8Array(26);
  for (const letter of letters) counts[letter.charCodeAt(0) - 65]!++;
  return counts;
};
const budget = () => ({ now: () => 0, maxOperations: 1_000_000 });

test('small-rack refinement sees a useful S that greedy evaluation hides', () => {
  const evaluator = new ExactSmallEval(new FastEval(dictionary), new WordEngine(dictionary));
  const before = makeCounts('GETTUX');
  const after = makeCounts('GETTUXS');
  assert.equal(evaluator.evalCounts(before, 3, undefined, budget()), 14);
  const words: string[] = [];
  assert.equal(evaluator.evalCounts(after, 3, words, budget()), 17);
  assert.deepEqual(new Set(words), new Set(['GEST', 'TUX']));
  assert.equal(words.reduce((sum, word) => sum + reward(word), 0), 17);
  assert.deepEqual(after, new Uint8Array(26));
  assert.equal(evaluator.stats.improvements, 1);
});

test('racks outside the configured domain retain identical greedy results and residuals', () => {
  const baseline = new FastEval(dictionary);
  const evaluator = new ExactSmallEval(baseline, new WordEngine(dictionary), { maxRack: 6 });
  const expectedCounts = makeCounts('GETTUXS');
  const actualCounts = expectedCounts.slice();
  const expectedWords: string[] = [];
  const actualWords: string[] = [];
  const expected = baseline.evalCounts(expectedCounts, 3, expectedWords, budget());
  assert.equal(evaluator.evalCounts(actualCounts, 3, actualWords, budget()), expected);
  assert.deepEqual(actualCounts, expectedCounts);
  assert.deepEqual(actualWords, expectedWords);
  assert.equal(evaluator.stats.refinements, 0);
});

test('duplicate letter counts permit two instances of the same word', () => {
  const evaluator = new ExactSmallEval(new FastEval(['AT']), new WordEngine(['AT']));
  const counts = makeCounts('AATT');
  const words: string[] = ['already-recorded'];
  assert.equal(evaluator.evalCounts(counts, 3, words, budget()), 4);
  assert.deepEqual(words, ['already-recorded', 'AT', 'AT']);
  assert.deepEqual(counts, new Uint8Array(26));
  assert.equal(evaluator.stats.completedExact, 1);
});

test('refinement respects the caller word limit and consumes only its chosen words', () => {
  const evaluator = new ExactSmallEval(new FastEval(dictionary), new WordEngine(dictionary));
  const counts = makeCounts('GETTUXS');
  const words: string[] = [];
  assert.equal(evaluator.evalCounts(counts, 1, words, budget()), 12);
  assert.deepEqual(words, ['GUEST']);
  assert.deepEqual(counts, makeCounts('TX'));
  assert.equal(evaluator.stats.completedExact, 0);
});

test('optional refinement exhaustion preserves the baseline without exhausting the parent', () => {
  const evaluator = new ExactSmallEval(new FastEval(dictionary), new WordEngine(dictionary),
    { maxRefineOperations: 1 });
  const counts = makeCounts('GETTUXS');
  const tracker = { operations: 0, exhausted: false };
  const words: string[] = [];
  assert.equal(evaluator.evalCounts(counts, 3, words, { ...budget(), tracker }), 12);
  assert.deepEqual(words, ['GUEST']);
  assert.deepEqual(counts, makeCounts('TX'));
  assert.equal(tracker.exhausted, false);
  assert.ok(tracker.operations < 1_000_000);
  assert.equal(evaluator.stats.refinementTimeouts, 1);
});

test('a hard deadline prevents both baseline work and optional refinement', () => {
  const evaluator = new ExactSmallEval(new FastEval(dictionary), new WordEngine(dictionary));
  const counts = makeCounts('GETTUXS');
  const before = counts.slice();
  const tracker = { operations: 0, exhausted: false };
  const words: string[] = [];
  assert.equal(evaluator.evalCounts(counts, 3, words,
    { now: () => 0, deadlineMs: 0, tracker, maxOperations: 1000 }), 0);
  assert.deepEqual(counts, before);
  assert.deepEqual(words, []);
  assert.equal(tracker.exhausted, true);
  assert.equal(evaluator.stats.refinements, 0);
});
