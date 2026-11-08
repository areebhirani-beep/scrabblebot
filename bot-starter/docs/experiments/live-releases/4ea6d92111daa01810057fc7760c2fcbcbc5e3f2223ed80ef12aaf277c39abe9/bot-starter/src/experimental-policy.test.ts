import assert from 'node:assert/strict';
import test from 'node:test';
import { AdvancedBot, ADV_DEFAULTS } from './advanced.js';
import { FastEval, WordEngine, reward } from './engine.js';
const rack = (s: string) => { const r = new Map<string, number>(); for (const c of s) r.set(c, (r.get(c) ?? 0) + 1); return r; };
const view = (s: string) => ({ rack: rack(s), balance: 100, score: 0, bagLeft: 30,
  bagStart: 68, unseen: { counts: {}, total: 0 }, seatCount: 6 });
const words = ['QUIETED', 'RETAINS', 'QUIETENED', 'STAIR', 'PACIFY', 'MORGUE'];
const bot = (changes = {}) => new AdvancedBot(new FastEval(words), new WordEngine(words),
  { ...ADV_DEFAULTS, cashLen: 7, ...changes });
test('experimental cashing is opt-in and keeps the existing seven-letter baseline', () => {
  assert.deepEqual(bot().chooseWords(view('PACIFY')), []);
  assert.deepEqual(bot().chooseWords(view('QUIETEDRETAINS')), ['QUIETENED']);
});
test('selective six-letter cashing admits a valuable word but keeps a cheap six-letter word', () => {
  assert.equal(reward('PACIFY'), 40);
  assert.deepEqual(bot({ valuableSixMinScore: 30 }).chooseWords(view('PACIFY')), ['PACIFY']);
  assert.deepEqual(bot({ valuableSixMinScore: 30 }).chooseWords(view('MORGUE')), []);
});
test('optional packing raises immediate cash without lowering minimum word length', () => {
  const result = bot({ packLongWords: true }).chooseWords(view('QUIETEDRETAINS'));
  assert.ok(result.every(w => w.length >= 7));
  assert.equal(result.reduce((sum,w) => sum + reward(w), 0), 72);
});
test('rare-tile premium changes only useful rare-letter bids', () => {
  const make = (rareFacePremium: number) => new AdvancedBot(new FastEval(['AX', 'AT']),
    new WordEngine(['AX', 'AT']), { ...ADV_DEFAULTS, rareFacePremium, samples: 1 });
  const v = { ...view('A'), bagLeft: 1 };
  assert.ok(make(1).decideBid(v, 'X') > make(0).decideBid(v, 'X'));
  assert.equal(make(1).decideBid(v, 'Q'), 0);
  assert.equal(make(1).decideBid(v, 'T'), make(0).decideBid(v, 'T'));
});
