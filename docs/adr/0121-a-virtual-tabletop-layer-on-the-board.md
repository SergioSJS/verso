# ADR 0121 — A virtual tabletop layer on the board: scenes, grid, tokens, walls, fog and vision, initiative

- Date: 2026-11-15; revised in place the same day (unfinished, Proposed:
  rewritten, not superseded) after the reading
  [`docs/review/2026-11-15-adr-0121-review.md`](../review/2026-11-15-adr-0121-review.md)
  (7 BLOCKING, 12 IMPORTANT, 9 MINOR) and the maintainer's framing of the
  same day (Q0). Where each finding is answered: "Revision of 2026-11-15" at
  the end.
- Source: the maintainer, 2026-11-15: *"olhar a extensão Atlas VTT (plugin do
  Obsidian), o estado atual dela, para puxar as features como inspiração. Eu
  lembro que a gente tinha mapeado algumas: mapas com paredes, controle de
  tokens, grid de movimento em hexágono ou quadrado, visão dos tokens, fog of
  war, esse tipo de coisa, para fazer depois — mas não está no nosso roadmap,
  não entendi por quê"*. The survey of that day:
  [`docs/reference/atlas-vtt-survey-2026-11-15.md`](../reference/atlas-vtt-survey-2026-11-15.md)
  (Atlas VTT 0.16.0). Then, after the first draft (as relayed by the
  coordinating session, in English): *"for RPG maps maybe we need two
  strategies: either a new scene format separate from the board, or, inside
  the board, an element with fog — everything inside it gets the fog, and the
  tokens show inside that element. That element would be the scene. Either a
  scene component, or a new format for scenes that need these controls."*
  Written by Opus 5.5; read by a Fable session (the review above); to be read
  again before acceptance ([0032](0032-author-and-reviewer-roles.md)).
- Status in the briefing: not present.
- Builds on: [0057](0057-board-json-canvas.md) (the board),
  [0090](0090-maps-on-the-board.md) (maps, pins, `secret`, tiles),
  [0120](0120-maps-from-watabous-generators.md) (`verso.walls`, one frame per
  floor, the hex board "later"), [0107](0107-the-table-a-shared-roll-and-chat-log.md)
  (the log, secret rolls), [0110](0110-a-table-is-a-campaign-folder.md)
  (item 16: "initiative tracker, fog of war on maps … each in its own ADR when
  asked for"; item 18: every read path filtered),
  [0113](0113-one-access-model-for-a-table.md) (section B's one table, H the
  per-account shadow of a board's room, K.6 what *Edits* covers),
  [0099](0099-visual-markdown-statblocks-and-cards.md) (trackers),
  [0117](0117-this-app-is-a-universo-server.md),
  [0011](0011-config-outside-tree-index-as-cache.md),
  [0012](0012-files-are-source-of-truth.md), [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md), [0036](0036-tabletop-rpg-support.md)
  (0036.b viewports after V1), [0083](0083-security-hardening-of-universo.md).

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
2026-11-14, 33 releases in eight weeks. It is inspiration only (item 17
fences it). How it solves the five things asked for, in one line each
(detail in the survey):

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
blocking). **What Verso already has**: a map is a board (0090 item 1); a
Watabou building is written as one frame — the canvas's `group` node — per
floor (0120); `secret` on any node is left out by the server; a player who
edits a board joins a shadow of its room made of what the account sees, and
the server refuses edits to what they do not see (`board_sight.rs`, 0113 H);
`verso.walls` exist for Watabou dungeons; presence carries pointers and a
laser, cut per player to an allowlist (0113 S7); trackers hold HP in notes;
the Table has rolls, secret rolls, a log in the server's database, and its
members. The full mapping is the survey's last table.

**A leak that exists today, found by the review (B1, "a fact for the
maintainer").** The projection (`board_sight::shape_canvas_seen`) filters
`nodes`, `edges` and `verso.drawing` and serves every other key under the
top-level `verso` as it is; so `verso.walls`, with Watabou's secret-door
kinds, reaches every player of a table today (0120 as built; the drawing
also shows a secret door as a dashed line to everyone). It is **being fixed
on 2026-11-15** by another session, in the code, by turning the projection's
top-level keys into an **allowlist**. This ADR builds on that allowlist
(item 1); it does not decide the fix, which is the code's and the
maintainer's.

## Decision

**Proposed (2026-11-15).** Nothing here is decided. Every real choice is an
`[OPEN]` question with a recommendation (Q0–Q20, listed in Status).
**Accepting the questions "as recommended" accepts no other sentence**: the
items marked `[PROPOSED]` are the author's design (field names, wall kinds,
tools, the ruler, the tracker's details, the bounds' figures); each is
confirmed in the PR of its step, as 0110 did for its phase 2.

### Q0. What a scene is — the central structural question

`[OPEN] Q0`. The fog, the grid, the walls and the tokens need a *place*: a
region whose contents follow one fog and one sight. Three shapes were
considered; the first two are the maintainer's, the third is this ADR's
first draft.

- **(a) A scene element inside the board.** A scene is a JSON Canvas
  `group` node carrying `verso.scene` (its grid, its fog, its walls, its
  vision settings), with every coordinate **relative to the group's box**.
  Everything whose box lies inside the group's bounds belongs to the scene
  and follows its fog and sight (the edge rule is Q13); everything outside
  any scene keeps today's board rules. A board may hold several scenes (each
  floor of a Watabou building is already one group, 0120). Play has **its own
  screen**: "Open the scene", a focused renderer of the scene's map, tokens,
  fog and sight — no Excalidraw editing, light enough for a phone and a TV —
  reading the same projected data as the board.
- **(b) A scene file of its own.** A new file type (name and extension
  `[OPEN]`) holding a map picture reference, grid, walls, fog and tokens, with
  a renderer made for it from the start.
- **(c) The whole board is the scene** (the first draft). Top-level
  `verso.grid`, `verso.fog`, `verso.walls`: one scene per board, in board
  coordinates.

| | (a) scene element + play view | (b) scene file | (c) board-wide layer |
|---|---|---|---|
| Reuse of the board's pictures, cards, pins (0090), handouts, drawings | as they are, inside the group | linked or copied in; pins and cards learn a second home | as they are |
| Watabou (0120) | each floor's frame becomes a scene by adding `verso.scene`; 0120 item 3's top-level `walls` move into the scene (an amendment to 0120, recorded) | the import writes a scene file (or both) | as built today, one map per board only |
| Live room, shadow, history (0091), export, sync, share | the board's, as they are (0113 H) | each path learns a new file type; a new room kind merging by element | the board's |
| Obsidian opens the file | yes: a group with its children; `verso` keys ignored (O4 to re-observe) | **no**: an unknown file to Obsidian; contradicts 0090 item 1 *"a map is a board"* (an amendment, recorded) | yes |
| Secrecy model | the same server-side projection, plus a geometric rule per scene | the same server-side projection; the schema is Verso's own, so its allowlist is exhaustive by construction | the same projection; board coordinates (the anchoring problem, I8) |
| Phone performance | editing on the board stays heavy (today's risk); **playing** in the focused view is light | lightest: no Excalidraw at all | heavy: play happens on the full board |
| Complexity | geometry inside groups in the projection; two renderers over the same data must agree | a file type end to end (core, contract, fs, sync, index, room, view, spec, lesson); the largest first step | smallest storage; one map per board; a building with floors cannot have one fog per floor |
| Room for later (floors, heavy dynamic light, animation) | floors as several scenes; heavy light and animation fit a board badly | room for all of it | none |

**Recommendation (the coordinator's, which the maintainer has seen): (a).**
A scene is a `group` node carrying `verso.scene` (grid, fog, walls, anchored
to the scene and its map); everything inside its bounds follows the scene's
fog and sight; several scenes per board; and a dedicated play view ("Open
the scene") for phone and TV, so **the data stays in the board while play
has its own screen**. A separate scene file (b) remains the fallback if
scenes later need what a board holds badly (floors with heavy dynamic light,
animation). (c) is not recommended: one map per board, and secrecy resting
on board coordinates that move without it.

Rules that follow from (a), part of Q0's recommendation:

- The scene node and its `verso.scene` are the game master's: a player's
  edit to the scene node (moving, resizing, ungrouping, writing its keys) is
  refused by `board_sight::check`, whatever their right on the board.
- **Fail closed on drift** (I8): the scene records the box its fog and walls
  were made on; if the group's box no longer matches (resized in Obsidian, by
  another program, by a merge), or a scene the server's record knows as
  fogged has lost its `fog` key, a player is served the scene **fully
  covered** and the game master is told. Moving the group moves its contents
  with it in Verso and in Obsidian; the fog, relative to the group, follows.
  Observation for the step: move and resize a scene in Obsidian, reopen in
  Verso.

Under (b) the items below hold with "the scene file" for "the scene node";
under (c), with "the board". Which steps change under each option is in the
table at the end.

### The items

1. **Storage, and the projection as an allowlist** (B1). A map stays a board
   under Q0 (a). Everything the layer adds is a field under a node's `verso`
   key (the scene's, a token's) or under the top-level `verso` key, on node
   types Obsidian knows. **Rule, valid from the first step that writes any of
   these fields: no key of this layer is served to anyone but the game
   master on any path, except as the table says; the projection is an
   allowlist of keys, not a denylist.** It extends the top-level allowlist
   being added on 2026-11-15 (Context) to **the `verso` key of nodes**: today
   an Open node is served whole, so a scene group served Open would carry its
   fog and walls with it. What a player is given instead:

   | Key | A player is served |
   |---|---|
   | `verso.scene.grid` | whole |
   | `verso.scene.walls` (and 0120's top-level `walls`) | nothing (a move check, item 7, never sends them) |
   | `verso.scene.fog` | the present covered area as one merged outline, never the shapes, their order or their history |
   | `verso.scene.vision`, explored state | only the player's own sight outline and explored area |
   | `verso.token` | the public face (Q12) of a token they see; nothing else |
   | any key the projection does not know | nothing |

   The allowlist, with its canary test, is step **T0**, before any step
   writes walls, fog or tokens.

2. **Grid per scene.** `[PROPOSED]` `verso.scene.grid`: `type` (`square`,
   `hex-pointy`, `hex-flat`), `size` (board units per cell), `origin`
   (relative to the scene), `unit` and `distance` per cell, `diagonals`
   (square: `5-10-5`, `equal`, `euclid`), `numbers` (hex `0101`, square
   `A1`, off). Aligned by clicking two corners of one cell on the map
   (auto-detection later, if asked). Drawn by Verso under Excalidraw's
   canvas, as the map tiles are (0090 item 4). Inside a scene with a grid,
   Excalidraw's own grid mode (`gridModeEnabled`) is turned off and snapping
   follows Verso's grid, so two grids are never shown (M4). Tokens, pins and
   the ruler snap to cells. A pin can stand for a hex (hexcrawl, 0120
   item 11).

3. **Ruler.** `[PROPOSED]` Measure in the grid's units around corners,
   shared live as a presence (as the laser is), never written; kept
   measurements and area templates (line, cone, circle) later, as drawn
   elements. Relayed to an account only under Q14's rule.

4. **Tokens.** `[OPEN] Q2` what a token is. Recommended: **a file card for a
   note** (a character, a creature, a typed note) inside a scene, marked
   `"verso": {"token": {"size": 1}}`, drawn round, its size in cells, snapped
   to cell centres. In Obsidian it is a file card. Several tokens may name
   one note.
   `[OPEN] Q12` **what a player sees of a token whose note they do not see**
   (B5). By 0113 H a card of a hidden file is Locked — no name, no picture,
   no colour — so the token would be a grey box, or else it would serve parts
   of a hidden note (a new exception to 0110 item 18 nobody decided).
   Recommended:
   - The token carries its **own public face** in the board:
     `verso.token.name` and `verso.token.image` (a picture file whose access
     is its own), both optional, set by the game master. A player is served
     only that face, as a marker with the token's id (as 0113 H's locked
     marker keeps the id) — never the note's path, name, picture or text.
   - A token of a hidden note **with no public face is Gone** for a player,
     not Locked (a Locked marker still says *"its place and its size"*).
     "Hidden token" is then two cases: no face, or `secret` (which exists).
   - **The bar**: the note's tracker (HP or any, 0099 item 5) is drawn as a
     bar for those who see the note; for a player who does not, only if the
     game master switches it on per token (off by default), and then as a
     coarse state of four steps (unhurt, hurt, badly hurt, down), never the
     number. The bar has a text value (item 16).
   - **Numbering** (goblin 1, 2, 3) is computed per viewer over the tokens
     that viewer sees, never a count that includes hidden ones; the game
     master sees both ("Goblin 3 · players: Goblin 2"). (Alternative: a
     number stored per token at placement, by the game master.)
   - A click on the bar edits the note's tracker (0099 item 5) with the
     concurrency check of invariant 11; the write is refused for an account
     without *Edits* on the note (M7).

5. **Who moves a token.** `[OPEN] Q3`. Recommended: **the account that may
   edit the token's note** (the character sheet granted to its player, 0110
   item 12 as amended; 0113 grants), with no owner field and no new store —
   **as an amendment to 0113 section B**, not a use of it (I2): a new action
   `MoveToken` with its row in the one table, answered by `may()`, shown in
   the Access dialog. Two players who both edit a note both move its tokens;
   a device with a capped role (a paired phone, 0117) counts as its capped
   role, never as the owner.
   **Contradiction with an accepted decision, for the maintainer** (not
   resolved here): 0113 K.6 says *Edits* on a file covers *"the whole file
   but its deletion"*. Inside a scene, either (i) *Edits* on the board keeps
   K.6's meaning — a player with *Edits* moves every token — or (ii) inside a
   scene *Edits* is narrowed to their own tokens and drawing, an amendment to
   K.6 shown in the Access dialog. And a player with only *Sees* on the board
   who moves their token **writes the board** without *Edits* on it: that is
   what `MoveToken` would grant. No recommendation between (i) and (ii): it
   is the maintainer's reading of K.6. The first draft's *"draws only if the
   board allows"* (a per-board switch outside the Access dialog) is
   withdrawn.
   `[OPEN] Q3b`: an option "only on their turn" (recommended, off by
   default). A player's drag is a presence (Q14); the drop is the edit the
   server accepts or refuses.

6. **Readers follow the board live.** `[OPEN] Q8`. Today a player who only
   *sees* a board follows the saved file. Recommended: a read-only shadow room
   for table players who see the board (0113 H's shadow, every edit refused,
   `MoveToken` excepted if Q3 says so), or tokens would jump only on save.
   **Contradiction with two accepted sentences, for the maintainer** (I4):
   0090's revision of 2026-10-15, pick 2 (*"a reader is refused a board's
   room and follows the saved file"*), and 0113 H (*"A player who only sees a
   board is served the projection, as today"*). Recommended: share readers
   (0081, 0087) keep the saved file, as today; the fog of item 8 applies to
   them all the same.

7. **Walls and doors.** `[PROPOSED]` Generalise 0120's `verso.walls` (format
   versioned) into `verso.scene.walls`, relative to the scene: segments drawn
   with a wall tool, joined at ends; per wall `blocks` (`sight+light`,
   `sight`, `light`, `move`); doors with `open`, `locked`, `secret`. Never
   served to a player (item 1). Walls block a player's token on a move
   (server check, pure geometry), under Q14b. The editor is its own step
   (T8), before players move tokens.
   **Universal VTT import.** `[OPEN] Q11` (recommended, after the format's
   terms are checked; the format's source and terms are recorded here when
   checked, `[OPEN]` if none are published). `.dd2vtt`, `.uvtt`, `.df2vtt`
   are JSON exports of other products: the map picture is embedded as base64
   (tens of megabytes) and is **written out as a picture file**, placed as a
   file card in a new scene (0063: a picture is never data in the board);
   walls and portals become walls and doors; **lights are dropped** (Q10),
   with a line telling the user; the parse has a size bound (0083), and on a
   phone or the web the import runs where memory is small, so the bound is
   the phone's; the source file is kept beside the board as 0120 keeps
   Watabou's (or not: the same question 0120 answered for Watabou). It is the
   first step to write secret-bearing walls in bulk, so it needs T0.

8. **Manual fog.** `[PROPOSED]` tools: the game master covers and reveals
   with rectangle, polygon, brush and cells (room-from-walls once walls
   exist), "cover all", "reveal all"; half-transparent to the game master,
   solid to players, "view as a player" (0110 item 13). **Fog applies to
   every reader who is not the game master**: table players, share readers,
   link readers.
   `[OPEN] Q13` **what "under fog" means for an element** (B2). The first
   draft's *"wholly under fog is Gone"* served whole everything only partly
   under fog (a corridor running into the dark, a card across the edge, an
   arrow pointing at a hidden room). Recommended: an element of a scene is
   served to a player **only if it lies wholly outside the fog** (touching
   fog = Gone), tested on its shape, not its bounding box (a diagonal line's
   box is far larger than the line); an edge is Gone when either end is;
   exceptions: the map picture (item 9's rule), the player's own tokens
   (always Open to them, I3), and elements the game master marks "always
   shown". An element whose box crosses the scene's border belongs to the
   scene (fail closed). A drawn dungeon (0120 is *Verso's own drawing*, not
   a picture) must be cut by room for fog to work on it: fog on a drawn
   dungeon is not offered until its import writes one group per room.
   A player's move into fog is refused (Q14b), so a player never loses their
   own token to the fog.
   `[OPEN] Q4` **where fog lives**. Recommended: **painted fog in the scene
   node** (`verso.scene.fog`): the game master's preparation, kept with the
   map, in its history; **compacted to its merged outline on save** (a list
   of strokes grows without bound and says more than the outline does,
   I7/B1); Obsidian ignores it. **What was explored** (Q18) is session state
   that changes on every move, so it lives outside the file (0012; never a
   file rewritten every few seconds), in the server's database per (folder,
   board, scene) — as the Table's log does, 0107 item 5 as decided (kept in
   the server's database, no expiry) — for a board in a table folder or not.
   **For a local folder with no server** (I6): outside the tree, where the
   folder's config lives (0011), same shape. Said plainly: that database (or
   the app-as-server's own, `VERSO_DATA_DIR`) then holds the only copy of a
   campaign's exploration; backup and moving the folder to another server
   must carry it, and "Add to note"/export exists for it as for initiative.

9. **The map picture under fog.** `[OPEN] Q6`. (a) Served whole, fog drawn on
   screen (Atlas's way; a player's device holds the unexplored art: a
   visibility leak by Verso's rule). (b) **Recommended**: while a scene has
   fog, a player is served its map **only as tiles, with the pixels under
   fog blanked on the server, at every level of the pyramid** (B3): a tile
   wholly under fog is not served, a tile partly under it is served masked;
   the coarse top levels, which always cover fog somewhere, are masked like
   the rest. Masked tiles are made per request or cached per fog state; their
   cost is measured first (Q19). The same masking serves sight (item 10).
   **Contradiction with an accepted decision, for the maintainer** (I7):
   0090's revision of 2026-10-15, pick 1, *"only a PNG is cut into tiles"*,
   because a JPEG or a WebP is decoded whole (a 16,000-pixel JPEG is about
   1 GB decoded, the server's whole memory). (b) therefore needs either fog
   only on PNG maps, or a JPEG/WebP under a stated pixel bound (Q19),
   **converted once to PNG by the game master's device, never on the
   server**. Recommended: the second, as an amendment to pick 1.
   `[OPEN] Q6b` **the picture file itself while it is a fogged map** (B4).
   The first draft hid it "while it is a fogged map": a second source of
   "does not see" outside `may()`, with paths left open — the same picture
   on another board, in a note, or as a copy; a device that synced it before
   the fog; the browser's cache; its version history (0091); `board_preview`;
   hover preview (0085); "show to the table" (0110 item 9); the board
   exported as a picture (0090 item 6) by anyone; share links
   (`share_board.rs`). Recommended: painting fog on a scene **asks the game
   master to set the map picture to "Does not see"** through the one model
   (so `may()` stays the only answer and the Access dialog shows it), and
   **warns when the picture was already served or synced** ("already on
   Ana's device"); the masked tiles are then served by the right on the
   board, not on the picture (a rule of its own, named here). **Not
   reversible**: covering again does not take back what was already served
   or synced; the dialog says so.

10. **Token vision.** `[PROPOSED]` per token `vision` (`range` in units or
    unlimited, `angle`); walls stop it. `[OPEN] Q5` where sight is computed.
    Recommended: **on the server**, a pure function in `verso-core` (no IO;
    the same code in the app-as-server, 0117). With it, **the projection
    itself (`see`, `shape_canvas`) moves from `verso-server` to
    `verso-core`** (I6), so the desktop's play view and player window show,
    through the contract (invariant 1), exactly what the server would serve,
    with or without a server. The player's shadow receives only the elements
    in sight, the explored map (Q18) and the sight outline to draw; nothing
    unseen is sent (Atlas sends walls and unseen vision tokens to the page).
    `[OPEN] Q5b` **when**: recommended **on drop**, not during a drag (a
    separate choice from Q5). `[OPEN] Q7` whose sight: recommended **each
    player's own tokens**, with a scene switch "the party shares sight". The
    game master sees all, with the players' sight outlined.

11. **Dynamic lighting** (light sources, darkness, darkvision, time of day):
    `[OPEN] Q10`, recommended **not planned** until vision is used at the
    table and asked for again.

12. **Initiative in the Table panel.** `[PROPOSED]` design: a tracker per
    table; entries from the tokens of the scene shown (or notes with no
    token); roll with the dice of 0088 (`init` of the statblock as modifier);
    sort, rounds, turns, delay; the turn change written to the log.
    `[OPEN] Q9` where it lives: recommended the server's database per table,
    as the log (0107 item 5 as decided); for a local folder, outside the tree
    (0011), as item 8; "Add to note" for a record.
    `[OPEN] Q15` **what players see of it** (B7). Recommended:
    - each entry has a **shown to players** state, default **hidden** for
      anything that is not a player's own character (a note the player
      edits);
    - the name a player sees is the token's public face (Q12), never the
      note's; an entry with no token and a hidden note is hidden;
    - the rolls of hidden entries are **secret rolls** (0107);
    - a hidden entry's turn is not written to the players' log and shows as
      nothing — or, a game-master option, as "a hidden creature acts";
    - the fog step (T11) and the vision step (T12) each include "the tracker
      follows fog / sight" as part of the step.
    Said, not solved: the time a hidden turn takes, and a round that needs
    one more "next" than the players can count, are oracles no filter
    removes.

13. **The play view and a player window.** `[OPEN] Q16`. Under Q0 (a) the
    play view is "Open the scene" (Q0): the scene's map, tokens, fog and
    sight in a focused renderer, for the game master and for players (each
    served their projection), and on the desktop a **second window** showing
    a scene as a chosen player — or "the table", the party's shared sight
    (Q7) — sees it, full screen on a TV, the camera following the game
    master's or paused. Built on "see as player" (0110 item 13, V.43) and on
    the projection in `verso-core` (item 10), so it works with no server.
    Named framing shortcuts (viewports, Atlas's "saved frames") are 0036.b,
    decided after V1: recommended **not** part of this step. Every later step
    (fog, sight) includes the play view as a read path.

14. **Every read path** (I12, B4). Replaces the first draft's parenthesis. A
    row per path, as 0110 item 18; **a canary per row** (a token, a card and
    a drawn element under fog and out of sight; a secret door; a hidden
    note's token) is the acceptance of T11, and the rows marked T0/T4 are
    accepted in those steps.

    | Path a non-game-master reader has | Who filters | Test |
    |---|---|---|
    | The board file's bytes (read, `read_text`) | the projection, key allowlist (item 1) + scene geometry | canary absent from the bytes (T0, T11) |
    | Sync to a player's device; the projected file's revision (`revision_of`) | the projection; sync of a fogged board debounced (Q19) | canary absent on the device; no revision change for a move out of sight |
    | The board's room and the shadow (0113 H), the read-only shadow (Q8) | `board_sight` (join, updates, `lay_over`) | canary never in a room message; an edit to an unseen id refused |
    | Presence: pointer, laser, selection, drag, ruler | `presence::for_player` (Q14) | a drag and a ruler under fog never relayed |
    | Map tiles at every level | the tile server, masked by fog and sight (item 9) | top level and edge tiles blanked under fog |
    | The map picture's own file and URL; the same picture on another board, in a note, as a copy | `may()` with the picture set to "Does not see" (Q6b) | the file refused to a player |
    | History and `history_copy` (0091) | the same projection over every version, with today's fog | an old version never served unfogged |
    | Conflict copies of a board | a `(conflict)` copy keeps the original's access and fog | canary absent in the copy |
    | `board_preview` (`reader.rs`), hover preview (0085), thumbnails | the projection | canary absent in the preview |
    | "Show to the table" (0110 item 9) | the projection of each viewer | canary absent |
    | Export of a board as a picture (0090 item 6), by anyone not the game master | the projection | canary absent in the picture |
    | Share links and their readers (`share_board.rs`, 0081, 0087) | the same projection (fog applies to every non-owner reader) | canary absent for a share reader |
    | Search and the index (a card's text, a file card under fog) | the query, with the fog state (the index is per folder, not per viewer) | a word under fog not found |
    | Backlinks, unlinked mentions (0089), the graph | the query, with the fog state | no link from a fogged card |
    | "New" notices (0084) | the notice's audience, with the fog state | no notice naming a fogged card's note |
    | The Table log and initiative (0107, item 12) | the entry's shown state, secret rolls (Q15) | a hidden entry's name and roll absent |
    | Side panel lists (pins, tokens) and the board's outline; the player's "in sight" list (item 16) | built only from what the server served | canary absent from the list |
    | The play view and the player window (item 13) | the projection in `verso-core` | the TV shows no canary |
    | `verso mcp` on a player's device | reads the projected copy only; no server-side MCP path without the projection | canary absent through MCP |
    | An agent's write to fog or walls (the game master's MCP) | invariant 8: a write to secrets, with a visible diff | — |
    | What a device or browser already holds | **nothing can filter it**: covering again does not take back what was served (Q6b) | the warning shown |

15. **Bounds** (0083; I7). `[OPEN] Q19`: figures the author proposes for the
    maintainer, to be measured before they are believed — per scene at most
    4,000 wall segments, 300 tokens, a fog outline of 20,000 vertices after
    merging; at most 16 scenes per board; sight computed at most 5 times a
    second per account (through `pace.rs`); explored state at most 512 × 512
    cells per scene; a fogged JPEG or WebP map at most 8,192 pixels on its
    longest side (converted to PNG on the game master's device, item 9);
    device sync of a fogged board debounced to one change every 2 seconds.
    Per-move cost: with vision, a drop recomputes sight for each player and
    changes each player's projection, so live play goes through the room and
    the file sync is debounced. **A measuring task is the first item of T11
    and of T12**, on VM 107 (1 core, 1 GB) and on the maintainer's phone, as
    0090 item 4 did.
    `[OPEN] Q18` **explored memory** (I3). Recommended: its form is **per
    grid cell** (bounded by the grid, cheap on the 1 GB server; a scene with
    vision needs a grid, or an implicit one); an explored area serves **the
    map and what the game master marks static**, never tokens or anything
    that changed since it was last seen (the monster that moved behind the
    party stays unseen); last-seen "ghosts" of tokens **not now**;
    "Forget explored" exists, and cannot take back what a device holds.

16. **Accessibility and languages** (0035; I11). Requirements per step:
    - **T1** grid: hex keys — six neighbours, mapped to the keys (`Q W E A S
      D`-style or arrows plus a modifier, `[PROPOSED]`); grid contrast over
      any map at the 3:1 floor of 0109.
    - **T4** tokens: listed in the side panel as the pins are (0090 item 7),
      each named after its public face (or its note, for the game master),
      moved by the arrow keys one cell at a time; a touch target that keeps
      its size at low zoom; the bar's value as text and its state not by
      colour alone.
    - **T6** initiative: the tracker is a list with the current turn exposed
      (`aria-current`), operable by keyboard; the turn announced politely.
    - **T11** fog: painting by cells and by room without a pointer; fog vs
      explored vs seen not told by colour alone; the game master's text
      equivalent ("3 areas hidden"); the **player's** text equivalent — what
      is in sight, as a list made only from what the server served.
    - **Phone** (0076; the game master's device too, the maintainer tests
      there): drag-a-token vs pan vs paint-fog on one finger by an explicit
      mode switch; the tracker and the fog tools reachable at 390 × 844 and
      in landscape, every hide with a way back.
    - Reduced motion honoured for token glide and camera follow; pt-BR and
      English.

17. **Atlas VTT, fenced** (I10). `[OPEN] Q20`, for the maintainer to confirm:
    *the build never opens Atlas VTT's repository; the survey is the only
    bridge; names and structures are Verso's own (0120's `walls` format, the
    board's vocabulary).* Recorded for the maintainer: for the survey, the
    English UI strings and the doc comments of a few type and protocol files
    were read, to learn how a feature behaves; whether that reading was
    admissible is his to say. Any geometry library for sight or collision is
    a new dependency (CLAUDE.md §4): recommended none, pure code in
    `verso-core`.

18. **Not taken now.** `[OPEN] Q17`, the maintainer's to confirm (listed so
    they are not lost; leaving them out is a choice): levels and roofs,
    animated maps, a dungeon generator of our own (Watabou covers it, 0120),
    TrueScale, spell-effect animations, auras, encounters, kept area
    templates, game-system presets beyond 0015, sound moods (0116's later
    items). Each needs its own request.

### Order and size

Sizes are the author's estimate (S days, M about a week, L two to three
weeks, XL more), grown where the review's fixes add work; they are not a
plan. The order fixes the review's I4 and I5: the allowlist first; readers
in a read-only shadow before anything is called "shared"; the wall editor
before players move tokens; the player window after the fog it must honour.

| # | Step | Size | Needs | Under Q0 (b) a scene file | Under Q0 (c) board-wide |
|---|---|---|---|---|---|
| T0 | Key allowlist in the projection (top level, then nodes' `verso`), canary test | S | — (top level being fixed 2026-11-15) | the scene file's schema allowlisted from the start | top level only |
| T1 | Scenes (a group with `verso.scene`) and their grid: square and hex, alignment, snap, numbers; fail-closed drift check | M | T0, Q0 | **L**: the file type end to end (core, contract, sync, index, room, renderer); pictures, pins and Watabou linked or copied in | grid on the board, no scene |
| T2 | Readers of a board in a read-only shadow (T7a of the review) | M | Q8 | the scene file's room (part of T1) | same as (a) |
| T3 | Ruler in units, live; Q14's presence rule | S | T1; shared with readers after T2 | same | same |
| T4 | Tokens: note cards, public face, size, snap, bar, per-viewer numbering | L | T1, Q2, Q12; shared after T2 | tokens live in the scene file | same as (a) |
| T5 | Hide a drawn element from players: the flag in `customData.verso.secret` (which `is_secret` already reads), its menu, spec §5.11, tests | S–M | T0 | not needed for scenes (the file has its own flag); still for boards | same as (a) |
| T6 | Initiative tracker with shown/hidden entries, public names, secret rolls | L | T4 (public face), Q9, Q15 | same | same |
| T7 | The play view ("Open the scene") and the player window (TV); projection in `verso-core` | M | T1, T4, T2, Q16; V.43 for "see as player" | **merged into T1**: the scene file's view is the play view | the full board is the play surface; no focused view |
| T8 | Wall and door editor | S–M | T1, T0 | same, in the file | walls on the board |
| T9 | Universal VTT import into a new scene with walls | S–M | T1, T0, Q11 | writes a scene file | writes into the board |
| T10 | Players move only their tokens (`MoveToken`); walls block moves; the wall oracle | M | T2, T4, T8, Q3, Q14b | same | same |
| T11 | Manual fog: **measuring first**; painting; the projection on every path (item 14); masked tiles; the picture's access; tracker and play view follow fog | XL | T10, T7, Q4, Q6, Q6b, Q13, Q14, Q19 | the geometry rule is simpler (the whole file is one scene) | fog in board coordinates; one fog per board |
| T12 | Token vision on the server; explored memory; **measuring first**; tracker and play view follow sight | L–XL | T11, Q5, Q5b, Q7, Q18 | same | same |

T0 to T9 can each ship alone; none is free of secrecy work: T3 and T4 depend
on Q14 and Q12, T6 on Q15, T9 on T0. T10 to T12 are the big block, in that
order because each one's secrecy rests on the one before.

`[OPEN] Q1` **when**. Recommended: **after V1**, as its own phase, T0–T7
first. The top-level part of T0 is a fix of today's leak and is not waiting
for this ADR (Context). V1 already carries its blockers and V.43, on which
T7 depends.

### The presence and wall rules

`[OPEN] Q14` **presence under fog and sight** (B6). Today a player's
presence is an allowlist (`user`, `pointer`, `button`, `selected` cut to what
it sees — 0113 S7). Recommended: a drag or a ruler is relayed to an account
only while **both ends and the dragged element** are in what that account
sees (the element's class and its fog and sight), decided by the server in
`presence::for_player`; the game master's pointer and laser are cut inside
fog for players; a canary test for presence under fog. (Alternative: a "hide
my pointer while preparing" switch, on by default.)
`[OPEN] Q14b` **the wall check as an oracle**. A refused drop tells the
player a wall is there — in fog too, and for a move-only wall, which is
invisible by definition: probing drops would map the walls, what 0113 S7's
*"No activity oracle"* was written against. Recommended: a move is judged
against walls only along a path the account's sight or explored area covers;
a move whose path or end touches fog is refused outright with one answer
("you cannot see there"); a move-only wall inside what the player sees is
checked only if the game master accepts that bumping into it tells (a switch
per wall, off: the wall does not block players).

## Consequences

- Spec §5.11 (the v0.43 note: a canvas has no dialect fixture) gains
  `scene` (`grid`, `fog`, `walls`, `vision`), `token`, and the drawn
  element's `secret`, with the core's property tests as the guardrail;
  Obsidian's keeping of the fields observed again (O4), including a scene
  moved and resized in Obsidian.
- Contract: initiative commands, the explored state, a token's sight in the
  shadow, the projection reachable from the desktop through `verso-core`;
  server first, then apps (contract-change rule). Bindings generated.
- Server and core: the projection becomes a key allowlist (T0) and moves to
  `verso-core` (item 10); `board_sight` learns scenes, fog and sight; a
  property test with canaries under fog and out of sight, on every row of
  item 14 (as `board_sight_tests.rs`); bounds per
  [0083](0083-security-hardening-of-universo.md) (Q19), measured on the
  1-core 1 GB VM.
- Amendments this ADR would make if its questions are answered as
  recommended, each a contradiction recorded for the maintainer, not
  resolved here: 0113 section B (`MoveToken`) and K.6 (what *Edits* covers
  inside a scene, Q3); 0090's revision of 2026-10-15, pick 2, and 0113 H
  (readers live, Q8); 0090's revision, pick 1 (*"only a PNG is cut into
  tiles"*, Q6); 0120 item 3 (walls move into the scene, Q0 a); 0090 item 1
  (*"a map is a board"*, only under Q0 b).
- Risks: drawing grid, fog and sight over Excalidraw on a phone (one canvas
  in the card layer, redrawn on camera change, measured on the maintainer's
  phone) — under Q0 (a) only while editing, since play has its own view;
  drag traffic through the room (presence during the drag, one edit on
  drop); the game master's own phone as the host (0118) for sight compute.
- Each step: strings in both languages, changelog, a lesson in the demo
  vaults' board training, walkthrough steps, e2e in the harness and
  `e2e-server` (CLAUDE.md §5).

## Discarded alternatives

- **Atlas VTT's code, or Atlas run inside Verso**: AGPL-3.0, and third-party
  plugin execution is out of scope until after V1 (invariant 16).
- (The first draft discarded "a scene file of Verso's own"; the maintainer's
  framing of 2026-11-15 reopened it. It is now Q0 (b), not discarded.)

## Status

**Proposed (2026-11-15), revised the same day.** For the maintainer, each
with a recommendation in the Decision:

- **Q0** what a scene is — (a) a scene element (a `group` with
  `verso.scene`) plus a play view, recommended; (b) a scene file, the
  fallback; (c) the board-wide layer.
- **Q1** when — after V1, T0–T7 first.
- **Q2** what a token is — a note's file card. **Q12** what a player sees of
  it — its own public face; no face = Gone; coarse bar off by default;
  per-viewer numbering.
- **Q3** who moves it — `MoveToken` in 0113 B, by *Edits* on the note;
  K.6 inside a scene: (i) or (ii), no recommendation (contradiction).
  **Q3b** only on their turn — an option, off by default.
- **Q4** where fog lives — in the scene, compacted; explored in the
  server's database, outside the tree for a local folder.
- **Q5** where sight is computed — on the server, in `verso-core`, with the
  projection moved there. **Q5b** when — on drop.
- **Q6** the picture under fog — masked tiles at every level; JPEG/WebP
  converted to PNG on the game master's device (contradiction with 0090
  pick 1). **Q6b** the picture file — set to "Does not see" through the one
  model, with a warning; not reversible.
- **Q7** whose sight — each player's own tokens; a switch to share.
- **Q8** readers live — a read-only shadow for table players
  (contradiction with 0090 pick 2 and 0113 H); share readers as today.
- **Q9** where initiative lives — the server's database per table; outside
  the tree for a local folder.
- **Q10** lighting — not planned.
- **Q11** Universal VTT — yes, after its terms; pictures written out,
  lights dropped.
- **Q13** what "under fog" means — wholly outside the fog to be served.
- **Q14** presence — relayed only while both ends and the element are seen.
  **Q14b** the wall oracle — judged only where seen; into fog refused with
  one answer.
- **Q15** what players see of initiative — hidden by default but their own
  characters; public names; secret rolls.
- **Q16** the play view and player window — "Open the scene", TV window;
  viewports stay 0036.b.
- **Q17** the not-taken list — confirm.
- **Q18** explored memory — per cell; the map and static elements only; no
  ghosts now.
- **Q19** bounds — the proposed figures, measured first.
- **Q20** the Atlas fence — confirm; no geometry dependency.

Roadmap: After V1, item 11 (proposed rows T0–T12).

## Revision of 2026-11-15

What the review found and where this text answers it.

| Finding | Answered in |
|---|---|
| B1 top-level keys served whole | Context (today's leak, being fixed with an allowlist); item 1 (allowlist of keys, nodes' `verso` too, per-key table); T0 |
| B2 "wholly under fog" | Q13 (wholly outside to be served, shape not box, edges, drawn dungeons cut by room) |
| B3 coarse and partly covered tiles | item 9 (b): pixels blanked at every level |
| B4 the picture's other paths | Q6b (the one model, the warning, not reversible); item 14 rows |
| B5 tokens of hidden notes, bar, numbering | Q12 (public face, Gone without one, coarse bar, per-viewer numbers) |
| B6 presence and the wall oracle | Q14, Q14b |
| B7 initiative and the log | Q15; T11/T12 include the tracker |
| I1 choices written as statements | Decision preamble (accepting the Qs accepts nothing else; `[PROPOSED]` marks); Q12–Q20 |
| I2 the change to 0113 | item 5 (`MoveToken` in 0113 B; K.6 contradiction, no recommendation; the per-board draw switch withdrawn) |
| I3 own token in fog, explored | Q13 (own tokens always Open), Q14b (moves into fog refused), Q18 |
| I4 readers live amends two decisions; order | item 6 (the two sentences named; share readers); T2 before T3/T4 |
| I5 the order | the step table (wall editor T8 before T10; T7 play view before T11; T6 needs T4 and Q15) |
| I6 a local folder; projection in the core | items 8, 10, 12; T7 |
| I7 JPEG/WebP tiling, unbounded work | item 9 (contradiction with 0090 pick 1); Q19 figures; measuring first in T11, T12 |
| I8 fog and walls move without the map | Q0's fail-closed rule (relative to the scene, drift check, Obsidian observation) |
| I9 Universal VTT described | item 7 |
| I10 Atlas fence | item 17, Q20 |
| I11 accessibility | item 16 |
| I12 paths left out | item 14 table |
| M1 0107 citation | items 8, 12: "0107 item 5 as decided (kept in the server's database, no expiry)" |
| M2 spec version | Consequences: "§5.11 (the v0.43 note)" |
| M3 0036.b viewports | item 13 |
| M4 two grids | item 2 |
| M5 `secret` on drawn elements | T5 (`customData.verso.secret`, already read by `is_secret`; size S–M) |
| M6 sizes | the step table's preamble; T4, T6, T11 grown |
| M7 tracker edit citation | item 4 (0099 item 5, invariant 11, refused without *Edits*) |
| M8 roadmap | roadmap item 11 updated in the same change |
| M9 survey wording | the survey, same change |
