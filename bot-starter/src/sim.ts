// Offline interactive policy model based on spacetimedb/src/game.ts:
// 98-tile bag, 5 tiles dealt each, 100 balance, one letter per auction,
// Vickrey (winner pays the runner-up's bid, or 1 if alone), unbid tiles are
// lost, the match ends when the bag is empty, and leftover tiles score 0.
// Word calls execute instantly; networking, event ordering and real rival policies
// are not modeled. Fixed worlds make comparisons paired, not real win forecasts.
//
//   npx tsx src/sim.ts [matches]

import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { FULL_BAG, FastEval, LETTER_VALUE, WordEngine, minus, reward, type Rack } from "./engine.js";
import { DEFAULT_PARAMS, Strategy, type Params } from "./strategy.js";
import { AdvancedBot, ADV_DEFAULTS, type AdvParams } from "./advanced.js";
import { buildUnseen, type PublicMatch } from "./tracker.js";
import { createSimWorld, type SimWorld } from "./sim-random.js";

const WL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "spacetimedb", "wordlist.txt");
let engine: WordEngine;
let fastEval: FastEval;
let dictionary: ReadonlySet<string> | undefined;
function loadEngines(): void {
  if (dictionary) return;
  const words = fs.readFileSync(WL, "utf8").split("\n").filter(Boolean);
  dictionary = new Set(words);
  engine = new WordEngine(words);
  fastEval = new FastEval(words);
}

export interface Player {
  name: string;
  /** Synthetic policy identity, never a claim to reproduce a live entrant. */
  style?: string;
  serverSimulated?: boolean;
  rack: Rack;
  balance: number;
  score: number;
  bid(letter: string, bagLeft: number): number;
  play(bagLeft: number, justWon: boolean): string[];
  /** Copy counters after the match without changing policy state. */
  getCompletionFloorStats?(): { checks: number; opportunities: number; raisedBids: number };
}

export function selectServerLongest(candidates: readonly { word: string; score: number }[]): string | undefined {
  // Server dictionary.findBestPlayable breaks length ties lexicographically,
  // irrespective of face-value score.
  return [...candidates].sort((a, b) => b.word.length - a.word.length
    || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))[0]?.word;
}

// Longest word the rack spells (what the starter and the sim bots do).
function longest(rack: Rack, minLen: number): string | undefined {
  return selectServerLongest(engine.spellable(rack, minLen));
}

// The bot from bot-starter as shipped: face+2 for a new letter, face for a
// repeat, plays the longest word it can every time its rack changes.
function starter(name: string): Player {
  const p: Player = {
    name, style: "starter-longest", rack: new Map(), balance: 100, score: 0,
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
    name, style: `server-${kind}`, serverSimulated: true, rack: new Map(), balance: 100, score: 0,
    bid(letter) {
      const v = LETTER_VALUE[letter] ?? 1;
      const base = kind === "cheap" ? v - 1 : kind === "value" ? v : v + ("AEIOU".includes(letter) ? 4 : 2);
      const jitter = MATCH.world.bidJitter[MATCH.round]![MATCH.players.indexOf(p)]!;
      return Math.max(Math.min(Math.max(base + jitter, 1), p.balance), 0);
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
    name, style: "v1-heuristic", rack: new Map(), balance: 100, score: 0,
    bid(letter, bagLeft) {
      return s.decideBid({ rack: p.rack, balance: p.balance, score: p.score, bagLeft, unseen: playerUnseen(p).counts }, letter);
    },
    play(bagLeft) {
      return s.chooseWords({ rack: p.rack, balance: p.balance, score: p.score, bagLeft, unseen: playerUnseen(p).counts });
    },
  };
  return p;
}

// Shared public-match context, the data a real bot reconstructs from the
// public AuctionResult + WordPlay tables: how many tiles are revealed, the
// seat count, the starting bag size.
interface MatchCtx {
  players: Player[]; world: SimWorld; round: number; seatCount: number; bagStart: number;
  auctionLetters: PublicMatch["auctionLetters"]; results: PublicMatch["results"]; plays: PublicMatch["plays"];
  matchKey: string; firstPrice: boolean; terminalEligible: boolean; dictionary: ReadonlySet<string>;
  telemetry?: SimPlayerTelemetry[];
}

export interface SimPlayerTelemetry {
  seat: number;
  name: string;
  style: string;
  serverSimulated: boolean;
  startingCash: number;
  /** Before external word receipts at the final auction opening; null for no auctions. */
  cashAtFinalOpening: number | null;
  endCash: number;
  tilesPurchased: number;
  totalPaid: number;
  quarters: { tilesPurchased: number; totalPaid: number; wordPoints: number }[];
  acceptedWords: number;
  /** Rejected model word proposals, not live transport/reducer error counts. */
  invalidAttempts: number;
  wordEvents: { word: string; points: number; round: number; quarter: number; phase: "open" | "close" }[];
  finalAuctionWordIncome: number;
  finalAuctionPaid: number;
}

function telemetryFor(p: Player): SimPlayerTelemetry | undefined {
  return MATCH.telemetry?.[MATCH.players.indexOf(p)];
}

function currentQuarter(): number {
  return Math.min(3, Math.floor(MATCH.round * 4 / MATCH.world.auctions.length));
}
const MARKET = { paid: 0, tiles: 0, topScore: 0, matches: 0, myLeft: 0, myTiles: 0 };
let MATCH: MatchCtx;

function playerUnseen(p: Player) {
  return buildUnseen({ auctionLetters: MATCH.auctionLetters, results: MATCH.results, plays: MATCH.plays,
    myBotId: BigInt(MATCH.players.indexOf(p)), myRack: p.rack });
}

function advancedPlayer(name: string, params: AdvParams): Player {
  const bot = new AdvancedBot(fastEval, engine, params);
  const p: Player = {
    name, style: "advanced-monte-carlo", rack: new Map(), balance: 100, score: 0,
    getCompletionFloorStats: () => ({ ...bot.completionFloorStats }),
    bid(letter, bagLeft) {
      return bot.decideBid({ rack: p.rack, balance: p.balance, score: p.score, bagLeft, bagStart: MATCH.bagStart, unseen: playerUnseen(p), seatCount: MATCH.seatCount,
        firstPrice: MATCH.firstPrice, matchKey: MATCH.matchKey, terminalEligible: MATCH.terminalEligible, wordPending: false }, letter);
    },
    play(bagLeft) {
      return bot.chooseWords({ rack: p.rack, balance: p.balance, score: p.score, bagLeft, bagStart: MATCH.bagStart, unseen: playerUnseen(p), seatCount: MATCH.seatCount,
        firstPrice: MATCH.firstPrice, matchKey: MATCH.matchKey, terminalEligible: MATCH.terminalEligible, wordPending: false });
    },
  };
  return p;
}

function playWords(p: Player, words: string[], maxAccepted = Infinity): number {
  let accepted = 0;
  const trace = telemetryFor(p);
  for (const submitted of words) {
    // Match the public reducer's ASCII case normalization and validation.
    // Invalid words consume neither inventory nor money.
    if (!/^[A-Za-z]{2,}$/.test(submitted)) { if (trace) trace.invalidAttempts++; continue; }
    const w = submitted.toUpperCase();
    if (!MATCH.dictionary.has(w)) { if (trace) trace.invalidAttempts++; continue; }
    // verify the rack really has the letters (the module would reject it)
    const r = minus(p.rack, w);
    let ok = true;
    for (const c of new Set(w)) {
      const need = [...w].filter((x) => x === c).length;
      if ((p.rack.get(c) ?? 0) < need) ok = false;
    }
    if (!ok) { if (trace) trace.invalidAttempts++; continue; }
    p.rack = r;
    const g = reward(w);
    p.score += g;
    p.balance += g;
    MATCH.plays.push({ botId: BigInt(MATCH.players.indexOf(p)), word: w });
    if (trace) {
      const quarter = currentQuarter();
      trace.acceptedWords++;
      trace.quarters[quarter]!.wordPoints += g;
      trace.wordEvents.push({ word: w, points: g, round: MATCH.round, quarter, phase: p.serverSimulated ? "close" : "open" });
      if (MATCH.round === MATCH.world.auctions.length - 1) trace.finalAuctionWordIncome += g;
    }
    if (++accepted >= maxAccepted) break;
  }
  return accepted;
}

export interface SimMatchOptions {
  auctionType?: "Vickrey" | "FirstPrice";
  /** Small explicit worlds/dictionaries allow deterministic reducer-parity fixtures. */
  world?: SimWorld;
  dictionary?: ReadonlySet<string>;
  /** Optional counters only; adds no policy calls, randomness or action delays. */
  telemetry?: boolean;
}

export interface SimConfig {
  bot: "adv" | "v1";
  p: Record<string, number>;
  field: string;
  label?: string;
  seed?: number;
  rival?: Record<string, number>;
  auctionType?: "Vickrey" | "FirstPrice";
}

export function validateSimConfig(value: unknown): SimConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ONE must be a configuration object");
  const config = value as SimConfig;
  if (config.bot !== "adv" && config.bot !== "v1") throw new Error("Unknown simulation bot; expected adv or v1");
  if (config.auctionType !== undefined && config.auctionType !== "Vickrey" && config.auctionType !== "FirstPrice")
    throw new Error("Unknown auctionType; expected Vickrey or FirstPrice");
  if (!["gauntlet", "sims", "hu", "big", "mc", "mchu", "live", "mcbig"].includes(config.field))
    throw new Error(`Unknown interactive field: ${config.field}`);
  return config;
}

export function effectiveMCRival(field: string, rival: AdvParams): AdvParams | undefined {
  return ["mc", "mchu", "live", "mcbig"].includes(field) ? rival : undefined;
}

export function runMatch(players: Player[], seed: number, matchIndex: number, options: SimMatchOptions = {}) {
  if (options.auctionType !== undefined && options.auctionType !== "Vickrey" && options.auctionType !== "FirstPrice")
    throw new Error("Unknown auctionType; expected Vickrey or FirstPrice");
  const fullBag: string[] = [];
  for (const [c, n] of Object.entries(FULL_BAG)) for (let i = 0; i < n; i++) fullBag.push(c);
  const world = options.world ?? createSimWorld(seed, matchIndex, fullBag, players.length);
  if (world.startingRacks.length !== players.length || world.startingRacks.some(rack => rack.length !== 5)
    || world.tieOrder.length !== world.auctions.length || world.bidJitter.length !== world.auctions.length) {
    throw new Error("Simulated world does not match the table");
  }
  if (!options.dictionary) loadEngines();
  for (const [seat, p] of players.entries()) {
    p.rack = new Map(); p.balance = 100; p.score = 0;
    for (const c of world.startingRacks[seat]!) p.rack.set(c, (p.rack.get(c) ?? 0) + 1);
  }
  MATCH = { players, world, round: 0, auctionLetters: [], results: [], plays: [], seatCount: players.length, bagStart: world.auctions.length,
    matchKey: `${seed}:${matchIndex}`, firstPrice: options.auctionType === "FirstPrice",
    terminalEligible: players.every(player => !player.serverSimulated), dictionary: options.dictionary ?? dictionary! };
  if (options.telemetry) MATCH.telemetry = players.map((p, seat) => ({
    seat, name: p.name, style: p.style ?? "custom", serverSimulated: !!p.serverSimulated,
    startingCash: p.balance, cashAtFinalOpening: null, endCash: p.balance,
    tilesPurchased: 0, totalPaid: 0,
    quarters: Array.from({ length: 4 }, () => ({ tilesPurchased: 0, totalPaid: 0, wordPoints: 0 })),
    acceptedWords: 0, invalidAttempts: 0, wordEvents: [], finalAuctionWordIncome: 0, finalAuctionPaid: 0,
  }));
  let priorWinner: number | undefined;
  for (const [round, letter] of world.auctions.entries()) {
    MATCH.round = round;
    MATCH.auctionLetters.push(letter); // the tile on the block is public
    const bagLeft = world.auctions.length - round - 1;
    if (bagLeft === 0 && MATCH.telemetry) {
      for (const trace of MATCH.telemetry) trace.cashAtFinalOpening = players[trace.seat]!.balance;
    }
    // The server draws/opens the next tile before external clients can react
    // to an award. Starting inventory also triggers an external reaction.
    // Server-simulated opponents only play inside auction close after a win.
    for (const [seat, p] of players.entries()) {
      if (p.serverSimulated) continue;
      let inventoryChanged = round === 0 || priorWinner === seat;
      // The live scheduler submits one word and replans after its receipt.
      // Re-evaluate balance/rack instead of blindly cashing an old word list.
      // These receipts are instantaneous in this model, with no latency claims.
      for (let receipts = 0; receipts < 49; receipts++) {
        if (!playWords(p, p.play(bagLeft, inventoryChanged), 1)) break;
        inventoryChanged = true;
      }
    }
    const bids = players
      .map((p, i) => {
        const proposed = p.bid(letter, bagLeft);
        return { i, amt: Number.isFinite(proposed) ? Math.max(0, Math.min(Math.floor(proposed), p.balance)) : 0 };
      })
      .filter((b) => b.amt > 0);
    // A precomputed uniform ordering remains uniform on any bidder subset.
    // Changing which seats bid cannot shift future deals, ties or jitter.
    const priority = world.tieOrder[round]!;
    bids.sort((a, b) => b.amt - a.amt || priority.indexOf(a.i) - priority.indexOf(b.i));
    priorWinner = undefined;
    if (bids.length > 0) {
      const w = players[bids[0]!.i]!;
      const paid = MATCH.firstPrice ? bids[0]!.amt : bids[1] ? bids[1].amt : 1;
      if (w.balance >= paid) {
        w.balance -= paid;
        const trace = telemetryFor(w);
        if (trace) {
          trace.tilesPurchased++;
          trace.totalPaid += paid;
          trace.quarters[currentQuarter()]!.tilesPurchased++;
          trace.quarters[currentQuarter()]!.totalPaid += paid;
          if (bagLeft === 0) trace.finalAuctionPaid += paid;
        }
        MARKET.paid += paid; MARKET.tiles++;
        if (w === players[0]) MARKET.myTiles++;
        w.rack.set(letter, (w.rack.get(letter) ?? 0) + 1);
        priorWinner = bids[0]!.i;
        MATCH.results.push({ letter, winner: BigInt(bids[0]!.i) });
        // Server-simulated opponents play inside closeAuction before the
        // match-end check; external clients cannot react to the last award.
        if (w.serverSimulated) playWords(w, w.play(bagLeft, true));
      }
    } else MATCH.results.push({ letter });
  }
  if (MATCH.telemetry) for (const trace of MATCH.telemetry) trace.endCash = players[trace.seat]!.balance;
  return { results: [...MATCH.results], plays: [...MATCH.plays], telemetry: MATCH.telemetry };
}

function tournament(label: string, make: () => Player[], matches: number) {
  const totals = new Map<string, { score: number; place: number; wins: number }>();
  for (let m = 0; m < matches; m++) {
    const players = make();
    runMatch(players, 12345, m);
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

function main(): void {
const N = Number(process.argv[2] ?? 100);
if (!Number.isSafeInteger(N) || N < 1) throw new Error("Match count must be a positive integer");
const oneConfig = process.env.ONE ? validateSimConfig(JSON.parse(process.env.ONE)) : undefined;
loadEngines();
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
            runMatch(ps, 12345, m);
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
            runMatch(ps, 12345, m);
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
  const cfg = oneConfig!;
  const STRONG: Params = { ...DEFAULT_PARAMS, minCashLen: 7, moneyFactor: 3, maxBidShare: 0.6, futureWeight: 1.2 };
  const BEST_ADV: AdvParams = { ...ADV_DEFAULTS, samples: 8, bidGain: 1.5, cashLen: 7, paceEarly: 0.8, paceLate: 2.5 };
  const RIVAL: AdvParams = { ...BEST_ADV, ...(cfg.rival ?? {}) };
  const me = () => cfg.bot === "adv" ? advancedPlayer("ME", { ...ADV_DEFAULTS, ...cfg.p } as AdvParams) : ours("ME", { ...DEFAULT_PARAMS, ...cfg.p } as Params);
  const fields: Record<string, () => Player[]> = {
    gauntlet: () => [me(), ours("tv1a", STRONG), ours("tv1b", STRONG), simBot("a", "aggr"), starter("s1"), simBot("v", "value")],
    sims: () => [me(), simBot("a", "aggr"), simBot("b", "aggr"), starter("s1"), starter("s2"), simBot("v", "value")],
    hu: () => [me(), ours("tv1", STRONG)],
    big: () => [me(), ours("tv1a", STRONG), ours("tv1b", STRONG), ours("tv1c", STRONG), simBot("a", "aggr"), simBot("b", "aggr"), starter("s1"), starter("s2"), simBot("v", "value")],
    // Reactive model opponents, not reproductions of real top-table entrants.
    mc: () => [me(), advancedPlayer("mcA", RIVAL), advancedPlayer("mcB", RIVAL), ours("tv1", STRONG), simBot("a", "aggr"), starter("s1")],
    mchu: () => [me(), advancedPlayer("mcA", RIVAL)],
    // Legacy field name: four configurable reactive MC rivals plus a heuristic.
    // This field is not a calibrated forecast of the actual live ladder.
    live: () => [me(), advancedPlayer("r1", RIVAL), advancedPlayer("r2", RIVAL), advancedPlayer("r3", RIVAL), ours("tv1", STRONG), advancedPlayer("r4", RIVAL)],
    mcbig: () => [me(), advancedPlayer("mcA", RIVAL), advancedPlayer("mcB", RIVAL), advancedPlayer("mcC", RIVAL), ours("tv1a", STRONG), ours("tv1b", STRONG), simBot("a", "aggr"), starter("s1"), starter("s2")],
  };
  if (!fields[cfg.field]) throw new Error(`Unknown interactive field: ${cfg.field}`);
  let place = 0, score = 0, wins = 0;
  const details: { matchIndex: number; score: number; place: number; win: boolean; balance: number; fieldScores: number[];
    completionFloorStats: { checks: number; opportunities: number; raisedBids: number } | null;
    words7Plus: number; points7Plus: number; wordLengths: number[]; telemetry: SimPlayerTelemetry; fieldTelemetry: SimPlayerTelemetry[]; opponentStyles: string[] }[] = [];
  for (let m = 0; m < N; m++) {
    const ps = fields[cfg.field]!();
    const result = runMatch(ps, cfg.seed ?? 777, m, { auctionType: cfg.auctionType, telemetry: !!process.env.SIM_DETAILS });
    MARKET.matches++; MARKET.topScore += Math.max(...ps.map((x) => x.score)); MARKET.myLeft += ps[0]!.balance;
    const sorted = [...ps].sort((a, b) => b.score - a.score);
    const pl = sorted.findIndex((x) => x.score === ps[0]!.score) + 1;
    place += pl; score += ps[0]!.score; if (pl === 1) wins++;
    if (process.env.SIM_DETAILS) details.push({ matchIndex: m, score: ps[0]!.score, place: pl, win: pl === 1,
      balance: ps[0]!.balance, fieldScores: ps.map(player => player.score), telemetry: result.telemetry![0]!,
      completionFloorStats: ps[0]!.getCompletionFloorStats?.() ?? null,
      words7Plus: result.plays.filter(w => w.botId === 0n && w.word.length >= 7).length,
      points7Plus: result.plays.filter(w => w.botId === 0n && w.word.length >= 7).reduce((s, w) => s + reward(w.word), 0),
      wordLengths: result.plays.filter(w => w.botId === 0n).map(w => w.word.length),
      fieldTelemetry: result.telemetry!, opponentStyles: result.telemetry!.slice(1).map(player => player.style) });
    if (process.env.SIM_PROGRESS && ((m + 1) % 8 === 0 || m + 1 === N))
      console.error(`completed ${m + 1}/${N} reactive simulated matches`);
  }
  const mk = `$/tile ${(MARKET.paid / Math.max(1, MARKET.tiles)).toFixed(1)} top ${(MARKET.topScore / N).toFixed(0)} myTiles ${(MARKET.myTiles / N).toFixed(1)} myLeft ${(MARKET.myLeft / N).toFixed(0)}`;
  console.log(`${(place / N).toFixed(2)}\t${(score / N).toFixed(1)}\t${((100 * wins) / N).toFixed(0)}%\t${cfg.label ?? JSON.stringify(cfg.p)}\t${mk}`);
  if (process.env.SIM_DETAILS) fs.writeFileSync(process.env.SIM_DETAILS, JSON.stringify({
    model: "instant external actions; reactive synthetic rivals; no transport latency", seed: cfg.seed ?? 777,
    timingLimitation: "Policy search uses wall-clock budgets; fixed exogenous worlds do not guarantee identical decisions under different CPU load.",
    telemetrySchema: 1,
    telemetrySemantics: "Zero-based quarters use floor(auction index * 4 / auction count). Final-opening cash precedes external liquidation. Final-auction word income includes external opening and server-simulated closing words; it is not necessarily wasted cash. Invalid attempts are rejected model word proposals. Synthetic policy styles do not identify actual rivals.",
    config: cfg, effectivePolicy: cfg.bot === "adv" ? { ...ADV_DEFAULTS, ...cfg.p } : { ...DEFAULT_PARAMS, ...cfg.p },
    effectiveRival: effectiveMCRival(cfg.field, RIVAL), matches: N, details,
  }) + "\n");
}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
