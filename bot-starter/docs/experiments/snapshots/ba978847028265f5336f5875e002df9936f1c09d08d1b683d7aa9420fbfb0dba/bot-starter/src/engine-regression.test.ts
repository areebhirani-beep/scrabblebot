import assert from "node:assert/strict";
import test from "node:test";
import { FastEval, WordEngine, toCounts, type Rack, type SearchBudget } from "./engine.js";
import { MonteCarlo } from "./montecarlo.js";

const rack = (letters: string): Rack => {
  const out: Rack = new Map();
  for (const letter of letters) out.set(letter, (out.get(letter) ?? 0) + 1);
  return out;
};

test("fast evaluation includes legal two-letter words and residual pairs", () => {
  const evaluator = new FastEval(["AX", "AT"]);
  assert.equal(evaluator.evalCounts(toCounts(rack("AX"))), 9);
  assert.equal(evaluator.evalCounts(toCounts(rack("AATX"))), 11);
});

test("each MC sample preserves nonnegative marginal value under greedy splits", () => {
  const mc = new MonteCarlo(new FastEval(["GET", "TUX", "GUEST"]));
  const value = mc.value(rack("GETTUX"), "S", { counts: {}, total: 0 }, 0, 1, 7);
  assert.equal(value, 0);
});

test("zero MC budget does no evaluator work", () => {
  let calls = 0;
  const evaluator = { evalCounts: () => { calls++; return 0; } } as unknown as FastEval;
  assert.equal(new MonteCarlo(evaluator).value(rack("X"), "A", { counts: {}, total: 0 }, 0, 100, 7, 0), 0);
  assert.equal(calls, 0);
});

test("inner evaluator scans honor an injected elapsed-time deadline", () => {
  let ticks = 0;
  const evaluator = new FastEval(["ZZZ", "YYY", "XXX", "AX"], 2);
  const counts = toCounts(rack("AAX"));
  assert.equal(evaluator.evalCounts(counts, 3, undefined, {
    budgetMs: 2, maxOperations: 100, now: () => ticks++,
  }), 0);
  assert.deepEqual(counts, toCounts(rack("AAX")));
  assert.ok(ticks >= 2);
});

test("MC shares its original deadline and discards an exhausted paired sample", () => {
  let calls = 0;
  let original: SearchBudget | undefined;
  const evaluator = { evalCounts: (_counts: Uint8Array, _max: number, _words: unknown, budget: SearchBudget) => {
    original ??= budget;
    assert.equal(budget, original);
    assert.equal(budget.deadlineMs, 10);
    calls++;
    if (calls === 4) budget.tracker!.exhausted = true;
    return calls === 2 ? 2 : calls === 4 ? 100 : 0;
  } } as unknown as FastEval;
  const value = new MonteCarlo(evaluator).value(rack("X"), "A", { counts: { T: 1, U: 1 }, total: 2 }, 1, 100, 7, 10, () => 0);
  assert.equal(calls, 4);
  assert.equal(value, 2);
});

test("word enumeration and recursive playout honor an explicit operation cap", () => {
  const engine = new WordEngine(["AX", "AT"]);
  assert.deepEqual(engine.spellable(rack("AATX"), 2, { maxOperations: 0 }), []);
  const plan = engine.bestPlayout(rack("AATX"), 12, 4, { maxOperations: 0 });
  assert.deepEqual(plan.words, []);
  assert.equal(plan.score, 0);
  assert.equal(plan.exact, false);
});
