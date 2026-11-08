import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdvancedBot, ADV_DEFAULTS, type AdvView } from './advanced.js';
import { FastEval, WordEngine, minus, reward, type Rack, type SearchBudget } from './engine.js';

const dictionary = ['GET', 'TUX', 'GUEST', 'GEST'];
const rack = (letters: string): Rack => {
  const result: Rack = new Map();
  for (const letter of letters) result.set(letter, (result.get(letter) ?? 0) + 1);
  return result;
};
const view = (changes: Partial<AdvView> = {}): AdvView => ({
  rack: rack('GETTUX'), balance: 100, score: 0, bagLeft: 1, bagStart: 68,
  unseen: { counts: {}, total: 0 }, seatCount: 6, terminalEligible: true,
  matchKey: 'experimental-match', ...changes,
});
const make = (enabled = true, engine = new WordEngine(dictionary)) =>
  new AdvancedBot(new FastEval(dictionary), engine,
    { ...ADV_DEFAULTS, cashLen: 7, finalUsableAllIn: enabled });
const score = (words: string[]) => words.reduce((total, word) => total + reward(word), 0);

test('experimental final-usable spending is off by default and includes zero own marginal', () => {
  assert.equal(ADV_DEFAULTS.finalUsableAllIn, undefined);
  assert.equal(make(false).decideBid(view({ rack: rack('') }), 'S'), 0);
  for (const firstPrice of [false, true]) {
    const bot = make();
    assert.equal(bot.decideBid(view({ rack: rack(''), firstPrice, balance: 8.8 }), 'S'), 8);
    assert.deepEqual(bot.chooseWords(view({ rack: rack('S'), bagLeft: 0 })), []);
  }
});

test('the old-rack incumbent cannot trigger pre-award liquidation', () => {
  const bot = make();
  assert.equal(bot.decideBid(view(), 'S'), 100);
  assert.deepEqual(bot.chooseWords(view()), []);
  const won = view({ rack: rack('GETTUXS'), bagLeft: 0 });
  assert.equal(score(bot.chooseWords(won)), 17);
});

test('a lost or tied-and-lost auction still liquidates the unchanged rack normally', () => {
  const bot = make();
  assert.equal(bot.decideBid(view(), 'S'), 100);
  // Winning a tied bid is not assumed: no awarded S appears in the snapshot.
  assert.equal(score(bot.chooseWords(view({ bagLeft: 0 }))), 14);
  assert.deepEqual(bot.chooseWords(view({ matchKey: 'different', bagLeft: 1 })), []);
});

test('post-award interruption preserves the old feasible split through sequential receipts', () => {
  class InterruptedEngine extends WordEngine {
    interrupt = false;
    override bestPlayout(inventory: Rack, beam = 12, depth = 4, budget: SearchBudget = {}) {
      if (this.interrupt) return { words: [] as string[], score: 0, exact: false };
      return super.bestPlayout(inventory, beam, depth, budget);
    }
  }
  const engine = new InterruptedEngine(dictionary);
  const bot = make(true, engine);
  assert.equal(bot.decideBid(view(), 'S'), 100);
  engine.interrupt = true;
  const won = view({ rack: rack('GETTUXS'), bagLeft: 1 });
  const first = bot.chooseWords(won);
  assert.equal(score(first), 14);
  assert.deepEqual(bot.chooseWords(won), first); // no receipt: do not consume twice
  const remaining = minus(won.rack, first[0]!);
  assert.deepEqual(bot.chooseWords({ ...won, rack: remaining }), first.slice(1));
  assert.deepEqual(bot.chooseWords({ ...won, rack: remaining, matchKey: 'other' }), []);
});

test('unknown or mixed simulated tables and pending receipts cannot activate the experiment', () => {
  for (const changes of [{ terminalEligible: false }, { terminalEligible: undefined },
    { matchKey: undefined }, { balance: 0 }, { decisionBudgetMs: 0 }]) {
    assert.ok(make().decideBid(view(changes), 'S') < 100);
  }
  assert.equal(make().decideBid(view({ bagLeft: 0 }), 'S'), 0);
  assert.equal(make().decideBid(view(), '?'), 0);
  assert.equal(make().decideBid(view({ rack: new Map([['G', -1]]) }), 'S'), 0);
  assert.equal(make().decideBid(view({ balance: Infinity }), 'S'), 0);
});

test('an exhausted baseline search does not authorize experimental all-in', () => {
  class ExhaustedEngine extends WordEngine {
    override bestPlayout(_rack: Rack, _beam = 12, _depth = 4, budget: SearchBudget = {}) {
      if (budget.tracker) budget.tracker.exhausted = true;
      return { words: [] as string[], score: 0, exact: false };
    }
  }
  assert.ok(make(true, new ExhaustedEngine(dictionary)).decideBid(view(), 'S') < 100);
});

test('denying a tile can improve a heuristic opponent and therefore worsen our rank', () => {
  // A legal external opponent using this restricted word list greedily scores
  // 14 without S but only 12 with S. Our banked 13 wins only if we let it buy S.
  const opponent = new FastEval(['GET', 'TUX', 'GUEST']);
  const counts = (letters: string) => {
    const result = new Uint8Array(26);
    for (const letter of letters) result[letter.charCodeAt(0) - 65]!++;
    return result;
  };
  const denied = opponent.evalCounts(counts('GETTUX'), 3, undefined,
    { now: () => 0, maxOperations: 10000 });
  const awarded = opponent.evalCounts(counts('GETTUXS'), 3, undefined,
    { now: () => 0, maxOperations: 10000 });
  assert.equal(denied, 14);
  assert.equal(awarded, 12);
  assert.ok(awarded < 13 && denied > 13);
});
