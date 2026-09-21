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
  feature 6 of Phase 1.
- "Structured query before similarity" defines the implementation order: index
  and graph before any embedding.
- Agent writes fall under the same diff rule as conversions
  ([0012](0012-files-are-source-of-truth.md)).
- On mobile there is no resident process: MCP is remote or in-process
  ([0009](0009-external-constraints.md)).

## Discarded alternatives

- MCP as a plugin — discarded explicitly in §7.
- Similarity search as the main path — discarded in §7, which places it after
  structured query.
- Embedded model or fixed provider — discarded in §1
  ([0002](0002-negative-scope.md)).

## Status

Accepted.
