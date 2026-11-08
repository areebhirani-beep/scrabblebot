import assert from 'node:assert/strict';
import test from 'node:test';
import { type Rack, WordEngine } from './engine.js';
import { proveTerminalGain } from './terminal-proof.js';

const rack = (letters: string): Rack => {
  const out: Rack = new Map();
  for (const letter of letters) out.set(letter, (out.get(letter) ?? 0) + 1);
  return out;
};
const deterministic = { now: () => 0 };

test('terminal proof certifies CT plus A with one legal scoring word', () => {
  const original = rack('CT');
  assert.deepEqual(proveTerminalGain(new WordEngine(['CAT']), original, 'A', deterministic),
    { word: 'CAT', score: 5, baselineScore: 0, gain: 5 });
  assert.deepEqual(original, rack('CT'));
});

test('terminal proof rejects a dead tile and equal-score alternative', () => {
  assert.equal(proveTerminalGain(new WordEngine(['CAT']), rack('C'), 'A', deterministic), undefined);
  assert.equal(proveTerminalGain(new WordEngine(['AT', 'IT']), rack('AT'), 'I', deterministic), undefined);
});

test('terminal proof compares against optimal splits, not greedy differences', () => {
  const engine = new WordEngine(['GET', 'TUX', 'GUEST']);
  // GET + TUX scores 14; the enhanced single word GUEST scores only 12.
  assert.equal(proveTerminalGain(engine, rack('GETTUX'), 'S', deterministic), undefined);
});

test('terminal proof preserves duplicate-tile requirements', () => {
  const engine = new WordEngine(['TOO', 'LOOT']);
  assert.deepEqual(proveTerminalGain(engine, rack('TOO'), 'L', deterministic),
    { word: 'LOOT', score: 6, baselineScore: 3, gain: 3 });
  assert.equal(proveTerminalGain(engine, rack('TO'), 'L', deterministic), undefined);
});

test('terminal proof fails closed on zero budget or incomplete baseline', () => {
  const engine = new WordEngine(['CAT']);
  assert.equal(proveTerminalGain(engine, rack('CT'), 'A', { ...deterministic, budgetMs: 0 }), undefined);
  assert.equal(proveTerminalGain(engine, rack('CT'), 'A', { ...deterministic, maxOperations: 1 }), undefined);
  assert.equal(proveTerminalGain(engine, rack('CT'), 'A', { ...deterministic, deadlineMs: 0 }), undefined);
});

test('terminal proof shares the deadline across baseline and enhanced search', () => {
  let ticks = 0;
  const tracker = { operations: 0, exhausted: false };
  assert.equal(proveTerminalGain(new WordEngine(['CAT']), rack('CT'), 'A',
    { budgetMs: 3, now: () => ticks++, tracker }), undefined);
  assert.ok(ticks >= 3);
});

test('terminal proof rejects invalid letters, counts and budgets', () => {
  const engine = new WordEngine(['CAT']);
  for (const letter of ['', 'AA', 'a', '?']) {
    assert.equal(proveTerminalGain(engine, rack('CT'), letter, deterministic), undefined);
  }
  for (const count of [-1, 0.5, NaN, Infinity, 99]) {
    assert.equal(proveTerminalGain(engine, new Map([['C', count]]), 'A', deterministic), undefined);
  }
  assert.equal(proveTerminalGain(engine, rack('CT'), 'A', { budgetMs: NaN }), undefined);
});
