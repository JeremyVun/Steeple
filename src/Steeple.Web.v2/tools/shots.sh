#!/usr/bin/env bash
# Batch screenshot helper for the integration pass.
#   tools/shots.sh <prefix> <name>:<routeOrEmpty>[:evalJs] ...
# The route is a clean path — "/browse", "/space/v/r" — or empty for the title.
# Each job renders both nothing-fancy deep links in parallel.
set -u
ROOT="/Users/jeremy/projects/steeple/src/Steeple.Web.v2"
PORT="${PORT:-5304}"
QUERY="${QUERY:-&q=low}"
PREFIX="$1"; shift
pids=()
for job in "$@"; do
  name="${job%%:*}"; rest="${job#*:}"
  route="${rest%%:*}"; ev="${rest#*:}"
  [ "$ev" = "$route" ] && ev=""
  url="http://localhost:${PORT}${route}?${QUERY#&}"
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
