import assert from "node:assert/strict";
import { test } from "node:test";
import { FULL_BAG } from "./engine.js";
import { createSimWorld } from "./sim-random.js";
import { buildUnseen, type PublicMatch } from "./tracker.js";

const bag = Object.entries(FULL_BAG).flatMap(([letter, count]) => Array<string>(count).fill(letter));

test("interactive simulation conserves the bag and fixes immutable randomness per match", () => {
  const world = createSimWorld(519, 3, bag, 6);
  assert.deepEqual(world, createSimWorld(519, 3, bag, 6));
  assert.equal(world.auctions.length, 68);
  assert.ok(world.startingRacks.every(rack => rack.length === 5));
  assert.deepEqual([...world.startingRacks.flat(), ...world.auctions].sort(), [...bag].sort());
  for (let round = 0; round < world.auctions.length; round++) {
    assert.deepEqual([...world.tieOrder[round]!].sort(), [0, 1, 2, 3, 4, 5]);
    assert.ok(world.bidJitter[round]!.every(n => Number.isInteger(n) && n >= -2 && n <= 2));
  }
  assert.throws(() => (world.auctions as string[]).push("A"), TypeError);
  assert.throws(() => (world.bidJitter[0] as number[])[0] = 99, TypeError);
});

test("conditional tie and jitter use cannot alter subsequent auctions or matches", () => {
  const world = createSimWorld(880101, 0, bag, 6);
  // Different policies can abstain and therefore consult different subsets.
  const onlyTwoBidders = world.tieOrder.map(order => order.filter(seat => seat === 1 || seat === 5));
  assert.ok(onlyTwoBidders.every(order => order.length === 2));
  world.bidJitter.forEach((row, round) => { if (round % 3 === 0) void row[1]; });
  assert.deepEqual(createSimWorld(880101, 0, bag, 6), world);
  const direct = createSimWorld(880101, 9, bag, 6);
  for (let i = 1; i < 9; i++) createSimWorld(880101, i, bag, 6);
  assert.deepEqual(createSimWorld(880101, 9, bag, 6), direct);
  assert.notDeepEqual(direct.auctions, world.auctions);
});

test("public tracker used by simulation counts own starting tiles once even after playing them", () => {
  const pm: PublicMatch = { auctionLetters: ["E", "F"], results: [{ letter: "E", winner: 0n }],
    plays: [], myBotId: 0n, myRack: new Map([["A", 2], ["B", 1], ["C", 1], ["D", 1], ["E", 1]]) };
  const before = buildUnseen(pm);
  assert.equal(before.counts.E, 11); // Won E is already in the public auction count.
  assert.equal(before.counts.A, 7);
  assert.equal(before.total, 91); // 98 - five starting tiles - two public auctions.
  const after = buildUnseen({ ...pm, plays: [{ botId: 0n, word: "AB" }],
    myRack: new Map([["A", 1], ["C", 1], ["D", 1], ["E", 1]]) });
  assert.deepEqual(after, before); // Consumed starting A/B remain known.
  const revealedOpponent = buildUnseen({ ...pm, plays: [{ botId: 1n, word: "AT" }] });
  assert.equal(revealedOpponent.counts.A, 6);
  assert.equal(revealedOpponent.counts.T, 5);
  assert.equal(revealedOpponent.total, 89);
});

test("invalid simulated table/world inputs fail before policy execution", () => {
  assert.throws(() => createSimWorld(1, -1, bag, 6), /match index/);
  assert.throws(() => createSimWorld(1, 0, bag, 20), /Seats/);
  assert.throws(() => createSimWorld(1, 0, [...bag, "?"], 6), /Seats/);
});
