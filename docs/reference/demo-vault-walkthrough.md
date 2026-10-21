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
   what is missing is created, a file that is the untouched copy of an
   earlier version's demo (its bytes are one the demo carries the hash of)
   is replaced by the current one, the untouched old copy of a note the
   tutorial renamed (`24 - Dados e Tabelas Sorteadas.md`, now 25) goes to
   the folder's trash — restorable — once the current note is there, a
   file with other content — the
   person's edit — is kept as it is and named, the toast and the status
   bar say how many were created, updated and kept, and the app's log has
   `import demo:` lines saying how many were created, updated, kept and
   failed. Level: H; E: `import.spec.mjs`, `test/demoImport.test.mjs`.
   Caught: an import that wrote nothing said "imported" and left no trace;
   a folder imported from an older demo never got the tutorial's new
   sections ("0 created, 28 kept").

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
7. No title bar (ADR 0072, note 13), on macOS, Windows and Linux: the
   window's buttons — macOS's at the top left, the app's own at the top
   right on Windows and Linux — never cover a tab, a button or the folder's name, with the side
   bars open or closed, two panes, a narrow window; the empty part of the
   tab bar, the side bar's head and the ribbon drag the window, and a double
   click there maximizes it (it no longer makes a new note); on Windows the
   buttons minimize, maximize and restore, and close with the tabs saved;
   a note's popout keeps its title bar. Level: H; E: `frame.spec.mjs`
   (forced frames); A (the app on macOS and on Windows: dragging, snapping
   to an edge, Win+arrows, full screen on the Mac).

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
   versions are shown, and the disk's stays (invariant 11); *Guardar os
   dois* keeps the disk's under the name and the tab's text in a copy
   beside it, named as sync names a conflict's copy. Level: H; E:
   `notes.spec.mjs` (a text file's, `tabs.spec.mjs`).
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
13. Note 02, "Prévia ao Passar o Mouse" ([ADR
    0085](../adr/0085-hover-preview.md)): in Leitura, the pointer resting
    half a second on "as fórmulas do Guia de Sintaxe" shows a card with
    note 01, its heading marked at the top; away from the link and the
    card, it goes; a click in it opens note 01. "a descoberta da escrita
    atômica" shows the research note with the block `^atomica` marked;
    "Nova Ideia de Projeto" says no note answers yet, and no note is made.
    In Editar a plain hover shows nothing, and ⌘ (Ctrl) pressed shows the
    card. "Ver a prévia do link sob o cursor" from the palette, the cursor
    in a link: the card is a dialog with the focus, and Esc gives the focus
    back. Settings › Editor › "Prévia ao passar o mouse" off: no card on a
    hover, the command still opens one. A row of the Links panel, a node of
    the graph and a card's name on "Board de Demonstração" show their
    notes. Level: H; E: `preview.spec.mjs`; U: `test/preview.test.mjs`.
14. Note 02, "Menções sem link" ([ADR 0089](../adr/0089-linking-unlinked-mentions.md)):
    open "Lia Torres" (⌘P), right panel › Links: under "Menções sem link",
    the row of note 02 with the words around the name; "Linkar" writes
    `[[Lia Torres]]` into the "Experimente" callout and the row goes, the
    note now among the backlinks. On a seeded folder: a mention in another
    case or an alias is written `[[Name|text]]`; "Linkar todas" shows the
    plan as a diff, a list a keyboard reaches, and skips by name a note
    changed meanwhile; a mention that moved is refused and the list drawn
    again; in a note open in a tab, ⌘Z undoes the link; a note live with
    someone else takes it through its room; a reader sees no button and no
    mention inside a secret block. Level: S (the tutorial note), U
    (`cargo test -p verso-core mentions`, `test/mentionLink.test.mjs`), H;
    E: `mentions.spec.mjs`. The same note's "Sugestões enquanto escrevo"
    (item 5, revised 2026-10-15): Settings › Editor › "Sugerir links
    enquanto escrevo" is off; turned on, in a note of your own typing a
    note's whole name (or an alias) shows "Ligar a [[Nome]]" at the cursor,
    Tab or Enter writes the link, Esc or typing on dismisses it and the name
    is not offered again in that paragraph; nothing shows inside code, a
    link or the properties header, nor for the note itself; on a phone the
    chip is tapped. Revised 2026-10-20: typing the start of a name (three
    letters, a capital first word: "Por", "Porto C") lists up to five notes
    and aliases that begin with it, arrows choose, Tab or Enter writes the
    link over the typed words, Esc dismisses the list for that word; the
    whole-name chip stays after a space or a comma until the next word
    starts, and Tab then links the name without the space. And, on by
    default (Settings › Editor › "Citar uma nota com @"), `@` at the start
    of a word opens the `[[` note list: choosing writes `[[Name]]` over the
    `@` and what was typed, Esc leaves the text, `fulano@mail` and code,
    links, math and tags never open it; the `[[` list wins over the `@`
    list, which wins over the partial list. Level: S, U
    (`test/linkSuggest.test.mjs`, `test/linkSuggestPartial.test.mjs`, with
    the 10,000-note benchmark), H; E: `typing-links.spec.mjs`.
15. Note 24 (ADR 0088): in Leitura each `dice:` code is a die button named
    "Rolar 1d20+5" and so on; a click, or Tab to it and Enter, shows the
    total, each die and what was added in a card beside it, with "Rolar de
    novo", and the status region says it (*1d20+5: 17 — 12 mais 5*);
    `dice: 1d20*2` stays code. "Quem aparece na estrada?" gives one row of
    the `d6` table, its link to Capitão Ruy opening with a click; "O tempo
    hoje" one item of the list. In Editar the dice off the caret's line are
    dice too. The note in Fonte afterwards: its text as before, nothing
    written. ⌘⇧P › "Rolar dados…": `2d6+1` and Enter rolls; `1d20*2` says
    Verso does not read it. `dice: 3d6!` rolls one more die for each 6,
    and `dice: d%` is a d100. Level: H; E: `dice.spec.mjs`; U:
    `test/dice.test.mjs`.
16. Note 24, "O segredo do mestre" ([ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md)):
    in Leitura the `[!secret]` callout has a lock and *Visível para quem
    tiver o arquivo* in its title (a folder of this computer hides
    nothing). *Ver como leitor*, beside Ler and Editar, shows the note
    without the block, a strip saying *Vendo como um leitor* with *Ver a
    nota inteira*, which brings it back; Editar leaves the reader's view.
    In Editar, `/` › Destaques › *Segredo* writes `> [!secret] ` and says
    it is no encryption. A note with no secret block offers no toggle.
    Opening and toggling write nothing. Level: H; E: `secret.spec.mjs`;
    U: `test/secret.test.mjs`.

## 4. Organizing: properties, bases, daily notes

1. `Projetos.base`: the six views (table, kanban, Cards, list, calendar, map);
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
   Projeto, Semanal; "Nota de Reunião" fills the note, `{{title}}` and `{{date}}`
   replaced; Em branco, Esc or typing put the list away and write nothing;
   the arrows move along the list. A folder whose note sets
   `items_template` makes the note from it, with no list. Level: H; E:
   `templates.spec.mjs`.
7. The infobox (note 21, "O Infobox", ADR 0086): `Lugares/Porto Cinzento`
   shows its properties as a card at the right of the text, in the
   reading view and in Edit mode — the harbour's picture at its head (a
   screen reader reads "O Porto Cinzento visto do farol", the link's
   alias), "Tipo: Lugar", Mapa, Região, Perigo, Habitantes and Governante
   in that order, "Outras propriedades (2)" folded below; opening it
   writes nothing. A habitant is a link that opens the person's note;
   "Adicionar link…" offers the folder's notes and writes the one picked
   as a quoted wikilink. A narrow window (or a split pane) puts the card
   above the text, folded to the picture and three properties, with
   "Mostrar todas as propriedades". In Edit mode a value changed in the
   card reaches the file. Level: S (`crates/verso-core/tests/typed.rs`,
   `fixtures/schema/infobox`), H; E: `infobox.spec.mjs`,
   `test/infobox.test.mjs`.
8. The map (note 04, "O Mapa", ADR 0094): *Projetos.base › Mapa* draws the
   world outline shipped with the app and three pins — São Paulo, Lisbon,
   Recife; a pin's click opens its project, resting on it shows the note;
   below, "Lugares do mapa" lists the three in the view's order with their
   coordinates, each reached by Tab and opened with Enter. Nothing is asked
   of the network. *Ajustes › Fundo dos mapas* offers OpenFreeMap by name,
   off; a base naming its own `mapTiles` says "Esta base pede o fundo do
   mapa a …" and fetches nothing until *Aprovar*. A right click on the map:
   "Copiar coordenadas", "Usar como centro da visão", "Usar este zoom na
   visão". Level: S (`crates/verso-core/tests/demo_base.rs`,
   `tests_map_tiles.rs` of the server), H; E: `base-map.spec.mjs`; U:
   `test/baseMap.test.mjs`.
9. Regular expressions (note 04, "Expressões Regulares nas Fórmulas"): the
   *Mês* column of *Todos os Projetos* shows `09/2026` for the three
   projects — evaluated by the core, not by the harness, which leaves a
   formula empty. Level: S (`crates/verso-core/src/bases/tests_regex.rs`,
   `crates/verso-core/tests/demo_base.rs`), A.
10. The embedded *Todos os Projetos* of note 04 has the view's tools; a
    sort added there is written to `Projetos.base` and the rest of the file
    is kept. `html()` in a base draws HTML, cleaned (no script, no
    `onerror`). Level: H; E: `base-map.spec.mjs`.
11. Periodic notes (note 07, "A Semana, o Mês, o Trimestre e o Ano", ADR
   0093): "Nota desta semana" in the palette makes `Diário/<gggg-[W]ww>.md`
   from `Templates/Semanal.md` — `{{date}}` the week's Sunday, the seven
   days by `{{date+Nd:…}}`, `{{saturday:DD/MM}}` — and "Nota deste mês"
   makes `Diário/<YYYY-MM>.md` with its name as a heading; the quarter and
   the year are not offered until turned on in Settings › Notas
   periódicas. In `2026-W42`, "Nota periódica anterior" goes to `2026-W39`,
   skipping the weeks with no note, and says when there is none before;
   the tab's menu has both. In the right panel's Calendário, the "Sem."
   column numbers the weeks — "Semana 42 de 2026" makes or opens its note,
   week 39 of September is marked —, the month's name makes or opens the
   month's note; ← from a week's first day reaches its number. Settings ›
   Notas periódicas says "Desta máquina" until the first change, which
   writes `periodic` into `.verso/settings.json` with the daily folder;
   a format with a token Verso does not read (`HH`) is refused, naming it,
   and nothing is written; a changed format says the notes of the earlier
   one are no longer found. A folder with `.obsidian/daily-notes.json` is
   offered "Usar os ajustes do Obsidian", which writes them into the
   folder's settings and leaves `.obsidian/` as it was. A reader opens
   week 39 and is told week 42 does not exist yet. Level: S
   (`crates/verso-core/tests/periodic.rs`, `crates/verso-fs/src/obsidian.rs`,
   `app/src-tauri/src/tests_periodic.rs`), U (`test/periodic.test.mjs`), H;
   E: `periodic.spec.mjs`. A in the app: the two Obsidian files read from
   disk, a placeholder of them, and two synced devices making the same week
   offline (`docs/reference/manual-checks.md`).

## 5. Finding

1. ⌘K `tag:projeto`: the two projects with the tag, and the template
   `Novo Projeto`, which carries it too. Level: A (the core's search).
2. With the focus outside the editor, ⌘⇧H: "Localizar e substituir no
   cofre…"; ✓ shows the plan, note by note; "Deixar como está" writes
   nothing. Level: A.
3. "Grafo do cofre": the graph and its controls as note 05 names them.
   Level: H.
4. ⌘K `busca navegação`: note 12 comes first, found by its file name,
   before the notes that only say the words; the × at the end of the field
   clears the words and the tree comes back, as Esc does. Level: A (the
   core's search); E: `search.spec.mjs`.

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
   Beside `Nota`, a new note `nota` is not made either, and the status
   bar says a Mac or Windows would keep only one of the two; renaming
   `Nota` to `nota` works (spec Q8, decided 2026-10-12). Level: A (the
   harness does not refuse it); U: `crates/verso-fs/tests/ops.rs`,
   `crates/verso-core/tests/workspace/rename.rs`.
9. Note 14, "A Visão de Pasta": open a folder with its chevron and close
   another; open the app again — the tree is as it was left. A folder of
   thousands of notes opens with its top-level folders closed. Level: H;
   E: `tree-big.spec.mjs` (`?vault=big`, both engines), which also pins
   the rows' cost: no inline SVG, four elements a row, a closed folder's
   rows let go, one row marked as the open note, and a long name ending in
   "…" inside its row. Tab into the tree: the focus ring shows on all four
   sides of a row, inside it (by eye, both engines; caught 2026-10-08: the
   folders' containment cut it).
10. Note 14, "Arrastar e Soltar", on a touch screen: a swipe over the tree
   scrolls it and moves nothing; a finger held on a row and lifted opens
   its menu; held and then moved, it drags the row into a folder. Level: H
   (touch moves only in Chromium); E: `touch.spec.mjs`.
11. Note 14, "A Lixeira" ([ADR 0080](../adr/0080-the-trash-with-expiry-and-restore.md)):
   delete a note, make another with its name, and open the trash from the
   palette ("Abrir a lixeira"), from the tree's right-click on empty space,
   or from *Ajustes › Arquivos e links*, where the trash shows beside the
   folder's space: the list has a header row, the note with when and where
   it was; "Restaurar" puts it beside the new one as `<nota> (restaurado
   <data>).md` and says so; *Manter arquivos apagados por* "7 dias" removes
   at once what was deleted longer ago; "Apagar agora" and "Esvaziar a
   lixeira" ask in the page with the size. Level: H; E: `trash.spec.mjs`
   (also at a phone's and a tablet's size); S:
   `crates/verso-core/tests/trash.rs` (the sweep's guardrail, the quota's
   guard), `crates/verso-fs/src/trashbin/tests.rs` (no symlink followed);
   A: the files on disk and the log's lines (`manual-checks.md`).
12. Note 14, "O Histórico de Versões" ([ADR 0091](../adr/0091-version-history.md)):
   open a note, type a line, wait for its save, and open *Histórico de
   versões* from the palette, the tab's menu, the tree's menu or the clock
   in the status bar: the list has a header row, the edit named *(este
   computador)* at this computer's time, the note as it was below it;
   choose the older one — the diff shows the line typed as `- `; "a versão
   anterior" says the first has none; *Restaurar esta versão* asks, then
   says *Versão de … restaurada.*, and the editor shows the old text, a
   *restauração* on top of the list. Changed by another program while the
   diff is open, the restore writes nothing and says so. *Copiar como nova
   nota* makes `<nota> (versão <data> <hora>).md` beside it. Level: H; E:
   `history.spec.mjs` (also the reader without a history, a restore over a
   live note through its room, a synced folder with its server out of
   reach, and at a phone's and a tablet's size); U:
   `app/ui/test/history.test.mjs`; S: `crates/verso-core/tests/history.rs`
   (the guardrail: a restore writes exactly a version's bytes, thinning
   never removes the newest, nothing lands in the folder),
   `crates/verso-index/src/history_tests.rs` (thinning with a moved clock),
   `crates/verso-server/src/tests_history.rs` (the server's: roles, rooms,
   renames, the console); A: the history file outside the folder and a
   room's restore in two browsers (`manual-checks.md`).

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
   shown and nothing is written over the disk; *Guardar os dois* puts this
   board in a copy beside it. Level: H; E:
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
    board's and the window's, never show two lines together. A note card
    selected and right-clicked a moment later shows the board's menu, and a
    picture card the window's picture menu
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

12. Lesson 13, maps (ADR 0090): select the picture, "Usar como mapa": it is
    locked (a drag over it pans nothing of the map), at the back, and the
    file holds `"verso": {"map": true, "locked": true}`; the outline's
    "Mapas" lists it with "Deixar de usar como mapa", which takes the three
    off. Drag "Porto Cinzento" from the tree onto the picture: a pin, in the
    picture's group, never a card; "Fixar uma nota aqui…" does the same in the
    middle of the view. Zoom out and in: the pin keeps its size and stays on
    its point; a click opens the note; the pointer rested on it shows the
    note in a card, and a finger held still on a phone does too; Tab walks
    the pins and Enter opens one, Delete removes it (⌘Z brings it back); the
    outline lists them in reading order as links. "Enviar para trás" and "Trazer para a frente" on any card reorder
    it in the file. A PNG of 16,000 pixels a side as a map: "Preparando o
    mapa…", then the tiles in view, never the whole picture (the app's log
    open; the memory of the window stays small); a JPEG of that size is drawn
    whole, with the note that says to save it as a PNG. On a server: a
    secret pin shows the lock "Oculto para leitores", "Ver como leitor" draws
    the board without it and nothing is written, a reader account sees no
    secret pin in the board, the search, the backlinks of its note or the
    synced file, and an exported picture asks about the secret cards. Level:
    H (the pins, the tools, the tiles on the harness's tile answers, the
    reader's board on its projection), A (the real tiles, the real server,
    a phone); E: `maps.spec.mjs`.
13. Lesson 14, a web page on a card (ADR 0057 point 10, ADR 0056): the
    card of `example.com` asks first ("Permitir sempre"); the click checks
    the site, and a site that forbids framing says so in the card before it
    is approved ("Permitir mesmo assim" goes on). Approved, the page shows
    in a frame below a head with the origin; the board's drag and zoom keep
    the pointer until the card is entered (a click in its middle, or the
    "Interagir com a página" button), then the page scrolls and takes the
    clicks; "Sair da página", a click outside, or Esc with the focus on the
    head returns to the board. "Inserir › Página web…" asks for an address
    and adds a `link` node with `verso.page`; a plain link card is switched
    with "Mostrar página" / "Mostrar como link". A site that refuses shows
    "Este site não permite ser incorporado" and a link to a tab; the native
    clipped web view is never used in a board. The image export draws the
    card as its box with the origin. In a note: approving a site that
    forbids framing shows the warning first, worded for what this system
    does with it. Level: H (the card, the warning, the file), A (the frame
    inside the board's zoom and the card's clipping in WKWebView, WebView2
    and WebKitGTK; the real headers of a real site); E:
    `board-web-card.spec.mjs`, `web-embed.spec.mjs`.

## 10. Settings, help, the command line

1. ⌘,: the sections as note 15 names them; Aparência's options; Terminal e
   agentes: the command's button (Instalar or Substituir; on Windows no
   button — verso.exe comes with the app) and the MCP snippets, which show
   the command the host would write; without Claude Desktop, "Baixar o
   Claude Desktop" opens its download page in the browser; Aparência's
   *Tom do escuro* changes the dark theme's paper (Suave, Profundo,
   Penumbra), and the ribbon's buttons each have a switch, the gear none.
   Level: H; E: `settings.spec.mjs`, the sections and Aparência;
   `dark-tone.spec.mjs`, every palette and tone at 4.5:1 or more;
   `ribbon.spec.mjs`, a hidden button brought back.
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
5. `verso <another folder>` with the app open (note 17): the folder opens
   in a window of its own, in the same app — one Verso in the Dock or the
   taskbar, never a second app. Level: S (`a_second_launch_hands_its_folder_to_the_running_app`,
   the host's tests), A (the installed app, on macOS and Windows). Caught
   2026-10-08: on macOS a second app started, with no window.
6. "Um servidor para todo o Verso" in Terminal e agentes (note 17): the
   switch "Esta pasta é visível para agentes" appears off; the snippets and
   the entry "Adicionar ao Claude Desktop" shows say `mcp --all`. With the
   folder marked, an agent's `list_folders` names it and its tools read it
   by `folder`; unmarked, it is gone from the list. Level: H; E:
   `settings.spec.mjs`; S (`the_server_for_all_of_verso_reads_only_the_visible_folders`);
   A (Claude Desktop, with the app closed).
7. An update (note 18): from an installed version older than the newest
   release, Ajustes › Geral › Versão › "Verificar atualizações", then
   "Baixar e atualizar": the file's checksum and its signature are checked
   before anything is installed; a file whose signature is missing or does
   not verify installs nothing and says so. "Ver notas da versão" shows
   that release's news in the window's language, as plain lines — never
   the release page's download tables. A second folder of the same
   name added to Claude Desktop (note 17) gets `verso-<parent>-<name>`.
   Level: S (`an_update_installs_only_with_its_signature`,
   `a_folder_of_a_name_already_added_takes_its_parent_s_name`); U
   (`test/updateNews.test.mjs`); A (the first signed release, on macOS and
   Windows).
8. On Linux (note 17): the `.deb` installs `verso-app` and `verso` in
   /usr/bin, and Terminal e agentes says the command came with the
   package; an AppImage's "Instalar" puts `verso` in `~/.local/bin`; "Mostrar
   no gerenciador de arquivos" selects the file. Level: S
   (`scripts/check-linux-vm.sh --install`, the app opened on Ubuntu's
   desktop; `--webkit`, the suite on Linux's WebKit); A (Debian, Fedora,
   the AppImage).
9. The folder's settings (note 15, "Da pasta ou desta máquina"; [ADR
   0070](../adr/0070-what-travels-with-the-folder.md) items 1–2): in a
   folder just imported, Ajustes › Arquivos e links › "Ignorar pastas de
   build" says *Desta máquina*, and the folder holds no `.verso/`;
   turned off, it says *Da pasta* and `.verso/settings.json` appears with
   `"ignoreBuildDirs": false`; a star on a note adds it to `bookmarks`
   there; Organização › "Nome da nota da pasta" and "Favoritos" say *Da
   pasta* too. In a folder whose bookmarks this computer kept before, the
   first opening moves them into the file, once. Level: H; E:
   `folder-settings.spec.mjs`; U (`cargo test -p verso-core --test
   folder_settings`; the host's `tests_sync.rs`, "the folder's settings
   cross like a file and a conflict keeps both", against a real server;
   `npm test`'s `folderLayer.test.mjs`); A (two computers syncing one
   folder, by hand). A reader of a server's folder stars a note on this
   computer: "Favoritos" says *Desta máquina* for them, and the folder's
   file is not changed (decided 2026-10-12). Level: U (`npm test`'s
   `folderLayer.test.mjs`; `crates/verso-server/src/tests.rs`, "an
   invited reader"); A.
10. Notifications (note 18, "Notificações"; [ADR
    0084](../adr/0084-notifications-in-the-window.md)): a sync that fails
    is said once in a toast at the bottom right — "A sincronização
    falhou", its level a word and a mark — and again only when it is back,
    whose toast takes its place in the list; an error is announced at
    once, the rest politely. Level: H; E: `notify.spec.mjs`, "a sync that
    fails is said once".
11. The toasts: three at most, the newest on top; information leaves after
    6 s unless the pointer is over it; a warning stays; the keyboard
    reaches a toast and Escape closes it, the focus going back where it
    was; a toast never takes the focus. With Settings open a toast stays
    above it and its action works. On a phone the toasts are at the top,
    the whole width but the margins. Level: H; E: `notify.spec.mjs`, "the
    toasts" and "toasts sit above Settings" (phone and tablet too).
12. The bell, before "Relatar problema" (on a phone, at the top of the
    pane): named "Notificações" or "n notificações não lidas"; it opens
    the centre, as the palette's "Notificações" does — newest first, each
    with its time in the computer's zone and its kind; opened, everything
    is read; "Limpar" empties it, and a cleared failure is not said again
    until it changes. Level: H; E: `notify.spec.mjs`, "the bell" (phone
    and tablet too).
13. Ajustes › Notificações: one row per kind, each "Aviso e lista" at
    first; "Só na lista" lists without a toast, "Desligado" neither, and
    the status bar still says the sync's state; the choice is kept in the
    window's settings, with the account on a server. Level: H; E:
    `notify.spec.mjs`, "each kind as chosen".
14. Each kind from its source: a window on a server's folder dropped and
    back once each, a revoked share said as a revocation and never as
    "A conexão com o servidor caiu", a session ended with "Ir para
    Servidores"; a conflict copy and a live room's conflict once; an
    update with "Baixar e atualizar" and "Ver nos Ajustes", once per
    version, checked again after 24 h; the quota at 90 % once, again only
    after a measure at the opening or a day later finds it under 90 %; the trash's "n itens saem da lixeira em até 3
    dias" at the folder's opening, once a day, with "Abrir a lixeira";
    someone joining the note, not leaving; a folder shared with you, with
    "Ver as pastas". Level: H; E: `notify.spec.mjs`, one test per kind;
    `sync.spec.mjs`, the revoked share. A (the real app, listed in
    [`manual-checks.md`](manual-checks.md)).
15. "Também nas notificações do sistema" starts off and asks nothing until
    turned on; on the desktop the row says where the system's own
    settings may block them; a browser's refusal turns it back off and
    says why; allowed, a
    notification of a kind on "Aviso e lista" also goes to the system only
    while the window is not in front, and a click on it (where the system
    tells the page: a browser; on the desktop it comes with the plugin 2.6)
    opens the centre on it. A list the browser's storage
    refuses lives in the window, and the centre says so. Level: H; E:
    `notify.spec.mjs`, "the system's notifications" and "a storage that
    refuses"; A (each system's own prompt and its notification).

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
6. Order and pins: "Organizar › Mover para cima" on a row writes the folder note's
   `order:`; "Fixar na pasta" writes `pinned:` and puts the row first;
   "Desafixar da pasta" takes it out; "Organizar › Ordem alfabética" in a folder's
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
8. "Organizar › Ocultar da árvore" takes the row away; Ajustes › Organização › "Itens
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
    on a tree item offers "Organizar › Criar foco aqui" and "Organizar › Adicionar ao foco…". "Trocar foco"
    in the command palette switches focuses. If `.space/waypoints.json` is present
    and sync is enabled, changes write back preserving untouched bytes; if disabled
    or unknown format, focuses stay read-only or in Verso settings. Level: H; E:
    `focuses.spec.mjs`.

## 12. On a phone and a tablet

From the tour's stop ⑰ "No celular" and note 22 ([ADR
0076](../adr/0076-the-window-on-every-screen.md)). By machine, the tests
tagged `@layout` run at 390 × 844 (WebKit), 412 × 915 (Chromium, touch) and
820 × 1180 (WebKit) besides the desktop's size (`playwright.config.mjs`); by
hand, on a phone and an iPad, the server's window in the browser.

1. Under 760 px: no ribbon, no status bar; a bar of five verbs at the bottom
   — Arquivos, Buscar, Nova nota, Voltar, Comandos — every word whole in
   Portuguese, each a target of 44 px; Arquivos opens the drawer, Buscar the
   drawer with the search field, Comandos the palette; Voltar steps back in
   the pane. Level: H; E: `responsive.spec.mjs`, "the frame follows the
   screen" and "the phone's bar".
2. A layout split on a wide window, then narrowed: one pane at a time and a
   switcher "2/2" in the tab bar; the panes are listed and chosen from it; the
   split commands are absent from the palette and from a tab's menu; widened
   again, both panes are back. A pane under 520 px folds its tools into "…",
   which reaches "Ações da aba…". Level: H; E: `responsive.spec.mjs`, "a
   split layout on a phone" and "a pane under 520 px".
3. The graph on a phone: the controls closed behind "Ajustes do grafo"; the
   help speaks of the pinch; two fingers zoom it. Level: H; E:
   `responsive.spec.mjs`, "the graph" (two tests).
4. Note 02 in Editar, by touch: a tap on a link places the cursor and a card
   offers Abrir and Editar link; Abrir opens the note. Level: H; E:
   `responsive.spec.mjs`, "Edit mode on a touch screen".
5. Projetos.base, "Por Status": a column per screen with the next one's edge
   showing; a long press on a card opens its menu with "Mover para a
   coluna…"; a swipe scrolls and moves nothing. Level: H; E:
   `responsive.spec.mjs`, "the kanban by touch".
6. A note in Editar on a touch screen: the keyboard's bar above the
   keyboard; `[[` suggests notes, Desfazer takes it back, "Esconder o
   teclado" closes it; the `/` menu, a tab's menu and the cursor stay above
   the keyboard. Level: H; E: `responsive.spec.mjs`, "the keyboard's bar"
   and "the on-screen keyboard" (the system's keyboard stood in for: by
   hand on the phone).
   Note 20 in Editar on a touch screen: no `+` or ⋮⋮ and no wide margin to
   the left of the text; the bar scrolls sideways, "Mover bloco para baixo"
   and "para cima" reorder two paragraphs with the cursor staying in the
   block above the keyboard, "Transformar em…" opens its menu above the
   bar and "Título 1" makes a heading, "Excluir bloco" removes the block,
   "Menu do bloco" reaches "Duplicar". Level: H; E: `block-bar.spec.mjs`
   (the system's keyboard stood in for: by hand on the phone).
7. "Selecionar" in a row's menu: a box on each row, a bar with Mover para…,
   Copiar caminhos, Apagar and Concluir; "Manter aberta" keeps a preview
   tab; "Abrir" opens a note without preview; on a touch screen, a "…" beside
   the row in front opens the row's menu. Level: H; E: `responsive.spec.mjs`,
   "the tree by touch" and "no action only by a gesture"; `touch.spec.mjs`.
8. On a server (`?side=server` in the harness): no "Mostrar no Finder", no
   new window; "Copiar link" and "Abrir numa nova aba do navegador"; a web
   note's page in a frame; a reader's window reads only, and says so. Level:
   H; E: `capabilities.spec.mjs`.
9. VoiceOver on the iPhone and the iPad, TalkBack on Android: the passes of
   `manual-checks.md`. Level: A.
10. Note 02 in Editar, by touch: a tap on a link shows its note above
    Abrir and Editar link; on the graph, a finger held still on a node
    shows its note and opens nothing ([ADR
    0085](../adr/0085-hover-preview.md) item 5). Level: H; E:
    `preview.spec.mjs`, "by touch" (the board's long press: by hand,
    `manual-checks.md`).

11. Offline on the phone ([ADR
    0092](../adr/0092-the-phone-offline.md); note 22, "Sem Rede"): on a
    server over HTTPS, a folder's *Settings › Offline* says the space first and
    keeps the folder on this device; with the network off the page still
    opens, lists the folder, a note is read and edited, the status bar says
    *Sem conexão* and how many writes wait, and search, links and the graph say
    *sem rede*; with the network back the writes go up (a note both sides
    appended to is joined, one both changed keeps a listed copy) and a
    notification says how many were sent; signing out says how many writes
    have not gone up and deletes the copy; the server ending the session
    deletes it at the next connection; a full store is refused where the
    write was made; plain HTTP says offline needs HTTPS. Level: H; E:
    `e2e-server/offline.spec.mjs` (Chromium, WebKit and a phone), the sync's
    property test (`test/offlineSync.test.mjs`) and the engine's cases made
    by the Rust engine (`test/offlineEngine.test.mjs`); an installed iPhone
    and an Android phone, the eviction and the home-screen install: by hand,
    `manual-checks.md`.

## 13. On a server

From the tour's stop "Num servidor" and note 23 ([ADR
0073](../adr/0073-self-hosted-server-first.md), [0074](../adr/0074-accounts-and-access-on-the-server.md),
[0075](../adr/0075-server-packaging-and-storage.md)). By machine, the
server's end-to-end tests drive a real `verso serve` (`npm run e2e:server`,
in `scripts/check.sh`), the server's Rust tests drive its API and
WebSocket, the host's test drives a desktop window on a server's folder,
and `scripts/check-server-image.sh` builds and runs the image; by hand, the
rest below and in `manual-checks.md`.

1. A server started with `VERSO_ADMIN_EMAIL` and `VERSO_ADMIN_PASSWORD`: the
   address sends to *Entrar*; a wrong password says *E-mail ou senha
   errados.*; the right one opens the window (e2e-server, "the admin signs
   in").
2. The administration console, `/admin` › *Pastas* (Settings › Account ›
   *Administrar este servidor* leads there): the folder on the disk registered
   with an owner; its page sets a quota (*Definir*, *Sem limite*), which the
   log lists (e2e-server, "the administration console"); *Abrir pasta* lists it; a note made in the browser is there after
   a reload (same test). An account's page ends its sessions and tokens:
   *Encerrar sessões e tokens*, after a confirm, says how many went, and
   that account's browser is signed out (e2e-server, "an admin ends
   another account's sessions"; a device told at once, `tests_console.rs`,
   `an_admin_ends_another_accounts_sessions_and_tokens`).
3. *Convites*: an invitation for an e-mail, a folder and *leitor*; the link
   in another browser creates the account, opens the folder, and the window
   says *Você só lê esta pasta*; the invitation shows *usado* and by whom; the
   link a second time is gone (e2e-server, "an invited reader").
4. One note in two windows: what one types appears in the other, and a
   third window reads it from the disk (e2e-server, "two windows edit one
   note").
5. *Ajustes* › *Conta*, from the person's button beside the gear on the
   ribbon (on a phone, *Conta* at the foot of the side bar): a passkey added, then *Entrar com passkey* after the e-mail (by
   hand, on a device with a passkey); the sessions listed and one ended; a
   token for one folder, read only.
6. The desktop app: *Ajustes* › *Servidores*, the server's address,
   *Conectar*; the browser asks to allow this computer; after *Permitir*, a
   folder of the server opens in the window (the host's test; by hand in
   the installed app). In the same section, *Nome deste aparelho*: a name
   saved there is the conflict copies' and this device's session's on each
   server, and emptied the system's is back (e2e, `sync.spec.mjs`, "Servers
   names this computer"; the host's test,
   `a_window_on_a_servers_folder_is_answered_by_the_server`). The page
   that approves the device says who asked — the device's name, the
   address, the time — and asks *Foi você quem pediu, neste aparelho?*,
   with *Aprovar este aparelho: <nome>* and *Não fui eu: recusar*; refused,
   the app's code is gone (e2e-server, "the page that approves a device
   says who asked"; `tests_threats.rs`).
7. Sync ([ADR 0079](../adr/0079-sync-a-local-folder-with-a-server.md)): with
   a folder of this computer open, *Ajustes* › *Sincronizar*; signed in to
   no server it says *Conecte a um servidor em Servidores primeiro*; signed
   in, the space is shown, *Sincronizar esta pasta* turns it on, and the
   status bar says *Sincronizada*; a pass paused for many deletions asks
   before *Apagar*; a conflict shows the difference between the server's
   version and the copy; *Desligar* asks, and the bar's state goes (e2e,
   `sync.spec.mjs`). What crosses — first sync, two devices, a deletion, a
   rename, a conflict, a mass deletion, a 9 MiB file, a reader, offline —
   the host's Rust tests against a real server (`tests_sync.rs`); two
   real computers, by hand (`manual-checks.md`). With the server down,
   *Sincronizar esta pasta*, the list of its folders in *Servidores* and the
   folder switcher say *Não foi possível alcançar o servidor
   localhost:7351 — ele está fora do ar ou sem rede.* where the person
   acted, with *Tentar de novo*, and a synced folder's bar says *Servidor
   fora de alcance: localhost:7351* (e2e, `server-down.spec.mjs`); a
   refused connection is the contract's `unreachable` (the host's test,
   `reach.rs`); a window on a server's folder whose server went down says
   *Servidor fora de alcance: localhost:7351* in the status bar with
   *Tentar de novo* (e2e, the same file), and tries again at 5 s doubling
   to 5 min (the host's test, `reach.rs`); the installed app with its
   server stopped, by hand (`manual-checks.md`).
8. Who changed what, and what needs a look: on the console's page of a
   folder, *Últimas mudanças nos arquivos* shows a device's change with the
   device's name in parentheses beside the account, and the server's log
   names the device in a refused change (`tests_sync.rs`,
   `a_devices_change_and_its_refusal_name_the_device`); a name held in two
   files on the server's disk is listed under *Pede atenção*
   (`tests_console.rs`,
   `a_file_held_as_anothers_name_is_said_on_the_console`; the disk itself,
   Linux only); a device's session ended in *Ajustes* › *Conta* closes that
   device's connection at once, and its *Sincronizar* says to connect again
   in *Servidores* (`tests_sync.rs`,
   `an_ended_sessions_connection_is_closed_at_once`); two real computers,
   by hand.
9. The trash on a server ([ADR 0080](../adr/0080-the-trash-with-expiry-and-restore.md)):
   a device writes other bytes over a note; *Ajustes › Lixeira* lists the
   version it replaced, "substituído por" the device, and "Restaurar" puts
   it beside the note; the console's folder page shows the trash, "fora da
   cota", and its days (e2e-server, "a device's write keeps what it
   replaced"). An editor restores but deletes nothing for good, a reader
   sees no trash, the owner shortens the days under the admin's, and the
   console sets and empties it; the sweep expires what is past its days and
   the oldest while a trash alone passes the quota (`tests_trash.rs`).
10. Sharing between people ([ADR 0081](../adr/0081-sharing-between-people-on-one-universo.md)),
   from note 23's "Compartilhar com outra pessoa" and the tour's stop: the
   demo vault has one account, so the other side is followed with two
   browsers on a UniVerso. The folder button at the top of the side bar
   opens the switcher, *Neste computador*, *Meus*, *Compartilhados comigo*;
   a share opens from it (e2e, `shares.spec.mjs`, "the folder switcher").
   As the owner, a folder's menu › *Compartilhar…*: the dialog adds a person
   by e-mail, changes the role by keyboard, and asks before *Tirar*; the
   tree marks the folder "compartilhada com 1 pessoa" (e2e, "the owner
   shares a folder"). A link of a shared note to a note outside reads *Não
   está no que foi compartilhado com você.* and makes no note (e2e, "a link
   out of what was shared"). What the receiver may reach — never above the
   share, by `..`, a sibling, a rename, sync's listing, reads and writes,
   `/f/`, the events — the server's Rust tests (`tests_shares.rs`); two
   people and the attachments folder, by hand (`manual-checks.md`). The
   owner removes a person whose computer syncs the share: that sync turns
   off, the files kept, and the status bar and *Ajustes* › *Sincronizar*
   say *quem compartilhou revogou o acesso* and when (e2e, `sync.spec.mjs`,
   "a share revoked by its owner"; the host's Rust test against a real
   server, `tests_shares.rs`). As the receiver, rename a note of the share
   that a note of the owner's outside it links to; as the owner, that
   note's link now has the new name, and the receiver's rename named only
   notes inside the share (the server's Rust test, `tests_shares.rs`, "a
   receivers rename rewrites the owners links outside the share", with a
   note open in a room kept as it was; by hand with two browsers). The
   receiver's status bar counts the share's notes, and a base through the
   share counts, sums and lists only notes inside it (the server's Rust
   test, `tests_shares.rs`, "a receivers counts are the shares").
11. Editing together in a synced folder ([ADR
    0082](../adr/0082-live-co-editing-of-a-synced-folder.md)), from note 23's
    section *Editar junto numa pasta sincronizada*: with the folder syncing,
    a note opened in *Editar* says *ao vivo, só você* beside its title and
    in the status bar; another person in it is named (*ao vivo, com Bia*)
    and their text arrives; what is typed goes to the room, never to the
    file, which follows the room's save; the link dropped, the note says
    *local — sem conexão*, keeps its text and saves it here; back, *A nota
    está ao vivo de novo* and what was typed is in the room; paused, *local
    — sincronização pausada*; back in another room, the note is read anew
    with its text; *Ajustes* › *Sincronizar* › *Editar notas junto enquanto
    online* off, the note leaves the room and, opened again, joins nothing
    (e2e, `live.spec.mjs`). A property set in the panel of a live note —
    a value, a checkbox — goes into the room beside what another person
    types there, never to the file, which follows the room's save; a
    sticker, a base's cell and a PDF's quote into a live companion note go
    the same way, with no `write_note` and no conflict copy, whether a tab
    here holds the note or it is live only with someone else, the window
    joining its room for the one write (e2e, `live.spec.mjs`, "a property
    set in the panel"; `live-writes.spec.mjs`; `roomWrites.test.mjs`). Two devices and a browser in one room, a drop
    and a return within the grace and after it, an outside program's edit,
    a reader, a pause, and the property test that no edit is lost — the
    host's Rust tests against a real server (`tests_live.rs`); a cursor
    always wears its writer's account name, whatever the window sent
    (`tests_threats.rs`); two real
    computers, by hand (`manual-checks.md`). The demo vault has no server:
    the steps run in the harness's room or by hand.
12. Everything edited together, not only notes ([ADR
    0082](../adr/0082-live-co-editing-of-a-synced-folder.md) item 12), from
    note 23's *Editar junto* and the tour's stop "Num servidor": with the
    demo vault on a UniVerso, open *Tour do Verso* — or a board of your
    own — in two windows. Drag a card in one while the other draws a text
    with the text tool: each window shows both, and the file holds both,
    no conflict copy and no banner; the other window's pointer moves on
    this one's board with its name, and the tab says *ao vivo, com* and the
    name (e2e-server, "two windows on one board"; with the board kept out
    of its room the test fails). Open a `.txt` in two windows and type in
    each: each sees the other's letters, and the file follows; open
    *Projetos.base* in two windows and add a sort with the toolbar's
    *Ordenar* › *+ Adicionar ordenação*: the other window's base has it,
    and so does the file (e2e-server, "two windows on a text file and on a
    base's settings"). On a synced folder a board is live while the link is
    up, goes *local — sem conexão* with what it holds saved here, and comes
    back with *O quadro está ao vivo de novo* (e2e, `live.spec.mjs`, "a
    synced folder's board is live"). The merge — two elements both land,
    the same element the higher version, on a tie the lower nonce, a
    deletion against a drag stays deleted, the file only of the room's own
    state, opening writes nothing, a change from outside, the limits — the
    server's Rust tests (`tests_board_rooms.rs`, `collab_board.rs`), the
    window's (`boardRoom.test.mjs`), and two synced devices on a text file
    and a board (`tests_live.rs`); two real computers, by hand
    (`manual-checks.md`). Under load: five clients on a board against a
    real server, seeded, with reordering, drops and a reader of the disk
    (`tests_board_stress.rs`; the long run `board_stress_long`, ignored);
    five windows with the window's own merge and converter
    (`boardStress.test.mjs`); three windows in two engines working at
    random for a minute (e2e-server, "three windows, two engines").
13. Secret blocks ([ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md)):
    the owner of a folder copies note 25's secret block into a note and
    gives another account *leitor*. The reader's window shows the note
    without the block — in Leitura, a hover preview, an embed of it, the
    search (*estalajadeira* finds nothing), the backlinks, the tags and
    the graph, a base; the owner's shows it with a lock and *Oculto para
    leitores*, and *Ver como leitor* shows what the reader gets. Both in
    the note at once: the owner types inside the block and outside it; the
    reader's note follows what is outside once the room writes, with the
    owner's name present and no cursor; the owner pastes a new secret into
    a note the reader has open, and the reader's tab reads the note again
    without it. A reader's device that syncs the folder holds the note
    without the block, and a change only inside it is no change there.
    Level: H; R: `tests_secret.rs` (every command of the contract as a
    reader, a live note, sync, a share, a role made reader), the core's
    `tests/workspace/reader.rs`, the index's `tests/secret.rs`, the
    dialect's `tests/secret.rs` and `fixtures/callout/secret` (approved
    2026-10-15); A: `manual-checks.md`.

14. The installation lesson (note 24, "Instalar o seu UniVerso, Passo a
    Passo"): the tour's "Num servidor" stop shows notes 23 and 25 side by
    side, and note 23's *Instalar* links to 25. In 25 every fenced block
    (`bash`, `yaml`) copies whole, and each command, path, port and
    variable reads the same as in `docs/reference/server-hands-on.md`; the
    note says Verso is in testing, with no public download yet; and the
    links to `#Se algo der errado` and to note 23's *O primeiro admin e as
    contas* land on their headings. Level: H; R: `scripts/demo-vault.mjs
    check` (links and headings of the vault).

15. This app is a server (note 22, *Parear o Celular com o Seu Computador*;
    [ADR 0096](../adr/0096-this-app-is-a-server.md)): *Ajustes* › *Este app é
    um servidor* offers the folders opened on this computer, none ticked; the
    one that also syncs with a server cannot be ticked. Nothing ticked,
    *Ligar o servidor* refuses and says so; ticked, the first turn-on
    explains what the system will ask, serves, and the status bar shows
    *Servindo* with *Parar*. *Parear um celular* shows a QR, the address and
    a code of eight letters, and a countdown; a phone presenting the token
    raises *Foi você quem leu este QR?* with its name, address and time;
    *Permitir* (with *Pode editar as notas* for an editor) lists it, *Não fui
    eu: recusar* ends the token; *Revogar* removes it; *Esquecer todos os
    celulares* asks first. By machine: `app/ui/e2e/local-server.spec.mjs`
    (the harness answers in memory) and the Rust tests of
    `crates/verso-server/src/local` (the real server over TLS, the pairing,
    the allowlist, the limits); by hand, with a real phone, the checks in
    `manual-checks.md`. Level: H for the section, A for the phone; R:
    `scripts/demo-vault.mjs check` for the note.

16. UniVerso found on the network ([ADR
    0097](../adr/0097-universo-found-on-the-network-and-a-bad-dns-survived.md);
    note 24, section 6, *O caminho mais curto*): in *Settings › Servers*,
    *Encontrados nesta rede* lists a UniVerso announced on the network with
    the address each row will use and *sem HTTPS* when it is plain; a click
    fills that address and starts the sign-in as if typed, and nothing
    connects before it. A server with its own TLS and no `VERSO_PUBLIC_URL`
    is listed with what to set and no button. Changing section ends the
    browse. By machine: `app/ui/e2e/servers-found.spec.mjs` (the harness
    feeds the list) and `app/ui/test/serversFound.test.mjs`; by hand, on a
    real network, the checks in `manual-checks.md`. Level: H for the list,
    A for the network; R: `scripts/demo-vault.mjs check` for the note.

## 14. Features, oracle, sheets and worlds (notes 26 and 27, the Fractal campaign)

Open note 26 (*Fichas*, the sheets) and note 27 (*Oráculos e Criação de Mundos*,
the features, the oracle and the wizard) in Leitura, in a folder that has the
demo content. The steps below follow them (1 to 3 in note 27, 4 to 6 in note 26); the Fractal campaign is
the folder `Campanha Fractal/` beside it ([ADR
0098](../adr/0098-world-and-campaign-wizard-template-bundles.md), [ADR
0099](../adr/0099-visual-markdown-statblocks-and-cards.md), [ADR
0102](../adr/0102-creative-oracles-and-improvisation.md), [ADR
0103](../adr/0103-feature-presets-and-capability-flags.md)).

1. *Ajustes* › *Aplicação* › *Recursos* lists five switches, *Dados*, *Tabelas
   sorteadas*, *Oráculos*, *Fichas* and *Assistente de mundo e campanha*, all
   on, and the shortcuts *Tudo* and *Só escrita*; the old "Modo de Uso" is
   nowhere. *Só escrita* first says what it will turn off and does nothing on
   *Cancelar*. Turn *Oráculos* off, close Settings: the `[!oracle]` callout of
   the note is drawn with no *Consultar Oráculo* button, and ⌘⇧P offers no
   *Oráculo (sim/não e faíscas)…*. Turn it on: the button is back. No file
   changed (note 27 in Fonte reads as before). Level: H; E: `oracle.spec.mjs`
   (the switch), `statblock.spec.mjs` and `world-wizard.spec.mjs` (the
   others); U: `test/capabilities.test.mjs`.
2. The oracle in the note. In the callout of note 27 *A patrulha da guarda ouviu o
   barulho da invasão?* click *Consultar Oráculo*: the dialog opens with the
   question filled in, three tabs (*Sim ou Não*, *Faíscas*, *Tabelas*) and the
   five odds as a radio group. *Consultar* shows one of the six answers with
   the d100; *Gravar no callout* writes one line into the callout and closes.
   Again, same question: a second line below the first. Edit the question's
   words in the dialog and consult: the lines the oracle wrote are replaced,
   the line about the *oficial novato*, which was typed by hand, stays. With
   the caret outside a callout, the button reads *Inserir na nota* and a new
   callout appears at the caret, never inside a quote, a table or a code
   fence. Level: H; E: `oracle.spec.mjs`; U: `test/oracleLocate.test.mjs`,
   `test/oracle.test.mjs`.
3. The oracle's settings. *Ajustes* › *RPG & Mesa Solo* › *Oráculos e Solo RPG*
   opens with one sentence of what the oracle does, *Experimentar o oráculo*
   (the dialog opens over the page) and *Compartilhado com quem abre esta
   pasta* — no file path anywhere. The odds are five bars split in the six
   answers, with a legend; picking the style *Ironsworn* saves it at once in
   the folder's settings and the bars lose their "mas…" parts; *Desfazer*
   brings *Equilibrado* back. In *Ajustar à mão…*, setting *Quase certo*'s
   *Não* to 3 shows *faltam 3%* and saves nothing; making the row 100 saves
   it and the style reads *Personalizado*; *Voltar ao padrão* restores the
   table. *Faíscas de ideias* has no language switch: off, its preview shows
   the window's language (*Descobrir* in Portuguese, *Discover* in English);
   *Usar minhas próprias palavras* turns the four lists into chips — Enter
   adds (a comma list adds each), × or Delete removes, the last word of a
   list stays and says why — each change saved by itself; *Voltar às
   palavras do Verso* turns it off. *Nova tabela* writes a note holding a
   list with a `^id` (the text shown first), and the oracle's *Tabelas* tab
   then lists it with the note it comes from. Where the folder is only read
   the page says why and every control is disabled. All of it holds at
   340 px and in dark. In a room on a server the draw is the server's and
   another window sees a notice with the asker's name. Level: H (the room:
   the harness plays the server, `src/harness/room.ts`); E:
   `oracle-settings.spec.mjs`; U: `test/oracleData.test.mjs`; the real room,
   in `manual-checks.md`.
4. Statblocks. Note 26 holds one card for each built-in layout (34), none with
   an error badge, and `tutorial-sheets.spec.mjs` counts them. In the *Criatura
   d20* card the dice (`+4 to hit`, `4 (1d4 + 2)`) roll with a click, the card says the
   result and the note in Fonte is unchanged; the *PV atuais* buttons − and +
   change `hp_current` and nothing else of the block. In the *Fatos e
   contadores* card: a box of *estresse* or *relógio* marks up to it, clicking the
   last one clears it; Tab, the arrows, Home and End work the group. *Ver
   código* / *Ver ficha* switches in both views. Turn *Fichas* off: every
   block is code. Level: H; E: `statblock.spec.mjs`; U:
   `test/statblock.test.mjs`, `test/statblockRender.test.mjs`.
5. Layouts. *Ajustes* › *RPG & Mesa Solo* › *Fichas e Templates* lists the
   built-in layouts (the open systems, *Fractal — Personagem*, *Fractal —
   Desafio*, and the generic ones) as *Embutido*. *Editar* on one copies it
   into the folder, says so at the top of the editor, and shows the tree of
   blocks beside the card drawn from a sample. *Adicionar bloco* lists the
   types with a line each; a *Texto* block with a fixed text shows in the
   card at once; *Salvar* writes `.verso/layouts/<id>.json` and the list now
   shows the copy as *Da pasta*. Closing with unsaved changes asks first.
   Moving a block by drag or Alt+arrows and ⌘Z: by hand (`manual-checks.md`).
   Level: H; E: `layout-editor.spec.mjs`; U: `test/statblockEditor.test.mjs`,
   `test/statblockFolder.test.mjs`.
6. The Fractal campaign (`Campanha Fractal/Mundo`, opened from the card on the
   tour or from note 26). The first line is Fractal's credit, word for word as
   *Créditos e agradecimentos* has it. *Yara do Farol*: a click on a box of
   *Fôlego* changes `reserva_2_atual` in Fonte and nothing else; *Quebrado* on
   a fact strikes it, writes `quebrado: true` and moves the count (*N de 3
   quebrados*); *Rolar (Fractal)* asks for the facts that apply and shows the
   result as the system reads it. *Desafio - A Maré Sem Fim*: its first
   obstacle is a link to *Arco - O Farol Apagado*, whose second is a link to
   *Episódio - A Luz Estranha*; each link opens its note, and the graph shows
   the three as a chain. *Sessão 01*: two oracle callouts with answers that
   piled up; *Consultar Oráculo* on one adds a line and keeps the hand-written
   ones. Level: H; E: `statblock.spec.mjs` (the card and its two writes);
   S: `scripts/demo-vault.mjs check` (the links).
7. The project wizard. ⌘⇧P › *Novo projeto a partir de modelo…* (or the create
   menu): a name, a folder, four bundles, a preview that lists folders and
   files. *Criar estrutura* writes nothing and shows *Confira o que será
   criado*: every folder and file with a box and a name. Untick a folder and
   the files inside it go with it; untick a note; *Criar agora* creates only
   what is ticked and reports it; the first note opens. With *Assistente de
   mundo e campanha* off, the command is gone. *Gerador com IA*: *Copiar
   System Prompt para IA* copies and sends nothing; a bad pasted JSON answers
   with the fault and *Copiar pedido de correção para a IA*. Level: H; E:
   `world-wizard.spec.mjs`; U: `test/bundles.test.mjs`.
8. *Ajustes* › *Aplicação* › *Créditos e agradecimentos*: the people and
   works the app starts from, the notices of the shipped layouts and the open
   software, each with *Abrir* that opens its site in the browser. Level: H
   (the page); A (the link opening in the system's browser); U:
   `test/credits.test.mjs`.

## 15. The end

1. The log after the line noted: no `ERROR`. The app's stderr: empty. The
   console: nothing red. Level: A; E: every test, in the harness.
2. Put back what a step changed in the shared settings (the right panel's
   tab, the palette, the theme).
