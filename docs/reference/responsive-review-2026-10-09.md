# The window on a phone and a tablet: first review (2026-10-09)

What the window does today on a touch screen, measured in the browser
harness, and what was fixed at once. It is the starting point of the
investigation [ADR 0073](../adr/0073-self-hosted-server-first.md) item 9
asks for, which ends in an ADR of its own; nothing here decides how the
window looks on a phone.

## How it was measured

On 2026-10-09, by an Opus 5.5 session, on the harness built from `main`
(7ce2407) with the demo vault, through Playwright with touch on:

| Viewport | Engine | Stands for |
|---|---|---|
| 390 × 844 | WebKit | iPhone |
| 412 × 915 | Chromium | Android phone |
| 820 × 1180 and 1180 × 820 | WebKit | iPad, portrait and landscape |
| 1024 × 768 | Chromium | a small tablet or a narrow window |

Playwright moves a finger only in Chromium (through its DevTools
protocol); a long press on iOS, the on-screen keyboard and the window's
own buttons could not be observed in the harness.

## Fixed in the same branch

| Finding | Level | Fix |
|---|---|---|
| A swipe that scrolls the file tree started a drag: the next tap on a folder moved the note into it | BLOCKING (data) | a finger drags only after a long press; a pointer the browser takes back cancels the drag (`layout/drag.ts`) |
| No context menu on a touch screen: iOS fires no `contextmenu` on a long press | BLOCKING | a long press and a lift open the menu the right click opens (`touch.ts`); fields, the editor, the board and text keep the system's own long press |
| The file menu, 26 items, 866 px tall, ran past the bottom of the screen | BLOCKING | the menu stays inside what the screen shows and scrolls (`menu.ts`, `.menu`) |
| The settings dialog left 140 px for its page on a phone, and closed only by Esc or a tap beside it | BLOCKING | under 760 px the sections become a row above the page; a × closes it |
| The notes search could be cleared only by deleting or by Esc (the maintainer's finding) | IMPORTANT | a × in the field |
| iOS zooms into a field whose text is under 16 px | IMPORTANT | every field writes at 16 px at least on a touch screen (`css/touch.css`) |
| Controls shown only on hovering (remove a property, close a tab, fold, copy code, cover, focus actions…) | IMPORTANT | shown at rest when the screen has no hover |
| Touch targets of 19 to 32 px (status bar, ribbon, tree rows) | IMPORTANT | 44 px for the ribbon and the status bar, 40 px rows, wider dividers |
| The "Move to…" field was 17 px wide on a phone | IMPORTANT | its label wraps above it |
| A base's table broke words letter by letter on a phone | IMPORTANT | each column keeps 7 rem; the table scrolls sideways |
| The sticker picker's search said "Search the notes" | MINOR | its own words |

## Left for the responsive ADR

Each needs a choice about how the window is laid out on a phone, which
is the ADR's to make:

- **Split panes on a phone**: two panes of 173 px, the tab label pushed out
  by the pane's tools; on an iPad in portrait, the properties crushed.
  Refuse or stack splits below some width; let the pane, not the screen,
  decide its layout (container queries); fold the pane's tools.
- **The graph**: its controls take 15 rem, leaving the graph 90 px; pinch
  only through WebKit's gesture events; help text that speaks of the
  wheel and of double clicks.
- **Following a link in Edit mode** needs ⌘ or Ctrl.
- **The kanban**: a swipe that starts on a card cannot scroll
  (`touch-action: none`); the columns do not fit a phone.
- **The ribbon and the status bar on a phone**: 44 px of verbs that belong
  to a desktop, index counts in the status bar, line numbers in Source mode.
- **The on-screen keyboard**: menus and the `/` menu are placed against
  the window's height, not what the keyboard leaves (`visualViewport`).
- **Modifier keys and double clicks**: multiple selection in the tree,
  keeping a preview tab, opening without preview.
- **Text under 12 px** in the status bar and the side titles; the safe
  areas of a phone with a notch (`env(safe-area-inset-*)`); the whole page
  zooms on a pinch.
- **Menu items that mean nothing in a browser** ("Show in Finder", "Open in
  new window", "Copy full path") — for the server's capabilities
  ([ADR 0027](../adr/0027-runtime-capabilities.md)).

## What already worked

The drawer under 760 px opens and closes as it should; the right side bar
and the calendar fit a phone; the quick switcher, the palette and the `/`
menu fit and close on a tap beside them; the board switches to
Excalidraw's phone toolbar; a PDF fills its pane.
