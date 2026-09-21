#!/usr/bin/env bash
# Documentation mirror check (ADR 0008, ADR 0029 workspace guardrail).
#
# Every canonical Markdown document must have a pt-BR twin under docs/pt-BR/
# and vice versa. The two must have the same heading structure and the same
# set of relative links. Content equivalence is human review; presence,
# structure and links are CI.
#
# "Same heading structure" means the same sequence of heading levels: the
# heading text differs by language, so it is not compared (ADR 0008).
#
# Canonical set: every tracked *.md outside docs/pt-BR/, except the ones in
# EXCLUDED below. Files under docs/ mirror to docs/pt-BR/<same relative
# path>; files anywhere else (CLAUDE.md, CONTRIBUTING.md,
# .github/pull_request_template.md, a future SECURITY.md) mirror to
# docs/pt-BR/<basename>. A new root or .github document is therefore checked
# the moment it is tracked, and a mirror file with no canonical is an orphan.
#
# Links: compared as written, after stripping the leading `docs/` that root
# files use and their mirrors do not; the language-switch link (a document
# pointing at its own twin) is dropped from the comparison, since it differs
# by construction. Every link is then resolved relative to the file that
# contains it, with no fallback.
#
# Exit code: 0 when the mirror is complete, 1 otherwise. Needs bash, git,
# find, grep, sed, sort, diff, awk.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# Tracked Markdown that deliberately has no twin. Keep this list short and
# justified: today, nothing.
EXCLUDED=()

fail=0
say() { printf '%s\n' "$*" >&2; }
problem() { fail=1; say "MIRROR: $*"; }

is_excluded() {
  local f="$1" e
  for e in "${EXCLUDED[@]:-}"; do [ -n "$e" ] && [ "$e" = "$f" ] && return 0; done
  return 1
}

# Map canonical path -> mirror path.
mirror_of() {
  case "$1" in
    docs/pt-BR/*) return 1 ;;
    docs/*) echo "docs/pt-BR/${1#docs/}" ;;
    *) echo "docs/pt-BR/$(basename "$1")" ;;
  esac
}

# Map mirror path -> canonical path. A top-level mirror file (docs/pt-BR/X.md)
# is the twin of docs/X.md if that exists, else of the single tracked X.md
# outside docs/; ambiguity is reported.
canonical_of() {
  local m="$1" rel c n
  rel="${m#docs/pt-BR/}"
  case "$rel" in
    */*) echo "docs/$rel"; return 0 ;;
  esac
  if [ -f "docs/$rel" ]; then echo "docs/$rel"; return 0; fi
  c=$(git ls-files -- '*.md' ':!docs/**' | grep -E "(^|/)$(printf '%s' "$rel" | sed 's/[.[\*^$]/\\&/g')$" || true)
  n=$(printf '%s\n' "$c" | grep -c . || true)
  if [ "$n" -eq 1 ]; then echo "$c"; return 0; fi
  return 1
}

# Relative path from the directory of $1 to the file $2 (both repo-relative).
relpath() {
  local from_dir to="$2" up="" rest
  from_dir="$(dirname "$1")"
  [ "$from_dir" = "." ] && { echo "$to"; return; }
  rest="$to"
  local d="$from_dir"
  while [ -n "$d" ] && [ "$d" != "." ]; do
    case "$rest" in
      "$d"/*) rest="${rest#"$d"/}"; echo "${up}${rest}"; return ;;
    esac
    up="../$up"
    d="$(dirname "$d")"
  done
  echo "${up}${to}"
}

# Heading structure: sequence of heading levels, ignoring fenced code blocks
# (a fence may be indented inside a list).
headings() {
  awk '
    /^[[:space:]]*```/ { fence = !fence; next }
    fence { next }
    /^#{1,6} / { match($0, /^#+/); print RLENGTH }
  ' "$1"
}

# All relative Markdown link targets in the file, as written, without the
# fragment; code blocks and inline code are ignored, absolute URLs dropped.
raw_links() {
  awk '
    /^[[:space:]]*```/ { fence = !fence; next }
    fence { next }
    { print }
  ' "$1" \
  | sed -e 's/`[^`]*`//g' \
  | grep -o '\]([^)]*)' \
  | sed -e 's/^](//' -e 's/)$//' -e 's/#.*$//' \
  | grep -v '^[a-z]*://' \
  | grep -v '^$' \
  | sort -u
}

# The link set used for comparison: raw links minus this file's own
# language-switch link, with the leading `docs/` stripped so that a root file
# and its mirror compare equal.
compare_links() {
  local f="$1" twin="$2" switch
  switch="$(relpath "$f" "$twin")"
  raw_links "$f" | grep -v -x -F -- "$switch" | sed -e 's#^docs/##' | sort -u
}

canonical_list() {
  git ls-files -- '*.md' ':!docs/pt-BR/**' | while IFS= read -r f; do
    is_excluded "$f" || echo "$f"
  done | sort
}

mirror_list() {
  git ls-files -- 'docs/pt-BR/**/*.md' 'docs/pt-BR/*.md' | sort -u
}

# 1. Every canonical file has a mirror with the same structure and links.
while IFS= read -r c; do
  m="$(mirror_of "$c")" || { problem "no mirror rule for $c"; continue; }
  if [ ! -f "$m" ]; then
    problem "missing pt-BR twin: $c -> $m"
    continue
  fi
  if ! diff -q <(headings "$c") <(headings "$m") >/dev/null; then
    problem "heading structure differs: $c vs $m"
    diff <(headings "$c") <(headings "$m") | head -20 >&2 || true
  fi
  if ! diff -q <(compare_links "$c" "$m") <(compare_links "$m" "$c") >/dev/null; then
    problem "link set differs: $c vs $m"
    diff <(compare_links "$c" "$m") <(compare_links "$m" "$c") | head -20 >&2 || true
  fi
done < <(canonical_list)

# 2. Every mirror file has exactly one canonical.
while IFS= read -r m; do
  c="$(canonical_of "$m")" || { problem "orphan or ambiguous pt-BR file: $m"; continue; }
  [ -f "$c" ] || problem "orphan pt-BR file: $m (expected $c)"
done < <(mirror_list)

# 3. Every relative link resolves from the file that contains it. No fallback.
check_links() {
  local f="$1" dir l target
  dir="$(dirname "$f")"
  while IFS= read -r l; do
    [ -z "$l" ] && continue
    case "$l" in
      /*) target="${l#/}" ;;
      *) target="$dir/$l" ;;
    esac
    [ -e "$target" ] || problem "broken link in $f: $l"
  done < <(raw_links "$f")
}
while IFS= read -r f; do check_links "$f"; done < <(canonical_list)
while IFS= read -r f; do check_links "$f"; done < <(mirror_list)

if [ "$fail" -eq 0 ]; then
  say "docs mirror: ok ($(canonical_list | wc -l | tr -d ' ') documents, both languages)"
fi
exit "$fail"
