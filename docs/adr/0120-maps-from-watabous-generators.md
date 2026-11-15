# ADR 0120 — Maps from Watabou's generators: the importer, our own drawing, the generated-map note

- Date: 2026-11-12
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
  Dwellings' drawing and note hold) came relayed by the main session.
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

- **Pins over Watabou's picture** (the report's option): set aside by item 2.
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
