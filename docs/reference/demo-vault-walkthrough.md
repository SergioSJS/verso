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

## 3. Writing and reading notes

1. Note 01 in Leitura: the callout with its own title, the folded callout
   that opens on a click, the nested callout, the footnote, the hidden
   `%%` comment, the tag as a pill, KaTeX, the table. Level: H.
2. Note 11 in Editar: on an empty line, `/` opens the menu with Básico,
   Listas, Destaques and Inserir; typing `data` leaves "Data de hoje", and
   Enter writes today's date; ⌘Z takes it back. Level: H; E:
   `notes.spec.mjs` (the date written at the end, and gone after ⌘Z).
3. Note 02: every link leads to its note, a `#heading` to its heading; the
   embed shows "Editar ao lado". Level: S (the links), H.
4. Note 06 in Leitura: `![Diagrama|320](assets/diagrama.svg)` is shown
   320 px wide, from the folder; dragging its corner writes the new size on
   that picture, and the example of it in the heading's code is left as it
   is. Level: H; E: `notes.spec.mjs`. Caught: the picture was asked of the
   window's own address before the folder's, drawn 0 px wide (the size after
   an alt text was not read), and its resize rewrote the example
   (2026-10-01).
5. A picture whose file name has an accent (`assets/gráfico.svg`) shows from
   the folder. Level: H; E: `notes.spec.mjs`. Caught: the renderer
   percent-encodes the address, and the window asked the core for
   `gr%C3%A1fico` (2026-10-01).
6. A note changed on disk while text typed in its tab is unsaved: both
   versions are shown, and the disk's stays (invariant 11). Level: H; E:
   `notes.spec.mjs`.

## 4. Organizing: properties, bases, daily notes

1. `Projetos.base`: the five views (table, kanban, Cards, list, calendar);
   only the notes of `projetos/`; the formula's column and the budget's sum;
   the kanban in a column per status; the calendar back in September 2026
   shows the three projects. Level: H. Caught: with no filter the base
   listed the whole vault (`26c3b06`).
2. Note 04: the embedded view and the `base` block listing the daily notes.
   Level: H.
3. ⌘D: `Diário/<today>.md` is made from `Templates/Diário.md`, `{{title}}`
   and `{{date}}` filled. Level: S (the folders), H; E: `notes.spec.mjs`.
   Caught: the notes said `daily/` and `templates/`, which the app does not
   use by default (`26c3b06`).
4. Right panel (⌘⌥→) › Calendário: dots on 24 and 25 September and on today.
   Level: H; E: `notes.spec.mjs`.

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
   Caught: after a click, F2 did nothing (2026-10-01).
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

## 7. The web

1. `Web/jsoncanvas.org.md`: the bar (back, forward, reload, the address);
   "Ver página" and "Ver nota" switch. Level: A.
2. `Web/Cartão de visita.html`: the page with its own style, in Página;
   its source in Fonte. Level: A. Caught: the page was blank — served as
   bytes, which `nosniff` kept the frame from showing (`a51aab2`).
3. "Desenho do Excalidraw": "Converter em board" shows the board to be made,
   and "Criar o board" makes `Desenho do Excalidraw.canvas` beside it.
   Level: A.
4. In `Web/jsoncanvas.org.md`'s page, and in a link opened in its own
   window: type in a field of the site, then ⌘A, ⌘Z and ⌘⇧Z act in that
   field, once each, and nothing in the note behind changes. Level: A (the
   site's web view is the host's; review `board.md`, second reading,
   finding 1).

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

## 11. The end

1. The log after the line noted: no `ERROR`. The app's stderr: empty. The
   console: nothing red. Level: A; E: every test, in the harness.
2. Put back what a step changed in the shared settings (the right panel's
   tab, the palette, the theme).
