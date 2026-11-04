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
- Superseded in part by [0113](0113-one-access-model-for-a-table.md) (2026-10-24): items 4, 5 and 12 as amended
  (a note's audience, per-note edit grants, the journal), "Chosen in the code"
  (2) (editors are game masters), and the as-built sections on grants, the
  audience and who may send images. Kept here as history.
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

Status **Accepted (2026-10-28)** for phase 1 (as built); phase 2 is scheduled
for V1, not built. *(History, until 2026-10-28: Proposed.)* `[DECIDED]` items are the maintainer's words above;
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
   (0081's share re-rooting). 2026-10-23: a player who already has an
   account on the server (of another table) accepts the link with that
   account, signed in or signing in on the invitation's page
   ([0074](0074-accounts-and-access-on-the-server.md) item 4); no second
   account. `[DECIDED 2026-10-28 — accepted as built]` Players join as readers by
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

   **Amended 2026-10-23 — released to whom (the maintainer's decision).** A
   released note is released *to someone*: to the whole table, or to one or
   more chosen players; hidden stays "to nobody". The maintainer, on the
   proposal of "Liberar para…": *"gosto da sua sugestão, e tem que ficar
   visivel em algum lugar quem tem acesso, as vezes um icone de usuários que
   no hover, mostra quem tem acesso e quem não, isso dentro da nota, so tem
   que ficar esperto, usando skills de ux para posicionar sem quebrar nada na
   responsividade."* So a note's **audience** is hidden, the whole table, or
   a set of the table's players; the server keeps it beside the rest of the
   note's state and asks it of each player every time it asked "hidden"
   before (see "As built (a note's audience, 2026-10-23)"). A note nobody
   but its game master and the chosen players see does not exist for the
   others, by the rule above. An edit grant to one player (item 5) implies
   that player is in the audience. Who has access is shown inside the note.

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
   arrastando as notas que eles têm acesso e criando laços"*). `[DECIDED 2026-10-28 — accepted as built]`
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
   `[DECIDED 2026-10-28 — accepted as built]` B by default; the game master gets C for a given link by
   writing it with alias text (`[[A traição do barão|um rumor]]` shows "um
   rumor 🔒") or by marking a hidden note "nome secreto" so every link to it
   is redacted. When a note is released, links to it work for everyone.

8. **The table dashboard.** `[DECIDED]` (*"ela vira modo dashboard de
   mesa"*). `[DECIDED 2026-10-28]` In V1 scope (phase 2, not built); the design below stays `[PROPOSED]`. Opening a table folder shows a dashboard — its home
   page: the table (0107) log and input, who is present, open/closed, the
   next session, the released notes (newest first), each player's sheet, the
   group's note and board, quick dice/oracle; and, for the game master only,
   the hidden notes with "Liberar", the invitation link, per-note grants and
   the players list. Players see the player half.

9. **"Show to the table".** `[DECIDED]` (author's addition, accepted)
   `[DECIDED 2026-10-28]` In V1 scope (phase 2, not built); the design below stays `[PROPOSED]`. The game master pushes a released note, image or map to
   every player's screen at once (a card over the window, dismissible), as
   Foundry's "show players". Pushing a hidden note releases it first, after
   asking.

10. **Sessions.** `[DECIDED]` (addition, accepted) `[DECIDED 2026-10-28]` In V1 scope (phase 2, not built); the design below stays `[PROPOSED]`. "Abrir
    sessão" / "Encerrar sessão": opening creates the session note
    (`Sessões/Sessão N — <data>.md`, from the campaign bundle's template if
    one exists — [0098](0098-world-and-campaign-wizard-template-bundles.md))
    and marks the table log from that moment; closing offers to add the
    session's rolls and messages to the session note as a recap the game
    master edits before writing.

11. **"New" notices.** `[DECIDED]` (addition, accepted) `[DECIDED 2026-10-28]` In V1 scope (phase 2, not built); the design below stays `[PROPOSED]`. When a
    note is released, players at the table get a notice ("Novo: Diário do
    farol foi revelado") through [0084](0084-notifications-in-the-window.md),
    and a "Novidades" list on the dashboard.

12. **A player's private journal.** `[DECIDED]` (addition, accepted)
    `[PROPOSED]` Each player has a note only they and the game master see
    and edit (in the players' area), for notes and character secrets.

    **Amended 2026-10-23 (the maintainer's decision).** The journal is not a
    feature of its own: it is **a note released to one player** (item 4,
    amended) and granted to that player to edit (item 5). The same holds for
    a clue only one character got, and for each player's sheet released only
    to its owner. Nothing separate is built for it.

13. **"See as player".** `[DECIDED]` (addition, accepted) `[DECIDED 2026-10-28]` In V1 scope (phase 2, not built); the design below stays `[PROPOSED]`. The
    game master previews the table exactly as one chosen player sees it
    (extends today's "Ver como leitor").

14. **Maps with secret pins.** `[DECIDED]` (addition, accepted)
    `[DECIDED 2026-10-28]` In V1 scope (phase 2, not built); the design below stays `[PROPOSED]`. On a table, [0090](0090-maps-on-the-board.md)'s secret pins
    are revealed one by one like notes.

15. **Who is the game master.** `[DECIDED 2026-10-28 — accepted as built]` The folder's owner(s): two game
    masters are two owners. No new role now; a "mestre" role comes when a
    case needs one that an owner cannot be.

16. **Later, not now.** `[DECIDED 2026-10-28 — accepted as built]` Initiative tracker, fog of war on maps,
    a game master's private table — each in its own ADR when asked for.

17. **Phases.** `[DECIDED 2026-10-28 — accepted as built]` Phase 1: make a table, invitation, release/hide
    notes (server-enforced everywhere), link rendering (item 7), per-note
    grants (item 5), open/closed. Phase 2: dashboard, show to the table,
    sessions, "new" notices, journals, see as player, players' boards area,
    map pins.

    **Decided 2026-10-28.** The maintainer, asked what to do with the phase 2
    that is not built: *"Fase 2 entra na V1"*. Phase 1 is accepted as built;
    phase 2 (the dashboard, show to the table, sessions, "new" notices, see as
    player, the players' boards area, map pins — the journal is item 12's
    amendment, nothing separate) is in V1 scope and is a roadmap row
    ([V.43](../roadmap.md)). Which design details of phase 2 are accepted: none
    beyond being in V1; the phase 2 items above keep their `[PROPOSED]` text. Phase 1
    items (1, 6, 7, 15–19) were marked accepted as built the same day; items 4,
    5 and 12 stay as 0113 left them.

18. **Security** ([0083](0083-security-hardening-of-universo.md)).
    `[DECIDED 2026-10-28 — accepted as built]` Hidden notes are filtered on the server for every read path
    a player has (list, read, search, graph, backlinks, tags, index, sync to
    a device, room join, file URLs, attachments of a hidden note, board
    cards' file references, the table's note links): a test per path, as
    0087 did for secret blocks; a per-note grant never widens beyond the
    folder's share.

19. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)).
    `[DECIDED 2026-10-28 — accepted as built]` The lock and redaction have text alternatives ("link para
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

*Superseded in part (2026-10-24) by [0113](0113-one-access-model-for-a-table.md):* one access model for a table — a
seat, access per path (any file and folder), rights per player. Items 4, 5 and
12 as amended and the permission parts below are read through it.

**Accepted (2026-10-28) for phase 1** (as built; 0113 supersedes items 4, 5, 12
and "Chosen in the code" (2) as stated at the top and above). **Phase 2 is not
built and is scheduled for V1** (*"Fase 2 entra na V1"*, 2026-10-28; roadmap row
[V.43](../roadmap.md)); its design details stay `[PROPOSED]`. The root-only chip
the maintainer rejected stays rejected.

*History (2026-10-22):* Proposed. The maintainer's words above decide the direction
and items 1–6, 8–14 in substance; open then: what "closed" means (item 3), the
default visibility (item 4), the players' boards (item 6), the link rendering
(item 7); those were answered next. Not built then.

Answered 2026-10-22 (`~/Projects/person/apps/verso-archive/decisoes-2026-10/verso-decisoes-0110-mesa-campanha-2026-10-22.md`):
MC.1 = A, MC.2 = A (hidden until released), MC.3 = A, MC.4 = B. On the table
log's ceiling of [0107](0107-the-table-a-shared-roll-and-chat-log.md) (MS.1):
*"pode ser, mas talvez faça sentido ser configurável e limite por mesa"* — the
ceiling (20,000 entries) and the image size limit become settings of each
table, set by its game master, the built values as defaults.

*Phase 1 built (2026-10-22), branch `feat/campaign-table`; see "As built" below. The ADR stayed Proposed then; phase 1 was accepted as built on 2026-10-28 (see above).*

## As built (phase 1, 2026-10-22)

Branch `feat/campaign-table`. Phase 1 of item 17 is built: make a table,
invitation, release and hide, the veil on every read path, the links drawn as
text, per-note grants, open and closed, the table's limits. Phase 2 (the
dashboard, show to the table, sessions, notices, journals, "see as player",
the players' boards area, map pins) is not. Where the code had to choose, the
choice is listed last, for the maintainer to confirm or change
(accepted as built, 2026-10-28; see "Status").

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
  image). Per table since 2026-10-23: each table's own numbers rule its own
  log and its own images (see "As built (one chat per table, 2026-10-23)"
  below); before that, the folder's shortest-rooted table gave the folder's one
  log its numbers.
- **Invitation**: `campaign_invite` makes a single-use reader invitation, seven
  days, for the folder or for the share at the table's folder (made then); only
  the server's admin, with a fresh proof (`prove_first`), as the console's
  invitation to a folder is (ADR 0081 item 4, ADR 0083 item 6). The window shows
  the link to copy.
- **Tutorial**: note 32 of the demo vault, "Rodando uma Mesa" / "Running a
  Table", a card on the tour, a line in the welcome note's map.
- **Chosen in the code** *(accepted as built 2026-10-28, except (2), superseded by 0113)*. (1) A link
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
- **Chosen in the code** *(accepted as built 2026-10-28)*. (1) The rows are the
  owner's of a synced folder, as `share_list` says (the shares are asked of the
  server with the device's token, as before). (2) A folder synced from a share
  has no tables to make, as a window on a share has none.

**The step from folder to table, in the Mesa panel (2026-10-23).** The maintainer: *"deveria ser possível transformar a pasta a partir da pasta aberta dentro do próprio verso... um botãozinho ali que me deixa transformar a pasta em mesa, sem ter que clicar com o botão direito"*. The Mesa panel of the window shows a **Make this folder a table** button when the open folder is a server's folder (or synced with one), the person owns it and it is not yet a table (`mayShare()` and no table at the folder's root, the same condition as the tree background's menu row); it runs the same command as that row, `makeTable("")` (`campaign_make`), and opens the table's window. Once the folder is a table the button becomes **Open the Table window** (`openCampaignDialog("")`). Nobody else sees either, and a folder only on this computer says in one line why there is no table. A table made of a subfolder is still made from the tree's menu. The panel follows the table being made or undone through the `verso:campaign-status` event of `setStatus`.

**The invitation link opens where the window reaches the server (2026-10-23).** The maintainer, testing a folder synced with a server at `http://192.168.3.150:7340` with no `VERSO_PUBLIC_URL`: *Invite players › Generate link* gave `http://localhost:7340/invite/<token>`, which opens nothing. The server listens on every address and cannot know the name a window reaches it by, and it does not take that from the request's `Host` (ADR 0045). So `campaign_invite` answers the whole link only when `VERSO_PUBLIC_URL` is set, and otherwise **the path alone**, `/invite/<token>`; the window puts its server's address before it: the page's origin in a browser, and in the desktop app the address the window's connection was made to (the host command `window_server`, for a server's folder and for a folder of this computer synced with one), never the app's own origin. The same address gives a note's "Copy link" in the desktop. Links that leave by mail (password reset) still need the whole address: with no `VERSO_PUBLIC_URL` and a wildcard bind the server says so once in its log at start.

## As built (chrome feedback, 2026-10-23)

**The table's chip beside the folder's name.** The maintainer asked: *"Como eu
estou com a raiz de uma mesa aberta no verso, como que o dono da pasta vai
conseguir ver as configurações da pasta? E como que os jogadores veem do lado
deles?"* The owner reached the table's window only by a right click on the
tree's background or the small button of the Mesa panel. Chosen in the code,
first as root-only; **the maintainer rejected that: *"ERRADO, posso ter N mesas
numa mesma pasta"*.** An open folder holds any number of tables, each a folder
(one table per folder, ADR above). The rule now: **every folder that is a table**
(a subfolder; the open folder's root has the header chip) shows a small **Mesa**
badge on its row in the tree, a button named after that table's folder — for the
**owner** it opens *that* table's window; for a **player** it opens the
read-only popover of that table: two lines (they read the notes released, edit
the ones granted to them) and the notes granted *in that table* as links, no
settings. The **chip beside the folder's name** follows the context: the table
that holds the active note (the nearest table folder up its path, named after
that folder: *Mesa: Ruínas de Valdor*), the root's when the root is a table and
no deeper one holds the note or there is no active note, and with no active
note inside any table, while tables exist below, **Mesas (N)**, opening a list
(owner: each opens its window; player: each its popover). No chip when the
folder holds no table (`app/ui/src/tableChip.ts`; tried in
`e2e/table-chip.spec.mjs`). The Mesa panel (the shared log and chat,
`src/table/*`) was then one per open folder and did not follow the active
note's table; it does now (see "As built (one chat per table, 2026-10-23)"). Beside it, a
folder one only reads shows the closed lock of ADR 0076's amendment of the same
day.

## As built (one chat per table, 2026-10-23)

Branch `feat/table-per-table`. Item 1's "A game master may have several table
folders. The table of 0107 is this folder's table" was built as one log per
**open folder**: with the whole folder open and two tables in subfolders
("Cripta", "Sala"), both tables' entries landed in one log, and the log took its
numbers from the shortest-rooted table. The maintainer, 2026-10-23: *"o chat
deve ser 1 por mesa, adapte e refaça o que precisar"*. The decision, with the
rules in [0107](0107-the-table-a-shared-roll-and-chat-log.md) "Decision (one log
per table, 2026-10-23)":

- **A table's identity** is the pair (server folder, the table's root inside
  it): `root` is `""` for the folder itself, else the folder's path relative to
  it, as the row of `campaigns` keeps it. A server folder with no table keeps
  0107's original single, folder-wide table: its root table, `""`.
- **What is per table now**: the entries, the pins, who is at it (the roster),
  the ceiling of the log (`campaigns.log_max` of *that* table), the limit of an
  image (`image_max` of that table), the clear and the delete rules. A roll or an
  oracle draw made in a note's room goes to the table that holds the note (the
  deepest), and a note in no table goes to the folder's default, its
  shortest-rooted table.
- **What replaced "the folder's shortest-rooted table gives the folder's log
  its numbers"**: each table's own `log_max` and `image_max`; the
  shortest-rooted table is only the **default** for a call that names no table
  (an old peer's) and for a note in no table.
- **The migration** (schema 16, `db/table.rs`): `table_log` gets a `tbl`
  column; the entries kept before it are given to the folder's shortest-rooted
  table when it has tables (the one whose numbers they always took), else to
  the folder (`""`). Nothing is deleted. After it: a folder's first table takes
  the log the folder had; a table renamed or moved takes its log along
  (`campaign_move`); the last table of a folder unmade gives the logs back to the
  folder; a table unmade while others stay leaves its log waiting for it.
- **Players** (item 8 above lifted for a share rooted at a table). The
  coordinator, relaying the maintainer's goal: each table's players talk and
  roll in that table. A player invited to a subfolder table (`campaign_invite`
  at that table's folder makes a share at that folder, item 2) is a window on a
  share whose root is a table, and **that table's channel is its channel**: the
  server maps the share's root to (owner folder, table root), so the owner reads
  the same log from the whole folder. The player knows its table as the share's
  own root, `""` (the table in the commands, answers and events is `""` for it,
  and a note's path is written from the share's root, never the owner's
  parent path); naming any other table is refused, so a player of Cripta reaches
  nothing of Sala. Its rolls in a note of its share land in the table. A share whose root is **not**
  a table still has no table channel. A player who reads the whole folder may
  join any table of it (the closed-table rule applies as before).
- **Tried**: `tests_table.rs` (`per_table`: two tables' entries, rosters, pins
  and clears kept apart; a call with no table; a name that is no table, `..`,
  absolute; a note's roll; the ceilings and image limits; a share refused; a
  renamed table), `db/tests.rs` (the migration from schema 15, the log following
  the tables), `tests_live_table.rs` (the same over the sync's link),
  `test/tableWhich.test.mjs`, `test/tableServer.test.mjs` and
  `e2e/table-per-table.spec.mjs`.

- **The table's window and the folder's page (2026-10-23).** The maintainer, on a screenshot of the campaign window (a native checkbox, a loose "Saved.", "Undo table" as the purple primary button): *"essa tela ta feia demais, faz um toggle maneiro pra ativar, passa um UX aí cara pelo amor"*; and on the folder's page: *"nessa tela aqui, da pasta, deveriam ter informações da mesa, na página da pasta, deveria estar ali, ativar ou não a mesa, configurações e tal"*. Built: **Table open** is a switch (`role=switch`, a status pill *Open*/*Closed*, one line of what it means) that saves at once and answers beside itself; the window is cards (invitation with the link in a field, *Copy* and its expiry; players with what is granted to each, as links, and who is at the table now; notes with released/hidden counts and the two bulk actions; the limits folded under *Advanced*, a field saving when left or on Enter); **Undo table** is a red, quiet action at the bottom (a destructive action is red in every palette, `--danger`; it asks first and says the files never change), never the primary. On a phone the window is a sheet. The folder's page has a **Table** card under the title built of the same parts (`campaignParts.ts`): to the owner of a folder that is a table the switch, players (and who is online), *Invite*, the counts and *Table settings* (foldable, remembered per folder); to a player one read-only line; on a folder that can become a table (server or synced, the owner, not inside a table) one *Make this folder a table* call to action; nothing on a folder only on this computer. Any folder's page, so N tables per folder.
- **A closed table is said to the player (2026-10-23).** A player's window "did not connect" to a closed table (`refused: a mesa está fechada` in its log, nothing on the screen). Now the window says, in the folder's place and in the interface's language, *The table is closed by the game master. You get in when it opens.*, with *Try now*, and tries again by itself (15 s, doubling to 30 s — see "As built, night findings" below); the same in the desktop's remote window, a folder synced with the server (`SyncStatus.problem = table_closed`, retried every 15 s) and a browser (the server's push `gone: folder, reason: closed` keeps the folder remembered). The owner never sees it, and the Table chip, badge and panel say *closed* to the game master. **Nothing closed the table without the person**: `campaign_make` on an existing table is `INSERT OR IGNORE` (it does not touch `open`), `campaign_settings` with `open` absent keeps it (`COALESCE`), the window's limit fields send no `open`, no migration touches it, and a new table starts open (tests `making_a_table_again_…` in `db/tests.rs` and `tests_campaign.rs`); the only sender of `open: false` is the switch. The old window put keyboard focus on its checkbox, where a stray Space could close the table without the person meaning to; the redesigned window puts it on the title, saves at once with visible feedback and says *Closed* in red.

## As built (a share is the same table, 2026-10-23)

The maintainer, 2026-10-23: *"qual que é a diferença de entrar na mesa por compartilhamento ou entrar na mesa como membro… Existe algum motivo plausível pra ter diferença?"* The rule that follows: **the share only
bounds what the player can see; the table behaves the same.** Chat, rolls, live
updates, images, the roll mode, the roster, dice colours, the chime, deleting
one's own messages and the closed-table notice are identical for a player on a
share rooted at a table and for a folder member. The audit of every `scope`
branch of the table found two differences that were not about visibility, both
fixed:

- **Live events were dropped.** `Scope::push` (`scope.rs`) sends a share window
  only the events it knows, and the table's events (`table-entry`,
  `table-roster`, `table-pinned`, `table-removed`, `table-cleared`) were not
  among them, so a player on a share heard nothing live: neither the game
  master's messages and rolls, nor her own roll made in a note (the dice played
  from the note's room, the row was kept, and the panel showed it only after a
  reload and the history of `table_join`), nor the roster; and no dice sound or
  3D for the others' rolls, which come from the same event. They are passed
  now; `table.rs` already wrote the table as `""` and the paths from the share's
  root before pushing, so no path of the owner's folder goes with them.
- **Images were refused.** An editor on a share now sends an image like a member
  (a reader sends none, as a reader member). The file is kept in the attachments
  place **inside the share's table folder** (`<root>/<place>/mesa-…`), the only
  place that player reads; the entry's `image` is written from the share's root
  as a note's path is (`scoped`).

What stays different, because it is only scope: paths are written from the
share's root; a note outside the share has no path in the entry; the table is
`""`; a share whose root is not a table has no table; a share's player does not
run the table (`campaign_make`, release, invite are the folder owner's).
Tried: `tests_table.rs` (`a_window_on_a_share_hears_the_table_live_as_a_member_does`:
the owner's messages, a second window of the same account, one leaving, a roll
from a note, an image) and `e2e-server/table-parity.spec.mjs` (the same scenario
as a member and on a share).

A third difference, found by the e2e: a table's picture was looked up from the
share's parent (`resolve_attachment` with no note to say where the target is
written from), so a share player's own thumbnail came back missing. The share
now looks such a target up from the share's root.

## As built (a note's audience, 2026-10-23)

The maintainer's decision recorded in items 4 and 12. What was built:

- **State.** `campaign_notes.released = 1` is still the whole table's, so every
  note released before stays the table's (schema 17 adds tables, changes no row);
  with `released = 0` the rows of `campaign_audience (folder, path, account)` are
  the players who see the note, and none is hidden. An edit grant to a player
  puts that player in the audience of a note that was not the table's; the whole
  group's edit grant makes the note the table's; narrowing an audience takes
  back a grant that no longer holds; hiding takes back any. The audience follows
  the note when it is renamed or moved and goes with it when it is deleted.
- **One question, asked of someone.** The veil answers "hidden" for a given
  viewer: a player's own (`Veil::view(account)`), the public one — what the
  whole table sees, which is what a call that does not say who asks gets, so
  it fails closed — and the union (what any player sees), which is what the
  sync log stores for readers. The doors that said "hidden" before ask the
  player's own: the lists, reads, search, backlinks, graph, tags, quick open,
  boards and embeds, the table's links drawn as locks, the served text, the
  files under `/f/` (an attachment opens only through a note that player
  sees), rooms and their admission, the events each window hears, a device's
  sync, and the table's log (a roll or oracle entry made in a note a viewer
  cannot see loses its path and source for that viewer). A room's shared
  shadow for readers is cut with the public eyes: a link to a note only some
  players see is a lock in it, for everyone, until they reload (no name of
  such a note ever crosses a shared document).
- **A player's device log is its own** wherever there is a table
  (`campaign_epoch`, written in the transaction that makes the folder's first
  table: the log the readers had counted up to there is everyone's, from there on
  each player's is its own; a folder whose epoch row cannot be read is treated as
  having one — it fails closed). A shared log cannot be cut afterwards without
  moving the numbers a device counted, and a note a table keeps from its players
  has a name, a history and a count no shared log may carry. The log the server
  stores is told for the players together; each player is told its cut of it, numbered in
  its own count, and only the changes after the point it was settled to are
  decided at an ask (one ask at a time per folder and player; the head is a
  count, not a walk; the files it is told are kept while the log and the table
  stay as they were). What is decided is decided from the table **at the moment
  a change is recorded**, in the transaction that records it: a note a player
  lost, or saw deleted or renamed, and an attachment that a note it saw opened
  and was deleted, are told to that player as a deletion (`campaign_lost`; who
  saw a path is remembered in `campaign_gone` before a deletion, a rename or a
  move runs — by a window or by a device — while the files and the table's state
  are still there, and asked of the table as it is for a change the server did
  not make); a change a player has nothing to learn from is left out of its log
  at once (`campaign_skip`), and the others are decided the first time its log is
  asked for and kept there, so the numbers a device has counted never move. A
  rename is told with the old name only to a player who was told the old path
  went. Each note's hash is the one of that player's own text. A change that only
  changes who sees a note is in the log of the players who gained or lost it; the
  notes that link it are in the log of the players whose own text of them
  changed, no one else's. A player who cannot see a note is told neither its name,
  its changes nor how many there were, and the device is pushed `sync-changed`
  only when a path it sees moved or it lost one. Turning the last table back into
  a folder forgets all of it (epoch, settled points, lost, skipped), so a table
  made again begins anew in the shared log's numbering.
  Second review (2026-10-24): the players who do **not** see a path when a
  change of it is recorded get their skip row in the same transaction (so what
  a player was outside of is never decided later by a table that has moved on,
  and never counted once it is let in); a player's first ask, which has no such
  record for the past, asks the table as it is, and a decision made while the
  veils were forgotten is made again. A deletion's remembered players are taken
  in the recording transaction, kept to those still players, and dropped when
  the write that remembered them failed. Hiding the past of a path never
  rewrites rows where players have logs of their own. `sync_state` counts the
  head first and builds the files after; a share's page and head are cut from
  the stored log in SQL (its roots), not read whole; a player's told files are
  kept per file while the table and the names are as they were, and the kept
  locks and files are bounded. A player is pinged (`sync-changed`) only if the
  change tells it something: it gained or lost a note, or its own text of one
  moved.
  Third review (2026-10-24): a player's log **begins** at its first ask, at the
  readers' head, with the last change of each path it sees then — never the
  history of those notes before (drafts made while hidden, or while the
  account was out). An account that can no longer read the folder (revoked,
  taken out of its share, or given a role that writes) loses its viewer, skip,
  lost and remembered rows, its audiences and its grants, so that letting it in
  again is a first ask. The skip rows of a recorded change are made in the same
  step or the change is not recorded (the next walk records it; a device's write
  stands meanwhile). What waited for an unreadable table — the windows' events
  and the audiences' log entries — is told once it can be read, and the rooms
  close at once (an unreadable table hides every note). Making the first table over
  files readers already had takes no row out of the readers' count; the notes it
  hides are told gone — a forced deletion after the epoch — to the readers there
  are at that moment, and to no one who comes later (chosen in the code: a hidden
  note does not exist for a player, item 4; the pre-table rows of now-hidden notes
  stay counted, told by what the path is now, because a device's cursor counts
  them). The forgetting counters are per
  folder and a file written is not a change of the table's state; a decision
  that keeps meeting a moving state is refused for the asker to repeat, never
  written. A share's `sync_state` counts its head before the files are made.
  Fourth review (2026-10-24): schema 18 gives a table made before an epoch the
  one its folder's log stood at, so the numbers readers' devices hold go on with
  no gap and nothing sent twice; making a table, its log and its epoch are one
  transaction. What waits for an unreadable table is never replayed from a write
  (a room saving holds its lock): a command and a player's ask replay it; one
  that waited while the table moved on is derived again (who lost it and sees it
  now has it again; who was to gain it and does not is told nothing), and what
  waited for a table that was undone is dropped; at most 64 wait. Taking a share
  away forgets its people who read the folder by no other way.
  Fifth review (2026-10-24): what waits past the bound is made one — the two
  oldest joined, their notes and players together, derived again when told —
  never let go; a derived audience keeps the table as it was, so the notes that
  link it are told too. On the schema-18 upgrade the copies the old code hid
  (reader size −1) stay on players' devices: no forced deletion is made at the
  upgrade, only for a table made from then on. A newcomer's first ask counts the
  pre-epoch in-table rows (a count only, no names: what it cannot see is a hole).
- **What a window is told is what it gained or lost.** `campaign-changed` and the
  `folder-changed` of a release are made per player from the table before and
  after the change: a note it saw neither before nor after is not named, not
  even as removed, and a player none of whose notes moved hears nothing. The
  game masters (the owner and any editor) are not players and are told what the
  command touched. The players of a table are every account that reaches it and
  only reads — the readers of the folder, and the readers of a share at the
  table's folder, above it or inside it; never an owner or an editor.
- **Rooms.** A player who edits a note by a grant is in the room's document; when
  the table changes, it is asked again with the readers: it leaves, told the room
  closed, when the note is no longer one it sees or one it may edit, and it joins
  again as what it now is. A join is asked once more under the room's lock, so a
  window admitted before a release cannot enter after it.
- **A table that cannot be read is closed**, not absent: a failed read of the
  tables is a closed table that holds the folder, never kept, and a veil read
  before the table was forgotten is not put back. That veil is marked unreadable: it fails every
  door closed, but nothing records, settles, tells or sends anyone out from it
  (a WARN says the step waits), and the owner's status is an error, not a
  made-up table.
- **Commands.** `campaign_audience(paths, audience)` (the game master's;
  `{kind: "hidden" | "table" | "players", accounts}`, accounts must be players
  of the note's table) and `campaign_access(path)` (who has access: to the game
  master every player with what each can do, to a player only the people who
  have access; a note the player cannot see answers as an absent one). The
  status says each note's audience.
- **Shown inside the note.** A users icon with a count in the note's title row,
  beside the star; its popover (hover on a pointer device, tap or click, Enter
  and Space; Escape closes and returns the focus; a bottom sheet on a phone)
  lists to the game master every player with *sees* / *edits* / *does not see*
  and a shortcut to change it, and to a player who sees the note ("You, Bruno
  and the game master" / "The whole table"; the server says which person is the
  one asking, `you`, and the window words it as "You", first; the accounts of the others are not
  sent to a player), never the game
  master's controls. "Release to…" is a list of check boxes (the whole table, each
  player, nobody) that stays open while several players are ticked (one tick at
  a time: the rows wait while one is being applied); on a phone the
  sheet gives its close button the focus, and the button carries no native tooltip
  beside the popover.
- **Tried.** `tests_audience.rs` (a player outside the audience cannot list,
  read, search, backlink, tag, open a room, sync, fetch the attachment or see
  the note in the table's log; one inside can; adding and removing a player
  live; deletion; grants), `tests_audience_review.rs` (what a player outside an
  audience hears by every channel; a game master's events; a grant's writer
  leaving the room and a late join refused; deletions, renames and attachments
  told to the players who saw them; the work of an ask; players of a table;
  the epoch and a table that cannot be read), `db/tests.rs` (schema 17 and the
  audience's rules),
  `app/ui/e2e/audience.spec.mjs` and `e2e-server/audience.spec.mjs`.
- **Not done.** A board's audience is the same rule where a board is releasable
  (it is a note-like file of the table); no separate control was added for it.

## As built (night findings, 2026-10-24)

What the live test of 2026-10-23 night showed, and what was built in the code
that night. None of this is a maintainer decision; it was chosen while fixing,
and is recorded so it is not mistaken for one.

- **A closed table, reopened.** The wait between tries of a player's window
  at a closed table now doubles from 15 s to **30 s** (it was 2 min; measured
  on the night, a reopened table took up to 30 s to reach a waiting player).
  And when the game master opens a table, the server pushes
  `table-opened` (`{ folder }`, the id the person opens: the folder's, or the
  share's) to the signed-in windows of the folder's members and of the people
  on a share that reaches the table (inside it, equal to its root, or over
  it — never another subfolder's share); a waiting browser window tries at
  once on it. **Only the browser hears it**: the desktop's remote window drops
  its connection when the open is refused on a closed table, and a synced
  folder's link ignores unknown events, so both keep trying on the timer.
- **A reader of a synced folder** (desktop) has the closed lock and the
  notice on an attempt, as a reader on a server has; the per-note line "You can
  only read this folder" is gone for everyone (the lock says it).
- **Joining by an invitation** opens what was joined (the folder, or the
  share; a person who holds the whole folder gets the folder).

## As built (who may send images, 2026-10-24)

The maintainer, asked whether players should be able to send an image to the
table's chat: *"Deveria ser possível dar ou não permissão de subir imagem,
melhore a tela de acesso, adicione colunas de permissão."* This amends
[0107](0107-the-table-a-shared-roll-and-chat-log.md) item 3 (an image is a file
of the folder, so a reader sent none).

- **The permission.** The game master gives or withholds, per player and per
  table, the right to send images to its chat. With it, the **server** writes
  the image into the table's attachments place on the player's behalf, through
  the same path and the same checks as an editor's image (`table_image::send`:
  PNG, JPEG, WebP or GIF by the bytes, never SVG, the table's `image_max`, the
  folder's quota, the sync log, `nosniff`, the pace). Without it, a reader is
  refused as before ("you may only read this folder"), and the upload is
  refused before it is parsed unless the account holds the permission at some
  table of the folder (`inflight.rs`). The owner and an editor always may. A
  phone paired as a reader, or a read-only token, still sends none. A player
  on a share at the table and a member of the folder behave the same: a share
  only bounds what is seen.
- **Off by default** for a player (chosen in the code). It is a row in the
  server's database, never in a note's file: schema 19, `campaign_images
  (folder, root, account)`, kept with the table (it follows a renamed table
  folder, goes with an unmade or deleted one) and with the account while it
  reads the folder (it goes when the account leaves, so that a player let in
  again begins anew).
- **The command** `campaign_permission(root, accounts, images)`: the folder's
  owner only, on the folder itself (never through a share, never from a phone,
  as the other commands of the table); the accounts must be players of that
  table; one audit row, `campaign_permission`, with the subject
  `images:on|off:<accounts>`. It answers the status. The status carries, per
  table, `image_players` (the game master's list) and `images` (a player's own
  right), and per player the tables he plays at (`roots`).
- **Told at once.** `TableJoin.images` says it at the join, and a change is
  pushed to the player's windows at that table as `table-images { table,
  images }` (the share's own root `""` on a share): the attach button, the
  paste and the drop appear or go, with no reload.
- **The screen.** The table window's **Players** card is now a real table:
  *Player* (avatar, name, a dot while at the table), *Sees* (how many notes are
  released to the player, opening the list), *Edits* (how many the player may
  edit, the same) and *Images*, a switch per player that saves at once and
  answers beside itself, with an *everyone* box in the header that is mixed when
  the players differ. Row headers and column headers are real; on a phone each
  row is a card with the same controls. Nothing was added for removing a player
  (nothing removes one from the table today).
- **Where the file goes (fixed the same day).** Whoever sends — the owner,
  an editor, a member player, a player on a share — an image at a table whose
  root is a subfolder is written to `<table root>/<attachments place>`, never
  to the folder's own `attachments/`: inside the table the veil shows it to the
  table's players (a share rooted there reads it) and hides it from everyone
  outside, a closed table included. Images sent before this fix by an owner or
  an editor at a subfolder table are still at the folder's root
  `attachments/mesa-*`; nothing moves them (no silent rewrite): their log
  entries still resolve as they did, for the members who could fetch them, and
  a share's player still gets none of them (the path is outside the share).
  The game master may move the files into the table's folder by hand.
- **One rule.** "May send images" is one predicate for the send, the join and
  the status: an owner or an editor, and a permitted player, each only with a
  credential that writes (not a read-only token, not a phone paired as a
  reader). It is judged again right before the file is written, so a permission
  taken back while the bytes were on their way is honoured. The size check
  before a message is parsed reads an in-memory set, not the database.
- **A phone paired as a reader is a reader to the server.** Its connection
  now counts as read-only (`Client.token_write` folds the phone's role in), so
  it gets what a reader is told (the reader's pushes, not the game master's)
  and a large upload from it, a table image included, is refused before it is
  parsed.
- **The permission goes with the seat at that table**, not only with the
  folder: when an account stops being a player of a table (its share there
  ends, or it becomes a game master) the permission goes, though it still
  reads the folder another way; being seated again begins off.
- **Not done.** A permission per kind of file, or for rolls: the right is only
  to send images.

