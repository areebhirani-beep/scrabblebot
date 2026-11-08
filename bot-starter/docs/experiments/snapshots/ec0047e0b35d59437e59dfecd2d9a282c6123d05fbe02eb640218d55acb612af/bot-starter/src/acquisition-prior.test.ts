import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acquisitionWeights } from './acquisition-prior.js';
import { sampleFuture, rng, MonteCarlo } from './montecarlo.js';
import { FastEval } from './engine.js';

test('disabled price prior preserves the original seeded draws and MC value', () => {
  assert.equal(acquisitionWeights(0), undefined);
  const pool = { A: 6, X: 2, Z: 1 };
  assert.deepEqual(sampleFuture(pool, 9, 5, rng(61)), sampleFuture(pool, 9, 5, rng(61), acquisitionWeights(0)));
  const mc = new MonteCarlo(new FastEval(['AX', 'ZA', 'AA']));
  const args = [new Map([['A', 1]]), 'X', { counts: pool, total: 9 }, 3, 24, 100] as const;
  assert.equal(mc.value(...args, 300, () => 0), mc.value(...args, 300, () => 0, undefined, acquisitionWeights(0)));
});
test('weighted future sampling respects counts, no replacement, and leaves the pool intact', () => {
  const pool = { A: 2, Z: 1 };
  for (let seed = 0; seed < 40; seed++) {
    const draw = sampleFuture(pool, 3, 10, rng(seed), { A: 20, Z: .01 });
    assert.equal(draw[0], 2); assert.equal(draw[25], 1); assert.equal(draw.reduce((a, b) => a + b, 0), 3);
  }
  assert.deepEqual(pool, { A: 2, Z: 1 });
});
test('price weighting changes composition in the specified direction', () => {
  const uniform = sampleFuture({ A: 1, Z: 1 }, 2, 1, () => .7);
  const weighted = sampleFuture({ A: 1, Z: 1 }, 2, 1, () => .7, { A: 9, Z: 1 });
  assert.equal(uniform[25], 1); assert.equal(weighted[0], 1);
  assert.ok(acquisitionWeights(1)!.A! > acquisitionWeights(1)!.Z!);
});
test('a cheaper future U increases the current Q value toward the real seven-letter EQUINOX reward', () => {
  const mc = new MonteCarlo(new FastEval(['EQUINOX']));
  const rack = new Map([... 'EINOX'].map(letter => [letter, 1] as const));
  const unseen = { counts: { U: 1, Z: 1 }, total: 2 };
  const uniform = mc.value(rack, 'Q', unseen, 1, 24, 91, 300, () => 0);
  const weighted = mc.value(rack, 'Q', unseen, 1, 24, 91, 300, () => 0, undefined, { U: 9, Z: 1 });
  assert.ok(weighted > uniform);
  assert.ok(weighted <= 69);
});
test('invalid acquisition parameters fail explicitly', () => {
  for (const power of [NaN, Infinity, -1, 4]) assert.throws(() => acquisitionWeights(power));
  assert.throws(() => sampleFuture({ A: 1 }, 1, 1, () => .5, { A: 0 }));
});
