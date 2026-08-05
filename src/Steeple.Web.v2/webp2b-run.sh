#!/bin/zsh
# Runs the stale suites with their header-documented invocations, one at a time
# (the per-IP sign-in limit is shared), saving each run's output.
cd /Users/jeremy/projects/steeple/.claude/worktrees/agent-a3489a297a1954940/src/Steeple.Web.v2 || exit 1
export STEEPLE_API=http://localhost:5211/api/v1
export STEEPLE_PSQL=/opt/homebrew/bin/psql
W=http://localhost:5274

run() {
  name=$1; shift
  echo "===== $name ====="
  node "tools/$name.mjs" "$@" > "/tmp/steeple-webp2b-$name.log" 2>&1
  echo "exit=$?"
  tail -4 "/tmp/steeple-webp2b-$name.log"
  sleep 45
}

run surface-test      "$W/"
run input-test        "$W/?q=low"
run host-test         "$W/?q=low"
run host-input-test   "$W/?q=low&world=off"
run host-publish-test "$W/?q=low&world=off"
run host-offline-test "$W/?q=low&world=off"
run wave2-test        "$W"
echo "ALL DONE"
