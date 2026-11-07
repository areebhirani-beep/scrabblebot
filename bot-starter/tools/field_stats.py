# How each bot in our recent live matches earned its score. usage: python3 -I field_stats.py <first_match> <last_match>
import json, sys, urllib.request, collections
URL = "https://maincloud.spacetimedb.com/v1/database/scrabblebot/sql"
def q(sql):
    d = json.load(urllib.request.urlopen(urllib.request.Request(URL, data=sql.encode(), method="POST"), timeout=60))
    out = []
    for t in d:
        cols = [e["name"].get("some", "?") for e in t["schema"]["elements"]]
        out += [dict(zip(cols, r)) for r in t["rows"]]
    return out
a, b = int(sys.argv[1]), int(sys.argv[2])
names = {r["id"]: r["name"] for r in q("SELECT id, name FROM bot")}
S = collections.defaultdict(lambda: collections.Counter())
lens = collections.defaultdict(collections.Counter)
for m in range(a, b + 1):
    ps = q(f"SELECT bot_id, balance, score FROM match_participant WHERE match_id = {m}")
    if not ps: continue
    order = sorted(ps, key=lambda p: -p["score"])
    for p in ps:
        s = S[p["bot_id"]]; s["matches"] += 1; s["score"] += p["score"]; s["left"] += p["balance"]
        s["place"] += 1 + sum(1 for o in ps if o["score"] > p["score"])
    for r in q(f"SELECT winner_bot_id, paid, letter FROM auction_result WHERE match_id = {m}"):
        w = r["winner_bot_id"]
        if isinstance(w, list) and w and w[0] == 0: w = w[1]
        elif isinstance(w, list): continue
        S[w]["tiles"] += 1; S[w]["paid"] += r["paid"]
    for w in q(f"SELECT bot_id, word, total_reward FROM word_play WHERE match_id = {m}"):
        S[w["bot_id"]]["words"] += 1; S[w["bot_id"]]["letters"] += len(w["word"])
        lens[w["bot_id"]][min(len(w["word"]), 9)] += 1
print(f"{'bot':22} {'n':>3} {'place':>5} {'score':>6} {'tiles':>5} {'$/tile':>6} {'left$':>5} {'words':>5} {'avgLen':>6}  len dist (3..9+)")
for bid, s in sorted(S.items(), key=lambda kv: kv[1]["place"] / kv[1]["matches"]):
    n = s["matches"]
    if n < 2: continue
    dist = " ".join(f"{lens[bid][L]}" for L in range(3, 10))
    print(f"{names.get(bid, bid)[:22]:22} {n:>3} {s['place']/n:>5.2f} {s['score']/n:>6.1f} {s['tiles']/n:>5.1f} {s['paid']/max(1,s['tiles']):>6.1f} {s['left']/n:>5.1f} {s['words']/n:>5.1f} {s['letters']/max(1,s['words']):>6.1f}  {dist}")
