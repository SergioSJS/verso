# Watabou importers survey (2026-11-15)

A survey of the tools that import maps from Watabou's generators into a
virtual tabletop or a map editor, made for
[ADR 0120](../adr/0120-maps-from-watabous-generators.md) at the maintainer's
request of 2026-11-15 (*"I know Foundry VTT has a module for Watabou to import
these maps. See how it solves this."*). The question behind it: Verso lays the
generator's own picture on the board lined up with the JSON, using the SVG's
transform ([`align.ts`](../../app/ui/src/watabou/align.ts) `dungeonFit`), and
refuses to place a PNG alone, because the page a PNG is cut from depends on the
window, the title, the story, the notes' boxes and *Rotate-to-fit*. How do the
others line a picture up?

**Short answer.** The One Page Dungeon has a second PNG export meant for
exactly this: **Export as › PNG…** (Shift+E), which asks for a **cell size in
pixels** (default 70) and writes **the map alone, never turned, at that many
pixels a cell, starting one cell before the dungeon's first room**. Its size and
position follow from the JSON alone; the window, *Rotate-to-fit*, *Zoom-to-fit*,
the title, the story and the notes play no part. The Foundry module the
maintainer remembers (One Page Parser, MIT) is built on it. Verso can place
such a PNG with no SVG at all (see "What Verso could adopt").

How the facts were obtained is marked: **observed** (generator run in a
browser, exports captured and measured), **read** (code or documentation of a
third party), **reported** (someone else's description, not checked).

## The tools

| Tool | For | Link | Author | Licence | Last release | Versions | Maintained |
|---|---|---|---|---|---|---|---|
| **One Page Parser** | Foundry VTT | [repo](https://github.com/TarkanAl-Kazily/one-page-parser), [package](https://foundryvtt.com/packages/one-page-parser) | Tarkan Al-Kazily | **MIT** | v0.7.1, 2025-12-08 | Foundry 0.8.6 – 13 (verified 13) | lightly (fixes in 2025; first release 2021) |
| **Cartomancer — Map Generators** | Foundry VTT | [repo](https://github.com/DimitroffVodka/cartomancer) (not on foundryvtt.com; installed by manifest) | DimitroffVodka | **none stated** (all rights reserved); bundles Watabou's own generator code | v0.4.3, 2026-08-12 | Foundry 13 – 14 (verified 14) | yes (four releases June–August 2026) |
| **MJl – One Page Dungeon Importer** | Foundry VTT | [repo](https://github.com/MJl2517/Foundry-module-one-page-dungeon-svg-importer) | MaJluHa (MJl2517) | **none stated** | v0.2.1, 2026-11-07 | Foundry 13 only | yes, new (first release 2026-06-30) |
| **Import One Page Dungeon** (Dungeon Scrawl plugin) | Dungeon Scrawl (Roll20) | [Roll20 help](https://help.roll20.net/hc/en-us/articles/16980316686743-Generating-maps) | Dungeon Scrawl / Roll20 | proprietary | not dated | — | part of the product (reported) |
| **Import Watabou One Page Dungeon** (Dungeondraft mod) | Dungeondraft | [cartographyassets 52353](https://cartographyassets.com/assets/52353/import-watabou-one-page-dungeon) | not read (page refused automated fetch) | not read | v1.0.1 (reported) | — | unknown |
| **ImportWatabouCave** | Dungeondraft | [repo](https://github.com/uchideshi34/ImportWatabouCave) | uchideshi34 | **none stated** | no release; one commit 2026-03-27 | — | unknown |
| **Mage Hand** (`watabouImporter.ts`) | its own web VTT | [repo](https://github.com/tdrewry/mage-hand) | tdrewry | **MIT** | no release; last push 2026-03-28 | — | small project |
| Non-VTT importers | Unreal (PCGEx Watabou, MIT; *Watabou Bridge*, bundled "with Watabou's permission"), TaleSpire (`jchallenger/citysmith`, Apache-2.0; a Symbiote mod), Blender scripts | GitHub search "watabou" | various | — | — | — | out of scope: cities and 3D, no picture alignment |

Searched: foundryvtt.com packages, GitHub (repositories and code, "watabou",
"one-page-dungeon", "one page dungeon importer", "dd2vtt"), the generators'
itch.io comments, and the web for Roll20, Owlbear Rodeo and Universal VTT
(`.dd2vtt`). **No Owlbear Rodeo extension and no Watabou → Universal VTT
converter was found.**

### Watabou's own exports (observed, One Page Dungeon 1.2.7)

The *Export as* submenu holds **PNG…, SVG, JSON, VOX, Markdown**; beside it,
**Save as PNG** (E). There is no Foundry, Universal VTT (`.dd2vtt`) or "VTT"
export. On itch.io a user asked for Universal VTT and the author answered he was
considering it, about two years ago (reported); 1.2.7 does not have it. The
author's *Keyboard shortcuts* devlog lists **E – save as PNG** and **Shift+E –
export as PNG**, and Shift+1 / Shift+2 for normal and small cells.

The two PNGs are different pictures:

| | **Save as PNG** (E) | **Export as › PNG…** (Shift+E) |
|---|---|---|
| What | the whole page as shown: title, story, notes' boxes, room numbers, the map turned and zoomed as on screen | **the map alone**: no title, no story, no notes' boxes, no room numbers |
| Size | the window's proportions, scaled up to about 16.7 megapixels (4846 × 3461 from a 1400 × 1000 window) | **`(R.w · c) × (R.h · c)`** pixels, `c` the cell size typed in the dialog (*Cell size in pixels*, 10 to 200, default 70, capped so the picture stays under about 16.7 megapixels) |
| Turned | as on screen (*Rotate-to-fit*) | **never**: square to the JSON's cells whatever *Rotate-to-fit* says |
| Background | the paper colour | **transparent** outside the drawing |
| Lines up with the JSON | only through the SVG of the same page | **by arithmetic**: cell `(x, y)` of the JSON is at pixel `((x − R.x) · c, (y − R.y) · c)` |

`R` is the dungeon's box in cells: the union of the JSON's **room** rectangles
(the `rects` that are not a door's 1 × 1 cell) each grown by **one cell** on
every side. That margin is the wall ring round each room; the picture starts
one cell before the first room.

**How this was established.** The generator was run in Chromium (Playwright
image, in Docker) on 2026-11-15, seeds 12345, 777 (`large`), 4242
(`small,secret`), 101, 202, 303, 404 and 505 (`secret`). For each, the JSON and
*Export as › PNG…* at cell sizes 30, 31, 40, 50, 70 and 71 were captured:
**all 14 PNGs have exactly the size the rule gives**, and every room cell's
centre is opaque where the rule puts it (420 of 420, 394 of 394, 86 of 86
cells, three dungeons checked); the JSON's rooms, doors and note positions
drawn over the PNGs fall on the picture's walls, doors and rooms. The same seed
exported with *Rotate-to-fit* on (map turned 30°), off, and with notes hidden,
in a 1400 × 1000 and a 900 × 1300 window, gives the same 3010 × 3010 picture.
*Small tiles* (Shift+2) does not change the size: `c` counts normal cells. To
find what to capture, the export functions of the page's own code were read
(the menu's entries and the export dialog); the rule above is what the
captures show. Nothing of the page's code is reproduced here. Samples and the
capture script are outside the repository, in
`~/.cache/verso-kit/watabou/samples/opd-png-2026-11-15/` and
`~/.cache/verso-kit/watabou/capture/opd-png*.mjs`.

**Secret rooms** (observed, seed 202): with *View › Secret rooms* off, the
same export leaves the secret rooms and their passages out, **at the same size
and the same placement** — `R` always counts them. Two exports of one dungeon,
secrets on and off, are a game master's picture and a players' picture that lie
exactly on each other.

**Door types** (observed: the PNG cropped round each door of two dungeons; the
names are what the pictures show):

| `type` | Drawn as | One Page Parser (MIT) names it | ADR 0120 (from Skirmish, MIT) |
|---|---|---|---|
| 0 | nothing: an open way, no frame | empty | open way |
| 1 | a door in a frame | single door | door |
| 2 | an archway, notched jambs, no leaf | opening | arch |
| 3 | stairs leading off the map (the entrance) | stair entrance | stairs |
| 4 | a portcullis (a dotted bar) | bars | portcullis |
| 5 | a heavier door, doubled frame | double door (made locked) | special |
| 6 | (not in the samples) | secret wall (secret door) | secret |
| 7 | a narrow door set in the wall's thickness | flush door | locked |
| 8 | stairs leading off the map | stair exit | open way |
| 9 | steps inside the map | not named | open way |

The two MIT sources **contradict each other on 5 and 7**; recorded, not
decided. 0, 8 and 9 are all passable, as ADR 0120 item 9 draws them.

## How alignment is solved, tool by tool

### One Page Parser (Foundry, MIT)

- **Inputs**: the PNG from *Export as › PNG…* and the JSON; the scene's grid
  size typed in the form, to equal the cell size chosen in the generator
  (default 70, at least 50)
  ([README](https://github.com/TarkanAl-Kazily/one-page-parser/blob/1ca62b966857b6bb60aeeb4dd0a6ccbb3bf2e7dc/README.md)).
  It does not re-render the map.
- **Alignment**: the scene is the PNG's size with no padding, its grid the
  typed size
  ([one_page_parser.js:283-296](https://github.com/TarkanAl-Kazily/one-page-parser/blob/1ca62b966857b6bb60aeeb4dd0a6ccbb3bf2e7dc/scripts/one_page_parser.js#L283-L296)).
  Walls are computed in cells, multiplied by the grid size, then moved so the
  smallest wall coordinate lands **0.75 cell** in from the picture's corner
  ([:311-368](https://github.com/TarkanAl-Kazily/one-page-parser/blob/1ca62b966857b6bb60aeeb4dd0a6ccbb3bf2e7dc/scripts/one_page_parser.js#L311-L368)).
  With its 0.25-cell wall offset that puts the first room's edge exactly one
  cell in — the margin above, found by trial: a later fix (commit `e85b5ef`,
  "wall off-by-one") special-cases a door (an exit) at the left or top edge,
  because it takes the minimum over **all** rects, doors included. Taking only
  the rooms, as `R` above, needs no special case.
- **Builds**: walls from the outline of the filled cells, merged into long
  segments and pushed **0.25 cell into the rock** so they sit on the drawn wall
  rather than on the floor's edge
  ([:46-158](https://github.com/TarkanAl-Kazily/one-page-parser/blob/1ca62b966857b6bb60aeeb4dd0a6ccbb3bf2e7dc/scripts/one_page_parser.js#L46-L158));
  doors as 1.5-cell door walls across the way, secret (6) as Foundry secret
  doors, bars (4) locked and see-through, 0/2/3/8 as no wall
  ([:162-203](https://github.com/TarkanAl-Kazily/one-page-parser/blob/1ca62b966857b6bb60aeeb4dd0a6ccbb3bf2e7dc/scripts/one_page_parser.js#L162-L203));
  a Foundry note per JSON note, its text wrapped
  ([:377-386](https://github.com/TarkanAl-Kazily/one-page-parser/blob/1ca62b966857b6bb60aeeb4dd0a6ccbb3bf2e7dc/scripts/one_page_parser.js#L377-L386));
  token vision and fog on. No lights.

### Cartomancer (Foundry, no licence stated)

- **Inputs**: none from the person. It **runs Watabou's generators inside
  Foundry**, same-origin: the generators' code is downloaded from
  watabou.github.io into Foundry's data on first use, and copies of it sit in
  the module's repository (`scripts/maphub/js/Dungeon.js`, `Dwellings.js`,
  `Cave.js`…), patched to expose its classes. The person generates, then
  presses *Import Scene*.
- **Alignment**: it turns *Rotate-to-fit* off itself before capturing
  ([MaphubViewerApp.mjs:2116](https://github.com/DimitroffVodka/cartomancer/blob/0626f9ff614945a231f2cea32148bc1645b70186/scripts/MaphubViewerApp.mjs#L2116)),
  captures the live canvas, reads the map's **render transform from the
  generator's own objects**
  ([:2148-2175](https://github.com/DimitroffVodka/cartomancer/blob/0626f9ff614945a231f2cea32148bc1645b70186/scripts/MaphubViewerApp.mjs#L2148)),
  corrects for the device pixel ratio, then rescales the capture so one cell
  is a whole number of pixels and crops it so cell zero lands on Foundry's
  grid origin
  ([:937-1000](https://github.com/DimitroffVodka/cartomancer/blob/0626f9ff614945a231f2cea32148bc1645b70186/scripts/MaphubViewerApp.mjs#L937)).
  The same for caves (the generator's square grid), Perilous Shores (a
  flat-top hex grid sized to the drawn hexes) and Dwellings (one Foundry level
  per floor, the generator set to *Double grid*). Its guide asks the person to
  turn notes and title off, since they are captured too.
- **Builds**: walls and doors (from the JSON, with a copy of One Page Parser's
  wall code, `scripts/maphub/OnePageParserSD.mjs`), fog and vision; Dwellings:
  per-floor walls, doors and stair regions linking the levels; a journal with
  an overview page and one page per room, pins on the scene; Perilous Shores:
  a folder with the realm scene, pins and linked journal entries, a location's
  map generated on demand.

### MJl – One Page Dungeon Importer (Foundry, no licence stated)

- **Inputs**: **the SVG alone**; no JSON, no PNG. The README asks for *Notes*
  off before exporting.
- **Alignment**: the SVG is the scene's background with a viewBox cropped
  round the map; the cell size is found inside the SVG and scaled to the
  scene's grid (default 72). **A turned map is refused**
  ([svg-parser.js:211](https://github.com/MJl2517/Foundry-module-one-page-dungeon-svg-importer/blob/139782b3b745321edf812c3cd9e209233fc2e956/watabou-one-page-dungeon-importer/scripts/svg-parser.js#L211)):
  the person must export with *Rotate-to-fit* off, as Verso's dialog says
  today. Large maps get a smaller cell so the texture stays under Foundry's
  limit.
- **Builds**: walls from the floor's clip path in the SVG
  ([:143](https://github.com/MJl2517/Foundry-module-one-page-dungeon-svg-importer/blob/139782b3b745321edf812c3cd9e209233fc2e956/watabou-one-page-dungeon-importer/scripts/svg-parser.js#L143)),
  doors from the door shapes; secret doors **guessed from geometry** (a
  passage about half a cell wide through the wall,
  [:708](https://github.com/MJl2517/Foundry-module-one-page-dungeon-svg-importer/blob/139782b3b745321edf812c3cd9e209233fc2e956/watabou-one-page-dungeon-importer/scripts/svg-parser.js#L708)),
  because without the JSON it has no door types. Caves too (2026-07).

### Dungeon Scrawl plugin and the Dungeondraft mod (reported)

Both take **the JSON only** and redraw the dungeon in their own look (Dungeon
Scrawl: rooms and doors on the selected layer; the Dungeondraft mod: walls,
columns, floors as patterns, wall shadows; water and notes not supported). No
picture of Watabou's is used, so there is nothing to align. Older reports
mention a wrong grid size and all doors horizontal in Dungeon Scrawl, after a
generator update.

### ImportWatabouCave (Dungeondraft, no licence stated)

Reads a Cave/Glade **SVG** and redraws it in Dungeondraft; the scale is a
slider the person sets (30 SVG units a cell assumed). No alignment of
Watabou's picture.

### Mage Hand (its own VTT, MIT)

Takes the dungeon's **JSON** and rebuilds rooms as its own regions at a fixed
50 pixels a cell, doors as door objects; no picture.

## What Verso could adopt

1. **Place a One Page Dungeon PNG alone, when it comes from *Export as ›
   PNG…*.** With the JSON (always there for a dungeon), compute `R` — the room
   rects, doors' 1 × 1 cells left out, each grown by one cell, their union —
   and accept a PNG whose width and height are `R.w · c` and `R.h · c` for the
   same `c` (an integer, 10 to 200, within a pixel). Then, at Verso's 40
   pixels a cell ([`draw.ts`](../../app/ui/src/watabou/draw.ts) `CELL`): the
   picture's box is `R.w · 40 × R.h · 40`, and `cells = [40, 0, 0, 40,
   −40 · R.x, −40 · R.y]`, `turned = 0`. This is a new branch of `dungeonFit`
   before the "no SVG, no picture" exit; the SVG path stays for *Save as PNG*
   pages. *Save as PNG* is never mistaken for it: its proportions are the
   window's, it has an opaque background (a corner pixel's alpha tells them
   apart too), and it almost never matches `R`'s proportions with an integer
   `c`.
2. **Ask for that export in the dialog instead of the SVG.** Today the person
   is told to turn *Rotate-to-fit* off and export SVG and PNG. *Export as ›
   PNG…* (Shift+E), OK on the default 70, plus *Export as › JSON* (J) and
   *Markdown* is one instruction, independent of every view setting. Two
   consequences to accept: the picture has **no title, story, notes or room
   numbers** (Verso's pins and the note carry them, as now), and a
   **transparent background** (the board shows through outside the drawing).
3. **A players' picture for free.** The same export with *View › Secret rooms*
   off gives a second PNG at the same size and place without the secret
   rooms. Verso could take both and serve the players the second one — the
   picture side of the secret-door cut ADR 0120 already does for the drawing.
   Telling the two apart (both have the same size) needs the person to say
   which is which, or a name convention. `[OPEN]` — a proposal for the
   maintainer, not decided.
4. **Walls on the drawn wall, not on the floor's edge.** One Page Parser moves
   each wall 0.25 cell outwards into the rock, so a token can stand on the
   whole floor and vision stops where the ink is. Worth considering when the
   table's vision ([0121](../adr/0121-a-virtual-tabletop-layer-on-the-board.md))
   first reads `verso.walls`; MIT, so its code may be studied (with its
   notice if any is taken).
5. **Door types**: the table above adds observations for 0, 3, 8 and 9 and a
   contradiction between two MIT sources on 5 and 7; ADR 0120 item 9 may want
   them. Not changed here.
6. **Not adoptable**:
   - Cartomancer's method (running Watabou's code same-origin and reading its
     render transform) carries his code without a licence; ADR 0120 item 7
     asks his permission only for embedding, and Verso never redistributes his
     code. Its realm-to-journal and per-floor ideas match what 0120 items 4
     and 10 already do.
   - MJl's SVG-only geometry (walls from the clip path, secret doors guessed)
     has no licence, and Verso has the JSON, which says the door types.
   - **There is no Watabou Universal VTT (`.dd2vtt`) export to import**
     (1.2.7; reported as considered by the author, never shipped).
7. **Other generators**: Dwellings' PNG is already placed by its size (house
   grid plus three cells, [`align.ts`](../../app/ui/src/watabou/align.ts)
   `houseFit`); Cartomancer's note that Dwellings' *Double grid* is what it
   aligns to was not checked against Verso's floors. Cave/Glade (PNG and SVG
   only) is imported by MJl and Cartomancer through the SVG's geometry or the
   live grid; Verso does not import caves.

**Licence notes.** Verso is MPL-2.0 ([0005](../adr/0005-license.md)). One Page
Parser and Mage Hand are MIT: their code may be studied and, with the notice
kept, reused. Cartomancer, the MJl importer and ImportWatabouCave state no
licence: they were read only to learn how they behave; nothing of them is
reproduced here and nothing may be copied. Watabou's generators are closed;
their maps are free to use (FAQ, quoted in ADR 0120); his page's code was read
only to find what to observe, and the facts above are the captures'.
