#!/usr/bin/env bash
# Fixture lint (ADR 0031, spec §4): layout and key names only.
#
# Every fixture is fixtures/<category>/<case>/ with exactly input.md and
# expected.yaml. expected.yaml may use only the keys of the schema in
# docs/spec/dialect.md §4, each under the parent the schema gives it. Values
# are not checked here: whether the parser produces them is the Phase 1 test,
# and whether they are right is the maintainer's approval.
#
# A draft says "AI draft" on its first line (ADR 0031 item 4); the script
# reports drafts and, by default, does not fail on them. Roadmap exit
# criterion 5 reads the report. Two things do fail:
#
#   - an approval coming undone: a fixture approved on the base branch
#     (FIXTURES_BASE, default main) that is a draft here. That is not a
#     decision, it is a line lost in a rebase or a merge — it happened on
#     2026-09-22 to six fixtures, unnoticed;
#   - any draft at all when FIXTURES_STRICT=1, which is how main is checked:
#     a working branch may carry a draft while the maintainer looks at it,
#     main may not.
#
# Every fixture also carries `observed:` or `source:` (spec §4.5).
#
# Deliberately dependency-free (bash, find, grep, sed, awk; git only for the
# base-branch comparison, skipped when the base is not there). The Phase 1 test
# harness deserialises expected.yaml into a strict type and is the real
# check; this script only keeps a draft from using a key that does not exist
# or sits in the wrong place.

set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
drafts=0
base="${FIXTURES_BASE:-main}"
problem() { fail=1; printf 'FIXTURE: %s\n' "$*" >&2; }

[ -d fixtures ] || { echo "fixtures: none yet"; exit 0; }

# Keys allowed under each parent. `frontmatter` values are user data and are
# not checked. `pos` is an inline map with line and col.
allowed_under() {
  case "$1" in
    top)       echo 'frontmatter|headings|links|embeds|blocks|callouts|property_links|schemas|prose|reader|observed|source' ;;
    schemas)   echo 'type|labels|layout|properties|error|nested|pos|key|kind' ;;
    labels)    echo '.*' ;;
    links|embeds) echo 'target|heading|block|alias|syntax|pos' ;;
    property_links) echo 'property|item|target|heading|block|alias|pos' ;;
    headings)  echo 'level|text|pos' ;;
    blocks)    echo 'id|pos|lines' ;;
    callouts)  echo 'kind|title|fold|depth|pos' ;;
    prose)     echo 'text|table|pos' ;;
    observed)  echo 'app|version|how' ;;
    pos)       echo 'line|col' ;;
    frontmatter) echo '.*' ;;
    *)         echo '' ;;
  esac
}

# Walk expected.yaml with a tiny state machine: track the current top-level
# key and skip block scalars (`>` / `|` and their chomping variants), whose
# continuation lines are prose, not keys. Emits one line per problem.
check_keys() {
  awk -v file="$1" '
    function report(msg) { print "FIXTURE: " file ": " msg; bad = 1 }
    function allowed(parent, key,   list) {
      if (parent == "top") list = "frontmatter|headings|links|embeds|blocks|callouts|property_links|schemas|prose|reader|observed|source"
      else if (parent == "schemas") list = "type|labels|layout|properties|error|nested|pos|key|kind"
      else if (parent == "labels") return 1
      else if (parent == "links" || parent == "embeds") list = "target|heading|block|alias|syntax|pos"
      else if (parent == "headings") list = "level|text|pos"
      else if (parent == "blocks") list = "id|pos|lines"
      else if (parent == "callouts") list = "kind|title|fold|depth|pos"
      else if (parent == "prose") list = "text|table|pos"
      else if (parent == "property_links") list = "property|item|target|heading|block|alias|pos"
      else if (parent == "observed") list = "app|version|how"
      else if (parent == "pos") list = "line|col"
      else if (parent == "frontmatter") return 1
      else list = ""
      return key ~ ("^(" list ")$")
    }
    BEGIN { top = "top"; inscalar = 0; scalar_indent = -1; keys = 0 }
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      match($0, /^[[:space:]]*/); indent = RLENGTH
      if (inscalar) {
        if (indent > scalar_indent) next
        inscalar = 0
      }
      line = $0
      sub(/^[[:space:]]*(- )?/, "", line)
      if (line !~ /^[A-Za-z_]+:/) next
      key = line; sub(/:.*$/, "", key)
      keys++
      if (indent == 0) {
        if (!allowed("top", key)) report("unknown top-level key " key)
        top = key
      } else {
        if (!allowed(top, key)) report("key " key " not allowed under " top)
      }
      # Inline maps such as pos: { line: 1, col: 15 }.
      if (match(line, /\{[^}]*\}/)) {
        inner = substr(line, RSTART + 1, RLENGTH - 2)
        n = split(inner, parts, ",")
        for (i = 1; i <= n; i++) {
          k = parts[i]; sub(/^[[:space:]]*/, "", k); sub(/:.*$/, "", k)
          if (k != "" && !allowed(key, k)) report("key " k " not allowed under " key)
        }
      }
      # Block scalar: value is `>` or `|` with optional chomping/indent.
      value = line; sub(/^[A-Za-z_]+:[[:space:]]*/, "", value)
      if (value ~ /^[>|][+-]?[0-9]?$/) { inscalar = 1; scalar_indent = indent }
    }
    END {
      if (keys == 0) report("asserts nothing: no keys in expected.yaml")
      exit bad
    }
  ' "$1"
}

# 0. Every fixture runs in Phase 1's test harness, which embeds them at
# compile time (verso-dialect has no IO, ADR 0028) from a hand-written list
# in crates/verso-dialect/tests/fixtures.rs. A fixture missing from that list
# would exist and never run.
harness=crates/verso-dialect/tests/fixtures.rs
while IFS= read -r dir; do
  rel="${dir#fixtures/}"
  grep -q -- "=> \"$rel\"" "$harness" || problem "$dir: not listed in $harness (fixture_tests!)"
done < <(find fixtures -mindepth 2 -maxdepth 2 -type d | sort)

# 1. Anything under fixtures/ that looks like a fixture but is not at depth 2.
while IFS= read -r f; do
  d="$(dirname "$f")"
  depth=$(printf '%s' "$d" | awk -F/ '{print NF}')
  [ "$depth" -eq 3 ] || problem "$f: fixtures live at fixtures/<category>/<case>/, found at depth $((depth - 1))"
done < <(find fixtures -type f \( -name input.md -o -name expected.yaml \) | sort)

# 2. Each fixture directory: exactly the two files, keys in the schema.
count=0
while IFS= read -r dir; do
  count=$((count + 1))
  [ -f "$dir/input.md" ] || problem "$dir: missing input.md"
  if [ ! -f "$dir/expected.yaml" ]; then
    problem "$dir: missing expected.yaml"
    continue
  fi
  extra=$(find "$dir" -mindepth 1 -maxdepth 1 ! -name input.md ! -name expected.yaml | head -1)
  [ -z "$extra" ] || problem "$dir: unexpected entry $extra"

  if ! out=$(check_keys "$dir/expected.yaml"); then
    fail=1
    printf '%s\n' "$out" >&2
  fi

  # Spec §4.5: every fixture records how its behavior was observed or what
  # authorizes it.
  grep -q -E '^(observed|source):' "$dir/expected.yaml" \
    || problem "$dir: neither observed: nor source: (spec §4.5)"

  if head -1 "$dir/expected.yaml" | grep -q 'AI draft'; then
    printf 'draft:    %s\n' "$dir"
    drafts=$((drafts + 1))
    # 3. An approval does not come undone by accident.
    if git cat-file -e "$base:$dir/expected.yaml" 2>/dev/null \
       && git show "$base:$dir/expected.yaml" | head -1 | grep -q 'Approved'; then
      problem "$dir: approved on $base, a draft here — the approval line was lost; restore it"
    fi
  else
    printf 'approved: %s\n' "$dir"
  fi
done < <(find fixtures -mindepth 2 -maxdepth 2 -type d | sort)

# 4. No draft at all, when asked (main).
if [ "${FIXTURES_STRICT:-0}" = "1" ] && [ "$drafts" -gt 0 ]; then
  problem "$drafts draft(s) present with FIXTURES_STRICT=1"
fi

if [ "$fail" -eq 0 ]; then
  echo "fixtures: $count checked"
fi
exit "$fail"
