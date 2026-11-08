import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inferOpponentInitialTiles, type PublicInitialEvent } from './opponent-initial-diagnostic.js';

const evidence = { myBotId: 0n, completeFromStart: true, completeThrough: 100n };
const word = (id: string, at: bigint, value: string): PublicInitialEvent => ({ kind: 'word', id, at, botId: 1n, word: value });
const award = (id: string, at: bigint, letter: string): PublicInitialEvent => ({ kind: 'award', id, at, botId: 1n, letter });

test('prefix maximum retains initial information after a later matching award', () => {
  const result = inferOpponentInitialTiles([word('w1', 1n, 'AT'), award('a1', 2n, 'A')], evidence);
  assert.equal(result.usable, true);
  assert.deepEqual(result.lowerBounds.get(1n), new Map([['A', 1], ['T', 1]]));
});

test('earlier awards are not counted twice, multiplicities and duplicate events are respected', () => {
  const a = award('a1', 1n, 'A');
  const w = word('w1', 2n, 'AA');
  const result = inferOpponentInitialTiles([w, a, w, a], evidence);
  assert.equal(result.usable, true);
  assert.deepEqual(result.lowerBounds.get(1n), new Map([['A', 1]]));
});

test('equal timestamps conservatively process awards first independent of callback order', () => {
  const result = inferOpponentInitialTiles([word('w1', 2n, 'AT'), award('a1', 2n, 'A')], evidence);
  assert.equal(result.usable, true);
  assert.deepEqual(result.lowerBounds.get(1n), new Map([['T', 1]]));
});

test('unsettled events and our words are excluded, and unverified history fails closed', () => {
  const events: PublicInitialEvent[] = [word('w1', 101n, 'AT'), { ...word('own', 1n, 'AT'), botId: 0n }];
  assert.equal(inferOpponentInitialTiles(events, evidence).lowerBounds.size, 0);
  const result = inferOpponentInitialTiles([word('w1', 1n, 'AT')], { ...evidence, completeFromStart: false });
  assert.equal(result.usable, false);
  assert.equal(result.lowerBounds.size, 0);
});

test('contradictory events, impossible deal and global tile counts fail closed', () => {
  const cases: PublicInitialEvent[][] = [
    [word('w1', 1n, 'AT'), word('w1', 1n, 'IT')],
    [word('w1', 1n, 'ABCDEF')],
    [word('w1', 1n, 'ZZ')], // Only one Z in the full bag.
    [word('w1', 1n, 'aT')],
  ];
  for (const events of cases) {
    const result = inferOpponentInitialTiles(events, evidence);
    assert.equal(result.usable, false);
    assert.equal(result.lowerBounds.size, 0);
  }
});
