# ADR 0110 — A table is a campaign folder: invited players, notes released bit by bit, a table dashboard

- Date: 2026-10-22
- Source: the maintainer, 2026-10-22, while the table of
  [0107](0107-the-table-a-shared-roll-and-chat-log.md) was being built. Asked
  whether rolls should belong to notes rather than to the shared root, he
  answered: *"imagino que uma mesa, uma campanha e uma pasta seria o mesmo
  contexto. Então o dono poderia habilitar uma pasta como mesa, gera links e
  acesso para a galera que entra apenas no contexto da pasta ativa. O mestre
  pode ir adicionando e liberando mais informações à medida que fizer
  sentido. Só não sei como faríamos com links entre docs ainda sem acesso
  pelos jogadores"* (a table, a campaign and a folder are one context; the
  owner turns a folder into a table, makes links and access for the people,
  who enter only that folder; the game master adds and releases information
  as it makes sense; links to documents players can't see yet are an open
  question). Then: *"Deveria ser possível compartilhar como edição algumas
  notas, tipo nota do grupo, nota da ficha, já outras seriam apenas leitura.
  O legal é que os usuários podem ir montando um board de relacionamento,
  arrastando as notas (handouts, pistas) que eles têm acesso e criando laços.
  A pasta que for transformada em mesa deveria ter opções extras que
  facilitem jogar e configurar: o mestre, ao clicar na pasta, o Verso abre
  como pasta normal, aí ele habilita como mesa e ela vira modo dashboard de
  mesa. Aí deveria ser possível deixar ativo ou não para login, e o mestre
  pode ter várias pastas de mesa"* (some notes shared for editing — the
  group's note, a character's sheet — others read only; players build a
  relationship board by dragging the notes they can see; a table folder gets
  a dashboard; the table can be open or closed to sign-in; a game master may
  have several table folders). The author's additions (items 9–14) were
  offered in the same conversation and the maintainer answered *"gostei das
  adições"*. Written by Opus 5.5; to be read by the other model before it is
  accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0107](0107-the-table-a-shared-roll-and-chat-log.md) (the table:
  rolls, messages, images, pins, secret rolls, roster — scoped to a folder),
  [0081](0081-sharing-between-people-on-one-universo.md) (shares of a folder
  inside a vault; roles owner, editor, reader; invitations),
  [0087](0087-secret-blocks-hidden-from-readers.md) (the server serves a
  reader a note without its secret blocks),
  [0105](0105-read-links-without-an-account.md) (a link out of what the
  reader may see is drawn as text), [0090](0090-maps-on-the-board.md)
  (secret pins), [0084](0084-notifications-in-the-window.md),
  [0098](0098-world-and-campaign-wizard-template-bundles.md) (campaign
  bundles), [0099](0099-visual-markdown-statblocks-and-cards.md)
  (statblocks — character sheets), [0057](0057-board-json-canvas.md) (the
  board), [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md).

## Context

[0107](0107-the-table-a-shared-roll-and-chat-log.md) gives a UniVerso folder
a table: everyone with the folder open shares one log of rolls and
messages. Running a campaign needs more than the log: inviting the players
to that folder only, keeping most of the campaign hidden and revealing it as
play goes on, letting players write some notes (their sheet, the group's
note) but only read the rest, and a place for the game master to run it
all. Today a share ([0081](0081-sharing-between-people-on-one-universo.md))
gives one role for a whole folder, and secret blocks
([0087](0087-secret-blocks-hidden-from-readers.md)) hide parts of a note,
not whole notes.

## Decision

Status **Proposed**. `[DECIDED]` items are the maintainer's words above;
`[OPEN]` items are his to answer; `[PROPOSED]` items are the author's.

1. **A table is a campaign folder.** `[DECIDED 2026-10-22]` One context:
   table, campaign and folder are the same thing. The owner of a UniVerso
   folder opens it as any folder and turns it into a table ("Tornar esta
   pasta uma mesa" / "Make this folder a table"); it can be turned back.
   A game master may have several table folders. The table of 0107 is this
   folder's table.

2. **Players enter by invitation, into that folder only.** `[DECIDED]`
   Turning a folder into a table offers an invitation link
   ([0081](0081-sharing-between-people-on-one-universo.md) invitations); a
   player who accepts sees that folder only — nothing above or beside it
   (0081's share re-rooting). `[PROPOSED]` Players join as readers by
   default; per-note editing is item 5.

3. **Open or closed.** `[DECIDED]` The game master sets the table open or
   closed to sign-in. What closed means `[DECIDED 2026-10-22]`: option A
   (MC.1, the maintainer: *"sim"*):
   - **A — Closed: players cannot open the folder at all** (their link
     answers "a mesa está fechada"); the game master works alone.
     _(recommended)_
   - **B — Closed: players can read what is released, but the table (rolls,
     messages) and every editable note are frozen.**

4. **Notes released bit by bit.** `[DECIDED]` (*"o mestre pode ir adicionando
   e liberando mais informações"*). `[PROPOSED]` Each note in a table
   folder is either **hidden from the table** or **released**. A hidden
   note does not exist for a player: not in the file list, search, graph,
   backlinks, quick open, tags, boards, embeds, or the table's links — the
   server never serves it to them, as 0087 already does for secret blocks.
   The game master releases a note with one action ("Liberar para a mesa"),
   or several at once, and can hide it again. Secret blocks still hide parts
   of a released note. Where the state is kept: `[PROPOSED]` in the server's
   database, beside the share's grants (like 0081's grants) — never in the
   note's file, so a synced copy or Obsidian sees an ordinary note.
   The default for a note in a table folder `[DECIDED 2026-10-22]`: option A,
   hidden (MC.2, the maintainer: *"oculta"*):
   - **A — Hidden until released** (new notes and the notes already there
     when the folder becomes a table); a "Liberar tudo" exists.
     _(recommended)_ — nothing leaks by forgetting.
   - **B — Released unless hidden.**

5. **Some notes editable by players.** `[DECIDED]` (*"nota do grupo, nota
   da ficha"*). `[PROPOSED]` Per-note write grants, kept on the server like
   item 4: **the group** (every player at the table edits — the group's
   note, the group's board) or **one player** (a character sheet assigned to
   that player: only they and the game master edit it). Everything else is
   read only for players. The server checks the grant on every write, as it
   checks a share's role today ([0026](0026-core-ui-contract-inviolable-rules.md)
   rule 4). A character sheet is any note; a statblock note
   ([0099](0099-visual-markdown-statblocks-and-cards.md)) gets an "Atribuir
   a um jogador" action.

6. **Players' boards.** `[DECIDED]` (*"montando um board de relacionamento,
   arrastando as notas que eles têm acesso e criando laços"*). `[PROPOSED]`
   A players' area in the table folder (a subfolder "Jogadores" /
   "Players", writable by the group) holds boards and notes the players
   make; on a board they drag the notes they can see as cards and draw
   their links. A hidden note cannot be dragged, searched or embedded; once
   released it becomes available. `[DECIDED 2026-10-22]` option A (MC.3,
   *"concordo"*):
   - **A — Both: a shared "Board do grupo" and each player may make their
     own** _(recommended)_
   - **B — Only the shared one.**

7. **Links to notes the player cannot see yet.** `[DECIDED 2026-10-22]`
   option B with the redaction as proposed (MC.4, *"concordo"*); the
   maintainer's question (*"só não sei como faríamos com links entre docs ainda sem
   acesso"*). The server rewrites such a link for a player (as 0105 does for
   a link out of a read link); options:
   - **A — Plain text, no link** (0105's rule today).
   - **B — The text with a small lock, not clickable** ("ainda não
     revelado") — the player knows something is there. _(recommended as the
     default)_
   - **C — Redacted ("▒▒▒▒")** — for when the name itself is a spoiler.
   `[PROPOSED]` B by default; the game master gets C for a given link by
   writing it with alias text (`[[A traição do barão|um rumor]]` shows "um
   rumor 🔒") or by marking a hidden note "nome secreto" so every link to it
   is redacted. When a note is released, links to it work for everyone.

8. **The table dashboard.** `[DECIDED]` (*"ela vira modo dashboard de
   mesa"*). `[PROPOSED]` Opening a table folder shows a dashboard — its home
   page: the table (0107) log and input, who is present, open/closed, the
   next session, the released notes (newest first), each player's sheet, the
   group's note and board, quick dice/oracle; and, for the game master only,
   the hidden notes with "Liberar", the invitation link, per-note grants and
   the players list. Players see the player half.

9. **"Show to the table".** `[DECIDED]` (author's addition, accepted)
   `[PROPOSED]` The game master pushes a released note, image or map to
   every player's screen at once (a card over the window, dismissible), as
   Foundry's "show players". Pushing a hidden note releases it first, after
   asking.

10. **Sessions.** `[DECIDED]` (addition, accepted) `[PROPOSED]` "Abrir
    sessão" / "Encerrar sessão": opening creates the session note
    (`Sessões/Sessão N — <data>.md`, from the campaign bundle's template if
    one exists — [0098](0098-world-and-campaign-wizard-template-bundles.md))
    and marks the table log from that moment; closing offers to add the
    session's rolls and messages to the session note as a recap the game
    master edits before writing.

11. **"New" notices.** `[DECIDED]` (addition, accepted) `[PROPOSED]` When a
    note is released, players at the table get a notice ("Novo: Diário do
    farol foi revelado") through [0084](0084-notifications-in-the-window.md),
    and a "Novidades" list on the dashboard.

12. **A player's private journal.** `[DECIDED]` (addition, accepted)
    `[PROPOSED]` Each player has a note only they and the game master see
    and edit (in the players' area), for notes and character secrets.

13. **"See as player".** `[DECIDED]` (addition, accepted) `[PROPOSED]` The
    game master previews the table exactly as one chosen player sees it
    (extends today's "Ver como leitor").

14. **Maps with secret pins.** `[DECIDED]` (addition, accepted)
    `[PROPOSED]` On a table, [0090](0090-maps-on-the-board.md)'s secret pins
    are revealed one by one like notes.

15. **Who is the game master.** `[PROPOSED]` The folder's owner(s): two game
    masters are two owners. No new role now; a "mestre" role comes when a
    case needs one that an owner cannot be.

16. **Later, not now.** `[PROPOSED]` Initiative tracker, fog of war on maps,
    a game master's private table — each in its own ADR when asked for.

17. **Phases.** `[PROPOSED]` Phase 1: make a table, invitation, release/hide
    notes (server-enforced everywhere), link rendering (item 7), per-note
    grants (item 5), open/closed. Phase 2: dashboard, show to the table,
    sessions, "new" notices, journals, see as player, players' boards area,
    map pins.

18. **Security** ([0083](0083-security-hardening-of-universo.md)).
    `[PROPOSED]` Hidden notes are filtered on the server for every read path
    a player has (list, read, search, graph, backlinks, tags, index, sync to
    a device, room join, file URLs, attachments of a hidden note, board
    cards' file references, the table's note links): a test per path, as
    0087 did for secret blocks; a per-note grant never widens beyond the
    folder's share.

19. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)).
    `[PROPOSED]` The lock and redaction have text alternatives ("link para
    uma nota ainda não revelada"); the dashboard is a page with headings and
    landmarks; pt-BR and English.

## Consequences

- `verso-server` gains, per table folder: the table flag and open/closed
  state, the released/hidden state per note, per-note write grants, sheet
  assignments, and the filtering of every read path for players; the
  contract gains the commands and events for them (types generated, rule 3).
- The window gains "make this folder a table", the dashboard, release/hide
  and grant controls, the link rendering for players, show-to-table,
  sessions, notices and journals.
- [0107](0107-the-table-a-shared-roll-and-chat-log.md) item 2 (the table is
  the folder) holds; this ADR says which folder and who enters.
- The demo vault gains a note on running a table; "Tour do Verso" a card.

## Discarded alternatives

Offered to the maintainer on 2026-10-22: a table per note, or several
tables inside one folder by subfolder — he chose one context (*"uma mesa,
uma campanha e uma pasta seria o mesmo contexto"*).

## Status

Proposed (2026-10-22). The maintainer's words above decide the direction
and items 1–6, 8–14 in substance; open: what "closed" means (item 3), the
default visibility (item 4), the players' boards (item 6), the link rendering
(item 7). Not built. Waits for those answers and a reading by the other
model.

Answered 2026-10-22 (`~/Projects/person/apps/verso-decisoes-0110-mesa-campanha-2026-10-22.md`):
MC.1 = A, MC.2 = A (hidden until released), MC.3 = A, MC.4 = B. On the table
log's ceiling of [0107](0107-the-table-a-shared-roll-and-chat-log.md) (MS.1):
*"pode ser, mas talvez faça sentido ser configurável e limite por mesa"* — the
ceiling (20,000 entries) and the image size limit become settings of each
table, set by its game master, the built values as defaults.

*Phase 1 built (2026-10-22), branch `feat/campaign-table`; see "As built" below. The ADR stays Proposed: the other model has not read it, and the questions listed under "Chosen in the code" are the maintainer's.*

## As built (phase 1, 2026-10-22)

Branch `feat/campaign-table`. Phase 1 of item 17 is built: make a table,
invitation, release and hide, the veil on every read path, the links drawn as
text, per-note grants, open and closed, the table's limits. Phase 2 (the
dashboard, show to the table, sessions, notices, journals, "see as player",
the players' boards area, map pins) is not. Where the code had to choose, the
choice is listed last, for the maintainer to confirm or change.

- **Where.** `crates/verso-server/src/campaign.rs` (the tables' state, the
  veil, who is a player), `campaign_serve.rs` (what a player is served),
  `campaign_text.rs` (the links drawn as text; pure, no IO),
  `campaign_cmds.rs` (the game master's commands), `campaign_sync.rs` (sync to
  a player's device follows the releases), `db/campaign.rs` (schema 15),
  `rpc_collab.rs` (the rooms' commands, moved out of `rpc.rs`, which was at
  1499 lines). The contract: `crates/verso-contract/src/campaign.rs`. The
  window: `app/ui/src/campaign.ts`, `campaignDialog.ts`, `campaignStrings.ts`.
- **A table** is a row `(folder, root)` of the server's database: `root` is
  `""` for the whole server folder, or a folder inside it (then the players are
  the people of a share at that folder, made by the invitation). Open or
  closed, the log's ceiling and the image limit are on the row. Nothing is
  written in any note's file; making a table and undoing it are reversible.
  A note with no row is **hidden** (MC.2 = A), the ones there when the folder
  becomes a table and the ones made later; "Release all" writes a row per note.
  The rows follow a rename or a move made through the server and go with a
  deletion.
- **Commands** (the window reaches the table only through them; the owner's
  window on the folder itself, never through a share, never from a phone):
  `campaign_status`, `campaign_make(root)`, `campaign_unmake(root)`,
  `campaign_settings(root, open, logMax, imageMax)`,
  `campaign_release(paths, released)` (a folder stands for the notes under
  it), `campaign_release_all(root)`, `campaign_secret_name(path, on)`,
  `campaign_grant(path, grant)`, `campaign_invite(root)`. Each answers the new
  status; the event `campaign-changed` tells every window on the folder, and a
  player's window is told as a folder is (`folder-changed`, with the notes it
  now has or has lost). Types generated (`CampaignStatus`, `CampaignTable`,
  `CampaignNote`, `CampaignGrant`, `CampaignInvite`, `CampaignPlayer`,
  `CampaignChanged`); the harness answers all of them
  (`app/ui/src/harness/campaign.ts`); the phones' allowlist reads
  `campaign_status` and refuses the rest.
- **Who is a player.** A window that may only read a folder with a table in it
  (a reader; a token that only reads). The owner and the editors — the
  co-game-masters — are served the folder whole; the veil is for readers, as
  ADR 0087's projection is. An invitation makes a reader. The status a player
  gets names the tables it can open and the notes it may edit, and nothing
  else.
- **The veil.** A path inside a table is hidden to a player unless it is a
  released note, board or base (a grant releases), an attachment a released
  note or board links or embeds (decided in the code, item 4: otherwise a
  released note would show a broken picture), or an image the table shows. A
  closed table hides everything. A folder shows only with something visible
  under it (the table's own always). A path is judged by its name with case
  folded and `.`/`..` resolved, and by the name confinement reads.
- **The read paths** covered, a test each in `tests_campaign.rs` (the first
  also sweeps every command of the generated bindings, as
  `tests_secret.rs` does for ADR 0087, so a new read command fails there until
  it says how it answers a player): list notes, files, folders and entries;
  read a note, a text, a file as text (a hidden one answers as one that never
  was, tried against a missing name); search (the excerpt is cut again from the
  veiled text, and a hit whose words were inside a link now drawn as text is
  dropped); graph, backlinks, links, tags, block ids, unlinked mentions, bases'
  rows, quick open (list and search); the folder's summary and its size;
  `resolve_attachment` and the maps' files; boards (a card of a hidden note is a
  locked text card; the text cards as notes); the room (a hidden note's room is
  refused; a released note's is the player's own document, over the veiled
  text; a release or a hide closes the players' documents so they join again);
  sync to a device (a hidden file is out of the reader's manifest and log, a
  release is a change the device fetches, a hide is a deletion it is told, a
  hidden file is refused by `sync_read`); the files under `/f/`; the folder's
  events; the table's entries (the note a roll was made in is not told when
  hidden).
- **Links to hidden notes** (item 7, MC.4 = B): in the text served to a player,
  a wikilink or a Markdown link to a hidden note becomes plain text and a lock:
  the alias when there is one, else the name as written (its last part), then
  " 🔒"; a note marked "secret name" is drawn ▒▒▒▒ whatever was written; an
  embed or an image of a hidden file becomes "🔒 (ainda não revelado)" / "🔒
  (not revealed yet)" in the game master's language. A path, a heading and a
  `^id` are never sent, in the body, the frontmatter or code. The served HTML,
  headings, properties and type are derived again from that text.
- **Grants** (item 5): `none`, `group` or one player (an account of the table;
  boards cannot be granted in phase 1). A grant releases the note. Enforced on
  `write_note` and `write_text`, the rooms' typing, and a device's `sync_put`
  (only for a note granted to the group); every other write — create, rename,
  move, delete, attachments, boards, `sync_delete`/`sync_rename` — stays the
  game master's. The one who may edit a note reads it whole, as a writer reads
  (ADR 0087 item 5).
- **Open and closed** (MC.1 = A): closed, a player's attempt to open the
  folder, or the share, answers "a mesa está fechada" (the files route too),
  windows already inside are sent out, and a command from one is refused. The
  owner and the editors always enter.
- **Limits** (answer to MS.1): per table, within 1,000 to 200,000 entries
  (default 20,000) and 1 to 30 MB (default 10), enforced by the server
  (`db/table.rs` trims at the table's ceiling; `table_image.rs` judges the
  image). The folder's shortest-rooted table gives the folder's log its
  numbers.
- **Invitation**: `campaign_invite` makes a single-use reader invitation, seven
  days, for the folder or for the share at the table's folder (made then); only
  the server's admin, with a fresh proof (`prove_first`), as the console's
  invitation to a folder is (ADR 0081 item 4, ADR 0083 item 6). The window shows
  the link to copy.
- **Tutorial**: note 32 of the demo vault, "Rodando uma Mesa" / "Running a
  Table", a card on the tour, a line in the welcome note's map.
- **Chosen in the code, for the maintainer to confirm or change.** (1) A link
  with no alias shows the **name as the game master wrote it**, with the lock
  ("Barão 🔒"); item 7 says "the text with a lock", and a path is never sent,
  but the name is. If the name should never cross, the answer is C for every
  link: say so. (2) Editors are game masters, not players: a table is for
  readers; an editor sees the folder whole. (3) The grantee of a note, and every
  player for a note granted to the group, reads it **whole** — its secret
  blocks and its links as written — since an edit of a projection would write
  the locks into the note; the dialog says so. (4) A note granted to one
  player is projected on the other players' devices and edited in the window
  or the room, not synced up from the grantee's device. (5) An attachment is
  open when a released note or board links it, or the table shows it as an
  image. (6) The image limit stops at 30 MB, not 50: the connection's message
  cap is 48 MiB and base64 is a third larger. (7) When a folder becomes a table,
  a reader's device that already synced a note keeps its copy; the log says
  nothing of a note it never told (a deletion would name it). (8) A table inside
  a share has no table channel for the share's windows (0107 as built); the
  rolls of a subfolder table are the owner's window's. (9) The room and the
  device files are served in the game master's language for the placeholders.

Tried: `tests_campaign.rs` (20 tests, with the generated-notes property that no
path, heading or id reaches a player), `campaign_text.rs`'s unit tests (the
same property over 500 generated notes), the window's `test/campaign.test.mjs`
and `e2e/campaign.spec.mjs` in Chromium and WebKit (Docker).

## As built (a synced folder, 2026-10-23)

Branch `feat/table-in-synced-folder`. The campaign's controls ran only "from a
window on the folder itself" (the phase 1 section above), and a folder of this
computer that syncs with a UniVerso is such a window's own folder: the game
master on the desktop with a synced folder. The nine commands
(`campaign_status`, `campaign_make`, `campaign_unmake`, `campaign_settings`,
`campaign_release`, `campaign_release_all`, `campaign_secret_name`,
`campaign_grant`, `campaign_invite`) are now answered in that window by the
sync's connection (`app/src-tauri/src/sync/live.rs`, the same plumbing as the
table's, [0107](0107-the-table-a-shared-roll-and-chat-log.md) "As built (a
synced folder)"), and the event `campaign-changed` the server tells that
connection reaches the windows that asked the status.

- **What the server does.** Nothing new: the device session's connection is
  the folder's owner's, runs the same checks (`game_master`: the owner, on the
  folder itself, never through a share, never a phone, a credential that
  writes), and acts on the server folder the sync opened, with paths relative
  to it and the same confinement (`root_arg`: no `..`, no absolute path, nothing
  hidden). `tests_live_table.rs` tries a reader synced to the folder refused
  at every control, the owner making, releasing, granting, closing and undoing
  a table, and paths that leave the folder refused.
- **The invitation** asks the proof first as on the server's own folder
  (ADR 0083 item 6): the device's session is proved by `server_prove`, which
  stamps that session; tried with the device token.
- **Offline.** The window's controls exist while the server is reached: with
  the link down or the sync paused the status is "none" (not an error), the
  rows of the game master's menu are not offered, and the window asks the shares
  and the status again when the state changes back.
- **Chosen in the code, for the maintainer to confirm.** (1) The rows are the
  owner's of a synced folder, as `share_list` says (the shares are asked of the
  server with the device's token, as before). (2) A folder synced from a share
  has no tables to make, as a window on a share has none.

