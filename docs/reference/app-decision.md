# Memo: the Phase 2 application — what the window is, how it touches the folder, what it still owes

- Date: 2026-09-23
- Status: **not decided.** Nothing in this memo is a decision. It records what
  the Phase 2 code does, so that the maintainer can explain the pull request in
  their own words ([ADR 0033](../adr/0033-pr-workflow.md), merge condition 3),
  and it lists the decisions that code leans on without having them. The
  scope it covers was widened by the maintainer's requests, recorded in
  [ADR 0049](../adr/0049-phase-2-scope-widened.md). On 2026-09-23 the
  maintainer answered most of what section 9 listed; the answers live in the
  ADRs and the spec, and section 9 says where.
- Code: branch `phase1-2/integration`. Author of the code: Fable 5.1, Rust and
  TypeScript alike, by the maintainer's choice of 2026-09-22 (ADR 0049,
  Consequences); the fixes that followed the Opus reading of 2026-09-23 were
  written by Fable 5.1 for the Rust and by Opus 5.5 for the window; the
  changes that followed the maintainer's answers of 2026-09-23, Rust
  included, by Opus 5.5, standing in for Fable 5.1 by the maintainer's
  decision (`../review/phase-2.md` §7). Author of
  this memo: Opus, in the role of author of documents
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)). The reading, its
  findings and where each was fixed are in
  [`../review/phase-2.md`](../review/phase-2.md); this memo describes the code
  after those fixes.
- Roadmap: Phase 2, items 2.1 to 2.5 and 2.7 built; 2.6 not started
  ([`../roadmap.md`](../roadmap.md)).

## 1. What this memo is for

The branch carries about twenty thousand lines: a new crate for the contract, a
Tauri host, and a window written in TypeScript. Nobody explains that by reading
it. This memo says what each part is for, walks every way the window can change
a file of the folder — which is what exit criterion 2 of the phase tests — and
names every choice the code made on a question that is still open, so that the
maintainer can accept it, change it or send it back.

Sections 3, 5 and 7 are the ones to read before the pull request is approved.
Section 12 is a walk through the app that checks the claims without the code.

## 2. The three parts, and how they talk

| Part | Where | What it is |
|---|---|---|
| The contract | `crates/verso-contract` | The types that cross between the window and the core — a note as text, a link, a search hit, an error — and nothing else. It touches no disk and no window. |
| The host | `app/src-tauri` (binary `verso-app`) | A Tauri v2 application. It holds one open folder at a time (`verso_core::Workspace`, behind a lock, so two commands never interleave on the index), answers the commands, serves the folder's files to the window through a private protocol, and opens web pages and extra windows when asked. |
| The window | `app/ui` | Plain TypeScript, no framework, built by `esbuild` into `app/ui/dist`, which the host embeds. CodeMirror 6 is the editor, `pdf.js` reads PDFs, KaTeX sets math. |

The window never opens a file. Every read and every write goes through
`app/ui/src/bindings.ts`, which is generated from the Rust
([ADR 0038](../adr/0038-ts-type-generation.md)): the window calls a typed
function, Tauri carries the call to the host, the host calls `verso-core`, and
`verso-core` reaches the folder only through `verso-fs` (rule 5 of
[ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)). The one other
route to the folder's bytes is the `verso://` protocol, which the host answers
by asking `verso-core` for the file — the same confinement, read-only.

The window is split into modules:

| Module | Lines | Holds |
|---|---|---|
| `main.ts` | ~5 500 | the shell: workspaces, panes, tabs, the tree, the right panel, the leaves (note, image, text file, PDF, HTML page, folder, graph), the dialogs, the command registry and its keys |
| `live.ts` | ~710 | Live Preview: how the editor dresses Markdown while the caret is elsewhere |
| `props.ts` | ~530 | the properties panel and the one function that rewrites a frontmatter key |
| `pdf.ts` | ~340 | the PDF reader, on `pdf.js`'s own viewer |
| `table.ts` | ~200 | table editing: moving between cells, re-aligning the pipes |
| `slash.ts` | ~230 | the `/` menu |
| `sanitize.ts` | ~170 | the allowlist every piece of the core's HTML goes through |
| `dialog.ts` | ~100 | the in-page question that only an explicit yes answers yes |
| `frontmatter.ts`, `phrases.ts`, `icons.ts` | ~180 | the core's frontmatter boundary, CodeMirror's texts in pt-BR, the stroke icons |
| `bindings.ts` | ~520 | generated; never edited by hand |

## 3. The contract, command by command

Every command answers with the value or with a `ContractError` of one kind:
`no_folder`, `refused` (outside the folder, hidden or ignored), `not_found`,
`unavailable` (a cloud placeholder, [ADR 0043](../adr/0043-placeholder-guard.md)),
`not_text` (the file's bytes are not UTF-8), `changed` (the file moved on since
it was read), `exists`, or `failed`. A note is always named by its path relative
to the open folder. **No absolute path crosses, in either direction** (rule 4 of
ADR 0026, amended 2026-09-22): the host runs the native folder picker and keeps
the folder's path; the window knows the folder by its name and an opaque key —
the stem of its index file's name — which is what it stores its own state
under and what it hands back to reopen the folder.

| Group | Command | What for |
|---|---|---|
| Folder | `pick_folder`, `reopen_folder`, `open_initial`, `current_folder`, `reindex` | the native picker, run by the host, then the folder indexed; a folder opened before, by its key; the folder named on the command line, once; the folder a note window joins; index again. Only the main window switches folders, and never while a note window is open |
| Lists | `list_notes`, `list_files`, `list_folders`, `list_entries`, `list_tags`, `list_block_ids`, `list_web_notes`, `graph` | what the tree, the folder view, the tag panel and the graph show |
| Read | `read_note`, `read_text`, `read_file_text`, `resolve_attachment`, `search`, `links`, `backlinks` | a note with its HTML, properties, headings and revision; any text file with its revision (`not_text` when it is not UTF-8); the file an embed names, from the note that holds it (spec Q12); search and links from the index |
| Write | `write_note`, `write_text` | the text of a note or text file, over the revision that was read |
| Create | `create_note`, `create_file`, `create_folder` | refused with `exists` when something stands there |
| Move | `rename_note`, `rename_entry` | move the file or folder; answer with the rewrites that links elsewhere need, the notes that could not be planned, and what could not be confirmed |
| Bin | `delete_note`, `delete_entry` | move to `.trash/` at the root; answer where it went and what could not be confirmed |
| OS | `reveal` | show a file in Finder |
| Web | `open_url`, `web_open`, `web_bounds`, `web_visible`, `web_close`, `web_nav`, `web_url` | web pages, in a window or inside a tab |
| Windows | `open_window`, `popout_target`, `return_to_main` | a note in a window of its own, and back |

The **revision** is the piece that keeps the folder safe. Every read hands the
window an opaque token — the file's modification time, length and content
hash, encoded — and every write hands it back. `verso-fs` reads the file again
just before writing and refuses, with `changed`, when it is not the file that
was read (invariant 11). A write that is not refused is atomic: a temporary
file, `fsync`, `rename` over the target, `fsync` of the directory (ADR 0029).
What a write answers is the caller's own text with the revision of the bytes it
wrote, never a re-read that someone else may already have changed.

## 4. How a note is shown

`read_note` answers with the note's text as it is on disk, its HTML, its
properties, its headings and blocks, and its revision. Opening a note never
writes it (invariant 7); the index may be updated, the file is not.

- **Reading view.** The HTML comes from the core (`verso_dialect::to_html`),
  so the window renders what the parser understands, and reaches the page only
  through an allowlist of elements and attributes (section 7). The window then finishes
  it: it colors code blocks by language, typesets math with KaTeX, gathers the
  footnotes at the end, fills `![[note]]` with the embedded note, shows
  `![[image.png]]` and `![[book.pdf]]`, and turns a checkbox of a task into a
  control that writes the file (section 5). Tables, footnotes, math,
  highlights and line breaks are rendered as Obsidian renders them by default;
  what the dialect makes of them is still spec Q15.
- **Live Preview.** The editor holds the text as it is on disk and dresses it:
  headings, emphasis, links, images, lists, quotes, callouts, and — until the
  caret enters them — tables, math blocks and embedded notes rendered in place.
  The frontmatter folds into a line; its keys are edited in the properties
  panel above.
- **Source.** The same editor without the dressing.
- **Properties.** A table of the frontmatter's keys, typed as the YAML gives
  them: text, number, checkbox, list of text (tags as pills), empty. A mapping,
  or a list holding anything but plain text, is shown as one line and not
  edited: written back as text it would change type. The panel and the folded
  frontmatter find the frontmatter where the core finds it.

## 5. Every way the window changes the folder

This is what exit criterion 2 of Phase 2 — no data loss in the month — tests.
Each row names what the user does, what the window calls, and what stands
between that and a lost byte.

| The user | The window calls | What protects the folder |
|---|---|---|
| types in a note | `write_note` a moment after the last keystroke (1.5 s by default), and again when the tab loses focus or closes, the window is hidden or closed, the app quits (⌘Q included), or another folder or language is chosen; one write at a time per tab | the revision: a file changed elsewhere is refused and the window shows the difference, with "reload" or "overwrite"; while that banner is up no other save goes through, and an overwrite that meets a second change shows the new difference first. Text typed during a save stays marked unsaved |
| types in a text file (`.txt`, `.json`, code, an HTML file's source) | `write_text`, the same way | the same revision; the file's own line endings are kept; a file with mixed line endings opens read-only, and one whose bytes are not UTF-8 is not opened for editing at all (the window says why) |
| ticks a task in the reading view | a change to that task's line in the editor's text — the line the core marked on the checkbox — saved as typing is | the revision and the banner, as for typing |
| edits a property | a change to the editor's text limited to that key's lines, computed against the frontmatter as the editor holds it now, saved as typing is | the revision; a value the panel cannot rewrite without changing its type is read-only |
| presses Tab or Enter in a table | re-aligns that table's lines in the editor — a real table only, outside code and math — saved as typing is | the revision |
| renames or moves a note, a file or a folder | `rename_note` / `rename_entry`: the file or folder moves at once; the answer lists the notes whose links no longer reach it, each with its before and after, and the ones that could not be planned | a new name that holds `[`, `]`, `\|`, `#` or `^` — which no link can reach — is refused before anything moves; only links that reached what moved are rewritten, never inside code; nothing else is written until the user sees the diffs and chooses "update links" (ADR 0048, option (b), decided 2026-09-23); each rewrite then goes through `write_note` with its own revision, and an open tab of that note is saved first |
| finds and replaces across the folder | nothing, until the plan is shown: the open tabs save, every note is read, and the plan has one diff per note and says what it searched | each note is written over the revision read for the plan; a note changed since is refused and counted |
| deletes | `delete_note` / `delete_entry` after a confirmation in the page | the file or folder goes to `.trash/`, never unlinked |
| creates a note, a folder, the daily note | `create_note`, `create_folder` | refused with `exists` if something stands there, and before that when the typed name holds a character no link can reach; the new file is written atomically |
| pastes or drops an image into a note | `create_file` into `assets/` beside the note, named after the note and the time; the embed is inserted into the text | a new file only; the note is saved as typing is |
| drops files from the system onto the tree | `create_file`, one per file, into the folder under the pointer | refused with `exists` when the name is taken |
| duplicates a file | reads it — a note or a text file through the contract, any other file through `verso://` — and `create_file` beside it, "name copy" | a new file only |
| quotes a PDF passage | `write_note` on the companion note `<name> — Notes.md` beside the PDF, or `create_note` the first time; an open tab of it is saved first | the revision; the note's own line endings are kept |
| saves a note as a template | `create_note` in the templates folder, with the editor's text | a new file only |

What never writes to the folder: opening, reading, searching, the graph, the
layout of panes and tabs, bookmarks, the settings, the hotkeys. Those live in
the window's own storage (section 8), outside the folder, as
[ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) asks of
configuration.

## 6. Files that are not notes

- **Images** open in a tab and embed in notes; an embed can carry a width,
  `![[map.png|300]]`, which a grip in the editor changes.
- **PDFs** open in a reader built on `pdf.js`'s viewer: pages, text selection,
  search with the matches marked, zoom, fit to width or to the page, a link to
  the page or to the selected passage (`[[book.pdf#page=3&selection=…]]`,
  Obsidian's form), and "quote the selection", which appends a quote to the
  companion note beside the PDF. The passages already quoted are painted on the
  pages. `![[book.pdf]]` in a note shows the reader inside the note.
- **HTML files** open as their page, in a sandboxed frame with scripts off.
  The tab's head offers the page and its source, as a note's head offers its
  modes; the source is edited as a text file, and the page comes back after
  the source's last keystrokes are saved. Until `4afec51` the viewer was never
  reached: an `.html` file counted as a text file first
  (`../review/phase-2.md` §6, item 16).
- **Text and code files** open in the editor, colored by their extension, and
  save like notes.
- **Web notes.** A note whose frontmatter has an `http(s)` `url` shows that
  page inside its tab, in a web view the host lays over the tab's area; a bar
  gives back, forward, reload and the note itself. The tree shows the site's
  icon, unless remote content is off (section 7).

## 7. What can reach what

Folder content is untrusted input: a note or a file may come from a shared
folder or a downloaded pack ([ADR 0045](../adr/0045-server-and-mcp-security.md)).
What stands between it and the rest of the machine:

- **The commands** are granted by an app manifest to the app's own web views
  only — the main window and the note windows (`main`, `note-*`). A web view
  that shows a site gets none; neither does a remote origin.
- **Navigation.** The app's views stay on the app's pages and the file
  protocol (the guard is asked for frames too, and the HTML-file viewer is
  one); a site's web view stays on http(s) and opens no window. A click on a
  link anywhere in the window — the reading view, an embed, a PDF — never
  replaces the window: an http(s) link opens in a window of its own.
- **The file protocol** (`verso://`) answers the app's own views only, never
  serves a note (notes cross through `read_note`), and sends every file with
  `Content-Security-Policy: sandbox` and `nosniff`, so an HTML or SVG file of
  the folder runs no script. It answers CORS for the app's origin alone.
- **Note HTML** is rendered by the core and reaches the page through an
  allowlist: no script, style, frame, object, form or event attribute; links
  and sources only http(s), mail, same-page anchors, `data:` images and what
  the window itself resolves. The window's own policy adds no inline script, `object-src
  'none'`, `base-uri 'none'` and `form-action 'none'`. The allowlist drops
  what Obsidian shows in a note — `<iframe>`, `<video>`, `<audio>` —; whether
  it should let them through is still open (spec Q6).
- **The network.** Nothing in the core reaches it. The window does in four
  ways: a web note loads its page in a web view; an http(s) link clicked in the
  window opens its page in a window of its own; a web note's icon is asked of
  the site itself, once per site and session; an image a note takes from the
  web loads when the note is shown, as in Obsidian
  ([ADR 0050](../adr/0050-outbound-network-access.md), decided 2026-09-23).
  The two that need no click follow the "load remote content" setting, on by
  default: off, a remote image becomes a link to itself, an inline style
  loses what it would fetch, and a web note wears a globe. *(Revised on
  2026-10-09 with [ADR 0050](../adr/0050-outbound-network-access.md), by
  the maintainer's acceptance of
  [ADR 0073](../adr/0073-self-hosted-server-first.md): the core still
  reaches no network; a Verso server takes inbound connections and reaches
  outbound only addresses written in a configuration — a bucket, the
  server a window connects to, mDNS on the local network, a mail server —
  and the project's release feed, to tell the admin of a new version
  ([ADR 0075](../adr/0075-server-packaging-and-storage.md) item 7). This
  section describes the desktop window of Phase 2, which is unchanged.)*
- **Paths.** The window never holds the folder's absolute path; a path it
  sends is confined by `verso-fs` (absolute, `..`, hidden and ignored paths are
  refused) whatever the command.
- **A panic in the core** answers the command as `failed`; the session stays
  usable.

## 8. What the window keeps for itself

The window stores its own state in its web storage, per machine, never in the
folder:

| Key | Holds |
|---|---|
| `verso.lastFolder` | the key of the folder opened last, reopened at start |
| `verso.spaces:<key>` | the workspaces, panes and tabs of that folder |
| `verso.bookmarks:<key>` | the bookmarks of that folder |
| `verso.settings` | language, theme, palette, font size, attachment, daily and template folders, autosave delay, spell check, default mode, text width, the format of new links (shortest, relative with `./` or `../`, from the root), whether remote content loads, hotkeys |
| `verso.ribbon`, `verso.graph`, `verso.folderSort`, `verso.rightTab`, `verso.right`, `verso.sideWidth` | the ribbon's order, the graph's filters, the folder view's sort, the right panel's tab and visibility, the tree's width |

A layout that names a note that no longer exists skips it when it is restored.
Losing this storage loses the arrangement, never a note. The keys were the
folder's absolute path until 2026-09-23; after that change, a folder's saved
layout and bookmarks start empty once.

## 9. Choices waiting for the maintainer

The code leaned on decisions it did not have. They are listed once, with
where each lives, in [`../review/phase-2.md`](../review/phase-2.md) §6. The
maintainer answered them on 2026-09-23; the ones a user of the window meets
first, and where each now lives:

- what rename, move, delete and create do: as built
  ([ADR 0048](../adr/0048-file-operations-in-ui.md), Accepted);
- what the reading view renders — tables, footnotes, math, highlight,
  callouts, comments, body tags: as built (spec v0.16, Q5, Q6, Q13, Q15),
  with a foldable callout now opening and closing from its title (`5b7fc69`);
  except, still open, callouts nested in callouts — drawn as callouts since
  2026-09-24, provisionally (spec v0.17, Q5) — and the `<iframe>`, `<video>`
  and `<audio>` the window drops ([embedded-media memo](embedded-media-decision.md));
- that a file which is not UTF-8 is not opened for editing (spec Q25,
  closed);
- the four ways the window reaches the network, with a setting over the two
  that need no click ([ADR 0050](../adr/0050-outbound-network-access.md));
- which of CodeMirror's keys the app's hotkeys may take inside an editor —
  ⌘D, ⌘⇧L, ⌘⇧G and ⌘⇧\\, and on Linux Ctrl-Shift-[ and ] — accepted as they
  are, since every hotkey can be bound again in the settings.

Still waiting: the setting's default (on, provisional), converting a file
with mixed line endings by the user's action (spec Q24), non-Markdown files
(Q16), the handles of the contract (ADR 0044), and the bench's CI baseline,
which needs CI to run.

## 10. What is not built

- **Item 2.6, one note type end to end.** It needs
  [ADR 0013](../adr/0013-degrades-to-markdown.md) and
  [ADR 0014](../adr/0014-primitives-catalog.md) accepted and spec Q11
  answered. *(Decided on 2026-09-24: ADR 0013 accepted, the typed note
  accepted in [ADR 0052](../adr/0052-typed-note.md), Q11 answered; not built
  yet — [typed-note memo](typed-note-decision.md), section 8.)*
- **Opaque handles and session identity in the contract**
  ([ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0045](../adr/0045-server-and-mcp-security.md)): the contract names notes
  by relative path, and the revision is the only token. Session identity is
  accepted as absent for Phase 2 (ADR 0045, 2026-09-23); handles are open.
  *(Decided on 2026-09-24: handles as built for Phase 2, re-opened before
  anything outside the app's own views gets access to files —
  [handles memo](handles-decision.md).)*
- **A full accessibility pass** — done statically on 2026-09-24, on a local
  branch: [accessibility review](../review/accessibility.md). Tabs and files
  now move from the keyboard too; what it leaves to the maintainer is in its
  section 8, and nobody has gone through the app with a screen reader yet
  ([ADR 0035](../adr/0035-cross-cutting-requirements.md)).
- **A file watcher** — built on 2026-09-24, provisional, on branch
  `feat/watcher`: [watcher memo](watcher-decision.md). Before it, a change made
  outside the app showed up when the note was saved (as a refused write) or
  reopened, or on "reindex"; nothing refreshed the tree on its own.
  *(Decided on 2026-09-24 as built, every recommendation of the memo
  accepted.)*
- **A second window on the same folder**, and tearing a tab out by dragging it.
- **Everything [ADR 0034](../adr/0034-roadmap-in-phases.md) keeps out until the
  phase ends**: sync, mobile, plugins, the board, the compatibility shim.

## 11. What this memo did not verify

- The app was exercised by driving its window from a script on a Mac
  (`scripts/dev/`), on copies of real folders and on the Sandbox folder, and by
  the maintainer by hand; after the fixes of 2026-09-23, by a smoke run on a
  scratch copy of the Sandbox folder (`../review/phase-2.md` §7). Most of the
  window's fixes were checked by type-check, build and scripted harnesses, not
  in the running app. The window's changes of the maintainer's answers — the
  HTML page and its source, refused names, remote content, foldable callouts
  — were type-checked and built, and the sanitizer run in a WebKit harness;
  none was clicked through in the running app. The folder handed to a running
  app was: with a throwaway bundle of the debug build. It was not run on Linux or Windows, where the
  protocol's origin differs (`http://verso.localhost` instead of
  `verso://localhost`) and child web views may behave differently.
- No measurement of memory or speed beyond one reading on 2026-09-22: about
  170 MB for the app and its web content with a 32 000-word note open.
- Folders with tens of thousands of notes were not opened in the window; the
  benchmark covers the core, not the window.
- The licenses of the window's npm packages were checked by hand until
  2026-09-23; since then a CI gate reads them from the lockfile
  ([ADR 0029](../adr/0029-guardrails-in-ci.md)).

## 12. How the maintainer verifies, without reading code

Build and open the app on a copy of a real folder:

```
cd app/ui && npm ci && npm run build && cd ../..
cargo build -p verso-app -p verso-cli
./target/debug/verso /path/to/a/copy/of/the/folder
```

Then, in the window:

1. **Opening does not write.** Open ten notes, switch tabs, close the app. In
   the copy, `git status` (or a file-date listing) shows no change.
2. **A change made elsewhere is not overwritten.** Open a note, edit it in
   another editor and save there, then type in Verso. The note shows the
   difference and asks; nothing is written until "overwrite" is chosen.
3. **A rename shows what it rewrites.** Rename a note that others link to. A
   window lists each linking note with its before and after; "leave them"
   changes nothing but the renamed file.
4. **Delete asks, then goes to the bin.** Delete a note: the window asks, and
   the note is in `.trash/` at the root.
5. **Quitting keeps what was typed.** Type in a note and press ⌘Q at once; the
   text is on disk.
6. **A file that is not UTF-8 is not opened for editing**, and the status line
   says why.
7. **A PDF quote lands in the companion note** and stays marked on the page.
8. **A web note** with `url: https://…` in its frontmatter shows the page in
   its tab; the page cannot open the folder's files (section 7).
9. **The contract is generated.** `cargo run -q -p verso-app --
   --export-bindings /tmp/b.ts && diff app/ui/src/bindings.ts /tmp/b.ts`
   prints nothing.
10. **The guardrails.** `cargo fmt --check`, `cargo clippy --workspace
   --all-targets -- -D warnings`, `cargo test --workspace`,
   `cargo deny check`, `scripts/check-docs-mirror.sh`,
   `scripts/check-fixtures.sh`, `node scripts/check-npm-licenses.mjs`, and in
   `app/ui` `npm run check`.
11. **An HTML file is a page.** Open an `.html` file: it shows as a page, and
    a script in it does not run; "Source" in the tab's head edits it, "Page"
    shows it again.
12. **Remote content can be kept off.** Settings → General → "Load remote
    content" off: a note's `![](https://…)` image becomes a link to it, and a
    web note wears a globe instead of its site's icon.
13. **A name no link can reach is refused.** Rename a note to `a#b`: the
    window says why and nothing moves.
14. **`verso <folder>` reaches the app that is already open** (macOS, the
    installed app): with Verso open on one folder, `verso` on another from a
    terminal switches the window to it, after saving its tabs.
