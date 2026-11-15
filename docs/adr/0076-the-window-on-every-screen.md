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
  2026-11-14 — one top bar on a phone (item 6). 2026-11-15 — the side
  panels follow a sideways swipe on a phone (item 6, at the end).

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

**One top bar on a phone (item 6, revised 2026-11-14).** The maintainer, on
his phone with 0.9.0-beta.1: *"to achando a area util muito pequena, temos
vários pixels separado para abas, quase o triplo de pixels separados para
caminho do arquivo, e 3 botões de modo. ai em baixo vários pixels separados
para operações … talvez uma barra unica superior com botão que agrupa abas,
ativa e desativa barra inferior e demais botões"*. Four drafts were drawn
(one top bar; bars that hide while reading; everything in one bottom bar;
the current layout measured: 153 px of controls, about 72% of the screen
left to the text); he chose the one top bar: *"gostei muito do A"*. Under
760 px:

- The pane's tab row becomes **one bar of 44 px**: the note's name over its
  folder, one **mode button** (in a note: Reading turns to Edit, Edit or
  Source back to Reading, through the note's own mode buttons), the pane's
  **⋯**, a button with the number of open tabs and the bell. The tabs'
  button sits at the right end, under the thumb (the maintainer,
  2026-11-15: *"como ele é muito usado … no alcance do dedão"*). The tabs, the
  note's own row of folder and modes (`.note-head`) and the folder in any
  other leaf's row are not drawn; a base's or a data file's modes stay in
  their row; a board's are the sheet's (below, 2026-11-15).
- The count and the name open a **sheet** under the bar
  (`app/ui/src/screen/phoneSheet.ts`): the open tabs (to the front, ×
  closes), the folder path as links, the three modes by name (and *View as a
  reader* when the note offers it), the bottom bar's six verbs, and a switch
  *Bottom bar always shown*. A tap outside, Escape and Android's Back close
  it.
- The **bottom bar of (a) stays, on by default** (`phoneBottomBar`, a
  setting kept by the window; the maintainer, 2026-11-14: *"o padrao da
  barra inferior deve ser habilitado"*); the sheet's switch and the pane's
  **⋯ › Hide the bottom bar / Show the bottom bar** take it away and bring it
  back. With it off,
  the top bar stays even with no tab open — the way to the verbs — showing
  the folder's name.
- Default chosen in the code (the maintainer's to change): the mode button
  goes between Reading and Edit only (Source is in the sheet).
- Tried in `e2e/phone-top-bar.spec.mjs`, and on the maintainer's phone
  through the harness (`adb reverse`).

**The side panels by a sideways swipe (item 6, 2026-11-15).** The
maintainer: on the phone, swipe horizontally to bring the side panels, as
most apps with hidden side drawers do — right to left the right panel, left
to right the files — especially in portrait, so that the bottom bar need not
be on to reach them. Built (`app/ui/src/screen/swipeRule.ts`, the decision;
`app/ui/src/screen/swipe.ts`, the page):

- **Where**: the phone's frame only (`PHONE_MEDIA`, so a phone held
  sideways too) and a finger only (touch events; a mouse never). A tablet
  keeps its side bars, which are not drawers, and has no swipe.
- **Not from the edges.** Android's gesture navigation takes a swipe that
  starts at the very left or right edge as its own Back, and the page never
  sees it or sees it cancelled; so the swipe is not an edge swipe. It starts
  anywhere in the content except a band along each side. On Android the
  band is the width the system reports for its Back gesture
  (`WindowInsets.Type.systemGestures()`, read by `MainActivity.kt` each time
  the insets change and asked by the page at the touch's start through
  `VersoGestures`) plus 8 px: it follows the Back sensitivity, and with
  three-button navigation it is the 8 px alone. Where nothing reports it
  (iOS, a browser) the band is 24 px, and the same rule holds on iOS
  (Tauri's WKWebView has no back-swipe) — one behaviour, no edge gesture of
  iOS's own. The swipe can be turned off in the top bar's ⋯ sheet and in
  Settings › Appearance › Phone, for a phone where it still gets in the way
  of the system's Back (the maintainer, 2026-11-15).
- **What counts**: the finger goes 10 px before anything is decided; held
  still for the long press's 450 ms first (`touch.ts`), it is a long press,
  never a swipe; it must be clearly sideways — at least twice as far across
  as down (within about 27°); decided once, for the whole touch. Right to
  left brings the right panel, left to right the files (only when the bottom
  bar's *Arquivos* could: not without a folder, not for a file opened
  without its folder); with one open, the swipe the other way, on it or on
  the page beside it, closes it, and the same way does nothing.
- **Following the finger**: once decided the page stops the browser's own
  move of that touch and the panel follows the finger; let go past 35 % of
  its width, or flicked (0.35 px/ms over the last 100 ms, at least 24 px),
  it settles open (or closed); else it slides back. With
  `prefers-reduced-motion: reduce` it does not follow: it opens (or closes)
  once the finger has covered the same 35 %, without waiting for the lift.
  The Table's and the Music tab's right panel, a sheet from the bottom on a
  phone, does not follow a finger across either: the same rule as reduced
  motion. A move the browser has already taken for a scroll (not
  cancelable) is left to it.
- **Never stolen**, decided by one function from the touched element up,
  not by a list scattered through the views: a text selection on the page
  (its handles dragged in the editor); a field (`input`, `textarea`,
  `select`, a slider) — the editor itself is not one, a swipe over a note is
  the main case; anything that scrolls sideways (overflowing across with
  `overflow-x` auto or scroll: a wide table, a code block, the kanban, a tab
  strip, the keyboard's bar, a zoomed PDF, Source mode's long lines);
  anything whose `touch-action` leaves the page no sideways pan (the board's
  and the drawing's Excalidraw canvas, a map's MapLibre canvas, the graph,
  the data graph, the image crop); one list in `swipe.ts` for the canvas-like
  views by class (`.board-host`, `.excalidraw`, `.graph`, `.graph-stage`,
  `.dg-stage`, `.base-map`, `.maplibregl-map`) and `data-no-swipe` for any
  element that opts out; and a dialog, a menu, the top bar's sheet, the 3D
  dice on screen, a drag or a resize in progress.
- **The same toggles**: the panels open and close through `toggleSide` and
  `toggleRight`, the bottom bar's *Arquivos* and *Painel*: the buttons'
  `aria-expanded` and names, Android's Back (it closes a panel a swipe
  opened), the tap outside and the Table's unread count work as for a
  button. Focus does not move; a field typed in loses it when a panel opens,
  so the on-screen keyboard goes as after a tap on the bar's button.
- **Accessibility** (item 9): the swipe is an extra; *Arquivos* and *Painel*
  stay as buttons, in the bottom bar and in the top bar's sheet. Nothing is
  reached by the gesture alone.
- **A switch**: *Deslizar para o lado abre os painéis* / *Swipe sideways to
  open the panels*, in the top bar's sheet beside *Barra inferior sempre
  visível* (`phoneSwipe`, a setting kept by the window), **on by default**.
- Chosen in the code (the maintainer's to change): the 24 px edge band, the
  10 px slop, the 2:1 sideways rule, 35 % or a flick to settle, and closing
  the Table's sheet with a sideways swipe too.
- Considered by the author and not taken: an edge-only swipe (Android's
  Back owns the edges); pointer events (the browser cancels a pointer it
  takes for a scroll); `touch-action: pan-y` on the work area (every child
  would lose its own sideways scroll, a table's and a code block's).
- Tried in `test/swipePanels.test.mjs` (the decision) and
  `e2e/phone-swipe.spec.mjs` (Chromium, by touch, at 390 × 844); on a real
  phone, with Android's gesture navigation, in `docs/reference/manual-checks.md`.

**A board on a phone (items 1 and 10, 2026-11-15).** The maintainer, from his
phone: a board's controls *"badly placed, scattered everywhere, taking space,
the useful area becomes tiny"* — the clear canvas was about 62 % of the
screen upright and a band of about 68 px sideways. Three prototypes on the
real board (one bar replacing the bottom bar; a rail at the right edge; the
two by orientation); he chose the third, with one column sideways. Built
(`app/ui/css/boardphone.css`, details in
[0057](0057-board-json-canvas.md)):

- **Upright**: the drawing tools are one flush bar at the board's foot, and
  while a board that draws is in front it **takes the bottom bar's place**,
  even with *Bottom bar always shown* on — the switch says so beneath it
  (*On a board, the drawing tools take its place*); the bar's verbs are in
  the sheet. A board that only reads keeps the bottom bar. About 89 % of the
  screen is canvas.
- **Sideways**: one column at the right edge, the thumb's, clear of the
  right safe area, all eight tools sharing the height under the top bar;
  the bottom bar gives way too. About 79 % of the screen is canvas.
- **The top bar** holds the board's undo and redo; **the sheet** a *Board*
  section: Board | Text, what puts something on the board, Loose arrows,
  the search, the outline, Excalidraw's menu and, at a table, who sees it.
- Targets stay 44 px (the column's 43 px on a 390 px screen, each 52 px
  wide). Chosen in the code (the maintainer's to change): the order of the
  sheet's verbs, and the hand tool kept in the column rather than moved to
  "more".
- Tried in `e2e/board-phone.spec.mjs` (both sizes) and
  `test/boardPhone.test.mjs`; on a real phone in
  `docs/reference/manual-checks.md`.
