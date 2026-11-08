// Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FastEval, WordEngine, reward } from "./engine.js";
import { buildUnseen } from "./tracker.js";
import { wordlistPath } from "./brain.js";
import { AdvancedBot, ADV_DEFAULTS } from "./advanced.js";

const rack = (s: string) => { const r = new Map<string, number>(); for (const c of s) r.set(c, (r.get(c) ?? 0) + 1); return r; };
const engine = WordEngine.fromFile(wordlistPath());
const fast = FastEval.fromFile(wordlistPath());

test("reward matches the module (integer division, 3x at 7+)", () => {
  assert.equal(reward("CAT"), 5);        // 3+1+1, 1x
  assert.equal(reward("TACT"), 9);       // 6 * 1.5
  assert.equal(reward("QUIZ"), 33);      // 22 * 1.5
  assert.equal(reward("RETAINS"), 21);   // 7 * 3
});

test("final playout uses as much of the rack as possible", () => {
  // Correctness fixture: production's inherited 30ms wall-clock budget can
  // expire during root enumeration under scheduling/GC pauses. A partial
  // result remains feasible but has no score-quality guarantee. Freezing this
  // test clock does not change production behavior or claim an improvement.
  const budget = { now: () => 0, maxOperations: 150_000 };
  const remaining = rack("AEINRSTCAT");
  const r = engine.bestPlayout(remaining, 16, 6, budget);
  for (const w of r.words) {
    assert.ok(engine.spellable(rack(w), w.length, budget).length > 0);
    for (const letter of w) {
      assert.ok((remaining.get(letter) ?? 0) > 0, `overused ${letter}`);
      remaining.set(letter, remaining.get(letter)! - 1);
    }
  }
  assert.equal(r.score, r.words.reduce((score, word) => score + reward(word), 0));
  assert.ok(r.score >= 21, `got ${r.score}`);
});

test("expired playout searches return feasible partial plans marked inexact", () => {
  const small = new WordEngine(["AT", "CAT"]);
  let sawNonemptyExpiredPlan = false;
  // A tiny sweep avoids coupling the fixture to one traversal's tick count.
  // Existing operation-cap coverage tests only an exhausted initial budget.
  for (let deadlineMs = 0; deadlineMs <= 32; deadlineMs++) {
    let ticks = 0;
    const tracker = { operations: 0, exhausted: false };
    const remaining = rack("CAT");
    const result = small.bestPlayout(remaining, 16, 6, {
      now: () => ticks++, deadlineMs, maxOperations: 150_000, tracker,
    });
    for (const word of result.words) {
      assert.ok(["AT", "CAT"].includes(word));
      for (const letter of word) {
        assert.ok((remaining.get(letter) ?? 0) > 0, `overused ${letter}`);
        remaining.set(letter, remaining.get(letter)! - 1);
      }
    }
    assert.equal(result.score, result.words.reduce((score, word) => score + reward(word), 0));
    if (tracker.exhausted) {
      assert.equal(result.exact, false);
      if (result.words.length > 0) sawNonemptyExpiredPlan = true;
    }
  }
  assert.ok(sawNonemptyExpiredPlan);
});

test("bot bids 0 on the last tile and plays out everything when bag is empty", () => {
  const bot = new AdvancedBot(fast, engine, { ...ADV_DEFAULTS, samples: 4 });
  const v = { rack: rack("AEINRST"), balance: 50, score: 0, bagLeft: 0, bagStart: 68, unseen: { counts: { E: 5 }, total: 5 }, seatCount: 6 };
  assert.equal(bot.decideBid(v, "S"), 0);
  assert.ok(bot.chooseWords(v).join("").length === 7);
});

test("unseen pool excludes auctioned letters and my starting tiles", () => {
  const u = buildUnseen({
    auctionLetters: ["Q", "E"],
    results: [{ letter: "Q", winner: 2n }, { letter: "E", winner: 1n }],
    plays: [{ botId: 2n, word: "QUA" }],        // opponent revealed U, A from their start
    myBotId: 1n,
    myRack: rack("ZZE"),                         // impossible ZZ, but fine for arithmetic: Z capped at 0
  });
  assert.equal(u.counts.Q ?? 0, 0);
  assert.equal(u.counts.U, 3);                   // 4 - 1 revealed
  assert.equal(u.counts.A, 8);                   // 9 - 1 revealed
  assert.equal(u.counts.E, 11);                  // 12 - 1 auctioned (the E in my rack IS that auctioned E)
});

test("a full bid decision is fast enough for a 1-second auction", () => {
  const bot = new AdvancedBot(fast, engine, ADV_DEFAULTS);
  const v = { rack: rack("AEIRSTLNOD"), balance: 80, score: 0, bagLeft: 40, bagStart: 68, unseen: { counts: { A: 6, E: 8, I: 6, O: 5, R: 4, S: 2, T: 4, N: 4, L: 2, D: 2 }, total: 43 }, seatCount: 6 };
  const t = performance.now();
  bot.decideBid(v, "E");
  const ms = performance.now() - t;
  assert.ok(ms < 450, `${ms.toFixed(0)}ms`); // MC is capped at 300ms; the auction window is 1000ms
});

test("first-price mode bids well under value, but still bids", async () => {
  const { firstPriceBid } = await import("./prices.js");
  const b = firstPriceBid("E", 1, 30);
  assert.ok(b > 0 && b < 30, `bid ${b}`);
  assert.equal(firstPriceBid("E", 1, 1), 0); // nothing worth paying for
});
