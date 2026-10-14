# ADR 0091 — Version history: who changed a file, when, and bringing a version back

- Date: 2026-10-14
- Source: the maintainer, on 2026-10-10, closing [0081](0081-sharing-between-people-on-one-universo.md):
  *"num próximo passo… histórico de mudança de arquivos… não esquece"*
  (in a next step… the history of files' changes… don't forget). The
  reading of 2026-10-14 in session listed it among the open decisions
  that change the product and recommended it as required in V1; asked
  whether it enters V1, the maintainer answered yes that evening, and, on
  the whole list: *"VAI SER TUDO NA V1"* (it will all be in V1). Written
  by Opus 5.5; to be read by the other model before it is accepted
  ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0073](0073-self-hosted-server-first.md) (its Status leaves
  "history and attribution of another member's change" `[OPEN]`),
  [0080](0080-the-trash-with-expiry-and-restore.md) (the recovery of a
  deletion; the version a device's write replaced, item 12; the trash
  against the quota, item 8), [0079](0079-sync-a-local-folder-with-a-server.md)
  (item 4, the change log), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (a room writes the file), [0081](0081-sharing-between-people-on-one-universo.md),
  [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (quotas), [0011](0011-config-outside-tree-index-as-cache.md),
  [0012](0012-files-are-source-of-truth.md), [0070](0070-what-travels-with-the-folder.md)
  (the person's layer of settings), [0087](0087-secret-blocks-hidden-from-readers.md),
  [0035](0035-cross-cutting-requirements.md).
- Status in the briefing: not present; on acceptance.

## Context

What exists. On a UniVerso every write to a folder — a window's command,
a room's save, a device's sync, a change the watcher finds — ends in one
reconciliation that appends to the folder's change log
(`crates/verso-server/src/sync.rs`): the table `changes` records the
path, the hash and size of the new bytes, a deletion or a rename, the
actor and the time (`crates/verso-server/src/db.rs`). **It keeps no
bytes.** The trash keeps what was deleted, and the version a device's
write replaced, restorable for 30 days ([0080](0080-the-trash-with-expiry-and-restore.md)
items 3 and 12). A room writes its note 900 ms after the last edit
([0082](0082-live-co-editing-of-a-synced-folder.md)), so an hour of
writing is hundreds of writes. A folder of the computer, without a
server, keeps nothing of a file's past but its trash.

So another member's edit — a paragraph deleted, a board rearranged — can
be seen only while it is in the room's undo, and recovered by nobody.
Notion and Google Docs show a page's versions; Obsidian's public help
describes a core "File recovery" that keeps snapshots on the computer.

## Decision

Proposed (2026-10-14). Each `[OPEN]` carries a recommendation; the
maintainer decides.

1. **A version is the bytes of a file at a write**, kept outside the
   folder ([0011](0011-config-outside-tree-index-as-cache.md)) — on the
   server in its data directory, by the hash the change log already
   records, so equal bytes are kept once. The file stays the truth
   ([0012](0012-files-are-source-of-truth.md)); the history is never
   written into the folder and never syncs.
2. **What is kept.** Every text file the window edits — notes, boards,
   bases, `.txt`, `.json`, `.csv`. `[OPEN]`: pictures, PDFs and other
   attachments. Recommended: **not in the history**; a replaced
   attachment goes to the trash, as [0080](0080-the-trash-with-expiry-and-restore.md)
   item 12 already does for a device's write.
3. **How many.** `[OPEN]`: the thinning and the retention. Recommended:
   a room's writes **coalesced** into one version per ten minutes of
   editing; every version kept for a day, one an hour for 30 days, one a
   day after that up to the folder's retention — `VERSO_HISTORY_DAYS`, 365
   by default, `0` for no limit, set per folder in the console as the
   trash's is ([0080](0080-the-trash-with-expiry-and-restore.md) item 3);
   the newest version of a file is never thinned away.
4. **Who changed it.** Each version names its authors: the accounts whose
   edits a room's version holds, a device by its name, an agent's token,
   or "outside Verso" for a change the watcher found. `[OPEN]`: who wrote
   each line. Recommended: **not in V1**; the diff between two versions
   and their authors answer "who changed this".
5. **The view.** "History" on a note, a board or a base — from its menu,
   the command palette and the status bar — lists the versions, newest
   first, with when, who and the size of the change; one selected shows
   its diff against the current text and against the one before it.
   **"Restore this version"** writes those bytes as a **new** write, with
   invariant 11's check, through the room when the note is live: history
   is never rewritten, and the restore is itself a version. "Copy as a
   new note" puts it beside the file instead.
6. **Who sees it, on a server.** Whoever may write the file sees its
   history and restores; the owner and the admin may delete a version.
   `[OPEN]`: readers. Recommended: **no history for readers**, as they see
   no trash ([0080](0080-the-trash-with-expiry-and-restore.md) item 7) —
   a past version would otherwise need the projection of
   [0087](0087-secret-blocks-hidden-from-readers.md) applied to each.
   A share sees the history of the files inside it.
7. **History and the quota.** `[OPEN]`. Recommended: **as the trash**
   ([0080](0080-the-trash-with-expiry-and-restore.md) item 8): shown in
   the folder's page and not counted, the oldest versions thinned early
   when the history alone passes the folder's quota, said there.
8. **A folder of the computer.** `[OPEN]`: whether the desktop keeps a
   history of its local folders in V1. Recommended: **yes**, the same
   store in the configuration directory and the same view, its retention
   a setting of the person's layer ([0070](0070-what-travels-with-the-folder.md));
   a synced folder shows the server's history, which holds every device's
   writes, and the local one only for what has not crossed yet.
9. **Renames and deletions.** A version follows its file across renames
   (the change log's `renamed_from`); a deleted file's history is reached
   from its entry in the trash.
10. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
    the list is a table with a header row; the diff is read as lines
    added and removed, not by colour alone; "Restore" asks first and
    announces what it did; pt-BR and English.

## Consequences

- `verso-server` gains the version store, the thinning and the commands
  (list, read, restore, delete); `verso-core` gains the local store with
  item 8; the contract's types are generated as always (invariant 3);
  `VERSO_HISTORY_DAYS` is documented with the other variables in
  `docs/reference/server-install.md`.
- [0073](0073-self-hosted-server-first.md)'s `[OPEN]` "history and
  attribution of another member's change" is answered when this ADR is
  accepted, with a Revisions line there, and the roadmap's row in Phase 3
  struck.
- A guardrail of the feature, seen failing first ([0029](0029-guardrails-in-ci.md)):
  a property test that restoring a version writes exactly its bytes, that
  thinning never removes a file's newest version, and that nothing of the
  history touches the folder.
- The window gains the History view, the diff, the strings; e2e tests for
  a restore over a live room and a reader's absence of history; the demo
  vault teaches it ([0058](0058-demo-vault-as-tutorial.md)); the
  changelog gets its line.

## Discarded alternatives

None recorded.

## Status

**Proposed (2026-10-14).** In V1 by the maintainer's word of 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revision 8). For the
maintainer, each with a recommendation: attachments (item 2), thinning
and retention (item 3), line authorship (item 4), readers (item 6), the
quota (item 7), and the desktop's local history in V1 (item 8).
