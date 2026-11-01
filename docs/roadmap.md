# Verso roadmap

The product roadmap and status of current work.

Historical details and exit criteria of closed phases (Phases 0–3) are archived in [`docs/reference/roadmap-archive.md`](reference/roadmap-archive.md).

---

## Completed phases

| Phase | Focus | State | Deliverables summary |
|---|---|---|---|
| **Phase 0 — Foundation** | Governance, docs, guardrails | **Closed** (2026-09-21) | Workspace crates, initial fixtures, CI guardrails, license (MPL-2.0 / MIT) |
| **Phase 1 — Core via CLI** | Core engine without UI | **Closed** (2026-09-23) | Markdown parser (`verso-dialect`), atomic fs, FTS5 index, backlinks, read-only MCP |
| **Phase 2 — Desktop app** | macOS and Windows app | **Closed** (2026-10-09) | Tauri v2 host, CodeMirror 6, Live Preview, Excalidraw board, bases, Notion-like blocks |
| **Phase 3 — Server & Sync** | Linux app & self-hosted server | **Closed** (2026-10-14) | Linux packages, UniVerso (`verso serve`), accounts, permissions, folder sync, live co-editing |

---

## Phase 4 — V1 (Current Phase)

Decided by the maintainer on 2026-10-14 (*"VAI SER TUDO NA V1"*). Incorporates complete worldbuilding, tabletop RPG primitives, and mobile/local serving into a solid V1 release.

### Feature Waves (All built)

| # | Wave | Feature | ADR | State |
|---|---|---|---|---|
| V.1 | A | Hover preview over links, panels, graph and board | [0085](adr/0085-hover-preview.md) | Built |
| V.2 | A | Infobox card for typed notes | [0086](adr/0086-infobox-a-typed-notes-card.md) | Built |
| V.4 | A | Inline dice rolls and random table roller | [0088](adr/0088-dice-and-random-tables.md), [0036](adr/0036-tabletop-rpg-support.md) | Built |
| V.5 | A | Linking unlinked mentions with diff | [0089](adr/0089-linking-unlinked-mentions.md) | Built |
| V.18 | A2 | Periodic notes (weekly, monthly, quarterly, yearly) | [0093](adr/0093-periodic-notes.md) | Built |
| V.19 | A2 | Regular expressions in bases and map layout | [0094](adr/0094-the-rest-of-bases.md) | Built |
| V.3 | B | Secret blocks (`> [!secret]`) hidden from readers | [0087](adr/0087-secret-blocks-hidden-from-readers.md) | Built |
| V.7 | B | Version history and recovery | [0091](adr/0091-version-history.md) | Built |
| V.23 | B | Embedded web pages (iframe / native child view) | [0056](adr/0056-embedded-web-pages.md) | Built |
| V.6 | C | Maps on the board with pins and secret markers | [0090](adr/0090-maps-on-the-board.md) | Built |
| V.8 | C | Offline mobile PWA storage and sync | [0092](adr/0092-the-phone-offline.md) | Built |
| V.17 | C | In-app notification center | [0084](adr/0084-notifications-in-the-window.md) | Built |
| V.20 | C | "This app is a server": local network pairing via QR | [0096](adr/0096-this-app-is-a-server.md) | Built |

### Wave D (added 2026-10-20, built on `feat/rpg-tools`)

ADRs 0098 to 0103 were first written by another AI marked Accepted with no acceptance; the review of 2026-10-20 ([`docs/review/2026-10-20-rpg-round.md`](review/2026-10-20-rpg-round.md)) put the questions to the maintainer, who answered *"adorei as sugestões e melhorias e correções. pode definir uma sequencia e atuar em tudo"* and the ADRs were rewritten with his answers.

| # | Feature | ADR | State |
|---|---|---|---|
| V.24 | Feature switches: one per optional feature, all on by default | [0103](adr/0103-feature-presets-and-capability-flags.md) | Built |
| V.25 | Oracles: graduated answers, sparks, answer written into the note | [0102](adr/0102-creative-oracles-and-improvisation.md) | Built |
| V.26 | Statblocks: a card from a `statblock` block, layouts as files | [0099](adr/0099-visual-markdown-statblocks-and-cards.md) | Built (2026-10-21; WoD and Cyberpunk RED layouts V.39) |
| V.27 | Project wizard: a folder tree from a bundle, shown and edited before written | [0098](adr/0098-world-and-campaign-wizard-template-bundles.md) | Built |
| V.28 | Appearance wizard: live preview, saved profiles, `.verso-theme` files | [0100](adr/0100-visual-customization-wizard.md) | Built (2026-10-21); theme-builder window V.37 |
| V.29 | 3D dice: a lazy module staging the fall onto a result already drawn | [0101](adr/0101-3d-dice-physics-overlay.md) | Built (`three` + `cannon-es`) |
| V.30 | Structured data as a diagram (JSON, YAML, JSONC, JSONL, TOML, XML, CSV) | [0106](adr/0106-structured-data-as-a-diagram.md) | Built 2026-10-21 (also reads TSV, undecided; as-built note in 0106) |
| V.31 | The demo vault in English beside the Portuguese one | [0058](adr/0058-demo-vault-as-tutorial.md) | Built 2026-10-21; English screenshots before V1 when the interface is stable, made by an automatic script in Docker (decided 2026-10-31, B6) |
| V.32 | Accessibility work made new by the 2026-10-21 resolutions (A11Y.4, .6, .8, .10, .11, .13, .15 and more) | [`review/accessibility.md`](review/accessibility.md) §8 | Built |
| V.33 | Read links without an account: a folder or note of a UniVerso, optional expiry and passphrase, revocable | [0105](adr/0105-read-links-without-an-account.md) | Built 2026-10-21 |
| V.34 | The index lists every `^id`, so the oracle finds its tables through it | [0102](adr/0102-creative-oracles-and-improvisation.md) item 3 | Built |
| V.35 | Import files: drag into the tree renames a taken name; size limit becomes a setting | [`review/accessibility.md`](review/accessibility.md) §8 item 10 | Built |
| V.36 | The graph asks before creating the note of an unresolved node | spec Q14 | Built |
| V.37 | Theme-builder window & Themes v2: ~45 tokens and a built-in catalogue | [0100](adr/0100-visual-customization-wizard.md) item 2, [0109](adr/0109-themes-v2-more-tokens-and-a-catalogue.md) | Built |
| V.38 | Dialect: `tags: 2024` is the tag "2024"; `...` does not close the frontmatter | spec Q24 | Built |
| V.39 | World of Darkness and Cyberpunk RED layouts; notices on the Credits page only | [0099](adr/0099-visual-markdown-statblocks-and-cards.md) item 6 | Built 2026-10-21; the cards keep their one-line pointer to Credits (S.3b-bis, option A, decided 2026-10-22) |
| V.40 | Desktop sync with a cloud the person already has: WebDAV, S3, Dropbox, OneDrive, Google Drive | [0104](adr/0104-external-cloud-storage-transports-and-quotas.md) | Part 1 (WebDAV, S3) built; OAuth providers wait for developer accounts (C.1) |
| V.41 | Colour swatches for colour codes (`#rgb`, `rgb()`, `hsl()`, `oklch()`) | [0108](adr/0108-colour-swatches-for-colour-codes.md) | Built |
| V.42 | The Table: shared roll and chat log, campaign folder, and unified table access model | [0107](adr/0107-the-table-a-shared-roll-and-chat-log.md), [0110](adr/0110-a-table-is-a-campaign-folder.md) (phase 1), [0113](adr/0113-one-access-model-for-a-table.md) | Built |
| V.45 | Online mode: a table from this app through a tunnel | [0111](adr/0111-online-mode-a-table-from-this-app-through-a-tunnel.md) | Not built (accepted 2026-10-23; its first step is item 12's spike). Until 2026-10-30 this row was folded into V.42 as Built, which it never was |
| V.43 | 0110 phase 2: game master's dashboard, show to the table, sessions, "new" notices, see as player, players' boards area, map pins | [0110](adr/0110-a-table-is-a-campaign-folder.md) items 8–11, 13, 14, 17 | Not built (in V1 scope, decided 2026-10-28) |
| V.44 | 0112: confirm it is you on a linked device with the OS check and a per-device key (items 1–3 decided 2026-10-28) | [0112](adr/0112-confirming-it-is-you-on-a-linked-device.md) | Not built; after the V1 blocking items |
| V.46 | An embedded terminal in the desktop app, for AI command-line tools (a tab; off by default; on this computer only) | [0115](adr/0115-an-embedded-terminal-in-the-desktop-app.md) | Not built (accepted 2026-10-31, into V1) |
| V.47 | Music and sound at the table, heard by everyone: files as a shared playback state, and a live "share audio" of any application or page, relayed by the server; only the game master controls, each person their own volume | [0116](adr/0116-music-and-sound-at-the-table-heard-by-everyone.md) | Phase 1 built 2026-10-31 (files: the shared playback state, the game master's controls, the soundboard note, the strip and status item, the solo state; ADR 0116 Status, *As built (phase 1)*); phase 2, the live *Share audio* (section B), not built; the ambience layer, crossfade and one-shot effects after V1 (its Q4 (a)) |

### Decided 2026-10-31, to be built

The maintainer's answers to the list of 2026-10-31 (B and N items), each
recorded where it governs. Small items, in V1's current work; the contract
change of the first row goes to the server before the apps.

| # | Item | Where recorded | State |
|---|---|---|---|
| B1 | Another person's roll lands on its own chip, and the oracle's callout is found by its line — one contract change, server first | [0088](adr/0088-dice-and-random-tables.md), [0102](adr/0102-creative-oracles-and-improvisation.md) (amendments) | To be built |
| B7 | A note above 16 MiB stays out of the index, with a notice on the note | [spec Q17](spec/dialect.md) (v0.51) | Cap built; notice to be built |
| B8 | Outside a table, only the folder's owner deletes (changed by the maintainer, not the recommendation) | [0113](adr/0113-one-access-model-for-a-table.md) section B | To be built |
| B9 | A memory limit on the server's container by default (about 768 MB on 1 GB) | [0075](adr/0075-server-packaging-and-storage.md) (amendment) | To be built |
| B11 | The server's trash kept under an age and size cap | [0080](adr/0080-the-trash-with-expiry-and-restore.md) (Status) | To be built |
| B12 | A rename made on the server arrives on a device as a rename | [0079](adr/0079-sync-a-local-folder-with-a-server.md) (Status) | To be built |
| B13 | The server's old address shows a friendly page naming the right one, not the 421 | [0073](adr/0073-self-hosted-server-first.md) (Status) | To be built |
| B15 | On the desktop, a click on a folder's row opens or closes it; the button at its end opens the folder's page | [0060](adr/0060-makemd-organizing-features.md) | To be built |
| N1 | `verso dados.json` and File › Open file… take JSON, YAML, TOML, XML and CSV | [0114](adr/0114-opening-one-markdown-file-without-a-folder.md) item 34, [0042](adr/0042-open-from-command-line.md) | To be built |
| N2 | The Mac beta signed with a fixed local certificate (the maintainer runs one keychain command once) | [0051](adr/0051-development-flow-and-releases.md) (amendment), [0095](adr/0095-mac-notarization-and-windows-code-signing.md) | To be built |
| B5 | A Windows 10 virtual machine, and the Windows checks run on it | [0069](adr/0069-windows-port.md) (Status) | To be done |
| B10 | The `night-*` test folders and accounts deleted from the servers | No ADR governs (a one-off action) | To be done |

Decided with nothing to build: B3 (the presence notice stays "joined the
note", [0084](adr/0084-notifications-in-the-window.md)); B4 (the WoD and
Cyberpunk RED pt-BR field names stay provisional with a notice on the Credits
page, [0099](adr/0099-visual-markdown-statblocks-and-cards.md)); B2 (the
security contact, row V.48).

Still open: **B14**, the ZimaOS server's `VERSO_PUBLIC_URL` at `universo-test`
(no answer yet; the maintainer's server); **B16**, the PUM Companion research:
*"fica pra depois, vou investigar e te passo"* (later; he investigates and
comes back), no ADR. Held by the maintainer, **to be discussed with him on
2026-11-02**, unchanged meanwhile: [0081](adr/0081-sharing-between-people-on-one-universo.md)
item 5 (a share inside the receiver's vault) and item 11 (a shared board with
the owner's paths, after V1); the merge by block of offline edits after V1
with its own ADR (After V1, item 8); the other placeholder providers (Dropbox,
Google Drive on macOS) out of V1 ([0043](adr/0043-placeholder-guard.md)); the
bucket's pre-signed URL after V1 ([0044](adr/0044-verso-fs-semantics.md)).

### What blocks V1 release

The following items gate the official release of V1 (they do not block local commits, PRs, or beta builds):

| # | Item | Reference | Status |
|---|---|---|---|
| V.9 | Security penetration test of lab server | [ADR 0083](adr/0083-security-hardening-of-universo.md) item 16 | Pending before announcement |
| V.48 | The security contact address exists (`security.txt`, `SECURITY.md`) | [ADR 0083](adr/0083-security-hardening-of-universo.md) item 15 | The maintainer creates it and sends it (decided 2026-10-31, B2); only the announcement waits on it |
| V.10 | Validation of server bounds on 1-core 1 GB host | [ADR 0083](adr/0083-security-hardening-of-universo.md) item 18 | Pending |
| V.11 | Windows code signing (via SignPath Foundation) | [ADR 0095](adr/0095-mac-notarization-and-windows-code-signing.md) | Pending public repository |
| V.12 | Repository made public at `SergioSJS/verso` | [ADR 0004](adr/0004-project-name-verso.md) | Pending maintainer decision |
| V.13 | Screen reader accessibility pass (automated landmarks and labels built; live VoiceOver/NVDA pass in manual checks) | [`docs/review/accessibility.md`](review/accessibility.md), [`docs/reference/manual-checks.md`](reference/manual-checks.md) | Automated pass built; live reader check gates V1 release |
| V.14 | One month of real use with zero data loss | [ADR 0012](adr/0012-files-are-source-of-truth.md) | In daily use by maintainer |
| V.15 | App manual verification checklist | [`docs/reference/manual-checks.md`](reference/manual-checks.md) | Gates V1 release only |
| V.21 | Mac Intel app package | [ADR 0095](adr/0095-mac-notarization-and-windows-code-signing.md) | Pending |
| V.22 | Linux ARM64 app package | [ADR 0071](adr/0071-linux-port.md) | Pending public repository |

---

## After V1

Features deliberately deferred until after the V1 release:

1. **Third-party plugin system and compatibility shim** ([ADR 0016](adr/0016-plugins-execution-and-capabilities.md), [ADR 0017](adr/0017-plugins-format-shim-loading.md), [ADR 0047](adr/0047-plugin-api-open-questions.md)).
2. ~~Cloud storage transports via vendor API~~: moved into V1 as V.40 by [ADR 0104](adr/0104-external-cloud-storage-transports-and-quotas.md) item 1 (decided 2026-10-21); this line contradicted it until 2026-10-29.
3. **End-to-end encryption** as an opt-in for single-user servers ([ADR 0073](adr/0073-self-hosted-server-first.md)).
4. **Remote MCP server over the network** ([ADR 0045](adr/0045-server-and-mcp-security.md), [ADR 0073](adr/0073-self-hosted-server-first.md)).
5. **Agent writing directly to notes with diff** ([ADR 0018](adr/0018-llm-native-mcp-in-core.md)).
6. **Import from and export to Notion and Obsidian** (maintainer's idea, 2026-10-28; no ADR yet, nothing decided). The point is trust: a person can try Verso and leave the way they came. Proposed order, still to be decided:
   1. An Obsidian compatibility report. A folder already opens as it is (boards are `.canvas`, bases are `.base`), so the report only lists what Obsidian will show as plain text (dice, statblocks, oracles, table and chat).
   2. Import from a Notion export zip (Markdown & CSV, no API token). It strips the ID suffix from names, turns encoded links into `[[ ]]`, and makes each database a folder of notes plus a `.base`. The `obsidianmd/obsidian-importer` plugin (MIT) may be studied ([ADR 0009](adr/0009-external-constraints.md)).
   3. Export to a zip that Notion's own importer reads, only if someone asks for it.
   `[OPEN]`: the phase; what Notion toggles and columns become; whether an import may merge into an existing folder.
7. **Terminal and agents on a server's folder** ([ADR 0054](adr/0054-terminal-and-agents-from-the-app.md)): they stay hidden in a desktop window that shows a server's folder; deferred by the maintainer on 2026-10-23 (*"Isso fica pra depois"*; [`review/2026-10-23-table-three-devices.md`](review/2026-10-23-table-three-devices.md)).
8. **Merge by block of offline edits** and the three-way merge of an outside program's edit into a live room ([ADR 0082](adr/0082-live-co-editing-of-a-synced-folder.md) Consequences, [ADR 0073](adr/0073-self-hosted-server-first.md) item 10): two people who edited one note offline end with a copy today; kept for later by the maintainer on 2026-10-10 because it needs the base's bytes kept, not only its hash. Its own ADR first. *(2026-10-31: put to the maintainer as "after V1, with its own ADR" and not accepted; to be discussed with him on 2026-11-02.)*
9. **Opening one `.md` file without a folder** (maintainer's request, 2026-10-30; [ADR 0114](adr/0114-opening-one-markdown-file-without-a-folder.md), **Accepted** 2026-10-30, built on `feat/single-file` 2026-10-30). Verso declared a handler for `.md`/`.markdown` on the three systems — never the default by itself; a double-clicked file opens in a loose-files window with no tree, no index and nothing written beside the file, through a `verso-fs` root scoped to that one file (pictures beside it readable, siblings not); "Open the whole folder in Verso" as the way back. Index, search, backlinks, MCP, sync and history are off in that window. Listed here as a proposal; whether it enters V1 (Q11 of the ADR) is the maintainer's call.
