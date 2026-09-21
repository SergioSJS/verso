# ADR 0014 — Catalog of Verso primitives

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.3
- Status in the briefing: `PROPOSED`

## Context

An application of the principle in
[0003](0003-primitives-not-workarounds.md): every common workaround in Obsidian
is a symptom of a missing primitive. The briefing proposes a catalog, still
unconfirmed.

## Decision (proposed, not confirmed)

Verso implements primitives; specific features come as first-party plugins.

| Primitive | Replaces |
|---|---|
| Typed note: `type:` in the frontmatter + schema in a text file in the folder; with no schema, it is plain Markdown | Dataview, Templater, statblocks |
| Stable block ID, with backlinks and presence in the graph | open request on the Obsidian forum since 2020 |
| Typed relation: edge with type and direction; several relations between the same two nodes | links with no semantics |
| Time as a first-class citizen: daily and periodic notes | Periodic Notes, Calendar |
| Structured views that can materialize their output as real Markdown in the file | query results invisible to git, search and agents |
| Write provenance in the frontmatter: author, model, when | no equivalent |

## Consequences

- Each primitive needs its own ADR before being implemented; this ADR only
  records the catalog.
- Three items depend on syntax that is still `[OPEN]`: typed relation, format
  and location of schemas, and per-block visibility (`docs/spec/dialect.md`).
- "With no schema, it is plain Markdown" is what keeps compatibility with
  Obsidian vaults ([0012](0012-files-are-source-of-truth.md)).
- A block ID with backlinks and presence in the graph is a prerequisite for
  agent-verifiable citation ([0018](0018-llm-native-mcp-in-core.md)). "Stable"
  is only true for a `^id` written in the file: an ID that lived only in the
  index would be lost on a rebuild
  ([0011](0011-config-outside-tree-index-as-cache.md)),
  and an ID written by the app on open would violate
  [0012](0012-files-are-source-of-truth.md).
  A block with no `^id` is cited by position.
- Write provenance records personal data (the author) in a file that goes
  through sync, export and sharing with players. That primitive's own ADR has
  to say what is recorded and whether it is opt-in.
- Typed note (item 2.6 of Phase 2) requires promoting this catalog row to its
  own ADR, Accepted, before it is implemented — the roadmap lists that among
  the Phase 2 decisions.
- Nothing in this catalog is in Phase 1, except what the parser and the index
  need to expose ([0034](0034-roadmap-in-phases.md)).

## Discarded alternatives

- Reproducing Dataview, Templater, Periodic Notes and statblocks as
  third-party plugins — that is the situation that motivates the catalog
  (§5.3, §16.1).

## Status

Proposed.
