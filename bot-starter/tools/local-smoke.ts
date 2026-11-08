/**
 * Opt-in integration check. Run only against a disposable, already-running local
 * module: LOCAL_SMOKE=1 node --import tsx scripts/local-smoke.ts
 * Creates six anonymous teams; database rows remain for inspection afterward.
 * Reconnect injection is omitted: disconnect() ends the SDK connection, and its
 * underlying socket is private. No unsupported socket/test hooks are used.
 */
import { randomUUID } from 'node:crypto';
import { DbConnection, type SubscriptionHandle } from '../src/module_bindings/index.js';
import { onConnect, stopSession } from '../src/index.js';


const HOST = 'http://127.0.0.1:3017';
const DATABASE = 'scrabblebot-local';

async function main(): Promise<void> {
  if (process.env.LOCAL_SMOKE !== '1') throw new Error('Opt in with LOCAL_SMOKE=1 against a disposable local database');
  // Fixed target: environment variables cannot redirect this check or supply credentials.
  const url = new URL(HOST);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '3017') {
    throw new Error('Smoke check requires the fixed loopback target');
  }
  const runId = randomUUID().slice(0, 8);
  const connections: DbConnection[] = [];
  const handles: SubscriptionHandle[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const tokens = new Map<DbConnection, string>();
  let stopped = false;
  let failure: Error | undefined;
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
  const expiry = setTimeout(() => rejectDeadline(new Error('Local smoke check exceeded 20 seconds')), 20_000);
  const guard = () => {
    if (stopped) throw new Error('Smoke check has stopped');
    if (failure) throw failure;
  };
  const step = async <T>(operation: Promise<T>): Promise<T> => {
    guard();
    const value = await Promise.race([operation, deadline]);
    guard();
    return value;
  };
  const waitFor = async (description: string, predicate: () => boolean): Promise<void> => {
    while (!predicate()) {
      guard();
      await step(new Promise<void>(resolve => {
        const timer = setTimeout(() => { timers.delete(timer); resolve(); }, 50);
        timers.add(timer);
      }));
    }
    guard();
    console.log(`Verified ${description}`);
  };
  const subscribe = async (conn: DbConnection, queries: string[]): Promise<void> => {
    await step(new Promise<void>((resolve, reject) => {
      handles.push(conn.subscriptionBuilder().onApplied(() => resolve())
        .onError(() => reject(new Error('Smoke subscription failed'))).subscribe(queries));
    }));
  };

  try {
    const botIds: bigint[] = [];
    for (let i = 0; i < 6; i++) {
      guard();
      const conn = await step(new Promise<DbConnection>((resolve, reject) => {
        const pending = DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE)
          .onConnect((connected, _identity, token) => { tokens.set(connected, token); resolve(connected); })
          .onConnectError(() => reject(new Error('Local smoke connection failed')))
          .onDisconnect(() => { if (!stopped) failure = new Error('Unexpected smoke connection loss'); })
          .build();
        connections.push(pending);
      }));
      await subscribe(conn, ['SELECT * FROM my_nonces', 'SELECT * FROM bot_credential']);
      await step(conn.reducers.createTeam({ teamName: `smoke-${runId}-${i}`, botName: `smoke-${runId}-${i}` }));
      await step(conn.reducers.mintCredentialNonce({}));
      await waitFor(`private nonce view for bot ${i + 1}`, () => [...conn.db.myNonces.iter()].length === 1);
      const nonce = [...conn.db.myNonces.iter()][0]!;
      const botId = nonce.botId;
      // Claim on the very connection that created the team; never print its code/token.
      await step(conn.reducers.claimCredential({ code: nonce.code }));
      await waitFor(`credential for bot ${i + 1}`, () => {
        const own = conn.identity && conn.db.botCredential.identity.find(conn.identity);
        return !!own && own.botId === botId;
      });
      botIds.push(botId);
    }

    const first = connections[0]!;
    if (!first.identity) throw new Error('Connected bot has no identity');
    // Observe the production subscription without adding another source of rack rows.
    // A fast word may consume the holdings before the next verification poll.
    const observedRackMatches = new Set<bigint>();
    first.db.myRack.onInsert((_ctx, row) => {
      if (row.botId !== botIds[0]) {
        failure = new Error('Production rack subscription exposed an opponent holding');
      } else if (row.count > 0) observedRackMatches.add(row.matchId);
    });
    onConnect(first, first.identity, tokens.get(first)!, { persistToken: false });
    for (const conn of connections.slice(1)) await step(conn.reducers.joinLobby({}));

    let matchId: bigint | undefined;
    await waitFor('production match discovery', () => {
      const running = [...first.db.matchState.iter()].find(m => m.status.tag === 'Running');
      if (!running) return false;
      const participants = [...first.db.matchParticipant.iter()].filter(p => p.matchId === running.id);
      if (!botIds.every(id => participants.some(p => p.botId === id))) return false;
      matchId = running.id;
      return true;
    });
    await waitFor('an auction won by the production bot', () =>
      [...first.db.auctionResult.iter()].some(r => r.matchId === matchId && r.winnerBotId === botIds[0]));
    await waitFor('a rack received through the production subscription', () =>
      matchId !== undefined && observedRackMatches.has(matchId));
    await waitFor('positive production-bot score', () =>
      [...first.db.matchParticipant.iter()].some(p => p.matchId === matchId && p.botId === botIds[0] && p.score > 0n));
    // Only after production has scored, independently check the unfiltered view's
    // privacy. This subscription cannot supply inventory to the production check.
    await subscribe(first, ['SELECT * FROM my_rack']);
    guard();
    if ([...first.db.myRack.iter()].some(row => row.botId !== botIds[0])) {
      throw new Error('Private rack view exposed an opponent holding');
    }
    console.log('Verified independent private-rack view scope');
    console.log('Local SDK smoke check passed. Reconnect injection was not exercised.');
  } finally {
    stopped = true;
    clearTimeout(expiry);
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    try { stopSession(); } finally {
      for (const handle of handles) {
        try { if (!handle.isEnded()) handle.unsubscribe(); } catch { /* Disconnect still releases it. */ }
      }
      for (const conn of connections) {
        try { conn.disconnect(); } catch { /* Continue closing remaining clients. */ }
      }
    }
  }
}

main().catch(() => {
  // Do not emit raw SDK errors: provisioning failures can include sensitive values.
  console.error('Local SDK smoke check failed; inspect the disposable server and verification progress.');
  process.exitCode = 1;
});
