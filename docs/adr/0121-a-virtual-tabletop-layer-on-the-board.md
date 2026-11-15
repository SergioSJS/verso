# ADR 0121 — A virtual tabletop layer on the board: grid, tokens, walls, fog and vision, initiative

- Date: 2026-11-15
- Source: the maintainer, 2026-11-15: *"olhar a extensão Atlas VTT (plugin do
  Obsidian), o estado atual dela, para puxar as features como inspiração. Eu
  lembro que a gente tinha mapeado algumas: mapas com paredes, controle de
  tokens, grid de movimento em hexágono ou quadrado, visão dos tokens, fog of
  war, esse tipo de coisa, para fazer depois — mas não está no nosso roadmap,
  não entendi por quê"*. The survey of that day:
  [`docs/reference/atlas-vtt-survey-2026-11-15.md`](../reference/atlas-vtt-survey-2026-11-15.md)
  (Atlas VTT 0.16.0). Written by Opus 5.5; to be read by the other model
  before acceptance ([0032](0032-author-and-reviewer-roles.md)).
- Status in the briefing: not present.
- Builds on: [0057](0057-board-json-canvas.md) (the board),
  [0090](0090-maps-on-the-board.md) (maps, pins, `secret`, tiles),
  [0120](0120-maps-from-watabous-generators.md) (`verso.walls`, the hex board
  "later"), [0107](0107-the-table-a-shared-roll-and-chat-log.md),
  [0110](0110-a-table-is-a-campaign-folder.md) (item 16: "initiative tracker,
  fog of war on maps … each in its own ADR when asked for"),
  [0113](0113-one-access-model-for-a-table.md) (section H, the per-account
  shadow of a board's room), [0099](0099-visual-markdown-statblocks-and-cards.md)
  (trackers), [0117](0117-this-app-is-a-universo-server.md),
  [0012](0012-files-are-source-of-truth.md), [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md), [0083](0083-security-hardening-of-universo.md).

## Context

**Why it was not on the roadmap.** Each time it came up it was written as
"later" inside another ADR, and "later" items get no roadmap row:
[0090](0090-maps-on-the-board.md) Consequences (*fog of war, tokens and
combat … are not in this ADR*, 2026-10-14); [0110](0110-a-table-is-a-campaign-folder.md)
item 16 (*later, not now … each in its own ADR when asked for*, accepted as
built 2026-10-28); [0120](0120-maps-from-watabous-generators.md) items 3 and
11 (walls stored "though nothing reads them yet; the table's vision and fog
come later"; the region's hex board later). The notes of the first Atlas
reading (2026-10-14) lived in a scratchpad and were lost; the survey is now a
reference file.

**Atlas VTT** (`atlas-vtt/atlas-vtt`, **AGPL-3.0-only**; Verso is MPL-2.0,
[0005](0005-license.md)) is a desktop-only Obsidian plugin, 0.16.0 on
2026-11-14, 33 releases in eight weeks. It is inspiration only: its code is
never copied or paraphrased (as [0090](0090-maps-on-the-board.md) decided). How
it solves the five things asked for, in one line each (detail in the survey):

| Asked for | Atlas VTT |
|---|---|
| Grid, hex or square | square / hex pointy / hex flat per scene, auto-detected from the picture or aligned by clicks; units, diagonals, cell numbers, a note per hex |
| Token control | GM assigns tokens to players; players move only theirs, optionally only on their turn; the GM's side refuses a move through a wall |
| Walls | segments with kinds (sight, light, movement only, limited, one-way), doors open/closed/locked/secret, rooms placed at once |
| Token vision | per token a switch, range, angle, senses (darkvision…); the players' picture is the **shared sight of every visible vision token**; explored areas remembered as a PNG mask |
| Fog of war | GM-painted operations (brush, rectangle, polygon, lasso, cells, room-from-walls) replayed in order, stored in the scene file; things under fog hidden from players |

Two facts shape what Verso can take. **Where Atlas computes sight**: the GM's
computer decides what is sent, but a player's page is sent the walls, the
vision tokens (positions of unseen ones that see or shine included) and the
fog operations, and draws sight itself; the map picture reaches the player
whole, hidden only on screen. A leak through a second path was reported
(issue #640: the world-map view showed a fogged map whole). Verso's rule is
stricter: a player is never served what is not theirs, on every path
([0110](0110-a-table-is-a-campaign-folder.md) item 18; a visibility leak is
blocking). **What Verso already has**: a map is a board; `secret` on any node
is left out by the server; a player who edits a board joins a shadow of its
room made of what the account sees, and the server refuses edits to what they
do not see (`board_sight.rs`, 0113 H); `verso.walls` exist for Watabou
dungeons; presence carries pointers and a laser; trackers hold HP in notes;
the Table has rolls, a log in the server's database, and its members. The full
mapping is the survey's last table.

## Decision

**Proposed (2026-11-15).** Nothing here is decided; every real choice is an
`[OPEN]` with a recommendation.

1. **A VTT layer on the board, no new file type.** A map stays a board
   (0090 item 1). Everything the layer adds is a field under the top-level
   `verso` key or a node's `verso` key, on node types Obsidian knows, so
   Obsidian keeps opening the board (O4 re-observed on the version of the day).
2. **Grid per board.** `verso.grid`: `type` (`square`, `hex-pointy`,
   `hex-flat`), `size` (board units per cell), `origin`, `unit` and `distance`
   per cell, `diagonals` (square: `5-10-5`, `equal`, `euclid`), `numbers`
   (hex `0101`, square `A1`, off). Aligned by clicking two corners of one cell
   on the map (auto-detection later, if asked). Drawn by Verso under
   Excalidraw's canvas, as the map tiles are (0090 item 4). Tokens, pins and the
   ruler snap to cells. A pin can stand for a hex (hexcrawl, 0120 item 11).
3. **Ruler.** Measure in the grid's units around corners, shared live as a
   presence (as the laser is), never written; kept measurements and area
   templates (line, cone, circle) later, as drawn elements.
4. **Tokens.** `[OPEN] Q2` what a token is. Recommended: **a file card for a
   note** (a character, a creature, a typed note) marked
   `"verso": {"token": {"size": 1}}`, drawn round with the note's picture
   (its `image` property or sticker), its size in cells, snapped to cell
   centres; the HP (or any) tracker of the note's statblock as a bar, a click
   on it editing the note's tracker (0099 item 5, invariant 8). Several tokens
   may name one note (goblin 1, 2, 3 numbered). In Obsidian it is a file card.
   Hidden token = `secret` (exists).
5. **Who moves a token.** `[OPEN] Q3`. Recommended: **the account that may
   edit the token's note** (the character sheet granted to its player, 0110
   item 12 as amended; 0113 grants) — no owner field and no new store, one
   access model. On a board with a grid, a player moves only their tokens
   (and draws only if the board allows); the server judges it in
   `board_sight::check`. `[OPEN] Q3b`: an option "only on their turn"
   (recommended, off by default). A player's drag is a presence; the drop is
   the edit the server accepts or refuses.
6. **Readers follow the board live.** `[OPEN] Q8`. Today a player who only
   *sees* a board follows the saved file (0090 revised 2026-10-15).
   Recommended: a read-only shadow room for them (0113 H's shadow, every edit
   refused), or tokens would jump only on save.
7. **Walls and doors.** Generalise `verso.walls` (0120's format, versioned):
   segments drawn with a wall tool, joined at ends; per wall `blocks`
   (`sight+light`, `sight`, `light`, `move`); doors with `open`, `locked`,
   `secret`; anchored to the map's group so moving the map moves them (0120
   noted they do not today). Walls block a player's token on a move (server
   check, pure geometry). Imports fill them: Watabou (exists) and **Universal
   VTT** (`.dd2vtt`, `.uvtt`, `.df2vtt`; `[OPEN] Q11`, recommended; the
   format's terms checked first).
8. **Manual fog.** The game master covers and reveals with rectangle, polygon,
   brush and cells (room-from-walls once walls exist), "cover all", "reveal
   all"; half-transparent to the game master, solid to players, "view as a
   player" (0110 item 13). An element whose box lies wholly under fog is
   **Gone** for a player (0113 H's projection): cards, pins, tokens, drawn
   elements, edges to them — on every path (file bytes, room, history 0091,
   export 0090 item 6, search, backlinks, presence selection).
   `[OPEN] Q4` where fog lives. Recommended: **painted fog in the board**
   (`verso.fog`, ordered paint/erase shapes: the game master's preparation,
   kept with the map, in its history; Obsidian ignores it) and **what was
   explored per table in the server's database** (session state that changes
   on every move, as the Table's log is, 0107 item 5 option A; never a file
   rewritten every few seconds, 0012).
9. **The map picture under fog.** `[OPEN] Q6`. (a) Served whole, fog drawn on
   screen (Atlas's way; a player's device holds the unexplored art).
   (b) **Recommended**: while a board has fog, a player is served the map
   only as tiles, and tiles wholly under fog are not served; the picture file
   itself is hidden from players while it is a fogged map; tiling then covers
   JPEG and WebP too (0090 tiles PNG only). (a) is a visibility leak by
   Verso's rule; (b) is the cost of keeping it.
10. **Token vision.** Per token `vision` (`range` in units or unlimited,
    `angle`); walls stop it. `[OPEN] Q5` where sight is computed.
    Recommended: **on the server**, a pure function in `verso-core` (no IO;
    the same code in the app-as-server, 0117), on drop, not during a drag; the
    player's shadow receives only the elements in sight or explored and the
    sight outline to draw; nothing unseen is sent (Atlas sends walls and
    unseen vision tokens to the page). `[OPEN] Q7` whose sight: recommended
    **each player's own tokens**, with a board switch "the party shares
    sight". The game master sees all, with the players' sight outlined.
11. **Dynamic lighting** (light sources, darkness, darkvision, time of day):
    `[OPEN] Q10`, recommended **not planned** until vision is used at the
    table and asked for again.
12. **Initiative in the Table panel.** A tracker per table: entries from the
    tokens of the board shown (or notes with no token), roll with the dice of
    0088 (`init` of the statblock as modifier), sort, rounds, turns, delay;
    the turn change written to the log; players see the order without secret
    tokens (the server filters). `[OPEN] Q9`: recommended state in the server's
    database per table, as the log (0107 item 5 A); "Add to note" for a record.
13. **A player window.** On the desktop, a second window showing a board as a
    chosen player (or "the table") sees it, full screen on a TV, the camera
    following the game master's or paused: built on "see as player" (0110
    item 13).
14. **Accessibility and languages** (0035): tokens listed in the side panel as
    the pins are (0090 item 7), each named after its note, moved by the arrow
    keys one cell at a time; the turn announced politely; fog and sight with a
    text equivalent for the game master ("3 areas hidden"); every control
    reachable at 390×844 and in landscape (the phone is the game master's
    device too); pt-BR and English.
15. **Not taken now** (listed so they are not lost): levels and roofs,
    animated maps, a dungeon generator of our own (Watabou covers it, 0120),
    TrueScale, spell-effect animations, auras, encounters, game-system presets
    beyond 0015, sound moods (0116's later items). Each needs its own request.

**Order and size** (S days, M about a week, L two to three weeks, XL more):

| # | Step | Size | Needs |
|---|---|---|---|
| T1 | Grid per board, square and hex, alignment, snap, numbers | M | — |
| T2 | Ruler in units, live | S | T1 |
| T3 | Tokens as note cards, size, snap, tracker bar | M | T1 |
| T4 | Hide a drawn element from players (`secret` on drawn elements) | S | — |
| T5 | Initiative tracker in the Table panel | M | — (T3 for the board link) |
| T6 | Universal VTT import into a board with walls | S–M | T1, Q11 |
| T7 | Readers in a read-only shadow; players move only their tokens; walls block moves | M–L | T3, Q3, Q8 |
| T8 | Manual fog: painting, projection on every path, tiles withheld | L | T7, Q4, Q6 |
| T9 | Wall and door editor; token vision on the server; explored memory | L–XL | T7, T8, Q5, Q7 |
| T10 | Player window | S–M | 0110 item 13 (V.43) |

T1–T6 are the small wins (each useful alone, no secrecy risk beyond T4's,
which reuses the projection); T7–T9 are the big block, in that order because
each one's secrecy rests on the one before.

`[OPEN] Q1` **when**. Recommended: **after V1**, as its own phase, T1–T5 first;
V1 already carries its blockers and V.43, of which T10 depends.

## Consequences

- Spec §5.11 gains `grid`, `token`, `fog`, the wider `walls` and `vision`, with
  the core's property tests as the guardrail (a canvas has no dialect fixture,
  spec v0.43); Obsidian's keeping of the fields observed again.
- Contract: initiative commands, fog's explored state, a token's sight in the
  shadow; server first, then apps (contract-change rule). Bindings generated.
- Server: `board_sight` learns fog and sight; a property test with canaries
  under fog and out of sight, on every read path (as `board_sight_tests.rs`);
  bounds per [0083](0083-security-hardening-of-universo.md) (walls, fog
  shapes, tokens per board; sight on drop) measured on the 1-core 1 GB VM.
- Risks: drawing grid, fog and sight over Excalidraw on a phone (one canvas in
  the card layer, redrawn on camera change, measured on the maintainer's
  phone); drag traffic through the room (presence during the drag, one edit on
  drop); the game master's own phone as the host (0118) for sight compute.
- Each step: strings in both languages, changelog, a lesson in the demo
  vaults' board training, walkthrough steps, e2e in the harness and
  `e2e-server` (CLAUDE.md §5).

## Discarded alternatives

- **A scene file of Verso's own** (Atlas's `.atlasmap`): Obsidian would not
  open it and a board already is the scene (0090 item 1).
- **Atlas VTT's code, or Atlas run inside Verso**: AGPL-3.0, and third-party
  plugin execution is out of scope until after V1 (invariant 16).

## Status

**Proposed (2026-11-15).** For the maintainer, each with a recommendation in
the Decision: Q1 when; Q2 what a token is; Q3 who moves it (Q3b turn only);
Q4 where fog lives; Q5 where sight is computed; Q6 the picture under fog;
Q7 whose sight; Q8 readers live; Q9 where initiative lives; Q10 lighting;
Q11 Universal VTT. Roadmap: After V1, item 11 (proposed rows T1–T10).
