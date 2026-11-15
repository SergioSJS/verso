# Atlas VTT survey (2026-11-15)

A survey of the Atlas VTT plugin for Obsidian, made for
[ADR 0121](../adr/0121-a-virtual-tabletop-layer-on-the-board.md) at the
maintainer's request of 2026-11-15 (*"olhar a extensão Atlas VTT … puxar as
features como inspiração … mapas com paredes, controle de tokens, grid de
movimento em hexágono ou quadrado, visão dos tokens, fog of war"*). Kept in
the repository so the notes do not vanish again with a scratchpad.

**Licence.** Atlas VTT is **AGPL-3.0-only** since 0.2.0 (releases up to 0.1.6
were PolyForm Noncommercial 1.0.0), with an additional permission for linking
with Obsidian. Verso is MPL-2.0 ([0005](../adr/0005-license.md)). As
[0090](../adr/0090-maps-on-the-board.md) already recorded: **its ideas may be
studied, its code is never copied or paraphrased.** For this survey the
documentation, the release notes, the issues and the privacy notice were read;
of the source, only English UI strings and the doc comments of a few type and
protocol files were read, to learn *how a feature behaves* (listed at the end).
No code is reproduced here.

## What was looked at

| Item | Value |
|---|---|
| Repository | `github.com/atlas-vtt/atlas-vtt` (author Fabian Urbanek, `ByteMirror`); created 2026-09-20; last push 2026-11-14 |
| Version surveyed | **0.16.0** (stable, 2026-11-14) and 0.16.1-beta.0 (2026-11-14, "no player-facing changes recorded yet") |
| Releases | 0.1.2 (2026-09-20) to 0.16.0: 33 stable releases in eight weeks, betas through BRAT |
| Reach | 682 stars; 27,338 downloads in Obsidian's `community-plugin-stats.json` (read 2026-11-15); 176 open issues |
| Platform | `isDesktopOnly: true`, Obsidian 1.8.7+ (online hosting 1.11.4+); players of Atlas Online use a browser, phone included |
| Docs | `atlas-vtt.dev/docs` (start, guides, Atlas Online, reference); the README; `PRIVACY.md` |
| Ecosystem | third-party plugins built on it: *Connect for Atlas VTT* (online play, 922 downloads), *Interactive Dice for Atlas VTT*, *Tabletop for Atlas VTT* (3D board), *Spell Effects for AtlasVTT*, *DnD Beyond Importer for Atlas*; the author's *Atlas Sidebar* (vertical tabs) |

Version tags below say where a feature first appeared (from the release notes).

## Features, grouped, with how Atlas solves each

### Maps and scenes

- **A scene is a `.atlasmap` file** (JSON): the background picture, grid,
  camera, token settings, lighting, levels, and the objects (tokens, fog, pins,
  texts, drawings, walls, lights). The rest of the library (tokens, encounters,
  collection settings, game-system presets) is JSON in the vault's
  `atlas-vtt/` folder. (0.1.x; sync of the library 0.6.0.)
- **Collections** group scenes, maps, tokens, encounters and settings; export
  and import as one package; move/copy between collections. (0.2.0, 0.4.0)
- **Scene tabs and a map switcher** (`g`), drag to reorder tabs. (0.3.0, 0.13.1)
- **Snapshots**: named save states of a whole scene (tokens, pins, fog,
  drawings, initiative), restore replaces the scene. (0.3.0)
- **Huge maps, "Mosaic Canvas"**: the map is read once and cut into a pyramid
  of small lossless tiles, from a thumbnail down to every pixel; up to 1,000
  megapixels and 65,535 px a side; opens in seconds and sharpens as finer tiles
  are cut. (144 MP in 0.7.0; Mosaic 0.11.0)
- **Animated maps**: WebM/MP4 as maps, on the GM's and players' screens. (0.10.0)
- **Replace map image** keeping grid, walls, lights and tokens. (0.10.0)
- **Levels (floors)**: a scene of several floors, a layer switch, roofs, stairs
  that carry a token's player along; each player sees the floor their token is
  on. (Map layers 0.10.0; floors online 0.15/0.16)
- **Imports**: Universal VTT files from Dungeondraft, DungeonFog and Dungeon
  Alchemist (`.dd2vtt`, `.uvtt`, `.df2vtt`) bring picture, grid, walls, doors
  and lights; a building's files as one scene with a floor each. (0.5.0, 0.10.0)
- **Dungeon generator** (16 styles, caves, forests, crayon style) with walls,
  doors and lights placed automatically; random-encounter pins in rooms.
  (0.10.0, 0.11.0, 0.12.0)

### Grid and measurement

- **Square, hex pointy, hex flat.** Auto-detection from the map picture on a
  scene's first open; manual alignment by clicking grid intersections, or a
  "Freehand" placement by eye for maps without lines. (0.1.x; 0.2.0; 0.7.1)
- **Appearance**: show/hide, solid/dashed/dotted, opacity, width, colour or
  Auto (black or white for contrast). (0.2.0)
- **Units**: distance per cell per collection and per scene, decimals, yards,
  custom unit names; an "abstract" mode. (0.3.1, 0.6.0, 0.15.0)
- **Diagonals rule** on square grids chosen per collection. (0.3.0)
- **Cell numbering**: hexes as "0101" or sequential; squares as A1, B1. (0.4.0, 0.6.0)
- **Hexcrawl**: Shift-click a hex with the pin tool to link one note to it; the
  link survives a realignment. (0.4.0)
- **Snap to grid** for tokens, pins, measurements, shapes, fog rectangles. (0.1.x)
- **Measure tool**: line, circle, cone (and two more shapes online), with its
  own toolbar; around corners (Space / click point by point, each leg and the
  total); keep measurements (K) saved with the scene, recolour, hide from
  players; areas tint the cells they cover, can stop at walls and closed doors,
  count and select the tokens inside. (0.1.x; 0.15.0)
- **Spell effects on areas** (fire, frost, lightning, mist, radiance, shadow),
  areas that emit light or magical darkness; **auras** that follow a token. (0.15.0)
- **Movement**: the dragged token shows distance (always, in combat, never);
  named movement steps (Move, Dash) colour the drag line, "moved / speed";
  speed from the statblock; **height** off the floor counted by rulers; range
  check and range-band rings on click. (0.3.0; 0.15.0)
- **TrueScale**: for a TV lying on the table, the players' zoom locks so a
  cell is an inch (or 25/30 mm) on the glass, calibrated with a bank card;
  saved frames to send players' view to. (0.12.0)

### Tokens and their control

- **Tokens from images**, with a ring, crop, default size; 155 free starter
  tokens downloadable. (0.1.x; 0.13.0)
- **Sizes** Medium 1×1 to Gargantuan 4×4 snapping to whole cells; resize and
  rotate in 15°/45° steps; glide to place. (0.2.0; 0.6.0; 0.7.0)
- **Linked statblocks** (native or Fantasy Statblocks): HP and a secondary
  resource as bars, up to six resources per collection, conditions as badges
  with numbers, Kill / Reset, recovery actions (short/long rest); several
  tokens may share one statblock; dice in statblocks clickable. (0.2.0–0.14.0)
- **Look-alike numbering** (Goblin 1, 2…) counting only what players see. (0.7.0)
- **Hide / Show** a token: half transparent to the GM, absent for players;
  hidden tokens give no sight. (0.1.x; 0.7.0)
- **Multi-select** and group actions (move, conditions, HP, kill, ring colour). (0.2.0; 0.12.1)
- **Encounters**: save a group of tokens, spawn it, random counts (2d4 Wolves),
  an encounter builder. (0.1.x; 0.9.0; 0.10.0)
- **Player characters**: "make a player character"; a campaign keeps one set
  of values per PC across scenes. (0.8.0)
- **Ownership (online)**: the GM assigns a token to a player from the online
  panel (also several at once); a token placed from the Tokens tab belongs to
  that character in every scene; Release / Release all. Players move only the
  tokens given to them; optionally only on their turn; a move the GM's Atlas
  refuses (a wall, not their turn) puts the token back. (0.8.0; 0.9.0)
- **Movement blocked by walls** for players' tokens: the GM's side sweeps the
  token's path against walls and slides along them. (0.15.0)

### Walls, doors and lighting

- **Walls** drawn segment by segment, joined at end points; add/remove points;
  **rooms** placed in one step, which became real walls. (0.5.0; 0.6.0; 0.14.0; 0.15.0)
- **Wall kinds**: what a wall stops — sight and light, sight only (a curtain),
  light only, or only movement (a window); **limited** walls (a hedge: see past
  the first, not the second); **one-way** walls (light direction: allow from
  left/right). (0.5.0–0.12.0)
- **Doors**: place door, place secret door; open/close; lock/unlock (a GM aid);
  door icons under fog hidden from players. (0.6.0; 0.7.0)
- **Dynamic lighting** (experimental 0.5.0, stable 0.9.1): ambient light, time
  of day (Day, Dusk, Night, Pitch black), light zones with their own time of
  day, placed lights with presets (candle, torch, lantern, magical light,
  darkness…), bright/dim ranges, colour, flicker/pulse/shimmer animations,
  beams, magical darkness that some lights outshine; **lighting quality**
  presets High / Balanced / Saver for weak graphics. (0.5.0–0.15.0)
- **WebGL only** since 0.11.0 (a notice when it cannot start; earlier a
  software fallback).

### Vision and fog of war

- **Two systems.** *Manual fog*: the GM paints fog and erases it.
  *Token vision* (part of dynamic lighting): players see what their vision
  tokens see. Users found the two confusing together (issue #669: fog zones
  stayed black whatever the light).
- **Manual fog tools** (0.16.0): Fog and Eraser with shapes Brush,
  Rectangle, Polygon, Lasso, **Cells** (whole squares/hexes) and **Room** (click
  inside a room bounded by walls to fill or clear it); "Cover all", "Delete all
  fog", "Hide all rooms"; rectangles and polygons snap to the grid and to
  walls; touching fog merges into one area; right-click an area to reveal it,
  hide it again or delete it; soft or crackled fog edges (0.13.0).
- **How fog is stored**: as an ordered list of **operations** (each brush
  stroke, lasso, rectangle: paint or erase, with its geometry) in the scene
  file; the coverage is the replay of the operations, composited at half
  resolution. A revealed area keeps a mark so it can be hidden again.
- **GM vs players**: fog is half transparent to the GM ("GM View", opacity
  adjustable), solid to players; `D` toggles "Session View", `H` (held) shows
  it as players do. Tokens, pins and door icons under fog are hidden from
  players; measurements starting on a token players cannot see are hidden.
- **Token vision**: per token a switch, sight range (or unlimited), vision
  angle (or all around, facing the token's rotation), a carried light;
  **senses** from the statblock or edited (darkvision-like senses per game
  system: in dim light / in darkness, through walls, sees invisible, works
  while blinded, shown in colour, grey, black and white or heat tones);
  collection defaults; a token becoming a player's gets vision switched on.
- **Whose sight**: "Players see only what their tokens see" — the players'
  picture is made from **every vision token that is not hidden** (the party's
  sight, shared); defeated tokens give no sight; or "Players see everything the
  light shows".
- **Explored memory**: "Remember explored areas" — what tokens saw stays
  dimmed on the players' map; GM tools Reveal / Forget with brush, lasso,
  rectangle; "Mark all areas explored", "Forget explored areas". Stored as a
  **PNG mask** (a data URL) in the scene file.
- **Sight on drop**: an option so dragging a token shows the players nothing
  new until it is dropped (otherwise sight follows the drag).
- **Known leak** (issue #640): a scene that is also the campaign's world map
  showed players the whole map without fog through the world-map path.

### Initiative and combat

- **Tracker widget** (`I`): portraits, numbers, HP bars; rolls a d20 plus the
  statblock's modifier for each and sorts; manual order by drag; per-card
  roll/edit/move; rounds with start (crossed swords), next/previous, end (white
  flag). The docs say every token on the map joins; the 0.5.0 notes say the GM
  adds combatants (right-click, Add to Initiative). (0.1.x; 0.5.0)
- **Modes**: by number, **by sides**, **by cards**, sides that roll their order
  each round; collection initiative rules; delay a turn, turn banner, a ring on
  the active token, skip defeated, tie-breaks, add combatants without tokens,
  start a fight from an encounter, roll HP. (0.5.0; 0.9.0)
- **Players** see the order with portraits and the current turn, hidden tokens
  left out, names and HP only if switched on; online players click a combatant
  to find its token; "move only on their turn". (0.2.0; 0.9.0)
- **A sound mood linked to combat** plays when the fight starts. (0.13.0)

### Dice

- **Dice tray, roll log, 3D dice**, roll cards, public/private toggle; Foundry
  and Roll20 notation (keep/drop, rerolls, explosions, success counts, d%,
  Fate, labels); per-collection rules (critical, exploding); a dice lab; `@`
  references to statblock values. (0.1.x; 0.5.0; 0.8.0; 0.9.0)
- **External rolls**: a Chrome extension syncs D&D Beyond / Demiplane rolls
  into Atlas Online; a "sheet roll API" for character sheets. (0.9.0)

### Handouts, notes and journals

- **Note pins**: pin a note, a heading or another Atlas map to a place; read and
  edit it in a floating panel; Ctrl/Cmd-hover preview; 65 place icons; numbered
  and lettered pins for keyed rooms; pins can show a name; pins shown to players
  appear in the player window; creating notes from the pin tool. (0.1.x–0.14.0)
- **Show an image to players** (ribbon), take a handout back with one click. (0.1.x; 0.12.0)
- **Online "book"**: each player's sheet, abilities, inventory, quests, world
  map with notes and pins they may read; the GM sends items from a table or
  Base; player notes and items stored in the campaign folder of the vault. (0.8.0–0.15.0)
- **Links**: scenes, snapshots and encounters linked and embedded in notes. (0.6.0)
- **Random tables / loot**: tables from notes and Bases, paste a table from a
  PDF or spreadsheet, generators of several parts. (0.4.0; 0.8.0; 0.10.0)
- **Widgets**: counters, timers, **progress clocks** (Blades in the Dark),
  shared across a collection, shown to players. (0.3.1; 0.4.0)
- **DM screen** (Tab): statblocks of the creatures on the map, the scene's note. (0.5.0)
- **Drawing and text** (0.16.0): Pen, Line, Rectangle, Ellipse, Text (three
  fonts, three looks), Stamp, Cells (colour whole cells), Eraser; hide a drawing
  from players; lock, group, order; laser pointer. Players may draw online
  (a switch).

### Multiplayer model

- **Local "player view"**: a second window (a TV, a projector) showing the
  session view: no fog transparency, no hidden tokens, no handles; the GM chooses
  what it shows (grid, widgets, initiative, rolls, bars, nameplates); pause the
  players' camera; hide the map (black until revealed); render up to 4K.
  (0.1.x; 0.7.1; 0.12.0; 0.16.0)
- **Atlas Online** (closed beta since 0.8.0): the GM hosts from desktop Obsidian
  (must stay open); players join from a browser (phone included, an "Install
  app" to the home screen) with a link and a six-digit join code, admitted by
  the GM, then a personal code; up to 12 seats; no player account.
- **Sync technology**: a relay at `play.atlas-vtt.dev` over WebSocket (a
  Cloudflare Durable Object per table, from the protocol's comments); the GM's
  Atlas sends **what players may see**, worked out on the GM's computer, per
  floor; the server keeps nothing of the play. Files (maps as tile pyramids,
  art, sound) are uploaded once to a store at Cloudflare in the EU and deleted
  30 days after the last share. **No self-hosting and no LAN play.**
- **What a player's page computes itself**: it is sent the walls (a closed
  secret door as a plain wall; locks not said), lights, the vision tokens
  (including the positions of unseen tokens that see or shine) and the fog
  operations, and draws sight and fog itself. The map picture reaches the
  player whole (as tiles); the fog hides it on screen.
- **Moves**: a player's drag streams positions; the drop is a move the GM's
  Atlas accepts or refuses (wall, turn), then tells everyone.
- **Sound** in sync (a description of what plays and when; time asked of the
  server). (0.13.0)

### Data, storage, performance, mobile, other

- **Storage**: `.atlasmap` scenes and JSON library in the vault (syncs with
  Obsidian Sync with "all other types", Remotely Save, LiveSync); the running
  online table and its log in `atlas-vtt/.atlas-data/online.json`, a folder sync
  tools skip; explored memory inside the scene as a PNG mask.
- **Performance**: WebGL renderer (PixiJS), tile pyramid for maps, fog
  composited at half resolution, lighting quality presets, sight on drop,
  statblocks over 32 KB skipped, "the player view copies a new frame only when
  the map changes", a GPU test suite.
- **Mobile**: the GM's side is desktop only; players' browser page works on
  phones and tablets.
- **Other**: game-system presets (Daggerheart, 5e, OSE, Shadowdark, PF2e, CoC
  7e, Cyberpunk RED, Cairn, Draw Steel, Fate), statblock templates, sound page
  (moods with crossfade, eight ambience layers, reverb, music queue), Russian
  and Chinese translations, in-app issue reports, a command palette of its own,
  a customisable toolbar.

## Atlas against Verso

"Has" means built today; "Partly" names where. ADRs: board
[0057](../adr/0057-board-json-canvas.md), maps
[0090](../adr/0090-maps-on-the-board.md), Watabou
[0120](../adr/0120-maps-from-watabous-generators.md), Table
[0107](../adr/0107-the-table-a-shared-roll-and-chat-log.md) /
[0110](../adr/0110-a-table-is-a-campaign-folder.md) /
[0113](../adr/0113-one-access-model-for-a-table.md), music
[0116](../adr/0116-music-and-sound-at-the-table-heard-by-everyone.md), the app
as a server [0117](../adr/0117-this-app-is-a-universo-server.md).

| Atlas feature | Verso | Where / note |
|---|---|---|
| Scene = map picture + objects | Has | A map is a board (0090 item 1); a picture card "used as map", locked at the bottom |
| Huge maps by tiles | Partly | PNG cut into tiles cached outside the folder (0090 item 4); JPEG/WebP drawn whole; no pyramid to 65k px |
| Note pins, hover preview, secret pins | Has | 0090 items 3, 5; 0085; the pins list in the panel |
| Pins revealed one by one at a table | Not | 0110 item 14, V.43 (in V1, not built) |
| Square grid | Partly | Excalidraw's square grid as a drawing aid (`gridModeEnabled`), not a game grid: no size per board, no alignment, no units |
| Hex grid, cell numbers, hexcrawl | Not | 0120 item 11: a region's hex board "later" |
| Measure / ruler in units | Not | — |
| Laser pointer, live pointers | Has | board presence (`pointer`, `laser`) |
| Tokens (sized, snapped, rotated) | Not | file cards exist; no token kind |
| HP / resources / clocks | Partly | statblock **trackers** write into the note (0099 item 5); nothing on the board |
| Hide a token from players | Has (as a mechanism) | `secret` on any node (0090 revised 2026-10-15); server leaves it out. Caveat (review of ADR 0121, B5): a token of a note the players do not see is a Locked card today, and its picture, name and tracker would leak if drawn; ADR 0121 Q12 |
| Token ownership, player moves only theirs | Partly | a player with *Edits* on a board edits through a per-account shadow room (0113 H); no per-token owner |
| Walls and doors | Partly | stored for Watabou dungeons (`verso.walls`, 0120 item 3); nothing reads them; no wall tool |
| Fog of war (manual) | Not | 0110 item 16: "later, each in its own ADR when asked for" |
| Token vision, explored memory | Not | — |
| Dynamic lighting | Not | — |
| Initiative tracker | Not | 0110 item 16 |
| Dice, roll log, secret rolls, 3D dice | Has | 0088, 0101, 0107 |
| Random tables, oracles | Has | 0088, 0102 |
| Statblocks and layouts | Has | 0099 |
| Show an image / handout to the table | Partly | images in the Table's log (0107 item 3); "show to the table" is 0110 item 9, V.43 |
| A player's view (second screen / see as player) | Partly | "view as a reader" toggle (0090 item 5); "see as player" 0110 item 13, V.43 |
| Snapshots | Partly | version history of the file (0091); no named scene states |
| Encounters | Not | — |
| Universal VTT import | Not | Watabou importer exists (0120) |
| Sound with moods and crossfade | Partly | 0116 phase 1–2 built; ambience layer and crossfade after V1 |
| Online play | Has | UniVerso self-hosted and the app as a server, LAN and Cloudflare link (0073, 0117); players on browser, PWA, Android, iOS |
| Phone | Has | the GM's side runs on the phone too (0057 phone board; 0118, 0119) |

## Source files read for behaviour only

UI strings: `src/app/i18n/locales/en/{vision,wall,senses,sceneLight,light}.ts`.
Doc comments of: `src/app/types/{fogTypes,wallTypes}.ts`,
`src/app/lighting/exploredMaskCodec.ts`, `src/app/characters/playerVision.ts`,
`src/app/vision/tokenSightPolicy.ts`, `src/app/lighting/tokenLighting.ts`,
`src/app/services/newSceneFile.ts`, `src/app/online/gm/SceneShare.ts`,
`src/app/online/protocol/{fog,lighting,moves,relay,redact}.ts`,
`src/app/online/movement/wallCollision.ts`. Pages of `atlas-vtt.dev/docs`:
start/install, start/player-view, guides/fog, guides/grid, guides/token-details,
guides/initiative, guides/draw-text-measure, guides/note-pins, guides/snapshots,
guides/dm-screen, online/host-a-table, online/players, online/faq. Issues #533,
#640, #669 and the open feature list. All on 2026-11-15.
