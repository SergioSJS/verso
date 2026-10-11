# ADR 0079 — Sync: a desktop folder kept in step with a folder on a server

- Date: 2026-10-10
- Source: the maintainer, in session on 2026-10-10, opening the round after
  0.7.0-beta.1: *"quero sincronização funcionando também"*. Written by Opus
  5.5; to be read by Fable 5.1 ([0032](0032-author-and-reviewer-roles.md))
  before it is accepted.
- Related: [0073](0073-self-hosted-server-first.md) (item 10, sync after
  the server and through it, per file, conflicts as a copy, nothing
  silent; item 7, simultaneous editing), [0075](0075-server-packaging-and-storage.md)
  (item 5, sync chosen folder by folder, off by default, the space shown
  first), [0020](0020-sync-merge-in-core-transports-as-plugins.md) (the
  merge in the core; revised by 0073), [0012](0012-files-are-source-of-truth.md),
  [0043](0043-placeholder-guard.md) (a placeholder is never a deletion),
  [0044](0044-verso-fs-semantics.md) (the watcher, ignored paths),
  [0070](0070-what-travels-with-the-folder.md) (what travels with a folder;
  item 3, names every OS can keep), [0011](0011-config-outside-tree-index-as-cache.md)
  (state outside the folder), [0074](0074-accounts-and-access-on-the-server.md)
  (the device session, roles), [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (quotas), [0078](0078-universo-the-name-of-verso-as-a-server.md) (Universo).
- Status in the briefing: not present; on acceptance.
- Revisions: 2026-10-10 — after the review and the sync campaign of the
  same day, the maintainer took the recommended answer to each question
  put to them: *"Gostei das recomendações, pode seguir"*. Item 9: the pause
  needs at least 3 deletions in one pass — a floor, so that in a small
  folder one or two deletions do not pause (the review's M1; read as a floor
  from the "pode seguir" to the recommendation "pausar a partir de 3" — that
  reading awaits the maintainer's confirmation); and "the
  system's bin" corrected to the folder's `.trash/`, which is what the
  code does ([0080](0080-the-trash-with-expiry-and-restore.md) item 9).
  Items 2 and 8: the two Unicode forms of one name are one file
  everywhere (spec Q7, decided the same day from the campaign's finding
  F20). Item 8: which side keeps the name, decided earlier the same day
  (Status), marked so. Consequences: a known limit, the campaign's
  finding F18.

## Context

What is decided already: sync comes after the server and goes through it
(0073 items 1 and 10, 0020 revised); a person turns it on folder by folder,
off by default, seeing the folder's space first (0075 item 5); it works
per file, by hash and stamp; a conflict is kept as a copy beside the file,
the difference shown (invariant 11), nothing silent; merge by block comes
only after conflicts have been seen in use.

0.7.0-beta.1 has the server, and the desktop app opens a server's folder
**online**: every read and write crosses the network, nothing is kept on
the computer. Sync is the other case: the folder lives on the computer —
opened and edited offline, read by Obsidian, backed up — and the server
holds the same files, for the person's other devices, the browser, the
phone, and the folder's other members.

What is not decided is how: what crosses, when, what a deletion and a
rename are, what the copy is named, what happens offline, at the first
sync, at a mass deletion, under a quota.

## Decision

Accepted (2026-10-10, Status).

1. **A local folder syncs with one folder on one server.** In the desktop
   app, a folder's settings offer "Sync with a server": the person picks a
   server they are signed in to (Settings › Servers) and either a new
   folder there (made with the local folder's name) or an existing one
   where their role is owner or editor. One server per local folder. A
   reader may sync to read: the server's changes arrive, local changes are
   refused and shown. Turning sync off leaves both sides as they are.
2. **The unit is a file**: every file the walk finds — notes, attachments,
   boards, the folder's own settings that travel with it (0070) — and none
   of the paths the walk ignores (0044). A file is its path relative to
   the folder, its bytes' hash (SHA-256), its size and its modification
   time. **One name is one file everywhere** (spec Q7, decided
   2026-10-10): two paths that differ only in the Unicode form of their
   accents (NFC, NFD) are the same file — the server compares names in
   NFC, and each device keeps the spelling its own file system gave the
   name.
3. **The state lives outside the folder** (0011): per synced folder, in the
   configuration directory, the server, the folder's id, a cursor into the
   server's changes, and per path the **base** — the hash and size both
   sides last agreed on, with the server's revision of it. Nothing is
   written into the folder for sync's sake.
4. **The server keeps a change log per folder**: each write, delete and
   rename, with a sequence number, the path, the new hash and size, who
   made it and when — whoever made it: a browser, a desktop app online,
   another device's sync, a program with a token, a change found on the
   server's disk. A device asks for the changes after its cursor and
   receives pushes for its folders while connected.
5. **What crosses, and how**: the desktop app's device session (0074 item
   8) over the WebSocket it already uses; a file's bytes read through the
   server's file route and written through the service's write commands,
   with the base revision (invariant 11). No transport of its own, no new
   port.
6. **When**: on the local watcher's batches (debounced), on the server's
   pushes, at start and on reconnecting, and by a scan every five minutes
   as a net. Offline, nothing queues but the state's difference: when the
   connection returns, the two sides are compared from their bases.
7. **A change on one side only** is applied on the other: written
   atomically (invariant 9) through `verso-fs` on the computer, through
   the service on the server — where a note open in a room of
   simultaneous editing (0073 item 7) receives it as any other write does,
   merged into the room or stopping it for the people in it to choose.
8. **A change on both sides since the base is a conflict**: the server's
   version keeps the file's name; the local version is kept beside it as
   `<name> (conflict, <device>, <yyyy-mm-dd hh.mm>).<ext>` — in the
   person's language, with characters every OS can keep (0070 item 3) —
   and that copy syncs too, so the other devices see it. The window lists
   the folder's conflicts, shows each difference, and the person merges by
   hand and deletes the copy. A file changed on both sides under the two
   Unicode forms of one name (item 2) is such a conflict: a copy beside
   it (spec Q7, decided 2026-10-10). `[OPEN]` until 2026-10-10: which
   side keeps the name. Recommended: the server's, the copy shared with
   the others being the one that diverged — decided 2026-10-10 as
   recommended (Status).
9. **Deletions**: a file deleted on one side and unchanged on the other is
   deleted there (into the folder's `.trash/` on the computer, as every
   deletion in Verso goes — [0080](0080-the-trash-with-expiry-and-restore.md)
   item 9; "the system's bin" corrected on 2026-10-10);
   deleted on one side and edited on the other, the edit wins and the file
   comes back. A placeholder of on-demand storage is never a deletion
   (0043). A batch that would delete more than a fifth of the folder's
   files, or more than 50, **pauses sync** and asks the person — a folder
   moved, a drive not mounted, a cloud folder evicted all look like
   deletions. The pause needs **at least 3 deletions** in one pass
   (decided 2026-10-10, Revisions): in a small folder, where a fifth is
   one or two files, one or two deletions do not pause.
10. **Renames and moves**: a delete and a create of the same hash in one
    local batch are sent as a rename, which the server applies as one;
    otherwise they are a delete and a create. The links a rename in Verso
    rewrites are edits of other notes and sync as such.
11. **The first sync** of a folder never deletes: a file on one side only
    is copied to the other; a file on both with the same hash is agreed;
    with different hashes it is a conflict (item 8). The space is shown
    before it starts (0075 item 5), and it can be cancelled.
12. **Limits**: the server's quota (0077) applies — a file refused is
    listed and the rest syncs. A file larger than the server's message limit
    is sent and fetched **in pieces** (decided on 2026-10-10, Status): each
    piece under the limit, the file written only when every piece has
    arrived and its hash matches, so a broken transfer leaves nothing
    half-written.
13. **What a person sees**: the folder's sync state in the status bar —
    synced, sending or receiving *n*, offline, paused, *n* conflicts,
    errors — and in the folder's settings a log of what crossed, pause and
    resume, and the conflicts. Nothing is silent: every file not synced
    has its reason.
14. **Phones and browsers do not sync**: they work on the server's folder
    online, as today. Offline on the phone is the PWA's later step
    (0073 item 12).

## Consequences

- The server gains the change log (its database), a command to read it
  from a cursor, pushes of changes per folder to a device, and a rename
  command that keeps the log whole; every write path — browser, online
  desktop, sync, token, changes found on disk — appends to it.
- `verso-core` gains the sync engine (comparison against the base, the
  plan of what to send and fetch, conflicts), with no network: the
  desktop host runs its transport over the device session. `verso-fs`
  writes as always.
- The desktop app gains the folder's sync settings, the status, the
  conflicts list and its diff; both languages; e2e tests for the
  window's part and Rust tests for the engine against a real server
  (as `tests_remote` already does), including offline, conflict, mass
  deletion and first sync.
- A guardrail of the feature, seen failing first (ADR 0029): a property
  test that two devices and a server, editing at random and syncing in
  random orders, end with the same files and lose no edit (each lost
  version present as a conflict copy).
- **A known limit** (the sync campaign of 2026-10-10, its finding F18): a
  program outside Verso that holds a whole file in memory and saves that
  stale buffer after sync has downloaded a newer version overwrites the
  newer version — to sync it is an ordinary change on one side (item 7),
  and no sync of whole files can tell it from an edit. Verso's own editor
  checks the revision (invariant 11) and does not do this. The
  mitigation is [0080](0080-the-trash-with-expiry-and-restore.md)'s: the
  server keeps the version a device's write replaced, in the folder's
  trash, restorable — in a later round.

## Discarded alternatives

- **Merge by block now**: 0073 item 10 puts it after conflicts have been
  seen in use.

## Status

**Accepted on 2026-10-10** by the maintainer, in session: *"com exceção do 6, pode seguir o recomendado, o 6 pode já implementar"*. Item
8: the server's version keeps the name, the local one is the copy, as
recommended. Item 12, **not** as recommended: files larger than the
server's message limit are sent and fetched **in pieces now**, in this
round, so that no file is left out for its size. To be read by Fable 5.1
with the round's code.
