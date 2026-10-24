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

### What blocks V1 release

The following items gate the official release of V1 (they do not block local commits, PRs, or beta builds):

| # | Item | Reference | Status |
|---|---|---|---|
| V.9 | Security penetration test of lab server | [ADR 0083](adr/0083-security-hardening-of-universo.md) item 16 | Pending before announcement |
| V.10 | Validation of server bounds on 1-core 1 GB host | [ADR 0083](adr/0083-security-hardening-of-universo.md) item 18 | Pending |
| V.11 | Windows code signing (via SignPath Foundation) | [ADR 0095](adr/0095-mac-notarization-and-windows-code-signing.md) | Pending public repository |
| V.12 | Repository made public at `SergioSJS/verso` | [ADR 0004](adr/0004-project-name-verso.md) | Pending maintainer decision |
| V.13 | Screen reader accessibility pass | [`docs/review/accessibility.md`](review/accessibility.md) | Pending |
| V.14 | One month of real use with zero data loss | [ADR 0012](adr/0012-files-are-source-of-truth.md) | In daily use by maintainer |
| V.15 | App manual verification checklist | [`docs/reference/manual-checks.md`](reference/manual-checks.md) | Gates V1 release only |
| V.21 | Mac Intel app package | [ADR 0095](adr/0095-mac-notarization-and-windows-code-signing.md) | Pending |
| V.22 | Linux ARM64 app package | [ADR 0071](adr/0071-linux-port.md) | Pending public repository |

---

## After V1

Features deliberately deferred until after the V1 release:

1. **Third-party plugin system and compatibility shim** ([ADR 0016](adr/0016-plugins-execution-and-capabilities.md), [ADR 0017](adr/0017-plugins-format-shim-loading.md), [ADR 0047](adr/0047-plugin-api-open-questions.md)).
2. **Cloud storage transports** (S3 bucket, WebDAV, external cloud sync — [ADR 0073](adr/0073-self-hosted-server-first.md), [ADR 0104](adr/0104-external-cloud-storage-transports-and-quotas.md)).
3. **End-to-end encryption** as an opt-in for single-user servers ([ADR 0073](adr/0073-self-hosted-server-first.md)).
4. **Remote MCP server over the network** ([ADR 0045](adr/0045-server-and-mcp-security.md), [ADR 0073](adr/0073-self-hosted-server-first.md)).
5. **Agent writing directly to notes with diff** ([ADR 0018](adr/0018-llm-native-mcp-in-core.md)).
