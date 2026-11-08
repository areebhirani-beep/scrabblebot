import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WordEngine, type Rack } from './engine.js';
import { appearanceProbability, betterCompletionOpportunity, type OpportunityContext } from './completion-opportunity.js';
import { AdvancedBot, ADV_DEFAULTS, type AdvView } from './advanced.js';
import { FastEval, type SearchBudget } from './engine.js';

const rack = (text: string): Rack => {
  const out: Rack = new Map();
  for (const letter of text) out.set(letter, (out.get(letter) ?? 0) + 1);
  return out;
};
const budget = { now: () => 0, budgetMs: 2, maxOperations: 20_000 };
const context: OpportunityContext = { balance: 94, bagLeft: 62, unseen: { total: 100, counts: { Q: 1, E: 99 } } };

test('appearance probability uses without-replacement draws and bounds', () => {
  assert.ok(Math.abs(appearanceProbability(100, 1, 61) - .61) < 1e-12);
  assert.ok(Math.abs(appearanceProbability(4, 2, 2) - 5 / 6) < 1e-12);
  assert.equal(appearanceProbability(4, 2, 4), 1);
  for (const [n, c, d] of [[0, 0, 1], [4, 5, 1], [4, 1, -1], [4, 0, 2], [4, 1, 0]])
    assert.equal(appearanceProbability(n!, c!, d!), 0);
});

test('retained losing world: AEILTU can retain LIQUATE48 instead of funding ALUNITE21', () => {
  const input = rack('AEILTU'); const copy = new Map(input);
  const result = betterCompletionOpportunity(new WordEngine(['ALUNITE', 'LIQUATE']), input, 'N', 21, context, budget);
  assert.equal(result?.word, 'LIQUATE'); assert.equal(result?.score, 48);
  assert.ok(Math.abs(result!.availableUpside - 16.47) < 1e-10);
  assert.deepEqual(input, copy);
});

test('retained successful world: stronger APOTHEM42 does not suppress PLUMATE33', () => {
  const engine = new WordEngine(['PLUMATE', 'APOTHEM', 'COMPUTE', 'POMATUM', 'PANTOUM']);
  assert.equal(betterCompletionOpportunity(engine, rack('AEMOPTU'), 'L', 33,
    { balance: 71, bagLeft: 30, unseen: { total: 4, counts: { H: 1, C: 1, M: 1, N: 1 } } }, budget), undefined);
});

test('exhausted letters, invalid unseen counts, and absent alternatives do not suppress', () => {
  const engine = new WordEngine(['LIQUATE']); const input = rack('AEILTU');
  const cases: OpportunityContext['unseen'][] = [
    { total: 100, counts: { Q: 0, E: 100 } }, { total: 100, counts: { Q: 1 } },
    { total: 100, counts: { Q: -1, E: 101 } },
  ];
  for (const unseen of cases) {
    assert.equal(betterCompletionOpportunity(engine, input, 'N', 21, { ...context, unseen }, budget), undefined);
  }
});

test('late game and low balance retain the completion floor', () => {
  const engine = new WordEngine(['LIQUATE']);
  for (const extra of [{ balance: 23 }, { bagLeft: 18 }, { balance: NaN }])
    assert.equal(betterCompletionOpportunity(engine, rack('AEILTU'), 'N', 21, { ...context, ...extra }, budget), undefined);
});

test('a rare remaining opportunity must have enough availability-weighted upside', () => {
  assert.equal(betterCompletionOpportunity(new WordEngine(['LIQUATE']), rack('AEILTU'), 'N', 21,
    { ...context, bagLeft: 20 }, budget), undefined);
});

test('budget exhaustion, invalid options and infeasible duplicate letters retain the floor', () => {
  const engine = new WordEngine(['LIQUATE']);
  for (const limited of [{ ...budget, budgetMs: 0 }, { ...budget, maxOperations: 1 }, { ...budget, deadlineMs: 0 }])
    assert.equal(betterCompletionOpportunity(engine, rack('AEILTU'), 'N', 21, context, limited), undefined);
  assert.equal(betterCompletionOpportunity(engine, rack('AEILLT'), 'N', 21, context, budget), undefined);
  assert.equal(betterCompletionOpportunity(engine, rack('AEILTU'), 'N', 21, { ...context, minAvailableUpside: NaN }, budget), undefined);
});

class ZeroEval extends FastEval {
  override evalCounts(_counts: Uint8Array, _maxWords = 3, _words?: string[], _budget: SearchBudget = {}): number { return 0; }
}
function makeBot(words: string[], guard: boolean): AdvancedBot {
  return new AdvancedBot(new ZeroEval(words), new WordEngine(words), {
    ...ADV_DEFAULTS, samples: 1, cashLen: 7, completionFloorGain: 1,
    completionFloorMaxBid: 12, completionOpportunityGuard: guard,
  });
}

test('opt-in opportunity guard removes only the new completion floor on its MC-zero path', () => {
  const view: AdvView = { rack: rack('AEILTU'), balance: 94, score: 0, bagLeft: 62,
    bagStart: 68, unseen: context.unseen, seatCount: 6, wordPending: false };
  assert.equal(ADV_DEFAULTS.completionOpportunityGuard, undefined);
  assert.equal(makeBot(['ALUNITE', 'LIQUATE'], false).decideBid(view, 'N'), 12);
  const guarded = makeBot(['ALUNITE', 'LIQUATE'], true);
  assert.equal(guarded.decideBid(view, 'N'), 0);
  assert.equal(guarded.completionFloorStats.opportunityVetoes, 1);
});

test('guard leaves the useful 33-point completion floor available', () => {
  const words = ['PLUMATE', 'APOTHEM', 'PANTOUM'];
  const view: AdvView = { rack: rack('AEMOPTU'), balance: 71, score: 0, bagLeft: 30,
    bagStart: 68, unseen: { total: 2, counts: { H: 1, N: 1 } }, seatCount: 6, wordPending: false };
  const guarded = makeBot(words, true);
  assert.equal(guarded.decideBid(view, 'L'), 12);
  assert.equal(guarded.completionFloorStats.opportunityVetoes, 0);
});
