# The demo vault walkthrough

- Date: 2026-10-01
- Source: [ADR 0058](../adr/0058-demo-vault-as-tutorial.md), point 6; the
  maintainer, in session, on 2026-10-01: "registre os passos a passos de
  testes realizados para serem automatizados de alguma forma pra rodar
  localmente quando fizer sentido" (write down the tests' steps, to be
  automated somehow and run locally when it makes sense); and, the same day,
  the choice of how: the browser harness, driven by Playwright (ADR 0058,
  points 8 to 13).
- Status: the steps as followed on 2026-10-01, those marked E run by
  machine; each feature that changes what a user sees adds its own.

The tutorial is followed in the app before a pull request that changes what a
user sees, as a new user would follow it: from an empty folder, with the app's
log and the window's console open. This page is that walk, step by step: what
to do, what must happen, how it is checked, and how far it can run by machine.
A step that fails is a bug of the app or of the tutorial, fixed in the same
pull request; the last line of a step names the bug it caught the first time.

## How to run it

By machine first: `npm run e2e` in `app/ui` builds the window and runs every
step marked E, in WebKit, headless, in about twenty seconds;
`scripts/check.sh` runs them too. One file: `npx playwright test
e2e/notes.spec.mjs`; to watch: `--headed`; to step through: `--debug`. A
failure leaves a screenshot and a trace in `app/ui/e2e/results/`
(`npx playwright show-trace <trace.zip>`).

Then by hand, in the app, the steps with no E:

1. Build: `npm run build` in `app/ui`, then `cargo build -p verso-app` (a
   `tauri build` does not rebuild the window's bundle).
2. Make an empty folder and start the app on it:
   `target/debug/verso-app <folder>`.
3. Note where the log ends: `wc -l` of
   `~/Library/Application Support/verso/logs/verso.log`.
4. Open the console: ⌥⌘I (View › Open console).
5. Follow the sections below in order. The debug app shares its settings and
   its window storage with an installed Verso (same bundle id): what a step
   changes there — a panel's tab, the palette — is put back at the end.
6. At the end: no `ERROR` line in the log after the line noted, nothing on
   the app's stderr, nothing red in the console.

## How far each step runs by machine

Each step ends with its level:

- **S** — static, runs now: `node scripts/demo-vault.mjs check`, in
  `scripts/check.sh` and in CI. The boards are their modules', the embed is
  the folder; every link of a note or a board leads to a file of the vault and
  a `#heading` to one of its note's; the daily notes and the templates sit
  where the app looks by default; every numbered note is in the welcome note's
  map, on the tour, and links to the next one.
- **U** — a unit test, runs now: `npm test` in `app/ui` and `cargo test`,
  both in `scripts/check.sh` and in CI.
- **H** — the window's own behaviour, the core aside: it runs in the browser
  harness (`app/ui/src/harness.ts`, a core in TypeScript over the demo vault
  in memory).
- **E** — an H step that runs now by machine: the test named, in
  `app/ui/e2e/`. Every test also fails on an error on the console or of the
  page, a request that failed, an `ERROR` in the app's log, or the window's
  work area not filling the window.
- **A** — needs the real app: the native menu, the `verso:` protocol, the
  files on disk, the command line.

An H step with no E is followed by hand until its test is written; an A step
is followed in the app ([ADR 0058](../adr/0058-demo-vault-as-tutorial.md),
point 13).

## 1. Import into an empty folder

1. Palette (⌘⇧P) › "Importar cofre de exemplo" › confirm. Expect: every file
   of `demo-vault/`, byte for byte, in `Diário/`, `Templates/`, `Web/`,
   `assets/` and `projetos/` — no `daily/`, no `templates/`; the welcome note
   opens. Check: compare the folder's file list and bytes with `demo-vault/`.
   Level: S (the embed is the folder), H (the import); E:
   `import.spec.mjs`. Caught: the import
   created the folders the demo no longer has, and on a case-insensitive disk
   put `Templates/` into `templates/` (`a51aab2`).
2. The welcome note shows the "Comece pelo tour" callout with its two links.
   Level: S (the links), H.
3. Import again into a folder that holds an earlier version's demo. Expect:
   what is missing is created, a file with other content is kept as it is
   and named, and the app's log has `import demo:` lines saying how many
   were created, kept and failed. Level: H; E: `import.spec.mjs`. Caught:
   an import that wrote nothing said "imported" and left no trace.

## 2. The tour

1. In the welcome note, in Editar, ⌘-click "Tour do Verso" (a plain click
   puts the caret in the link). Expect: the board opens with every stop in
   rows of three, numbered at their top right, a dashed trail joining them in
   order; every drawn text whole. The file is unchanged. Check: the screen;
   `cmp` of the file before and after. Level: H; E: `board-tour.spec.mjs`
   (no board written, the text measured with its font) and
   `board-file.spec.mjs` (no board written after a press, a pan and a zoom
   right after opening). Caught: drawn text cut while its font loaded
   (`a147e8e`); a press right after opening wrote the board (2026-10-01).
2. Sumário: the stops are listed in their numbers' order; a click on each
   shows it whole and legible, its notes live on their cards; closing the
   Sumário keeps the stop in view. Level: H; E: `board-tour.spec.mjs`.
   Caught: a group was only brought to the middle at 10% (`a147e8e`); the
   stops were laid out in a snake while the outline lists them row by row
   (`26c3b06`); closing the Sumário brought the whole board back over the
   stop, and the window shrank while the notes' Mermaid diagrams were drawn,
   so a stop chosen then was shown off centre (2026-10-01).
3. ⌘W closes the tab and the app stays open; ⌘⇧T reopens it. Level: A (the
   native menu); E: `tabs.spec.mjs`, the keys and the menu's event as the
   host sends it. Caught: ⌘W closed the window, and with one window open
   quit the app (`a51aab2`).
4. On a board, ⌘P opens "Abrir…". Level: H; E: `board-tour.spec.mjs`.
   Caught: Excalidraw kept the key (`a147e8e`).
5. Note 13: ⌘R reloads the window with the note typed in saved first; with a
   note that cannot be saved (a conflict waiting), the window stays and says
   why. Level: H; E: `notes.spec.mjs`.
6. Windows (ADR 0065): File › New Window opens a window on the start page;
   it opens another folder, and each window lists and searches its own
   notes, its title the folder's name; File › Open Folder… switches only
   the window in focus; "Nova janela nesta pasta" opens one on the same
   folder, and a note written in one appears in the other; a note popped
   out keeps its window from switching while no other window shows its
   folder; closing a window leaves the others as they were; `verso
   <folder>` with every window on a folder opens a new window. Level: A;
   U: `cargo test -p verso-app` (`each_window_answers_from_its_own_folder`).

## 3. Writing and reading notes

1. Note 01 in Leitura: the callout with its own title, the folded callout
   that opens on a click, the nested callout, the footnote, the hidden
   `%%` comment, the tag as a pill, KaTeX, the table. Level: H.
2. Note 11 in Editar: on an empty line, `/` opens the menu with Básico,
   Listas, Destaques and Inserir; typing `data` leaves "Data de hoje", and
   Enter writes today's date; ⌘Z takes it back. Level: H; E:
   `notes.spec.mjs` (the date written at the end, and gone after ⌘Z).
3. Note 02: every link leads to its note, a `#heading` to its heading; the
   embed shows "Editar ao lado". "Incorporar só um bloco": the embed
   `#^atomica` shows the third finding alone, not the whole note (spec Q3,
   Q21). Level: S (the links, `fixtures/block/`), H; E:
   `blocks-ids.spec.mjs`.
4. Note 06 in Leitura: `![Diagrama|320](assets/diagrama.svg)` is shown
   320 px wide, from the folder; dragging its corner writes the new size on
   that picture, and the example of it in the heading's code is left as it
   is. Level: H; E: `notes.spec.mjs`. Caught: the picture was asked of the
   window's own address before the folder's, drawn 0 px wide (the size after
   an alt text was not read), and its resize rewrote the example
   (2026-10-01). A right click on the picture — here, in its own tab
   (`assets/diagrama.svg`), on a card of the board — is Verso's menu:
   "Abrir em nova aba", "Abrir em nova janela", "Baixar imagem" (it lands in
   Downloads, the status line names it), "Copiar imagem", "Mostrar no
   Finder"; the board's export "Baixar" lands in Downloads too. Level: H, A
   (the download and the window); E: `menus.spec.mjs`. Caught: WebKit's own
   menu showed there, and its "Download Image" and "Open Image in New
   Window" did nothing (2026-10-06).
5. A picture whose file name has an accent (`assets/gráfico.svg`) shows from
   the folder. Level: H; E: `notes.spec.mjs`. Caught: the renderer
   percent-encodes the address, and the window asked the core for
   `gr%C3%A1fico` (2026-10-01).
6. A note changed on disk while text typed in its tab is unsaved: both
   versions are shown, and the disk's stays (invariant 11). Level: H; E:
   `notes.spec.mjs`.
7. A note embedded with `![[Note]]`, in Editar, looks as it does in Leitura:
   its headings, its paragraphs one step apart, its pictures within the
   pane, and the text around it wrapped at the pane. Level: H; E:
   `notes.spec.mjs`. Caught: the embed's line breaks drawn as empty lines,
   its headings in the editor's type, and a picture wider than the pane
   pushing every line of the note past the right edge (2026-10-02).
8. A long note scrolled in Leitura to a heading, then Editar, then Leitura:
   the heading stays at the top. Level: H; E: `notes.spec.mjs`. Caught: the
   switch kept the scroll offset, and the editor showed another part of the
   note (2026-10-02).
9. A note with a paragraph and a list, in Leitura and in Editar: the text
   starts and ends at the same place and the list has the same line height.
   Level: H; E: `notes.spec.mjs`. Caught: Editar's text 7.5 px further right,
   its lines 113 px longer in a wide window (`100ch` in the interface's
   font), its list looser (2026-10-02).
10. Note 20 in Editar (ADR 0061): the pointer over a paragraph shows `+`
    and ⋮⋮ in the margin, left of the text, and an outline round the whole
    paragraph; ⋮⋮ dragged below the lists moves the paragraph whole, and
    one ⌘Z puts it back; "Terceiro passo" dragged to the top renumbers the
    list 1, 2, 3; "Maçã" dragged to the right under "Fruta" nests there;
    Esc mid-drag drops nothing. ⋮⋮ clicked: Transformar em › Título 2,
    Duplicar, Copiar link do bloco (a `^id` written once), Excluir. ⌘⇧↓
    and ⌘⇧↑ move the block at the caret, past a whole list; ⌘D duplicates
    it; ⌘/ opens "Transformar em". `+` opens `/` on a new block, and Esc
    takes it back; on a list item, the new block is the next item. `[] `
    becomes `- [ ] `; `/recolh` offers "Recolhível". Settings › Editor:
    "Alças dos blocos" off hides them; "Enter começa um bloco novo" on
    makes Enter write a blank line and Shift-Enter a line break. In the
    search field, ⌘⇧↑ is the field's own. An empty line shows the `+`
    alone: it writes a `/` there, apart from its neighbours, and Esc takes
    it back. Level: H; E: `blocks.spec.mjs`; U: `test/blocks.test.mjs`.
11. Note 01, "Tabelas no Editor", in Editar (ADR 0064): a table is drawn as
    a table with the caret in it or not; `/tabela` makes one whose empty
    header takes the keys; Tab, Enter, the arrows and Esc as the note says;
    the `+` under and beside it add a row and a column; right click on a
    cell: insert, delete, align (`:-:`), and the same tools in the
    formatting bar while a cell has the focus, the column's alignment
    pressed; a `|` typed is written `\|`; ⌘Z in
    a cell undoes the last step. A table inside a list stays text. Level: H;
    E: `tables.spec.mjs`; U: `test/table.test.mjs`.
12. Same table: drag the right edge of a header cell wider, in Editar; Leitura
    shows the column as wide, and so does the note opened again; the file
    does not change (ADR 0064 point 6). Level: H; E: `tables.spec.mjs`, "a
    column dragged wider…" and "a column dragged in Reading…".

## 4. Organizing: properties, bases, daily notes

1. `Projetos.base`: the five views (table, kanban, Cards, list, calendar);
   only the notes of `projetos/`; the formula's column and the budget's sum;
   the kanban in a column per status; the calendar back in September 2026
   shows the three projects. Level: H. Caught: with no filter the base
   listed the whole vault (`26c3b06`).
2. Note 04: the embedded view and the `base` block listing the daily notes.
   Level: H.
3. ⌘⇧D (⌘D until 2026-10-06, ADR 0061): `Diário/<today>.md` is made from `Templates/Diário.md`, `{{title}}`
   and `{{date}}` filled. Level: S (the folders), H; E: `notes.spec.mjs`.
   Caught: the notes said `daily/` and `templates/`, which the app does not
   use by default (`26c3b06`).
4. Right panel (⌘⌥→) › Calendário: dots on 24 and 25 September and on today.
   Level: H; E: `notes.spec.mjs`.
5. The typed note (note 21, ADR 0052): `Personagens/Capitão Ruy` shows
   "Tipo: Personagem" above its properties, the schema's properties first
   under their labels, `nível: alto` underlined, "Primeira aparição" an
   empty date row; opening it writes nothing; a date picked there goes at
   the end of the frontmatter; "Abrir o schema" opens `Tipos/Personagem`.
   A property added to the schema shows, empty, in both notes, and no file
   changes. A copy of the schema's note makes both notes say the two
   schemas share the name; `type:personagem` in the search lists the two.
   In English, "Type: Character". Level: S (`crates/verso-core/tests/typed.rs`,
   `fixtures/schema/`), H; E: `typed.spec.mjs`.
6. Note 07, "Começar uma nota nova por um template" (ADR 0068): ⌘N shows
   "Começar com" under the title — Em branco, Diário, Nota de Reunião, Novo
   Projeto; "Nota de Reunião" fills the note, `{{title}}` and `{{date}}`
   replaced; Em branco, Esc or typing put the list away and write nothing;
   the arrows move along the list. A folder whose note sets
   `items_template` makes the note from it, with no list. Level: H; E:
   `templates.spec.mjs`.

## 5. Finding

1. ⌘K `tag:projeto`: the two projects with the tag, and the template
   `Novo Projeto`, which carries it too. Level: A (the core's search).
2. With the focus outside the editor, ⌘⇧H: "Localizar e substituir no
   cofre…"; ✓ shows the plan, note by note; "Deixar como está" writes
   nothing. Level: A.
3. "Grafo do cofre": the graph and its controls as note 05 names them.
   Level: H.

## 6. Files

1. Click the title of an open note and rename it: the plan lists every note
   and board that points to it; "Atualizar links" rewrites them — the boards'
   cards and a relation in a frontmatter included — and the backlinks panel
   shows them at once. Level: A (the core's rewrite); E: `notes.spec.mjs`,
   the window's side — the notes and the board rewritten, the panel at once;
   the relation in a frontmatter is followed by hand. Caught: the renamed
   note showed no backlinks until reopened (`a51aab2`).
2. The PDF: its bar as note 06 names it; select a line, "Citar seleção nas
   anotações": `assets/manual-verso — Anotações.md` holds the quote, linked
   to its page. Level: A.
3. F2 renames the open note — right after a click on its row in the tree
   too — and the row of the tree that has the keyboard focus; in an editor or
   a field, F2 is theirs. Level: H; E: `tabs.spec.mjs`, the open note after
   a click on its row; the row with the keyboard focus and a field by hand.
   Caught: after a click, F2 did nothing (2026-10-01). After a click on a
   row, ↓ and ↑ walk the tree from it, and F2 still renames the open note;
   a row reached by the arrows takes F2 itself, in place. E:
   `tabs.spec.mjs`, both engines. Caught: the arrows worked after a click
   in Chromium only (2026-10-08).
4. A click on a file of the tree opens it in a preview tab, its title in
   italics, which the next click replaces; a double click keeps it
   ([ADR 0059](../adr/0059-tabs-preview-pinned.md)). Level: H; E:
   `tabs.spec.mjs`.
5. ‹ and ⌘[ step back through the notes clicked in the tree, though one
   preview tab showed them all; ⌘] steps forward. Level: H; E:
   `tabs.spec.mjs`. A note renamed meanwhile is stepped back to by its new
   name; one deleted leaves the trail. Caught: the trail held tabs, and a
   replaced preview tab left no way back (2026-10-01).
6. With a question on screen (Settings, a plan), the menu's ⌘W closes
   nothing behind it; with no tab left, ⌘W closes the window. Level: H (the
   question); E: `tabs.spec.mjs`; A (the window).
7. Note 14, "Vários de uma vez" (ADR 0048, revised 2026-10-07): ⌘-click two
   notes of the tree and ⇧-click a third — the rows between are selected;
   Esc clears; a plain click opens. Drag the selection onto a folder: they
   move together, and a note linking to them by path shows in one plan. The
   selection's menu: "Mover para…", "Copiar caminhos relativos", "Mover para
   a lixeira" asked once. Level: H; E: `tree-selection.spec.mjs`; S:
   `crates/verso-core/tests/workspace/rename.rs`.
8. Note 14, "Criar" (ADR 0070): a new note named `CON`, `Reunião: pauta`,
   `Ideia?` or `a\b` is not made (`nota.` is: its file is `nota..md`); the status bar says Windows cannot keep that name.
   A rename to such a name is refused the same way. Level: H; E:
   `prompts.spec.mjs`; S: `crates/verso-fs/tests/ops.rs`.
9. Note 14, "A Visão de Pasta": open a folder with its chevron and close
   another; open the app again — the tree is as it was left. A folder of
   thousands of notes opens with its top-level folders closed. Level: H;
   E: `tree-big.spec.mjs` (`?vault=big`, both engines), which also pins
   the rows' cost: no inline SVG, four elements a row, a closed folder's
   rows let go, one row marked as the open note.

## 7. The web

1. `Web/jsoncanvas.org.md`: the bar (back, forward, reload, the address);
   "Ver página" and "Ver nota" switch. Level: A.
2. `Web/Cartão de visita.html`: the page with its own style, in Página;
   its source in Fonte. Level: A. Caught: the page was blank — served as
   bytes, which `nosniff` kept the frame from showing (`a51aab2`).
3. "Desenho do Excalidraw" opens on its drawing, to look at — no tools —
   with "Converter em board" and "Ver o texto" over it; "Ver o texto" shows
   the note's text, "Ver o desenho" brings the drawing back, and the file is
   not written. "Converter em board" shows the board to be made, and "Criar
   o board" makes `Desenho do Excalidraw.canvas` beside it. Level: H, A; E:
   `board-drawing.spec.mjs`.
4. In `Web/jsoncanvas.org.md`'s page, and in a link opened in its own
   window: type in a field of the site, then ⌘A, ⌘Z and ⌘⇧Z act in that
   field, once each, and nothing in the note behind changes. Level: A (the
   site's web view is the host's; review `board.md`, second reading,
   finding 1).
5. With a note whose embedded site is on screen: ⌥⌘I opens the console,
   ⌘W closes the tab, and quitting asks the window to save first. Level: A
   (the window's child web views are the host's), U (`cargo test -p
   verso-app`). Caught: a window holding a site no longer counted as one
   of the app's — "current webview is not a WebviewWindow" — and its menu
   went deaf.

## 8. The board's file

1. Opening a board writes nothing; moving a card changes only its `x` and
   `y`. Level: U (the model), A.
2. A card's sharp corners and an elbow arrow come back as they were after the
   board is opened again, the arrow bound to its cards. Level: U. Caught:
   the panel's style was not saved (`c1a754b`).
3. A drawing sent behind a card (⌘⌥[) stays behind it when the board is
   opened again: the file keeps its place among the cards (`under`).
   Level: U (the model), H; E: `board-practice.spec.mjs`. Caught: it came
   back over the cards (2026-10-01).
4. A card moved and the tab closed at once: the move is saved, not lost.
   Level: H; E: `board-file.spec.mjs`. Caught: the save waiting in its delay
   was dropped with the tab (2026-10-01).
5. The board's file changed on disk (by Obsidian) while nothing is unsaved:
   the board is drawn again from it; changed here too, both versions are
   shown and nothing is written over the disk. Level: H; E:
   `board-file.spec.mjs`. Caught: an open board never followed its file
   (2026-10-01).
6. A canvas written in another layout (one line, or Windows line endings):
   the first edit shows the rewrite as a diff and asks; "Deixar como está"
   writes nothing. Level: H; E: `board-file.spec.mjs`.
7. A canvas saved by a later Verso (`verso.version` 2) opens to look at only:
   a drag writes nothing. Level: H; E: `board-file.spec.mjs`.
8. A card moved and the move undone (⌘Z) before the save: the tab closes
   clean, nothing written. Level: H; E: `board-file.spec.mjs`.

## 9. The practice board

1. The outline lists the lessons in order; each is legible when shown whole.
   Level: H.
2. Lesson 4: ⌘⌥C on the red balloon, ⌘⌥V on another: the style is pasted.
   Level: H.
3. Lesson 6: ⌘-drag round the robot, ⌘G, drag: it moves whole. Select the
   fruit, right click › "Envolver a seleção num quadro": a frame "Frame";
   double click its name, rename it: the outline says the new name; the file
   holds the group with it. Level: U (the outline), H; E:
   `board-practice.spec.mjs`, the frame and its name. Caught: the outline
   kept the old name (`a51aab2`), and again for a name typed over the frame,
   which Excalidraw changes in place (2026-10-01).
4. Lesson 7: ⌘⌥] brings the circle to the front, ⌘⌥[ sends the square to the
   back; ⌘] and ⌘[ one step. Level: H; E: `board-practice.spec.mjs`, ⌘⌥]
   and ⌘⌥[. Caught: ⌘⌥] and ⌘⌥[ did nothing on a Mac (`a51aab2`).
5. Lesson 8: "Nota ou arquivo" › the welcome note: its card, painted with
   Fundo; double click the text card: "Texto do cartão (Markdown)"; the
   edit is saved in the file. Level: H; E: `board-practice.spec.mjs`, the
   text card.
6. Lesson 9: ⌘⇧L locks the vase (a drag leaves it); ⌘' shows the grid.
   Level: H.
7. Lesson 10: the Flecha from Alpha to Beta binds both; "Promover a relação"
   › `inspira` › the diff › confirm: the arrow shows `inspira` at once;
   Projeto Alpha holds `inspira: "[[Projeto Beta]]"`; the edge keeps its
   label and relation. Level: H (the board), A (the note written); E:
   `board-practice.spec.mjs`. Caught: the label stayed invisible until the
   board was opened again (`a51aab2`).
8. Lesson 11: ⌘F `tesouro` finds it, as typed; the view stays put while the
   board saves. Level: H; E: `board-practice.spec.mjs`. Caught: the field
   corrected the word, and every save moved the view back to the first match
   (`a51aab2`).
9. Lesson 12: "Fundo da tela" in the ☰ menu; the board's JSON in Texto.
   Level: H.
10. Lesson 8, pictures: drop a picture on the board (or paste one): a card
    where it was dropped, the file copied into the attachments folder, no
    picture in the canvas JSON; drag a note from the tree onto the board: a
    card, no new tab; "Inserir" in Excalidraw's toolbar opens a menu whose
    "Imagem ou PDF do computador…" picks pictures from the computer; a `.zip`
    dropped says only pictures and PDFs. A picture card shows the picture
    alone, no frame or title. Selected, "Recortar" in the top-right tools
    opens the crop: a corner dragged, "Aplicar" shows that part, the card at
    its proportions, the node's `verso.crop` written and the picture's file
    untouched; "Restaurar original" takes it off. Right-click menus, the
    board's and the window's, never show two lines together. A card
    selected and right-clicked a moment later shows the board's menu
    (`menus.spec.mjs`; caught 2026-10-08: the entered card took the click
    and no menu opened). With the side bar open and the window not
    wide, the search and the Outline in the middle of the footer; on a
    narrower board — the outline open too, a tall narrow window, both side
    bars open — Excalidraw's toolbar at the foot of the board and Verso's
    tools at the top right, apart; every tool always whole. Level: H (drag from the tree and the system's
    chooser), A; E: `board-images.spec.mjs`.
11. Arrows: the arrow tool from a point of one card to a point of another:
    each end stays aimed at its point, on the card's outline (its head
    shows), under the cards, while a card is dragged and when the board
    opens again; from middle to middle, the sides that face each other. The
    file's edge holds the sides it meets and, under `verso`, the points;
    Obsidian draws it from those sides. A rectangle drawn, and an arrow
    from its middle to a picture's middle: the head at that point, over the
    picture; the board closed and opened again, the picture dragged, the
    arrow follows it. With "Setas soltas" on (the
    "Inserir" menu), the same drag leaves a free arrow attached to neither.
    The line tool across a card: one line, drawn over the card as it is
    drawn, never doubled. With the arrow tool held, the hint line under the
    toolbar names ⌘ and "Inserir › Setas soltas" (only the menu on a touch
    screen), and says when Setas soltas is on. Level: H; E:
    `board-arrows.spec.mjs`.

## 10. Settings, help, the command line

1. ⌘,: the sections as note 15 names them; Aparência's options; Terminal e
   agentes: the command's button (Instalar or Substituir) and the MCP
   snippets. Level: H; E: `settings.spec.mjs`, the sections and Aparência.
2. "Relatar problema", in the status bar: the report, "Erros desta sessão:
   nenhum". Level: H; E: `settings.spec.mjs`.
3. The command line on the folder: `verso search <folder> reunião`;
   `verso backlinks <folder> "Projeto Alpha"` (its name, as a link names
   it, or its path); `--unresolved`; `--json`. Level: A. Caught: only a path
   was found (2026-10-01).
4. An agent on the folder through `verso mcp` (note 17): asked which notes
   have the tag `projeto` and what "Tour do Verso" shows, it lists them by
   tag and reads the board's cards and edges; `links` of a note with
   `relacionado: "[[…]]"` names the relation; `query_base` on
   `Projetos.base` gives the table's rows. Nothing in the folder changes.
   Level: S (`crates/verso-cli/tests/mcp.rs`), A (a client: Claude Desktop
   or Claude Code).

## 11. Organizing: stickers, covers, folder pages, order

1. Note 19: its sticker and colour show on its tree row, in its tab and
   above its title. A row whose `sticker:` is no sticker keeps its own icon.
   Level: H; E: `labels.spec.mjs`, "sticker in frontmatter appears in tree
   row and tab" and "a sticker picked from the picker is written as make.md
   writes it, and an unknown one falls back".
2. The sticker beside the title opens the picker: "Ícones" switches tab, the
   search filters, a pick closes it and the file gains `sticker: emoji//…`
   or `sticker: lucide//…`; a swatch writes `color:`. Level: H; E:
   `labels.spec.mjs`, "sticker picker popover opens, switches tabs, searches,
   selects sticker and color".
3. "Adicionar capa", a path of the folder (`assets/diagrama.svg`): the cover
   shows. "Reposicionar", ↓ three times, Enter: `banner_y` changes; again
   with Esc: nothing changes. Level: H (the drag: E, `labels.spec.mjs`,
   "note cover banner displays and drag repositioning updates banner_y"; the
   keys: by hand).
4. A folder's page: its folder note on top, a table of its items below. In
   a folder with no folder note, "Criar nota da pasta". The folder note is
   no row of the tree; the folder's menu, "Abrir nota da pasta", opens it
   (E: `order-pins.spec.mjs`, "a folder's note is not a row of the tree; the
   folder's menu opens it"). Level: H; E:
   `folder-pages.spec.mjs`, "folder page displays folder note, cover banner,
   sticker, and default table". A right click on the page's empty space
   shows the tree's menu — new note, folder, base, board, web page, Mostrar
   no Finder, the paths — every item with its icon (E: `folder-pages.spec.mjs`,
   "a folder page's right click…"). In `assets`, Miniaturas: the PDF shows
   its first page (E: `folder-pages.spec.mjs`, "a PDF shows its first
   page…").
5. Ajustes › Organização › "Nome da nota da pasta": `README` makes
   `Pasta/README.md` the folder's note — its sticker shows on the folder's
   row. Level: H; E: `labels.spec.mjs`, "the folder note name setting names
   the note a folder's labels come from".
6. Order and pins: "Mover para cima" on a row writes the folder note's
   `order:`; "Fixar na pasta" writes `pinned:` and puts the row first;
   "Desafixar da pasta" takes it out; "Ordem alfabética" in a folder's
   menu, or the button beside "Arquivos", sorts the whole tree by name and "Ordem personalizada" brings every
   `order:` back, untouched; dragging a root note writes the root's note, named
   after the open folder. In a folder with no folder note, the first of
   these makes it, with no question, and the status bar says so. Level: H;
   E: `order-pins.spec.mjs`, "pin and unpin via context menu updates folder
   note frontmatter", "pinning in a folder with no folder note creates it,
   with no question", "the menu switches the tree between alphabetical
   and custom order, keeping the custom one", and "the root's notes are ordered by dragging, in the
   root's note" (dragging a row, and ⇧ on the drop: by
   hand).
7. Rename a note named in an `order:` (F2 on its row): the plan shows the
   folder note's line changed, and only it. Level: H (the core's rewrite: U,
   `cargo test -p verso-core`, the `order` tests of `workspace.rs`).
   Renaming a folder renames its folder note: `Team/Team.md` becomes
   `Crew/Crew.md`, and its open tab follows. Level: H; E:
   `order-pins.spec.mjs`, "renaming a folder renames its folder note, and
   its open tab follows".
8. "Ocultar da árvore" takes the row away; Ajustes › Organização › "Itens
   ocultos da árvore" lists it, and "Mostrar" brings it back. Level: H; E:
   `order-pins.spec.mjs`, "hide from tree removes item from tree and unhide
   in settings restores it".
9. The embed in note 19: a click on its text edits it in place; what is
    typed goes to `projetos/Pesquisa e Descobertas.md`. With the file changed
    elsewhere, the conflict shows; switching mode then asks, and "Cancelar"
    keeps the text. Level: H; E: `flow.spec.mjs`, "typing inside an embed in
    reading view changes the embedded file only (ADR 0060 S4)", "conflict on
    the embedded file shows two versions" and "switching mode with an embed
    in conflict asks, and a no keeps the text typed".
10. `:foguete` in the editor suggests 🚀; Enter inserts it. Level: H; E:
    `flow.spec.mjs`, "emoji trigger with : opens completion and inserts emoji
    (ADR 0060 E4)" (the arrows and Esc: by hand).
11. Focuses (ADR 0062): the right panel's "Focos" tab lists every focus, with
    Início first. Choosing a focus shows the file tree from its paths, and the
    heading shows the active focus (e.g. `ARQUIVOS · Projetos`). The context menu
    on a tree item offers "Criar foco aqui" and "Adicionar ao foco…". "Trocar foco"
    in the command palette switches focuses. If `.space/waypoints.json` is present
    and sync is enabled, changes write back preserving untouched bytes; if disabled
    or unknown format, focuses stay read-only or in Verso settings. Level: H; E:
    `focuses.spec.mjs`.

## 12. The end

1. The log after the line noted: no `ERROR`. The app's stderr: empty. The
   console: nothing red. Level: A; E: every test, in the harness.
2. Put back what a step changed in the shared settings (the right panel's
   tab, the palette, the theme).
