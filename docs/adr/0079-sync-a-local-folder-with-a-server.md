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
  (quotas), [0078](0078-universo-the-name-of-verso-as-a-server.md) (UniVerso).
- Status in the briefing: not present; on acceptance.
- Revisions: 2026-10-10 — after the review and the sync campaign of the
  same day, the maintainer took the recommended answer to each question
  put to them: *"Gostei das recomendações, pode seguir"*. Item 9: the pause
  needs at least 3 deletions in one pass — a floor, so that in a small
  folder one or two deletions do not pause (the review's M1; read as a floor
  from the "pode seguir" to the recommendation "pausar a partir de 3" —
  confirmed by the maintainer on 2026-10-11); and "the
  system's bin" corrected to the folder's `.trash/`, which is what the
  code does ([0080](0080-the-trash-with-expiry-and-restore.md) item 9).
  Items 2 and 8: the two Unicode forms of one name are one file
  everywhere (spec Q7, decided the same day from the campaign's finding
  F20). Item 8: which side keeps the name, decided earlier the same day
  (Status), marked so. Consequences: a known limit, the campaign's
  finding F18. Item 4: the change log gains the device's name
  (`changes.device`, server schema 6, commit a93d931) — "who made it" now
  names the device beside the account. The floor of item 9 and the
  device's name confirmed by the maintainer on 2026-10-11, in session:
  *"Mas eu tinha confirmado"* (but I had confirmed) — the
  *"Gostei das recomendações, pode seguir"* of 2026-10-10 covers every
  recommended option. 2026-10-11 (evening, ~18:10 BRT) — the maintainer
  answered a memo of recommendations written after the sync campaign
  (kept outside the repository; its §6 is the list) with *"Sim para
  todos"* (yes to all). Item 8: two appends to a note's end are joined
  instead of a conflict copy — the **append-merge**, which amends the item
  and is the first step of [0073](0073-self-hosted-server-first.md) item
  10's merge by block. Item 8's `<device>`: the **device's name may be set
  by the person**, the system's name by default (with
  [0074](0074-accounts-and-access-on-the-server.md) item 8, the device
  session). Item 5: a **sync protocol version**, the device's in its
  WebSocket request and the server's in its hello.
  Item 12: the **1 GiB limit** the code keeps (`LARGEST`) is not one of
  those answers: the maintainer confirmed it later that evening, separately
  (*"Pode ter esse limite de 1gb"*, recorded by ffb0f8e), and on that
  confirmation it is decided, with the Status's "so that no file is left
  out for its size" amended to "no file under 1 GiB" — the old words kept
  there. 2026-10-12 — items 7 and 8, with [0082](0082-live-co-editing-of-a-synced-folder.md)
  built (accepted 2026-10-11; 7c08a9a, ccabedd, acc02df, 76b4c11 and b73b6f2, merged into `feat/universo` by 8e93bbd on 2026-10-12):
  a note of a synced folder joins the server's room while the device is
  connected. While the note is live, the local file has one writer in
  Verso, sync, which downloads the room's saves over it; a local change
  whose hash is the tab's own is neither uploaded nor a conflict, so a
  note live on the device makes no conflict copy of its own text (item
  8). The copy remains for offline edits on both sides and for a program
  outside Verso that edits the file after the room has saved (items 7 and
  8). A connection that drops in the middle of an edit takes the note
  local, its text kept and written here, nothing lost; the return rejoins
  the room, or, when the room is another, ends in item 8's conflict copy.
  A reader, which syncs to read (item 1), is present in the room and its
  edits are refused. The items' words are unchanged. *(2026-10-12, evening:
  the same for a board and any text file of a synced folder,
  [0082](0082-live-co-editing-of-a-synced-folder.md) item 12 — live while
  connected, sync the one writer of the local file, and the tab's own write
  out of the room, by `write_text` or `write_board`, known by its hash.)* 2026-10-12 — items
  5 and 12, the wire (the sync campaign's finding F31, a file in transit
  held whole in the server's memory per device, plus its base64; the
  maintainer that day: *"Ajuste todas essas pendências agora"*, relayed in
  the session that built it): a file crosses in pieces of 1 MiB read from
  the disk as each is sent and written to a temporary file as each
  arrives, on the server and on the device — never whole in memory — and
  is put in place only whole, its hash matched, as item 12 says. **Sync
  protocol 2**: a piece crosses as a binary WebSocket message (the JSON
  header's length in four bytes, the header, the piece's bytes) instead
  of base64 inside the JSON; a side of sync 1, and a connection that says
  no version, is still sent and taken base64, as item 5 follows the
  version before. Item 12's "the pieces stay as they are" (2026-10-11,
  said of the 1 GiB limit) no longer holds for their size and their
  wire. Built in 82fb2c3. The items' words are unchanged. 2026-10-12 —
  item 12, the pieces' size: **1 MiB stays**, decided by the maintainer
  that day, about 16:00 BRT, among the round's seven decisions, all as
  recommended: *"Todos aprovados"* (all approved).
  2026-10-14 — item 8's append-merge takes the filled template as the base
  of a periodic note both sides made with no base, when both versions
  begin with the bytes the template made, by
  [0093](0093-periodic-notes.md) item 12, accepted by the maintainer that
  night (*"Sim, todas"*).
  2026-10-16 — item 1, the first folder: a new server has no folder, and
  the admin who signed the desktop app in saw only *"ask for an
  invitation"* and no way on (*"e ai?"*). First the app offered to make an
  empty folder before syncing; the maintainer refused that step: *"Como
  assim? Eu preciso criar uma pasta no servidor para sincronizar? Eu não
  posso simplesmente sincronizar? Não faz sentido algum isso."* So there is
  **no separate step**: in Settings › Servers, when a folder of this
  computer is open and not syncing and the account may make folders (the
  server's `mayCreate`, [0074](0074-accounts-and-access-on-the-server.md)
  item 6, now carried to the app with the folder list), one **Sync "name"**
  makes the server's folder — the open folder's name, or `name (2)`,
  `name (3)`… when a folder has it, never merged into one that is there —
  and turns the sync on. Settings › Sync always did this by its default
  choice, *a new folder*, and now takes the same free name. The first
  pass into that new, empty folder is item 11's: every local file goes up
  and none is deleted or rewritten here (pinned by a host test). Syncing
  with a folder that is already there stays each row's own *Sync*. *Make an
  empty folder…* is a small second action; an account that may not make
  folders keeps the invitation text. The host's `server_create_folder`
  asks the server's `POST /api/folders` with the device's session. 2026-10-21 — [0104](0104-external-cloud-storage-transports-and-quotas.md) makes a cloud folder another remote of this sync (its item 4 maps which items hold, adapt, or do not apply).

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
   port. **A sync protocol version** (decided 2026-10-11, *"Sim para
   todos"*, Revisions): an integer; the server accepts the current version
   and the previous one. The device says its own as the `x-verso-sync`
   header of its WebSocket request — the server sends its hello before it
   reads anything, so a device cannot say it in a hello — and the server
   answers its own as `sync` in the hello, with `syncRefused` and a
   message when the device's is older than the previous one; the device
   holds the server's `sync` to the same rule. A connection that says no
   version — a window, a program, an older app — is never refused. The
   contract's version (the hash of the generated bindings) does not cover
   the sync's wire — the sync's commands are not in the bindings — so this
   number is set before any change to that wire. *(Sync 2, 2026-10-12:
   each change `sync_changes` answers may carry `device`, the name of
   the device whose sync made it, as the person set it in Settings ›
   Servers, and `by`, the person's name (the account's e-mail when it
   has none; added the same day, still unreleased) — item 4's "who made
   it" told to the devices, which say it in Settings › Sync's recent
   activity, "by <person> on <device>"; a device of sync 1 ignores the
   fields, and through a share both are left out. The
   same version 2 carries a piece of a file as a binary WebSocket message
   instead of base64 — item 12, revised the same day; a side of sync 1 is
   still sent and taken base64. Also in sync 2, unreleased when added on
   2026-10-12: a write, rename or folder the server refuses because its
   new name differs only in case from a sibling (spec Q8) answers with
   the error kind `case_twin`, which a device of sync 2 lists as a name
   taken; a device of sync 1 does not know the kind and already lists
   the file as failed ("the server refused") — nothing breaks, the reason
   is only less precise. And through a share (ADR 0081 item 6), `head`
   and each change's `seq` count the share's own changes, not the
   folder's, and the push that the log moved carries no head: the
   folder's numbers told the receiver how much happens outside the share
   (3.18). The device's cursor is opaque to it, and a device keeps it only
   while it is connected, so nothing of sync 1 has to be read again.)*
6. **When**: on the local watcher's batches (debounced), on the server's
   pushes, at start and on reconnecting, and by a scan every five minutes
   as a net. Offline, nothing queues but the state's difference: when the
   connection returns, the two sides are compared from their bases.
7. **A change on one side only** is applied on the other: written
   atomically (invariant 9) through `verso-fs` on the computer, through
   the service on the server — where a note open in a room of
   simultaneous editing (0073 item 7) receives it as any other write does,
   merged into the room or stopping it for the people in it to choose.
   *(With [0082](0082-live-co-editing-of-a-synced-folder.md) built, 2026-10-12, Revisions:
   while a note is live in a room on the device, sync alone writes its
   local file.)*
8. **A change on both sides since the base is a conflict**: the server's
   version keeps the file's name; the local version is kept beside it as
   `<name> (conflict, <device>, <yyyy-mm-dd hh.mm>).<ext>` — in the
   person's language, with characters every OS can keep (0070 item 3) —
   and that copy syncs too, so the other devices see it. `<device>` is
   the device's name, which **the person may set** in Settings › Servers,
   the system's name by default (decided 2026-10-11, *"Sim para todos"*,
   Revisions): taken from the system only, two computers with one host
   name collide in the copies' names and in the sessions list. The window lists
   the folder's conflicts, shows each difference, and the person merges by
   hand and deletes the copy. A file changed on both sides under the two
   Unicode forms of one name (item 2) is such a conflict: a copy beside
   it (spec Q7, decided 2026-10-10). `[OPEN]` until 2026-10-10: which
   side keeps the name. Recommended: the server's, the copy shared with
   the others being the one that diverged — decided 2026-10-10 as
   recommended (Status).
   **Appends on both sides are joined** (decided 2026-10-11, *"Sim para
   todos"*, Revisions; it amends this item): when a note (`.md` only)
   changed on both sides since the base and both changes are pure appends
   to its end — the base's bytes a prefix of both versions, at a line
   boundary — the two tails are joined instead of a conflict copy: the
   server's tail first, then this computer's. The result is written here
   (invariant 11) and sent, and the sync's log says "merged" (item 13:
   nothing silent). Any other change on both sides stays a conflict copy.
   This is the first step of [0073](0073-self-hosted-server-first.md) item
   10's merge by block, which comes after conflicts have been seen in use:
   they were — the campaign's soak of 2026-10-11 made 42 copies of one
   note edited from two devices every 30 s.
   *(With [0082](0082-live-co-editing-of-a-synced-folder.md) built, 2026-10-12, Revisions:
   a note live on the device makes no conflict copy of its own text; the
   copy remains for offline edits and for programs outside Verso.)*
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
    half-written. **A file larger than 1 GiB is not synced** (decided
    2026-10-11, Revisions; confirmed by the maintainer that evening:
    *"Pode ter esse limite de 1gb"*): it is listed with its reason (item
    13) — the code's `LARGEST`. The pieces stay as they are.
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
  seen in use. *(Its first step, the append-merge of item 8, decided on
  2026-10-11, Revisions.)*

## Status

**Accepted on 2026-10-10** by the maintainer, in session: *"com exceção do 6, pode seguir o recomendado, o 6 pode já implementar"*. Item
8: the server's version keeps the name, the local one is the copy, as
recommended. Item 12, **not** as recommended: files larger than the
server's message limit are sent and fetched **in pieces now**, in this
round, so that no file under 1 GiB is left out for its size *(amended on
2026-10-11, Revisions; the words were "so that no file is left out for
its size": the 1 GiB limit, accepted by the maintainer that day, is item
12's)*. To be read by Fable 5.1 with the round's code *(history: read by
Fable 5.1 on 2026-10-10/11, in the sync campaign's session; its final
report, `verso-sync-campaign/relatorio-final.md`, is outside the
repository)*.

**Decided (2026-10-31): a rename made on the server arrives as a rename.**
`[DECIDED 2026-10-31, to be built]` A rename made on the server (a window of
the server) reached the Mac as a deletion and a creation, the old file going
to the trash. Item 10 states the rename going up; the answer states it coming
down. Put to the maintainer as B12 of the list of 2026-10-31 — a) fix it so
it arrives as a rename, b) accept it — and approved as recommended, a:
*"Todo resto pode ir de recomendado e aprovado"* (everything else may go as recommended, and is approved). A rename in the server's change log is applied on the device as
one rename, never as a delete and a create.
