import test from "node:test";
import assert from "node:assert/strict";
import { bidContextKey, type BidContext } from "./bid-context-key.js";

function fixture(): BidContext {
  return {
    auction: { id: 42n, letter: "M" }, rack: new Map([["A", 2], ["T", 1]]),
    balance: 30, wordPending: false,
    view: { score: 20, bagLeft: 12, bagStart: 68, seatCount: 6, firstPrice: false,
      terminalEligible: true, unseen: { total: 9, counts: { A: 3, T: 2, E: 4 } } },
  };
}

test("nonterminal pending toggle preserves ordinary bid cache", () => {
  const a = fixture();
  assert.equal(bidContextKey(a), bidContextKey({ ...a, wordPending: true }));
  assert.equal(bidContextKey(a), bidContextKey({
    ...a, view: { ...a.view, terminalEligible: false } }));
});

test("pending toggle invalidates an eligible terminal-proof bid", () => {
  const a = fixture(); a.view.bagLeft = 1;
  assert.notEqual(bidContextKey(a), bidContextKey({ ...a, wordPending: true }));
  const unavailable = { ...a, view: { ...a.view, terminalEligible: false } };
  assert.equal(bidContextKey(unavailable), bidContextKey({ ...unavailable, wordPending: true }));
  assert.notEqual(bidContextKey(a), bidContextKey(unavailable));
});

test("authoritative own receipt changes invalidate within the same auction", () => {
  const a = fixture();
  const before = bidContextKey({ ...a, wordPending: true });
  const received = { ...a, rack: new Map([["A", 1]]), balance: 34,
    view: { ...a.view, score: 24 } };
  assert.notEqual(before, bidContextKey(received));
  assert.notEqual(bidContextKey(a), bidContextKey({ ...a, balance: 31 }));
  assert.notEqual(bidContextKey(a), bidContextKey({ ...a, view: { ...a.view, score: 21 } }));
  assert.notEqual(bidContextKey(a), bidContextKey({ ...a, rack: new Map([["A", 1], ["T", 1]]) }));
});

test("opponent-derived unseen information still invalidates", () => {
  const a = fixture();
  assert.notEqual(bidContextKey(a), bidContextKey({ ...a, view: { ...a.view,
    unseen: { total: 8, counts: { A: 2, T: 2, E: 4 } } } }));
  assert.notEqual(bidContextKey(a), bidContextKey({ ...a, view: { ...a.view,
    unseen: { total: 9, counts: { A: 2, T: 3, E: 4 } } } }));
});

test("ordering is canonical and auction identity remains distinct", () => {
  const a = fixture();
  assert.equal(bidContextKey(a), bidContextKey({ ...a, rack: new Map([["T", 1], ["A", 2]]),
    view: { ...a.view, unseen: { total: 9, counts: { E: 4, T: 2, A: 3 } } } }));
  assert.notEqual(bidContextKey(a), bidContextKey({ ...a, auction: { ...a.auction, id: 43n } }));
  assert.notEqual(bidContextKey(a), bidContextKey({ ...a, auction: { ...a.auction, letter: "N" } }));
});

test("pending-only update cannot request a second stochastic evaluation", () => {
  const a = fixture();
  let key = "", evaluations = 0;
  const select = (context: BidContext): number => {
    const next = bidContextKey(context);
    if (next !== key) { evaluations++; key = next; }
    return evaluations === 1 ? 16 : 7;
  };
  assert.equal(select(a), 16);
  assert.equal(select({ ...a, wordPending: true }), 16);
  assert.equal(evaluations, 1);
  assert.equal(select({ ...a, balance: 50, view: { ...a.view, score: 40 } }), 7);
  assert.equal(evaluations, 2);
});
