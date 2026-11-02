# The window on a phone and a tablet: first review (2026-10-09)

What the window does today on a touch screen, measured in the browser
harness, and what was fixed at once, at the maintainer's request of
2026-10-09 for a thorough review of the window on a phone and a tablet.
It is also the starting point of the investigation ADR 0073 item 9
(proposed, on the branch `docs/server-first`) asks for, which ends in an
ADR of its own; nothing here decides how the window looks on a phone.

## How it was measured

On 2026-10-09, by an Opus 5.5 session, on the harness built from `main`
(825fd9c) with the demo vault, through Playwright with touch on:

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
| Touch targets of 19 to 32 px (status bar, ribbon, tree rows) | IMPORTANT | 44 px for the ribbon and the status bar, 40 px rows (under the 44 px asked, to keep a tree readable; for the ADR), wider dividers |
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
- **The on-screen keyboard**: the context menu now stays inside what the
  keyboard leaves (`visualViewport`); the `/` menu and the sticker picker
  are still placed against the window's height.
- **Screen readers with touch**: VoiceOver on the iPhone and the iPad,
  TalkBack on Android ([ADR 0035](../adr/0035-cross-cutting-requirements.md)
  item 2) — not tried; the long press of `touch.ts` must not take the
  screen reader's own gestures.
- **Modifier keys and double clicks**: multiple selection in the tree,
  keeping a preview tab, opening without preview.
- **Text under 12 px** in the status bar and the side titles; the safe
  areas of a phone with a notch (`env(safe-area-inset-*)`); the whole page
  zooms on a pinch.
- **Menu items that mean nothing in a browser** ("Show in Finder", "Open in
  new window", "Copy full path") — for the server's capabilities
  ([ADR 0027](../adr/0027-runtime-capabilities.md)).

## Built from ADR 0076

[ADR 0076](../adr/0076-the-window-on-every-screen.md), accepted on
2026-10-09 with every recommendation, made the choices above; all of them
are built on the branch `feat/web`, and the e2e suite runs the tests tagged
`@layout` at 390 × 844 (WebKit), 412 × 915 (Chromium, touch) and 820 × 1180
(WebKit) besides the desktop's size.

| Left above | Built | Seen by |
|---|---|---|
| Split panes on a phone | under 760 px one pane at a time, a switcher in the tab bar, the layout kept for a wider window; the split commands absent; a pane under 520 px folds its tools into "…"; the pane decides its content by container queries (520 and 820 px) | `responsive.spec.mjs` |
| The graph | its controls a panel closed by default under 760 px or in a pane under 520 px; pinch and two-finger pan by pointer events; help for touch or mouse | `responsive.spec.mjs` |
| Following a link in Edit mode | a tap places the cursor; a card beside the link offers Open and Edit link | `responsive.spec.mjs` |
| The kanban | a card moves after a long press, a swipe scrolls; a column per screen under 760 px (scroll snap); "Move to column…" in the card's menu | `responsive.spec.mjs` |
| The ribbon and the status bar on a phone | under 760 px a bottom bar of five verbs over the safe area; a failure said at the top of the pane; the server's notices at the top; line numbers in Source off unless chosen | `responsive.spec.mjs` |
| The on-screen keyboard | every floating surface placed against the visual viewport; the cursor kept above the keyboard; a toolbar above it (undo, redo, indent, outdent, `[[`, `/`, hide; its contents `[OPEN]` after use) | `responsive.spec.mjs` (the system's keyboard stood in for) |
| Screen readers with touch | a visible "…" beside the row in front, the pane's "…" reaching the tab's menu, a card's "…"; the long press prevents nothing | `responsive.spec.mjs`; the passes with VoiceOver and TalkBack in `manual-checks.md` |
| Modifier keys and double clicks | "Select" in a row's menu, a selection mode with a bar; "Keep open" in a tab's menu; "Open" in a note's menu | `responsive.spec.mjs` |
| Text, safe areas, the page's zoom | rows of 44 px under 760 px, 40 px on a tablet; 12 px at least on a touch screen; `viewport-fit=cover` and the frame inside the safe areas; the page's pinch kept, the graph and a PDF taking it for themselves | `responsive.spec.mjs` |
| Menu items that mean nothing in a browser | absent by the capabilities; "Copy link" and "Open in a new browser tab" on a server; a web page in a frame; a reader's window read-only | `capabilities.spec.mjs` |

Not seen by machine: a long press on iOS, the system's keyboard, the
notch, VoiceOver and TalkBack — `manual-checks.md`, "The window on every
screen".

## What already worked

The drawer under 760 px opens and closes as it should; the right side bar
and the calendar fit a phone; the quick switcher, the palette and the `/`
menu fit and close on a tap beside them; the board switches to
Excalidraw's phone toolbar; a PDF fills its pane.
