import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mixedScoreUtility } from './win-utility.js';
import { MonteCarlo } from './montecarlo.js';
import { FastEval } from './engine.js';

test('disabled shaping returns exact incumbent score', () => {
  for (const score of [0, 50, 110, 250]) assert.equal(mixedScoreUtility(score, 0, [100]), score);
});
test('utility stays monotone and rewards points even after crossing every rival', () => {
  for (let score = 0; score < 300; score++)
    assert.ok(mixedScoreUtility(score + 1, 60, [80, 110, 160]) - mixedScoreUtility(score, 60, [80, 110, 160]) >= 1 - 1e-10);
  assert.equal(mixedScoreUtility(250, 60, [100]) - mixedScoreUtility(240, 60, [100]), 10);
});
test('equal point gains have greater value near the empirical win boundary', () => {
  const delta = (score: number) => mixedScoreUtility(score + 10, 60, [110], 10) - mixedScoreUtility(score, 60, [110], 10);
  assert.equal(delta(0), 10);
  assert.equal(delta(100), 40);
});
test('paired MC utility includes prior earned score, with exact disabled fallback', () => {
  const fast = new FastEval(['CAT']); const mc = new MonteCarlo(fast);
  const r = new Map([['C', 1], ['T', 1]]); const unseen = { counts: {}, total: 0 };
  const value = (bonus: number, earned: number) => mc.value(r, 'A', unseen, 0, 24, 7, 300, () => 0,
    score => mixedScoreUtility(earned + score, bonus, [100], 10));
  assert.equal(value(0, 95), 5);
  assert.equal(value(60, 0), 5);
  assert.equal(value(60, 95), 20);
});
test('invalid nonzero priors fail rather than silently changing bids', () => {
  assert.throws(() => mixedScoreUtility(100, 60, [100], 0));
  assert.throws(() => mixedScoreUtility(100, 60, [NaN], 12));
});
