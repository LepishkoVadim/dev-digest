#!/usr/bin/env bash
#
# Sync the vendored @devdigest/shared contracts from the SOURCE (server) to the
# MIRROR (client). server/src/vendor/shared is the single source of truth (see
# root CLAUDE.md); client/src/vendor/shared is a vendored copy, never hand-edited.
# reviewer-core needs no sync — it aliases the server copy via tsconfig paths.
#
#   ./scripts/sync-shared.sh          # write the mirror
#   ./scripts/sync-shared.sh --check  # exit non-zero if the mirror is stale (CI)
#
# The --check mode is what .github/workflows/contracts-sync.yml runs on every PR.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/server/src/vendor/shared"
DST="$ROOT/client/src/vendor/shared"

if [ "${1:-}" = "--check" ]; then
  if diff -r "$SRC" "$DST" >/dev/null 2>&1; then
    echo "✓ client/src/vendor/shared is in sync with server"
    exit 0
  fi
  echo "✗ client/src/vendor/shared is OUT OF SYNC with server:"
  diff -r "$SRC" "$DST" || true
  echo
  echo "Fix: run ./scripts/sync-shared.sh and commit the result."
  exit 1
fi

# rsync mirrors exactly (--delete removes files dropped from the source). Fall
# back to cp for environments without rsync.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$SRC/" "$DST/"
else
  rm -rf "$DST"
  mkdir -p "$DST"
  cp -r "$SRC/." "$DST/"
fi
echo "✓ synced client/src/vendor/shared from server"
