# Decision memo: the watcher (changes made outside the app)

- Date: 2026-09-24
- Status: **decided by the maintainer on 2026-09-24**, in session. The
  author's recommendations of the day, this memo's section 6 among them, were
  put to the maintainer as one list; the answer: *"Tirando o plano de fazer
  vários PR, eu gosto das suas recomendações"* ("apart from the plan of
  several pull requests, I like your recommendations"). Every line of section
  6 as recommended:
  1. **`notify`** (section 3.1);
  2. **a whole-folder index per batch, for now** (3.2);
  3. **300 ms of quiet, 2 s at most**, kept (3.3);
  4. **the disk's text brought in as one edit, a tab with unsaved text saved
     at once to meet the conflict banner, a gone note's tab kept and
     marked**, kept (3.4 to 3.6);
  5. **files that are not notes not refreshed**, accepted for now (3.7).

  Until then nothing here was a decision, and the code on branch
  `feat/watcher` and the fixes above it were written under the
  recommendations, marked provisional — the arrangement used for features 2
  to 6; they are no longer provisional. Recorded in
  [ADR 0044](../adr/0044-verso-fs-semantics.md). Sections 1 to 5 are the
  comparison as it stood when the decision was made; section 7 records the
  readings.
- Asked for: agreed in session on 2026-09-23 — the watcher comes next,
  before the month of real use that closes Phase 2 ([roadmap](../roadmap.md),
  Phase 2, exit criterion); no repository document records that answer
  besides this line. [ADR 0044](../adr/0044-verso-fs-semantics.md) placed the
  watcher after feature 2 with no date; [ADR 0028](../adr/0028-crate-structure.md)
  puts it in `verso-fs`.
- Written by Opus 5.5, standing in for Fable 5.1 as the Rust author by the
  maintainer's decision of 2026-09-23 (usage limit), overnight while the
  maintainer slept; read by two fresh Opus 5.5 sessions under the same
  decision (section 7).

## 1. What was missing

Before this branch, a change made outside the app — the same folder open in
Obsidian ([ADR 0012](../adr/0012-files-are-source-of-truth.md) names that as
the decided use case), a sync client, `git pull` — reached Verso only when
the note was saved (as a refused write, invariant 11), reopened, or on
"Reindex" ([app memo](app-decision.md), section 10). Nothing refreshed the
tree, the search, the backlinks or an open note by itself. During a month of
use with Obsidian open beside Verso, that means a stale tab until the next
save meets the difference.

## 2. What the code does now

| Layer | What it does |
|---|---|
| `verso-fs` | `Root::watch(quiet, excluded, on_change)`: one `notify` watcher on the root, recursive (FSEvents on macOS, inotify on Linux). A thread of its own batches the events: a batch goes out once the folder has been quiet for `quiet`, or after 2 s of changes that do not stop. Only what the walk lists is reported — no hidden entry (`.obsidian/`, the atomic write's `.verso-tmp-*`), no ignored path — and only events that change something: an open or a read is not a change. Events under the `excluded` directories are dropped. An error of the OS watcher comes back as its kind, never with the paths `notify` names in its message. Dropping the `Watch` stops it without waiting for its thread. |
| `verso-core` | `Workspace::watch` with a quiet interval of 300 ms (`WATCH_QUIET`), the index's own directory excluded (for a configuration directory inside the folder). `IndexReport` names the notes it counted: `changed` (new or different on disk), `gone` (removed), and `listing_changed` (entries added, removed or of another kind — not sizes or times). |
| Host | Each open folder has a watch, started before the first index run and held by the session. A batch runs `index()` on the watch's thread, under the session's lock, and then sends `folder-changed` once — every window listens to it: the folder's key, what this run found changed and removed by relative path, whether the listing changed, the index summary. A batch that comes before the session exists runs once the session is in place. A folder the system will not watch opens anyway, and the reason goes with every summary of the session. |
| Window | Every open note is checked against the disk on every `folder-changed`, after the window's own file operations and after Reindex — whichever index run found the change. The same revision: nothing. Changed, nothing typed: the disk's text comes in as one edit over what differs, so the cursor, the selection and the scroll follow the text, the undo history stays (⌘Z brings the tab's text back — except where the line separator changed or the tab shows the file read-only: there the editor starts again, with a new history), and the caret never stays inside the folded frontmatter. Changed, with text not saved yet: saved at once, which meets the difference and shows the conflict banner (invariant 11) — nothing is written over the other app's change. Gone: the tab keeps its text; in the main window its name is crossed out and says so to a screen reader, and a line above the text says so in every window. An edit under way in the properties panel is waited for. The tree and folder views are drawn again only when the listing changed, and not while a name is being typed in the tree. The status line names the notes it speaks of, and shows the index's problems. |
| Contract | `FolderChanged`, the event's payload, generated into the bindings with the commands (rule 3). |

Verso's own writes are not reported as changes made outside: a save updates
the index with the stamp of what it wrote, so the next `index()` finds that
note unchanged, and the window's check finds the revision it already holds.

## 3. The decisions

### 3.1 How the folder is watched

| | (a) `notify` 8.2 | (b) Walk on a timer | (c) Each OS's API directly |
|---|---|---|---|
| Dependency | `notify` (CC0-1.0) with `notify-types`, `walkdir`, `same-file` and `log`; on macOS `fsevent-sys`; on Linux `inotify`, `inotify-sys` and `mio`; and, in `Cargo.lock`, `kqueue` and `kqueue-sys` (MIT), which `notify` uses on the BSDs and iOS and offers on macOS as a backend not enabled here — all pass `deny.toml`, which checks every target | none | `fsevent-sys` or FFI, per platform |
| Latency | tens of milliseconds plus the quiet interval | the timer's period | as (a) |
| Cost at rest | none | one walk per period, changed or not | none |
| Windows and Linux | the same API ([ADR 0022](../adr/0022-target-platforms-macos-first.md): both ship) | the same code | one more backend each |

**Recommendation: (a).** It is what the code uses. (b) stays the recorded
fallback for when the OS refuses to watch (section 3.8).

### 3.2 What a batch does to the index

| | (a) Index the whole folder | (b) Refresh only the batch's paths |
|---|---|---|
| Correctness | the one path that knows placeholders, walk problems and removals; catches changes the watcher missed | new code beside `index()`: a single path's placeholder, a directory created or moved, a rename |
| Cost per batch | the benchmark's "index, nothing changed": 42 ms at 1,000 notes, 1.4 s at 10,000, 10 s at 50,000 (it reads every note: the stamp holds the content's hash). The run holds the session's lock, so every window's command waits for it: the window freezes for that long | proportional to the batch |
| The maintainer's folders | 61 notes (the campaign) and 1,387: well under 100 ms | — |

**Recommendation: (a) now**, and (b) as the step for folders beyond a few
thousand notes, measured with the benchmark when one is in use. Skipping the
read of notes whose time and size did not change would make (a) cheap, but it
would drop the content hash from change detection, which
[ADR 0012](../adr/0012-files-are-source-of-truth.md) — its provisional
paragraph on what the write check compares — and the feature 2 memo keep on
purpose (a rewrite that keeps time and size, as `cp -p` or a sync client can);
this memo does not propose it.

### 3.3 The quiet interval

300 ms of quiet, at most 2 s from the first change of a batch. Long enough
that a save made of several writes, or a checkout, is one batch; short enough
that a change made in the other editor shows up while the user is still
looking. Provisional; the numbers are the code's, not measured against users.

### 3.4 An open note changed outside, nothing typed in it

| | (a) Bring the disk's text in, as one edit | (b) Mark it, read on demand |
|---|---|---|
| The user sees | the new text, the cursor where it was in the text | the old text and a notice |
| What the tab had | one ⌘Z away: if a sync client writes an older version back, or the other editor saves over the note from its own buffer, the tab's text is not lost until the tab is closed — except where the line separator changed or the tab shows the file read-only, where the editor starts again with a new history | kept on screen until the user acts |
| Risk | the other app's text wins on screen until the user notices (the status line says the note was read again) | a stale view until the user acts |

**Recommendation: (a).** Obsidian's own behaviour for a note open in it and
changed outside was not observed for this memo.

**⌘Z after the disk's text came in is an edit of the user's** (the second
readings, section 7). Undo puts the tab's older text back as an ordinary
change, so the autosave writes it 1.5 s later, the default — over the other
app's version, and the write check lets it through, since the tab holds the
revision it read last. That is the user's act, and it is recorded as such:
nothing refuses it, and the status line, which said the note was read again
and pointed at ⌘Z, no longer invites it (`08053cb`). Where the line
separator changed, or the tab shows the file read-only, the disk's text does
not come in as an edit: the editor starts again, with a new history
(`fromDisk` in `app/ui/src/main.ts`), and ⌘Z has nothing of the tab's to bring
back.

### 3.5 An open note changed outside, with text not saved yet

| | (a) Save now | (b) Mark it and wait for the autosave |
|---|---|---|
| What happens | the write is refused (the file is not the one that was read) and the conflict banner shows both versions, with reload and write-mine — the flow invariant 11 already has | the same, a moment later, when the autosave runs |

**Recommendation: (a)**: the conflict comes up while the difference is small,
and the status line names the note, so a tab in the background is not missed.
Nothing is written either way.

### 3.6 An open note deleted or moved outside

| | (a) Keep the tab, marked, with a line | (b) Close the tab when nothing is unsaved | (c) Follow a move |
|---|---|---|---|
| The text | stays until the user closes the tab | gone from the screen (it is on disk elsewhere, or in the bin) | follows the note |
| Cost | none | none | pairing a removal and a creation by content: guesswork on renames with edits |

**Recommendation: (a)**, the one that loses nothing and guesses nothing. A
move made outside shows the new note in the tree; the user opens it. A save
from such a tab fails ("not found"): nothing recreates the note by itself.

### 3.7 Files that are not notes, open in a tab

Text files (a `.css`, a `.json`), images and PDFs open in a tab are not read
again when they change outside: the window checks notes. **Recommendation:**
leave it for now and record it; a text file's editor has the same conflict
banner on save.

### 3.8 A folder the system will not watch

On Linux a large folder can exhaust the inotify limit, and `notify`'s
recursive start stops at the first directory it cannot read — hidden ones
included (`.git/objects`, `.obsidian/plugins`), which the walk never enters —
so one unreadable directory switches watching off for the whole folder.
ADR 0044 recorded the behaviour for then: degrade to a periodic scan with a
warning, never fail silently. **What the code does now:** the folder opens,
the reason (its kind, no path) goes with every index summary and shows on the
status line, and changes made outside show up on "Reindex". The periodic scan
is built when Linux becomes a target, as ADR 0044 says; Linux is not one yet.

### 3.9 What the watcher does not see

- On macOS, the inside of a directory reached through a symlink that points
  outside the folder: the walk follows it (ADR 0044), FSEvents does not watch
  through it. On Linux `notify` follows it, and watches everything beneath.
  "Reindex" covers the first.
- Changes made by another machine on a network volume: FSEvents does not
  report them, and nothing fails, so nothing is said.
- Changes made before the watch starts: it starts before the first index
  run, so only a change in the moment between opening the folder and starting
  the watch is missed until the next batch or "Reindex".
- `verso mcp` is unchanged: it indexes at start, offers `index`, and marks a
  note `stale` when the file's stamp differs
  ([mcp memo](mcp-decision.md)). The watcher is the window's.

## 4. How it was verified

- `verso-fs`, on the real operating system's events, macOS and Linux (Docker):
  a note created, written, moved and removed is reported by its relative path;
  `.obsidian/`, an ignored path, a temporary file and an excluded directory
  are not; reading every note under a watch reports nothing — on Linux, with
  the read filter removed, the same test reports every note read, the loop
  the filter prevents; a dropped watch reports nothing more; an error built
  with a path comes back without it.
- `verso-core`: `changed`, `gone` and `listing_changed` in the end-to-end
  index test; a save of Verso's is not a listing change; a note made outside
  reaches the index through the watch.
- Host: a note written from outside while the folder is open reaches the
  windows as `folder-changed`, and Verso's own write at the same time is not
  named (with the write's index update removed, that assertion fails); one
  batch reaches three windows once (three times with the loop the reading
  found); a batch for a folder that is not the open one tells nobody.
- Window: the edit that brings the disk's text in was run against
  CodeMirror's own state and history in a throwaway harness — the reading's
  frontmatter scenario keeps the caret after the frontmatter, undo restores,
  surrogate pairs are never split. The window itself was not run.
- The test suite no longer writes into the user's configuration directory
  (branch `fix/beta-follow-ups`, under this one).

## 5. What this memo did not verify

- The window was not run: the maintainer was asleep and the screen is theirs.
  The tab behaviours of sections 3.4 to 3.6 wait for a smoke run on a scratch
  copy.
- Real iCloud Drive evictions and downloads under a watch.
- Windows, not a target when this was written (it became one on
  2026-09-23), and the host crate on Linux (it needs WebKitGTK; the watcher
  crates were run there). Since 2026-10-08 the watcher's tests run on
  Windows, and a directory's own "modified" event, which reading the notes
  in it raises there, is dropped ([ADR 0069](../adr/0069-windows-port.md)).
- The cost of section 3.2 on a folder of tens of thousands of notes with
  changes arriving continuously.

## 6. For the maintainer

1. Section 3.1: `notify` — yes or no.
2. Section 3.2: whole-folder index per batch for now — yes or no.
3. Section 3.3: 300 ms / 2 s — keep or change.
4. Sections 3.4 to 3.6: bring in as one edit / save now / keep and mark —
   keep or change.
5. Section 3.7: non-note files not refreshed — accept for now or not.

Answered on 2026-09-24: all five as recommended (the header).

## 7. The readings

Two fresh Opus 5.5 sessions read the branch — one the Rust, one the window
and the documents — by the maintainer's decision of 2026-09-23 on item 17 of
the Phase 2 review. Every finding was resolved in the commits above the
branch unless marked otherwise:

- Rust, BLOCKING: an OS watcher error reached the window with absolute paths
  (rule 4) — `8c13d92`.
- Rust, IMPORTANT: each batch delivered once per window to every window —
  `7f4ea53`; a change another index run found first was never told —
  `7f4ea53` and `be3be5b`; the configuration directory inside the folder woke
  the watch for ever — `8c13d92`, `cdae041`; on Linux one unreadable
  directory switches watching off and the warning was then lost — the
  warning kept (`7f4ea53`), the rest recorded in section 3.8.
- Rust, MINOR: the symlink doc on Linux, a placeholder-named directory not
  watched — `8c13d92`; the watch started after the index — `7f4ea53`; the
  test helper's clean-up claim, the contract's comment — `7f4ea53`; a test for
  `1695ec6` — `cdae041`; `gh auth status` too wide — `739cccc`; the
  dependency list and the UI freeze on large folders — this memo.
- Window, BLOCKING: the caret restored inside the folded frontmatter, where
  one Backspace deleted the hidden properties — `be3be5b`.
- Window, IMPORTANT: stolen changes (as above), silent problems, the property
  edit lost, the tree rebuilt under an inline rename, the crossed-out tab's
  contrast — `be3be5b`; the gone state by styling alone — `432c4da`; the
  "none" risk of section 3.4 — this memo.
- Window, MINOR: read races, the cursor by offset, the gone state cleared only
  by a read, less refreshed than claimed, racy status, note windows —
  `be3be5b` and this memo; the contract's comment — `7f4ea53`; the nested
  callouts' stale sentences — the spec and the app memo; this memo's
  precision — here.

The second readings, fresh Opus 5.5 sessions again, of the fixes above and of
this memo. Their code findings are resolved in the commits that follow this
branch; their findings on this
memo are resolved here:

- Window, BLOCKING: ⌘Z then ⌘⇧Z — or ⌘U alone — after a read from disk put
  the caret back inside the folded frontmatter, where one Backspace deleted
  the fence and a property; now every transaction in Live Preview keeps every
  cursor out of it — `41b6eb0`.
- Window, IMPORTANT: the focus restored by its rank after a redraw landed on
  another control once embeds came in above it (now found by identity); every
  reading view was drawn again on every batch (now only a note that embeds a
  changed one); the guard against redrawing under a rename covered the tree
  only (now the search results and the folder views too) — `08053cb`.
- Window, IMPORTANT: ⌘Z after a read from disk is an ordinary edit, saved over
  the other app's version — recorded in section 3.4; the status line no longer
  invites it — `08053cb`.
- MINOR: the disk's edit isolated in the history, so ⌘Z after typing undoes
  the typing only; the status line's names; the deferred list refresh; the
  properties panel's deferred check; Enter in the reading view — `08053cb`.
  The host's reindex under one hold of the lock, and the watcher's messages
  said in pt-BR or English by the window instead of the host's English
  sentence — `c0eb630`. `gh auth status --active` — `b3b8b70`.
- This memo, MINOR: section 3.2 cited ADR 0029 for keeping the content hash,
  where the `cp -p` reasoning is ADR 0012's provisional paragraph on the write
  check; section 3.1's dependency list left out `kqueue` and `kqueue-sys`;
  section 2 and section 3.4 said undo always brings the tab's text back —
  here.

Then the window was driven on a scratch copy of the Sandbox folder, as the
maintainer allowed on 2026-09-24. What the run found:

- Backspace at the very start of the body, where Live Preview puts the
  caret right after the folded frontmatter, deleted the line break after
  the closing fence: the first line joined it, the block was no longer a
  frontmatter and every property went with it, unseen — older than the
  watcher. No key changes the folded frontmatter now; the properties panel
  does — `d130d0f`.
- A callout the user had opened folded again whenever the note was read
  again; and a note deleted outside and put back left the status line
  saying it was gone — `37dfda4`.

Everything else the run tried went as section 2 says: a change read into a
clean tab, the conflict banner for a tab with unsaved text with nothing
written, a note made outside in the tree, the open note deleted outside
marked with its text kept, and the second reading's frontmatter scenario —
a change outside, ⌘Z, ⌘⇧Z, Backspace — leaving the properties whole on disk.
