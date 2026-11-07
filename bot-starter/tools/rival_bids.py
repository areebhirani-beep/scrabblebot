# Winning bids of the top bots vs ours, by letter and match stage (public archive).
# usage: python3 -I rival_bids.py <first_match> <last_match>
import json, sys, urllib.request, collections, statistics as st
URL = "https://maincloud.spacetimedb.com/v1/database/scrabblebot/sql"
def q(sql):
    d = json.load(urllib.request.urlopen(urllib.request.Request(URL, data=sql.encode(), method="POST"), timeout=120))
    out = []
    for t in d:
        cols = [e["name"].get("some", "?") for e in t["schema"]["elements"]]
        out += [dict(zip(cols, r)) for r in t["rows"]]
    return out
a, b = int(sys.argv[1]), int(sys.argv[2])
names = {r["id"]: r["name"] for r in q("SELECT id, name FROM bot")}
ids = {v: k for k, v in names.items()}
want = ["LUCENT", "Bron", "GodOfThudner", "Odysseus's Voyage"]
bids = collections.defaultdict(lambda: collections.defaultdict(list))   # bot -> letter -> winning bids
stage = collections.defaultdict(lambda: collections.defaultdict(list))  # bot -> quarter -> bids
wins = collections.Counter(); seen = collections.Counter()
for lo in range(a, b + 1, 60):
    hi = min(b, lo + 59)
    res = q(f"SELECT auction_id, match_id, letter, winner_bot_id FROM auction_result WHERE match_id >= {lo} AND match_id <= {hi}")
    top = {r["auction_id"]: r["top_bid"] for r in q(f"SELECT auction_id, top_bid FROM auction_top_bid_archive WHERE match_id >= {lo} AND match_id <= {hi}")}
    parts = q(f"SELECT match_id, bot_id FROM match_participant WHERE match_id >= {lo} AND match_id <= {hi}")
    inm = collections.defaultdict(set)
    for p in parts: inm[p["match_id"]].add(p["bot_id"])
    bym = collections.defaultdict(list)
    for r in res: bym[r["match_id"]].append(r)
    for m, rs in bym.items():
        rs.sort(key=lambda r: r["auction_id"])
        for i, r in enumerate(rs):
            for nm in want:
                if ids.get(nm) in inm[m]: seen[nm] += 1
            w = r["winner_bot_id"]
            if not (isinstance(w, list) and w and w[0] == 0): continue
            nm = names.get(w[1])
            if nm in want:
                tb = top.get(r["auction_id"])
                if tb is None: continue
                bids[nm][r["letter"]].append(tb); stage[nm][min(3, i * 4 // len(rs))].append(tb); wins[nm] += 1
print("share of auctions won (when at the table):", {n: f"{100*wins[n]/max(1,seen[n]):.0f}%" for n in want})
print("median WINNING bid by quarter of the match:")
for n in want: print(f"  {n[:18]:18}", [st.median(stage[n][k]) if stage[n][k] else None for k in range(4)], f"n={wins[n]}")
print("median winning bid by letter (n>=4):")
L = sorted({l for n in want for l in bids[n]})
print("   letter " + " ".join(f"{n[:9]:>9}" for n in want))
for l in L:
    print(f"   {l:6} " + " ".join(f"{(st.median(bids[n][l]) if len(bids[n][l]) >= 4 else float('nan')):>9.0f}" for n in want))
