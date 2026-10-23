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

Status **Proposed**. Items marked `[OPEN]` are the maintainer's; items
marked `[PROPOSED]` are the author's recommendation, not decided.

1. **The table.** `[PROPOSED]` A panel named **Mesa** / **Table** shows
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

4. **Rolling from the table.** `[PROPOSED]` The table's input rolls when
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

6. **Clearing.** `[PROPOSED]` As Rolai: **"Ocultar daqui pra trás"** /
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

8. **Who is at the table.** `[PROPOSED]` The panel's top shows who is
   there now (names stamped by the server, the same colours as their
   cursors). A reader of the folder is at the table and may roll, as 0088
   decided for a note (D2–D11), and may write messages (the author's
   recommendation; item 3 decided messages, not who writes them).

9. **Where the table exists.** `[PROPOSED]` On a UniVerso folder, in the
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
    `[PROPOSED]` A message is at most 500 characters and plain text; the
    server refuses anything longer before it is relayed; messages are
    paced per connection like the REST routes (a burst, then 429-like
    refusal); the log held per table and per window is bounded; the
    window draws a message as text, never as HTML. A message is never
    written to the server's log.

13. **Notifications** ([0084](0084-notifications-in-the-window.md)).
    `[PROPOSED]` With the panel closed, its button shows a count of
    unseen entries. A new kind, **"Mesa"** / **"Table"**, sends an
    operating-system notification for a message or roll by someone
    else, off by default.

14. **A feature switch** ([0103](0103-feature-presets-and-capability-flags.md)).
    `[PROPOSED]` "Mesa" / "Table" in the RPG and tabletop group of
    Settings › Features, on by default where dice are on. Off: no panel,
    no button; rolls in notes behave as today.

15. **Contract and tests.** `[PROPOSED]` New commands (join a table,
    say, clear) and events (an entry, a roster change, a clear) defined
    in Rust and generated for the window (invariant 3); the window reaches
    the table only through them (rule 1). Tests: the server relays one
    roll to both the note's room and the folder's table, rolled once; a
    message past the bound is refused unparsed; a reader may roll; only
    an owner clears; the cut of "hide up to here" uses the server's time;
    an end-to-end test with two windows in the browser harness.

16. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)).
    `[PROPOSED]` The log is a list with a polite live region; an entry by
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
  and the window shows its own rolls. A synced folder's table (item 9) is not
  built: its windows reach the local stubs, which refuse. A desktop serving its
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

## Status

Proposed (2026-10-21). Items 2, 3, 5, 7, 10 and 11 decided by the
maintainer on 2026-10-21 (`~/Projects/person/apps/verso-decisoes-0107-mesa-2026-10-21.md`,
outside the repository); the three questions those answers opened —
where an image goes (item 3), where the log is saved (item 5), deleting
one entry (item 6) — decided the same day as recommended. Items marked
`[PROPOSED]` stay the author's until accepted. Not built; the
maintainer asked for it "em algum momento" (at some point). Waits for a
reading by the other model.
