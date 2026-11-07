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
  type EventContext,
  type ErrorContext,
  type SubscriptionHandle,
} from "./module_bindings/index.js";
import { Identity } from "spacetimedb";
import * as fs from "node:fs";
import * as path from "node:path";
import { makeBrain } from "./brain.js";
import { buildUnseen } from "./tracker.js";
import type { AdvView } from "./advanced.js";

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
  fs.writeFileSync(TOKEN_PATH, tok);
}

let myIdentity: Identity | null = null;
let myBotId: bigint | null = null;
const bidsByAuction = new Set<string>();
// Words submitted but not yet confirmed, per match, so a rack update that
// arrives before the server applies our word doesn't make us resend it.
const pendingWords = new Map<string, Set<string>>();

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

  let balance = 0, score = 0, seats = 0;
  for (const p of conn.db.matchParticipant.iter()) {
    if (p.matchId !== matchId) continue;
    seats++;
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
  const plays: { botId: bigint; word: string }[] = [];
  for (const w of conn.db.wordPlay.iter()) if (w.matchId === matchId) plays.push({ botId: w.botId, word: w.word });

  const unseen = buildUnseen({ auctionLetters, results, plays, myBotId, myRack: rack });
  const startRack = Number(m.startingRackSize ?? 5);
  return {
    rack,
    balance,
    score,
    bagLeft: Number(m.bagTotal),
    bagStart: FULL_BAG_SIZE - startRack * seats,
    unseen,
    seatCount: seats,
  };
}

function playWords(conn: DbConnection, matchId: bigint, v: AdvView) {
  const key = String(matchId);
  if (!pendingWords.has(key)) pendingWords.set(key, new Set());
  const pending = pendingWords.get(key)!;
  // Remove letters of words already in flight from the rack we plan with.
  const rack = new Map(v.rack);
  for (const w of pending) for (const c of w) rack.set(c, Math.max(0, (rack.get(c) ?? 0) - 1));
  for (const [c, n] of [...rack]) if (n === 0) rack.delete(c);

  const words = brain.words({ ...v, rack });
  for (const word of words) {
    pending.add(word);
    log(`match ${matchId}: play '${word}'${v.bagLeft === 0 ? " (final playout)" : ""}`);
    conn.reducers
      .submitWord({ matchId, word })
      .catch(logFailure(`playing '${word}'`))
      .finally(() => pending.delete(word));
  }
}

function onAuctionOpen(conn: DbConnection, auctionId: bigint, matchId: bigint, letter: string) {
  if (myBotId === null) return;
  const key = `${matchId}:${auctionId}`;
  if (bidsByAuction.has(key)) return;
  bidsByAuction.add(key);
  const t0 = performance.now();
  const v = viewFor(conn, matchId);
  if (!v) return;
  // 1-2: words first. On the last auction this is the full playout.
  playWords(conn, matchId, v);
  // 3: bid.
  const amount = Math.min(brain.bid(v, letter), v.balance);
  const ms = (performance.now() - t0).toFixed(0);
  if (amount <= 0) {
    log(`skip '${letter}' (bag ${v.bagLeft}, bal ${v.balance}, ${ms}ms)`);
    return;
  }
  conn.reducers
    .submitBid({ auctionId, amount: BigInt(amount) })
    .catch(logFailure(`bid on auction ${auctionId}`));
  log(`bid ${amount} on '${letter}' (bag ${v.bagLeft}, bal ${v.balance}, rack ${[...v.rack].map(([c, n]) => c.repeat(n)).join("")}, ${ms}ms)`);
}

function onRackChange(conn: DbConnection) {
  if (myBotId === null) return;
  for (const p of conn.db.matchParticipant.iter()) {
    if (p.botId !== myBotId) continue;
    const v = viewFor(conn, p.matchId);
    if (v && v.bagLeft > 0) playWords(conn, p.matchId, v);
  }
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
  if (myBotId === null) return;
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
  if (matchSubs.has(key)) return;
  if (matchId > latestMatch) latestMatch = matchId;
  const t0 = performance.now();
  const handle = conn
    .subscriptionBuilder()
    .onApplied(() => {
      const m = conn.db.matchState.id.find(matchId);
      log(`watching match ${matchId} (${m?.status.tag ?? "?"}, subscribed in ${(performance.now() - t0).toFixed(0)}ms)`);
      if (m?.status.tag !== "Running") {
        dropMatch(matchId);
        return;
      }
      for (const a of conn.db.auction.iter()) {
        if (a.matchId === matchId && a.status.tag === "Open") onAuctionOpen(conn, a.id, a.matchId, a.letter);
      }
    })
    .onError((ctx) => log(`match ${matchId} subscription error: ${(ctx as { event?: unknown }).event ?? "?"}`))
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
  if (!h) return;
  matchSubs.delete(key);
  pendingWords.delete(key);
  try {
    h.unsubscribe();
  } catch {
    /* already ended */
  }
}

function startPhase1(conn: DbConnection) {
  const bot = conn.db.bot.id.find(myBotId!);
  log(`acting as bot '${bot?.name ?? "?"}' (id ${myBotId})`);
  conn
    .subscriptionBuilder()
    .onApplied(() => {
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
      setTimeout(() => joinLobby(conn), 1500);
    })
    .subscribe([`SELECT * FROM match_participant WHERE bot_id = ${myBotId}`]);
}

function onConnect(conn: DbConnection, identity: Identity, token: string) {
  myIdentity = identity;
  saveToken(token);
  log(`connected as ${identity.toHexString()} (brain: ${brain.name})`);

  conn
    .subscriptionBuilder()
    .onApplied(() => {
      myBotId = resolveMyBotId(conn);
      if (myBotId === null) {
        if (BOT_NONCE) {
          conn.reducers.claimCredential({ code: BOT_NONCE }).catch(logFailure("claiming the credential"));
          setTimeout(() => {
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
    .subscribe(["SELECT * FROM bot_credential", "SELECT * FROM bot", "SELECT * FROM my_rack"]);

  // A new seat for us = a new match: subscribe to it right away (the first
  // auction is already open, so this has to be fast).
  conn.db.matchParticipant.onInsert((_ctx, p) => {
    if (myBotId !== null && p.botId === myBotId && p.matchId >= latestMatch) watchMatch(conn, p.matchId);
  });
  conn.db.auction.onInsert((_ctx: EventContext, a) => {
    if (a.status.tag === "Open") onAuctionOpen(conn, a.id, a.matchId, a.letter);
  });
  conn.db.myRack.onInsert(() => onRackChange(conn));
  conn.db.myRack.onUpdate(() => onRackChange(conn));
  conn.db.botCredential.onInsert(() => {
    if (myBotId === null) myBotId = resolveMyBotId(conn);
  });

  conn.db.matchState.onUpdate((_ctx, old, neu) => {
    if (myBotId === null) return;
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

function main() {
  log(`connecting to ${DB_NAME} at ${HOST}`);
  DbConnection.builder()
    .withUri(HOST)
    .withDatabaseName(DB_NAME)
    .withToken(BOT_TOKEN ?? loadToken())
    .onConnect(onConnect)
    .onConnectError((_ctx: ErrorContext, err: Error) => console.error("connect error:", err.message))
    .onDisconnect(() => {
      // Staying connected is a hard rule in the tournament: an offline bot
      // still gets seated and loses every auction. Exit non-zero so the
      // wrapper script (run.sh) restarts us immediately.
      console.error(`[${BOT_NAME}] disconnected, exiting for restart`);
      process.exit(2);
    })
    .build();
}

main();
