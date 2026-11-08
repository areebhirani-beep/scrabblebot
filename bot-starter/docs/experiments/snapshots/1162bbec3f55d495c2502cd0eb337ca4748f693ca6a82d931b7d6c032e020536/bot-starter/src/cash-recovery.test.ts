import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdvancedBot, ADV_DEFAULTS, type AdvParams, type AdvView } from './advanced.js';
import { FastEval, WordEngine, reward } from './engine.js';

const rack = (letters: string) => {
  const result = new Map<string, number>();
  for (const c of letters) result.set(c, (result.get(c) ?? 0) + 1);
  return result;
};
const words = ['FLOE', 'STAIR', 'AT', 'RETAINS'];
const make = (params: Partial<AdvParams> = {}) => new AdvancedBot(new FastEval(words), new WordEngine(words),
  { ...ADV_DEFAULTS, cashLen: 7, starveCoins: 8, ...params });
const view = (letters = 'EFLO', balance = 8, bagLeft = 27): AdvView => ({
  rack: rack(letters), balance, score: 30, bagLeft, bagStart: 68,
  unseen: { counts: {}, total: 0 }, seatCount: 6,
});
const candidate = () => make({ starveCoins: 9, starveMinLength: 4 });

test('observed EFLO eight-coin stall needs both cash threshold and four-letter recovery', () => {
  assert.deepEqual(make().chooseWords(view()), []);
  assert.deepEqual(make({ starveCoins: 9 }).chooseWords(view()), []);
  assert.deepEqual(make({ starveMinLength: 4 }).chooseWords(view()), []);
  assert.deepEqual(candidate().chooseWords(view()), ['FLOE']);
  assert.equal(reward('FLOE'), 10);
});

test('normal seven-letter cash rule and remaining-auction gate are unchanged', () => {
  assert.deepEqual(candidate().chooseWords(view('EFLO', 9)), []);
  assert.deepEqual(candidate().chooseWords(view('STAIR', 9)), []);
  assert.deepEqual(candidate().chooseWords(view('RETAINS', 9)), ['RETAINS']);
  assert.deepEqual(candidate().chooseWords(view('EFLO', 8, 9)), []);
  assert.deepEqual(candidate().chooseWords(view('EFLO', 8, 10)), ['FLOE']);
});

test('recovery respects dictionary membership and physical tile multiplicities', () => {
  assert.deepEqual(candidate().chooseWords(view('EFL')), []);
  assert.deepEqual(candidate().chooseWords(view('EFLX')), []);
  const input = view('EEFLLO');
  const selected = candidate().chooseWords(input);
  assert.deepEqual(selected, ['FLOE']);
  const remaining = new Map(input.rack);
  for (const word of selected) {
    assert.ok(words.includes(word));
    for (const c of word) {
      assert.ok((remaining.get(c) ?? 0) > 0);
      remaining.set(c, remaining.get(c)! - 1);
    }
  }
  assert.deepEqual(input.rack, rack('EEFLLO'));
});

test('absent and invalid minimum lengths retain five; integers clamp to two through seven', () => {
  for (const starveMinLength of [undefined, NaN, Infinity, -Infinity, 4.5]) {
    const bot = make({ starveCoins: 9, starveMinLength });
    assert.deepEqual(bot.chooseWords(view()), []);
    assert.deepEqual(bot.chooseWords(view('STAIR')), ['STAIR']);
  }
  assert.deepEqual(make({ starveCoins: 9, starveMinLength: 0 }).chooseWords(view('AT')), ['AT']);
  const upper = make({ starveCoins: 9, starveMinLength: 99 });
  assert.deepEqual(upper.chooseWords(view('STAIR')), []);
  assert.deepEqual(upper.chooseWords(view('RETAINS')), ['RETAINS']);
});
