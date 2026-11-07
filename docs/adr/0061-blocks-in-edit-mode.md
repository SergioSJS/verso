# ADR 0061 — Blocks in Edit mode: a handle to drag, a + to add, a menu per block

- Date: 2026-10-02
- Source: the maintainer, 2026-10-02, in session: "o principal aqui é ter
  essa experiência desse arraste de componentes" (what matters is the
  experience of dragging the pieces around) and "considere que essa
  funcionalidade vai rodar no modo editar" (it runs in Edit mode); on the
  unit, "linha eu não curto, no parágrafo ok, e duplo enter pra separar o
  bloco tb" (not the line; the paragraph is fine, and a double Enter
  separates blocks); asking for this record, "quero que as pessoas consigam
  migrar do notion praticamente sem atritos" (people should be able to move
  from Notion with next to no friction), a feature they called important and
  missing from Obsidian.
- Revisions: 2026-10-06 — decided by the maintainer (Status): D1 with S1
  and S2 in one pull request, D8 (b) with the daily note on ⌘⇧D, D9 (b),
  the rest as written. 2026-10-22 — the maintainer approved item 9, blank
  lines and the rule (below), in session.
- Status in the briefing: not present

## Context

Notion's editor is made of blocks. Hovering one shows, in the left margin, a
`+` and a handle of six dots (⋮⋮). The handle dragged moves the block; clicked,
it opens the block's menu — delete, duplicate, turn into, copy link to block,
move to, color, comment. The `+` opens the menu of content types that `/`
opens. Enter starts a new block and Shift-Enter breaks a line inside one;
⌘⇧↑/↓ moves the selected blocks, ⌘D duplicates them, ⌘/ changes their type.
The sources are Notion's public help —
[keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts) and
[writing and editing basics](https://www.notion.com/help/writing-and-editing-basics),
read on 2026-10-02 — and nothing of Notion beyond them.

Obsidian's editor has no block handle: the maintainer reports none, and at
least four community plugins exist to add one —
[Dragger](https://community.obsidian.md/plugins/dragger),
[Notion Block](https://community.obsidian.md/plugins/notion-block),
[Feel the Notion](https://community.obsidian.md/plugins/feel-the-notion) and
[Block Drag & Drop](https://community.obsidian.md/plugins/block-drag-drop),
known from their public listings only — beside a
[request on Obsidian's forum](https://forum.obsidian.md/t/reorder-text-blocks-lines-paragraphs-with-mouse-drag-and-drop/5049?page=2)
to reorder paragraphs by dragging. [ADR 0003](0003-primitives-not-workarounds.md):
what needs a plugin should be a primitive. One of them, Notion Block, offers a
line mode and a paragraph mode — the choice the maintainer made below.

Verso already has most of the parts:

- Edit mode is CodeMirror 6 with Live Preview
  ([0023](0023-stack-core-and-editor.md); roadmap item 2.4;
  `app/ui/src/live.ts`). Its syntax tree is CodeMirror's Markdown parser, not
  `verso-dialect`: the dialect's `Document` is a report, not a tree
  ([spec](../spec/dialect.md) Q18, reading (b)), and the editor never asks it.
- `blocksOf` in `live.ts` already finds whole blocks in that tree — tables,
  display math, `base` and `mermaid` fences, lone embeds — to draw them in
  place.
- The `/` menu (`app/ui/src/slash.ts`) inserts where a `/` is typed at the
  start of a block; its items are a list kept apart from how the menu opens.
- `app/ui/src/bases/drag.ts` drags kanban cards by the pointer, as the window
  drags tabs and tree rows: the web view's own drag and drop does not reach
  elements inside the page.
- `app/ui/src/listKeymap.ts` renumbers an ordered list after Tab and
  Shift-Tab.
- CodeMirror's default keys are on in every note: ⌥↑/↓ moves the line, ⇧⌥↑/↓
  copies it, ⌘/ toggles an HTML comment. The window's hotkeys run before the
  editor's (`appHotkeys` in `main.ts`), and ⌘D is the daily note
  ([0049](0049-phase-2-scope-widened.md) §2).
- A heading folds with its section (the fold chevrons, "Collapse all
  sections").

What a block is stays undefined for the dialect: spec Q21 is `[OPEN]`, and
with it Q3 beyond its two decided positions (the end of a paragraph, the end
of a list item) and Q4. *(Q21, Q3 and Q4 decided by the maintainer on
2026-10-07 — spec v0.28; `docs/spec/dialect.md`, Q21: a block is the
editor's unit.)*

[ADR 0060](0060-makemd-organizing-features.md) D9 — "the block compositor
waits for the month of use" — is a different thing: make.md's page-layout
blocks (buttons, columns, ratings, progress), kept in SQLite
([memo](../reference/makemd-decision.md), F4). Moving Markdown blocks inside
a note writes nothing new.

## Decision

Proposed by the author to the maintainer and decided by the maintainer on
2026-10-06 (Status). Where there were options, the recommendation is still
marked, and the one chosen is said.

### 1. Scope and principle

1. **Scope (D1).** Phase 2 is widened, as it was for the views
   ([0053](0053-views-bases.md)), the board
   ([0057](0057-board-json-canvas.md)) and make.md's features
   ([0060](0060-makemd-organizing-features.md)), for two slices: **S1** the
   handle, the `+`, the block menu and the keys; **S2** several blocks at
   once, and moves across containers — both in one pull request, by the
   maintainer's choice of 2026-10-06. Moving a block to another note
   (Notion's "Move to"), which writes two files with no transaction between
   them ([0048](0048-file-operations-in-ui.md)), and importing a Notion
   export are each decided later, on their own. The Phase 2 exit gate does
   not change ([0034](0034-roadmap-in-phases.md)).
2. **Notion's hands, Obsidian's files (D2).** The gestures follow Notion; the
   file stays Markdown as Obsidian reads it. No new syntax, no new frontmatter
   key, no data per block: invariant 12 is not touched and
   [ADR 0013](0013-degrades-to-markdown.md) holds with nothing to degrade.
   Where Notion's gesture and Markdown's meaning differ, Markdown's wins:
   `> ` stays a quote, though Notion makes it a toggle; Notion's toggle is a
   foldable callout.
3. **Where (D3).** Edit mode, in a note's tab. Source mode stays plain text,
   as the maintainer put it; Reading has no handles. The other editors — a
   board card, an embed edited in place (0060 S4) — do not get them in S1.
4. **In the editor only (D4).** Blocks come from the editor's syntax tree, in
   the window. `verso-dialect`, the contract, the index and the core do not
   change, and no command is added to the contract
   ([0026](0026-core-ui-contract-inviolable-rules.md)). A move is an edit, as
   typing is: the same autosave, the same check that the file on disk is the
   one that was read (invariant 11), the same atomic write (invariant 9). It
   is not a conversion in invariant 8's sense
   ([0012](0012-files-are-source-of-truth.md)): it changes the text as the
   user's hands would, and ⌘Z undoes it.

### 2. What a block is (D5)

A node of the syntax tree — never a line (the maintainer: "linha eu não
curto").

| Construct | The block | Notes |
|---|---|---|
| Paragraph | From its first line to its last | One Enter stays inside it, as a line break (Q15); a blank line ends it, so a double Enter starts the next block — Markdown's own rule. Display math and an embed alone on its line are paragraphs. |
| Heading | Its line (two, for a setext heading) | When folded, with its section, as the screen shows it |
| List item — bullet, numbered, task | The item, with its continuation lines and nested items | Items are blocks at every depth |
| Quote, callout | The whole quote | Paragraphs inside a quote are not blocks of their own in S1 |
| Code, fenced or indented | The whole block | |
| Table | The whole table | |
| Divider, HTML block, comment | The whole construct | |
| Frontmatter | Never a block | CodeMirror's Markdown parser does not know frontmatter: `frontmatterEnd` in `live.ts` finds it, and the properties panel edits it |

Two rules keep a moved block's meaning:

- **A `^id` travels with its block.** A `^id` at the end of a block is inside
  it. A line holding only a `^id`, after a blank line, moves with the block
  before it: Obsidian attaches it to that block (spec Q3, observed on
  2026-09-21) and Verso's parser to its own line, so moving the two together
  keeps the file's meaning whichever way Q3 is answered.
- **An ordered list is renumbered.** CommonMark takes an ordered list's start
  from its first item and ignores the other numbers: moving the third item of
  `1. 2. 3.` to the top, unrenumbered, makes Reading count 3, 4, 5. The list
  an item leaves and the list it joins are renumbered as Tab renumbers them
  today; a list that starts at a number other than 1 keeps its start.

The definition is the editor's and closes nothing in the spec: Q21 stays
`[OPEN]`. *(Q21 decided on 2026-10-07 by this definition — spec
`docs/spec/dialect.md`, Q21.)* It agrees with the two positions Q3 decided — the paragraph and the
list item are blocks here — and is offered as an input when Q21 is answered.

### 3. The handle, the + and the drop (D6)

- Hovering a block shows, in the left margin and never over the text, a `+`
  and a ⋮⋮ beside its first line, and a light outline around the whole block:
  where it begins and ends is seen before anything moves. The block is found
  from the tree at the pointer; nothing is drawn per block of the note.
- ⋮⋮ pressed and moved past five pixels is a drag (`drag.ts`'s threshold). A
  label with the block's first line follows the pointer, a line between
  blocks shows where it will land, and the note scrolls when the pointer
  nears its top or bottom edge. Esc, or a release outside the note, drops
  nothing.
- **Where a block may land (S1):** between blocks of its own container — a
  top-level block among top-level blocks, a list item among the items of its
  own list, at its own depth. Across containers — a paragraph into a list or
  a callout, an item out to the top level, an item to another depth by the
  pointer's horizontal position, as Notion nests — is S2: the moved text then
  gains or loses `> ` marks or indentation.
- **Blank lines.** The block's text moves byte for byte. It is cut with the
  blank lines that follow it (those before it, when it is the note's last
  block) and put in followed by one blank line (preceded by one, at the end
  of the note). A list item takes its list's spacing: a tight list stays
  tight, a loose one loose. No other line changes, but for the renumbering of
  section 2.
- One ⌘Z undoes the whole move, and only it. If the note changes during the
  drag — another program writes it — the drop does nothing, as `drag.ts`
  drops nothing when its view was redrawn.
- ⋮⋮ clicked opens the block menu (D7).
- `+` clicked adds an empty paragraph below the block and opens the `/` menu
  there; Esc closes the menu and takes back what the `+` added.
- A block drawn in place — a table, a base, a diagram, math, an embed — has
  the handle too; dragging it moves its source.

### 4. The block menu (D7)

Every item is also a command of the palette, so the keyboard and a screen
reader reach all of it ([0035](0035-cross-cutting-requirements.md)), and each
can be bound to keys in Settings › Hotkeys.

- **Delete.**
- **Duplicate** — the copy below, separated as a moved block is.
- **Turn into** — Text, Heading 1–3, Bulleted list, Numbered list, Task,
  Quote, Callout, Code. A target that cannot hold the block's text unchanged
  is not offered: a paragraph of several lines does not become a heading, a
  code block does not become a list. No text is lost or reflowed.
- **Copy link to block** — on a paragraph or a list item, it writes a `^id`
  at its end if there is none (the two positions Q3 decided) and copies
  `[[Note#^id]]` in the form the link-format setting gives; on a heading, it
  copies `[[Note#Heading]]` and writes nothing. Not offered on other blocks
  until Q3 decides where their `^id` goes. The id is six lowercase letters
  and digits, inside the charset Obsidian's documentation gives (Q22), and
  unique in the note; uniqueness across the folder is Q4's.
- **Not offered:** Notion's color and comment — no Markdown form
  ([0013](0013-degrades-to-markdown.md)); "Move to" — later (D1).

### 5. Keys (D8)

Notion's keys are taken in Verso: ⌘⇧↑/↓ selects to the start or end of the
note (macOS), ⌘D is the daily note, ⌘/ toggles a comment.

- **(a) Recommended.** ⌥↑/↓ moves the block at the caret and ⇧⌥↑/↓
  duplicates it above or below — the keys that move and copy the line today,
  so a block of one line behaves as it does now. Inside a table or a code
  block they keep moving the row or the line, as now. Notion's keys stay with
  their current owners; someone who wants them rebinds "Move block up" and
  "Move block down" to ⌘⇧↑/↓ in Settings › Hotkeys.
- **(b) Chosen** (2026-10-06). Notion's keys by default, displacing
  select-to-start and select-to-end, the daily note's ⌘D and the comment
  toggle: in Edit mode, ⌘⇧↑/↓ moves the block at the caret (the blocks a
  selection touches, S2), ⌘D duplicates it below and ⌘/ opens "Turn into".
  ⌥↑/↓ and ⇧⌥↑/↓ keep moving and copying the line. The daily note moves to
  ⌘⇧D ([0049](0049-phase-2-scope-widened.md) §2, revised). Source mode keeps
  its keys: it has no blocks (D3).

### 6. Enter (D9)

- **(a)** As now, the maintainer's word of 2026-10-02: Enter breaks the line
  inside the block, and a double Enter starts the next one. Nothing in the
  editor changes.
- **(b) Recommended, and chosen** (2026-10-06). (a), plus a setting, "Enter starts a new block", off by
  default. On, Enter in a paragraph writes the blank line that starts a new
  paragraph and Shift-Enter writes the single line break — Notion's two keys,
  still plain Markdown. Lists, quotes, code and tables keep their Enter. The
  default stays the maintainer's; the setting is for the hands that arrive
  from Notion expecting one Enter.

### 7. Smaller things (D10)

- `/` gains **Toggle**, which writes a foldable callout (`> [!note]- `). It
  folds in Reading (Q5); Edit shows it open, as it shows every callout today.
- `[] ` typed at the start of a line becomes `- [ ] ` — Notion's to-do
  shortcut; at the start of a line `[] ` means nothing in Markdown.
- Settings, beside Edit mode's line numbers: **Block handles** (on) and, with
  D9 (b), **Enter starts a new block** (off).
- Every string in pt-BR and EN, none loose; the handle's tooltip says both of
  its actions ("Drag to move · click for the menu").

### 8. Notion, gesture by gesture

| Notion | Verso | When |
|---|---|---|
| ⋮⋮ dragged | The handle | S1 |
| ⋮⋮ clicked: delete, duplicate, turn into, copy link | The block menu | S1 |
| ⋮⋮ clicked: move to | — | Later (D1) |
| ⋮⋮ clicked: color, comment | — | Not planned (D7) |
| `+` | `+`: a paragraph below, `/` open | S1 |
| `/` | `/`, as today, plus Toggle | S1 |
| ⌘⇧↑/↓ | ⌥↑/↓, or ⌘⇧↑/↓ after rebinding (D8) | S1 |
| ⌘D | ⇧⌥↓ (D8) | S1 |
| ⌘/ turn into | Block menu; palette commands | S1 |
| Tab, Shift-Tab | In lists, as today | Today |
| Enter, Shift-Enter | Double Enter; or the setting (D9) | Today; S1 |
| `- `, `1. `, `# `, `[] ` | Markdown itself; `[] ` added | Today; S1 |
| `> ` toggle | `> ` is a quote; Toggle in `/` | S1 |
| Several blocks dragged together | The blocks a text selection touches | S2 |
| Dragged right to nest | List items, by the pointer's position | S2 |
| Dragged aside into columns | — | 0060 D9's compositor |

### 9. Blank lines and the rule (revision, 2026-10-22)

The maintainer, 2026-10-22, in session: "Como temos os componentes iguais aos
do Notion para arrastar, e definimos que o Enter numa linha vazia delimita um
componente do outro, quando usamos a linha horizontal precisamos de: linha
vazia, os três traços, Enter, Enter, e então continuar escrevendo. Está uma
distância gigantesca de um conteúdo para o outro, e acho que isso acontece
com outros elementos também. Estamos espaçando muito as informações, sendo
que esse Enter está ali para delimitar componentes. Inclusive no modo
Leitura nem precisaria ter esse Enter vazio de separação." (As the blocks
are Notion's, and an Enter on an empty line is what ends one, the rule took
a blank line, the three dashes, Enter, Enter, and only then more writing;
the distance between two pieces of content is huge, and other elements do
the same. The Enter is there to delimit components, so it should not add
that much space — and Reading would not need the empty separating line at
all.) He approved three changes. The file is never touched by the first two:
they are drawing, and Source mode is unchanged.

1. **Live Preview: a blank line that only separates two blocks is a thin
   gap.** The first blank line of a run, when the caret is not on it and the
   selection does not span it, is drawn at 0.4 of a line (a line decoration,
   `cm-lp-gap`, `line-height: .68` against the editor's 1.7). Under the
   caret, or inside a selection, it is a full line, so typing works. Each
   further blank line of the same run is space someone typed on purpose: it
   is kept, at 0.6 of a line (`cm-lp-gap-extra`) — chosen by the author, the
   maintainer's "visible but reduced". A blank line is not drawn thin inside
   code, an HTML block, a table or a comment (it is content there), in the
   frontmatter (folded), or as the last line of the note (the place one
   clicks to go on writing). The block model and the handles do not change: a
   block is still bounded by its blank line, and the handles read the
   editor's own geometry.

   *Revised 2026-11-07*, on the maintainer's report in session: "um bug
   irritante no modo de edição ao selecionar texto, ele aumenta os espaços"
   (an annoying bug in Edit mode: selecting text makes the spaces grow). A
   ⌘A or a drag over the note made every gap inside the selection a full
   line, and the note jumped about a quarter taller. Only the caret makes a
   gap a full line now: under a selection it stays thin, as it has no mark
   to show and what is typed replaces the selection. Selecting never
   changes the vertical rhythm: a line the selection or the caret reveals
   keeps its rendered height (a heading with its `#`, a rule's `---`), and
   the hover outline of D6 is not drawn on a block the selection already
   covers.
2. **Reading: space comes from the blocks' margins only.** A blank line in
   the source never adds space — no empty paragraph, no `<br>`, no wrapper
   (checked by machine: five blank lines and one give the same distance). The
   rhythm is one unit, `--flow` (.9em, where it was 1em), under paragraphs,
   quotes, code, tables, callouts, lists and display math; a heading has
   1.5em above and .4em below (was 1.8 and .5); the rule has 1em above and
   below with a 1.4em box (was 1.2em and 1.8em), for every `hr-style` value.
   The theme's `paragraph-spacing` (tight, loose) still sets a paragraph's
   own bottom margin on top.
3. **`---` then Enter writes the blank lines around the rule.** In Live
   Preview and in Source mode, with the caret at the end of a line that is
   exactly `---`, `***` or `___`: if the line above is a paragraph line (so
   that `---` would be a setext heading's underline, spec Q19), a blank line
   is inserted before; one blank line is written after, and the caret goes to
   the line below it, so that a single Enter continues the writing. It is
   the text a person would have typed by hand, as one change and its own step
   of the undo history (one ⌘Z gives back the line as typed). It does
   nothing — Enter is the ordinary Enter — inside code, a table, a list or a
   quote, in the frontmatter (its opening and closing `---`), on the first
   line of the note (it may open a frontmatter), or with a selection or the
   caret not at the end of the line. Invariant 7 holds: nothing is written
   on opening, only by a key the person pressed; no fixture changes.

## Consequences

- Each slice is a pull request of its own, with its changelog lines in both
  languages; a note of the demo vault that teaches the handle, the `+`, the
  menu and the keys, a stop on "Tour do Verso", and its steps in
  [the walkthrough](../reference/demo-vault-walkthrough.md)
  ([0058](0058-demo-vault-as-tutorial.md)); the drags run by machine in the
  browser harness, by the pointer, as the board's tests drag; and
  `scripts/check.sh` and `scripts/check-linux.sh` green.
- Finding a block and computing a move is a pure function of the editor's
  state, tested by the window's unit tests (`npm test` in `app/ui`,
  [0029](0029-guardrails-in-ci.md)), seen failing before the code: a
  paragraph of several lines, a list item with nested items, an ordered list
  renumbered, a `^id` line carried, a folded heading, the frontmatter never a
  block, a tight list kept tight.
- ⌥↑ in a paragraph of several lines changes meaning: today it moves one line
  out of the paragraph; with D8 (a), the whole paragraph. Intended, and said
  in the changelog.
- `drag.ts` is generalized, not copied: its pointer handling serves both, and
  its drop-zone lookup — tied to a base's `[data-drop]` elements — gives way,
  in the editor, to the block positions of the tree.
- The spec does not change. When this ADR is accepted, Q21 gets a line
  pointing here, in both languages.
- No new dependency is expected.
- Not covered: touch (no mobile in this phase,
  [0034](0034-roadmap-in-phases.md)); dragging between two notes, which is
  "Move to" (D1). *Amended 2026-10-16:* touch is covered by
  [0076](0076-the-window-on-every-screen.md) item 7 — on a touch screen the
  handles and the `+` are not drawn and their margin is not kept; the
  keyboard's toolbar moves, turns and deletes the block at the cursor.
- Sources: Notion's behavior from its public help pages linked above, and the
  Obsidian plugins from their public listings; no plugin's code was read.
  Obsidian itself was not inspected ([0009](0009-external-constraints.md)).
- **Authorship.** This record was written by Opus 5.5, in the documents'
  author role of [ADR 0032](0032-author-and-reviewer-roles.md), and is read by
  Fable 5.1 in a session of its own before the maintainer decides. The code,
  UI and TypeScript, follows the same table.

## Discarded alternatives

Weighed by the maintainer on 2026-10-02:

- The line as the unit — "linha eu não curto" (Notion Block's line mode).
- One Enter ending a block, which makes the line the unit again — the
  maintainer's first idea, replaced the same day by the double Enter. D9 (b)
  is not that: it writes a blank line, so the unit stays the paragraph.
- Handles in Source mode — Source stays plain code.

Considered by the author and put to the maintainer with this record:

- A block tree built in `verso-dialect` and sent through the contract — the
  dialect is a report by Q18 (b), the editor would be its only consumer, and
  the editor already has a tree.
- Waiting for Q21 — Q21 binds `^id`, merge and visibility; the editor's unit
  can come first, inside the positions Q3 already decided.
- Columns by dragging a block aside, block colors, comments — no Markdown
  form ([0013](0013-degrades-to-markdown.md)); columns belong to 0060 D9's
  compositor.

## Status

Accepted (2026-10-06): the maintainer, in session, answering the questions
put with this record. D1: "S1 e S2 juntos" — both slices in one pull
request. D8: "As do Notion" — option (b); for the daily note, "⌘⇧D". D9:
"Como hoje + ajuste opcional" — option (b). D2–D7 and D10: "Aceito como
está". The unit of D5 and the (a) part of D9 were the maintainer's words of
2026-10-02.
