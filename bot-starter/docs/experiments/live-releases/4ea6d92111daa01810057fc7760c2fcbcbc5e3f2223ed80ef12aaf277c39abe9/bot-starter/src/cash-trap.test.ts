import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdvancedBot, ADV_DEFAULTS, type AdvView } from './advanced.js';
import { FastEval, WordEngine } from './engine.js';

const rack = (letters: string) => {
  const result = new Map<string, number>();
  for (const letter of letters) result.set(letter, (result.get(letter) ?? 0) + 1);
  return result;
};
const view = (balance: number, bagLeft = 40): AdvView => ({
  rack: rack('STAIR'), balance, score: 0, bagLeft, bagStart: 68,
  unseen: { counts: {}, total: 0 }, seatCount: 6,
});
const make = () => new AdvancedBot(new FastEval(['STAIR']), new WordEngine(['STAIR']),
  { ...ADV_DEFAULTS, cashLen: 7, starveCoins: 8, maxBidShare: 0.7 });

// Characterization, not an endorsement of this boundary. A live-history
// reconstruction must establish whether a legal cash word was available.
test('current starvation boundary leaves a legal five-letter word uncashed at eight coins', () => {
  assert.deepEqual(make().chooseWords(view(8)), []);
  assert.deepEqual(make().chooseWords(view(7)), ['STAIR']);
});

test('the current seven-tenths cap limits an eight-coin balance to five', () => {
  const bot = new AdvancedBot(new FastEval(['CAT']), new WordEngine(['CAT']),
    { ...ADV_DEFAULTS, cashLen: 7, starveCoins: 8, maxBidShare: 0.7 });
  assert.equal(bot.decideBid({ ...view(8, 1), rack: rack('CT') }, 'A'), 5);
});

test('current starvation cashing also stops below its remaining-bag threshold', () => {
  assert.deepEqual(make().chooseWords(view(7, ADV_DEFAULTS.starveMinBagLeft - 1)), []);
  assert.deepEqual(make().chooseWords(view(7, ADV_DEFAULTS.starveMinBagLeft)), ['STAIR']);
});
