# Decision memo: the watcher (changes made outside the app)

- Date: 2026-09-24
- Status: **not decided.** Nothing in this memo is a decision: it lays out
  options, records facts and carries recommendations labelled as such. The
  maintainer decides (`CLAUDE.md` §1). The code on branch `feat/watcher` is
  written **under the recommendations, marked provisional**, and changes if
  the maintainer decides otherwise — the arrangement used for features 2 to 6.
- Asked for: on 2026-09-23 the maintainer agreed that the watcher comes next,
  before the month of real use that closes Phase 2 ([roadmap](../roadmap.md),
  Phase 2, exit criterion). [ADR 0044](../adr/0044-verso-fs-semantics.md)
  placed it after feature 2 with no date; [ADR 0028](../adr/0028-crate-structure.md)
  puts it in `verso-fs`.
- Written by Opus 5.5, standing in for Fable 5.1 as the Rust author by the
  maintainer's decision of 2026-09-23 (usage limit), overnight while the
  maintainer slept; the reading is recorded in section 7.

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
| `verso-fs` | `Root::watch(quiet, on_change)`: one `notify` watcher on the root, recursive (FSEvents on macOS, inotify on Linux). A thread of its own batches the events: a batch goes out once the folder has been quiet for `quiet`, or after 2 s of changes that do not stop. Only what the walk lists is reported — no hidden entry (`.obsidian/`, the atomic write's `.verso-tmp-*`), no ignored path — and only events that change something: an open or a read is not a change. Dropping the `Watch` stops it without waiting for its thread. |
| `verso-core` | `Workspace::watch` with a quiet interval of 300 ms (`WATCH_QUIET`). `IndexReport` now names the notes it counted: `changed` (new or different on disk), `gone` (removed), and `listing_changed` (entries added, removed or of another kind — not sizes or times). |
| Host | Each open folder has a watch, held by the session and dropped with it. A batch runs `index()` on the watch's thread, under the session's lock, and when something changed sends the main window and the note windows a `folder-changed` event: the folder's key, the changed and removed notes by relative path, the index summary. A folder the system will not watch opens anyway, with the reason among the index's problems. |
| Window | Lists and panels are drawn again. A tab of a changed note with nothing typed in it is read again, keeping the cursor and the scroll; with text not saved yet, it saves at once, which meets the difference and shows the conflict banner (invariant 11) — nothing is written over the other app's change. A tab whose note is gone keeps its text, crossed out in the tab bar, with a line saying so. Other open notes look their links and backlinks up again. The status line says how many notes changed outside. |
| Contract | `FolderChanged`, the event's payload, generated into the bindings with the commands (rule 3). |

Verso's own writes are not reported as changes made outside: a save updates
the index with the stamp of what it wrote, so the next `index()` finds that
note unchanged. A test removes that update and sees the assertion fail.

## 3. The decisions

### 3.1 How the folder is watched

| | (a) `notify` 8.2 | (b) Walk on a timer | (c) Each OS's API directly |
|---|---|---|---|
| Dependency | `notify` (CC0-1.0) and, on macOS, `fsevent-sys`, `notify-types`, `walkdir`, `log`; on Linux `inotify` | none | `fsevent-sys` or FFI, per platform |
| Latency | tens of milliseconds plus the quiet interval | the timer's period | as (a) |
| Cost at rest | none | one walk per period, changed or not | none |
| Windows and Linux | the same API ([ADR 0022](../adr/0022-target-platforms-macos-first.md): both ship) | the same code | one more backend each |

**Recommendation: (a).** It is what the code uses. (b) stays the recorded
fallback for when the OS refuses to watch (section 3.8).

### 3.2 What a batch does to the index

| | (a) Index the whole folder | (b) Refresh only the batch's paths |
|---|---|---|
| Correctness | the one path that knows placeholders, walk problems and removals; catches changes the watcher missed | new code beside `index()`: a single path's placeholder, a directory created or moved, a rename |
| Cost per batch | the benchmark's "index, nothing changed": 42 ms at 1,000 notes, 1.4 s at 10,000, 10 s at 50,000 (it reads every note: the stamp holds the content's hash) | proportional to the batch |
| The maintainer's folders | 61 notes (the campaign) and 1,387: well under 100 ms | — |

**Recommendation: (a) now**, and (b) as the step for folders beyond a few
thousand notes, measured with the benchmark when one is in use. Skipping the
read of notes whose time and size did not change would make (a) cheap, but it
would drop the content hash from change detection, which
[ADR 0029](../adr/0029-guardrails-in-ci.md) and the feature 2 memo keep on
purpose (a rewrite that keeps time and size, as `cp -p` or a sync client can);
this memo does not propose it.

### 3.3 The quiet interval

300 ms of quiet, at most 2 s from the first change of a batch. Long enough
that a save made of several writes, or a checkout, is one batch; short enough
that a change made in the other editor shows up while the user is still
looking. Provisional; the numbers are the code's, not measured against users.

### 3.4 An open note changed outside, nothing typed in it

| | (a) Read it again, keep cursor and scroll | (b) Mark it, read on demand |
|---|---|---|
| The user sees | the new text | the old text and a notice |
| Risk | none to the user's text: it is only read again when the tab has no unsaved text, and not if text is typed while the read is on its way | a stale view until the user acts |

**Recommendation: (a).** Obsidian's own behaviour for a note open in it and
changed outside was not observed for this memo.

### 3.5 An open note changed outside, with text not saved yet

| | (a) Save now | (b) Mark it and wait for the autosave |
|---|---|---|
| What happens | the write is refused (the file is not the one that was read) and the conflict banner shows both versions, with reload and write-mine — the flow invariant 11 already has | the same, a moment later, when the autosave runs |

**Recommendation: (a)**: the user learns at once that the note changed
elsewhere, while the difference is small. Nothing is written either way.

### 3.6 An open note deleted or moved outside

| | (a) Keep the tab, crossed out, with a line | (b) Close the tab when nothing is unsaved | (c) Follow a move |
|---|---|---|---|
| The text | stays until the user closes the tab | gone from the screen (it is on disk elsewhere, or in the bin) | follows the note |
| Cost | none | none | pairing a removal and a creation by content: guesswork on renames with edits |

**Recommendation: (a)**, the one that loses nothing and guesses nothing. A
move made outside shows the new note in the tree; the user opens it.

### 3.7 Files that are not notes, open in a tab

Text files (a `.css`, a `.json`), images and PDFs open in a tab are not read
again when they change outside: `IndexReport` names notes only, and the
listing reports entries, not contents. **Recommendation:** leave it for now
and record it; a text file's editor has the same conflict banner on save.

### 3.8 A folder the system will not watch

On Linux a large folder can exhaust the inotify limit; ADR 0044 recorded the
behaviour for then: degrade to a periodic scan with a warning, never fail
silently. **What the code does now:** the folder opens, the reason is among
the index's problems, and changes made outside show up on "Reindex". The
periodic scan is built when Linux becomes a target, as ADR 0044 says.

### 3.9 What the watcher does not see

- The inside of a directory reached through a symlink that points outside the
  folder: the walk follows it (ADR 0044), the operating system does not watch
  through it. "Reindex" covers it.
- Changes while no watch runs (between the index and the watch's start,
  a few milliseconds): the next batch indexes the whole folder and finds them.
- `verso mcp` is unchanged: it indexes at start, offers `index`, and marks a
  note `stale` when the file's stamp differs
  ([mcp memo](mcp-decision.md)). The watcher is the window's.

## 4. How it was verified

- `verso-fs`, on the real operating system's events: a note created, written,
  moved and removed is reported by its relative path; `.obsidian/`, an ignored
  path and a temporary file are not; reading every note under a watch reports
  nothing (on Linux every open is an event: without the filter a caller that
  indexes on each batch would never stop); a dropped watch reports nothing
  more. Unit tests for the path filter (including the `/private` form of a
  temporary folder on macOS and the iCloud placeholder name), the event
  filter and the batch timing.
- `verso-core`: `changed`, `gone` and `listing_changed` in the end-to-end
  index test; a note made outside reaches the index through the watch.
- Host: a note written from outside while the folder is open reaches the
  windows as `folder-changed`, and Verso's own write at the same time is not
  reported; with the write's index update removed, that assertion fails.
- The test suite no longer writes into the user's configuration directory
  (branch `fix/beta-follow-ups`, under this one).

## 5. What this memo did not verify

- The window was not run: the maintainer was asleep and the screen is theirs.
  The UI half is checked by type-check and build only; the tab behaviours of
  sections 3.4 to 3.6 wait for a smoke run on a scratch copy.
- Real iCloud Drive evictions and downloads under a watch.
- Windows (not a target yet).
- The cost of section 3.2 on a folder of tens of thousands of notes with
  changes arriving continuously.

## 6. For the maintainer

1. Section 3.1: `notify` — yes or no.
2. Section 3.2: whole-folder index per batch for now — yes or no.
3. Section 3.3: 300 ms / 2 s — keep or change.
4. Sections 3.4 to 3.6: read again / save now / keep crossed out — keep or change.
5. Section 3.7: non-note files not refreshed — accept for now or not.

## 7. The reading

Pending: a fresh Opus 5.5 session reads the branch (the maintainer's decision
of 2026-09-23 on item 17 of the Phase 2 review), and its findings are
recorded here.
