# ADR 0121 — A virtual tabletop layer on the board: scenes, grid, tokens, walls, fog and vision, initiative

- Date: 2026-11-15; revised in place the same day (unfinished: rewritten, not
  superseded) after the reading
  [`docs/review/2026-11-15-adr-0121-review.md`](../review/2026-11-15-adr-0121-review.md)
  (7 BLOCKING, 12 IMPORTANT, 9 MINOR) and the maintainer's framing of the
  same day (Q0). Where each finding is answered: "Revision of 2026-11-15" at
  the end. Rewritten in place again the same day with **the maintainer's
  answer to every question** (Q0, Q1 and Q3 first; Q2 and Q4–Q20 in his note
  *decisoes-2026-11-15-vtt*, quoted in each `[DECIDED 2026-11-15]` line).
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
  again before building ([0032](0032-author-and-reviewer-roles.md)).
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

**Every question, Q0–Q20, was decided by the maintainer on 2026-11-15**
(each `[DECIDED 2026-11-15]` line quotes his answer). The items marked
`[PROPOSED]` are the author's design (field names, wall kinds, tools, the
ruler, the tracker's details, the token maker, the tile format, the ghosts'
rules, the lighting's fields); each is confirmed in the PR of its step, as
0110 did for its phase 2. Two of them answer a request of his and are **his
to confirm** before their step: the token maker (item 19, Q2) and the tile
format of a fogged map (item 9, Q6).

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
- **Fail closed on drift** (I8): the scene records the box its fog and walls
  were made on; if the group's box no longer matches (resized in Obsidian, by
  another program, by a merge), or a scene the server's record knows as
  fogged has lost its `fog` key, a player is served the scene **fully
  covered** and the game master is told. Moving the group moves its contents
  with it in Verso and in Obsidian; the fog, relative to the group, follows.
  Observation for the step: move and resize a scene in Obsidian, reopen in
  Verso.

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
   | `verso.scene.fog` | the present covered area as one merged outline, never the shapes, their order or their history |
   | `verso.scene.lights`, a token's `light`, the scene's darkness and time of day (item 11) | nothing; only their effect, inside the player's own sight outline |
   | `verso.scene.vision`, explored state, ghosts | only the player's own sight outline, explored area and ghosts (items 10, 15) |
   | `verso.token` | the public face (Q12) of a token they see; nothing else |
   | teleport points (item 21) | nothing, unless the game master shows one |
   | any key the projection does not know | nothing |

   The allowlist, with its canary test, is step **T0**: its top level is
   built (`942359ac`); its nodes' part comes before any step writes walls,
   fog or tokens.

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
     the note naming a picture (`token: "[[Goblin.webp]]"`, the name
     confirmed in T4's PR) is the token's picture **for whoever sees the
     note** (the game master, a player whose sheet it is). Verso reads it;
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
     master sees both ("Goblin 3 · players: Goblin 2"). `[PROPOSED]`
     (alternative for the step: a number stored per token at placement, by
     the game master.)
   - A click on the bar edits the note's tracker (0099 item 5) with the
     concurrency check of invariant 11; the write is refused for an account
     without *Edits* on the note (M7).

5. **Who moves a token.** `[DECIDED 2026-11-15] Q3` — the maintainer, rejecting the contradiction reading: *"elementos dentro de uma cena têm permissões restritas, não faz sentido ficar tudo liberado; o objetivo é restringir e a pessoa mexer apenas o seu token referente à sua ficha/nota; não é contradição, é adequação a essa nova necessidade"* — inside a scene, permissions are restricted: a player moves **only their own token, the one tied to their sheet/note**; K.6 is not contradicted but adapted for scenes (a scene's own rule, (ii) in the terms below, stated in 0113 as an amendment when built). The analysis written before the answer follows. Recommended: **the account that may
   edit the token's note** (the character sheet granted to its player, 0110
   item 12 as amended; 0113 grants), with no owner field and no new store —
   **as an amendment to 0113 section B**, not a use of it (I2): a new action
   `MoveToken` with its row in the one table, answered by `may()`, shown in
   the Access dialog. Two players who both edit a note both move its tokens;
   a device with a capped role (a paired phone, 0117) counts as its capped
   role, never as the owner.
   The question as it was put (answered by Q3 above): 0113 K.6 says *Edits*
   on a file covers *"the whole file but its deletion"*. Inside a scene,
   either (i) *Edits* on the board keeps K.6's meaning — a player with
   *Edits* moves every token — or (ii) inside a scene *Edits* is narrowed to
   their own tokens and drawing, an amendment to K.6 shown in the Access
   dialog. And a player with only *Sees* on the board who moves their token
   **writes the board** without *Edits* on it: that is what `MoveToken`
   grants. The first draft's *"draws only if the board allows"* (a per-board
   switch outside the Access dialog) is withdrawn.
   `[DECIDED 2026-11-15] Q3b` — **no turn rule; a pause instead** (the
   maintainer: *"cara, não quero amarrar em turnos, mas quero ser possível
   pausar para que ninguem mova nada além do mestre"*): moving is never tied
   to turns; the game master can **pause the scene**, and while it is
   paused nobody but the game master moves anything (item 20).
   **Moving by keys** (Q5b's answer): a token moves by the arrow keys or by
   `W A S D`, one cell a press (hex keys: item 16). A player's drag is a
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
   same.

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

8. **Manual fog.** `[PROPOSED]` tools: the game master covers and reveals
   with rectangle, polygon, brush and cells (room-from-walls once walls
   exist), "cover all", "reveal all"; half-transparent to the game master,
   solid to players, "view as a player" (0110 item 13). **Fog applies to
   every reader who is not the game master**: table players, share readers,
   link readers.
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
   shown". An element whose box crosses the scene's border belongs to the
   scene (fail closed). A drawn dungeon (0120 is *Verso's own drawing*, not
   a picture) must be cut by room for fog to work on it: fog on a drawn
   dungeon is not offered until its import writes one group per room.
   A player may move their own token into fog (only walls and the pause
   refuse a move, Q14b, item 20); being their own, it stays shown to them.
   `[DECIDED 2026-11-15] Q4` **where fog lives** — **as recommended, with
   three additions** (the maintainer: *"e deve ser possivel resetar nevoa e
   a nevoa é por jogador ou por grupo ou ainda por token controlado,
   configurável na cena, se um mestre clicanum token, mostra a visao apenas
   do token"*). As recommended: **painted fog in the scene node**
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
   The additions:
   - **The fog's scope, chosen per scene**: **per player** (each player's
     explored area and sight from their own tokens — Q7's default), **per
     party** (one shared explored area and sight for the table's players —
     what Q7 called "the party shares sight"), or **per controlled token**
     (each token keeps its own explored memory and sight). `[PROPOSED]` the
     scope governs what tokens reveal (sight, explored memory, ghosts); the
     game master's painted fog is one per scene, the author's reading of the
     answer, confirmed in T11's PR; under *per token* a player is shown the
     token they have selected, and with none selected the union of theirs.
   - **Reset**: `[PROPOSED]` "Reset fog" puts the painted fog back to fully
     covered and clears the explored memory and the ghosts — of the whole
     scene, or of one player, the party or one token, by the scope;
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
    `verso-core`** (I6), so the desktop's play view and player window show,
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
    A key press (arrows or `W A S D`, item 5) is a one-cell move judged as a
    drop; `[PROPOSED]` presses beyond the pace coalesce into one move.
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
    anyone.

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
      served. Rows in items 1 and 14.
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
      entry's check is not shown either;
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
    V.43) and on the projection in `verso-core` (item 10), so it works with
    no server. Named framing shortcuts (viewports, Atlas's "saved frames")
    stay 0036.b, after V1 ((b), not taken). Every later step (fog, sight)
    includes the play view as a read path.
    **Bring everyone here.** `[PROPOSED]` design: a game-master action, in
    the play view and on the board, that moves the camera of every viewer
    of that scene or board (players, the TV window) to the game master's
    present frame or to an element he picks. It is a one-off message the
    server sends only to viewers who see the board; at a fogged place it
    shows the fog there and nothing else; the viewers keep their camera
    after it (no lock); with reduced motion it jumps instead of gliding; it
    is announced politely without naming the place ("The game master moved
    your view"), so no name under fog is told.

14. **Every read path** (I12, B4). Replaces the first draft's parenthesis. A
    row per path, as 0110 item 18; **a canary per row** (a token, a card and
    a drawn element under fog and out of sight; a secret door; a hidden
    note's token; a light outside sight; a token's later moves after it left
    sight) is the acceptance of T11 (and of T12, T13, T14 for their rows),
    and the rows marked T0/T4 are accepted in those steps.

    | Path a non-game-master reader has | Who filters | Test |
    |---|---|---|
    | The board file's bytes (read, `read_text`) | the projection, key allowlist (item 1) + scene geometry | canary absent from the bytes (T0, T11) |
    | Sync to a player's device; the projected file's revision (`revision_of`) | the projection; sync of a fogged board debounced (Q19) | canary absent on the device; no revision change for a move out of sight |
    | The board's room and the shadow (0113 H), the read-only shadow (Q8) | `board_sight` (join, updates, `lay_over`) | canary never in a room message; an edit to an unseen id refused |
    | Presence: pointer, laser, selection, drag, ruler | `presence::for_player` (Q14) | a drag and a ruler under fog never relayed |
    | Map tiles at every level | the tile server, masked by fog and sight (item 9), one small tile decoded at a time | top level and edge tiles blanked under fog; missing tiles serve the scene covered |
    | The map picture's own file and URL; the same picture on another board, in a note, as a copy | `may()` with the picture set to "Does not see" (Q6b) | the file refused to a player |
    | A token's picture from its note's frontmatter (item 4) | the note's access, then the picture's `may()` | a hidden note's frontmatter picture never served as a token's face |
    | Ghosts (Q18) | the server, from what it served: frozen at the moment the token left sight | a token's moves, bar, name and deletion after it left sight never reach the player |
    | Lights, darkness, darkvision (item 11) | the sight function on the server; only the lit sight outline served | a light outside sight absent; no light's position or radius in any message |
    | Teleport points and where they lead (item 21) | the projection (Gone unless shown) | a hidden point and its destination absent; the destination's scene served only by the token's arrival |
    | A refused move's answer (Q14b, item 20) | the move check: one answer, no position | the answer says "blocked" or "paused", never where the wall is |
    | "Bring everyone here" (item 13) | sent only to viewers who see the board; the camera shows each viewer's projection | nothing under fog shown at the target; no name in the announcement |
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
    or token). An explored area serves **the map, what the game master marks
    static, and the ghosts**, never a live token or anything that changed
    since it was last seen (the monster that moved behind the party stays
    unseen; its ghost stays where it was seen). "Forget explored" and "Reset
    fog" (Q4) exist, and cannot take back what a device holds.
    **Ghosts** (last-seen positions of tokens). `[PROPOSED]` rules, so that
    **a ghost never tells more than was seen** (0110 item 18):
    - a ghost is made by the server when a token it served to that account
      (or scope unit) leaves its sight: the token's face **as it was served
      at that moment** (the public face, Q12, for a hidden note) and the cell
      where it was last served;
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
    Atlas VTT's source is allowed**, to learn how a feature behaves.
    **Copying or translating its code is not**: Atlas is AGPL-3.0-only and
    Verso is MPL-2.0 (0005), so no code of it enters Verso, literally or
    translated into Rust or TypeScript; names and structures stay Verso's
    own (0120's `walls` format, the board's vocabulary). The survey's
    reading of UI strings and doc comments is thereby admissible. Any
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
    one answer ("the game master paused the scene"), and relays no player
    drag of it; the game master moves anything. The pause is session state,
    kept beside the explored state (item 8), never written to the board
    file (0012); every viewer is told the scene is paused (item 16). The
    Table's dice and chat are not paused.

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
    and then sees what the token sees there. A paused scene (item 20), at
    either end, refuses the teleport. Its rows in items 1 and 14.

### Order and size

Sizes are the author's estimate (S days, M about a week, L two to three
weeks, XL more), grown where the review's fixes and the answers of
2026-11-15 add work; they are not a plan. The order fixes the review's I4
and I5: the allowlist first; readers in a read-only shadow before anything
is called "shared"; the wall editor before players move tokens; the player
window after the fog it must honour. (The columns for Q0 (b) and (c) were
dropped once (a) was decided.)

| # | Step | Size | Needs |
|---|---|---|---|
| T0 | Key allowlist in the projection (top level, then nodes' `verso`), canary test | S | — (top level built, `942359ac`) |
| T1 | Scenes (a group with `verso.scene`) and their grid: square and hex, alignment, snap, numbers; fail-closed drift check | M | T0 |
| T2 | Table players who only see a board in a read-only shadow (Q8; T7a of the review) | M | — |
| T3 | Ruler in units, live; Q14's presence rule | S | T1; shared with readers after T2 |
| T4 | Tokens: note cards, the picture from the note's frontmatter, public face, size, snap, bar, per-viewer numbering | L | T1; shared after T2 |
| T4b | The token maker: round crop and border, a new picture file, the note's property set (item 19) | S–M | T4; his confirmation |
| T5 | Hide a drawn element from players: the flag in `customData.verso.secret` (which `is_secret` already reads), its menu, spec §5.11, tests | S–M | T0 |
| T6 | Initiative: an ordered list with "already acted" checks, shown/hidden entries, public names (Q9, Q15) | S–M | T4 (public face) |
| T7 | The play view ("Open the scene") and the player window (TV); projection in `verso-core` | M | T1, T4, T2; V.43 for "see as player" |
| T7b | "Bring everyone here": the game master moves every viewer's camera to a place of the scene or board | S | T7 |
| T8 | Wall and door editor | S–M | T1, T0 |
| T9 | Universal VTT import into a new scene with walls (lights dropped) | S–M | T1, T0 |
| T10 | Players move only their tokens (`MoveToken`), by drag or by arrows / `W A S D`; every wall blocks; the pause | M | T2, T4, T8 |
| T11 | Manual fog: **measuring first**; painting; reset; the projection on every path (item 14); map tiles cut by the game master's device and masked one at a time; the picture's access; tracker and play view follow fog | XL | T10, T7; the tile format confirmed |
| T12 | Token vision on the server, on drop or live; the fog's scope (player, party, token); explored memory and ghosts; the game master's token view; **measuring first**; tracker and play view follow sight | XL | T11 |
| T13 | Dynamic lighting: light sources, darkness, darkvision, time of day; never served raw; **measuring first** | L–XL | T12 |
| T14 | Teleport of tokens between scenes, two points linked by the game master | M | T10, T11 |

T0 to T9 can each ship alone (T4b and T7b after the step they extend); none
is free of secrecy work: T3 and T4 depend on Q14 and Q12, T6 on Q15, T9 on
T0. T10 to T14 are the big block, in that order because each one's secrecy
rests on the one before.

`[DECIDED 2026-11-15] Q1` **when** — **inside V1** (the maintainer, 1.2: *"B"*; roadmap row V.55). The recommendation was after V1, as its own phase, T0–T7
first. The top-level part of T0 was a fix of a leak and did not wait for
this ADR (Context). V1 already carries its blockers and V.43, on which T7
depends.

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
  amended ADR carries a pointer when the step that builds it is merged:
  0113 section B (`MoveToken`) and K.6 (what *Edits* covers inside a scene,
  Q3 (ii)); 0090's revision of 2026-10-15, pick 2, and 0113 H (table players
  who only see a board follow it live, Q8); 0090's revision, pick 1 (a
  fogged JPEG/WebP converted on the game master's device, never the server,
  Q6; the tile form `[PROPOSED]`); 0113's review of S7, (1) *"No activity
  oracle"* (walls, Q14b); 0120 item 3 (walls move into the scene, Q0 (a)).
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

**Accepted (2026-11-15).** The maintainer decided every question, Q0–Q20,
on 2026-11-15: Q0, Q1 and Q3 first; Q2 and Q4–Q20 in his note
*decisoes-2026-11-15-vtt*. Pending: the second reading before building
([0032](0032-author-and-reviewer-roles.md), the header); his confirmation of
the two `[PROPOSED]` designs that answer his requests (the token maker,
item 19; the tile format of a fogged map, item 9); and every other
`[PROPOSED]` item in the PR of its step. Not built, but T0's top level
(`942359ac`).

- **Q0** a scene — a `group` with `verso.scene` plus its play view; a scene
  file the fallback.
- **Q1** when — inside V1 (roadmap V.55).
- **Q2** a token — a note's file card; its picture may come from the note's
  frontmatter; a token maker proposed (item 19).
- **Q3** who moves it — only the player's own token, tied to their
  sheet/note (`MoveToken`; K.6 adapted inside scenes). **Q3b** — no turn
  rule; the game master pauses the scene (item 20).
- **Q4** fog — painted fog in the scene, compacted; explored in the
  server's database (outside the tree locally); a reset; the scope per
  scene: per player, per party or per token; the game master's token view.
- **Q5** sight — on the server, in `verso-core`, the projection moved
  there. **Q5b** — on drop or live, per scene; moves by arrows or `W A S D`.
- **Q6** the picture under fog — masked tiles at every level; JPEG/WebP
  converted on the game master's device (0090 pick 1 amended); tiles in a
  compact format cut by that device proposed. **Q6b** — set to "Does not
  see" with a warning, to evaluate the flow.
- **Q7** whose sight — each player's own tokens; the party's shared sight a
  value of the scope.
- **Q8** readers live — a read-only shadow for table players (0090 pick 2
  and 0113 H amended); share readers as today.
- **Q9** initiative — an ordered list with "already acted" checks; where it
  is kept `[PROPOSED]` as recommended.
- **Q10** lighting — planned together (T13); lights never served raw.
- **Q11** Universal VTT — yes; pictures written out, lights dropped.
- **Q12** a hidden note's token — its public face; no face = Gone; coarse
  bar off by default; per-viewer numbering.
- **Q13** under fog — wholly outside the fog to be served.
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
- **Q20** Atlas VTT — its source may be read; its code is never copied or
  translated.

Roadmap: V1, row V.55 (steps T0–T14); After V1, items 12–15 (the three
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
| I5 the order | the step table (wall editor T8 before T10; T7 play view before T11; T6 needs T4 and Q15) |
| I6 a local folder; projection in the core | items 8, 10, 12; T7 |
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
