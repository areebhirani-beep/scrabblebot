import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdvancedBot, ADV_DEFAULTS, type AdvView } from './advanced.js';
import { FastEval, WordEngine, minus, reward, type Rack, type SearchBudget } from './engine.js';

const rack = (s: string) => {
  const r = new Map<string, number>();
  for (const c of s) r.set(c, (r.get(c) ?? 0) + 1);
  return r;
};
const make = () => new AdvancedBot(new FastEval(['CAT']), new WordEngine(['CAT']),
  { ...ADV_DEFAULTS, cashLen: 7 });
const view = (changes: Partial<AdvView> = {}): AdvView => ({
  rack: rack('CT'), balance: 100, score: 0, bagLeft: 1, bagStart: 68,
  unseen: { counts: {}, total: 0 }, seatCount: 6, terminalEligible: true,
  matchKey: 'm1', ...changes,
});

test('last usable tile receives full affordable bid only after certified gain', () => {
  for (const firstPrice of [false, true]) {
    const bot = make();
    assert.equal(bot.decideBid(view({ firstPrice }), 'A'), 100);
    assert.deepEqual(bot.chooseWords(view({ rack: rack('CAT'), bagLeft: 0 })), ['CAT']);
  }
});

test('terminal override fails closed for pending inventory, simulated or unknown seats and no context', () => {
  for (const v of [view({ terminalEligible: false }), view({ terminalEligible: undefined }),
    view({ matchKey: undefined })]) assert.ok(make().decideBid(v, 'A') < 100);
  assert.equal(make().decideBid(view({ rack: rack('C') }), 'A'), 0);
  assert.equal(make().decideBid(view({ bagLeft: 0 }), 'A'), 0);
  assert.equal(make().decideBid(view({ decisionBudgetMs: 0 }), 'A'), 0);
});

test('certified word is preserved only for its matching rack and match', () => {
  const bot = make();
  assert.equal(bot.decideBid(view(), 'A'), 100);
  assert.deepEqual(bot.chooseWords(view({ rack: rack('CAT') })), ['CAT']);
  assert.deepEqual(bot.chooseWords(view({ rack: rack('CAT'), matchKey: 'm2' })), []);
  assert.deepEqual(bot.chooseWords(view({ rack: rack('CT') })), []);
});

test('terminal bid respects empty and fractional balances', () => {
  assert.equal(make().decideBid(view({ balance: 0 }), 'A'), 0);
  assert.equal(make().decideBid(view({ balance: 3.8 }), 'A'), 3);
});

test('terminal certificate is an incumbent rather than a forced suboptimal first word', () => {
  const dictionary = ['QUIETENED', 'QUIETED', 'RETAINS'];
  const bot = new AdvancedBot(new FastEval(dictionary), new WordEngine(dictionary),
    { ...ADV_DEFAULTS, cashLen: 7 });
  assert.equal(bot.decideBid(view({ rack: rack('QUIETEDRETAIS') }), 'N'), 100);
  const words = bot.chooseWords(view({ rack: rack('QUIETEDRETAINS'), bagLeft: 0 }));
  assert.equal(words.reduce((score, word) => score + reward(word), 0), 72);
  assert.deepEqual(new Set(words), new Set(['QUIETED', 'RETAINS']));
});

test('a better terminal split survives retries and continues short words after receipts', () => {
  const dictionary = ['GUEST', 'GEST', 'TUX'];
  const bot = new AdvancedBot(new FastEval(dictionary), new WordEngine(dictionary),
    { ...ADV_DEFAULTS, cashLen: 7 });
  assert.equal(bot.decideBid(view({ rack: rack('GETTUX') }), 'S'), 100);
  const won = view({ rack: rack('GETTUXS'), bagLeft: 1 });
  const chosen = bot.chooseWords(won);
  assert.equal(chosen.reduce((score, word) => score + reward(word), 0), 17);
  assert.deepEqual(bot.chooseWords(won), chosen); // no receipt: inventory is unchanged
  const remaining = minus(won.rack, chosen[0]!);
  assert.deepEqual(bot.chooseWords(view({ rack: remaining, bagLeft: 1 })), chosen.slice(1));
  assert.deepEqual(bot.chooseWords(view({ rack: remaining, bagLeft: 1, matchKey: 'another' })), []);
});

test('an exhausted terminal refinement retains its certified word', () => {
  class InterruptedEngine extends WordEngine {
    interrupt = false;
    override bestPlayout(inventory: Rack, beam = 12, depth = 4, budget: SearchBudget = {}) {
      if (this.interrupt) {
        assert.ok(budget.deadlineMs !== undefined);
        return { words: [] as string[], score: 0, exact: false };
      }
      return super.bestPlayout(inventory, beam, depth, budget);
    }
  }
  const engine = new InterruptedEngine(['CAT']);
  const bot = new AdvancedBot(new FastEval(['CAT']), engine, { ...ADV_DEFAULTS, cashLen: 7 });
  assert.equal(bot.decideBid(view(), 'A'), 100);
  engine.interrupt = true;
  assert.deepEqual(bot.chooseWords(view({ rack: rack('CAT'), bagLeft: 0, decisionBudgetMs: 1 })), ['CAT']);
});

test('zero word budget emits nothing and does not erase the known terminal plan', () => {
  const bot = make();
  assert.equal(bot.decideBid(view(), 'A'), 100);
  const won = view({ rack: rack('CAT'), bagLeft: 0 });
  assert.deepEqual(bot.chooseWords({ ...won, decisionBudgetMs: 0 }), []);
  assert.deepEqual(bot.chooseWords({ ...won, decisionBudgetMs: Number.MIN_VALUE }), ['CAT']);
  assert.deepEqual(bot.chooseWords(won), ['CAT']);
});
