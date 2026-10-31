# ADR 0094 — The rest of bases: regular expressions, the map layout, and what 0053 left unbuilt

- Date: 2026-10-14
- Source: `docs/roadmap.md`, revision 8, row V.19, from the maintainer's
  answer of 2026-10-14 on which core gaps enter V1 — the rest of bases,
  *"resto das bases"*: their regular expressions **and** the map layout;
  [0053](0053-views-bases.md), Consequences ("Not built: regular
  expressions, the map layout, `html()` rendered as HTML, per-view editing
  of a base embedded from another file"). Written by Opus 5.5 at the
  maintainer's request; to be read by the other model before it is
  accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0053](0053-views-bases.md), [0050](0050-outbound-network-access.md)
  (outbound network), [0056](0056-embedded-web-pages.md) (origins the user
  approved), [0090](0090-maps-on-the-board.md) (maps on the board),
  [0083](0083-security-hardening-of-universo.md) (a server's bounds),
  [0081](0081-sharing-between-people-on-one-universo.md) item 11 (a
  receiver's aggregates), [0087](0087-secret-blocks-hidden-from-readers.md),
  [0085](0085-hover-preview.md), [0092](0092-the-phone-offline.md),
  [0030](0030-base-dialect-obsidian-compatible.md) (invariant 12),
  [0009](0009-external-constraints.md), [0028](0028-crate-structure.md),
  [0035](0035-cross-cutting-requirements.md).
- Status in the briefing: not present; the structured-views row of §5.3
  is `DECIDED` by [0053](0053-views-bases.md).

## Context

**What exists.** `verso-dialect` reads a base and its expression language,
regular expression literals included — `/pattern/flags` is kept as text
(`crates/verso-dialect/src/bases/expr.rs`). `verso-core` evaluates it with
a budget of steps per query, every value it makes charged to the budget
and every text capped (`crates/verso-core/src/bases/eval.rs`); a regular
expression reaching a method — `matches`, `replace`, `split` — is an error
in the cell, "not evaluated", as 0053 decided (what is not evaluated is
said, never guessed). Every other function Obsidian's Functions page
lists is evaluated (compared on 2026-10-14). The window draws five
layouts — table, cards, list, kanban, calendar; a view of another
`type` is drawn as a table with a line saying the layout is unknown
(`app/ui/src/bases/view.ts`), and `map` already has a name and an icon
there. A base runs in the window's host on the desktop and in
`verso-server` on a UniVerso, over every note of the folder.

**Regular expressions, as Obsidian documents them** (the public help,
[Functions](https://obsidian.md/help/bases/functions), source
`en/Bases/Functions.md` at `e23f4f92`, 2026-05-14; read 2026-10-14):

- *"Bases functions follow JavaScript behavior. For complete reference
  documentation, refer to MDN Web Docs."*
- A regular expression is a literal, *"Example: `/abc/`"*, with one
  method, `regexp.matches(value: string): boolean` — *"`/abc/.matches("abcde")`
  returns `true`"*.
- `string.replace(pattern: string | Regexp, replacement: string): string`:
  *"When `pattern` is a Regexp, you can reference capture groups in
  `replacement` using `$1`, `$2`"*; *"If `pattern` is a Regexp, the `g`
  flag determines if only the first or if all occurrences are replaced."*
- `string.split(separator: string | Regexp, n?: number): list`.
- Not documented: any flag but `g`; what an invalid pattern does; a
  constructor. `obsidian.d.ts` has `RegExpValue` (`@since 1.10.0`).

**The map layout, as Obsidian documents it** — **not core**: *"It
requires installing the Maps plugin"*, *"an official community plugin
that you can download separately"*, from Obsidian 1.10
([Map view](https://obsidian.md/help/bases/views/map); the 1.10.0
changelog, 2025-10-01: *"New Maps plugin lets you visualize your base
entries on a map"*). The plugin is Obsidian's, MIT,
[`obsidianmd/obsidian-maps`](https://github.com/obsidianmd/obsidian-maps)
(0.2.2, 2026-08-01), built on MapLibre GL JS; it registers the view
`type: map`. The help page:

- coordinates from a property, *"`coordinates: "lat, lng"` (Text
  property)"* or a list of two, or a formula `[latitude, longitude]`;
- a marker's icon (*"The name of an icon from the Lucide library"*) and
  colour (*"A valid CSS value"*), each possibly a formula; the embedded
  height, the centre, the zoom bounds;
- tiles: *"Maps support both raster and vector tiles, and accepts most
  tile URLs, including TileJSON URLs"*; the README: *"Maps use
  OpenFreeMap tiles by default"*, another source set in the plugin's
  settings, with a separate URL for dark mode. Neither page says
  anything about privacy or the network.

The view's keys in a `.base` file (`coordinates`, `markerIcon`,
`markerColor`, `center`, `defaultZoom`, `minZoom`, `maxZoom`,
`mapHeight`, `mapTiles`, `mapTilesDark`) are read from the plugin's public
MIT source (`src/map-view.ts`), not from the help — an admissible source
since [0009](0009-external-constraints.md)'s revision of 2026-10-14 (the
maintainer's *"Sim, todas"*: the public source of an open-source plugin
Obsidian publishes, like `obsidian.d.ts`) — and checked on a base the
plugin writes before the PR.
The plugin's manifest asks for Obsidian 1.13.1 while the help says 1.10;
recorded, not resolved.

[0050](0050-outbound-network-access.md) item 1: Verso asks the network
only for addresses written in the user's notes or clicked, and *"no third
party in a site's place"*. A tile server named by nobody is such a third
party: it learns which places, at which zoom, the person looks at.

## Decision

Proposed (2026-10-14). Accepted on 2026-10-14 (Status): each `[DECIDED 2026-10-14]` was decided as
recommended and is marked `[DECIDED 2026-10-14]`.

### Regular expressions

1. **Evaluated as Obsidian documents them**: the literal `/pattern/flags`,
   `regexp.matches(text)`, `replace` with a pattern — the first match, or
   every one with `g`, `$1`…`$99`, `$&` and `$$` in the replacement as MDN
   gives them —, and `split` with a pattern and a limit. A regular
   expression anywhere else (`contains`, `startsWith`) stays an error, as
   the help gives those methods strings only.
2. **The engine.** `[DECIDED 2026-10-14]`. Options: (a) the `regex` crate (MIT or
   Apache-2.0, already in the workspace's lock through `verso-server`'s
   tests), whose matching time is linear in the pattern and the text —
   no catastrophic backtracking exists for it; it has no look-around and
   no back-references; (b) `fancy-regex`, which adds both by backtracking,
   with a limit on its steps; (c) the window's own JavaScript `RegExp` —
   not open to a base the core evaluates, on a server too, and unbounded.
   Decided: **(a)**, in `verso-core` only — `verso-dialect` keeps the
   literal as text and gains no dependency (a pure parser that compiles
   to WASM, [0028](0028-crate-structure.md), [0029](0029-guardrails-in-ci.md));
   a pattern using what (a) lacks is an error in the cell that names it
   ("look-behind is not evaluated"), never a guess.
3. **Bounds**, because a base runs on a server over every note
   ([0083](0083-security-hardening-of-universo.md)): a pattern of at most
   1,000 characters; a compiled size capped (`RegexBuilder::size_limit`
   and the lazy DFA's), past which it is an error; a pattern compiled
   once per query, not once per row; each match charged to the query's
   budget by the length of the text it scans, as every text is. The
   numbers are measured on the 1-core, 1 GB host with the others of
   0083 item 18 (roadmap V.10) and changed if the measure says so.
4. **JavaScript's meaning, where the engines differ**: `\d`, `\w` and
   `\b` are ASCII, as in JavaScript; `.` stops at a line break unless
   `s`; `^` and `$` match at line breaks only with `m`. Flags: `g`, `i`,
   `m`, `s` and `u` are honoured; `y`, `d` and `v` are an error that
   names them. A difference found later is a test with both answers, and
   the code follows JavaScript.
5. **An invalid pattern** is an error in the cell and a line above the
   view naming the formula, as any formula error is in 0053 — the help
   does not say what Obsidian does, and Verso does not guess it.

### The map layout

6. **A view `type: map`, with the Maps plugin's keys.** A note with a
   coordinates property — a text `"lat, lng"` or a list of two numbers,
   or a formula giving either, out-of-range values left off — is a marker
   with its icon and colour; a click opens the note, a hover shows its
   preview ([0085](0085-hover-preview.md)); the centre, the zoom bounds and
   the height as the view says. A base Obsidian's plugin made opens as a
   map in Verso, and one made in Verso opens in Obsidian with the plugin
   installed; without it, Obsidian does not draw that view, which is its
   behaviour, not Verso's. The markers and the view's settings change
   from the view's menus as 0053's layouts do; a marker is not dragged to
   new coordinates in V1. `[DECIDED 2026-10-14]`: whether "New note here" on the map —
   a note made with the clicked coordinates — is in V1. Decided:
   **not in V1**; it is not in Obsidian's documented view.
7. **The drawing library.** `[DECIDED 2026-10-14]`. Decided: **MapLibre GL JS**
   (BSD-3-Clause, what the plugin uses, so a `mapTiles` style URL that
   works there works here), loaded only when a map view opens; its
   licence checked by the npm allowlist, the dependency justified in the
   PR.
8. **Tiles: none from a third party by default.** `[DECIDED 2026-10-14]`: what a map
   shows with no source chosen. Decided: **a world drawn from data
   shipped with the app** — a low-detail outline of coasts and borders
   (Natural Earth's, public domain by its terms, to be confirmed in the PR
   that adds it), no network —; **a tile source only by the person's
   choice**, as an origin approved in Settings as an embedded page's
   origin is ([0056](0056-embedded-web-pages.md)): the window then loads
   tiles from it directly, as a note's remote image loads, and the
   "load remote content" setting of [0050](0050-outbound-network-access.md)
   governs it. Settings offers OpenFreeMap — the plugin's default —
   named, as one choice to turn on, never on by itself.
9. **A base's own `mapTiles`.** A tile address written in a `.base` file
   is an address written in the folder, and a base in a shared folder
   would have every reader's window ask that server. `[DECIDED 2026-10-14]`.
   Decided: **used only when its origin is approved** (item 8) — the
   first time, the view says which origin the base names and offers to
   approve it; until then the shipped world is drawn.
10. **On a UniVerso and the phone.** The tiles never pass through the
    server: the window fetches them, and the server's content security
    policy lets the window reach only the approved origins. The phone
    offline ([0092](0092-the-phone-offline.md)) draws markers on the
    shipped world; approved tiles are not kept offline in V1. A reader
    sees only the markers of notes they may read; a secret block
    ([0087](0087-secret-blocks-hidden-from-readers.md)) holding a
    coordinate is not read for a reader; a share's receiver counts as
    [0081](0081-sharing-between-people-on-one-universo.md) item 11 says.
11. **Pictures as maps.** A map view over a picture of the folder,
    coordinates in its pixels — a fictional world in a base — is a Verso
    extension Obsidian's plugin does not document. `[DECIDED 2026-10-14]`. Decided:
    **not in V1**: [0090](0090-maps-on-the-board.md)'s pins on a board are
    V1's fictional maps.

### The rest 0053 left unbuilt

12. **`html()` rendered as HTML.** Today it shows its text. `[DECIDED 2026-10-14]`:
    whether V1 renders it. Decided: **yes, through the window's
    sanitizer** (`app/ui/src/sanitize.ts`), the one a note's HTML goes
    through — no script, no event attribute, remote content under 0050's
    setting —, on a server as on the desktop.
13. **Per-view editing of a base embedded from another file.** Today
    `![[File.base#View]]` switches views only. `[DECIDED 2026-10-14]`: whether V1
    edits it in place. Decided: **yes**: the embed's menus write the
    `.base` file they show, through the ordinary write and its revision
    check (invariant 11), as the base's own tab does; a reader sees no
    menu ([0076](0076-the-window-on-every-screen.md)).
14. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
    a map view has its markers also as a list — name, coordinates — in the
    order of the view's sort, reachable by Tab and named after their
    notes, the text equivalent of the map, as 0090 item 7 gives a board's
    pins; a regular expression's error is a sentence; pt-BR and English.

## Consequences

- `verso-core` gains the regular expressions (with item 2's engine as a
  new dependency of that crate, justified in the PR) and tests of each
  documented example of the help, the flags, item 4's differences, an
  invalid pattern, and a pattern known to backtrack catastrophically
  elsewhere (`(a+)+$` over a long text) finishing within the budget; the
  fuzz target of the expressions covers patterns.
- The window gains the map layout, the shipped world and the tile origins
  in Settings; e2e tests for a map of a few notes, a marker opening its
  note, a base naming an unapproved tile origin, and the list of markers;
  `html()` drawn sanitized; the embed's menus writing their file.
- The server's content security policy names the approved tile origins;
  its suite tests that it never fetches a tile.
- [0053](0053-views-bases.md)'s "Not built" list is answered by a
  Revisions line there when this ADR is accepted.
- The tutorial ([0058](0058-demo-vault-as-tutorial.md)): note 04 gains a
  formula with a regular expression and a map view over a few notes with
  coordinates; the changelog gets its line.

## Discarded alternatives

None recorded.

## Status

**Accepted (2026-10-14).** The maintainer, that night, answered the
questions of 0093, 0094 and 0095 with *"Sim, todas"* (yes, all): every
`[OPEN]` decided as recommended, marked `[DECIDED 2026-10-14]` in place. In
V1 (`docs/roadmap.md`, Phase 4 — V1, row V.19, wave A). The same answer
made the public source of an open-source plugin Obsidian publishes —
`obsidianmd/obsidian-maps` — an admissible source
([0009](0009-external-constraints.md), revised 2026-10-14), which the
Context's reading of the view's keys relies on. A Revisions line in
[0053](0053-views-bases.md) answers its "Not built" list.

Resolved on 2026-10-21 (0094, option A, in the decisions questionnaire of 2026-10-20): the Maps plugin's manifest asks for Obsidian 1.13.1 and its help page says 1.10; **both versions are cited and the manifest's (1.13.1) is followed**, as it is published code and the help page may be out of date.

*(History, before the acceptance above:)* Proposed (2026-10-14). In V1
by the maintainer's answer of 2026-10-14 (`docs/roadmap.md`, Phase 4 —
V1, row V.19). For the maintainer, each with a recommendation: the
engine (item 2), "New note here" (item 6), the drawing library (item
7), what a map shows with no source (item 8), a base's own tile address
(item 9), pictures as maps (item 11), `html()` (item 12), editing an
embedded base (item 13).
