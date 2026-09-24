# Decision memo: views over the folder, a second window, and the terminal and agents from the settings

- Date: 2026-09-24
- Status: **the six questions of section 2 decided by the maintainer on
  2026-09-24**, in session; recorded in [ADR 0053](../adr/0053-views-bases.md)
  and [ADR 0054](../adr/0054-terminal-and-agents-from-the-app.md), in
  [ADR 0049](../adr/0049-phase-2-scope-widened.md) (the second window) and in
  [ADR 0052](../adr/0052-typed-note.md) (point 3). Sections 3 to 5 are how the
  author built what was decided; where they choose something the answers did
  not say, they say so, and those choices are the maintainer's to question.
- Author: Opus 5.5 — of the documents, the role
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) gives "Opus 5", and of
  the Rust and the TypeScript, standing in for Fable 5.1 as the code's author
  by the maintainer's decision of 2026-09-23 (`../review/phase-2.md` §6,
  item 17). Reader: a fresh Opus 5.5 session under the same decision
  (section 8).

## 1. What was asked

- 2026-09-22, the window's first days: "imagem 1 nao tem kanbam ainda?" (on a
  board file of the Task List Kanban plugin opened in Verso), "data tables?",
  "como abro mais de uma pasta/vault?".
- 2026-09-23: "chegou a hora de copiarmos as features do make.md" — among them
  make.md's views over notes, which [ADR 0049](../adr/0049-phase-2-scope-widened.md)
  §3 recorded as asked for and kept out of Phase 2.
- 2026-09-24, on the overview of what was missing: "Visões e janelas: kanban,
  calendário e tabela sobre as notas; uma segunda janela na mesma pasta. deve
  ser a prioridade agora. são funções básicas e importantes", and "acabando vc
  pode gerar novo beta".
- 2026-09-24, while it was being built: "na tela de settings deveria ter opção
  de habilitar o cli/mcp e aproveitar e simplificar a instalação do path pra
  funcionar os comandos verso no terminal".

## 2. The questions, the options and the answers

Put to the maintainer as multiple choice, the author's recommendation first.

| Question | Options | Answer |
|---|---|---|
| A `verso-schema` block inside a list or a callout counts? (ADR 0052, point 3) | only at the top level, with a notice on a nested one (recommended); anywhere; top level and callouts | **only at the top level** |
| Which kanban? | the Task List Kanban plugin's format, the one the Sandbox has (recommended); the bases' own kanban (Obsidian 1.14); both | **the bases' kanban** |
| Tables: Obsidian's bases? | yes, `.base` and `base` blocks (recommended); a format of Verso's own | **yes** |
| The calendar, of what? | both: a calendar layout of bases and the daily notes' month (recommended); the layout only; the daily notes only | **both** |
| The command line from the settings: how? | a link in `/usr/local/bin`, the password asked once (recommended); `~/.local/bin` and a line in `~/.zprofile`; instructions only | **the link in `/usr/local/bin`** |
| The agents: how far does the app go? | one click into Claude Desktop, the entry shown first and a copy kept, plus text to copy (recommended); text to copy only | **one click, and the text** |

## 3. Views: what was built (ADR 0053)

### 3.1 Where Obsidian's format comes from

Admissible sources only (ADR 0009): the public help pages ("Bases syntax",
"Views", "Functions", "Formulas", "Create a base", the layouts' pages), read
on 2026-09-24 at `obsidian.md/help` and in their public repository
`obsidianmd/obsidian-help`, whose last change to them that day was "Bases: Add
kanban view" (2026-09-04); and 84 `.base` files in public GitHub repositories,
found by searching for their keys — files the app wrote, read as behaviour
observed from outside. No Obsidian 1.14 was available: the Sandbox runs 1.13.7.

| Key | Where it is documented or observed | What Verso does |
|---|---|---|
| `filters` (`and`, `or`, `not`, statements) | "Bases syntax" | the base's and the view's, joined by `and` |
| `formulas`, `summaries` | "Bases syntax", "Functions" | evaluated; custom summaries with `values` |
| `properties.<id>.displayName` | "Bases syntax" | the column's name |
| `views[].type`, `name`, `limit`, `filters`, `order`, `groupBy`, `summaries` | "Bases syntax" | as documented |
| `views[].sort` (`property`, `direction`) | 110 of the 153 table views observed | as written |
| `columnSize`, `rowHeight` (table) | observed in 98 and 22 views | column widths, row height |
| `image`, `imageFit`, `imageAspectRatio`, `cardSize` (cards) | observed; the settings are "Cards view"'s | the card's cover and width |
| `markers`, `separator`, `indentProperties` (list) | observed; the settings are "List view"'s | as the settings say |
| the kanban's column order, colours, widths | not public: the observed kanban files are community plugins' (`boardColumns`, `cardTitleProperty`…) | Verso keeps the column order under the view's `verso: columnOrder`, and reads no plugin's keys |
| `startDate`, `endDate`, `weekStartDay` (calendar) | observed in the community calendar views of 14 public files | read and written as they write them |

### 3.2 The language, as evaluated

Parsed in `verso-dialect` (`bases/expr.rs`): the operators, literals of
numbers, texts, booleans, `null`, lists, objects and regular expressions,
names, members, indexing and calls; at most 16 KiB and 128 levels, run under
the fuzz target with every note. Evaluated in `verso-core` (`bases/`), with 50
million steps per query at most and texts of 1 MiB at most.

- Every global function of "Functions" but `escapeHTML`'s and `html`'s effect
  (their text is shown, never rendered); every method of text, number, list,
  date, link, file and object; `mean`, `sum`, `min`, `max`, `median`,
  `stddev` on lists, which "Functions" uses in its own example and does not
  list.
- **Not evaluated**: regular expressions — `replace`, `split` and `matches`
  with one show an error in the cell. `[OPEN]` whether to evaluate them, and
  with which engine: JavaScript's syntax is not Rust's `regex` crate's.
- **Read by the author, not observed**, each `[OPEN]` until the maintainer or
  an observation settles it: a text `YYYY-MM-DD` (or with a time) in a
  property is a date — Obsidian types by the property's type, which Verso
  does not know; `file.tags` lists tags with their `#`; `file.folder` of a
  file at the root is `/`; `==` between a text and a number compares the
  number, as JavaScript's `==` does; a method on a missing property is
  `null`, not an error; `file.backlinks` counts links, embeds and property
  links.

[OPEN] The author's reading where "Functions" and "Bases syntax" say
nothing, for the maintainer to keep or change: the `Unique` summary skips
empty values; `null < 3` is false, null comparing with nothing; `true == 1`
is false, `==` making no number of a boolean; a link and a text compare by
the file they name, then by the text as written.

### 3.3 The layouts

- **Table**: widths by the column's edge; the column's menu sorts, removes or
  summarizes it; a note property's cell is edited in place (text, number,
  date, checkbox); groups with their summaries.
- **Cards** and **list**: as their settings say; the first property is the
  title.
- **Kanban** (Obsidian 1.14's, as its page describes it): a column per value of
  `groupBy`, "None" last; a card dragged, or moved from its menu, writes the
  value; "+" makes a note with it; a column added by name, columns reordered
  by dragging their heads; a column whose last card left stays until the board
  is opened again.
- **Calendar** (Verso's): a month of days; a note dragged to another day, or
  moved with Alt and the arrows, has its date written — the time kept, the end
  date moved with it; "+" on a day makes a note on it.
- **The daily notes' month**, in the side panel: a mark on each day with a
  note; a click opens it or makes it from the daily template; the arrows move
  between days.

Drags follow the pointer, as the window's tabs do: the web view's own drag
and drop does not reach elements inside the page (seen in the running app).

### 3.4 Writing

- A note's property: its lines only (`props.ts`, the properties panel's
  code), over the revision read, after the note's open tabs are saved; the
  note's tabs read the result; every base on screen asks again.
- A base's YAML: from its menus only, through the `yaml` package, which kept 83
  of the 84 public files byte for byte when read and written untouched — the
  84th pads its inline lists (`[ a, b ]`), which Verso keeps when the file
  does.

## 4. A second window on the same folder

Window → New Window, or the command palette: another window of the open
folder, with its own tabs over the same session.

- It joins the open folder and starts with one empty workspace; its layout is
  not remembered — the main window's is.
- What one window writes, the other reads as it reads any change made outside
  (the watcher tells every window); a write over a note the other changed is
  refused and shows both versions (invariant 11).
- Opening another folder is refused while more than one window is open — the
  other would keep showing the old folder and write under its names.
- Not built: tearing a tab out into its own window by dragging it
  (ADR 0049 §3, for the reason given there).

## 5. The terminal and agents (ADR 0054)

- Settings → Terminal and agents: the command's state — installed, not
  installed, another `verso` there, or none in this build — and "Install",
  "Replace" (after asking) or "Remove".
- "Add to Claude Desktop", once the command is installed: the entry shown,
  then written; the reply names the copy of the previous file.
- Text to copy for Claude Code (`claude mcp add verso-<folder> -- verso mcp
  --key <key>`) and for any other client (the JSON entry).
- `verso mcp --key <key>`: the new form of the command, naming the folder by
  the key the app gave it.

## 6. What this memo did not verify

- **Obsidian reading what Verso writes**: no Obsidian 1.14 to open a kanban
  base in; the table, cards and list keys are the documented and observed
  ones.
- **The password prompt**: `/usr/local/bin` on this Mac is the user's, so
  "Install" linked without one; the path through `osascript` was run without
  privileges on a scratch directory, with a path holding a space and a quote.
- **Claude Desktop's real file**: not written; the writing is tested on
  temporary directories (`verso_core::clients`), with another server and a
  key of the client's own kept, a copy made, and a file that is not JSON left
  alone.
- **Windows and Linux**: not run.

## 7. How the maintainer verifies, without reading code

1. Open a folder of notes with properties; Command palette → "New base": a
   table of every file opens. Menus: sort, filter (`status == "ativo"`),
   properties, settings; switch the layout to cards, list, kanban, calendar.
2. Kanban: Sort → Group by a property; drag a card to another column; open the
   note — only that property's line changed (`git diff` shows one line).
3. Calendar: settings → date property; drag a note to another day; the date's
   line is the only change.
4. In a note, Command palette → "Insert base": the view appears in the text;
   in Edit mode, its menus change the block; `![[File.base#View]]` shows a
   view of another base.
5. Right panel → calendar: the month; a day with a daily note is marked; a
   click opens it or makes it.
6. Window → New Window: a second window of the folder; edit a note in one, see
   it change in the other.
7. Settings → Terminal and agents → Install; in a new terminal, `verso --help`
   and `verso .`; "Add to Claude Desktop", restart it, ask about the notes.

## 8. The reading

Two fresh Opus 5.5 sessions read the change on 2026-09-24: one the Rust (the
core, the host, the command line), one the UI, the documents and the release
workflow (ADR 0032, as the maintainer's item 17 of `docs/review/phase-2.md`
§6 has it). Their findings, and what was done with each:

**BLOCKING — all fixed**

| # | Finding | Done |
|---|---|---|
| R1 | Evaluation not bounded in memory or stack: a base could double a list, replace a letter with a long text, nest a list a thousand deep, chain formulas past the stack — and abort the app, unsaved text with it | Every value made or copied is charged to the budget (a step per element and per 16 bytes); lists stop at 2^20 items, nesting at 100, recursion at 160 levels; `replace` and `join` measure before making; comparisons counted. Tests `a_base_cannot_make_the_evaluation_outgrow_its_bounds`, `a_chain_of_formulas_stops_at_the_depth_bound` |
| R2 | Links to no file compared ignoring case and heading, where "Bases syntax" says their text must be identical | Identical text; a link and a text by the file, then by the text. Test `links_to_no_file_are_equal_only_as_written` |
| R3 | The default `Count` hid a summary of the base's own named `Count` | The base's own first. Test `a_summary_of_the_base_may_take_a_default_name` |
| U1 | A `base` block inside a callout, quote or list: its menus rewrote it without the marks, losing filters and views | Shown whole, not edited from its menus |
| U2 | The filter menu dropped nested groups on any save | A filter with a nested group is left to the source |
| U3 | A drop resolved against another view of the page, or a redrawn board, wrote wrong values (1970 dates, another board's column) | Only the zones of the drag's own view; a drag whose view was redrawn drops nothing |
| U4 | A menu edit rewrote the whole base in the package's style (indentation, folded text, blank lines) | The menus edit a base only when the package writes it back byte for byte; otherwise it is edited as text — 83 of the 84 public samples stay editable |

**IMPORTANT**

| # | Finding | Done |
|---|---|---|
| R4 | `query_base` runs on the main thread | Deferred: the bounds above cap its time (the budget) and its stack; moving it off the thread, with a snapshot of the folder, is a change of its own |
| R5 | The sort's comparison was not an order (NaN, month durations, `""` against empty) and could panic | Fixed: an order with no exception, empty values last in both directions. Test `a_sort_over_mixed_values_is_an_order` |
| R6 | Date arithmetic could overflow | Fixed: dates stop at JavaScript's range. Test `a_date_moved_past_the_calendar_stops_at_its_edge` |
| R7 | The host links the command line with the system's tools (`ln`, `readlink`, `rm`, `xattr`, `osascript`), which the reading sees as a way around the `std::fs` guardrail | [OPEN] for the maintainer — an exception declared in the host's `clippy.toml`, or the tools as now; recorded in ADR 0054 |
| R8 | The author's semantics where the documents say nothing, not labelled | Labelled [OPEN] in section 3.2 |
| R9 | Missing tests: bounds, `Workspace::query_base`, the host's window and command-line paths | Bounds tested (above); the rest deferred |
| U5 | The kanban's remembered columns went stale and were written into the base | Remembered per property, never written |
| U6 | The kanban wrote numbers and checkboxes as texts | A column keeps its kind |
| U7 | A view read a property ignoring case and wrote a second key beside it | Written under the key the note has |
| U8 | Closed notes' bases kept querying the core | Unregistered; a view taken down asks nothing |
| U9 | A redraw dropped a field being typed | No redraw while a field of the view has the focus. Focus kept after the view's own writes: deferred |
| U10 | The sort, group and filter menus used values from when they were drawn: a second change undid the first | Read when the change is made |
| U11 | Accessibility: column order only by dragging; the `</>` button; the result count not announced | Deferred to the VoiceOver pass |
| U12 | Author's details inside points marked as the maintainer's (ADR 0053 point 3, ADR 0054 point 1) | Moved under what the author built |
| U13 | Contradictions: the briefing's structured-views row still PROPOSED while ADR 0053 calls it decided; ADR 0013's "materialize in the file" against copying and "save as a note" | Recorded, no side taken: the maintainer's |

**MINOR** — left, listed for later: a `not` group admitting rows on errors;
grouping by a link and by a text in neighbouring columns; custom summaries
evaluated at the first row; non-finite summary numbers; two folders of one
name giving Claude Desktop one server name; the backup's permissions; the
command line linked from a translocated app; `xattr` failures ignored; window
messages sent to "main" only; the `.base` read before its size check; CSV
cells starting with `= + - @`; no Escape or auto-scroll while dragging;
datetime offsets dropped on moves; two views named "Table" when adding to an
empty base; `note.` prefixes in the sort menu; embeds keeping the base text
read when drawn; an unclosed fence duplicating its last line; "Insert base"
into the frontmatter in Source mode; a misspelled embed view shown as the
first; bookmarks written from each window's copy; the release's `cp` without a
guard; Claude Desktop's file rewritten with its keys sorted (meaning and a
copy kept, where ADR 0054 says "like a note").
