# The demo vault walkthrough

- Date: 2026-10-01
- Source: [ADR 0058](../adr/0058-demo-vault-as-tutorial.md), point 6; the
  maintainer, in session, on 2026-10-01: "registre os passos a passos de
  testes realizados para serem automatizados de alguma forma pra rodar
  localmente quando fizer sentido" (write down the tests' steps, to be
  automated somehow and run locally when it makes sense).
- Status: the steps as followed on 2026-10-01; each feature that changes what
  a user sees adds its own.

The tutorial is followed in the app before a pull request that changes what a
user sees, as a new user would follow it: from an empty folder, with the app's
log and the window's console open. This page is that walk, step by step: what
to do, what must happen, how it is checked, and how far it can run by machine.
A step that fails is a bug of the app or of the tutorial, fixed in the same
pull request; the last line of a step names the bug it caught the first time.

## How to run it

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
- **U** — a unit test, runs now: `npm test` in `app/ui`, `cargo test`.
- **H** — the window's own behaviour, the core aside: it could run in the
  browser harness (`app/ui/harness.html`, the core mocked), driven by a
  browser automation tool.
- **A** — needs the real app: the native menu, the `verso:` protocol, the
  files on disk, the command line.

How the H and A steps run by machine is `[OPEN]`
([ADR 0058](../adr/0058-demo-vault-as-tutorial.md)); until then they are
followed by hand.

## 1. Import into an empty folder

1. Palette (⌘⇧P) › "Importar cofre de exemplo" › confirm. Expect: every file
   of `demo-vault/`, byte for byte, in `Diário/`, `Templates/`, `Web/`,
   `assets/` and `projetos/` — no `daily/`, no `templates/`; the welcome note
   opens. Check: compare the folder's file list and bytes with `demo-vault/`.
   Level: S (the embed is the folder), H (the import). Caught: the import
   created the folders the demo no longer has, and on a case-insensitive disk
   put `Templates/` into `templates/` (`a51aab2`).
2. The welcome note shows the "Comece pelo tour" callout with its two links.
   Level: S (the links), H.

## 2. The tour

1. In the welcome note, in Editar, ⌘-click "Tour do Verso" (a plain click
   puts the caret in the link). Expect: the board opens with every stop in
   rows of three, numbered at their top right, a dashed trail joining them in
   order; every drawn text whole. The file is unchanged. Check: the screen;
   `cmp` of the file before and after. Level: H. Caught: drawn text cut
   while its font loaded (`a147e8e`).
2. Sumário: the stops are listed in their numbers' order; a click on each
   shows it whole and legible, its notes live on their cards. Level: H.
   Caught: a group was only brought to the middle at 10% (`a147e8e`); the
   stops were laid out in a snake while the outline lists them row by row
   (`26c3b06`).
3. ⌘W closes the tab and the app stays open; ⌘⇧T reopens it. Level: A.
   Caught: ⌘W closed the window, and with one window open quit the app
   (`a51aab2`).

## 3. Writing and reading notes

1. Note 01 in Leitura: the callout with its own title, the folded callout
   that opens on a click, the nested callout, the footnote, the hidden
   `%%` comment, the tag as a pill, KaTeX, the table. Level: H.
2. Note 11 in Editar: on an empty line, `/` opens the menu with Básico,
   Listas, Destaques and Inserir; typing `data` leaves "Data de hoje", and
   Enter writes today's date; ⌘Z takes it back. Level: H.
3. Note 02: every link leads to its note, a `#heading` to its heading; the
   embed shows "Editar ao lado". Level: S (the links), H.

## 4. Organizing: properties, bases, daily notes

1. `Projetos.base`: the five views (table, kanban, Cards, list, calendar);
   only the notes of `projetos/`; the formula's column and the budget's sum;
   the kanban in a column per status; the calendar back in September 2026
   shows the three projects. Level: H. Caught: with no filter the base
   listed the whole vault (`26c3b06`).
2. Note 04: the embedded view and the `base` block listing the daily notes.
   Level: H.
3. ⌘D: `Diário/<today>.md` is made from `Templates/Diário.md`, `{{title}}`
   and `{{date}}` filled. Level: S (the folders), H. Caught: the notes said
   `daily/` and `templates/`, which the app does not use by default
   (`26c3b06`).
4. Right panel (⌘⌥→) › Calendário: dots on 24 and 25 September and on today.
   Level: H.

## 5. Finding

1. ⌘K `tag:projeto`: the three projects. Level: A (the core's search).
2. With the focus outside the editor, ⌘⇧H: "Localizar e substituir no
   cofre…"; ✓ shows the plan, note by note; "Deixar como está" writes
   nothing. Level: A.
3. "Grafo do cofre": the graph and its controls as note 05 names them.
   Level: H.

## 6. Files

1. Click the title of an open note and rename it: the plan lists every note
   and board that points to it; "Atualizar links" rewrites them — the boards'
   cards and a relation in a frontmatter included — and the backlinks panel
   shows them at once. Level: A. Caught: the renamed note showed no
   backlinks until reopened (`a51aab2`).
2. The PDF: its bar as note 06 names it; select a line, "Citar seleção nas
   anotações": `assets/manual-verso — Anotações.md` holds the quote, linked
   to its page. Level: A.
3. F2 renames the row of the tree that has the keyboard focus (reached with
   Tab). Seen on 2026-10-01, not decided: a click on a row opens the note and
   takes the focus, so F2 right after a click does nothing, and the tree has
   no arrow keys between its rows. Level: H.

## 7. The web

1. `Web/jsoncanvas.org.md`: the bar (back, forward, reload, the address);
   "Ver página" and "Ver nota" switch. Level: A.
2. `Web/Cartão de visita.html`: the page with its own style, in Página;
   its source in Fonte. Level: A. Caught: the page was blank — served as
   bytes, which `nosniff` kept the frame from showing (`a51aab2`).
3. "Desenho do Excalidraw": "Converter em board" shows the board to be made,
   and "Criar o board" makes `Desenho do Excalidraw.canvas` beside it.
   Level: A.

## 8. The board's file

1. Opening a board writes nothing; moving a card changes only its `x` and
   `y`. Level: U (the model), A.
2. A card's sharp corners and an elbow arrow come back as they were after the
   board is opened again, the arrow bound to its cards. Level: U. Caught:
   the panel's style was not saved (`c1a754b`).

## 9. The practice board

1. The outline lists the lessons in order; each is legible when shown whole.
   Level: H.
2. Lesson 4: ⌘⌥C on the red balloon, ⌘⌥V on another: the style is pasted.
   Level: H.
3. Lesson 6: ⌘-drag round the robot, ⌘G, drag: it moves whole. Select the
   fruit, right click › "Envolver a seleção num quadro": a frame "Frame";
   double click its name, rename it: the outline says the new name; the file
   holds the group with it. Level: U (the outline), H. Caught: the outline
   kept the old name (`a51aab2`).
4. Lesson 7: ⌘⌥] brings the circle to the front, ⌘⌥[ sends the square to the
   back; ⌘] and ⌘[ one step. Level: H. Caught: ⌘⌥] and ⌘⌥[ did nothing on a
   Mac (`a51aab2`).
5. Lesson 8: "Nota ou arquivo" › the welcome note: its card, painted with
   Fundo; double click the text card: "Texto do cartão (Markdown)"; the
   edit is saved in the file. Level: H.
6. Lesson 9: ⌘⇧L locks the vase (a drag leaves it); ⌘' shows the grid.
   Level: H.
7. Lesson 10: the Flecha from Alpha to Beta binds both; "Promover a relação"
   › `inspira` › the diff › confirm: the arrow shows `inspira` at once;
   Projeto Alpha holds `inspira: "[[Projeto Beta]]"`; the edge keeps its
   label and relation. Level: H (the board), A (the note written). Caught:
   the label stayed invisible until the board was opened again (`a51aab2`).
8. Lesson 11: ⌘F `tesouro` finds it, as typed; the view stays put while the
   board saves. Level: H. Caught: the field corrected the word, and every save
   moved the view back to the first match (`a51aab2`).
9. Lesson 12: "Fundo da tela" in the ☰ menu; the board's JSON in Texto.
   Level: H.

## 10. Settings, help, the command line

1. ⌘,: the sections as note 15 names them; Aparência's options; Terminal e
   agentes: the command's button (Instalar or Substituir) and the MCP
   snippets. Level: H.
2. "Relatar problema", in the status bar: the report, "Erros desta sessão:
   nenhum". Level: H.
3. The command line on the folder: `verso search <folder> reunião`;
   `verso backlinks <folder> "projetos/Projeto Alpha"` (the note's path —
   its name alone is not found); `--unresolved`; `--json`. Level: A.

## 11. The end

1. The log after the line noted: no `ERROR`. The app's stderr: empty. The
   console: nothing red. Level: A.
2. Put back what a step changed in the shared settings (the right panel's
   tab, the palette, the theme).
