# ADR 0028 — Crate structure

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §14.2, §10.1
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-23 — the workspace's two other members recorded, at the
  maintainer's request (`docs/review/phase-2.md` §6, item 10); the five
  crates and their rules are unchanged. 2026-10-09 — two crates for the
  server, decided by the maintainer with the acceptance of
  [0073](0073-self-hosted-server-first.md), which had left where the
  service's session table and dispatch live `[OPEN]` here; the five crates
  and their rules are unchanged. 2026-10-21 — `crates/verso-cloud` recorded,
  the cloud remotes of [0104](0104-external-cloud-storage-transports-and-quotas.md);
  the five crates and their rules are unchanged.

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

**A sixth crate, decided on 2026-09-22 by the maintainer**
(`docs/reference/bench-decision.md` §9, line 4): `crates/verso-bench`,
`publish = false`, not part of the product — the synthetic vault generator and
the benchmark of feature 5. It carries its own `clippy.toml` declaring why it
may call `std::fs`: it writes only into a temporary directory it created
itself, never into an open folder, which is what invariant 5 protects. The
same shape as the exceptions `verso-fs` and `verso-index` already carry. No
benchmark harness dependency; `divan` is named as the fallback if statistics
later justify one.

**The workspace's other members, recorded on 2026-09-23 at the maintainer's
request** (`docs/review/phase-2.md` §6, item 10; the answer: *"a e b ok"*).
Besides the five crates of the core and `verso-bench`, the workspace has two
more, and eight members in all:

- `crates/verso-contract` — the contract's types, plain data with `serde` and
  `specta` and no IO, shared by the host and the generated TypeScript
  ([0026](0026-core-ui-contract-inviolable-rules.md) rule 3,
  [0038](0038-ts-type-generation.md)); the core keeps its own types, which
  the host maps onto these.
- `app/src-tauri` — the Phase 2 desktop host. It reaches the notes only
  through `verso-core`, touches no file of the open folder (rule 5), and has
  no `clippy.toml` of its own, so the workspace's `std::fs` lint applies to it
  unchanged.

Neither changes what the five crates may do.

**Two crates for the server, decided on 2026-10-09 by the maintainer**
([0073](0073-self-hosted-server-first.md) item 2, accepted that day; the
answer to the plan's B was the recommendation):

- `crates/verso-service` — the session table and the command dispatch,
  moved out of `app/src-tauri`. Transport-free: no network and no async
  runtime. The Tauri host and the server both call it.
- `crates/verso-server` — HTTP and WebSocket, the accounts, the sessions
  and the server's database. It touches no file of a folder directly: it
  reaches them through `verso-service`, `verso-core` and `verso-fs`. It
  opens only its own database in `VERSO_DATA_DIR`
  ([0075](0075-server-packaging-and-storage.md) item 3), an exception of
  the same kind as `verso-index`'s index file (rule 5 of
  [0026](0026-core-ui-contract-inviolable-rules.md), revised the same
  day); a `std::fs` exception, if it needs one, is declared in its pull
  request ([0029](0029-guardrails-in-ci.md)).

`verso serve` is a subcommand of the `verso` binary that `verso-cli`
already builds, not a binary of its own
([0075](0075-server-packaging-and-storage.md) item 1). Neither crate
changes what the five crates may do.

**A crate for the cloud remotes, 2026-10-21** ([0104](0104-external-cloud-storage-transports-and-quotas.md),
built that day):

- `crates/verso-cloud` — the cloud remotes of ADR 0104 (WebDAV, S3),
  host-side. `verso-core` and `verso-fs` never depend on it; it touches no
  disk. It does not change what the five crates may do.

## Discarded alternatives

None recorded. (A single crate with modules was not evaluated; the five-crate
structure came decided from the briefing.)

## Status

Accepted.
