import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expectedFutureWins } from './horizon.js';

test('default preserves the existing acquisition formula on valid inputs', () => {
  for (const bag of [0, 1, 2, 5, 12, 33, 67, 68]) {
    for (const seats of [0, 1, 2, 3, 6, 8, 9]) {
      for (const horizon of [0, 1.5, 6, 10]) {
        const usable = Math.max(0, bag - 1);
        const expected = Math.min(horizon, usable,
          Math.max(0, Math.round(usable * (1 / Math.max(1, seats - 1)) * 0.5)));
        assert.equal(expectedFutureWins(bag, seats, horizon), expected);
      }
    }
  }
});

test('neutral six-seat horizon starts at ten instead of six and has a fixed cap', () => {
  assert.equal(expectedFutureWins(67, 6, 6), 6);
  assert.equal(expectedFutureWins(67, 6, 6, true), 10);
  assert.equal(expectedFutureWins(67, 6, 3, true), 10);
  assert.equal(expectedFutureWins(67, 6, 100, true), 10);
  assert.equal(expectedFutureWins(67, 6, 0, true), 10);
  assert.equal(expectedFutureWins(26, 6, 6), 3);
  assert.equal(expectedFutureWins(26, 6, 6, true), 4);
});

test('opt-in leaves heads-up and all other table sizes unchanged', () => {
  for (const seats of [1, 2, 3, 5, 7, 8, 9]) {
    for (const bag of [2, 12, 33, 67]) {
      assert.equal(expectedFutureWins(bag, seats, 10, true),
        expectedFutureWins(bag, seats, 10));
    }
  }
  assert.equal(expectedFutureWins(12, 2, 10, true), 6);
});

test('last two auctions exclude the unusable final tile', () => {
  for (const neutral of [false, true]) {
    for (const seats of [2, 6]) {
      assert.equal(expectedFutureWins(0, seats, 6, neutral), 0);
      assert.equal(expectedFutureWins(1, seats, 6, neutral), 0);
    }
    assert.equal(expectedFutureWins(2, 2, 6, neutral), 1);
    assert.equal(expectedFutureWins(2, 6, 6, neutral), 0);
  }
});

test('nonfinite and negative inputs fail closed for both policies', () => {
  for (const invalid of [NaN, Infinity, -Infinity, -1]) {
    for (const neutral of [false, true]) {
      assert.equal(expectedFutureWins(invalid, 6, 6, neutral), 0);
      assert.equal(expectedFutureWins(67, invalid, 6, neutral), 0);
      assert.equal(expectedFutureWins(67, 6, invalid, neutral), 0);
    }
  }
});
