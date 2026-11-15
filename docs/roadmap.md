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

**Reconciled with the code on 2026-11-15**: every row below checked against the git history (all branches; everything cited is in `main` and in a release unless it says otherwise), the code, the dated reviews in `docs/review/`, `CHANGELOG.md`, the assets of `v0.9.0-beta.2`, `docs/reference/manual-checks.md` and the ADRs' Status. A row says *Done* only with a commit or a report; *Not built* only after looking for it.

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
| V.20 | C | "This app is a server": local network pairing via QR | [0117](adr/0117-this-app-is-a-universo-server.md) D12 (was [0096](adr/archive/0096-this-app-is-a-server.md), superseded 2026-11-03) | Built; the folders chosen on the folder's page instead of Settings, and synced folders served, by the rewrite of 2026-11-04 (0117 D2, D4; steps R1, R2, R4) |

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
| V.31 | The demo vault in English beside the Portuguese one | [0058](adr/0058-demo-vault-as-tutorial.md) | **Partly**: the vault built 2026-10-21; the English screenshots (B6, decided 2026-10-31: an automatic script in Docker, before V1 when the interface is stable) not made — the vaults hold three screenshots, all Portuguese (`demo-vault/assets/servidor-*.png`, shared by `demo-vault-en/`), and no script makes them |
| V.32 | Accessibility work made new by the 2026-10-21 resolutions (A11Y.4, .6, .8, .10, .11, .13, .15 and more) | [`review/accessibility.md`](review/accessibility.md) §8 | Built |
| V.33 | Read links without an account: a folder or note of a UniVerso, optional expiry and passphrase, revocable | [0105](adr/0105-read-links-without-an-account.md) | Built 2026-10-21 |
| V.34 | The index lists every `^id`, so the oracle finds its tables through it | [0102](adr/0102-creative-oracles-and-improvisation.md) item 3 | Built |
| V.35 | Import files: drag into the tree renames a taken name; size limit becomes a setting | [`review/accessibility.md`](review/accessibility.md) §8 item 10 | Built |
| V.36 | The graph asks before creating the note of an unresolved node | spec Q14 | Built |
| V.37 | Theme-builder window & Themes v2: ~45 tokens and a built-in catalogue | [0100](adr/0100-visual-customization-wizard.md) item 2, [0109](adr/0109-themes-v2-more-tokens-and-a-catalogue.md) | Built |
| V.38 | Dialect: `tags: 2024` is the tag "2024"; `...` does not close the frontmatter | spec Q24 | Built |
| V.39 | World of Darkness and Cyberpunk RED layouts; notices on the Credits page only | [0099](adr/0099-visual-markdown-statblocks-and-cards.md) item 6 | Built 2026-10-21; the cards keep their one-line pointer to Credits (S.3b-bis, option A, decided 2026-10-22) |
| V.40 | Desktop sync with a cloud the person already has: WebDAV, S3, Dropbox, OneDrive, Google Drive | [0104](adr/0104-external-cloud-storage-transports-and-quotas.md) | **Partly**: part 1 (WebDAV, S3) built (`d5a4ff73`); Dropbox, OneDrive and Google Drive not started (`crates/verso-cloud` has only `webdav` and `s3`), waiting on the maintainer's developer accounts (C.1, *"Farei tudo depois e te aviso"*) |
| V.41 | Colour swatches for colour codes (`#rgb`, `rgb()`, `hsl()`, `oklch()`) | [0108](adr/0108-colour-swatches-for-colour-codes.md) | Built |
| V.42 | The Table: shared roll and chat log, campaign folder, and unified table access model | [0107](adr/0107-the-table-a-shared-roll-and-chat-log.md), [0110](adr/0110-a-table-is-a-campaign-folder.md) (phase 1), [0113](adr/0113-one-access-model-for-a-table.md) | Built |
| V.45 | "Turn into a server" as a UniVerso hosted by this app (rewritten 2026-11-04): a folder or subfolder served from its page, N tables, the host chosen per table (this computer or the UniVerso, a synced folder included), accounts and invitations, the game master at the table, an internet link by Cloudflare (quick or own address) on both hosts | [0117](adr/0117-this-app-is-a-universo-server.md) (was [0111](adr/archive/0111-online-mode-a-table-from-this-app-through-a-tunnel.md), superseded 2026-11-03: one feature with 0096) | **Done** (released in 0.9.0-beta.1, 2026-11-14): R3 `2e7a35cb`, R4 `ebd8b8a5`, R6 `205cdfb8`, R9 `fd543a30` (its undo `7522d16b`), R5 `80f32160`/`b04eaca7`, R7 lessons `58f2749f`…`7522a087` and the site's wiki re-imported (`versomd-site` `0810193`), R8 `552a395e` (the beta since installed through the updater, 0.9.0-beta.2); the Verso app paired with the computer (D19, 2026-11-15, `86ff3ef6`, not yet released). Left: `[OPEN]` build details in 0117 D4.2, D7 (e), D8 and D2 (Settings' list) for the maintainer. Until 2026-10-30 this row was folded into V.42 as Built, which it never was |
| V.43 | 0110 phase 2: game master's dashboard, show to the table, sessions, "new" notices, see as player, players' boards area, map pins | [0110](adr/0110-a-table-is-a-campaign-folder.md) items 8–11, 13, 14, 17 | **Not built** (in V1 scope, decided 2026-10-28): no commit and no code for a dashboard, *Show to the table*, sessions, *new* notices, *See as player* or a table's pin reveal; each item's design in 0110 is still `[PROPOSED]` |
| V.44 | 0112: confirm it is you on a linked device with the OS check and a per-device key (items 1–3 decided 2026-10-28) | [0112](adr/0112-confirming-it-is-you-on-a-linked-device.md) | **Not built** (no commit, no device key or OS check in the code); after the V1 blocking items |
| V.46 | An embedded terminal in the desktop app, for AI command-line tools (a tab; off by default; on this computer only) | [0115](adr/0115-an-embedded-terminal-in-the-desktop-app.md) | Built 2026-10-31 (amendment T1, T2), released in 0.8.4-beta.1; host tests green on macOS, Linux and Windows (ConPTY, the Job Object); the 12 manual checks per system (*The embedded terminal*, `manual-checks.md`) all unticked |
| V.47 | Music and sound at the table, heard by everyone: files as a shared playback state, and a live "share audio" of any application or page, relayed by the server; only the game master controls, each person their own volume | [0116](adr/0116-music-and-sound-at-the-table-heard-by-everyone.md) | Phase 1 built 2026-10-31 (files: the shared playback state, the game master's controls, the soundboard note, the strip and status item, the solo state; ADR 0116 Status, *As built (phase 1)*); phase 2, the live *Share audio* (section B), built 2026-11-02 for macOS 14.4+, Windows 11 and Linux (pages open in Verso only; listening on web and phone), pending the real-machine test (S13: still unticked in the task list; 0116 *As built (phase 2)* lists what it must confirm); the ambience layer, crossfade and one-shot effects after V1 (its Q4 (a)) |
| V.53 | A native Android app from the same core and UI: notes in app-private storage synced with a UniVerso, WebDAV or S3, a window on a UniVerso folder, and the phone as a server (LAN and the Cloudflare link) | [0118](adr/0118-a-native-android-app-from-the-same-core-and-ui.md) | Phase 0 done 2026-11-10; in V1's scope (0118 A7, decided 2026-11-10); the pending items built and merged on `feat/app-server` 2026-11-12 (share and open with, the shared folder, background sync, audio capture, the Cloudflare link, the `.beta` id beside the release; APK 71.8 MB); released since 0.9.0-beta.1 (`Verso-Beta-…-android-arm64.apk` in 0.9.0-beta.2). Open: typing latency, 58–59 ms median against 50 (`a2aed8a0`, to build); the TalkBack pass (TalkBack is not installed on the test phone; only Chromium's accessibility tree was read, 0118 Phase 1) |
| V.54 | An iOS and iPadOS app from the same core and UI: the iPhone through AltStore PAL in Brazil, the iPad through AltStore Classic with a source JSON we host, the App Store later | [0119](adr/0119-an-ios-and-ipados-app-through-altstore.md) | In V1's scope (0119 A7, decided 2026-11-13); Phase 0 done 2026-11-12 on the maintainer's iPad through Xcode (release `.ipa` with the tao git patch, a real second window, the server listening again after a lock, the tablet status bar); A5 built (`d5340670`, released in 0.9.0-beta.1); B11 decided (PAL in Brazil only, said on the landing page); the `.ipa` in every release since 0.9.0-beta.1 (`ab594d5f`) and lesson 28 for AltStore Classic (`f85ab424`). **Partly**: Phase 1's source JSON at `versomd.com/altstore/` (B3, decided) not made (the address answers 404 on 2026-11-15); Phase 2 (PAL) waits on the maintainer's Apple Developer Program (B1: bought when Phase 1 runs on the iPad) and an iPhone checker (B4, no answer) |

### Decided 2026-10-31 (nine built, three left)

The maintainer's answers to the list of 2026-10-31 (B and N items), each
recorded where it governs. Small items, in V1's current work; the contract
change of the first row goes to the server before the apps.

| # | Item | Where recorded | State |
|---|---|---|---|
| B1 | Another person's roll lands on its own chip, and the oracle's callout is found by its line — one contract change, server first | [0088](adr/0088-dice-and-random-tables.md), [0102](adr/0102-creative-oracles-and-improvisation.md) (amendments) | **Done** (`232a07e8`, released in 0.8.4-beta.1); no contract change was needed: the roll's place travels since `5bc67a211` (0088 *As built*) |
| B7 | A note above 16 MiB stays out of the index, with a notice on the note | [spec Q17](spec/dialect.md) (v0.51) | **Done**: the notice `941c33b7` (merge `795b90d5`, 0.8.4-beta.1) |
| B8 | Outside a table, only the folder's owner deletes (changed by the maintainer, not the recommendation) | [0113](adr/0113-one-access-model-for-a-table.md) section B | **Done** (`020aa50a`, and `52c5ff3a` for a synced desktop window; 0.8.4-beta.1) |
| B9 | A memory limit on the server's container by default (about 768 MB on 1 GB) | [0075](adr/0075-server-packaging-and-storage.md) (amendment) | **Done** (`5aa57be8` 768m in the compose files, `42a08326` `MemoryMax=75%` for systemd; 0.8.4-beta.1) |
| B11 | The server's trash kept under an age and size cap | [0080](adr/0080-the-trash-with-expiry-and-restore.md) (Status) | **Done** (`bc6fb1d2`, `VERSO_TRASH_MAX`, 1 GiB; 0.8.4-beta.1) |
| B12 | A rename made on the server arrives on a device as a rename | [0079](adr/0079-sync-a-local-folder-with-a-server.md) (Status) | **Done** (`7912b673`; 0.8.4-beta.1) |
| B13 | The server's old address shows a friendly page naming the right one, not the 421 | [0073](adr/0073-self-hosted-server-first.md) (Status) | **Done** (`f5bf8165`, `wrong_host.rs`; 0.8.4-beta.1) |
| B15 | On the desktop, a click on a folder's row opens or closes it; the button at its end opens the folder's page | [0060](adr/0060-makemd-organizing-features.md) | **Done** (`db9583c3`; 0.8.4-beta.1) |
| N1 | `verso dados.json` and File › Open file… take JSON, YAML, TOML, XML and CSV | [0114](adr/0114-opening-one-markdown-file-without-a-folder.md) item 34, [0042](adr/0042-open-from-command-line.md) | **Done** (`b139583b`; 0.8.4-beta.1) |
| N2 | The Mac beta signed with a fixed local certificate (the maintainer runs one keychain command once) | [0051](adr/0051-development-flow-and-releases.md) (amendment), [0095](adr/0095-mac-notarization-and-windows-code-signing.md) | **Not built**: `scripts/install-beta.sh` and the release still sign ad hoc (`codesign --sign -`); nothing blocks it. Since 0.9.0-beta.1 the Mac beta updates itself in the app, so the script runs less often |
| B5 | A Windows 10 virtual machine, and the Windows checks run on it | [0069](adr/0069-windows-port.md) (Status) | **Not done**: the Proxmox host lists no Windows 10 machine (`qm list`, 2026-11-15: 103 is Windows 11) and no commit mentions one; nothing blocks it (Proxmox standing OK) |
| B10 | The `night-*` test folders and accounts deleted from the servers | No ADR governs (a one-off action) | **Not done**: on 2026-11-15 VM 107's UniVerso still holds `night-empty`, `night-load`, `night-share`, `night-table` and the `night-*` accounts (ZimaOS not checked); nothing blocks it |

Decided with nothing to build: B3 (the presence notice stays "joined the
note", [0084](adr/0084-notifications-in-the-window.md)); B4 (the WoD and
Cyberpunk RED pt-BR field names stay provisional with a notice on the Credits
page, [0099](adr/0099-visual-markdown-statblocks-and-cards.md)); B2 (the
security contact, row V.48).

Decided 2026-11-01, no longer held (the list of that day): 0081 item 5 stays
(a share never appears inside the receiver's vault); and four go **into V1**,
all ordered *after the terminal and the music are polished*, none built: the
shared board with the owner's paths (V.49, [0081](adr/0081-sharing-between-people-on-one-universo.md)
item 11), the merge by block of offline edits (V.50, its own ADR still to be
written), the other placeholder providers (V.51, [0043](adr/0043-placeholder-guard.md))
and the bucket's pre-signed URL (V.52, [0044](adr/0044-verso-fs-semantics.md)). *(V.52 moved after V1 on 2026-11-14: After V1, item 10.)* *(2026-11-15: V.50–V.51 still not built — V.49 was built that day, the maintainer pulling it in; the terminal was built 2026-10-31 and the music's phase 2 on 2026-11-02, so the order now waits only on their manual checks and S13.)*

Still open: **B14**, the ZimaOS server's `VERSO_PUBLIC_URL` at `universo-test`
(no answer yet; the maintainer's server; since then a separate production
`universo` runs there at `universo.meioorc.com`, beside `universo-test`, per
`zimaos-server/docs/universo-producao.md`); **B16**, the PUM Companion research:
*"fica pra depois, vou investigar e te passo"* (later; he investigates and
comes back), no ADR. Held by the maintainer, **to be discussed with him on
2026-11-02**, unchanged meanwhile: [0081](adr/0081-sharing-between-people-on-one-universo.md)
item 5 (a share inside the receiver's vault) and item 11 (a shared board with
the owner's paths, after V1); the merge by block of offline edits after V1
with its own ADR (After V1, item 8); the other placeholder providers (Dropbox,
Google Drive on macOS) out of V1 ([0043](adr/0043-placeholder-guard.md)); the
bucket's pre-signed URL after V1 ([0044](adr/0044-verso-fs-semantics.md)).
*(Superseded 2026-11-01, above: item 5 stays; the other four are in V1.)*

### What blocks V1 release

The following items gate the official release of V1 (they do not block local commits, PRs, or beta builds):

| # | Item | Reference | Status |
|---|---|---|---|
| V.9 | Security penetration test of lab server | [ADR 0083](adr/0083-security-hardening-of-universo.md) item 16 | **Done** (the maintainer, 2026-11-15: *"penteste já foi"*; hostile lab, item 19: [`review/2026-11-13-hostile-lab.md`](review/2026-11-13-hostile-lab.md)) |
| V.48 | The security contact address exists (`security.txt`, `SECURITY.md`) | [ADR 0083](adr/0083-security-hardening-of-universo.md) item 15 | **On the maintainer**: `SECURITY.md` (`f97676a3`) and every server's `/.well-known/security.txt` name `security@versomd.com`, but `versomd.com` has no MX record (checked 2026-11-15), so the address does not receive mail yet; he creates it (B2); only the announcement waits on it |
| V.10 | Validation of server bounds on 1-core 1 GB host | [ADR 0083](adr/0083-security-hardening-of-universo.md) item 18 | **Done**: [`review/2026-11-13-load-vm107.md`](review/2026-11-13-load-vm107.md) (VM 107, 1 core, 1 GB); the maintainer's own servers run on 1 GB |
| V.11 | Windows code signing (via SignPath Foundation) | [ADR 0095](adr/0095-mac-notarization-and-windows-code-signing.md) | **Not started**: no signing step in `release.yml` (no `signtool`, no `signCommand`) and no code-signing policy on the project page. Nothing blocks it now (public since 2026-11-14): **on the maintainer** the SignPath Foundation application; then to build the workflow's signing (0095 items 3, 4, 8) |
| V.12 | Repository made public at `SergioSJS/verso` | [ADR 0004](adr/0004-project-name-verso.md) | **Done** (public; checked 2026-11-15) |
| V.13 | Screen reader accessibility pass (automated landmarks and labels built; live VoiceOver/NVDA pass in manual checks) | [`docs/review/accessibility.md`](review/accessibility.md), [`docs/reference/manual-checks.md`](reference/manual-checks.md) | Automated pass built (A11Y.4–.15, `ed720398`…`f68d243b`); **on the maintainer** (or someone he asks): the live VoiceOver walk-through on macOS by section 10's route (A11Y.14), never run; nothing blocks it |
| V.14 | One month of real use with zero data loss | [ADR 0012](adr/0012-files-are-source-of-truth.md) | **On the maintainer**: in daily use; no start date of the month is recorded anywhere. Fixes for data at risk shipped as late as 0.9.0-beta.2 (2026-11-15: the sync state flushed as written, an offline browser save no longer over another's edit) |
| V.15 | App manual verification checklist | [`docs/reference/manual-checks.md`](reference/manual-checks.md) | **On the maintainer**: 385 items unticked in `manual-checks.md`, 4 ticked (the last on 2026-10-09); gates V1 release only |
| V.21 | Mac Intel app package | [ADR 0095](adr/0095-mac-notarization-and-windows-code-signing.md) | **Not built**: `v0.9.0-beta.2` ships `macos-arm64` only. Decided (0095 item 9): a `macos-x64` build cross-compiled on the arm64 runner, tested under Rosetta (this Mac has it). Nothing blocks it; not on the maintainer |
| V.22 | Linux ARM64 app package | [ADR 0071](adr/0071-linux-port.md) | **Not built**: `v0.9.0-beta.2` ships Linux app packages for x86_64 only; `release.yml`'s comment says the matrix entry to add (`ubuntu-22.04-arm`). Nothing blocks it now (public repository); the server's ARM64 packages already ship |
| V.49 | A shared board with the owner's paths: a share's sync carries a board with the share's paths, and a share window without a table joins the board's room by them | [ADR 0081](adr/0081-sharing-between-people-on-one-universo.md) item 11 | **Done** (2026-11-15, the maintainer: *"no hack, pull V.49 in"*): the share's sync carries the board cut to the share on every path, hashes of the cut (`d849174e`); a share window without a table edits the board in a shadow of its room cut to the share (`c36fa5e4`); a board is not renamed through a share out of being a board (`2879cd93`). Two devices by hand in `manual-checks.md` |
| V.50 | Merge by block of offline edits (two people who edited one note offline are merged, not copied) | [ADR 0082](adr/0082-live-co-editing-of-a-synced-folder.md), [ADR 0073](adr/0073-self-hosted-server-first.md) item 10 | Decided into V1 2026-11-01; **not started**: its own ADR not written (none in `docs/adr/`), no code; after the terminal and the music are polished |
| V.51 | The other placeholder providers (Dropbox, Google Drive on macOS) never read as a deletion | [ADR 0043](adr/0043-placeholder-guard.md) | Decided into V1 2026-11-01; **not built**: `verso-fs/src/placeholder.rs` knows iCloud's `SF_DATALESS` and Windows' cloud attributes only; whether File Provider placeholders carry `SF_DATALESS` was never observed (needs a Mac with Dropbox or Google Drive); after the terminal and the music are polished |
| V.55 | A virtual tabletop layer on the board: scenes, grid, tokens, walls, fog and sight (ADR 0121) | [ADR 0121](adr/0121-a-virtual-tabletop-layer-on-the-board.md) | **Decided into V1 2026-11-15** by the maintainer (Q1 (b)); Q0 (a): a scene is a group on the board with its own play view; Q3: inside a scene a player moves only their own token, the one tied to their sheet/note. The other questions (Q2, Q4–Q20) are being read by the maintainer; not built (step T0, the player's key allowlist, is built: `942359ac`) |
| V.56 | Opening one `.md` file without a folder | [ADR 0114](adr/0114-opening-one-markdown-file-without-a-folder.md) | **Done; counted in V1** by the maintainer 2026-11-15 (Q11 (a)); released in 0.8.4-beta.1 |
| V.52 | ~~The bucket's pre-signed URL~~ | [ADR 0044](adr/0044-verso-fs-semantics.md) | Moved **after V1** by the maintainer on 2026-11-14 (*"fica pra depois mesmo, tem que tá no roadmap"*): After V1, item 10 |

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
8. **Merge by block of offline edits** and the three-way merge of an outside program's edit into a live room ([ADR 0082](adr/0082-live-co-editing-of-a-synced-folder.md) Consequences, [ADR 0073](adr/0073-self-hosted-server-first.md) item 10): two people who edited one note offline end with a copy today; kept for later by the maintainer on 2026-10-10 because it needs the base's bytes kept, not only its hash. Its own ADR first. *(2026-10-31: put to the maintainer as "after V1, with its own ADR" and not accepted. **2026-11-01: moved into V1 as V.50** by the maintainer, after the terminal and the music are polished.)*
9. **Opening one `.md` file without a folder** (maintainer's request, 2026-10-30; [ADR 0114](adr/0114-opening-one-markdown-file-without-a-folder.md), **Accepted** 2026-10-30, built on `feat/single-file` 2026-10-30). Verso declared a handler for `.md`/`.markdown` on the three systems — never the default by itself; a double-clicked file opens in a loose-files window with no tree, no index and nothing written beside the file, through a `verso-fs` root scoped to that one file (pictures beside it readable, siblings not); "Open the whole folder in Verso" as the way back. Index, search, backlinks, MCP, sync and history are off in that window. Listed here as a proposal; whether it enters V1 (Q11 of the ADR) is the maintainer's call. *(2026-11-15: merged and released in 0.8.4-beta.1, with N1's data files; **counted in V1 as V.56** by the maintainer the same day, Q11 (a).)*
10. **The bucket's pre-signed URL** (V.52 until 2026-11-14, [ADR 0044](adr/0044-verso-fs-semantics.md), [ADR 0073](adr/0073-self-hosted-server-first.md) item 4(b)): a UniVerso that keeps its files in a bucket hands each file over by a short-lived link of the bucket itself, signed after the access check, instead of passing the bytes through the server; with it, the server's bucket mode. Moved after V1 by the maintainer on 2026-11-14 (*"Ah tá, fica pra depois mesmo, tem que tá no roadmap"*), after the explanation of what it is.
11. **A virtual tabletop layer on the board** (maintainer's request, 2026-11-15, after the Atlas VTT survey [`reference/atlas-vtt-survey-2026-11-15.md`](reference/atlas-vtt-survey-2026-11-15.md); [ADR 0121](adr/0121-a-virtual-tabletop-layer-on-the-board.md), **Proposed**, nothing decided; revised the same day after its review [`review/2026-11-15-adr-0121-review.md`](review/2026-11-15-adr-0121-review.md)). Asked for before and left as "later" inside [0090](adr/0090-maps-on-the-board.md) (Consequences), [0110](adr/0110-a-table-is-a-campaign-folder.md) item 16 and [0120](adr/0120-maps-from-watabous-generators.md) items 3 and 11, with no row of its own until now. **Moved into V1 as V.55 on 2026-11-15** (the maintainer, 0121 Q1 (b)). The central question is Q0, what a scene is (recommended: a group on the board carrying the scene's grid, fog and walls, with its own play view; a scene file as the fallback). Proposed order (the author's sizes, not a plan):

    | # | Step | Size | State |
    |---|---|---|---|
    | T0 | The board's projection serves only the keys it knows (top level being fixed 2026-11-15: `verso.walls` and secret doors reached players), then nodes' keys | S | Proposed; top level in progress |
    | T1 | Scenes on the board and their grid: square, hex pointy, hex flat; alignment on the map; snap; cell numbers (the hexcrawl of 0120 item 11) | M | Proposed (Q0) |
    | T2 | Players who only see a board follow it live, read-only | M | Proposed (Q8) |
    | T3 | Ruler in the grid's units, shared live | S | Proposed |
    | T4 | Tokens: a note's file card with its own public face, size in cells, snapped, the tracker as a bar | L | Proposed (Q2, Q12) |
    | T5 | Hide a drawn element from players | S–M | Proposed |
    | T6 | Initiative tracker in the Table panel, hidden entries by default | L | Proposed (Q9, Q15) |
    | T7 | The play view ("Open the scene") and a player window (second screen / TV) | M | Proposed (Q16); needs V.43 "see as player" |
    | T8 | Walls and doors editor | S–M | Proposed |
    | T9 | Universal VTT import (`.dd2vtt`, `.uvtt`, `.df2vtt`) into a scene with walls | S–M | Proposed (Q11) |
    | T10 | Players move only their tokens; walls block moves | M | Proposed (Q3, Q14b) |
    | T11 | Manual fog of war, left out of every path a player has; map tiles masked under fog | XL | Proposed (Q4, Q6, Q13) |
    | T12 | Token vision computed on the server; explored areas | L–XL | Proposed (Q5, Q7, Q18) |
