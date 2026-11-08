/** Transport-independent action ordering for one match. No credentials or SDK state. */
export interface ActionSnapshot<View> {
  view: View;
  rack: ReadonlyMap<string, number>;
  balance: number;
  ownPlayCount: number;
  running: boolean;
  auction?: { id: bigint; letter: string; closesAtMs: number };
}
export interface ActionDecision<View> extends ActionSnapshot<View> {
  /** Time available before the closing safety margin, sampled before selection. */
  remainingMs: number;
  /** Selection may not assume inventory awaiting a word receipt is available. */
  wordPending: boolean;
}
export interface ActionClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
export interface ActionOptions<View> {
  selectWords(snapshot: ActionDecision<View>): readonly string[];
  selectBid(snapshot: ActionDecision<View>): number;
  transport: { word(word: string): Promise<void>; bid(auctionId: bigint, amount: number): Promise<void> };
  /** True only when the caller knows this operation did not commit. */
  isDefinitiveFailure(error: unknown): boolean;
  clock?: ActionClock;
  marginMs?: number;
  retryMs?: number;
  log?: (message: string) => void;
}
interface WordFlight { count: number; word: string; uncertain: boolean }
interface BidState { id: bigint; attempts: number; pending: boolean; accepted?: number; retryAt: number }

export class ActionState<View> {
  private readonly clock: ActionClock;
  private readonly marginMs: number;
  private readonly retryMs: number;
  private snapshot?: ActionSnapshot<View>;
  private connected = true;
  private stopped = false;
  private timer?: unknown;
  private due = Infinity;
  private word?: WordFlight;
  private wordGeneration = '';
  private wordAttempts = new Map<string, number>();
  private wordRetryAt = 0;
  private bid?: BidState;

  constructor(private readonly options: ActionOptions<View>) {
    this.clock = options.clock ?? { now: Date.now, setTimeout,
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };
    this.marginMs = Math.max(0, options.marginMs ?? 50);
    this.retryMs = Math.max(1, options.retryMs ?? 60);
  }

  update(snapshot: ActionSnapshot<View>): void {
    if (this.stopped) return;
    this.snapshot = { ...snapshot, rack: new Map(snapshot.rack),
      auction: snapshot.auction && { ...snapshot.auction } };
    if (!snapshot.running) { this.stop(); return; }
    // Receipt count is authoritative even when the call promise is still pending.
    // The cache already contains consumed inventory; never subtract it a second time.
    if (this.word && snapshot.ownPlayCount > this.word.count) this.word = undefined;
    const generation = `${snapshot.ownPlayCount}:${[...snapshot.rack]
      .filter(([, count]) => count > 0).sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, count]) => `${letter}${count}`).join(',')}`;
    if (generation !== this.wordGeneration) {
      this.wordGeneration = generation; this.wordAttempts.clear(); this.wordRetryAt = 0;
    }
    if (this.bid?.id !== snapshot.auction?.id) this.bid = undefined;
    this.request();
  }

  /**
   * Default replay behavior preserves an ambiguous word until a receipt arrives.
   * An explicit retry policy can release it after external reconciliation, sharing
   * the normal retry bound. A replay snapshot alone cannot promise exactly-once
   * execution: that requires a server idempotency key or ordering guarantee.
   */
  reconcile(snapshot: ActionSnapshot<View>, retryUncertain = false): void {
    this.update(snapshot);
    if (retryUncertain && this.word?.uncertain) { this.word = undefined; this.request(); }
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    if (!connected) this.cancelTimer();
    else this.request();
  }

  stop(): void {
    this.stopped = true; this.cancelTimer(); this.word = undefined;
    this.bid = undefined; this.wordAttempts.clear(); this.snapshot = undefined;
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined; this.due = Infinity;
  }
  private remaining(s: ActionSnapshot<View>): number {
    return s.auction ? s.auction.closesAtMs - this.clock.now() - this.marginMs : 0;
  }
  private eligible(): ActionSnapshot<View> | undefined {
    const s = this.snapshot;
    return !this.stopped && this.connected && s?.running && this.remaining(s) > 0 ? s : undefined;
  }
  private request(delay = 0): void {
    const s = this.eligible();
    if (!s || delay >= this.remaining(s)) return;
    const due = this.clock.now() + Math.max(0, delay);
    if (this.timer !== undefined && this.due <= due) return;
    this.cancelTimer(); this.due = due;
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined; this.due = Infinity; this.pump();
    }, Math.max(0, delay));
  }
  private pump(): void {
    if (!this.eligible()) return;
    try { this.tryWord(); } catch { this.options.log?.('Word selection failed'); }
    try { this.tryBid(); } catch { this.options.log?.('Bid selection failed'); }
  }
  private fits(rack: ReadonlyMap<string, number>, word: string): boolean {
    const used = new Map<string, number>();
    for (const letter of word) {
      const count = (used.get(letter) ?? 0) + 1;
      if (count > (rack.get(letter) ?? 0)) return false;
      used.set(letter, count);
    }
    return word.length >= 2;
  }
  private tryWord(): void {
    let s = this.eligible();
    if (!s || this.word) return;
    if (this.wordRetryAt > this.clock.now()) { this.request(this.wordRetryAt - this.clock.now()); return; }
    const words = this.options.selectWords({ ...s, remainingMs: this.remaining(s), wordPending: false });
    // Selection may use nearly all the available time; validate the deadline again.
    const latest = this.eligible();
    if (!latest || latest !== s) { if (latest) this.request(); return; }
    const word = words.find(candidate => this.fits(s.rack, candidate));
    if (!word) return;
    const attempts = this.wordAttempts.get(word) ?? 0;
    if (attempts >= 2) return;
    this.wordAttempts.set(word, attempts + 1);
    const pending: WordFlight = { count: s.ownPlayCount, word, uncertain: false };
    this.word = pending;
    Promise.resolve().then(() => {
      if (this.word !== pending) return;
      const current = this.eligible();
      if (!current || current !== s || !this.fits(current.rack, word)) {
        this.word = undefined; this.request(); return;
      }
      return this.options.transport.word(word);
    }).then(() => {
      // A successful call waits for the subscribed own-play receipt.
      if (this.word === pending) this.request();
    }).catch(error => {
      if (this.word !== pending || this.stopped) return;
      this.options.log?.('Word submission failed');
      if (this.options.isDefinitiveFailure(error)) {
        this.word = undefined;
        this.wordRetryAt = this.clock.now() + this.retryMs;
        if (attempts < 1) this.request(this.retryMs);
      } else pending.uncertain = true;
    });
  }
  private tryBid(): void {
    const s = this.eligible();
    if (!s?.auction) return;
    const state = this.bid ??= { id: s.auction.id, attempts: 0, pending: false, retryAt: 0 };
    if (state.pending || state.attempts >= 2) return;
    if (state.retryAt > this.clock.now()) { this.request(state.retryAt - this.clock.now()); return; }
    const proposed = this.options.selectBid({ ...s, remainingMs: this.remaining(s), wordPending: !!this.word });
    const current = this.eligible();
    if (!current || current !== s) { if (current) this.request(); return; }
    const amount = Number.isFinite(proposed) ? Math.max(0, Math.min(Math.floor(proposed), Math.floor(s.balance))) : 0;
    if (state.accepted === amount || (!amount && state.accepted === undefined)) return;
    state.attempts++; state.pending = true;
    Promise.resolve().then(() => {
      const latest = this.eligible();
      if (!latest?.auction || latest.auction.id !== state.id || this.bid !== state) { state.pending = false; return; }
      const sentAmount = Math.max(0, Math.min(amount, Math.floor(latest.balance)));
      return this.options.transport.bid(state.id, sentAmount).then(() => { state.accepted = sentAmount; });
    }).then(() => {
      state.pending = false;
      // A word may have raised the balance while the bid was in flight.
      this.request();
    }).catch(error => {
      state.pending = false;
      const detail = error instanceof Error ? error.message.toLowerCase() : '';
      const category = /clos|expired|late/.test(detail) ? 'deadline' : /balance|afford|insufficient/.test(detail) ? 'balance' : this.options.isDefinitiveFailure(error) ? 'rejected' : 'transport';
      this.options.log?.(`Bid submission failed (${category})`);
      state.retryAt = this.clock.now() + this.retryMs;
      if (state.attempts < 2) this.request(this.retryMs);
    });
  }
}
