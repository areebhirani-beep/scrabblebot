#!/bin/zsh
# Parallel bot-vs-bot sim search. usage (from bot-starter/):
#   tools/run_botsim.sh tools/example_botsim_configs.jsonl 80 /tmp/out.tsv
# Lines: {"bot":"adv","field":"mc|mcbig|mchu|gauntlet|live","p":{...},"label":"..."}
cd "$(dirname "$0")/.."
N="$2"
tr '\n' '\0' < "$1" | xargs -0 -P "${JOBS:-12}" -n 1 sh -c 'ONE="$1" npx tsx src/sim.ts '"$N" _ > "$3" 2>&1
sort -n "$3"
