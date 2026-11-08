import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FastEval, reward } from './engine.js';

const countsFor = (letters: string): Uint8Array => {
  const counts = new Uint8Array(26);
  for (const letter of letters) counts[letter.charCodeAt(0) - 65]!++;
  return counts;
};

// Independent canonical greedy oracle: normalize, keep the first anagram,
// order by descending reward with stable ties, and take the first fitting word.
function reference(words: string[], minimum = 2) {
  const seen = new Set<string>();
  const entries: { word: string; score: number; counts: Uint8Array }[] = [];
  for (const raw of words) {
    const word = raw.trim().toUpperCase();
    if (word.length < minimum || !/^[A-Z]+$/.test(word)) continue;
    const key = [...word].sort().join('');
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ word, score: reward(word), counts: countsFor(word) });
  }
  entries.sort((a, b) => b.score - a.score);
  return (counts: Uint8Array, maxWords: number, chosen: string[]): number => {
    let total = 0;
    for (let step = 0; step < maxWords; step++) {
      const entry = entries.find(candidate => candidate.counts.every((count, index) => count <= counts[index]!));
      if (!entry) break;
      chosen.push(entry.word);
      total += entry.score;
      for (let index = 0; index < 26; index++) counts[index]! -= entry.counts[index]!;
    }
    return total;
  };
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('indexed greedy matches canonical scores, words and residuals on seeded racks', () => {
  const rnd = random(71931);
  const alphabet = 'ABCDEFGHIJKLMN';
  const dictionary = ['AN', 'AT', 'AX', 'AB', 'BA', 'ABA', 'AAB', 'AAA', 'TUX', 'GUEST', 'GEST', 'GET', 'invalid!'];
  for (let entry = 0; entry < 300; entry++) {
    let word = '';
    const size = 2 + Math.floor(rnd() * 7);
    for (let index = 0; index < size; index++) word += alphabet[Math.floor(rnd() * alphabet.length)];
    dictionary.push(word);
  }
  const evaluator = new FastEval(dictionary);
  const canonical = reference(dictionary);
  for (let trial = 0; trial < 200; trial++) {
    let letters = '';
    const size = Math.floor(rnd() * 25);
    for (let index = 0; index < size; index++) letters += alphabet[Math.floor(rnd() * alphabet.length)];
    const actualCounts = countsFor(letters);
    const expectedCounts = actualCounts.slice();
    const actualWords: string[] = [];
    const expectedWords: string[] = [];
    const maxWords = trial % 6;
    const expectedScore = canonical(expectedCounts, maxWords, expectedWords);
    const actualScore = evaluator.evalCounts(actualCounts, maxWords, actualWords,
      { now: () => 0, maxOperations: 1_000_000 });
    assert.equal(actualScore, expectedScore, `score on trial ${trial}, rack ${letters}`);
    assert.deepEqual(actualWords, expectedWords, `words on trial ${trial}, rack ${letters}`);
    assert.deepEqual(actualCounts, expectedCounts, `residual on trial ${trial}, rack ${letters}`);
  }
});

test('score ties follow dictionary order rather than submask traversal order', () => {
  for (const dictionary of [['AN', 'AT'], ['AT', 'AN']]) {
    const counts = countsFor('ANT');
    const words: string[] = [];
    assert.equal(new FastEval(dictionary).evalCounts(counts, 1, words, { now: () => 0 }), 2);
    assert.deepEqual(words, [dictionary[0]]);
  }
});

test('duplicate letters and first-anagram spelling are preserved', () => {
  const evaluator = new FastEval([' aba ', 'AAB', 'AB', 'BA']);
  const counts = countsFor('AABAB');
  const words: string[] = ['existing'];
  assert.equal(evaluator.evalCounts(counts, 3, words, { now: () => 0 }), 9);
  assert.deepEqual(words, ['existing', 'ABA', 'AB']);
  assert.deepEqual(counts, new Uint8Array(26));
});

test('racks wider than twelve distinct letters retain canonical fallback behavior', () => {
  const dictionary = ['AB', 'ABCDEFGHIJKLM', 'JK', 'LM'];
  const counts = countsFor('ABCDEFGHIJKLM');
  const words: string[] = [];
  assert.equal(new FastEval(dictionary).evalCounts(counts, 3, words, { now: () => 0 }), reward(dictionary[1]!));
  assert.deepEqual(words, ['ABCDEFGHIJKLM']);
  assert.deepEqual(counts, new Uint8Array(26));
});

test('index exhaustion does not consume an unproved partial candidate', () => {
  const evaluator = new FastEval(['AN', 'AT']);
  const counts = countsFor('ANT');
  const before = counts.slice();
  const words: string[] = [];
  const tracker = { operations: 0, exhausted: false };
  // Descending submask order discovers AT before the preferred equal-score AN.
  assert.equal(evaluator.evalCounts(counts, 1, words,
    { now: () => 0, maxOperations: 5, tracker }), 0);
  assert.deepEqual(counts, before);
  assert.deepEqual(words, []);
  assert.equal(tracker.exhausted, true);
  assert.equal(tracker.operations, 5);
});

test('zero deadline and zero operation budget leave the rack unchanged', () => {
  const evaluator = new FastEval(['AB']);
  for (const budget of [{ now: () => 0, deadlineMs: 0 }, { now: () => 0, maxOperations: 0 }]) {
    const counts = countsFor('ABAB');
    const words: string[] = [];
    assert.equal(evaluator.evalCounts(counts, 3, words, budget), 0);
    assert.deepEqual(counts, countsFor('ABAB'));
    assert.deepEqual(words, []);
  }
});
