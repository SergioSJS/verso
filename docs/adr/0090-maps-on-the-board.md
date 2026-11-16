# ADR 0090 — Maps on the board: a picture under the board, pins that open notes, secret pins

- Date: 2026-10-14
- Amended in part by [0121](0121-a-virtual-tabletop-layer-on-the-board.md) (Accepted 2026-11-15, not built): its revision of
  2026-10-15, pick 1 (a fogged JPEG or WebP map converted on the game
  master's device) and pick 2 (table players who only see a board follow it
  live). This text is amended when the step that builds each is merged.
- Source: the maintainer, on 2026-10-14 at 11:36 UTC, sending a plan of
  new features drafted with another assistant whose third item is an
  "Atlas" of interactive maps — a large picture with pins that open notes,
  pins that keep their size at any zoom, a preview on hover, secret pins
  — stored as a `.map` file of its own. The reading in session that
  morning proposed the board instead, which Obsidian opens, and listed
  what it lacks; it proposed maps for a later version. The maintainer's
  answer that evening: *"VAI SER TUDO NA V1"* (it will all be in V1) —
  the maps included, no later version. Written by Opus 5.5; to be read by
  the other model before it is accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0057](0057-board-json-canvas.md) (the board, a JSON Canvas
  file drawn with Excalidraw; spec §5.11), [0063](0063-files-onto-the-board.md)
  (a picture is a file card), [0024](0024-board-excalidraw.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md) item 12 (a board is a
  room of its elements), [0085](0085-hover-preview.md) (the pin's
  preview), [0087](0087-secret-blocks-hidden-from-readers.md) (readers
  served a projection), [0036](0036-tabletop-rpg-support.md) (named
  viewports, the player view), [0011](0011-config-outside-tree-index-as-cache.md)
  (caches outside the folder), [0009](0009-external-constraints.md),
  [0035](0035-cross-cutting-requirements.md).
- Status in the briefing: not present; on acceptance.

## Context

What exists. A board is a `.canvas` in the JSON Canvas format; Verso's
drawing lives under its top-level `verso` key, and a node or an edge may
carry a `verso` key of its own (`background`, `locked`, `groups` and
others; spec §5.11 item 5). The order of the nodes is the board's
stacking order, and a drawn element records the card it lies under
(`under`; `app/ui/src/board/model.ts`). A picture or a PDF on the board
is a file card for a file of the folder, never data in the drawing
([0063](0063-files-onto-the-board.md); `app/ui/src/board/cards.tsx`). A
board is co-edited live as a room of its elements
(`crates/verso-server/src/collab_board.rs`).

Observed in Obsidian 1.13.7 for [0057](0057-board-json-canvas.md)
(`docs/reference/board-decision.md`, O1–O5): unknown fields on a node, an
edge and the top level are kept when Obsidian saves the canvas; a node of
an unknown **type** is deleted. So anything a map adds must be a field on
a node of a type Obsidian knows.

What a map needs and the board lacks: a picture that stays under
everything and does not move by accident; pins — small marks that open a
note — that keep their size on screen at any zoom; a preview on hover,
which exists nowhere yet ([0085](0085-hover-preview.md)); large pictures
(a continent at 16,000 pixels a side) drawn without loading them whole;
and pins a player must not see. Whether Excalidraw's own "send to back"
reaches a card was not checked for this ADR.

Atlas VTT, which the plan names, is under the **AGPL-3.0** (checked on
GitHub on 2026-10-14, `gh api repos/atlas-vtt/atlas-vtt`); Verso is
MPL-2.0 ([0005](0005-license.md)): its ideas may be studied, its code is
not copied.

## Decision

Proposed (2026-10-14). Accepted on 2026-10-14 (Status): each `[OPEN]` was decided as
recommended and is marked `[DECIDED 2026-10-14]`.

1. **A map is a board.** No `.map` file and no node type of Verso's own:
   a map opens in Obsidian as a canvas with a picture and cards.
2. **The map's picture.** "Use as map" on a picture card locks it
   (`verso.locked`), sends it to the bottom of the stacking order and
   marks it `"verso": {"map": true}`; "Stop using as map" undoes the
   three. A board may hold several (a world and an inset). "Send to back"
   and "Bring to front" are offered on every card. `[DECIDED 2026-10-14]`: the field's
   name. Decided: `map`.
3. **Pins.** A pin is a file card naming a note, drawn on a map as a mark
   with the note's sticker or a default icon and its name, at a constant
   size on screen, anchored at its point, whatever the zoom; hover shows
   the note's preview ([0085](0085-hover-preview.md)), a click opens it.
   Dropping a note from the tree on a map makes a pin; "Pin a note here…"
   in the map's menu does too. A pin is marked `"verso": {"pin": true}`;
   in Obsidian it is a file card. Pins on a map are grouped with it
   (`verso.groups`), so moving the map moves them.
4. **Large pictures.** The window draws a map from tiles at the zoom
   shown, made from the picture once and kept as a cache **outside the
   folder** ([0011](0011-config-outside-tree-index-as-cache.md); on a
   server, in its data directory), never written beside the picture.
   `[DECIDED 2026-10-14]`: how. Decided: **tiles of Verso's own drawn under
   Excalidraw's canvas**, the board's camera driving them, measured
   first with a 16,000-pixel picture on the 1 GB server and on a phone;
   a second viewer (Leaflet, OpenSeadragon, named in the plan) would need
   its camera kept in step with Excalidraw's.
5. **Secret pins.** `[DECIDED 2026-10-14]`: how a pin is hidden from readers. Two ways
   were raised:
   - (a) **the projection of [0087](0087-secret-blocks-hidden-from-readers.md)
     applied to the board**: a node marked `"verso": {"secret": true}` —
     and the edges that touch it, and the drawn elements grouped with it
     — is left out of what a UniVerso serves a reader: the file's bytes,
     the board's room (whose elements the server holds and can filter per
     reader), search, links and counts; a writer sees it, drawn as
     secret, with a "view as a reader" toggle; in Obsidian it is a card;
   - (b) **a layer in a separate board** in a folder not shared with the
     players, laid over the map for whoever may read it — the reading of
     2026-10-14, written before the maintainer chose the projection for
     notes.
   Decided: **(a)**, the same rule as a note's secret block, so one
   idea covers both; (b) shows a pin's place to nobody but needs a second
   file kept in step with the first.
6. **A board exported as a picture** by a writer asks whether to leave
   the secret pins out, left out by default.
7. **Accessibility** ([0035](0035-cross-cutting-requirements.md)): a map's
   pins are listed in the side panel as a list of links, in reading
   order (top to bottom, left to right), the text equivalent of the map;
   a pin is reachable by Tab and named after its note; pt-BR and English.

## Consequences

- The board's model gains `map`, `pin` and (with item 5a) `secret`, kept
  by the writer as every `verso` field is; spec §5.11 item 5 is revised
  in the same PR, with a fixture of a map for the maintainer's approval
  ([0031](0031-fixtures-as-contract.md)), and Obsidian's keeping of the
  fields observed again (O4) on the version of the day.
- The window: the map's commands, the pin's drawing at a constant size,
  the tiles and their cache, the panel's list; e2e tests in the harness
  for a map, a pin's hover and a reader's board; the server's suite for
  the projection of a board; the tutorial's "Treino do Board" gains a
  lesson on maps ([0058](0058-demo-vault-as-tutorial.md)); the changelog
  gets its line.
- Depends on [0085](0085-hover-preview.md) and, for item 5a, on
  [0087](0087-secret-blocks-hidden-from-readers.md): the last of V1's
  features in the recommended order (`docs/roadmap.md`, revision 8).
- Fog of war, tokens and combat — what a virtual tabletop does — are not
  in this ADR.

## Discarded alternatives

- **A `.map` file of Verso's own** (the plan of 2026-10-14), with the
  picture and its markers in YAML or JSON: Obsidian does not open it, and
  a board already holds a picture and cards.
- **Code from Atlas VTT** (named in the plan): AGPL-3.0, incompatible
  with the MPL-2.0 of the app; ideas only.

## Status

**Accepted (2026-10-14).** The maintainer, that night, answering
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* with *"Sim, todas"* (yes, all): every `[OPEN]`
decided as recommended, marked `[DECIDED 2026-10-14]` in place. In V1
(`docs/roadmap.md`, Phase 4 — V1). [0036](0036-tabletop-rpg-support.md) gains a Revisions line.

*Revised (2026-10-15):* the maintainer accepted, as recommended, the four picks made in the build: (1) **only a PNG is cut into tiles**; a JPEG or WebP is drawn whole, with a warning that it is large; (2) **a reader is refused a board's room** and follows the saved file; (3) **`secret` works on any node**, not only a pin; (4) **the tiles are drawn in the card layer**.

*(History, before the acceptance above:)* Proposed (2026-10-14). In V1 by the maintainer's word of 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revision 8). For the
maintainer, each with a recommendation: the field's name (item 2), the
tiles (item 4), and secret pins by projection or by a separate board
(item 5).
