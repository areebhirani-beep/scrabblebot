// Word engine: finds every dictionary word a rack can spell, fast.
//
// Every word is filed under its letters in sorted order ("RATES" -> "AERST").
// Anagrams score the same here (score depends only on the letters and the
// length), so one entry per sorted key is enough. To find what a rack can
// spell, walk every sub-multiset of the rack and look its key up. A 15-tile
// rack has at most 2^15 sub-multisets, which takes a few milliseconds.

import * as fs from "node:fs";

export const LETTER_VALUE: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

// Standard bag, no blanks, 98 tiles.
export const FULL_BAG: Record<string, number> = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4,
  M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1,
  Y: 2, Z: 1,
};

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Reward the module pays for a word: face value times the length multiplier,
// rounded down (the module does integer division).
export function reward(word: string): number {
  let base = 0;
  for (const c of word) base += LETTER_VALUE[c] ?? 0;
  const n = word.length;
  if (n <= 3) return base;
  if (n === 4) return Math.floor((base * 3) / 2);
  if (n === 5) return base * 2;
  if (n === 6) return Math.floor((base * 5) / 2);
  return base * 3;
}

export type Rack = Map<string, number>;

export function rackSize(rack: Rack): number {
  let n = 0;
  for (const v of rack.values()) n += v;
  return n;
}

export function rackKey(rack: Rack): string {
  let s = "";
  for (const c of ALPHA) {
    const n = rack.get(c) ?? 0;
    for (let i = 0; i < n; i++) s += c;
  }
  return s;
}

export function minus(rack: Rack, word: string): Rack {
  const out = new Map(rack);
  for (const c of word) {
    const n = (out.get(c) ?? 0) - 1;
    if (n <= 0) out.delete(c);
    else out.set(c, n);
  }
  return out;
}

export function plus(rack: Rack, letter: string): Rack {
  const out = new Map(rack);
  out.set(letter, (out.get(letter) ?? 0) + 1);
  return out;
}

export interface Candidate {
  word: string;
  score: number;
}

export interface SearchBudget {
  budgetMs?: number;
  maxOperations?: number;
  now?: () => number;
  deadlineMs?: number;
  tracker?: { operations: number; exhausted: boolean };
}

// A shared tracker/deadline keeps nested searches inside the original budget.
function searchLimit(options: SearchBudget, defaultMs: number) {
  const now = options.now ?? (() => performance.now());
  const deadline = options.deadlineMs ?? now() + (options.budgetMs ?? defaultMs);
  const tracker = options.tracker ?? { operations: 0, exhausted: false };
  const maxOperations = options.maxOperations ?? 150_000;
  return { tracker, check: () => {
    if (tracker.exhausted) return false;
    if (tracker.operations >= maxOperations || now() >= deadline) {
      tracker.exhausted = true;
      return false;
    }
    tracker.operations++;
    return true;
  } };
}

export class WordEngine {
  // sorted letters -> one real word with exactly those letters
  private byKey = new Map<string, string>();

  constructor(words: Iterable<string>) {
    for (const raw of words) {
      const w = raw.trim().toUpperCase();
      if (w.length < 2 || !/^[A-Z]+$/.test(w)) continue;
      const key = [...w].sort().join("");
      if (!this.byKey.has(key)) this.byKey.set(key, w);
    }
  }

  static fromFile(path: string): WordEngine {
    return new WordEngine(fs.readFileSync(path, "utf8").split("\n"));
  }

  get size(): number {
    return this.byKey.size;
  }

  // Every distinct word (one per letter set) the rack can spell, with at
  // least `minLen` letters.
  spellable(rack: Rack, minLen = 2, budget: SearchBudget = {}): Candidate[] {
    return this.enumerate(rack, minLen, searchLimit(budget, 8));
  }

  private enumerate(rack: Rack, minLen: number, limit: ReturnType<typeof searchLimit>): Candidate[] {
    const letters: string[] = [];
    const counts: number[] = [];
    for (const c of ALPHA) {
      const n = rack.get(c) ?? 0;
      if (n > 0) {
        letters.push(c);
        counts.push(n);
      }
    }
    const out: Candidate[] = [];
    const walk = (i: number, key: string) => {
      if (!limit.check()) return;
      if (i === letters.length) {
        if (key.length >= minLen) {
          const w = this.byKey.get(key);
          if (w) out.push({ word: w, score: reward(w) });
        }
        return;
      }
      let k = key;
      for (let take = 0; take <= counts[i]!; take++) {
        walk(i + 1, k);
        if (limit.tracker.exhausted) break;
        k += letters[i];
      }
    };
    walk(0, "");
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  // The best set of words to play from this rack right now, all at once.
  // Tries the top few words first and recurses on what's left, so it finds
  // splits like one 7-letter word plus a 3-letter word.
  bestPlayout(rack: Rack, beam = 12, depth = 4, budget: SearchBudget = {}): { words: string[]; score: number; exact: boolean } {
    const limit = searchLimit(budget, 30);
    let exact = true;
    const memo = new Map<string, { words: string[]; score: number }>();
    const go = (r: Rack, d: number): { words: string[]; score: number } => {
      if (!limit.check()) return { words: [], score: 0 };
      const key = rackKey(r) + "|" + d;
      const hit = memo.get(key);
      if (hit) return hit;
      let best = { words: [] as string[], score: 0 };
      if (d > 0) {
        const all = this.enumerate(r, 2, limit);
        if (all.length > beam) exact = false;
        const cands = all.slice(0, beam);
        for (const c of cands) {
          const rest = go(minus(r, c.word), d - 1);
          const total = c.score + rest.score;
          if (total > best.score) best = { words: [c.word, ...rest.words], score: total };
          if (limit.tracker.exhausted) break;
        }
      } else if (rackSize(r) >= 2) exact = false;
      memo.set(key, best);
      return best;
    };
    const result = go(rack, depth);
    return { ...result, exact: exact && !limit.tracker.exhausted };
  }
}

// ---------- Fast evaluator for Monte Carlo ----------
//
// Monte Carlo needs hundreds of rack evaluations per auction, so this one
// trades a little accuracy for speed: greedy picks from words indexed by
// their 26-bit letter masks. Small racks visit only submasks they contain;
// wider racks scan the original score-ordered list. Both paths preserve the
// same score ordering and original dictionary order when scores tie.

interface Entry { mask: number; len: number; counts: Uint8Array; score: number; word: string }

export class FastEval {
  private entries: Entry[] = [];
  private entriesByMask = new Map<number, number[]>();

  constructor(words: Iterable<string>, minLen = 2) {
    const seen = new Set<string>();
    for (const raw of words) {
      const w = raw.trim().toUpperCase();
      if (w.length < minLen || !/^[A-Z]+$/.test(w)) continue;
      const key = [...w].sort().join("");
      if (seen.has(key)) continue;
      seen.add(key);
      const counts = new Uint8Array(26);
      let mask = 0;
      for (const c of w) { const i = c.charCodeAt(0) - 65; counts[i]!++; mask |= 1 << i; }
      this.entries.push({ mask, len: w.length, counts, score: reward(w), word: w });
    }
    // best scores first, so the scan can stop early
    this.entries.sort((a, b) => b.score - a.score);
    for (let rank = 0; rank < this.entries.length; rank++) {
      const mask = this.entries[rank]!.mask;
      const bucket = this.entriesByMask.get(mask);
      if (bucket) bucket.push(rank);
      else this.entriesByMask.set(mask, [rank]);
    }
  }

  static fromFile(path: string): FastEval {
    return new FastEval(fs.readFileSync(path, "utf8").split("\n"));
  }

  // counts: 26 letter counts (modified in place). Returns total score of the
  // greedy split and fills `words` if given.
  evalCounts(counts: Uint8Array, maxWords = 3, words?: string[], budget: SearchBudget = {}): number {
    const limit = searchLimit(budget, 8);
    let total = 0;
    for (let k = 0; k < maxWords; k++) {
      if (!limit.check()) break;
      let mask = 0, n = 0, distinct = 0;
      for (let i = 0; i < 26; i++) if (counts[i]! > 0) { mask |= 1 << i; n += counts[i]!; distinct++; }
      if (n < 2) break;
      let found: Entry | undefined;
      if (distinct <= 12) {
        let bestRank = this.entries.length;
        for (let submask = mask; submask !== 0; submask = (submask - 1) & mask) {
          if (!limit.check()) break;
          const bucket = this.entriesByMask.get(submask);
          if (!bucket) continue;
          // Ranks are ascending inside each bucket. Once a rank cannot beat
          // the incumbent, neither can any later member of this bucket.
          for (const rank of bucket) {
            if (rank >= bestRank) break;
            if (!limit.check()) break;
            const entry = this.entries[rank]!;
            if (entry.len > n) continue;
            let fits = true;
            for (let i = 0; i < 26; i++) {
              if (entry.counts[i]! > counts[i]!) { fits = false; break; }
            }
            if (fits) { found = entry; bestRank = rank; break; }
          }
          if (limit.tracker.exhausted || bestRank === 0) break;
        }
        // A partially visited index has not proved which word the canonical
        // greedy scan would choose. Discard this pick instead of changing it.
        if (limit.tracker.exhausted) break;
      } else {
        for (const e of this.entries) {
          if (!limit.check()) break;
          if (e.len > n || (e.mask & ~mask) !== 0) continue;
          let ok = true;
          for (let i = 0; i < 26; i++) if (e.counts[i]! > counts[i]!) { ok = false; break; }
          if (ok) { found = e; break; }
        }
      }
      if (!found) break;
      for (let i = 0; i < 26; i++) counts[i]! -= found.counts[i]!;
      total += found.score;
      words?.push(found.word);
    }
    return total;
  }
}

export function toCounts(rack: Rack): Uint8Array {
  const c = new Uint8Array(26);
  for (const [l, n] of rack) c[l.charCodeAt(0) - 65] = n;
  return c;
}
