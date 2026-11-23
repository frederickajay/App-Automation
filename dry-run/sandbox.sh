#!/usr/bin/env bash
# Try the whole pipeline end to end with a fake `claude`, local git remotes, and no Claude usage.
#   bash dry-run/sandbox.sh            (macOS/Linux, or Git Bash on Windows)
#   FAKE_MODE=block,fail bash dry-run/sandbox.sh    to see questions and retries
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
T="${TMPDIR:-/tmp}/app-automation-dry-run"; rm -rf "$T"; mkdir -p "$T"; cd "$T"
for r in ios android; do
  git init -q --bare -b main $r.git; git clone -q $r.git $r 2>/dev/null
  (cd $r && echo "# $r" > README.md && git add . && git commit -qm init && git push -q origin main)
  node "$KIT/install.mjs" "$T/$r" >/dev/null
  (cd $r && git add -A && git commit -qm "automation kit" && git push -q origin main)
done
echo '{ "repos": { "android": { "path": "../android" } }, "state": { "pollSeconds": 1 }, "notify": { "desktop": false } }' > ios/automation/config.local.json
export AUTOMATION_CLAUDE_BIN="$T/ios/automation/tools/dry-run-claude.mjs" AUTOMATION_SKIP_CREDENTIAL_CHECK=1
cd ios
for i in $(seq 1 25); do
  node automation/ctl.mjs tick | grep -v 'Orchestrator started' || true
  node automation/ctl.mjs worker mac --once | grep -v 'started' || true
  node automation/ctl.mjs worker windows --once | grep -v 'started' || true
  if node automation/ctl.mjs status | grep -q 'QUESTIONS FOR YOU'; then
    node automation/ctl.mjs status
    q=$(node automation/ctl.mjs status | grep -oE '^- [a-z0-9-]+-q[0-9]+' | head -1 | cut -c3-)
    echo ">>> answering $q automatically for the demo"; node automation/ctl.mjs answer "$q" "${DEMO_ANSWER:-retry}"
  fi
done
node automation/ctl.mjs status
echo "Sandbox: $T   Dashboard: $T/ios/.automation-state/dashboard.html"
