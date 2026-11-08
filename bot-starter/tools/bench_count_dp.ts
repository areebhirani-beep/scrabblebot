/**
 * Offline only; root runs this serially after other work finishes:
 * node --max-old-space-size=512 --import tsx tools/bench_count_dp.ts
 * No connections, credentials, reducers, subprocesses, or live process controls.
 * Exactly 200 racks, six of which are reused for bounded warmup.
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { FULL_BAG, WordEngine, reward, type Rack } from '../src/engine.js';
import { wordlistPath } from '../src/brain.js';
import { countDp } from '../src/count-dp.js';

const SEED = 880203;
const RACKS = 200;
const WARMUPS = 6;
const MAX_WORDS = 3;
const BUDGET_MS = 3;
const MAX_OPERATIONS = 20_000;

interface Fixture { letters: string; kind: 'cash-trap' | 'duplicate' | 'packing-trap' | 'random'; matchId?: number }
interface Measurement {
  score: number;
  words: string[];
  elapsedMs: number;
  operations: number;
  complete: boolean;
  exhausted: boolean;
  unrestrictedExact?: boolean;
}
interface Pair { fixture: Fixture; old: Measurement; next: Measurement }

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function inventory(letters: string): Rack {
  const result: Rack = new Map();
  for (const letter of letters) result.set(letter, (result.get(letter) ?? 0) + 1);
  return result;
}
function timing(values: number[]) {
  if (!values.length) return { p50Ms: null, p95Ms: null, maxMs: null, totalMs: 0 };
  const sorted = values.slice().sort((a, b) => a - b);
  const quantile = (q: number) => {
    const index = (sorted.length - 1) * q;
    const lo = Math.floor(index);
    const hi = Math.ceil(index);
    return Number((sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (index - lo)).toFixed(4));
  };
  return { p50Ms: quantile(0.5), p95Ms: quantile(0.95), maxMs: quantile(1),
    totalMs: Number(values.reduce((sum, value) => sum + value, 0).toFixed(3)) };
}
function feasible(measurement: Measurement, fixture: Fixture, dictionary: Set<string>): boolean {
  const remaining = inventory(fixture.letters);
  if (measurement.words.length > MAX_WORDS) return false;
  for (const word of measurement.words) {
    if (!dictionary.has(word)) return false;
    for (const letter of word) {
      const count = remaining.get(letter) ?? 0;
      if (count <= 0) return false;
      remaining.set(letter, count - 1);
    }
  }
  return measurement.score === measurement.words.reduce((sum, word) => sum + reward(word), 0);
}
function measure(engine: WordEngine, fixture: Fixture, method: 'old' | 'next'): Measurement {
  const tracker = { operations: 0, exhausted: false };
  const rack = inventory(fixture.letters);
  const started = performance.now();
  const deadlineMs = started + BUDGET_MS;
  const budget = { budgetMs: BUDGET_MS, deadlineMs, maxOperations: MAX_OPERATIONS, tracker };
  if (method === 'next') {
    const result = countDp(engine, rack, MAX_WORDS, budget);
    return { score: result.score, words: result.words, elapsedMs: performance.now() - started,
      operations: tracker.operations, complete: result.complete, exhausted: tracker.exhausted };
  }
  const result = engine.bestPlayout(rack, Infinity, MAX_WORDS, budget);
  const finished = performance.now();
  // Infinite beam visits all branches for the max-three objective when the
  // shared tracker completes. bestPlayout.exact additionally requires that no
  // potentially usable letters remain at depth zero: a different objective.
  return { score: result.score, words: result.words, elapsedMs: finished - started,
    operations: tracker.operations, complete: !tracker.exhausted && finished < deadlineMs,
    exhausted: tracker.exhausted, unrestrictedExact: result.exact };
}
function summary(pairs: Pair[]) {
  const summarize = (method: 'old' | 'next') => ({
    ...timing(pairs.map(pair => pair[method].elapsedMs)),
    complete: pairs.filter(pair => pair[method].complete).length,
    exhausted: pairs.filter(pair => pair[method].exhausted).length,
    scoreTotal: pairs.reduce((sum, pair) => sum + pair[method].score, 0),
    operationsTotal: pairs.reduce((sum, pair) => sum + pair[method].operations, 0),
  });
  const both = pairs.filter(pair => pair.old.complete && pair.next.complete);
  return {
    racks: pairs.length,
    wordEngine: summarize('old'), countDp: summarize('next'),
    bothCompleted: { count: both.length,
      wordEngineScoreTotal: both.reduce((sum, pair) => sum + pair.old.score, 0),
      countDpScoreTotal: both.reduce((sum, pair) => sum + pair.next.score, 0),
      scoreMismatches: both.filter(pair => pair.old.score !== pair.next.score).length },
    incumbentComparisons: { countDpHigher: pairs.filter(pair => pair.next.score > pair.old.score).length,
      wordEngineHigher: pairs.filter(pair => pair.old.score > pair.next.score).length },
  };
}

function main(): void {
  const data = fs.readFileSync(wordlistPath(), 'utf8');
  const words = data.split(/\r?\n/).map(word => word.trim().toUpperCase()).filter(Boolean);
  if (words.length < 170_000) throw new Error('Benchmark requires the full ENABLE dictionary');
  const dictionary = new Set(words);
  const constructStarted = performance.now();
  const engine = new WordEngine(words);
  const constructionMs = performance.now() - constructStarted;
  const fixtures: Fixture[] = [
    // Audited own-rack episodes in .runtime-odysseus/cash-trap-handoff.json.
    // These are inventory benchmarks, not claims about optimal cash timing.
    { letters: 'EEHLPPT', kind: 'cash-trap', matchId: 42848 },
    { letters: 'DEFOORV', kind: 'cash-trap', matchId: 42845 },
    { letters: 'DEFHOOW', kind: 'cash-trap', matchId: 42808 },
    { letters: 'ABEFGIKLL', kind: 'cash-trap', matchId: 42893 },
    { letters: 'GETTUXS', kind: 'packing-trap' },
    { letters: 'AABBE', kind: 'duplicate' },
    { letters: 'AAEERR', kind: 'duplicate' },
    { letters: 'AAEENRR', kind: 'duplicate' },
    { letters: 'AAEENRST', kind: 'duplicate' },
    { letters: 'AAAEEERST', kind: 'duplicate' },
    { letters: 'AAAEEERRST', kind: 'duplicate' },
  ];
  const rnd = random(SEED);
  const bag = Object.entries(FULL_BAG).flatMap(([letter, count]) => Array<string>(count).fill(letter));
  for (let trial = 0; fixtures.length < RACKS; trial++) {
    const remaining = bag.slice();
    const size = 5 + trial % 6;
    let letters = '';
    for (let draw = 0; draw < size; draw++) {
      const index = Math.floor(rnd() * remaining.length);
      letters += remaining[index]!;
      remaining.splice(index, 1);
    }
    fixtures.push({ letters, kind: 'random' });
  }
  let invalidResults = 0;
  for (let i = 0; i < WARMUPS; i++) {
    for (const method of ['old', 'next'] as const) {
      if (!feasible(measure(engine, fixtures[i]!, method), fixtures[i]!, dictionary)) invalidResults++;
    }
  }
  const pairs: Pair[] = [];
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i]!;
    let old: Measurement;
    let next: Measurement;
    // Alternate order to limit consistent cache/JIT/thermal order bias.
    if (i % 2 === 0) { old = measure(engine, fixture, 'old'); next = measure(engine, fixture, 'next'); }
    else { next = measure(engine, fixture, 'next'); old = measure(engine, fixture, 'old'); }
    if (!feasible(old, fixture, dictionary)) invalidResults++;
    if (!feasible(next, fixture, dictionary)) invalidResults++;
    pairs.push({ fixture, old, next });
  }
  const overall = summary(pairs);
  console.log(JSON.stringify({
    benchmark: 'count-state DP versus exhaustive-beam WordEngine at max-three words',
    seed: SEED, maxWords: MAX_WORDS, budgetMs: BUDGET_MS, maxOperations: MAX_OPERATIONS,
    measuredRacks: RACKS, warmupEvaluations: WARMUPS * 2,
    dictionaryWords: words.length, dictionarySha256: createHash('sha256').update(data).digest('hex'),
    constructionMs: Number(constructionMs.toFixed(3)),
    completionDefinition: 'Exact at-most-three-word objective; WordEngine unrestricted exact flag is not used as that objective\'s completion flag.',
    invalidResults, overall,
    bySize: Object.fromEntries([5, 6, 7, 8, 9, 10].map(size =>
      [size, summary(pairs.filter(pair => pair.fixture.letters.length === size))])),
    byKind: Object.fromEntries(['cash-trap', 'duplicate', 'packing-trap', 'random'].map(kind =>
      [kind, summary(pairs.filter(pair => pair.fixture.kind === kind))])),
    observedFixtures: pairs.filter(pair => pair.fixture.kind === 'cash-trap'),
    disagreementExamples: pairs.filter(pair => pair.old.complete && pair.next.complete
      && pair.old.score !== pair.next.score).slice(0,5),
    limitation: 'Microbenchmark only. Timing is machine-dependent; equal operation counts do not imply equal primitive work. No match-strength or live-promotion conclusion.',
  }, null, 2));
  if (invalidResults > 0 || overall.bothCompleted.scoreMismatches > 0) process.exitCode = 1;
}

main();
