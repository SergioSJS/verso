# ADR 0057 — The board: a JSON Canvas file, Excalidraw as its surface, typed relations in the frontmatter

- Date: 2026-09-30
- Source: the maintainer, in session — on 2026-09-29, "vamos puxar a demanda
  do canvas hexcalidraw etc agora" and "vamos fazer isso mesmo"; on
  2026-09-30, the answers to the memo
  [`docs/reference/board-decision.md`](../reference/board-decision.md),
  section 9, and to the two questions that followed them (section 10 of the
  memo); [0024](0024-board-excalidraw.md) (Excalidraw),
  [0040](archive/0040-board-persistence.md) (persistence, `[OPEN]` until this ADR),
  [0030](0030-base-dialect-obsidian-compatible.md) (extend, never contradict),
  [0013](0013-degrades-to-markdown.md) (readable text),
  [0035](0035-cross-cutting-requirements.md) (the accessible view),
  [0049](0049-phase-2-scope-widened.md) §3 (asked for and not built, until
  this ADR)
- Revisions: 2026-10-03 — how pictures and files get onto the board (drop, paste, pick, drag) is [0063](0063-files-onto-the-board.md); point 2 stands. 2026-10-06 — point 10 gains a picture card's crop, kept on its node (the maintainer, asked where a crop is kept: "No card, sem tocar no arquivo"). 2026-10-06 — point 5: a drawing of the plugin opens on its drawing; point 20: an arrow is bound at the point it was drawn to, on Excalidraw's development builds (the maintainer, below). 2026-10-12 (evening) — the board is co-edited live ([0082](0082-live-co-editing-of-a-synced-folder.md) item 12, decided and built that day: the maintainer, *"Deveria estar"*): open in several windows — on a server, or a synced folder's while its link is up — a board is a room of its elements, merged by Excalidraw's own reconciliation (the higher `version`, on a tie the lower `versionNonce`; a deletion a tombstone that a move made meanwhile does not undo), the others' pointers and selections drawn as collaborators, and the file written by the room as point 2 says, through the same converter and writer as a tab's save (points 2, 12, 14); point 13 stands: a canvas in another layout joins no room until its first save, shown as a diff, puts it in Obsidian's. A drawing of the plugin is still shown and never edited (point 5).
- Status in the briefing: §9 "Board persistence" `OPEN` and "Board — semantic
  layer" `PROPOSED`, §11.3 and §17 item 6 "Typed relation syntax" `OPEN`, §17
  item 9 `OPEN` — all `DECIDED` from 2026-09-30 (briefing v0.11)

## Context

The board was out of scope until the end of Phase 2
([0034](0034-roadmap-in-phases.md)). On 2026-09-29 the maintainer pulled it
forward. ADR 0040 said to decide persistence before the board; the memo laid
the questions out with what was observed in Obsidian 1.13.7 from the outside
(memo, section 3): unknown fields on the nodes, the edges and the top level of
a `.canvas` survive Obsidian's renames and its own saves; a node of a type
Obsidian does not know is deleted on its next save; a canvas's `file` nodes
and the `[[links]]` of its `text` nodes count as backlinks; a quoted wikilink
in a frontmatter value is a link, and an unquoted one is YAML.

## Decision

**Decided on 2026-09-30 by the maintainer**, in session, choosing among the
options of the memo. Point 7 was delegated to the author ("pode seguir a
melhor escolha para nossa aplicação se baseando no mercado", the answer to the
memo's question 7); point 9 is the author's choice, not asked. Both were
decided by the maintainer on 2026-10-01 (point 18).

1. **Scope.** The board enters now, recorded as the views were: this ADR, a
   revision of 0049 §3, and the roadmap and `CLAUDE.md` no longer listing the
   board as out of scope. The Phase 2 exit gate, a month of use, does not
   change.
2. **The file is a `.canvas`** (JSON Canvas 1.0). The free drawing lives in
   the same file under a top-level key of Verso's own:
   `"verso": {"version": 1, "drawing": [ … ]}`, whose `drawing` holds
   Excalidraw elements. An image placed on the board is a file in the folder
   shown by a JSON Canvas `file` node, never a `dataURL` inside the drawing.
   Verso writes a `.canvas` keeping every field it does not know and the key
   order it read, in Obsidian's layout (memo, section 3.2): an object or array
   of scalars on one line, anything else one entry per line, tab indentation,
   and the final newline as the file had it (none, in a file Verso creates).
3. **Excalidraw draws the whole board** (R1). JSON Canvas nodes and edges
   become Excalidraw elements on open and come back on save by the mapping of
   the memo's section 5; notes, texts, links, images and PDFs are drawn by
   Verso inside Excalidraw's `embeddable` elements; groups are frames; edges
   are bound arrows. What has no JSON Canvas form stays in `drawing`.
   *(Added on 2026-09-30 by the maintainer, in session: "no hexcalidraw, se
   eu clico duas vezes ele faz o que vc falou, se eu clico mais uma vez
   entre em modo de edição daquela nota sem sair da tela do board".)* A
   note's card is entered by a double click, as Excalidraw enters any
   embeddable, and reads the note; a further click on its text edits the
   note there, in the window's note editor (Live Preview), saved as a
   note's tab saves it — atomically, over the revision read, a refused
   write showing both versions in the card (invariants 9 and 11). Escape,
   or leaving the card, goes back to reading; ⌘ and a double click, or the
   card's open button, opens the note in a tab.
4. **The semantic layer is in**, and spec Q10 is decided with it. **A typed
   relation is a frontmatter property of the source note whose value is a
   quoted wikilink, or a list of them**: `aliado: "[[Barão]]"`,
   `inimigos: ["[[A]]", "[[B]]"]`. The key is the relation's type; the
   direction goes from the note that holds it to the target; several
   relations between the same two notes are the same target under several
   keys. An unquoted `[[x]]` is a YAML list, as Obsidian reads it, and not a
   link. On the board, an arrow drawn between two note nodes is promoted to a
   relation by the user's action: Verso shows the change to the source
   note's frontmatter as a plan with its diff
   ([0048](0048-file-operations-in-ui.md)), writes it on confirmation, and
   marks the edge with `"verso": {"relation": "<key>"}` and the key as its
   label. This closes the link part of spec Q24.
5. **The conversion of the Excalidraw plugin's `.excalidraw.md` comes now**,
   by the user's action, as a plan with the diff: it creates a `.canvas` next
   to the drawing and leaves the drawing as it was. It is written from the
   file's own structure and Excalidraw's schema (MIT); nothing of the plugin's
   code (AGPL-3.0) is read.
   *(Revised on 2026-10-06 by the maintainer, in session: "nao to
   conseguindo abrir um excalidraw criado no obisidian nao abre no nosso
   board"; asked how, they chose "Mostrar o desenho + converter" over editing
   the plugin's file in place and over a more visible button only.)* A
   drawing of the plugin opens on its drawing, shown as drawn, to look at —
   Excalidraw's view mode, its pictures by the files the drawing names — in
   place of its text, with "Convert to board" over it and its text one
   click away. Showing it writes nothing; the conversion is still the user's
   action, as above.
6. **`.canvas` in the index, as Obsidian** (spec Q16, for `.canvas` only): a
   canvas's `file` nodes and the `[[links]]` in its `text` nodes are backlink
   sources; a `.canvas` is a link target by its full name with the extension
   (`![[Quadro.canvas]]`), never by its bare name. A rename or move of a note
   updates the `file` nodes that point to it, in the same plan as its links.
7. **The accessible view is an outline beside the board** — the author's
   choice. The board draws on a `<canvas>` a screen reader cannot read; the
   whiteboards on the market reach it by a focus order over the board's
   objects (FigJam's screen reader support moves focus across the canvas and
   leaves connectors and decorations out by default, with a setting to add
   them; Miro gives its objects to screen readers and the keyboard). Verso's
   board has an outline panel that lists the groups with their nodes (a note
   as a link, a text node's text, a link's address), the edges as
   "A → B (label)", and, behind a toggle, the drawing's free texts; moving
   through it with the keyboard selects and centres the same object on the
   board, and Enter opens a note. It promotes ADR 0035's proposal for the
   board.
8. **Excalidraw's assets and online features.** Every font is served by the
   app, Xiaolai included; nothing loads from `esm.sh`. The share link,
   collaboration, AI, Excalidraw+ and the online library browser are hidden,
   under [0050](0050-outbound-network-access.md). The "Mermaid to
   Excalidraw" feature stays, with the second copy of Mermaid it brings.
   `0BSD` joins the npm license allowlist and `fuzzy` is taken by hand as MIT
   (`LICENSE-MIT` in the package) — confirmed by the maintainer on 2026-10-01
   (review [`board.md`](../review/board.md) §6 item 11).
9. **The text view stays**: a `.canvas` opens as a board, and "open as text"
   keeps the raw JSON one click away — the author's choice.
10. **The board's finish and its settings** *(added on 2026-09-30 by the
    maintainer, in session: "pode fazer, deixa tudo redondinho", on the
    author's review of Excalidraw's features on the board).*
    - **Export.** The board has its own "Export image" (⌘⇧E, and the main
      menu), in place of Excalidraw's, which drew each card as an empty web
      embed: each card is drawn as its box, its name and its text as it
      reads (a picture card as its picture). PNG or SVG, at 1×–3×, with or
      without background, light or dark, the whole board or the selection;
      saved beside the board in the attachments folder, saved to Downloads,
      or copied. Excalidraw's own copies as PNG or SVG are hidden.
    - **Web embed** is hidden: the board draws only its own cards, and the
      tool ended in an error. `[DECIDED 2026-10-21]` (the maintainer's mark,
      **option B**, not the recommended A): an embedded web page **is
      allowed as a board card**, reusing [0056](0056-embedded-web-pages.md)
      (the page loads in its frame from an origin the person approved); one
      more card type. Until it is built the tool stays hidden.
    - **Background.** A board's background colour is kept in the file, under
      `verso.background`; none means the app's paper.
    - **A card's colour.** The background chosen for a card from the
      board's panel is kept on its node, under the node's own `verso` key
      (`"verso":{"background":"#a5d8ff","fill":"hachure"}`, the fill as the
      panel names it, solid not written), as a relation is on an edge:
      JSON Canvas has no field for it, and Obsidian keeps a node's unknown
      fields (memo O1). None, or transparent, takes the key off. Asked for
      by the maintainer on 2026-09-30 ("tem como respeitar?").
    - **A picture card's crop.** A picture on the board can be cropped —
      asked for by the maintainer on 2026-10-06 ("senti falta de ferramenta
      de cortar imagem"). The crop is kept on the card's node, under its
      `verso` key, as the part of the picture shown, in fractions of its
      width and height (`"verso":{"crop":{"x":0.1,"y":0.2,"w":0.6,"h":0.5}}`);
      the picture's file is never written, the crop is changed or taken off
      at any time, and one picture may be cropped differently on two cards.
      The card takes the crop's proportions. Obsidian, which keeps the key,
      shows the whole picture; the board's image export shows the crop.
      Chosen by the maintainer on 2026-10-06 over a cropped copy of the
      file.
    - **A card's and an edge's style.** What else the panel sets that JSON
      Canvas has no field for is kept the same way, under the item's own
      `verso` key, and only when it is not how the board draws the item by
      default: on a card, `corners` (`"sharp"`), `strokeWidth`, `roughness`
      and `angle`; on an edge, `line` (`"curved"` or `"elbow"`),
      `strokeWidth`, `roughness`, `startHead` and `endHead` (the kind of
      head, where the edge has one), `bends` (the points a straight edge
      bends at, from its start) and its label's `labelSize` and `labelFont`;
      on both, `strokeStyle`, `opacity`, `locked` and `groups`. Obsidian
      draws none of them and keeps them all (memo O1). An elbow edge is laid
      out again along right angles when the board opens. Asked for by the
      maintainer on 2026-09-30 ("coloquei porta reta, ele aplica mas nao
      salva, se fecho e abro volta arredondada").
    - **A drawing's place among the cards** *(added on 2026-10-01: the
      maintainer, "Corrija qualquer pendência que tenha ficado", the pending
      item being that a drawing sent behind a card came back over it).* A
      drawn element that lies under a card keeps, in the file, the card it
      lies under (`"under":"<node id>"` on the element in `verso.drawing`);
      none means over every card, as before, so a board whose drawing is all
      over its cards is written as it was read. The board puts it back just
      under that card when it opens; a card that is gone puts it on top.
    - **Words.** Excalidraw's own words its pt-BR translation lacks are given
      in Portuguese when the window is; its "click to interact" band is
      hidden (a card is entered by a double click).
    - **Fonts.** Excalidraw's fallback font address (`esm.sh`) is dropped:
      every font is the app's, as point 8 says.
    - **Settings**, a "Board" section: open a `.canvas` as board or as text
      (point 9's default becomes a setting); when a board opens, show all of
      it or go back to where it was left in that window (kept in the
      window's storage, never in the file); the stroke of new shapes (clean
      or hand-drawn) and the font of new text (handwritten, plain or code);
      the grid on or off when a board opens; the folder "New board" uses
      when it is not asked from a folder.

**Decided on 2026-10-01 by the maintainer**, in session, on the critical
review [`docs/review/board.md`](../review/board.md), section 6: "Aceito todas
(Recomendado)", accepting the author's recommendation written under each item
of that section (the review's section 8 holds the list as it was put).

11. **A card's `file` is a path from the root** (item 1), as JSON Canvas words
    it and the window reads it: the core resolves it by that path only, never
    by a name found in another folder, so a card left at a path that is gone
    links to nothing, and a move of its note rewrites it (point 6).
12. **Only the user's change to the board is written** (item 3): a change to
    a card, an edge, the drawing or the background, made with the board's
    tools. A press, a selection, a pan or a zoom writes nothing. What the
    board adjusts by itself — a text measured again once its font is in, a
    marker dropped, an edge lifted out of a group — is not written on its
    own, and rides along with the first real edit.
13. **A canvas in another layout** (item 4) — written by another tool, or with
    Windows line endings — is rewritten in Obsidian's layout by its first
    save in a tab only after the rewrite is shown as a diff and accepted;
    declined, nothing is written.
14. **A save changes only what the user changed** (item 5). An edge keeps its
    sides while each end stays on the card it was on, and one with no side
    gains none; an end attached anew takes the side it meets. Geometry where
    the file put it keeps the file's value, a fraction included; what the
    user moved or resized is written in whole numbers. What the board cannot
    draw — an entry with no id or type, an edge whose end names no node, an
    empty label — goes back where it was.
15. **An open board follows its file** (item 6): changed on disk while the
    board holds nothing unsaved, it is drawn again from the file, as a
    note's tab takes the disk's text; with something unsaved, its save meets
    the difference and shows both (invariant 11).
16. **The canvas reader is fuzzed** (item 9), beside the dialect's parser and
    under the same guardrail (ADR 0029): a hand-written parser of files of
    the folder.
17. **The fields of point 10 are the format** (item 14), as named there; spec
    §5.11 records them. For an arrow with bends, point 10 stands over the
    memo's section 5.
18. **Points 7 and 9 are decided** (item 15): the outline beside the board,
    and the text view one click away.
19. **A web page keeps the system's editing commands** (item 20). The Edit
    menu's Undo, Redo and Select All tell the app's windows (so that ⌘Z
    reaches a board); in a web page — a window of its own, or a site shown in
    a window of the app — the page's own command runs, as the system's item
    ran it.

**Decided on 2026-10-06 by the maintainer**, in session: "fui testar o
excalidraw, ele ta muito mais elegante em si tratando com as setas [...] se
eu faço uma seta entre dois elementos, ele salva exatalemte o lugar onde a
seta ta pontando"; asked how, they chose "Excalidraw next" over keeping
the stable release and placing the point by Verso's own code, and over
keeping arrows at the middle of a side.

20. **An arrow is bound at the point it was drawn to.** Excalidraw's
    development builds bind each end of an arrow at a point of the element,
    in fractions of its box, met on its outline (`orbit`) or at the point
    itself (`inside`); its stable release, 0.18.1, binds an end by a focus
    toward the middle, and Verso drew every edge from a side's middle. The
    board takes a development build, pinned at an exact version in
    `package.json` (`@excalidraw/excalidraw@0.18.0-<commit>`), moved only in
    a change of its own with the whole suite green. An edge — an arrow from
    a card to a card — passes under the cards, as the canvas draws it: its
    ends are bound on the cards' outlines, aimed at their points, since an
    end inside a card would hide its head. An arrow with an end on a shape
    of the drawing is the drawing's, drawn over the cards, and Excalidraw's
    own way stands: its head at the point it was drawn to, inside a picture
    included; the card it reaches lists it, read from the file, so it moves
    with the card. A canvas edge writes, for Obsidian, the side the arrow
    meets, and under the edge's `verso` the point (`"fromPoint": [x, y]`,
    `"toPoint"`) when it is not that side's middle. Read, an edge is bound
    at its point, else at its side's middle, else at the middle of the side
    facing the other card. Point 14 stands, with one more case: an end moved
    on its card takes the side it now meets.

**Decided on 2026-10-23 by the maintainer**, after a three-device test found
that the toolbar's sticky note is a drawn element where `dice: 1d20` stays
plain text, and that the board had no way to add a Markdown text card except
dragging a roll from the Table: "B e A entao, sendo B configurável". Built on
`feat/board-text-card`: (A) a **Text card** button in the board's toolbar,
beside Insert, adds a JSON Canvas `text` node (340 × 110, centred on the view)
and asks for its text at once; cancelled or empty, no card is left behind; the
Insert menu's *Text card* entry does the same; (B) a double click — a double
tap on a touch screen — on an **empty** spot of the board adds that card
there, instead of Excalidraw's drawn text. A double click on a card or on a
drawing keeps its behaviour; on a reader's board, or with another tool in
hand, or while text is being typed, it does nothing new. B is a setting,
**Settings › Board › "Double click on the board creates"** (`boardDoubleClick`):
*Text card* or *Drawn text*. The default, *Text card*, is chosen in the code,
for the maintainer to confirm. The button takes no key (Excalidraw's tool keys
are untouched). The new card's `dice:` codes roll as in any text card
(ADR 0088).

**A board on a phone (2026-11-15).** The maintainer, from his Android phone:
the board/text toggle on a row of its own, Excalidraw's menu and Verso's four
tools on another, undo and redo on a third, the drawing tools in a padded card
over the app's bottom bar — *"the button experience is quite bad; badly
placed, scattered everywhere, taking space, the useful area becomes tiny"*.
Three prototypes on the real board; he chose C with one change (one column
sideways). Under the phone's measure (`PHONE_MEDIA`, ADR 0076; Excalidraw's
form factor follows it through `UIOptions.getFormFactor`):

- The canvas keeps **only the drawing tools**, in the desktop toolbar's order
  (hand, selection, shapes, arrows, pencil, text, eraser, more): held upright, one flush bar at
  the board's foot, in the place of the app's bottom bar while a board that
  draws is in front; held sideways, one column at the right edge (clear of
  the right safe area), all eight tools in it, sharing the height under the
  top bar (43 px each on a 390 px screen). Excalidraw shows its text tool
  outside "more" only on a toolbar at least 316 px wide: the toolbar keeps
  that width, see-through, its tools at the column's edge.
- **Board | Text**, then, in the desktop's order (ADR 0076, one order on
  every size), Excalidraw's menu (*Export, background and help*), the
  **Text card**, Insert's items (picture or PDF, note or file, link, web
  page), **Loose arrows**, the **search** and the **outline** move to a
  **Board** section of the top bar's ⋯ sheet, with *Who sees* at a table
  (`app/ui/src/board/phoneVerbs.ts`, `app/ui/src/leaves/boardSheet.ts`).
  The text face keeps its row, the way back to the board.
- **Undo and redo** are the top bar's (pressing Excalidraw's own, off as
  they are).
- What acts on a **selection** — Excalidraw's style island, and Verso's open,
  swap, crop, page, map and relation tools in the top-right island — shows
  only while there is one; the search's field shows once used; the outline
  lies over the board with its own close.
- Fixed with it: Excalidraw's "leave view mode" pencil (the window holds the
  view mode of a reader's board and of a plugin drawing) and its picture tool
  (off on a board) are not drawn; a plugin drawing's bar is one row on a
  phone.
- On a phone the files and the right panel are a tab on each edge of the
  board (ADR 0076), the swipe never starting on its canvas.
- Desktop and tablet are unchanged. Tried in `e2e/board-phone.spec.mjs` and
  `test/boardPhone.test.mjs`; the stylesheet is `app/ui/css/boardphone.css`.

## Consequences

- ADR 0040 is decided by point 2; ADR 0024's semantic layer by point 4; ADR
  0035's accessible board view by point 7.
- ADR 0052 said "a property's key is not a relation type" while Q10 was open.
  Under point 4 a property whose value is a link is a relation, named by its
  key; a property with any other value is not.
- Point 2 stands on behaviour observed on Obsidian 1.13.7 and not promised by
  the JSON Canvas spec: a future Obsidian that dropped unknown top-level keys
  would lose the drawing when it saves. The probes O4 and O6 of the memo are
  re-run on each Obsidian version the maintainer installs, and recorded in
  `docs/reference/obsidian-observations.md`.
- The `.canvas` writer is under the invariants of any write — atomic, and
  checked against the revision it read (invariants 9 and 11) — and opening a
  board writes nothing (invariant 7). A round-trip test, seen failing before
  the merge, guards the layout: a file in Obsidian's layout read and written
  with no change comes out byte for byte.
- The window gains React, only inside the board's pane, and a chunk loaded
  when a board opens; the rest of the window stays plain TypeScript.
- The board's text and labels in pt-BR and English
  ([0035](0035-cross-cutting-requirements.md)); Excalidraw's own `pt-BR`
  locale follows the window's language.
- Point 20 ties the board to a development build of Excalidraw, the one
  Obsidian's Excalidraw plugin ships: its API and its layout move between
  builds (on the first move, `scrollToContent` became `setViewport`, the
  API callback `onExcalidrawAPI`, the phone layout's toolbar went to the
  foot of the board, and the arrow's binding lost its focus and gap). The
  board's e2e tests are what tells a build that breaks it; the npm license
  allowlist runs with the checks, and `npm audit` is read on each move
  against the one before (on the first, the same 16 advisories as 0.18.1,
  none new). Drawings of the plugin
  made with these builds open with their arrows where they were drawn.

## Discarded alternatives

Considered by the maintainer on the memo and set aside on 2026-09-30:

- A sidecar `.excalidraw` next to the `.canvas` — orphaned when Obsidian
  renames, moves or deletes the canvas.
- An Excalidraw file as the board, with `.canvas` only by export — does not
  fit ADR 0040.
- Verso drawing the nodes with Excalidraw only as a transparent layer on top
  (R2) — two engines kept in step.
- The relation stored only on the board's edge; the semantic layer deferred.
- The conversion of `.excalidraw.md` left for later.

Offered with the revisions of 2026-10-06 and not chosen:

- Arrows: staying on Excalidraw 0.18.1 and placing an end at its point by
  Verso's own code; keeping every edge at the middle of a side.
- A drawing of the plugin: editing it in place, written back in the plugin's
  format (which changes without notice); only a more visible button over its
  text.

Ruled out by observation, not by preference: the drawing stored as canvas
nodes of a type of Verso's own, which Obsidian deletes on its next save (memo,
section 3.2, O5).

## Status

Accepted (2026-09-30); points 11 to 19 on 2026-10-01; point 20 and the
revision of point 5 on 2026-10-06.
