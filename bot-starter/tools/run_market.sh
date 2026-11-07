#!/bin/zsh
# Parallel market-sim search. usage (from bot-starter/):
#   tools/run_market.sh tools/example_market_configs.jsonl 200 /tmp/out.tsv
# Each line of the .jsonl is {"p":{...AdvParams overrides},"label":"..."}.
# Output columns: win% vs real best-rival score | avg score | tiles $/tile left 7+words | label
cd "$(dirname "$0")/.."
export MARKET="${MARKET:-$PWD/data/market.json}"
N="$2"
tr '\n' '\0' < "$1" | xargs -0 -P "${JOBS:-12}" -n 1 sh -c 'ONE="$1" npx tsx src/market.ts '"$N" _ > "$3" 2>&1
sort -t$'\t' -k1,1nr -k2,2nr "$3" | head -20
