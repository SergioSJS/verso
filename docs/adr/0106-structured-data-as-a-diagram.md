# ADR 0106 — Structured data as a diagram: JSON and YAML drawn as boxes to move, fold and follow back to the text

- Date: 2026-10-20
- Source: the maintainer, 2026-10-20, on [JSON Crack](https://github.com/AykutSarac/jsoncrack.com)
  (Apache-2.0): *"eu vi um app que exibe json de um jeito fantástico … a
  gente pode absorver isso? podemos aproveitar o código? a licença é
  compatível?"* (I saw an app that shows JSON in a fantastic way … can we
  absorb it? can we reuse the code? is the licence compatible?). Offered
  three roads — port its idea with our own drawing, take its React
  component whole, or the idea alone — he answered: *"gosto do A, mas não
  sei se svg seria a melhor opção, pq seria legal ser possível mover as
  caixas pra reorganizar, minimizar ou expandir ramos e tal, parece que é
  compatível com yaml tb, explore melhor aí e faça um adr bacana"* (I like
  A, but I'm not sure SVG is the best option, because it would be nice to
  move the boxes to rearrange them, fold or unfold branches and so on; it
  seems YAML fits too; explore it and write a good ADR). Written by Opus 5.5;
  to be read by the other model before it is accepted
  ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0012](0012-files-are-source-of-truth.md),
  [0029](0029-guardrails-in-ci.md) (licence allowlist),
  [0035](0035-cross-cutting-requirements.md),
  [0049](0049-phase-2-scope-widened.md) (files that are not notes),
  [0057](0057-board-json-canvas.md) (the board, a JSON Canvas file),
  [0072](0072-window-controls-in-the-app.md) (zoom gestures),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0103](0103-feature-presets-and-capability-flags.md) (feature switches).
- Status in the briefing: not present.

## Context

A `.json` or `.yaml` file opens in Verso today as text, in the source
editor, editable and saved like a note. Reading a large or deep one as text
is hard: where a branch ends, how many items an array holds, what sits
three levels down. JSON Crack draws the same data as boxes joined by lines:
one box per object or array, a row per plain value, a line to a child box
for every value that is itself an object or an array, labelled by its key.

What its code is, read on 2026-10-20 (`packages/jsoncrack-react`,
Apache-2.0, no NOTICE file):

- **The parser** (`src/parser.ts`, 227 lines) walks `jsonc-parser`'s tree
  into nodes and edges, the model above. Small, portable.
- **The drawing** is `reaflow`, a React library whose layout engine is
  `elkjs` — licensed **EPL-2.0 OR GPL-3.0-or-later**, neither on the
  allowlist of [0029](0029-guardrails-in-ci.md); `reaflow` also pulls a UI
  kit (`reablocks`) and an animation library. Boxes are SVG holding HTML
  (`foreignObject`), edges SVG, no virtualization.
- **What it does not do**: boxes cannot be moved (dragging is switched
  off); every fold lays the whole graph out again; past 1,500 boxes (1,200
  on the site) it stops and offers the paid product, ToDiagram; search
  matches only the boxes on screen, so a folded branch is never found;
  nothing works from the keyboard; its open issues include a stack
  overflow at about 2,500 lines and a crash on deep nesting.
- **Formats** on its site: JSON, YAML, XML and CSV, each converted to a
  JavaScript object first — which loses the position of each value in the
  text and rounds large numbers.

Verso already holds what a viewer of its own needs, with no new
dependency: the `yaml` library (ISC), which keeps where each value sits in
the text, its anchors, aliases and documents; CodeMirror's JSON and YAML
grammars (`@lezer/json`, `@lezer/yaml`, MIT), which tolerate a file being
typed; a graph view drawn in SVG whose nodes are already dragged, zoomed
and panned ([`leaves/graph.ts`](../../app/ui/src/leaves/graph.ts)); and a
board whose file format is JSON Canvas.

## Decision

Proposed (2026-10-20). Items marked `[DECIDED 2026-10-20]` are the
maintainer's words above; `[PROPOSED]` marks a recommendation of this text
he has not answered.

1. **A viewer of our own, from JSON Crack's idea.** `[DECIDED 2026-10-20]`
   (road A). The box-and-line model above, our drawing, our layout, in the
   window's own TypeScript — no React, no `reaflow`, no `elkjs`. Where a
   piece of JSON Crack's code is carried over, its file keeps the
   Apache-2.0 notice and says what changed; the credits page names JSON
   Crack either way.

2. **Moving boxes and folding branches.** `[DECIDED 2026-10-20]`. A box is
   dragged by pointer or finger; a branch folds and unfolds from its box.
   `[PROPOSED]`: dragging a box carries what hangs under it (as in a mind
   map); with Alt it moves alone. A folded box says how much it hides
   ("12 keys", "340 items"). Fold all, unfold all, unfold to a depth, and
   "Arrange again", which drops the moves.

3. **JSON and YAML.** `[DECIDED 2026-10-20]`. `[PROPOSED]` for YAML: each
   document of a multi-document file is a root of its own; an alias is a
   line to the box of its anchor, never a copy (so a file built to expand
   into millions of values — the "billion laughs" — draws as a few boxes);
   a tag shows as a small label; comments are not drawn. Which other
   formats come, and when, is item 12.

4. **The drawing: HTML boxes over SVG lines.** `[PROPOSED]` — the
   maintainer's doubt about SVG answered. Moving and folding do not depend
   on the technology; the graph already drags SVG nodes. What decides is
   the box: as HTML, a box is text that wraps, can be selected and copied,
   takes the theme's tokens, holds the focus and is read by a screen
   reader; the lines under it are SVG; the whole is one layer zoomed and
   panned as the graph is. All-SVG boxes need `foreignObject` for wrapped
   text, which WebKit rasterises at layout size when zoomed (the blur found
   on the board's pictures, 2026-10-20). A canvas draws the most boxes but
   blurs on zoom unless redrawn, selects no text, and needs a second,
   hidden structure for keyboards and screen readers. Only the boxes in
   view are in the page (item 9).

5. **Layout: a tidy tree, ours.** `[PROPOSED]`. JSON and YAML are trees
   (an alias is an extra line, not a branch), so a tree layout of a few
   hundred lines replaces a general graph engine; laying out again after a
   fold is linear and fast. Left to right by default, top to bottom as an
   option. A moved box keeps where it was put while the rest is laid out
   around the tree.

6. **The diagram and the text, side by side.** `[PROPOSED]`. Selecting a
   box selects its range in the text, and the caret in the text marks its
   box — the parsers keep each value's place, which JSON Crack loses.
   Copy a box's path (`$.npcs[3].name`) or its value. A number is shown as
   written (`12345678901234567890`, not rounded).

7. **Search over everything.** `[PROPOSED]`. Keys and values, in the data,
   not on screen: a match inside a folded branch unfolds the way to it.
   Next and previous, the count, Esc.

8. **Read-only.** `[PROPOSED]`. The diagram never writes the file
   ([0012](0012-files-are-source-of-truth.md)); the text is edited in the
   text view. Editing a value from its box would go through the editor,
   with the stale check (invariants 8 and 11); it is not in this ADR.

9. **Limits and hostile files.** `[PROPOSED]`. Walking the data never
   recurses on the call stack (deep nesting cannot overflow it). A file
   opens with its first levels unfolded up to about 300 boxes, the rest
   folded; only the boxes in view are drawn, so the limit is the data's
   size, not the box count (proposed: a diagram is offered up to 20 MB of
   text, past that the text view only). Every key and value is set as
   text, never as HTML; a long string is cut with its full value on
   request.

10. **Live.** `[PROPOSED]`. When the text changes — typed, from a room
    ([0082](0082-live-co-editing-of-a-synced-folder.md)) or on disk — the
    diagram follows after a pause, keeping folds and moves by each box's
    path. Text that does not parse keeps the last diagram that did, with a
    line naming the error and a link to its place.

11. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)).
    `[PROPOSED]`. The diagram is a tree to assistive technology, in the
    data's order, not the screen's: arrows go to parent, child and
    sibling, Enter or Space folds, and the text view is one key away. Every
    drag has a keyboard twin (Alt with the arrows moves the focused box),
    for WCAG 2.5.7. Reduced motion: no animation. Words in pt-BR and EN.

12. `[OPEN]` for the maintainer — where it appears, where moves are kept,
    which other formats, when it is built, and the switch: the questions
    0106.1 to 0106.10 of the decision list of 2026-10-20, each with a
    recommendation.

## Consequences

- `app/ui/src/datagraph/`: the model (parsed text to boxes and lines, with
  each value's range), the layout, the view (layer, boxes, lines, culling,
  drag, fold, search), and their tests over CodeMirror-free inputs; a
  mode switch on the text tab beside the source editor.
- No new dependency: `yaml` and the `@lezer` grammars are in the tree
  already.
- The credits page gains JSON Crack.
- An end-to-end test drags a box, folds a branch, finds a value inside a
  folded one, and walks the tree by keyboard, in WebKit and Chromium.

## Discarded alternatives

- **JSON Crack's React component whole** (`jsoncrack-react`): considered
  with the maintainer on 2026-10-20. It needs `elkjs` (EPL-2.0 or GPL-3.0,
  off the allowlist), React and `reaflow`'s tree in the window, and brings
  the missing drag, the cap and the keyboard gap with it.
- **The idea alone, no code of theirs**: considered with the maintainer on
  2026-10-20; he chose A, which may carry their parser's model over with
  its notice.

## Status

Proposed (2026-10-20). Items 1 to 3 decided by the maintainer; the rest are
recommendations for him to answer, with the questions of item 12.
