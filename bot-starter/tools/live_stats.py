# Live results for our bot from the public SQL API. usage: python3 -I live_stats.py <bot_id> [since_match_id]
import json, sys, urllib.request
URL = "https://maincloud.spacetimedb.com/v1/database/scrabblebot/sql"
def q(sql):
    req = urllib.request.Request(URL, data=sql.encode(), method="POST")
    d = json.load(urllib.request.urlopen(req, timeout=30))
    out = []
    for t in d:
        cols = [e["name"].get("some", "?") for e in t["schema"]["elements"]]
        out += [dict(zip(cols, r)) for r in t["rows"]]
    return out
bot = int(sys.argv[1]); since = int(sys.argv[2]) if len(sys.argv) > 2 else 0
names = {b["id"]: b["name"] for b in q("SELECT id, name FROM bot")}
mine = sorted(r["match_id"] for r in q(f"SELECT match_id FROM match_participant WHERE bot_id = {bot}") if r["match_id"] >= since)
rows = []
for m in mine:
    st = q(f"SELECT status FROM match_state WHERE id = {m}")
    if not st or st[0]["status"][0] != 2: continue  # enum index 2 = ended
    ps = q(f"SELECT bot_id, balance, score FROM match_participant WHERE match_id = {m}")
    ps.sort(key=lambda p: -p["score"])
    me = next(p for p in ps if p["bot_id"] == bot)
    place = 1 + sum(1 for p in ps if p["score"] > me["score"])
    top = ps[0]
    rows.append((m, len(ps), place, me["score"], me["balance"], names.get(top["bot_id"], top["bot_id"]), top["score"]))
print(f"{'match':>7} seats place score left$  winner (score)")
for r in rows: print(f"{r[0]:>7} {r[1]:>5} {r[2]:>5} {r[3]:>5} {r[4]:>5}  {r[5]} ({r[6]})")
if rows:
    n = len(rows)
    print(f"\n{n} matches | avg place {sum(r[2] for r in rows)/n:.2f} | wins {sum(r[2]==1 for r in rows)} | avg score {sum(r[3] for r in rows)/n:.1f} | avg unspent {sum(r[4] for r in rows)/n:.1f}")
stats = q(f"SELECT * FROM bot_stats WHERE bot_id = {bot}")
for s in stats:
    mu, sig = s["openskill_mu"], s["openskill_sigma"]
    print(f"ladder: rating {1500 + 29.48*(mu-25):.0f} ±{2*29.48*sig:.0f} | matches {s['matches_played']} | wins {s['wins']} | elo {s['rating']}")
