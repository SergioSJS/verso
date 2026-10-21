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
   it was rolled from as a link. Plus typed messages, if item 3 says so.

2. **What a table is.** `[OPEN]` Who is "connected together":
   - **A — The folder.** Everyone who has the same UniVerso folder open,
     in any note, shares one table. A campaign is a folder; a roll in any
     of its notes reaches the table. _(recommended)_
   - **B — The note.** The table is the note's room, as today; the panel
     only shows what 0088 already relays.
   - **C — A named table by link,** as in Rolai: someone opens a table,
     shares a link, and whoever joins sees it, whatever note they are in.

   With A, a roll in a note room is relayed to the note's room (as today)
   **and** to the folder's table; the server rolls once.

3. **Messages, not only rolls.** `[OPEN]`
   - **A — Rolls and short typed messages.** Plain text, no Markdown, no
     HTML, no images; a link to a note of the folder is shown as a link.
     _(recommended)_
   - **B — Rolls only,** a log with no input.

4. **Rolling from the table.** `[PROPOSED]` The table's input rolls when
   the text is a dice notation after `/r` (`/r 1d20+3`), or from a dice
   button beside it, through the same command as a note's roll, so the
   server draws the number (0088 item 4). A random table or an oracle is
   rolled from its note, not from the table.

5. **What is kept, and where.** `[OPEN]` 0088 item 4 decided that a room
   keeps its last rolls in memory and nothing is stored. A table may need
   more; any option but A revises 0088 item 4.
   - **A — Memory only, as 0088.** The server keeps the last 200 entries
     per table while it runs; a restart forgets them. A button
     **"Copiar para uma nota"** / **"Copy to a note"** writes what the
     panel shows into a new note of the folder, by the user's action, as
     any new note is written. _(recommended)_
   - **B — The server's database,** per folder, with a retention like the
     audit log's ([0083](0083-security-hardening-of-universo.md) item 10).
   - **C — A session note,** appended to on every entry. Discouraged by
     the author: it writes a file of the folder on behalf of everyone
     present, every few seconds, which is neither a user's action
     ([0012](0012-files-are-source-of-truth.md); invariant 8) nor a
     single writer.

6. **Clearing.** `[PROPOSED]` As Rolai: **"Ocultar daqui pra trás"** /
   **"Hide up to here"** hides the log in your window only, can be undone,
   and is cut at the server's time of the last entry shown, never the
   local clock; **"Limpar a mesa"** / **"Clear the table"** empties it for
   everyone, asks first, and is the folder owner's only.

7. **Secret rolls.** `[OPEN]` A roll seen only by its roller and the game
   master.
   - **A — Later, in its own ADR.** It needs a "game master" that Verso's
     roles (owner, editor, reader — 0081) do not have. _(recommended)_
   - **B — Now, to the folder's owners:** "roll to the owner" shows the
     roll to the roller and the folder's owners; the others see "Ana rolou
     em segredo".

8. **Who is at the table.** `[PROPOSED]` The panel's top shows who is
   there now (names stamped by the server, the same colours as their
   cursors). A reader of the folder is at the table and may roll, as 0088
   decided for a note (D2–D11); whether a reader may also write messages
   is item 3's, and the author recommends yes.

9. **Where the table exists.** `[PROPOSED]` On a UniVerso folder, in the
   browser and in the desktop app connected to it; in a synced folder
   while the server is reachable, as a note joins its room under
   [0082](0082-live-co-editing-of-a-synced-folder.md); on a desktop
   serving its folder ([0096](0096-this-app-is-a-server.md)), the desktop
   is the server and holds the table. In a folder of the computer, alone,
   the panel shows your own rolls of this run, as Rolai's local history,
   and says it is not shared.

10. **Where the panel goes.** `[OPEN]`
    - **A — A panel of the side area,** like Backlinks or Outline, which
      the user may move as any panel; on the phone, a sheet from the
      bottom. _(recommended)_
    - **B — A bar along the bottom** of the window, always visible when
      on.
    - **C — A floating drawer** over the note.

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

    `[OPEN]` Whether others' rolls also **fall in 3D** on your screen
    when your 3D dice are on:
    - **A — Yes, in the roller's appearance,** with a switch "Mostrar em
      3D as rolagens dos outros" / "Show others' rolls in 3D", on.
      _(recommended, after the maintainer's words above)_
    - **B — Only your own rolls fall in 3D;** others' are drawn in the
      roller's colours in the log only.

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
- If item 5 is not A, 0088 item 4 is revised in the same pull request.
- Nothing is written to a file of the folder except by "Copy to a note".

## Discarded alternatives

None recorded. The options of items 2, 3, 5, 7, 10 and 11 are open, not
discarded.

## Status

Proposed (2026-10-21). Not built. Waits for the maintainer's answers to
items 2, 3, 5, 7, 10 and 11 and a reading by the other model.
