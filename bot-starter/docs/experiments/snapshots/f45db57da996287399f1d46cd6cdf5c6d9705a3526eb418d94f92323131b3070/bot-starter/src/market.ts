// Market simulator: our bot against the REAL live field, replayed from data.
//
// Bot-vs-bot simulation got the market wrong (our bot won 25 tiles a match in
// the sim and 14 live). So instead of simulating rivals, we sample them from
// what they actually did. Each auction samples an effective rival threshold
// by letter and match quarter. Our reserve-price wins only identify a rival
// maximum in [0,1]; the compatible scalar cmax conservatively uses 1.
// Prices are exogenous and do not enforce actual rivals' budgets or reactions.
//
// Historical-score exceedance is a surrogate, not counterfactual match wins:
// rival purchases, budgets and final scores do not respond to our decisions.
//
//   MARKET=path/to/market.json ONE='{"p":{...}}' npx tsx src/market.ts 200

import * as fs from "node:fs";
import { FULL_BAG, FastEval, WordEngine, minus, reward } from "./engine.js";
import { AdvancedBot, ADV_DEFAULTS, type AdvParams } from "./advanced.js";
import { wordlistPath } from "./brain.js";
import { createMarketWorld } from "./market-random.js";

interface Row { m: number; i: number; n: number; l: string; cmax: number; bestOther: number }

if (!process.env.MARKET) throw new Error("MARKET must name a calibration dataset");
const rows: Row[] = JSON.parse(fs.readFileSync(process.env.MARKET, "utf8"));
if (!Array.isArray(rows) || !rows.length || rows.some(r => !Number.isSafeInteger(r.m) ||
  !Number.isInteger(r.i) || !Number.isInteger(r.n) || r.n <= 0 || r.i < 0 || r.i >= r.n ||
  !/^[A-Z]$/.test(r.l) || !Number.isInteger(r.cmax) || r.cmax < 0 || !Number.isFinite(r.bestOther) || r.bestOther < 0))
  throw new Error("MARKET must contain nonempty valid calibration rows");
const Q = (i: number, n: number) => Math.min(3, Math.floor((i * 4) / n));

// rival-max bids by letter+quarter, falling back to letter only
const byLQ = new Map<string, number[]>();
const byL = new Map<string, number[]>();
for (const r of rows) {
  const k = `${r.l}${Q(r.i, r.n)}`;
  if (!byLQ.has(k)) byLQ.set(k, []);
  byLQ.get(k)!.push(r.cmax);
  if (!byL.has(r.l)) byL.set(r.l, []);
  byL.get(r.l)!.push(r.cmax);
}
const bestOthers = [...new Map(rows.map((r) => [r.m, r.bestOther])).values()];

const fast = FastEval.fromFile(wordlistPath());
const engine = WordEngine.fromFile(wordlistPath());

export interface MarketGame {
  seed: number; matchIndex: number; cohort: string; calibrationDataset: string;
  score: number; cash: number; tiles: number; paid: number; words7: number;
  historicalScore: number; historicalScoreExceedance: boolean;
  purchases: { round: number; letter: string; bid: number; rival: number; paid: number }[];
}
export interface MarketResult {
  score: number; tiles: number; paid: number; left: number; words7: number;
  historicalScoreExceedance: number;
  /** @deprecated Same percentage as historicalScoreExceedance; not match win probability. */
  winPct: number;
  games: MarketGame[];
}

export function runMarket(p: AdvParams, matches: number, seed = 1): MarketResult {
  if (!Number.isSafeInteger(matches) || matches <= 0) throw new Error("Match count must be a positive safe integer");
  let score = 0, tiles = 0, paid = 0, left = 0, wins = 0, words7 = 0;
  const games: MarketGame[] = [];
  const fullBag: string[] = [];
  for (const [c, n] of Object.entries(FULL_BAG)) for (let i = 0; i < n; i++) fullBag.push(c);

  for (let g = 0; g < matches; g++) {
    const world = createMarketWorld(seed, g, fullBag,
      (letter, i, n) => byLQ.get(`${letter}${Q(i, n)}`) ?? byL.get(letter) ?? [10], bestOthers);
    const bag = world.bag;
    const bot = new AdvancedBot(fast, engine, p);
    const record: MarketGame = { seed, matchIndex: g, cohort: process.env.COHORT ?? "unspecified",
      calibrationDataset: process.env.MARKET!, score: 0, cash: 100, tiles: 0, paid: 0, words7: 0,
      historicalScore: world.historicalScore, historicalScoreExceedance: false, purchases: [] };
    const rack = new Map<string, number>();
    for (const c of bag.slice(0, 5)) rack.set(c, (rack.get(c) ?? 0) + 1);
    const start = new Map(rack);
    const auctions = bag.slice(30); // 25 more tiles go to the 5 rivals' hidden racks
    const seen = new Map(start);
    let balance = 100, sc = 0;

    const play = (words: string[], r: Map<string, number>) => {
      let cur = r;
      for (const w of words) {
        let ok = true;
        for (const c of new Set(w)) if ((cur.get(c) ?? 0) < [...w].filter((x) => x === c).length) ok = false;
        if (!ok) continue;
        cur = minus(cur, w);
        const gain = reward(w);
        sc += gain; balance += gain;
        if (w.length >= 7) { words7++; record.words7++; }
      }
      return cur;
    };

    let r = rack;
    for (let i = 0; i < auctions.length; i++) {
      const letter = auctions[i]!;
      seen.set(letter, (seen.get(letter) ?? 0) + 1);
      const bagLeft = auctions.length - 1 - i;
      const counts: Record<string, number> = {};
      let total = 0;
      for (const [c, n] of Object.entries(FULL_BAG)) { const k = n - (seen.get(c) ?? 0); if (k > 0) { counts[c] = k; total += k; } }
      const view = { rack: r, balance, score: sc, bagLeft, bagStart: 68, unseen: { counts, total }, seatCount: 6 };
      r = play(bot.chooseWords(view), r);
      const bid = Math.min(bot.decideBid({ ...view, rack: r, balance }, letter), balance);
      const rival = world.rivalBids[i]!;
      const win = bid > 0 && (bid > rival || (bid === rival && world.tieUniforms[i]! < 0.5));
      if (win) {
        const price = rival > 0 ? rival : 1;
        balance -= price; paid += price; tiles++;
        record.tiles++; record.paid += price;
        record.purchases.push({ round: i, letter, bid, rival, paid: price });
        r = new Map(r); r.set(letter, (r.get(letter) ?? 0) + 1);
        if (bagLeft > 0) r = play(bot.chooseWords({ ...view, rack: r, balance, score: sc }), r);
      }
    }
    score += sc; left += balance;
    record.score = sc; record.cash = balance;
    record.historicalScoreExceedance = sc > world.historicalScore;
    if (record.historicalScoreExceedance) wins++;
    games.push(record);
    if (process.env.PROGRESS && (g + 1) % 20 === 0) console.error(`completed ${g + 1}/${matches} simulated matches`);
  }
  return { score: score / matches, tiles: tiles / matches, paid: paid / Math.max(1, tiles), left: left / matches,
    historicalScoreExceedance: (100 * wins) / matches, winPct: (100 * wins) / matches, words7: words7 / matches, games };
}

if (process.argv[1]?.endsWith("market.ts")) {
  const cfg = JSON.parse(process.env.ONE ?? "{}") as { p?: Partial<AdvParams>; label?: string; seed?: number };
  const N = Number(process.argv[2] ?? 100);
  const p: AdvParams = { ...ADV_DEFAULTS, samples: 8, ...(cfg.p ?? {}) };
  const r = runMarket(p, N, cfg.seed ?? 1);
  if (process.env.DETAILS) fs.writeFileSync(process.env.DETAILS, JSON.stringify({
    metric: "historicalScoreExceedance", warning: "Surrogate only; independent historical rival scores do not react to our purchases",
    cohort: process.env.COHORT ?? "unspecified", calibrationDataset: process.env.MARKET,
    seed: cfg.seed ?? 1, parameters: p, label: cfg.label, result: r,
  }, null, 2) + "\n");
  console.log(`${r.historicalScoreExceedance.toFixed(1)}% surrogate historicalScoreExceedance\t${r.score.toFixed(1)}\ttiles ${r.tiles.toFixed(1)} $/t ${r.paid.toFixed(1)} left ${r.left.toFixed(0)} 7+words ${r.words7.toFixed(2)}\t${cfg.label ?? JSON.stringify(cfg.p)}`);
}
