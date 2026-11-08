import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runMatch, selectServerLongest, validateSimConfig, effectiveMCRival, type Player } from './sim.js';
import type { SimWorld } from './sim-random.js';
import { ADV_DEFAULTS } from './advanced.js';

function world(auctions: string[], priority = [0, 1]): SimWorld {
  return { startingRacks: [['C', 'T', 'E', 'E', 'E'], ['B', 'D', 'F', 'G', 'H']], auctions,
    tieOrder: auctions.map(() => priority), bidJitter: auctions.map(() => [0, 0]) };
}
function player(name: string, changes: Partial<Player> = {}): Player {
  return { name, rack: new Map(), balance: 100, score: 0, bid: () => 0, play: () => [], ...changes };
}

test('external award reaction sees the next open auction and cannot react after final close', () => {
  const observations: { bagLeft: number; changed: boolean; hasA: boolean }[] = [];
  const p = player('external');
  p.bid = () => 5;
  p.play = (bagLeft, changed) => {
    observations.push({ bagLeft, changed, hasA: (p.rack.get('A') ?? 0) > 0 });
    return bagLeft === 0 && p.rack.has('A') ? ['CAT'] : [];
  };
  runMatch([p, player('rival')], 1, 0, { world: world(['A', 'I']), dictionary: new Set(['CAT']) });
  assert.deepEqual(observations, [
    { bagLeft: 1, changed: true, hasA: false },
    { bagLeft: 0, changed: true, hasA: true },
    { bagLeft: 0, changed: true, hasA: false }, // authoritative word receipt
  ]);
  assert.equal(p.score, 5);
  assert.equal(p.rack.get('I'), 1); // Last award exists, but no subsequent play.
});

test('server-simulated winner may play inside final close while an external winner cannot', () => {
  for (const serverSimulated of [true, false]) {
    let calls = 0;
    const p = player('winner', { serverSimulated, bid: () => 5 });
    p.play = (_bagLeft, changed) => {
      calls++;
      return changed && p.rack.has('A') ? ['CAT'] : [];
    };
    runMatch([p, player('other')], 1, 0, { world: world(['A']), dictionary: new Set(['CAT']) });
    assert.equal(p.score, serverSimulated ? 5 : 0);
    assert.equal(calls, 1);
  }
});

test('word validation rejects nonwords and insufficient multiplicities without consuming inventory', () => {
  const p = player('words', { play: () => ['NOPE', 'CC', ' CTE', 'ct'] });
  const result = runMatch([p, player('other')], 1, 0,
    { world: world(['A']), dictionary: new Set(['CC', 'CT']) });
  assert.deepEqual(result.plays, [{ botId: 0n, word: 'CT' }]);
  assert.equal(p.score, 4);
  assert.equal(p.balance, 104);
  assert.deepEqual([...p.rack], [['E', 3]]);
});

test('second-price, first-price, reserve and fixed tie priority settle correctly', () => {
  for (const auctionType of ['Vickrey', 'FirstPrice'] as const) {
    const p = player('winner', { bid: () => 10 });
    const q = player('runner-up', { bid: () => 6 });
    runMatch([p, q], 1, 0, { world: world(['A']), dictionary: new Set(), auctionType });
    assert.equal(p.balance, auctionType === 'Vickrey' ? 94 : 90);
  }
  const alone = player('alone', { bid: () => 10 });
  runMatch([alone, player('silent')], 1, 0, { world: world(['A']), dictionary: new Set() });
  assert.equal(alone.balance, 99);
  const a = player('a', { bid: () => 6 });
  const b = player('b', { bid: () => 6 });
  const tied = runMatch([a, b], 1, 0, { world: world(['A'], [1, 0]), dictionary: new Set() });
  assert.deepEqual(tied.results, [{ letter: 'A', winner: 1n }]);
  assert.equal(b.balance, 94);
});

test('changing our purchase changes a reactive rival subsequent bid in the same exogenous world', () => {
  const bids: number[] = [];
  for (const firstBid of [0, 12]) {
    const me = player('me', { bid: letter => letter === 'A' ? firstBid : 10 });
    const rival = player('rival');
    rival.bid = letter => {
      if (letter === 'A') return 9;
      const amount = rival.rack.has('A') ? 20 : 2;
      bids.push(amount);
      return amount;
    };
    runMatch([me, rival], 1, 0, { world: world(['A', 'I']), dictionary: new Set() });
  }
  assert.deepEqual(bids, [20, 2]);
});

test('external word receipts replan after balance changes instead of cashing a stale list', () => {
  const p = player('external');
  const balances: number[] = [];
  p.play = () => {
    balances.push(p.balance);
    return p.balance <= 100 ? ['AT', 'AT'] : [];
  };
  const fixture: SimWorld = { ...world(['I']), startingRacks: [['A', 'A', 'T', 'T', 'E'], ['B', 'D', 'F', 'G', 'H']] };
  const result = runMatch([p, player('other')], 1, 0, { world: fixture, dictionary: new Set(['AT']) });
  assert.deepEqual(balances, [100, 102]);
  assert.deepEqual(result.plays, [{ botId: 0n, word: 'AT' }]);
  assert.equal(p.score, 2);
  assert.equal(p.rack.get('A'), 1);
  assert.equal(p.rack.get('T'), 1);
});

test('server longest-word ties use lexical order, not face score', () => {
  assert.equal(selectServerLongest([{ word: 'ZOO', score: 12 }, { word: 'ACE', score: 5 }]), 'ACE');
});

test('CLI configuration rejects invalid bot and auction type before any match', () => {
  const base = { bot: 'adv', p: {}, field: 'live' };
  for (const bot of ['adV', '', 'unknown', undefined]) {
    assert.throws(() => validateSimConfig({ ...base, bot }), /simulation bot/);
  }
  for (const auctionType of ['first-price', '', null, 0]) {
    assert.throws(() => validateSimConfig({ ...base, auctionType }), /auctionType/);
  }
  for (const auctionType of [undefined, 'Vickrey', 'FirstPrice']) {
    assert.equal(validateSimConfig({ ...base, auctionType }).auctionType, auctionType);
  }
  assert.throws(() => validateSimConfig({ ...base, field: 'typo' }), /interactive field/);
});

test('rival metadata covers every MC field and does not claim unused rivals', () => {
  const rival = { ...ADV_DEFAULTS, samples: 24, bidGain: 1.3, facePremium: 2 };
  for (const field of ['mc', 'mchu', 'live', 'mcbig']) assert.equal(effectiveMCRival(field, rival), rival);
  for (const field of ['gauntlet', 'sims', 'hu', 'big']) assert.equal(effectiveMCRival(field, rival), undefined);
});

test('direct match API also rejects invalid auction modes before executing a policy', () => {
  let calls = 0;
  const p = player('guard', { bid: () => { calls++; return 1; } });
  assert.throws(() => runMatch([p, player('other')], 1, 0, {
    world: world(['A']), dictionary: new Set(), auctionType: 'FirstPric' as 'FirstPrice',
  }), /auctionType/);
  assert.equal(calls, 0);
});
