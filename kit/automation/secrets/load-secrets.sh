#!/usr/bin/env bash
# macOS/Linux: load secrets, then run the command you pass.
#   ./automation/secrets/load-secrets.sh node automation/ctl.mjs worker mac
# Source order: 1Password CLI (if AUTOMATION_OP_ENV points to an op:// env file),
# then automation/secrets/.env (gitignored). Values never get printed.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
if [[ -n "${AUTOMATION_OP_ENV:-}" ]] && command -v op >/dev/null; then
  exec op run --env-file="$AUTOMATION_OP_ENV" -- "$@"
fi
if [[ -f "$here/.env" ]]; then
  set -a; source "$here/.env"; set +a
fi
exec "$@"
