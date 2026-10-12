# ADR 0018 — LLM-native: MCP server in the core, structured query, reviewed writes

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §7
- Status in the briefing: `DECIDED`

## Context

Stated requirement: an agent has to navigate and make use of the folder's
content as well as a person does. That is different from "having AI": it means
the structure that serves the person is the same one that serves the agent.

## Decision

1. MCP server in the core, not in a plugin: search, read, walk the graph, query
   by type.
2. Structured query (type, properties, relations) before similarity search.
3. Block IDs allow verifiable citation, with a link back to the exact position.
4. Agent writes: a diff with review before applying, provenance recorded,
   permission declared.
5. Model endpoint brought by the user; no fixed model.

## Consequences

- MCP in the core implies that the core↔UI contract and the MCP surface share
  the same queries
  ([0026](0026-core-ui-contract-inviolable-rules.md)).
- Phase 1 delivers `verso mcp` read-only, with no UI: search, read and walk
  the graph ([0034](0034-roadmap-in-phases.md)). **Query by type** depends on
  typed notes and on the schema format (spec Q11), decided only in Phase 2; it
  enters MCP when typed notes do.
- Verifiable citation has two forms: by `^id`, when the block has one written
  in the file; by **position** (line and column, in the form defined in
  `docs/spec/dialect.md` §4), when it does not. An ID that lived only in the
  index would not be stable (the index is a cache,
  [0011](0011-config-outside-tree-index-as-cache.md)), and an ID written
  by the app would violate "opening never rewrites"
  ([0012](0012-files-are-source-of-truth.md)). So the parser produces
  positions from Phase 1 on, and the fixtures test them.
- The folder's content is untrusted input for the agent (downloaded packs,
  players' notes, pasted text). The diff before applying is the recorded
  mitigation and cannot be bypassed
  ([0045](0045-server-and-mcp-security.md)).
- MCP transport, exposed surface and supported protocol version are `[OPEN]`
  in [0045](0045-server-and-mcp-security.md), to be decided before
  feature 6 of Phase 1. *(Decided for `verso mcp` on 2026-09-22: stdio,
  seven read-only tools, the version `initialize` negotiates — 0045.)*
- "Structured query before similarity" defines the implementation order: index
  and graph before any embedding.
- Agent writes fall under the same diff rule as conversions
  ([0012](0012-files-are-source-of-truth.md)).
- On mobile there is no resident process: MCP is remote or in-process
  ([0009](0009-external-constraints.md)).

**Citation and staleness as the feature 6 code implements them. Recorded on
2026-09-22 from the feature 6 code — provisional, the maintainer decides**
(§3.4 and §6 of `docs/reference/mcp-decision.md`). This is what the code does,
not a decision.

- **`read_note` returns numbered lines.** Each line arrives as
  `{ "n": 12, "text": "…" }`, so the number a model cites is **read from the
  payload, not counted**. Beside them come the note's headings and its `^id`
  blocks, each with `line` and `col`, 1-based, `col` counting Unicode scalar
  values (`docs/spec/dialect.md` §4.4). Both citation forms are therefore in one
  answer: the `^id` when the block has one, the position when it does not.
- **No `^id` is invented.** No tool proposes an id for a block that has none,
  which would be the app rewriting a file on read
  ([0012](0012-files-are-source-of-truth.md)).
- **`stale: true`** when the file's stamp — modified time, length, hash —
  differs from the one the index holds. It is one boolean, and it tells the
  model that the graph answers it got may predate the text it is reading, and
  that calling `index` fixes that. There is no watcher in feature 6
  ([0044](0044-verso-fs-semantics.md)).
- **`unverified: true`** when the index holds the note only as a last known
  version, because a placeholder stood where it was
  ([0043](0043-placeholder-guard.md)).
- **A placeholder is an error, never empty text.** `read_note` on a note whose
  content has not been downloaded answers "content not available"; a model is
  never handed an empty note it could read as a deletion
  ([0043](0043-placeholder-guard.md)).
- **There is no write tool in Phase 1**, so the diff-before-apply mitigation
  above is not exercised, and nothing the model reads can cause a write.

## Discarded alternatives

- MCP as a plugin — discarded explicitly in §7.
- Similarity search as the main path — discarded in §7, which places it after
  structured query.
- Embedded model or fixed provider — discarded in §1
  ([0002](0002-negative-scope.md)).

## Status

Accepted.
