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
   closed to sign-in. `[OPEN]` What closed means:
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
   `[OPEN]` The default for a note in a table folder:
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
   released it becomes available. `[OPEN]` One shared players' board, or
   one board per player plus a shared one:
   - **A — Both: a shared "Board do grupo" and each player may make their
     own** _(recommended)_
   - **B — Only the shared one.**

7. **Links to notes the player cannot see yet.** `[OPEN]` the maintainer's
   question (*"só não sei como faríamos com links entre docs ainda sem
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
