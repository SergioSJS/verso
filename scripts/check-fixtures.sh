#!/usr/bin/env bash
# Fixture lint (ADR 0031, spec §4): structure and key names only.
#
# Every fixture is fixtures/<category>/<case>/ with exactly input.md and
# expected.yaml. expected.yaml may use only the keys of the schema in
# docs/spec/dialect.md §4. Values are not checked here: whether the parser
# produces them is the Phase 1 test, and whether they are right is the
# maintainer's approval.
#
# Deliberately dependency-free (bash, find, grep, sed). The Phase 1 test
# harness deserialises expected.yaml into a strict type and is the real
# check; this script only keeps a draft from using a key that does not exist.

set -euo pipefail
cd "$(dirname "$0")/.."

top_keys='frontmatter|headings|links|embeds|blocks|callouts|observed|source'
item_keys='target|heading|block|alias|syntax|pos|level|text|id|kind|title|fold|line|col|app|version|how'

fail=0
problem() { fail=1; printf 'FIXTURE: %s\n' "$*" >&2; }

[ -d fixtures ] || { echo "fixtures: none yet"; exit 0; }

count=0
while IFS= read -r dir; do
  count=$((count + 1))
  [ -f "$dir/input.md" ] || problem "$dir: missing input.md"
  [ -f "$dir/expected.yaml" ] || { problem "$dir: missing expected.yaml"; continue; }
  extra=$(find "$dir" -mindepth 1 -maxdepth 1 ! -name input.md ! -name expected.yaml | head -1)
  [ -z "$extra" ] || problem "$dir: unexpected entry $extra"

  # Comment lines are not keys.
  body=$(grep -vE '^[[:space:]]*#' "$dir/expected.yaml")

  # Top-level keys: a name at column 0 followed by ':'.
  bad=$(printf '%s\n' "$body" | grep -oE '^[A-Za-z_]+:' | sed 's/:$//' | sort -u \
    | grep -vE "^($top_keys)$" || true)
  for k in $bad; do problem "$dir: unknown top-level key '$k'"; done

  # Nested keys: indented, optionally after '- ', a name followed by ':'.
  bad=$(printf '%s\n' "$body" | grep -oE '^[[:space:]]+(- )?[A-Za-z_]+:' | sed -E 's/^[[:space:]]+(- )?//; s/:$//' | sort -u \
    | grep -vE "^($item_keys)$" || true)
  for k in $bad; do problem "$dir: unknown key '$k'"; done

  # Inline maps such as pos: { line: 1, col: 15 }.
  bad=$(printf '%s\n' "$body" | grep -oE '\{[^}]*\}' | grep -oE '[A-Za-z_]+:' | sed 's/:$//' | sort -u \
    | grep -vE "^($item_keys)$" || true)
  for k in $bad; do problem "$dir: unknown inline key '$k'"; done

  # A draft says so on its first line; an approved fixture does not.
  if head -1 "$dir/expected.yaml" | grep -q 'AI draft'; then
    printf 'draft:    %s\n' "$dir"
  else
    printf 'approved: %s\n' "$dir"
  fi
done < <(find fixtures -mindepth 2 -maxdepth 2 -type d | sort)

if [ "$fail" -eq 0 ]; then
  echo "fixtures: $count checked"
fi
exit "$fail"
