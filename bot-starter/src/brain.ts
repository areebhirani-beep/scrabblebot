// One interface over both strategies, so the live runner and the simulator
// can swap them with an env var: BRAIN=adv (Monte Carlo) or BRAIN=v1 (tuned
// heuristic). Defaults and tuned params live here, in one place.

import * as path from "node:path";
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
// 6 seats: gain 1.5 / pace 0.8->2.5 / cash 7+ is the peak of the live-market
// search (market.ts, 144 configs). Heads-up and 9+ seat values from the
// bot-vs-bot search (grid 3): heads-up 83% vs 49% wins, big tables 2.48 vs 3.15.
export const TUNED_ADV: AdvParams = {
  ...ADV_DEFAULTS,
  samples: 24,
  bidGain: 1.3,
  facePremium: 2, // market sim: 27% vs 18% wins; we bought the fewest high-value tiles in the field
  cashLen: 7,
  paceEarly: 0.8,
  paceLate: 2.5,
  huGain: 2,
  huPaceEarly: 1.1,
  huHorizon: 10,
  bigSeats: 8,
  bigPaceLate: 3.5,
};

export function wordlistPath(): string {
  return path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "spacetimedb", "wordlist.txt");
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
