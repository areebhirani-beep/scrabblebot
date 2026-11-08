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
/** Diagnostics only. A bid_ack confirms reducer submission, never auction victory. */
export interface ActionTelemetry {
  event: 'bid_selection' | 'bid_sent' | 'bid_ack' | 'bid_rejected' |
    'word_sent' | 'word_ack' | 'word_receipt' | 'word_rejected';
  clockMs: number;
  outcome: 'selected' | 'dispatch_attempted' | 'submission_confirmed' |
    'receipt_observed' | 'unknown' | 'rejected' | 'local_not_sent';
  auctionId?: string;
  amount?: number;
  remainingMs?: number;
  selectionDurationMs?: number;
  /** Candidate ordinal at selection; actual reserved attempt on sent/ack/rejection. */
  attempt?: number;
  stage?: 'selection' | 'local' | 'submission' | 'receipt';
  reason?: string;
  word?: string;
  ownPlayCount?: number;
  sequence?: number;
  elapsedSinceSendMs?: number;
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
  /** Optional bounded diagnostics; callback errors never propagate into decisions. */
  telemetry?: (event: ActionTelemetry) => void;
}
interface WordFlight { count: number; word: string; uncertain: boolean; sequence: number;
  auctionId?: string; sentAt?: number; receiptCount?: number }
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
  private wordSequence = 0;
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
    if (this.word && snapshot.ownPlayCount > this.word.count) {
      const pending = this.word;
      pending.receiptCount = snapshot.ownPlayCount;
      this.trace({ event: 'word_receipt', stage: 'receipt', outcome: 'receipt_observed', word: pending.word,
        sequence: pending.sequence, auctionId: pending.auctionId, ownPlayCount: snapshot.ownPlayCount,
        elapsedSinceSendMs: pending.sentAt === undefined ? undefined : this.clock.now() - pending.sentAt });
    }
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
  private trace(event: Omit<ActionTelemetry, 'clockMs'>): void {
    if (!this.options.telemetry) return;
    try { this.options.telemetry({ ...event, clockMs: this.clock.now() }); } catch { /* diagnostics cannot fail actions */ }
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
    const pending: WordFlight = { count: s.ownPlayCount, word, uncertain: false,
      sequence: ++this.wordSequence, auctionId: s.auction && String(s.auction.id) };
    this.word = pending;
    // Begin transport before pump's synchronous bid search. An async wrapper
    // still turns synchronous transport throws into the handled rejection path.
    (async () => {
      if (this.word !== pending) return;
      const current = this.eligible();
      if (!current || current !== s || !this.fits(current.rack, word)) {
        this.word = undefined; this.request(); return;
      }
      pending.sentAt = this.clock.now();
      this.trace({ event: 'word_sent', stage: 'submission', outcome: 'dispatch_attempted', word, sequence: pending.sequence,
        auctionId: pending.auctionId, ownPlayCount: pending.count, attempt: attempts + 1,
        remainingMs: this.remaining(current) });
      return this.options.transport.word(word);
    })().then(() => {
      if (pending.sentAt !== undefined) this.trace({ event: 'word_ack', stage: 'submission', outcome: 'submission_confirmed', word,
        sequence: pending.sequence, auctionId: pending.auctionId, ownPlayCount: pending.count,
        reason: 'submission_confirmed_not_inventory_receipt',
        elapsedSinceSendMs: this.clock.now() - pending.sentAt });
      // A successful call waits for the subscribed own-play receipt.
      if (this.word === pending) this.request();
    }).catch(error => {
      const currentFlight = this.word === pending && !this.stopped;
      // Preserve the existing classifier invocation for a current pending word,
      // reuse its result, and never downgrade an authoritative observed receipt.
      const definitive = currentFlight ? this.options.isDefinitiveFailure(error) : false;
      const observed = pending.receiptCount !== undefined;
      if (pending.sentAt !== undefined) this.trace({ event: 'word_rejected', stage: 'submission',
        outcome: observed ? 'receipt_observed' : definitive ? 'rejected' : 'unknown', word,
        sequence: pending.sequence, auctionId: pending.auctionId, ownPlayCount: pending.receiptCount ?? pending.count,
        reason: observed ? 'failure_after_receipt' : definitive ? 'definitive_submission_failure' : 'transport_unconfirmed',
        elapsedSinceSendMs: this.clock.now() - pending.sentAt });
      if (!currentFlight) return;
      this.options.log?.('Word submission failed');
      if (definitive) {
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
    const selectionStarted = this.clock.now();
    let proposed: number;
    try { proposed = this.options.selectBid({ ...s, remainingMs: this.remaining(s), wordPending: !!this.word }); }
    catch (error) {
      this.trace({ event: 'bid_rejected', stage: 'selection', outcome: 'local_not_sent', auctionId: String(s.auction.id),
        attempt: state.attempts + 1, selectionDurationMs: this.clock.now() - selectionStarted,
        remainingMs: this.remaining(s), reason: 'selection_failed' });
      throw error;
    }
    const selectionDurationMs = this.clock.now() - selectionStarted;
    const amount = Number.isFinite(proposed) ? Math.max(0, Math.min(Math.floor(proposed), Math.floor(s.balance))) : 0;
    this.trace({ event: 'bid_selection', stage: 'selection', outcome: 'selected', auctionId: String(s.auction.id), amount,
      selectionDurationMs, remainingMs: this.remaining(s), attempt: state.attempts + 1 });
    const current = this.eligible();
    if (!current || current !== s) {
      this.trace({ event: 'bid_rejected', stage: 'local', outcome: 'local_not_sent', auctionId: String(s.auction.id), amount,
        selectionDurationMs, remainingMs: this.remaining(s), attempt: state.attempts + 1,
        reason: !current ? 'ineligible_after_selection' : 'stale_selection' });
      if (current) this.request(); return;
    }
    if (state.accepted === amount || (!amount && state.accepted === undefined)) return;
    state.attempts++; state.pending = true;
    const attempt = state.attempts;
    let sentAt: number | undefined, submittedAmount: number | undefined;
    Promise.resolve().then(() => {
      const latest = this.eligible();
      if (!latest?.auction || latest.auction.id !== state.id || this.bid !== state) {
        this.trace({ event: 'bid_rejected', stage: 'local', outcome: 'local_not_sent', auctionId: String(state.id), amount,
          attempt, selectionDurationMs, remainingMs: this.remaining(s), reason: 'ineligible_before_send' });
        state.pending = false; return;
      }
      const sentAmount = Math.max(0, Math.min(amount, Math.floor(latest.balance)));
      sentAt = this.clock.now(); submittedAmount = sentAmount;
      this.trace({ event: 'bid_sent', stage: 'submission', outcome: 'dispatch_attempted', auctionId: String(state.id), amount: sentAmount,
        attempt, selectionDurationMs, remainingMs: this.remaining(latest) });
      return this.options.transport.bid(state.id, sentAmount).then(() => {
        state.accepted = sentAmount;
        this.trace({ event: 'bid_ack', stage: 'submission', outcome: 'submission_confirmed', auctionId: String(state.id), amount: sentAmount,
          attempt, selectionDurationMs, remainingMs: this.remaining(s),
          elapsedSinceSendMs: this.clock.now() - sentAt!, reason: 'submission_confirmed_not_auction_result' });
      });
    }).then(() => {
      state.pending = false;
      // A word may have raised the balance while the bid was in flight.
      this.request();
    }).catch(error => {
      state.pending = false;
      const detail = error instanceof Error ? error.message.toLowerCase() : '';
      const definitive = this.options.isDefinitiveFailure(error);
      const category = /clos|expired|late/.test(detail) ? 'deadline' : /balance|afford|insufficient/.test(detail) ? 'balance' : definitive ? 'rejected' : 'transport';
      this.trace({ event: 'bid_rejected', stage: 'submission',
        outcome: sentAt === undefined ? 'local_not_sent' : definitive ? 'rejected' : 'unknown', auctionId: String(state.id),
        amount: submittedAmount ?? amount, attempt, selectionDurationMs, remainingMs: this.remaining(s),
        elapsedSinceSendMs: sentAt === undefined ? undefined : this.clock.now() - sentAt, reason: category });
      this.options.log?.(`Bid submission failed (${category})`);
      state.retryAt = this.clock.now() + this.retryMs;
      if (state.attempts < 2) this.request(this.retryMs);
    });
  }
}
