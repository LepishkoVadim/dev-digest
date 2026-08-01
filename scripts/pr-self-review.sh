#!/usr/bin/env bash
#
# PR Self Review — local pre-PR gate. See .claude/skills/pr-self-review/SKILL.md.
#
# This script owns the fast, DETERMINISTIC critical gates only:
#   1. secret scan on added lines   2. new Onion arch violation   3. shared-contract drift
# Any hit => BLOCK. Advisory checks (lint/typecheck) and the LLM lens pass are the
# agent's job in the full /pr-self-review — kept out of here so the push-time hook stays fast.
# ponytail: 3 deterministic gates, not a review engine. Add a gate only when a real miss shows one.
#
#   ./scripts/pr-self-review.sh            # run the gates, human report
#   ./scripts/pr-self-review.sh --hook     # PreToolUse mode: exit 2 + reason on stderr to block
#   ./scripts/pr-self-review.sh --json     # also print a machine-readable verdict line
#
# Escape hatch (logged): PR_SELFREVIEW=0  OR  "[skip-review]" in the latest commit subject.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HOOK=0; JSON=0
for a in "$@"; do
  case "$a" in
    --hook) HOOK=1 ;;
    --json) JSON=1 ;;
  esac
done

AUDIT="$ROOT/.pr-self-review-audit.log"
emit(){ if [ "$HOOK" = 1 ]; then printf '%s\n' "$*" >&2; else printf '%s\n' "$*"; fi; }

# --- escape hatch -----------------------------------------------------------
subject="$(git log -1 --pretty=%s 2>/dev/null || echo '')"
if [ "${PR_SELFREVIEW:-1}" = "0" ] || printf '%s' "$subject" | grep -qi '\[skip-review\]'; then
  who="$(git config user.email 2>/dev/null || echo unknown)"
  printf '%s OVERRIDE by=%s subject="%s"\n' "$(date -u +%FT%TZ)" "$who" "$subject" >> "$AUDIT"
  emit "⚠ PR Self Review skipped via escape hatch — logged to ${AUDIT#$ROOT/}"
  [ "$JSON" = 1 ] && echo '{"verdict":"skipped"}'
  exit 0
fi

# --- collect open changes vs origin/main ------------------------------------
git fetch -q origin main 2>/dev/null || true
BASE="$(git merge-base origin/main HEAD 2>/dev/null || git rev-parse HEAD)"
mapfile -t CHANGED < <( { git diff --name-only "$BASE" 2>/dev/null; \
                          git ls-files --others --exclude-standard; } | sort -u )
if [ "${#CHANGED[@]}" -eq 0 ]; then
  emit "✓ No open changes vs origin/main — nothing to review."
  [ "$JSON" = 1 ] && echo '{"verdict":"pass","criticals":0,"changed":0}'
  exit 0
fi

touched(){ printf '%s\n' "${CHANGED[@]}" | grep -qE "$1"; }
crit=0; REPORT=""
add_crit(){ crit=$((crit+1)); REPORT+="CRITICAL  $1"$'\n'; }
note(){ REPORT+="          $1"$'\n'; }

# --- GATE 1: secret scan on added content -----------------------------------
added_content(){
  git diff "$BASE" -- . 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+' | sed 's/^\+//'
  git ls-files --others --exclude-standard -z | while IFS= read -r -d '' f; do cat "$f" 2>/dev/null; done
}
SECRET_RE='(AKIA[0-9A-Z]{16}|ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(api[_-]?key|secret|password|token)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9/+_-]{16,}["'"'"'])'
HITS="$(added_content | grep -nEi "$SECRET_RE" | grep -viE '(example|dummy|placeholder|xxxx|process\.env|getenv|<[a-z_]+>)' || true)"
if [ -n "$HITS" ]; then
  add_crit "Possible secret in changes (secrets live in ~/.devdigest/secrets.json, never in git):"
  while IFS= read -r l; do note "${l:0:120}"; done <<< "$HITS"
fi

# --- GATE 2: new Onion architecture violation (backend touched) -------------
if touched '^(server|reviewer-core)/'; then
  if ! ( cd server && npx depcruise src --config .dependency-cruiser.cjs --ignore-known ) >/tmp/pr_arch.txt 2>&1; then
    add_crit "New Onion architecture violation (server: pnpm arch:check):"
    grep -E '\berror\b' /tmp/pr_arch.txt | head -20 | while IFS= read -r l; do note "$l"; done
  fi
fi

# --- GATE 3: shared-contract drift (vendor/shared touched) ------------------
if touched 'vendor/shared/'; then
  if ! ./scripts/sync-shared.sh --check >/tmp/pr_sync.txt 2>&1; then
    add_crit "Shared contract drift — client mirror is stale. Run ./scripts/sync-shared.sh:"
    note "$(grep -m1 '✗' /tmp/pr_sync.txt || tail -1 /tmp/pr_sync.txt)"
  fi
fi

# --- verdict ----------------------------------------------------------------
emit ""
emit "=== PR Self Review (mechanical gates) ==="
emit "base $(git rev-parse --short "$BASE") · ${#CHANGED[@]} changed file(s)"
[ -n "$REPORT" ] && emit "$REPORT"
if [ "$crit" -gt 0 ]; then
  emit "✗ BLOCK — ${crit} critical finding(s). Fix them, or override with [skip-review] / PR_SELFREVIEW=0."
  [ "$JSON" = 1 ] && echo "{\"verdict\":\"block\",\"criticals\":${crit},\"changed\":${#CHANGED[@]}}"
  [ "$HOOK" = 1 ] && exit 2 || exit 1
fi
emit "✓ Mechanical gates passed. Run the full /pr-self-review for the LLM lens pass before opening the PR."
[ "$JSON" = 1 ] && echo "{\"verdict\":\"pass\",\"criticals\":0,\"changed\":${#CHANGED[@]}}"
exit 0
