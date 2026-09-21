# ADR 0028 — Crate structure

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §14.2, §10.1
- Status in the briefing: `DECIDED`

## Context

The inviolable rules ([0026](0026-core-ui-contract-inviolable-rules.md))
only hold if they are mechanically verifiable. The crate boundary is the
cheapest mechanism for that in Rust: what a crate does not depend on, it does
not do.

## Decision

```
crates/
├── verso-dialect   # pure parser: no IO, no async
├── verso-index     # SQLite/FTS5, graph
├── verso-fs        # opaque handles, watcher, atomic write, confinement
├── verso-core      # orchestrates and exposes the contract
└── verso-cli       # index, search, backlinks, mcp
```

## Consequences

- `verso-dialect` with no IO and no async is what makes it fuzzable and
  compilable to WASM, mitigating the divergence between the editor's parser and
  the index's parser ([0023](0023-stack-core-and-editor.md), §10.3).
- Access to the files of the open folder confined to `verso-fs` stops being a
  convention and becomes two checks: absence of a file IO dependency outside
  `verso-fs`, auditable in `Cargo.toml`, and a clippy lint denying `std::fs`
  outside `verso-fs` ([0029](0029-guardrails-in-ci.md)). The exact scope of the
  rule, with the exceptions for the index and the config, is in
  [0026](0026-core-ui-contract-inviolable-rules.md).
- `verso-index` depends on SQLite and opens the index file; that is inside the
  delimited scope of rule 5, it is not a violation.
- The order of Phase 1 follows the structure: dialect, fs, index, cli
  ([0034](0034-roadmap-in-phases.md)).
- Any new dependency needs a justification in the PR and goes into the
  `cargo-deny` allowlist ([0029](0029-guardrails-in-ci.md),
  [0033](0033-pr-workflow.md)).

## Discarded alternatives

None recorded. (A single crate with modules was not evaluated; the five-crate
structure came decided from the briefing.)

## Status

Accepted.
