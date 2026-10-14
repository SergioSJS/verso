# ADR 0085 — Hover preview: the note a link names, shown where the pointer rests

- Date: 2026-10-14
- Source: the maintainer, on 2026-10-14 at 11:36 UTC, sending a plan of
  new features drafted with another assistant and asking for a critical
  reading and a roadmap: when the pending work closes, *"a gente vai
  conseguir fazer uma V1 bem sólida"* (we will be able to make a really
  solid V1). The reading of that plan, in session the same morning, found
  that a preview on hover exists nowhere in Verso and that the maps of
  [0090](0090-maps-on-the-board.md) depend on it, and put it first. The
  maintainer's answer that evening, on the whole list: *"VAI SER TUDO NA
  V1"* (it will all be in V1). Written by Opus 5.5; to be read by the
  other model before it is accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0003](0003-primitives-not-workarounds.md) (what needs a plugin
  is a primitive), [0076](0076-the-window-on-every-screen.md) (touch, the
  link card), [0081](0081-sharing-between-people-on-one-universo.md) (a
  link out of a share), [0087](0087-secret-blocks-hidden-from-readers.md)
  (a preview is a read), [0090](0090-maps-on-the-board.md) (a pin's
  preview), [0035](0035-cross-cutting-requirements.md) (both languages,
  accessibility), [0009](0009-external-constraints.md) (what may be
  learned of Obsidian).
- Status in the briefing: not present; on acceptance.

## Context

What exists. A wikilink is followed with ⌘ or Ctrl and a click in Edit
mode (`app/ui/src/live.ts`) and with a click in the reading view; on a
touch screen a tap shows a small card with "Open" and "Edit link"
(`app/ui/src/editor/linkCard.ts`, [0076](0076-the-window-on-every-screen.md)
item 4). An embed renders the note it names, or the block an `^id` names,
from the HTML the core renders (`app/ui/src/blockEmbed.ts`). A board's
card shows a note's text (`app/ui/src/board/cards.tsx`). The backlinks
panel lists notes by name with a snippet (`app/ui/src/panel/panel.ts`).

What does not exist: seeing what a link names without leaving the note.
No pop-up shows a note on hover anywhere in the window — not over a link,
a backlink, a node of the graph, or a card of the board. Obsidian's
public help describes a core "Page preview" that does this; people who
come from it expect it, and a map whose pins open a note's summary on
hover ([0090](0090-maps-on-the-board.md)) needs it first.

## Decision

Proposed (2026-10-14). Each `[OPEN]` carries a recommendation; the
maintainer decides.

1. **A preview is the note a link names, read-only, in a card beside the
   pointer.** It renders as an embed does — the same HTML of the core,
   the heading or the `^id` the link names scrolled into view, the
   note's title and its path above — and it is never an editor. A click
   inside the card opens the note as following the link would; nothing
   else in it writes.
2. **Where.** Over a wikilink and a Markdown link to a note of the folder
   in the reading view and in Live Preview; over a row of the backlinks,
   the outgoing links and the unlinked mentions; over a node of the
   graph; over a card or a pin of a board that names a note
   ([0090](0090-maps-on-the-board.md)). Not over the file tree in the
   first version. A link to a picture or a PDF previews the file as its
   embed does; a link to the web previews nothing (no request leaves for
   a hover, [0050](0050-outbound-network-access.md)).
3. **In Edit mode, with the modifier.** `[OPEN]`: whether Edit mode
   previews on a plain hover or only with ⌘/Ctrl held. Recommended: **with
   ⌘/Ctrl**, the modifier that already follows a link there — a pointer
   resting on the text being written should not open cards; the reading
   view and the panels preview on a plain hover. Before building, what
   Obsidian does is checked in its public help or observed from outside,
   never in its code ([0009](0009-external-constraints.md)).
4. **Timing and dismissal.** The card opens after the pointer rests about
   half a second and closes when it leaves both the link and the card;
   the pointer may move into the card to scroll it. One card at a time.
   `[OPEN]`: a preview inside a preview. Recommended: **not in the first
   version** — a link inside a card is followed with a click.
5. **Touch.** There is no hover: the link card of [0076](0076-the-window-on-every-screen.md)
   item 4 gains the preview above "Open" and "Edit link"; on the board
   and the graph, a long press shows it.
6. **Keyboard and screen readers** ([0035](0035-cross-cutting-requirements.md)).
   A command "Preview the link under the cursor", with a default key
   `[OPEN]` (recommended: none, bindable, as the accessibility review's
   item on following a link from the editor leaves default keys to the
   maintainer, `docs/review/accessibility.md` §8); the card takes the
   focus when opened this way, is a labelled dialog, and Escape closes it
   and returns the focus. Opened by hover it does not take the focus.
7. **A preview is a read like any other.** It goes through the contract's
   read of the note, so a share shows "not in what was shared with you"
   for a link that leaves it, as the link itself does
   ([0081](0081-sharing-between-people-on-one-universo.md)), and a reader
   sees the projection [0087](0087-secret-blocks-hidden-from-readers.md)
   serves. Nothing of a preview is cached beyond the note's revision.
8. **A setting** in Settings › Editor turns previews on hover off; on by
   default.

## Consequences

- The window gains the card (one component for the note, the panels, the
  graph and the board), the command, the setting and the strings in
  pt-BR and English; no new command of the contract — the card uses the
  read the embed uses.
- The harness gets end-to-end tests for hover in the reading view, the
  modifier in Edit mode, the touch card, and Escape returning the focus;
  the demo vault teaches it ([0058](0058-demo-vault-as-tutorial.md)); the
  changelog gets its line.
- [0090](0090-maps-on-the-board.md)'s pins depend on item 2's board part.

## Discarded alternatives

None recorded.

## Status

**Proposed (2026-10-14).** In V1 by the maintainer's word of 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revision 8). For the
maintainer, each with a recommendation: Edit mode with the modifier
(item 3), no preview inside a preview (item 4), and the command's default
key (item 6).
