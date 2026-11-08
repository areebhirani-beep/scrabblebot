/**
 * Offline only. Run with node --max-old-space-size=512 --import tsx tools/bench_eval.ts.
 * OLD_ENGINE may select an absolute path to a frozen canonical engine.ts.
 * No connections, credentials, reducers, or live process controls are used.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FastEval, FULL_BAG } from '../src/engine.js';
import { wordlistPath } from '../src/brain.js';

const SEED = 880202;
const RACKS = 200;
const WARMUPS = 12;
const MAX_WORDS = 3;
const FROZEN_COMMIT = '6ed86a73c28779a96f0d21214aa97fa7e30fea8b';

interface Evaluator {
  evalCounts(counts: Uint8Array, maxWords: number, words: string[], budget: {
    budgetMs: number;
    maxOperations: number;
    tracker: { operations: number; exhausted: boolean };
  }): number;
}
interface Measurement {
  score: number;
  words: string[];
  counts: Uint8Array;
  elapsedMs: number;
  exhausted: boolean;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function countsFor(letters: string): Uint8Array {
  const result = new Uint8Array(26);
  for (const letter of letters) result[letter.charCodeAt(0) - 65]!++;
  return result;
}

function measure(evaluator: Evaluator, rack: Uint8Array): Measurement {
  const counts = rack.slice();
  const words: string[] = [];
  const tracker = { operations: 0, exhausted: false };
  const started = performance.now();
  const score = evaluator.evalCounts(counts, MAX_WORDS, words,
    { budgetMs: 1000, maxOperations: 2_000_000, tracker });
  return { score, words, counts, elapsedMs: performance.now() - started, exhausted: tracker.exhausted };
}

function same(a: Measurement, b: Measurement): boolean {
  return a.score === b.score
    && a.words.length === b.words.length && a.words.every((word, index) => word === b.words[index])
    && a.counts.every((count, index) => count === b.counts[index]);
}

function timing(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  const quantile = (fraction: number): number => {
    const index = (sorted.length - 1) * fraction;
    const low = Math.floor(index);
    const high = Math.ceil(index);
    return sorted[low]! + (sorted[high]! - sorted[low]!) * (index - low);
  };
  const rounded = (value: number): number => Number(value.toFixed(3));
  return {
    totalMs: rounded(values.reduce((sum, value) => sum + value, 0)),
    medianMs: rounded(quantile(0.5)),
    p95Ms: rounded(quantile(0.95)),
    maxMs: rounded(sorted[sorted.length - 1]!),
  };
}

async function main(): Promise<void> {
  const starterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const oldPath = process.env.OLD_ENGINE
    ?? path.join(starterRoot, '.runtime-odysseus', 'releases', FROZEN_COMMIT, 'bot-starter', 'src', 'engine.ts');
  if (!path.isAbsolute(oldPath)) throw new Error('OLD_ENGINE must be an absolute path');
  const oldModule = await import(pathToFileURL(oldPath).href) as {
    FastEval: new (words: Iterable<string>) => Evaluator;
  };
  const wordlist = fs.readFileSync(wordlistPath(), 'utf8');
  const dictionary = wordlist.split('\n');
  let started = performance.now();
  const canonical = new oldModule.FastEval(dictionary);
  const oldConstructionMs = performance.now() - started;
  started = performance.now();
  const indexed = new FastEval(dictionary);
  const indexedConstructionMs = performance.now() - started;

  const rnd = random(SEED);
  const bag = Object.entries(FULL_BAG).flatMap(([letter, count]) => Array<string>(count).fill(letter));
  const racks: Uint8Array[] = [];
  for (let trial = 0; trial < RACKS; trial++) {
    const remaining = bag.slice();
    const size = 5 + trial % 11;
    let letters = '';
    for (let draw = 0; draw < size; draw++) {
      const chosen = Math.floor(rnd() * remaining.length);
      letters += remaining[chosen]!;
      remaining.splice(chosen, 1);
    }
    racks.push(countsFor(letters));
  }
  // Guaranteed duplicate-count and >12-distinct fallback cases are included.
  racks[0] = countsFor('AABBE');
  racks[1] = countsFor('ABCDEFGHIJKLM');

  let warmupFailures = 0;
  for (let trial = 0; trial < WARMUPS; trial++) {
    const oldResult = measure(canonical, racks[trial]!);
    const newResult = measure(indexed, racks[trial]!);
    if (!same(oldResult, newResult) || oldResult.exhausted || newResult.exhausted) warmupFailures++;
  }

  const oldTimes: number[] = [];
  const newTimes: number[] = [];
  const examples: unknown[] = [];
  let mismatches = 0;
  let exhaustedComparisons = 0;
  for (let trial = 0; trial < racks.length; trial++) {
    const rack = racks[trial]!;
    let oldResult: Measurement;
    let newResult: Measurement;
    // Alternate execution order so one implementation is not always first.
    if (trial % 2 === 0) {
      oldResult = measure(canonical, rack);
      newResult = measure(indexed, rack);
    } else {
      newResult = measure(indexed, rack);
      oldResult = measure(canonical, rack);
    }
    oldTimes.push(oldResult.elapsedMs);
    newTimes.push(newResult.elapsedMs);
    if (oldResult.exhausted || newResult.exhausted) exhaustedComparisons++;
    if (!same(oldResult, newResult)) {
      mismatches++;
      if (examples.length < 3) examples.push({
        trial,
        rack: Array.from(rack).map((count, index) => String.fromCharCode(65 + index).repeat(count)).join(''),
        old: { score: oldResult.score, words: oldResult.words },
        indexed: { score: newResult.score, words: newResult.words },
      });
    }
  }

  const old = timing(oldTimes);
  const next = timing(newTimes);
  const passed = warmupFailures === 0 && mismatches === 0 && exhaustedComparisons === 0;
  const sizes = racks.map(rack => rack.reduce((sum, count) => sum + count, 0));
  console.log(JSON.stringify({
    passed,
    seed: SEED,
    racks: racks.length,
    warmups: WARMUPS,
    maxWords: MAX_WORDS,
    rackSizeRange: [Math.min(...sizes), Math.max(...sizes)],
    duplicateRacks: racks.filter(rack => rack.some(count => count > 1)).length,
    oldEngine: oldPath,
    wordlistSha256: createHash('sha256').update(wordlist).digest('hex'),
    constructionMs: { old: Number(oldConstructionMs.toFixed(3)), indexed: Number(indexedConstructionMs.toFixed(3)) },
    old,
    indexed: next,
    totalSpeedup: Number((oldTimes.reduce((sum, value) => sum + value, 0)
      / Math.max(Number.EPSILON, newTimes.reduce((sum, value) => sum + value, 0))).toFixed(3)),
    mismatches,
    exhaustedComparisons,
    warmupFailures,
    mismatchExamples: examples,
    rssMiBAtEnd: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Evaluator benchmark failed');
  process.exitCode = 1;
});
