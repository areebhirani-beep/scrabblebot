// Offline match simulator with the module's exact rules (spacetimedb/src/game.ts):
// 98-tile bag, 5 tiles dealt each, 100 balance, one letter per auction,
// Vickrey (winner pays the runner-up's bid, or 1 if alone), unbid tiles are
// lost, the match ends when the bag is empty, and leftover tiles score 0.
//
//   npx tsx src/sim.ts [matches]

import * as path from "node:path";
import { FULL_BAG, FastEval, LETTER_VALUE, WordEngine, minus, reward, type Rack } from "./engine.js";
import { DEFAULT_PARAMS, Strategy, freshUnseen, type Params } from "./strategy.js";
import { AdvancedBot, ADV_DEFAULTS, type AdvParams } from "./advanced.js";

const WL = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "spacetimedb", "wordlist.txt");
const engine = WordEngine.fromFile(WL);
const fastEval = FastEval.fromFile(WL);

interface Player {
  name: string;
  rack: Rack;
  balance: number;
  score: number;
  bid(letter: string, bagLeft: number): number;
  play(bagLeft: number, justWon: boolean): string[];
}

let rng = 12345;
function rand(): number {
  rng = (rng * 1103515245 + 12345) & 0x7fffffff;
  return rng / 0x7fffffff;
}
const randInt = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

// Longest word the rack spells (what the starter and the sim bots do).
function longest(rack: Rack, minLen: number): string | undefined {
  const c = engine.spellable(rack, minLen);
  c.sort((a, b) => b.word.length - a.word.length || b.score - a.score);
  return c[0]?.word;
}

// The bot from bot-starter as shipped: face+2 for a new letter, face for a
// repeat, plays the longest word it can every time its rack changes.
function starter(name: string): Player {
  const p: Player = {
    name, rack: new Map(), balance: 100, score: 0,
    bid(letter) {
      const v = LETTER_VALUE[letter] ?? 1;
      const want = (p.rack.get(letter) ?? 0) === 0 ? v + 2 : Math.max(1, v);
      return Math.min(want, p.balance);
    },
    play(_bagLeft, justWon) {
      if (!justWon) return [];
      const w = longest(p.rack, 2);
      return w ? [w] : [];
    },
  };
  return p;
}

// The module's simulated bots (game.ts decideBid + simulateWordPlay).
function simBot(name: string, kind: "cheap" | "value" | "aggr"): Player {
  const p: Player = {
    name, rack: new Map(), balance: 100, score: 0,
    bid(letter) {
      const v = LETTER_VALUE[letter] ?? 1;
      const base = kind === "cheap" ? v - 1 : kind === "value" ? v : v + ("AEIOU".includes(letter) ? 4 : 2);
      return Math.max(Math.min(Math.max(base + randInt(-2, 2), 1), p.balance), 0);
    },
    play(_b, justWon) {
      if (!justWon) return [];
      const w = longest(p.rack, 3);
      return w ? [w] : [];
    },
  };
  return p;
}

function ours(name: string, params: Params): Player {
  const s = new Strategy(engine, params);
  const p: Player = {
    name, rack: new Map(), balance: 100, score: 0,
    bid(letter, bagLeft) {
      return s.decideBid({ rack: p.rack, balance: p.balance, score: p.score, bagLeft, unseen: freshUnseen() }, letter);
    },
    play(bagLeft) {
      return s.chooseWords({ rack: p.rack, balance: p.balance, score: p.score, bagLeft, unseen: freshUnseen() });
    },
  };
  return p;
}

// Shared public-match context, the data a real bot reconstructs from the
// public AuctionResult + WordPlay tables: how many tiles are revealed, the
// seat count, the starting bag size.
interface MatchCtx { revealed: number[]; seatCount: number; bagStart: number }
const MARKET = { paid: 0, tiles: 0, topScore: 0, matches: 0, myLeft: 0, myTiles: 0 };
let MATCH: MatchCtx = { revealed: new Array(26).fill(0), seatCount: 6, bagStart: 68 };

function advancedPlayer(name: string, params: AdvParams): Player {
  const bot = new AdvancedBot(fastEval, engine, params);
  const unseen = () => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const [l, n] of Object.entries(FULL_BAG)) {
      const i = l.charCodeAt(0) - 65;
      const mine = p.rack.get(l) ?? 0;
      const rem = n - MATCH.revealed[i]! - mine; // seen: revealed in auctions + in my hand
      if (rem > 0) { counts[l] = rem; total += rem; }
    }
    return { counts, total };
  };
  const p: Player = {
    name, rack: new Map(), balance: 100, score: 0,
    bid(letter, bagLeft) {
      return bot.decideBid({ rack: p.rack, balance: p.balance, score: p.score, bagLeft, bagStart: MATCH.bagStart, unseen: unseen(), seatCount: MATCH.seatCount }, letter);
    },
    play(bagLeft) {
      return bot.chooseWords({ rack: p.rack, balance: p.balance, score: p.score, bagLeft, bagStart: MATCH.bagStart, unseen: unseen(), seatCount: MATCH.seatCount });
    },
  };
  return p;
}

function playWords(p: Player, words: string[]) {
  for (const w of words) {
    // verify the rack really has the letters (the module would reject it)
    const r = minus(p.rack, w);
    let ok = true;
    for (const c of new Set(w)) {
      const need = [...w].filter((x) => x === c).length;
      if ((p.rack.get(c) ?? 0) < need) ok = false;
    }
    if (!ok) continue;
    p.rack = r;
    const g = reward(w);
    p.score += g;
    p.balance += g;
  }
}

function runMatch(players: Player[]) {
  const bag: string[] = [];
  for (const [c, n] of Object.entries(FULL_BAG)) for (let i = 0; i < n; i++) bag.push(c);
  const draw = () => bag.splice(randInt(0, bag.length - 1), 1)[0]!;
  for (const p of players) {
    p.rack = new Map(); p.balance = 100; p.score = 0;
    for (let i = 0; i < 5; i++) { const c = draw(); p.rack.set(c, (p.rack.get(c) ?? 0) + 1); }
  }
  MATCH = { revealed: new Array(26).fill(0), seatCount: players.length, bagStart: bag.length };
  while (bag.length > 0) {
    const letter = draw();
    MATCH.revealed[letter.charCodeAt(0) - 65]!++; // the tile on the block is public
    const bagLeft = bag.length;
    // words played while this auction is open (ours plays out on the last one)
    for (const p of players) playWords(p, p.play(bagLeft, false));
    const bids = players
      .map((p, i) => ({ i, amt: Math.min(Math.floor(p.bid(letter, bagLeft)), p.balance) }))
      .filter((b) => b.amt > 0);
    // shuffle then stable sort, like the module, so ties are random
    for (let k = bids.length - 1; k > 0; k--) { const j = randInt(0, k); [bids[k], bids[j]] = [bids[j]!, bids[k]!]; }
    bids.sort((a, b) => b.amt - a.amt);
    if (bids.length > 0) {
      const w = players[bids[0]!.i]!;
      const paid = bids[1] ? bids[1].amt : 1;
      if (w.balance >= paid) {
        w.balance -= paid;
        MARKET.paid += paid; MARKET.tiles++;
        if (w === players[0]) MARKET.myTiles++;
        w.rack.set(letter, (w.rack.get(letter) ?? 0) + 1);
        if (bag.length > 0) playWords(w, w.play(bag.length, true));
      }
    }
  }
}

function tournament(label: string, make: () => Player[], matches: number) {
  const totals = new Map<string, { score: number; place: number; wins: number }>();
  for (let m = 0; m < matches; m++) {
    const players = make();
    runMatch(players);
    const sorted = [...players].sort((a, b) => b.score - a.score);
    sorted.forEach((p, idx) => {
      const t = totals.get(p.name) ?? { score: 0, place: 0, wins: 0 };
      t.score += p.score;
      t.place += sorted.findIndex((q) => q.score === p.score) + 1;
      if (idx === 0 || p.score === sorted[0]!.score) t.wins++;
      totals.set(p.name, t);
    });
  }
  console.log(`\n${label} (${matches} matches)`);
  console.log("bot".padEnd(14), "avg score".padStart(10), "avg place".padStart(10), "win %".padStart(7));
  for (const [name, t] of [...totals].sort((a, b) => a[1].place - b[1].place)) {
    console.log(
      name.padEnd(14),
      (t.score / matches).toFixed(1).padStart(10),
      (t.place / matches).toFixed(2).padStart(10),
      ((100 * t.wins) / matches).toFixed(0).padStart(6) + "%",
    );
  }
}

const N = Number(process.argv[2] ?? 100);
const P = { ...DEFAULT_PARAMS };

const AP: AdvParams = { ...ADV_DEFAULTS };
const ONE = process.env.ONE;
if (!process.env.GRID && !process.env.ADVGRID && !ONE) {

tournament("ADV vs lobby sims", () => [
  advancedPlayer("ADV", AP), simBot("cheap", "cheap"), simBot("value", "value"), simBot("aggr", "aggr"), simBot("aggr2", "aggr"), simBot("value2", "value"),
], N);

tournament("ADV vs v1 + sims", () => [
  advancedPlayer("ADV", AP), ours("v1", P), simBot("aggr", "aggr"), simBot("aggr2", "aggr"), starter("starter1"), simBot("value", "value"),
], N);

tournament("ADV vs 5 starters", () => [
  advancedPlayer("ADV", AP), starter("s1"), starter("s2"), starter("s3"), starter("s4"), starter("s5"),
], N);

tournament("ADV mirror + field", () => [
  advancedPlayer("ADV", AP), advancedPlayer("ADV_twin", AP), ours("v1", P), simBot("aggr", "aggr"), starter("s1"), simBot("value", "value"),
], N);

// Heads-up final (best of 1 here; tournament is best of 3 total score)
tournament("ADV heads-up vs v1", () => [advancedPlayer("ADV", AP), ours("v1", P)], N);

}

// Grid search: `GRID=1 npx tsx src/sim.ts 200`
if (process.env.GRID) {
  const rows: string[] = [];
  for (const minCashLen of (process.env.LENS ?? "7").split(",").map(Number))
    for (const moneyFactor of (process.env.MONEY ?? "2.5").split(",").map(Number))
      for (const maxBidShare of (process.env.SHARE ?? "0.6").split(",").map(Number))
        for (const futureWeight of (process.env.FUT ?? "1.2").split(",").map(Number)) {
          const q: Params = { ...DEFAULT_PARAMS, minCashLen, moneyFactor, maxBidShare, futureWeight };
          let place = 0, score = 0;
          for (let m = 0; m < N; m++) {
            const strong = { ...DEFAULT_PARAMS, minCashLen: 7, moneyFactor: 2.5, maxBidShare: 0.6, futureWeight: 1.2 };
            const ps = process.env.OPP === "self" ? [ours("OURS", q), ours("rival1", strong), ours("rival2", strong), simBot("a", "aggr"), starter("s1"), starter("s2")] : [ours("OURS", q), simBot("a", "aggr"), simBot("b", "aggr"), starter("s1"), starter("s2"), simBot("v", "value")];
            runMatch(ps);
            const sorted = [...ps].sort((a, b) => b.score - a.score);
            place += sorted.findIndex((x) => x.score === ps[0]!.score) + 1;
            score += ps[0]!.score;
          }
          rows.push(`${(place / N).toFixed(2)}  score ${(score / N).toFixed(1)}  len${minCashLen} money${moneyFactor} share${maxBidShare} fut${futureWeight}`);
        }
  rows.sort();
  console.log("\nGRID (avg place, lower is better):\n" + rows.slice(0, 12).join("\n"));
}

// Advanced-bot grid search: `ADVGRID=1 npx tsx src/sim.ts 60`
if (process.env.ADVGRID) {
  const rows: { place: number; score: number; label: string }[] = [];
  const S = Number(process.env.SAMPLES ?? 8);
  for (const bidGain of (process.env.GAIN ?? "0.8,1.1,1.5,2").split(",").map(Number))
    for (const cashLen of (process.env.CLEN ?? "5,6,7").split(",").map(Number))
      for (const paceEarly of (process.env.PE ?? "0.8").split(",").map(Number))
        for (const paceLate of (process.env.PL ?? "1.6,2.4").split(",").map(Number)) {
          const q: AdvParams = { ...ADV_DEFAULTS, samples: S, bidGain, cashLen, paceEarly, paceLate };
          let place = 0, score = 0;
          for (let m = 0; m < N; m++) {
            const ps = [advancedPlayer("ADV", q), simBot("a", "aggr"), simBot("b", "aggr"), ours("v1", { ...DEFAULT_PARAMS }), starter("s1"), simBot("v", "value")];
            runMatch(ps);
            const sorted = [...ps].sort((a, b) => b.score - a.score);
            place += sorted.findIndex((x) => x.score === ps[0]!.score) + 1;
            score += ps[0]!.score;
          }
          rows.push({ place: place / N, score: score / N, label: `gain${bidGain} clen${cashLen} pe${paceEarly} pl${paceLate}` });
        }
  rows.sort((a, b) => a.place - b.place || b.score - a.score);
  console.log(`\nADVGRID (samples=${S}, ${N} matches each) — avg place, lower better:`);
  for (const r of rows) console.log(`  ${r.place.toFixed(2)}  score ${r.score.toFixed(1).padStart(6)}  ${r.label}`);
}

// Single-config run for the parallel driver:
//   ONE='{"bot":"adv","p":{...},"field":"gauntlet"}' npx tsx src/sim.ts 60
// Prints one line: avgPlace avgScore winPct label
if (ONE) {
  const cfg = JSON.parse(ONE) as { bot: "adv" | "v1"; p: Record<string, number>; field: string; label?: string; seed?: number; rival?: Record<string, number> };
  rng = cfg.seed ?? 777;
  const STRONG: Params = { ...DEFAULT_PARAMS, minCashLen: 7, moneyFactor: 3, maxBidShare: 0.6, futureWeight: 1.2 };
  const BEST_ADV: AdvParams = { ...ADV_DEFAULTS, samples: 8, bidGain: 1.5, cashLen: 7, paceEarly: 0.8, paceLate: 2.5 };
  const RIVAL: AdvParams = { ...BEST_ADV, ...(cfg.rival ?? {}) };
  const me = () => cfg.bot === "adv" ? advancedPlayer("ME", { ...ADV_DEFAULTS, ...cfg.p } as AdvParams) : ours("ME", { ...DEFAULT_PARAMS, ...cfg.p } as Params);
  const fields: Record<string, () => Player[]> = {
    gauntlet: () => [me(), ours("tv1a", STRONG), ours("tv1b", STRONG), simBot("a", "aggr"), starter("s1"), simBot("v", "value")],
    sims: () => [me(), simBot("a", "aggr"), simBot("b", "aggr"), starter("s1"), starter("s2"), simBot("v", "value")],
    hu: () => [me(), ours("tv1", STRONG)],
    big: () => [me(), ours("tv1a", STRONG), ours("tv1b", STRONG), ours("tv1c", STRONG), simBot("a", "aggr"), simBot("b", "aggr"), starter("s1"), starter("s2"), simBot("v", "value")],
    // the realistic top table: two Monte Carlo rivals (our own best) + a tuned heuristic + weaker bots
    mc: () => [me(), advancedPlayer("mcA", BEST_ADV), advancedPlayer("mcB", BEST_ADV), ours("tv1", STRONG), simBot("a", "aggr"), starter("s1")],
    mchu: () => [me(), advancedPlayer("mcA", BEST_ADV)],
    // live-calibrated 6-seat table: rivals bid like the real ladder (~11 coins/tile)
    live: () => [me(), advancedPlayer("r1", RIVAL), advancedPlayer("r2", RIVAL), advancedPlayer("r3", RIVAL), ours("tv1", STRONG), advancedPlayer("r4", RIVAL)],
    mcbig: () => [me(), advancedPlayer("mcA", BEST_ADV), advancedPlayer("mcB", BEST_ADV), advancedPlayer("mcC", BEST_ADV), ours("tv1a", STRONG), ours("tv1b", STRONG), simBot("a", "aggr"), starter("s1"), starter("s2")],
  };
  let place = 0, score = 0, wins = 0;
  for (let m = 0; m < N; m++) {
    const ps = fields[cfg.field]!();
    runMatch(ps);
    MARKET.matches++; MARKET.topScore += Math.max(...ps.map((x) => x.score)); MARKET.myLeft += ps[0]!.balance;
    const sorted = [...ps].sort((a, b) => b.score - a.score);
    const pl = sorted.findIndex((x) => x.score === ps[0]!.score) + 1;
    place += pl; score += ps[0]!.score; if (pl === 1) wins++;
  }
  const mk = `$/tile ${(MARKET.paid / Math.max(1, MARKET.tiles)).toFixed(1)} top ${(MARKET.topScore / N).toFixed(0)} myTiles ${(MARKET.myTiles / N).toFixed(1)} myLeft ${(MARKET.myLeft / N).toFixed(0)}`;
  console.log(`${(place / N).toFixed(2)}\t${(score / N).toFixed(1)}\t${((100 * wins) / N).toFixed(0)}%\t${cfg.label ?? JSON.stringify(cfg.p)}\t${mk}`);
}
