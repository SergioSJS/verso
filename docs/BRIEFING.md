# BRIEFING — Verso

> Version 0.8 · 2026-09-21
> Single source of the decisions made before the repository existed.
> Changes after the repository: only status changes and factual corrections,
> recorded in the History at the end. New boundaries and consequences live in
> the ADRs.
> Entry point to the ADRs, the dialect spec, the roadmap and `CLAUDE.md`.
> The maintainer is the final authority on any item in this document.
> English translation. The pt-BR original at `docs/pt-BR/BRIEFING.md` is authoritative where the two differ (ADR 0008).

## How to read this document

| Status | Meaning | How the AI must treat it |
|---|---|---|
| `DECIDED` | Chosen or explicitly accepted by the maintainer | ADR with status "Accepted" |
| `PROPOSED` | Recommended in discussion, without explicit confirmation | ADR with status "Proposed"; never treat as decided |
| `OPEN` | No decision | Record as `[OPEN]`; do not resolve on your own |
| `CONSTRAINT` | Imposed by a platform, a third-party license or terms of use; not a choice | Record as a constraint, citing the origin |

Rules for the AI:

1. Nothing that is not here becomes a decision. When in doubt, `[OPEN]`.
2. Do not promote `PROPOSED` to `DECIDED`. Only the maintainer does that.
3. When finding a contradiction between sections, record the contradiction; do not pick a side.

---

## 1. Vision

**What it is.** An open, cross-platform Markdown note app that opens any folder the way a code editor does and delivers natively what Obsidian users today assemble with plugins. Audience: people who organize notes, worldbuilding and journals, with special support for people who play and run tabletop RPGs.

**Why it exists.**

- An open tool that the community evolves without depending on a company. `DECIDED`
- A well-rounded experience without workarounds: what today requires a plugin must be a primitive of the app. `DECIDED`
- The maintainer likes building tools; the project is driven by that, not by revenue. `DECIDED`

**What it is not.**

- It is not an Obsidian clone. It is inspired by it and compatible with its vaults. `DECIDED`
- It does not promise to run every Obsidian plugin. `DECIDED`
- It has no paid service and no funding plan beyond donations. `DECIDED`
- It does not embed an LLM model and does not depend on a specific provider. `DECIDED`

---

## 2. Identity

| Item | Value | Status |
|---|---|---|
| Name | Verso | `DECIDED` |
| Domain | `verso.md` | `PROPOSED` — availability not verified |
| Package/org name if `verso` is taken | `verso-md` | `PROPOSED` |
| Subproject names | none until code exists; "Recto" discarded | `DECIDED` |

Known name collisions, outside the note app category: a .NET interactive notebook platform called Verso; the Verso browser built on Servo (archived); an image metadata editor in Perl.

---

## 3. Governance and license

| Item | Status | Detail |
|---|---|---|
| License | `DECIDED` | Package A (decided in v0.3, ADR 0005): MPL-2.0 for the core and the app, MIT for the plugin SDK. `LICENSE` at the root. |
| Package A | option | Core and app under MPL-2.0; plugin SDK under MIT. Use as a service does not require publishing changes. |
| Package B | option | Core and app under AGPL-3.0 with an explicit exception for plugins (additional permission, GPL-3.0 section 7); plugin SDK under MIT. Covers use over a network. |
| Tie-breaking criterion | context | MPL-2.0 (clause 3.3) allows combining MPL code into a larger work under AGPL-3.0 later; the MPL files stay MPL. Relicensing the whole project, in any direction, requires the consent of every contributor. (Corrected in v0.2; the original wording overstated the move from A to B.) |
| Plain GPL-3.0 | context | Does not cover use over a network, which the architecture with a server makes likely; that is why it does not appear in the packages. |
| Contribution model | `DECIDED` | DCO, no CLA. A CLA would allow relicensing, which contradicts the goal of having no company in the middle. Code written by AI enters through the same DCO, as long as whoever signs it has command of the code and takes responsibility for it (confirmed in v0.4, ADR 0006). |
| Funding | `DECIDED` | Ko-fi only. A donation does not buy a feature. |
| Repository visibility | `DECIDED` | Private until the license is decided. |
| Language of the repository documentation | `DECIDED` | English is the source; pt-BR is a first-class mirror in `docs/pt-BR/`, same structure and names. This briefing is the exception: the pt-BR original rules (decided in v0.5, ADR 0008). |

---

## 4. Constraints

| Constraint | Origin | Consequence |
|---|---|---|
| Do not inspect, decompile or deminify the Obsidian app | Obsidian's terms of use forbid reverse engineering to develop a competing product | Allowed sources: public API (`obsidian.d.ts`, MIT), public documentation, behavior observed from the outside |
| No access to an arbitrary folder on iOS | iOS sandbox | Document picker + security-scoped bookmarks |
| No external-change watcher equivalent to the desktop one on iOS | iOS | Refresh on user action or on returning to the app |
| Restricted background sync | iOS and Android | Mobile sync depends on the windows the OS allows |
| Slow bulk operations through the Storage Access Framework | Android | Large indexing on Android requires its own strategy |
| No Node on mobile | iOS and Android | A plugin that depends on Node is desktop-only |
| No resident process on mobile | iOS and Android | MCP on mobile is remote or in-process |
| A client secret cannot be kept in an open source app | OAuth | Google Drive and OneDrive require PKCE or the user's own client ID |
| App verification, per-application quota, weak rename and conflict semantics | Google Drive and OneDrive | They serve better as a backup destination than as continuous sync |
| tldraw cannot be used | Source-available license: license key in production, mandatory watermark, ban on relicensing | The board uses Excalidraw (MIT) |

---

## 5. Product principles

### 5.1 The folder is the unit, no vault

- Open any folder the way a code editor does; the root is the folder that was opened. `DECIDED`
- Config outside the tree, in the user configuration directory indexed by the folder path; no mandatory directory inside it. `DECIDED`
- The index is a rebuildable cache; deleting it loses no data. `DECIDED`
- Open from the command line, like `code .`: `verso <folder>`. `DECIDED`
- Workspace with multiple roots and links resolving across them. `PROPOSED`

### 5.2 Files are the source of truth

- Compatibility with Obsidian vaults, or explicit conversion where there is no compatibility. `DECIDED`
- Opening a file never rewrites it. Conversion only by user action, with a visible diff. `DECIDED`
- Every piece of structured data degrades to Markdown readable in any editor. `PROPOSED`

### 5.3 Primitives instead of features

Every common workaround in Obsidian is a symptom of a missing primitive. Verso implements primitives; specific features come as first-party plugins. `PROPOSED`

| Primitive | Replaces | Status |
|---|---|---|
| Typed note: `type:` in the frontmatter + schema in a text file in the folder; with no schema, it is plain Markdown | Dataview, Templater, statblocks | `PROPOSED` |
| Stable block ID, with backlinks and presence in the graph | an open request in the Obsidian forum since 2020 | `PROPOSED` |
| Typed relation: an edge with a type and a direction; several relations between the same two nodes | links without semantics | `PROPOSED` |
| Time as first class: journal and periodic notes | Periodic Notes, Calendar | `PROPOSED` |
| Structured views that can materialize the output as real Markdown in the file | query results invisible to git, search and agent | `PROPOSED` |
| Write provenance in the frontmatter: author, model, when | no equivalent | `PROPOSED` |

### 5.4 Schema packs

Schemas distributable as content (journal, worldbuilding, RPG systems). They solve the paralysis of starting with an empty app. `PROPOSED`

---

## 6. Plugins

- An own plugin system is central to the project. `DECIDED`
- Plugins in TypeScript, running in a Web Worker, with no direct disk access; all access goes through the core. `DECIDED`
- The manifest declares the required capabilities (e.g. `vault:read`, `vault:write`, `net:fetch`, `fs:external`), with consent at install time. `DECIDED`
- A format familiar to people who write Obsidian plugins (`manifest.json`, `main.js`, a base class with `onload`/`onunload`, command and settings registration), without binary compatibility. `PROPOSED`
- Compatibility shim for Obsidian plugins: a separate package, outside the core, covering only the public API, with a declared compatibility table. `PROPOSED`
- Lazy loading by default and load time visible per plugin. `PROPOSED`
- Platform flag in the manifest, equivalent to `isDesktopOnly`. `PROPOSED`
- The project's own features (sync, Foundry, RPG packs) are written as plugins; if they need privileged access, the API is wrong. `PROPOSED`
- Native plugin in WASM inside the core: a future possibility, not planned. `PROPOSED`

---

## 7. LLM-native

Requirement: an agent must navigate and make use of the folder's content as well as a person does. `DECIDED`

- MCP server in the core, not in a plugin: search, read, walk the graph, query by type. `DECIDED`
- Structured query (type, properties, relations) before similarity search. `DECIDED`
- Block IDs allow verifiable citation, with a link back to the exact position. `DECIDED`
- Agent writes: a diff reviewed before being applied, provenance recorded, permission declared. `DECIDED`
- Model endpoint brought by the user; no fixed model. `DECIDED`
- Generative features explicit and opt-in, given the RPG community's sensitivity to AI-generated content. `PROPOSED`
- API keys in the operating system keychain, never inside the folder. `PROPOSED`

---

## 8. Sync

- Native sync is essential, with an own server and with services such as Google Drive and OneDrive. `DECIDED`
- Merge engine in the core (it understands blocks, frontmatter and the file model); transports as plugins (own server, WebDAV, S3, Google Drive, OneDrive). `DECIDED`
- Candidate for the merge engine: Automerge. `PROPOSED`
- Layered config: shared (plugin list, schemas) and per device (hotkeys, layout). `PROPOSED`
- An on-demand storage placeholder file (iCloud, OneDrive) is never interpreted as a deletion. `DECIDED` (promoted in v0.2, ADR 0043)
- Sync stays out of scope until the end of Phase 2. `DECIDED`

---

## 9. Platforms and stack

| Item | Value | Status |
|---|---|---|
| Target platforms | macOS, Windows, Linux, iOS, Android | `DECIDED` |
| Initial platform | macOS | `DECIDED` |
| Per-platform limitations | acceptable, as long as they are explicit | `DECIDED` |
| Core | Rust | `DECIDED` |
| Shell | Tauri v2 (desktop and mobile) | `DECIDED` |
| Editor | CodeMirror 6 with Live Preview | `DECIDED` |
| Board | Excalidraw (MIT) as a free annotation layer | `DECIDED` |
| Board — semantic layer | nodes are notes, edges are typed relations; a free arrow can be promoted to a typed relation | `PROPOSED` |
| Board persistence | sidecar in JSON Canvas, with or without extensions | `OPEN` |
| Index | SQLite with FTS5 | `DECIDED` |
| TS type generation from Rust | ts-rs or specta | `OPEN` |
| Base parser | pulldown-cmark, comrak or our own | `DECIDED`: pulldown-cmark (v0.8, ADR 0037) |
| Server | the same core binary without UI (`verso serve`) | `PROPOSED` |
| Initial mobile | web client (PWA) served by the own server | `PROPOSED` |
| Indexing for mobile | a companion server indexes and delivers a ready index to the phone | `PROPOSED` |

---

## 10. Architecture

```
┌─ Rust core (native process) ──────────────────┐
│ fs + watcher · parser · SQLite/FTS5 index     │
│ graph · merge · MCP · sync                    │
└───────────────────┬───────────────────────────┘
                    │ contract: commands + events
                    │ (local IPC or remote WebSocket)
┌───────────────────┴───────────────────────────┐
│ Web UI: CM6 · Excalidraw · board · views      │
│ TS plugins in a Web Worker, no disk access    │
└───────────────────────────────────────────────┘
```

### 10.1 Inviolable rules `DECIDED`

1. The UI only talks to the core through the contract. No shortcuts.
2. The UI does not assume which side of the wire the core is on; latency and availability come from the capabilities.
3. The contract is defined first; TS types are generated from Rust.
4. The filesystem API works with opaque handles, never with a POSIX path as a string.
5. Disk access only inside the `verso-fs` crate.
6. Plugins never access the disk directly.

### 10.2 Runtime capabilities `PROPOSED`

- Queryable by the UI and by plugins (e.g. `fs:arbitrary`, `fs:watch`, `net:fetch`, `proc:spawn`, `bg:sync`, `offline`).
- A plugin manifest declares what it requires; the catalog filters by platform.
- The UI explains the absence of a feature instead of hiding it.

### 10.3 Known risks

| Risk | Mitigation |
|---|---|
| The editor parser (Lezer, in JS) diverges from the index parser (Rust) | A fixture corpus as a conformance suite for both; a pure Rust parser, compilable to WASM |
| The Obsidian API has synchronous reads; the contract is asynchronous | A read-only projection of the index on the JS side, fed by events |
| Maintainer new to Rust | Mechanical guardrails, readable fixtures, independent review |
| Scope and burnout | Small core, features as plugins, a one-month real-use gate |
| Data loss | Atomic writes, placeholder guard, opening never rewrites |

### 10.4 Decisions that are expensive to reverse

The license (after contributions), the file dialect (after vaults exist) and the plugin API (after plugins exist). They require more evidence than any other decision.

---

## 11. File dialect

### 11.1 Obsidian-compatible base `DECIDED`

Read and write without breaking:

- wikilinks: `[[nota]]`, `[[nota|alias]]`, `[[nota#seção]]`, `[[nota#^bloco]]`
- embeds: `![[...]]`
- callouts
- block definition: `^id`
- YAML frontmatter, including `tags` and `aliases`
- `.canvas` (JSON Canvas)

Verso extends this dialect; it never contradicts it.

### 11.2 Explicit conversion `PROPOSED`

| Source (Obsidian) | Target (Verso) |
|---|---|
| `.obsidian/` | Verso config outside the tree |
| Dataview inline field `key:: value` | frontmatter |
| `.excalidraw.md` from the Excalidraw plugin | board format |

### 11.3 Dialect items

- Typed relation syntax. `OPEN`
- Schema format and location. `OPEN`
- Per-block visibility syntax (game master's secret). `OPEN`
- Schema i18n: language-neutral key with a translated label (e.g. `type: npc` displayed as "PdM" or "NPC"). `PROPOSED`

### 11.4 Fixtures `DECIDED`

Structure:

```
fixtures/<category>/<case>/input.md
fixtures/<category>/<case>/expected.yaml
```

Example — `input.md`:

```markdown
Encontramos [[Barão Vermelho|o barão]] na [[Taverna#Porão]].

`[[isto não é link]]`

Ele jurou vingança. ^juramento
```

Example — `expected.yaml`:

```yaml
links:
  - target: Barão Vermelho
    alias: o barão
  - target: Taverna
    heading: Porão
blocks:
  - id: juramento
```

Minimum categories:

- simple wikilink, with alias, with heading, with `#^block`
- embed `![[...]]`
- block definition `^id`
- link inside inline code and inside a code block (does not count as a link)
- frontmatter with `tags` and `aliases`
- note names with accents and spaces

Rules:

- The fixtures are the behavior contract between the maintainer and the AI.
- `expected.yaml` only changes with the maintainer's explicit approval.
- Any fixture may be drafted by the AI; it only counts with the maintainer's explicit approval, and for the first five that approval includes checking the behaviour in the Obsidian app (changed in v0.6, ADR 0031; until then: "the first 5 are written by hand by the maintainer").

---

## 12. Tabletop RPG

Special support for people who play and run games is a declared intention. `DECIDED` for the intention; the scope below is `PROPOSED`.

| Feature | Status |
|---|---|
| Integration with Foundry VTT mapping a typed note ↔ Actor/Item with the system's data model; the existing modules only sync journals | `PROPOSED` |
| Random table as a note type with a roll action | `PROPOSED` |
| Player view: blocks marked as secret disappear in sharing and in export; maps to journal permission in Foundry | `PROPOSED` |
| Named viewport shortcuts on the board | `PROPOSED` |
| Schema packs per game system | `PROPOSED` |

---

## 13. Cross-cutting requirements

| Item | Status |
|---|---|
| pt-BR and EN from the first commit | `DECIDED` |
| Accessibility from the start | `DECIDED` |
| Board with an equivalent accessible view (a list or table of the same notes and relations) | `PROPOSED` |
| Performance targets | `OPEN` — no targets for now |
| Benchmark with a synthetic vault recording a baseline | `DECIDED` |

---

## 14. Engineering

### 14.1 Roles `DECIDED`

- The maintainer learns Rust in parallel, outside the project. The AI writes the code; the maintainer reviews behavior through the fixtures and questions decisions.
- Opus 5: document author, UI/TS author, reviewer of the core code.
- Fable 5.1: author of the core code, reviewer of documents and of the UI/TS code.
- Author and reviewer always in separate sessions; the reviewer does not see the author's reasoning. "Whoever wrote it does not review it" (original: "Quem escreveu não revisa") applies to the model, not only to the session (made precise in v0.2, ADR 0032).

### 14.2 Crate structure `DECIDED`

```
crates/
├── verso-dialect   # pure parser: no IO, no async
├── verso-index     # SQLite/FTS5, graph
├── verso-fs        # opaque handles, watcher, atomic writes, confinement
├── verso-core      # orchestrates and exposes the contract
└── verso-cli       # index, search, backlinks, mcp
```

### 14.3 Guardrails `DECIDED`

All of them in CI before the first line of product logic. (Read in ADR 0029 as two groups: workspace guardrails before the first line of product code; feature guardrails in the same PR as the feature they protect, never later.)

| Guardrail | Prevents |
|---|---|
| `unsafe_code = "forbid"` via `[workspace.lints]` | memory corruption |
| clippy with `-D warnings`; `unwrap_used` and `expect_used` denied, allowed only in tests | a panic taking the app down |
| `cargo-deny`: license allowlist compatible with the chosen license; advisories denied | an incompatible or vulnerable dependency |
| Parser fuzzing with `cargo-fuzz` | a malformed file hanging the app |
| Round-trip property test | opening rewriting a file |
| Atomic writes (temporary file + fsync + rename) | corruption on power loss |
| Path confinement in the adapter | a plugin or agent escaping the folder via `../` or a symlink |
| Parameterized queries + escaping of the FTS5 syntax | search breaking with quotes and operators |
| Benchmark with a synthetic vault | performance regression |

CI on macOS and Linux: `cargo fmt --check`, `cargo clippy`, `cargo test`, `cargo deny check`.

### 14.4 PR flow `DECIDED`

- Small PR, one subject.
- Template: What / Why / Discarded alternatives / How to verify / Rust concept used (explained for a beginner).
- If a fixture looks wrong, the author stops and asks; never changes `expected.yaml`.
- A new dependency requires a justification in the PR.
- Independent review classifies findings as BLOCKING, IMPORTANT or MINOR.
- Merge only with green CI, with no open BLOCKING finding, and if the maintainer can explain the PR in their own words.

---

## 15. Roadmap `DECIDED`

### Phase 0 — Foundation

ADRs, dialect spec v0, initial fixture corpus, `CLAUDE.md`, PR template; critical review; license decision; workspace and CI with all the guardrails, with no feature at all.

**Exit:** zero open BLOCKING findings; `LICENSE` present; green CI; guardrails demonstrably firing on a test branch.

### Phase 1 — Core through the CLI, no UI

| # | Crate | Delivery |
|---|---|---|
| 1 | verso-dialect | parsing of links, blocks, headings and frontmatter; round-trip; fuzz target |
| 2 | verso-fs | scan the folder, path confinement, atomic writes |
| 3 | verso-index | SQLite schema, FTS5, backlinks |
| 4 | verso-cli | `verso index`, `verso search`, `verso backlinks` |
| 5 | bench | synthetic vault generator + baseline |
| 6 | verso-cli | read-only `verso mcp` |

**Exit:** a real campaign vault indexes without error; backlinks match what is expected; green guardrails; notes queryable by Claude through MCP.

### Phase 2 — Walking skeleton on macOS

Tauri + CM6: open a folder, file tree, editor, backlinks and search coming from the core; contract with generated types; one note type end to end.

**Exit:** one month of real use in game preparation.

### Out of scope until the end of Phase 2

Sync, mobile, plugins, board, compatibility shim.

---

## 16. Market context

### 16.1 Obsidian user pains that motivate decisions

| Pain | Related decision |
|---|---|
| Less polished mobile apps; large vaults stall on the iPhone | companion server; capabilities |
| Config sync (plugins, hotkeys) fails between devices | layered config |
| On-demand storage interpreted as a deletion, causing loss | placeholder guard |
| Slow startup with many plugins | lazy by default; visible load time |
| Block backlink requested since 2020 | stable block ID |
| Query results invisible to the graph, search, git and agent | materializable views |
| Initial configuration paralysis | schema packs |
| Dataview without evolution; Bases reads frontmatter only | native typed note and query |

### 16.2 Reference projects

| Project | Relevance |
|---|---|
| Zettlr | opens an arbitrary folder without a vault; GPL |
| SilverBullet | server-first, in the browser; MIT; reference for the web client |
| Logseq | AGPL; the transition to the database version is still in beta |
| Grimoire | local-first Markdown app with the folder as a type and typed backlinks |
| Alkemion Studio | visual board for game masters; typed relations; random tables; player view |
| Obsidian ↔ Foundry sync modules | they sync journals; they do not map to Actor/Item |

---

## 17. Open items — consolidated list

| # | Item | When to decide |
|---|---|---|
| 1 | ~~License: package A or B~~ | decided: package A (v0.3, ADR 0005) |
| 2 | Name availability on crates.io, npm, the GitHub org and the domain | before making the repository public |
| 3 | ~~Language of the repository documentation~~ | decided: English source, pt-BR mirror (v0.5, ADR 0008) |
| 4 | ~~Base parser: pulldown-cmark, comrak or our own~~ | decided: pulldown-cmark (v0.8, ADR 0037; round-trip reading in spec Q18) |
| 5 | TS type generation: ts-rs or specta | start of Phase 2 |
| 6 | Typed relation syntax | before implementing relations |
| 7 | Schema format and location | before the typed note (Phase 2) |
| 8 | Per-block visibility syntax | before sharing and export |
| 9 | Board persistence | before the board |
| 10 | Performance targets | after the first baseline |

Open items raised after the briefing live in ADRs 0044–0048 and in section 9
of the dialect spec, not here.

---

## History

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-21 | Initial version. |
| 0.1 | 2026-09-21 | §5.1: config outside the tree and the index as a cache promoted to `DECIDED`; opening from the command line recorded as `DECIDED`. |
| 0.2 | 2026-09-21 | Application of the Phase 0 review (`docs/review/phase-0.md`), accepted in full by the maintainer: §8 placeholder guard promoted to `DECIDED` (ADR 0043); §3 tie-breaking criterion corrected and "Step 5" replaced by "before the close of Phase 0" (§3, §17); §14.1 UI/TS reviewer defined. No other section changed. |
| 0.3 | 2026-09-21 | §3 and §17 item 1: license decided by the maintainer — Package A, MPL-2.0 for the core and the app, MIT for the plugin SDK (ADR 0005). `LICENSE` added to the root. |
| 0.4 | 2026-09-21 | §3: contribution model (DCO without CLA) confirmed by the maintainer, with the rule for code written by AI: whoever signs it has command of it and takes responsibility for it (ADR 0006). |
| 0.5 | 2026-09-21 | §3 and §17 item 3: language of the documentation decided by the maintainer — English source, pt-BR mirror in `docs/pt-BR/`; this briefing is the exception, with the pt-BR original ruling (ADR 0008). |
| 0.6 | 2026-09-21 | §11.4: fixture rule changed by the maintainer — any fixture may be drafted by the AI; it counts only with their explicit approval, and the first five are checked in the Obsidian app before approval (ADR 0031). |
| 0.7 | 2026-09-21 | §14.3: pointer to the two-group reading of the guardrails in ADR 0029, after the independent reading of the Phase 0 review (docs/review/phase-0.md §7). No decision changed. |
| 0.8 | 2026-09-21 | §9 and §17 item 4: base parser decided by the maintainer — pulldown-cmark, with comrak as the fallback, under the read-only reading of round-trip (spec Q18). Comparison in docs/reference/parser-decision.md (ADR 0037). |
