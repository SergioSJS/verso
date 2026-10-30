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
| [0009](0009-external-constraints.md) | External constraints assumed as given | Constraint; revised 2026-10-14: the public source of an open-source plugin Obsidian publishes is an admissible source |

### Product principles

| # | Title | Status |
|---|---|---|
| [0010](0010-folder-is-the-unit-no-vault.md) | The open folder is the unit of work; there is no vault | Accepted |
| [0011](0011-config-outside-tree-index-as-cache.md) | Config outside the tree and the index as a rebuildable cache | Accepted |
| [0041](0041-multi-root-workspace.md) | Workspace with multiple roots | Proposed; after V1 (2026-10-21) |
| [0042](0042-open-from-command-line.md) | Open from the command line: `verso <folder>` | Accepted |
| [0012](0012-files-are-source-of-truth.md) | Files are the source of truth; opening never rewrites | Accepted |
| [0013](0013-degrades-to-markdown.md) | All structured data degrades to readable Markdown | Accepted (2026-09-24) |
| [0014](0014-primitives-catalog.md) | Catalog of Verso primitives | Accepted across 0052, 0053, 0057, 0093 |
| [0015](0015-schema-packs.md) | Schema packs distributable as content | Proposed; after V1 (2026-10-21); the bundles of 0098 are their format |
| [0052](0052-typed-note.md) | Typed note: `type:` in the frontmatter and a schema | Accepted (2026-09-24) |
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
| [0085](0085-hover-preview.md) | Hover preview: the note a link names, shown where the pointer rests | Accepted (2026-10-14) |
| [0086](0086-infobox-a-typed-notes-card.md) | The infobox: a typed note's properties as a card beside its text | Accepted (2026-10-14) |
| [0088](0088-dice-and-random-tables.md) | Dice and random tables: `dice:` in a note rolls, the result never written | Accepted (2026-10-14) |
| [0089](0089-linking-unlinked-mentions.md) | Linking unlinked mentions: a "Link" per mention and "Link all", with a diff | Accepted (2026-10-14) |
| [0090](0090-maps-on-the-board.md) | Maps on the board: a picture under the board, pins that open notes, secret pins | Accepted (2026-10-14) |
| [0093](0093-periodic-notes.md) | Periodic notes: the week, the month, the quarter and the year beside the day | Accepted (2026-10-14) |
| [0094](0094-the-rest-of-bases.md) | The rest of bases: regular expressions, the map layout, and what 0053 left unbuilt | Accepted (2026-10-14) |

### Plugins and LLM

| # | Title | Status |
|---|---|---|
| [0016](0016-plugins-execution-and-capabilities.md) | Plugins: TypeScript in a Web Worker, no disk, with declared capabilities | Accepted |
| [0017](0017-plugins-format-shim-loading.md) | Plugins: familiar format, separate shim, lazy loading and dogfooding | Proposed |
| [0018](0018-llm-native-mcp-in-core.md) | LLM-native: MCP server in the core, structured query, reviewed writes | Accepted |
| [0019](0019-generative-opt-in-and-keychain.md) | Generative features opt-in and keys in the keychain | Accepted (2026-10-21) |

### Sync

| # | Title | Status |
|---|---|---|
| [0020](0020-sync-merge-in-core-transports-as-plugins.md) | Sync: merge engine in the core, transports as plugins, out of scope until Phase 2 | Accepted; revised by 0073 |
| [0021](0021-sync-automerge-layered-config.md) | Sync: Automerge and layered config | Proposed; revised by 0073 (Yjs) |
| [0043](0043-placeholder-guard.md) | An on-demand storage placeholder file is never a deletion | Accepted (2026-09-22) |

### Platforms and architecture

| # | Title | Status |
|---|---|---|
| [0022](0022-target-platforms-macos-first.md) | Target platforms and macOS first | Accepted; revised 2026-10-12 |
| [0023](0023-stack-core-and-editor.md) | Stack: Rust, Tauri v2, CodeMirror 6, SQLite with FTS5 | Accepted |
| [0024](0024-board-excalidraw.md) | Board: Excalidraw as a free annotation layer | Accepted; persistence in 0057 |
| [0025](0025-own-server-and-mobile-pwa.md) | Own server (`verso serve`) and initial mobile as a web client | Items 1–2 accepted by 0073 (2026-10-09); item 3 superseded there |
| [0026](0026-core-ui-contract-inviolable-rules.md) | Core↔UI contract and inviolable architecture rules | Accepted; revised 2026-10-09 |
| [0027](0027-runtime-capabilities.md) | Capabilities queryable at runtime | Accepted (2026-10-12) |
| [0028](0028-crate-structure.md) | Crate structure | Accepted; two server crates (2026-10-09) |
| [0050](0050-outbound-network-access.md) | Outbound network access from the window | Accepted; revised 2026-09-29; the setting's default, on, decided 2026-10-21 |
| [0054](0054-terminal-and-agents-from-the-app.md) | The command line and agents, set up from the app | Accepted (2026-09-24) |
| [0055](0055-in-app-updater.md) | The in-app updater | Accepted (2026-09-29); revised 2026-10-14 |
| [0056](0056-embedded-web-pages.md) | Embedded web pages: the proxy, its origin and the local network | Accepted (2026-09-29) |
| [0057](0057-board-json-canvas.md) | The board: a JSON Canvas file, Excalidraw as its surface, typed relations in the frontmatter | Accepted (2026-09-30) |
| [0069](0069-windows-port.md) | The Windows port: x64, an installer, tested on a Windows machine over SSH | Accepted (2026-10-12); shipped in 0.5.0-beta.1 |
| [0070](0070-what-travels-with-the-folder.md) | What travels with the folder: three layers of settings, and names every OS can keep | Accepted (2026-10-12) |
| [0071](0071-linux-port.md) | The Linux port: one build for every distribution, tested on virtual machines | Accepted; shipped in 0.6.0-beta.1 (2026-10-09); accepted as a whole 2026-10-21 (no Snap for now, Wayland observed, case-only names after V1) |
| [0072](0072-window-controls-in-the-app.md) | The window's controls inside the app: no title bar on macOS and Windows | Accepted (2026-10-08) |
| [0073](0073-self-hosted-server-first.md) | Self-hosted server first: online collaboration before sync | Accepted (2026-10-09); revises 0020, 0021, 0025 |
| [0074](0074-accounts-and-access-on-the-server.md) | Accounts and access on the server: the first admin, sign-in, tokens | Accepted (2026-10-09) |
| [0075](0075-server-packaging-and-storage.md) | The server's packaging and storage: how it is installed, where its data lives, what each folder takes | Accepted (2026-10-09) |
| [0076](0076-the-window-on-every-screen.md) | The window on every screen: phone, tablet, a narrow pane | Accepted (2026-10-09) |
| [0077](0077-the-server-administration-console-and-folder-quotas.md) | The server's administration console, and quotas per folder | Accepted (2026-10-10) |
| [0078](0078-universo-the-name-of-verso-as-a-server.md) | UniVerso: the name of Verso as a server | Accepted (2026-10-10) |
| [0079](0079-sync-a-local-folder-with-a-server.md) | Sync: a desktop folder kept in step with a folder on a server | Accepted (2026-10-10) |
| [0080](0080-the-trash-with-expiry-and-restore.md) | The trash: what was deleted is seen, restored, and expires | Accepted (2026-10-11) |
| [0081](0081-sharing-between-people-on-one-universo.md) | Sharing between people on one UniVerso: a vault, a folder inside it, read or write | Accepted (2026-10-11) |
| [0082](0082-live-co-editing-of-a-synced-folder.md) | Live co-editing of a synced folder: the desktop's note joins the server's room while online | Accepted (2026-10-11) |
| [0083](0083-security-hardening-of-universo.md) | Security hardening of UniVerso: bots, brute force, the host's tools and what comes before the first outside user | Accepted (2026-10-13) |
| [0084](0084-notifications-in-the-window.md) | Notifications in the window: a change of state said once, kept in a list, chosen per kind | Accepted (2026-10-14) |
| [0087](0087-secret-blocks-hidden-from-readers.md) | Secret blocks: a `[!secret]` callout stays in the note, and a UniVerso serves readers the note without it | Accepted (2026-10-14) |
| [0091](0091-version-history.md) | Version history: who changed a file, when, and bringing a version back | Accepted (2026-10-14) |
| [0092](0092-the-phone-offline.md) | The phone offline: the window served by a UniVerso keeps chosen folders and syncs them | Accepted (2026-10-14) |
| [0095](0095-mac-notarization-and-windows-code-signing.md) | Mac notarization and Windows code signing, and the Mac Intel build | Accepted (2026-10-14) |
| [0096](0096-this-app-is-a-server.md) | This app is a server: the desktop serving its folder on the local network | Accepted (2026-10-15) |
| [0097](0097-universo-found-on-the-network-and-a-bad-dns-survived.md) | UniVerso found on the home network, and a bad DNS survived | Accepted (2026-10-16); details decided as built 2026-10-21 |
| [0098](0098-world-and-campaign-wizard-template-bundles.md) | The project wizard: a folder tree from a bundle, shown and edited before it is written | Accepted (2026-10-20) |
| [0099](0099-visual-markdown-statblocks-and-cards.md) | Statblocks: a card from a `statblock` block, layouts as files of the folder, rolls by system | Accepted (2026-10-20) |
| [0100](0100-visual-customization-wizard.md) | Appearance wizard: a live preview in Settings over the real tokens, saved profiles, and `.verso-theme` files | Accepted (2026-10-21) |
| [0101](0101-3d-dice-physics-overlay.md) | 3D dice: a lazy module that only stages the fall, onto a result already drawn | Accepted (2026-10-21) |
| [0102](0102-creative-oracles-and-improvisation.md) | Oracles and improvisation: graduated answers, idea sparks, a log in the note | Accepted (2026-10-20) |
| [0103](0103-feature-presets-and-capability-flags.md) | Features: a visible switch for each optional feature, all on by default | Accepted (2026-10-20) |
| [0104](0104-external-cloud-storage-transports-and-quotas.md) | Sync with a cloud the person already has: WebDAV, S3, Dropbox, OneDrive and Google Drive, through the sync of ADR 0079 | Accepted (2026-10-21) |
| [0105](0105-read-links-without-an-account.md) | Read links without an account: a folder or one note of a UniVerso, open to whoever holds the link | Accepted (2026-10-21) |
| [0106](0106-structured-data-as-a-diagram.md) | Structured data as a diagram: JSON, YAML and more formats drawn as boxes to move, fold and follow back to the text | Accepted (2026-10-21) |
| [0107](0107-the-table-a-shared-roll-and-chat-log.md) | The table: one log of everyone's rolls and messages, beside the notes | Accepted (2026-10-28) |
| [0108](0108-colour-swatches-for-colour-codes.md) | Colour swatches: a colour code in a note shows its colour, and a click adjusts it | Accepted (2026-10-28) |
| [0109](0109-themes-v2-more-tokens-and-a-catalogue.md) | Themes, second step: more tokens, a richer builder, and a catalogue behind "More themes…" | Accepted (2026-10-28) |
| [0110](0110-a-table-is-a-campaign-folder.md) | A table is a campaign folder: invited players, notes released bit by bit, a table dashboard | Accepted (2026-10-28) for phase 1; phase 2 scheduled for V1, not built; superseded in part by 0113 |
| [0111](0111-online-mode-a-table-from-this-app-through-a-tunnel.md) | Online mode: a table from this app, through a tunnel | Accepted (2026-10-23) |
| [0112](0112-confirming-it-is-you-on-a-linked-device.md) | Confirming it is you on a linked device | Accepted in part (2026-10-28): items 1–3; not built |
| [0113](0113-one-access-model-for-a-table.md) | One access model for a table: a seat, per-path access, per-player rights | Accepted (2026-10-24) |
| [0114](0114-opening-one-markdown-file-without-a-folder.md) | Opening one Markdown file: Verso as a handler for `.md`, and a window with no folder | Proposed (2026-10-30); 13 `[OPEN]` questions, each with a recommendation |

### Dialect, engineering and roadmap

| # | Title | Status |
|---|---|---|
| [0029](0029-guardrails-in-ci.md) | Guardrails in CI before the first line of product logic | Accepted; three `std::fs` exceptions ratified (2026-09-29); the provisional records of 2026-09-22 ratified, and the sync-client test a manual check that gates nothing (2026-10-12) |
| [0030](0030-base-dialect-obsidian-compatible.md) | Base dialect compatible with Obsidian; Verso extends, never contradicts | Accepted |
| [0031](0031-fixtures-as-contract.md) | Fixtures are the behavior contract between maintainer and AI | Accepted |
| [0032](0032-author-and-reviewer-roles.md) | Roles: the AI writes, the maintainer reviews behavior | Accepted |
| [0033](0033-pr-workflow.md) | PR workflow | Accepted |
| [0034](0034-roadmap-in-phases.md) | Roadmap in three phases with verifiable exit gates | Accepted; Phase 3 and 4 added |
| [0035](0035-cross-cutting-requirements.md) | Cross-cutting requirements: pt-BR and EN, accessibility, benchmark | Accepted |
| [0036](0036-tabletop-rpg-support.md) | Special support for tabletop RPG | Accepted |
| [0049](0049-phase-2-scope-widened.md) | Phase 2 scope widened at the maintainer's request | Accepted |
| [0051](0051-development-flow-and-releases.md) | Development flow, versions and releases | Accepted |
| [0058](0058-demo-vault-as-tutorial.md) | The demo vault is the product's tutorial, kept with every feature | Accepted (2026-10-01); the demo vault in English before V1 (decided 2026-10-21) |

### Open technical decisions

| # | Title | When to decide |
|---|---|---|
| [0037](0037-base-parser.md) | Base parser for `verso-dialect`: `pulldown-cmark`, `comrak` as the fallback | Accepted |
| [0038](0038-ts-type-generation.md) | TypeScript type generation from Rust: `specta` with `tauri-specta` | Accepted |
| [0039](0039-performance-targets.md) | Performance targets | After the first baseline |
| [0040](0040-board-persistence.md) | Board persistence | Accepted (2026-09-30, in 0057) |

### Open questions raised in the Phase 0 review

| # | Title | When to decide |
|---|---|---|
| [0044](0044-verso-fs-semantics.md) | `verso-fs` semantics: symlinks, opaque handles, ignored paths | Accepted |
| [0045](0045-server-and-mcp-security.md) | Security of the server, the MCP and the contract | Accepted; network MCP open |
| [0046](0046-index-location-lifecycle-tokenizer.md) | Index: location, lifecycle and tokenizer | Accepted (2026-09-22) |
| [0047](0047-plugin-api-open-questions.md) | Open questions on the plugin API | After V1 |
| [0048](0048-file-operations-in-ui.md) | File operations in the UI: rename, create, delete, move | Accepted (2026-09-23) |

## Open items that did not become ADRs

Three dialect items from §17 live in [`../spec/dialect.md`](../spec/dialect.md),
where the behavior is specified: typed relation syntax (item 6, decided on
2026-09-30 as Q10, with [0057](0057-board-json-canvas.md)), format and
location of the schemas (item 7, decided on 2026-09-24 as Q11, with
[0052](0052-typed-note.md)) and per-block visibility syntax (item 8, decided on 2026-10-14 as Q9, with
[0087](0087-secret-blocks-hidden-from-readers.md)). The
parsing gaps (Q1–Q8, Q12–Q26) also live there.

The check for the availability of the name (item 2) is recorded in
[0004](0004-project-name-verso.md).

## How to write a new ADR

1. Number sequentially: `NNNN-title-in-kebab-case.md`.
2. Use the five sections in order: Context / Decision / Consequences / Discarded alternatives / Status.
3. Cite the source in the header (`docs/BRIEFING.md` §X, a PR, an issue, or the review that originated it).
4. In "Discarded alternatives", record only alternatives that were actually considered. With none: write "None recorded".
5. **Length and style:** Keep ADRs concise (< 200 lines ideally). Use direct bullet points and clear tables. Avoid pasting raw conversational session logs or minute-by-minute chat transcripts.
6. An ADR is not edited to change one's mind. A new ADR supersedes the previous one, and the previous one gets a line pointing to the new one.

## How to change an existing ADR

Three cases, with different treatments:

| Case | What to do |
|---|---|
| Correction or delimitation that **does not change the decision** (citation error, scope that was missing, consequence discovered later) | Edit in place and add a concise `Revisions:` line in the header (1–2 lines with date and PR/review origin) |
| **Change** an Accepted decision | A new ADR that supersedes it; the old one gets the line pointing to the new one and is not edited beyond that |
| **Close** an `[OPEN]` or promote a Proposed | Edit the Decision section and the Status in place, citing the commit or PR in which the maintainer decided. An `[OPEN]` has no decision to supersede; promoting a Proposed is the confirmation of the text that was already there |

Only the maintainer does the second and the third case. The first can be done by
the AI, and it is a review finding if it disguises a change of decision as a
correction.
