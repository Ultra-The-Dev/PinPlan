#!/usr/bin/env bash
# Fails if a tracked file contains something that must never be in this public repo.
#
# 1. A private denylist (real client names and addresses, personal emails, old names, ...). It is NOT in the repo:
#    CI reads it from the repository variable FORBIDDEN_STRINGS (Settings > Secrets and variables > Actions >
#    Variables), one entry per line, matched case-insensitively as plain text. Lines starting with # are ignored.
#    Matches are reported by file and line only, never by the matched text, so the log doesn't leak the list.
# 2. AI model identifiers outside docs/: the model is configuration (ANTHROPIC_MODEL), never hard-coded.
#
# Usage: FORBIDDEN_STRINGS="$(cat ~/private-denylist.txt)" scripts/forbidden-strings.sh
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
self="scripts/forbidden-strings.sh"

# ---- 1. private denylist ----
if [ -z "${FORBIDDEN_STRINGS:-}" ]; then
  echo "FORBIDDEN_STRINGS is empty: skipping the private denylist (set the repository variable to enable it)."
else
  n=0
  while IFS= read -r entry || [ -n "$entry" ]; do
    entry="${entry%$'\r'}"
    # trim surrounding whitespace
    entry="${entry#"${entry%%[![:space:]]*}"}"
    entry="${entry%"${entry##*[![:space:]]}"}"
    [ -z "$entry" ] && continue
    case "$entry" in \#*) continue ;; esac
    n=$((n + 1))
    hits="$(git grep -n -I -i -F -e "$entry" -- . ":!$self" | cut -d: -f1,2 || true)"
    if [ -n "$hits" ]; then
      fail=1
      while IFS= read -r h; do
        echo "::error file=${h%%:*},line=${h#*:}::Denylist entry #$n found (see the FORBIDDEN_STRINGS variable)"
      done <<<"$hits"
    fi
  done <<<"$FORBIDDEN_STRINGS"
  echo "Checked $n denylist entries."
fi

# ---- 2. model identifiers outside docs/ ----
# Built from parts so this file doesn't match itself.
vendor="claude"
model_re="\\b(${vendor}-(instant|[0-9]|opus|sonnet|haiku)[-.a-z0-9]*|gpt-[0-9][-.a-z0-9]*|gemini-[0-9][-.a-z0-9]*)"
hits="$(git grep -n -I -i -E -e "$model_re" -- . ':!docs/**' ":!$self" | cut -d: -f1,2 || true)"
if [ -n "$hits" ]; then
  fail=1
  while IFS= read -r h; do
    echo "::error file=${h%%:*},line=${h#*:}::AI model identifier in code: read it from configuration (ANTHROPIC_MODEL) instead"
  done <<<"$hits"
fi

if [ "$fail" -ne 0 ]; then
  echo "Forbidden strings found (see the errors above)." >&2
  exit 1
fi
echo "No forbidden strings."
