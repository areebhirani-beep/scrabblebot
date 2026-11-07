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
  const r = engine.bestPlayout(rack("AEINRSTCAT"), 16, 6);
  for (const w of r.words) assert.ok(engine.spellable(rack(w), w.length).length > 0);
  assert.ok(r.score >= 21, `got ${r.score}`);
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
  assert.ok(ms < 250, `${ms.toFixed(0)}ms`);
});
