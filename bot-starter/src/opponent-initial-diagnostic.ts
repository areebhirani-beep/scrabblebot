/** Offline diagnostic only. No production tracker imports this module.
 *
 * For each opponent/letter and every complete public prefix t, inventory
 * conservation gives initial >= played(t) - awarded(t). The maximum of these
 * deficits remains valid after later awards, unlike the current deficit alone.
 * Initial tiles are unavailable to future auctions, but awards must NOT be
 * subtracted again: buildUnseen already removes every public auction tile.
 */
import { FULL_BAG } from './engine.js';

export type PublicInitialEvent =
  | { kind: 'award'; id: string; at: bigint; botId: bigint; letter: string }
  | { kind: 'word'; id: string; at: bigint; botId: bigint; word: string };

export interface InitialHistoryEvidence {
  myBotId: bigint;
  /** Caller attests all awards AND accepted words from match start are present.
   * Neither callback order nor a latest timestamp proves this. Use a completed,
   * consistent public archive; this helper cannot detect an omitted award.
   */
  completeFromStart: boolean;
  /** Inclusive settled timestamp. Later, potentially incomplete events ignored. */
  completeThrough: bigint;
  initialRackSize?: number;
}

export interface InitialInference {
  usable: boolean;
  reason?: string;
  /** Initial-tile lower bounds only, not current rack or a full inferred deal. */
  lowerBounds: Map<bigint, Map<string, number>>;
}

export function inferOpponentInitialTiles(
  events: readonly PublicInitialEvent[], evidence: InitialHistoryEvidence,
): InitialInference {
  const fail = (reason: string): InitialInference => ({ usable: false, reason, lowerBounds: new Map() });
  if (!evidence.completeFromStart) return fail('Complete public history from match start is required');
  if (evidence.completeThrough < 0n) return fail('Invalid settled cutoff');
  const rackSize = evidence.initialRackSize ?? 5;
  if (!Number.isSafeInteger(rackSize) || rackSize < 0) return fail('Invalid initial rack size');
  const unique = new Map<string, PublicInitialEvent>();
  for (const event of events) {
    if (event.at > evidence.completeThrough) continue;
    if (event.at < 0n || !event.id) return fail('Invalid event timestamp or ID');
    const value = event.kind === 'award' ? event.letter : event.word;
    if (!(event.kind === 'award' ? /^[A-Z]$/ : /^[A-Z]{2,}$/).test(value))
      return fail('Invalid public letter or accepted word');
    const key = `${event.kind}:${event.id}`;
    const old = unique.get(key);
    if (old) {
      const oldValue = old.kind === 'award' ? old.letter : old.word;
      if (old.at !== event.at || old.botId !== event.botId || oldValue !== value)
        return fail('Conflicting duplicate public event');
    } else unique.set(key, event);
  }
  // Timestamp ties can combine separate transactions. Awarding every tied tile
  // first is conservative: it may weaken a bound, never invent an initial tile.
  const ordered = [...unique.values()].sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1
    : a.kind === b.kind ? 0 : a.kind === 'award' ? -1 : 1);
  const net = new Map<bigint, Map<string, number>>();
  const lowerBounds = new Map<bigint, Map<string, number>>();
  for (const event of ordered) {
    if (event.botId === evidence.myBotId) continue;
    let counts = net.get(event.botId);
    let bound = lowerBounds.get(event.botId);
    if (!counts) { counts = new Map(); net.set(event.botId, counts); }
    if (!bound) { bound = new Map(); lowerBounds.set(event.botId, bound); }
    const letters = event.kind === 'award' ? event.letter : event.word;
    for (const letter of letters) {
      const next = (counts.get(letter) ?? 0) + (event.kind === 'word' ? 1 : -1);
      counts.set(letter, next);
      if (next > (bound.get(letter) ?? 0)) bound.set(letter, next);
    }
    if ([...bound.values()].reduce((sum, n) => sum + n, 0) > rackSize)
      return fail('Public history requires more initial tiles than the deal allows');
  }
  const totalKnown = new Map<string, number>();
  for (const bound of lowerBounds.values()) for (const [letter, n] of bound) {
    const total = (totalKnown.get(letter) ?? 0) + n;
    totalKnown.set(letter, total);
    if (total > (FULL_BAG[letter] ?? 0)) return fail('Initial lower bounds exceed the bag');
  }
  return { usable: true, lowerBounds };
}
