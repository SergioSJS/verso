# Verso roadmap — Archive of closed phases (Phases 0–3)

This document preserves the detailed execution history, decisions, and exit criteria of Phases 0, 1, 2, and 3, which have all been closed. For current planning, see [`docs/roadmap.md`](../roadmap.md).

---

## Phase 0 — Foundation

Documents, decisions and guardrails. **No feature at all.**

### Scope

| # | Deliverable | State |
|---|---|---|
| 0.1 | ADRs, one per briefing decision | done |
| 0.2 | `docs/spec/dialect.md` v0 | done |
| 0.3 | `docs/roadmap.md` | done |
| 0.4 | `CLAUDE.md` | done |
| 0.5 | `.github/pull_request_template.md` | done |
| 0.6 | Critical review of the documents by an independent session | done — `docs/review/phase-0.md`; findings accepted and applied |
| 0.7 | License decision and `LICENSE` file | done — Package A, MPL-2.0 + MIT in the SDK ([ADR 0005](../adr/0005-license.md), Accepted) |
| 0.8 | Documentation language decision | done — English source, pt-BR mirror ([ADR 0008](../adr/0008-documentation-language.md), Accepted) |
| 0.9 | Initial fixture corpus (5 cases) | done — five fixtures approved by the maintainer on 2026-09-21 |
| 0.10 | Cargo workspace with the five crates, empty | done — `fmt`, `clippy`, `test` and `deny` green (PR #2) |
| 0.11 | CI on macOS and Linux with workspace guardrails | done — baseline green on both OSes ([ADR 0029](../adr/0029-guardrails-in-ci.md)) |
| 0.12 | Documentation migration | done — canonical English paths, pt-BR twins under `docs/pt-BR/` |

### Exit criterion
Closed on 2026-09-21. All 5 criteria met:
1. No open BLOCKING finding (`docs/review/phase-0.md`).
2. `LICENSE` present at root (MPL-2.0).
3. CI green on macOS and Linux.
4. Workspace guardrails demonstrably firing.
5. Five fixtures approved.

---

## Phase 1 — Core via CLI, no UI

A core usable from the terminal and by an agent. **No window.**

### Scope

| # | Crate | Deliverable |
|---|---|---|
| 1 | `verso-dialect` | parsing of links, blocks, headings and frontmatter; round-trip; fuzz target |
| 2 | `verso-fs` | walk the folder, path confinement, atomic write |
| 3 | `verso-index` | SQLite schema, FTS5, backlinks |
| 4 | `verso-cli` | `verso index`, `verso search`, `verso backlinks` |
| 5 | bench | synthetic vault generator + baseline |
| 6 | `verso-cli` | read-only `verso mcp`: search, read, walk the graph |
| 7 | `verso-cli` | bilingual messages ([ADR 0035](../adr/0035-cross-cutting-requirements.md)); ships with feature 4 |

### Exit criterion
Closed on 2026-09-23. All criteria met:
1. Real vault indexed without error (`verso index`).
2. Backlinks matched manual expectations.
3. Guardrails green and demonstrably firing (parser fuzzing, round-trip, wasm32 check).
4. Notes queryable by Claude via `verso mcp`.
5. Fixture corpus green.

---

## Phase 2 — Walking skeleton on macOS

Desktop application on macOS and Windows port ([ADR 0069](../adr/0069-windows-port.md)).

### Scope

| # | Deliverable | State |
|---|---|---|
| 2.1 | Core↔UI contract defined first, with TS types generated from Rust | built (`crates/verso-contract`, Specta bindings) |
| 2.2 | Tauri v2 shell opening an arbitrary folder | built (dialog, CLI, last folder at startup) |
| 2.3 | File tree with full operations | built ([ADR 0048](../adr/0048-file-operations-in-ui.md)) |
| 2.4 | CodeMirror 6 editor with Live Preview | built (reading, edit and source modes) |
| 2.5 | Backlinks and search from core through contract | built (links, tags, unlinked mentions, graph) |
| 2.6 | One note type end to end | built ([ADR 0052](../adr/0052-typed-note.md)) |
| 2.7 | pt-BR and EN in UI; accessibility | built ([ADR 0035](../adr/0035-cross-cutting-requirements.md)) |
| Widened | Bases, board, make.md features, blocks | built ([ADR 0053](../adr/0053-views-bases.md), [ADR 0057](../adr/0057-board-json-canvas.md), [ADR 0060](../adr/0060-makemd-organizing-features.md), [ADR 0061](../adr/0061-blocks-in-edit-mode.md)) |

### Exit criterion
Declared closed on 2026-10-09 by the maintainer, with real-use validation carried forward into subsequent phases.

---

## Phase 3 — The Linux app, then the self-hosted server

Shipped Linux app, then built UniVerso self-hosted server ([ADR 0073](../adr/0073-self-hosted-server-first.md)).

### Scope

| # | Deliverable | ADR | State |
|---|---|---|---|
| 3.1 | Linux app | [0071](../adr/0071-linux-port.md) | Shipped in 0.6.0-beta.1 (2026-10-09) |
| 3.2 | `verso serve` (UniVerso) | [0073](../adr/0073-self-hosted-server-first.md), [0028](../adr/0028-crate-structure.md) | Built (`verso-service`, `verso-server`) |
| 3.3 | Accounts, access, auth, tokens | [0074](../adr/0074-accounts-and-access-on-the-server.md) | Built |
| 3.4 | Server security (TLS, confinement) | [0073](../adr/0073-self-hosted-server-first.md), [0044](../adr/0044-verso-fs-semantics.md) | Built |
| 3.5 | Packaging (Docker, .deb, .rpm, compose) | [0075](../adr/0075-server-packaging-and-storage.md) | Built |
| 3.6 | Desktop app connecting to server | [0074](../adr/0074-accounts-and-access-on-the-server.md) | Built |
| 3.7 | Responsive window on mobile/tablet & web | [0076](../adr/0076-the-window-on-every-screen.md) | Built |
| 3.8 | Simultaneous live note editing | [0073](../adr/0073-self-hosted-server-first.md) | Built |
| 3.9 | Watcher narrow re-index | [0073](../adr/0073-self-hosted-server-first.md) | Built |
| 3.10 | Admin console at `/admin` & quotas | [0077](../adr/0077-the-server-administration-console-and-folder-quotas.md) | Built |
| 3.11 | UniVerso naming and packaging | [0078](../adr/0078-universo-the-name-of-verso-as-a-server.md) | Built |
| 3.12 | Desktop folder sync with server | [0079](../adr/0079-sync-a-local-folder-with-a-server.md) | Built |
| 3.13 | Live co-editing of synced folder | [0082](../adr/0082-live-co-editing-of-a-synced-folder.md) | Built |
| 3.14 | Trash with expiry, restore, replaced versions | [0080](../adr/0080-the-trash-with-expiry-and-restore.md) | Built |
| 3.15 | Threat model refresh | [0073](../adr/0073-self-hosted-server-first.md) | Done |
| 3.16 | Path-based sharing between users | [0081](../adr/0081-sharing-between-people-on-one-universo.md) | Built |
| 3.17–3.25 | Server hardening, case sensitivity, board co-edit | [0081](../adr/0081-sharing-between-people-on-one-universo.md), [0070](../adr/0070-what-travels-with-the-folder.md), [0082](../adr/0082-live-co-editing-of-a-synced-folder.md) | Built |

### Exit criterion
Closed on 2026-10-14, handing built deliverables and carried pendencies (one month of real use, screen reader audit) to Phase 4 — V1.
