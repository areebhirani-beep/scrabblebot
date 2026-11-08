import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FastEval, WordEngine, rackKey } from './engine.js';
import { pricedCashout } from './cash-rollout.js';
import { AdvancedBot, ADV_DEFAULTS } from './advanced.js';

const rack = (s: string) => new Map([...new Set(s)].map(c => [c, [...s].filter(x => x === c).length]));
const words = ['CATS', 'EX'];
const engine = new WordEngine(words), evalr = new FastEval(words);
const pool = { counts: { E: 1 }, total: 1 };
const options = { tileCost: 7, futureWins: 1, samples: 8, now: () => 0 };

test('cash can fund a valuable future tile without counting coins as points', () => {
  const result = pricedCashout(engine, evalr, rack('CATSX'), 0, pool, 1, options);
  assert.equal(result?.word, 'CATS');
  assert.equal(result?.gain, 9); // CATS 7 + EX 9 versus CATS 7.
  assert.equal(result?.holdDraws, 0);
  assert.equal(result?.saleDraws, 1);
});
test('already funded or terminal horizons do not manufacture a liquidity gain', () => {
  assert.equal(pricedCashout(engine, evalr, rack('CATSX'), 7, pool, 1, options), undefined);
  assert.equal(pricedCashout(engine, evalr, rack('CATSX'), 0, pool, 1, { ...options, futureWins: 0 }), undefined);
});
test('zero budget, zero samples, exhausted pool and invalid prices cannot trigger a sale', () => {
  for (const override of [{ budgetMs: 0 }, { samples: 0 }, { tileCost: 0 }, { tileCost: NaN }])
    assert.equal(pricedCashout(engine, evalr, rack('CATSX'), 0, pool, 1, { ...options, ...override }), undefined);
  assert.equal(pricedCashout(engine, evalr, rack('CATSX'), 0, { counts: {}, total: 0 }, 1, options), undefined);
});
test('common futures are repeatable and leave caller state unchanged', () => {
  const r = rack('CATSX'); const before = JSON.stringify(pool);
  const first = pricedCashout(engine, evalr, r, 0, pool, 4, options);
  assert.deepEqual(first, pricedCashout(engine, evalr, r, 0, pool, 4, options));
  assert.equal(rackKey(r), 'ACSTX'); assert.equal(JSON.stringify(pool), before);
});
test('existing seven-letter plays stay with the incumbent word policy', () => {
  const dictionary = ['CATS', 'SCATTER', 'EX'];
  assert.equal(pricedCashout(new WordEngine(dictionary), new FastEval(dictionary), rack('SCATTERX'),
    0, pool, 1, options), undefined);
});
test('disabled advanced policy is unchanged; enabled policy cashes a funded opportunity', () => {
  const view = { rack: rack('CATSX'), balance: 0, score: 0, bagLeft: 40, bagStart: 68, unseen: pool, seatCount: 6 };
  const p = { ...ADV_DEFAULTS, cashLen: 7 };
  assert.deepEqual(new AdvancedBot(evalr, engine, p).chooseWords(view), []);
  assert.deepEqual(new AdvancedBot(evalr, engine, { ...p, cashRolloutCost: 7 }).chooseWords(view), ['CATS']);
});
