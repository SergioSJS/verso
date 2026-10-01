# Critical review — the board, the tutorial and the fixes after beta.2

- Date: 2026-10-01
- Reviewer: Fable 5.1, the reader of what Opus writes
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md))
- Author of everything under review: Opus 5.5, the Rust included. For the
  Rust this departs from ADR 0032's split, and the author declares it in the
  pull request's description; the Rust was read as closely as the rest.
- Input: the branch `feat/board` at `04b12ff`, 51 commits over `main`
  (`06c3457`), the repository, and the author's description draft. No access
  to the author's session.
- The slices: five readings, each in its own session with the same rules,
  merged here. 1, the core and the host, in Rust (`crates/`,
  `app/src-tauri/`); 2, the board's UI (`app/ui/src/board/`); 3, the window
  beyond the board (`app/ui/src/` outside `board/`); 4, the harness and the
  tests (`app/ui/src/harness*`, `app/ui/e2e/`, `app/ui/test/`,
  `scripts/check.sh`); 5, the documents and the tutorial (`docs/`,
  `CLAUDE.md`, the changelogs, `demo-vault/`, `scripts/demo-vault/`).
- State: `scripts/check.sh` exit 0 on macOS (282 Rust tests passed, none
  failed; 21 end-to-end tests passed; mirror, fixtures, npm licenses, demo
  vault, fmt, deny, clippy, bindings and wasm green). `scripts/check-linux.sh`
  exit 0 (281 Rust tests passed, none failed; the one test of difference is a
  `verso-app` test that exists only on macOS). The end-to-end tests repeated
  five times each: 105 of 105 passed; three tests with a race by construction
  repeated thirty times: 90 of 90. `npm test` in `app/ui`: 47 passed. The
  readings also ran throwaway tests of their own, deleted afterwards; what
  each showed is under its section. The installed app was never started: what
  depends on the real web view, the native menu or a real iCloud download was
  read, or run in the browser harness, and each row says which. Nothing in
  this document decides anything.

## How to read

Each reading is a section, with its findings in the order the reading gave
them. "What goes wrong" ends with **ran** when the reading reproduced it and
**read** when it followed the code without running it. The "Resolution"
column is empty: the author fills it in. A finding made by two readings keeps
both rows, and the second points at the first.

| Level | Meaning ([ADR 0033](../adr/0033-pr-workflow.md)) |
|---|---|
| BLOCKING | Violates an invariant, guardrail or decision; or loses data. Blocks merge |
| IMPORTANT | Must be resolved, or explicitly deferred with a record |
| MINOR | At the author's discretion |

## Summary

| Reading | Slice | BLOCKING | IMPORTANT | MINOR |
|---|---|---|---|---|
| 1 | The core and the host, in Rust | 2 | 4 | 8 |
| 2 | The board's UI | 2 | 4 | 6 |
| 3 | The window beyond the board | 1 | 6 | 6 |
| 4 | The harness and the tests | 0 | 6 | 11 |
| 5 | The documents and the tutorial | 1 | 10 | 10 |

Six BLOCKING rows, four distinct defects, two of them found twice from two
sides:

1. A note moved or renamed leaves every board pointing at its old path, with
   no rewrite planned and no warning (reading 1, finding 1).
2. The parser gained a feature, links held by frontmatter properties, with no
   fixture (reading 5, finding 1; reading 1, finding 4).
3. Opening a board and pressing on it within about a second writes the file,
   with no edit made (reading 2, finding 1).
4. Closing a board's tab, or quitting, right after an edit loses the edit
   with no question (reading 2, finding 2; reading 3, finding 1).

The IMPORTANT findings cluster: what a save changes that the user did not
touch (an edge's sides, rounded positions, a file in another layout rewritten
whole); files held in iCloud (downloads nobody asked for, an index rebuild
that drops the last known text of evicted notes, a failed download shown as
an empty editable tab); tests that cannot fail on the bug they name, and unit
tests no script runs; and decisions recorded as the maintainer's on words
that say less than the record.

What the readings checked and found sound is at the end of each section.

---

## 1. First reading — the core and the host, in Rust

| # | Level | Where | Finding | What goes wrong | Suggested resolution | Resolution |
|---|---|---|---|---|---|---|
| 1 | BLOCKING | `crates/verso-core/src/lib.rs:1451-1466` (`examine`), `:1635`, `:1689` (`plan_canvas`); `crates/verso-index/src/store.rs:336-350` | The core reads a card's `file` as if it were a `[[link]]`: found by bare name anywhere in the folder. The window reads the same field as an exact path (`app/ui/src/board/model.ts:671`). [ADR 0057](../adr/0057-board-json-canvas.md) point 6 decides that a rename or move "updates the `file` nodes that point to it, in the same plan as its links" | You drag `Barão.md` from the root into `npcs/`. Every board with a card of it keeps `"file":"Barão.md"`: no rewrite is planned and nothing warns, because the old text "still resolves" by name. The card now names a path that is not there, so the window shows it as missing, while `verso backlinks` still lists the board as linking to the note. The same rule invents backlinks: a card whose path does not exist counts as a link to any note of that name. **Ran** | Resolve a file card's `file` by exact path from the root in `examine`, `plan_canvas` and the index; keep the link rule for wikilinks inside text cards. What `file` is, is section 6, item 1 | |
| 2 | IMPORTANT | `crates/verso-index/src/schema.rs:13` (`VERSION = 7`) and `ensure` | The schema bump drops and rebuilds every existing index on first open. For a note iCloud has evicted, the index held the only local copy of its text and links ([ADR 0043](../adr/0043-placeholder-guard.md): "keeps the last known version"). The rebuild discards it, and the note cannot be read again until fetched | After installing this build on a vault whose notes are evicted, search finds nothing inside them and their backlinks are gone, until each one is opened. ADR 0043 also says a rebuild "costs nothing but time", which does not hold for evicted notes. **Ran** | Section 6, item 7 | |
| 3 | IMPORTANT | `crates/verso-core/src/lib.rs:1990-1997` (`write_board`); `canvas.rs:126-143`, `:384-448`, `:543` | "Nothing changed, so nothing is written" holds only for a file already in Obsidian's layout. Any other valid JSON Canvas file is rewritten on every line by any save, even one that sends back exactly what was read: CRLF becomes LF, indentation changes, `\/` in a key becomes `/`. No diff is shown | A canvas written by another tool, or edited on Windows, is opened and one card is moved. `git diff` shows the whole file changed. ADR 0057 point 2 decides Verso writes "in Obsidian's layout"; invariant 8 says conversion only by user action with a visible diff. The documents do not say which applies. **Ran** | Section 6, item 4 | |
| 4 | BLOCKING | `crates/verso-dialect/src/properties.rs` (new), `lib.rs:69-72`; `fixtures/` unchanged by the branch | Same as reading 5, finding 1: a parser feature with no fixture. The reading gave IMPORTANT; it is raised here because [ADR 0031](../adr/0031-fixtures-as-contract.md) is a decision ("a parser PR without a fixture is incomplete"). This reading adds: the fuzz target does not check `property_links` as it does links and embeds; and a key with a colon inside quotes (`"a:b": "[[X]]"`) yields no link | What counts as a relation is decided only by Rust unit tests the maintainer does not read. **Read** | A drafted fixture, marked as an AI draft, with `observed:`; `property_links` in the fuzz target's checks. Section 6, item 2 | |
| 5 | IMPORTANT | `app/src-tauri/src/lib.rs:2233-2238`, `:2658-2685` | Undo, Redo and Select All are no longer the system's menu items: they only send an event to the focused window's page. A view with none of Verso's script has nobody to hear it | In a web page opened in its own window, in a web note's page inside a tab, and in the inspector's console, ⌘Z, ⌘⇧Z and ⌘A do nothing in the site's text fields: the menu takes the key before the page sees it. **Read**; not settled without the app | Fall back to the system's items when the focused view is not an app view. Section 6, item 20 | |
| 6 | IMPORTANT | `crates/verso-core/src/lib.rs:994-1012`, `:2059-2075`, `:1532-1549` | A canvas held only in the cloud is not carried through a folder move as a note is: only notes are re-keyed. Its row at the old path is removed on the next walk, and nothing is put at the new path | You rename a folder holding an evicted board. The board's links vanish from the index until it is fetched. The same loss for notes was an IMPORTANT of the Phase 2 review (reading 2, finding 7). **Read** | Re-key canvas rows on a move | |
| 7 | MINOR | `crates/verso-core/src/canvas.rs:360-382` (`round_geometry`) | Every card's `x`, `y`, `width`, `height` is rounded on any save, the untouched ones too; a small negative fraction is written `-0` | A card nobody touched at `"x":10.5,"y":-0.4` comes out `"x":11,"y":-0` when another card is moved. **Ran** | Round only values that differ from the file's; write `0` for `-0` | |
| 8 | MINOR | `crates/verso-core/src/lib.rs:1973-1979`; `canvas.rs:318-336` | The comments say the core keeps "every field the window does not know". It keeps only what the window sends back; a key the window omits is deleted | Another caller of `write_board` that sends a partial canvas deletes unknown fields silently. Today's window sends them back. **Ran** | Correct the comments, or keep old keys in the merge | |
| 9 | MINOR | `crates/verso-index/src/search.rs`; `crates/verso-core/src/lib.rs:1150-1163`, `:1167`, `:1214` | Canvases are now search hits and backlink sources, but `read_note` and `links` do not know a canvas path. `verso --help` still says `<note>` only. A name shared by two notes silently picks the shallowest | An agent on `verso mcp` searches, gets `Quadro.canvas`, calls `read_note` and gets "No such file or directory". **Ran** | Say in the hit that it is a canvas, or let the MCP read one; update the help | |
| 10 | MINOR | `app/src-tauri/src/log.rs:80-111`; `lib.rs` `log_write`, `log_read` | (a) A log message of any length is accepted, and rotation is checked only before the write. (b) With `HOME` unset, the log's absolute path crosses the contract. (c) With the configuration directory inside the open folder, each log line is a folder change | One runaway error makes `verso.log` as large as the message; a report shows `/Users/<name>/…`. **Read** | Cap a line; answer the path only in the `~` form; exclude the log directory from the watcher | |
| 11 | MINOR | `app/src-tauri/src/lib.rs:1238` (`open_devtools`); `Cargo.toml` (`devtools`) | The "turn it off" setting of [ADR 0051](../adr/0051-development-flow-and-releases.md) is enforced only in the window; the web views are built with the inspector enabled | A user who turned the setting off may still reach the inspector by right-click. **Read**, not run | Check in the installed app; build the views with the setting, or say in the ADR that it only hides the menu item | |
| 12 | MINOR | `app/src-tauri/src/lib.rs:2147-2213` (`serve_file`); `crates/verso-fs/src/placeholder.rs` | The file protocol fetches from iCloud by default; only `?thumb` opts out. The fetch has no timeout and no cancel | A future view that forgets `?thumb` downloads every picture it lists; offline, a request waits as long as the system does. **Read** | Make fetching the opt-in, or record why not | |
| 13 | MINOR | `crates/verso-core/src/lib.rs:2263` (`line_col`) | Each link's line and column is found by scanning the file from its start | A canvas of 20 000 file cards took 6.9 s to index in a debug build; parse and write of the same file took 62 ms and 20 ms. **Ran** | Compute line starts once | |
| 14 | MINOR | `crates/verso-core/src/canvas.rs:615-623`, `:79-84` | `\u+123` is accepted as an escape; of duplicate keys the first is read, where the window and Obsidian take the last | A file no JSON reader accepts is indexed as a board; with `"nodes"` written twice, the index and the window see different boards. **Ran** for the escape | Check four hex digits by hand; read the last duplicate | |

### What the first reading ran

Throwaway tests, run by name and deleted.

Finding 1, in `crates/verso-core/tests/`:

```rust
let board = "{\n\t\"nodes\":[\n\t\t{\"id\":\"a\",\"x\":0,\"y\":0,\"width\":400,\"height\":400,\"type\":\"file\",\"file\":\"Barão.md\"}\n\t],\n\t\"edges\":[]\n}";
put(vault.path(), "Barão.md", "# Barão\n");
put(vault.path(), "Quadro.canvas", board);
let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
ws.index().unwrap();
let renamed = ws.rename_note("Barão", "npcs/Barão").unwrap();
```

```
rewrites planned: 0
warnings: [] skipped: 0
canvas on disk: "…\"type\":\"file\",\"file\":\"Barão.md\"}…"
exists Barão.md at root: false
backlinks of npcs/Barão: Some([Backlink { from: "Quadro.canvas", target: "Barão.md", … }])
```

Finding 2, in `crates/verso-index/tests/`: a note indexed and marked as a
placeholder, the file's schema set back to 6, the index opened again:

```
after opening with this build (schema 7):
  sources: []
  content_of(Segredo.md): None
  search tesouro: []
```

Finding 3, `Canvas::parse(text).write()` against `text`:

```
SAME     obsidian layout
CHANGED  compact            {"nodes":[{"id":"a","x":0}],"edges":[]}  ->  {\n\t"nodes":[\n\t\t{"id":"a","x":0}\n\t],\n\t"edges":[]\n}
CHANGED  two-space pretty   {\n  "nodes": [],\n  "edges": []\n}\n   ->  {\n\t"nodes":[],\n\t"edges":[]\n}\n
CHANGED  crlf obsidian layout  {\r\n\t"nodes":[],\r\n\t"edges":[]\r\n}  ->  {\n\t"nodes":[],\n\t"edges":[]\n}
CHANGED  slash escape in key   {"a\/b":1}  ->  {"a/b":1}
SAME     escapes in values, numbers (1e3, -0, 1.0, 20 digits), duplicate keys
REFUSED  a BOM; depth 65 (depth 64 parses)
```

Through the workspace, with the same content sent back for a file in a
two-space layout: the file was rewritten and its revision changed.

Checked, with nothing to report: `write_board` writes atomically over the
caller's revision, and over a file changed on disk it answers "the file on
disk changed since it was read" and leaves the disk's version, also for a
change of the same size inside the same second; depth 65 is refused, not
truncated; a crude mutation run (162 926 texts) found no panic and no unstable
write; every new command takes relative paths through the confinement and is
granted to the app's own views only; the file protocol still refuses `.md`
and views that are not the app's; `log.rs` and the `update.rs` diff do not
reach the open folder, and no subprocess does the work of a denied call;
`verso-dialect` gained no IO, no async and no dependency; indexing a copy of
the demo vault wrote nothing into it.

Not covered: the app was never started (the menu, the inspector, the log of a
real session); no dataless file was available, so the iCloud fetch and
finding 6 are read only; `verso mcp` was not run; what Obsidian does with a
bare-name `file` or with fractional geometry was not observed.

## 2. Second reading — the board's UI

| # | Level | Where | Finding | What goes wrong | Suggested resolution | Resolution |
|---|---|---|---|---|---|---|
| 1 | BLOCKING | `app/ui/src/board/view.tsx:1080` (`touched`), `:1262-1272` (`flush`), `:1168-1203` (`remeasure`), `:1998-2001`; commits `65b41c8`, `a147e8e` | The board does not tell a user's edit from its own adjustments. "The user touched it" is set by any pointer press or key press inside the board; once set, any difference between the scene and the last baseline is written, whoever caused it. Invariant 7; ADR 0057 ("opening a board writes nothing") | Open "Tour do Verso" or "Treino do Board" and, within about a second, click the empty canvas, pan with space-drag, or press ⌘+. The file is written with no edit made: every drawn text re-measured, texts re-wrapped, Excalidraw's default fields added. It also happens on the second board of a session when it uses a font not loaded yet. Waiting 7 s first, or using only the wheel, writes nothing. The existing test (`board-tour.spec.mjs:33`) never presses on the canvas, and passes by timing. **Ran**, in the harness | Guard the cause: each change the board makes itself re-baselines what was sent, so only a difference made after it is the user's. An end-to-end test that presses right after opening and asserts no write. What the user's act is, is section 6, item 3 | |
| 2 | BLOCKING | `app/ui/src/main.ts:4017-4021` (`BoardLeaf.flush`), `:4091-4098`; `view.tsx:170` (`SAVE_DELAY`), `:1233`, `:159-168`, `:343-349` | Closing does not save what the board, or a note's editor inside a card, still holds in a timer. The tab's `flush` knows only what was set 700 ms after the last change; a card's editor is not asked at all. The same `flush` serves window close, quit, folder switch and rename | (a) Drag a card and press ⌘W at once: the tab closes, nothing is asked, the move is lost. Closed 1.5 s later, it is saved. (b) Type in a note's card and quit within the autosave delay: the window goes with no write and no question. ADR 0057 point 3 says the card is "saved as a note's tab saves it". **Ran** (a) and (b); window close, folder switch and rename **read** | Give the board a `flush()` that runs the pending save now and flushes any open card editor; the tab awaits it. Mark the tab unsaved when the change happens, not when the timer fires | |
| 3 | IMPORTANT | `app/ui/src/main.ts:4017-4021` with `:3694-3699`, `:3652-3666`, `:3681-3685` | After a board write refused for a reason other than "changed", closing the tab saves the old text and closes without asking | With the board's write failing, drag a card, then ⌘W: one write of the old text, no question, tab closed, move lost. It is data loss when reached; it needed an injected failure, and no everyday trigger was found, hence IMPORTANT. **Ran**, with the failure injected | The tab answers "not saved" while a board change is pending, and never falls through to the text save in that state | |
| 4 | IMPORTANT | `app/ui/src/board/model.ts:620-621` (`sideOf`), `:486-487`, `:141-153` | An edge's sides are recomputed on every save from where a straight arrow meets the card. The memo's §5 mapping (ADR 0057 point 3) gives "a side as a fixed point" with no loss | (a) An edge made in Obsidian from the bottom of one card to the top of another: drag either card a few pixels and the file says right to left. (b) An edge with no sides (optional in JSON Canvas 1.0) gains `top`/`top` on the first save of anything. Obsidian will draw both differently. The description's "one number changes, on one line" does not hold for a card with an edge. **Ran** | Keep the file's sides while both ends are bound to the same cards and the user has not re-attached an end; write no side the file did not have. Section 6, item 5 | |
| 5 | IMPORTANT | `app/ui/src/main.ts:6695-6697` (`recheckAll`), `:6840-6845` | An open board never follows the file on disk | Obsidian moves a card in the same canvas; the watcher reports it; Verso's board still shows the old place. The user learns of it only on their next edit, as a conflict. **Ran**; two panes on one canvas **read** | An untouched board reloads when its file changes, as a note's tab does. Section 6, item 6 | |
| 6 | IMPORTANT | `app/ui/src/main.ts:3964-3975` (`refusedBoard`) | The conflict's diff compares two layouts, not two contents: the disk's text in Obsidian's layout against the board's canvas pretty-printed | One card renamed in Obsidian and one moved in Verso: the banner shows every line as removed and added. Nothing is written (invariant 11 holds), but the user cannot see what differs before choosing "write mine over it". **Ran** | Show the board's side in the layout it would be written in | |
| 7 | MINOR | `app/ui/src/board/model.ts:445`, `:453-455`, `:526`, `:626` | What the board cannot draw is dropped from the file at the next save: an edge whose end names no node, an edge with `label:""`, a node or drawing entry with no `id` or `type` | A canvas with an edge to a node that is not there: drag any card and the edge is gone. Width 0 becomes 1. **Ran** for the edge, the label and the sizes | Carry what was not drawn through and write it back in place. Section 6, item 5 | |
| 8 | MINOR | `app/ui/src/board/model.ts:656-662` | `verso.version` is never read and always written as `1` | A canvas saved by a later Verso with `"version":2` is read as version 1 and written back as 1. **Read** | Open read-only when the version is higher than known | |
| 9 | MINOR | `app/ui/src/board/relation.ts:70-75`; `app/ui/src/main.ts:4470-4474` | (a) A target note whose name has `\|` or `#` gets a link that means something else: `A\|B.md` gives `"[[A\|B]]"` (note A, alias B). (b) When the key's value is one the panel does not rewrite, the refusal is the properties panel's sentence, naming neither note nor key. (c) `Aliado:` present and `aliado` asked: a second key is added | The diff looks right, and `verso backlinks` then misses the relation. **Ran** | Refuse such a name, or say so in the plan; a sentence of the board's own | |
| 10 | MINOR | `app/ui/src/main.ts:4516-4525` | The conversion finds out that the target `.canvas` exists only after the user accepts the plan | The user reads the plan, accepts, and is then told "exists". Nothing is overwritten. **Read** | Check before showing the plan | |
| 11 | MINOR | `app/ui/src/board/view.tsx:175-178`; `app/ui/package.json` | The board imports a hashed internal file of Excalidraw; the comment says "pinned at 0.18.1", `package.json` says `^0.18.1` | A lockfile refresh within 0.18 breaks the build, loudly. **Read** | Pin the exact version | |
| 12 | MINOR | `docs/reference/board-decision.md` §5 against ADR 0057 point 10 | Two documents differ: the memo says an arrow with a bend "has no edge form: it stays in the drawing"; point 10 keeps `bends` on the edge; point 3 still says "by the mapping of the memo's section 5". The code follows point 10 | — | Recorded, not resolved. Section 6, item 14 | |

### What the second reading ran

Playwright specs in `app/ui/e2e/`, in the browser harness on WebKit, deleted
afterwards. The harness's core is TypeScript; the Rust core was not under
these runs.

Finding 1. Each test opens a tutorial board, acts, waits 6 s and counts the
calls of `write_board`:

```js
test(`inv7: ${board} — a click at once, before the fonts settle`, async ({ app, page }) => {
  await app.open(); await app.quickOpen(board);
  await page.waitForFunction(() => window.__VERSO_TEST__?.board);
  const box = await page.locator(".board-canvas").boundingBox();
  await page.mouse.click(box.x + 30, box.y + box.height - 30);
  await page.waitForTimeout(6500);
  expect((await app.calls("write_board")).length).toBe(0);
});
```

```
✘ Tour do Verso — a click at once, before the fonts settle       Expected: 0  Received: 1
✘ Tour do Verso — open, click, scroll, zoom, pan: nothing written  Expected: 0  Received: 1
✘ Treino do Board — (the same two)                                Expected: 0  Received: 1
  .verso.drawing[d-escrever-titulo].width: 338.8 -> 311.1919860839844
  .verso.drawing[d-escrever-titulo].version: ADDED 3   (… index, seed, groupIds, updated, locked …)
space-drag pan at once: write_board calls = 1, after 573 ms
⌘+ at once: write_board calls = 1
late click (after 7 s) + pan: write_board calls = 0
wheel only: write_board calls = 0
second board, early click: write_board calls before = 0, after = 1
```

The cause, with nothing touched: 63 elements of the first board change by
themselves within 250 ms of opening (text widths and wraps), none after.

Finding 2. A two-card canvas written into the harness's folder; card `b`
dragged; then ⌘W:

```
⌘W at once:        on the board x=413; tabs left: 0; dialogs asking: 0; write_board calls: 0; file's b.x: 400
⌘W 1.5 s later:    write_board calls: 1; file's b.x: 466
text typed in a note's card, quit at once:
  index of the window's destroy: 23; index of the first write_note: -1; asked about unsaved text: 0
```

Finding 3: `write_board` made to fail, a card dragged, ⌘W: `write_text calls
on close: 1; asked before closing: 0; file's b.x: 400`.

Finding 4, a canvas with edge `e2` from `t` (bottom) to `o` (top), card `o`
dragged: `e2` comes back `"fromSide":"right" … "toSide":"left"`. An edge with
no sides comes back with `"fromSide":"top","toSide":"top"`.

Finding 5: the file written outside with `o.x = 2000` and the change
reported; the open board still had `o.x = 900`.

Finding 6, the banner's text: every line of the file removed and added.

Checked, with nothing to report: unknown node types and unknown keys on nodes
and edges survive a drag; node order with groups is kept; no `verso` key is
added to a canvas that had none; colours are kept; a card's HTML goes through
`sanitize.ts`; relation promotion shows the diff first and writes over the
revision read, with valid YAML for CRLF notes, notes with no frontmatter,
flow lists and names with a quote; the board's strings exist in both
languages.

Not covered: the real core and the real app (font timing in the app's web
view is not measured); a board left hidden behind its text face that saves a
stale canvas on a later font load (read, not reproduced); what Excalidraw's
own restore drops from the drawing; the export and the conversion beyond
reading; nothing was observed in Obsidian.

## 3. Third reading — the window beyond the board

| # | Level | Where | Finding | What goes wrong | Suggested resolution | Resolution |
|---|---|---|---|---|---|---|
| 1 | BLOCKING | `app/ui/src/main.ts:4017-4021`, `:1503-1516`, `:5468-5477`, `:9897-9916`, `:9535`, `:9570`; `board/view.tsx:1233`, `:1559-1560` | Same as reading 2, finding 2, reached from the tab's side: a board's tab says "nothing to save" while the board still holds unsaved work. One more case here | A board opened by a single click (a preview tab), a card moved, another file clicked at once: the tab is replaced and the move is lost. Also read: on a folder switch the card editor's own save on unmount is sent for the old folder's path to the new folder. **Ran**, five tests; the folder switch **read** | As reading 2, finding 2; run the pending save on unmount instead of clearing it | |
| 2 | IMPORTANT | `app/ui/src/main.ts:2823-2858` (`persistImageSize`), `:2803-2822` | Resizing a picture in the reading view can write the size into another construct. A Markdown picture is first looked up as `![[alt]]`, and pictures are counted in the page but matched in the source | `![Projeto Alpha\|200](assets/diagrama.svg)` followed by `![[Projeto Alpha]]`: dragging the picture's corner rewrites the note embed to `![[Projeto Alpha\|253x136]]` and leaves the picture as it was. With a raw `<img>` of the same file above two Markdown pictures, resizing the first writes on the second. The write goes over the revision (invariant 11 holds), and showing a picture writes nothing. **Ran** | Match by kind: a Markdown picture only as `![…](…)`, an embed only as `![[…]]`; write nothing when page and source counts differ | |
| 3 | IMPORTANT | `app/ui/src/main.ts:5919`, `:2567`, `:2513`, `:9587-9592` | Files held only in iCloud are downloaded without the user opening anything: every restored tab of every workspace at startup, and every open note again on any change the watcher reports. ADR 0043 as amended says "opening a folder still pulls nothing down" | Start Verso with 20 remembered tabs on an evicted vault: 20 downloads start with no click. Later macOS evicts an open note again; the next folder event fetches it back. **Ran** in the harness, which counts the fetch calls; the real download is the host's | Section 6, item 8 | |
| 4 | IMPORTANT | `app/ui/src/main.ts:2560-2569`, `:1885`, `:3420`, `:541-547` | A note whose download fails opens as a blank tab named after the note. Its editor accepts typing that is never saved, never marked unsaved and never asked about. The changelog says such a file "is never shown as empty" | Offline, open an evicted note: an empty page under the note's name. ⌘E, type a paragraph: no dot, no write. ⌘W closes with no question and the paragraph is gone. The blank editor on a failed load exists on `main`; the branch names the tab and adds the claim. **Ran** | A tab whose load failed shows the failure in the page and has no editable editor | |
| 5 | IMPORTANT | `app/ui/src/main.ts:9950-9980`; `app/src-tauri/src/lib.rs:2233-2238`, `:2657-2686` | Same as reading 1, finding 5: Undo, Redo and Select All no longer reach a web page in a child view or in its own window | Type in a site's form inside a web note and press ⌘A or ⌘Z: the app's page behind acts, not the site's field. **Read** | Keep the custom route only when a board or a card has the focus. Section 6, item 20 | |
| 6 | IMPORTANT | `app/ui/src/main.ts:925-931` (`noteImages`), `:2751` | "Pictures written in Markdown work in every view" does not hold for a path with a space or an accent: the renderer percent-encodes the address, the window passes that text to the core unchanged, and the core finds nothing | `![g](assets/gráfico.png)` or Obsidian's own `![](Pasted%20image%202026….png)`: nothing shows in the reading view, an embedded note, a board's card or a folder note. Live Preview shows it, so the two views disagree. The reading view had this gap on `main`; the branch carries it into the other views and the changelog claims the feature. **Ran**, a Rust test | Percent-decode the address before asking the core | |
| 7 | IMPORTANT | `app/ui/src/main.ts:5468-5477`, `:5637-5645`, `:5663-5672`, `:5919` | The trail is of tabs, not notes, and a replaced preview tab leaves it. With preview tabs on (the default), notes browsed by single click leave no way back; after a restart the trail holds every restored tab | Click three notes in the tree: ‹ is greyed and ⌘[ does nothing, against the changelog's "each pane keeps its own trail of where it has been". After a restart ‹ walks tabs the user never visited this session. **Ran** | Record paths, not tabs, and do not record while restoring; or record the limit. Section 6, item 18 | |
| 8 | MINOR | `docs/adr/0059-tabs-preview-pinned.md`, Decision 1; `app/ui/src/main.ts:8068`, `:6515` | The ADR records as decided by the maintainer more than the quoted words carry: "the search, the quick switcher" and "an edit or a pin keeps it". The code also previews unlinked mentions. An edit made in a note's card does not keep a board's preview tab | ⌘P + Enter opens a tab that the next ⌘P replaces, with no way to keep it from the keyboard. **Read**; the card **ran** | Mark in the ADR what is the author's reading. Section 6, item 17 | |
| 9 | MINOR | `app/ui/src/main.ts:9810-9822` | F2 acts behind an open dialog when the focus is on one of its buttons | Settings open, F2: the rename field opens on the note behind and the focus leaves the dialog. **Ran** | Skip F2 when the focus is inside a dialog | |
| 10 | MINOR | `app/ui/src/main.ts:9828-9837` | `mousedown` and `auxclick` both step the trail; a web view that sends both for one press takes two steps | One press of the side button lands two notes back. **Ran** with synthetic events only; whether the app's web view sends both is not settled | Act on one event per press | |
| 11 | MINOR | `app/ui/src/main.ts:9942-9945` | ⌘W from the menu runs past the in-page question dialog | With a "delete?" question on screen, ⌘W closes the tab behind it. **Read** | Ignore the menu's close and edit events while a question is up | |
| 12 | MINOR | `app/ui/src/report.ts:28-36`; `app/ui/src/main.ts:8527-8611` | The report does what it says: copied only, no network, shown in an editable field first. Three small things: the home directory is replaced only in the log's own path line, not inside the log's lines; the red dot and an `ERROR` line are raised by the user's own content (a Mermaid diagram half typed); a quick Copy takes the text before its context arrives | A user pastes the report into a public issue with note names, or their account name, in a line they did not spot. **Read** | Replace the home directory through the whole tail; log user-content errors as `WARN` | |
| 13 | MINOR | `app/ui/src/main.ts:1474`, `:8573`, `:882-888`, `:530-541`; `app/ui/style.css:281-283` | Small: a pinned tab is announced as name then path; the report's text area has no accessible name; the palette button's tooltip keeps the old key after a rebind; "Could not download from iCloud" is said for any error of the fetch | — | Names for the two controls; the key hint from the bindings | |

### What the third reading ran

Playwright specs in the harness and one Rust test, all deleted.

Finding 1: `[board ⌘W] on screen the card went from x 720 to 800; in the file
x was 720 and is 720; tabs left: 0; writes: []`; the same move left alone is
written (the control). `[board quit]` and `[card quit]`: the only call up to
the window's destroy is the destroy. `[preview board]`: the tab is replaced
and the file is unchanged.

Finding 2: `![Projeto Alpha|200](assets/diagrama.svg) … ![[Projeto
Alpha|253x136]]` after the drag.

Finding 3: `fetch_file at startup, with no click: [three notes]`; after one
folder event, the same three again.

Finding 4: `editor holds: "texto digitado na nota que nao abriu"; tab marked
unsaved: false; writes asked of the core: 0; ⌘W: tabs left 0; a question on
screen: 0`.

Finding 6: `render_markdown` gives `<img src="assets/gr%C3%A1fico.png">`;
`resolve_file("Nota.md", "assets/gr%C3%A1fico.png") = None`; with
`"assets/gráfico.png"` it answers the file.

Finding 7: `back button: disabled: true; after ⌘[ the chosen tab is: 03 -
Propriedades e Metadados`.

Checked, with nothing to report: `sanitize.ts` and `data-src` held against 28
payloads, with remote content on and off — a note's own `data-src` is
stripped; every relative address goes only to the core, which answers with a
file of the folder or nothing; `javascript:`, `data:text/html`, `verso:`,
`file:`, `tauri:`, `//host` and `srcset` are removed; with remote content
off, nothing was asked of the network. An HTML file of the folder is still a
frame with an empty `sandbox`, and the host's policy for files still begins
`sandbox;`. Mermaid's strict security level is unchanged. Every new string of
the slice is in both catalogs.

Not covered: the real app (the Edit menu against child views, the mouse's
side buttons on hardware, ⌘W in a note window, a real iCloud download);
`pdf.ts` and `dialog.ts` were read, not exercised; pinned tabs in vertical
bars and drags between panes with a preview tab; contrast and focus rings.

## 4. Fourth reading — the harness and the tests

| # | Level | Where | Finding | What goes wrong | Suggested resolution | Resolution |
|---|---|---|---|---|---|---|
| 1 | IMPORTANT | `scripts/check.sh:53-64`; `.github/workflows/ci.yml:130`; `app/ui/package.json` (`"test"`) | The window's node unit tests (`npm test`: 31 board tests new in this PR, plus Mermaid and PDF) are run by no script. The walkthrough marks steps as "U — a unit test, runs now" | Someone changes the board's model so that a moved card loses its unknown fields; `check.sh`, `check-linux.sh` and CI stay green. The first to notice is a user's `.canvas`. **Ran**: no script names it; `npm test` passes, 47 | Add `npm test` to the UI step of `check.sh` and of CI, or record that it is run by hand. Section 6, item 12 | |
| 2 | IMPORTANT | `app/ui/e2e/board-practice.spec.mjs:113-130`; walkthrough §9.8 | "Lesson 11 … stays put while the board saves" cannot fail on the bug it names: the old bug lands on the same view the test compares, and no save happens in the test | The fix of `a51aab2` is undone: every save throws the user back to the first match. The test stays green. **Ran** | Step to another match before the event, make a real change so the board saves, then assert the view | |
| 3 | IMPORTANT | `app/ui/e2e/board-tour.spec.mjs:23-25`; walkthrough §2.2 | The three assertions on the chosen stop hold with the stop centred at 10 % zoom, which is the bug `a147e8e` fixed. No lower bound on the zoom | The outline brings a stop to the middle at 10 % again, unreadable; the test is green. **Ran**: the view forced to 10 %, all three pass | Assert that the stop fills the view | |
| 4 | IMPORTANT | `app/ui/test/board.test.mjs:37-50` against `app/ui/src/board/model.ts:584-587`, `:612-621` | The round-trip unit tests use integer coordinates, edges with both sides and no dangling edge. Outside that, the model changes what the user did not touch (reading 2, findings 4 and 7; reading 1, finding 7) | A canvas from another tool has a card at `x: -417.5` and an edge with no sides. The user drags a different card: the first card comes back at `-417` and the edge top to top. The description says "changes only what changed". **Ran**, at the model's level | Tests for these three inputs. Section 6, item 5 | |
| 5 | IMPORTANT | `app/ui/e2e/*.spec.mjs`; `app/ui/src/harness.ts:58` (`writeOutside`, used by no spec) | No end-to-end test covers a file changed on disk under an open note or board (invariant 11, the window's side), although the harness supports it and the branch adds a write path | A later change makes the board retry a refused write with a fresh revision, overwriting an edit made in Obsidian. Every test is green. **Ran**: today the window answers correctly for a note and for a board ("Nada gravado: o arquivo mudou em disco…"), one write attempted, the file keeps the outside edit | Two short specs from the reading's probes, which pass today | |
| 6 | IMPORTANT | `app/ui/e2e/fixtures.mjs:9` (`NOISE`), `:174` | "A request that failed" ([ADR 0058](../adr/0058-demo-vault-as-tutorial.md) point 11) is detected only when a response arrives. A request with no response logs "Failed to load resource", which the allowlist swallows | The window builds a picture's address by hand in one place: in the harness the picture never loads, and every test is green. **Ran**: a failed image and a rejected fetch both pass; a 404, an unhandled rejection and a throw in a timer fail as they should | Listen for failed requests, and narrow the allowlist | |
| 7 | MINOR | `app/ui/e2e/board-practice.spec.mjs:28-30` | Lesson 7's second half ("⌘⌥[ sends one to the back") holds without the key: the square is already below the diamond | ⌘⌥[ breaks; this test is green. The next test does press it. **Ran** | Send the diamond back instead | |
| 8 | MINOR | `app/ui/e2e/tabs.spec.mjs:48`; `app/ui/e2e/notes.spec.mjs:80-81` | One-shot assertions right after the plan's "save" click, while the plan's writes are still going out | On a slower machine, a false failure. **Read**; 30 runs each, none failed | Poll on those three reads | |
| 9 | MINOR | `app/ui/playwright.config.mjs:34`; port 4173 fixed | A server already on the port is reused, and it serves its own checkout's build | `check.sh` in another worktree while a harness server holds the port: the tests judge the other checkout. **Read** | Do not reuse the server, or a port per checkout | |
| 10 | MINOR | `app/ui/e2e/serve.mjs`; ADR 0058 point 13 | The harness page runs without the app's Content-Security-Policy, and point 13's list of what the harness cannot reach does not say so | A library update loads something the app's policy forbids: fine in every test, broken in the app. **Read** | Send the app's policy from the server, or add it to point 13 | |
| 11 | MINOR | `app/ui/e2e/fixtures.mjs:185-187` | The teardown reads the log only at the level `ERROR`, and a page that left the harness reports nothing | A test whose last action navigates away passes with an `ERROR` logged. **Ran** | Fail when the harness is gone at teardown | |
| 12 | MINOR | `app/ui/e2e/serve.mjs:46` | A malformed escape in a request's address throws inside the handler; the process dies. Traversal itself is refused, and the server listens on 127.0.0.1 only | One request for `/%E0%A4%A` and every later test fails with "could not connect". **Ran** | Catch it and answer 400 | |
| 13 | MINOR | `app/ui/package.json` (`build`); `app/src-tauri/tauri.conf.json:6`; `app/src-tauri/src/lib.rs:1176-1181`, `:1205-1218` | `harness.html` and its script are packaged into the app, and the host's navigation guard allows any path of the app's own origin. No way to get there was found, and under the real IPC the script stops before loading the window. The description is slightly off: `main` already copied `harness.html` into the build | None today. It is a second page of the app that depends on one cancelled click handler and one thrown error. **Read**, not run in the app | Build the harness outside what the app packages. Section 6, item 13 | |
| 14 | MINOR | `app/ui/src/harness/core.ts` | Where the harness is more lenient than the core (ADR 0058 point 9 says "the contract's shapes and errors"): no path confinement in the writes; the board's write stores what the window sent, with no merge; never a placeholder; no folder event after the window's own writes; the rename plan is a pattern over the whole text, code included | A window bug that sends a board without a field the core would have kept, or names a hidden path, passes. **Read** | Confine in the three writes; state the rest in point 9 | |
| 15 | MINOR | `docs/reference/demo-vault-walkthrough.md` §2.1, §3.2, §6.1, §6.3 | Steps marked as run by machine whose test does less than the step: §2.1 "the file is unchanged" is "no board write was called"; §3.2 "⌘Z takes it back" asserts only that the last line changed; §6.1 does not assert the relation in a frontmatter; §6.3 covers F2 after a click only | The step reads as covered; part of it is still by hand and nobody follows it. **Read** | Compare the file's bytes in §2.1; name the case each test covers | |
| 16 | MINOR | `app/ui/e2e/harness.spec.mjs:7-14` | The check that every command has an answer compares names only | A renamed argument reaches the harness as the text `"undefined"`. **Read** | Compare argument names too | |
| 17 | MINOR | `app/ui/e2e/notes.spec.mjs:98` | The calendar test walks at most 36 months back from today to reach September 2026. The reading listed it as outside the branch; the file is new in it | The test fails from October 2029, with nothing broken. **Read** | Go to the month by its date, not by counting back | |

### What the fourth reading ran

`npx playwright test` over the committed specs with `--repeat-each 5`: 105
passed, none failed, with other readings using the machine. Three tests with
a race by construction, `--repeat-each 30`: 90 passed. `npm test`: 47 passed.

Finding 2, the probe steps through all four matches back to the first and
compares the view with the one before the event: identical, the assertion
passes. Finding 3: `zoom the app chose: 0.5`; with the view forced to
`zoom 0.1` centred on the stop, the test's three assertions pass. Finding 7:
the test passes with the key never pressed.

Finding 4, the committed test's own construction, nothing moved:

```
fractional coordinates      → "x":-417,"y":10,"width":251   (was -417.5, 10.25, 250.5)
an edge with no sides       → …,"fromSide":"top","toSide":"top"
an edge to a missing node   → "edges":[]
```

Finding 12: `/%E0%A4%A` gets no answer, and then neither does
`/harness.html`.

Checked, with nothing to report: all 61 commands of the generated bindings
have an answer in the harness, and a committed test enforces it; the
harness's three writes answer "changed" on a stale revision, as the core
does; `window.__VERSO_TEST__` is defined only in the harness's script, and
the app's bundle only reads it; a failed end-to-end test or a failed browser
install fails `check.sh`; CI has no end-to-end step, as ADR 0058 point 13,
the README and `CLAUDE.md` say.

Not covered: the harness's renderer, search, links and bases against the
core's (the author declares them approximate); the harness page under the
real IPC; the two "seen failing" claims of the description, which need a
change of the sources and a rebuild; the key branch of the tests for
platforms other than the Mac.

## 5. Fifth reading — the documents and the tutorial

| # | Level | Where | Finding | What goes wrong | Suggested resolution | Resolution |
|---|---|---|---|---|---|---|
| 1 | BLOCKING | `crates/verso-dialect/src/lib.rs:69-72`, `parse.rs:93-94`, `properties.rs` (229 new lines); `git diff --stat main...feat/board -- fixtures/` is empty | The parser gains a feature — links held by frontmatter properties, the behaviour that closes spec Q10 and the link part of Q24 — with no fixture. [ADR 0031](../adr/0031-fixtures-as-contract.md): "a parser PR without a fixture is incomplete". `CLAUDE.md` §4: "A parser feature comes with a fixture." The code says the fixtures cannot see it ("Kept apart from `links`, which are the body's and which the fixtures assert"), and spec §4.1's keys have none for it. No deferral is recorded, where [ADR 0052](../adr/0052-typed-note.md) deferred its fixtures in words | The maintainer approves behaviour through fixtures and does not read Rust. What counts as a relation (`aliado: "[[Barão]]"` yes, unquoted no, `"ver [[Barão]]"` no, list items yes) is decided only by Rust unit tests; a later change to those rules trips no contract. **Read**; the empty diff **ran** | A drafted fixture needs a schema key, and spec §4 is decided, so this goes to the maintainer first. Section 6, item 2 | |
| 2 | IMPORTANT | `docs/adr/0029-guardrails-in-ci.md:342-369`; `app/src-tauri/clippy.toml:7-14`; the grep of `scripts/check.sh` and of `ci.yml` | The fourth `std::fs` exception (`src/log.rs`) is declared but not ratified. [ADR 0029](../adr/0029-guardrails-in-ci.md)'s rule: an exception is "ratified by the maintainer in the pull request that adds it". The three earlier ones each carry their ratification; this one has none, and `clippy.toml` still says "Declared for the maintainer's ratification". The "Decided by the maintainer on 2026-09-29: the app keeps a log" rests on a question ("se der algum erro, a gente reza pra tentar achar?"). The description lists it as done | A guardrail's scope widens on the author's word. **Read**; the grep's scope **ran** | Section 6, item 10 | |
| 3 | IMPORTANT | `scripts/check-npm-licenses.mjs:51-55` (`0BSD`), `:64-67` (`fuzzy` as MIT); ADR 0057 point 8; `docs/adr/0029-guardrails-in-ci.md:77` | The npm license allowlist is widened by `0BSD`, and `fuzzy` is taken by hand. Three documents disagree on whose word it is: ADR 0057 point 8 puts it under "decided by the maintainer"; the script says "for the maintainer's eye in the PR"; the memo's question 8 names other things, and its answer was itself judged ambiguous. The description says "409 packages, all on the allowlist" without saying the allowlist changed. ADR 0029's own row still gives the older list | A license gate that passes because the list grew looks, in the description, like a gate that simply passed. **Ran**: the script, 409 packages | Section 6, item 11 | |
| 4 | IMPORTANT | `CLAUDE.md:201-214` and its twin; `docs/adr/0058-demo-vault-as-tutorial.md:57`, `:98` | `CLAUDE.md` says of itself: "This page creates no new rule … If anything here has no Accepted ADR behind it, that is a review finding." Its new bullet binds every session to rules that ADR 0058 labels "the author's, for the maintainer to question" (points 4 to 7 and 9 to 13): boards never edited in the app, keys checked against Excalidraw's key tests, the tutorial followed before the PR, a harness answer per new command. The index lists 0058 as Accepted, whole | Rules the maintainer never accepted become obligations of every future PR. **Read**, both languages | Section 6, item 12 | |
| 5 | IMPORTANT | `docs/adr/0043-placeholder-guard.md:150-175` | The amendment "Opening a file fetches it. Decided by the maintainer on 2026-09-30" carries only the option's label, "Baixar ao abrir". The five bullets under it are the author's reading. Two widen "open" past a file the user opened: "an embed of an open note, a card of an open board", and "a template, a property or a relation written". The same ADR records why reads are guarded | You open one board with forty cards on a metered link, the vault evicted: forty downloads start from one click. That may be what the maintainer wants; nothing recorded says so. See also reading 3, finding 3. **Read** | Section 6, item 8 | |
| 6 | IMPORTANT | `docs/adr/0057-board-json-canvas.md:111-164` | Point 10 is headed "added on 2026-09-30 by the maintainer" and carries a file format: a `verso` key on nodes and on edges with a dozen named fields, `verso.background`, `"under"` in the drawing, six settings. The quotes behind it are a bug report and a wish ("coloquei porta reta, ele aplica mas nao salva…", "deixa tudo redondinho"): they ask that a style be kept; none chooses where or under which names | Fields written into users' `.canvas` files are permanent once shipped; the record shows them as the maintainer's decision. **Read** | Section 6, item 14 | |
| 7 | IMPORTANT | `docs/spec/dialect.md:372-388` against ADR 0057 point 10 | Spec §5.11, decided, gives the board's format as the top-level `verso` key with `version` and `drawing`, and `relation` on an edge. It says nothing of what point 10 writes into the same file | Someone checking the format from the spec gets a different file than the app writes. **Ran**: the spec has no line for those fields | Recorded as a contradiction by omission. Section 6, item 14 | |
| 8 | IMPORTANT | `docs/BRIEFING.md:334`, `:485` and the pt-BR original; `docs/adr/0035-cross-cutting-requirements.md:56`; against ADR 0057 `:35-37`, `:90` | The briefing promotes the board's accessible view to "`DECIDED` (v0.11, ADR 0057: an outline beside the board)". ADR 0057 says of the same point: "delegated to the author … the author's choice, for the maintainer to question". The answer was "Pode seguir a melhor escolha para nossa aplicação se baseando no mercado" | `CLAUDE.md` §1: only the maintainer promotes. The briefing shows as the maintainer's a form the ADR calls open to question. **Read** | Recorded, not resolved. Section 6, item 15 | |
| 9 | IMPORTANT | `CHANGELOG.md:13-45` and its twin, "Unreleased" | User-visible changes with no line, in either language: `22b8bce` (the updater finds `gh` from the Dock and explains a 404), `4299821` (an SVG opened as an empty tab), `2db48ca` (the palette's button becomes an icon), `9073e64` ("Move to Trash", and a PDF in a background tab), `0e23ed7` (the log records why the app quit). Several fixes sit under "Added" | The release notes of the next version omit a fix a beta.2 user was waiting for, the updater. **Ran**: which commits touch the changelogs | The missing lines, both languages | |
| 10 | IMPORTANT | `docs/adr/0034-roadmap-in-phases.md:21-22`, `:40-41` against `CLAUDE.md:93-98` and ADR 0057 `:39-42` | [ADR 0034](../adr/0034-roadmap-in-phases.md), Accepted and not amended, still decides the board "out of scope until the end of Phase 2". `CLAUDE.md` §2.5 cites it as the source of invariant 18, which no longer lists the board. The memo proposed that "ADR 0034's rule itself stays" and the maintainer answered "sim"; but 0034 got no revision line pointing at 0057, as five other ADRs did | A session that reads ADR 0034, as §2.5 directs, finds the board forbidden. **Read** | Recorded as a contradiction. Section 6, item 16 | |
| 11 | IMPORTANT | `docs/adr/0014-primitives-catalog.md:5-12`, `:71-73`; `docs/adr/README.md:45`; against `docs/BRIEFING.md:118` | The briefing says the typed relation is "`DECIDED` (promoted in v0.11, ADR 0057 …)". [ADR 0014](../adr/0014-primitives-catalog.md), which catalogues that primitive, was not touched: it still lists the typed relation among items that "depend on syntax that is still `[OPEN]`" | Two documents answer "is the typed relation decided?" differently. **Read** | Recorded. Section 6, item 16 | |
| 12 | MINOR | `docs/adr/0058-demo-vault-as-tutorial.md`; `docs/adr/0059-tabs-preview-pinned.md` | Neither has a `Status` section; every other ADR has one. The index gives both as Accepted. 0059 says of itself that it was recorded after `aa2bd39` implemented it | The index asserts a status the ADR does not state. **Ran** | Add the section; for 0058, say which points are accepted | |
| 13 | MINOR | `demo-vault/10 - Desenhando no Board.md:13` | "nove lições"; the board has twelve | The tutorial contradicts itself on its first line about the practice board. **Ran** | "doze" | |
| 14 | MINOR | `docs/reference/demo-vault-walkthrough.md:143` and its twin | "⌘K `tag:projeto`: the three projects." Two project notes carry the tag; the third file with it is a template | A step states an expectation the vault cannot give. **Read** | Correct the expectation or the vault | |
| 15 | MINOR | `demo-vault/Board de Demonstração.canvas` against ADR 0058 point 4 and `CLAUDE.md:204-205` | "The boards are built from `scripts/demo-vault/` … never edited in the app". The vault has a third board with no source; the script builds two | The rule reads as covering every board; one is kept by hand. **Read** | Say "the two tutorial boards", or give the third a source | |
| 16 | MINOR | `scripts/demo-vault.mjs:51` | The vault's files include untracked ones that are not ignored: such a file in `demo-vault/` is embedded into the copy the app ships | A daily note made while testing in `demo-vault/` goes into the embed at the next build. **Read** | Tracked files only | |
| 17 | MINOR | The description, lines 4 to 6 | "6 commits … 43 … 2 … 1" sums to 52; the branch has 51, the merge included, and the 43 already hold the 2 | A count the repository contradicts. **Ran** | 6 + 41 + 2 + 1 + the merge | |
| 18 | MINOR | `docs/reference/board-decision.md:315` and its twin | "Three more probes" introduces a table of four | — | "Four" | |
| 19 | MINOR | `docs/adr/0057-board-json-canvas.md:35-37`, `:109-110` | "Points 7 and 9 were delegated to the author" under one quote; the memo records that quote as the answer to question 7 only | Point 9 has no word of the maintainer behind its delegation. **Read** | Say point 9 is the author's, unasked | |
| 20 | MINOR | `docs/adr/0051-development-flow-and-releases.md:113-121` | "Every build carries the window's inspector … Decided by the maintainer ('quero isso tudo ai')": three words carry a Tauri feature that uses a private macOS API in every build, and a setting. The ADR does record that the two costs were put first | Thin, not absent. **Read** | The maintainer's eye | |
| 21 | MINOR | `docs/adr/0029-guardrails-in-ci.md:97-101` and `CLAUDE.md` §3 against ADR 0058 point 7 and `ci.yml:75-78` | The pull-request job now runs the demo vault's check; ADR 0029's list of what that job runs, and both guardrail tables, do not name it. A comment in `ci.yml` still says the app's `std::fs` is "confined to src/update.rs" | A CI step that blocks a merge with no row saying what it prevents. **Read** | A row, or a sentence saying it is not a guardrail | |

### What the fifth reading ran

`node scripts/demo-vault.mjs check`: "boards and embed up to date; 36 files
hold together". `bash scripts/check-docs-mirror.sh`: ok. `bash
scripts/check-fixtures.sh`: 13 checked; no file under `fixtures/` changed in
the branch. `node scripts/check-npm-licenses.mjs`: 409 packages. The
dependency diffs match the description's table; nothing undeclared.

Finding 9, the commits that touch no changelog:

```
22b8bce  fix(update): find gh where the Dock's PATH does not reach; say why 404
4299821  fix(app): an SVG opens fitted to the view, not as an empty tab
0e23ed7  feat(log): the log says why the app went
2db48ca  fix(app): the status bar's palette button is an icon
9073e64  fix(app): a PDF in the background fits when shown; "Move to Trash" in English
```

Checked, with nothing to report. The mirrors: every changed pair has the
same table rows, bullets, numbered items, dates and numbers; the unequal line
counts are wrapping, plus English glosses of Portuguese quotes; no "decided"
on one side only. The `[OPEN]`s: Q10, Q16 (`.canvas` only), Q24 (the link
part), ADR 0040 and ADR 0058's "how the walk runs" each close on a quoted
answer, with the spec's history updated in step;
[ADR 0004](../adr/0004-project-name-verso.md) decides nothing about the
bundle identifier, it adds it as `[OPEN]`. No impossible date. Every
walkthrough step run by machine names a test that exists. Every key the
tutorial teaches matches the window's bindings, the editor's keymap and the
native menu; every interface name in notes 09 to 18 exists in the window's
strings or in Excalidraw's pt-BR locale; the command line in note 17 works as
written.

Not covered: whether ⌘D, ⌘K and ⌘[ taught at the tour's last stop act on the
board instead of the window when a card is selected (not run; worth one
probe); the behaviours of notes 01 to 08 beyond names and keys; the middle
sections of the memo's pt-BR twin, compared by structure, numbers and dates,
not sentence by sentence.

## 6. Pending the maintainer

None of these is decided by this review, and none carries a recommendation.
Each names the findings behind it.

1. **What a card's `file` is** (reading 1, finding 1). An exact path from the
   root, as the window reads it and the JSON Canvas spec words it; or a link
   target resolved like a wikilink, as the core does now, in which case the
   window must follow; or observe Obsidian first with a card whose `file` is
   only a name, since the memo has no such probe.
2. **A fixture for links in the frontmatter** (reading 5, finding 1; reading
   1, finding 4). Spec §4.1 gains a key for property links and a drafted
   fixture enters this pull request for approval; or the fixture is deferred
   in words, recorded in the spec; or the links are asserted through the
   existing `links` key, which the code deliberately avoided.
3. **What the user's act on a board is** (reading 2, finding 1). Only a
   change made with a tool to a card, an edge or the drawing, so that a
   press, a selection, a pan or a zoom never writes; or, as today, anything
   after the first press or key. Tied to it: may what the board normalizes
   (re-measured text, Excalidraw's default fields) ride along with the first
   real edit, or must a save carry only what the user changed?
4. **A canvas in another layout** (reading 1, finding 3). Is re-laying a file
   on save a "conversion" under invariant 8? ADR 0057 point 2 stands as
   written and the re-layout is recorded as accepted; or the diff is shown
   the first time such a file is saved; or the file's own line endings and
   leading whitespace are kept and only the rest is re-laid.
5. **What a save may change that the user did not touch** (reading 2,
   findings 4 and 7; reading 4, finding 4; reading 1, finding 7). An edge's
   sides: kept until the user re-attaches that end; or recomputed on every
   save, as today; or kept as read, with Verso drawing the edge from them;
   and whether an edge with no sides may gain them. Entries the board cannot
   draw (an edge to a missing node, an entry with no id): kept untouched;
   dropped, as today; or dropped and said so. Positions that are not whole
   numbers: kept; rounded everywhere, as today; or rounded only where the
   user moved something.
6. **A board whose file changes on disk while open** (reading 2, finding 5).
   Reload when the board holds nothing unsaved, as a note's tab does; a
   banner at once; or, as today, nothing until the next edit is refused.
7. **The index rebuild and evicted notes** (reading 1, finding 2). ADR 0043
   says both "keeps the last known version" and that a rebuild "costs nothing
   but time". Migrate in place and keep the unverified rows; carry them
   across a rebuild; or accept the loss and say so in ADR 0043 and the
   changelog.
8. **What "download on open" covers** (reading 5, finding 5; reading 3,
   finding 3; reading 1, finding 12). The file opened in a tab only; or also
   its embeds and a board's cards; or also write paths (a property, a
   relation, a template). Tabs restored at startup and the re-check of open
   notes after a folder event: fetch, as built; fetch only the tab in front;
   or never fetch without a click. And whether the command line and the MCP
   never fetching is right. Either way ADR 0043 needs a sentence for the
   window's side.
9. **Fuzzing the canvas parser** (reading 1). `CLAUDE.md` §3 lists parser
   fuzzing, preventing "a malformed file hanging the app", as a guardrail of
   feature 1, and says feature guardrails "enter in the same PR as the
   feature they protect". ADR 0057 names only the round-trip test as the
   board's guardrail. The canvas parser is a new hand-written parser of files
   of the folder; the guardrail's letter names feature 1's parser, its stated
   purpose covers this one. A fuzz target in this pull request; a recorded
   deferral; or a statement in ADR 0029 that the guardrail is the dialect's
   only.
10. **`src/log.rs` as the fourth `std::fs` exception** (reading 5, finding
    2): ratify it or not, and say whether "the app keeps a log" is a
    decision. Beside it: ADR 0029 has the bug report carry the end of the log
    to the window and says nothing about paths inside it; whether rule 4 of
    [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) reaches the
    log's own path and its lines is written nowhere (reading 1, finding 10;
    reading 3, finding 12).
11. **`0BSD` on the npm allowlist, and `fuzzy` taken by hand as MIT**
    (reading 5, finding 3).
12. **ADR 0058, points 4 to 7 and 9 to 13** (reading 5, finding 4; reading 4,
    finding 1). Accept them, in which case `CLAUDE.md` stands; or keep in
    `CLAUDE.md` only what points 1 to 3 and 8 carry until they are accepted.
    Point 8 sits under "decided by the maintainer" and says "Playwright's
    WebKit: headless, local"; the words quoted choose "option 1, extend the
    harness", and the ADR does not quote option 1, so it cannot be told
    whether Playwright and "local" were in it. With it: do the window's tests
    gate a merge? Today the end-to-end tests run only on the author's
    machine, and the unit tests nowhere. Leave both local; add the unit tests
    to CI; add the end-to-end tests to CI; record in ADR 0029 which of them
    is a guardrail.
13. **Does the harness ship inside the app** (reading 4, finding 13). Leave
    it, unreachable and dead under the real IPC by reading; or build it
    outside what the app packages.
14. **The board's extra fields in the file** (reading 5, findings 6 and 7;
    reading 2, finding 12). Accept the names and places as ADR 0057 point 10
    writes them; change them before they ship; or keep some style out of the
    file. Then which document holds the format, and which of the memo's §5
    and point 10 stands for an arrow with a bend.
15. **The board's accessible view** (reading 5, finding 8). Is "an outline
    beside the board" decided, or the author's choice still open to
    question? The same for point 9 of ADR 0057 (reading 5, finding 19) and
    for the inspector in every build (reading 5, finding 20; reading 1,
    finding 11).
16. **ADR 0034 and ADR 0014** (reading 5, findings 10 and 11). Leave them as
    written with a pointer to ADR 0057, or amend them.
17. **ADR 0059, point 1** (reading 3, finding 8). Confirm or strike: a
    preview from the search results, from the quick switcher by Enter, from
    unlinked mentions; "an edit or a pin keeps it"; whether an edit inside a
    board's card keeps the board's tab; whether a preview tab should come
    back as one after a restart.
18. **Back and forward with preview tabs** (reading 3, finding 7). The trail
    records notes, and a step back reopens one in the preview tab; or as
    built, recorded as a known limit; or a note left behind by the preview
    tab is kept as a tab when stepped back to.
19. **⌘W once no tab is left, and in a note window** (reading 3). Today ⌘W
    then does nothing, the last tab of a note window leaves an empty window,
    and "Close Window" has no key. As built; ⌘W closes the window when the
    pane is empty; or give "Close Window" a key.
20. **Undo, Redo and Select All inside web pages** (reading 1, finding 5;
    reading 3, finding 5). Whether web notes, embedded sites and link windows
    must keep the system's ⌘Z, ⌘⇧Z and ⌘A, which shapes the fix.
21. **The demo vault in English** stays `[OPEN]` in ADR 0058; nothing in the
    branch closes it. Listed so it is not lost.

## 7. Outside this PR

Seen in code or documents the branch did not touch. Unclassified.

- `percent_decode` in `app/src-tauri/src/lib.rs` slices a text by byte
  offsets; a `%` followed by one ASCII byte and a multi-byte character would
  panic. Not shown reachable: the web view percent-encodes.
- `app/src-tauri/clippy.toml` has an empty denied list, and the grep that
  stands in for it matches `std::fs` only, not `Path::exists`, `is_dir` or
  `metadata`. None is used in the host today.
- An attachment named by an embed is listed as unresolved by `verso backlinks
  --unresolved` (`assets/diagrama.svg`, `Projetos.base`); the rule predates
  the branch, and image and PDF cards of boards now add to the list.
- ADR 0043's sentence that an index rebuild "costs nothing but time" (reading
  1, finding 2).
- `scripts/check-npm-licenses.mjs` on `main` already allows `Unlicense` and
  `EPL-2.0` "for the maintainer's eye"; ADR 0029's row still gives the older
  list.
- `verso search` on the command line does not apply `tag:`, `path:` or
  `file:`; they are the window's. The tutorial does not claim otherwise.
- A plain text tab (`.json`, `.txt`, a `.canvas` shown as text) does not
  follow the disk either: the re-check takes note tabs only, as on `main`.
- "Copiar código" and "Copiado!" are written in Portuguese outside the
  catalogs.
- A note tab whose load failed keeps a bare, editable editor that never saves
  (reading 3, finding 4 is the branch's side of it).
- The reading view asked the core for a percent-encoded picture address on
  `main` too (reading 3, finding 6 is the branch's wider reach).
- Dialogs do not stop the window's hotkeys: ⌘P, ⌘W by key and others run
  behind Settings or a plan.
- An alt text that is only a number is read as a size (`![2024](chart.png)`
  is drawn 2024 px wide), as Obsidian documents it.
- `npm test` for the Mermaid and PDF tests was already run by no script on
  `main`.
- The unit tests write their bundles into the folder the app packages, so an
  app built locally after running them carries them; source maps ship there
  too (5.4 MB for the main one).
