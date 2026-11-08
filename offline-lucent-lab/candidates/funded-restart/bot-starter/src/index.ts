// ScrabbleBot live runner.
//
// First run, with a token from the website (Team page -> Generate token):
//   BOT_NAME=<name> BOT_TOKEN=<token> npm start
// Later runs: BOT_NAME=<name> npm start   (token saved to .token-<name>)
// Tournament: BOT_NAME=<name> TOURNAMENT_ID=<id> npm start
// Strategy:   BRAIN=adv (Monte Carlo, default) or BRAIN=v1 (tuned heuristic)
//
// Order of work when an auction opens:
//   1. If it's the last auction (bagTotal 0), play out the whole rack NOW:
//      the match ends inside the transaction that closes this auction.
//   2. Otherwise cash any long word the strategy wants to cash.
//   3. Bid (0 on the last tile: it can never be played).

import {
  DbConnection,
  type ErrorContext,
  type SubscriptionHandle,
} from "./module_bindings/index.js";
import { Identity, SenderError, DisconnectedError } from "spacetimedb";
import * as fs from "node:fs";
import * as path from "node:path";
import { makeBrain } from "./brain.js";
import { buildUnseen } from "./tracker.js";
import type { AdvView } from "./advanced.js";
import { ActionState, type ActionSnapshot } from "./action-state.js";
import { bidContextKey } from "./bid-context-key.js";
import { pathToFileURL } from "node:url";

const HOST = process.env.STDB_HOST ?? "https://maincloud.spacetimedb.com";
const DB_NAME = process.env.STDB_DB ?? "scrabblebot";
const BOT_NAME = process.env.BOT_NAME ?? "bot";
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_NONCE = process.env.BOT_NONCE;
const TOURNAMENT_ID = process.env.TOURNAMENT_ID;
const TOKEN_PATH = path.join(process.cwd(), `.token-${BOT_NAME}`);
const FULL_BAG_SIZE = 98;

const brain = makeBrain();

function loadToken(): string | undefined {
  try {
    return fs.readFileSync(TOKEN_PATH, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}
function saveToken(tok: string) {
  fs.writeFileSync(TOKEN_PATH, tok, { mode: 0o600 });
  fs.chmodSync(TOKEN_PATH, 0o600);
}

let myIdentity: Identity | null = null;
let myBotId: bigint | null = null;
const actions = new Map<string, ActionState<AdvView>>();
const readyMatches = new Set<string>();
const sessionHandles = new Set<SubscriptionHandle>();
const sessionTimers = new Set<ReturnType<typeof setTimeout>>();
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let sessionStopped = false;
function later(fn: () => void, ms: number) {
  const timer = setTimeout(() => { sessionTimers.delete(timer); if (!sessionStopped) fn(); }, ms);
  sessionTimers.add(timer); return timer;
}

const log = (...a: unknown[]) => console.log(`[${BOT_NAME}]`, ...a);

function logFailure(what: string) {
  return (err: unknown) =>
    console.warn(`[${BOT_NAME}] ${what} failed: ${err instanceof Error ? err.message : err}`);
}

function resolveMyBotId(conn: DbConnection): bigint | null {
  if (!myIdentity) return null;
  const cred = conn.db.botCredential.identity.find(myIdentity);
  return cred ? cred.botId : null;
}

function rackForMatch(conn: DbConnection, matchId: bigint): Map<string, number> {
  const rack = new Map<string, number>();
  for (const h of conn.db.myRack.iter()) {
    if (h.matchId !== matchId) continue;
    rack.set(h.letter, (rack.get(h.letter) ?? 0) + h.count);
  }
  return rack;
}

// Everything the strategy may know about one match, from public tables.
function viewFor(conn: DbConnection, matchId: bigint): AdvView | null {
  if (myBotId === null) return null;
  const m = conn.db.matchState.id.find(matchId);
  if (!m || m.status.tag !== "Running") return null;

  let balance = 0, score = 0, seats = 0, allExternal = true;
  for (const p of conn.db.matchParticipant.iter()) {
    if (p.matchId !== matchId) continue;
    seats++;
    const participantBot = conn.db.bot.id.find(p.botId);
    if (!participantBot || participantBot.isSimulated) allExternal = false;
    if (p.botId === myBotId) {
      balance = Number(p.balance);
      score = Number(p.score);
    }
  }
  const rack = rackForMatch(conn, matchId);

  const auctionLetters: string[] = [];
  for (const a of conn.db.auction.iter()) if (a.matchId === matchId) auctionLetters.push(a.letter);
  const results: { letter: string; winner?: bigint }[] = [];
  for (const r of conn.db.auctionResult.iter()) {
    if (r.matchId !== matchId) continue;
    results.push({ letter: r.letter, winner: r.winnerBotId ?? undefined });
  }
  const restartAcquisitionPrices = [...conn.db.auctionResult.iter()]
    .filter(r => r.matchId === matchId && r.paid > 0n)
    .sort((a, b) => a.auctionId < b.auctionId ? -1 : a.auctionId > b.auctionId ? 1 : 0)
    .slice(-16).map(r => Number(r.paid));
  const plays: { botId: bigint; word: string }[] = [];
  for (const w of conn.db.wordPlay.iter()) if (w.matchId === matchId) plays.push({ botId: w.botId, word: w.word });

  const unseen = buildUnseen({ auctionLetters, results, plays, myBotId, myRack: rack });
  const startRack = Number(m.startingRackSize ?? 5);
  return {
    rack,
    restartAcquisitionPrices,
    balance,
    score,
    bagLeft: Number(m.bagTotal),
    bagStart: FULL_BAG_SIZE - startRack * seats,
    unseen,
    seatCount: seats,
    firstPrice: m.auctionType.tag === "FirstPrice",
    auctionMs: Number(m.auctionDurationMs ?? 1000n),
    terminalEligible: seats > 0 && allExternal,
    matchKey: String(matchId),
  };
}

function createActions(conn: DbConnection, matchId: bigint): ActionState<AdvView> {
  let bidKey = '', bidValue = 0;
  let bidAuction: bigint | undefined;
  return new ActionState<AdvView>({
    marginMs: 150, retryMs: 60,
    selectWords: s => brain.words({ ...s.view, decisionBudgetMs: Math.max(0, Math.min(30, s.remainingMs)) }),
    selectBid: s => {
      if (!s.auction || s.view.bagLeft === 0) return 0;
      if (bidAuction !== s.auction.id) { bidAuction = s.auction.id; bidKey = ''; bidValue = 0; }
      // Preserve an earlier bid when too little time remains to recompute it.
      if (s.remainingMs <= 50) return bidValue;
      const v = s.view;
      const key = bidContextKey({ auction: s.auction, rack: s.rack, balance: s.balance,
        view: v, wordPending: s.wordPending, fundedRestartEnabled: brain.fundedRestartEnabled });
      if (key !== bidKey) {
        bidValue = brain.bid({ ...v, wordPending: s.wordPending, terminalEligible: v.terminalEligible && !s.wordPending,
          decisionBudgetMs: Math.max(0, Math.min(300, s.remainingMs - 50)) }, s.auction.letter);
        if (v.bagLeft === 1 && v.terminalEligible && !s.wordPending &&
            bidValue > 0 && bidValue === Math.floor(s.balance))
          log(`match ${matchId}: full-balance terminal bid ${bidValue} for ${s.auction.letter}`);
        bidKey = key;
      }
      return bidValue;
    },
    isDefinitiveFailure: error => error instanceof SenderError || error instanceof DisconnectedError,
    log: message => log(`match ${matchId}: ${message}`),
    telemetry: event => log(`execution ${JSON.stringify({ matchId: String(matchId), ...event })}`),
    transport: {
      word: word => {
        log(`match ${matchId}: play '${word}'`);
        return conn.reducers.submitWord({ matchId, word });
      },
      bid: (auctionId, amount) => {
        log(`match ${matchId}: bid ${amount} on auction ${auctionId}`);
        return conn.reducers.submitBid({ auctionId, amount: BigInt(amount) });
      },
    },
  });
}

function refreshActions(conn: DbConnection) {
  if (sessionStopped || refreshTimer !== undefined) return;
  refreshTimer = later(() => {
    refreshTimer = undefined;
    if (!conn.isActive || myBotId === null) return;
    for (const [key, controller] of actions) {
      if (!readyMatches.has(key)) continue;
      const matchId = BigInt(key), m = conn.db.matchState.id.find(matchId);
      if (!m || m.status.tag !== 'Running') continue;
      const view = viewFor(conn, matchId);
      if (!view) continue;
      const auction = m.currentAuctionId === undefined ? undefined : conn.db.auction.id.find(m.currentAuctionId);
      const snapshot: ActionSnapshot<AdvView> = { view, rack: view.rack, balance: view.balance,
        ownPlayCount: [...conn.db.wordPlay.iter()].filter(w => w.matchId === matchId && w.botId === myBotId).length,
        running: true,
        auction: auction?.status.tag === 'Open' ? { id: auction.id, letter: auction.letter,
          closesAtMs: Number(auction.closesAt.microsSinceUnixEpoch / 1000n) } : undefined };
      controller.update(snapshot);
      controller.setConnected(true);
    }
  }, 0);
}

// The live database holds ~1.7M auctions and ~400k word plays. The starter's
// subscribeToAllTables() downloads all of it before it can bid, so we only
// subscribe to what we need, in three phases:
//   0. bot + bot_credential (a few hundred rows) and my_rack  -> who am I
//   1. match_participant WHERE bot_id = me                    -> which matches I'm in
//   2. per match: its state, seats, auctions, results, words  -> play it
// Phase-2 handles are dropped when the match ends.
const matchSubs = new Map<string, SubscriptionHandle>();
let latestMatch = 0n;

function joinLobby(conn: DbConnection) {
  if (sessionStopped || myBotId === null) return;
  const inRunning = Array.from(conn.db.matchParticipant.iter()).some(
    (p) => p.botId === myBotId && conn.db.matchState.id.find(p.matchId)?.status.tag === "Running",
  );
  if (inRunning) return;
  log("joining lobby");
  // The module refuses if we're already queued or mid-match; that's fine.
  conn.reducers.joinLobby({}).catch(logFailure("joining the lobby"));
}

function watchMatch(conn: DbConnection, matchId: bigint) {
  const key = String(matchId);
  if (sessionStopped || matchSubs.has(key)) return;
  const controller = createActions(conn, matchId);
  controller.setConnected(false);
  actions.set(key, controller);
  if (matchId > latestMatch) latestMatch = matchId;
  const t0 = performance.now();
  const handle = conn
    .subscriptionBuilder()
    .onApplied(() => {
      if (sessionStopped) return;
      const m = conn.db.matchState.id.find(matchId);
      log(`watching match ${matchId} (${m?.status.tag ?? "?"}, subscribed in ${(performance.now() - t0).toFixed(0)}ms)`);
      if (m?.status.tag !== "Running") {
        dropMatch(matchId);
        return;
      }
      readyMatches.add(key);
      refreshActions(conn);
    })
    .onError(() => {
      log(`match ${matchId} subscription failed; restarting the sole runner`);
      stopSession(); process.exit(2);
    })
    .subscribe([
      `SELECT * FROM match_state WHERE id = ${matchId}`,
      `SELECT * FROM match_participant WHERE match_id = ${matchId}`,
      `SELECT * FROM auction WHERE match_id = ${matchId}`,
      `SELECT * FROM auction_result WHERE match_id = ${matchId}`,
      `SELECT * FROM word_play WHERE match_id = ${matchId}`,
    ]);
  matchSubs.set(key, handle);
}

function dropMatch(matchId: bigint) {
  const key = String(matchId);
  const h = matchSubs.get(key);
  actions.get(key)?.stop(); actions.delete(key); readyMatches.delete(key);
  if (!h) return;
  matchSubs.delete(key);
  try {
    h.unsubscribe();
  } catch {
    /* already ended */
  }
}

// Register for every tournament the moment it opens. Only the bot's own
// process can register, so doing it here means nobody has to restart the bot
// with the right TOURNAMENT_ID on the night.
const registered = new Set<string>();
function maybeRegister(conn: DbConnection, t: { id: bigint; status: { tag: string } }) {
  if (sessionStopped) return;
  const key = String(t.id);
  if (t.status.tag !== "Registration" || registered.has(key)) return;
  if (process.env.NO_AUTO_REGISTER && String(t.id) !== TOURNAMENT_ID) return;
  registered.add(key);
  conn.reducers
    .registerForTournament({ tournamentId: t.id })
    .then(() => log(`REGISTERED for tournament ${t.id}`))
    .catch((e) => {
      registered.delete(key);
      logFailure(`registering for tournament ${t.id}`)(e);
    });
}

function startPhase1(conn: DbConnection) {
  if (sessionStopped || myBotId === null) return;
  const bot = conn.db.bot.id.find(myBotId!);
  log(`acting as bot '${bot?.name ?? "?"}' (id ${myBotId})`);
  sessionHandles.add(conn
    .subscriptionBuilder()
    .onApplied(() => {
      if (sessionStopped) return;
      // Only the newest match can still be running; older ones are history.
      let newest = -1n;
      for (const p of conn.db.matchParticipant.iter()) if (p.botId === myBotId && p.matchId > newest) newest = p.matchId;
      if (newest >= 0n) watchMatch(conn, newest);
      if (TOURNAMENT_ID) {
        conn.reducers
          .registerForTournament({ tournamentId: BigInt(TOURNAMENT_ID) })
          .then(() => log(`registered for tournament ${TOURNAMENT_ID}`))
          .catch(logFailure(`registering for tournament ${TOURNAMENT_ID}`));
      }
      // Give the newest-match check a moment, then queue up.
      later(() => joinLobby(conn), 1500);
    })
    .subscribe([`SELECT * FROM match_participant WHERE bot_id = ${myBotId}`]));

  sessionHandles.add(conn
    .subscriptionBuilder()
    .onApplied(() => {
      if (sessionStopped) return;
      for (const t of conn.db.tournament.iter()) {
        if (t.status.tag !== "Ended" && t.status.tag !== "ForceEnded") log(`tournament ${t.id}: ${t.status.tag}, ${t.auctionType.tag}, tables of ${t.matchSize}`);
        maybeRegister(conn, t);
      }
    })
    .subscribe(["SELECT * FROM tournament"]));
  conn.db.tournament.onInsert((_ctx, t) => {
    log(`tournament ${t.id} created: ${t.status.tag}, ${t.auctionType.tag}, tables of ${t.matchSize}`);
    maybeRegister(conn, t);
  });
  conn.db.tournament.onUpdate((_ctx, _old, t) => {
    log(`tournament ${t.id} is now ${t.status.tag}`);
    maybeRegister(conn, t);
  });
}

export function onConnect(conn: DbConnection, identity: Identity, token: string, options: { persistToken?: boolean } = {}) {
  sessionStopped = false;
  myIdentity = identity;
  if (options.persistToken !== false) saveToken(token);
  log(`connected as ${identity.toHexString()} (brain: ${brain.name})`);

  sessionHandles.add(conn
    .subscriptionBuilder()
    .onApplied(() => {
      if (sessionStopped) return;
      myBotId = resolveMyBotId(conn);
      if (myBotId === null) {
        if (BOT_NONCE) {
          conn.reducers.claimCredential({ code: BOT_NONCE }).catch(logFailure("claiming the credential"));
          later(() => {
            myBotId = resolveMyBotId(conn);
            if (myBotId === null) {
              console.error(`[${BOT_NAME}] couldn't claim credential. Bad / expired nonce?`);
              process.exit(1);
            }
            startPhase1(conn);
          }, 1000);
          return;
        }
        console.error(`[${BOT_NAME}] no BotCredential for this token. Set BOT_TOKEN and re-run.`);
        process.exit(1);
      }
      startPhase1(conn);
    })
    .subscribe(["SELECT * FROM bot_credential", "SELECT * FROM bot", "SELECT * FROM my_rack"]));

  // A new seat for us = a new match: subscribe to it right away (the first
  // auction is already open, so this has to be fast).
  conn.db.matchParticipant.onInsert((_ctx, p) => {
    if (myBotId !== null && p.botId === myBotId && p.matchId >= latestMatch) watchMatch(conn, p.matchId);
  });
  for (const table of [conn.db.auction, conn.db.myRack, conn.db.wordPlay, conn.db.matchParticipant, conn.db.auctionResult]) {
    table.onInsert(() => refreshActions(conn));
    table.onUpdate(() => refreshActions(conn));
    table.onDelete(() => refreshActions(conn));
  }
  conn.db.botCredential.onInsert(() => {
    if (myBotId === null) myBotId = resolveMyBotId(conn);
  });

  conn.db.matchState.onUpdate((_ctx, old, neu) => {
    if (myBotId === null) return;
    refreshActions(conn);
    if (old.status.tag !== "Ended" && neu.status.tag === "Ended") {
      const me = Array.from(conn.db.matchParticipant.iter()).find((p) => p.matchId === neu.id && p.botId === myBotId);
      if (me) {
        const all = Array.from(conn.db.matchParticipant.iter()).filter((p) => p.matchId === neu.id);
        const place = 1 + all.filter((p) => p.score > me.score).length;
        const left = [...rackForMatch(conn, neu.id)].map(([c, n]) => c.repeat(n)).join("");
        log(`match ${neu.id} ended: score ${me.score}, place ${place}/${all.length}, unplayed '${left}'; rejoining lobby`);
        dropMatch(neu.id);
        joinLobby(conn);
      }
    }
  });
}

export function stopSession(): void {
  sessionStopped = true;
  for (const timer of sessionTimers) clearTimeout(timer);
  sessionTimers.clear(); refreshTimer = undefined;
  for (const id of [...matchSubs.keys()]) dropMatch(BigInt(id));
  for (const handle of sessionHandles) {
    try { if (!handle.isEnded()) handle.unsubscribe(); } catch { /* Connection may already be closed. */ }
  }
  sessionHandles.clear(); actions.clear(); readyMatches.clear(); registered.clear();
  myIdentity = null; myBotId = null; latestMatch = 0n;
}

export function main() {
  log(`connecting to ${DB_NAME} at ${HOST}`);
  DbConnection.builder()
    .withUri(HOST)
    .withDatabaseName(DB_NAME)
    .withToken(BOT_TOKEN ?? loadToken())
    .onConnect((conn, identity, token) => onConnect(conn, identity, token))
    .onConnectError((_ctx: ErrorContext, err: Error) => {
      console.error("connect error:", err.message); stopSession(); process.exit(2);
    })
    .onDisconnect(() => {
      // Staying connected is a hard rule in the tournament: an offline bot
      // still gets seated and loses every auction. Exit non-zero so the
      // wrapper script (run.sh) restarts us immediately.
      console.error(`[${BOT_NAME}] disconnected, exiting for restart`);
      stopSession();
      process.exit(2);
    })
    .build();
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main();
