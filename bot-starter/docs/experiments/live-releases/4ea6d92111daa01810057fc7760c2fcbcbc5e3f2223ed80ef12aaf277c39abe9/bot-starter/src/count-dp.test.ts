import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countDp, type CountDpResult } from './count-dp.js';
import { WordEngine, reward, type Rack } from './engine.js';

const rack = (letters: string): Rack => {
  const result: Rack = new Map();
  for (const letter of letters) result.set(letter, (result.get(letter) ?? 0) + 1);
  return result;
};
const budget = { now: () => 0, maxOperations: 150_000, budgetMs: 8 };
const assertFeasible = (result: CountDpResult, inventory: Rack, dictionary: string[], maxWords: number) => {
  const remaining = new Map(inventory);
  assert.ok(result.words.length <= maxWords);
  for (const word of result.words) {
    assert.ok(dictionary.includes(word));
    for (const letter of word) {
      const count = remaining.get(letter) ?? 0;
      assert.ok(count > 0, `${word} overconsumes ${letter}`);
      remaining.set(letter, count - 1);
    }
  }
  assert.equal(result.score, result.words.reduce((sum, word) => sum + reward(word), 0));
};

test('count DP finds the better split instead of the highest single word', () => {
  const dictionary = ['GUEST', 'GEST', 'TUX'];
  const input = rack('GETTUXS');
  const before = new Map(input);
  const result = countDp(new WordEngine(dictionary), input, 3, budget);
  assert.equal(result.complete, true);
  assert.equal(result.score, 17);
  assert.deepEqual(new Set(result.words), new Set(['GEST', 'TUX']));
  assert.deepEqual(input, before);
  assertFeasible(result, input, dictionary, 3);
});

test('duplicate capacities and repeat word use remain exact', () => {
  const dictionary = ['AA', 'AB', 'AC', 'AD'];
  const engine = new WordEngine(dictionary);
  const repeated = countDp(engine, rack('AAAAAA'), 3, budget);
  assert.equal(repeated.complete, true);
  assert.deepEqual(repeated.words, ['AA', 'AA', 'AA']);
  assert.equal(repeated.score, 6);
  const constrained = countDp(engine, rack('AABCD'), 3, budget);
  assert.equal(constrained.complete, true);
  assert.equal(constrained.score, 8);
  assertFeasible(constrained, rack('AABCD'), dictionary, 3);
});

test('completeness describes the requested word limit even with usable letters left', () => {
  const engine = new WordEngine(['AA']);
  const three = countDp(engine, rack('AAAAAAAA'), 3, budget);
  assert.equal(three.complete, true);
  assert.equal(three.score, 6);
  const four = countDp(engine, rack('AAAAAAAA'), 4, budget);
  assert.equal(four.complete, true);
  assert.equal(four.score, 8);
  assert.equal(three.states, 9);
});

test('count DP agrees with brute-force word-sequence enumeration on tiny racks', () => {
  const dictionary = ['AA', 'AB', 'AC', 'BA', 'BC', 'ABC', 'AABC'];
  const engine = new WordEngine(dictionary);
  const brute = (letters: string, depth: number): number => {
    if (depth === 0) return 0;
    let best = 0;
    for (const word of dictionary) {
      let rest = letters;
      let fits = true;
      for (const letter of word) {
        const at = rest.indexOf(letter);
        if (at < 0) { fits = false; break; }
        rest = rest.slice(0, at) + rest.slice(at + 1);
      }
      if (fits) best = Math.max(best, reward(word) + brute(rest, depth - 1));
    }
    return best;
  };
  for (const letters of ['', 'A', 'AB', 'AABC', 'AABBC', 'AAABCC', 'AAAABBCC']) {
    for (const depth of [0, 1, 2, 3]) {
      const result = countDp(engine, rack(letters), depth, budget);
      assert.equal(result.complete, true);
      assert.equal(result.score, brute(letters, depth));
      assertFeasible(result, rack(letters), dictionary, depth);
    }
  }
});

test('operation exhaustion returns only feasible incumbents and never a false completion', () => {
  const dictionary = ['AA', 'AB', 'AC', 'BC', 'ABC', 'AABC'];
  const engine = new WordEngine(dictionary);
  let sawIncompletePlan = false;
  for (const cap of [0, 1, 5, 10, 20, 30, 45, 60, 90, 120, 180]) {
    const tracker = { operations: 0, exhausted: false };
    const result = countDp(engine, rack('AAAABBCC'), 3,
      { ...budget, maxOperations: cap, tracker });
    assert.ok(tracker.operations <= cap);
    assertFeasible(result, rack('AAAABBCC'), dictionary, 3);
    if (tracker.exhausted) assert.equal(result.complete, false);
    if (!result.complete && result.words.length > 0) sawIncompletePlan = true;
  }
  assert.equal(sawIncompletePlan, true);
});

test('shared exhausted trackers, zero time and elapsed deadlines stop search', () => {
  const engine = new WordEngine(['CAT']);
  for (const options of [
    { ...budget, budgetMs: 0 },
    { ...budget, deadlineMs: 0 },
    { ...budget, tracker: { operations: 4, exhausted: true } },
    { ...budget, maxOperations: 4, tracker: { operations: 4, exhausted: false } },
  ]) {
    const result = countDp(engine, rack('CAT'), 3, options);
    assert.equal(result.complete, false);
    assert.equal(result.score, 0);
  }
  let clock = 0;
  const timed = countDp(engine, rack('CAT'), 3, { now: () => clock++, budgetMs: 2 });
  assert.equal(timed.complete, false);
});

test('rack/state ceilings and invalid numeric inputs fail closed', () => {
  const engine = new WordEngine(['AA', 'AB']);
  const invalidRacks: Rack[] = [rack('ABCDEFGHIJK'), new Map([['A', NaN]]),
    new Map([['A', -1]]), new Map([['A', 1.5]]), new Map([['?', 2]])];
  for (const input of invalidRacks) {
    const result = countDp(engine, input, 3, budget);
    assert.equal(result.complete, false);
    assert.equal(result.score, 0);
  }
  assert.equal(countDp(engine, rack('AB'), 3, budget, { maxStates: 3 }).complete, false);
  assert.equal(countDp(engine, rack('AB'), NaN, budget).complete, false);
  assert.equal(countDp(engine, rack('AB'), 3, { ...budget, budgetMs: NaN }).complete, false);
  assert.equal(countDp(engine, rack('AB'), 3, budget, { maxTiles: 17 }).complete, false);
});

test('no legal words and empty rack are complete zero-score solutions', () => {
  const engine = new WordEngine(['CAT']);
  assert.deepEqual(countDp(engine, rack(''), 3, budget),
    { words: [], score: 0, complete: true, states: 1 });
  const none = countDp(engine, rack('ZZ'), 3, budget);
  assert.equal(none.complete, true);
  assert.equal(none.score, 0);
});
