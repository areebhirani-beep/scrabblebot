import assert from "node:assert/strict";
import { test } from "node:test";
import { createMarketWorld } from "./market-random.js";

const bag = [..."AAAAABBBCCDEEFGHIJKLMNOPQRSTUVWXYZ"];
const prices = (letter: string, round: number) => [letter.charCodeAt(0) % 11, round + 2, 17];
const world = (index = 0) => createMarketWorld(714, index, bag, prices, [12, 33, 54], 5);

test("market worlds replay exactly and precompute one price and tie uniform per auction", () => {
  const a = world();
  assert.deepEqual(a, world());
  assert.deepEqual([...a.bag].sort(), [...bag].sort());
  assert.equal(a.rivalBids.length, bag.length - 5);
  assert.equal(a.tieUniforms.length, bag.length - 5);
  assert.ok(a.tieUniforms.every(x => x >= 0 && x < 1));
});

test("conditional tie usage and skipped matches cannot change future prices or deals", () => {
  const a = world();
  const usedTies = a.tieUniforms.filter((_u, i) => i % 3 === 0);
  assert.ok(usedTies.length);
  assert.deepEqual(world().rivalBids, a.rivalBids);
  assert.deepEqual(world().bag, a.bag);
  const direct = world(8);
  for (let i = 0; i < 8; i++) world(i);
  assert.deepEqual(world(8), direct);
  assert.notDeepEqual(world(1).bag, a.bag);
});

test("score and price sampling streams cannot perturb the deal or tie stream", () => {
  const a = world();
  const b = createMarketWorld(714, 0, bag, () => [999], [888], 5);
  assert.deepEqual(a.bag, b.bag);
  assert.deepEqual(a.tieUniforms, b.tieUniforms);
  assert.ok(b.rivalBids.every(x => x === 999));
  assert.equal(b.historicalScore, 888);
});

test("invalid or empty exogenous inputs fail explicitly", () => {
  assert.throws(() => createMarketWorld(1, 0, bag, prices, [], 5), /Historical score pool/);
  assert.throws(() => createMarketWorld(1, 0, bag, () => [], [1], 5), /Rival price pool/);
  assert.throws(() => createMarketWorld(1, -1, bag, prices, [1], 5), /nonnegative match index/);
});
