# ADR 0120 — Maps from Watabou's generators: the importer, our own drawing, the generated-map note

- Date: 2026-11-12
- Amended in part by [0121](0121-a-virtual-tabletop-layer-on-the-board.md) (Accepted 2026-11-15, not built): item 3 (the
  walls move into the scene). This text is amended when the step that builds
  it is merged.
- Source: the maintainer, in session on 2026-11-12, answering the seven
  questions of the research report of 2026-11-11 on Watabou's generators
  (watabou.github.io, Procgen Arcana; the report is the maintainer's, kept
  outside the repository). On the dungeon: *"Masmorra importada bora fazer
  nosso desenho"* (an imported dungeon: let's make our own drawing). On
  downloads from an embedded page (ADR 0056): *"deveria ser SIM!"* (it should
  be YES!). The other answers came as choices of the report's options,
  relayed by the main session; no other words of his are recorded. Later
  the same day, to the four `[OPEN]` questions below (Q1–Q4), accepting the
  four recommendations: *"ok para watabou"*; the answers' detail (what
  Dwellings' drawing and note hold) came relayed by the main session. On
  2026-11-15, relayed by the main session, on the imported maps: *"It
  brought a lot of information, nice — but it looks very bad. Square,
  blocky, without the old-school feel the Watabou map image itself shows.
  If we import this kind of map, we should bring the image that goes on
  top."* (item 2, revised); and, later that day: *"O watabou a imagem tem
  que exportar sem rotação pra conseguir encaixar"* (Watabou's picture has
  to be exported without rotation to fit). The same day the maintainer
  approved for 0.9.0-beta.3 the survey's first proposal
  ([survey](../reference/watabou-importers-survey-2026-11-15.md), "What
  Verso could adopt" 1–2): One Page Dungeon's *Export as › PNG…* placed by
  arithmetic and asked for first. **For the maintainer's judgement:** to
  know what to capture, the survey read the export functions of Watabou's
  minified page code (the menu's entries and the export dialog); nothing of
  it is reproduced, and the rule Verso uses is the one the captured
  exports show.
- Status in the briefing: not present
- Builds on: [0056](0056-embedded-web-pages.md) (revised by item 6),
  [0057](0057-board-json-canvas.md) (the board's drawing),
  [0090](0090-maps-on-the-board.md) (maps on the board),
  [0110](0110-a-table-is-a-campaign-folder.md) (the table; vision and fog
  later), [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md).

## Context

Watabou's generators (One Page Dungeon, Perilous Shores, the city, village,
dwelling and cave generators) are closed source; **the maps they make are
free to use**, attribution appreciated (their FAQ, read 2026-11-11). Using
the generators *inside* a product needs his permission. Their exports are
rich: the One Page Dungeon gives JSON (rooms, doors, numbered notes,
columns, water, in cells) and Markdown (title, story, numbered keys, the
permalink with the seed); Perilous Shores saves a region as JSON with its
towns and dangers, each with the address of the generator that makes it,
seed included. No generator exports walls for a virtual tabletop. The site
allows being framed (no `X-Frame-Options`, no CSP), so ADR 0056 already
embeds it as an `<iframe>` — without `allow-downloads`, so its Export did
nothing.

## Decision

**Decided on 2026-11-12 by the maintainer**, in session, items 1–7.

1. **An importer of exported files, first One Page Dungeon and Perilous
   Shores (a region).** The person exports from the generator and imports
   the file into Verso; Verso makes the note, keeps the exports and makes the
   drawing.
2. **The dungeon gets our own drawing**, made from the JSON: rooms and doors
   exact, editable, in the board's look — not pins over Watabou's picture.
   The note holds the title, the story and the numbered keys, the same
   numbers as the drawing.
   *Revised by the maintainer on 2026-11-15* (Source): **the generator's
   own picture is the map**, lined up with the JSON; Verso's drawing stays
   in the board as its hidden tracing, shown to edit; the numbered keys are
   pins over the picture. Without the picture, the drawing as before. How
   it is built: "The generator's picture" below.
3. **The walls are stored on import**, though nothing reads them yet; the
   table's vision and fog come later (0110). The format is the author's
   (below).
4. **A region makes one note** with its towns and dangers. A town's or a
   danger's note is made only when the person follows its link; the
   generator's address with the seed comes from the JSON.
5. **After the importer, a "generated map" note**: the generator embedded
   (the gate of 0056) and the seed kept by Verso.
6. **ADR 0056 is revised: a download that starts inside an embedded page is
   accepted and saved into the folder** (desktop app, host side). In a
   browser it goes to the browser's Downloads.
7. **A message to Watabou** asking permission to embed the generators in
   Verso (open source, MPL-2.0), with attribution, no redistribution of his
   code, links back. The maintainer sends it himself; drafted outside the
   repository.

**Decided on 2026-11-12 by the maintainer**, answering Q1–Q4 with *"ok para
watabou"* (the four recommendations accepted), items 8–11.

8. **A town's or a danger's note made on click embeds its generator** at
   its seed (the address the region's JSON gives), as item 5's note does.
   (Q1.)
9. **One Page Dungeon door numbers 0, 8 and 9 stay drawn as open ways**
   until a sample shows otherwise. (Q2.)
10. **The next generator imported is Dwellings** (houses): floors, named
    rooms, doors, windows, stairs, and the walls stored as the dungeon's
    are (`verso.walls`). Drawn with Verso's own drawing, an editable board,
    one board or one frame per floor; the note holds the house's
    description and its room list. Samples are taken from the generator
    (its page, or the export format read from its code); his code is never
    redistributed. (Q3.)
11. **A board with the region's hex map comes later**, with the table's
    maps (0110). Recorded, not built. (Q4.)

### How it was built — the author's reading, for the maintainer to confirm

**The import** (`app/ui/src/watabou/`; command **Import Watabou map…**, in
the palette and in a folder's **New** menu):

- A dialog takes the files by **Choose files…** or a drop on it; they are
  recognised by what they hold, never by their names (`detect.ts`). One map
  at a time; a dungeon's JSON and Markdown go together (the Markdown carries
  the seed, the JSON the drawing); pictures come along. A city, village,
  neighbourhood or house export is named and not imported yet. Nothing is
  written until **Import**.
- It makes a **folder named after the map**, holding the note (the folder's
  own note, same name), the JSON as it came, the pictures, and — for a
  dungeon with its JSON — the board `<name>.canvas`. A name the folder
  already holds moves on to "Name 2"; nothing is overwritten. All through the contract:
  `createFolder`, `createFile`, `createNote`, `boardText`. No new command.
- **The generator's text is kept as it came, in English.** The dungeon's
  note is the Markdown export verbatim (or the same shape made from the
  JSON, without a seed when none came) under a front matter. Verso's own few
  words (the region's headings, "Open in the generator") follow the
  interface's language.
- **Properties** (names the author's): `generator` (the generator's path:
  `one-page-dungeon`, `perilous-shores`, `city-generator`…), `seed`,
  `generator_version`, `generator_link`, `generator_tags`, `map` (the
  board), `export` (the JSON), `credit`, and for a town `settlement`,
  `walled`, `region`. Never `url`: that would make the note a web page's
  (0056).

**The drawing** (`draw.ts`): one cell is 40 px (twice Excalidraw's grid
step); every element is in one Excalidraw group, so it moves as one and a
double click edits inside. Floor: a white rectangle per room and corridor
as the JSON lists them. Walls: the outline of the floor's cells, one closed
line per outline (where two cells touch only at a corner, each keeps its own
walls). Water (clipped to the floor) light blue, columns as dots, the keys'
numbers at the generator's positions, the title above. **Doors**: the JSON
does not say what its numbers mean; read from an MIT project's names (1
door, 2 arch, 3 stairs, 4 portcullis, 5 special, 6 secret, 7 locked), and
any other number (0, 8 and 9 in the samples) drawn as an open way — its
number is kept. The note is a card beside the drawing: the keys the numbers
stand for, and the drawing's **text equivalent** (0035; the board's outline
lists it).

**The walls** (item 3), under the board's `verso` key, beside the drawing —
Verso writes back every key there it does not know, Obsidian ignores it:

```json
"walls": {"version": 1, "generator": "one-page-dungeon", "cell": 40,
  "lines": [[x1, y1, x2, y2], …],
  "doors": [{"line": [x1, y1, x2, y2], "type": 1, "kind": "door"}, …]}
```

Segments in the board's pixels, the drawing's space; a door is the segment
across its way. Moving the drawing does not move them: a later reader
should anchor them to the group.

**Who is served them** (fix of 2026-11-15, see Status): nobody but whoever
sees the board whole — the owner, a table's game master. A UniVerso serves
a reader or a player a board through an **allowlist** of its keys
(`nodes`, `edges`, and of `verso` only `version`, `drawing`, `background`),
so `verso.walls` never reaches them. A **secret door** is drawn marked
`"customData": {"verso": {"secret": true}}`, and the cut of the drawing
leaves a marked element out for them (its group stays: the rest of the
dungeon is theirs).

**A town's note on click** (item 4): following a link to a note that does
not exist makes it, as always, in the linking note's folder. When the
linking note's `generator` is `perilous-shores` and its `export` names the
region's JSON, the new note starts with what the JSON says of that town or
danger (description, kind, walled, seed, the generator's address) instead
of a title alone (`seeded.ts`, `files.ts` `createNote`). A link's meaning is
unchanged (invariant 12); Obsidian makes an empty note.

**The generated-map note** (item 5; **New generated map…**): a generator
(One Page Dungeon, Perilous Shores, city, village, Dwellings, cave,
neighbourhood), a seed Verso draws at random (1 to 2147483646) or the one
typed, an optional name. The note has `generator`, `seed`,
`generator_link`, `credit`, and an `<iframe>` of the generator at that
address — loaded through 0056's gate (the site asked about once).

**The download from an embedded page** (item 6):

- The embed's sandbox gains `allow-downloads` (`leaves/web.ts`,
  `screen/framed.ts`).
- The navigation guard lets an app view's frame reach a `blob:` address of
  an origin it already judged frameable, and no other (`web.rs`,
  `blob_origin`): the engine hands a download to the hook only after the
  guard. A framed page still cannot steer the window (no
  `allow-top-navigation`).
- The host's download hook (`windows.rs`, `on_download`) tells the app's own
  downloads (a `blob:` of the app's origin: they still go to Downloads) from
  a page's (anything else). A page's file is written by the web engine to
  the system's temporary folder, then handed to the window as a picked file
  — a token, or the bytes for a window on a server — by the event
  `page-downloaded`. The window places it beside the note or board in front,
  the import's own way (never over a file), and, when it is a Watabou
  export, opens the import with it. No `std::fs` in the host; the copy into
  the folder is the core's. The temporary file is left to the system.

**A house of Dwellings** (item 10; `dwelling.ts`, `drawHouse.ts`,
`houseNote.ts`), the author's reading:

- **The export** (*Export › as JSON*) was read from the generator's page
  code (its `JsonExporter`) and captured from the page itself (v1.4.x,
  2026-11-12, six houses; two are the tests' samples): `floors[]`, each with
  `level` (0 the ground floor, up from there, -1 the basement, listed
  last), `rooms[]` (`cells` of a grid, `i` the row and `j` the column; a
  `name` when the generator gave one), `doors[]` (`edge`: a cell and the
  side, `n`/`e`/`s`/`w`; `type` `REGULAR`, `DOORWAY`, `NULL` or none),
  `windows[]` (edges), `stairs[]` (a cell, a direction, `up`); then the
  house's `exit` and, when it has one, its `spiral` stair. **No seed and no
  name**: the file is named after the house (`castle_by_the_sea.json`), so
  the title comes from the file's name, each word capitalised as the
  generator writes it. Recognised by its content (`floors` whose first has
  `rooms`).
- **Doors**, from how the generator draws them: `REGULAR` a door (a leaf in
  a gap of half a cell), `DOORWAY` or no type a gap of half a cell with no
  leaf, `NULL` the wall left out the whole side; `exit` the house's
  entrance (a door, an arrow coming in); the spiral's side a gap.
- **The board**: one **frame** (the canvas's group) per floor, named
  *Porão (B)*, *Térreo (GF)*, *1º andar (1F)*… (the generator's own short
  names in brackets), side by side from the basement up, every floor on the
  house's whole grid, so a floor's stairs sit where the next floor's do;
  each floor's elements in one Excalidraw group inside its frame, so
  dragging the frame moves its drawing. Walls on every side of a cell
  between two rooms (thin) or a room and the outside (thick), collinear
  stretches joined; windows as a pane over the outer wall; stairs as steps,
  an arrow the way up; a spiral stair as a round tower at the corner the
  generator turns it round, under the floor. Room names in each room's
  largest box; two of one name on a floor are numbered (*Room 1*,
  *Room 2*), and a room the generator left unnamed is called *Escada* /
  *Stairs* when it holds a stair, else *Passagem* / *Passage* — in the note
  only, the drawing leaves it unnamed as the generator does. The house's
  note is a card beside the floors.
- **The note**: properties `generator: "dwellings"`, `map`, `export`,
  `credit` (no `seed`: none came); the house in one sentence (floors,
  basement, rooms, the entrance's side and room); then each floor as a
  heading and each room as a list item with its size in squares, its doors
  and where they lead, the entrance, stairs up or down, the spiral stair
  and its windows — the drawing's **text equivalent** (0035), with the same
  names. The rooms' names are the generator's, in English; Verso's words
  follow the interface's language.
- **The walls**, as the dungeon's, with what a house adds:

  ```json
  "walls": {"version": 1, "generator": "dwellings", "cell": 40,
    "lines": [[x1, y1, x2, y2], …],
    "doors": [{"line": […], "type": "REGULAR", "kind": "door", "level": 0}, …],
    "windows": [{"line": […], "level": 0}, …],
    "floors": [{"level": -1, "frame": "wh-floor-b1", "box": [x, y, w, h]}, …]}
  ```

  `lines` are the solid walls of every floor (a window's wall included:
  one cannot walk through it); a door's `line` is its gap (`kind`
  `door`, `doorway`, `opening` or `entrance`); `windows` the stretch one
  sees through; `floors` say which box is which floor. Floors never share
  a segment, each lying in its own frame.

**The import's folder** (a bug of the first round: a second import offered
the folder of the tab in front, which right after an import is the new
map's own folder, so the second map landed inside the first): of the two
ways the main session relayed, the simpler is taken — the dialog offers the
folder the person last imported into, while it exists, and before any
import the folder of the tab in front. Remembered for the window's session
only. A folder's **New** menu still offers that folder. The author's
reading.

### The generator's picture (2026-11-15) — the author's reading

**What each generator exports** (read off each generator's own menu,
2026-11-15, in a browser in Docker; samples kept outside the repository,
heads of two in `app/ui/test/watabou/`):

| Generator | Export menu | The picture |
|---|---|---|
| One Page Dungeon (v1.2.7) | *Save as PNG* (E); *Export as* › PNG… (Shift+E), SVG, JSON, VOX, Markdown | *Export as › PNG…*: **the map alone**, never turned, no title, story, notes or room numbers, transparent outside the drawing, at the *Cell size in pixels* asked (default 70). *Save as PNG* and *SVG*: the whole page — title, story, the keys' boxes, the map **turned to fit** (*View › Rotate-to-fit*, on by default) — at the window's size, the PNG about 3.5 times larger |
| Dwellings (v1.4.x) | *Export* › as PNG, as SVG, as JSON, Advanced… | **one floor**, the one shown, on the whole house's grid with three cells of margin; files named `<house>_gf`, `_1f`, `_b`…; *Advanced…* lays several floors out as a table in one picture |
| Village Generator (v1.6.9), City Generator | *Export as* › PNG, SVG, JSON | the settlement; its JSON is GeoJSON with no name (the file is named after it) |

**Terms.** Watabou's FAQ (watabou.github.io/faq.html, read 2026-11-15),
*Is it really free?*: *"The generators are obviously free to use. And
basically you can do with generated images whatever you like: You can use
maps created by the generator(s) as you like: copy, modify, include in your
commercial rpg adventures etc. Attribution is appreciated, but not
required... Please note that I strongly disapprove abusing this "license"
by selling generated maps."* Verso brings the picture the person exported
into the person's own folder, beside the note that credits Watabou
(`credit`); nothing of his code or pictures ships with Verso. Item 7's
permission concerns embedding the generators, not this.

**Where the cells are on the picture** (`picture.ts`, `align.ts`).

- **One Page Dungeon's map alone — the recommended export** (*Export as ›
  PNG…*, Shift+E, with *Export as › JSON*; built 2026-11-15 from the
  [survey](../reference/watabou-importers-survey-2026-11-15.md), observed
  on 14 exports of 9 dungeons): the PNG is `(R.w · c) × (R.h · c)` pixels,
  `R` the union of the JSON's rooms — every rect but a door's 1 × 1 cell —
  each grown by one cell, `c` the cell size typed; cell `(x, y)` is at
  pixel `((x − R.x) · c, (y − R.y) · c)`. A PNG whose size gives one whole
  `c` on both axes (within a pixel; the samples are exact) is placed with
  no SVG: box `R.w · 40 × R.h · 40` at the board's origin, `cells = [40, 0,
  0, 40, −40 · R.x, −40 · R.y]`, never turned. It is taken before a page's
  SVG when both came. The dialog, the lesson and the note's warning ask for
  this export first, the page's SVG as the other way. The picture has no
  room numbers: the key pins carry them.

Every SVG export (the whole page) puts its map in the first group with a
`transform`; the import reads the file's head for the root's size and that
transform:

- **One Page Dungeon**: `translate(…) rotate(θ) scale(s)`, the map's own
  units 30 to a cell (a room of 6 × 7 cells is 180 × 210 units). A cell
  `(x, y)` of the JSON is at `T · R(θ) · s · 30 · (x, y)` of the SVG; the
  board lays the picture at `k = 40 / (30 s)` board pixels to an SVG unit,
  so a cell stays 40 px as Verso's drawing has it. Checked against the
  generator's own page: the JSON's key "1" at (10, −6.5) falls at (948.6,
  512.2) of a 1400 × 1000 window, where the page draws its "1"; every room
  of the sample drawn over the 4846-pixel PNG lies on its picture
  (2026-11-15).
- **Rotation off** (the maintainer's second word): the One Page Dungeon's
  option is **View › Rotate-to-fit** (right-click the map; on by default).
  Exported with it off, the map's group is `translate(…) scale(s)` with no
  turn — checked on seed 12345, `translate(746.628 539.674)
  scale(0.622 0.622)`, every room on its picture — and the cells are
  square to the board (`grid` = `[40, 0, 0, 40, e, f]`), ready for 0121's
  grid. A turned export is still imported, turned; the dialog and the note
  (a `> [!warning]` callout after the pictures, in the interface's
  language) name the angle and the way to export it square: *View ›
  Rotate-to-fit* off, *Export as › SVG* and *Save as PNG*, import again.
  Square: no word. Other settings that change the page's layout, read off
  the same menus: *View › Zoom-to-fit* (the map's scale), the window's
  size (the page), *Layers › Title & story* and the *Notes* (where the map
  is put on the page) — the SVG records the result, whatever they are.
- **A page's PNG alone** (*Save as PNG*) **is not placed**, square or not: where and how large the
  map sits on the page depends on the window it was exported from, the
  title, the story and the notes' boxes, and only the SVG writes it down;
  the board keeps Verso's drawing and the dialog asks for the SVG in one
  line saying so.
- **Dwellings**: `scale(D) translate(m m)`, a cell `(j, i)` at
  `D · (j + m, i + m)`; a floor's picture is known by the generator's
  suffix in its name (`_gf` 0, `_1f` 1, `_b` −1) — or is the one floor of a
  house of one. A PNG without its SVG is placed by its size (the house's
  grid plus three cells of margin each way, the same scale both ways) and
  refused when it does not fit. The *Advanced…* table of floors is kept as
  a picture but not placed.
- **The picture shown**: the PNG of the same export when it came (the
  generator's own rendering, its fonts in it, and cut into tiles by the
  board, 0090 item 4) — the same proportions as the SVG; else the SVG (its
  text then in the system's fonts: an SVG shown as a picture loads no web
  font).

**The dungeon's board**: the picture is a map card (0090:
`verso.map`, `locked`, grouped with its pins) at the board's origin;
**each numbered key is a pin** on the picture's own number, a file card of
the dungeon's note marked `"verso": {"pin": true, "key": "1"}` — drawn as
a roundel with the number, named *"Open <note>, number 1"*, listed in the
map's pins as *"1 · <note>"* — and the note's card beside the picture.
Verso's drawing is turned and moved onto the picture (`trace.ts`: a
line's points moved, any other element turned round its middle), its
title left to the picture's; then made the **tracing**: blue (`#1971c2`),
no floor fill, `opacity` 0, `locked`, marked `"customData": {"verso":
{"traced": true}}` — a secret door keeps its `secret` mark beside it. The
walls (`verso.walls`) are written on the picture, turned with it, and gain
`"grid": [a, b, c, d, e, f]`, the matrix from the JSON's cells to the
board, for the table's vision to come.

**A house's board**: each floor with its picture has it as its frame's
map, the frame grown to the picture (three cells of margin round the
house on every floor), that floor's drawing its tracing; a floor without
one is drawn as before. No pins: the rooms' names are on the picture.

**A village or a city** (a GeoJSON whose `values` names `vg` or `mfcg`)
**is now imported with its picture**: a folder with the note
(`generator: village-generator` or `city-generator`, `generator_version`,
`map`, `export`, `credit`, the title from the file's name, the pictures),
the exports, and a board whose map is the picture (2000 px wide), the note
beside. Without a picture it is not imported and the dialog asks for it.
Any other GeoJSON generator stays named, not imported.

**Show the tracing** (`board/tracing.ts`): offered to whoever may write
the board when it holds a tracing — a map tool beside *Pin a note here…*
and a verb of the phone's ⋯ sheet, Board section, both pressed while
shown. One step shows every traced element (`opacity` 100, unlocked, to be
edited) or hides it again. It is **per viewer** (the maintainer, 2026-11-15,
"B"): the window that pressed it holds the elements seen in its own scene and
remembers the choice for that board in its own storage
(`verso.boardView:<folder>:<board>:tracing`); what the board writes to the
file and sends to a room is always the hidden form (`hideLocal`), so showing
the tracing changes no byte of the file, is no undo step, and nobody else
sees it. A wall edited while shown is a real change, saved and sent, but
hidden.

**Columns** (a fix seen over the picture): a column of the JSON stands on
a corner of the grid, not in a cell; drawn there.

## Consequences

- Verso writes Watabou's generated maps into the folder as Markdown, JSON
  Canvas and the original exports: all readable in Obsidian.
- The board gains a `verso.walls` key that only this import writes: a
  dungeon's, and a house's with its floors and windows.
- ADR 0056's sandbox list and its navigation allowance grow by one item
  each; recorded there and in the threat model.
- What only the real app shows — a download from an iframe reaching the
  hook on each system — is in `docs/reference/manual-checks.md`.
- A Watabou page embedded brings his Google Analytics, as any page brings
  its own; the site is asked about once (0056).

## Discarded alternatives

- **Pins over Watabou's picture** (the report's option): set aside by item 2
  on 2026-11-12; taken by item 2's revision of 2026-11-15.
- **Placing a page's PNG alone from the JSON's bounds** (2026-11-15, the
  author, for the maintainer's question): the generator's fit of the map
  to the page depends on the window, the title and story and the notes'
  boxes; recomputing it would be guessing its layout. Not done — and not
  needed since *Export as › PNG…* (above) is placed by arithmetic.
- **Turning the picture instead of the drawing** (2026-11-15, the author):
  a card on the board cannot be turned (JSON Canvas has no angle), and the
  picture's title and notes would read askew; the drawing is turned.
- **Hiding the tracing in the file for everyone** (2026-11-15, the author;
  reversed the same day by the maintainer, "B"): the elements' own opacity
  saved like any edit showed the tracing to everyone viewing. Built per
  viewer instead (above); the elements stay hidden and locked in the file.
- **One note per town and danger at import** (the report's question 7):
  set aside by item 4.
- **Capturing the export by a script injected into his page** (the report,
  option D): not chosen; item 6 takes the download instead.

## Status

Accepted on 2026-11-12 by the maintainer, in session: items 1–7; then
items 8–11 the same day (*"ok para watabou"*), closing the four questions
that were `[OPEN]` here, each as recommended:

- **Q1** → item 8: a town's or danger's note made on click embeds its
  generator. Built.
- **Q2** → item 9: door numbers 0, 8 and 9 stay open ways until a sample
  shows them. Unchanged.
- **Q3** → item 10: Dwellings is the next generator. Built (a frame per
  floor, the note, the walls). The city's districts are not decided.
- **Q4** → item 11: the region's hex map as a board, later, with the
  table's maps. Not built.

The mechanism under every item is the author's, built under these
decisions and labelled as such above.

**`[OPEN]` for the maintainer — a players' picture without the secret
rooms** (survey, "What Verso could adopt" 3; recorded, not built): *Export
as › PNG…* with *View › Secret rooms* off gives a second PNG of the same
size and placement without the secret rooms and their passages (observed,
seed 202). The import could take both and serve players and readers the
one without, as the drawing's secret doors are already cut for them (Status,
fix of 2026-11-15). Open: how the two are told apart (same size: the person
says which, or a name convention), and how this meets
[ADR 0121](0121-a-virtual-tabletop-layer-on-the-board.md)'s fog and sight,
which may hide those rooms anyway.
*When* answered by the maintainer on 2026-11-15 (note *decisoes-2026-11-15*,
2.3: *"B"* — *"junto com a névoa da ADR 0121"*): built with 0121's fog, its
step T11 (0121 item 9). How the two pictures are told apart stays open
here.

**Revised 2026-11-15** (item 2): the generator's picture is the map, built
on `feat/phone-home-and-board`. Chosen in the code, for the maintainer to
confirm: villages and cities imported with their picture (the importer's
first generators widened); a floor's picture known by Dwellings' suffix in
its name (the exports' own content is still what says what a JSON or
Markdown file is); the tracing's shown/hidden state saved in the file (now per viewer, never saved); the
PNG shown over the SVG when both came.

### Fixed 2026-11-15: the walls and the secret doors were served to players

Found by the reading of ADR 0121
([review](../review/2026-11-15-adr-0121-review.md), B1): as built through
0.9.0-beta.2, `verso.walls` — every wall and door of an imported dungeon or
house, a secret door named `"kind": "secret"` — was served whole to every
reader and player of a board on a UniVerso (the reader's projection and the
player's cut each filtered only the nodes, the edges and the drawing, and
let any other key through), and the drawing showed a secret door as a
dashed line to everyone. Fixed on `feat/phone-home-and-board`:

- **One allowlist, both cuts.** `verso_core::canvas_secret` (a reader's
  projection: `read_text`, `read_file_text`, `read_note`, `board_preview`,
  sync bytes and hashes, listing sizes, search) and
  `verso_server::board_sight` (a player who edits: the room's snapshot, its
  `base`, its updates, `read_text`) keep only `PUBLIC_KEYS` and
  `PUBLIC_VERSO_KEYS`; any other key is left out (fails closed). The same
  projection serves "view as a reader" and the export without secrets,
  now offered on a board whose only secret is a drawn one.
- **A drawn element secret itself** is left out of a reader's and a
  player's drawing, with its bound text and what is bound to it
  (`drawn_is_secret`): marked as above, or — for the boards already in
  folders, written unmarked — the import's own signature for a secret door,
  a `line`, `dashed`, of stroke width 3 (a width Excalidraw's menu never
  gives). A secret stroke does not shut its groups.
- **The file route** (`/f/`) now refuses a board and a note to every player
  of a table, as it does to a reader; a folder's editor at a table was sent
  a board's bytes whole.
- **History** was already the game master's for a board (ADR 0113 H).
- **Chosen in the code:** walls go to no player at all until ADR 0121
  defines what a player may know of them; a secret door the game master
  restyles (another dash or width) is no longer recognised unmarked —
  re-importing marks it. A player still sees the floor through a secret
  door's cell as an open way: hiding the room behind it is fog (0121).
- Tests: `crates/verso-core/tests/canvas_walls.rs`,
  `crates/verso-server/src/tests_board_walls.rs`, `board_sight_tests.rs`,
  the canaries of `tests_secret_pins.rs`; each seen failing on the code
  before the fix.
