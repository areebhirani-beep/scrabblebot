import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WordEngine, reward, type Rack, type SearchBudget } from './engine.js';
import { chooseLongWords } from './word-packing.js';

const rack = (letters: string): Rack => {
  const result: Rack = new Map();
  for (const letter of letters) result.set(letter, (result.get(letter) ?? 0) + 1);
  return result;
};
const score = (words: string[]): number => words.reduce((total, word) => total + reward(word), 0);
const unlimitedClock = { now: () => 0, maxOperations: 1_000_000 };

function assertFits(words: string[], inventory: Rack, minimum: number): void {
  const remaining = new Map(inventory);
  for (const word of words) {
    assert.ok(word.length >= minimum);
    for (const letter of word) {
      const count = remaining.get(letter) ?? 0;
      assert.ok(count > 0, `${word} overuses ${letter}`);
      remaining.set(letter, count - 1);
    }
  }
}

test('packing keeps two seven-letter words instead of a larger blocking word', () => {
  const dictionary = ['QUIETENED', 'QUIETED', 'RETAINS', 'STAIR'];
  const engine = new WordEngine(dictionary);
  const inventory = rack('QUIETEDRETAINS');
  const before = new Map(inventory);
  const words = chooseLongWords(engine, inventory, 7, unlimitedClock);
  assert.deepEqual(new Set(words), new Set(['QUIETED', 'RETAINS']));
  assert.equal(score(words), 72);
  assertFits(words, inventory, 7);
  assert.deepEqual(inventory, before);
  for (const word of words) assert.ok(dictionary.includes(word));
});

test('repeated words consume separate copies of every letter', () => {
  const inventory = rack('RETAINSRETAINS');
  const words = chooseLongWords(new WordEngine(['RETAINS']), inventory, 7, unlimitedClock);
  assert.deepEqual(words, ['RETAINS', 'RETAINS']);
  assert.equal(score(words), 42);
  assertFits(words, inventory, 7);
});

test('minimum cash length is retained, including in the residual rack', () => {
  const inventory = rack('QUIETENEDSTAIR');
  const words = chooseLongWords(new WordEngine(['QUIETENED', 'STAIR', 'AT']), inventory, 7, unlimitedClock);
  assert.deepEqual(words, ['QUIETENED']);
  assertFits(words, inventory, 7);
  assert.deepEqual(chooseLongWords(new WordEngine(['STAIR']), rack('STAIR'), 7), []);
});

test('empty racks and exhausted initial budgets return safely', () => {
  const engine = new WordEngine(['RETAINS']);
  assert.deepEqual(chooseLongWords(engine, rack(''), 7), []);
  assert.deepEqual(chooseLongWords(engine, rack('RETAINS'), 7, { maxOperations: 0 }), []);
  assert.deepEqual(chooseLongWords(engine, rack('RETAINS'), 7, { now: () => 0, deadlineMs: 0 }), []);
});

test('a timeout while trying an alternative preserves the completed greedy incumbent', () => {
  let currentTime = 0;
  let searches = 0;
  class TimedEngine extends WordEngine {
    override spellable(inventory: Rack, minimum = 2, budget: SearchBudget = {}) {
      searches++;
      if (searches === 2) currentTime = 100;
      return super.spellable(inventory, minimum, budget);
    }
  }
  const engine = new TimedEngine(['QUIETENED', 'QUIETED', 'RETAINS']);
  const inventory = rack('QUIETEDRETAINS');
  const words = chooseLongWords(engine, inventory, 7,
    { now: () => currentTime, deadlineMs: 50, maxOperations: 1_000_000 });
  assert.deepEqual(words, ['QUIETENED']);
  assert.equal(score(words), 57);
  assertFits(words, inventory, 7);
});

test('all continuation searches share one operation allowance', () => {
  const inventory = rack('RETAINSRETAINS');
  const tracker = { operations: 0, exhausted: false };
  const words = chooseLongWords(new WordEngine(['RETAINS']), inventory, 7,
    { now: () => 0, tracker, maxOperations: 300 });
  assert.ok(tracker.operations <= 300);
  assert.ok(tracker.exhausted);
  assertFits(words, inventory, 7);
});
