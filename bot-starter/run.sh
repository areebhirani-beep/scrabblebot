#!/bin/zsh
# Keeps the bot connected: restarts it within 1s if it exits or disconnects.
# Usage: BOT_NAME=<name> [TOURNAMENT_ID=<id>] [BRAIN=v1|adv] ./run.sh
# Stop with Ctrl-C twice.
cd "$(dirname "$0")"
caffeinate -dimsu -w $$ &   # keep the Mac awake while this script runs
while true; do
  npx tsx src/index.ts
  echo "[run.sh] bot exited ($?), restarting in 1s..."
  sleep 1
done
