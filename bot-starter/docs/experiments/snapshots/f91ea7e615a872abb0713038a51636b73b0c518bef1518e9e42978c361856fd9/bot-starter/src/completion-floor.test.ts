import assert from 'node:assert/strict';
import { test } from 'node:test';
import { immediateCompletion } from './completion-floor.js';
import { AdvancedBot, ADV_DEFAULTS, type AdvView } from './advanced.js';
import { FastEval, WordEngine, type Rack, type SearchBudget } from './engine.js';
import { firstPriceBid } from './prices.js';

const rack = (letters: string): Rack => {
  const counts: Rack = new Map();
  for (const letter of letters) counts.set(letter, (counts.get(letter) ?? 0) + 1);
  return counts;
};
const deterministic = { now: () => 0, budgetMs: 3, maxOperations: 20_000 };
const dictionary = ['ZINGER', 'ZINGERS'];
const view = (changes: Partial<AdvView> = {}): AdvView => ({
  rack: rack('ZINGER'), balance: 100, score: 0, bagLeft: 2, bagStart: 68,
  unseen: { counts: {}, total: 0 }, seatCount: 6, wordPending: false, ...changes,
});
class ZeroEval extends FastEval {
  override evalCounts(_counts: Uint8Array, _maxWords = 3, _words?: string[], _budget: SearchBudget = {}): number { return 0; }
}
const make = (gain: number | undefined, zero = true, cap = 12) => new AdvancedBot(
  zero ? new ZeroEval(dictionary) : new FastEval(dictionary), new WordEngine(dictionary),
  { ...ADV_DEFAULTS, cashLen: 7, samples: 1, bidGain: 1, paceEarly: 1, paceLate: 1,
    facePremium: 0, completionFloorGain: gain, completionFloorMaxBid: cap });

test('completion gain is the new word score minus exact old liquidation, not full reward', () => {
  const input = rack('ZINGER');
  const before = new Map(input);
  assert.deepEqual(immediateCompletion(new WordEngine(dictionary), input, 'S', deterministic),
    { word: 'ZINGERS', score: 51, baselineScore: 40, gain: 11 });
  assert.deepEqual(input, before);
});

test('existing seven-letter cashout and missing actual tile do not trigger', () => {
  const engine = new WordEngine(dictionary);
  assert.equal(immediateCompletion(engine, rack('ZINGERS'), 'A', deterministic), undefined);
  assert.equal(immediateCompletion(engine, rack('ZINGER'), 'Q', deterministic), undefined);
});

test('duplicate multiplicities are required for an actual completion', () => {
  const engine = new WordEngine(['TEETER', 'TEETERS']);
  assert.equal(immediateCompletion(engine, rack('TEETER'), 'S', deterministic)?.gain, 6);
  assert.equal(immediateCompletion(engine, rack('TEETTR'), 'S', deterministic), undefined);
});

test('new seven-letter word cannot claim gain over a better old-rack partition', () => {
  const engine = new WordEngine(['QUIZ', 'RETAIN', 'RETAINS']);
  assert.equal(immediateCompletion(engine, rack('QUIZRETAIN'), 'S', deterministic), undefined);
});

test('inexact baseline, exhausted operations, deadlines and invalid inputs fail closed', () => {
  class InexactEngine extends WordEngine {
    override bestPlayout() { return { words: ['ZINGER'], score: 40, exact: false }; }
  }
  assert.equal(immediateCompletion(new InexactEngine(dictionary), rack('ZINGER'), 'S', deterministic), undefined);
  const engine = new WordEngine(dictionary);
  for (const budget of [{ ...deterministic, budgetMs: 0 }, { ...deterministic, maxOperations: 1 },
    { ...deterministic, deadlineMs: 0 }]) {
    assert.equal(immediateCompletion(engine, rack('ZINGER'), 'S', budget), undefined);
  }
  assert.equal(immediateCompletion(engine, rack('ZINGER'), '?', deterministic), undefined);
  assert.equal(immediateCompletion(engine, new Map([['Z', -1]]), 'S', deterministic), undefined);
  assert.equal(immediateCompletion(engine, rack('ZINGERAAAAA'), 'S', deterministic), undefined);
});

test('opt-in floor reaches the MC-zero path and remains off by default', () => {
  assert.equal(ADV_DEFAULTS.completionFloorGain, undefined);
  const off = make(undefined);
  assert.equal(off.decideBid(view(), 'S'), 0);
  assert.equal(off.completionFloorStats.checks, 0);
  const enabled = make(1);
  assert.equal(enabled.decideBid(view(), 'S'), 11);
  assert.equal(enabled.completionFloorStats.raisedBids, 1);
  assert.equal(enabled.completionFloorStats.opportunities, 1);
});

test('floor is a maximum with the existing bid, never an additive second reward', () => {
  const ordinary = make(undefined, false).decideBid(view(), 'S');
  const withFloor = make(1, false).decideBid(view(), 'S');
  assert.equal(ordinary, 11);
  assert.equal(withFloor, 11);
  assert.equal(make(2, true, 8).decideBid(view(), 'S'), 8);
  assert.equal(make(Number.MAX_VALUE, true, Number.MAX_VALUE).decideBid(view(), 'S'), 40);
});

test('ordinary share and balance caps still constrain a completion floor', () => {
  assert.equal(make(1).decideBid(view({ balance: 10 }), 'S'), 7);
  assert.equal(make(1).decideBid(view({ balance: 0 }), 'S'), 0);
  assert.equal(make(1).decideBid(view({ balance: 1 }), 'S'), 0);
});

test('pending or unknown word receipts cannot lend the floor consumed inventory', () => {
  for (const pending of [true, undefined]) {
    const bot = make(1);
    assert.equal(bot.decideBid(view({ wordPending: pending }), 'S'), 0);
    assert.equal(bot.completionFloorStats.checks, 0);
  }
});

test('final tile, penultimate fallback, and zero deadline keep existing special cases', () => {
  const bot = make(1);
  assert.equal(bot.decideBid(view({ bagLeft: 0 }), 'S'), 0);
  assert.equal(bot.decideBid(view({ bagLeft: 1 }), 'S'), 0);
  assert.equal(bot.decideBid(view({ decisionBudgetMs: 0 }), 'S'), 0);
  assert.equal(bot.completionFloorStats.checks, 0);
  assert.equal(bot.decideBid(view({ bagLeft: 1, terminalEligible: true, matchKey: 'terminal' }), 'S'), 100);
});

test('first-price conversion uses the existing pricing rule for the floor valuation', () => {
  const quarter = Math.min(3, Math.floor(((68 - 1 - 2) * 4) / 68));
  assert.equal(make(1).decideBid(view({ firstPrice: true }), 'S'), firstPriceBid('S', quarter, 11));
});
