#!/usr/bin/env bash
# Documentation mirror check (ADR 0008 revised 2026-10-24, ADR 0029 workspace guardrail).
#
# Public/community-facing documents (README.md, CONTRIBUTING.md, CHANGELOG.md,
# SECURITY.md) must have an equivalent pt-BR twin under docs/pt-BR/.
# The two must have the same heading structure and the same set of relative links.
# Internal engineering documents (CLAUDE.md, docs/adr/, docs/reference/,
# docs/review/, docs/spec/, docs/roadmap.md) are kept in English only.
#
# Heading structure: the same sequence of heading levels (heading text differs
# by language and is not compared).
#
# Links: compared as written, after stripping the leading `docs/` or `../`
# so that root files and their pt-BR twins compare equal; the language-switch
# link pointing at its own twin is dropped.
#
# Link resolution: every relative link across all tracked documentation files
# must resolve to an existing file, with no fallback.
#
# Exit code: 0 when the mirror is complete, 1 otherwise. Needs bash, git,
# diff, awk, sed, grep, sort.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# Ensure git doesn't quote UTF-8 filenames with octal escapes
git() { command git -c core.quotepath=false "$@"; }

# Public documents requiring a twin under docs/pt-BR/
MIRRORED=(README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md)

# Markdown trees excluded from link resolution check
# Demo vaults are the tutorial, one per language (ADR 0058), checked by demo-vault.mjs.
EXCLUDED_PREFIXES=(fixtures/ demo-vault/ demo-vault-en/)

fail=0
say() { printf '%s\n' "$*" >&2; }
problem() { fail=1; say "MIRROR: $*"; }

is_excluded() {
  local f="$1"
  for e in "${EXCLUDED_PREFIXES[@]}"; do
    case "$f" in "$e"*) return 0 ;; esac
  done
  return 1
}

# Heading structure: sequence of heading levels, ignoring fenced code blocks.
headings() {
  awk '
    /^[[:space:]]*```/ { fence = !fence; next }
    fence { next }
    /^#{1,6} / { match($0, /^#+/); print RLENGTH }
  ' "$1"
}

# All relative Markdown link targets in the file, as written, without fragment.
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

# Relative path from $1 to $2 (both repo-relative)
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

# Normalized link set for mirror comparison:
# Drops the twin language switch link, strips leading docs/ or ../
compare_links() {
  local f="$1" twin="$2" switch
  switch="$(relpath "$f" "$twin")"
  raw_links "$f" \
    | grep -v -x -F -- "$switch" \
    | sed -e 's#^docs/##' -e 's#^\.\./##' \
    | sort -u
}

# 1. Check each mirrored document
for c in "${MIRRORED[@]}"; do
  m="docs/pt-BR/$c"
  if [ ! -f "$c" ]; then
    problem "missing canonical document: $c"
    continue
  fi
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
done

# 2. Check for orphan or unexpected files in docs/pt-BR/
if [ -d docs/pt-BR ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    base="$(basename "$f")"
    expected=0
    for m in "${MIRRORED[@]}"; do
      if [ "$base" = "$m" ]; then expected=1; break; fi
    done
    if [ "$expected" -eq 0 ]; then
      problem "unexpected file in docs/pt-BR/: $f (only public docs are mirrored)"
    fi
  done < <(find docs/pt-BR -type f -name '*.md')
fi

# 3. Every relative link in all documentation files must resolve
check_links() {
  local f="$1" dir l target
  dir="$(dirname "$f")"
  while IFS= read -r l; do
    [ -z "$l" ] && continue
    case "$l" in
      /*) target="${l#/}" ;;
      *) target="$dir/$l" ;;
    esac
    [ -e "$target" ] || problem "broken link in $f: $l -> $target"
  done < <(raw_links "$f")
}

while IFS= read -r f; do
  [ -f "$f" ] || continue
  is_excluded "$f" && continue
  check_links "$f"
done < <(git ls-files -- '*.md')

if [ "$fail" -eq 0 ]; then
  say "docs mirror: ok (${#MIRRORED[@]} mirrored public documents; all links resolve)"
fi
exit "$fail"
