#!/usr/bin/env bash
# Documentation mirror check (ADR 0008, ADR 0029 workspace guardrail).
#
# Every canonical Markdown document must have a pt-BR twin under docs/pt-BR/
# with the same relative path, and vice versa. The two must have the same
# heading structure (same sequence of heading levels) and the same set of
# relative links. Content equivalence is human review; presence, structure
# and links are CI.
#
# Canonical set: docs/**/*.md (excluding docs/pt-BR/), CLAUDE.md and
# .github/pull_request_template.md. Root files mirror into docs/pt-BR/ at the
# top level (CLAUDE.md -> docs/pt-BR/CLAUDE.md,
# .github/pull_request_template.md -> docs/pt-BR/pull_request_template.md).
#
# Exit code: 0 when the mirror is complete, 1 otherwise. No dependencies
# beyond bash, find, grep, sed, sort and diff.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail=0
say() { printf '%s\n' "$*" >&2; }
problem() { fail=1; say "MIRROR: $*"; }

# Map canonical path -> mirror path.
mirror_of() {
  case "$1" in
    CLAUDE.md|CONTRIBUTING.md|README.md) echo "docs/pt-BR/$1" ;;
    .github/pull_request_template.md) echo "docs/pt-BR/pull_request_template.md" ;;
    docs/*) echo "docs/pt-BR/${1#docs/}" ;;
    *) return 1 ;;
  esac
}

# Map mirror path -> canonical path.
canonical_of() {
  case "$1" in
    docs/pt-BR/CLAUDE.md|docs/pt-BR/CONTRIBUTING.md|docs/pt-BR/README.md) echo "${1#docs/pt-BR/}" ;;
    docs/pt-BR/pull_request_template.md) echo ".github/pull_request_template.md" ;;
    docs/pt-BR/*) echo "docs/${1#docs/pt-BR/}" ;;
    *) return 1 ;;
  esac
}

# Heading structure: sequence of heading levels, ignoring fenced code blocks.
headings() {
  awk '
    /^```/ { fence = !fence; next }
    fence { next }
    /^#{1,6} / { match($0, /^#+/); print RLENGTH }
  ' "$1"
}

# Relative links inside the file, ignoring code blocks and absolute URLs.
# Links from root files to docs/ are normalised so both sides compare equal.
# The language-switch link (canonical -> its twin, twin -> its canonical) is
# dropped: by construction it differs between the two sides.
links() {
  awk '
    /^```/ { fence = !fence; next }
    fence { next }
    { print }
  ' "$1" \
  | sed -e 's/`[^`]*`//g' \
  | grep -o '\]([^)]*)' \
  | sed -e 's/^](//' -e 's/)$//' -e 's/#.*$//' \
  | grep -v '^[a-z]*://' \
  | grep -v '^$' \
  | grep -v -E '(^|/)pt-BR/[A-Za-z_.-]+\.md$|^(\.\./)+[A-Za-z_.-]+\.md$' \
  | sed -e 's#^docs/##' \
  | sort -u
}

# The language-switch link alone, checked separately for resolution.
switch_links() {
  awk '
    /^```/ { fence = !fence; next }
    fence { next }
    { print }
  ' "$1" \
  | sed -e 's/`[^`]*`//g' \
  | grep -o '\]([^)]*)' \
  | sed -e 's/^](//' -e 's/)$//' -e 's/#.*$//' \
  | grep -E '(^|/)pt-BR/[A-Za-z_.-]+\.md$|^(\.\./)+[A-Za-z_.-]+\.md$' \
  | sort -u
}

canonical_list() {
  {
    find docs -name '*.md' -not -path 'docs/pt-BR/*'
    for f in CLAUDE.md CONTRIBUTING.md README.md .github/pull_request_template.md; do
      [ -f "$f" ] && echo "$f"
    done
  } | sort
}

mirror_list() {
  find docs/pt-BR -name '*.md' 2>/dev/null | sort
}

# 1. Every canonical file has a mirror.
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
  if ! diff -q <(links "$c") <(links "$m") >/dev/null; then
    problem "link set differs: $c vs $m"
    diff <(links "$c") <(links "$m") | head -20 >&2 || true
  fi
done < <(canonical_list)

# 2. Every mirror file has a canonical.
while IFS= read -r m; do
  c="$(canonical_of "$m")" || { problem "no canonical rule for $m"; continue; }
  [ -f "$c" ] || problem "orphan pt-BR file: $m (expected $c)"
done < <(mirror_list)

# 3. Every relative link resolves, on both sides.
check_links() {
  local f="$1" dir target
  dir="$(dirname "$f")"
  while IFS= read -r l; do
    [ -z "$l" ] && continue
    case "$l" in
      /*) target="${l#/}" ;;
      *) target="$dir/$l" ;;
    esac
    # Root files link with a docs/ prefix; links() stripped it, so try both.
    if [ ! -e "$target" ] && [ ! -e "$dir/docs/$l" ] && [ ! -e "docs/$l" ]; then
      problem "broken link in $f: $l"
    fi
  done < <(links "$f"; switch_links "$f")
}
while IFS= read -r f; do check_links "$f"; done < <(canonical_list)
while IFS= read -r f; do check_links "$f"; done < <(mirror_list)

if [ "$fail" -eq 0 ]; then
  say "docs mirror: ok ($(canonical_list | wc -l | tr -d ' ') documents, both languages)"
fi
exit "$fail"
