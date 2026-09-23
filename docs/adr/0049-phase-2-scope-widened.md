# ADR 0049 — Phase 2 scope widened at the maintainer's request

- Date: 2026-09-23
- Source: the maintainer's messages in the working sessions of 2026-09-22 and
  2026-09-23, quoted below; `docs/roadmap.md` (Phase 2, "a scope item that is
  not listed here does not enter the phase without becoming a recorded
  decision")
- Status in the briefing: not present

## Context

The roadmap gives Phase 2 seven items (2.1 to 2.7) and one exit gate: a month
of real use ([0034](0034-roadmap-in-phases.md)). While the window was being
built, the maintainer compared it with Obsidian and asked, message after
message, for what a person leaving Obsidian would miss. On 2026-09-22 they set
the direction in so many words — "pense no que falta para alguém abandonar
obsidian pra usar essa aplicação" — and later that evening they approved, as
a list, the features the author proposed in answer ("essa lista sua que vc
fez, pode fazer").

The roadmap says an item that is not listed does not enter the phase without
becoming a recorded decision. Nothing recorded the requests until now; this ADR
does, so that the Phase 2 pull request can be read against a list and not
against the chat.

## Decision

### 1. Asked for by name

Each line is a request the maintainer made, with the day (local time,
UTC−3) and their words (abridged). The code built on the branch
`phase1-2/integration` answers them, with one exception found after the
fact: an HTML file opens as text, not as a page (`docs/review/phase-2.md`
§6, item 16).

| Area | What was asked | When | In the maintainer's words |
|---|---|---|---|
| Workspace | Several files open at once, in tabs, horizontal or vertical; panes side by side, resizable; drag and drop of tabs and files between panes; workspaces that each hold panes, like iTerm's tabs | 2026-09-22 | "abas esses que poderia ser verticais ou horizontais"; "cadê o drag and drop pra mover entre divisões?"; "faz igual iterm" |
| File tree | Extensions in names, icons on tabs, a breadcrumb that navigates folders, rename on blur, a resizable tree, create folders, hide the tree, the tab bar and the right panel, with buttons | 2026-09-22 | "coloque a extensao na arvore"; "como crio uma pasta?"; "esconder a barra de arvore de arquivos, esconder as abas" |
| Editing | Edit in place (Live Preview), autosave, a formatting bar that stays visible, paste and drop images into an assets folder beside the note, named after the note, and resize them | 2026-09-22 and 2026-09-23 | "não tem o edit direto no preview?"; "autosave"; "pasta de assets"; "coloque o nome da nota ... e o datetime" |
| Files | View HTML and PDF files; a folder view as a list with size, kind and date, sorting and ordinary file operations; a file dragged into the tree is copied there | 2026-09-22 and 2026-09-23 | "eu abri um html, nao rola ter como visualizar ele? o msm com pdf"; "operações normais de file system"; "deveria fazer uma copia ali" |
| PDF | A better reader: zoom, search, selection, fit to width and to page, quotes into a linked Markdown note that stay marked on the PDF; an embedded PDF shows its pages | 2026-09-23 | "se desse pra colocar comentários e notas, talvez vinculando um documento de markdown"; "nao fica marcado no pdf a cota que criei" |
| Links | Links that navigate, `![[note]]` that shows the note, a file dragged from the tree into a note becomes a link or an embed, a richer `[[` list | 2026-09-23 | "clicar em link referenciado não vai para o documento"; "se eu referencio a algum documento com ! ele nao ta carregando" |
| Relations | A relations view; then the whole vault as a graph with filters and customization, and zoom | 2026-09-22 and 2026-09-23 | "pra qual etapa ficou a visão de relacionamentos?"; "deveriam ter opções de filtro e customização" |
| Panels | A right panel like Obsidian's, bookmarks, a command palette opened by a click, a ribbon on the left that can be reordered by drag and has a menu | 2026-09-22 and 2026-09-23 | "menu com painel a direita similar ao obsidian"; "numa barra a esquerda ... reordenar com drag and drop" |
| Writing aids | Properties shown as in Obsidian, tables with editing help, a `/` menu, templates and a way to make a note a template, footnotes, code colored by language, LaTeX, spell checking in more than one language, lines broken as typed, a double click to edit | 2026-09-22 and 2026-09-23 | "advanced tables"; "comando / barra para inserir coisas"; "nota de rodapé"; "blocos de latex"; "sugestão e correção de palavras" |
| Web | A note that holds a web address opens the page inside the app, as a browser tab; it wears the site's icon | 2026-09-23 | "como se a aba do verso fosse uma aba do navegador"; "carregar o icone do favicon do site" |
| App | `verso .` from the terminal; themes; a language choice (pt-BR, English); settings arranged like Obsidian's, with icons; configurable shortcuts; a note in a window of its own and back; nicer scrollbars, a tab menu like Obsidian's, a layout that adapts to a narrow window, a new icon | 2026-09-22 and 2026-09-23 | "verso . no terminal"; "possibilidade de mudar tema"; "seleção de idioma"; "configurar os atalhos"; "abrir ... numa janela nova ... e ter como devolver" |

### 2. Added by the author, approved as a list

Proposed by the author under the direction of 2026-09-22 and approved the same
evening as a list, without a request for each item: the command palette
(⌘⇧P), a settings dialog, the daily note (⌘D), unlinked mentions in the
backlinks panel, the search operators `tag:`, `path:` and `file:`, a word
count, find and replace across the folder (as a plan with one diff per note),
editing text files that are not notes, reopening a closed tab, pinning and
duplicating tabs, revealing a file in Finder and copying its path, four color
palettes, and — from make.md, which the maintainer pointed to on 2026-09-23 —
a folder's own note at the top of the folder view and "edit beside" for an
embedded note.

### 3. Asked for and not built

Kept out by [0034](0034-roadmap-in-phases.md) until Phase 2 ends, and told to
the maintainer when asked:

- Excalidraw or the Obsidian canvas — the board ([0024](0024-board-excalidraw.md)).
- Kanban, calendar and data-table views over notes — make.md's "Contexts".

Not built for a technical reason: tearing a tab out of the window by dragging
it (the web view does not see the pointer outside the window; a note goes to
its own window from the tab's menu instead), and a second window on the same
folder.

## Consequences

- The seven items stay the phase's scope; this ADR adds to them and removes
  nothing. Item 2.6, one note type end to end, is not built: it waits for
  [0013](0013-degrades-to-markdown.md) and [0014](0014-primitives-catalog.md)
  to become Accepted and for spec Q11.
- The exit gate does not change. What it tests grows: exit criterion 2 (no data
  loss in the month) now covers every write path listed in
  `docs/reference/app-decision.md` §5 — the properties panel, table
  re-alignment, find and replace, the rename plans, folder moves, the bin,
  quotes into notes, templates, dropped and duplicated files, text files.
- Several items lean on questions that are still open, and do what they do
  provisionally: the command-line rule ([0042](0042-open-from-command-line.md)),
  file operations ([0048](0048-file-operations-in-ui.md)), where the index
  departs from the closed spec Q12, point 3 ("in" or "under" the source's
  folder), body tags (Q13), the Markdown extensions (Q15),
  non-Markdown files (Q16), handles and session identity in the contract
  ([0044](0044-verso-fs-semantics.md), [0045](0045-server-and-mcp-security.md)).
  Each is recorded where it lives; none is decided here.
- The UI was written by Fable 5.1, not by Opus 5 as the table of
  [0032](0032-author-and-reviewer-roles.md) assigns. The maintainer chose that
  on 2026-09-22 by picking the option that said "Eu escrevo Rust + HTML/TS;
  Opus lê depois"; the Opus reading is `docs/review/phase-2.md`.
- New dependencies, each justified in the pull request: `pdfjs-dist`
  (Apache-2.0) for the PDF reader, `katex` (MIT) for math,
  `@codemirror/language-data` (MIT) for code colors, three `@fontsource` font
  packages (OFL-1.1), and Tauri's `unstable` feature for web pages inside the
  window. `cargo-deny` checks only the Rust side; no npm package of the UI has
  a license gate in CI.
- The window reaches the network, which nothing in Phase 1 did, in four ways:
  a web note loads its page when it is opened; an http(s) link clicked
  anywhere in the window opens that page in a window of its own; a web note's icon is asked of
  the site itself (`https://<host>/favicon.ico`, once per site and session);
  and an image a note takes from the web (`![](https://…)`) loads when the note
  is shown, as in Obsidian. The first version asked a third party
  (`icons.duckduckgo.com`) for every icon; the Opus reading of 2026-09-23 found
  it and it was removed (`docs/review/phase-2.md`). No ADR covers outbound
  access yet — [0027](0027-runtime-capabilities.md), Proposed, only names a
  `net:fetch` permission — so whether these four stay, and whether each needs
  a setting, is the maintainer's.

## Discarded alternatives

None recorded.

## Status

Accepted for section 1: the maintainer asked for each item, on the day given.
Proposed for section 2: the maintainer approved the list as a whole and
confirms or strikes each item. The Consequences are records, not decisions.
