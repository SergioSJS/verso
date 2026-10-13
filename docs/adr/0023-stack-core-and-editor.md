# ADR 0023 — Stack: Rust in the core, Tauri v2 as the shell, CodeMirror 6 in the editor, SQLite with FTS5 in the index

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §9, §10
- Status in the briefing: `DECIDED`

## Context

Verso needs a core that runs the same on desktop, on mobile and with no UI
(`verso serve`), and an editor with Live Preview equivalent to what the
audience already uses.

## Decision

| Item | Choice |
|---|---|
| Core | Rust |
| Shell | Tauri v2 (desktop and mobile) |
| Editor | CodeMirror 6 with Live Preview |
| Index | SQLite with FTS5 |

## Consequences

- The maintainer is a beginner in Rust (§10.3): the mitigation is mechanical
  guardrails, readable fixtures and independent review
  ([0029](0029-guardrails-in-ci.md), [0032](0032-author-and-reviewer-roles.md)).
- CodeMirror 6 brings Lezer, a parser in JS, while the index uses a parser in
  Rust: divergence between the two is a recorded risk, mitigated by the fixture
  corpus as a conformance suite for both
  ([0031](0031-fixtures-as-contract.md)).
- A single Tauri v2 for desktop and mobile keeps one shell, but does not erase
  the platform constraints ([0009](0009-external-constraints.md)).
- FTS5 requires escaping the search syntax and parameterized queries; it becomes
  a guardrail ([0029](0029-guardrails-in-ci.md)).
- The base parser in Rust has not been chosen yet
  ([0037](0037-base-parser.md), `[OPEN]`). *(Decided on 2026-09-21:
  `pulldown-cmark`, 0037 Accepted.)*
- The FTS5 tokenizer has to handle accents and case for pt-BR and EN before the
  benchmark's first baseline
  ([0046](0046-index-location-lifecycle-tokenizer.md), `[OPEN]`).
  *(Decided: 0046 accepted on 2026-09-22.)*
- Risks not assessed in the decision, recorded in the Phase 0 review (I4):
  Tauri v2 mobile is young; iOS's WKWebView imposes limits on CodeMirror 6 and
  on Web Workers that no document lists. The UI is reversible before Phase 2;
  those risks have to appear in the PR for item 2.2 before they stop being so.

- Workspace commitments made with the first `Cargo.toml` (roadmap 0.10):
  edition 2024, `rust-version = "1.98"`, toolchain pinned to an exact stable
  version in `rust-toolchain.toml` so that a new clippy cannot turn CI red
  with no PR to blame. Bumping any of them is a PR of its own.

## Discarded alternatives

None recorded: the briefing does not list other core, shell, editor or index
options that were evaluated. For the record, not as a discard: Electron
(shell), ProseMirror/Tiptap and Lexical (editor) were not evaluated.

## Status

Accepted.
