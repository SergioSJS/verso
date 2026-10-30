# ADR 0082 — Live co-editing of a synced folder: the desktop's note joins the server's room while online

- Date: 2026-10-10
- Source: the maintainer, in session on 2026-10-10, asking whether Verso
  gives *"a mesma experiência do Notion no quesito de usuários editando o
  mesmo arquivo simultâneo"*. The answer in session: yes where everyone
  edits on the server — the browser's window and the desktop app opening a
  server's folder online join a room ([0073](0073-self-hosted-server-first.md)
  item 7) — and no for the desktop app with a **synced** local folder
  ([0079](0079-sync-a-local-folder-with-a-server.md)), where a change
  crosses on save and two people in one note end with a conflict copy. The
  proposal made then, a hybrid where the synced folder's note joins the
  same room while the server is reachable, the maintainer approved as a
  direction: *"adorei sua sugestão… vai ser um grande diferencial, ainda
  mais comparando as ferramentas"*. Written by Fable 5.1 at the
  maintainer's request, a swap of the roles of
  [0032](0032-author-and-reviewer-roles.md) as [0080](0080-the-trash-with-expiry-and-restore.md)
  and [0081](0081-sharing-between-people-on-one-universo.md) were; to be
  read by Opus 5.5 before it is accepted.
- Related: [0073](0073-self-hosted-server-first.md) (item 7, rooms of
  simultaneous editing, Yjs as the mechanism of a live session and the
  file as the truth, a change from outside merged into the room or
  stopping it; item 2, the window learns how far the core is; item 10,
  sync per file, conflicts as a copy, merge by block only after conflicts
  have been seen in use), [0079](0079-sync-a-local-folder-with-a-server.md)
  (item 1, one local folder with one server folder, a reader syncs to
  read; item 3, the base kept outside the folder; item 5, the device
  session's WebSocket; item 6, offline nothing queues but the state's
  difference; item 7, a change on one side only, received by an open room
  as any write; item 8, the conflict copy; item 13, the status bar; its
  property test), [0074](0074-accounts-and-access-on-the-server.md) (item
  8, the device session; roles), [0026](0026-core-ui-contract-inviolable-rules.md)
  (rule 1, the UI only through the contract; rule 2, latency and
  availability from the capabilities; rule 3, types generated from Rust),
  [0012](0012-files-are-source-of-truth.md), [0021](0021-sync-automerge-layered-config.md)
  (revised by 0073: a CRDT is the mechanism of a live session, never the
  stored form of a note), [0044](0044-verso-fs-semantics.md) (the watcher),
  [0065](0065-a-folder-per-window.md) (a folder per window),
  [0080](0080-the-trash-with-expiry-and-restore.md) (item 6, a restore
  into a room is a change from outside), [0081](0081-sharing-between-people-on-one-universo.md)
  (item 6, a share synced as a local folder; item 12, a share's room is
  the owner's folder's room, a reader present and not typing),
  [0029](0029-guardrails-in-ci.md) (a feature's guardrail seen failing
  first), [0035](0035-cross-cutting-requirements.md) (both languages,
  accessibility), [0078](0078-universo-the-name-of-verso-as-a-server.md)
  (UniVerso).
- Status in the briefing: not present; on acceptance.
- Revisions: 2026-10-12 (evening) — item 12 decided and built: every file
  a person edits in the window co-edits live — a note, any text file, a
  base, a board — on a server and over a synced folder's link alike. The
  maintainer, learning that only notes did: *"Então a gente não tá com a
  aplicação 100% cooperativa, né? Com coedição. Deveria estar. A gente
  ainda não fechou o universo."* (So the application is not 100%
  cooperative, with co-editing? It should be. We have not closed the
  universe yet.) The old wording of item 12 is kept, the decision below
  it; built on `feat/coedit-everything` (21d096a, 5a027db).

## Context

What exists, in two halves that do not meet.

**On the server, a room.** A note open in the windows of several people
is a room (`crates/verso-server/src/collab.rs`): a Yjs document in the
server's memory, whose place is the folder's key and the note's path.
Each window applies its edits to the document and sends the update; the
server relays it to the others and keeps presence (cursor and name)
without storing it. The file stays the truth ([0012](0012-files-are-source-of-truth.md)):
the room writes it with the atomic write 900 ms after the last edit
(`QUIET`), over the revision it last read or wrote (invariant 11), and
tells the windows `collab-saved` with the new revision. A window's
connection that drops leaves the room alive two minutes (`GRACE`), under
the same `epoch`, so that the window coming back sends what it typed
meanwhile and Yjs keeps each edit once; a room made again from the disk is
another epoch, and what was typed into the old one cannot go into it. A
change that reaches the file from outside the room — a device's sync, a
restore, Obsidian over the mount — enters the room as one edit when
nothing waits to be written, or stops the room with `collab-conflict` for
the people in it to choose (`changed_outside`, called by the server's
sync `told` since c19e968). ⌘S is `collab_save`; a reader joins, is seen,
and the server refuses its `collab_update`. The browser's window and the
desktop app on a server's folder **online** both join: the desktop
forwards `collab_*` over the window's connection (`app/src-tauri/src/remote.rs`),
and the window's side is one module (`app/ui/src/collab.ts`) whose tab
(`app/ui/src/leaves/note.ts`) shows the room's text, undoes only its own
edits, saves through the room, and ignores the disk while in a room
because the room brings every change in. The e2e test "two windows edit
one note at once and the file follows" covers it.

**On the desktop, a synced folder** ([0079](0079-sync-a-local-folder-with-a-server.md)).
A local folder kept in step with a server folder by a task of its own
(`app/src-tauri/src/sync.rs`): one WebSocket per synced folder over the
device session, the folder opened on it, passes on the watcher's batches,
the server's pushes, every five minutes and on reconnecting; each pass
compares the files here and there against the **base** (the hash both
sides last agreed on, kept outside the folder) and carries out a plan:
upload, download, delete, rename, or — when both sides changed since the
base — a conflict, the server's version under the name and the local one
beside it as a copy. The note's tab in such a folder edits locally: its
autosave writes the file through `write_note` 1.5 s after the last
keystroke, the watcher sees the write, sync uploads it. Two people editing
the same note in two synced folders see nothing of each other until a
save crosses, and when both saved before either side's change arrived,
one of them finds a conflict copy. No cursors, no merge. That is what the
maintainer asked about, and what [0073](0073-self-hosted-server-first.md)
item 10 leaves as it is until conflicts have been seen in use.

The two halves share a server, a session, a folder key and a path. What
is missing is the desktop's tab, on a synced folder, speaking to the room
while the server is reachable — and a precise account of who writes the
local file meanwhile, since two writers of one file (the room's saves
coming down through sync, and the tab's own autosave) would race and make
conflicts out of nothing.

## Decision

Proposed (2026-10-10); accepted 2026-10-11 (Status). Each `[OPEN]`
carried a recommendation; the maintainer decided. Open items answered
2026-10-10 (Status).

1. **A note of a synced folder is live while the server is reachable.**
   When a local folder syncs with a UniVerso ([0079](0079-sync-a-local-folder-with-a-server.md)
   item 1) and its sync is connected, a note opened in the desktop app
   joins the **same room** the browser and the online desktop use: the
   people see each other's cursors and names, the edits merge letter by
   letter, the server writes the file when they settle, and sync carries
   the result down to the local file. Offline, as today: edited locally,
   compared from the base on return, a conflict copy only when both sides
   changed the same note ([0079](0079-sync-a-local-folder-with-a-server.md)
   items 6 and 8). Nothing of the server's room changes shape for this: a
   room does not know a synced desktop from a browser.
2. **The connection is the sync's.** The room's traffic of a synced
   folder goes over the connection its sync already holds — the device
   session's WebSocket with the folder opened on it ([0079](0079-sync-a-local-folder-with-a-server.md)
   item 5) — never over one of the window's and never over a new one.
   Reasons: that connection is one per synced folder, exists exactly while
   the folder syncs, already hears the folder's pushes, and is the one
   whose state the status bar shows as synced or offline — a second
   connection could be up while sync is down, two truths about one
   folder; and a window on a local folder has no connection of its own to
   a server (`remote::of` is empty for it; the window does not know the
   folder syncs). On the host, the sync's task relays what it hears whose
   name starts with `collab-` to the folder's windows, and answers the
   folder's `collab_*` commands by sending them over its link, as the
   online folder's `forward` does.
3. **Through the contract, with nothing new** ([0026](0026-core-ui-contract-inviolable-rules.md)
   rule 1). The window keeps the six commands (`collab_join`, `_update`,
   `_awareness`, `_leave`, `_save`, `_resolve`) and the five events
   (`collab-update`, `-awareness`, `-saved`, `-conflict`, `-closed`); the
   desktop host, which answers them today with "simultaneous editing is a
   server's", answers them for a synced folder by its sync's link, and as
   today for one that does not sync or whose link is down. The window
   learns whether it may join from `capabilities` (rule 2): `collab` is
   among a local folder's capabilities while its sync's link is up, with
   `latency_ms` from that link; the window asks again when `sync-status`
   says the state changed (as it asks again on a role change today). No
   type changes shape; the generated bindings do not move (rule 3).
   *(Revised on 2026-10-12, recording what the maintainer ordered that
   day — "Ajuste todas essas pendências agora", "falei pra implementar
   tudo isso" — with the join-to-write of a note live only elsewhere,
   d86bce7:)* one command is added, read-only: `collab_present`, "is
   anyone in this note's room?". A write that is not a keystroke — a
   PDF's quote, a base's cell, the tree's sticker, label or order, a
   property from the panel — on a note this window does not hold live
   asks it; when someone is in, the write joins the room, makes its one
   edit on the room's text, has the room save, and leaves, instead of
   writing the file under the room and making a conflict copy on a
   synced folder. Without it the window would have to join blind, every
   time, to learn the same. It changes no type of the six commands or
   the five events; the generated bindings move by that one command
   (rule 3 still holds: generated from Rust, never written by hand). The
   server answers it from its rooms, a synced folder's sync link carries
   it, and the desktop on a server's folder forwards it.
4. **Identity and role: the device session's.** The person in the room is
   the account the device signed in as ([0074](0074-accounts-and-access-on-the-server.md)
   item 8); the name the others see is the account's name, as from the
   browser. The role is the folder's role as the sync's link learned it,
   followed on a role change. A **reader** ([0079](0079-sync-a-local-folder-with-a-server.md)
   item 1 syncs to read) joins, is present with cursor and name, and does
   not type: the tab is read-only as it is for a reader today, and the
   server refuses a reader's update as it does already. Two desktop apps
   of one person are two members with one name and one colour, as two
   browser tabs of one person are today; nothing distinguishes a device
   in the room.
5. **When a note joins and leaves.** It joins when all of these hold: the
   folder syncs and is not paused; the sync's link is up; the note opens
   in a tab for editing (a note with mixed line ends is read-only and joins
   nothing, as today); and item 7 has run. It leaves when the tab closes
   or reads another note, when sync is paused or turned off (the tab goes
   local, item 9), and when the link drops (item 9). Whether the window is
   focused does not matter: a tab behind another stays in its room and
   receives the others' edits, as a browser tab behind another does.
   `[DECIDED 2026-10-10]`: whether a note joins **on open**, or only **when someone else
   is already in it**. Recommended: **on open**. Joining later would mean
   switching the tab from local autosave into a room in the middle of
   typing, with unsaved local text — item 7's hard case, happening
   silently and at the worst moment — and the server would have to push
   each folder's presence to every device to say "someone is here now".
   Joining on open puts the hard case at open time, when the text is at
   rest; the server already makes a room from the disk on the first join,
   one Yjs document per open note; and a room with one member costs one
   write per settled burst, as the local autosave does — decided
   2026-10-10: a note joins its room on open.
6. **Who writes the local file while the note is in a room: sync, and no
   one else in Verso.** The room's saves land on the server, the change
   log records them, the server pushes `sync-changed`, the sync's pass
   downloads them over the local file — atomically, through `verso-fs`,
   over the hash the pass saw (invariant 9, and invariant 11 held by the
   pass). The tab **writes nothing locally** while in a room: its autosave
   is the room's save (`collab_save`), as the browser's tab does already,
   and `write_note` never runs from a tab in a room. The tab's revision is
   the server's, from `collab_join` and `collab-saved`, and the tab
   ignores the watcher's news of the local file while in a room, as it
   ignores them in the browser: the room brings every change in. So the
   local file has one writer in Verso and invariant 11 never fires on the
   room's own saves; what it can still fire on is a program outside Verso
   (item 11). The host keeps, per folder, the set of paths its windows
   hold in rooms, and for each the hash of the last text the tab wrote
   locally itself — empty while online, set by item 9's fallback — and the
   pass reads it: a local change whose hash is that one is the tab's own,
   already in the room, and is **neither uploaded nor a conflict**; the
   server's save is downloaded and the base follows. A local change with
   any other hash is from outside, item 11.
7. **Entering a room with unsynced local edits.** The local file may
   differ from the base at open time — edited offline, or edited a moment
   ago by Obsidian and not yet uploaded. Three ways were weighed. *Refuse
   to join and say why*: safe, and it takes the live note away exactly
   when it would matter, for a reason that is sync's timing. *Apply the
   local text into the room as an update*: the room's text and the local
   text differ, the device keeps the base's hash and not its bytes
   ([0079](0079-sync-a-local-folder-with-a-server.md) item 3), so there is
   no three-way merge — the local text would replace the room's differing
   middle, over whatever someone else is typing there, a silent overwrite.
   *Upload first*: the sync's ordinary pass on that path, with the base —
   the server unmoved since the base, the local text is uploaded and the
   join finds it (in a room already open there, it enters as a change from
   outside, [0073](0073-self-hosted-server-first.md) item 7); both moved,
   a conflict copy as [0079](0079-sync-a-local-folder-with-a-server.md)
   item 8 makes it, the server's version keeping the name and the tab
   joining its room, the copy listed in the folder's conflicts and said.
   **Decided: upload first.** The join waits for the pass on that path,
   bounded by a few seconds, the status bar saying "sending 1"; with the
   link down there is no join and the tab is local.
8. **The connection drops while the note is in a room.** The sync's link
   closes; the host tells the folder's windows, and each tab in a room of
   that folder **keeps its text** — the Yjs document's, with the edits the
   room had not saved yet — and **goes local**: it reads the local file
   for its revision, keeping the text; it is dirty when the two differ;
   and its ordinary autosave writes the text through `write_note` over
   that revision, which is the file's current one, so invariant 11 holds
   and nothing typed is lost — it is in the local file within the
   autosave's delay. Presence is cleared, the status says the note is
   local and why (item 14). The Yjs document stays bound to the editor,
   so typing offline goes on updating it: that is what item 9 sends back.
   On the server the room is written when it empties and kept two minutes
   ([0073](0073-self-hosted-server-first.md) item 7's `GRACE`).
9. **Coming back online.** The link is made again; before the first pass
   touches a path a tab holds in a room, the host tells the windows and
   each such tab rejoins, as the browser's does; the pass waits for those
   answers, bounded by a few seconds (a tab that does not answer is taken
   to have left, and the ordinary comparison applies — which makes a copy,
   never loses). **The same epoch**: the tab sends its whole Yjs state and
   Yjs keeps each edit once, so what was typed offline merges letter by
   letter with what the others typed meanwhile; the room saves; the
   server's file changes; the pass downloads it over the local file, which
   holds the tab's own fallback text — the hash item 6 remembers — so it is
   not a conflict. **Another epoch** (longer than the grace, the server
   restarted, the note renamed): the tab leaves the room and keeps its
   text, which the fallback already put in the local file, and tells the
   host the path is out of its rooms; the pass compares the file from its
   base — the server unmoved, an upload; both moved, a conflict copy, the
   server's under the name — and the tab then joins the room anew over the
   server's version, the copy beside it and said. Unlike the browser's
   "could not be kept", the desktop keeps every version: in the file or in
   the copy. *(Clarified on 2026-10-23, after a report of a conflict copy
   in a note only one device had edited:)* "the server unmoved" includes
   the server's file being the **tab's own room's save** that the pass had
   not fetched when the link went — the room writes every settled burst and
   the pass runs behind it, so on a restart the server's file is often a
   few seconds older than the tab's text. The room tells every save with
   the hash of the file it wrote; the host remembers the last ones it
   heard, and when the server's file has one of those hashes and the local
   file is a text the tab wrote after hearing it, the server's file is an
   earlier state of the tab's own text: the pass sends the local text over
   it, with no copy. A server file the room did not tell this device of —
   another person's, or a save the link dropped before telling — is still
   two changes, and a copy.
10. **Pause and turn off.** Pausing sync, or turning it off, takes every
    note of the folder out of its room by item 8's fallback: the text
    kept, the local file its own again. Resuming is item 9 with another
    epoch in the common case, through sync's ordinary comparison.
11. **A program outside Verso edits the local file while the note is in a
    room** — Obsidian on the same computer, a script. The watcher reports
    it; the tab in the room ignores it (item 6); the pass finds a local
    change whose hash is not the tab's own, so it is a change from outside
    on the device and sync uploads it as any ([0079](0079-sync-a-local-folder-with-a-server.md)
    item 7): the server's file unmoved since the base, the upload lands,
    `told` reaches the room, and it enters the room as one edit when
    nothing waits to be written, or stops the room for the people in it
    to choose ([0073](0073-self-hosted-server-first.md) item 7); the
    server's file moved since the base — the room saved meanwhile, which a
    live note does every settled burst — the upload is refused as changed
    and the next pass makes a **conflict copy** of the outside version
    beside the note, the room's version keeping the name ([0079](0079-sync-a-local-folder-with-a-server.md)
    item 8), the tab staying in the room, the copy listed and said.
    Honest, and the limit of a per-file sync: merging that outside edit
    into the room needs the base's bytes for a three-way merge, which is
    the later work of Consequences.
12. **Rooms are for notes.** A `.md` file with one kind of line end joins;
    nothing else does. The board's co-editing was `[OPEN]` (decided and built 2026-10-12, see below) in
    [0073](0073-self-hosted-server-first.md) item 7 (left open on
    2026-10-10); boards, bases,
    canvases, attachments and the folder's settings cross by sync as
    files, and two people on one board in two synced folders end as
    [0079](0079-sync-a-local-folder-with-a-server.md) item 8 says.
    *(Decided and built on 2026-10-12, the old wording kept above.)* The
    maintainer, on the evening of 2026-10-12, learning that only notes
    co-edited live: *"Deveria estar"* — build it now, nothing partial.
    **Every file a person edits in the window has a room**, on a server
    and over a synced folder's link alike, under items 1 to 11 and 13 to
    15 as a note's:
    - **A text file** — `.txt`, `.json`, `.csv`, a base's `.base`, a
      page's source, any file the window opens in its source editor — is a
      room as a note is: one Yjs text bound to the editor, read and written
      as text, a write from elsewhere merged through the room. A base
      changed from its view's settings (filters, columns, sorts, views)
      changes the editor's text, so it goes in as typing does.
    - **A board** (`.canvas`) is a room of its elements: a Yjs map with an
      entry per element and version (`id`, `version`, `versionNonce`), the
      element as JSON, beside the facts of the file it was made from.
      **The merge rule is Excalidraw's own reconciliation**: two people
      changing different elements both land; on the same element the
      higher `version` wins, a tie goes to the lower `versionNonce`, the
      same on every side whatever order the edits came in. A deletion is
      the element with `isDeleted` — a tombstone, never removed — sent a
      million versions ahead, so a drag made at the same time, which counts
      its versions up from where it started, does not bring it back; an
      undo made after it counts from the deletion's version and wins. The
      pictures a board shows are files of the folder: their references
      cross with the elements, their bytes as files. Presence is the
      pointer, the selection, the name and the colour, stamped by the
      server (threat model, gap 11), drawn as Excalidraw's collaborators.
    - **Who writes a board's file.** The server cannot draw a board: the
      first window to join draws the file the room was made from and puts
      it in, which is no one's edit (opening writes nothing, invariant 7);
      each window that edits hands the room the file its own converter
      makes of the room's state, with that state's Yjs vector
      (`collab_canvas`). The room writes the file made of exactly the state
      it holds — the converter's output of the merged scene — through the
      core's board writer, atomically and over the revision it read
      (invariants 9 and 11), when its edits settle and on `collab_save`; the
      folder's change log has the save before the windows hear it. An edit
      made in the room is never a conflict copy. A change from outside
      while edits wait stops the room for the people in it to choose, as a
      note's does; with nothing waiting the room closes and the windows draw
      the file again.
    - **The contract** gains, beside item 3's `collab_present`, the room's
      kind in `CollabJoin` (`text` or `board`) and the command
      `collab_canvas`; the bindings are generated from Rust (rule 3).
    - **Not in a room**: a canvas in another layout, until its first save,
      shown as a diff, puts it in Obsidian's ([0057](0057-board-json-canvas.md)
      point 13); a board of a later Verso, shown and never written; a file
      whose line ends are mixed, read-only as a note's; and a drawing of the
      Excalidraw plugin, which the window shows and never edits
      ([0057](0057-board-json-canvas.md) point 5) — its text is a note,
      live as notes are, and the drawing shown follows the room's saves.
    - **Limits** (`docs/reference/threat-model.md`): a board update of 4 MB
      and 10 000 entries at most; a board room of 100 000 entries and 64 MB;
      a file handed to it of 16 MB; a presence of 16 KB, as a note's.
13. **A share, and a reader.** A receiver who synced a share as a local
    folder ([0081](0081-sharing-between-people-on-one-universo.md) item 6)
    joins the **owner's folder's room**: the room's place is the owner's
    folder key and the full path, which the share resolves to ([0081](0081-sharing-between-people-on-one-universo.md)
    item 12). The receiver's role in the share is the room's role: a
    reader present and not typing, an editor typing. Nothing else of the
    share crosses through the room: presence names people, not paths.
14. **What the person is told, and accessibility** ([0035](0035-cross-cutting-requirements.md)).
    The note's state is said in words, in the status bar beside the sync
    state ([0079](0079-sync-a-local-folder-with-a-server.md) item 13) and
    in the tab: *live, with Ana and Bia* — *ao vivo, com Ana e Bia* —,
    *live, alone*, *local — offline*, *local — sync paused*, *catching
    up…* while item 7's upload runs. The others' cursors carry their names
    as text, never a colour alone. A live region announces, for a screen
    reader, someone joining or leaving the note, and the note going local
    or live, with the reason ("The note is now local: the connection
    dropped; your text is saved on this computer"). The folder's Sync
    section in Settings shows the same state and holds item 15's setting.
    pt-BR and English throughout.
15. **On by default.** `[DECIDED 2026-10-10]`: whether live co-editing is on for every
    synced folder, or opt-in. Recommended: **on**, with a setting per
    synced folder, "Edit notes together while online" — *Editar notas
    junto enquanto online* — in the folder's Sync section, off meaning the
    folder stays as [0079](0079-sync-a-local-folder-with-a-server.md)
    alone: local editing, conflicts as copies. It is the person's layer
    ([0070](0070-what-travels-with-the-folder.md)), not written into the
    folder. On by default because it is the point of syncing a folder
    with people, and because the fallback is the behaviour of today —
    decided 2026-10-10: on by default, with the per-folder setting "Edit
    notes together while online" — *Editar notas junto enquanto online*.
16. **Tests.** Rust, against a real server as `tests_sync.rs` does, with
    no window: two synced devices and a third client playing the browser
    in one room, each seeing the others' edits and the two local files
    following the room's saves; a drop and a return within the grace
    (same epoch: nothing lost, no copy) and after it (another epoch: the
    copy made, nothing lost); a change by an outside program on a device
    while its note is live (merged into the room, or the copy made); a
    reader present and refused; sync paused with a live note. The window's
    part in the harness e2e (`app/ui/e2e`): the status words, the fallback
    keeping the text and saving locally, the rejoin, the setting; a
    harness that answers `collab_*` and emits `sync-status`. **The
    feature's guardrail, seen failing first** ([0029](0029-guardrails-in-ci.md)):
    a **new** property test beside [0079](0079-sync-a-local-folder-with-a-server.md)'s,
    not an extension of it — that one lives in `verso-core` with the
    engine alone and has no room and no `yrs`; this one lives with the
    server's rooms — in which two devices and a room, typing at random in
    the room and outside it, dropping and returning, and syncing in random
    orders, end with the same files and lose no edit: every text typed
    into the room is in the file, every lost version is a conflict copy.
    Seen failing with the fault planted of item 9's pass treating a
    rejoined path as a conflict.

## Consequences

- The desktop host: the sync's task relays `collab-*` events to the
  folder's windows and answers `collab_*` over its link; a local folder's
  capabilities say `collab` and the link's latency while the link is up;
  per folder, the paths in rooms with the tab's last own hash, read by
  the pass (item 6); the join waiting for the pass on its path (item 7);
  the rejoin before the first pass (item 9); the fallback on drop, pause
  and off (items 8 and 10).
- The server: nothing of the room changes; a room does not know a device
  from a browser. The reader's refusal exists already.
- The window: the fallback that keeps the text, re-reads the revision and
  saves locally; the other-epoch path of the desktop, which keeps instead
  of discarding; the status words and the live region; the folder
  setting; both languages. The changelog gets its line. The demo vault
  cannot show a server and the walkthrough says so, as [0081](0081-sharing-between-people-on-one-universo.md)
  does; `docs/reference/manual-checks.md` gains the two-computer live
  note beside its sync check.
- [0073](0073-self-hosted-server-first.md) item 7 gets a Revisions line
  on acceptance: the desktop app on a synced folder joins while online.
  [0079](0079-sync-a-local-folder-with-a-server.md) items 7 and 8 get
  one: a note live on the device makes no conflict copy of its own text;
  the copy remains for offline edits and for outside programs.
- **Later, its own ADR**, not this one: **merge by block of offline
  edits** — a paragraph each, so that two people who edited one note
  offline do not end with a copy when their changes do not touch — and,
  with it, the three-way merge of an outside program's edit into a live
  room (item 11), both needing the base's bytes kept, not only its hash.
  [0073](0073-self-hosted-server-first.md) item 10 puts it after
  conflicts have been seen in use; `[OPEN]`, recorded here so that it is
  not forgotten. On 2026-10-10 the maintainer kept it for later: it needs
  the base's bytes.

## Discarded alternatives

- **A connection of its own for the rooms, per window or per note**
  (raised by the author, item 2): two truths about whether the folder is
  online, the device's sessions doubled, and nothing it gives that the
  sync's link does not.
- **Refusing to join with unsynced local edits** (raised by the author,
  item 7): the live note taken away for sync's timing.
- **Applying the local text into the room as an update** (raised by the
  author, item 7): no base to merge from, so an overwrite of what someone
  else is typing.
- **Discarding what was typed when the room is another** (the browser's
  behaviour, considered for the desktop in item 9): the desktop has the
  file; nothing is discarded.
- **Joining only when someone else is in the note** (raised in the
  session's brief; item 5): kept open for the maintainer, with the
  reasons against it; the maintainer chose joining on open on 2026-10-10.
- **Merge by block now** (raised by the maintainer's question, as the
  gap this ADR narrows): [0073](0073-self-hosted-server-first.md) item 10
  puts it after conflicts have been seen in use; Consequences.

## Status

**Accepted (2026-10-11).** Open items answered 2026-10-10 as recommended;
read by Opus 5.5 (the handoff of 2026-10-10 and the answers' reading);
accepted by the maintainer on 2026-10-11 (*"Mas eu tinha confirmado"* to
the recommendations). The board's co-editing stayed `[OPEN]` on purpose (decided and built 2026-10-12, below)
(item 12); merge by block of offline edits stays later, for its own ADR.

**Built on the night of 2026-10-11 to 12** (f0d7398, 807c8c9, 2de0737, cb7b29d and 5add311, merged into `feat/universo` by 817886e on 2026-10-12); [0073](0073-self-hosted-server-first.md) item 7 and
[0079](0079-sync-a-local-folder-with-a-server.md) items 7 and 8 got
their Revisions lines on 2026-10-12, as Consequences asks. The open
questions the building raised were sent to the maintainer the same night,
and answered (below): where item 15's setting lives; the waits of
5 s for the upload before a join (item 7) and of 4 s for the rejoins
before a pass (item 9); the writes the properties panel and a
PDF's quote make to a note, through the room; and the board (item 12).

**Item 12 decided and built on 2026-10-12** (evening; 21d096a and 5a027db
on `feat/coedit-everything`): every file a person edits in the window
co-edits live, the board by Excalidraw's own rule, as item 12 now says.
The maintainer: *"Então a gente não tá com a aplicação 100% cooperativa,
né? Com coedição. Deveria estar. A gente ainda não fechou o universo."*
[0057](0057-board-json-canvas.md) and [0073](0073-self-hosted-server-first.md)
item 7 got their Revisions lines the same day. Stressed the same night at
the maintainer's request (*"tenho receio de quebrar algo em edições
conjuntas"*): five clients on one board against a real server, 200 seeds
of 200 changes (`tests_board_stress.rs`); five windows with the window's
own code, 200 seeds of 200 changes (`boardStress.test.mjs`); three
browser windows, two engines, a minute of random work, four seeds (the
server's end-to-end suite); and the file read back by Obsidian 1.14.4
(`docs/reference/obsidian-observations.md` §18). Three faults found and
fixed at their cause: the server's `yrs` left some updates heard out of
order unplaced (692b2ed); a deletion not yet sent was undone on the board
by a drag heard meanwhile, and the board took a version equal to one heard
for the room's (24d65d2).

**Answered by the maintainer on 2026-10-12** (01:15 BRT), item by item: item 15's setting stays in the window's settings; the 5 s and 4 s
waits stand, to be tuned with use; the writes the properties panel and a
PDF's quote make to a live note go through the room — decided, built
2026-10-12: each goes in as one edit of the tab's editor, as typing does,
and the room writes the file; with them the other writes of a property
that are not keystrokes — a sticker, a colour or a cover, a base's cell,
the tree's label and order; a note that is not live is written as
before; and the board's co-editing was decided and built that evening (item 12).

*(History, before the acceptance above:)* Proposed on 2026-10-10. The
maintainer approved the direction in session;
the items are the author's. To be read by Opus 5.5 before it is accepted.
For the maintainer, each with a recommendation: whether a note joins on
open or only when someone else is in it (item 5; on open); whether live
co-editing is on by default for synced folders (item 15; on, with a
setting per folder to keep it local-only); and, for its own ADR, merge by
block of offline edits (Consequences).

Open items answered 2026-10-10. The maintainer, in session, to the recommendations above: *"Gostei das recomendações, pode seguir"* —
item 5 and item 15 decided as recommended, in place; the board's
co-editing was `[OPEN]`, decided and built 2026-10-12 (item 12, [0073](0073-self-hosted-server-first.md)
item 7); merge by block of offline edits stays later, for its own ADR, as
it needs the base's bytes (Consequences).
