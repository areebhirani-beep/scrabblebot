/** Offline own-rack audit; reads local completed-match telemetry and runner status only. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FULL_BAG, WordEngine, rackKey, rackSize, type Candidate, type Rack } from '../src/engine.js';
import { wordlistPath } from '../src/brain.js';

type Row = Record<string, any>;
const BOT = 172;
const STARTING_BALANCE = 100;
const STARTING_TILES = 5;
const MIN_BAG_LEFT = 10;

function integer(value: unknown): number {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number)) throw new Error('invalid integer');
  return number;
}
function timestamp(value: unknown): number {
  if (Array.isArray(value) && value.length === 1) return integer(value[0]);
  throw new Error('invalid public timestamp');
}
function winner(value: unknown): number | undefined {
  if (Array.isArray(value) && value.length === 2) {
    if (value[0] === 0) return integer(value[1]);
    if (value[0] === 1 && (value[1] === null || Array.isArray(value[1]) && value[1].length === 0)) return undefined;
  }
  throw new Error('invalid winner option');
}
function letters(value: unknown, allowEmpty = false): string {
  if (typeof value !== 'string' || !(allowEmpty ? /^[A-Z]*$/ : /^[A-Z]+$/).test(value)) {
    throw new Error('invalid letters');
  }
  return value;
}
function bump(rack: Rack, word: string, amount: number): void {
  for (const letter of word) rack.set(letter, (rack.get(letter) ?? 0) + amount);
}
function validRack(rack: Rack): boolean {
  return [...rack].every(([letter, count]) => Number.isInteger(count) && count >= 0 && count <= FULL_BAG[letter]!);
}
function grouped(rows: Row[], key: string): Map<number, Row[]> {
  const result = new Map<number, Row[]>();
  for (const row of rows) {
    const id = integer(row[key]);
    const list = result.get(id) ?? [];
    list.push(row);
    result.set(id, list);
  }
  return result;
}

interface Event {
  at: number;
  id: number;
  kind: 'award' | 'play';
  letters: string;
  cashDelta: number;
  scoreDelta: number;
}
interface Search {
  candidates: Candidate[];
  complete: boolean;
}
interface Episode {
  matchId: number;
  sourceCommit?: string;
  reconstructedInitialRack: string;
  rack: string;
  balance: 8;
  firstRound: number;
  lastRound: number;
  firstAuctionId: number;
  lastAuctionId: number;
  bagLeftFirst: number;
  bagLeftLast: number;
  openings: number;
  missedAuctions: number;
  maximumConsecutiveMisses: number;
  wonAuctions: number;
  top3: Candidate[];
  bestFiveOrSix?: Candidate;
  sevenPlusAvailable: boolean;
  noSevenPlusProven: boolean;
  searchComplete: boolean;
}

function main(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const datasetPath = path.resolve(process.argv[2] ?? path.join(root, '../../docs/research/odysseus-public-followup.json'));
  const statusPath = path.resolve(process.argv[3] ?? path.join(root, '.runtime-odysseus/status.json'));
  const data = JSON.parse(fs.readFileSync(datasetPath, 'utf8')) as Row;
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8')) as Row;
  if (integer(data.botId) !== BOT || integer(status.botId) !== BOT || data.publicOnly !== true) {
    throw new Error('Audit is restricted to bot172 and public completed-match telemetry');
  }
  const local = new Map<number, Row>((status.completedLocalMatches as Row[]).map(match => [integer(match.id), match]));
  const auctionsByMatch = grouped(data.auctions, 'match_id');
  const resultsByMatch = grouped(data.results, 'match_id');
  const playsByMatch = grouped((data.plays as Row[]).filter(play => integer(play.bot_id) === BOT), 'match_id');
  const participantsByMatch = grouped(data.participants, 'match_id');
  const engine = WordEngine.fromFile(wordlistPath());
  const searches = new Map<string, Search>();
  const episodes: Episode[] = [];
  const rejected: { matchId: number; reason: string }[] = [];
  const validatedMatches: number[] = [];
  let missingLocalFinalRack = 0;
  let ambiguousOpeningTimestamps = 0;
  let cashEightOpenings = 0;
  let emptyCandidateOpenings = 0;
  let incompleteEmptySearchOpenings = 0;

  for (const match of data.matches as Row[]) {
    const id = integer(match.id);
    const record = local.get(id);
    if (!record || typeof record.unplayed !== 'string') { missingLocalFinalRack++; continue; }
    try {
      if (!Array.isArray(match.status) || match.status[0] !== 2 || integer(match.bag_total) !== 0) {
        throw new Error('match is not completed with an empty bag');
      }
      if (integer(match.starting_rack_size) !== STARTING_TILES) throw new Error('starting rack is not five tiles');
      const auctions = (auctionsByMatch.get(id) ?? []).slice().sort((a, b) =>
        timestamp(a.opens_at) - timestamp(b.opens_at) || integer(a.id) - integer(b.id));
      const results = resultsByMatch.get(id) ?? [];
      const plays = playsByMatch.get(id) ?? [];
      const participants = participantsByMatch.get(id) ?? [];
      const own = participants.filter(participant => integer(participant.bot_id) === BOT);
      if (own.length !== 1) throw new Error('missing or duplicate own participant');
      if (new Set(participants.map(participant => integer(participant.bot_id))).size !== participants.length) {
        throw new Error('duplicate participants');
      }
      const expectedAuctions = 98 - STARTING_TILES * participants.length;
      if (!auctions.length || auctions.length !== expectedAuctions || auctions.length !== integer(match.current_round)
        || results.length !== auctions.length || new Set(auctions.map(auction => integer(auction.id))).size !== auctions.length
        || new Set(results.map(result => integer(result.auction_id))).size !== results.length
        || new Set(plays.map(play => integer(play.id))).size !== plays.length) throw new Error('incomplete or duplicate history');
      const resultByAuction = new Map(results.map(result => [integer(result.auction_id), result]));
      const finalRack: Rack = new Map();
      bump(finalRack, letters(record.unplayed, true), 1);
      const initialRack = new Map(finalRack);
      const events: Event[] = [];
      for (const play of plays) {
        const word = letters(play.word);
        const reward = integer(play.total_reward);
        if (reward < 0) throw new Error('negative word reward');
        bump(initialRack, word, 1);
        events.push({ at: timestamp(play.played_at), id: integer(play.id), kind: 'play',
          letters: word, cashDelta: reward, scoreDelta: reward });
      }
      for (let index = 0; index < auctions.length; index++) {
        const auction = auctions[index]!;
        const result = resultByAuction.get(integer(auction.id));
        if (!result || letters(result.letter).length !== 1 || result.letter !== auction.letter
          || timestamp(result.closed_at) <= timestamp(auction.opens_at)
          || index + 1 < auctions.length && timestamp(result.closed_at) !== timestamp(auctions[index + 1]!.opens_at)) {
          throw new Error('inconsistent auction chronology');
        }
        const paid = integer(result.paid);
        if (paid < 0) throw new Error('negative auction payment');
        if (winner(result.winner_bot_id) === BOT) {
          bump(initialRack, result.letter, -1);
          events.push({ at: timestamp(result.closed_at), id: integer(result.auction_id), kind: 'award',
            letters: result.letter, cashDelta: -paid, scoreDelta: 0 });
        }
      }
      if (!validRack(initialRack) || rackSize(initialRack) !== STARTING_TILES) {
        throw new Error('own initial rack reconstruction is not five valid tiles');
      }
      events.sort((a, b) => a.at - b.at || (a.kind === b.kind ? a.id - b.id : a.kind === 'award' ? -1 : 1));
      const rack = new Map(initialRack);
      let cash = STARTING_BALANCE;
      let score = 0;
      let nextEvent = 0;
      const apply = (event: Event): void => {
        bump(rack, event.letters, event.kind === 'award' ? 1 : -1);
        cash += event.cashDelta;
        score += event.scoreDelta;
        if (cash < 0 || !validRack(rack)) throw new Error('replay consumed unavailable coins or letters');
      };
      const matchEpisodes: Episode[] = [];
      let active: Episode | undefined;
      let missStreak = 0;
      let matchAmbiguous = 0;
      let matchCashEight = 0;
      let matchEmpty = 0;
      let matchUnknown = 0;
      for (let index = 0; index < auctions.length; index++) {
        const auction = auctions[index]!;
        const opened = timestamp(auction.opens_at);
        let ambiguous = false;
        while (nextEvent < events.length && events[nextEvent]!.at <= opened) {
          const event = events[nextEvent++]!;
          if (event.kind === 'play' && event.at === opened) ambiguous = true;
          apply(event);
        }
        const bagLeft = auctions.length - index - 1;
        if (ambiguous) matchAmbiguous++;
        if (ambiguous || cash !== 8 || bagLeft < MIN_BAG_LEFT) { active = undefined; missStreak = 0; continue; }
        matchCashEight++;
        const key = rackKey(rack);
        let search = searches.get(key);
        if (!search) {
          const tracker = { operations: 0, exhausted: false };
          const candidates = engine.spellable(rack, 5, { budgetMs: 30, maxOperations: 150_000, tracker });
          search = { candidates, complete: !tracker.exhausted };
          searches.set(key, search);
        }
        if (search.candidates.length === 0) {
          if (search.complete) matchEmpty++; else matchUnknown++;
          active = undefined; missStreak = 0; continue;
        }
        if (!active || active.rack !== key || active.lastRound !== index) {
          const sevenPlus = search.candidates.some(candidate => candidate.word.length >= 7);
          active = { matchId: id, sourceCommit: record.commit, reconstructedInitialRack: rackKey(initialRack), rack: key,
            balance: 8, firstRound: index + 1, lastRound: index + 1,
            firstAuctionId: integer(auction.id), lastAuctionId: integer(auction.id), bagLeftFirst: bagLeft, bagLeftLast: bagLeft,
            openings: 0, missedAuctions: 0, maximumConsecutiveMisses: 0, wonAuctions: 0,
            top3: search.candidates.slice(0, 3),
            bestFiveOrSix: search.candidates.find(candidate => candidate.word.length <= 6),
            sevenPlusAvailable: sevenPlus, noSevenPlusProven: search.complete && !sevenPlus, searchComplete: search.complete };
          matchEpisodes.push(active);
          missStreak = 0;
        }
        active.lastRound = index + 1;
        active.lastAuctionId = integer(auction.id);
        active.bagLeftLast = bagLeft;
        active.openings++;
        if (winner(resultByAuction.get(integer(auction.id))!.winner_bot_id) === BOT) {
          active.wonAuctions++; missStreak = 0;
        } else {
          active.missedAuctions++; missStreak++;
          active.maximumConsecutiveMisses = Math.max(active.maximumConsecutiveMisses, missStreak);
        }
      }
      while (nextEvent < events.length) apply(events[nextEvent++]!);
      if (rackKey(rack) !== rackKey(finalRack) || cash !== integer(own[0]!.balance)
        || score !== integer(own[0]!.score) || score !== integer(record.score)) throw new Error('replay does not match final rack, cash and score');
      validatedMatches.push(id);
      episodes.push(...matchEpisodes);
      ambiguousOpeningTimestamps += matchAmbiguous;
      cashEightOpenings += matchCashEight;
      emptyCandidateOpenings += matchEmpty;
      incompleteEmptySearchOpenings += matchUnknown;
    } catch (error) {
      rejected.push({ matchId: id, reason: error instanceof Error ? error.message : 'invalid history' });
    }
  }
  episodes.sort((a, b) => b.maximumConsecutiveMisses - a.maximumConsecutiveMisses || a.matchId - b.matchId || a.firstRound - b.firstRound);
  console.log(JSON.stringify({
    botId: BOT, datasetPath, statusPath, collectedAt: data.collectedAt,
    criterion: 'At auction opening: own balance exactly 8, at least 10 tiles remain beyond the current tile, and a legal word of at least 5 letters exists.',
    reconstruction: 'Own final unplayed rack + own accepted words - own awarded auction tiles; require five valid starting tiles and exact final rack/cash/score replay.',
    validatedMatches, missingLocalFinalRack, rejected, ambiguousOpeningTimestamps,
    cashEightOpenings, emptyCandidateOpenings, incompleteEmptySearchOpenings,
    legalWordEpisodes: episodes.length,
    blockedFiveOrSixEpisodes: episodes.filter(episode => episode.noSevenPlusProven && episode.bestFiveOrSix).length,
    episodes,
    limitation: 'Observational diagnosis only. Equal-timestamp own plays at openings are excluded. An auction miss includes losses and abstentions; public data does not reveal our losing bid. This does not estimate the counterfactual rating benefit of earlier cashing.',
  }, null, 2));
}

try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : 'Cash-trap audit failed');
  process.exitCode = 1;
}
