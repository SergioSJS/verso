# Decision memo: what make.md does, and how Verso would do it

- Date: 2026-10-02
- Status: **decided by the maintainer on 2026-10-02**, in session: every
  recommendation accepted; the answers are in section 10 and recorded in
  [ADR 0060](../adr/0060-makemd-organizing-features.md). Sections 1 to 9 are
  the memo as the maintainer read it: research (1 to 5), the decisions with
  their options (6), the plan (7), what was not verified (8).
- Author: Opus 5.5, standing in for Opus 5 in the documents role of
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md). Reader: Fable 5.1,
  whose findings of 2026-10-02 are folded into this text.

## 1. What was asked

- 2026-10-02: "aproveite e já planeje a próxima feature, pensei de já
  fazermos as funcionalidades do plugin make.md do obsidian, dito isso,
  investigue, extraia as funcionalidades e planeja exatamente como fazer,
  considerando configurações e tal. o obsidian tá disponível pra vc abrir e
  testar."

## 2. The sources, and what each is allowed to be

| Source | What it gave | Admissible because |
|---|---|---|
| make.md's documentation, `Make-md/makemd-docs` on GitHub (31 pages, last pushed 2025-01-06) | the features as the authors describe them; much of it from 2023 | public documentation |
| That repository is itself a make.md vault | the files the plugin wrote: `.space/context.mdb` (SQLite), `.space/waypoints.json`, frontmatter keys in the notes | files on disk, read as data |
| The plugin's source, `Make-md/makemd` at 1.3.5 (commit `cb9ca90`, 2026-07-09), **MIT** licence (the licence read through `gh api`, the source from a shallow clone) | the settings, with their defaults and their labels; the type of `.space/def.json`; the frontmatter keys; the folder-note rule | MIT allows reading and reuse with attribution. [ADR 0009](../adr/0009-external-constraints.md) forbids inspecting the **Obsidian app**; make.md is a third party's plugin, not the app. Nothing of Obsidian was read |
| Obsidian 1.13.7 with make.md installed | **not obtained**: installing the plugin into the Sandbox vault was refused by this session's permission check (third-party code). Section 8 holds the steps that would settle what only observation can | — |

Read for the formats, not for the code: nothing in section 7 copies make.md's
implementation, and no part of it needs to.

## 3. What make.md is

A plugin that turns Obsidian's folders and tags into "spaces": each folder or
tag gets a page of its own, labels, a custom order, pinned items and a
database ("context") of its notes' properties, and the editor gains inline
editing of embedded notes ("flow"). It stores its own state inside the vault:
a `.space` folder inside every folder that has been customised, holding JSON
and SQLite files, plus the notes' frontmatter.

### 3.1 The features, by area

The column "Verso today" is what the window does on `feat/board` at
`725bf70`.

**Labels**

| # | make.md | Stored in | Verso today |
|---|---|---|---|
| L1 | Sticker (emoji or icon) on any note or folder, shown in its navigator, tabs, title and — optionally — before links to it | frontmatter `sticker:` (key configurable); values `emoji//1f680`, `lucide//home`, `ui//home` | none |
| L2 | Colour of an item in the navigator | frontmatter `color:` | none |
| L3 | Cover image on a note or a folder's page, repositioned by dragging | frontmatter `banner:` (path or URL) and `banner_y:` | none |
| L4 | The first alias shown instead of the file name in the navigator (off by default) | frontmatter `aliases:` | the properties panel knows `aliases` |
| L5 | A default sticker and colour for every item of a folder | `.space/def.json`: `defaultSticker`, `defaultColor` | none |

**The navigator** (make.md's file tree, replacing Obsidian's)

| # | make.md | Stored in | Verso today |
|---|---|---|---|
| N1 | Manual order: drag an item to a place among its siblings | per-folder data under `.space` (to observe, section 8: the notes of the docs vault also carry a `rank:` key from an older version) | the tree sorts by name, kind, size or date |
| N2 | Pins: notes and folders pinned to a folder (or tag), shown in its list | `.space/def.json`: `links` | bookmarks, per folder, in the window's `localStorage` |
| N3 | Focuses: a row of named roots ("waypoints") on top of the navigator, each a set of folders/tags | root `.space/waypoints.json`, e.g. `[{"name":"Home","sticker":"ui//home","paths":["/"]}]` | one root; workspaces (*áreas*) are sets of tabs, not of folders |
| N4 | Hide an item from the navigator | the plugin's settings: `hiddenFiles`, `hiddenExtensions`; the navigator alone filters them | `verso-fs` accepts a list of ignored paths (ADR 0044), and nothing fills it (`verso-core` opens the folder with an empty one); an ignored path is not hidden but gone — no handle, no index, its links dead |
| N5 | Live search: a folder's list filled by a filter (folder, extension, path, sticker, alias, frontmatter, tags) that updates itself | `.space/def.json`: `joins` | bases filter notes the same way, in a view, not in the tree |
| N6 | Blink: a quick switcher that also edits the note in place | — | ⌘P quick switcher and ⌘K search; no edit in place |
| N7 | Overview: three columns, folder → items → note | — | the folder page lists a folder's items |
| N8 | Preview on hover with ⌘; reveal the active file; expand on click; indentation lines; row height; navigator on the right; delete to the bin, to the system's trash or for good | settings | reveal by command; the bin (ADR 0048) |

**Folder notes and pages**

| # | make.md | Stored in | Verso today |
|---|---|---|---|
| F1 | Folder note: `Folder/Folder.md` by default; a fixed name optional (`folderNoteName`); beside the folder optional | settings (`folderNoteInsideFolder` is a key with no UI) | `folderNoteOf`: `Folder/Folder.md`, or `Folder.md` beside it, case-insensitive |
| F2 | "Transform into folder": a note becomes a folder with the note as its folder note | — | none |
| F3 | The space page: header (sticker, title, cover, properties), the folder note, the context's view of the items | `.space/views.mdb` (SQLite) for its layout | the folder page: the folder note and a list of the folder's items |
| F4 | Blocks on the page: note, list view, divider, image, button (run a command, open a link), label, sticker, rating, toggle, progress, groups and columns, with size, margin, padding, border, colours | `.space/views.mdb` | none |
| F5 | A template for new items of a folder, and a default template for new spaces | `.space/def.json`: `template`; setting `defaultSpaceTemplate` | templates (the Templates folder) |

**Tags**

| # | make.md | Verso today |
|---|---|---|
| T1 | A page for every tag, listing its notes, with a context of its own; tags shown as a tree | the Tags panel, and search by tag |
| T2 | Rename or delete a tag across every note | none |
| T3 | A tag's context properties applied to subtags, and to a folder's items | typed notes ([ADR 0052](../adr/0052-typed-note.md)) give a schema by `type:`, not by tag |

**Contexts** (the databases)

| # | make.md | Verso today |
|---|---|---|
| C1 | Every folder and tag has a context: a schema of properties and a row per item, in `.space/context.mdb` — tables `m_schema`, `m_fields` and one table per schema (observed in the docs vault). Properties of Markdown notes are also written to their frontmatter (on by default) | bases over the folder, Obsidian's format ([ADR 0053](../adr/0053-views-bases.md)); properties live in the frontmatter only |
| C2 | Property types: text, number, date, options (multi), yes/no, link, file, image, relation (two-way), aggregate, formula, object, repeat | the properties panel's types; typed notes; link-valued properties as typed relations ([ADR 0057](../adr/0057-board-json-canvas.md)) |
| C3 | Views: table (resize, reorder, hide columns; an aggregate under each; pagination), list, cards, kanban (group by), calendar (month, week, day; start, end, repeat) — the docs' list; 1.3.5's view types are table, day, week, month, list, details, board, tasks, cards, catalog, gallery, flow | table, cards, list, kanban, calendar; formulas and grouping |
| C4 | 60 formula functions; 17 aggregates in the docs, 20 in 1.3.5 (`complete`, `incomplete`, `percentageComplete` added) | Obsidian's bases formulas |
| C5 | The note header ("inline context"): the properties of every context the note is in, at the top of the note; those properties hidden from Obsidian's own panel | the properties panel shows the frontmatter |
| C6 | A context's view embedded in a note | a ` ```base ` block |

**The editor** ("Basics" and "Flow")

| # | make.md | Verso today |
|---|---|---|
| E1 | Flow blocks: an embedded note edited in place, inside the note that embeds it; also from a link (⇧-click) | an embed is read-only, with "Editar ao lado" |
| E2 | The flow menu: `/` at a line start | the `/` menu |
| E3 | The styler: a toolbar over the selected text, with colours | a formatting bar that stays visible |
| E4 | `:` opens an emoji picker | none |
| E5 | Placeholder "type / for commands" on an empty line | none: the string exists (`slashHint`) and nothing shows it |

**Other**

| # | make.md | Verso today |
|---|---|---|
| X1 | Actions (commands as data, `commands.mdb`), kits (packs of spaces and templates), a homepage | none; schema packs are ADR 0015, proposed |
| X2 | Date and time formats, a default name for new notes, thumbnails, a search index cache | partly |

### 3.2 The settings

make.md 1.3.5 shows 51 settings in its own tab; "Basics" has 16 more keys,
11 of them shown in its panel. Each, with its default, is in appendix A.
Section 6, D12 says which of them Verso would have.

## 4. Against Verso's decided texts

| Text | What it says that bears on this |
|---|---|
| [ADR 0003](../adr/0003-primitives-not-workarounds.md) | what today needs a plugin should be an app primitive — the case for doing this at all |
| [ADR 0002](../adr/0002-negative-scope.md) | not a clone, and not a host for others' plugins: Verso takes what make.md is for, not its interface |
| [ADR 0012](../adr/0012-files-are-source-of-truth.md), [ADR 0013](../adr/0013-degrades-to-markdown.md) | files are the truth, and structured data degrades to readable Markdown. make.md's `.mdb` files are SQLite: Verso can **read** them, and must not make them a source of truth or write them |
| [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) | Verso's configuration lives outside the folder. A folder's order and pins are not configuration of Verso but data of the folder: where they go is D3–D5 |
| [ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md) | Verso extends Obsidian's dialect, never contradicts it. make.md's `![![Note]]` is not Obsidian's (D8) |
| [ADR 0044](../adr/0044-verso-fs-semantics.md) | dot entries are not walked; `.space/` is invisible to the tree and the index today, which is right for the tree, and means reading it is a deliberate exception (D2) |
| [ADR 0053](../adr/0053-views-bases.md), [ADR 0052](../adr/0052-typed-note.md), [ADR 0057](../adr/0057-board-json-canvas.md) | the contexts' views, schemas and relations already have a home: bases, typed notes, typed relations |
| [ADR 0034](../adr/0034-roadmap-in-phases.md), `CLAUDE.md` §2.5 | Phase 2 takes only what is recorded as a decision; the views (0053) and the board (0057) entered that way |
| [ADR 0058](../adr/0058-demo-vault-as-tutorial.md) | each slice teaches itself in the demo vault in the same pull request |
| The window's vocabulary | "space" already names a **workspace** (*área*, ⌘T) in the code and the English labels (D6) |

## 5. What the comparison shows

1. **Half of make.md is already Verso, under another name.** Contexts and
   their views are bases (0053); the `/` menu exists; templates exist; the
   folder page exists. What is missing is the layer that makes folders
   feel like places: labels, order, pins, a page with a header, tag pages,
   and editing an embed where it is.
2. **make.md's data is shareable where it is frontmatter, and only there.**
   `sticker`, `color`, `banner`, `banner_y`, `aliases` and the properties of
   notes are plain YAML that Obsidian keeps and Verso can read and write
   without any conversion. Everything under `.space/` is make.md's own —
   JSON (`def.json`, `waypoints.json`) or SQLite (`context.mdb`,
   `views.mdb`, `commands.mdb`).
3. **The expensive part is F4, the block compositor**, and it is the part
   that lives only in SQLite: adopting it would break ADR 0013, and
   re-creating it in Markdown is a design of its own.

## 6. The decisions

### D1 — Scope and phase

**Options:** (a) widen Phase 2, as the views and the board were: a revision
of ADR 0049 §3 and an ADR of its own, slice by slice; (b) after Phase 2.
**Recommendation: (a)** for the slices S1 to S4 of section 7 — labels,
folder pages, order and pins, flow — which serve the month of use (a
campaign vault lives in folders); S5 and S6 decided after S4 is in use. The
exit gate does not change.

### D2 — Compatibility with make.md's files

| | (a) Read and write all of make.md's files | (b) Share the frontmatter; read `.space/` only to import, by explicit conversion | (c) Ignore make.md |
|---|---|---|---|
| A vault used with make.md in Obsidian | the same in both | labels and properties the same in both; order, pins and layouts converted once | labels lost |
| ADR 0013 | broken (SQLite as truth) | kept | kept |
| ADR 0044 | `.space/` read and written | `.space/def.json`, `waypoints.json` and `context.mdb` **read** through `verso-fs`, by name, on a user's command | untouched |
| Cost | make.md's internals become a contract that changes with its releases | one converter, versioned against 1.3.5 | none |

**Recommendation: (b).** The `.mdb` would be read in memory — `verso-fs`
returns the bytes, and the reader opens them with `rusqlite`'s in-memory
deserialization, never as a file on disk; the `serialize` feature exists in
the pinned 0.40. Only `verso-index` depends on `rusqlite` today: the reader
either lives there or brings the dependency to `verso-core` — the choice to
justify in that pull request. The converter is S6.

### D3 — Where a folder's labels live

make.md labels a folder through its folder note: with folder notes on (the
default), a folder's sticker or colour goes to the folder note's
frontmatter, and the folder note is created if missing; with them off, to
`.space/def.json` (`saveLabel`, `filesystemAdapter.ts`, lines 767–795).
**Options:** (a) the folder note's frontmatter — the same keys as a
note's (`sticker`, `color`, `banner`); (b) a file of Verso's inside the
folder; (c) Verso's configuration, outside the folder.
**Recommendation: (a).** A folder without a folder note gets one when it is
first labelled — a new file, so the window asks first, as D4 does. The default sticker and colour of a folder's items (L5) are
`items_sticker:` and `items_color:` in the same frontmatter — Verso's names,
since make.md keeps these in `def.json`.

### D4 — Where manual order lives

| | (a) A `rank:` in every note's frontmatter | (b) An ordered list in the folder note's frontmatter | (c) Verso's configuration |
|---|---|---|---|
| Files written by one drag | every sibling whose rank moves | one | none |
| Survives another machine, git, Obsidian | yes | yes | no |
| make.md reads it | an older version did (the docs vault) | no | no |
| Non-Markdown items (PDF, image, subfolder) | cannot hold a key | listed by name | yes |

**Recommendation: (b)**, `order:` — a list of names relative to the folder;
items not listed come after, in the tree's sort. Names, not `[[links]]`:
a subfolder cannot be linked, and one form for every item is simpler. The
cost: the rename plan of ADR 0048 rewrites links the index found, and a
YAML list of names is not one — S3 adds the rewrite of `order:` to that
plan, as new core work with its own tests. Without it, a renamed note drops
to the end of the folder. Ordering a folder without a folder note asks
before creating one.

### D5 — Pins, focuses and bookmarks

**Options for pins:** (a) `pinned:` in the folder note's frontmatter, a list
of `[[links]]` — so they count as backlinks and follow renames like any
link, and, by ADR 0057, form a typed relation `pinned` from the folder note
(an edge on the graph and the board — intended); (b) Verso's configuration.
**Recommendation: (a).**
**Focuses** are close to [ADR 0041](../adr/0041-multi-root-workspace.md) (several roots, `PROPOSED`). **Options:**
in S3, as named sets of folders in Verso's configuration; or later, with
0041. **Recommendation: later.**
**Bookmarks** stay as they are; whether they move from `localStorage` to
the folder (they are lost on another machine today) is a question of its
own, outside this memo.

### D6 — The word for a folder's page

"Space" is taken (*área*, ⌘T). **Options:** (a) "folder page" / *página da
pasta*, "tag page" / *página da tag*; (b) rename workspaces and take
"space". **Recommendation: (a)** — nothing renamed, no new noun.

### D7 — Contexts

**Options:** (a) every folder page shows a table of its items by default —
an unsaved base over the folder, its columns the properties the items use;
saved as a `.base` the first time the user changes it; (b) only an embedded
` ```base ` block the user adds; (c) as (a), plus the converter of S6.
**Recommendation: (a) now, (c) when S6 is decided.**

### D8 — Flow: editing an embed where it is

| | (a) Edit `![[Note]]` in place, no new syntax | (b) make.md's `![![Note]]` |
|---|---|---|
| In Obsidian without make.md | an ordinary embed | not one of Obsidian's constructs; what Obsidian shows is O9 |
| ADR 0030 | an editor behaviour, no dialect change | a new construct: a spec question, its fixtures, and section 9 of the spec |

**Recommendation: (a)**, using the editor the board already puts inside a
card (`card-editor`, ADR 0057) — same save path, same conflict check
(invariant 11). Reading `![![Note]]` as an embed, for vaults written with
make.md, is a spec question to open only after O9.

### D9 — The block compositor (F4)

**Options:** (a) later, after the month of use; (b) a subset as Markdown
inside the folder note — a button as a link to a command, progress as a
property, columns as a callout layout. **Recommendation: (a).** The folder
page of S2 — header, folder note, table — covers what the campaign needs;
the compositor is designed when its absence is felt.

### D10 — Tags

**Options:** in S5; later. **Recommendation:** tag pages (T1) in S5, and renaming or deleting a tag
across the notes (T2) as a plan of diffs the user accepts — ADR 0048's
rule for a rename, applied to a tag.

### D11 — Stickers: which icons

make.md's values are `emoji//<code points>`, `lucide//<name>` and
`ui//<name>` (its own set of icons). **Options:** (a) emoji and Lucide
(ISC, on the npm allowlist; `lucide-static`, a dependency to justify) —
`ui//` names mapped to a Lucide twin where one exists, else shown as the
item's default icon; (b) emoji only. **Recommendation: (a).** SVGs of the
folder as stickers (make.md's "Index SVG", off by default) later.

### D12 — Settings

Verso already has a settings dialog with sections. **Recommendation:** a
section "Organizing" (*Organização*) with these, and no others (other
options: none recorded):

| Setting | EN label | PT label | Default | make.md's |
|---|---|---|---|---|
| `stickers` | Stickers | Figurinhas | on | `spacesStickers` |
| `stickerInLinks` | Sticker before links | Figurinha antes dos links | off | `internalLinkSticker` |
| `covers` | Cover images | Capas | on | `banners` |
| `coverHeight` | Cover height (px) | Altura da capa (px) | 200 | `bannerHeight` |
| `aliasInTree` | Show the first alias in the tree | Mostrar o primeiro alias na árvore | off | `spacesUseAlias` |
| `folderNoteName` | Folder note name (empty: the folder's name) | Nome da nota da pasta (vazio: o nome da pasta) | empty | `folderNoteName` |
| `folderPageTable` | Table of items on a folder page | Tabela de itens na página da pasta | on | `contextEnabled` |
| `manualOrder` | Order by dragging in the tree | Ordenar arrastando na árvore | on | (none: always on) |
| `inlineEmbedEdit` | Edit embedded notes in place | Editar notas embutidas no lugar | on | `editorFlow` |
| `emojiTrigger` | `:` opens the emoji picker | `:` abre o seletor de emoji | on | `inlineStickerMenu` |

The frontmatter keys are make.md's defaults and are not settings: a key
renamed in one app would hide the labels from the other. make.md lets the
user rename them (`fmKeySticker` and its siblings); a vault that did so is
read as having no labels — said in section 8.

### D13 — Observing make.md in Obsidian

Section 8 holds twelve steps that only observation can answer. **Options:**
(a) the maintainer runs them, or allows the next session to install the
plugin in the Sandbox vault; (b) build without them, on the source's
reading. **Recommendation: (a) before S3** (order and pins are where the
source and the docs disagree); S1 and S2 do not depend on them — D3, the
one they touch, is answered by the source.

## 7. The plan, if the recommendations are taken

The frontmatter keys this plan adds — `order:`, `pinned:`, `items_sticker:`,
`items_color:`, `items_template:` — are Verso's extensions to Obsidian's
files (invariant 12: new keys, no changed meaning), recorded in the spec in
the slice that brings each, as ADR 0057 recorded its own.

One pull request per slice, large as the phase allows
([ADR 0033](../adr/0033-pr-workflow.md)), each with its ADR revision, its
CHANGELOG lines in both languages, its demo-vault lesson and walkthrough
steps ([ADR 0058](../adr/0058-demo-vault-as-tutorial.md)), and its e2e tests
seen failing before the change. The window's work is TypeScript in `app/ui`
(author Opus 5, reader Fable 5.1); the core's, Rust (author Fable 5.1, reader
Opus 5).

### S1 — Labels (L1–L4, D11, D12)

- **Read:** `sticker`, `color`, `banner`, `banner_y`, `aliases` from the
  frontmatter the core already parses; a folder's from its folder note
  (D3). A new contract field per entry of the tree (`label: {sticker,
  color}`), filled by `verso-core` from the index, so the tree does not read
  every note — the index stores the five keys at indexing time
  (`verso-index`, a column or a JSON field, migration of the index schema;
  the index is a rebuildable cache, ADR 0011).
- **Show:** the tree, the tabs, the quick switcher, the folder page, the
  note's header; links (with `stickerInLinks`). The colour tints the row's
  name, never its background (contrast, ADR 0035; checked against both
  themes).
- **Write:** a picker — emoji (the system's set, searchable by name in both
  languages) and Lucide — from the note's header, the tree's menu and the
  palette. It writes through the properties writer (revision check,
  invariant 11). A cover: a file of the folder or a URL (remote images
  follow the existing "remote content" setting), dragged to set `banner_y`.
- **Tests:** e2e — a sticker set from the tree appears in the tab and the
  file gains exactly `sticker: emoji//1f3b2`; a vault written by make.md
  (frontmatter only) shows its labels; `ui//` and unknown values fall back;
  the cover's drag writes `banner_y`. Rust — the index keeps the keys and
  drops them on change.
- **Tutorial:** a new note "19 - Organizando: figurinhas, capas e páginas"
  and a card on "Tour do Verso".

### S2 — Folder pages (F1–F3, F5, D3, D6, D7)

- The folder page becomes: header (sticker, name, cover, the folder note's
  properties), the folder note itself (editable in place), then the items —
  a table by default (D7: an unsaved base over the folder; "Save as base"
  writes the `.base`).
- `folderNoteName` setting, read by `folderNoteOf` and by the core's
  resolution, both from one function of the contract so they cannot drift.
- "Turn into a folder" on a note: a plan (create the folder, move the note
  into it as its folder note, update links) shown as a diff, ADR 0048.
- A folder's template for new items: `items_template:` in the folder note
  (Verso's name; make.md keeps it in `def.json`).
- **Tests:** e2e for the page's parts, the conversion's diff and its undo
  path, the setting.

### S3 — Order, pins, hide (N1, N2, N4, D4, D5)

- Drag in the tree writes `order:` in the folder note (D4); a drop with ⇧
  pins (`pinned:`, D5) — make.md's gesture. Pinned items show first in the
  folder's list and page.
- "Hide from the tree": a list of paths in Verso's configuration (outside
  the folder, ADR 0011) that the tree alone filters — the note stays
  indexed, linked and searchable, as make.md's `hiddenFiles` does. Not
  ADR 0044's ignored paths: those make a note unreachable (no handle, no
  index, dead links). A list in the settings unhides.
- **Rust:** the rewrite of `order:` in the rename and move plans (D4),
  with tests of a rename in Verso and of one made outside and seen by the
  watcher.
- Renames and moves keep `pinned:` true as links, and `order:` by the
  rewrite above.
- **Depends on** O4 and O5 (section 8).

### S4 — Editing an embed in place (E1, D8)

- In Live Preview and in the reading view, a click on an embedded note's body turns it
  into the card editor: the same editor, autosave and conflict check as a
  tab; Esc leaves. Nested embeds: one level edits, deeper ones stay
  read-only (a loop guard: a note embedding itself).
- `:` emoji picker (E4), behind `emojiTrigger`.
- **Tests:** e2e — typing inside an embed changes the embedded file only; a
  conflict on the embedded file shows the two versions; undo stays per
  file.

### S5 — Tag pages and tag rename (T1, T2, D10)

- A tag page: its notes, the tags nested under it, a table of their
  properties. Rename and delete across notes as a plan of diffs.
- **Rust:** the rename plan in `verso-core`, writing through `verso-fs`
  (atomic write, revision check); fixtures for tags inside code, in the
  frontmatter list and inline, written as AI drafts for approval.

### S6 — make.md's files, converted (D2)

- "Import make.md's organisation" on a folder: reads `.space/def.json`,
  `.space/waypoints.json` and `.space/context.mdb` (D2), and shows one plan:
  `order:`, `pinned:`, `items_sticker:`/`items_color:` into folder notes, a
  `.base` per context with its views and property types mapped (formula
  functions and aggregates without an equivalent listed, not dropped
  silently). Nothing under `.space/` is changed or deleted.
- **Rust:** the reader in `verso-core`, behind a new `verso-fs` read of a
  named file under `.space/` — a second exception to "dot entries are not
  touched" (the bin, `.trash/`, is the first), recorded in ADR 0044, whose
  rule for hidden entries is itself provisional. Of 1.3.5's view types,
  those with no base layout (details, tasks, catalog, flow) are listed in
  the plan, not dropped.

### Not planned

The block compositor (F4, D9), actions and kits (X1), Blink's in-place edit
(N6: ⌘P and the in-place embed of S4 cover it), the overview (N7), focuses
(N3, D5), make.md's mobile settings.

## 8. What this memo did not verify

Installing make.md in the Sandbox vault was refused by the session's
permission check, so no behaviour was observed. These are the steps that
settle what only the app can say — Obsidian 1.13.7, make.md 1.3.5, a
throwaway folder `verso-makemd-probe/`; record each result in
`docs/reference/obsidian-observations.md`:

| # | Do | Settles |
|---|---|---|
| O1 | Set a sticker on a note | the frontmatter written (`sticker: emoji//…`), and nothing else touched |
| O2 | Set a sticker and a colour on a folder | confirms the source's answer (D3): the folder note's frontmatter, created if missing |
| O3 | Add a cover; reposition it | `banner:` and `banner_y:`'s values |
| O4 | Drag a note above its sibling | where the order is written; whether `rank:` appears (D4) |
| O5 | Pin a note to a folder | `def.json`'s `links` (D5) |
| O6 | Hide a note | the plugin's settings only, or the vault (D5) |
| O7 | Add a text property to a folder's context | the frontmatter of every note, or only `context.mdb` |
| O8 | Turn a note into a folder | the paths after; links rewritten or not |
| O9 | Insert a flow block from the `/` menu; open the note with make.md disabled | the Markdown written (`![![…]]`?), and what Obsidian alone shows (D8) |
| O10 | Rename a tag from its tag page | which files change |
| O11 | Open the vault, change nothing, close | that make.md writes nothing on open (`git status`) |
| O12 | Disable make.md | what Obsidian shows of everything above |

Also not verified: make.md's behaviour when a frontmatter key was renamed
in its settings (D12); the `ui//` icon set's names against Lucide's (D11).

## 9. For the maintainer

The questions, in the order the work needs them:

1. **D1** — widen Phase 2 for S1–S4?
2. **D2** — share the frontmatter, import the rest, never write `.space/`?
3. **D3, D4, D5** — labels, order and pins in the folder note?
4. **D6** — "folder page" and "tag page"?
5. **D8** — edit `![[…]]` in place, no new syntax?
6. **D9** — the block compositor later?
7. **D11, D12** — emoji and Lucide; the ten settings?
8. **D13** — run section 8, or allow the next session to?

## 10. The answers

The maintainer, 2026-10-02, asked D1–D13 at once, with the recommendation
as the first option: **"Aceito todas (Recomendado)"** — every
recommendation of section 6 accepted. On D13, asked whether the next agent
may install make.md in the Sandbox vault to run section 8: **"Pode, no
Sandbox (Recomendado)"**. The same day the maintainer delegated the
implementation to Antigravity ("vou delegar para o antigravity implementar
o make md"). Recorded in [ADR 0060](../adr/0060-makemd-organizing-features.md),
which also revises ADR 0049 §3.

## Appendix A — make.md's settings (1.3.5)

From `src/core/schemas/settings.ts` (defaults) and `src/adapters/obsidian/settings.ts`
(the tab), labels from `src/shared/en.ts`. The section names are the code's
category keys, not the tab's labels. "In Verso" points at D12.

| Section | Setting | Default | Label | In Verso |
|---|---|---|---|---|
| General | `navigatorEnabled` | on | Navigator | the tree is Verso's |
| General · labels | `spacesStickers` | on | Stickers | `stickers` |
| General · labels | `indexSVG` | off | Use SVGs as Stickers | later (D11) |
| General · labels | `spacesUseAlias` | off | Alias | `aliasInTree` |
| General · labels | `banners` | on | Cover Image | `covers` |
| General · labels | `bannerHeight` | 200 | Cover Height | `coverHeight` |
| General · tags | `enableDefaultSpaces` | on | Tag Spaces | tag pages, always (S5) |
| General · tags | `autoAddContextsToSubtags` | on | Apply Properties to Subtags | — |
| General | `spaceViewEnabled` | on | Spaces | folder pages, always |
| Navigator · appearance | `sidebarTabs` | on | Sidebar Tabs | — |
| Navigator · appearance | `vaultSelector` | on | Vault Selector | — |
| Navigator · appearance | `showRibbon` | on | App Ribbon | — |
| Navigator · appearance | `spacesRightSplit` | off | Navigator on Right Side | — |
| Navigator · appearance | `spaceRowHeight` | 29 | Row Height | — |
| Navigator · appearance | `mobileSpaceRowHeight` | 40 | Row Height - Mobile | — |
| Navigator · appearance | `folderIndentationLines` | on | Show Folder Indentation Lines | — |
| Navigator · interaction | `openSpacesOnLaunch` | on | Open Navigator as Default Tab | — |
| Navigator · interaction | `editStickerInSidebar` | on | Edit Stickers in Sidebar | the tree's menu (S1) |
| Navigator · interaction | `overrideNativeMenu` | off | Use Obsidian Context Menu | — |
| Navigator · interaction | `expandFolderOnClick` | on | Auto Expand Folder | — |
| Navigator · interaction | `filePreviewOnHover` | off | Preview on Hover | — |
| Navigator · interaction | `revealActiveFile` | off | Reveal Active File | — |
| Navigator · interaction | `deleteFileOption` | trash | Delete File Option | the bin (ADR 0048) |
| Navigator · interaction | `blinkEnabled` | on | Blink | ⌘P |
| Navigator · advanced | `spacesDisablePatch` | off | Compatibility Mode | — |
| Notes | `basics` | on | Make.md Basics | — |
| Notes · folder note | `enableFolderNote` | on | Enable Folder Note | always |
| Notes · folder note | `folderNoteName` | empty | Folder Note Name | `folderNoteName` |
| Notes | `newNotePlaceholder` | Untitled | New Note Placeholder | — |
| Notes | `notesPreview` | off | Notes Preview | — |
| Notes | `inlineContext` | on | Notes Header | the note's header (S1) |
| Notes · appearance | `inlineContextProperties` | on | Show Context Properties in Header | — |
| Notes · appearance | `inlineContextExpanded` | on | Auto Expand Context Properties | — |
| Notes · appearance | `inlineContextNameLayout` | vertical | Title and Sticker Layout | — |
| Notes | `noteThumbnails` | off | Note Thumbnails | — |
| Space · appearance | `defaultSpaceTemplate` | empty | Default Space Template | — |
| Space · context | `contextEnabled` | on | Contexts | `folderPageTable` |
| Space · context | `contextPagination` | 25 | Table View Pagination | — |
| Space · context | `autoOpenFileContext` | off | Auto Open Explorer | — |
| Space · context | `saveAllContextToFrontmatter` | on | Sync Context Fields to Frontmatter | always (the frontmatter is the only place) |
| Space · context | `syncFormulaToFrontmatter` | on | Sync Formula Fields to Frontmatter | — |
| Space · context | `hideFrontmatter` | on | Hide Context Properties | — |
| Performance | `spacesPerformance` | off | Navigator Scroll Performance | — |
| Performance | `imageThumbnails` | off | Image Thumbnails | — |
| Performance | `cacheIndex` | on | Cache Search Index | the index (always) |
| Advanced | `defaultDateFormat` | MMM dd yyyy | Default Date Format | — |
| Advanced | `datePickerTime` | off | Date Picker Time | — |
| Advanced | `defaultTimeFormat` | h:mm a | Default Time Format | — |
| Advanced | `experimental` | off | Experimental | — |
| Advanced | `spaceSubFolder` | .space | Space Folder Name | read only (S6) |
| Advanced | `spacesFolder` | Tags | Tag Space Folder | — |

"Basics" (`src/basics/schemas/settings.ts`): `flowMenuEnabled` on (the `/`
menu: exists), `menuTriggerChar` `/`, `makeMenuPlaceholder` on, `inlineStyler`
on, `inlineStylerColors` off, `editorFlow` on (`inlineEmbedEdit`),
`editorFlowStyle` minimal, `internalLinkClickFlow` off, `internalLinkSticker`
off (`stickerInLinks`), `inlineStickerMenu` on and `emojiTriggerChar` `:`
(`emojiTrigger`), `markSans` off, `flowState` off, `mobileMakeBar` off,
`mobileSidepanel` off, `inlineStylerSelectedPalette` empty.
