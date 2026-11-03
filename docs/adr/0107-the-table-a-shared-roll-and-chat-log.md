# ADR 0107 — The table: one log of everyone's rolls and messages, beside the notes

- Date: 2026-10-21
- Source: the maintainer, 2026-10-21, while the 3D dice were being given
  Rolai's appearance settings: *"já vai pensando aí pq em algum momento
  quero ter uma barra de chat onde as rolagens de todos que estão
  conectados juntos aparecem no chat e tal"* (start thinking about it,
  because at some point I want a chat bar where the rolls of everyone
  connected together show up in the chat, and so on). Asked for as a
  direction, not for now. Written by Opus 5.5; to be read by the other
  model before it is accepted ([0032](0032-author-and-reviewer-roles.md)).
- Superseded in part by [0113](0113-one-access-model-for-a-table.md) (2026-10-24): item 3's amendment of 2026-10-24,
  the right to send images, became the per-player right *Send files* (images
  and other files, in the chat and into files the player edits). Kept here as
  history.
- Related: [0088](0088-dice-and-random-tables.md) (item 4, the server
  rolls in a room and keeps the last rolls in memory, nothing stored;
  item 8, a member's roll announced with their name),
  [0073](0073-self-hosted-server-first.md) (item 7, rooms),
  [0074](0074-accounts-and-access-on-the-server.md) (accounts, roles),
  [0081](0081-sharing-between-people-on-one-universo.md) (owner, editor,
  reader in a folder), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (a synced folder's note joins the server's room while online),
  [0083](0083-security-hardening-of-universo.md) (bounds, pacing, hostile
  input), [0084](0084-notifications-in-the-window.md) (notifications per
  kind), [0087](0087-secret-blocks-hidden-from-readers.md) (what a reader is not served),
  [0096](0096-this-app-is-a-server.md) (the desktop serving its folder),
  [0101](0101-3d-dice-physics-overlay.md) (3D dice),
  [0102](0102-creative-oracles-and-improvisation.md) (oracle draws),
  [0103](0103-feature-presets-and-capability-flags.md) (feature switches),
  [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md).

## Context

Today a roll in a shared note is seen by the people in that note's room
and nobody else ([0088](0088-dice-and-random-tables.md) item 4,
`crates/verso-server/src/collab_dice.rs`): the server rolls, stamps the
account's name, tells the room's other windows, and keeps the last 20
rolls (`ROLLS_KEPT`) in memory for whoever joins the note later. An oracle
draw travels the same way. Nothing is written.

That fits one note. A game session does not stay in one note: the
game master rolls from a monster's statblock, a player from their
character sheet, someone asks the oracle from the session note. Each roll
lands in a different room; nobody sees them together, and a roll in a
note only you have open is seen by nobody.

Rolai, the maintainer's dice app whose engine Verso copied (0088 item 5),
has the shape asked for: a room by link, a roster of who is there, one
history of everyone's rolls and card draws, a local "hide from here back"
and a "clear the room" for everyone (Rolai `specs/09-limpar-historico.md`),
the server's clock on every entry. It has no typed messages.

What Verso lacks to do the same: a place shared by more than one note (a
room is a note), a panel that shows the log, and a decision on what is
kept and where.

## Decision

Status **Accepted (2026-10-28)**. *(History, until 2026-10-28: Proposed.)*
Items marked `[OPEN]` are the maintainer's; items marked `[PROPOSED]` were the
author's recommendation, accepted as built on 2026-10-28 (see "Status").

1. **The table.** `[DECIDED 2026-10-28 — accepted as built]` A panel named **Mesa** / **Table** shows
   one log: every roll, random-table roll and oracle draw made by anyone
   at the same table, in the order the server received them, each with
   the roller's name (stamped by the server, as presence is), the time
   (the server's clock), the notation, the dice, the total, and the note
   it was rolled from as a link. Plus typed messages and images (item 3).

2. **What a table is.** `[DECIDED 2026-10-21]` **The folder** (option A
   of three; the others were B, the note's room as today, and C, a named
   table by link as in Rolai). Everyone who has the same UniVerso folder
   open, in any note, shares one table. A campaign is a folder; a roll in
   any of its notes reaches the table: it is relayed to the note's room
   (as today) **and** to the folder's table, rolled once by the server.

3. **Messages and images, not only rolls.** `[DECIDED 2026-10-21]`
   Rolls and short typed messages (option A: plain text, no Markdown, no
   HTML; a link to a note of the folder is shown as a link), **and
   images** — the maintainer: *"A mas cara, seria top poder compartilhar
   imagem também"*. Option B, rolls only, was not taken.

   `[DECIDED 2026-10-21]` Where a shared image goes — option A, as
   recommended (the maintainer: *"aceito suas recomendações"*):
   - **A — Into the folder, as a file:** sent to the table, it is written
     to the folder's attachments folder by the sender's action, as an
     imported file is, counts toward the folder's quota
     ([0077](0077-the-server-administration-console-and-folder-quotas.md)),
     is seen in the file list and may be embedded in a note. A reader,
     who writes no file, sends no image. _(taken)_
   - **B — Into the server's storage,** beside the table's log, outside
     the folder; a reader may send one.

   Either way an image is PNG, JPEG, WebP or GIF, checked by its bytes and
   not its name, under the folder's upload limit, served with its own
   type and `nosniff` ([0083](0083-security-hardening-of-universo.md)
   items 8 and 9), and never an SVG.

   `[DECIDED 2026-10-24]` **Amendment: the game master lets a player send
   images.** Asked whether the players should be able to send an image to the
   chat, since every invited player is a reader and "a reader, who writes no
   file, sends no image", the maintainer: *"Deveria ser possível dar ou não
   permissão de subir imagem, melhore a tela de acesso, adicione colunas de
   permissão."* So the game master grants or withholds, **per player and per
   table**, the permission to send images to the table. With it, the
   **server** writes the image into the table's attachments place on the
   player's behalf (the same place and the same checks as an editor's: PNG,
   JPEG, WebP or GIF by the bytes, never an SVG, the table's size limit, the
   folder's quota, `nosniff`, the pace); the player still writes no file of
   their own and reaches nothing else. Without it, nothing changes: a reader
   sends no image. The owner and an editor always may. A player who comes in
   through a share and one who is a member of the folder behave the same
   (0110: a share only bounds what is seen). **Off by default** for a player
   (chosen in the code; the game master turns it on, one player or all of
   them). Taken back, it stops at once: the player's window is told, and its
   attach button, paste and drop go away. Built: schema 19
   (`campaign_images`), the command `campaign_permission`, the event
   `table-images`; see [0110](0110-a-table-is-a-campaign-folder.md) "As
   built (who may send images, 2026-10-24)".

4. **Rolling from the table.** `[DECIDED 2026-10-28 — accepted as built]` The table's input rolls when
   the text is a dice notation after `/r` (`/r 1d20+3`), or from a dice
   button beside it, through the same command as a note's roll, so the
   server draws the number (0088 item 4). A random table or an oracle is
   rolled from its note, not from the table.

5. **What is kept, and where.** `[DECIDED 2026-10-21]` **Kept, with no
   expiry,** and the user may clear it, pin entries and add them to notes
   — the maintainer: *"deveria ficar salvo, sem prazo de validade, com
   possibilidade de limpar, pinar, adicionar nas notas"*. None of the
   three options offered was taken (A, memory only as 0088, the
   recommended one; B, the server's database with a retention; C, a
   session note appended on every entry). This revises
   [0088](0088-dice-and-random-tables.md) item 4 ("nothing is stored")
   for the table; recorded there.
   - **Pin.** Any member pins an entry; pinned entries stay at the top of
     the panel for everyone, until unpinned.
   - **Add to a note.** "Adicionar à nota…" / "Add to note…" on an entry
     (or a selection) appends its text — the notation, the dice, the
     total, who and when — to a note the user picks, showing what will be
     added before writing it (invariant 8), through the same write as any
     edit, with its stale check (invariant 11). An image is added as an
     embed of its file.

   `[DECIDED 2026-10-21]` Where the log is saved — option A, as
   recommended:
   - **A — The server's database,** per folder, in `VERSO_DATA_DIR`,
     backed up with the server; it does not travel with a synced copy of
     the folder. _(taken)_ — no file of the folder is written on
     behalf of everyone present, every few seconds
     ([0012](0012-files-are-source-of-truth.md)); what should live with
     the notes goes there by "Add to note".
   - **B — A file inside the folder** (under `.verso/`), written by the
     server through `verso-fs`; it travels with the folder and its sync,
     and is rewritten on every entry.

6. **Clearing.** `[DECIDED 2026-10-28 — accepted as built]` As Rolai: **"Ocultar daqui pra trás"** /
   **"Hide up to here"** hides the log in your window only, can be undone,
   and is cut at the server's time of the last entry shown, never the
   local clock; **"Limpar a mesa"** / **"Clear the table"** empties it for
   everyone, asks first, and is the folder owner's only; pinned entries
   are kept unless the owner says otherwise in the same question.

   `[DECIDED 2026-10-21]` Deleting one entry — option A, as recommended:
   - **A — Its author deletes their own message or image; an owner
     deletes any.** A roll is not deleted one by one (so nobody re-rolls
     and hides the first). _(taken)_
   - **B — Only the owner,** by clearing the table.

7. **Secret rolls.** `[DECIDED 2026-10-21]` **Now, to the folder's
   owners** (option B; A was later, in its own ADR, the recommended one).
   "Rolar para o dono" / "Roll to the owner" shows the roll to the roller
   and to the folder's owners; the other members see "Ana rolou em
   segredo" / "Ana rolled in secret", with no notation and no number. The
   server decides who receives it from the folder's roles, never from
   the window. A secret roll falls in 3D only on the screens that see it.

8. **Who is at the table.** `[DECIDED 2026-10-28 — accepted as built]` The panel's top shows who is
   there now (names stamped by the server, the same colours as their
   cursors). A reader of the folder is at the table and may roll, as 0088
   decided for a note (D2–D11), and may write messages (the author's
   recommendation; item 3 decided messages, not who writes them).

9. **Where the table exists.** `[DECIDED 2026-10-28 — accepted as built]` On a UniVerso folder, in the
   browser and in the desktop app connected to it; in a synced folder
   while the server is reachable, as a note joins its room under
   [0082](0082-live-co-editing-of-a-synced-folder.md); on a desktop
   serving its folder ([0096](0096-this-app-is-a-server.md)), the desktop
   is the server and holds the table. In a folder of the computer, alone,
   the panel shows your own rolls of this run, as Rolai's local history,
   and says it is not shared.

10. **Where the panel goes.** `[DECIDED 2026-10-21]` **A panel of the
    side area** (option A), like Backlinks or Outline, which the user may
    move as any panel; on the phone, a sheet from the bottom. Not taken: a
    bar along the bottom (B), a floating drawer (C).

11. **Each roller's own dice.** `[DECIDED 2026-10-21]` Everyone has
    their own dice appearance ([0101](0101-3d-dice-physics-overlay.md):
    colours, texture, material, the three colour slots), and a roll is
    shown to the others in the **roller's** appearance, not the viewer's.
    The maintainer: *"cada usuário vai ter sua própria configuração de
    dado, e deveria refletir para os outros quando ele fizer rolagens"*
    (each user will have their own dice settings, and it should show to
    the others when they roll). Rolai does the same: a roll and a member
    of the roster carry the roller's `DiceStyle`. So:
    - The window sends its appearance with the roll; the server checks
      it against a closed form — colours as `#rrggbb`, texture and
      material from the fixed lists, nothing else, never a URL or a
      file — refuses anything else, and relays it with the roll and in
      the roster. The size of the dice stays each viewer's own.
    - It holds for a roll in a note's room ([0088](0088-dice-and-random-tables.md)
      item 4) as well as at the table.
    - The log draws each roll's dice in the roller's colours.

    `[DECIDED 2026-10-21]` Others' rolls also **fall in 3D** on your
    screen when your 3D dice are on, in the roller's appearance, with a
    switch "Mostrar em 3D as rolagens dos outros" / "Show others' rolls
    in 3D", on (option A; B was only your own rolls in 3D).

12. **Bounds and hostile input** ([0083](0083-security-hardening-of-universo.md)).
    `[DECIDED 2026-10-28 — accepted as built]` A message is at most 500 characters and plain text; the
    server refuses anything longer before it is relayed; messages are
    paced per connection like the REST routes (a burst, then 429-like
    refusal); the log held per table and per window is bounded; the
    window draws a message as text, never as HTML. A message is never
    written to the server's log.

13. **Notifications** ([0084](0084-notifications-in-the-window.md)).
    `[DECIDED 2026-10-28 — accepted as built]` With the panel closed, its button shows a count of
    unseen entries. A new kind, **"Mesa"** / **"Table"**, sends an
    operating-system notification for a message or roll by someone
    else, off by default.

14. **A feature switch** ([0103](0103-feature-presets-and-capability-flags.md)).
    `[DECIDED 2026-10-28 — accepted as built]` "Mesa" / "Table" in the RPG and tabletop group of
    Settings › Features, on by default where dice are on. Off: no panel,
    no button; rolls in notes behave as today.

15. **Contract and tests.** `[DECIDED 2026-10-28 — accepted as built]` New commands (join a table,
    say, clear) and events (an entry, a roster change, a clear) defined
    in Rust and generated for the window (invariant 3); the window reaches
    the table only through them (rule 1). Tests: the server relays one
    roll to both the note's room and the folder's table, rolled once; a
    message past the bound is refused unparsed; a reader may roll; only
    an owner clears; the cut of "hide up to here" uses the server's time;
    an end-to-end test with two windows in the browser harness.

16. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)).
    `[DECIDED 2026-10-28 — accepted as built]` The log is a list with a polite live region; an entry by
    someone else is announced with their name (0088 item 8); the input
    has a label; a key focuses the table's input; pt-BR and English.

## Consequences

- `verso-server` gains a channel per folder beside the rooms per note
  (if item 2 is A), its bounds and its tests; `collab_dice.rs` relays a
  roll to it as well as to the note's room.
- The window gains the panel, its button, its notification kind and its
  feature switch; the demo vault gains a note that teaches the table, and
  "Tour do Verso" a card ([0058](0058-demo-vault-as-tutorial.md)).
- 0088 item 4 is revised for the table (item 5), recorded in 0088's
  revisions in the same change as this ADR's decisions.
- The server's database gains the table's log and its pins (item 5);
  an image is a file of the folder (item 3).
- Nothing is written to a file of the folder on behalf of the table,
  except by "Add to note" and an image its sender sends.

## Discarded alternatives

Offered to the maintainer on 2026-10-21 and not taken: the note's room
or a named table by link as the table (item 2); rolls only, with no
messages (item 3); memory only, a retention in the server's database, or
a session note appended on every entry (item 5); secret rolls later in
their own ADR (item 7); a bar along the bottom or a floating drawer
(item 10); only your own rolls in 3D (item 11); an image in the
server's storage (item 3); the log in a file inside the folder (item 5);
only the owner deletes, by clearing (item 6).

## As built (the server, 2026-10-22)

Branch `feat/table-server`. The server and the contract are built; the
window's panel is another branch's (`feat/table-panel`). What is built is
what items 2, 3, 5, 6, 7, 11 and 12 decided; where the code had to choose,
the choice is listed last, for the maintainer to confirm or change.

- **Where.** `crates/verso-server/src/table.rs` (the channel, the commands,
  the roles), `table_look.rs` (the closed form of a dice look),
  `table_image.rs` (an image into the folder), `db/table.rs` (the log, schema
  14). `collab_dice.rs` relays a roll or an oracle draw to the note's room as
  before and appends it to the folder's table, rolled once.
- **Commands** (the window reaches the table only through them). `table_join(color,
  styles) -> TableJoin`, `table_leave()`, `table_look(color, styles)`,
  `table_history(before, limit) -> TablePage`, `table_say(text) ->
  TableEntry`, `table_send_image(base64) -> TableEntry`, `table_roll(notation,
  source, path, secret, styles) -> TableEntry`, `table_pin(id, pinned)`,
  `table_delete(id)`, `table_clear(keepPinned)`. `collab_roll` gains `styles`
  and `secret`; `DiceRoll` gains `styles` (item 11). Entry numbers are
  decimal strings and grow; `table_history` pages by them.
- **Events**, to every window at the table: `table-entry` (a `TableEntry`, to
  the sender's window too: the window drops a number it has), `table-pinned`,
  `table-removed`, `table-cleared`, `table-roster` (a list of `TableMember`,
  one per account). `collab-roll` carries the roller's `styles` inside the
  roll.
- **Who hears what** is decided in `table.rs` from the folder's roles at the
  moment of sending. A secret roll ("to the owner") goes to its roller and
  the owners in full, to the others as an entry of kind `secret` (name and
  time, no notation, number or note), in the event and in every page they
  read later; it is told to neither the note's room nor the readers of the
  room. A roll or a draw made inside a note with secret blocks, which the
  folder's readers are not told in the room (0087 item 4), is kept for the
  table but never told to a reader of the folder, nor paged to one.
- **Permissions.** A reader joins, rolls, writes and pins; sends no image
  (refused before the message is parsed, `inflight.rs`, and again in the
  command). An image is refused unless its first bytes are a PNG, a JPEG, a
  WebP or a GIF, and unless it is at most 10 MB; it is written by the same
  path as any file a window creates (`create_file` through `folder_run`: the
  folder's quota, sync's log, confinement). Its author deletes a message or an
  image, an owner any; a roll is never deleted one by one; only an owner
  clears (`keepPinned` defaults to keeping the pinned).
- **Bounds** (0083). A message: at most 500 characters, plain text (a line
  break allowed, no other control character), refused unparsed past 4 KiB of
  message; an image: 10 MB, 14 MB of message; messages, images: 5 a second,
  20 at once per connection (`Server::table_pace`, `pace.rs` with a pace of
  its own); rolls and draws, those of a note's room too: the REST pace per
  connection; 64 windows at a table; a join answers the latest 100 entries
  and every pinned one, a page at most 200. A fuzz target (`fuzz/fuzz_targets/table.rs`,
  seeds in `fuzz/seeds-table/`) reads a message, a look, an image's bytes and a
  command's size.
- **Where it is not.** A window on a share, or a phone that opened part of a
  folder, has no table (the answer is refused). The desktop with a folder of
  its own alone has none: the commands answer that the table is a server's,
  and the window shows its own rolls. A synced folder's table (item 9) was not
  built here: its windows reached the local stubs, which refuse (built since: see "As built (a synced folder, 2026-10-23)" below). A desktop serving its
  folder (0096) holds the table: the same code, its phones allowed all but
  clearing.
- **Chosen in the code, for the maintainer to confirm.** (1) The log keeps at
  most 20 000 entries per folder: past that the oldest that are not pinned
  go. Item 5 says no expiry; this ceiling is only so that a member cannot
  fill the host's disk with messages, and is one constant (`ROWS_MOST`).
  (2) The attachments place is the folder's attachments folder when its
  Obsidian settings name one, else `attachments`; the file is
  `mesa-<date><time>-<id>.<ext>`. (3) Image size 10 MB. (4) The pace: 5 a
  second, 20 at once. (5) The roster has one entry per account, however many
  windows. (6) The entry carries the author's opaque account id (`by_id`) so
  a window knows which messages are its own; `TableJoin.you` is its own.

## As built (the window, phase 2, 2026-10-22)

Branch `feat/table-wire`. The window reaches the server's table through the
contract, as the server's "As built" section above describes it; what is
built is what items 2, 3, 4, 5, 6, 7, 8, 11 and 13 decided or proposed, in
`app/ui/src/table/` (`server.ts`, the source; `join.ts`, when it is joined;
`compose.ts`, the input row; `actions.ts`, the menus; `send.ts`, what is
typed and checked before sending). Where the code had to choose, the choice
is listed last, for the maintainer to confirm or change.

- **When it is joined.** When a folder is shown, the switch flips, the role
  changes or a test says the table came up, the window asks `table_join`
  (with the person's dice and no colour); the answer says whether the side
  has a table for the folder. If it does, the server's source replaces the
  phase 1 local one (`setTableSource`), and the local recorders stand down
  (the server tells the window its own entries too, held once by their
  number); if it does not, the local source stays and says it is not shared.
- **What the panel adds** (server table only). The roster at the top (name
  and cursor colour); the pinned entries in a list of their own above the
  log; "See earlier" for older pages; the input row (a message with Enter,
  `/r` and `/roll` for a roll, a dice button for the roller, an image button
  and paste or drop for an image, the "Secret" toggle); a menu on each entry
  (Pin or Unpin, Add to note…, Delete) and a table menu for an owner (Clear
  the table, asking first, with "keep the pinned" ticked); a message as text
  with `[[links]]` to notes of the folder as links; an image as the file's
  thumbnail that opens large; a roll "to the owner" masked for the others.
- **Each roller's dice.** `collab_roll`, `table_roll` and the join carry the
  person's `DiceStyles`; a roll heard in 3D falls in the roller's look, and
  its chips in the log are in the roller's colours.
- **Notifications.** A new kind, "Table", off by default, raised for a
  message, image or roll by someone else while the panel is not on screen.
- **Chosen in the code, for the maintainer to confirm.** (1) A pinned entry
  is shown only in the pinned list, not also in its place in the log.
  (2) The window holds at most 1000 entries (the constant `HELD`) in
  memory; "See earlier" asks for 50 at a time. (3) The presence colour is a
  hash of the account's name, as in notes, learned from the join's roster and
  sent by `table_look` right after it. (4) Another person's roll falls in 3D
  from the table's event only when this window is not in that note's room
  (otherwise the room's event already makes it fall); the same roll never
  falls twice. (5) The window's own roll appears in the log as soon as the
  server answers, before its 3D dice have rested. (6) The "Secret" toggle
  applies to `/r`, the dice button and the palette's roller; a die in a note
  is never secret. (7) A die in a note that is not in a live room is rolled
  by `table_roll` with the note's path, so the table has it. (8) An oracle
  draw outside a live room is still this window's (there is no command for
  it). (9) Notifications are one per folder, each newer entry replacing the
  earlier one in the list. (10) An image's address is asked as an attachment
  with no source note and the path relative to the folder; the real server
  has to confirm that resolves. (11) A window rejoins when the folder is
  shown, the role or the switch changes; entries sent while its connection
  was down are not asked for again until then. (12) "Add to note…" on an
  image writes `![[attachments/…]]`, the file's path. (13) The key that
  focuses the input (item 16) is not built.

## As built (a synced folder, 2026-10-23)

Branch `feat/table-in-synced-folder`. Item 9 for a folder of this computer
that syncs with a UniVerso ([0079](0079-sync-a-local-folder-with-a-server.md)):
the maintainer's test scenario, the game master on the desktop with a local
folder synced to a UniVerso, the players in the browser and on the Windows
app on the server's folder. Where the code had to choose, the choice is
listed last, for the maintainer to confirm or change.

- **The transport is the sync's connection** ([0082](0082-live-co-editing-of-a-synced-folder.md)
  item 2), never a second one. The window's `table_*` commands (join, leave,
  look, history, say, image, roll, pin, delete, clear) are answered by
  `sync::live::command` (`app/src-tauri/src/sync/live.rs`), reached from the
  same `live_forward` that answers the `collab_*` commands, only for a window
  whose folder syncs; they go to the server as the window on the server's folder
  sends them, and the server needed nothing new: the device session's
  connection runs the same `handle` as any other, with the folder's role of the
  account and the same checks (`tests_live_table.rs` tries a reader's powers and
  the owner's).
- **The events** (`table-entry`, `-pinned`, `-removed`, `-cleared`,
  `-roster`) the server tells that connection go to the windows of the folder
  that joined the table, as a room's events go to the windows that hold the
  note. The sync's connection is one member of the table however many windows
  of this app joined: the roster has it once, and it leaves the server's
  table when the last of them leaves, or when the sync pauses.
- **Offline.** With the link down or the sync paused a `table_*` command
  answers `unavailable`, as a room's does. The window then keeps the phase 1
  local log, says **"Mesa indisponível sem conexão"** ("Table unavailable
  while offline", or "…while sync is paused"), and joins again when the
  sync's state says the link is back. The rolls made meanwhile stay in the
  local log, marked not shared; they are not sent when the link returns. A
  new connection is at no table until its windows join again; the window does
  it on the state change.
- **A roll made in a synced folder's note** is the server's: through the note's
  room when the note is live, else `table_roll` with the note's path (item 13
  of the window's section above), the entry rolled once by the server.
- **Which folder.** A synced folder is one local folder with one server folder
  (0079 item 1); the connection opens that folder on the server, so the table is
  that folder's. A folder synced from a share ([0081](0081-sharing-between-people-on-one-universo.md)
  item 6) has no table, as a window on a share has none: the server refuses and
  the window keeps its own log.
- **Tried.** `app/src-tauri/src/tests_live_table.rs`, against a real server: a
  device session joins, says, rolls, pins, deletes, clears and hears another
  connection; a reader synced to the folder is at the table with a reader's powers;
  the link down, a new link, the last window leaving. The window:
  `app/ui/test/tableReach.test.mjs` (where the table is, from the sync's state)
  and `app/ui/e2e/synced-table.spec.mjs` (the harness plays the table over the
  rooms' link).
- **Chosen in the code, for the maintainer to confirm.** (1) The rolls made
  offline are not sent when the link returns: the table is the server's and
  holds what was rolled while the window was at it. (2) The sync's connection
  is one member of the table for all the windows of that folder on this
  computer. (3) A window that joined before the status first said the sync is
  on tries the join, which the host answers by the link's state, then joins
  again on the first state change.

## Decision (the roll block, 2026-10-22)

Decided by the maintainer on 2026-10-22, option A of the three offered for what
"add to a note" should write (*"o modo A fica maravilhoso"*): a roll of the
Table is added to a note as a **roll block**, and it is added by dragging it
from the panel, not by a "+" button. Branch `feat/roll-block-drag`.

- **The block.** A fenced code block with the info string `roll`: a header line
  (who, when, where as a link), the roll line (`1d20+5 → [16] + 5 = 21`) and,
  for a random table or an oracle, a line or two more. The grammar is in
  `app/ui/src/rollblock/format.ts` and in `docs/spec/dialect.md` §6 (a Verso
  extension: Obsidian shows a code block; a fenced block with a new info string
  changes the meaning of nothing). Verso draws it as a fixed card, in Reading
  and in Live Preview and in a board's text card, and never rolls it again.
  Source shows the text. A block that does not read is shown as plain code; a
  line the grammar does not know is kept.
- **What can be a block.** Dice rolls (kept and dropped dice, modifiers, several
  terms, Fudge), random-table rolls (the row), oracle draws (question, spark,
  table; the answer). A secret roll seen in full is a roll; a masked one holds
  nothing and cannot be dragged. A message keeps its quote line and an image its
  embed ("Adicionar à nota…" as before).
- **Dragging.** A roll line is dragged with the pointer (HTML5 drag-and-drop does
  not work in the WKWebView), by the same mechanism as a tab or a tree row
  (`layout/drag.ts`), with the ghost. Over a note's text, Live and Source, a
  caret shows where the block will land and the drop is **one ordinary edit**
  (one undo step), with a blank line each side as a block needs
  ([ADR 0061](0061-blocks-in-edit-mode.md)); a drop inside a fence, a
  table, a list, a quote or the frontmatter lands before or after that block.
  Over Reading the note goes to Live and the block lands after the block under
  the pointer. Over a board it becomes a text card holding the block. A reader
  of a synced folder cannot drop.
- **The menu.** The "+" button is gone. The entry's "…" menu (now on the local
  table too) keeps "Adicionar à nota…" for the keyboard, the screen reader and
  the phone: it shows the block first and appends it at the end of the note
  chosen, over the revision read, as before.
- **The dice colours** are expressed: a roll made with the roller's own dice
  carries a line `dados: <body> <number> <outline>` (three `#rrggbb`) and the
  card's chips use them; the app's own look writes no line. The texture and the
  material are not written.
- **Keys** are written in the window's language (`quem`, `who`…) and read in
  either; the time is the local time of the person who added it.
- **Fix.** After `/r 1d20` the input row kept the text when the roll took long
  or its 3D fall failed: it is now emptied as soon as the server accepts the
  command (never over something typed meanwhile).

Assumed, for the maintainer to confirm or change: the keys' language follows
the window; "Você" is written as the author when the window has no name of its
own (as the old line did); the board card is 340 by 110; Reading drops go
after the block under the pointer.

## Decision (the dice composer, 2026-10-23)

Asked by the maintainer on 2026-10-23, after a first idea of dice buttons that
roll on a click, in these words: *"Não, não é pra rolar com click, é pra compor
uma rolagem, igual dá pra fazer com dice tray do Foundry ou o que temos no
Rolai"*. Branch `feat/dice-composer`.

- **What was built.** A **dice tray** in the Table panel, above the input row,
  behind a toggle (**Compor rolagem** / *Compose a roll*): a click on a die does
  **not** roll, it adds that die to a roll shown as notation; only the **Rolar**
  button rolls. It is a port of Rolai's composer (`apps/web/src/composer.ts`,
  `ComposerBar.tsx`, `RollPanel.tsx`; read-only reference) in
  `app/ui/src/table/composer.ts` (the model, pure) and `tray.ts` (the DOM): the
  pool as removable chips (a `×` takes a whole kind off), a button per die with
  a count badge and a `−` that takes one off, a modifier stepper (−99 to +99),
  **Limpar** (Clear), and an editable **notation** field that is the source of
  truth. Clicking the same die again adds one to its term (`2d6`); another die
  makes a new term (`2d6+1d4`); at most 100 dice over all the terms. A notation
  the buttons cannot show (`4d6kh3`, a re-roll, a subtracted die) stays as
  typed and rolls as typed; a die clicked then starts the pool again from that
  die (Rolai's rule). The pool is kept after a roll. **Rolar** is off while the
  field is empty. Enter in the field rolls.
- **One road for the roll.** The button sends the roll the way `/r <notation>`
  sends it (`rollNotation` in `app/ui/src/table/compose.ts`, which `/r` now
  uses too): at a server's table the server rolls it, once, for everyone, with
  the **Secreta** toggle respected (the tray says so and the button reads
  *Rolar em segredo*), then the 3D dice and their sound, and the entry in the
  log for everyone; at the local table (no server) this window rolls it with
  the same reader and the log keeps it, the 3D dice falling the same. The tray
  is there for both. No second pipeline, no new command of the contract.
- **Dice offered.** Rolai's `COMPOSER_DICE` less the card: d2, d3, d4, d6, d8,
  d10, d12, d20, d66, d100 and dF. The card (`C`, `2c`) is omitted because
  Verso's notation has no cards (`dice/notation.ts`). Also left out of the port,
  because Verso does not read them: Rolai's slot blocks (`1[2d6]`, which belong
  to its profiles). A die that explodes (`1d6!`), which Verso reads and Rolai's
  composer does not know, is outside the composer: typed, it rolls as typed.
- **Custom rolls** are the notation field: anything Verso's reader accepts
  (`4d6kh3`, `1d20+5`, `1d6!`). What it does not read is said beside the tray
  and nothing is rolled.
- **The phone.** The tray folds behind its toggle (`aria-expanded`), starts
  folded on a phone and open on a larger window, remembers the choice, and
  always leaves the toggle in sight; the dice are touch-sized, six to a row at
  390 px, and the tray scrolls inside itself instead of pushing the log out.
  The notation field lifts the sheet above the keyboard as the message field
  does. Every button has a name (pt-BR and English), takes Tab and Enter, and
  has a visible focus.

Chosen in the code, for the maintainer to confirm or change: the tray starts
open on a desktop window and folded on a phone, and the choice is remembered in
the browser's storage (a per-viewer convenience); the notation field is a
single line, Enter rolls; `d66` is a plain 66-sided die, as in Rolai, and the
3D dice show it as their plain fallback; a modifier with no dice in the pool
is not written (Rolai's rule); the pool is not emptied by a roll; the tray's
error line, not the log, says what could not be rolled.

**A roll heard names the die that was clicked** (decided 2026-10-23, "Sim" by
the maintainer). A note can hold the same `dice:` code twice, and a roll heard
from another person used to show on the first die with that code. A
`DiceRoll` now carries an optional `occurrence` (`Option<u32>`, from 0): which
of the note's dice with that code was clicked. The window sends it as the
`occurrence` argument of `collab_roll` and `table_roll`; the server keeps it
only if it is below 1000, otherwise drops it, and relays it in the roll (the
room's event, the rolls kept for whoever joins, the table's entry); a window
that hears it shows it on the die with that place. With none (an older window
or server, an old log entry) the first die shows it, as before. It is for
display only and trusted for nothing else; a value that is not a non-negative
32-bit number is refused. The TypeScript types are regenerated from Rust.

**Saved rolls (decided by the maintainer, 2026-10-23).** Asked whether the
Table should keep saved or named rolls ("Ataque da Bia"), the maintainer
answered *"Sim"* and, for where, option B, worded to them as: *"Numa nota da
pasta (ex.: `Rolagens.md` ou a própria ficha do personagem): cada linha
`` `dice: 1d20+7` `` com um nome vira um botão na bandeja. Segue a pessoa em
qualquer aparelho, o mestre pode deixar prontas, o Obsidian lê, e quem vê
segue a permissão da nota"*, with the recommendation of *the tray reading from
the sheet the person has access to*. Built: the tray has a **Saved rolls**
row. A saved roll is a line of the source note holding an inline `dice:` code
(ADR 0088); its name is the line's text without the code, the list, task,
quote or heading marker and a trailing colon (``- Ataque da Bia: `dice: 1d20+7` ``
is *Ataque da Bia*); a line with only the code is named by its notation. A
click fills the composer's notation field and does not roll ("não é pra rolar
com click, é pra compor"). **Salvar** appends `` - <name>: `dice: <notation>` ``
to the note through the ordinary note write: the room when the note is live,
else the file over the revision that was read (invariant 11), refused without
write permission (a reader sees no Salvar; a refusal is said in the tray's
error line). The row reads the note through the contract (`read_note`; reading
never rewrites it) and reads it again when the folder reports a change.

Chosen in the code, for the maintainer to confirm or change: the source note is,
by default at a campaign table, the note granted to this player alone; for the
game master, the local table or a player with no such grant, a note the person
picks with **Escolher nota…** (the app's quick switcher), remembered per folder
in this browser's storage; a choice made by the person wins over the grant; a
player's write goes only where the note's grant lets it. A line with several
codes gives one button each, named with the words before the first code and the
notation. A repeat of the same name and notation is listed once; code in a
fenced block is code; a table row is named by its cells without the code. **Salvar**
files the line at the end of the note's "Rolagens" / "Rolls" / "Saved rolls"
section when it has one, else at the end of the note, joining a closing list of
rolls and after a blank line otherwise; a heading is never created. Table rolls
(``dice: [[Note^id]]``) are not listed: the tray rolls a notation, and a table
roll needs the note's table read, which the dice card owns (a later step). The
log entry carries no name: the roll path has no label field and none was added
to the contract.

**The tray made compact (2026-10-23).** The maintainer, with two screenshots, one of Foundry VTT's Dice Tray and one of ours: *"to achando que essa barra de dados ta ocupando muito espaço, vou te mandar como é o dice tray e como estamos hoje"*. The tray now follows the Foundry module's (`mclemente/fvtt-dice-tray`, MIT; read: its `README.md`, `templates/tray.hbs` and `maps/templates/template.js`): ONE row, about one button tall, directly under the Table's message field — the dice d4 d6 d8 d10 d12 d20 as small icon-only buttons, a number field for the modifier, KH and KL, and a dice button. The roll is written **into the message field** as `/r 2d6+1d4+3` and the field is the source of truth: a click on a die edits that line, typing in it changes the badges, a formula the row cannot show (`4d6kh3`) is left as typed; the dice button sends exactly as Enter does, so there is still one road for the roll. What changed from the Rolai-port layout of the section above: the "Compose a roll" toggle and its folding state, the hint line, the grid of eleven labelled buttons, the pool chips, the Mod stepper, Clear, the separate notation field and the Rolar button are gone; the dice keep Rolai's shapes (`dieIcon.ts`), now about 21 px with a count badge. Copied from Foundry: a left click adds one die and a right click takes one off; a badge with the count on each die; a number field for the modifier that the wheel steps; d100 not in the row (Foundry keeps it in a drawer of the d10); KH and KL as `updateDiceKeep` does them, on every numbered term — a term without a keep gets one more die (never more than two) and keeps one, the same button again undoes it, the other switches; with no dice they do nothing. Foundry writes `2d20kh`; Verso's reader wants the count (`dice/notation.ts`), so the row writes `2d20kh1`. Saved rolls (previous paragraphs) keep their behaviour and move behind one **bookmark** button of the row, opening a pop-over with the source note button, the list, the name field and **Salvar**; a click on a saved roll writes `/r <notation>` in the field and does not roll.

Chosen in the code, for the maintainer to confirm or change. (1) KH and KL are two buttons side by side, as in Foundry's tray (the request called it "a KH/KL button"), each `aria-pressed`. (2) The other dice (d2, d3, d66, d100, dF) are behind a **⋯** button with a dot while one is in the roll. (3) Removing a die: right click, `Shift+Enter`, `Delete` or `Backspace` on a focused die, a long press (500 ms) on touch. (4) A modifier chosen while the field holds no dice is kept in the number field and joins the first die added; emptying the field resets it. (5) A click on a die when the field holds a plain message leaves the message untouched (as Foundry's); when it holds a formula the row cannot read, the roll starts again from the die clicked (today's rule). (6) The local table, which had no message field, now shows the field and the row; with no server it only rolls — a plain message there is refused in the field's error line, with the text kept. (7) The number field's spin arrows are hidden to save width; the arrow keys and the wheel step it. (8) On a phone the row keeps targets 40 px tall and scrolls sideways inside itself if it does not fit; the dice button stays beside it. (9) A `/r` line in the field counts for its first line only; the lines after it are kept by the row and ignored by the roll.

**The message field made larger (2026-10-23).** The maintainer: *"Coloca a caixa de digitação maior, sendo possível apertar shift+enter pra quebrar linha e tal"*. The Table's message field starts three lines tall (two on a phone), grows with its text up to eight lines and then scrolls; `Shift+Enter` inserts a line break, `Enter` sends, and `Enter` while an input method composes (IME) only confirms the composition. The log already shows a message's line breaks (`white-space: pre-wrap`) and the server accepts a line feed in a message (only other control characters are refused, `table.rs`) within the same 500-character bound, so there is no change to the contract. On a phone the sheet still rises above the keyboard while the field has it.

**The whole foot of the panel made one box (2026-10-23).** The maintainer, with a screenshot of the panel's foot: *"toda essa parte de bandeja de dados está muito ruim. Eu vi que você colocou ali uma parte de secreto, tem um botão de imagem, outro botão de rolar dado. Toda essa parte precisa ser remanejada, de preferência copiando a mesma experiência que tem no Foundry VTT ou no Roll20 ou nesses outros VTTs. Porque quando eu falei de colar a imagem, é literalmente a pessoa copia ou tira um print, clica no botão direito colar, ou segura o clique no celular e clica em colar, ou aperta Ctrl V, Command V."* and *"tem que revisar isso tudo ai da imagem"*. The foot is now ONE composer, as a VTT's chat is: the multi-line message box, the dice row right under it, and nothing else. Gone: the separate row of image, roller and **Secreta** buttons (the roller dialog stays in the command palette, **Rolar dados…**), the hint lines. Who sees a roll is Foundry's roll-mode selector in the dice row (core Foundry's chat has one: Public / Private GM / Blind GM / Self roll); Verso has two modes, so it is a small **Pública / Secreta** select, the same switch as the old toggle (the roll to the folder's owners), shown at a server's table only; the dice button then says *Rolar em segredo*. **The box and the row (revised the same day).** Nothing may sit past the edge, so the composer's own controls moved into a small toolbar on the bottom edge of the box (paperclip, bookmark for the saved rolls, a compact **Pública / Secreta** select with a lock icon, Send at the right), and the dice row keeps the dice, the modifier, KH / KL and the roll button. What the row has no room for goes into the "⋯" popover, in a fixed order: first d2, d3, d66, d100 and dF (always there), then KH / KL, then the modifier; the row is measured with a `ResizeObserver`, the dots carry a dot while something in them is in force, and nothing is clipped or scrolls sideways at 260, 320, 390 or 1280 px. The typed text starts on the top line of the box.

**Images** are pasted: `Ctrl+V` / `⌘V` with an image copied or a screenshot, right click › Paste, or the phone's long press › Paste in the box (all end in the browser's `paste` event with the image in the clipboard; the box is a plain `textarea`, and neither the app's own context menu, which replaces the menu only for pictures already in notes, `main.ts`, nor the long-press menu, which leaves fields to the system, `touch.ts`, takes the menu from it), or dropped on the panel, or chosen with a small paperclip in the box (chosen in the code, for phones and galleries). A pasted image does not go at once: it waits in the box as a small thumbnail with an **×**; **Enter** (or the send button) sends the images and then the text. The contract sends an image and a message as two commands (`table_send_image`, `table_say`), so they are two lines of the log, the images first; no contract change. The 10 MB and type checks and their messages are the same, now made when the image is pasted; one refused by the server stays in the box for another try. A GIF is sent as it is, so it stays animated in the log. A reader has no paperclip and a paste is not taken. Chosen in the code, for the maintainer to confirm: a small send button (a paper plane) stays beside the box, because a phone's keyboard has no Shift+Enter and Enter must be able to mean a new line there later; the counter of the 500 characters stays as it was. What was read: Foundry's Dice Tray module (see above); Foundry core's and Roll20's chat I know from using them, not from their source — Roll20's is closed, and the behaviour copied is the visible one (one box, the roll mode as a select, Enter sends).

**The foot tested in the real app (2026-10-23).** The maintainer tested the Table panel in the Mac app and said, four things. (1) With a screenshot of the Public / Secret select in the box's toolbar, a thick purple focus ring and the lock icon over the text: *"na barra aqui do chat isso ta meio estranho."* The mode is now a small button (icon and label side by side, never overlapping or clipped, the app's own focus ring, the height of the other controls of the bar) that opens the app's menu with the two modes, with arrows, Enter and Escape; a native select is drawn differently by each webview. (2) *"a lista de pessoas online nao fica legal assim, coloca apenas um icone com numero de pessoas online, ai se parar o mouse em cima, dar pra ver"*: the roster line is one people icon with the count; hovering shows the names with their cursor colours, a tap or Enter on touch and keyboard opens the same list, Escape closes; a screen reader reads "N pessoas na mesa: Ana, Bruno". (3) *"pra que tem icone de dado no canto inferior direito ja tem botão pra enviar mensagem que faz o msm? talvez dê até pra usar esse botão pra outra coisa, mas nao isso"*: the dice row's own roll button is removed (Send already sends the `/r` line); no new use was invented for it. (4) *"o mestre deveria ter poder de deletar uma rolagem."* This **supersedes** item 6's "a roll is not deleted one by one" and the line above, "a roll is never deleted one by one", **for the folder's owners**: an owner (the game master) may delete a roll, with the same confirmation the menu already has; a player still cannot delete a roll (a player deletes their own messages and images, as before). The server enforces it (`table_delete` refuses a roll unless the role is owner); the window offers **Delete** on a roll to an owner only.

## Decision (one log per table, 2026-10-23)

The maintainer, 2026-10-23: *"o chat deve ser 1 por mesa, adapte e refaça o que
precisar"*. As built until then, the Table's log (rolls, messages, images, pins,
who is at it, the limits) was one per **open server folder**: with the whole
folder open and two tables in subfolders, both tables' entries landed in one log
([0110](0110-a-table-is-a-campaign-folder.md) item 1 says a folder may have
several tables). It is now one per **table**.

- **A table's identity** is (server folder, the table's root inside it); the
  root is `""` for the folder itself. A server folder with no campaign table
  keeps the single, folder-wide table of this ADR's first form: everyone with the
  folder open shares one log; it is that folder's root table.
- **The contract.** Every `table_*` command takes an optional `table` (the
  table's root, relative to the folder). None named means the folder's default
  table — its shortest-rooted table, else the folder — so an old window keeps
  working. A name is checked: relative, no `..`, no backslash, and a real table of
  the folder (case folded, as the tables are looked up), or `""` in a folder with
  no table; anything else is refused ("no such table"). Entries, pins, deletes and
  clears are looked up **in the table named**, so an entry of one table is no
  entry of another. The answers and the events carry the table (`TableEntry.table`,
  `TableJoin.table`, `TablePinned`, `TableRemoved`, `TableCleared`, and the new
  `TableRoster { table, members }` of `table-roster`); a window hears only the
  tables it joined, and drops what is told of another.
- **Presence.** A window may be at several tables of a folder at once (the sync
  connection of a desktop is one window for all of that app's windows); the Mesa
  panel is at one: it leaves a table and joins the other when the active note
  moves to another table. A table's roster is its own.
- **Which table a roll goes to.** A roll or an oracle draw made in a note's room
  goes to the table that holds the note (the deepest); a note in no table goes to
  the folder's default table. A roll made from the panel goes to the panel's.
- **The window.** The panel follows the table of the active note (the chip's
  rule, `tableChip.ts`: the nearest table up the note's path), names it in its
  header (*Mesa: Cripta*), and with no note that says which, shows the last table
  chosen in the folder, or — the folder has several and none was chosen — a list
  of the tables. A small button beside the name switches to another table at any
  time. A folder with no table is the panel it always was. The panel is at one
  table at a time, so the unread count is that table's: what another table says
  is not heard until the panel is at it (chosen in the code, for the maintainer
  to confirm or change).
- **Limits and rules per table.** The ceiling of the log (`campaigns.log_max`)
  and the image limit (`image_max`) are the table's own; the delete and clear rules
  of the roles apply inside the table.
- **Players.** A player invited to a subfolder table is a window on a share rooted
  at that table, and gets that table's channel (and only that one): it reads,
  says and rolls there, and the owner reads the same log from the whole folder;
  it can neither read nor post to another table. A share that is no table still
  has none. See [0110](0110-a-table-is-a-campaign-folder.md) "As built (one chat
  per table, 2026-10-23)".
- **The synced folder** (item 9): the same per-table channel through the sync's
  link; the host remembers which table each window of the app is at and routes
  the server's events by the table they carry.
- **Migration.** Schema 16 adds the table to each entry: entries kept before it
  belong to the folder's shortest-rooted table when it has tables (the one whose
  numbers they always took), else to the folder. Nothing is deleted; the rest of
  the rules (a table made, unmade, renamed) are in
  [0110](0110-a-table-is-a-campaign-folder.md) "As built (one chat per table,
  2026-10-23)".

This **supersedes** the sentences above and in the "As built" sections that make
the log one per folder, and 0110's "the folder's shortest-rooted table gives the
folder's log its numbers" (each table has its own numbers now).

**Two small changes of the panel (2026-10-23, the maintainer).** "Roll dice…" (the roller's dialog) is an item of the dice row's "⋯" drawer again, after being left only in the command palette; and at narrow widths (a top row up to 420 px wide) "Hide from here back" is an icon-only button (its name and tooltip kept) so the roster, the Table window button, hide and the menu fit on one line at 260 px, the label showing when there is room.

## Status

**Accepted (2026-10-28).** The maintainer, 2026-10-28, asked what to do with
this ADR's `[PROPOSED]` items and the "Chosen in the code, for the maintainer
to confirm" lists, and answered *"Aceitar como construída"*: every item still
marked `[PROPOSED]` and every such list is accepted as built. The markers on
the Decision items were changed to `[DECIDED 2026-10-28 — accepted as built]`;
the lists in the "As built" sections and the dated sections are left as
written.

**Superseded within (kept as history, not deleted):**
- (a) Item 3, "A reader, who writes no file, sends no image": changed by this
  ADR's own amendment of 2026-10-24 (item 3, "Amendment: the game master lets a
  player send"), then by [0113](0113-one-access-model-for-a-table.md) (*Send
  files*, then K.6: the *Images* and *Files* rights).
- (b) The fixed 10 MB image limit and the 20,000-entry ceiling ("Chosen in the
  code" 1 and 3): now per-table settings, see "Limits and rules per table" in
  "Decision (one log per table, 2026-10-23)" and the "Revised (2026-10-22)"
  paragraph below.
- (c) Item 2, "the folder shares one table / one per folder": each table has its
  own log, see "Decision (one log per table, 2026-10-23)" and its closing
  paragraph ("This **supersedes** the sentences above and in the 'As built'
  sections that make the log one per folder").

*Superseded in part (2026-10-24) by [0113](0113-one-access-model-for-a-table.md):* the images right of item 3's
amendment is now *Send files*.

Accepted (2026-10-28); was Proposed (2026-10-21). Items 2, 3, 5, 7, 10 and 11 decided by the
maintainer on 2026-10-21 (`~/Projects/person/apps/verso-archive/decisoes-2026-10/verso-decisoes-0107-mesa-2026-10-21.md`,
outside the repository); the three questions those answers opened —
where an image goes (item 3), where the log is saved (item 5), deleting
one entry (item 6) — decided the same day as recommended. Items marked
`[PROPOSED]` stay the author's until accepted. Not built; the
maintainer asked for it "em algum momento" (at some point). Waits for a
reading by the other model.

Confirmed 2026-10-22 by the maintainer (MS.2): the pace (5 messages a second,
a burst of 20) and where images go (the folder's Obsidian attachments folder,
else `attachments/`, named `mesa-<datetime>-<id>`) stay as built (*"concordo
com o ritmo"*); the log ceiling and image size become per-table settings
([0110](0110-a-table-is-a-campaign-folder.md)).

*Revised (2026-10-22, [0110](0110-a-table-is-a-campaign-folder.md)):* the log's
ceiling (20,000 entries, "Chosen in the code" 1) and the image limit (10 MB)
are now **per table**, set by the table's game master within 1,000–200,000
entries and 1–30 MB, with these values as the defaults; the table's rows
follow the veil of 0110 for a reader (the note a roll was made in is not told
when hidden, a table image is seen by everyone at the table).

*Fixed (2026-10-23, real Mac app):* "eu cliquei numa rolagem e arrastei para uma nota, funcionou como deveria, mas ele selecionou o texto no chat e no verso". A pointer drag (item 5, "Levar uma rolagem para uma nota") now holds the selection while it runs: the text selected by the press is cleared, a new selection is refused (`selectstart`, and `user-select: none` on the window) until the drop, and selecting works again after it. The same day: "eu tive que trocar a aba da barra lateral pra conseguir redimensionar. aumenta um pouco a largura inicial dessa barra" — the right bar's divider no longer starts a text selection through the log (a press on it now holds the selection, as a roll's drag does, and the drag ends however the pointer goes), its width is now kept like the left bar's, and its default grows from 260 px to about 320 px (at most a third of the window); a remembered width wins.

**The panel's top in one row, a chime, and dice that keep the roller's colours (2026-10-23, second feedback round).** The maintainer tested the real apps. (1) With a screenshot of the Table's top: *"no topo do chat ta com espaço mal aproveitado, 3 elementos cada um numa linha sendo que cabe um na frente do outro."* The roster icon, the owner's **Open the Table window** button and **Hide from here back** with the "⋯" menu now share ONE row: the roster at the left, the window button beside it (its icon always, its words while the panel is wider than about 360 px, its accessible name always), hide and the menu pushed to the right; the row wraps at 260 px instead of overflowing. The **Make this folder a table** call to action keeps its own line below the row (it is a call to action, and shown once). (2) *"Mensagens no chat deveriam notificar de alguma forma, com som configurável."* Another person's message, image or roll plays a short sound in the window: **Settings › Notifications › Table sound** (Off, Soft, Bell, Pop; **Soft by default** — messages from people are what the sound is for, and it is never played without a gesture having let the page use audio) and a **volume** (0-100, default 60); choosing a sound plays it once. The sounds are synthesised with WebAudio from a few notes (no file, no dependency). Decided and kept in `table/chime.ts`: never for one's own entries or a masked secret roll; not while the person is typing in the Table's box with the window in front; a roll whose 3D dice fall is not chimed (the dice have their own sound switch); whether the window is in front does not matter, since the system notification of item 9 of [0084](0084-notifications-in-the-window.md) is the one that waits for the window to be behind and stays as it was. It uses the dice sound's audio context (made inside a gesture; with no running context there is no sound, never a late one). (3) With a screenshot: *"meu dado ta configurado roxo, pq no bruno ta vermelho?"* The game master's dice fell violet on the Mac and red in the player's Windows window. Root cause: the default style and the "Do Verso" preset are `app: true`, which means *the three colours follow the app's palette at roll time*; the flag was sent to the server with the roll, and the hearing window resolved it in **its own** theme (`--seal`), so each viewer drew the dice in the colour of their own app, not the roller's (the server and the hearing side were relaying the look correctly; the look itself was not a colour). The window now turns a followed palette into the colours of the roller's theme before a roll goes out (`wireStyles`, used by the note room's `collab_roll` and by the table's join, roll and look), so item 11 holds for every look, and a style with its own colours was never affected. A viewer's own dice still follow their theme; there is no option to force one's own look on others' rolls (the existing switch only turns others' 3D falls off). No contract change.

*Fixed (2026-10-24, live test server):* "made by me" is per window, "You" per account. The same account on two devices (the game master on the phone and on the Mac) did not hear each other: the window took every entry of its account for its own, so another device's roll did not fall in 3D, did not sound, did not count as unread and did not notify. Now a window treats as news (items 11 and 13, and the sound and notification rules) any live entry it did not make itself, its own account's included; what it made itself is known by the answers of its own say, roll and image commands, and, for a roll or oracle draw made from a note's room (whose answer carries no table id and which the server also appends to the table), by matching the table's entry on kind, notation and total (or the draw's kind and roll) for a few seconds around the answer; an entry held for a command that never answers is released as news after 3 s. The entry is still labelled *You*. This changes the wording of "others' rolls" in item 11 to "rolls not made in this window".
