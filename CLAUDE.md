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

### When to stop and ask
Stopping is the correct behavior, not a failure, when:
- A fixture looks wrong (`fixtures/**/expected.yaml` or `input.md`).
- The needed decision is `PROPOSED` or `[OPEN]`.
- Two documents contradict each other.
- The work requires violating an invariant or turning off a guardrail.
- The work is outside the current phase of [`docs/roadmap.md`](docs/roadmap.md).
- The solution would require knowing how Obsidian works on the inside ([ADR 0009](docs/adr/0009-external-constraints.md)).

---

## 2. Invariants

Violating an invariant is **BLOCKING** by definition, with no discussion of merit.

### 2.1 Architecture — [ADR 0026](docs/adr/0026-core-ui-contract-inviolable-rules.md), [ADR 0073](docs/adr/0073-self-hosted-server-first.md)
1. The UI only talks to the core through the contract (`crates/verso-contract` -> `crates/verso-service`). No shortcuts.
2. The UI does not assume which side of the wire the core is on; latency and
   availability come from capabilities ([ADR 0027](docs/adr/0027-runtime-capabilities.md)).
3. The contract is defined first; TypeScript types (`app/ui/src/bindings.ts`) are generated from Rust via `specta`, never written by hand.
4. The contract filesystem API separates access from identity: access capability is an opaque handle (or authenticated session + folder role on a server); notes are named by path relative to the open folder. Absolute paths or paths with `..` never cross the contract.
5. Access to the **files of the open folder** happens only inside `crates/verso-fs`. (Exceptions: index database in `verso-index`, sidecar config in `verso-core`, server database in `verso-server`, app logs/updates/resolv_conf in `app/src-tauri`, and the downloaded `cloudflared` in `crates/verso-tunnel` (`src/files.rs`, ADR 0117 D4.2; moved from `app/src-tauri/src/tunnel/` with its exception, 2026-11-14)). `verso-dialect` has no IO or async at all.
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
15. Any new fixture follows the schema in `docs/spec/dialect.md` §4 and is marked as an AI draft on line 1 until approved. A fixture answering an `[OPEN]` spec question only enters in the PR that closes that question (updating `docs/spec/dialect.md` §9 in the same PR). A fixture of behavior compatible with Obsidian records in `observed:` how it was verified.

### 2.5 Scope — [ADR 0034](docs/adr/0034-roadmap-in-phases.md)
16. Out of scope until after V1: third-party plugin execution and the compatibility shim. Do not implement unrequested features "since it is cheap".

---

## 3. Guardrails & coding constraints

Two groups ([ADR 0029](docs/adr/0029-guardrails-in-ci.md), [ADR 0067](docs/adr/0067-source-files-stay-small.md)): **workspace** guardrails and **feature** guardrails. Every feature guardrail enters in the same PR as the feature it protects and must be seen failing before the PR merges.

| Guardrail | Enforces | Command / Script |
|---|---|---|
| Formatting | No formatting diffs hiding logic | `cargo fmt --all --check` |
| Memory safety | `unsafe_code = "forbid"` workspace-wide (exceptions: native clipping in `app/src-tauri/src/web_clip/{macos,windows}.rs`, and OS audio capture in `app/src-tauri/src/audio_share/{macos,windows,linux}.rs` (ADR 0116, Q9), all with `SAFETY:` comments) | `node scripts/check-unsafe.mjs` |
| No panics in prod | Clippy `-D warnings`; `unwrap_used` and `expect_used` denied outside tests | `cargo clippy --workspace --all-targets --all-features --locked -- -D warnings` |
| Folder confinement | `std::fs` denied outside `verso-fs` (declared exceptions: sidecar, data, update, log, resolv_conf, verso-tunnel/src/files) | Enforced in `scripts/check.sh` |
| Source file size limit | Every source file (`.rs`, `.ts`, `.tsx`, `.js`, `.mjs`, `.css`) under **1500 lines** ([ADR 0067](docs/adr/0067-source-files-stay-small.md)) | `node scripts/check-sizes.mjs` |
| Dependency & license safety | Licenses allowlisted; security advisories denied (an exception in `deny.toml` or `app/ui/audit-exceptions.json` requires justification, link and expiry) | `cargo deny check`, `node scripts/check-npm-licenses.mjs`, `node scripts/check-npm-audit.mjs` |
| Public docs mirror & links | Public documents mirrored in `docs/pt-BR/` with same headings; all relative links across `.md` files resolve ([ADR 0008](docs/adr/0008-documentation-language.md)) | `bash scripts/check-docs-mirror.sh` |
| Dialect fixtures | Fixture structure, keys, and no unapproved draft on `main` ([ADR 0031](docs/adr/0031-fixtures-as-contract.md)) | `bash scripts/check-fixtures.sh` |
| Demo vault tutorial | Demo vaults (`demo-vault/` and `demo-vault-en/`) hold together, embeds and boards valid ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md)) | `node scripts/demo-vault.mjs check` |
| Theme catalogue | Shipped `.verso-theme` files pass contrast floor (3:1), allowed licences and SHA-256 listing ([ADR 0109](docs/adr/0109-themes-v2-more-tokens-and-a-catalogue.md)) | `node scripts/check-theme-catalogue.mjs` |
| Release page | Release page matches workflow artifacts ([ADR 0051](docs/adr/0051-development-flow-and-releases.md)) | `node --test scripts/release-page.test.mjs` |
| Generated types | TypeScript types match Rust contract ([ADR 0026](docs/adr/0026-core-ui-contract-inviolable-rules.md)) | Generated via `verso-app --export-bindings` |
| WebAssembly | Parser compiles to WASM without IO | `cargo check --target wasm32-unknown-unknown -p verso-dialect` |

**Zero bypass rule:** Never silence a guardrail with a local `#[allow]`, a subprocess wrapper for a denied API, or by weakening tests.

---

## 4. Codebase structure & fast dev loop

### Crate & directory map ([ADR 0028](docs/adr/0028-crate-structure.md))
```
crates/
├── verso-dialect   # Pure Markdown parser: no IO, no async, compiles to wasm32
├── verso-index     # SQLite/FTS5 full-text search, backlinks, block ^id index, graph
├── verso-fs        # Opaque handles, watcher, atomic writes, confinement
├── verso-core      # Orchestrates dialect, index, fs; exposes core logic
├── verso-contract  # Contract types (Specta-annotated, no IO)
├── verso-service   # Command dispatch & session management (transport-free)
├── verso-tunnel    # Cloudflare's cloudflared for the internet link, both hosts (ADR 0117 D4.2)
├── verso-cloud     # Cloud remotes (WebDAV, S3; ADR 0104), host-side, no disk; core/fs never depend on it
├── verso-server    # HTTP/WebSocket server (UniVerso), accounts, rooms, table log, data DB
├── verso-cli       # Subcommands: index, search, backlinks, mcp, serve
└── verso-bench     # Benchmarks (never shipped)

app/
├── src-tauri/      # Desktop host (Tauri v2, macOS/Windows/Linux platform code)
└── ui/             # CodeMirror 6, Excalidraw, bases, UI modules
    ├── themes/catalogue/ # Built-in .verso-theme files (ADR 0109)
    └── src/
        ├── leaves/     # Note, board, base, folder, PDF, graph, datagraph views
        ├── dialogs/    # Switcher, palette, settings, access, world wizard
        ├── board/      # Canvas & Excalidraw integration
        ├── bases/      # Views over folder (tables, kanban, cards, map layout)
        ├── blocks/     # Drag handles, block menus, Notion-style blocks
        ├── editor/     # CodeMirror extensions, autocomplete, Live Preview, swatches
        ├── dice/       # Dice notation parser & Rolai profile engine
        ├── dice3d/     # Lazy 3D dice physics overlay (three + cannon-es, ADR 0101)
        ├── oracle/     # Creative oracles engine (ADR 0102)
        ├── statblock/  # Visual statblocks & card rendering (ADR 0099)
        ├── bundles/    # Project wizard template bundles (ADR 0098)
        ├── theme/      # Appearance tokens, gallery & theme builder (ADR 0100, 0109)
        ├── datagraph/  # Structured data diagram viewer (ADR 0106)
        ├── table/      # Shared campaign table, roll & chat log (ADR 0107, 0110, 0113)
        ├── harness/    # In-memory test harness mocking core IPC
        ├── bindings.ts # Generated TypeScript contract types
        └── strings.ts  # Bilingual UI string catalog (pt-BR / EN)
```

- `verso-server` never touches folder files directly, only through `verso-service` → `verso-core` → `verso-fs`, and opens only its own database in `VERSO_DATA_DIR`.
- A new dependency requires justification in the PR, stating what it replaces in our own code and confirming that its license passes `cargo-deny`.

### Fast verification commands
- **UI type-check & build:** `cd app/ui && npm run check && npm run build`
- **UI unit tests:** `cd app/ui && npm test` (single file: `node --test app/ui/test/<name>.test.mjs`)
- **Single Rust crate check/test:** `cargo test -p <crate>` / `cargo clippy -p <crate> --all-targets -- -D warnings`
- **Regenerate TypeScript bindings (when contract changes):**
  `cargo run -q --locked -p verso-app -- --export-bindings app/ui/src/bindings.ts`
- **Rebuild demo vault boards & embed:**
  `node scripts/demo-vault.mjs build && node scripts/demo-vault.mjs check`
- **Full pre-push verification:**
  `scripts/check.sh` (native guardrails; then the E2E suites through `scripts/check-e2e.sh` when Docker runs, `--no-e2e` to leave them out)
  `scripts/check-e2e.sh` (UI harness + server E2E in Playwright's Linux image, 3 workers; never run Playwright directly on the Mac)
  `scripts/check-linux.sh` (Runs build and checks in the prebuilt `verso-ci` image, `scripts/ci/Dockerfile`, via Docker)
  `scripts/check-windows.sh` (When platform code changes, runs over SSH on `verso-win`)

---

## 5. User-visible changes, tutorial & PR workflow

### Mandatory tutorial & user-facing updates ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md))
Every change a user can see must update:
1. **Bilingual UI strings:** Add both pt-BR and EN entries in `app/ui/src/strings.ts` ([ADR 0035](docs/adr/0035-cross-cutting-requirements.md)).
2. **Changelog:** Add an entry under `## Unreleased` in `CHANGELOG.md`, in English only; `docs/pt-BR/CHANGELOG.md` gets the entries translated when a version is cut ([ADR 0008](docs/adr/0008-documentation-language.md) item 2a).
3. **The demo vault tutorials (`demo-vault/` and `demo-vault-en/`):**
   - Add or update the lesson note in both `demo-vault/` (pt-BR) and `demo-vault-en/` (EN), paired in `scripts/demo-vault/names.mjs`.
   - Update `scripts/demo-vault/tour.mjs` (and `scripts/demo-vault/treino.mjs` for board features).
   - Rebuild the demo vaults: `node scripts/demo-vault.mjs build` and verify `node scripts/demo-vault.mjs check`. (Never edit the generated `.canvas` files or `app/ui/src/demoVault*.ts` by hand).
   - **The site's wiki is made from these vaults** ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md) points 16–18): when a lesson, or a rule or behaviour a lesson describes, changes, import the wiki again in the `versomd-site` repository (its README says how) and read the wiki pages that describe it. A page the wiki needs (questions, problems, install) is a vault note in both languages, never a hand-written copy on the site.
4. **Walkthrough & tests:**
   - Add verification steps to [`docs/reference/demo-vault-walkthrough.md`](docs/reference/demo-vault-walkthrough.md).
   - Add IPC command response in `app/ui/src/harness/` if contract commands were added.
   - Add automated test in `app/ui/e2e/`.
   - List any platform-only checks in [`docs/reference/manual-checks.md`](docs/reference/manual-checks.md).
5. **Install:** On macOS, end with the beta installed via `scripts/install-beta.sh` only, never a hand-copied binary ([ADR 0051](docs/adr/0051-development-flow-and-releases.md)); a browser harness or dev copy is not the app.

### Pull request & review workflow ([ADR 0032](docs/adr/0032-author-and-reviewer-roles.md), [ADR 0033](docs/adr/0033-pr-workflow.md), [ADR 0051](docs/adr/0051-development-flow-and-releases.md))
- Use `.github/pull_request_template.md`: What / Why / Discarded alternatives / How to verify / Rust concept used (explained for a learner).
- When touching paths, filesystem, processes, or keyboard bindings, consult [`docs/reference/cross-platform-checklist.md`](docs/reference/cross-platform-checklist.md).
- Review findings are classified as **BLOCKING** (violates invariant/guardrail/decision or loses data; blocks merge), **IMPORTANT** (must be resolved or explicitly deferred with a record), or **MINOR** (author's discretion).
- Merge conditions: Green CI + No open BLOCKING finding + The maintainer can explain the PR in their own words (DCO `Signed-off-by` is the maintainer's; no AI signature).
- Merge with a merge commit (never squash or rebase: documents cite commits by hash).
- Versions are cut only when the maintainer asks: `node scripts/release.mjs prepare X.Y.Z[-beta.N]`.

---

## 6. Language policy — [ADR 0008](docs/adr/0008-documentation-language.md)

1. **Internal engineering documentation is English only:**
   `CLAUDE.md`, `AGENTS.md`, `.github/pull_request_template.md`, `docs/roadmap.md`, `docs/BRIEFING.md`, `docs/adr/`, `docs/spec/`, `docs/reference/`, and `docs/review/` are maintained exclusively in English.
2. **Public-facing documents are mirrored in pt-BR:**
   `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and `SECURITY.md` have an equivalent pt-BR twin under `docs/pt-BR/` with identical heading structure and valid links, verified by `scripts/check-docs-mirror.sh`.
3. **Product localization:** The app UI and the demo vault tutorials (`demo-vault/` in pt-BR and `demo-vault-en/` in English, [ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md)) are bilingual ([ADR 0035](docs/adr/0035-cross-cutting-requirements.md)).
