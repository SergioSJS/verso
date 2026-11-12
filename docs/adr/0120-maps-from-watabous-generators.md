# ADR 0120 — Maps from Watabou's generators: the importer, our own drawing, the generated-map note

- Date: 2026-11-12
- Source: the maintainer, in session on 2026-11-12, answering the seven
  questions of the research report of 2026-11-11 on Watabou's generators
  (watabou.github.io, Procgen Arcana; the report is the maintainer's, kept
  outside the repository). On the dungeon: *"Masmorra importada bora fazer
  nosso desenho"* (an imported dungeon: let's make our own drawing). On
  downloads from an embedded page (ADR 0056): *"deveria ser SIM!"* (it should
  be YES!). The other answers came as choices of the report's options,
  relayed by the main session; no other words of his are recorded.
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

## Consequences

- Verso writes Watabou's generated maps into the folder as Markdown, JSON
  Canvas and the original exports: all readable in Obsidian.
- The board gains a `verso.walls` key that only this import writes.
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

Accepted on 2026-11-12 by the maintainer, in session: items 1–7. The
mechanism under them is the author's, built under that decision and
labelled as such above. `[OPEN]`, for the maintainer:

- **Q1.** Should a town's or danger's note, made on click, embed its
  generator (as item 5's note does)? Recommended: yes, the same note.
- **Q2.** Door numbers 0, 8 and 9: drawn as open ways until observed.
  Recommended: keep, revisit when a sample shows them.
- **Q3.** Next generators: Dwellings (rooms, doors, windows per floor, walls
  as for the dungeon), then the city's districts. Recommended: Dwellings.
- **Q4.** The region's hex map as a board. Recommended: later, with the
  table's maps.
