// Rebuilds what a bot can legally know about a match from public tables.
//
// Seen tiles:
//   - every letter put up for auction in this match (public `auction` rows,
//     including the one on the block right now)
//   - my own 5 starting tiles (I hold them, or played them)
//   - opponents' starting tiles they have revealed by playing them: for each
//     opponent and letter, max(0, letters played - letters won at auction)
// Unseen = full bag - seen. That is the pool future auctions are drawn from
// (plus opponents' still-hidden starting tiles, which we can't separate).

import { FULL_BAG } from "./engine.js";
import type { Unseen } from "./montecarlo.js";

export interface PublicMatch {
  auctionLetters: string[]; // every auctioned letter in the match so far
  results: { letter: string; winner?: bigint }[]; // closed auctions
  plays: { botId: bigint; word: string }[]; // every word played in the match
  myBotId: bigint;
  myRack: Map<string, number>;
}

function bump(m: Map<string, number>, k: string, n = 1) {
  m.set(k, (m.get(k) ?? 0) + n);
}

export function buildUnseen(pm: PublicMatch): Unseen {
  const seen = new Map<string, number>();
  for (const l of pm.auctionLetters) bump(seen, l);

  // letters won and played, per bot
  const won = new Map<string, Map<string, number>>();
  const played = new Map<string, Map<string, number>>();
  for (const r of pm.results) {
    if (r.winner === undefined) continue;
    const k = String(r.winner);
    if (!won.has(k)) won.set(k, new Map());
    bump(won.get(k)!, r.letter);
  }
  for (const p of pm.plays) {
    const k = String(p.botId);
    if (!played.has(k)) played.set(k, new Map());
    for (const c of p.word) bump(played.get(k)!, c);
  }

  const me = String(pm.myBotId);
  // My starting tiles = rack + played - won (per letter, never negative).
  const myWon = won.get(me) ?? new Map();
  const myPlayed = played.get(me) ?? new Map();
  for (const c of Object.keys(FULL_BAG)) {
    const start = (pm.myRack.get(c) ?? 0) + (myPlayed.get(c) ?? 0) - (myWon.get(c) ?? 0);
    if (start > 0) bump(seen, c, start);
  }
  // Opponents' revealed starting tiles.
  for (const [bot, pl] of played) {
    if (bot === me) continue;
    const w = won.get(bot) ?? new Map();
    for (const [c, n] of pl) {
      const extra = n - (w.get(c) ?? 0);
      if (extra > 0) bump(seen, c, extra);
    }
  }

  const counts: Record<string, number> = {};
  let total = 0;
  for (const [c, n] of Object.entries(FULL_BAG)) {
    const rem = n - (seen.get(c) ?? 0);
    if (rem > 0) {
      counts[c] = rem;
      total += rem;
    }
  }
  return { counts, total };
}
