# Permissions audit — a table's access, 2026-10-24 (`feat/rpg-tools` at `6919e533`)

- Date: 2026-10-24
- Why: the maintainer's live test of a table that day (quoted in
  [ADR 0113](../adr/0113-one-access-model-for-a-table.md), Context): two menus
  in two corners, no way to release a board for editing, and "Você só lê esta
  pasta" when dropping onto a note he was allowed to edit.
- What: a read-only audit of every permission concept of the server, the
  window and the desktop host, at `6919e533`. Nothing was edited. This page is
  the audit's map (part 1); its proposal became
  [ADR 0113](../adr/0113-one-access-model-for-a-table.md), accepted the same
  day with the maintainer's answers, and is not repeated here.
- Paths: server = `crates/verso-server/src/`, window = `app/ui/src/`, host =
  `app/src-tauri/src/`, shots = `docs/media/test-runs/2026-10-23-mesa/`.
- Under review: [ADR 0110](../adr/0110-a-table-is-a-campaign-folder.md) as
  built (phase 1 and its amendments of 2026-10-23 and 2026-10-24),
  [ADR 0107](../adr/0107-the-table-a-shared-roll-and-chat-log.md) item 3's
  images, [ADR 0081](../adr/0081-sharing-between-people-on-one-universo.md),
  [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md),
  [ADR 0076](../adr/0076-the-window-on-every-screen.md) item 11.

## 1. Every permission concept today

| # | Concept | Stored | Server decides | Window decides | Desktop host | ADR |
|---|---|---|---|---|---|---|
| 1 | **Folder role** owner / editor / reader | `grants (folder, account, role)` db.rs:180 | `access::role` access.rs:17; `at_least` access.rs:47; `role_here` rpc.rs:885 | only as `can("write")` from capabilities (can.ts:62 `canWrite`) | remote window takes the server's `write` (remote.rs:47-73, `with_app_abilities`) | 0074 item 6 |
| 2 | **Share** (role on a path, editor/reader) | `shares`, `share_grants` db.rs:31-45 | `shares::scope_here`; highest covering grant; `folder_command` scope branch rpc.rs:938-1069 | `mayShare()` = "share_list did not fail" shares.ts:33-40 (owner inferred from an error) | `shares.rs` passthrough | 0081 items 1, 2, 14 |
| 3 | **Credential cap**: PAT read/write, read link, phone role | `tokens`, `token_folders`; `Who.phone` | `Who::reaches` auth.rs:88 (phone → role.writes(); token → write bit); `access::role` access.rs:34 (`role.min(Reader)`) and :38-42 (phone `min(Editor)`); `table::acting` table.rs:632 (phone again); `Client.token_write` (phone folded, 0110 "images") | invisible: only "no `write` in capabilities" | — | 0074 item 8, 0096 item 12, 0105 |
| 4 | **Read link visitor** | `read_links` | `visit::visitor` visit.rs:315 — a read-only token for account `link:<id>`, so the veil treats it as a player | read-only window | — | 0105 |
| 5 | **Phone pairing role** reader/editor ("Pode editar") | local server config | `access::role` access.rs:27-42; `game_master` refuses phones campaign_cmds.rs:76 | `errPhoneReads` strings.ts:264 | `local_server.rs` | 0096 items 12, 15 |
| 6 | **Who is a player** of a table | derived, not stored | `campaign::player` campaign.rs:666 = "window that only reads a folder with a table" (via `readers::reads_only` readers.rs:107); `players_of` campaign_cmds.rs:536 = readers of folder or of a share at/above/inside the table; editors never | `campaign().viewer === "player"` (status) | via sync link | 0110 "Who is a player" |
| 7 | **Who is the game master** | derived | for commands: `game_master` campaign_cmds.rs:64 = owner, not via share, not phone, write credential. For the veil: owner **and editors** (campaign.rs:675 `reads_only`). For secret rolls: owner only table.rs:165. For deleting rolls / clearing: owner only table.rs:899-903, :921. For images: owner or editor table.rs:1014. For status: owner → `"owner"`, editor → `"none"` campaign_cmds.rs:616, :725 | `mayShare()`, `campaign().viewer === "owner"` | sync link answers as owner | 0110 items 15, "chosen in the code (2)"; 0107 |
| 8 | **Table exists / open-closed** | `campaigns (folder, root, open, log_max, image_max)` db/campaign.rs:26 | `campaign::closed_for` campaign.rs:691, `guard` :703 (players only) | chip, card, notice (tableChip.ts, tableCard.ts, folderView) | `SyncStatus.problem = table_closed` | 0110 item 3 (MC.1 = A) |
| 9 | **Note audience** hidden / table / players | `campaign_notes.released` db/campaign.rs:38 + `campaign_audience (folder, path, account)` db/campaign.rs:59 | `Veil::released` campaign.rs:131; `hides` :263; `hides_note_from` :197; `campaign_serve::judge` campaign_serve.rs:262 | `noteAudience` campaign.ts:66; `hiddenFromTable` :58; `audienceItems` :210; noteAccess.ts | — | 0110 item 4 + amendment 2026-10-23 |
| 10 | **Per-note edit grant** none / group / one player | `campaign_notes.grant_kind, grant_account` db/campaign.rs:40-41 | `Veil::may_edit` campaign.rs:239; `granted_write` campaign.rs:752 (only `write_note`/`write_text`, only `.md`); room: rpc_collab.rs:64-72; sync: `group_put` campaign.rs:783 (**group only**) sync.rs:619-626 | `mayEditGranted` campaign.ts:90; editor `readOnly` note.ts:991 | sync_put refused for a one-player grant | 0110 item 5 |
| 11 | **Coupling audience ↔ grant** | side effects in db | grant to group → released to table campaign_cmds.rs:520-524; grant to player → added to audience; narrowing audience drops grants db/campaign.rs:512-523 | told only in the status line (`alsoSees`) campaign.ts:195-203 | — | 0110 "As built (audience)" |
| 12 | **Boards' release / grant** | release: same rows as notes (`note_like` includes `.canvas`/`.base` campaign.rs:57); grant: **refused** | `grant` refuses non-`.md` campaign_cmds.rs:489; board room refused to every reader collab.rs:444 | menu offers only "Liberar para…" for a board (campaign.ts:257 `.md` test); board `readOnly = !canWrite()` board.ts:671, :242; no access indicator (noteAccess.ts:167 `.md` only) | — | 0110 "As built": "boards cannot be granted in phase 1"; 0090 item 5 |
| 13 | **Secret name** | `campaign_notes.secret_name` | `campaign_text.rs` (▒▒▒▒) | menu row campaign.ts:258 | — | 0110 item 7 |
| 14 | **Secret blocks / readers' projection** | in the note text (`> [!secret]`) | readers get projection (`dispatch_reader`, rpc.rs:1166-1170); a grantee reads whole (0110 "chosen (3)"); boards' text nodes 0087 rev. 2026-10-15 | `secret/view.ts:74` toggle only if `canWrite()` | — | 0087 items 2-5 |
| 15 | **Images permission** (send to chat) | `campaign_images (folder, root, account)` db/campaign.rs:110 | `may_send_images` table.rs:1001; `images_allowed` :1022; pre-parse set in `inflight.rs`; `table_send_image` table.rs:796-800 | `canSendImage` (table/server.ts, from `TableJoin.images`); switch in campaignPlayers.ts | — | 0107 item 3 amended; 0110 "who may send images" |
| 16 | **Secret rolls** | `table_log.secret` | masked unless roller or **owner** table.rs:161-165 | roll-mode button | — | 0107 |
| 17 | **Reader lock / notice** | — | — | `folderLock` screen/frame.ts:150-156; `readerAttempt` / `guard` / `refused` readerNotice.ts:35-85; callers keys.ts:226, :338, files.ts:54, tree/prompts.ts:19-138, layout/drag.ts:317, note.ts:589, note/editing.ts:106, textfile.ts:129 | — | 0076 amendment 2026-10-23 |
| 18 | **Synced reader** (desktop, local copy of a server folder where one reads) | sync state | `sync_put` refusal sync.rs:625 | **three copies** of the same flag: `readsSynced` can.ts:69-77, `syncedReader` collab.ts:60, `syncedReader` folderLayer.ts:85-99; `canChange()` can.ts:82 | `l.role == "reader"` sync.rs:893 (uploads skipped, "changes here") | 0079 item 1 |
| 19 | **MCP / agents** | — | local `verso mcp` writes nothing (verso-cli/src/mcp.rs:72); on a server only via PAT (row 3) | `can("agents")` | — | 0066, 0074 item 8 |
| 20 | **Harness** (e2e) | — | — | TS copy of the rules: harness/campaign.ts:187-199 (grant), :260-266 (narrowing), :314 (mayEdit); harness/table.ts:220 (images) | — | — |

Window predicates, by count of call sites (excluding the harness): `canWrite()`
35, `viewer ===` 16, `mayShare()` 13, `readable()` 12, `oracleNotWritable` 11,
`canSendImage` 8, `canChange()` 7, `mayEditGranted(` 6, `can("write")` 5,
`readsSynced()` 2 — about **115 places** answering "may I change this?" from
**seven** different sources (capabilities, a sync event ×3, the campaign
status, the share list's success, the table join, the folder layer).

## 2. Where two of these answer the same question differently

**C1 — "May Ana write in her sheet?" has four answers.**
- Server, window command: yes (`granted_write` campaign.rs:752, rpc.rs:906-911).
- Server, room: yes (rpc_collab.rs:64-72).
- Server, device sync: **no** unless the grant is to the group (`group_put`
  campaign.rs:783, sync.rs:619-626).
- Window editor: yes (note.ts:991 `canWrite() || mayEditGranted`).
- Window drag and drop, paste, image menu: **no** — `canChange()` (folder-level)
  in layout/drag.ts:316, files.ts:52 (`readable`) used by note/editing.ts:286,
  :352. **This is the "Você só lê esta pasta" on a granted note**: the string is
  `st.readOnly` (screen/strings.ts:127), shown by `readerAttempt`, which
  drag.ts:317 and files.ts:54 call without asking about the note.

**C2 — "Is Bia a game master?"** Owner and editors for the veil (sees all
hidden notes), owner only for running the table, for secret rolls, for deleting
rolls; owner or editor for images; the status says `"none"` to an editor
(campaign_cmds.rs:725), so an editor has no table chip, badge or popover
(campaign.ts:128 `tableMark`).

**C3 — "Can a player edit this board?"** Release: yes, same rows as notes. Edit:
refused by the menu (campaign.ts:257), by the server command
(campaign_cmds.rs:489), by the write path (`is_note` readers.rs:130 in
`granted_write`), by the board room (collab.rs:444), and the board leaf ignores
grants (board.ts:671). The only way left — making the player an **editor** of
the folder or of a share — silently makes them a co-game-master (C2) who sees
every hidden note and every secret block, drops them out of `players_of` and
drops their images permission. The share dialog says nothing about tables
(shareStrings.ts has no table word).

**C4 — "Who may edit this note?" is single-valued, "who sees it" is a set.**
`grant_kind/grant_account` holds one player or the whole group
(db/campaign.rs:40-41). Choosing Bruno in "Editável por" replaces Ana. The same
list of players is a multi-select in "Liberar para…" (campaign.ts:210-221) and a
single-select in "Editável por" (campaign.ts:260-267).

**C5 — The two lists mutate each other.** Granting edit adds to the audience
(campaign_cmds.rs:520-524 for the group; server and harness for one player);
narrowing the audience drops grants (db/campaign.rs:512-523). The menu shows
neither consequence before it happens.

**C6 — "Is this a player?" is decided by the credential, not the person.**
`campaign::player` (campaign.rs:666-677) and `guard` (:703-727) use
`role.writes() && token_write`. So the owner's own phone paired as reader, or the
owner's read-only PAT, is a *player of its own table*: sees only whole-table
notes and is shut out of a closed table.

**C7 — A synced desktop reader can type but cannot drop.** note.ts:991 and
board.ts:671 use `canWrite()` (true on the desktop), drag, paste and menus use
`canChange()` (false when `readsSynced`). The note is editable; the edit stays
local as a "change here" (dialogs/sync.ts:61); a roll dropped on the same note is
refused.

**C8 — "Owner" in the window is inferred from an error.** `mayShare()` is true
when `share_list` answers ok (shares.ts:38-40); the campaign status has its own
`viewer` (campaign.ts:31); capabilities have `write`. Three sources for "who am I
here".

**C9 — Phone narrowing is written four times**: access.rs:38-42, auth.rs:89-91,
table.rs:632, and `Client.token_write` (0110 "A phone paired as a reader is a
reader to the server").

**C10 — The harness is a fourth implementation** (harness/campaign.ts,
harness/table.ts). Every rule change has to be made in Rust, in the window, and
in the harness.

## 3. Every surface where access is shown or changed

| Surface | File | Shows | Changes | Shot |
|---|---|---|---|---|
| Tree right-click on a note: "Liberar para…" (submenu, multi, ✓ at the left, stays open) | campaign.ts:256, menu.ts:155 | audience | audience | `105-depois-menu-liberar-para-claro.png` |
| Same menu: "Editável por: X" (submenu, single, "✓ " inside the label, closes) | campaign.ts:260-267 | grant | grant (`.md` only) | `05-mestre-mac-editavel-por.png` |
| Same menu: "Nome secreto" (toggle with "✓ " in the label) | campaign.ts:258 | secret name | secret name | `05-…` |
| Tree right-click on a board | campaign.ts:256 | — | audience only | — |
| Tree right-click on a folder inside a table: "Liberar tudo daqui" / "Ocultar tudo daqui" | campaign.ts:246-250 | — | audience of everything below | — |
| Tree right-click on a selection: "Liberar" / "Ocultar" | campaign.ts:273-279 | — | audience | — |
| Tree right-click on a folder: "Compartilhar…" (role lê/edita per person) | menu.ts:148, shares.ts:134 | share roles | share roles (makes a co-GM, C3) | — |
| Tree lock mark on hidden notes (owner) | campaign.ts:120-127 | hidden | — | `03-mestre-mac-mesa-criada-notas-ocultas.png` |
| Note title row: users icon "2/3", popover "Quem vê esta nota" with sees/edits/does not see, button "Alterar quem vê…" | noteAccess.ts (fill :213-262) | audience + grant | **audience only** (:249-253 opens the same submenu) | `93-…popover…png`, `96-…jogador-popover…png`, `102/104-…telefone-folha…png` |
| Table window, Players card: Sees n / Edits n (read-only lists) / Images switch | campaignPlayers.ts:68-317 | counts | images only | `114-…`, `115-…`, `130-depois-jogadores-desktop-claro.png`, `126-…telefone…` |
| Table window: Table open switch, Invite, Notes (release all / hide all), Advanced | campaignDialog.ts | table state | open/closed, bulk release | `74-…`, `75-…` |
| Folder page Table card | tableCard.ts, campaignParts.ts | same parts | same | `80-…`, `82-pagina-da-pasta-jogador-claro.png` |
| Folder name chip "Mesa: X" / badge in tree; player popover "lê os liberados, edita os seus" | tableChip.ts:65-80 | player's grants | — | `63/64-chip-…`, `73-selo-mesa-jogador-popover.png` |
| Folder lock beside the folder name | screen/frame.ts:136-156 | "você só lê" | — | `60-cadeado-leitor-desktop.png`, `111-…` |
| Reader notice near the attempt | readerNotice.ts | "Você só lê esta pasta" | — | `62-aviso-ao-editar-desktop.png` |
| Settings › Account › Folders; console | (server pages) | members | members/roles | — |
| Settings › This app is a server › Paired phones "Pode editar" | dialogs/localServer* | phone role | phone role | — |
| Settings › tokens | — | PAT read/write | PAT | — |

So a game master who wants "Ana edits her sheet, Bruno sees it" visits two
submenus of the right-click; to *see* the result goes to the note's top-right
popover, whose button changes only the first half; to give a board goes nowhere;
to give images goes to a third window.

## 4. Bugs, with repro, root cause, level and resolution

Levels as [ADR 0033](../adr/0033-pr-workflow.md). None loses data; the
resolution of each is a step of [ADR 0113](../adr/0113-one-access-model-for-a-table.md)
section J, not built yet.

| # | Who / where | Action | Wrong result | Root cause | Level | Resolved by |
|---|---|---|---|---|---|---|
| B1 | Ana, player, browser; "Ficha da Ana" granted to Ana | drag a roll line from the Table log onto her sheet | "Você só lê esta pasta"; nothing inserted | layout/drag.ts:316-319 `if (!canChange()) { readerAttempt(); return; }` runs before every target; `dropRoll` (rollblock/insert.ts:90) already checks `leaf.readOnly`, the right per-note answer | IMPORTANT | S5 |
| B2 | same | drag the crypt map thumbnail from the Table log onto her sheet | "Você só lê esta pasta" | the thumbnail is a native draggable `<img>` (table/view.ts:501; only rolls are `armDrag` sources, :489-492) → editor drop note/editing.ts:115 → `attachImage` → `readable()` :352 → files.ts:52 `canChange()`. Past the window, the server would refuse `create_file` too (only `write_note`/`write_text` are grant writes, campaign.rs:763), and it would copy an image the folder already has instead of linking it | IMPORTANT | S5 (0113 item 5, D) |
| B3 | same | paste a screenshot into her sheet, or "Inserir imagem › Da pasta" | refused | note/editing.ts:114 (paste → same path as B2); :286 `readable()` before `this.readOnly` — "Da pasta" only writes an embed, a text edit | IMPORTANT | S5 (0113 item 5, D) |
| B4 | GM | wants Ana to edit "Board do grupo" | right-click on the board offers only "Liberar para…" | campaign.ts:257; server campaign_cmds.rs:489; readers.rs:130 in campaign.rs:772; collab.rs:444; board.ts:671 | IMPORTANT | S6, S7 (0113 item 4) |
| B5 | GM | "Editável por: Ana", then "Editável por: Bruno" to add Bruno | Ana loses edit, silently | single-valued grant, db/campaign.rs:40-41 | IMPORTANT | S2, S6 |
| B6 | GM | to work around B4, Compartilhar… → Ana "edita" | Ana sees every hidden note and secret block, leaves the players list, loses images, gets no table chip | C2/C3: players_of excludes editors campaign_cmds.rs:536; veil only for readers campaign.rs:675; status `"none"` campaign_cmds.rs:725; no warning in the share dialog | IMPORTANT | S3 (0113 item 3) |
| B7 | Bia, editor of a table folder | open the Table | sees the folder whole but not secret rolls, cannot delete a roll, has no table controls | table.rs:165, :899-903; campaign_cmds.rs:74 | IMPORTANT | S3 (0113 item 3: she is a player) |
| B8 | any reader | drag a tree row onto a pane to open it | "Você só lê esta pasta" | drag.ts:316 before the open branch (`"body" in target`, drag.ts:360) | MINOR | S5 |
| B9 | Ana, desktop with the folder synced, not live | edit her own sheet (grant to her alone) | the edit stays local; `sync_put` refused | sync.rs:622-626 accepts only `group_put` (campaign.rs:783). The window allows typing (note.ts:991). *To confirm in the app* | IMPORTANT | S8 |
| B10 | reader of a synced folder, desktop | type in a note, then drop a roll on it | typing is allowed (stays local), the drop is refused | C7: note.ts:991 / board.ts:671 `canWrite()` vs drag.ts:316 `canChange()` | IMPORTANT | S5 |
| B11 | Ana | change a property of her sheet from a base view | refused | bases.ts:60-61, :67 `canWrite()` | IMPORTANT | S5 |
| B12 | GM | pair his phone as reader, open his table | sees only whole-table notes; a closed table shuts him out | C6: campaign.rs:666-677, :703-727 | IMPORTANT | S3 (0113 item 6) |
| B13 | GM | look at a released board | no "who sees" indicator; only notes have one | noteAccess.ts:167 `.md` only | MINOR | S6 |
| B14 | GM | "Ninguém (oculta)" on a note granted to Ana | Ana's edit grant goes too, unsaid | db/campaign.rs:512-523 | IMPORTANT | S2, S6 (one list per path) |

## 5. Resolution

The audit's proposal (one model, `may(who, action, target)`; one "Access…"
dialog; seat, per-file access and per-player rights kept apart) went to the
maintainer with five questions the same day. His answers — access for any file
and folder, the folder overriding what is inside; *"Aplica e depois permite
exceção"*; *"Jogador que edita tudo"* (no co-master seat, the proposal's
recommendation not taken); *"Sala por elemento"*; *"Sim, chat e notas"* — and
the two recommendations taken with his general approval are
[ADR 0113](../adr/0113-one-access-model-for-a-table.md), Accepted 2026-10-24,
not built yet. The points those answers left open were answered the same day;
they are that ADR's section K.
