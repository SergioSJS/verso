# ADR 0122 — Merge by block of offline edits: a note edited apart on two devices is joined, not copied

- Date: 2026-11-15
- Source: `docs/roadmap.md` row V.50 (moved into V1 by the maintainer on
  2026-11-01, *"14. B - Mas vamos fazer depois, quero terminal e música
  redondinho primeiro"*, recorded in [0082](0082-live-co-editing-of-a-synced-folder.md)
  Status) and After V1 item 8's history; [0082](0082-live-co-editing-of-a-synced-folder.md)
  Consequences (*"Later, its own ADR"*); [0073](0073-self-hosted-server-first.md)
  item 10; [0079](0079-sync-a-local-folder-with-a-server.md) item 8, the
  append-merge, its first step (and cd66150e of 2026-11-15: two joined tails,
  the second on a line of its own). Written by Opus 5.5; to be read by the
  other model before it is accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0012](0012-files-are-source-of-truth.md) (invariants 8 and 11),
  [0091](0091-version-history.md) (the server's and the computer's history),
  [0092](0092-the-phone-offline.md) item 1 (the browser runs sync's own rules),
  [0093](0093-periodic-notes.md) item 12 (the template merge),
  [0104](0104-external-cloud-storage-transports-and-quotas.md) (cloud remotes),
  [0057](0057-board-json-canvas.md) (the board's file), [0053](0053-views-bases.md),
  [0061](0061-blocks-in-edit-mode.md) D5 and spec Q21 (what a block is),
  [0087](0087-secret-blocks-hidden-from-readers.md) and [0113](0113-one-access-model-for-a-table.md)
  (projections), [0009](0009-external-constraints.md).
- Status in the briefing: not present; on acceptance.

## Context

**What happens today.** A file changed on both sides since the base is a
conflict: the server's version keeps the name, this device's goes beside it
as `<name> (conflict, <device>, <date>)` (0079 item 8). One exception: a note
whose two changes are pure appends to its end is joined — the server's tail,
then this device's on a line of its own (`crates/verso-core/src/sync/append.rs`,
called from `app/src-tauri/src/sync/transfer.rs` on `Action::Conflict`, and
mirrored in `app/ui/src/web/offline/engine.ts`, held to the same answers by
`sync-vectors.json`). The soak of 2026-10-11 made 42 copies of one note; the
append-merge cut that only for appends. Two people who each fix a different
paragraph of one note offline still end with a copy to merge by hand.

**Why it waited.** Sync keeps per path only the base's **hash** (`State.base`,
`crates/verso-core/src/sync.rs`). The append-merge works without the base's
bytes because the base is a prefix of both sides and its length is found by
hashing. Any other merge needs the base itself.

**Can the server's history give the base?** It keeps bytes by hash
(`blobs (folder, hash)` in `crates/verso-index/src/history.rs`), so a command
"the bytes of this hash" is cheap. But it does not hold every base:

- a room's saves **coalesce** into one version per ten minutes, and folding a
  save into the version **drops the replaced blob** (`record` → `drop_unused`):
  a device that received a mid-window save holds a base the server no longer has;
- **thinning** keeps one version an hour after a day, one a day after 30 days
  (0091 item 3): a device offline a week finds its base thinned away;
- a player of a table syncs **projections** (0087, 0113): the bytes it agreed on
  are the projection's, which the history never stores — and asking the server
  for another version is exactly what a projection must not answer;
- a **cloud remote** (0104) has no history at all; the history may be off or in
  memory when its store failed to open (`Book::open`).

The computer's own history (0091 item 8) has the same coalescing.

**How others do it** (public sources only, 0009):

| Tool | On a file changed on two devices |
|---|---|
| Obsidian Sync | Markdown merged with Google's diff-match-patch; "for all other files, including canvases, … last modified wins"; settings JSON merged key by key, local over remote. Since 1.9.7 a per-device choice: *Automatically merge* (default; the help warns of duplicated text) or *Create conflict file* ([help: Troubleshoot Obsidian Sync](https://obsidian.md/help/sync/troubleshoot)) |
| git | Three-way merge by lines (`git merge-file current base other`); changes "in a common segment of lines" are a conflict, bracketed with `<<<<<<<`/`>>>>>>>` markers, or resolved `--ours`/`--theirs`/`--union` ([git-merge-file](https://git-scm.com/docs/git-merge-file)) |
| Syncthing | No merge: the older modification keeps the name `<file>.sync-conflict-<date>-<time>-<device>.<ext>` beside it ([Syncthing: syncing](https://docs.syncthing.net/users/syncing.html)) — what Verso does today, minus the append-merge |
| Notion | Live CRDT text per block; offline edits merged on return, with the caveat that a merge keeps everything but may not be anyone's intent ([Notion engineering blog](https://www.notion.com/blog/how-notion-handles-concurrent-editing-with-crdts)) |
| Logseq | No official page found; community threads report overwrites in Logseq Sync and conflict files from third-party sync left to merge by hand ([forum](https://discuss.logseq.com/t/logseq-sync-content-got-overwritten-when-edit-without-fully-synced/15041)) — weak source, recorded as such |

The lesson taken: a merge by character (Obsidian) duplicates text; a merge by
line (git) needs markers no Markdown reader understands; none of the five keeps
the merge undoable as one step.

## Decision

Proposed (2026-11-15). Nothing here is decided: each real choice is a
question `[OPEN]` with a recommendation, for the maintainer.

1. **Scope.** Offline edits of one file on two sides (desktop, Android, iOS —
   one host, `app/src-tauri` — and the browser's offline copy), met by sync's
   conflict path. Live rooms (0082) already merge live and are untouched. A
   file that does not merge stays a conflict copy exactly as today: the merge
   only ever replaces a copy, never a one-sided change.
2. **Q1 `[OPEN]` — automatic, or offered?** (a) the device merges by itself,
   writes, sends, and says "merged" with a way to see and undo it (item 9) — as
   the append-merge does today; (b) the copy is made as today, and the conflict
   in the window offers "Merge by block" with the result's diff before writing.
   *Recommended: (a).* Invariant 8 ("conversion only by user action, with a
   visible diff") is about changing a file's form — another dialect's syntax,
   normalized frontmatter. A merge converts nothing: every byte of the result is
   a byte of the base, of this device's version or of the server's, in their
   order, plus at most one newline between two joined insertions (as cd66150e);
   no edit of either person is dropped. It is sync carrying the other side's
   change, which already writes without asking (0079 item 7). The diff is shown
   after, not before, with an undo — the precedent the maintainer accepted for
   the append-merge on 2026-10-11. Invariant 11 holds as in `appended`: this
   device's file is read and its hash matched to the pass's before the merge, a
   change since refuses and the next pass starts over; the result is written
   here atomically (invariant 9) and sent over the server's revision just
   downloaded, a refusal there being a new pass.
3. **Q2 `[OPEN]` — where the base's bytes are kept.** (a) **on the device**: a
   base store beside the sync state, outside the folder (0011) — per synced
   folder one SQLite file in the configuration directory through `verso-index`
   (the declared exception for index databases; invariant 5), path → hash and
   the bytes deflated, written each time `State.base` takes a hash for a
   mergeable file (after an upload: the bytes sent; after a download: the bytes
   received; at a first sync's agreement), dropped with the base; in the browser
   an IndexedDB store `bases` (`DB_VERSION` 2); (b) **fetched from the server's
   history** by hash when a conflict needs it (a new sync command, sync protocol
   3); (c) both, (b) when (a) has none. *Recommended: (a).* (b) fails in each
   case of Context (coalesced, thinned, projections, clouds), needs a wire change
   and a network round-trip at the worst moment; (a) works offline, for clouds
   and for projections, with no protocol change. A stored base is used only when
   its bytes hash to `State.base`; a missing or wrong one falls back to the
   append-merge, then to the copy — so a device upgraded with no stored bases
   merges by block from each file's next agreement on. The template a periodic
   note was made from (0093 item 12, `State.made`) is kept in the same store,
   so two periodic notes made apart merge by block too.
4. **Q3 `[OPEN]` — what a block is, for merging.** (a) the dialect parser's
   blocks (`crates/verso-dialect`, pulldown-cmark spans), and in the browser a
   second parser that must agree; (b) **a small line splitter written for the
   merge**, the same in Rust and TypeScript, held by shared vectors: the
   frontmatter (item 6); a fenced code block, `$$` math or `%%` comment from its
   opening line to its closing one; a heading line; each list item's own lines
   (bullet, numbered, task, at every depth — its nested items are the blocks
   after it); anything else — paragraph, quote, callout, table, HTML — up to the
   next blank line; blank lines belong to the block before them; (c) lines, as
   git. *Recommended: (b).* It follows spec Q21's units where lines can find
   them, and where it errs it errs coarse (a setext heading or a lazy line joins
   its neighbour), which only makes a conflict, never a wrong merge. The
   concatenation of the blocks is the file byte for byte, whatever the bytes. It
   names a *merge block* and changes nothing of Q21's *block*. (a) needs two
   parsers (pulldown-cmark, Lezer) to agree on every input; (c) merges two edits
   of one paragraph into a sentence neither wrote. A file with mixed line ends,
   or a different line end on two sides, is not merged.
5. **The three-way rule.** Each side is aligned to the base by a diff over the
   blocks' bytes (Myers). A block changed or deleted on one side only takes that
   side; changed identically on both, once; two changes on **different** blocks
   both apply, adjacent or not; a block deleted on one side and changed on the
   other, or changed differently on both, is a **conflict** (Q4). Two insertions
   in the same gap: Q5. A moved block (0061 drag) reads as a delete and an
   insert, so a move against an edit of the moved block is a conflict. The
   result is split again and must give the planned blocks (and its frontmatter
   still parse, item 6), or it is discarded for the copy.
   **Q4 `[OPEN]` — one block changed by both.** (a) **no merge**: the whole file
   is a conflict copy, as today; (b) the rest merged, both versions of that block
   one after the other inside a `> [!conflict]` callout in the note; (c) git's
   markers in the note; (d) the server's block kept, the rest merged, this
   device's whole version as the copy. *Recommended: (a)* — nothing written that
   someone must clean up, the copy and its diff are already understood; (b) can
   follow once merges have been seen in use. (c) breaks the reading view and
   Obsidian; (d) leaves two files that differ in many places.
   **Q5 `[OPEN]` — both inserted blocks in the same place.** (a) both kept, the
   server's first, then this device's — the append-merge's rule, which is this
   case at the file's end; (b) a conflict. *Recommended: (a)*: it is what was
   accepted for appends, and the append-merge becomes its special case. The
   append-merge stays first anyway: it needs no stored base.
6. **Q6 `[OPEN]` — frontmatter.** (a) **per top-level key**, by its lines: a key
   is a line at column 0 (not `-`, not `#`) with its following indented or `- `
   lines and the comment lines just above it; keys merged by item 5's rule, two
   new keys at the end the server's first; only when all three frontmatters
   parse as a YAML mapping with unique keys, before and after; never
   re-serialized, so quotes, order and spacing stay each person's (invariant
   7's spirit); (b) the frontmatter as one block. *Recommended: (a)* — the
   properties panel makes a status change on one device and a tag on another
   the most common offline pair.
7. **Q7 `[OPEN]` — boards (`.canvas`).** (a) **per element id**: each node and
   edge of the JSON Canvas a unit, the three-way rule by id (an element changed
   on both, or deleted against changed, a conflict → the whole board a copy, as
   Q4 (a)), order as the server's with this device's new elements after; the
   result written by the board's own writer (0057 point 2), as every save of a
   board in Verso is; (b) boards stay conflict copies. *Recommended: (a), as a
   later step (B7)*: the table's boards are edited a lot, mostly live; notes
   first.
8. **Q8 `[OPEN]` — bases and other files.** (a) **copies, as today**, for
   `.base`, `.txt`, `.json`, `.csv` and every attachment; (b) `.base` per
   top-level key like item 6; (c) `.txt` by item 4's blocks. *Recommended: (a)*
   — rarely edited apart, nested YAML; the list can grow after use.
9. **Q9 `[OPEN]` — what the person sees, and undo.** The sync log says
   "merged" with the counts ("3 blocks from here, 2 from the server"), and a copy
   that was not merged says why ("both changed the same paragraph"). (a) **"See
   what was merged"** opens the conflicts' existing diff, base against result,
   each changed block marked by its side; **"Undo the merge"** puts the files as
   they would have been without it — the server's version back under the name
   and this device's as the conflict copy — refused, pointing to the history
   (0091), when the note changed since the merge; the three inputs of each merge
   kept in the base store for 30 days, like the trash; (b) undo leaves the note
   and only makes the copy; (c) no undo, the history alone. *Recommended: (a).*
   Default chosen, not a question: always on, no setting (as the append-merge);
   Obsidian's per-device switch exists because its merge duplicates text, which
   item 5 does not.
10. **Q10 `[OPEN]` — the browser's offline copy.** (a) the same merge in
    TypeScript (a new `app/ui/src/web/offline/blocks.ts`) beside `engine.ts`,
    every case of the Rust tests written into `sync-vectors.json` by
    `the_browsers_vectors_are_the_engines`, as today; (b) the browser keeps
    making copies. *Recommended: (a)* — 0092 item 1 is "no second protocol";
    a browser that copies where the desktop merges is two behaviours of one
    folder.
11. **Q11 `[OPEN]` — the outside program's edit into a live room** (0082 item
    11, named beside this one in 0082 Consequences and in After V1 item 8,
    while row V.50 names only offline edits). With item 3's store the device
    holds the room's last save as the base, so the same merge applies: base =
    the last save, this side = the file Obsidian wrote, the other = the room's
    text, the result entered into the room as one edit. (a) in this ADR, its last
    step (B8); (b) stays after V1. *Recommended: (a)*, as the last step: same
    function, a small adapter; if V.50 meant offline edits only, (b).
12. **Bounds** (defaults chosen here, changed by the maintainer at will): each of
    the three versions at most **4 MiB** and **50 000 blocks**, the diff stopped
    past 10 000 edits — beyond, a copy, its reason said; the base store holds
    one deflated copy of each mergeable file under the bound (a folder of 5 000
    notes of 5 KB: ~25 MB of text, ~10 MB stored), in the browser the same
    again in IndexedDB, under its quota (0092 item 3): a base the store refuses is
    no base, and that file falls back to the append-merge or the copy.

## Consequences

- **No wire change, no contract change for the merge itself**: it runs on the
  device that meets the conflict, inside today's `Action::Conflict`, after the
  append-merge; a device of before keeps making copies (the N/N-1 window holds).
  Item 9's view and undo add two commands (types generated, invariant 3; the
  harness answers them; `build.rs` and the capabilities list).
- **Guardrails, seen failing first (0029)**, in `crates/verso-core/src/sync/blocks.rs`
  like `append.rs`: the split's concatenation is the input for any bytes (CRLF,
  no final newline, BOM); for random blocks and edits on disjoint blocks the
  merge applies both; an edit on a shared block gives `None`; the result is made
  only of slices of the three inputs plus the joining newline; `merge(b, b, r)
  = r`; and 0079's engine property test (two devices, a server, random edits)
  gains block edits: same files at the end, no edit lost (each in the result or
  in a copy). The vectors hold the TypeScript to all of it.
- The window: both languages (`strings.ts`), the changelog line, the sync lesson
  of both demo vaults (`names.mjs`, `tour.mjs`), the walkthrough, an e2e of the
  log, the view and the undo; two phones offline in `manual-checks.md`.

**Build steps** (sizes are estimates of lines, tests included):

| Step | What | Size |
|---|---|---|
| B1 | Base store on the device (item 3, Q2 a), written at every base move; no behaviour change | ~350 |
| B2 | Merge splitter and three-way rule, pure, in `verso-core` (items 4–5) with the properties | ~750 |
| B3 | Frontmatter by key (Q6 a) | ~250 |
| B4 | Into the conflict path; the log's "merged" and its reasons; the inputs kept 30 days | ~250 |
| B5 | The window: see what was merged, undo (Q9), strings, lesson, e2e | ~600 |
| B6 | The browser: `blocks.ts`, IndexedDB `bases`, vectors (Q10 a) | ~550 |
| B7 | Boards by element id (Q7 a), Rust and TypeScript | ~550 |
| B8 | An outside edit into a live room (Q11 a) | ~250 |

B1–B5 make the feature on the apps; B6 before it ships, so that one folder does
not behave two ways; B7 and B8 each alone.

## Discarded alternatives

- **The base fetched from the server's history only** (Q2 b, raised by this
  ADR's author on reading the history's code): kept as an option in Q2, not
  recommended for the reasons in Context.
- Otherwise none recorded: the other options are open in their questions.

## Status

**Proposed (2026-11-15).** Q1–Q11 `[OPEN]`, each with a recommendation. In V1
as row V.50, after the terminal and the music are polished (the maintainer,
2026-11-01). Not built.
