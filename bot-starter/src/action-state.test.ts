import assert from 'node:assert/strict';
import test from 'node:test';
import { ActionState, type ActionSnapshot } from './action-state.js';

class Clock {
  time = 0;
  next = 0;
  timers = new Map<number, { due: number; fn: () => void }>();
  now = () => this.time;
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.next;
    this.timers.set(id, { due: this.time + ms, fn });
    return id;
  };
  clearTimeout = (id: unknown) => { this.timers.delete(id as number); };
  run() {
    for (let turns = 0; turns < 100; turns++) {
      const entry = [...this.timers].find(([, timer]) => timer.due <= this.time);
      if (!entry) return;
      this.timers.delete(entry[0]); entry[1].fn();
    }
    throw new Error('Controller scheduled an immediate busy loop');
  }
  advance(ms: number) { this.time += ms; this.run(); }
}
function deferred() {
  let resolve!: () => void, reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
type View = { words: string[]; bid: number };
function snapshot(overrides: Partial<ActionSnapshot<View>> = {}): ActionSnapshot<View> {
  return { view: { words: ['EAT'], bid: 0 }, rack: new Map([['E', 2], ['A', 2], ['T', 2]]),
    balance: 100, ownPlayCount: 0, running: true,
    auction: { id: 1n, letter: 'E', closesAtMs: 1000 }, ...overrides };
}
function harness() {
  const clock = new Clock();
  const words: { word: string; call: ReturnType<typeof deferred> }[] = [];
  const bids: { id: bigint; amount: number; call: ReturnType<typeof deferred> }[] = [];
  const state = new ActionState<View>({ clock, marginMs: 50, retryMs: 60,
    selectWords: s => s.view.words, selectBid: s => s.view.bid,
    isDefinitiveFailure: error => error === 'rejected',
    transport: {
      word: word => { const call = deferred(); words.push({ word, call }); return call.promise; },
      bid: (id, amount) => { const call = deferred(); bids.push({ id, amount, call }); return call.promise; },
    },
  });
  return { state, clock, words, bids };
}

test('dispatches a selected word before synchronous bid search without releasing pending inventory', async () => {
  const clock = new Clock();
  const order: { event: string; at: number; pending?: boolean }[] = [];
  const call = deferred();
  const state = new ActionState<View>({ clock, marginMs: 150,
    selectWords: s => s.view.words,
    selectBid: s => { order.push({ event: 'selectBid', at: clock.time, pending: s.wordPending }); clock.time += 300; return 0; },
    isDefinitiveFailure: () => true,
    transport: { word: () => { order.push({ event: 'word', at: clock.time }); return call.promise; }, bid: async () => {} },
  });
  state.update(snapshot()); clock.run();
  assert.deepEqual(order, [{ event: 'word', at: 0 }, { event: 'selectBid', at: 0, pending: true }]);
  await flush();
  state.update(snapshot()); clock.run(); await flush();
  assert.equal(order.filter(e => e.event === 'word').length, 1);
  call.resolve(); await flush(); clock.run(); await flush();
  assert.equal(order.filter(e => e.event === 'word').length, 1, 'acknowledgment alone must not duplicate a word');
  assert.ok(order.filter(e => e.event === 'selectBid').every(e => e.pending));
  state.stop();
});

test('synchronous definite transport throws use the same bounded retry path', async () => {
  const clock = new Clock();
  let calls = 0;
  const logs: string[] = [];
  const state = new ActionState<View>({ clock, retryMs: 60,
    selectWords: s => s.view.words, selectBid: () => 0,
    isDefinitiveFailure: error => error === 'rejected', log: message => logs.push(message),
    transport: { word: () => { calls++; throw 'rejected'; }, bid: async () => {} },
  });
  state.update(snapshot()); clock.run(); await flush();
  assert.equal(calls, 1);
  assert.deepEqual(logs, ['Word submission failed']);
  clock.advance(59); await flush(); assert.equal(calls, 1);
  clock.advance(1); await flush(); assert.equal(calls, 2);
  state.update(snapshot()); clock.run(); await flush();
  clock.advance(60); await flush();
  assert.equal(calls, 2);
  assert.deepEqual(logs, ['Word submission failed', 'Word submission failed']);
  state.stop();
});

test('synchronous ambiguous transport throws remain pending and cannot cause a duplicate', async () => {
  const clock = new Clock();
  let calls = 0;
  const pending: boolean[] = [];
  const state = new ActionState<View>({ clock,
    selectWords: s => s.view.words, selectBid: s => { pending.push(s.wordPending); return 0; },
    isDefinitiveFailure: () => false,
    transport: { word: () => { calls++; throw new Error('unknown delivery'); }, bid: async () => {} },
  });
  state.update(snapshot()); clock.run(); await flush();
  state.update(snapshot()); clock.advance(100); await flush();
  assert.equal(calls, 1);
  assert.ok(pending.every(Boolean));
  state.stop();
});

test('a snapshot replaced during word selection invalidates that selection before immediate dispatch', async () => {
  const clock = new Clock();
  let replaced = false, sends = 0;
  const state = new ActionState<View>({ clock,
    selectWords: s => {
      if (!replaced) {
        replaced = true;
        state.update(snapshot({ rack: new Map([['X', 1]]), view: { words: [], bid: 0 } }));
      }
      return s.view.words;
    },
    selectBid: () => 0, isDefinitiveFailure: () => true,
    transport: { word: async () => { sends++; }, bid: async () => {} },
  });
  state.update(snapshot()); clock.run(); await flush();
  assert.equal(sends, 0);
  state.stop();
});

test('serializes words until own-play confirmation and replans from authoritative rack', async () => {
  const h = harness();
  h.state.update(snapshot()); h.clock.run(); await flush();
  assert.equal(h.words.length, 1);
  // Rack already includes the first consumption; do not subtract the pending word again.
  h.state.update(snapshot({ rack: new Map([['E', 1], ['A', 1], ['T', 1]]) }));
  h.clock.run(); await flush(); assert.equal(h.words.length, 1);
  h.words[0]!.call.resolve(); await flush(); h.clock.run(); await flush();
  assert.equal(h.words.length, 1, 'success acknowledgment alone is insufficient');
  h.state.update(snapshot({ ownPlayCount: 1, rack: new Map([['E', 1], ['A', 1], ['T', 1]]) }));
  h.clock.run(); await flush();
  assert.deepEqual(h.words.map(w => w.word), ['EAT', 'EAT']);
  h.state.stop();
});

test('bid selection sees pending inventory until authoritative word receipt', async () => {
  const clock = new Clock();
  const pending: boolean[] = [];
  const wordCall = deferred();
  const state = new ActionState<View>({ clock,
    selectWords: s => s.view.words,
    selectBid: s => { pending.push(s.wordPending); return 0; },
    isDefinitiveFailure: () => true,
    transport: { word: () => wordCall.promise, bid: async () => {} },
  });
  state.update(snapshot()); clock.run(); await flush();
  assert.deepEqual(pending, [true]);
  wordCall.resolve(); await flush(); clock.run(); await flush();
  assert.ok(pending.every(Boolean), 'call acknowledgment is not an inventory receipt');
  state.update(snapshot({ ownPlayCount: 1, rack: new Map([['X', 1]]),
    view: { words: [], bid: 0 } }));
  clock.run(); await flush();
  assert.equal(pending.at(-1), false);
  state.stop();
});

test('continues final-auction playout on receipts, including receipt before acknowledgment', async () => {
  const h = harness();
  h.state.update(snapshot({ view: { words: ['EAT', 'EAT'], bid: 0 } }));
  h.clock.run(); await flush(); assert.equal(h.words.length, 1);
  h.state.update(snapshot({ ownPlayCount: 1, rack: new Map([['E', 1], ['A', 1], ['T', 1]]) }));
  h.clock.run(); await flush(); assert.equal(h.words.length, 2);
  h.words[0]!.call.resolve(); await flush(); h.clock.run(); await flush();
  assert.equal(h.words.length, 2, 'late acknowledgment must not release the next operation');
  h.state.stop();
});

test('retries a definite word rejection twice at most despite intervening updates', async () => {
  const h = harness();
  h.state.update(snapshot()); h.clock.run(); await flush();
  h.words[0]!.call.reject('rejected'); await flush();
  h.clock.advance(10); h.state.update(snapshot()); h.clock.run(); await flush();
  assert.equal(h.words.length, 1);
  h.clock.advance(50); await flush(); assert.equal(h.words.length, 2);
  h.words[1]!.call.reject('rejected'); await flush();
  h.clock.advance(60); h.state.update(snapshot()); h.clock.run(); await flush();
  assert.equal(h.words.length, 2);
  h.state.stop();
});

test('ambiguous word result cannot cause a blind duplicate', async () => {
  const h = harness();
  h.state.update(snapshot()); h.clock.run(); await flush();
  h.words[0]!.call.reject(new Error('unknown call result')); await flush();
  h.state.update(snapshot()); h.clock.advance(100); await flush();
  assert.equal(h.words.length, 1);
  h.state.stop();
});

test('does not send after the closing margin, including time spent selecting', async () => {
  const clock = new Clock(); let sends = 0;
  const state = new ActionState<View>({ clock, marginMs: 50,
    selectWords: () => { clock.time = 960; return ['EAT']; }, selectBid: () => 9,
    isDefinitiveFailure: () => true,
    transport: { word: async () => { sends++; }, bid: async () => { sends++; } },
  });
  state.update(snapshot()); clock.run(); await flush();
  assert.equal(sends, 0);
  state.stop();
});

test('bid rejection retries within deadline and never exceeds two attempts', async () => {
  const h = harness(); const s = snapshot({ view: { words: [], bid: 9 } });
  h.state.update(s); h.clock.run(); await flush(); assert.equal(h.bids.length, 1);
  h.bids[0]!.call.reject('rejected'); await flush();
  h.clock.advance(10); h.state.update(s); h.clock.run(); await flush();
  h.clock.advance(50); await flush(); assert.equal(h.bids.length, 2);
  h.bids[1]!.call.reject('rejected'); await flush();
  h.clock.advance(60); h.state.update(s); h.clock.run(); await flush();
  assert.equal(h.bids.length, 2);
  h.state.stop();
});

test('bid acknowledgment reassesses coalesced fresh balance without another table event', async () => {
  const h = harness();
  h.state.update(snapshot({ balance: 5, view: { words: [], bid: 9 } }));
  h.clock.run(); await flush(); assert.equal(h.bids[0]!.amount, 5);
  h.state.update(snapshot({ balance: 15, view: { words: [], bid: 9 } }));
  h.clock.run(); await flush(); assert.equal(h.bids.length, 1);
  h.bids[0]!.call.resolve(); await flush(); h.clock.run(); await flush();
  assert.deepEqual(h.bids.map(b => b.amount), [5, 9]);
  h.state.stop();
});

test('disconnect and stop prevent scheduled retry sends', async () => {
  const h = harness(); h.state.update(snapshot()); h.clock.run(); await flush();
  h.words[0]!.call.reject('rejected'); await flush();
  h.state.setConnected(false); h.clock.advance(60); await flush();
  assert.equal(h.words.length, 1);
  h.state.stop(); h.state.setConnected(true); h.clock.advance(100); await flush();
  assert.equal(h.words.length, 1); assert.equal(h.clock.timers.size, 0);
});
