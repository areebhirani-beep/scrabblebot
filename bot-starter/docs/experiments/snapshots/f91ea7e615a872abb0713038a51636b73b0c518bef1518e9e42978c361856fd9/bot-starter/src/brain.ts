// One interface over both strategies, so the live runner and the simulator
// can swap them with an env var: BRAIN=adv (Monte Carlo) or BRAIN=v1 (tuned
// heuristic). Defaults and tuned params live here, in one place.

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { FastEval, WordEngine } from "./engine.js";
import { AdvancedBot, ADV_DEFAULTS, type AdvParams, type AdvView } from "./advanced.js";
import { DEFAULT_PARAMS, Strategy, type Params } from "./strategy.js";

export interface Brain {
  name: string;
  bid(v: AdvView, letter: string): number;
  words(v: AdvView): string[];
}

// Tuned in the simulator (see TUNING.md). Update after each grid run.
export const TUNED_V1: Params = { ...DEFAULT_PARAMS, minCashLen: 7, moneyFactor: 4, maxBidShare: 0.6, futureWeight: 1.2 };
// Controlled live challenger: gain1.1 improved mean score on the96-game
// calibration screen and512-game separate-cohort validation (24samples).
// This is evidence for a trial, not a guaranteed improvement in live wins.
// Heads-up and larger-table settings retain the cofounder's existing values.
export const TUNED_ADV: AdvParams = {
  "samples": 24,
  "bidGain": 1.1,
  "paceEarly": 0.8,
  "paceLate": 2.5,
  "maxBidShare": 0.7,
  "starveCoins": 8,
  "starveMinBagLeft": 10,
  "cashLen": 7,
  "futureHorizon": 6,
  "huGain": 2,
  "huPaceEarly": 1.1,
  "huHorizon": 10,
  "bigSeats": 8,
  "bigGain": 0,
  "bigPaceLate": 3.5,
  "denyLast": 0,
  "denyMult": 1,
  "facePremium": 2,
  "neutralSixHorizon": true,
  "winBonus": 30
};

export function wordlistPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "spacetimedb", "wordlist.txt");
}

export function makeBrain(kind = process.env.BRAIN ?? "adv"): Brain {
  const engine = WordEngine.fromFile(wordlistPath());
  if (kind === "adv") {
    const bot = new AdvancedBot(FastEval.fromFile(wordlistPath()), engine, TUNED_ADV);
    return { name: "adv", bid: (v, l) => bot.decideBid(v, l), words: (v) => bot.chooseWords(v) };
  }
  const s = new Strategy(engine, TUNED_V1);
  const toView = (v: AdvView) => ({ rack: v.rack, balance: v.balance, score: v.score, bagLeft: v.bagLeft, unseen: v.unseen.counts });
  return { name: "v1", bid: (v, l) => s.decideBid(toView(v), l), words: (v) => s.chooseWords(toView(v)) };
}
