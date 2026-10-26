# CLAUDE.md — Verso

Instructions for any AI session working in this repository.

Source of everything here: `docs/BRIEFING.md` and `docs/adr/`. This page creates
no new rule; it concentrates what has already been decided, in the form in which
it has to be obeyed. If anything here has no Accepted ADR behind it, that is a
review finding.

**The maintainer is the final authority.** The AI writes; the maintainer decides.

---

## 1. Rule zero & execution modes

### Rule zero: do not invent decisions
1. Nothing that is not in the briefing or in an ADR becomes a decision. When in
   doubt, record it as `[OPEN]` and ask.
2. Do not promote `PROPOSED` to `DECIDED`, and do not close an `[OPEN]`. Only
   the maintainer does that.
3. On finding a contradiction between documents, record the contradiction in the
   PR; do not pick a side.
4. A "discarded" alternative is only recorded if someone actually considered it.
   Without that: "None recorded".

### Execution modes (Fast Path vs. Architecture Path)
- **Fast Path (direct tasks, bugfixes, UI tweaks, maintainer-requested changes):**
  Proceed directly to the code and tests. Do not block or perform extensive ADR
  searches unless the change touches an invariant, security boundary, or Core↔UI
  contract.
- **Architecture Path (new primitives, contract changes, data/sync semantics):**
  Read the relevant ADR from [`docs/adr/README.md`](docs/adr/README.md) first. If
  the required decision is `PROPOSED` or `[OPEN]`, ask before implementing.

---

## 2. Invariants

Violating an invariant is **BLOCKING** by definition, with no discussion of merit.

### 2.1 Architecture — [ADR 0026](docs/adr/0026-core-ui-contract-inviolable-rules.md), [ADR 0073](docs/adr/0073-self-hosted-server-first.md)
1. The UI only talks to the core through the contract (`crates/verso-contract` -> `crates/verso-service`). No shortcuts.
2. The UI does not assume which side of the wire the core is on; latency and
   availability come from capabilities ([ADR 0027](docs/adr/0027-runtime-capabilities.md)).
3. The contract is defined first; TypeScript types (`app/ui/src/bindings.ts`) are generated from Rust via `specta`, never written by hand.
4. The contract filesystem API separates access from identity: access capability is an opaque handle (or authenticated session + folder role on a server); notes are named by path relative to the open folder. Absolute paths or paths with `..` never cross the contract.
5. Access to the **files of the open folder** happens only inside `crates/verso-fs`. (Exceptions: index database in `verso-index`, sidecar config in `verso-core`, server database in `verso-server`, app logs/updates/resolv_conf in `app/src-tauri`). `verso-dialect` has no IO or async at all.
6. Plugins never access disk directly.

### 2.2 Data — [ADR 0012](docs/adr/0012-files-are-source-of-truth.md), [ADR 0043](docs/adr/0043-placeholder-guard.md)
7. Opening a file never rewrites it. No silent normalization of frontmatter, line endings or spacing on the read path.
8. Conversion only by user action, with a visible diff. (Also applies to writing by an agent).
9. Writing to disk is atomic: temporary file, `fsync` of file and directory (`FlushFileBuffers` on Windows, [ADR 0069](docs/adr/0069-windows-port.md)), `rename`.
10. A placeholder file from on-demand cloud storage (iCloud, OneDrive/Windows cloud attributes) is never interpreted as a deletion ([ADR 0043](docs/adr/0043-placeholder-guard.md)).
11. Optimistic concurrency check: every write verifies that the file on disk matches what was read (mtime+size, or hash/revision). If modified externally, show a diff rather than overwriting.

### 2.3 Dialect — [ADR 0030](docs/adr/0030-base-dialect-obsidian-compatible.md), [ADR 0009](docs/adr/0009-external-constraints.md)
12. Verso extends the Obsidian dialect; it never contradicts it. No extension changes the meaning of an existing construct.
13. Admissible sources on Obsidian behavior: public API (`obsidian.d.ts`, MIT), public documentation, outside observation, and open-source plugins Obsidian publishes under MIT (e.g. `obsidianmd/obsidian-maps`). Inspecting, decompiling or unminifying the Obsidian binary is **forbidden** ([ADR 0009](docs/adr/0009-external-constraints.md)).

### 2.4 Fixtures — [ADR 0031](docs/adr/0031-fixtures-as-contract.md)
14. **Never change `fixtures/**/expected.yaml` or `input.md` without the maintainer's explicit approval.** If code disagrees with the fixture, the code is wrong until the maintainer says otherwise. If a fixture looks wrong: **stop, do not edit, ask**.
15. Any new fixture follows the schema in `docs/spec/dialect.md` §4 and is marked as an AI draft on line 1 until approved.

### 2.5 Scope — [ADR 0034](docs/adr/0034-roadmap-in-phases.md)
16. Out of scope until after V1: third-party plugin execution and the compatibility shim. Do not implement unrequested features "since it is cheap".

---

## 3. Guardrails & coding constraints

The CI and workspace guardrails ([ADR 0029](docs/adr/0029-guardrails-in-ci.md), [ADR 0067](docs/adr/0067-source-files-stay-small.md)) protect codebase integrity:

| Guardrail | Enforces | Command / Script |
|---|---|---|
| Formatting | No formatting diffs hiding logic | `cargo fmt --all --check` |
| Memory safety | `unsafe_code = "forbid"` workspace-wide (single exception: native clipping in `app/src-tauri/src/web_clip/{macos,windows}.rs` with `SAFETY:` comments) | `node scripts/check-unsafe.mjs` |
| No panics in prod | Clippy `-D warnings`; `unwrap_used` and `expect_used` denied outside tests | `cargo clippy --workspace --all-targets --all-features --locked -- -D warnings` |
| Folder confinement | `std::fs` denied outside `verso-fs` (declared exceptions: sidecar, data, update, log, resolv_conf) | Enforced in `scripts/check.sh` |
| Source file size limit | Every source file (`.rs`, `.ts`, `.tsx`, `.js`, `.mjs`, `.css`) under **1500 lines** ([ADR 0067](docs/adr/0067-source-files-stay-small.md)) | `node scripts/check-sizes.mjs` |
| Dependency & license safety | Licenses allowlisted; security advisories denied | `cargo deny check`, `node scripts/check-npm-licenses.mjs`, `node scripts/check-npm-audit.mjs` |
| Public docs mirror | Public documents mirrored in `docs/pt-BR/` with same headings; all links resolve ([ADR 0008](docs/adr/0008-documentation-language.md)) | `bash scripts/check-docs-mirror.sh` |
| Demo vault tutorial | Demo vault holds together, embeds and boards valid ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md)) | `node scripts/demo-vault.mjs check` |
| Generated types | TypeScript types match Rust contract ([ADR 0026](docs/adr/0026-core-ui-contract-inviolable-rules.md)) | Generated via `verso-app --export-bindings` |
| WebAssembly | Parser compiles to WASM without IO | `cargo check --target wasm32-unknown-unknown -p verso-dialect` |

**Zero bypass rule:** Never silence a guardrail with a local `#[allow]`, a subprocess wrapper for a denied API, or by weakening tests.

---

## 4. Codebase structure & fast dev loop

### Crate & directory map
```
crates/
├── verso-dialect   # Pure Markdown parser: no IO, no async, compiles to wasm32
├── verso-index     # SQLite/FTS5 full-text search, backlinks, graph
├── verso-fs        # Opaque handles, watcher, atomic writes, confinement
├── verso-core      # Orchestrates dialect, index, fs; exposes core logic
├── verso-contract  # Contract types (Specta-annotated, no IO)
├── verso-service   # Command dispatch & session management (transport-free)
├── verso-cloud     # Cloud remotes (WebDAV, S3; ADR 0104), host-side, no disk; core/fs never depend on it
├── verso-server    # HTTP/WebSocket server (UniVerso), accounts, rooms, data DB
├── verso-cli       # Subcommands: index, search, backlinks, mcp, serve
└── verso-bench     # Benchmarks (never shipped)

app/
├── src-tauri/      # Desktop host (Tauri v2, macOS/Windows/Linux platform code)
└── ui/             # CodeMirror 6, Excalidraw, bases, UI modules
    └── src/
        ├── leaves/     # Note, board, base, folder, PDF, graph views
        ├── dialogs/    # Switcher, palette, settings, world wizard
        ├── board/      # Canvas & Excalidraw integration
        ├── bases/      # Views over folder (tables, kanban, cards, map layout)
        ├── blocks/     # Drag handles, block menus, Notion-style blocks
        ├── editor/     # CodeMirror extensions, autocomplete, Live Preview
        ├── dice/       # Dice notation parser & Rolai physics integration
        ├── oracle/     # Creative oracles engine
        ├── statblock/  # Visual statblocks & card rendering
        ├── harness/    # In-memory test harness mocking core IPC
        ├── bindings.ts # Generated TypeScript contract types
        └── strings.ts  # Bilingual UI string catalog (pt-BR / EN)
```

### Fast verification commands
- **UI type-check & build:** `cd app/ui && npm run check && npm run build`
- **UI unit tests:** `cd app/ui && npm test` (single file: `node --test app/ui/test/<name>.test.mjs`)
- **Single Rust crate check/test:** `cargo test -p <crate>` / `cargo clippy -p <crate> --all-targets -- -D warnings`
- **Regenerate TypeScript bindings (when contract changes):**
  `cargo run -q --locked -p verso-app -- --export-bindings app/ui/src/bindings.ts`
- **Rebuild demo vault boards & embed:**
  `node scripts/demo-vault.mjs build && node scripts/demo-vault.mjs check`
- **Full pre-push verification:**
  `scripts/check.sh` (Note: macOS preflight requires closing open browsers/Verso app before running E2E tests)
  `scripts/check-linux.sh` (Runs build and checks in Linux container via Docker)
  `scripts/check-windows.sh` (When platform code changes, runs over SSH on `verso-win`)

---

## 5. User-visible changes, tutorial & PR workflow

### Mandatory tutorial & user-facing updates ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md))
Every change a user can see must update:
1. **Bilingual UI strings:** Add both pt-BR and EN entries in `app/ui/src/strings.ts` ([ADR 0035](docs/adr/0035-cross-cutting-requirements.md)).
2. **Changelog:** Add an entry under `## Unreleased` in `CHANGELOG.md` and under `## Não lançado` in `docs/pt-BR/CHANGELOG.md`.
3. **The demo vault tutorial (`demo-vault/`):**
   - Add or update the lesson note explaining the feature.
   - Update `scripts/demo-vault/tour.mjs` (and `scripts/demo-vault/treino.mjs` for board features).
   - Rebuild the demo vault: `node scripts/demo-vault.mjs build` and verify `node scripts/demo-vault.mjs check`. (Never edit `Tour do Verso.canvas`, `Treino do Board.canvas`, or `app/ui/src/demoVault.ts` by hand).
4. **Walkthrough & tests:**
   - Add verification steps to [`docs/reference/demo-vault-walkthrough.md`](docs/reference/demo-vault-walkthrough.md).
   - Add IPC command response in `app/ui/src/harness/` if contract commands were added.
   - Add automated test in `app/ui/e2e/`.
   - List any platform-only checks in [`docs/reference/manual-checks.md`](docs/reference/manual-checks.md).

5. **Install:** end with the beta installed via `scripts/install-beta.sh` only, never a hand-copied binary ([ADR 0051](docs/adr/0051-development-flow-and-releases.md)); a harness or dev copy is not the app.

### Pull request workflow ([ADR 0033](docs/adr/0033-pr-workflow.md), [ADR 0051](docs/adr/0051-development-flow-and-releases.md))
- Use `.github/pull_request_template.md`: What / Why / Discarded alternatives / How to verify / Rust concept used (explained for a learner).
- When touching paths, filesystem, processes, or keyboard bindings, consult [`docs/reference/cross-platform-checklist.md`](docs/reference/cross-platform-checklist.md).
- Merge conditions: Green CI + No open BLOCKING finding + The maintainer can explain the PR in their own words.
- Merge with a merge commit (never squash or rebase: documents cite commits by hash).
- Versions are cut only when the maintainer asks: `node scripts/release.mjs prepare X.Y.Z[-beta.N]`.

---

## 6. Language policy — [ADR 0008](docs/adr/0008-documentation-language.md)

1. **Internal engineering documentation is English only:**
   `CLAUDE.md`, `.github/pull_request_template.md`, `docs/roadmap.md`, `docs/BRIEFING.md`, `docs/adr/`, `docs/spec/`, `docs/reference/`, and `docs/review/` are maintained exclusively in English.
2. **Public-facing documents are mirrored in pt-BR:**
   `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and `SECURITY.md` have an equivalent pt-BR twin under `docs/pt-BR/` with identical heading structure and valid links, verified by `scripts/check-docs-mirror.sh`.
3. **Product localization:** The app UI is bilingual (pt-BR and EN, [ADR 0035](docs/adr/0035-cross-cutting-requirements.md)). The demo vault tutorial content is in pt-BR ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md)).
