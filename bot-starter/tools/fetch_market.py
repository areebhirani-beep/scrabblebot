# Pull live auction history (public tables) into market.json for the market simulator.
# usage: python3 -I fetch_market.py <first_match> <last_match> <out.json>
import json, sys, urllib.request, collections
URL = "https://maincloud.spacetimedb.com/v1/database/scrabblebot/sql"
def q(sql):
    d = json.load(urllib.request.urlopen(urllib.request.Request(URL, data=sql.encode(), method="POST"), timeout=120))
    out = []
    for t in d:
        cols = [e["name"].get("some", "?") for e in t["schema"]["elements"]]
        out += [dict(zip(cols, r)) for r in t["rows"]]
    return out
a, b, outp = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
sim = {r["id"] for r in q("SELECT id, is_simulated FROM bot") if r["is_simulated"]}
rows = []
step = 100
for lo in range(a, b + 1, step):
    hi = min(b, lo + step - 1)
    parts = q(f"SELECT match_id, bot_id, score FROM match_participant WHERE match_id >= {lo} AND match_id <= {hi}")
    res = q(f"SELECT auction_id, match_id, letter, winner_bot_id, paid FROM auction_result WHERE match_id >= {lo} AND match_id <= {hi}")
    top = {r["auction_id"]: r["top_bid"] for r in q(f"SELECT auction_id, top_bid FROM auction_top_bid_archive WHERE match_id >= {lo} AND match_id <= {hi}")}
    seats = collections.Counter(p["match_id"] for p in parts)
    nsim = collections.Counter(p["match_id"] for p in parts if p["bot_id"] in sim)
    best = collections.defaultdict(int)
    for p in parts: best[p["match_id"]] = max(best[p["match_id"]], p["score"])
    bym = collections.defaultdict(list)
    for r in res: bym[r["match_id"]].append(r)
    for m, rs in bym.items():
        if seats[m] != 6 or nsim[m] > 1: continue      # real 6-seat tables only (<=1 sim filler)
        rs.sort(key=lambda r: r["auction_id"])
        for i, r in enumerate(rs):
            w = r["winner_bot_id"]
            w = w[1] if isinstance(w, list) and w and w[0] == 0 else None
            # strongest bid from anyone but us (172): exact when we won (= what we paid)
            cmax = r["paid"] if w == 172 else top.get(r["auction_id"], 0)
            others = [p["score"] for p in parts if p["match_id"] == m and p["bot_id"] != 172]
            rows.append({"m": m, "i": i, "n": len(rs), "l": r["letter"], "paid": r["paid"], "top": top.get(r["auction_id"], 0), "w": w, "cmax": cmax, "bestOther": max(others) if others else 0, "us": any(p["bot_id"] == 172 for p in parts if p["match_id"] == m)})
    print(f"{lo}-{hi}: {len(rows)} auctions so far", file=sys.stderr)
json.dump(rows, open(outp, "w"))
