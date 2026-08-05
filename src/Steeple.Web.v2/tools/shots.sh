#!/usr/bin/env bash
# Batch screenshot helper for the integration pass.
#   tools/shots.sh <prefix> <name>:<hashOrEmpty>[:evalJs] ...
# Each job renders both nothing-fancy deep links in parallel.
set -u
ROOT="/Users/jeremy/projects/steeple/src/Steeple.Web.v2"
PORT="${PORT:-5304}"
QUERY="${QUERY:-&q=low}"
PREFIX="$1"; shift
pids=()
for job in "$@"; do
  name="${job%%:*}"; rest="${job#*:}"
  hash="${rest%%:*}"; ev="${rest#*:}"
  [ "$ev" = "$hash" ] && ev=""
  style="${name%%-*}"
  url="http://localhost:${PORT}/?style=${style}${QUERY}#${hash}"
  if [ -n "$ev" ]; then
    node "$ROOT/tools/shot.mjs" "$url" "/tmp/${PREFIX}-${name}.png" --eval "$ev" --wait 3200 &
  else
    node "$ROOT/tools/shot.mjs" "$url" "/tmp/${PREFIX}-${name}.png" --wait 3200 &
  fi
  pids+=($!)
done
fail=0
for p in "${pids[@]}"; do wait "$p" || fail=1; done
exit $fail
