"""Public completed-match calibration; importing performs no network requests.

Usage: python3 -I tools/fetch_market.py FIRST_MATCH LAST_MATCH OUT.json
Only completed six-seat Vickrey matches containing our bot are retained.
"""
import collections
import json
import sys
import urllib.request

URL = "https://maincloud.spacetimedb.com/v1/database/scrabblebot/sql"


def _integer(value):
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValueError("Expected integer")
    return int(value)


def decode_option(value):
    """Decode SQL SATS Option (Some=0, None=1), rejecting malformed values."""
    if value is None:
        return None
    if isinstance(value, list) and len(value) == 2:
        if value[0] == 0:
            return _integer(value[1])
        if value[0] == 1 and value[1] in (None, []):
            return None
    if isinstance(value, dict):
        if set(value) == {"some"}:
            return _integer(value["some"])
        if set(value) == {"none"} and value["none"] in (None, []):
            return None
        if value.get("tag") == "Some" and "value" in value:
            return _integer(value["value"])
        if value.get("tag") == "None":
            return None
    raise ValueError("Malformed SQL Option")


def _enum_is(value, name, index):
    if isinstance(value, str):
        return value == name
    if isinstance(value, dict):
        return value.get("tag") == name or set(value) == {name}
    return isinstance(value, list) and len(value) == 2 and value[0] == index and value[1] in (None, [])


def build_market_rows(participants, results, archive, matches, simulated_ids=(), our_bot_id=172):
    """Pure builder. Invalid/incomplete matches are excluded as entire blocks.

    Match rows need id/status/bag_total/current_round/auction_type. Existing
    simulator fields are retained; cmaxLo/cmaxHi record identifiable bounds.
    Our reserve-price win reveals rival max in [0,1], not an exact bid of 1.
    cmax uses the conservative upper endpoint for old sampler compatibility.
    """
    by_parts, by_results = collections.defaultdict(list), collections.defaultdict(list)
    for p in participants:
        by_parts[_integer(p["match_id"])].append(p)
    for r in results:
        by_results[_integer(r["match_id"])].append(r)
    top, duplicate_archive = {}, set()
    for row in archive:
        auction = _integer(row["auction_id"])
        if auction in top:
            duplicate_archive.add(auction)
        top[auction] = _integer(row["top_bid"])
    simulated_ids = {_integer(bot) for bot in simulated_ids}
    our_bot_id = _integer(our_bot_id)
    output = []
    match_counts = collections.Counter(_integer(m["id"]) for m in matches)
    for match in sorted(matches, key=lambda m: _integer(m["id"])):
        try:
            mid = _integer(match["id"])
            if match_counts[mid] != 1 or not _enum_is(match["status"], "Ended", 2):
                continue
            if _integer(match["bag_total"]) != 0 or not _enum_is(match["auction_type"], "Vickrey", 1):
                continue
            parts = by_parts[mid]
            bots = [_integer(p["bot_id"]) for p in parts]
            if len(bots) != 6 or len(set(bots)) != 6 or our_bot_id not in bots:
                continue
            if len(set(bots) & simulated_ids) > 1:
                continue
            scores = {_integer(p["bot_id"]): _integer(p["score"]) for p in parts}
            if any(score < 0 for score in scores.values()):
                continue
            rs = sorted(by_results[mid], key=lambda r: _integer(r["auction_id"]))
            if not rs or len(rs) != _integer(match["current_round"]):
                continue
            ids = [_integer(r["auction_id"]) for r in rs]
            if len(set(ids)) != len(ids):
                continue
            best_other = max(score for bot, score in scores.items() if bot != our_bot_id)
            block = []
            for i, row in enumerate(rs):
                auction, paid = _integer(row["auction_id"]), _integer(row["paid"])
                winner, letter = decode_option(row["winner_bot_id"]), row["letter"]
                if not isinstance(letter, str) or len(letter) != 1 or not "A" <= letter <= "Z":
                    raise ValueError("Invalid auction letter")
                if auction in duplicate_archive:
                    raise ValueError("Duplicate archival auction")
                if winner is None:
                    if paid != 0 or top.get(auction, 0) != 0:
                        raise ValueError("Unsold auction has positive price")
                    lo = hi = archived = 0
                else:
                    if winner not in scores or paid < 1 or auction not in top:
                        raise ValueError("Positive sale lacks valid archived maximum")
                    archived = top[auction]
                    if archived < paid:
                        raise ValueError("Archived maximum below paid price")
                    if winner == our_bot_id:
                        lo, hi = (0, 1) if paid == 1 else (paid, paid)
                    else:
                        lo = hi = archived
                block.append({"m": mid, "i": i, "n": len(rs), "l": letter,
                              "paid": paid, "top": archived, "w": winner,
                              "cmax": hi, "cmaxLo": lo, "cmaxHi": hi,
                              "bestOther": best_other, "us": True})
            output.extend(block)
        except (KeyError, TypeError, ValueError):
            # Do not silently patch individual missing prices or shift quarters.
            continue
    return output


def q(sql):
    request = urllib.request.Request(URL, data=sql.encode(), method="POST")
    with urllib.request.urlopen(request, timeout=120) as response:
        tables = json.load(response)
    output = []
    for table in tables:
        columns = []
        for element in table["schema"]["elements"]:
            name = element["name"]
            if isinstance(name, dict):
                name = name.get("some")
            elif isinstance(name, list) and len(name) == 2 and name[0] == 0:
                name = name[1]
            if not isinstance(name, str):
                raise ValueError("Unnamed SQL result column")
            columns.append(name)
        for row in table["rows"]:
            if len(row) != len(columns):
                raise ValueError("SQL row/schema width mismatch")
            output.append(dict(zip(columns, row)))
    return output


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 3:
        raise SystemExit("usage: fetch_market.py FIRST_MATCH LAST_MATCH OUT.json")
    first, last = int(args[0]), int(args[1])
    if first < 0 or last < first:
        raise SystemExit("Invalid inclusive match range")
    simulated = {r["id"] for r in q("SELECT id, is_simulated FROM bot") if r["is_simulated"]}
    output = []
    for lo in range(first, last + 1, 100):
        hi = min(last, lo + 99)
        clause = f"match_id >= {lo} AND match_id <= {hi}"
        matches = q(f"SELECT * FROM match_state WHERE id >= {lo} AND id <= {hi}")
        parts = q(f"SELECT match_id, bot_id, score FROM match_participant WHERE {clause}")
        results = q(f"SELECT auction_id, match_id, letter, winner_bot_id, paid FROM auction_result WHERE {clause}")
        archive = q(f"SELECT auction_id, top_bid FROM auction_top_bid_archive WHERE {clause}")
        output.extend(build_market_rows(parts, results, archive, matches, simulated))
        print(f"{lo}-{hi}: {len(output)} valid auctions so far", file=sys.stderr)
    with open(args[2], "w", encoding="utf8") as destination:
        json.dump(output, destination)


if __name__ == "__main__":
    main()
