# ADR 0012 — Files are the source of truth; opening never rewrites

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.2
- Status in the briefing: `DECIDED`

## Context

Data loss is the most expensive risk of the project (§10.3). Trust in a
note-taking app is lost the first time it touches a file without being told to.

## Decision

1. Compatibility with Obsidian vaults, or explicit conversion where there is no
   compatibility.
2. Opening a file never rewrites it.
3. Conversion only by user action, with a visible diff.

## Consequences

- The parser has to preserve what it does not understand: round-trip becomes a
  mandatory property test ([0029](0029-guardrails-in-ci.md)).
- Silent normalization of any kind (line breaks, order of frontmatter keys,
  spacing) is forbidden in the opening path.
- Every conversion needs a diff screen before applying, including the
  conversions proposed in `docs/spec/dialect.md`.
- Writing by an agent falls under the same rule: diff before applying
  ([0018](0018-llm-native-mcp-in-core.md)).
- **Concurrent external modification.** The same folder may be open in Obsidian
  or in another editor. Every Verso write checks that the file on disk is the
  same one that was read (mtime and size, or hash); if it changed, the write
  does not happen without showing the diff between what is on disk and what
  would be written. Writing over someone else's edit is rewriting without user
  action, and it is the most common way to lose data with two apps in the same
  folder. This holds for the UI ([0048](0048-file-operations-in-ui.md)), the
  agent and conversion. (Added in the Phase 0 review, R2.)
- "Round-trip" had two possible readings, and they selected different parsers.
  The maintainer decided `docs/spec/dialect.md` Q18 on 2026-09-21: reading
  (b), a read-only parser with a four-property round-trip test; the base
  parser follows in [0037](0037-base-parser.md). The comparison is in
  `docs/reference/parser-decision.md`.

## Discarded alternatives

- Automatic migration on open — incompatible with the decision, by §5.2.

## Status

Accepted.
