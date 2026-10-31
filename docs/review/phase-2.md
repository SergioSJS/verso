# Critical review — Phase 2 (the window, and what Phase 1 grew under it)

- Date: 2026-09-23
- Reviewer: Opus 5.5, in the role of core Rust reviewer that
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) gives "Opus 5" (Opus
  5.5 fills that row; nothing else records it); for the UI, the
  reading the maintainer chose when they had Fable 5.1 write it
  ([ADR 0049](../adr/0049-phase-2-scope-widened.md))
- Author of the code under review: Fable 5.1
- Input: five readings, each in its own session, of the branch
  `phase1-2/integration` at `e392e8a` (48 commits over `main`), without access
  to the author's session. Each reading took one slice: the Tauri host; the
  file system, the core and the contract; the dialect, the index, the CLI and
  CI; the UI's writes and security; the UI's correctness, language and
  accessibility.
- Roadmap item: Phase 2, items 2.1 to 2.7, and what
  [ADR 0049](../adr/0049-phase-2-scope-widened.md) adds to them
  ([`../roadmap.md`](../roadmap.md)).
- State: every BLOCKING finding of the five readings is resolved — in code,
  or, for reading 3, finding 4, by the maintainer's amendment of spec Q12
  point 3 on 2026-09-23; a second round of readings of the fixes found no new
  BLOCKING, and its IMPORTANT findings are fixed (section 7). What waited for
  the maintainer is in section 6, with the maintainer's answer of 2026-09-23
  under each item; what the answers changed closes section 7. Nothing in this
  document decides an `[OPEN]` question.

## How to read

Each reading is a section, with its findings in the order and with the
classification the reading gave them. The "Resolution" column says where the
finding was fixed, or that it was kept and why, or that it is the maintainer's.
No finding proposes a decision: where a decision is needed, the row says what
needs to be decided, and section 6 lists it.

| Level | Meaning ([ADR 0033](../adr/0033-pr-workflow.md)) |
|---|---|
| BLOCKING | Violates an invariant, guardrail or decision; or loses data. Blocks merge |
| IMPORTANT | Must be resolved, or explicitly deferred with a record |
| MINOR | At the author's discretion |

Several findings were made twice, by two readings looking at the same code
from different sides; each keeps its row, and the second one points at the
first.

## Summary

| Reading | Slice | BLOCKING | IMPORTANT | MINOR |
|---|---|---|---|---|
| 1 | The Tauri host (`app/src-tauri`) | 2 | 4 | 5 |
| 2 | `verso-fs`, `verso-core`, `verso-contract` | 3 | 6 | 5 |
| 3 | `verso-dialect`, `verso-index`, `verso-cli`, `verso-bench`, CI | 4 | 12 | 5 |
| 4 | The UI: writes and security | 11 | 3 | 4 |
| 5 | The UI: correctness, language, accessibility | 5 | 14 | 4 |

Twenty-five BLOCKING findings in all, several found twice from two sides.
They cluster: writes that could land over text the user never saw (a revision
taken from a re-read, a confirmation that never asked, a banner that could be
bypassed, forced reloads, a task click on stale text); content of the folder
acting on the window (raw HTML, a framed SVG, the file protocol, navigation);
bytes rewritten that nobody touched (lossy UTF-8, line endings); absolute
paths crossing the contract; a panic that stopped every later command; and a
red test. Twenty-four were fixed in code; the last (reading 3, finding 4),
the index departing from the closed Q12 point 3, was resolved by the
maintainer, who amended point 3 on 2026-09-23.

---

## 1. First reading — the Tauri host

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | BLOCKING | `verso://` served the folder's files with no isolation: an SVG went out as `image/svg+xml` with no policy, note HTML reached `innerHTML` with raw HTML intact, and the window's CSP allowed `frame-src` and `object-src verso:`. Tauri counts the scheme as a local origin, so a folder SVG could run as a document that reads the rest of the folder. Folder content is untrusted input ([ADR 0045](../adr/0045-server-and-mcp-security.md)) | **Fixed** in `5f07500`: every response carries `Content-Security-Policy: sandbox; default-src 'none'…` and `nosniff`, and the window's CSP says `object-src 'none'`. `frame-src verso:` stays for the HTML-file viewer, whose responses are now sandboxed. Note HTML is also sanitized in the UI (reading 4, finding 1) |
| 2 | BLOCKING | `Access-Control-Allow-Origin: *` on file responses, and the scheme answered every web view, including the ones that show web sites | **Fixed** in `5f07500`: CORS is answered for the app's origin only, and a request from any view other than `main` and `note-*` is refused. Tested |
| 3 | IMPORTANT | The capabilities did not gate the app's commands: with no app manifest, any document Tauri deems local could call every command | **Fixed** in `5f07500`: an app manifest in `build.rs`, and the commands granted to the `main` and `note-*` web views only. The test calls from a site's web view and from a remote origin and is refused; seen failing against the old `build.rs` and capability |
| 4 | IMPORTANT | The protocol served notes, although its comment said it never did | **Fixed** in `5f07500`: `.md`, in any case, is refused; notes cross only through `read_note`. The UI's "duplicate" read notes through the protocol and now reads them through the contract (`873d739`) |
| 5 | IMPORTANT | The web-view commands trusted labels chosen by the UI and looked them up app-wide: two windows collided on `web-1`, one window could move, hide, steer or close another's page, and `web_nav` could point `main` at a site | **Fixed** in `5f07500`: the host issues the label, records the window that opened the view, and only that window may act on it |
| 6 | IMPORTANT | No navigation or new-window policy: a page in a web view could navigate to `verso://` or `tauri://`, both local origins | **Fixed** in `5f07500` for web views (http and https only, no new windows); for `main` and `note-*` in `8a284f8`: a guard for every web view; app views stay on the app's pages and the file protocol (the handler is asked for frames too, and the HTML-file viewer is one) |
| 7 | MINOR | `img-src https:` lets a note's HTML load remote resources when the note is shown; with `style-src 'unsafe-inline'`, raw HTML can restyle the app | `<style>` no longer reaches the page (reading 4, finding 1). Remote images stay, as in Obsidian; recorded in [ADR 0049](../adr/0049-phase-2-scope-widened.md) and in `docs/reference/app-decision.md` §7. Accepted by the maintainer on 2026-09-23, with a "load remote content" setting ([ADR 0050](../adr/0050-outbound-network-access.md), `fa8ba6b`; section 6, item 5) |
| 8 | MINOR | A refused path in `create_folder` answered `failed`, not `refused` | **Fixed** in `8a284f8`: the path is confined first, so a refused one answers `refused` |
| 9 | MINOR | `IndexSummary.problems` crossed as Rust debug text, untranslatable | **Fixed** in `8a284f8`: one readable line per problem, with paths relative to the folder |
| 10 | MINOR | `core:default` does not grant `set-focus`, so the UI's focus call after opening a note was denied | **Fixed** in `5f07500` |
| 11 | MINOR | The only test called from `main`; nothing checked a refusal | **Fixed** in `5f07500` (finding 3's test) |

## 2. Second reading — `verso-fs`, `verso-core`, `verso-contract`

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | BLOCKING | `write_note` and `write_text` returned the revision of a re-read, not of the bytes they wrote. Another app saving between the rename and the re-read made Verso's next save pass the check and overwrite that edit, with no diff (reproduced on the 23rd attempt of a loop). Invariant 11 | **Fixed** in `8a284f8`: the answer is the caller's text with the revision of those bytes; a stamp the write could not confirm is trusted only while the file still holds them. Test `write_note_answers_the_text_and_revision_of_the_bytes_it_wrote` |
| 2 | BLOCKING | Text that is not UTF-8 was decoded lossily and written back: a Latin-1 `é` became `EF BF BD` on disk when a rename plan was applied, and the plan's diff showed only the link. Invariant 8 | **Fixed** in `8a284f8`: strict UTF-8; such a file gives `not_text` to every editor (and to `verso mcp`, `c6b89db`) and is left out of plans as skipped. Spec Q25 was closed on 2026-09-23 as the code does it (section 6, item 4) |
| 3 | BLOCKING | Absolute paths crossed the contract: `FolderInfo.folder`, the path `open_folder` took, and the target of a write through a symlink in the warnings. Rule 4 of [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) | **Fixed** in `8a284f8`: the folder crosses as a name and an opaque key; the host runs the folder picker and keeps the path; a symlink's target is named relative to the folder, or only as outside it |
| 4 | IMPORTANT | The link-rewrite plan matched text and ignored what each link resolved to: it retargeted links when two notes share a name, when the new name is taken elsewhere, and for attachments of the same name; a move could silently change which note a bare link reaches while planning nothing; it rewrote inside code | **Fixed** in `8a284f8`: notes are read before the move with what each link reached; after it, only links whose target changed are rewritten, in a form that reaches it again; code is never touched; a bare link a move would retarget gets a plan. Tests `the_plan_rewrites_only_the_links_that_reached_the_moved_note` and `a_move_that_would_retarget_a_bare_link_gets_a_plan_not_silence` |
| 5 | IMPORTANT | `delete_entry("README")` trashed `README.md` when both existed, and `rename_entry` renamed the note instead of the file, the same way | **Fixed** in `8a284f8`: a note is a path ending in `.md`, nothing else |
| 6 | IMPORTANT | A rename or trash that had already happened was reported as failed, with no plan, when a linking note was a placeholder or the index step failed afterwards; a retry answered "exists" | **Fixed** in `8a284f8`: nothing fails once the entry has moved; unreadable linkers are listed as skipped, the rest are warnings (`Renamed`, `Trashed`) |
| 7 | IMPORTANT | A folder move dropped an evicted note's last known version from the index, and evicted attachments resolved as absent ([ADR 0043](../adr/0043-placeholder-guard.md)) | **Fixed** in `8a284f8`: moved notes are re-keyed in the index with their last known version; placeholder attachments are listed and resolve as present |
| 8 | IMPORTANT | `resolve_file` ignored the source note, so embeds did not follow the closed Q12, which covers them | **Fixed** in `8a284f8`: `resolve_attachment(source, target)` follows Q12 from the note. For a bare name it prefers the note's own folder — the prose of Q12 point 3 — while notes follow the index's "under" (section 6, item 1). Since `2b4afcc`, after the maintainer's amendment, embeds follow "under" too |
| 9 | IMPORTANT | The new write functions of `verso-fs` had no guardrail tests: no refusal of a placeholder, of `..`, of an absolute or hidden path was tested on create, rename, trash, read or write of text | **Fixed** in `8a284f8`: 12 tests in `verso-fs/tests/ops.rs` (every write door refuses a path that leaves or hides; placeholders refused on create, rename and trash) and the core's confinement loop extended. The two fs guardrail tests were seen failing against a planted broken check |
| 10 | MINOR | Check-then-rename could replace a file created in the gap | **Fixed** in `8a284f8`: a file lands through a hard link and the temporary name goes, so nothing that appeared in the gap is replaced |
| 11 | MINOR | Directories created on the way were not fsynced into their parents; a failed directory fsync after the rename was raised as a failed write | **Fixed** in `8a284f8`: created folders are fsynced into their parents; a durability step after the move is a warning, not a failure |
| 12 | MINOR | A rename that only changes case was refused on a case-insensitive volume | **Fixed** in `8a284f8`: the same device and inode under both names is a case-only rename, allowed |
| 13 | MINOR | Links the plan never found: attachment embeds on a folder move, `../` paths, NFD spellings, `\|` in tables, Markdown links | **Partly** in `8a284f8`: the plan now follows what each link reached, which covers attachment embeds on a folder move; NFD spellings, `\|` inside tables and Markdown links are still not rewritten. Recorded |
| 14 | MINOR | The `std::fs` exception of `verso-core` covered the whole crate, not only `sidecar.rs` | **Fixed** in `bd84c1d`: a CI step fails when `std::fs` appears in `verso-core` outside `sidecar.rs`; seen failing on a planted use |

## 3. Third reading — `verso-dialect`, `verso-index`, `verso-cli`, `verso-bench`, CI

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | BLOCKING | `to_html` panicked on a 28-byte note (`> [!note] x </blockquote> y`), and the panic poisoned the workspace mutex of `verso mcp` and of the app: every later call failed | **Fixed** in `f0f94ac`: callouts are found on the parser's events, never by slicing the HTML. The fuzz target now runs `to_html` and `body_tags`, with this input as a seed (217 233 runs, no crash). The poisoned lock: `b7fa52e` for `verso mcp`, `8a284f8` for the app |
| 2 | BLOCKING | `cargo test` was red: a callout's title took the `<br />` of the soft-break change | **Fixed** in `f0f94ac`: the title is read on the callout's first line only |
| 3 | BLOCKING | The reader's tag and highlight passes ran inside code blocks and link labels: `a == b` lost its `==`, `#include` became a tag, `[[#Heading]]` became a tag inside a link. Invariant 12 | **Fixed** in `f0f94ac`: tags and highlights only in prose, never in code, link labels or alt text |
| 4 | BLOCKING | Link resolution prefers a candidate anywhere under the source's folder, while the closed Q12 says "in" it; the observation behind it was recorded only in a test comment | **Recorded, not resolved** (`CLAUDE.md` §1 rule 3). The probes were run again and written down as the third observation of `docs/reference/index-decision.md` §4.1: Obsidian 1.13.7 does prefer "under". **Resolved by the maintainer's decision** of 2026-09-23 ("boa, gosto da sua ideia, pode seguir", answering "sob a pasta, sim ou não?"): Q12 point 3 now says "under" (spec v0.15), which the index already did; embeds of files follow (`2b4afcc`) |
| 5 | IMPORTANT | Every image's end was written as `</span>`, so a Markdown image swallowed the rest of its paragraph | **Fixed** in `f0f94ac` |
| 6 | IMPORTANT | The inline-footnote rewrite detected code wrongly, both ways | **Fixed** in `f0f94ac`: inline footnotes are found on the parser's events, skipping code and math |
| 7 | IMPORTANT | The render and the parser disagree on what a link is (`$[[x]]$`), against the render's own comment | **Fixed** in `f0f94ac`: the comment says exactly what differs; the parser's options are unchanged (spec Q15, section 6) |
| 8 | IMPORTANT | `verso mcp`'s `read_note` of an empty note answered `bad_window` | **Fixed** in `597cdd8`: an empty note, with no window asked, answers an empty window. Test seen failing |
| 9 | IMPORTANT | `verso <folder>` used a lexical rule: an existing directory named without `/` was "unknown command", a missing one "opening", and `verso open` defaulted to `.`, against [ADR 0042](../adr/0042-open-from-command-line.md) | **Fixed** in `4704cc7`, provisionally: a first argument that names an existing directory opens it, anything else is a usage error, and `verso open` needs its folder. Recorded in ADR 0042, whose rule the maintainer decided as built on 2026-09-23 (section 6, item 3). Tests seen failing |
| 10 | IMPORTANT | `FIXTURES_STRICT=1` on `main` fails while `fixtures/block/list-item` is still a draft, although the spec calls it approved | **Resolved** on 2026-09-23: the maintainer approved the fixture ("faça 8"); `86238dd` turns its draft line into the approval, and the strict check passes (section 6, item 8) |
| 11 | IMPORTANT | The CI bench job could not go red: no baseline for `ci-linux`, so the comparison exited 0 by construction | **Fixed** in `37d22a0`: `--require-baseline` fails when the machine has no baseline, and the job on `main` passes it, so `main` is red until the `ci-linux` baseline is recorded (section 6, item 9; `docs/reference/bench-decision.md`, revision of 2026-09-23) |
| 12 | IMPORTANT | A bench test compared single timing samples at 1.5× and failed about one run in twenty | **Fixed** in `c9a0b0f`: that step compares the index size alone. Two failures in 25 runs before, none in 25 after |
| 13 | IMPORTANT | Unbounded rescans in the render: 80 KB of `^[` took a second, quadratic | **Fixed** in `f0f94ac`: one linear pass per construct; tested |
| 14 | IMPORTANT | The index's body tags came from raw lines: links, code and YAML comments made false tags, and the reader used another rule | **Fixed** in `fd6bcfa`: the index calls `verso_dialect::body_tags`, the one rule the reader uses |
| 15 | IMPORTANT | Raw HTML passes through the render, relying on the CSP alone | The UI sanitizes the render's HTML (reading 4, finding 1). Whether the render itself should drop raw HTML is Q6, the maintainer's (section 6). Accepted on 2026-09-23 as built: the window's allowlist, the render unchanged (spec Q6, section 6, item 4) |
| 16 | IMPORTANT | `%%comment%%` showed in the reading view, which Obsidian's documentation says hides it | **Fixed** in `f0f94ac`: `%%…%%` is dropped from the reading view, never inside code (spec Q6, section 6) |
| 17 | MINOR | The bench's index size excluded the `-wal` file | **Fixed** in `bd2034e`: measured after the connection closes. The Mac baseline's index sizes were recorded the old way, 1 to 2 % low, within the tolerance |
| 18 | MINOR | Stale comments in `store.rs` and `render.rs` | **Fixed** in `f0f94ac` and `fd6bcfa` |
| 19 | MINOR | `verso mcp` error results did not match the declared output schema | **Fixed** in `31a5177`: each tool's declared schema is an `anyOf` of its answer and the error shape. Test seen failing |
| 20 | MINOR | `open -a Verso --args` does not pass the folder to an app already running, yet the CLI exits 0 | **Fixed** in `0381644`, at the maintainer's request of 2026-09-23: the installed app gets the folder as a document to open, which a running app receives (section 6, item 14) |
| 21 | MINOR | Every pull request builds the Tauri tree twice (two jobs, two caches), against the CI cost policy | **Fixed** in `27e50c0`, at the maintainer's request of 2026-09-23: the bindings and UI checks run in the Linux Rust job (section 6, item 13) |

## 4. Fourth reading — the UI: writes and security

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | BLOCKING | A note from a shared folder could run script that reads the folder: raw HTML into `innerHTML`, a framed SVG, a `<style>` that probes the tree with no script at all, a `<form>` or `<area>` that navigates the main window | **Fixed** in `4b8f18d`: every piece of core HTML reaches the page through one allowlist sanitizer (`sanitize.ts`): no script, style, frame, form control, event attribute, SVG or MathML; links and sources only http(s), mail, same-page anchors and data images. Host side: reading 1, findings 1, 2 and 6 |
| 2 | BLOCKING | `window.confirm` never asked and always meant "yes": the dialog plugin injects an async version and the UI read the Promise as true, so closing a tab with unsaved text, trashing a folder and reloading a changed file all went ahead | **Fixed** in `0381341`: an in-page dialog (`dialog.ts`) that only an explicit yes answers yes, awaited at every call site |
| 3 | BLOCKING | The conflict banner could be bypassed, and "write mine over it" could overwrite a version it never showed: `save()` took the disk's revision before the user decided | **Fixed** in `6c33b9e`: the banner keeps the disk's text and revision; only "write mine over it" writes over that revision, a second change shows the new diff, and every other save refuses while it is up |
| 4 | BLOCKING | A task click wrote the last saved text, not the editor's, and on a conflict force-reloaded | **Fixed** in `6c33b9e`: a click flips the mark on the line the core names, in the editor's current text, then saves like typing; on `changed`, the banner |
| 5 | BLOCKING | Reindex, rename, quote, "return to main window" and closing the window reloaded or destroyed dirty tabs without saving | **Fixed** in `4fba8d4`: reindex, rename, quote, delete and a new window save first and stop, naming the tabs, when one cannot; a close handler saves every tab and keeps the window open unless the user says yes. A folder switch saves first too (`873d739`), and so does ⌘Q, which used to end the process with no event at all (`4f56e87`) |
| 6 | BLOCKING | Text typed while a save was in flight was marked saved; overlapping saves raised an empty conflict | **Fixed** in `6c33b9e`: writes are chained per tab, and a tab is clean only if the editor still holds what was written |
| 7 | BLOCKING | A link clicked outside the reading view (a PDF, an embed, a folder note) replaced the app window with the site | **Fixed** in `62f769b`: a capture-phase guard stops any link from navigating the window and sends http(s) links to a window of their own; the host guard backs it (reading 1, finding 6) |
| 8 | BLOCKING | A save rewrote bytes the user never touched: lossy UTF-8, CRLF turned into LF, mixed line endings unified | **Fixed** in `b34716f`: both editors write with the file's own line separator; a file with mixed endings or a lone CR opens read-only, with the reason. Non-UTF-8: reading 2, finding 2 |
| 9 | BLOCKING | Opening another folder silently re-pointed every popout's paths at it | **Fixed** in `8a284f8`: only the main window switches folders, and never while a note window is open |
| 10 | BLOCKING | The properties panel rewrote keys from stale values | **Fixed** in `2e9c26e`: the panel is redrawn after every load, save, undo and redo, and every edit applies to the frontmatter as the editor holds it now, or refuses and says so |
| 11 | BLOCKING | Every web note's host went to a third party (`icons.duckduckgo.com`) for its icon, intranet hosts included | **Fixed** in `b2135f1`: the site's own `/favicon.ico`, without referrer, once per site and session; recorded in ADR 0049 |
| 12 | IMPORTANT | A task click could toggle a different line (callouts, code) | **Fixed** in `6c33b9e`: a click flips the mark on the line the core names, in the editor's current text, then saves like typing; on `changed`, the banner, with the core's `data-task-line` (`183cd56`) |
| 13 | IMPORTANT | Enter and Tab reformatted any run of lines bounded by `\|`, code and math included | **Fixed** in `a65154d`: the keys act only on a real table outside code and math, and keep its indentation |
| 14 | IMPORTANT | The image resize grip wrote at stale offsets | **Fixed** in `32dd5a8`: the grip and the block click read their position when the event comes; the reading's case now gives the right text |
| 15 | MINOR | Plans and quotes left a dirty tab behind | **Fixed** in `e4532c2`: plans are computed after the tabs save, and at apply a tab that cannot save is left out and named |
| 16 | MINOR | The conflict diff allocated n×m memory | **Fixed** in `e4532c2`: common head and tail trimmed, bounded table, both middles shown whole past the bound |
| 17 | MINOR | Quoting rewrote the companion note's line ending | **Fixed** in `e4532c2` |
| 18 | MINOR | "Save as template" copied the last saved text | **Fixed** in `e4532c2` |

## 5. Fifth reading — the UI: correctness, language, accessibility

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | BLOCKING | A task click wrote the wrong line and stale text | Same as reading 4, findings 4 and 12 |
| 2 | BLOCKING | Editing a property rewrote values the panel only shows flattened: maps became strings, numbers became quoted text, comments were dropped | `8a284f8` (a `nested` kind the panel never edits) and **Fixed** in `2e9c26e`: text is quoted whenever YAML would read it as something else; blank lines and comments outside the key stay; values with comments, several lines, nesting or anchors are read-only. `909a190`: a kind the panel does not know is never written |
| 3 | BLOCKING | The properties panel was painted once per load and never re-synced | Same as reading 4, finding 10 |
| 4 | BLOCKING | The image resize grip overwrote a stale range | Same as reading 4, finding 14 |
| 5 | BLOCKING | Forced reloads threw away unsaved text | Same as reading 4, finding 5 |
| 6 | IMPORTANT | Live Preview threw on a callout with an empty `>` line | **Fixed** in `5e94b14`: every hidden run is clamped to its own line, and a builder that still throws leaves the note as source |
| 7 | IMPORTANT | ⌘I and ⌘⇧K ran CodeMirror's defaults; ⌘⇧K deleted the line | **Fixed** in `5d1e186`: the note's keymap wins over CodeMirror's defaults |
| 8 | IMPORTANT | Global hotkeys fired on top of editor keys, Ctrl counted as ⌘, and the recorder accepted keys that break the app | **Fixed** in `c016878`: ⌘ on macOS and Ctrl elsewhere, each event handled once; the recorder needs a modifier, refuses a reserved list and disarms on a click away. Inside an editor the app's hotkeys now come before CodeMirror's defaults, so ⌘D no longer selects the next occurrence (section 6; accepted on 2026-09-23, item 22) |
| 9 | IMPORTANT | Strings outside the pt-BR/EN catalogs ([ADR 0035](../adr/0035-cross-cutting-requirements.md)) | **Fixed** in `d50f693`: CodeMirror's phrases in pt-BR, errors by kind with the core's message as detail, the table header, folder names and callout titles through the catalogs. The core's own texts stay English (section 6, item 12; recorded in ADR 0035 on 2026-09-23, a code per warning planned) |
| 10 | IMPORTANT | Controls without names, dialogs without focus handling (ADR 0035) | **Fixed** in `63f1480`: names and descriptions for controls, modal dialogs with focus trap, return and Escape, the highlighted option announced, the tab and workspace menus and the dividers reachable by keyboard. No keyboard equivalent for dragging tabs or files yet |
| 11 | IMPORTANT | Secondary text below 4.5:1 contrast (ADR 0035) | **Fixed** in `7ba8d39`: only lightness changes; the worst case is 4.51:1 |
| 12 | IMPORTANT | The UI and the core disagreed on where the frontmatter ends | **Fixed** in `2e116cd`: one rule, the core's (`frontmatter.ts`), for the panel and Live Preview; checked against the parser on 18 030 documents |
| 13 | IMPORTANT | The panel's frontmatter edit wrote invalid YAML and dropped neighbouring lines | **Fixed** in `2e9c26e`: text is quoted whenever YAML would read it as something else; blank lines and comments outside the key stay; values with comments, several lines, nesting or anchors are read-only. `909a190`: a kind the panel does not know is never written |
| 14 | IMPORTANT | Live Preview rendered math and blocks the core does not | **Fixed** in `7d5066c` (blocks from the syntax tree, inline math by pulldown-cmark's rules) and `8838a7c` (the editor parses the GFM parts the reader renders) |
| 15 | IMPORTANT | Table re-layout changed indentation, code and dash rows | Same as reading 4, finding 13 |
| 16 | IMPORTANT | Resources outlived their tab: PDF workers, preview rebuilds, a web-view loop every frame | **Fixed** in `ea52c4f`: embedded PDFs close with their tab, the reading view is redrawn only when its HTML changed, web views are ticked only when something can move them |
| 17 | IMPORTANT | The `/` menu stayed on screen after the editor lost focus, and opened inside code | **Fixed** in `b1a55bd` |
| 18 | IMPORTANT | Enter in the PDF search never reached the second hit | **Fixed** in `1370810`: checked on pdf.js's own find controller |
| 19 | IMPORTANT | Vault find-and-replace silently skipped notes the index does not match by whole word | **Fixed** in `bcdecb2`: the preview reads every note and says how many, and which could not be read |
| 20 | MINOR | The UI's fallback link resolution differed from the index's | **Fixed** in `b90346e`: the index's order, ported |
| 21 | MINOR | `layout()` created a workspace as a side effect | **Fixed** in `0665856` |
| 22 | MINOR | State left stale after file changes: image cache, bookmarks, closed tabs, restore | **Fixed** in `f231360` |
| 23 | MINOR | Assorted: strikethrough in Live, hard-coded shortcut hints, labels, reduced motion | **Fixed** in `8838a7c`, `de39147` and `af13c45` |

## 6. Pending the maintainer

None of these is decided by this review. Each says where it lives. On
2026-09-23 they were put to the maintainer with a recommendation each, in four
groups: A, accept as it is (items 2, 3, 4, 6, 11, 18, 20, 21, 22); B, accept
with a small change (5, 7, 10, 12, 15, 16, 19); the maintainer's alone (8,
17); D, later and not blocking (9, 13, 14, 23). The answer: *"a e b ok, faça
8, 17 troque para Opus, o que for importante ja puxa de D"* — of D the author
took 13 and 14. Each item carries its answer.

1. **Q12, point 3: "in" or "under" the source's folder — decided on
   2026-09-23.** Asked "sob a pasta, sim ou não?", the maintainer answered
   yes ("boa, gosto da sua ideia, pode seguir"): a bare name prefers a
   candidate anywhere under the source's folder, as Obsidian 1.13.7 does.
   Recorded in spec Q12 (v0.15) and `docs/reference/index-decision.md` §4.6;
   the index already did it, and embeds of files follow (`2b4afcc`). The same
   answer approved a setting for the form new links take — shortest, relative
   or from the root — which came in `4347daf`.
2. **File operations** — [ADR 0048](../adr/0048-file-operations-in-ui.md),
   `[OPEN]`. What the code does is recorded there as provisional: rename and
   move with a plan of link rewrites applied note by note, with no logical
   transaction; delete into `.trash/` with a confirmation; create; name
   collisions as the volume compares names; a lone placeholder cannot be
   renamed or deleted while a folder holding placeholders can.
   **Answer:** accepted as built; ADR 0048 is Accepted (`65d2d4d`).
3. **The command line** — [ADR 0042](../adr/0042-open-from-command-line.md),
   `[OPEN]` rule; what `verso <folder>` and `verso open` do now is recorded
   there as provisional. **Answer:** accepted as built; ADR 0042's Phase 2
   rule is decided.
4. **What the reading view renders** — spec Q5 (callout kinds), Q6 (raw HTML,
   now sanitized by the window; `%%` comments, now hidden), Q13 and Q22 (body
   tags, indexed and rendered by one rule), Q15 (tables, footnotes including
   the inline form, task lists, math, highlight, strikethrough, a single
   newline as a line break), Q24 (the window now follows the core's
   frontmatter boundary), Q25 (a file that is not UTF-8 is not opened for
   editing). Each has its provisional line in the spec. **Answer:** accepted
   as following Obsidian — Q13 and Q25 closed; Q5, Q6, Q15 and Q24 decided for
   the reading view and the window; Q22 for the tags (spec v0.16, `9869712`).
   The premise did not hold everywhere: Obsidian nests callouts and the reading
   view does not, so Q5's nesting stays open; the reading view did not fold
   callouts either, which it now does (`7679916`); and the window drops the
   `<iframe>`, `<video>` and `<audio>` Obsidian shows, which stays open under
   Q6.
5. **The network** — [ADR 0049](../adr/0049-phase-2-scope-widened.md),
   Consequences: web notes, links clicked in the window (opened in a window of
   their own), web notes' icons asked of the site itself, and remote images
   reach the network; no ADR covers outbound access
   ([ADR 0027](../adr/0027-runtime-capabilities.md) is Proposed). The `url:`
   property that makes a note a web note is a Verso meaning with no ADR.
   **Answer:** the four ways and the `url:` meaning accepted, with a "load
   remote content" setting over the two that need no click (`fa8ba6b`);
   [ADR 0050](../adr/0050-outbound-network-access.md), the setting's default
   (on) provisional.
6. **The contract's security** — [ADR 0045](../adr/0045-server-and-mcp-security.md),
   `[OPEN]`: no session identity and no per-operation authorization; the host
   now grants the commands to the app's own views only. `verso://` is a second
   channel beside the contract whose URL is a path (rules 1, 2 and 4 of
   [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)); it answers
   the app's own views only and never serves a note. The host-only commands
   (`web_*`, `open_url`, `open_window`, `reveal`) sit in the same bindings as
   the core's (rule 2; ADR 0027). **Answer:** accepted as built for Phase 2;
   `[OPEN]` until a server enters scope (ADR 0045).
7. **Dependencies and exceptions** — `deny.toml`'s seven advisory ignores and
   `Apache-2.0 WITH LLVM-exception`; Tauri's `unstable` feature; the UI's npm
   packages — among the new ones `pdfjs-dist`, `katex`,
   `@codemirror/language-data` and three `@fontsource` fonts — none with a
   license gate in CI. **Answer:** the advisory ignores, the license
   exception and `unstable` ratified; an npm license gate added (`e51e977`,
   ADR 0029); `@tauri-apps/plugin-dialog`, which nothing called, dropped
   (`18b696e`).
8. **A fixture and the spec disagree** — `fixtures/block/list-item` is still an
   AI draft while spec §5.7 and Q3 call it approved; CI's
   `FIXTURES_STRICT=1` on `main` fails until one side changes
   ([ADR 0031](../adr/0031-fixtures-as-contract.md)). **Answer:** approved
   ("faça 8"); `86238dd` turns the draft line into the approval, and the
   strict check passes.
9. **The bench's CI baseline** — none recorded for `ci-linux` yet
   (`docs/reference/bench-decision.md` §6.3;
   [ADR 0039](../adr/0039-performance-targets.md) `[OPEN]`). **Answer:**
   later — the baseline can only come from CI, still blocked by billing.
   Recorded on 2026-09-24 from the first run on `main`, with the maintainer's
   approval (`docs/reference/bench-decision.md`, revision of that day).
10. **The crate list** — `verso-contract`, `verso-bench` and `app/src-tauri`
    are workspace members, while [ADR 0028](../adr/0028-crate-structure.md) and `CLAUDE.md`
    §3 list five crates. **Answer:** ADR 0028 and `CLAUDE.md` §3 and §7 now
    record them (`65d2d4d`).
11. **Daily notes and templates** — built under
    [ADR 0014](../adr/0014-primitives-catalog.md), which is Proposed.
    **Answer:** both accepted in ADR 0014; the rest of the catalog stays
    Proposed.
12. **The language of the core's texts** — [ADR 0035](../adr/0035-cross-cutting-requirements.md):
    the window translates error kinds, while the core's details and write
    warnings stay in English (the contract records that as `[OPEN]`); the
    window's own mechanism (a typed catalog of strings, a language setting
    that reloads the window) is not recorded anywhere. **Answer:** recorded
    in ADR 0035; a code per core warning, so that the window can translate
    it, is planned, not done.
13. **CI cost** — every pull request builds the Tauri tree twice (reading 3,
    finding 21). **Answer:** fixed in `27e50c0` — the bindings and UI checks
    run in the Linux Rust job; then, at the maintainer's request, a pull
    request runs one Linux job in all, and macOS and the fuzzing only on
    `main` (ADR 0029).
14. **`open -a` with the app already running** (reading 3, finding 20).
    **Answer:** fixed in `0381644` — the folder goes to the installed app as a
    document to open, which a running app receives; seen working with a
    throwaway bundle of the debug build.
15. **The index sidecar's file mode** — [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md)
    says "file `0600`"; the sidecar comes out 0644 inside the 0700 directory.
    **Answer:** `0600`, as the ADR says (`850928a`).
16. **The HTML-file viewer is unreachable** — found in the smoke run of
    2026-09-23, older than this review (`fed6792`): an `.html` file counts as a
    text file before it can be a page, so it opens as source, and the viewer
    the maintainer asked for on 2026-09-22 is never shown. A choice of how the
    two should meet (a toggle, or HTML opening as a page) is the maintainer's.
    **Answer:** an HTML file opens as its page, with its source as the other
    mode of the same tab (`c64b6b8`).
17. **The cross-readings of the fixes** were made by Opus 5.5, not by Fable
    5.1 as [ADR 0032](../adr/0032-author-and-reviewer-roles.md) assigns for the
    window and the documents: the maintainer's decision of 2026-09-23, when
    Fable reached its usage limit. Whether a Fable reading follows is the
    maintainer's. **Answer:** "17 troque para Opus" — the readings stay with
    Opus 5.5 in place of Fable 5.1; the changes of these answers were read by
    a fresh Opus 5.5 session, whose findings and their resolution are in
    section 7.
18. **The author's additions to Phase 2** — ADR 0049 section 2, Proposed: the
    maintainer confirms or strikes each item. **Answer:** every item
    confirmed; ADR 0049 is Accepted.

19. **Names a link cannot hold** — the core accepts note and folder names with
    `[`, `]`, `|`, `#` or `^`, which no `[[…]]` can name; a rename to such a
    name now leaves the links alone and says so (recorded in
    [ADR 0048](../adr/0048-file-operations-in-ui.md)'s provisional record).
    **Answer:** the window refuses such a name when it creates or renames,
    and says why (`9d13bf2`); the core still accepts it.
20. **Q12 point 2's order** — the spec does not say whether a path is tried
    "from the root" before "relative to the source's folder"; the index and
    the embed resolution try the root first, so `![[img.png]]` written in `a/`
    reaches a root-level `img.png` over `a/img.png`. Recorded under spec Q12.
    **Answer:** the root first, and `./` or `../` relative only, as Obsidian
    reads them; spec Q12 point 2 says so (`9869712`), and tests pin it
    (`fccb229`).
21. **Volumes without hard links** — on exFAT and FAT a create, rename or
    trash falls back to a checked rename and says the guard was weaker;
    whether to allow that or refuse is the maintainer's. Recorded in ADR
    0048's provisional record. **Answer:** allowed, with the warning.
22. **Keys taken from the editor** — inside an editor the app's hotkeys come
    before CodeMirror's defaults, so ⌘D, ⌘⇧L, ⌘⇧G and ⌘⇧\ (and, on Linux,
    Ctrl-Shift-[ and ]) no longer do what CodeMirror binds them to. Recorded
    in `docs/reference/app-decision.md` §9. **Answer:** accepted; every
    hotkey can be bound again in the settings.
23. **Files with mixed line endings** are read-only in the window; whether a
    conversion by user action, with its diff (invariant 8), should exist is
    the maintainer's. Recorded under spec Q24. **Answer:** later; such a file
    stays read-only.

## 7. The resolution

The fixes were written in parallel, each slice in a fresh session given the
findings of its readings: the Rust by Fable 5.1
([ADR 0032](../adr/0032-author-and-reviewer-roles.md)), with the core,
contract and host slice completed by Opus 5.5 when that session reached its
usage limit; the window by Opus 5.5, in two sessions whose work was merged by
hand; the documents by Opus 5.5. The fixes were then read again, each slice in
a fresh session: the Rust and CI slice, and the window's. Neither found a new BLOCKING. The
Rust reading found two IMPORTANT — file operations that failed outright on
volumes without hard links (exFAT), and a new name holding `|`, `#` or `]]`
written into links that the parser then read as another target — and six
MINOR; the window's reading found two IMPORTANT — a move that said "Moved."
over its own refusal, and a task click that could land on a line shifted by
unsaved text — and seven MINOR. Fixed: both pairs of IMPORTANT (`76f7c23`,
`8651fe3`, `ee271c6`), and the MINOR about note spellings the protocol let
through, the CI grep, quitting with a web page open, the missing tests, a
failed pop-out, a reload beside a note window and the ids a note could take
(`894af0b`, `a66267d`, `ee271c6`). Recorded, not fixed: creates that drop
their durability report; links in the frontmatter, which neither the parser
nor a plan sees; inline styles that can paint over the tab's own controls
(containing them would clip wide tables); "return to the main window" asking
twice; the app's hotkeys also taking ⌘⇧L, ⌘⇧G and ⌘⇧\ from the editor; the
macOS menu in English only; a nested task `- - [ ]` refused with a misleading
message. These second readings were Opus 5.5 reading, for the window and the
documents, work Opus 5.5 wrote — by the maintainer's decision (section 6,
item 17).

The documents of the branch were read the same way. That reading found one
BLOCKING — this review's own summary called the open Q12 finding "not a
defect", which takes the code's side — eight IMPORTANT (a Q12 gap described
as wording, HTML files and the network paths described wrongly, a crate named
inside an Accepted decision, items of this section with no home, a phase the
code was said to choose, two spec questions with no provisional line, a
contradiction on file embeds left unrecorded) and twelve MINOR. All were
corrected before the push except one MINOR: the "when to decide" column of
the ADR index still shows the Phase 1 deadlines of ADRs 0044 to 0046.

Found while integrating, beyond the readings:

- `.github/workflows/ci.yml` was not a valid workflow: four jobs named `matrix`
  in a job-level `if`, which GitHub rejects before any job runs. `main` has
  carried it since `98315ce`, hidden while Actions was blocked by billing.
  Fixed in `c5d765e`; actionlint is clean.
- The navigation guard is asked for frames too (wry passes no frame to it), so
  it had to admit the file protocol for the app's views (`8a284f8`).
- ⌘Q on macOS ended the process with no event the app could answer (`4f56e87`).
- The HTML-file viewer turned out to be unreachable, since before this review
  (section 6, item 16).

A smoke run of the real app on a scratch folder, after the merge: the command
line's folder opened; the reading view rendered the cases of reading 3
(callout title, code untouched, tags and highlight in prose only, the comment
hidden); a task inside a callout ticked its own line; an edit made outside
raised the conflict banner and nothing was overwritten; a file that is not
UTF-8 did not open; a rename planned and applied its one rewrite; a delete
asked in the page and went to `.trash/`; closing and quitting with unsaved text
saved it first; a restart reopened the folder by its key, with its tabs.

The resolution commits, in order: `5f07500` (host); `597cdd8` to `37d22a0`
(CLI, MCP, bench, CI); `c5d765e` (the CI matrix); `f0f94ac`, `183cd56`,
`fd6bcfa` (dialect, index); `8a284f8` (core, contract, host); `c6b89db` (MCP
`not_text`); `32dd5a8` to `63f1480` (window: editor, keys, language,
accessibility); `0381341` to `909a190` (window: writes and security);
`873d739` and `c55ba09` (window and contract); `4f56e87` (quit); after the
second readings, `76f7c23`, `8651fe3`, `894af0b`, `a66267d` and `ee271c6`.

### The maintainer's answers of 2026-09-23

Asked for a suggestion on each item of section 6, the author gave one, in the
four groups named there; the maintainer answered *"a e b ok, faça 8, 17 troque
para Opus, o que for importante ja puxa de D"*, and section 6 carries the
answer under each item. What it changed, in order: `850928a` (the sidecar's
mode), `c64b6b8` (an HTML file as its page), `9d13bf2` (names no link can
reach), `fa8ba6b` (remote content), `18b696e` and `e51e977` (the npm package
dropped, the license gate), `27e50c0` (one Tauri build per pull request),
`0381644` (a folder handed to the running app), `86238dd` (the fixture),
`65d2d4d` (the ADRs, ADR 0050 new), `fccb229` and `9869712` (Q12 point 2's
order pinned by tests, spec v0.16), then this record.

One answer rested on a premise that did not hold. Item 4 was put as "the
reading view follows Obsidian", and it does not for callouts nested inside
callouts, which Obsidian shows and the reading view keeps as blockquotes; that
part of spec Q5 is recorded as still open rather than taken as decided.

All of this — the window's code, the Rust and the documents — was written by
Opus 5.5, standing in for Fable 5.1 by the maintainer's decision, and read by
a fresh Opus 5.5 session with the diff and the repository, as the answer to
item 17 asks. That reading found two BLOCKING: the committed TypeScript
bindings no longer matched the generated ones after a doc comment changed
(`724482b`), and a note could still make the window fetch an image with remote
content off, through a tab or a control character in the address, since the
sanitizer checked the raw text while the URL parser drops them (`6fe8350`,
seen failing and then passing in a WebKit harness with a logging server). It
found three IMPORTANT: the reading view did not fold callouts, so "follows
Obsidian" did not hold for fold (now it folds, `7679916`), nor for the
`<iframe>`, `<video>` and `<audio>` Obsidian shows and the window drops
(recorded open under Q6); `verso open` retried a refused folder with
`--args`, which a running app ignores, and reported a typo as "opening"
(`ecfdfd9`: the CLI now says the folder is not there); and this section said
the reading had happened before it had. And eleven MINOR — its headline said
four IMPORTANT, one entry being a note. Fixed from the MINOR: the setting's
reach (Live Preview's embeds, folder views, note windows, and no error with no
folder open), a double click on "Page" that could add a tab, pasted images
named with a character no link can reach (`f232b78`), the handed-folder test
now run on every platform (`14c007d`), comments still saying `[OPEN]`
(`761a44f`), and the documents' over-claims — ADR 0048's names (typed ones
only) and a reason it gave the maintainer, ADR 0028's contract crate, ADR
0035's second phrase table, ADR 0050's update check (a consequence now, not a
decided item), ADR 0014's acceptance moved into its Decision without waiving
the ADR each primitive asks, the ADR index's introduction. Two notes stand as
recorded: the npm license gate, recommended as a PR of its own, rides in this
one; and CI's jobs were renamed and one removed — this plan gives the private
repository no branch protection, so no required check names them.
