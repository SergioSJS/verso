# ADR 0076 — The window on every screen: phone, tablet, a narrow pane

- Date: 2026-10-09
- Source: the maintainer, in session on 2026-10-08: *"a gente vai precisar
  ter uma revisão muito forte da aplicação sendo responsiva … tablet,
  celular, assim como o Notion faz … vale essa investigação mais
  aprofundada"*; on 2026-10-09, a thorough review of the window on a phone
  and a tablet, and then *"A ADR de responsividade com o que a auditoria
  deixou"*. Written by Opus 5.5 from the first review of 2026-10-09
  (`docs/reference/responsive-review-2026-10-09.md`, on the branch
  `feat/web-groundwork`); to be read by Fable 5.1
  ([0032](0032-author-and-reviewer-roles.md)) before it is accepted.
- Related: [0073](0073-self-hosted-server-first.md) (item 9: this
  investigation, before the server's window is built; item 8: the phone
  and the tablet reach Verso through the browser first),
  [0035](0035-cross-cutting-requirements.md) (both languages; accessibility,
  the screen readers of the phone and the tablet included),
  [0027](0027-runtime-capabilities.md) (what the window learns of the side
  it runs on), [0026](0026-core-ui-contract-inviolable-rules.md) (rule 2),
  [0053](0053-views-bases.md) (the kanban), [0057](0057-board-json-canvas.md)
  (the board), [0061](0061-blocks-in-edit-mode.md) (blocks in Edit mode),
  [0065](0065-a-folder-per-window.md) (a window per folder),
  [0009](0009-external-constraints.md) (what may be observed of another
  app: from the outside only).
- Status in the briefing: not present; on acceptance, with
  [0073](0073-self-hosted-server-first.md).
- Revisions: 2026-10-09 (night) — accepted by the maintainer with every
  recommendation, together with [0073](0073-self-hosted-server-first.md),
  in the answer quoted there (*"P tudo"*: P all of it); built in this
  round, before the server's window ships. The options not chosen stay
  beside each recommendation.
  2026-10-12 — item 11's rule is now item 3 of
  [0027](0027-runtime-capabilities.md), revised to it by the maintainer
  that day with 0027's acceptance (*"Ajuste tudo que precisar. Está aprovado os ADRs"*).

## Context

The window was built for a Mac with a mouse and a keyboard. Since
2026-10-09 it also runs on a touch screen without losing a note: a finger
drags only after a long press, a long press opens the context menu, the
menus stay on screen, fields do not make iOS zoom, controls that a mouse
found by hovering are shown at rest, and the settings fit a phone. Under
760 px of window the left side bar is a drawer. All of that is in the
review named above, which lists what it left because each item needs a
choice about how the window is laid out on a phone.

[0073](0073-self-hosted-server-first.md) item 8 makes the browser on the
phone and the tablet the first mobile client; item 9 asks for this
investigation before the server's window is built, naming the
breakpoints, what each surface loses, touch targets and gestures, the
screen readers and both languages, and the e2e suite running at those
widths.

Notion is the reference the maintainer named. What it does on a phone,
observed from the outside ([0009](0009-external-constraints.md)) and to
be confirmed on the maintainer's phone and iPad before acceptance (the
ADR was accepted on 2026-10-09 before that confirmation, which still
waits): one
page at a time, no side-by-side; the sidebar as a screen of its own; a
bar of a few verbs at the bottom (home, search, inbox, new page); a
toolbar above the on-screen keyboard with the block actions; a link in
a page being edited opens a small card with "open" rather than moving
the reader away.

How the window is measured today, and the limits of the measure: the
browser harness through Playwright with touch on, at 390 × 844 (WebKit,
an iPhone), 412 × 915 (Chromium, an Android phone), 820 × 1180 and
1180 × 820 (WebKit, an iPad) and 1024 × 768 (Chromium). Playwright moves
a finger only in Chromium; a long press on iOS, the on-screen keyboard
and the screen readers were not observed.

## Decision

**Accepted on 2026-10-09** with every recommendation: option (a) in items
2, 4 and 6, option (a) for the page's zoom in item 10, and the single
recommendation of every other item (Status). *(History: proposed in every
item. Each one names the options and the author's recommendation; the
maintainer chooses.)*

1. **Two levels decide the layout: the screen decides the frame, the pane
   decides its content.** The frame — drawer or side bars, ribbon, status
   bar — follows the window's width (media queries, as the 760 px drawer
   does today). What is inside a pane — its tools, the properties, a
   base's columns — follows the pane's own width (container queries, as
   the status bar already does on `.work`), so a narrow pane on a desktop
   and a phone look the same. Breakpoints: **phone** under 760 px,
   **tablet** from 760 to 1180 px, **desktop** above; the pane's own
   thresholds at 520 and 820 px, the two the status bar uses.
   - Alternative: the screen decides everything (media queries only):
     simpler, and a split pane on a desktop stays crushed.
2. **Split panes on a phone.** Today two panes of 173 px; the tab's label
   pushed out by the pane's tools; on an iPad in portrait the properties
   crushed.
   - (a) Under 760 px the split commands are absent and a layout already
     split shows one pane at a time, the others behind a switcher in the
     tab bar; the layout is kept, not discarded, and comes back on a wider
     window. Over 760 px splits stay, and a pane under 520 px folds its
     tools into one "…" button.
   - (b) Under 760 px the panes stack, one above the other.
   - (c) As today.
   - Recommended: **(a)**, Notion's one page at a time; stacked panes on a
     phone leave each half a screen with a keyboard over it.
3. **The graph.** Its controls take 15 rem and leave the graph 90 px; the
   pinch works only through WebKit's gesture events; its help speaks of
   the wheel and of double clicks.
   - Recommended: under 760 px (or a pane under 520 px) the controls are a
     panel closed by default, opened by one button over the graph; the
     pinch and the two-finger pan by pointer events, which every engine
     sends; the help written for the input the screen has (touch or mouse).
4. **Following a link in Edit mode.** Today it needs ⌘ or Ctrl, which a
   phone does not have.
   - (a) A tap places the cursor, as now, and a small card beside the link
     offers "Open" (and "Edit link"), as Notion does.
   - (b) A tap opens the link; a long press edits it.
   - (c) A button in the keyboard's toolbar (item 7) opens the link under
     the cursor.
   - Recommended: **(a)**: a tap never takes the person away from the
     text they are writing, and the card is reachable by a screen reader.
5. **The kanban on a touch screen.** A swipe that starts on a card cannot
   scroll (`touch-action: none`); the columns do not fit a phone.
   - Recommended: the rule the file tree already follows — a card moves
     only after a long press, a swipe scrolls; under 760 px the board
     scrolls sideways a column at a time (scroll snap), each column the
     width of the screen less a margin that shows the next one. Moving a
     card from the long-press menu ("Move to column…") as well, for a
     screen reader and for a long board.
6. **The ribbon and the status bar on a phone.** Today 44 px of desktop
   verbs and a status bar of index counts; line numbers in Source mode.
   - (a) Under 760 px the ribbon and the status bar leave; a bar at the
     bottom carries four or five verbs — the drawer, search, new note,
     back, the palette — above the phone's safe area; what the status bar
     says that matters on a phone (the connection to the server, a save
     that failed) moves to the top of the pane. Line numbers off under
     760 px unless the person turned them on.
   - (b) The ribbon stays, as a narrow column.
   - Recommended: **(a)**, as Notion and as Obsidian's own phone app show
     from the outside.
7. **The on-screen keyboard.** The context menu stays inside what the
   keyboard leaves (`visualViewport`); the `/` menu, the link and tag
   suggestions and the sticker picker are still placed against the
   window's height, under the keyboard.
   - Recommended, in two steps: first, every floating surface is placed
     against the visual viewport and the editor keeps the cursor above the
     keyboard; then a toolbar above the keyboard with a short set — undo,
     redo, indent, outdent, `[[`, `/`, hide the keyboard — whose contents
     are an `[OPEN]` for after use.
8. **Modifier keys and double clicks.** Multiple selection in the tree,
   keeping a preview tab and opening without preview need a modifier or a
   double click.
   - Recommended: "Select" in the long-press menu turns the tree into a
     selection with a box on each row and a bar of the actions that take
     several notes (move, bin, copy), as the Files app of iOS does; "Keep
     open" in a tab's long-press menu keeps a preview tab; "Open" in a
     note's menu opens it without preview.
9. **Screen readers with touch.** VoiceOver on the iPhone and the iPad
   and TalkBack on Android have not been tried
   ([0035](0035-cross-cutting-requirements.md) item 2), and a page cannot
   tell that one is on.
   - Recommended: no action is reached **only** by a gesture: what the
     long press opens is also behind a visible button on the focused
     row or the pane's "…"; the long press of the window listens only to
     what a screen reader turns its own double-tap-and-hold into, and
     does not prevent it; before the server is announced
     ([0073](0073-self-hosted-server-first.md) item 6), one pass with each
     reader, on the maintainer's devices, recorded in
     `docs/reference/manual-checks.md`.
10. **Targets, small text, safe areas, the page's zoom.**
    - Rows of the tree are 40 px today, under the 44 px Apple and Google
      ask (WCAG 2.2's minimum, 2.5.8, is 24 px). Recommended: 44 px under
      760 px, where the tree is a drawer of its own; 40 px on a tablet.
    - Text under 12 px (the status bar, the side titles): 12 px at least
      on a touch screen.
    - The phone's notch and rounded corners: the page declares
      `viewport-fit=cover` and the frame keeps to
      `env(safe-area-inset-*)`.
    - A pinch zooms the whole page today. (a) Keep it — WCAG 1.4.4 asks
      that text can be enlarged, and iOS ignores `user-scalable=no`
      anyway — with the board, the graph and a PDF taking the pinch for
      themselves; (b) refuse it, as an app would. Recommended: **(a)**.
11. **What means nothing in a browser.** "Show in Finder", "Open in new
    window", "Copy full path", the terminal and the agents of
    [0054](0054-terminal-and-agents-from-the-app.md): absent when the
    capabilities ([0027](0027-runtime-capabilities.md)) say the side
    cannot do them — never shown and failing. "Open in new window"
    becomes "Open in a new tab" in a browser, and "Copy full path"
    becomes "Copy link", the note's address on the server.
12. **Both languages.** Every control this ADR adds is labelled in pt-BR
    and English ([0035](0035-cross-cutting-requirements.md) item 1), and
    a label that grows in Portuguese is measured at 390 px.
13. **The e2e suite at those widths.** A test of the window that concerns
    layout or touch is tagged, and the tagged tests run, besides the
    desktop size, at 390 × 844 in WebKit, 412 × 915 in Chromium with
    touch, and 820 × 1180 in WebKit — not the whole suite three times,
    which would triple the local run of `scripts/check.sh`.

## Consequences

- The window gains a phone frame (the bottom bar, the pane switcher)
  and pane-level layout by container queries; `css/touch.css` stays the
  last word for a finger.
- The menus gain items that stand for a modifier or a double click
  (item 8) and the actions that only a long press reached gain a visible
  way (item 9).
- The host-only items leave the menus by capability, which the server
  needs anyway ([0073](0073-self-hosted-server-first.md) item 6).
- The harness gains the tagged runs of item 13; the manual checks gain
  the passes with VoiceOver and TalkBack.
- The demo vault's tour gains a note on using Verso on a phone
  ([0058](0058-demo-vault-as-tutorial.md)).

## Discarded alternatives

- **A separate mobile UI** (raised by the author, to rule it out): two
  windows to keep in step; [0073](0073-self-hosted-server-first.md) item
  8 already says one code base.
- **The whole e2e suite at every width** (raised by the author): a local
  run three times as long for tests that do not concern the layout.

Item by item, the options not recommended are kept beside each
recommendation above.

## Status

**Accepted on 2026-10-09** by the maintainer, with every recommendation,
together with [0073](0073-self-hosted-server-first.md) (*"P tudo"*): (a)
in items 2, 4 and 6, (a) for the page's zoom in item 10, and the
recommendation of each other item. All of it is built in this round,
before the server's window ships. The keyboard's toolbar of item 7 ships
with the recommended short set. Still `[OPEN]`: the toolbar's contents,
to revisit after use. The observations of Notion in the Context still wait
for the maintainer's phone and iPad.

*(History, the status before the acceptance:)* Proposed. Every item waits
for the maintainer's choice; the observations of Notion in the Context
wait for his phone and iPad. `[OPEN]`: the contents of the keyboard's
toolbar (item 7), after use.

**Amended on 2026-10-16** (the toolbar's contents, item 7, decided). The
maintainer, after the blocks' handles of [0061](0061-blocks-in-edit-mode.md)
left a wide empty margin on his phone: *"Cara, notei que nosso modo mobile
tem uma borda gigante a esquerda da lateral do celular ate o início do
texto. É assim por causa das botões estilo notion que fizemos. No computador
ficou legal, mas no celular nao. Fui olhar como notion resolve, ele nao faz
esses botões, ele cria uma barra de atalhos onde nela tela as opções e da
para por exemplo, mover o bloco pra cima e para baixo"*. Decided: on a touch
screen (`(pointer: coarse)`) the block handles, the `+` and the margin they
needed are gone, and the keyboard's toolbar is one row that scrolls sideways,
with targets of 44 px at least, holding, in this order: add a block (`+`);
"Turn into" with its menu; `[[`; `/`; outdent; indent; move the block up;
move the block down; delete the block; the block's menu (duplicate, copy
link…); undo; redo; hide the keyboard. Each block command is the one the
desktop's handle, `+` and block menu call, on the block at the cursor, and
the menus open above the bar, inside what the screen shows. The cursor stays
in the moved block, above the keyboard. A fine pointer keeps the handles as
[0061](0061-blocks-in-edit-mode.md) made them. This closes the `[OPEN]` on
the toolbar's contents; they can still change after use, by a new
amendment.

**The reader's mark (item 11), 2026-10-23.** The maintainer: *"essa mensagem
'you can only read this folder' é inútil, remova, tem jeito melhor de fazer
isso: se a pessoa tentar editar, … pode ter um cadeado fechado em algum lugar
pra indicar isso"*. The yellow line at the top of the window (and the
browser's one-off notice) is gone. Decided in the code, to confirm: a closed
lock beside the folder's name in the side bar's head (named *You only read
this folder*), shown while the folder on screen is one the person only reads;
and, when they try to change something (type, paste, drop or cut in a note,
ask for Edit or Source, ⌘N and the other keys of what writes, drag a file,
rename, make a folder), a short notice near where they acted that says so,
shown at most once every few seconds, not on every key
(`app/ui/src/readerNotice.ts`). A note granted to the person (ADR 0110) edits
normally and says nothing, and the lock is hidden while the note on screen is one
the person may edit (2026-10-23, maintainer): it shows on a note they only
read and with no note open, repainted on navigation, on the campaign status
and when a folder is shown. Tried in
`e2e/reader-lock.spec.mjs`, `capabilities.spec.mjs` and `folder-role.spec.mjs`.

*Revised inside a table (2026-10-24) by [0113](0113-one-access-model-for-a-table.md), section F:* a player at a
table is not shown the folder's lock (they edit some files), and the notice on
an attempt names the note (*You only read this note*), not the folder. Outside
a table this paragraph holds.
