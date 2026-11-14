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

By machine first: `scripts/check-e2e.sh --ui` builds the window and runs
every step marked E, headless, in Playwright's Linux image in Docker
(`scripts/check.sh` runs it with the server's suite; on a Mac never
`npx playwright test` outside Docker, ADR 0069 item 8). One file:
`scripts/check-e2e.sh --ui e2e/notes.spec.mjs`. A failure leaves a
screenshot and a trace in `app/ui/e2e/results/`
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
   put `Templates/` into `templates/` (`bf12a4d`).
2. The welcome note shows the "Comece pelo tour" callout with its two links.
   Level: S (the links), H.
3. Import again into a folder that holds an earlier version's demo. Expect:
   what is missing is created, a file that is the untouched copy of an
   earlier version's demo (its bytes are one the demo carries the hash of)
   is replaced by the current one, the untouched old copy of a note the
   tutorial renamed (`24 - Dados e Tabelas Sorteadas.md`, now 22) goes to
   the folder's trash — restorable — once the current note is there, a
   file with other content — the
   person's edit — is kept as it is and named, the toast and the status
   bar say how many were created, updated and kept, and the app's log has
   `import demo:` lines saying how many were created, updated, kept and
   failed. Level: H; E: `import.spec.mjs`, `test/demoImport.test.mjs`.
   Caught: an import that wrote nothing said "imported" and left no trace;
   a folder imported from an older demo never got the tutorial's new
   sections ("0 created, 28 kept").
4. With the window in English, import into an empty folder. Expect: the
   English vault of `demo-vault-en/` (file names such as `00 - Welcome to
   Verso.md` and `Verso Tour.canvas`) plus the shared `assets/` of
   `demo-vault/`, no Portuguese note; the English welcome note opens, the
   tour opens with its stops in English, and a translated note opens from it.
   The palette's "Import the demo content in Portuguese (Português)" writes
   the Portuguese vault instead (and, in a Portuguese window, "Importar cofre
   de exemplo em inglês (English)" the English one). Level: S (`node
   scripts/demo-vault.mjs check` holds the two vaults as twins), H; E:
   `demo-vault-en.spec.mjs`.

## 2. The tour

1. In the welcome note, in Editar, ⌘-click "Tour do Verso" (a plain click
   puts the caret in the link). Expect: the board opens with every stop in
   rows of three, numbered at their top right, a dashed trail joining them in
   order; every drawn text whole. The file is unchanged. Check: the screen;
   `cmp` of the file before and after. Level: H; E: `board-tour.spec.mjs`
   (no board written, the text measured with its font) and
   `board-file.spec.mjs` (no board written after a press, a pan and a zoom
   right after opening). Caught: drawn text cut while its font loaded
   (`b1c5d58`); a press right after opening wrote the board (2026-10-01).
2. Sumário: the stops are listed in their numbers' order; a click on each
   shows it whole and legible, its notes live on their cards; closing the
   Sumário keeps the stop in view. Level: H; E: `board-tour.spec.mjs`.
   Caught: a group was only brought to the middle at 10% (`b1c5d58`); the
   stops were laid out in a snake while the outline lists them row by row
   (`ae5f6b2`); closing the Sumário brought the whole board back over the
   stop, and the window shrank while the notes' Mermaid diagrams were drawn,
   so a stop chosen then was shown off centre (2026-10-01).
3. ⌘W closes the tab and the app stays open; ⌘⇧T reopens it. Level: A (the
   native menu); E: `tabs.spec.mjs`, the keys and the menu's event as the
   host sends it. Caught: ⌘W closed the window, and with one window open
   quit the app (`bf12a4d`).
4. On a board, ⌘P opens "Abrir…". Level: H; E: `board-tour.spec.mjs`.
   Caught: Excalidraw kept the key (`b1c5d58`).
5. Note 10: ⌘R reloads the window with the note typed in saved first; with a
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
7. No title bar (ADR 0072, note 10), on macOS, Windows and Linux: the
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
2. Note 04 in Editar: on an empty line, `/` opens the menu with Básico,
   Listas, Destaques and Inserir; typing `data` leaves "Data de hoje", and
   Enter writes today's date; ⌘Z takes it back. Level: H; E:
   `notes.spec.mjs` (the date written at the end, and gone after ⌘Z).
3. Note 02: every link leads to its note, a `#heading` to its heading; the
   embed shows "Editar ao lado". "Incorporar só um bloco": the embed
   `#^atomica` shows the third finding alone, not the whole note (spec Q3,
   Q21). Level: S (the links, `fixtures/block/`), H; E:
   `blocks-ids.spec.mjs`.
4. Note 18 in Leitura: `![Diagrama|320](assets/diagrama.svg)` is shown
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
10. Note 05 in Editar (ADR 0061): the pointer over a paragraph shows `+`
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
15. Note 22 (ADR 0088): in Leitura each `dice:` code is a die button named
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
16. Note 22, "O segredo do mestre" ([ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md)):
    in Leitura the `[!secret]` callout has a lock and *Visível para quem
    tiver o arquivo* in its title (a folder of this computer hides
    nothing). *Ver como leitor*, beside Ler and Editar, shows the note
    without the block, a strip saying *Vendo como um leitor* with *Ver a
    nota inteira*, which brings it back; Editar leaves the reader's view.
    In Editar, `/` › Destaques › *Segredo* writes `> [!secret] ` and says
    it is no encryption. A note with no secret block offers no toggle.
    Opening and toggling write nothing. Level: H; E: `secret.spec.mjs`;
    U: `test/secret.test.mjs`.
17. Note 11 in Editar, dark theme ([ADR 0061](../adr/0061-blocks-in-edit-mode.md)
    item 9, revised 2026-11-07): ⌘A, then a drag from the top to the end:
    every line shows its Markdown (`>`, `#`, `**`, `[[ ]]`) and nothing
    moves up or down — the blank lines between blocks stay thin gaps, the
    headings keep their places, the paragraph under the pointer has no box
    inside the selection. The caret clicked into a heading, or onto a `---`
    divider, moves nothing either; the caret on a blank line makes it a
    full line. The selection is one even shade, light and dark, over gaps,
    spaces and line ends, and starts where the headings' text does though
    the first line is a quote; over a code block it shows on the code.
    Level: H; E: `selection-spacing.spec.mjs`. Caught: a select all made a
    400 px note 492 px tall, and painted two shades in WebKit (2026-11-07).

## 4. Organizing: properties, bases, daily notes

1. `Projetos.base`: the six views (table, kanban, Cards, list, calendar, map);
   only the notes of `projetos/`; the formula's column and the budget's sum;
   the kanban in a column per status; the calendar back in September 2026
   shows the three projects. Level: H. Caught: with no filter the base
   listed the whole vault (`ae5f6b2`).
2. Note 14: the embedded view and the `base` block listing the daily notes.
   Level: H.
3. ⌘⇧D (⌘D until 2026-10-06, ADR 0061): `Diário/<today>.md` is made from `Templates/Diário.md`, `{{title}}`
   and `{{date}}` filled. Level: S (the folders), H; E: `notes.spec.mjs`.
   Caught: the notes said `daily/` and `templates/`, which the app does not
   use by default (`ae5f6b2`).
4. Right panel (⌘⌥→) › Calendário: dots on 24 and 25 September and on today.
   Level: H; E: `notes.spec.mjs`.
5. The typed note (note 13, ADR 0052): `Personagens/Capitão Ruy` shows
   "Tipo: Personagem" above its properties, the schema's properties first
   under their labels, `nível: alto` underlined, "Primeira aparição" an
   empty date row; opening it writes nothing; a date picked there goes at
   the end of the frontmatter; "Abrir o schema" opens `Tipos/Personagem`.
   A property added to the schema shows, empty, in both notes, and no file
   changes. A copy of the schema's note makes both notes say the two
   schemas share the name; `type:personagem` in the search lists the two.
   In English, "Type: Character". Level: S (`crates/verso-core/tests/typed.rs`,
   `fixtures/schema/`), H; E: `typed.spec.mjs`.
6. Note 12, "Começar uma nota nova por um template" (ADR 0068): ⌘N shows
   "Começar com" under the title — Em branco, Diário, Nota de Reunião, Novo
   Projeto, Semanal; "Nota de Reunião" fills the note, `{{title}}` and `{{date}}`
   replaced; Em branco, Esc or typing put the list away and write nothing;
   the arrows move along the list. A folder whose note sets
   `items_template` makes the note from it, with no list. Level: H; E:
   `templates.spec.mjs`.
7. The infobox (note 13, "O Infobox", ADR 0086): `Lugares/Porto Cinzento`
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
8. The map (note 14, "O Mapa", ADR 0094): *Projetos.base › Mapa* draws the
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
9. Regular expressions (note 14, "Expressões Regulares nas Fórmulas"): the
   *Mês* column of *Todos os Projetos* shows `09/2026` for the three
   projects — evaluated by the core, not by the harness, which leaves a
   formula empty. Level: S (`crates/verso-core/src/bases/tests_regex.rs`,
   `crates/verso-core/tests/demo_base.rs`), A.
10. The embedded *Todos os Projetos* of note 14 has the view's tools; a
    sort added there is written to `Projetos.base` and the rest of the file
    is kept. `html()` in a base draws HTML, cleaned (no script, no
    `onerror`). Level: H; E: `base-map.spec.mjs`.
11. Periodic notes (note 12, "A Semana, o Mês, o Trimestre e o Ano", ADR
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
3. "Grafo do cofre": the graph and its controls as note 15 names them.
   Level: H.
4. ⌘K `busca navegação`: note 09 comes first, found by its file name,
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
   note showed no backlinks until reopened (`bf12a4d`).
2. The PDF: its bar as note 18 names it; select a line, "Citar seleção nas
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
7. Note 07, "Vários de uma vez" (ADR 0048, revised 2026-10-07): ⌘-click two
   notes of the tree and ⇧-click a third — the rows between are selected;
   Esc clears; a plain click opens. Drag the selection onto a folder: they
   move together, and a note linking to them by path shows in one plan. The
   selection's menu: "Mover para…", "Copiar caminhos relativos", "Mover para
   a lixeira" asked once. Level: H; E: `tree-selection.spec.mjs`; S:
   `crates/verso-core/tests/workspace/rename.rs`.
   Files only in iCloud (ADR 0043, decided 2026-11-11): a selection with
   evicted files dragged onto a folder says *Baixando N arquivos do
   iCloud…*, then moves all of them; one that cannot come down stops the
   move and is named (*Não foi possível baixar do iCloud: …*). Level: H for
   the window, A for real iCloud; E: `tree-cloud-files.spec.mjs`; by hand,
   the check in `manual-checks.md`.
8. Note 07, "Criar" (ADR 0070): a new note named `CON`, `Reunião: pauta`,
   `Ideia?` or `a\b` is not made (`nota.` is: its file is `nota..md`); the status bar says Windows cannot keep that name.
   A rename to such a name is refused the same way. Level: H; E:
   `prompts.spec.mjs`; S: `crates/verso-fs/tests/ops.rs`.
   Beside `Nota`, a new note `nota` is not made either, and the status
   bar says a Mac or Windows would keep only one of the two; renaming
   `Nota` to `nota` works (spec Q8, decided 2026-10-12). Level: A (the
   harness does not refuse it); U: `crates/verso-fs/tests/ops.rs`,
   `crates/verso-core/tests/workspace/rename.rs`.
9. Note 07, "A Visão de Pasta": open a folder with its chevron and close
   another; open the app again — the tree is as it was left. A folder of
   thousands of notes opens with its top-level folders closed. Level: H;
   E: `tree-big.spec.mjs` (`?vault=big`, both engines), which also pins
   the rows' cost: no inline SVG, four elements a row, a closed folder's
   rows let go, one row marked as the open note, and a long name ending in
   "…" inside its row. Tab into the tree: the focus ring shows on all four
   sides of a row, inside it (by eye, both engines; caught 2026-10-08: the
   folders' containment cut it).
10. Note 07, "Arrastar e Soltar", on a touch screen: a swipe over the tree
   scrolls it and moves nothing; a finger held on a row and lifted opens
   its menu; held and then moved, it drags the row into a folder. Level: H
   (touch moves only in Chromium); E: `touch.spec.mjs`.
   Drag a note, then a selection of two, into a folder, and press ⌘Z
   (or Edit › Undo) with the focus still in the tree: they go back where
   they were, together, and the status bar says *Movimento desfeito*;
   ⌘⇧Z moves them again. Click into a note's text and ⌘Z: the note's text
   is undone, the move stays. Level: H; E: `tree-selection.spec.mjs`.
11. Note 07, "A Lixeira" ([ADR 0080](../adr/0080-the-trash-with-expiry-and-restore.md)):
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
   Amendment 2026-11-01 (I5): on a server whose bin cap (`VERSO_TRASH_MAX`) a
   folder passes by itself, "Mover para a lixeira" adds *Atenção: isto tem …,
   mais que o limite da lixeira do servidor … sem poder ser restaurado*; it
   stays in the bin a day at least (E: `trash-cap-warning.spec.mjs`; S: the
   `due` and server-sweep tests).
12. Note 07, "O Histórico de Versões" ([ADR 0091](../adr/0091-version-history.md)):
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
13. The folder switcher (the button with the folder's name): each recent
    folder but the open one has a **×**, named "Ocultar “<name>” da lista"
    (a 44 px target on a phone); it takes the folder off the list, says so
    in a notice with the way back, and nothing is deleted. Closed and
    opened again it stays off. *Settings › Files and links › Show hidden
    folders* brings them all back. Level: H; E: `folder-switcher-hide.spec.mjs`
    (also at a phone's and a tablet's size); U: `hiddenFolders.test.mjs`;
    A (the real folder list of the app).
14. Drag a file from the Finder or Explorer onto the tree, a folder in it
    and its empty part: in the desktop app the folder under the pointer
    is marked while the drag is over it, the file is copied in by the app
    itself (up to *Settings › Files and links › Largest imported file*, a
    200 MB PDF with the limit raised) and the status line says it, a name
    taken getting `(2)`; a file past the limit is named. A file dropped on a
    note's text or on a board is taken in as before (32 MB). Level: A (the
    real drag on macOS and Windows: Tauri's drag-and-drop events replace
    the page's drop there); H for the window's side; E: `drop-host.spec.mjs`
    (the harness plays the host); S: `app/src-tauri/src/tests_pick.rs`
    (the host keeps the paths, the window gets names).

## 7. The web

1. `Web/jsoncanvas.org.md`: the bar (back, forward, reload, the address);
   "Ver página" and "Ver nota" switch. Level: A.
2. `Web/Cartão de visita.html`: the page with its own style, in Página;
   its source in Fonte. Level: A. Caught: the page was blank — served as
   bytes, which `nosniff` kept the frame from showing (`bf12a4d`).
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
6. A page behind an overlay (ADR 0056, revision of 2026-11-12): with
   `Web/jsoncanvas.org.md` on *Ver página*, open the quick switcher (⌘P),
   the palette, a menu and the folder switcher in turn: the page stays in
   sight behind each, still — a picture of itself, which takes no click —
   and nothing flashes; closed, the live page is back where it was and
   scrolls and clicks again. The same with an embedded page of a site that
   refuses frames, half scrolled out of its pane. Level: H, A; E:
   `web-snapshot.spec.mjs`; U: `test/webSnapshot.test.mjs`, `cargo test -p
   verso-app tests_web`. Caught: the page vanished while any overlay
   showed (the maintainer, 2026-11-12).

## 8. The board's file

1. Opening a board writes nothing; moving a card changes only its `x` and
   `y`. Level: U (the model), A.
2. A card's sharp corners and an elbow arrow come back as they were after the
   board is opened again, the arrow bound to its cards. Level: U. Caught:
   the panel's style was not saved (`7335eb0`).
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
9. A Markdown text card (ADR 0057, 2026-10-23): the toolbar's *Text card*
   button, and a double click (a double tap on a phone) on an empty spot of
   the board, ask for a text and add a card there; a `dice:` code in it is a
   die. A double click on a card still edits that card; with *Settings ›
   Board › Double click on the board creates* on *Drawn text* an empty spot
   writes Excalidraw's drawn text; a reader's double click does nothing.
   Level: H; E: `board-text-card.spec.mjs`.

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
   kept the old name (`bf12a4d`), and again for a name typed over the frame,
   which Excalidraw changes in place (2026-10-01).
4. Lesson 7: ⌘⌥] brings the circle to the front, ⌘⌥[ sends the square to the
   back; ⌘] and ⌘[ one step. Level: H; E: `board-practice.spec.mjs`, ⌘⌥]
   and ⌘⌥[. Caught: ⌘⌥] and ⌘⌥[ did nothing on a Mac (`bf12a4d`).
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
   board was opened again (`bf12a4d`).
8. Lesson 11: ⌘F `tesouro` finds it, as typed; the view stays put while the
   board saves. Level: H; E: `board-practice.spec.mjs`. Caught: the field
   corrected the word, and every save moved the view back to the first match
   (`bf12a4d`).
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

14. Lesson 15, a data file on a card (ADR 0057 point 10, ADR 0106, ADR
    0103): the card of `npcs-da-campanha.json` shows the file's text, in the
    source editor's colours, scrollable once the card is entered; nothing
    is an empty box (a sound, an `.html`, a board or a base on a card says
    what it is). "Texto | Diagrama" in the head switches to the boxes and
    lines; the choice is `verso.view` on the node and survives closing the
    board, the data file is never written. The diagram takes the pointer
    only when entered ("Interagir com o diagrama"): a drag on its
    background pans it and the card stays; Esc, "Sair do diagrama" or a
    click outside returns to the board. "Abrir" opens the file's tab in the
    view the card shows. The card follows the file when it changes on disk.
    A file over 64 KB shows its first 64 KB and an ellipsis; over 20 MB or
    200,000 boxes the diagram says why and the text shows. With "Diagrama
    de dados" off the card is text only and has no toggle (the node keeps
    its view). The image export draws the card as its box with the name and
    the first lines of text. A `.yaml` has both views too. Level: H, A (the
    real drag in the board's zoom, WKWebView, WebView2 and WebKitGTK); E:
    `board-data-card.spec.mjs`; U: `board.test.mjs` (the mode, the 64 KB
    cut).

## 10. Settings, help, the command line

1. ⌘,: the sections as note 36 names them; Aparência's options; Terminal e
   agentes: the command's button (Instalar or Substituir; on Windows no
   button — verso.exe comes with the app) and the MCP snippets, which show
   the command the host would write; without Claude Desktop, "Baixar o
   Claude Desktop" opens its download page in the browser; Aparência's
   *Tom do escuro* (under *Temas*, beside the theme mode and above the cards) changes the dark theme's paper (Suave, Profundo,
   Penumbra), and the ribbon's buttons each have a switch, the gear none.
   Level: H; E: `settings.spec.mjs`, the sections and Aparência;
   `dark-tone.spec.mjs`, every palette and tone at 4.5:1 or more;
   `ribbon.spec.mjs`, a hidden button brought back. Aparência's
   *Temas* gallery (ADR 0100): four cards of Verso's (Papel, Sépia,
   Ardósia, Musgo), each a tiny page in that theme's own colours, the one in
   use marked; a click (or Tab and Space) uses a theme at once; *Copiar*
   makes "Cópia de …"; Verso's own have no *Editar*; *Editar* on one's own
   opens the *Construtor de tema* in a tab, the settings page stepping
   aside: a colour typed in changes the sample and the window at once, a
   low-contrast one warns, one under 3:1 is undone with a message,
   *Restaurar padrão* puts the draft back by keyboard; *Cancelar* (or
   closing the tab and *Descartar*) puts the look back, *Salvar tema* keeps
   it, and the settings page returns on the theme's card with the focus
   there; a theme exported from its card and imported again (the button, or
   the file dropped on the window) as it was; `assets/temas/Pergaminho.verso-theme`
   applies; a hostile file is refused with the reason; a folder's
   suggested theme is offered, shown as a card, and never applied by itself.
   Level: H, A (the real file save: the host's download; the builder's tab
   in the phone layout); E: `appearance-themes.spec.mjs`.
   Second step (ADR 0109): *Mais temas…*, under the gallery, opens a dialog
   with Verso's four and the catalogue's, a labelled search (name or author),
   filters by Modo and Superfície, each card drawn with the theme's own tokens
   and with its credit and link (Flexoki's names stephango.com/flexoki as a
   link); a click uses the theme (a theme of one side takes Verso's mode to it,
   said in the status), *Copiar* keeps the credit, Escape closes only the
   dialog, a full screen with *Voltar* on a phone; *Créditos e agradecimentos*
   lists the catalogue from the files' own credits; the *Construtor de tema*
   groups Base (open), Títulos, Código, Cores das callouts and Estrutura, one at
   a time on a phone, the sample page showing h1 to h6, code, a table, a tag and
   a callout of each colour; a heading colour under 3:1 is undone. A version 1
   theme looks exactly as before. E: `more-themes.spec.mjs`,
   `themes-v2-builder.spec.mjs`, `themes-v2.spec.mjs`.
2. "Relatar problema", in the status bar: the report, "Erros desta sessão:
   nenhum". Level: H; E: `settings.spec.mjs`.
3. The command line on the folder: `verso search <folder> reunião`;
   `verso backlinks <folder> "Projeto Alpha"` (its name, as a link names
   it, or its path); `--unresolved`; `--json`. Level: A. Caught: only a path
   was found (2026-10-01).
4. An agent on the folder through `verso mcp` (note 35): asked which notes
   have the tag `projeto` and what "Tour do Verso" shows, it lists them by
   tag and reads the board's cards and edges; `links` of a note with
   `relacionado: "[[…]]"` names the relation; `query_base` on
   `Projetos.base` gives the table's rows. Nothing in the folder changes.
   Level: S (`crates/verso-cli/tests/mcp.rs`), A (a client: Claude Desktop
   or Claude Code).
5. `verso <another folder>` with the app open (note 35): the folder opens
   in a window of its own, in the same app — one Verso in the Dock or the
   taskbar, never a second app. Level: S (`a_second_launch_hands_its_folder_to_the_running_app`,
   the host's tests), A (the installed app, on macOS and Windows). Caught
   2026-10-08: on macOS a second app started, with no window.
6. "Um servidor para todo o Verso" in Terminal e agentes (note 35): the
   switch "Esta pasta é visível para agentes" appears off; the snippets and
   the entry "Adicionar ao Claude Desktop" shows say `mcp --all`. With the
   folder marked, an agent's `list_folders` names it and its tools read it
   by `folder`; unmarked, it is gone from the list. Level: H; E:
   `settings.spec.mjs`; S (`the_server_for_all_of_verso_reads_only_the_visible_folders`);
   A (Claude Desktop, with the app closed).
7. An update (note 37): from an installed version older than the newest
   release, Ajustes › Geral › Versão › "Verificar atualizações", then
   "Baixar e atualizar": the file's checksum and its signature are checked
   before anything is installed; a file whose signature is missing or does
   not verify installs nothing and says so. "Ver notas da versão" shows
   that release's news in the window's language, as plain lines — never
   the release page's download tables. A second folder of the same
   name added to Claude Desktop (note 35) gets `verso-<parent>-<name>`.
   Level: S (`an_update_installs_only_with_its_signature`,
   `a_folder_of_a_name_already_added_takes_its_parent_s_name`); U
   (`test/updateNews.test.mjs`); A (the first signed release, on macOS and
   Windows).
8. On Linux (note 35): the `.deb` installs `verso-app` and `verso` in
   /usr/bin, and Terminal e agentes says the command came with the
   package; an AppImage's "Instalar" puts `verso` in `~/.local/bin`; "Mostrar
   no gerenciador de arquivos" selects the file. Level: S
   (`scripts/check-linux-vm.sh --install`, the app opened on Ubuntu's
   desktop; `--webkit`, the suite on Linux's WebKit); A (Debian, Fedora,
   the AppImage).
9. The folder's settings (note 36, "Da pasta ou desta máquina"; [ADR
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
10. Notifications (note 37, "Notificações"; [ADR
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
    above it and its action works. On a phone the toasts are at the bottom,
    above the bottom bar and the keyboard's bar, the whole width but the margins. Level: H; E: `notify.spec.mjs`, "the
    toasts" and "toasts sit above Settings" (phone and tablet too).
11a. Someone joining a note or text file (2026-10-27; amended 2026-10-28:
    the maintainer, "it should notify, but subtly"; a board's live line says
    who is there): Presença starts at "Só na lista", so no toast on any
    screen (it covered the table chat's box and last messages). The bell
    counts the join and the list says it; beside "ao vivo" in the note the
    newcomer's mark gets a ring for about 3 s (still and fading under
    reduced motion), and the status line says "Bia entrou na nota." once.
    Set Presença to "Aviso e lista" and the toast is back as before: in the
    window in front and on the tab that shows the file, at the top on a
    desktop (never over the chat's box nor the typing line), at the bottom
    above the keyboard's bar on a phone (T.6), and the system's notification
    when the window is behind and they are on. The same person back within
    ten minutes says nothing (no ring either); people already in the note
    when it opens say nothing. On 390x844 the bell does not cover the chat's
    composer. Level: H (unit: `presenceNews.test.mjs`, `whoRing.test.mjs`,
    `notify.test.mjs`); E: `notify.spec.mjs`, "presence".
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

1. Note 11: its sticker and colour show on its tree row, in its tab and
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
4. A folder's page (opened from the button at the end of the folder's row): its folder note on top, a table of its items below. In
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
9. The embed in note 11: a click on its text edits it in place; what is
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

From the tour's stop ⑱ "No celular" and note 28 ([ADR
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
2a. The tree on a finger (ADR 0060, 2026-10-30): a tap on a folder's row —
   on its name, not only the arrow — opens or closes it; the row is 44 px
   tall; the small folder button at the row's end opens the folder's page
   (named "Abrir a página da pasta", a Tab stop of its own); a long press
   opens the row's menu, whose first item is the same. With a mouse
   (since 2026-10-31, B15): a click anywhere on the row, the name as much as
   the arrow, toggles it; the same button shows at the row's end on hover
   and on focus (a Tab stop that shows itself when reached) and opens the
   page. Level: H (a phone); E: `tree-folder-tap.spec.mjs` (both).
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
   Note 05 in Editar on a touch screen: no `+` or ⋮⋮ and no wide margin to
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
    0092](../adr/0092-the-phone-offline.md); note 28, "Sem Rede"): on a
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
12. The Android app ([ADR
    0118](../adr/0118-a-native-android-app-from-the-same-core-and-ui.md)
    Phase 1; note 28, "O App para Android"): on the phone, *Settings › Sync*
    says the folder lives inside the app and goes with it; *Settings ›
    Servers › Connect* opens the server's page in the phone's browser, and
    after the approval the server's folders are in the folder switcher and
    open in the window; the own folder syncs with a UniVerso, both ways,
    and resumes at the next opening; *Turn into a server* speaks of the
    Wi-Fi and the battery, serves with a notification that says what and to
    how many devices, pairs a device by QR and code, and keeps answering
    with the screen off; *Check for updates* is offered. Another app's
    *Share* (a text, a link, a `.md`) or *Open with › Verso* (a `.md`)
    makes a new note at the top of the open folder, named by the file or
    the first line, beside a note of that name and never over it. *Open
    another folder…* asks for All files access, then walks the phone's
    storage, opens a folder there or makes one, and the phone reopens it
    at the next start; the switcher reads *Neste celular*, *dentro do app*,
    *Celular/Documents*. *Settings › Sync* has *Sync in the background*
    (off), its *Wi-Fi only* and *Only while charging* usable with it on;
    on, a folder syncs with Verso closed under a notification. At a table,
    the game master's *Share audio* lists *Som dos apps do celular*; a
    declined screen-capture prompt is said in words. Level: H (the app
    on an Android phone over `adb`); E: `phone-android.spec.mjs` (the words
    on a mobile host, in the harness); the rest by hand,
    `manual-checks.md`, "The Android app, Phase 1".

## 13. On a server

From the tour's stop "Num servidor" and note 30 ([ADR
0073](../adr/0073-self-hosted-server-first.md), [0074](../adr/0074-accounts-and-access-on-the-server.md),
[0075](../adr/0075-server-packaging-and-storage.md)). By machine, the
server's end-to-end tests drive a real `verso serve` (`scripts/check-e2e.sh
--server`, in Docker), the server's Rust tests drive its API and
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
   shows a closed lock beside the folder's name (*Você só lê esta pasta*); the invitation shows *usado* and by whom; the
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
   real computers, by hand (`manual-checks.md`). A note edited in the
   server's window and renamed there (or its folder renamed, or moved
   with others) arrives on this computer as a rename — *renomeado aqui*
   in *Atividade recente*, never *apagado aqui*, nothing in `.trash/` —
   with the window's bytes, and an open tab of it follows it to its new
   name (*Renomeada ou movida em outro aparelho: … A aba foi junto.*); an
   edit made here meanwhile goes with it to the new name, a name taken
   here keeps both (the host's tests against a real server,
   `tests_sync_rename.rs`, a seeded property among them; the engine's,
   `sync/tests_moved.rs`; the server's log naming each file's own old path,
   `tests_sync.rs`, `a_window_move_names_each_files_own_old_path_in_the_log`;
   the real Mac and server, by hand, `manual-checks.md`). With the server down,
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
   from note 30's "Compartilhar com outra pessoa" and the tour's stop: the
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
    0082](../adr/0082-live-co-editing-of-a-synced-folder.md)), from note 30's
    section *Editar junto numa pasta sincronizada*: with the folder syncing,
    a note opened in *Editar* says *ao vivo, só você* beside its title (a
    dot, the words in its tip and to a screen reader) and in the status bar;
    each other person in it is a mark with their initial, named on hover
    or tap (*ao vivo, com Bia* in the dot's tip); more than three marks
    become two and a *+N*
    and their text arrives; what is typed goes to the room, never to the
    file, which follows the room's save; the link dropped, the note says
    *local — sem conexão*, keeps its text and saves it here; back, *A nota
    está ao vivo de novo* and what was typed is in the room; paused, *local
    — sincronização pausada*; back in another room, the note is read anew
    with its text; *Ajustes* › *Sincronizar* › *Editar notas junto enquanto
    online* off, the note leaves the room and, opened again, joins nothing
    (e2e, `live.spec.mjs`); in that state the note and the board tabs of a
    synced folder show *Edição ao vivo desligada nesta pasta* (a button
    that opens *Ajustes* › *Sincronizar*), gone again when the setting is
    turned on, never on a server folder or a plain local one
    (`liveOff.test.mjs`). A property set in the panel of a live note —
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
    note 30's *Editar junto* and the tour's stop "Num servidor": with the
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
    the owner of a folder copies note 22's secret block into a note and
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
    A die inside the block and one in the open with the same code (both
    `dice: 1d20`): the owner rolls either, and the reader hears neither,
    nor finds it in the note's rolls on joining again (the roll may be the
    hidden die's); a code written only in the open is heard (ADR 0088,
    amendment of 2026-10-31).
    Level: H; R: `tests_secret.rs` (every command of the contract as a
    reader, a live note, sync, a share, a role made reader), the core's
    `tests/workspace/reader.rs`, the index's `tests/secret.rs`, the
    dialect's `tests/secret.rs` and `fixtures/callout/secret` (approved
    2026-10-15); A: `manual-checks.md`.

14. The installation lesson (note 31, "Instalar o seu UniVerso, Passo a
    Passo"): the tour's "Num servidor" stop shows notes 30 and 31 side by
    side, and note 30's *Instalar* links to 31. In 31 every fenced block
    (`bash`, `yaml`) copies whole, and each command, path, port and
    variable reads the same as in `docs/reference/server-hands-on.md`; the
    note says Verso is in testing, with no public download yet; and the
    links to `#Se algo der errado` and to note 30's *O primeiro admin e as
    contas* land on their headings. Level: H; R: `scripts/demo-vault.mjs
    check` (links and headings of the vault).

15. This app is a server (note 28, *Parear o Celular com o Seu Computador*;
    [ADR 0096](../adr/archive/0096-this-app-is-a-server.md)): *Ajustes* › *Este app é
    um servidor* offers the folders opened on this computer, none ticked; a
    folder of one's own that also syncs with a server is ticked like any
    other, and one another account shared with the person cannot be (its
    row says so; 2026-11-04). Nothing ticked,
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
    note 31, section 6, *O caminho mais curto*): in *Settings › Servers*,
    *Encontrados nesta rede* lists a UniVerso announced on the network with
    the address each row will use and *sem HTTPS* when it is plain; a click
    fills that address and starts the sign-in as if typed, and nothing
    connects before it. A server with its own TLS and no `VERSO_PUBLIC_URL`
    is listed with what to set and no button. Changing section ends the
    browse. By machine: `app/ui/e2e/servers-found.spec.mjs` (the harness
    feeds the list) and `app/ui/test/serversFound.test.mjs`; by hand, on a
    real network, the checks in `manual-checks.md`. Level: H for the list,
    A for the network; R: `scripts/demo-vault.mjs check` for the note.

17. Files only in the cloud, downloaded from the sync card ([ADR
    0043](../adr/0043-placeholder-guard.md), decided 2026-10-27; note 30,
    section *Syncing a folder from this computer*): *Settings › Sync* lists
    files not on this computer yet with *Baixar N arquivos (X MB)*; the size
    is said before anything starts; a disk without room (or whose room cannot
    be told) refuses, with the message, and downloads nothing; while it runs
    *Baixando 12 de N…* is announced and *Parar* ends the run after the file
    in hand; files that cannot come down stay listed with their reason and
    the older `.Name.ext.icloud` form is listed as not downloadable from
    here; a file already synced and sent back to the cloud is not in the card
    but in the quiet line *estão só na nuvem; o servidor tem a cópia*. By
    machine: `app/ui/e2e/sync-placeholders.spec.mjs` (the harness answers
    `placeholder_plan` and `fetch_file`), `app/ui/test/syncPlaceholders.test.mjs`
    and the Rust tests of `sync/cloud_only.rs` and `tests_sync1.rs`; by hand,
    on real evicted iCloud files, the check in `manual-checks.md`. Level: H
    for the card, A for iCloud; R: `scripts/demo-vault.mjs check` for the
    note.

## 14. Features, oracle, sheets and worlds (notes 23 and 24, the Fractal campaign)

Open note 23 (*Fichas*, the sheets) and note 24 (*Oráculos e Criação de Mundos*,
the features, the oracle and the wizard) in Leitura, in a folder that has the
demo content. The steps below follow them (1 to 3 in note 24, 4 to 6 in note 23); the Fractal campaign is
the folder `Campanha Fractal/` beside it ([ADR
0098](../adr/0098-world-and-campaign-wizard-template-bundles.md), [ADR
0099](../adr/0099-visual-markdown-statblocks-and-cards.md), [ADR
0102](../adr/0102-creative-oracles-and-improvisation.md), [ADR
0103](../adr/0103-feature-presets-and-capability-flags.md)).

1. *Ajustes* › *RPG & Mesa Solo* › *Dados e RPG* lists five switches, *Dados*, *Tabelas
   sorteadas*, *Oráculos*, *Fichas* and *Assistente de mundo e campanha*, all
   on; the shortcuts *Tudo* and *Só escrita* are in *Aplicação* › *Recursos*; the old "Modo de Uso" is
   nowhere. *Só escrita* first says what it will turn off and does nothing on
   *Cancelar*. Turn *Oráculos* off, close Settings: the `[!oracle]` callout of
   the note is drawn with no *Consultar Oráculo* button, and ⌘⇧P offers no
   *Oráculo (sim/não e faíscas)…*. Turn it on: the button is back. No file
   changed (note 24 in Fonte reads as before). Level: H; E: `oracle.spec.mjs`
   (the switch), `statblock.spec.mjs` and `world-wizard.spec.mjs` (the
   others); U: `test/capabilities.test.mjs`.
2. The oracle in the note. In the callout of note 24 *A patrulha da guarda ouviu o
   barulho da invasão?* click *Consultar Oráculo*: the dialog opens with the
   question filled in, three tabs (*Sim ou Não*, *Faíscas*, *Tabelas*) and the
   five odds as a radio group. *Consultar* shows one of the six answers with
   the d100; *Gravar no callout* writes one line into the callout and closes.
   Again, same question: a second line below the first. Edit the question's
   words in the dialog and consult: the lines the oracle wrote are replaced,
   the line about the *oficial novato*, which was typed by hand, stays. With
   the caret outside a callout, the button reads *Inserir na nota* and a new
   callout appears at the caret, never inside a quote, a table or a code
   fence. With two `[!oracle]` callouts in a note, change the second one's
   text outside Verso (the reading view draws only that callout again):
   its *Consultar Oráculo* opens with its own question and writes into it,
   never into the first, and never says the callout moved (ADR 0102,
   amendment of 2026-10-31: the core numbers each callout's line,
   `data-oracle-line`). Level: H; E: `oracle.spec.mjs`; U:
   `test/oracleLocate.test.mjs`, `test/oracle.test.mjs`; R: the dialect's
   `render.rs`.
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
4. Statblocks. Note 23 holds one card for each built-in layout (34), none with
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
   tour or from note 23). The first line is Fractal's credit, word for word as
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
   with the fault and *Copiar pedido de correção para a IA*. A valid pasted JSON,
   *Validar e Importar*, becomes a card and the file `.verso/bundles/<id>.json`;
   pasting it again keeps it under a new id and says so; with the window in
   English the four built-in bundles list and create English folder and note
   names (*Sessions*, *Templates/Session Log*); close the wizard and
   open it again: the cards are still there (read from the folder). Level: H; E:
   `world-wizard.spec.mjs`; U: `test/bundles.test.mjs`, `test/bundleStore.test.mjs`.
8. *Ajustes* › *Aplicação* › *Créditos e agradecimentos*: the people and
   works the app starts from, the notices of the shipped layouts and the open
   software, each with *Abrir* that opens its site in the browser. Level: H
   (the page); A (the link opening in the system's browser); U:
   `test/credits.test.mjs`.
9. Maps from Watabou's generators ([ADR 0120](../adr/0120-maps-from-watabous-generators.md);
   note 24, *Mapas dos geradores do Watabou*). Export a dungeon at
   watabou.github.io/one-page-dungeon as JSON and as Markdown. ⌘⇧P ›
   *Importar mapa do Watabou…*: drop both on the dialog (or *Escolher
   arquivos…*). It reads *One Page Dungeon “…”: N salas numeradas, com o
   desenho.* and *Cria a pasta “…” com a nota, o board com o desenho e
   ….json.*; nothing is written yet. *Importar*: the folder appears with its
   note (the folder's own) and the JSON, the note opens (properties
   `generator`, `seed`, `generator_link`, `map`; then the generator's text,
   in English, as exported) and the board opens beside it: the rooms, walls,
   doors, water and columns drawn by Verso, the room numbers where the
   generator puts them, matching the note's list, and the note as a card.
   Double-click the drawing and move a wall: it is an ordinary drawing. Import
   the same files again: the dialog offers the folder of the last import
   (not the new map's folder in front); the folder is *“… 2”*, the first
   untouched. Save a region at watabou.github.io/perilous-shores and import
   it: one note, *Cidades*, *Perigos*, *Lugares*; click a town: its note is
   made with its description, `seed`, the generator embedded at that seed
   (asked about once) and *Abrir no gerador*. Export a house at
   watabou.github.io/dwellings (*Export › as JSON*) and import it: *Dwellings
   “…”: N andares, M cômodos, com o desenho.*; the note says the house in a
   sentence and lists every room under *Porão (B)*, *Térreo (GF)*, *1º andar
   (1F)*…, with its squares, doors, stairs and windows; the board has one
   frame per floor, side by side, the stairs at the same spot in each, rooms
   named as in the note (*Room 1*, *Room 2* where a floor has two), the
   windows over the outer walls, the entrance's arrow, a spiral stair as a
   round tower. A city's JSON is named, not
   imported. ⌘⇧P › *Novo mapa gerado…*: pick a generator, the seed drawn (or
   typed), *Criar nota*: the note embeds the generator (asked about once)
   with `seed` in its properties. Level: H (the import, the drawing, the
   region, the generated note); A (the generator's *Export* inside the note
   saving into the folder, `docs/reference/manual-checks.md`); E:
   `watabou-import.spec.mjs`; U: `test/watabou.test.mjs`,
   `test/watabouHouse.test.mjs`.

## 15. Structured data as a diagram (note 16, the sample files)

Open note 16 (*Dados Estruturados como Diagrama*) and the two files of
`Dados de Exemplo/` in a folder that has the demo content ([ADR
0106](../adr/0106-structured-data-as-a-diagram.md)).

1. `npcs-da-campanha.json` opens as text, with *Texto | Diagrama* at the top of
   the tab. *Diagrama* draws boxes and lines: the root, *npcs* with its three
   people, each with *itens* and *segredo*, and *locais*. A cut value has a
   *…* that shows all of it; Esc closes. *Texto* brings the editor back, and
   the file on disk is as it was (nothing is ever written by the diagram).
   Level: H; E: `datagraph.spec.mjs`; U: `test/datagraph.test.mjs`.
2. Drag a box by its title: what hangs under it goes along; with Alt held,
   only the box. Close the tab, open the file again as a diagram: the boxes
   stand where they were put. *Arrumar de novo* puts them back. Level: H; E:
   `datagraph.spec.mjs`.
3. Fold a branch with its arrow or Enter: the box says *3 itens* or *6
   chaves* and what hung under it is gone; *Recolher tudo*, *Expandir tudo*
   and *Expandir até o nível…* do the same for all. Search *revelada*: the
   match inside a folded branch opens the way to it; Enter and Shift+Enter
   go on and back, Esc clears. Level: H; E: `datagraph.spec.mjs`.
   On a phone (390 wide) the toolbar is one row of icons (search, zoom out,
   zoom in, fit, "…"); the "…" menu holds *Recolher tudo*, *Expandir tudo*,
   *Expandir até o nível…*, direction, *Arrumar de novo*, *Salvar como
   board…*; the search opens over the row; the one-line hint is dismissed
   for good. Level: H; E: `datagraph-phone.spec.mjs`.
4. Open the same file in a second pane (⌘\) as text and click a box: its range
   is selected in the text; put the caret in the text and the box holding it
   is marked; type a letter and the diagram follows after a pause; break the
   JSON and the last diagram stays under a line with the error and *Ir ao
   erro*, which goes to the place. Level: H; E: `datagraph.spec.mjs`.
5. By keyboard only: Tab into the diagram, ↓ ↑ between siblings, ← to the
   parent, → to the first child, Enter or Space folds, Alt+arrows moves the
   box, T goes to the text, / to the search. A screen reader reads a tree,
   with levels and *expandido*/*recolhido* (VoiceOver: by hand,
   `manual-checks.md`). Level: H; E: `datagraph.spec.mjs`.
6. Right-click a row: *Copiar caminho* gives `$.npcs[0].itens`, *Copiar valor*
   the value. Level: H; E: `datagraph.spec.mjs`.
7. `npcs-da-campanha.yaml`: two roots (*#1*, *#2*, a second document), a
   dashed line from `conhece: *aliados` to the box marked `&aliados`.
   Level: H; E: `datagraph.spec.mjs`; U: `test/datagraph.test.mjs` (a file built
   to expand into millions of values draws a few boxes).
8. Note 16's own ```json block: *Ver como diagrama* on the block opens its
   diagram in a tab beside, read-only, without the text switch. Level: H; E:
   `datagraph.spec.mjs`.
9. *Salvar como board…* (the bar, or ⌘⇧P): a dialog with the name, the folder
   and *O board terá N cartões de texto e M linhas*; *Criar board* writes the
   `.canvas` and opens it. Level: H; E: `datagraph.spec.mjs`.
10. *Ajustes* › *Aplicação* › *Recursos* › *Diagrama de dados* off: no
    *Texto | Diagrama* on a new tab and no button on the blocks; no file
    changed. On: back. Level: H; E: `datagraph.spec.mjs`.
11. A trackpad's pinch or Ctrl with the wheel zooms the diagram (not the
    window); two fingers on a screen pinch and move it. Level: H (the wheel);
    the fingers by hand.

## 16. Colour swatches (note 06)

Open note 06 (*Colour Swatches*) in a folder that has the demo content
([ADR 0108](../adr/0108-colour-swatches-for-colour-codes.md)).

1. *Leitura*: a small square of the colour before each code of the note, in
   inline code, in the code block and in the table; none beside a bare
   `#abc`-style tag in text; none inside `[[nota#abc]]`. A click on a square
   opens nothing. The file on disk is as it was. Level: H; E:
   `swatches.spec.mjs`; U: `test/colour.test.mjs`.
2. *Editar* and *Fonte*: click the square of `#1d9e75` (or Tab to it and
   Enter): the picker opens below it, inside the window, with the code at the
   top, the saturation and brightness square, the opacity strip and the hue
   strip. Drag and let go: only the code's characters change, in the same
   format (hex case and digits, `rgb()` with spaces or commas, `hsl()`);
   ⌘Z puts the original back; Esc closes it and puts the code back. Level: H;
   E: `swatches.spec.mjs`.
3. By keyboard only: Tab goes round the three controls, the arrows adjust
   (Shift for bigger steps), Enter applies and closes. VoiceOver reads each
   control by name (by hand, `manual-checks.md`). Level: H; E:
   `swatches.spec.mjs`.
4. On a phone's width the picker stays inside the screen. Level: H; E:
   `swatches.spec.mjs` (`@layout`).
5. *Ajustes* › *Aplicação* › *Recursos* › *Amostras de cor* off: no square
   anywhere, no file changed. On: back. Level: H; E: `swatches.spec.mjs`.

## 17. The table (note 25)

Open note 25 (*The Table*) in a folder that has the demo content
([ADR 0107](../adr/0107-the-table-a-shared-roll-and-chat-log.md), phase 1).

1. Open the right panel, tab *Mesa* (the *Table*): empty, with the line that
   says it is this window's and not kept. Roll `dice: 1d20+3` in the note,
   a table's `dice:` and the palette's *Rolar dados…*: three lines, oldest
   first, each with *Você*, the time, the note (a link that opens it; the
   roller has none), the notation, a chip per die and the total. The note on
   disk is as it was. Level: H; E: `table.spec.mjs`; U: `test/tableLog.test.mjs`.
2. On a board, a `dice:` in a text card rolls at rest: a line with the board's
   name. Level: H; E: `table.spec.mjs`.
3. In a shared note (a UniVerso), another person rolls: with the panel
   closed, the *Mesa* tab, the right panel's buttons and the phone's *Painel*
   show a count; open it: the count is gone, the line has their name, a screen
   reader says "Bia rolou: …" once (the panel's own region; the note's is
   quiet). The rolls the room held when the note was opened are there, not
   counted. Level: H (the room is the harness's); E: `table.spec.mjs`. By hand
   on a real server: two windows, `manual-checks.md`.
4. *Ocultar daqui pra trás* empties the list in this window only, *Mostrar de
   volta* brings it back; a roll made after the hiding is shown. Level: H; E:
   `table.spec.mjs`.
5. *Adicionar à nota…* on a line: pick a note, read the sentence that will be
   written, *Cancelar* writes nothing, *Adicionar* appends one line after a
   blank one (who, time, link to the note, notation and total); a note that
   changed meanwhile is refused. Level: H; E: `table.spec.mjs`.
6. A roll heard with the roller's dice (`styles`) draws its chips in them; a
   malformed style falls back field by field. With the 3D dice on, a room
   roll falls in 3D; *Mostrar em 3D as rolagens dos outros* off, it does not.
   Level: H; E: `table.spec.mjs`. Falling in the roller's dice waits for the
   server to send them (phase 2).
7. *Ajustes* › *RPG & Mesa Solo* › *Dados e RPG* › *Mesa* off: no tab, no
   button, no count; the dice roll as before. On: back. Level: H; E:
   `table.spec.mjs`.
8. On a phone's width, *Painel* › *Mesa* opens a sheet from the bottom, resting
   on the bottom bar, that never scrolls the page sideways; the add button is
   at least 32 px. Level: H; E: `table.spec.mjs` (`@layout`).
9. Saved rolls (note 25, *Saved rolls*): in the dice row under the message
   field, the bookmark button opens a pop-over; *Escolher nota…*, pick a note
   with two lines like ``- Ataque da Bia: `dice: 1d20+7` ``: two buttons, named
   *Ataque da Bia* and the other line's text. Click one: the pop-over closes,
   the message field holds `/r 1d20+7` and nothing is rolled; step the modifier
   and press the dice button. Open the bookmark again, type a name, press
   *Salvar*: one line is appended to the note, a button appears. On a server as
   a reader there is no *Salvar*; as a player with a note granted to that player
   alone, the pop-over names it by itself. On a phone's width the pop-over stays
   inside the window and each button is at least 44 px. Level: H; E:
   `saved-rolls.spec.mjs`; U: `test/savedRolls.test.mjs`.
10. The dice row (note 25, *Composing a roll*): under the message field there is
    one row, about one button tall: d4 d6 d8 d10 d12 d20, the dots, a number
    field showing 0, KH, KL, the bookmark and the dice button. Click the d6
    twice and the d20 once: the field reads `/r 2d6+1d20`, badges show 2 and 1,
    nothing is rolled. Right click the d6: `/r 1d6+1d20`. KH: `/r 1d6+1d20`
    becomes two dice each with `kh1` (`/r 2d6kh1+2d20kh1`), KH lights; KH again
    undoes it. The dots open d2 d3 d66 d100 dF; Escape closes them. Type
    `/r 3d8+2` in the field: the d8 badge says 3 and the number field 2. Press
    the dice button: one roll in the log and the field empty; at a server the
    button reads *Rolar em segredo* while *Secreta* is on. In the message
    field, `Shift+Enter` breaks the line and `Enter` sends; the log shows both
    lines. On a phone's width the row fits (it may scroll inside itself, never
    the page) and its buttons are at least 40 px tall. Level: H; E:
    `composer.spec.mjs` (`@layout`); U: `test/composer.test.mjs`.
11. The message box (note 25, *Everyone's table, on a UniVerso*): the foot of the panel
    is ONE box — no notation field, no row of image / dice / Secreta buttons.
    The field starts three lines tall (two on a phone) and grows to eight.
    The paperclip picks an image; a screenshot or an image copied and pasted
    with `Ctrl+V` / `⌘V`, right click › *Colar* or a long press › *Colar* on a
    phone, or dropped on the panel, waits in the box as a thumbnail with an
    ×; `Enter` sends the image and then the text. A GIF stays animated in the
    log; 10 MB and the type are checked when it is pasted. A reader has no
    paperclip. The selector in the dice row (*Pública* / *Secreta*) makes the
    next roll secret. As the owner of a server's folder that is not a table,
    the panel shows *Tornar esta pasta uma mesa*; after it, *Abrir a janela da
    Mesa*; in a folder only on this computer, one line says why there is no
    table. Level: H (the real app's paste menu is H only); E:
    `table2.spec.mjs`, `campaign.spec.mjs` (`@layout`).

## 18. Running a table (note 26)

Open note 26 (*Running a Table*) in a folder that has the demo content
([ADR 0110](../adr/0110-a-table-is-a-campaign-folder.md), phase 1). The folder
must be a server's, and the person its owner.

1. Right-click a folder › *Tornar esta pasta uma mesa*: the *Mesa* dialog
   opens, the status line says the folder became a table, the folder has the
   table mark, and every note under it has the padlock "Oculta da mesa". On a
   folder of this computer alone the row is not there. Level: H; E:
   `campaign.spec.mjs`.
2. Right-click a hidden note › *Acesso…*: the table has a *Whole table* row and
   one row per player, each *Does not see*, *Sees* or *Edits*. *Whole table* ›
   *Sees* releases the note to everyone and the padlock goes; setting one player
   to *Sees* releases it to them alone (the others never see it), and a player
   set to *Edits* is added to those who see it, with a warning if the note has
   secret blocks. With several notes selected, *Access for N files…* sets them
   at once. On a folder of the table, *Acesso…* applies to everything inside it
   (the footer has *Cancel* / *Apply* and says *Changes N files*). Each row is
   one compact select; a note saves at once and the footer says *Salvo ✓* with
   *Desfazer*. Level: H; E: `campaign.spec.mjs`, `audience.spec.mjs`,
   `access-dialog.spec.mjs`.
   Inside a note of the table, the users icon beside the star lists who sees
   it: hover, tap, or Tab + Enter; Esc closes; on a phone it is a bottom sheet.
   Level: H; E: `audience.spec.mjs`.
3. In the dialog: *Mesa aberta* off and on; *Convidar jogadores* › *Gerar link*
   shows a link to copy (single use, 7 days); *Liberar tudo* asks first; the
   limits take 1,000 to 200,000 entries and 1 to 30 MB and refuse the rest;
   *Desfazer mesa* asks first. Level: H; E: `campaign.spec.mjs`. The invitation
   itself, with the fresh proof, is the server's: A.
4. Right-click a note › *Acesso…* › *Edits* on a player's row (or on *Whole
   table*); right-click a hidden note › *Acesso…* › *Nome secreto* (in *More
   options*). Level: H; E: `campaign.spec.mjs`.
5. As a player (a second account, the invitation's link): the tree has only
   the released notes; a link to a hidden note reads "texto 🔒", with an alias
   "apelido 🔒", a secret name ▒▒▒▒, an embed "🔒 (ainda não revelado)"; the
   quick switcher does not find a hidden note; a note granted to the player can
   be typed in, the others refuse it. Level: H; E: `campaign.spec.mjs`. With
   the real server: A, and every read path is tried in
   `crates/verso-server/src/tests_campaign.rs` (U).
6. Close the table (*Mesa aberta* off) with a player inside: the player's
   window leaves the folder, and opening it again answers "a mesa está
   fechada"; the owner enters. Level: U (`tests_campaign.rs`); A with two
   accounts.
7. The dialog's exceptions. Right-click a folder › *Acesso…*: set *Whole table*
   to *Sees*, then *Apply*; the footer says how many files change. Then set one
   file inside the folder to *Edits* for a player: the folder's dialog has the
   line *1 file with own access · View*, which opens a second view with a
   search and *↺ Follow* on each row; the button returns it to the folder's
   access and the list empties. After a change of the folder, the dialog asks
   *Keep* (default) or *Follow the folder in all*; *Follow the folder in all*
   in the second view asks first. Level: H; E: `access-dialog.spec.mjs`.
   Folder page strip: under the folder's title, *MESA ● Aberta · N players · N
   online* with *Access…*, *Invite*, *Open the Table* and the gear (the *Mesa
   aberta* switch is in the settings); a player sees one line and *Join the
   Table*. Level: H; E: `campaign.spec.mjs`. A file moved into the folder
   from elsewhere keeps its own access and is listed as an exception. Level: H.
8. The tree's marks. A hidden note has a padlock beside it; a note a player
   edits has a pencil. Inside a table a player does not see the folder's own
   padlock. Level: H (by hand; no E yet).
9. The four rights (ADR 0113 K.6). In the Table window, the players list has a
   *Direitos* count per player, `0/4` for a new player; its button opens four
   switches under the row: *Imagens*, *Arquivos*, *Cria notas*, *Cria boards*,
   all off, each saving at once ("Salvo"); under the table a box per right for
   everyone, mixed when the players differ. On a phone each target is 44 px and
   nothing scrolls sideways. As that player (a second account): with *Imagens*
   the attach and paste controls appear at once, without a reload, and an image
   goes to the chat; a PDF or an audio file there says "O mestre não te deu o
   direito de enviar arquivos; nada foi enviado." until *Arquivos* is on (and
   then it lands in the table's attachments folder). Turn the rights off: the
   controls go. Level: H; A with two accounts.
   A player who *Edits* a board in a folder pastes a new image on it: the file
   lands in `assets` beside the board (whatever Settings > Files and links
   says), not in the table's attachments folder; the game master and the
   players who see the board see the image, a player who does not see the board
   does not, and the chat's images still go to the table's attachments folder.
10. A player who *Edits* a note. As that player, drag a roll or a chat message
    from the *Mesa* panel onto the note's text: a line shows where it lands, and
    one ⌘Z takes it back. An image does not drag; use the message's ⋯.
    Level: H; A with two accounts.
11. A player who *Edits* a board. As that player, move a card the player may see:
    the other players see the move live. The locked cards of files the player
    does not see stay locked cards. Level: H; A with two
    accounts.
12. A player who *Edits* a folder. As that player, *Rename* is offered on what is
    in it; *Delete* and moving files are not. *New note*, *New folder* and *New
    base* appear only with *Cria notas*, *New board* only with *Cria boards*
    (a keyboard shortcut for the missing one says "O mestre não te deu o
    direito de criar boards." where the player is). A player who *Edits* a file
    (no right at all) pastes an image into it and renames it; a PDF needs
    *Arquivos*. Level: H (by hand;
    no E yet).
13. The table's log end. In the *Mesa* panel, send a message: the log scrolls so the
    whole new card, border included, is above the composer. Scroll up, have
    another person send one: the log stays, a *New message ↓* button with a count
    appears above the composer and jumps to the end; it goes away at the bottom.
    Also at 390×844. Level: H (E not run on the Mac).
14. An image arriving late. On a desktop folder synced with a server, have a player
    in the browser paste an image into the table's chat. In the *Mesa* panel the
    card shows "arriving…" for a moment and then the picture, without reloading
    the window and without the other cards blinking. Stop the sync (offline) before
    the player sends: after about a minute the card is the file name with "try
    again"; go back online, click it, the picture loads. Level: H (needs a server
    and a synced desktop; E not run on the Mac).

## 18b. A focuses file only in the cloud (ADR 0043)

With a folder whose `.space/waypoints.json` is an iCloud placeholder (macOS):

1. Open the Focuses tab: the notice says the file is in the cloud, with a
   "Download now" button. Nothing was downloaded yet.
2. Click it: the status line says it is downloading, then that the focuses
   were read again; the notice goes away (or the make.md focuses appear).
   If the folder was never asked about keeping focuses the same as make.md's,
   the question comes up once now. After "no", the notice reads "Focuses kept
   in Verso only" with a "Change" button that opens Settings › Organizing.
3. A focus with no folders shows the hint to right-click a folder or file in
   the note list and choose "Add to focus…".

### Quiet saving and indexing

1. Type in a note with a long title (two lines at a narrow width) and pause:
   the title does not rewrap, the scroll does not move, no glowing line shows
   at the top, and "Saved." leaves the status line by itself. Level: A.
2. Open a large folder: after about a second and a half the progress shows;
   it goes when the walk is done. Level: A.

## 19. The end

1. The log after the line noted: no `ERROR`. The app's stderr: empty. The
   console: nothing red. Level: A; E: every test, in the harness.
2. Put back what a step changed in the shared settings (the right panel's
   tab, the palette, the theme).

## Theme per folder and per person (ADR 0100 item 4, 2026-10-27)

1. Open two folders in two windows. In window A open Settings › Aparência › Temas:
   "Só nesta pasta" is selected (opening the panel stores nothing). Pick another theme: window A changes, window B (another folder) does not, in the gallery, the theme builder and the suggestion banner alike. The text size stays the same in both.
2. Pick "Padrão para todas as pastas" in A (confirm forgetting A's own theme), then a theme: the
   default changes, so B, with no theme of its own, shows it too (this pick is remembered by the
   window until the folder changes or the app restarts).
3. In B choose "Só nesta pasta" and a theme; A keeps the default.
4. Accept a folder's suggested theme: it becomes that folder's choice, the default is unchanged.
5. The same shared folder on a second device of the same person may carry its own choice there (the choice is keyed by the folder's key on that device).
6. Another account on the same folder sees its own theme, never this one.

## A player's image on a board (2026-10-28)

1. On a shared table, as a player who may edit the board "Board do grupo" but only reads the folder, paste, drop or choose an image on the board: it appears at once and for the game master too, with no reload; the server logs no "you may only read this folder".
2. A player who edits the board needs no right for a new image (ADR 0113 K.6): pasting an image works with every right off. Taking *Edits* from the board makes pasting say that the player only reads it, and nothing is written.
3. Drop a GIF file (and paste one copied as a file): the card keeps animating. (A GIF copied with the browser's "Copy image" is turned into a PNG by the browser before Verso sees it; drag the file instead.)
4. As the game master, with the player's image sent while the file is still on its way by sync: the card fills in by itself within seconds.

## A file opened without its folder (ADR 0114, note 08, 2026-10-30)

1. In a terminal, `verso ~/Downloads/nota.md` (or `open -a "Verso Beta" nota.md`, a double-click in Finder with Verso chosen under Open with, or File › Open File…): the app opens the file in a window with no tree, no ribbon and no search; the bar above the tabs says `nota.md · em Downloads` and has **Abrir a pasta inteira**; the right panel keeps the outline only; the palette lists no new note, no graph, no bin, no split, no version history. Level: A; E: `loose.spec.mjs`, the window with `?loose=1`.
   - The bar is the window's top row: on macOS its text starts right of the three window buttons, centred on them, and dragging the bar's empty part moves the window (a double click zooms it); on Windows and Linux it stays clear of the app's own buttons at the right and the menu button at the left. Narrow the window to its minimum (360 px): the bar stays on one line, the names shorten with an ellipsis, the buttons stay. Level: A (the real buttons); E: `loose.spec.mjs` (`&frame=mac`, `&frame=windows`, 360 and 1280 px).
   - Under the bar: no crumb row with a lone "/", no "Propriedades" header for a file without front matter; the status bar shows the words, the palette, the notifications, the bug report and the right panel — no clock of version history, no **dividir**. Level: A; E: `loose.spec.mjs`.
2. Edit a line: the file on disk changes and nothing appears beside it (no `.verso`, no index sidecar for `~/Downloads` under the configuration directory). Level: A; E: `loose.spec.mjs` (the file in memory); `crates/verso-fs/tests/scope.rs` and `crates/verso-core/tests/loose.rs` (nothing beside the file).
3. Open a second `.md` from another folder: a second tab of the same window; `cargo`-style folder commands typed into the palette are refused with "not available for a file opened without its folder". Level: A; E: `loose.spec.mjs`; `app/src-tauri/src/tests.rs` (`a_file_handed_to_the_running_app_opens_in_the_loose_window`).
4. A `[[Vizinha]]` whose note is beside the file opens as a tab; `[[Longe]]` says there is no note of that name and creates nothing; `![[foto.png]]` beside the file shows; `![[Vizinha]]` is drawn as a link. Level: A; E: `loose.spec.mjs`.
5. `chmod 444 nota.md` and open it: read only with the reason above the text and the editor locked; a 9 MiB file opens in Source, read only. Level: A; E: `loose.spec.mjs` (`?ro=permissions`, `?ro=too_large`).
6. Delete the file in Finder while open: the tab keeps the text with **Gravar aqui de novo** and **Salvar uma cópia…**; the first makes the file again, the second opens the system's save dialog. Level: A.
7. **Abrir a pasta inteira**: the confirmation names the folder; the folder opens as a normal window. A file inside a folder opened before (e.g. `~/Downloads/verso-vault-test/projetos/projetos.md`) shows one more button named after that folder, **Abrir “verso-vault-test”**, which opens it without a confirmation; when that folder is the file's own, it is the only button. In a narrow window, the whole folder's button is a folder mark (its tooltip says the words). Level: A; E: `loose.spec.mjs` (`?known=1`).
8. Settings › Arquivos e links › **Abrir arquivos .md com o Verso por padrão**: the gesture of this system; on Windows the button opens Default apps. Level: A.
9. A data file (ADR 0114 items 31–34, 2026-10-31): `verso ~/Downloads/inventario.json` (item 34, the command line) or File › Open File… (the picker lists `.json`, `.yaml`, `.yml`, `.toml`, `.xml` and `.csv` beside Markdown; E: the host's tests, `cargo test -p verso-app` and `-p verso-cli`), or `open -a "Verso Beta" ~/Downloads/inventario.json` (or Open with › Verso on a `.json`, `.yaml`, `.yml`, `.toml`, `.xml` or `.csv`): the loose window opens it **in the diagram**, the bar with the diagram's icon and the file's name; the diagram's menu has no **Salvar como board…**. **Texto** shows the text; edit a value and the file on disk changes, nothing beside it; back on **Diagrama**, the box shows the new value. Change the file in another editor while the text tab is open with nothing typed: the text follows; with something typed, the conflict banner. Level: A; E: `loose.spec.mjs` (`?loose=1&file=Inventário.json`, `&file=config.yaml`); `app/src-tauri/src/tests_loose.rs` (`a_data_file_handed_opens_loose_and_is_read_and_written_as_text`).
10. A `.json` that does not parse (`{ "a": [1, 2`) opens as its text, with the diagram's line above it ("O texto não é válido: … Aberto como texto."); with Ajustes › Aplicação › Recursos › **Diagrama de dados** off, any data file opens as text. Level: A; E: `loose.spec.mjs` (`&file=quebrado.json`).
11. A `.txt` handed the same way says it is not a file Verso opens and nothing opens. Level: A; E: `tests_loose.rs`.

## A note above 16 MiB (spec Q17, 2026-10-31)

1. Put a Markdown file of more than 16 MiB (e.g. `head -c 17000000 /dev/zero | tr '\0' a > Grande.md`, one long line is enough) in the folder and open it: above the text a line says the note is over 16 MiB and out of the index, so search and backlinks do not see it; a normal note shows no such line. Level: H; E: `big-note-notice.spec.mjs`; the core's side (`INDEX_MOST`) is in `verso-core`'s tests.

## The guided installer (ADR 0075 amendment, note 33, 2026-10-30)

On a fresh Ubuntu 24.04 machine (a VM; Oracle's free shapes if you have an account), as in note 33:

1. `curl -fsSLO https://versomd.com/universo.sh && sh universo.sh`: the menu opens, with arrows when `whiptail` is there and a numbered list otherwise, in the language of `LANG`; `0` or Quit leaves. Declining a step ("Go on?" with `n`) runs nothing. Level: A; E: `scripts/check-installer.sh` (menu driven by a script, both languages, a declined step).
2. Option 1, Install: on a 1 GB machine it offers a swap file first; after the install it prints the short "back in the menu" lines, and on Oracle the VCN steps. Level: A (swap and install through the .deb: `scripts/check-installer.sh`; a real Oracle machine: manual).
3. Option 2, HTTPS, with the free name: the certificate arrives, `https://<ip-with-dashes>.sslip.io` opens the sign-in page on the phone. With a port closed on purpose (Oracle's security list), the message says the port is closed, in words. Level: A, on a machine with a public address; Let's Encrypt itself is not reached by the automated check (Caddy's internal CA stands in).
4. Option 3, First admin: the password is typed hidden, twice; the e-mail and password sign in on the phone; `/etc/universo/universo.env` holds no admin password afterwards. Level: A; E: `scripts/check-installer.sh` (including a pty: nothing echoed).
5. Option 7, Support: the file has no password, token or e-mail, and says so at the top. Option 10: the backup and update timers are off until turned on; `sh universo.sh schedule status` shows them. Level: A; E: `scripts/check-installer.sh`.


## Server hardening of 2026-10-31 (B9, B11, B13)

1. The memory limit (B9): in note 31 (both vaults) both compose files carry `mem_limit: 768m` with a line saying why; `docker compose config` of the file prints `mem_limit: "805306368"`. Level: A on a real container: `docker stats universo` shows a 768 MiB limit. Check: `scripts/check-server-image.sh`.
2. The trash's size cap (B11): on a test server started with `VERSO_TRASH_MAX=1MB`, delete notes or files in a folder until its trash passes 1 MB: within seconds the oldest entries are gone from the trash (the folder page in the console shows the new size, and the audit log has `trash_over_cap` lines), the newest stay, and nothing outside `.trash/` is touched. Level: H (server); E: `tests_trash.rs`, `tests/trash.rs` of verso-core.
3. The old address (B13): on a server with `VERSO_PUBLIC_URL=https://<its name>` set, open `http://<its IP>:7340` in a browser: a page, not a bare line, in the browser's language first and the other below, saying the address has changed, with a link that opens the public one; the page names no address you typed. `curl -si http://<its IP>:7340/api/me` still answers `421` with JSON (`"error":"host"`). Level: A for the browser; E: `tests_http.rs`, `wrong_host.rs`.

## Only the folder's owner deletes, outside a table (ADR 0113 B, amended 2026-10-31)

On a UniVerso, with the owner's account and an editor's (two browsers, or the browser and the desktop app), a folder with a shared subfolder `Mesa` shared to a third account as editor, and no table, as in notes 07 and 30:

1. As the editor, right-click a note in the tree: no **Mover para a lixeira**; the selection's menu and the selection bar have **Mover para…** and no bin; the palette has no **Apagar**. Level: A; E: `e2e-server/zz-owner-deletes.spec.mjs`.
2. As the editor, select a note and press Delete (or ⌘⌫): the notice and the status line say "Só o dono da pasta apaga aqui: nada foi apagado…" (EN: "Only the folder's owner deletes here…"); the note stays. Level: A; E: `zz-owner-deletes.spec.mjs`.
3. As the editor, rename a note, move it to another folder, create a note: each works. **Abrir a lixeira** is still there, and restores what the owner deleted. Level: A; E: `tests_owner_deletes.rs`.
4. As the editor, drag a note from `Mesa` to the folder's root: refused, "Tirar um arquivo de uma pasta compartilhada é apagá-lo para quem a recebe…"; moving it inside `Mesa`, or a note into `Mesa`, works. As the owner, the same drag works. Level: A; E: `tests_owner_deletes.rs`.
5. As the share's receiver (editor of `Mesa`): no delete offered either. Level: A; E: `tests_owner_deletes.rs`.
6. On the editor's desktop, the folder synced here: delete a note in Finder, wait for a pass: the note is back, and Ajustes › Sincronizar lists "Um arquivo apagado aqui voltou…". Move a note out of `Mesa` in Finder: after a pass it is back in `Mesa`, listed as "Um arquivo tirado aqui de uma pasta compartilhada voltou para ela". Level: A; E: `tests_sync_access.rs`.
7. As the owner, every delete is offered and works; inside a table nothing changed (a player still never deletes, the game master does). Level: A; E: `access-vectors.json`.

## Compatibility with Obsidian and the NAS or VPS install (notes 38 and 32, 2026-10-31)

Docs only; no code changed. Both lessons exist in `demo-vault/` (pt-BR) and `demo-vault-en/` (EN), are paired in `scripts/demo-vault/names.mjs`, sit in the Tour (cards in *Atalhos e ajuda* and *Num servidor*) and in note 00's list.

1. Open the Tour board: the *Atalhos e ajuda* group has a card for note 38 and the *Num servidor* group one for note 32, in both languages; double-click each and read the note. Level: H; E: `node scripts/demo-vault.mjs check`.
2. Note 31 ends with a link to note 32, note 32 with one to note 33, and note 37 with one to note 38, the last lesson (the check refuses a chain that skips). Level: H.
3. Note 38, section 6, on a copy of a real Obsidian vault: open it with `⌘ O`; a note in Fonte reads as Obsidian wrote it and the file's date is unchanged after closing without typing; an edit in Verso shows in Obsidian; a `.canvas` with one card moved changes one line in the Git diff; the Excalidraw drawing's **Converter em board** shows the board before creating it; `> [!secret]` reads as a callout in Obsidian; with Obsidian's daily-note settings in `.obsidian/`, **Ajustes › Notas periódicas** offers **Usar os ajustes do Obsidian**. Level: A (needs Obsidian installed).
4. Note 38 states only what `docs/spec/dialect.md` (sections 5 to 7), ADRs 0011, 0012, 0030 and 0070 and the lessons it links say: if one of those changes (embedded HTML, the accepted forms of `tags` and `aliases`, the plugin shim), reread sections 3 and 4 of the note. Level: H.
5. Note 32, section 2, against `packaging/server/docker-compose.yml`: the paths, `mem_limit: 768m` and the `user:` line it describes are the file's. Section 3 against `sh universo.sh --help`: the commands `install`, `https [--duckdns NAME]`, `admin`, `swap`, `firewall`, `status`, `backup [--keygen|--encrypt]`, `restore`, `schedule backup|update|status|off`, `update`, `support`, `reset-admin` exist. Level: H; E: `scripts/check-installer.sh` for the script.
6. Note 32, section 7: `VERSO_TRASH_DAYS` (30) and `VERSO_TRASH_MAX` (1GB) are the defaults of `docs/reference/server-install.md` section 7; the unit's `MemoryMax=75%` is `packaging/server/universo.service`. Level: H.
7. Note 32 end to end on a real NAS (ZimaOS or CasaOS) and a real Ubuntu VPS, as a layperson would: not run for this change; the other Docker NAS brands are not covered by the project and the note says so. Level: A.

## Share audio, the window (ADR 0116 section B, task S6, note 27)

As the game master in the desktop app of a table (a debug build lists a test tone as the one source; a release lists none until a capture back-end is built), and as a player in a browser:

1. The Música tab has **Compartilhar áudio…** once, in the header (empty or playing); the player's tab and a browser's have none. With no source, the picker says *A captura de som chega numa próxima atualização* and **Começar a compartilhar** is off. Level: A; E: `e2e/share-audio.spec.mjs`.
2. With the test tone: pick it, **Começar a compartilhar**; the first time the notice shows, once. The tab shows *Compartilhando …*, the meter moves and says *Som chegando*; *2 ouvintes · 96 kbit/s* (counts as the server reports). The player's window shows *Fulano está compartilhando …*, **Ouvir a mesa** (until a touch), then the tone. Level: A (C for the real count); E: `e2e/share-audio.spec.mjs`, `e2e-server/` (S10).
3. **Parar de compartilhar** in the tab, in the Mesa tab's row or in the status bar: the tone ends for the player, which says *Compartilhamento encerrado*. A second share while one is live asks *Substituir?*; **Cancelar** keeps the first. Level: A; E: `share-audio.spec.mjs`.
4. A source that is silent (a muted app): within 3 seconds the card says *Silêncio: nada está sendo captado…*. A capture that cannot start leaves no share at the table and says why in the status bar. Level: A; E: `share-audio.spec.mjs`.
5. On a phone (390 × 844) every control above is 44 px and the picker fits; the keyboard moves through the picker with the arrows and Tab stays inside it. Level: A; E: `share-audio.spec.mjs` (`@layout`).

## Share audio on Windows (ADR 0116 item 17 as narrowed on 2026-11-01, task S8, note 27)

As the game master in the installed desktop app on Windows 11 at a UniVerso table, with a browser as the listener:

1. Open a page as a page (YouTube, say) and play it. **Compartilhar áudio…** lists **Páginas abertas no Verso: youtube.com** and says that only the pages' sound goes, never Verso's own sounds or other programs'. Level: A (the real Windows); the words are `shareHost.test.mjs`, the name rule `winpages.rs`.
2. Share it: the listener hears the video; roll dice in the sharer's window: they do not hear the dice. Level: A.
3. With no page open the picker says *Abra uma página no Verso…*; on Windows 10 it says *Compartilhar áudio no Windows precisa do Windows 11…*, Start off. Level: A (words: unit test).
4. **Parar de compartilhar**, closing the window and quitting each end the share. Level: A.
5. **Two pages** (S10): with two pages open and one playing, the list names only that one; both playing, both are named. Level: A.

## Share audio on the Mac (ADR 0116 section B, tasks S7, S7b, note 27)

As the game master in the installed desktop app on a Mac (macOS 14.4 or later) at a UniVerso table, with a browser as the listener:

1. Open a page as a page (YouTube, say) and play it. **Compartilhar áudio…** lists **Páginas abertas no Verso** as the only source; no application is listed. Level: A (the real Mac).
2. Share it: the listener hears the page within a second or two, and the tab shows *Som chegando*. Spotify or another app playing at the same time does not reach the listener. Level: A.
3. The list names only the page that plays, with two pages open (S10). On the Mac the name reads *Pages open in Verso: open.spotify.com* (WebKit's media playback state); a paused page is not named. Level: A.
4. The first share shows macOS's *Gravação de Áudio do Sistema* prompt naming Verso. Refuse (or reset with `tccutil reset AudioCapture com.versomd.app`): the status bar says *O macOS não deixou o Verso gravar o som do sistema…* with the System Settings path, and the table keeps no share. Level: A; the words are `shareHost.test.mjs`.
5. Verso's own sounds (dice, chimes, the table's music, an audio player in a note) are not in the listener's share, and they play in the sharer's window a few hundredths of a second late. Level: A.
6. A video or a page shown inside a note is shared, and the first-share notice says so. Level: A.
7. On a macOS below 14.4 the picker says *Compartilhar áudio no Mac precisa do macOS 14.4 ou mais novo…* and Start is off. Level: A.
8. **Parar de compartilhar**, closing the window and quitting the app each end the share and leave no capture running. Level: A; the lifecycle is `macos_source` tests.

## Share audio on Linux (ADR 0116 section B, task S9, note 27)

On the installed app (.deb or .rpm, or the AppImage with `pulseaudio-utils` installed by hand), in a desktop session with PipeWire or PulseAudio, as the game master at a UniVerso table, with a browser as the listener. The harness cannot reach the real capture:

1. **The pages' process, first** (A): open a page as a page and play it. `pactl list sink-inputs` shows a stream whose `application.process.id` is a `WebKitWebProcess`, and `ls -l /proc/<that pid>/fd | grep pages-profile` (or its `maps`) shows a path under the pages' profile folder. If not, the share refuses with the no-pages message and `verso.log` says so; report it, the marker needs another proof. Level: A.
2. **Pages** (A): **Compartilhar áudio…** lists **Páginas abertas no Verso**; share it; the listener hears the page within a second or two and the tab shows *Som chegando*. Pause the page: *Silêncio*. Stop ends it for the listener. Level: A.
3. The list names only the page that plays, with two pages open (S10). On Linux the name reads *Pages open in Verso: open.spotify.com* (WebKitGTK's `is_playing_audio`); a paused page is not named. Level: A.
4. **Nothing outside Verso** (A): play something in a browser or a music player at the same time: the listener never hears it.
5. **Verso's own sounds** (A): dice, a chime, the table's music and an audio player in a note are not in the share; they play in the sharer's speakers a few hundredths of a second late, from a stream named *Verso (own sounds while sharing)*, and come back as before after Stop.
6. **A page or video inside a note** (A): it is NOT shared on Linux; the hint says to open it as a page. Level: A.
7. **No page, no tools** (A): with no page open the picker says *Abra uma página no Verso…*; without `pactl` and `parec` it says to install `pulseaudio-utils`. Level: A.
8. **Stop, window close, quit** (A): each ends the share; `pgrep -a 'parec|pacat'` finds nothing left. Level: A.

## Music at the table (ADR 0116 phase 1, note 27, 2026-10-31)

On a UniVerso folder made a table, with the game master's window (the desktop app or a browser) and a player's (a second browser, or a phone), as in note 27. Copy `assets/sons/taverna.mp3` and `assets/sons/estrada.mp3` into a folder `Música` of the table, or play them from note 27:

1. Ajustes › Recursos › RPG e mesa has **Som da mesa**, on. The right panel has a **Música** tab beside **Mesa**; in it the master sees *Tocando agora · Nada tocando…*, **Pastas** (the `Música` folder, two tracks) and **Playlists**; the player sees the same lists with no play button and *Só o mestre toca…*. No `<audio>` element exists yet (item 30). Level: A; E: `e2e/table-sound.spec.mjs`.
2. As the master, **Tocar “taverna”** in Pastas: both windows show *taverna*, *De: Música*, and the time; the player's has no play, pause, next, stop or table volume, only **Seu volume**, **Silenciar** and **Seguir a mesa**. Both hear it at the same point (a clap test: under half a second apart). Level: A; E: `e2e-server/table-sound.spec.mjs`.
3. **Pausar**, the **Posição** bar, **Volume da mesa** at 40: the player's window follows each within a second. The player's **Seguir a mesa** off: their window goes silent, the master's still plays. **Filtrar músicas** with "est": only *estrada* stays. Level: A; E: `table-sound.spec.mjs`.
4. Open the **Mesa** tab: while a track plays, one slim row at its top (the name; for the master previous, pause, next; **Volume** opens your own volume and mute); nothing when nothing plays; the chat input does not move. A click on the name opens the Música tab. Level: A; E: `table-sound.spec.mjs` (`@layout`, the row's height).
5. Open note 27: a play button beside each sound link, for the master only; the play beside *A taverna*, then **Próxima faixa**: *A estrada*; Next is greyed at the list's end; **Repetir** twice (*a lista*): Next goes back to the first. Let a track end: the master's window plays the next of the list. Level: A; E: `table-sound.spec.mjs`, `tableSound.test.mjs`.
6. A file no player sees (leave it hidden): playing it asks "N jogadores não veem este arquivo (names). Liberar para a mesa e tocar?"; **Tocar sem eles**: the player's tab says *uma faixa que você não vê* with why, and the browser's Network tab shows no request for the file; the master's tab says who does not hear. **Liberar e tocar** on another: the player hears it. Level: A; E: `tests_table_sound.rs`, `e2e-server/table-sound.spec.mjs`.
7. Close the master's window: the music goes on for the player; the player reloads: it lands where it was. Everyone leaves and comes back: nothing plays. Level: A; E: `tests_table_sound.rs`.
8. With both the Mesa and Música tabs closed, the status bar shows the note glyph and the track's name; a click opens Música. On a phone (390 × 844) Música is a sheet, every button 44 px and reachable. Level: A; E: `table-sound.spec.mjs` (`@layout`).
9. A folder of this computer alone: the Música tab plays for this window and says *Só nesta janela: a pasta não tem mesa*. Level: A; E: `table-sound.spec.mjs`.

## Audio embeds with a player (ADR 0116 amendment, notes 18 and 27, 2026-11-01)

In either vault, in the desktop app and in a browser of a UniVerso folder:

1. Open note 18, section *Som na Nota* / *Sound in the Note*: `![[assets/sons/taverna.mp3]]` is a player — a round play button, the file's name, `0:00 / 0:49`, the bar, **Silenciar** and **Volume**, and **Tocar na aba Música** (a folder of this computer) — not the engine's own controls. Play: the button becomes **Pausar**, the bar moves; drag it, or Tab to it and press the arrows. Level: A; E: `e2e/audio-embed.spec.mjs`.
2. **Editar**: the player stands where the embed is written; put the caret inside `![[…]]` and the text shows. **Fonte**: only the text. Switch modes while it plays: the sound goes on in the player of the mode shown. The note's file is unchanged (`git diff` of the vault: nothing). Level: A; E: `audio-embed.spec.mjs`.
3. Start the second sample (`![](assets/sons/estrada.mp3)` in note 18's list): the first pauses. **Silenciar** on one mutes both; the volume set on one is the other's too, and after a reload. Level: A; E: `audio-embed.spec.mjs`, `audioEmbed.test.mjs`.
4. A click on the name **taverna.mp3** opens a tab of its own with the same player (so does the file in the tree). Level: A; E: `audio-embed.spec.mjs`.
5. Training board, lesson **16 · Som num cartão**: the card is the player; play, drag the bar and mute right on the card without entering it; the card still moves by its head and resizes by its corner. Drag `estrada.mp3` from the tree, and an MP3 from Finder or Explorer: each becomes a card. Level: A; E: `audio-embed.spec.mjs` (the card, the bar dragged through the board).
6. At a table, as the game master, note 27 *Um player na nota*: **Tocar para a mesa** plays it in the Music tab for everyone, from the scene above; a file some players do not see asks the release question. With the table's music playing, play an embed: the table's music goes lower and the player says so; play another track from the Music tab: the embed pauses with *Pausado: a música da mesa começou.* Level: A; E: `audio-embed.spec.mjs`.
7. As a player of that table (the hidden track set to *Toda a mesa: Não vê* in Acesso…; a file with no access of its own follows the notes that embed it, ADR 0113 K.3): an embed of a file you see plays for you alone, with no **Tocar para a mesa**; the embed of the hidden file is *🔒 (ainda não revelado)* and its board card is locked; the page holds no trace of its name. Level: A; E: `e2e-server/audio-embed.spec.mjs`.
8. On a phone (390 × 844): every control of the player is 44 px, there is no volume slider (the phone's buttons), **Silenciar** works; the board's card plays from a tap. Level: A; E: `audio-embed.spec.mjs` (`@layout`).

## The embedded terminal (ADR 0115, note 35, 2026-10-31)

In the desktop app, on a folder of this computer (the demo vault will do). The U tests named are in `app/src-tauri/src/tests_terminal.rs` (a real shell on a real pseudo-terminal) unless said:

1. The palette has no **Novo terminal** and a folder's menu no **Abrir terminal aqui** until Ajustes › Recursos › **Terminal** is on; the "Tudo" shortcut leaves it off. Turned on, both appear, and Ajustes › Terminal e agentes gains the Terminal rows (Novo terminal, Ferramentas de IA, Option como Meta on the Mac, Shell do terminal on Windows, the screen reader mode). Level: A; E: `terminal.spec.mjs` (off by default; the host refuses a stale `terminal_open`), `test/capabilities.test.mjs`; U: `app/src-tauri/src/tests_terminal.rs` (`the_terminal_is_a_capability_and_the_switch_gates_it`).
2. **Novo terminal**: a tab *Terminal — demo-vault* opens; the line above says `zsh em demo-vault` (PowerShell on Windows); the first time in this folder one line says programs change the files directly and the history keeps each change, with **Entendi**; a second terminal does not say it again. `pwd` prints the folder's root; `echo olá, ação` comes back whole. Level: A; E: `terminal.spec.mjs`; U: `a_shell_answers_what_is_typed_and_learns_its_size`, `the_shell_starts_in_its_directory_and_keeps_accents`.
3. Right-click *Personagens* in the tree › **Abrir terminal aqui**: *Terminal — Personagens*, and `pwd` ends in `Personagens`. Level: A; E: `terminal.spec.mjs`; U: `a_shell_starts_at_the_windows_folder_and_never_outside_it`.
4. **Ferramentas de IA**: nothing is asked before the click; the menu lists the six tools, *Abrir …* for the installed ones and *… não está instalado — página de instalação* for the others. *Abrir Claude Code* (where installed) opens *Terminal 2 — demo-vault* already running `claude`; a missing one opens its page in the browser. Level: A; E: `terminal.spec.mjs`; U: `the_detection_reads_the_shells_answer`, `the_detection_asks_the_login_shell`.
5. Keys: ⌘⇧] leaves the terminal for the next tab, ⌘P and ⌘⇧P open the switcher and the palette, ⌘K the search; with `sleep 100` running, Ctrl+C stops it; with text selected, ⌘C copies and ⌘V pastes. Option+e then e types `é` (Option as Meta off). Level: A; E: `terminal.spec.mjs`, `test/terminal.test.mjs` (the key table).
6. `sleep 1000 &` then `sleep 100`, and ⌘W: the question says a program is running; **Cancelar** keeps the tab, **Fechar** ends it; `ps` in another terminal shows no `sleep` left. `exit` in a terminal closes its tab and the status line says *O terminal terminou (código 0).* Level: A; E: `terminal.spec.mjs`; U: `a_closed_terminal_leaves_no_process_of_its_tree`, `a_terminal_is_busy_while_a_program_runs_in_it`.
7. With a terminal open, ⌘R: the tab comes back and finds the same shell, with what it wrote. Quit the app with `sleep 100` running: it asks first. Level: A; E: `terminal.spec.mjs`; U: `a_reloaded_window_finds_its_terminal_again`.
8. In a terminal, `echo "linha nova" >> "00 - Bem-vindo ao Verso.md"` with that note open and untouched: the note shows the line; the history (the clock in the status bar) lists the change as made outside Verso, and restoring the version before it takes the line out. Level: A (the watcher and the history: their own tests).
9. A window on a server's folder (Ajustes › Servidores, a folder of the server not synced here): **Novo terminal** opens in the home folder with the line *Esta pasta não está neste computador…*. The browser's window of that server, the phone and a loose-files window (a `.md` opened by itself, note 08) show no terminal anywhere, the switch on. Level: A; E: `terminal.spec.mjs` (`showServerFolder`, `?side=server`, `?loose=1`); U: `a_server_folders_window_has_the_terminal_and_the_server_never_does`, `tests_loose.rs`.
10. Turn **Terminal** off in Ajustes › Recursos with two terminals open: both tabs close and their shells end. Level: A; U: `the_switch_off_ends_every_terminal`.

## The right panel's tabs hidden, reordered, brought back (ADR 0072 amendment, note 10, 2026-11-01)

On the app (desktop and a phone, 390 × 844), with a folder open and, for steps 5 and 6, a table with Table sound on:

1. Right-click the **Links** tab (on a phone, press and hold it): the menu offers **Mover para a esquerda / direita**, **Ocultar esta aba**, **Restaurar abas** and **Ajustar abas…**. **Ocultar esta aba**: the tab leaves the bar, the status line says how to bring it back, and the **⋯** button appears even if every other tab fits. Level: H; E: `right-tabs-hide.spec.mjs`.
2. **⋯** lists **Mostrar “Links”**; choosing it brings the tab back and opens it. Close and reopen the app: a hidden tab is still hidden, the order is kept. Level: H; E: `right-tabs-hide.spec.mjs`.
3. With the mouse, drag a tab along the bar: it lifts and follows the pointer, the others make room; a hidden tab keeps its place in the order. Level: H; E: `right-tabs-hide.spec.mjs`, `right-tabs.spec.mjs`.
4. **Ajustes › Aparência › Abas do painel direito**: every tab with a switch and up/down arrows; the bar follows at once; **Restaurar abas** brings the default order and every tab back. On a phone the rows and buttons are 44 px. Hide every tab but one: the last one's switch refuses. Level: H; E: `right-tabs-hide.spec.mjs`, `tabModel.test.mjs`.
5. With **Mesa** and **Música** hidden and a track playing, the status bar still names it; a click on it opens **Música**, shown in the bar while it is the chosen tab; choosing another tab hides it again. Level: H; E: `right-tabs-hide.spec.mjs`.
6. A narrow panel (or a phone): the tabs that do not fit are in **⋯** in your order; **Mesa** and **Música** are in the bar first. Level: H; E: `right-tabs.spec.mjs`, `tabModel.test.mjs`.

- **Owner's phone deletes on a part (ADR 0113 amendment, 2026-11-01).** Serve a vault in part (*Transformar em servidor*, tick only `Projetos`), pair a phone with *Pode editar as notas*: in the share, **Mover para a lixeira** on a note works and the entry shows in *Lixeira* as deleted by the owner; a phone paired without *Pode editar* is not offered it. S: `local::tests_parts` (the allowlist table, `delete_note`/`delete_entry` answer), `local::tests_parts_bin`, `access::vectors` ("editor-owns"); E: `test/access.test.mjs`.
- **A synced editor is offered no delete (ADR 0113 B8, item 8 of 2026-11-01).** In the desktop app, a folder synced with a server where this account is an editor: right-click a note, the menu has no *Mover para a lixeira*; select two and the bar has no delete; `Delete` on a note says *só a dona da pasta apaga*. The owner's own synced window still offers it. S: `test/access-synced.test.mjs`.
- **A phone's right-panel tabs (ADR 0072 amendment, 2026-11-01).** On a phone, open the right panel on the Outline tab: eight tabs of 34 × 44 px fit in the drawer at 390 px; on a 320 px or 360 px phone the ones that do not fit are in **⋯**, in your order. E: `right-tabs-phone.spec.mjs`.

## This app is a server: the internet link, invitations and the table (ADR 0117, note 29, 2026-11-04)

Lesson 29 (*Mesa pela Internet* / *A Table over the Internet*) exists in both vaults, is paired in `scripts/demo-vault/names.mjs`, sits in the Tour (card in *No celular*) and in note 00's list; notes 28 and 32 point to it. The window is the harness's (it answers the link, the own address, the invitations and the seat in memory); the real `cloudflared`, Cloudflare and a phone on mobile data are in `manual-checks.md`.

1. Open the Tour board: the *No celular* group has a card for note 29 in both languages; read the note. Note 28's pairing section names the two boxes and says a phone pairs on the network only; note 32 ends pointing to 29. Level: H; E: `node scripts/demo-vault.mjs check`.
2. **Ajustes › Transformar em servidor**: under the switch, **Na minha rede** and **Por um link na internet (Cloudflare, modo de teste)**. Neither ticked, **Ligar o servidor** does not start and says to tick one. The link alone serves: **Link no ar.**, the address with **Copiar link** and the QR, the hours left with **Prorrogar por 12 horas**, the testing-mode warning, **Parear um celular** off and saying why; unticking the box stops serving. Level: H (the real link: A); E: `local-server-link.spec.mjs`, `local-server.spec.mjs`.
2a. The section's dialogs (2026-11-05): **Antes de ligar** and **Parear um celular** sit in the middle of the window, within it; at 1280 x 800 the pairing dialog has the QR on the left and the rest beside it, no scrollbar; at 390 x 844 it takes the width and scrolls only if it must; Escape closes it. Every other dialog opened from Settings was looked at the same way (the theme gallery, the in-place confirmations of the section). Level: H; E: `local-server.spec.mjs` (@layout).
3. A download that fails, a checksum refused, Cloudflare unreachable and a link that drops each say so in words in both languages. Level: H; E: `local-server-link.spec.mjs`, `localServerLink.test.mjs` (the phrases are the host's).
3a. The first download of `cloudflared`: the panel says *Baixando o cloudflared, da Cloudflare: 12 de 40 MB* (the download's words only while it downloads; any other start says *Ligando o link…*), the status mark says *Ligando o link…* (*Servindo · ligando o link…* with the network on) until the link has its address, and **Cancelar** stops it: *Cancelado: o link não foi ligado.*, the box unticked, nothing serving, no `.cloudflared-<version>.part` left in `<config>/tunnel/` (quitting removes it too). Level: H (the real download: A); E: `local-server-link.spec.mjs`, `localServerLink.test.mjs`; S: `tunnel::tests::cancel_during_the_download_ends_it_and_leaves_nothing`.
4. **Usar meu endereço**: the three steps written out, **Entrar na Cloudflare**, an address that is taken is said, then **Configurar**; the link on that address shows no countdown; **Remover meu endereço** asks first; **Esquecer só neste computador** appears when Cloudflare could not be asked. Level: H (real Cloudflare: A); E: `local-server-link.spec.mjs`.
4a. **Ajustes › Conta** while serving (revised 2026-11-05): with the server off there is no *Conta* and **Transformar em servidor** says where the name went; on, *Conta* lists **Seu nome para os jogadores**, **Idioma** and **Onde você entra como dono** (*Nesta janela e em … celulares pareados*, the row is not named again under its heading; **Ver os celulares pareados** opens the server's section at **Celulares pareados**, focused, not at its top), and no password or passkey row. **Seu nome para os jogadores**: the system's user's name at first; a new name saved with Enter or **Salvar nome** is said (*Os jogadores veem você como …*), an empty one is refused and the field keeps the last; a player's folder list names the owner by it and carries no `@this-computer.verso` address. Level: H (the system's full name: A); E: `local-server-link.spec.mjs`; S: `local::tests_accounts::players_see_the_owner_by_name_and_never_its_inner_address`.
5. **Convites** (decided 2026-11-04: invitations are made from the folder's page, as on a UniVerso): the section has no form, its words say where to invite; the list shows every invitation of the server (a table's and a share's) with no link, and **Encerrar** ends one waiting. In the window at the table, a folder's **Compartilhar…** with an e-mail no account has says so and offers **Gerar link de convite para …**: the link in a field with **Copiar o link** and *Uso único, vale até …*; someone who does not run the server is told to ask for an invitation, with no button. Level: H (the real server: S); E: `local-server-link.spec.mjs`, `shares.spec.mjs`; S: `local::tests_shares`, `tests_shares::an_admin_invites_a_person_with_no_account_to_a_share`, `local::tests_shares::the_window_at_the_table_invites_a_person_with_no_account_to_a_share`.
6. No seat to press (D13 Q3, revised 2026-11-05): **Ajustes › Transformar em servidor** has no *Esta janela na mesa* and the mark no **Sair da mesa**. Not served, the tree's menus have no table row; served, the list's background offers **Tornar a pasta toda uma mesa** (a folder, **Tornar esta pasta uma mesa**), which sits the window first and opens the table's dialog; **Compartilhar…** and **Copiar link de leitura…** sit it first too. Stopping the server brings this computer's folder back and says so; served again, a folder with a table sits by itself and names the table, not the folder (*Na mesa de Vault.* for the whole folder; a table in a folder inside, *Na mesa de Campanha Fractal.*). Level: H (the real seat: S, the installed app: A); E: `local-server-link.spec.mjs`, `local-server-accounts.spec.mjs`; S: `local::tests_seat::the_window_sits_at_a_folder_served_in_part` (`tables_in`).
6b. **Hospedada em** in the table's dialog and card, above **Gerar link** (2026-11-05): seated at this computer's table it says *este computador (https://192.168.1.20:51234)* — the link's origin while the link is on —; in a window on a UniVerso, *UniVerso* and its address; on a folder of this computer alone, nothing. In English *Hosted on: this computer (…)* / *Hosted on: UniVerso …*. Level: H (the real link: A); E: `local-server-link.spec.mjs`; S: `test/hostedAt.test.mjs`.
6a. A table in a subfolder (R1, 2026-11-05): with the vault ticked and only *Projetos* chosen inside it, the window still sits at the vault; a table made in *Projetos* (or in a folder not chosen) invites a player who reaches that folder alone; the phone lists the chosen folders only. **Pastas servidas** says the chosen folders are what the phones see. Level: H (the real server: S, a real phone: A); S: `local::tests_subfolders`, `local::tests_seat::the_window_sits_at_a_folder_served_in_part`.
7. The player's pages (the harness's `web.html`): the sign-in with the note on opening the invitation first; through the link no pairing, on the network the pairing link to the code page; on the network no passkey button and the password note, through the link the button; a table that stops answering shows **A mesa está offline** with **Tentar de novo**. At 390 x 844 no sideways scroll. Level: H; E: `local-signin.spec.mjs`, `localTable.test.mjs`.
8. **Apps Verso de outras pessoas** lists a signed-in app with its name and person and **Encerrar**; an app gone meanwhile is said. **Ligar os links de leitura** starts off; on and off are said, a refusal puts the box back; the seated window with links off says where to turn them on. Level: H; E: `local-server-accounts.spec.mjs`, `localServerAccounts.test.mjs`.
9. **Pessoas convidadas** (D9, the row of "forgot the password"): a player who accepted is listed with name, e-mail, **Alcança: …** with the role and *visto por último em*; with serving off **Nova senha** says **Ligue o servidor primeiro.**; on, it shows the link once with **Copiar o link** focused and says it works once for 24 hours; **Encerrar sessões** is said and the row shows *sem sessão aberta*; **Remover** asks first, **Cancelar** keeps the person and returns the focus, **Remover** takes them and the focus goes to the heading; a person gone meanwhile is said. At 390 x 844 no sideways scroll. Level: H (the real reset through the link: S); E: `local-server-players.spec.mjs`, `localServerPlayers.test.mjs`; S: `local::tests_players`, `tests_local_accounts`.
9a. A player signed in to this computer's server (the network or the link) opens **Conta**, changes the name and saves: the page says it, a reload keeps it, and the table's next chat line and roll carry the new name (the maintainer's re-test of 2026-11-05: the app's server did not take the change). A paired phone has no name of its own to change. Level: H (a real player's phone through the link: A); S: `local::tests_seat::a_player_renames_themself_and_the_table_says_the_new_name`.
10. **Ajustes › Créditos** names `cloudflared` (Apache-2.0). The tray's line **Link pela internet ligado** is the host's (`tray.rs` test). Level: S, A for the tray (macOS, Windows).
11. A folder received from another account on a UniVerso and synced here (Settings' row *Compartilhada*, *compartilhada com você em …: só quem é dona dela pode servi-la*): its own page, where a table strip would stand, says **Transformar em servidor** and the same words; a folder of one's own says nothing there; in English *Turn into a server* and *shared with you on …: only its owner can serve it* (ADR 0117 D4.3, the re-test of 2026-11-04). Level: A (a real synced share); S: `test/receivedHere.test.mjs`.
12. Ten players behind one address open the table at once through the link, none refused (the re-test of 2026-11-04). Level: A (VM 104); S: `local::tests_link_load::a_table_of_ten_behind_one_address_*`, `tests_resources::a_table_of_ten_behind_one_address_loads_cold_through_the_proxy`.

13. **Serve from the folder's page** (R4, 2026-11-13): a folder of this computer not served shows the strip *Servidor* with **Servir deste computador**, and its tree menu the same row; with the server off the click asks **Ligar o servidor e servir “…”?**, **Ligar e servir** ticks it and turns the server on, the status says *“…” é servida deste computador.*; a failed start leaves it unticked and says why. With the server on, ticking or unticking in Settings (and choosing parts) does not stop it: the mark keeps *Servindo*, a quick link keeps its address. **Parar de servir** on the root page and the tree's root menu asks first (*N jogadores perdem acesso até você servir de novo. A mesa, o chat e as rolagens ficam guardados.*); a window seated at that folder goes back to the computer's folder; served again, the same table and players come back. **Copiar link da mesa** on the owner's card copies `…/?folder=<id>` (the link's origin while on; the network's, said to open only here). Level: H; E: `local-server.spec.mjs` (*served from its page*, *change while serving*), `campaign.spec.mjs`; S: `local::tests_rest`, `tableRoute.test.mjs`; A: the real app on the maintainer's OK.
14. **A game master invites** (R6, UniVerso, 2026-11-13): an account with *cria pastas* sees **Convidar jogadores** on its own table and **Gerar link de convite** in **Compartilhar…** of its own folder; the invitee reads only; the 21st waiting invitation is refused in words; in another account's folder (even as an editor) nothing is offered; the console's **Convites** shows **Feito por**; taking *cria pastas* away ends that account's waiting invitations, those accepted stay. Level: S (`tests_gm_invites`), H for the strings.
15. **The owner pairs through the link** (R3, 2026-11-13): with the link alone, **Parear um celular** is enabled and shows the link's QR; with both boxes, a button switches the QR; the link's sign-in page offers **Parear este celular com um código**; a code typed while the dialog is closed is refused without being tried; **Foi você?** says *pelo link* and the forwarded address, with *Pode editar as notas* ticked; 3 wrong codes end the window whatever address they come from; a quick link's device ends with the link, an own address's stays. Level: S (`local::tests_link_pair`), E (`local-server-link.spec.mjs`, `local-signin.spec.mjs`), A for a real phone on mobile data.
16. **A UniVerso's own link** (R5, 2026-11-14): lesson 31's section *Sem domínio e sem abrir porta* names `universo.sh link quick|own|off` (menu item 11), `VERSO_TUNNEL` for Docker/CasaOS/ZimaOS and the console's **Servidor** page (**Ligar um link rápido**, **Ligar o meu endereço**, **Estender 12 horas**, **Desligar**); the console shows the address, the time left and the testing-mode words; turning on and extending ask the proof; with the link on and no `VERSO_PUBLIC_URL`, an invitation carries the link's address. Level: S (`verso-server` tunnel tests, `verso-tunnel`), H (`consoleLink` test), A on VM 107 (the R5 spike) and with a real token (manual check).

## The lessons in seven blocks (the maintainer, 2026-11-04)

Both vaults hold lessons 00 to 38, in seven blocks: I. Começando (00–06), II. Organizar (07–13), III. Outras formas de ver (14–19), IV. Board (20–21), V. RPG (22–27), VI. Juntos e em outros aparelhos (28–34), VII. Avançado (35–38). The former notes 17 (*Terminal, CLI e Agentes*) and 35 (*Terminal e Agentes de IA*) are one lesson, *35 - Terminal, CLI e Agentes de IA* / *35 - Terminal, CLI and AI Agents*.

1. Note 00, *Mapa de Exploração do Vault*: the seven blocks as headings, each with its line, and every lesson once, in number order; the same in English. Level: S (every numbered note in the map), H.
2. Every lesson from 01 ends with one line — *Anterior* · *Próxima* · *Página Inicial* · *Tour do Verso* (EN: *Previous* · *Next* · *Home Page* · *Verso Tour*); note 38 says it is the last lesson. A cross-reference that was in the old closing line (24 to 16, 29 to 30 and 32, 30, 31, 32 and 33 to their server and table notes) stays, as its own sentence above it. Level: S (each links to the next), H.
3. The Tour: 22 stops, ① to ㉒, in the blocks' order (Escrever, Conectar, Blocos; Arquivos, Encontrar, Abas e janelas, Figurinhas e ordem, Focos, Diárias e tipos; Bases e grafo, Diagramas, Ler e ver, Web; Boards; Dados, Mundos e RPG, A mesa; No celular, Num servidor; Terminal e agentes, Ajustes, Atalhos e ajuda); each stop's cards are lessons of one block, and *Num servidor*'s five cards fit inside its group. Same drawing in English. Level: H; E: `board-tour.spec.mjs`, `demo-vault-en.spec.mjs`.
4. Note 35 reads in this order: the terminal (on, opening, the warning, keys, closing, each system), the `verso` command, agents through MCP, AI agents in the terminal; its links to `#Agentes de IA (MCP)` and `#O terminal` land on their headings. Level: S (the headings), H.
5. Import into a folder that holds the earlier demo untouched: the old copy of each renamed lesson goes to the folder's trash once its new name is written (`DEMO_RETIRED` lists each old path with its new one); a lesson the person edited is kept and named. The two old terminal lessons were merged, not renamed (git follows neither into the new 35), so their untouched copies stay in such a folder. Level: H; E: `import.spec.mjs`, `test/demoImport.test.mjs`.
6. The site's wiki is made from these vaults (ADR 0058 points 16–18): import it again in the `versomd-site` repository and read the pages of the lessons that moved. Level: A.

## Where a player lands on a server (ADR 0074 item 6, amended 2026-11-06)

On a server, with a table whose player (a reader invited to that one folder, who may not create folders) is signed in in another browser, and a note hidden from them:

1. The player opens `/` (or signs in afresh in a private window): the window opens their folder at once, never *Escolha uma pasta deste servidor*. A link to a folder of the server they are not in opens their folder too. Level: H; E: `e2e-server/link-landing.spec.mjs` ("a player with one folder lands in it").
2. The player opens `/?folder=<the table's id>&note=<the hidden note's path>` (and the same with a path that does not exist, or `../x.md`): their folder opens with no tab for it, no message names it, and the address bar keeps only `?folder=`. A note they see, in the same kind of link, opens as a tab. Level: H; E: `e2e-server/link-landing.spec.mjs` ("a link to a note a player may not open").
3. An account with no folder that may not create folders lands on *Escolha uma pasta deste servidor* with *Escolher uma pasta* and no *Importar cofre de exemplo*. An admin with no folder still has both. Level: H; E: `e2e-server/server.spec.mjs` ("an invited reader"), `test/landing.test.mjs`.
