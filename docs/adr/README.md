# Verso ADRs

One record per decision from `docs/BRIEFING.md`. Fixed format: Context /
Decision / Consequences / Discarded alternatives / Status.

## Status

The statuses mirror the briefing and cannot be promoted by the AI:

| Status | Meaning |
|---|---|
| Accepted | `DECIDED` in the briefing: chosen or explicitly accepted by the maintainer |
| Proposed | `PROPOSED` in the briefing: recommended in discussion, without confirmation |
| `[OPEN]` | No decision. Records the context and when to decide |
| Constraint | Imposed by platform, license or terms of use; it is not a choice |

Only the maintainer promotes Proposed to Accepted, or closes an `[OPEN]`.

## Index

### Project and governance

| # | Title | Status |
|---|---|---|
| [0001](0001-open-tool-no-company.md) | Open tool, no company and no paid product | Accepted |
| [0002](0002-negative-scope.md) | Negative scope: not a clone, not a host for other people's plugins, no embedded LLM | Accepted |
| [0003](0003-primitives-not-workarounds.md) | What today requires a plugin should be an app primitive | Accepted |
| [0004](0004-project-name-verso.md) | Project name: Verso | Accepted; the domain `versomd.com` (2026-09-24); the package, crate and npm name `versomd`, on the availability check of 2026-10-12 |
| [0005](0005-license.md) | Project license: MPL-2.0 in the core and app, MIT in the plugin SDK | Accepted |
| [0006](0006-contribution-dco-no-cla.md) | Contribution through DCO, without CLA; AI-written code comes in through the same DCO, under the responsibility of whoever signs | Accepted |
| [0007](0007-private-repo-until-license.md) | Repository private until the license is decided | Accepted |
| [0008](0008-documentation-language.md) | Documentation language: English source, pt-BR mirror | Accepted |
| [0009](0009-external-constraints.md) | External constraints assumed as given | Constraint |

### Product principles

| # | Title | Status |
|---|---|---|
| [0010](0010-folder-is-the-unit-no-vault.md) | The open folder is the unit of work; there is no vault | Accepted |
| [0011](0011-config-outside-tree-index-as-cache.md) | Config outside the tree and the index as a rebuildable cache | Accepted |
| [0041](0041-multi-root-workspace.md) | Workspace with multiple roots | Proposed |
| [0042](0042-open-from-command-line.md) | Open from the command line: `verso <folder>` | Accepted |
| [0012](0012-files-are-source-of-truth.md) | Files are the source of truth; opening never rewrites | Accepted |
| [0013](0013-degrades-to-markdown.md) | All structured data degrades to readable Markdown | Accepted (2026-09-24) |
| [0014](0014-primitives-catalog.md) | Catalog of Verso primitives | Proposed (the daily note and templates: Accepted; the typed note: Accepted in 0052; the typed relation: decided in 0057, 2026-09-30; the structured views: Accepted in 0053) |
| [0015](0015-schema-packs.md) | Schema packs distributable as content | Proposed |
| [0052](0052-typed-note.md) | Typed note: `type:` in the frontmatter and a schema | Accepted (2026-09-24); a link-valued property is a typed relation from 0057 (2026-09-30) |
| [0053](0053-views-bases.md) | Views over the folder: bases, in Obsidian's format | Accepted (2026-09-24) |
| [0059](0059-tabs-preview-pinned.md) | Tabs: a preview tab by default, compact pinned tabs, the chosen tab joins its page | Accepted (2026-09-30) |
| [0060](0060-makemd-organizing-features.md) | make.md's organizing features as Verso primitives | Accepted (2026-10-02) |
| [0061](0061-blocks-in-edit-mode.md) | Blocks in Edit mode: a handle to drag, a + to add, a menu per block | Accepted (2026-10-06) |
| [0062](0062-focuses.md) | Focuses: named roots of the file tree, shared with make.md | Accepted (2026-10-03) |
| [0063](0063-files-onto-the-board.md) | Putting pictures and files on the board: drop, paste, pick and drag | Accepted (2026-10-06) |
| [0064](0064-tables-edited-as-tables.md) | Tables edited as tables in Edit mode | Accepted (2026-10-06) |
| [0065](0065-a-folder-per-window.md) | A folder per window | Accepted (2026-10-06) |
| [0066](0066-mcp-sees-boards-relations-properties-bases.md) | The MCP sees boards, relations, properties and bases | Accepted (2026-10-07) |
| [0067](0067-source-files-stay-small.md) | Source files stay small: a module map and a size limit | Accepted (2026-10-07) |
| [0068](0068-templates-chosen-in-a-new-note.md) | Templates chosen in a new note, as in Notion | Accepted (2026-10-07) |

### Plugins and LLM

| # | Title | Status |
|---|---|---|
| [0016](0016-plugins-execution-and-capabilities.md) | Plugins: TypeScript in a Web Worker, no disk, with declared capabilities | Accepted |
| [0017](0017-plugins-format-shim-loading.md) | Plugins: familiar format, separate shim, lazy loading and dogfooding | Proposed |
| [0018](0018-llm-native-mcp-in-core.md) | LLM-native: MCP server in the core, structured query, reviewed writes | Accepted |
| [0019](0019-generative-opt-in-and-keychain.md) | Generative features opt-in and keys in the keychain | Proposed |

### Sync

| # | Title | Status |
|---|---|---|
| [0020](0020-sync-merge-in-core-transports-as-plugins.md) | Sync: merge engine in the core, transports as plugins, out of scope until Phase 2 | Accepted; revised by 0073 (2026-10-09): the server first and sync through it, Drive and OneDrive by API not essential, transports in the core while they hold credentials |
| [0021](0021-sync-automerge-layered-config.md) | Sync: Automerge and layered config | Proposed; item 1 revised by 0073 (2026-10-09): Yjs in place of Automerge, as the mechanism of a live session |
| [0043](0043-placeholder-guard.md) | An on-demand storage placeholder file is never a deletion | Accepted; detection decided for iCloud Drive (2026-09-22) and for Windows' cloud attributes, OneDrive's among them (2026-10-08); `[OPEN]` for the other providers |

### Platforms and architecture

| # | Title | Status |
|---|---|---|
| [0022](0022-target-platforms-macos-first.md) | Target platforms and macOS first | Accepted; revised 2026-10-12: Linux shipped in Phase 3 (2026-10-09), not after Phase 2 |
| [0023](0023-stack-core-and-editor.md) | Stack: Rust, Tauri v2, CodeMirror 6, SQLite with FTS5 | Accepted |
| [0024](0024-board-excalidraw.md) | Board: Excalidraw as a free annotation layer | Accepted; semantic layer and persistence decided in 0057 (2026-09-30) |
| [0025](0025-own-server-and-mobile-pwa.md) | Own server (`verso serve`) and initial mobile as a web client | Proposed; items 1 and 2 accepted in 0073 (2026-10-09), item 3 superseded there |
| [0026](0026-core-ui-contract-inviolable-rules.md) | Core↔UI contract and inviolable architecture rules | Accepted; rule 4 clarified for a server, the rule unchanged, and rule 5's scope widened to the server's database (2026-10-09) |
| [0027](0027-runtime-capabilities.md) | Capabilities queryable at runtime | Accepted (2026-10-12); item 3 revised to 0076's rule: what the side cannot do is not shown, with a way back in Settings |
| [0028](0028-crate-structure.md) | Crate structure | Accepted; two crates for the server, `verso-service` and `verso-server` (2026-10-09) |
| [0050](0050-outbound-network-access.md) | Outbound network access from the window | Accepted (the setting's default: provisional); revised by 0055 and 0056 (2026-09-29), and by 0073 and 0075 (2026-10-09): a server's traffic and its update check |
| [0054](0054-terminal-and-agents-from-the-app.md) | The command line and agents, set up from the app | Accepted (2026-09-24); its `[OPEN]` on the system's tools closed (2026-09-29) |
| [0055](0055-in-app-updater.md) | The in-app updater | Accepted (2026-09-29) |
| [0056](0056-embedded-web-pages.md) | Embedded web pages: the proxy, its origin and the local network | Accepted (2026-09-29); revised the same day: no proxy, pages load directly from origins the user approved |
| [0057](0057-board-json-canvas.md) | The board: a JSON Canvas file, Excalidraw as its surface, typed relations in the frontmatter | Accepted (2026-09-30) |
| [0069](0069-windows-port.md) | The Windows port: x64, an installer, tested on a Windows machine over SSH | Accepted (2026-10-12), decided in parts from 2026-10-07; x64, Windows 10 and 11, NSIS and no code signing for now decided; starts now, in Phase 2 ahead of the rest (0022 revised); the push gate when platform code changes; Windows 10 machine later, code written for it; the configuration location (`%LOCALAPPDATA%\verso`) and OneDrive's placeholder decided 2026-10-08; the directory `fsync` (`FlushFileBuffers` counts) and the path separator (`/`) decided 2026-10-09; shipped in 0.5.0-beta.1; items 2, 4, 6–9 and the order of work accepted as built (2026-10-12) |
| [0070](0070-what-travels-with-the-folder.md) | What travels with the folder: three layers of settings, and names every OS can keep | Decided in parts (2026-10-08/12); names every OS can keep decided, `\` among them; the approved embed origins the person's, and the person's layer with the account on a server (2026-10-09, with 0073); items 1–2, the folder's layer in `.verso/settings.json`, accepted and built (2026-10-12), `[OPEN]` the reading of "the ignored paths" and the file's name |
| [0071](0071-linux-port.md) | The Linux port: one build for every distribution, tested on virtual machines | Shipped in 0.6.0-beta.1 (2026-10-09, PR #41); answered 2026-10-09: ARM64, versions, signing, the index's location, three machines, the updater; `[OPEN]`: Snap, Wayland native or X11, case-only names |
| [0072](0072-window-controls-in-the-app.md) | The window's controls inside the app: no title bar on macOS and Windows | Accepted (2026-10-08): the app's own buttons on Windows; amended 2026-10-09: on Linux too |
| [0073](0073-self-hosted-server-first.md) | Self-hosted server first: online collaboration before sync | Accepted (2026-10-09), with its items marked proposed; answered that night: the crates of the service, the contract's version, the server's update path (option b), TLS behind a proxy or Tailscale or the server's own certificate, the handles and symlinks on a server, remote content per reader, simultaneous editing in the first server release, the desktop app connecting in this round; before: account recovery, owners per server, Docker platforms; revises 0020, 0021, 0025, 0034, 0044, 0045, 0050, 0070; `[OPEN]`: online-only mobile vs offline earlier, finer permissions and history, E2E later, board co-editing, MCP over the network, the pre-signed URL, native iPad criteria, cost pass-through, "this app is a server" updating with phones connected |
| [0074](0074-accounts-and-access-on-the-server.md) | Accounts and access on the server: the first admin, sign-in, tokens | Accepted (2026-10-09), with 0073; decided: the admin from the environment on the first start only, recovered by a command on the machine; password, then passkeys in this round; invitation only, tracked; no implicit admin access to folders; several accounts; personal access tokens by folder; the desktop app signing in through the browser in this round; items 2, 7, 9, 10, 11 accepted as written |
| [0075](0075-server-packaging-and-storage.md) | The server's packaging and storage: how it is installed, where its data lives, what each folder takes | Accepted (2026-10-09), with 0073; decided: Docker image, CasaOS/ZimaOS compose and packages with systemd; a local data directory and a folders root that may be a NAS; the space per folder shown, limits later; sync per folder, off by default; ARM64 now; the image on GitHub's registry; `verso serve` a subcommand of `verso`; a folder's id; symlinks that leave a folder refused on a server; the server tells the admin of a new version and never updates itself; `VERSO_UPDATE_CHECK` accepted as built (2026-10-12) |
| [0076](0076-the-window-on-every-screen.md) | The window on every screen: phone, tablet, a narrow pane | Accepted (2026-10-09), every recommendation, built in this round before the server's window ships: the frame by the screen and the pane by its width, one pane at a time on a phone, the graph, a card to open a link in Edit mode, the kanban by touch, a bottom bar for the ribbon, the on-screen keyboard and its toolbar, menu items for modifiers, screen readers with touch, targets and safe areas, the page's zoom kept, host-only items by capability, tagged e2e at phone and tablet widths; `[OPEN]`: the keyboard toolbar's contents, after use |
| [0077](0077-the-server-administration-console-and-folder-quotas.md) | The server's administration console, and quotas per folder | Accepted (2026-10-10), every recommendation: the account stays in Settings, the administration becomes a console of its own at /admin, drawn with the window's pieces; every list searched, sorted and paged on the server; quotas per folder now (revises 0075 item 4); the configuration shown read-only; decided 2026-10-10: quotas per folder only (per account when members create folders), the configuration not edited from the console |
| [0078](0078-universo-the-name-of-verso-as-a-server.md) | UniVerso: the name of Verso as a server | Accepted (2026-10-10), every recommendation: UniVerso names the self-hosted server; the binary invoked as `universo` is `verso serve`; the server's packages, unit, user, paths and image carry the name, ending the `/usr/bin/verso` clash; 0.7.0-beta.1's names not carried along; decided 2026-10-10: the variables stay `VERSO_*`, Settings › Servers keeps its name; revised 2026-10-12: spelled UniVerso, identifiers in lowercase |
| [0079](0079-sync-a-local-folder-with-a-server.md) | Sync: a desktop folder kept in step with a folder on a server | Accepted (2026-10-10), large files in pieces now: one local folder with one server folder, chosen in its settings; per file by hash against a base kept outside the folder; a change log per folder on the server; the device session's WebSocket, no transport of its own; conflicts as a copy beside the file, the server's version keeping the name; deletions never from placeholders, mass deletions pause; renames detected; the first sync never deletes; a property test as the feature's guardrail; revised 2026-10-10: the pause needs at least 3 deletions, a deletion goes to the folder's `.trash/`, a name's two Unicode forms are one file (spec Q7), an outside program's stale save a known limit |
| [0080](0080-the-trash-with-expiry-and-restore.md) | The trash: what was deleted is seen, restored, and expires | Accepted (2026-10-11), written by Fable 5.1 at the maintainer's request: `.trash/` stays, its record a cache outside the folder; a Trash view in the window and the console; restore to the original path or beside a taken name, a file that came back to sync; retention by `VERSO_TRASH_DAYS` and per folder, the sweep confined to `.trash/`; writers see and restore, the owner empties; open items answered 2026-10-10, accepted 2026-10-11: 30 days, the owner may shorten, no row in the tree, shown and not counted (the oldest expiring early past the quota), sync's deletions to the folder's `.trash/`; a version a device's write replaced kept in the trash |
| [0081](0081-sharing-between-people-on-one-universo.md) | Sharing between people on one UniVerso: a vault, a folder inside it, read or write | Accepted (2026-10-11), written by Fable 5.1 at the maintainer's request: a share is a grant on a path, the receiver sees a folder of their own and the server keeps one folder; "Shared with me" and "Shared by me" wherever folders are listed; synced as a local folder of its own; one room per note; answers filtered to the share, a link out "not in what was shared with you"; renames carry the share; the highest covering grant; open items answered 2026-10-10, accepted 2026-10-11: no own name, the owner alone shares, no public links now, never inside the receiver's vault, the attachments folder offered read-only, no single document in the first version, the folder switcher grouped "On this computer / Mine / Shared with me"; next, its own ADR: a file's history |
| [0082](0082-live-co-editing-of-a-synced-folder.md) | Live co-editing of a synced folder: the desktop's note joins the server's room while online | Accepted (2026-10-11), written by Fable 5.1 at the maintainer's request, the direction approved in session: a synced folder's note joins the same room the browser uses while the sync's link is up, over that link, through the contract's existing `collab_*` commands and `collab` capability; the device session's identity and role, a reader present and not typing; sync alone writes the local file while the note is live, the tab's autosave being the room's save; unsynced local edits uploaded before joining; on a drop the tab keeps its text and saves locally, on return it rejoins the same room or goes through sync's comparison, nothing lost; an outside program's edit uploaded as any, a copy when the room moved; rooms for notes only, a share's room the owner's; a new property test as the guardrail; open items answered 2026-10-10, accepted 2026-10-11: join on open, on by default with a per-folder setting; `[OPEN]`: the board's co-editing; later, its own ADR: merge by block of offline edits |

### Dialect, engineering and roadmap

| # | Title | Status |
|---|---|---|
| [0029](0029-guardrails-in-ci.md) | Guardrails in CI before the first line of product logic | Accepted; three `std::fs` exceptions ratified (2026-09-29); the provisional records of 2026-09-22 ratified, and the sync-client test a manual check that gates nothing (2026-10-12) |
| [0030](0030-base-dialect-obsidian-compatible.md) | Base dialect compatible with Obsidian; Verso extends, never contradicts | Accepted |
| [0031](0031-fixtures-as-contract.md) | Fixtures are the behavior contract between maintainer and AI | Accepted |
| [0032](0032-author-and-reviewer-roles.md) | Roles: the AI writes, the maintainer reviews behavior | Accepted |
| [0033](0033-pr-workflow.md) | PR workflow | Accepted |
| [0034](0034-roadmap-in-phases.md) | Roadmap in three phases with verifiable exit gates | Accepted; a Phase 3 added by 0073, and sync and mobile out of point 4's list (2026-10-09) |
| [0035](0035-cross-cutting-requirements.md) | Cross-cutting requirements: pt-BR and EN, accessibility, benchmark | Accepted |
| [0036](0036-tabletop-rpg-support.md) | Special support for tabletop RPG | Accepted (intent) |
| [0049](0049-phase-2-scope-widened.md) | Phase 2 scope widened at the maintainer's request | Accepted; no custom Dock menu for now (decided 2026-10-07) |
| [0051](0051-development-flow-and-releases.md) | Development flow, versions and releases | Accepted |
| [0058](0058-demo-vault-as-tutorial.md) | The demo vault is the product's tutorial, kept with every feature | Accepted (2026-10-01; revised the same day: the walkthrough runs by machine in the browser harness); the demo vault in English `[OPEN]` |

### Open technical decisions

| # | Title | When to decide |
|---|---|---|
| [0037](0037-base-parser.md) | Base parser for `verso-dialect`: `pulldown-cmark`, `comrak` as the fallback | Accepted |
| [0038](0038-ts-type-generation.md) | TypeScript type generation from Rust: `specta` with `tauri-specta` | Accepted |
| [0039](0039-performance-targets.md) | Performance targets | After the first baseline |
| [0040](0040-board-persistence.md) | Board persistence | Accepted (2026-09-30), by 0057 |

### Open questions raised in the Phase 0 review

Source: [`../review/phase-0.md`](../review/phase-0.md). Each began with no
decision and records what needed to be answered and when; the last column
says where each stands.

| # | Title | When to decide |
|---|---|---|
| [0044](0044-verso-fs-semantics.md) | `verso-fs` semantics: symlinks, opaque handles, ignored paths | Symlinks and ignored paths: Accepted (2026-09-22); handles: accepted as built for Phase 2 (2026-09-24), re-opened before anything outside the app's own views gets access to files, answered for `verso serve` on 2026-10-09 (the session and its role are the access capability); symlinks on a server: refused when they leave the folder (2026-10-09); the watcher: Accepted (2026-09-24); ignored paths revised on 2026-09-29 — the built-in list and `.gitignore`, behind settings — Accepted; on a server, a dangling symlink whose target is inside the folder treated as a new file inside (4ffe8a9), confirmed by the maintainer on 2026-10-12 |
| [0045](0045-server-and-mcp-security.md) | Security of the server, the MCP and the contract | MCP: Accepted; contract: accepted as built for Phase 2, `[OPEN]` until a server enters scope, answered on 2026-10-09 by 0074 item 11; server: answered on 2026-10-09 by 0073 and 0074; the MCP over the network `[OPEN]` |
| [0046](0046-index-location-lifecycle-tokenizer.md) | Index: location, lifecycle and tokenizer | Accepted (2026-09-22) |
| [0047](0047-plugin-api-open-questions.md) | Open questions on the plugin API | Before designing the API (after Phase 2) |
| [0048](0048-file-operations-in-ui.md) | File operations in the UI: rename, create, delete, move | Accepted (2026-09-23) |

## Open items that did not become ADRs

Three dialect items from §17 live in [`../spec/dialect.md`](../spec/dialect.md),
where the behavior is specified: typed relation syntax (item 6, decided on
2026-09-30 as Q10, with [0057](0057-board-json-canvas.md)), format and
location of the schemas (item 7, decided on 2026-09-24 as Q11, with
[0052](0052-typed-note.md)) and per-block visibility syntax (item 8). The
parsing gaps (Q1–Q8, Q12–Q26) also live there.

The check for the availability of the name (item 2) is recorded in
[0004](0004-project-name-verso.md).

## How to write a new ADR

1. Number sequentially: `NNNN-title-in-kebab-case.md`.
2. Use the five sections, in this order, without inventing others.
3. Cite the source in the header (`docs/BRIEFING.md` §X, a PR, an issue, or the
   review that originated it).
4. In "Discarded alternatives", record only alternatives that were actually
   considered. With none: write "None recorded".
5. An ADR is not edited to change one's mind. A new ADR supersedes the previous
   one, and the previous one gets a line pointing to the new one.

## How to change an existing ADR

Three cases, with different treatments:

| Case | What to do |
|---|---|
| Correction or delimitation that **does not change the decision** (citation error, scope that was missing, consequence discovered later) | Edit in place and add a `Revisions:` line in the header, with date and origin (PR or review) |
| **Change** an Accepted decision | A new ADR that supersedes it; the old one gets the line pointing to the new one and is not edited beyond that |
| **Close** an `[OPEN]` or promote a Proposed | Edit the Decision section and the Status in place, citing the commit or PR in which the maintainer decided. An `[OPEN]` has no decision to supersede; promoting a Proposed is the confirmation of the text that was already there |

Only the maintainer does the second and the third case. The first can be done by
the AI, and it is a review finding if it disguises a change of decision as a
correction.
