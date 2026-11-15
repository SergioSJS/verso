# ADR 0121 — A virtual tabletop layer on the board: scenes, grid, tokens, walls, fog and vision, initiative

- Date: 2026-11-15; revised in place the same day (unfinished: rewritten, not
  superseded) after the reading
  [`docs/review/2026-11-15-adr-0121-review.md`](../review/2026-11-15-adr-0121-review.md)
  (7 BLOCKING, 12 IMPORTANT, 9 MINOR) and the maintainer's framing of the
  same day (Q0). Where each finding is answered: "Revision of 2026-11-15" at
  the end. Rewritten in place again the same day with **the maintainer's
  answer to every question** (Q0, Q1 and Q3 first; Q2 and Q4–Q20 in his note
  *decisoes-2026-11-15-vtt*, quoted in each `[DECIDED 2026-11-15]` line).
  Rewritten in place a third time the same day after the second reading
  [`docs/review/2026-11-15-adr-0121-second-review.md`](../review/2026-11-15-adr-0121-second-review.md)
  (`76c46135`; 5 BLOCKING, 13 IMPORTANT, 10 MINOR): each rule is written
  into the item or step it governs; where each finding is answered: "Second
  revision of 2026-11-15" at the end.
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
  Written by Opus 5.5; read by a Fable session (the review above) and read
  again before building (the second reading above,
  [0032](0032-author-and-reviewer-roles.md)).
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
2026-11-14, 33 releases in eight weeks. It is inspiration only (item 17 says
what may be read and what may not be taken). How it solves the five things
asked for, in one line each (detail in the survey):

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

**A leak that existed until 2026-11-15, found by the review (B1, "a fact for
the maintainer").** The projection (`board_sight::shape_canvas_seen`)
filtered `nodes`, `edges` and `verso.drawing` and served every other key
under the top-level `verso` as it was; so `verso.walls`, with Watabou's
secret-door kinds, reached every player of a table (0120 as built; the
drawing also showed a secret door as a dashed line to everyone). It was
**fixed on 2026-11-15** by another session (`942359ac`): both cuts now keep an
**allowlist** of top-level keys (`nodes`, `edges`, and of `verso` only
`version`, `drawing`, `background`), and a secret drawn element is Gone. This
ADR builds on that allowlist (item 1); the fix was the code's and the
maintainer's, not this ADR's.

## Decision

**Every question, Q0–Q20, was answered by the maintainer on 2026-11-15**
(each `[DECIDED 2026-11-15]` line quotes his answer). Where a part of a
decided line is the author's reading of his answer, not his words, it is
marked `[PROPOSED]` inside the line (Q4's storage, the painted fog's scope,
Q13's two added rules, Q20's "nor translated"). The items marked
`[PROPOSED]` are the author's design (field names, wall kinds, tools, the
ruler, the tracker's details, the token maker, the tile format, the ghosts'
rules, the lighting's fields); each is confirmed in the PR of its step, as
0110 did for its phase 2 — **except those listed under Status, "His to
confirm before the step"**, which need his word before their step starts.
The items marked `[OPEN]` are questions for him that no answer of his
covers.

### Q0. What a scene is — the central structural question

`[DECIDED 2026-11-15] Q0` — **(a)**, a scene element (a `group` with `verso.scene`) plus its play view; (b) stays the fallback (the maintainer, note *decisoes-2026-11-15*, 1.1: *"A"*). The fog, the grid, the walls and the tokens need a *place*: a
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

The recommendation (the coordinator's, which the maintainer had seen) was
(a), and he took it: a scene is a `group` node carrying `verso.scene` (grid,
fog, walls, anchored to the scene and its map); everything inside its bounds
follows the scene's fog and sight; several scenes per board; and a dedicated
play view ("Open the scene") for phone and TV, so **the data stays in the
board while play has its own screen**. A separate scene file (b) remains the
fallback if scenes later need what a board holds badly (animation; dynamic
light, now planned, is measured in its step T13 first). (c) was not taken:
one map per board, and secrecy resting on board coordinates that move
without it.

Rules that follow from (a):

- The scene node and its `verso.scene` are the game master's: a player's
  edit to the scene node (moving, resizing, ungrouping, writing its keys) is
  refused by `board_sight::check`, whatever their right on the board.
- **Nobody but the game master makes a scene, a token, a wall or a teleport
  point** (N-I3): `check` refuses any put by a non-game-master that carries
  or changes a key outside the allowlist of item 1, on any node, edge or
  drawn element — a new group with `verso.scene`, a card with
  `verso.token`, a pin with `verso.teleport` included, not only edits to an
  existing scene node (T0).
- **Inside a scene's box a non-game-master changes nothing** (Q3; N-I4),
  from T1 on; T10 adds the one exception, `MoveToken` (item 5).
- **The scene names its map** (N-B5): `verso.scene.map` holds the id of the
  scene's map node (the file card of its picture), born with the scene in
  T1. The map node is the game master's like the scene node (a player's
  edit to it is refused).
- **Fail closed on drift** (I8, N-B5): the scene records what its fog and
  walls were made on — **the group's box, the map node's id and box, and the
  picture's content hash**, compared in the scene's own coordinates (so
  moving the whole group with its contents is not drift). On any mismatch —
  the group resized (in Obsidian, by another program, by a merge), the map
  card moved or resized inside the group, its `file` pointed at another
  picture, the picture's bytes replaced — or when a scene the server's
  record knows as fogged has lost its `fog` key, a player is served the
  scene **fully covered** and the game master is told. Map tiles are keyed
  by (board, scene, picture hash), so tiles of an old picture are never
  masked by a new outline. Moving the group moves its contents with it in
  Verso and in Obsidian; the fog, relative to the group, follows.
  Observation for the step: move and resize a scene in Obsidian, **move and
  resize the picture inside the group**, reopen in Verso.

### The items

1. **Storage, and the projection as an allowlist** (B1). A map stays a board
   (Q0 (a)). Everything the layer adds is a field under a node's `verso`
   key (the scene's, a token's) or under the top-level `verso` key, on node
   types Obsidian knows; session state (explored areas, ghosts, the pause,
   the initiative list) lives outside the file (0012). **Rule, valid from the
   first step that writes any of these fields: no key of this layer is
   served to anyone but the game master on any path, except as the table
   says; the projection is an allowlist of keys, not a denylist.** It extends
   the top-level allowlist built on 2026-11-15 (`942359ac`, Context) to **the
   `verso` key of nodes**: today an Open node is served whole, so a scene
   group served Open would carry its fog and walls with it. What a player is
   given instead:

   | Key | A player is served |
   |---|---|
   | `verso.scene.grid` | whole |
   | `verso.scene` settings that shape only the player's own view (`[PROPOSED]`: the fog scope, Q4; when sight updates, Q5b; ghosts on or off, Q18) | whole |
   | `verso.scene.walls` (and 0120's top-level `walls`) | nothing (a move check, item 7, never sends them) |
   | `verso.scene.fog` | before the scene has vision: the present covered area as one merged outline, never the shapes, their order or their history. **Once the scene has vision** (T12): **one outline only — the area this player may see** (painted fog, sight and explored memory already combined on the server), **never the painted fog's own outline** (N-B4) |
   | `verso.scene.map` and the drift record (Q0) | nothing (the map reaches a player only as tiles, item 9) |
   | `verso.scene.lights`, a token's `light`, the scene's darkness and time of day (item 11) | nothing; only their effect, inside the player's own sight outline |
   | `verso.scene.vision`, explored state, ghosts | only the player's own sight outline, explored area and ghosts (items 10, 15) |
   | `verso.token` | the public face (Q12) of a token they see; nothing else |
   | teleport points (item 21) | nothing, unless the game master shows one |
   | any key the projection does not know | nothing |

   `[PROPOSED]` **How painted fog and sight combine** (N-B4; his to confirm
   before T12): a cell or element is shown to a player when it is **not
   covered by the painted fog and (in sight or explored)**.

   **An equal projection sends nothing** (N-I5): a change that leaves an
   element's projection equal produces **no message, no new version and no
   revision** to a player — the projected element's version is derived from
   its projected content, not from the source's `version`/`versionNonce`.
   Otherwise every wall drawn, door toggled or fog stroke on the scene's
   group node (which players see) would be a new entry of the same visible
   content in each player's shadow: the count and rhythm of the game
   master's hidden work, the activity oracle 0113's review of S7, (1)
   forbids (Q14b's exception is for a refused move only). The same rule
   covers `revision_of` (item 14). Canary in T8's acceptance: fifty wall
   edits, zero messages to a player's shadow. Built in T1, the first step
   that puts hidden keys on a node players see.

   The allowlist, with its canary test, is step **T0**: its top level is
   built (`942359ac`); its nodes' part comes before any step writes walls,
   fog or tokens. **T0's first task is an inventory** (N-I3): every key the
   code writes today under a node's, an edge's and a drawn element's
   `verso` (`customData.verso` for drawn elements) — 0090's pins and maps
   and whatever else the UI writes — each classified served / not served,
   with **a test that fails when the UI writes a key the projection does not
   classify**, so the allowlist cannot drift from what is written. Node keys
   **outside** `verso` that JSON Canvas does not define (another program's):
   `[PROPOSED]` not served — a change players can see, so his to confirm
   before T0 merges (Status).

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

4. **Tokens.** `[DECIDED 2026-11-15] Q2` — **(a), a token is a note's file
   card** (the maintainer: *"A, a gente pode usar parametros do frontmatter
   pra imagem de token por exemplo, podemos até propor um griador de tokens
   como tem no atlas att, pense a respeito"*): a file card for a note (a
   character, a creature, a typed note) inside a scene, marked
   `"verso": {"token": {"size": 1}}`, drawn round, its size in cells, snapped
   to cell centres. In Obsidian it is a file card. Several tokens may name
   one note.
   - **The picture from the note's frontmatter.** `[PROPOSED]` a property of
     the note naming a picture is the token's picture **for whoever sees the
     note** (the game master, a player whose sheet it is). Its name is
     confirmed in T4's PR, preferring one less likely to be taken in
     existing notes than `token:` (an access token, a game's token count —
     N-M3), for example `token-image: "[[Goblin.webp]]"`. The picture is
     resolved **by the client, through ordinary reads (`may()`)**, never by
     the server into the projection. Verso reads it;
     reading never rewrites the note (invariant 7); in Obsidian it is an
     ordinary property. Order: a picture set on the token itself, then the
     note's property, then the note's initials. The picture file keeps its
     own access (`may()`). It is **never** a player's view of a note they do
     not see: that is the public face below (Q12), which the game master may
     set to the same picture by his own act.
   - **The token maker** (his request): item 19.

   `[DECIDED 2026-11-15] Q12` **what a player sees of a token whose note
   they do not see** (B5) — **as recommended** (the maintainer: *"sua
   sugestão"*). By 0113 H a card of a hidden file is Locked — no name, no
   picture, no colour — so the token would be a grey box, or else it would
   serve parts of a hidden note (a new exception to 0110 item 18 nobody
   decided). Decided:
   - The token carries its **own public face** in the board:
     `verso.token.name` and `verso.token.image` (a picture file whose access
     is its own), both optional, set by the game master. A player is served
     only that face, as a marker with the token's id (as 0113 H's locked
     marker keeps the id) — never the note's path, name, picture (its
     frontmatter one included) or text.
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
     master sees both ("Goblin 3 · players: Goblin 2"). This is part of the
     option he accepted (*"sua sugestão"*), not a design open for the step
     (N-I2): a number stored per token would show the gap of a hidden one.
   - A click on the bar edits the note's tracker (0099 item 5) with the
     concurrency check of invariant 11; the write is refused for an account
     without *Edits* on the note (M7).

5. **Who moves a token.** `[DECIDED 2026-11-15] Q3` — the maintainer,
   rejecting the contradiction reading: *"elementos dentro de uma cena têm
   permissões restritas, não faz sentido ficar tudo liberado; o objetivo é
   restringir e a pessoa mexer apenas o seu token referente à sua
   ficha/nota; não é contradição, é adequação a essa nova necessidade"* —
   inside a scene, permissions are restricted; K.6 is not contradicted but
   adapted for scenes (a scene's own rule, stated in 0113 as an amendment).
   **The rule, once** (N-I4): **inside a scene a non-game-master writes only
   the position of their own tokens.** Nothing else inside a scene's box —
   no other token, the map card, a drawing, a deletion — whatever their
   right on the board. Built in two halves: **the refusal in T1** (inside a
   scene's box a non-game-master changes nothing: a few lines in `check`,
   no new right), **the exception in T10** (`MoveToken`). Players drawing
   inside a scene is not granted by his answer: `[OPEN]` for him, if wanted.
   - `[PROPOSED]` **how "their own token" is told**: the account that may
     edit the token's note (the character sheet granted to its player, 0110
     item 12 as amended; 0113 grants), with no owner field and no new store
     — **as an amendment to 0113 section B**: a new action `MoveToken` with
     its row in the one table, answered by `may()`, shown in the Access
     dialog. Two players who both edit a note both move its tokens. A device
     with a capped role (a paired phone, 0117) counts as its capped role,
     never as the owner; the other roles: item 22. A player with only *Sees*
     on the board who moves their token **writes the board** without
     *Edits* on it: that is what `MoveToken` grants. (Background: the
     question was put as (i) K.6 kept inside a scene, or (ii) *Edits*
     narrowed there; his answer is the rule above, and the "and drawing" of
     the old (ii) is not part of it. The first draft's per-board "draws only
     if the board allows" switch is withdrawn.)
   - **What a move is** (N-B2): **a `MoveToken` changes only `x` and `y` of
     a token the account may move** — never its `file`, its `verso.token`,
     its size or its id; it **ends inside the box of the scene it started
     in**; it is judged along the straight segment from the token's last
     accepted position (walls, the scene's bounds, the pause); coalesced key
     presses are judged **one cell at a time and stop at the first refused**;
     **only the server moves a token between scenes** (the teleport,
     item 21). **Tokens never block tokens** (N-M6): a refusal because a
     cell is taken would tell of a hidden token.
   - **Every write path of a token's position ends in one judge** (N-B2):
     one function in `verso-core` (`[PROPOSED]` `judge_move`) that every
     path below calls, so no path writes a position the room's drop would
     refuse. A canary per row is T10's acceptance.

     | Write path of a token's position | Judged by |
     |---|---|
     | The board's room: a drop, a key press (`MoveToken`) | `judge_move` |
     | The board file laid over from a player's device (file sync, `lay_over` under `board_sight::check`) | `check` calls `judge_move` for each token whose position changed; anything else inside a scene refused (the rule above) |
     | An offline device's queued move, arriving later | the same, judged at arrival against the walls, doors and pause of that moment |
     | `write_text` of the board by a player | the same as the file laid over |
     | A player's `verso mcp` writing the board | the same (it reaches the server only as one of the paths above) |
     | History restore (0091) by a player | the same: a restored version is a write, its moved tokens judged; refused inside a scene but for their own tokens' positions |
     | A conflict copy of a board | not a move: a new file, with the original's access and fog (item 14) |

   `[DECIDED 2026-11-15] Q3b` — **no turn rule; a pause instead** (the
   maintainer: *"cara, não quero amarrar em turnos, mas quero ser possível
   pausar para que ninguem mova nada além do mestre"*): moving is never tied
   to turns; the game master can **pause the scene**, and while it is
   paused nobody but the game master moves anything (item 20).
   **Moving by keys** (Q5b's answer): a token moves by the arrow keys or by
   `W A S D`, one cell a press (hex keys: item 16). `[PROPOSED]` where the
   keys act (N-M5): in the play view; on the board only while a token is
   selected and no text field has focus (the letters are, or may be,
   Excalidraw's tool shortcuts, and they type). A player's drag is a
   presence (Q14); the drop, or a key press, is the edit the server accepts
   or refuses (walls, Q14b; the pause, item 20).

6. **Readers follow the board live.** `[DECIDED 2026-11-15] Q8` — **(a)**
   (the maintainer: *"A"*): table players who only *see* a board join a
   **read-only shadow** of its room (0113 H's shadow, every edit refused but
   `MoveToken` of their own token, Q3), so tokens do not jump only on save.
   **This amends two accepted sentences, as decided**: 0090's revision of
   2026-10-15, pick 2 (*"a reader is refused a board's room and follows the
   saved file"*), and 0113 H (*"A player who only sees a board is served the
   projection, as today"*), for table players. Share readers (0081, 0087)
   keep the saved file, as today; the fog of item 8 applies to them all the
   same. **A contradiction recorded, not resolved** (N-I7): a share's
   **editor** has been live in a shadow since V.49 (`c36fa5e4`, built the
   same day as his answer), which Q8's *"share readers keep the saved file"*
   does not name; inside a scene that account follows the roles table
   (item 22).
   - **Measuring first** (N-I6): T2 opens with a measurement — six shadows
     of a large board on VM 107 (1 core, 1 GB), and the phone joining one —
     since T2 gives a shadow to every player of a table on every open board,
     where today only players who edit have one.
   - **Preparing in front of live readers** (N-I6): a reader used to follow
     the saved file; now they follow each stroke, so a pin, a drawn element
     or a token placed and *then* marked secret is on every player's screen
     in between (not a new path — players who edit see it today — but a
     wider audience). `[OPEN]` for him, with T2 or T5: a game master's
     **"new things start hidden"** mode (what he places is `secret` from
     birth until he shows it).

7. **Walls and doors.** `[PROPOSED]` Generalise 0120's `verso.walls` (format
   versioned) into `verso.scene.walls`, relative to the scene: segments drawn
   with a wall tool, joined at ends; per wall `blocks` (`sight+light`,
   `sight`, `light`, `move`); doors with `open`, `locked`, `secret`. Never
   served to a player (item 1). **Every wall blocks a player's token on a
   move, seen or not** (server check, pure geometry; Q14b). The editor is its
   own step (T8), before players move tokens.
   **Universal VTT import.** `[DECIDED 2026-11-15] Q11` — **yes** (the
   maintainer: *"Simmmm por favor! seria foda!"*), after the format's terms
   are checked (the format's source and terms are recorded here when
   checked, `[OPEN]` if none are published). `.dd2vtt`, `.uvtt`, `.df2vtt`
   are JSON exports of other products (Dungeondraft, DungeonFog, Dungeon
   Alchemist): the map picture is embedded as base64 (tens of megabytes) and
   is **written out as a picture file**, placed as a file card in a new
   scene (0063: a picture is never data in the board); walls and portals
   become walls and doors; **lights are dropped**, with a line telling the
   user, as offered — `[PROPOSED]` whether T13 (lighting, now planned) later
   imports them as light sources is that step's to say; the parse has a size
   bound (0083), and on a phone or the web the import runs where memory is
   small, so the bound is the phone's; the source file is kept beside the
   board as 0120 keeps Watabou's (or not: the same question 0120 answered
   for Watabou). It is the first step to write secret-bearing walls in bulk,
   so it needs T0.
   **The import hides the picture first** (N-I8): the picture takes the
   access of where it is put (0113), so in a table's folder it would sync to
   every player's device before any fog exists. T9's import dialog (and
   0120's) offers *"players do not see this picture yet"*, set through the
   one model **before the file is written** — Q6b's own act, done while it
   still works. Whether it is on by default: `[OPEN]` for him. (The token
   maker's picture written beside a hidden note already fails closed: the
   picture is hidden and the public face shows initials; the dialog says so.)
   **Measuring the node's size first** (N-I10): walls live in the scene's
   node, one entry of the room; a wall edit, a door toggle or a fog stroke
   sends the whole node — up to 4,000 segments, hundreds of kilobytes — to
   the server and every device of the game master, and the server projects
   it again per shadow. **T8 and T9 open with that measurement** (a
   4,000-segment import; a door toggled; on VM 107 and the phone). If it
   fails, storage per wall group or outside the node is the alternative — a
   format question found in T8, before T11 builds on it.

8. **Manual fog.** `[PROPOSED]` tools: the game master covers and reveals
   with rectangle, polygon, brush and cells (room-from-walls once walls
   exist), "cover all", "reveal all"; half-transparent to the game master,
   solid to players, "view as a player" (0110 item 13). **Fog applies to
   every reader who is not the game master**: table players, share readers
   and editors, link readers (every role: item 22).
   `[DECIDED 2026-11-15] Q13` **what "under fog" means for an element** (B2)
   — **as recommended** (the maintainer: *"sua sugestão"*). The first
   draft's *"wholly under fog is Gone"* served whole everything only partly
   under fog (a corridor running into the dark, a card across the edge, an
   arrow pointing at a hidden room). Decided: an element of a scene is
   served to a player **only if it lies wholly outside the fog** (touching
   fog = Gone), tested on its shape, not its bounding box (a diagonal line's
   box is far larger than the line); an edge is Gone when either end is;
   exceptions: the map picture (item 9's rule), the player's own tokens
   (always Open to them, I3), and elements the game master marks "always
   shown". Two rules the option he accepted did not contain, the author's
   (N-I2): `[PROPOSED]` an element whose box crosses the scene's border
   belongs to the scene (fail closed); and `[PROPOSED]`, **his to confirm
   before T11**: a drawn dungeon (0120 is *Verso's own drawing*, not a
   picture) must be cut by room for fog to work on it, so fog on a drawn
   dungeon is not offered until its import writes one group per room — it
   withholds fog from the Watabou dungeons he built; the cost of lifting it
   (the author's estimate) is 0120's importer writing one group per room,
   S–M, in or before T11. (Watabou's *picture* of a dungeon is a map like
   any other, under item 9.)
   A player may move their own token into fog (only walls and the pause
   refuse a move, Q14b, item 20); being their own, it stays shown to them.
   `[DECIDED 2026-11-15] Q4` **where fog lives** — **three additions of his,
   on a storage read from his answer** (the maintainer: *"e deve ser
   possivel resetar nevoa e a nevoa é por jogador ou por grupo ou ainda por
   token controlado, configurável na cena, se um mestre clicanum token,
   mostra a visao apenas do token"*). He wrote neither "A" nor "sugestão":
   that the recommended storage stands is inferred from the "e" that opens
   his sentence (N-I1). `[PROPOSED]` **the storage, as recommended — decided
   as read from his answer, his to confirm before T11**: **painted fog in the scene node**
   (`verso.scene.fog`): the game master's preparation, kept with the map, in
   its history; **compacted to its merged outline on save** (a list of
   strokes grows without bound and says more than the outline does,
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
   The additions (his):
   - **The fog's scope, chosen per scene**: **per player** (each player's
     explored area and sight from their own tokens — Q7's default), **per
     party** (one shared explored area and sight for the table's players —
     what Q7 called "the party shares sight"), or **per controlled token**
     (each token keeps its own explored memory and sight). `[PROPOSED]` the
     scope governs what tokens reveal (sight, explored memory, ghosts) and
     **the game master's painted fog is one per scene** — the author's
     reading of *"a névoa é por jogador ou por grupo ou por token"*, **his to
     confirm before T11** (N-I1): if he meant the painted fog too (the game
     master uncovers a room for Ana only), T11's storage differs, since an
     outline per account cannot live in the board file as one key. Under
     *per token* the server serves the union of the account's tokens'
     sight and memory; which token is selected is the page's filter only
     (N-M9).
   - **Changing the scope** (N-B3): `[PROPOSED]` the game master's act, in a
     dialog that says who gains what: *per player* → *per party* is the
     union of the players' memories (and ghosts); *per party* → *per player*
     copies the party's memory to each player, since each was already served
     it; to and from *per token* by the same rules over the tokens' owners.
     `[OPEN]` for him: what a later grant of a sheet inherits under *per
     token* — the token's memory (stated in the Access dialog's wording) or
     nothing. Either way a ghost never carries more than its frozen public
     face (item 15).
   - **Reset**: "Reset fog" exists (his). `[PROPOSED]`, **his to confirm
     before T11** (N-I1) — what it restores: the painted fog back to fully
     covered (erasing his preparation), or back to **how he prepared it**
     (the painted fog as last saved by him, only the exploration cleared);
     either way it clears the explored memory and the ghosts — of the whole
     scene, or of one player, the party or one token, by the scope.
     "Forget explored" clears the memory only. Neither takes back what a
     device already holds, and the dialog says so.
   - **The game master's token view**: when the game master clicks a token,
     his view shows **only that token's sight** (item 10).

9. **The map picture under fog.** `[DECIDED 2026-11-15] Q6` — **(b) with
   (b2), as recommended** (the maintainer: *"concordo com sua sugestão, so
   nao sei se png seria o melhor formato, ja que fica grande"*). (a), served
   whole with fog drawn on screen (Atlas's way; a player's device holds the
   unexplored art), was a visibility leak by Verso's rule. Decided: while a
   scene has fog, a player is served its map **only as tiles, with the
   pixels under fog blanked on the server, at every level of the pyramid**
   (B3): a tile wholly under fog is not served, a tile partly under it is
   served masked; the coarse top levels, which always cover fog somewhere,
   are masked like the rest. Masked tiles are made per request or cached per
   fog state; their cost is measured first (Q19). The same masking serves
   sight (item 10).
   **The amendment to 0090, decided**: 0090's revision of 2026-10-15,
   pick 1, says *"only a PNG is cut into tiles"*, because a JPEG or a WebP is
   decoded whole (a 16,000-pixel JPEG is about 1 GB decoded, the server's
   whole memory). For a fogged map, a JPEG or WebP (under Q19's pixel bound)
   is **converted once by the game master's device, never on the server**
   (b2); fog only on PNG maps (b1) was not taken.
   `[PROPOSED]` **the converted form — his to confirm before T11** (his doubt
   about PNG's size): not one big PNG, but **the tiles themselves, cut once
   by the game master's device** into a pyramid of small tiles (for example
   256 × 256 px) in a compact format — WebP, lossless for drawn maps, lossy
   at a stated quality for painted art — and kept in the tile cache 0090
   item 4 already keeps outside the folder (on a server, in its data
   directory). The server then **decodes one small tile at a time** to mask
   it, so its memory per request is bounded by the tile, whatever the map's
   size. This answers 0090 pick 1's memory concern differently: not by a
   rule on the picture's format, but by the server never decoding the whole
   picture; a PNG map may take the same path. If the tiles are missing (a
   cache lost, a scene opened first on a player's device), a player is
   served the scene fully covered (fail closed) and the game master is asked
   to open the scene to make them. To measure in the step: whether the
   webview encodes WebP (WebKit's canvas may not; then the encoding is done
   in Rust on the device, or the tiles are PNG), and the game master's phone
   decoding an 8,192-pixel picture once.
   **The tile upload, the masking and the caches** (N-I9), part of T11 and
   of its measuring task:
   - **Who uploads**: `[PROPOSED]` the game master only, from a device
     acting as him (never a capped device, item 22); each tile's bytes and
     **exact pixel size checked from its header before it is decoded**; the
     tile count bounded (an 8,192-pixel map is about 1,400 tiles of 256 px;
     a 16,000-pixel PNG about 5,300), and the cache's size on disk bounded,
     figures `[PROPOSED]` in the step.
   - **The server-side encoder**: a partly masked tile is **re-encoded on
     the server**. Lossy WebP is, as far as known, not in the pure-Rust
     `image` stack (it encodes lossless only) — to check; otherwise a C
     dependency (CLAUDE.md §4, `cargo-deny`) or masked tiles go out as PNG or
     lossless WebP, larger. **The encoder is named and its licence checked
     before the tile format goes to him for confirmation.**
   - **The right on the board is fenced**: the masked tiles served by the
     board's right, not the picture's, are only those of **the scene's named
     map node** (Q0), only tiles **the game master's device cut**, keyed by
     (board, scene, picture hash) — never a path around `may()` for any
     other picture.
   - **Masking cost**: masks change with every explored cell and, live
     (Q5b), up to five times a second, so the cache is per scope unit per
     sight state; a tile is re-requested **only where its own mask
     changed**; a figure for maskings per second per account `[PROPOSED]`,
     measured first (Q19's list has none). At the coarse levels a mask's
     edge **rounds toward covered**.
   - **The client's caches** (0090 item 4's tile cache, the browser's) are
     per device, not per account: they are **keyed by account and dropped at
     sign-out**, so the game master's unmasked tiles are never there for the
     next account on a shared laptop (a row in item 14).
   - **Link readers** (0087, unsigned): `[PROPOSED]` served a fogged scene
     only from masks already cached, or fully covered — never masking per
     request for them (unbounded work on the 1 GB server, 0083).
   **Watabou's two pictures** (the maintainer, note *decisoes-2026-11-15*,
   2.3: *"B"*, *"junto com a névoa da ADR 0121"*): Watabou exports the same
   picture with and without the secret rooms (*View › Secret rooms*); a
   scene may hold both, the game master's (with) and the players' (without),
   of the same size and placement, and a player is served the players'
   picture's tiles, masked like any map. It is the same mechanism as the
   fog — a different picture per viewer — built in **T11**; 0120's `[OPEN]`
   on it now points here. How the two pictures are told apart (the person
   says which, or a name convention) stays 0120's `[OPEN]`.
   `[DECIDED 2026-11-15] Q6b` **the picture file itself while it is a fogged
   map** (B4) — **(a)** (the maintainer: *"vamos de A para avaliar o
   fluxo"*: taken to evaluate the flow in use). The same picture can be on
   another board, in a note, or a copy; a device that synced it before the
   fog; the browser's cache; its version history (0091); `board_preview`;
   hover preview (0085); "show to the table" (0110 item 9); the board
   exported as a picture (0090 item 6) by anyone; share links
   (`share_board.rs`). Decided: painting fog on a scene **asks the game
   master to set the map picture to "Does not see"** through the one model
   (so `may()` stays the only answer and the Access dialog shows it), and
   **warns when the picture was already served or synced** ("already on
   Ana's device"); the masked tiles are then served by the right on the
   board, not on the picture (a rule of its own, named here). **Not
   reversible**: covering again does not take back what was already served
   or synced; the dialog says so.

10. **Token vision.** `[PROPOSED]` per token `vision` (`range` in units or
    unlimited, `angle`; darkvision, item 11); walls stop it.
    `[DECIDED 2026-11-15] Q5` where sight is computed — **(a), on the
    server** (the maintainer: *"A"*): a pure function in `verso-core` (no
    IO; the same code in the app-as-server, 0117). With it, **the projection
    itself (`see`, `shape_canvas`) moves from `verso-server` to
    `verso-core`** (I6) — **first, as its own step T0b** (N-I12): a pure
    move before T1, same tests, `board_sight_tests.rs` unchanged as the
    proof, so the steps that change the projection (T1, T4, T5 …) change it
    in one place — so the desktop's play view and player window show,
    through the contract (invariant 1), exactly what the server would serve,
    with or without a server. The player's shadow receives only the elements
    in sight, the explored map (Q18) and the sight outline to draw; nothing
    unseen is sent (Atlas sends walls and unseen vision tokens to the page).
    `[DECIDED 2026-11-15] Q5b` **when** — **both, configurable** (the
    maintainer: *"ambos, configurável, ah, deveria ser possível mover ou com
    as setas ou com wasd"*): a scene setting chooses **on drop** or **live
    during the drag** (`[PROPOSED]` on drop by default). Live, the drag's
    positions (a presence, Q14) are fed to the sight function at most 5
    times a second per account (Q19), and the drop is still the one edit.
    **Only judged positions feed sight** (N-B1): a drag position is fed to
    the sight function **only if the move from the last accepted position to
    it passes the same check as a drop** (walls, the scene's bounds, the
    pause; `judge_move`, item 5); a position that does not pass is ignored
    and sight stays at the last one that did; **explored memory and ghosts
    change only on positions that passed**. In a paused scene a drag is
    neither relayed nor fed (item 20). Said plainly: in live mode a token's
    sight stopping at a wall shows where the wall is, at 5 Hz — covered by
    the oracle he accepted (Q14b); the `[PROPOSED]` *"never says where along
    the path the wall stands"* holds for *on drop* only. Canary (T12): a
    drag through a wall serves nothing beyond it.
    A key press (arrows or `W A S D`, item 5) is a one-cell move judged as a
    drop; `[PROPOSED]` presses beyond the pace coalesce into one move,
    judged one cell at a time and stopped at the first refused (item 5).
    `[DECIDED 2026-11-15] Q7` whose sight — **(a)** (the maintainer: *"A"*):
    each player sees by their own tokens; the scene's switch "the party
    shares sight" is the *per party* value of the fog scope (Q4), beside
    *per player* (the default) and *per token*. The game master sees all,
    with the players' sight outlined.
    **The game master's token view** (Q4's answer): a click on a token shows
    the game master **only that token's sight** — its sight, and under the
    scope its explored memory and ghosts, as the projection would serve its
    player — until he clicks the ground, presses Escape or "See all". It is a
    view only, built on the projection in `verso-core`; nothing is served to
    anyone. `[PROPOSED]` (N-M9): he also sees each scope unit's ghosts and
    may remove one ghost (not only "Forget explored").

11. **Dynamic lighting** (light sources, darkness, darkvision, time of day).
    `[DECIDED 2026-11-15] Q10` — **(b), planned together** (the maintainer:
    *"B"*); it is step T13, after vision. `[PROPOSED]` design:
    - **Light sources**: a light carried by a token (`verso.token.light`:
      bright and dim radius in units, angle, colour) or placed in the scene
      (`verso.scene.lights`, relative to the scene); walls whose `blocks`
      include `light` stop it (item 7).
    - **Darkness and time of day**: per scene a light level the game master
      sets (`verso.scene.light`: daylight, dim, dark, or a time of day).
    - **Darkvision and other senses**: per token a range within which
      darkness does not hide (`vision.darkvision`).
    - **What a player sees**: their sight (item 10) narrowed to what is lit
      or within their token's darkvision, computed on the server by the same
      pure function in `verso-core` (Q5).
    - **Secrecy: lights are like walls, never served raw.** A player is
      served only the outline of what their tokens see, lit or dim, as part
      of their sight outline; never a light source's position, radius or
      colour, a light outside their sight, another token's light or senses,
      or the scene's darkness setting — only its effect on what they are
      served. Rows in items 1 and 14. Said plainly (N-M7): a lit outline
      implies its source — the arc of a light spilling through a door tells
      where the unseen light stands. Fiction allows it; whether it is
      accepted is `[OPEN]` for him, with T13. Fallback if lit sight is too
      costly live: lighting recomputed on drop only.
    - **Bounds**: a bound on light sources per scene and on the cost of the
      lit sight, figures proposed and measured in T13 (Q19's list carries
      none); measuring first, on VM 107 and the maintainer's phone.

12. **Initiative in the Table panel.** `[DECIDED 2026-11-15] Q9` — **much
    simpler than proposed** (the maintainer: *"essa parada de iniciativa ta
    com uma complexidade que acho que não precisa, seria basicamente. uma
    ordem de personagens com check de já agiu ou não"*): the tracker is **an
    ordered list of characters, each with an "already acted" check**. No
    rounds engine, no turns, no delay, no roll built in. `[PROPOSED]`
    details: entries from the tokens of the scene shown (or notes with no
    token); the game master orders the list by hand (drag, or keys);
    "clear the checks" starts the list again; rolling initiative stays the
    Table's ordinary dice (0088, 0107); ticking an entry writes nothing to
    the log. Where the list is kept: `[PROPOSED]` as recommended under Q9
    when it was asked — the server's database per table, as the log (0107
    item 5 as decided); for a local folder, outside the tree (0011), as item
    8; "Add to note" for a record — his answer reshaped the tracker and did
    not take up the place, so T6's PR confirms it.
    `[DECIDED 2026-11-15] Q15` **what players see of it** (B7) — **(a)**
    (the maintainer: *"A"*):
    - each entry has a **shown to players** state, default **hidden** for
      anything that is not a player's own character (a note the player
      edits);
    - the name a player sees is the token's public face (Q12), never the
      note's; an entry with no token and a hidden note is hidden; a hidden
      entry's check is not shown either; a "shown" entry of a hidden note
      with no public face stays hidden (N-M4);
    - a player's list is **only its shown entries, in their order**, with no
      positions, gaps or count of the others (as Q12's numbering) (N-M4);
    - the rolls of hidden entries are **secret rolls** (0107), and a hidden
      entry's turn is not written to the players' log — or, a game-master
      option, appears as "a hidden creature acts". With a tracker that rolls
      nothing and writes nothing to the log, these two clauses hold for any
      later step that adds either;
    - the fog step (T11) and the vision step (T12) each include "the tracker
      follows fog / sight" as part of the step.
    Said, not solved: the time the game master spends on hidden creatures
    is an oracle no filter removes.

13. **The play view and a player window.** `[DECIDED 2026-11-15] Q16` —
    **as recommended, plus the game master bringing everyone's view to a
    place** (the maintainer: *"pode ser recomendado, mas o mestre deveria
    conseguir mover todos para uma parte na cena ou board para dar foco ou
    mostrar algo"*). The play view is "Open the scene" (Q0): the scene's
    map, tokens, fog and sight in a focused renderer, for the game master
    and for players (each served their projection), and on the desktop a
    **second window** showing a scene as a chosen player — or "the table",
    the party's shared sight (Q7) — sees it, full screen on a TV, the camera
    following the party or paused. Built on "see as player" (0110 item 13,
    V.43) and on the projection in `verso-core` (item 10, moved in T0b), so
    it works with no server. **Two steps** (N-I12): the play view is
    **T7a** (needs T1, T4, T2, not V.43); the player window is **T7b'**,
    which **waits for V.43's "see as player"**, whose design in 0110 is still
    `[PROPOSED]`. `[PROPOSED]` in a local folder with no accounts, "a chosen
    player" is not offered: the window shows "the table" as a player with
    no token sees it (the painted fog and what is shown). Named framing
    shortcuts (viewports, Atlas's "saved frames") stay 0036.b, after V1
    ((b), not taken). Every later step (fog, sight) includes the play view
    as a read path.
    **Bring everyone here.** `[PROPOSED]` design: a game-master action, in
    the play view and on the board, that moves the camera of every viewer
    of that scene or board (players, the TV window) to the game master's
    present frame or to an element he picks. It is a one-off message the
    server sends only to viewers who see the board; **the message carries a
    rectangle in board coordinates, never an element's id** (an id the
    viewer may not see would be told, N-I11); at a fogged place it shows the
    fog there and nothing else; the viewers keep their camera after it (no
    lock); a viewer's drag in progress is not dropped by the camera move
    (N-M10); with reduced motion it jumps instead of gliding; it is
    announced politely without naming the place ("The game master moved
    your view"), so no name under fog is told.

14. **Every read path** (I12, B4). Replaces the first draft's parenthesis. A
    row per path, as 0110 item 18; **a canary per row** (a token, a card and
    a drawn element under fog and out of sight; a secret door; a hidden
    note's token; a light outside sight; a token's later moves after it left
    sight) is the acceptance of T11 (and of T12, T13, T14 for their rows),
    and the rows marked T0/T4 are accepted in those steps. Every **write**
    path of a token's position is in item 5's table, each ending in one
    judge; the roles each row applies to: item 22.

    | Path a non-game-master reader has | Who filters | Test |
    |---|---|---|
    | The board file's bytes (read, `read_text`) | the projection, key allowlist (item 1) + scene geometry | canary absent from the bytes (T0, T11) |
    | Sync to a player's device; the projected file's revision (`revision_of`) | the projection; sync of a fogged board debounced (Q19) | canary absent on the device; no revision change for a move out of sight, nor for a change whose projection is equal (item 1) |
    | The board's room and the shadow (0113 H), the read-only shadow (Q8) | `board_sight` (join, updates, `lay_over`) | canary never in a room message; an edit to an unseen id refused |
    | Presence: pointer, laser, selection, drag, ruler | `presence::for_player` (Q14) | a drag and a ruler under fog never relayed |
    | Map tiles at every level | the tile server, masked by fog and sight (item 9), one small tile decoded at a time | top level and edge tiles blanked under fog; missing tiles serve the scene covered |
    | The map picture's own file and URL; the same picture on another board, in a note, as a copy | `may()` with the picture set to "Does not see" (Q6b) | the file refused to a player |
    | A token's picture from its note's frontmatter (item 4) | the note's access, then the picture's `may()` | a hidden note's frontmatter picture never served as a token's face |
    | Ghosts (Q18) | the server, from what it served: frozen at the moment the token left sight; the record holds only id, cell and frozen public face (item 15) | a token's moves, bar, name and deletion after it left sight never reach the player; under *per party*, a ghost of a hidden note's token never carries the note's name to the account that does not see the note |
    | Lights, darkness, darkvision (item 11) | the sight function on the server; only the lit sight outline served | a light outside sight absent; no light's position or radius in any message |
    | Teleport points and where they lead (item 21) | the projection (Gone unless shown) | a hidden point and its destination absent; the destination's scene served only by the token's arrival |
    | A refused move's answer (Q14b, item 20) | the move check (`judge_move`, item 5): one answer, no position | the answer says "blocked" or "paused", never where the wall is (on drop; live sight: item 10) |
    | Live sight during a drag (Q5b) | sight fed only from positions that passed the move check (item 10) | a drag through a wall serves nothing beyond it |
    | The client's tile and picture caches (0090 item 4; the browser) | keyed by account, dropped at sign-out (item 9) | after the game master signs out of a shared device, no unmasked tile for the next account |
    | "Bring everyone here" (item 13) | sent only to viewers who see the board, as a rectangle, never an id; the camera shows each viewer's projection | nothing under fog shown at the target; no name or id in the message or the announcement |
    | History and `history_copy` (0091) | the same projection over every version, with today's fog | an old version never served unfogged |
    | Conflict copies of a board | a `(conflict)` copy keeps the original's access and fog | canary absent in the copy |
    | `board_preview` (`reader.rs`), hover preview (0085), thumbnails | the projection | canary absent in the preview |
    | "Show to the table" (0110 item 9) | the projection of each viewer | canary absent |
    | Export of a board as a picture (0090 item 6), by anyone not the game master | the projection | canary absent in the picture |
    | Share links and their readers (`share_board.rs`, 0081, 0087) | the same projection (fog applies to every non-owner reader) | canary absent for a share reader |
    | Search and the index (a card's text, a file card under fog) | the query, with the fog state (the index is per folder, not per viewer) | a word under fog not found |
    | Backlinks, unlinked mentions (0089), the graph | the query, with the fog state | no link from a fogged card |
    | "New" notices (0084) | the notice's audience, with the fog state | no notice naming a fogged card's note |
    | The Table log and initiative (0107, item 12) | the entry's shown state, secret rolls (Q15) | a hidden entry's name and check absent |
    | Side panel lists (pins, tokens) and the board's outline; the player's "in sight" list (item 16) | built only from what the server served | canary absent from the list |
    | The play view and the player window (item 13) | the projection in `verso-core` | the TV shows no canary |
    | `verso mcp` on a player's device | reads the projected copy only; no server-side MCP path without the projection | canary absent through MCP |
    | An agent's write to fog, walls or lights (the game master's MCP) | invariant 8: a write to secrets, with a visible diff | — |
    | What a device or browser already holds | **nothing can filter it**: covering again or resetting does not take back what was served (Q6b, Q4) | the warning shown |

15. **Bounds** (0083; I7). `[DECIDED 2026-11-15] Q19` — **(a), the figures
    as a starting point, measured before they are fixed** (the maintainer:
    *"A"*): per scene at most 4,000 wall segments, 300 tokens, a fog outline
    of 20,000 vertices after merging; at most 16 scenes per board; sight
    computed at most 5 times a second per account (through `pace.rs`);
    explored state at most 512 × 512 cells per scene; a fogged JPEG or WebP
    map at most 8,192 pixels on its longest side (converted on the game
    master's device, item 9); device sync of a fogged board debounced to one
    change every 2 seconds. Per-move cost: with vision, a drop recomputes
    sight for each player and changes each player's projection, so live play
    goes through the room and the file sync is debounced; live sight during
    a drag (Q5b) and lighting (item 11) add to it. **A measuring task is the
    first item of T11, T12 and T13**, on VM 107 (1 core, 1 GB) and on the
    maintainer's phone, as 0090 item 4 did.
    `[DECIDED 2026-11-15] Q18` **explored memory** (I3) — **(a) and (b):
    explored areas and ghosts** (the maintainer: *"A e B, essa parte do
    fantasma é bem maneira"*). Explored memory is **per grid cell** (bounded
    by the grid, cheap on the 1 GB server; a scene with vision needs a grid,
    or an implicit one), kept per unit of the fog's scope (Q4: player, party
    or token). **A cell is remembered as explored only when the whole cell
    was in sight** (N-B4): a cell seen in part is served only inside the
    live sight outline and goes back to covered when sight leaves it, so
    explored is always a subset of what was seen — a wall crossing a cell
    never lets the strip of floor beyond it be served. Canary (T12): a
    secret room one wall away from an explored corridor has no pixel served.
    An explored area serves **the map, what the game master marks
    static, and the ghosts**, never a live token or anything that changed
    since it was last seen (the monster that moved behind the party stays
    unseen; its ghost stays where it was seen). "Forget explored" and "Reset
    fog" (Q4) exist, and cannot take back what a device holds.
    **Ghosts** (last-seen positions of tokens). `[PROPOSED]` rules, so that
    **a ghost never tells more than was seen** (0110 item 18):
    - a ghost is made by the server when a token it served to that account
      (or scope unit) leaves its sight. **A ghost stores only the token's
      id, the cell where it was last served, and the token's public face
      (Q12) frozen at that moment** (N-B3) — never the note's path, name or
      picture, whoever it was served to. When it is drawn, a viewer who may
      see the note is drawn the note's present face by their own right (it
      is theirs to read); every other viewer, the frozen public face. So
      under *per party* or *per token* (Q4) a ghost shared by several
      accounts carries to none of them more than the public face. A token
      with no public face leaves no ghost (below);
    - it is **frozen**: the token's later moves, its bar, a changed name or
      picture, its deletion or its being made `secret` are never reflected;
      the ghost goes only when its cell comes into sight again (the viewer
      then sees what is there now), or by "Forget explored" or a reset;
    - a token never served to the account leaves no ghost; nor does one
      with no public face (Gone, Q12), one already `secret`, or one the game
      master hides while it is in sight (his hiding wins);
    - kept with the explored state (outside the file), at most one ghost per
      token per scope unit (bounded by Q19's 300 tokens);
    - drawn faded with a "last seen" mark, not told by colour alone; listed
      as "last seen" in the player's text equivalent (item 16);
    - the game master may turn ghosts off per scene.

16. **Accessibility and languages** (0035; I11). Requirements per step:
    - **T1** grid: hex keys — six neighbours, mapped to the keys (`Q W E A S
      D`-style or arrows plus a modifier, `[PROPOSED]`); grid contrast over
      any map at the 3:1 floor of 0109.
    - **T4** tokens: listed in the side panel as the pins are (0090 item 7),
      each named after its public face (or its note, for the game master); a
      touch target that keeps its size at low zoom; the bar's value as text
      and its state not by colour alone. **T10**: moved by the arrow keys or
      `W A S D` one cell at a time (Q5b); on a hex grid by T1's keys.
    - **T4b** token maker: the crop and the border set by keys and fields,
      not by pointer only.
    - **T6** initiative: the tracker is a list operable by keyboard (order,
      check), each check a real checkbox with its name.
    - **T7b**: the moved view announced politely, with no place named.
    - **T10** the pause: shown as text and icon (not colour alone),
      announced politely; a refused move announced.
    - **T11** fog: painting by cells and by room without a pointer; fog vs
      explored vs seen vs ghost not told by colour alone; the game master's
      text equivalent ("3 areas hidden"); the **player's** text equivalent —
      what is in sight and what was last seen, as a list made only from what
      the server served.
    - **Phone** (0076; the game master's device too, the maintainer tests
      there): drag-a-token vs pan vs paint-fog on one finger by an explicit
      mode switch; the tracker, the pause and the fog tools reachable at
      390 × 844 and in landscape, every hide with a way back.
    - Reduced motion honoured for token glide, camera follow and "bring
      everyone here"; pt-BR and English.

17. **Atlas VTT: what may be read, what may not be taken** (I10).
    `[DECIDED 2026-11-15] Q20` — **another rule than the fence proposed**
    (the maintainer: *"não vejo problema algum abrir o código do atlas vtt,
    nosso sistemas é em outra linguagem e outro paradígma"*): **reading
    Atlas VTT's source is allowed**, to learn how a feature behaves. The
    survey's reading of UI strings and doc comments is thereby admissible.
    What his answer does not say, and rests elsewhere (N-I13):
    - **Copying its code is not allowed** — not by this answer but by the
      licences: Atlas is AGPL-3.0-only and Verso is MPL-2.0
      ([0005](0005-license.md)), and 0090 already left Atlas's code out
      (*"not copied"*). Names and structures stay Verso's own (0120's
      `walls` format, the board's vocabulary).
    - `[PROPOSED]` **nor translated** into Rust or TypeScript — the author's
      legal caution, **his to confirm**: a line-by-line port of AGPL code is
      the risk that matters, though "another language and paradigm" may make
      it look like none.
    - `[PROPOSED]` **a record of what is read**: a PR whose author read
      Atlas's source says **which files, for which behaviour**; the
      algorithm it implements cites a public description (a paper, an
      article), not Atlas; no Atlas file is open while the code is written. Any
    geometry library for sight or collision is a new dependency (CLAUDE.md
    §4): `[PROPOSED]` none, pure code in `verso-core`.

18. **What is not taken now.** `[DECIDED 2026-11-15] Q17` (the maintainer:
    *"gerador de masmorras pode vir para o roadmap, seria massa, bem como
    geração procedural de mapas hexagonal ou geradores de mapas de
    pointcrawl. Mapas animados para depois, sobre andares e telhados,
    poderia ser apenas um mecanismo de teletransporte de tokenentre cenas
    ondeo mostre liga dois pontos. Seriamaneiro"*). Of the list offered:
    - **levels and roofs**: answered by **a teleport of tokens between
      scenes**, the game master linking two points (item 21, step T14);
    - **a dungeon generator of our own**: to the roadmap (it was "Watabou
      covers it, 0120"); with it, his additions **procedural hexagonal map
      generation** and **pointcrawl map generators** — three roadmap rows
      (After V1, items 12–14), phase to be decided;
    - **animated maps**: later (After V1, item 15);
    - the rest stands as not taken, each needing its own request (his answer
      named only the above): TrueScale, spell-effect animations, auras,
      encounters, kept area templates, game-system presets beyond 0015,
      sound moods (0116's later items).

19. **The token maker** (Q2, his request; `[PROPOSED]`, his to confirm
    before T4b). As Atlas has (*"Tokens from images, with a ring, crop,
    default size"*, the survey): from a picture of the folder (or one
    dropped in), the game master — or a player for their own note — places
    a **round crop** (pan and zoom inside a circle) and a **border** (a ring:
    width and colour, from the theme's tokens or picked), and Verso writes a
    **new picture file** (WebP, or PNG where WebP cannot be encoded) beside
    the note or in a folder he picks — never over the source picture — and,
    by the same action, sets the note's token property (item 4) to it. It is
    a user action with the written result shown (invariant 8's spirit); the
    property write goes through the ordinary property edit, with the
    concurrency check (invariant 11) and nothing else in the note touched
    (invariant 7). Made on the device, in the page; nothing new on the
    server. Starter token packs are not part of it.

20. **Pausing a scene** (Q3b). `[PROPOSED]` design: a switch of the game
    master's on the scene, in the play view and on the board ("Pause the
    scene"). While a scene is paused the server refuses **every player's
    move and edit inside the scene** (`MoveToken`, key moves, a drop) with
    one answer ("the game master paused the scene"), and **neither relays
    nor feeds to sight** any player drag of it (item 10); the game master
    moves anything. The pause is session state,
    kept beside the explored state (item 8), never written to the board
    file (0012); every viewer is told the scene is paused (item 16). The
    Table's dice and chat are not paused. `[PROPOSED]` (N-M8): a click on a
    token's bar (a write to the note, not the board) is not refused by the
    pause; the module gets a name other than `pause.rs`, which already
    exists in `verso-server` as a test hook.

21. **Teleport between scenes** (Q17's answer to levels and roofs).
    `[PROPOSED]` design: the game master places two points and links them —
    in two scenes of the board (two floors, a cave and its exit), or two
    places of one scene; `[PROPOSED]` a pin node carrying
    `verso.teleport: {"to": <the other point's id>}`, both ways or one way.
    A token whose accepted move ends on a point is moved by the server to
    the linked point (it stays the same token of the same note); the
    player's play view follows it to the other scene. A point is Gone for
    players unless the game master shows it (a hidden trapdoor), and where it
    leads is never served: a player learns the destination only by arriving,
    and then sees what the token sees there. Its rows in items 1 and 14.
    Rules (N-I11):
    - **A teleport fires only on a move that ends on a point, never on an
      arrival by teleport**, so a two-way link, or an arrival cell that is
      itself a point, never loops.
    - **The far end paused**: a refusal saying "paused" in a scene that is
      not would tell the player a hidden point is under that cell. `[OPEN]`
      for him: the answer is the plain "blocked", or the move is accepted
      without the teleport. A paused scene at the near end refuses the move
      itself, as any move (item 20).
    - **The destination**: an occupied cell does not refuse (tokens never
      block tokens, item 5); `[PROPOSED]` the editor refuses a point placed
      on a wall; a destination scene whose tiles are missing is served
      covered on arrival (item 9's fail-closed rule).
    - `[PROPOSED]` **both points are on one board**: scenes of two boards
      are not linked (his words were *"entre cenas"*; two boards would be a
      new request); "two places of one scene" and one-way links are the
      author's, as above.
    - Where vision is on, the arrival computes sight there (T12), so T14
      needs T12 for such scenes.

22. **Roles inside a scene** (N-I7; before T4, the first step that serves a
    player something a share editor is not served). The rules above are
    written for a table; `[PROPOSED]` where he has not spoken, fail closed:
    **everyone who is not the game master is treated as a player with no
    token**.

    | Role | Sees fog and walls | Edits inside a scene | Moves a token | Uploads tiles | Pauses |
    |---|---|---|---|---|---|
    | The table's game master (the folder's owner, 0110) | yes | yes | any | yes | yes |
    | A co-game-master (an editor of the folder, served it whole: 0110, 0113 C3) | yes (as today, served the folder whole) | `[PROPOSED]` yes | `[PROPOSED]` any | `[PROPOSED]` no | `[PROPOSED]` no |
    | A table player | no (item 1) | no (item 5) | their own (`MoveToken`) | no | no |
    | The folder's owner, on a board outside any table | `[PROPOSED]` the game master of its scenes | yes | any | yes | yes |
    | A capped device (the owner's paired phone, 0117) | as its capped role | as its capped role | as its capped role | no | as its capped role |
    | A share's editor (live in a shadow since V.49, `c36fa5e4`) | no | no | none (no table, no sheet) | no | no |
    | A share's reader (0081) | no | no | none | no | no |
    | A link reader (0087, unsigned) | no; a fogged scene from cached masks only, or fully covered (item 9) | no | none | no | no |

### Order and size

Sizes are the author's estimate (S days, M about a week, L two to three
weeks, XL more), grown where the review's fixes and the answers of
2026-11-15 add work; they are not a plan. The order fixes the review's I4
and I5: the allowlist first; readers in a read-only shadow before anything
is called "shared"; the wall editor before players move tokens; the player
window after the fog it must honour. The second reading added T0b (the
projection moved first) and split T7 into the play view (T7a) and the
player window (T7b'). (The columns for Q0 (b) and (c) were dropped once (a)
was decided.)

| # | Step | Size | Needs |
|---|---|---|---|
| T0 | Key allowlist in the projection: top level (built), then nodes', edges' and drawn elements' `verso`; **first the inventory of every key the code writes there, with a test that fails on an unclassified key** (item 1); `check` refuses a non-game-master's put carrying or changing a key outside the allowlist (Q0's rules); canary test | S–M | — (top level built, `942359ac`); his word on unknown non-`verso` node keys |
| T0b | The projection (`see`, `shape_canvas`) moves from `verso-server` to `verso-core`: a pure move, same tests, `board_sight_tests.rs` unchanged as the proof (item 10) | S | T0 |
| T1 | Scenes (a group with `verso.scene`, naming its map node) and their grid: square and hex, alignment, snap, numbers; fail-closed drift record (group box, map node's id and box, picture hash); **inside a scene's box a non-game-master changes nothing** (Q3's refusal half); an equal projection sends nothing (item 1) | M | T0, T0b |
| T2 | Table players who only see a board in a read-only shadow (Q8; the first reading's T7a): **measuring first** (six shadows on VM 107; the phone joining) | M | — |
| T3 | Ruler in units, live; Q14's presence rule | S | T1; shared with readers after T2 |
| T4 | Tokens: note cards, the picture from the note's frontmatter, public face, size, snap, bar, per-viewer numbering | L | T1; shared after T2; the roles table (item 22) written |
| T4b | The token maker: round crop and border, a new picture file, the note's property set (item 19) | S–M | T4; his confirmation |
| T5 | Hide a drawn element from players: the flag in `customData.verso.secret` (which `is_secret` already reads), its menu, spec §5.11, tests | S–M | T0 |
| T6 | Initiative: an ordered list with "already acted" checks, shown/hidden entries, public names (Q9, Q15) | S–M | T4 (public face); his word on where it is kept |
| T7a | The play view ("Open the scene") | M | T1, T4, T2 |
| T7b' | The player window (second screen / TV) | S–M | T7a; V.43's "see as player" confirmed and built |
| T7b | "Bring everyone here": the game master moves every viewer's camera to a rectangle of the scene or board | S | T7a |
| T8 | Wall and door editor: **measuring the node's size first** (4,000 segments; a door toggled; VM 107 and the phone); canary: fifty wall edits, zero messages to a player's shadow | S–M | T1, T0 |
| T9 | Universal VTT import into a new scene with walls (lights dropped): **measuring the node's size first**; the dialog offers "players do not see this picture yet" before the file is written | S–M | T1, T0 |
| T10 | Players move only their tokens (`MoveToken`, only `x`/`y`, inside the scene it started in), by drag or by arrows / `W A S D`; every wall blocks; **every write path ends in one judge in `verso-core`** (item 5's table, a canary per row); the pause | M | T2, T4, T8 |
| T11 | Manual fog: **measuring first** (with the tile upload's bounds and maskings per second); painting; reset; the projection on every path (item 14); map tiles cut by the game master's device, uploaded within bounds, masked one at a time, keyed by (board, scene, picture hash); client caches keyed by account; the picture's access; **Watabou's two pictures (with and without secret rooms, his answer 2.3)**; tracker and play view follow fog | XL | T10, T7a; his confirmations before the step (Status) |
| T12 | Token vision on the server, on drop or live (only judged positions feed sight); the fog's scope (player, party, token) and its changes; explored memory (whole cells only) and ghosts (id, cell, frozen public face); one outline served; the game master's token view; **measuring first**; tracker and play view follow sight | XL | T11; his confirmation of the combination rule and the ghosts' rules |
| T13 | Dynamic lighting: light sources, darkness, darkvision, time of day; never served raw; **measuring first** | L–XL | T12 |
| T14 | Teleport of tokens between scenes, two points linked by the game master (item 21's rules) | M | T10, T11; T12 where vision is on |

T0 to T9 can each ship alone (T0b right after T0; T4b, T7b' and T7b after
the step they extend); none is free of secrecy work: T3 and T4 depend on
Q14 and Q12, T6 on Q15, T9 on T0. **T0 first, complete; nothing else merges
before it.** T10 to T14 are the big block, in that order because each one's
secrecy rests on the one before.

`[DECIDED 2026-11-15] Q1` **when** — **inside V1** (the maintainer, 1.2: *"B"*; roadmap row V.55). The recommendation was after V1, as its own phase, T0–T7
first. The top-level part of T0 was a fix of a leak and did not wait for
this ADR (Context). V1 already carries its blockers and V.43, on which
T7b' depends. Whether the V1 release waits for all of V.55 (T11–T13 are two
XL steps and one L–XL) or for an earlier step is his to say (Status).

### The presence and wall rules

`[DECIDED 2026-11-15] Q14` **presence under fog and sight** (B6) — **as
recommended** (the maintainer: *"sua sugestão"*). Today a player's presence
is an allowlist (`user`, `pointer`, `button`, `selected` cut to what it sees
— 0113 S7). Decided: a drag or a ruler is relayed to an account only while
**both ends and the dragged element** are in what that account sees (the
element's class and its fog and sight), decided by the server in
`presence::for_player`; the game master's pointer and laser are cut inside
fog for players; a canary test for presence under fog. (A "hide my pointer
while preparing" switch, on by default, was not taken.)
`[DECIDED 2026-11-15] Q14b` **the wall check as an oracle** — **(b): every
wall always blocks, and the player discovers it by trying** (the
maintainer: *"B - acho que todo vtt faz assim"*). A move is checked against
every wall along its path, seen or not, move-only walls and closed or
locked doors included, and a move into fog is allowed (Q13). A refused
drop tells the player a wall is there — in fog too, and for a move-only
wall, which is invisible by definition — and probing drops would map the
walls: **this oracle is accepted**, as every VTT has it. It is the one
exception, for walls, to 0113's review of S7, (1) *"No activity oracle"*.
`[PROPOSED]` to tell no more than the wall's existence: the move is refused
whole (the token stays where it was), with one answer ("blocked") that
never says where along the path the wall stands.

## Consequences

- Spec §5.11 (the v0.43 note: a canvas has no dialect fixture) gains
  `scene` (`grid`, `fog`, `walls`, `vision`, `lights`, the settings),
  `token` (with `light`), `teleport`, the note's token property, and the
  drawn element's `secret`, with the core's property tests as the guardrail;
  Obsidian's keeping of the fields observed again (O4), including a scene
  moved and resized in Obsidian.
- Contract: initiative commands, the explored state and ghosts, the pause,
  "bring everyone here", the teleport, a token's sight (lit) in the shadow,
  the projection reachable from the desktop through `verso-core`, the tile
  upload from the game master's device; server first, then apps
  (contract-change rule). Bindings generated.
- Server and core: the projection becomes a key allowlist (T0) and moves to
  `verso-core` (item 10); `board_sight` learns scenes, fog, sight and light;
  a property test with canaries under fog and out of sight, on every row of
  item 14 (as `board_sight_tests.rs`); bounds per
  [0083](0083-security-hardening-of-universo.md) (Q19), measured on the
  1-core 1 GB VM.
- **Amendments decided by the answers of 2026-11-15**, recorded here; each
  amended ADR carries a one-line pointer to this ADR **now** (N-M2: 0090,
  0113, 0120), and its text is amended when the step that builds it is
  merged: 0113 section B (`MoveToken`) and K.6 (inside a scene a
  non-game-master writes only the position of their own tokens, Q3); 0090's revision of 2026-10-15, pick 2, and 0113 H (table players
  who only see a board follow it live, Q8); 0090's revision, pick 1 (a
  fogged JPEG/WebP converted on the game master's device, never the server,
  Q6; the tile form `[PROPOSED]`); 0113's review of S7, (1) *"No activity
  oracle"* (walls, Q14b); 0120 item 3 (walls move into the scene, Q0 (a));
  0120's `[OPEN]` on the players' picture without secret rooms, answered
  in its timing (note *decisoes-2026-11-15*, 2.3: with this ADR's fog, T11).
  0090 item 1 (*"a map is a board"*) stands: Q0 (b) was not taken.
- Risks: drawing grid, fog and sight over Excalidraw on a phone (one canvas
  in the card layer, redrawn on camera change, measured on the maintainer's
  phone) — only while editing, since play has its own view; drag traffic
  through the room (presence during the drag, one edit on drop), more of it
  with live sight (Q5b); lit sight's cost (T13); WebP encoding in WebKit
  (item 9); the game master's own phone as the host (0118) for sight compute
  and for cutting tiles.
- Each step: strings in both languages, changelog, a lesson in the demo
  vaults' board training, walkthrough steps, e2e in the harness and
  `e2e-server` (CLAUDE.md §5).

## Discarded alternatives

What was offered on 2026-11-15 and not taken (Q1 (a), after V1, and Q3's
reading (i) are in their lines above):

- **Q0 (c)**, the whole board as the scene: one map per board, secrecy on
  board coordinates. (Q0 (b), a scene file, is the fallback, not
  discarded.)
- **Q2 (b)**, a token as a drawing with no note behind it.
- **Q3b (a) and (b)**, "only on their turn" as a scene option or always:
  replaced by the pause.
- **Q4 (b)** everything in the board file (rewritten on every step);
  **Q4 (c)** everything on the server (the preparation lost when the folder
  changes server).
- **Q5 (b)**, sight computed on the player's device (a leak).
- **Q6 (a)**, the whole picture served and fog drawn on screen (a leak);
  **Q6 (b1)**, fog on PNG maps only.
- **Q6b (b)**, the picture hidden automatically while it is a fogged map (a
  second access rule).
- **Q7 (b)**, always the party's summed sight (it remains one value of the
  scope, *per party*, not the only one).
- **Q8 (b)**, readers following the saved file only.
- **The full tracker of the first proposal** (rounds, turns, delay, a roll
  with the statblock's `init`, the turn written to the log): Q9's answer.
- **Q10 (a)**, lighting not planned.
- **Q11 (b)**, no Universal VTT import.
- **Q12 (b)** a locked grey box (tells something is hidden); **Q12 (c)** the
  note's name and picture shown (a leak).
- **Q13 (b)**, an element shown when only partly outside the fog.
- **Q14 (b)**, a "hide my pointer while preparing" switch.
- **Q14b (a)**, moves judged only against seen walls, moves into fog
  refused, move-only walls not blocking players by default.
- **Q15 (b)**, everything shown and the game master hiding what he wants.
- **Q16 (b)**, viewports now (they stay 0036.b, after V1).
- **Q18**'s "no ghosts for now".
- **Q19 (b)**, changing a figure now.
- **Q20 (a)**, the fence "the build never opens Atlas VTT's repository":
  replaced by item 17's rule (read allowed, copy and translation not).
- **Running Atlas VTT inside Verso**: AGPL-3.0, and third-party plugin
  execution is out of scope until after V1 (invariant 16).

## Status

**Accepted (2026-11-15).** The maintainer answered every question, Q0–Q20,
on 2026-11-15: Q0, Q1 and Q3 first; Q2 and Q4–Q20 in his note
*decisoes-2026-11-15-vtt*. The second reading before building
([0032](0032-author-and-reviewer-roles.md)) is done and applied in place
(`docs/review/2026-11-15-adr-0121-second-review.md`): **T0–T9 may start,
T0 first and complete**; T10–T14 wait for the list below. Every other
`[PROPOSED]` item is confirmed in the PR of its step. Not built, but T0's
top level (`942359ac`).

**His to confirm before the step** (one list; each `[PROPOSED]` or `[OPEN]`
in its item; nothing here is decided until he answers):

| # | To confirm | Where | Before |
|---|---|---|---|
| 1 | **The tile format** of a fogged map: tiles cut by the game master's device, WebP lossless / lossy (his doubt about PNG's size), after the server-side encoder is named and its licence checked | item 9 | T11 |
| 2 | **The painted fog's scope**: one per scene (the author's reading), or per player / party / token like sight | item 8, Q4 | T11 |
| 3 | **Q4's storage as read from his answer** (painted fog in the scene node, compacted; explored state on the server) — he wrote neither "A" nor "sugestão" | item 8, Q4 | T11 |
| 4 | **What "Reset fog" restores**: fully covered, or back to how he prepared it | item 8, Q4 | T11 |
| 5 | **The drawn-dungeon rule**: no fog on a drawn dungeon until its import writes one group per room (cost: 0120's importer, S–M) | item 8, Q13 | T11 |
| 6 | **Readers' "new things start hidden" mode**: wanted or not (`[OPEN]`) | item 6 | T2 or T5 |
| 7 | **Q20's "nor translated"** and the record of which Atlas files a PR read | item 17 | the first PR that reads Atlas's source |
| 8 | **The token maker's visuals** (round crop, ring, where the file goes) | item 19 | T4b |
| 9 | **Where the initiative list is kept** (the server's database per table; outside the tree locally) | item 12 | T6 |
| 10 | **Whether T11–T13 gate the V1 release** (V.55 sits in "What blocks V1 release"; two XL steps and one L–XL) | Order and size; roadmap V.55 | the next release planning |
| 11 | How painted fog and sight combine (shown = not painted-covered and (in sight or explored)) and the ghosts' rules (id, cell, frozen public face; scope changes) | items 1, 8, 15 | T12 |
| 12 | What a later grant of a sheet inherits under *per token* (the token's memory, or nothing) (`[OPEN]`) | item 8 | T12 |
| 13 | Unknown non-`verso` node keys (another program's) not served to players — a visible change | item 1 | T0 merges |
| 14 | The import's "players do not see this picture yet" on by default or not (`[OPEN]`) | item 7 | T9 |
| 15 | A teleport whose far end is paused: plain "blocked", or the move accepted without the teleport (`[OPEN]`) | item 21 | T14 |
| 16 | Lit outlines implying where an unseen light stands: accepted or not (`[OPEN]`) | item 11 | T13 |
| 17 | Players drawing inside a scene: wanted or not (`[OPEN]`; not granted by Q3) | item 5 | T10 |

Items 1–10 are the ones the coordinating session named; 11–17 are the
second reading's other questions for him.

- **Q0** a scene — a `group` with `verso.scene` plus its play view; a scene
  file the fallback.
- **Q1** when — inside V1 (roadmap V.55).
- **Q2** a token — a note's file card; its picture may come from the note's
  frontmatter; a token maker proposed (item 19).
- **Q3** who moves it — only the player's own token, tied to their
  sheet/note (`MoveToken`; K.6 adapted inside scenes). **Q3b** — no turn
  rule; the game master pauses the scene (item 20).
- **Q4** fog — a reset; the scope per scene: per player, per party or per
  token; the game master's token view (his). The storage (painted fog in the
  scene, compacted; explored in the server's database, outside the tree
  locally), the painted fog's own scope and what reset restores are read
  from his answer, `[PROPOSED]`, his to confirm (list above).
- **Q5** sight — on the server, in `verso-core`, the projection moved
  there. **Q5b** — on drop or live, per scene; moves by arrows or `W A S D`.
- **Q6** the picture under fog — masked tiles at every level; JPEG/WebP
  converted on the game master's device (0090 pick 1 amended); tiles in a
  compact format cut by that device proposed. **Q6b** — set to "Does not
  see" with a warning, to evaluate the flow.
- **Q7** whose sight — each player's own tokens; the party's shared sight a
  value of the scope.
- **Q8** readers live — a read-only shadow for table players (0090 pick 2
  and 0113 H amended); share readers as today; a share's editor live since
  V.49 (the roles table, item 22).
- **Q9** initiative — an ordered list with "already acted" checks; where it
  is kept `[PROPOSED]` as recommended.
- **Q10** lighting — planned together (T13); lights never served raw.
- **Q11** Universal VTT — yes; pictures written out, lights dropped.
- **Q12** a hidden note's token — its public face; no face = Gone; coarse
  bar off by default; per-viewer numbering.
- **Q13** under fog — wholly outside the fog to be served; the scene-border
  rule and the drawn-dungeon rule `[PROPOSED]`.
- **Q14** presence — relayed only while both ends and the element are seen.
  **Q14b** — every wall blocks; the oracle accepted.
- **Q15** players and initiative — hidden by default but their own
  characters; public names; secret rolls.
- **Q16** the play view and player window — as recommended, plus "bring
  everyone here"; viewports stay 0036.b.
- **Q17** not taken — the dungeon generator, procedural hex maps and
  pointcrawl generators to the roadmap; animated maps later; levels and
  roofs as a teleport between scenes (item 21); the rest stands.
- **Q18** explored memory — per cell, and ghosts that never tell more than
  was seen.
- **Q19** bounds — the figures as a start, measured before fixed.
- **Q20** Atlas VTT — its source may be read (his); its code is never
  copied (0005, 0090); "nor translated" and the record of what was read
  `[PROPOSED]`, his to confirm.

Roadmap: V1, row V.55 (steps T0–T14, with T0b and T7a / T7b'); After V1, items 12–15 (the three
generators and animated maps, the maintainer's requests of 2026-11-15).

## Revision of 2026-11-15

What the review found and where this text answers it.

| Finding | Answered in |
|---|---|
| B1 top-level keys served whole | Context (the leak, fixed with an allowlist, `942359ac`); item 1 (allowlist of keys, nodes' `verso` too, per-key table); T0 |
| B2 "wholly under fog" | Q13 (wholly outside to be served, shape not box, edges, drawn dungeons cut by room) |
| B3 coarse and partly covered tiles | item 9 (b): pixels blanked at every level |
| B4 the picture's other paths | Q6b (the one model, the warning, not reversible); item 14 rows |
| B5 tokens of hidden notes, bar, numbering | Q12 (public face, Gone without one, coarse bar, per-viewer numbers) |
| B6 presence and the wall oracle | Q14, Q14b |
| B7 initiative and the log | Q15; T11/T12 include the tracker |
| I1 choices written as statements | Decision preamble (`[PROPOSED]` marks); Q12–Q20 |
| I2 the change to 0113 | item 5 (`MoveToken` in 0113 B; K.6 adapted, Q3; the per-board draw switch withdrawn) |
| I3 own token in fog, explored | Q13 (own tokens always Open), Q14b (moves into fog allowed, walls block), Q18 |
| I4 readers live amends two decisions; order | item 6 (the two sentences named and amended; share readers); T2 before T3/T4 |
| I5 the order | the step table (wall editor T8 before T10; T7a play view before T11; T6 needs T4 and Q15) |
| I6 a local folder; projection in the core | items 8, 10, 12; T0b (since the second revision) |
| I7 JPEG/WebP tiling, unbounded work | item 9 (0090 pick 1 amended; tiles cut on the game master's device); Q19 figures; measuring first in T11, T12, T13 |
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
| M6 sizes | the step table's preamble; T4, T6, T11 grown (T6 shrunk again by Q9's answer) |
| M7 tracker edit citation | item 4 (0099 item 5, invariant 11, refused without *Edits*) |
| M8 roadmap | roadmap item 11 updated in the same change |
| M9 survey wording | the survey, same change |

## Second revision of 2026-11-15

What the second reading
([`2026-11-15-adr-0121-second-review.md`](../review/2026-11-15-adr-0121-second-review.md),
`76c46135`) found and where this text answers it.

| Finding | Answered in |
|---|---|
| N-B1 live sight from unjudged drag positions | item 10 (only positions passing the drop's check feed sight; memory and ghosts only from them; the pause stops the feed); item 20; item 14 row |
| N-B2 one write path named; moves leaving the scene | item 5 (what a move is: only `x`/`y`, inside its scene, judged along the segment, key presses cell by cell, only the server moves between scenes; the write-path table ending in one `verso-core` judge); T10 |
| N-B3 ghosts per scope unit carrying a served face | item 15 (a ghost stores only id, cell and the frozen public face); item 8 (changing the scope; a later grant `[OPEN]`); item 14 row |
| N-B4 the painted fog's outline; a cell crossed by a wall | item 1 (one combined outline served once a scene has vision; the combination rule `[PROPOSED]`); item 15 (a cell remembered only when wholly seen) |
| N-B5 the map moving inside the scene | Q0's rules (`verso.scene.map`; drift record = group box + map node's id and box + picture hash; mismatch ⇒ fully covered; tiles keyed by picture hash; the Obsidian observation); T1 |
| N-I1 Q4 inferred; items for his word | item 8 (Q4's storage, the painted fog's scope, reset `[PROPOSED]`); Decision preamble; Status, "His to confirm before the step" |
| N-I2 numbering reopened; two unmarked rules; 2.3 missing | item 4 (the alternative removed); item 8 (the scene-border and drawn-dungeon rules `[PROPOSED]`, the latter's cost); item 9 and T11 (Watabou's two pictures); 0120's `[OPEN]` points here |
| N-I3 T0's node half without inventory | item 1 (the inventory and its test, edges and drawn elements, unknown keys `[PROPOSED]`); Q0's rules (`check` refuses keys outside the allowlist); T0 |
| N-I4 Q3 not in force T1–T9; "and drawing" | item 5 (the rule once; the refusal in T1, the exception in T10; drawing `[OPEN]`; "their token" `[PROPOSED]`; the old analysis moved to a background note); Q0's rules |
| N-I5 hidden keys as an activity oracle | item 1 (an equal projection sends nothing); T8's canary; item 14's `revision_of` row |
| N-I6 readers' shadows' cost; preparing in front of them | item 6 (measuring first in T2; "new things start hidden" `[OPEN]`) |
| N-I7 roles other than table game master and player | item 22 (the roles table, fail closed); item 6 (the share editor, V.49 `c36fa5e4`, a contradiction recorded) |
| N-I8 the import puts the map on devices before fog | item 7 (T9's dialog offers to hide the picture first; default `[OPEN]`) |
| N-I9 tiles from the game master's device | item 9 (who uploads, header checks, counts, the server's encoder and licence, the right fenced, maskings per second, rounding toward covered, client caches by account, link readers); item 14 row |
| N-I10 the scene node's size | item 7 (T8 and T9 measure first) |
| N-I11 teleport and "bring everyone here" | item 21 (fires only on a move ending on a point; paused far end `[OPEN]`; destination; one board); item 13 (a rectangle, never an id) |
| N-I12 the projection's move hidden in T7; T7 on V.43 | item 10 and the step table (T0b); item 13 and the step table (T7a play view, T7b' player window waiting for V.43) |
| N-I13 Q20 recorded with more than it said | item 17 (copying banned by 0005/0090; "nor translated" `[PROPOSED]`; the record of files read `[PROPOSED]`) |
| N-M1 roadmap states | roadmap V.55's step table (states for `[PROPOSED]` designs; a Needs column) |
| N-M2 amended ADRs carry no pointer | a one-line pointer added now to 0090, 0113 and 0120; Consequences |
| N-M3 the property's name | item 4 (a name less taken; resolved by the client) |
| N-M4 the tracker's order | item 12 |
| N-M5 `W A S D` | item 5 (where the keys act) |
| N-M6 tokens do not block tokens | item 5; item 21 |
| N-M7 lit outlines imply their source | item 11 (`[OPEN]`; the fallback) |
| N-M8 the pause | item 20 (the bar click; the module's name) |
| N-M9 the game master and ghosts | item 8 (*per token* serves the union); item 10 (he sees and removes ghosts, `[PROPOSED]`) |
| N-M10 "bring everyone here" during a drag | item 13 |
