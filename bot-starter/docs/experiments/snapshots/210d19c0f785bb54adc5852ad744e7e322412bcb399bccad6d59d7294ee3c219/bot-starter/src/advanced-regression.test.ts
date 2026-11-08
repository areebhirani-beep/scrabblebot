import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { wordlistPath } from './brain.js';
import { AdvancedBot, ADV_DEFAULTS, type AdvView } from './advanced.js';
import { FastEval, WordEngine } from './engine.js';
const rack = (s: string) => { const r = new Map<string, number>(); for (const c of s) r.set(c, (r.get(c) ?? 0) + 1); return r; };
test('wordlist path works when the checkout directory contains spaces', () => {
  assert.ok(fs.existsSync(wordlistPath()), wordlistPath());
});
test('penultimate auction cannot borrow an unusable last tile to complete a word', () => {
  const bot = () => new AdvancedBot(new FastEval(['CAT']), new WordEngine(['CAT']), { ...ADV_DEFAULTS, samples: 4 });
  const view: AdvView = { rack: rack('C'), balance: 100, score: 0, bagLeft: 1, bagStart: 68,
    unseen: { counts: { T: 1 }, total: 1 }, seatCount: 6 };
  assert.equal(bot().decideBid(view, 'A'), 0);
  assert.ok(bot().decideBid({ ...view, rack: rack('CT') }, 'A') > 0);
});
