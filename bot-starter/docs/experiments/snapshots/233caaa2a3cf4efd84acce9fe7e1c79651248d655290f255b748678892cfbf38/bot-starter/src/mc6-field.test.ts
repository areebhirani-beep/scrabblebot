import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMc6Field, effectiveMCRival, validateSimConfig, type Player } from './sim.js';
import { ADV_DEFAULTS, type AdvParams } from './advanced.js';

const player = (name: string): Player => ({
  name, rack: new Map(), balance: 100, score: 0, bid: () => 0, play: () => [],
});

test('mc6 builds own player plus exactly five independently configured advanced rivals', () => {
  const me = player('ME');
  const rival = { ...ADV_DEFAULTS, samples: 24, bidGain: 1.5, cashLen: 7, facePremium: 2 };
  const calls: { name: string; parameters: AdvParams }[] = [];
  let ownCalls = 0;
  const field = buildMc6Field(() => { ownCalls++; return me; }, (name, parameters) => {
    calls.push({ name, parameters });
    return player(name);
  }, rival);
  assert.equal(ownCalls, 1);
  assert.equal(field.length, 6);
  assert.equal(field[0], me);
  assert.deepEqual(field.map(p => p.name), ['ME', 'r1', 'r2', 'r3', 'r4', 'r5']);
  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.deepEqual(call.parameters, rival);
    assert.notEqual(call.parameters, rival);
  }
  calls[0]!.parameters.bidGain = 99;
  assert.equal(calls[1]!.parameters.bidGain, 1.5);
  assert.equal(rival.bidGain, 1.5);
  assert.equal(new Set(field).size, 6);
});

test('mc6 validates for both auction modes and both controlled player types', () => {
  for (const bot of ['adv', 'v1'] as const) {
    for (const auctionType of ['Vickrey', 'FirstPrice'] as const) {
      const config = { bot, p: { bidGain: 1.1 }, rival: { bidGain: 1.7 }, field: 'mc6', auctionType };
      assert.equal(validateSimConfig(config), config);
    }
  }
});

test('existing field validation and effective-rival classification remain unchanged', () => {
  for (const field of ['gauntlet', 'sims', 'hu', 'big', 'mc', 'mchu', 'live', 'mcbig']) {
    assert.equal(validateSimConfig({ bot: 'adv', p: {}, field }).field, field);
  }
  const rival = { ...ADV_DEFAULTS, bidGain: 1.7 };
  for (const field of ['mc', 'mchu', 'live', 'mcbig', 'mc6']) {
    assert.equal(effectiveMCRival(field, rival), rival);
  }
  for (const field of ['gauntlet', 'sims', 'hu', 'big']) {
    assert.equal(effectiveMCRival(field, rival), undefined);
  }
});

test('near-miss field names and invalid modes remain rejected', () => {
  for (const field of ['mc5', 'MC6', 'mc6 ', 'leader-replica']) {
    assert.throws(() => validateSimConfig({ bot: 'adv', p: {}, field }), /Unknown interactive field/);
  }
  assert.throws(() => validateSimConfig({ bot: 'other', p: {}, field: 'mc6' }), /Unknown simulation bot/);
  assert.throws(() => validateSimConfig({ bot: 'adv', p: {}, field: 'mc6', auctionType: 'Dutch' }), /Unknown auctionType/);
});
