// Market simulator: our bot against the REAL live field, replayed from data.
//
// Bot-vs-bot simulation got the market wrong (our bot won 25 tiles a match in
// the sim and 14 live). So instead of simulating rivals, we sample them from
// what they actually did. For every live auction we know the strongest bid
// from anyone but us (exact when we won: it's what we paid). Each simulated
// auction draws that rival bid from real auctions with the same letter at the
// same stage of the match. We win if we outbid it and pay it (Vickrey).
//
// "Winning the match" = beating the best rival score from a real match.
//
//   MARKET=path/to/market.json ONE='{"p":{...}}' npx tsx src/market.ts 200

import * as fs from "node:fs";
import { FULL_BAG, FastEval, WordEngine, minus, reward } from "./engine.js";
import { AdvancedBot, ADV_DEFAULTS, type AdvParams } from "./advanced.js";
import { wordlistPath } from "./brain.js";
import { rng } from "./montecarlo.js";

interface Row { m: number; i: number; n: number; l: string; cmax: number; bestOther: number }

const rows: Row[] = JSON.parse(fs.readFileSync(process.env.MARKET!, "utf8"));
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

export interface MarketResult { score: number; tiles: number; paid: number; left: number; winPct: number; words7: number }

export function runMarket(p: AdvParams, matches: number, seed = 1): MarketResult {
  const rnd = rng(seed);
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
  const bot = new AdvancedBot(fast, engine, p);
  let score = 0, tiles = 0, paid = 0, left = 0, wins = 0, words7 = 0;

  for (let g = 0; g < matches; g++) {
    const bag: string[] = [];
    for (const [c, n] of Object.entries(FULL_BAG)) for (let i = 0; i < n; i++) bag.push(c);
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j]!, bag[i]!]; }
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
        if (w.length >= 7) words7++;
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
      const rival = pick(byLQ.get(`${letter}${Q(i, auctions.length)}`) ?? byL.get(letter) ?? [10]);
      const win = bid > 0 && (bid > rival || (bid === rival && rnd() < 0.5));
      if (win) {
        const price = rival > 0 ? rival : 1;
        balance -= price; paid += price; tiles++;
        r = new Map(r); r.set(letter, (r.get(letter) ?? 0) + 1);
        if (bagLeft > 0) r = play(bot.chooseWords({ ...view, rack: r, balance, score: sc }), r);
      }
    }
    score += sc; left += balance;
    if (sc > pick(bestOthers)) wins++;
  }
  return { score: score / matches, tiles: tiles / matches, paid: paid / Math.max(1, tiles), left: left / matches, winPct: (100 * wins) / matches, words7: words7 / matches };
}

if (process.argv[1]?.endsWith("market.ts")) {
  const cfg = JSON.parse(process.env.ONE ?? "{}") as { p?: Partial<AdvParams>; label?: string; seed?: number };
  const N = Number(process.argv[2] ?? 100);
  const p: AdvParams = { ...ADV_DEFAULTS, samples: 8, ...(cfg.p ?? {}) };
  const r = runMarket(p, N, cfg.seed ?? 1);
  console.log(`${r.winPct.toFixed(0)}%\t${r.score.toFixed(1)}\ttiles ${r.tiles.toFixed(1)} $/t ${r.paid.toFixed(1)} left ${r.left.toFixed(0)} 7+words ${r.words7.toFixed(2)}\t${cfg.label ?? JSON.stringify(cfg.p)}`);
}
