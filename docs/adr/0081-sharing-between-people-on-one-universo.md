# ADR 0081 — Sharing between people on one UniVerso: a vault, a folder inside it, read or write

- Date: 2026-10-10
- Source: the maintainer, in session on 2026-10-10: *"assim como acontece no
  Notion, deveria sim ser possível compartilhar uma pasta ou até um
  documento. O documento é opcional, só se não der trabalho. Se fizer mais
  sentido, pode ser só a pasta, que aí é quem estiver gerenciando se vira
  organizando em pastas. E isso aparecer em algum canto, sei lá, em
  compartilhados… O Sérgio tem o vault dele, a Ana vai ter o vault dela.
  São dois usuários sincronizando seus vaults… dentro do servidor único… E
  o Sérgio, ele pode compartilhar uma pasta com a Ana, e a Ana compartilha
  uma pasta com o Sérgio, com as duas opções, modo leitura, modo escrita. E
  isso ser registrado… tem que ver como que vai ser essa experiência de
  dois usuários, cada um com seus vaults… se um compartilhar com o outro,
  como que vai ficar essa visão ali? Como vai aparecer? Porque deveria ser
  possível compartilhar uma pasta. Assim como deveria ser possível
  compartilhar um vault todo."* And, for after this: *"num próximo passo…
  histórico de mudança de arquivos… não esquece"* (Consequences). Written
  by Fable 5.1 at the maintainer's request (*"bota uma instância do Fable
  aí pra escrever isso"*), a swap of the roles of
  [0032](0032-author-and-reviewer-roles.md) as [0073](0073-self-hosted-server-first.md)
  was; to be read by Opus 5.5 before it is accepted.
- Related: [0074](0074-accounts-and-access-on-the-server.md) (the folder as
  the unit of access, roles owner, editor, reader, grants by the owner or
  by invitation, the audit log, tokens by folder — extended here to a path
  inside a folder), [0073](0073-self-hosted-server-first.md) (item 3, the
  session and its role checked before `verso-fs` acts; item 7, rooms;
  its Status leaves "permissions finer than the folder" `[OPEN]` — this ADR
  answers the folder-inside-a-folder part, not per note or per block, spec
  Q9), [0026](0026-core-ui-contract-inviolable-rules.md) (rule 4: a note is
  named by its path relative to the open folder; `..` never crosses),
  [0010](0010-folder-is-the-unit-no-vault.md) (the open folder is the unit
  of work), [0065](0065-a-folder-per-window.md) (a folder per window),
  [0041](0041-multi-root-workspace.md) (several roots in one window,
  Proposed), [0062](0062-focuses.md) (named roots inside one folder),
  [0079](0079-sync-a-local-folder-with-a-server.md) (one local folder with
  one server folder), [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (quotas, the console), [0080](0080-the-trash-with-expiry-and-restore.md)
  (the trash of a share), [0070](0070-what-travels-with-the-folder.md)
  (what is the folder's, what is the person's), [0066](0066-mcp-sees-boards-relations-properties-bases.md)
  (the MCP under the same roles), [0045](0045-server-and-mcp-security.md)
  (another member's note as a boundary), [0036](0036-tabletop-rpg-support.md)
  (the table of players, the case that asked for this),
  [0035](0035-cross-cutting-requirements.md) (both languages,
  accessibility), [0078](0078-universo-the-name-of-verso-as-a-server.md)
  (UniVerso).
- Status in the briefing: not present; on acceptance.
- Revisions: 2026-10-12 — the maintainer's answers to the five questions
  the building raised (Status), each recorded in its item, dated: items
  4, 8 and 11. Two of them, both in item 11, were decided and are now built (2026-10-12);
  the one in item 8 was built that night.
  2026-10-21 — items 4 ("links anyone may open: not now") and 17 ("a single
  document: not in the first version") are revised by
  [0105](0105-read-links-without-an-account.md), Accepted that day: a read
  link without an account on a folder or on one note, off on a new server;
  sharing one note **to write** stays as item 17 left it.
  2026-11-04 — item 4: a game master the admin lets make folders may
  invite people who have no account into tables of their own folders, by
  [0117](0117-this-app-is-a-universo-server.md) D14 (e) (the maintainer,
  *"confirmo tudo"*); the 2026-10-12 answer ("only the admin invites")
  holds for everything else.
  2026-10-21 (review of the afternoon batch; answered 2026-10-22, below,
  question T.9 of the decisions list of the afternoon; the answer is below)
  — item 5 says "names and keys, no path", and the folder switcher now shows a
  `place` label per recent folder: the last two components of its parent
  folder, never absolute, never `..` (see the same-date line in
  [0026](0026-core-ui-contract-inviolable-rules.md), rule 4). Whether the
  label revises item 5 is his to say.
  2026-10-22 — the maintainer answered T.9 and T.10 of the afternoon list.
  T.9, option A: the `place` label is accepted as a display label, recorded in
  [0026](0026-core-ui-contract-inviolable-rules.md) (rule 4); item 5's text is
  unchanged. T.10, option A (built): the folder switcher gets an ×
  on a recent folder that **hides it from the list** (nothing is deleted), and
  Settings gets "Mostrar pastas ocultas" (show hidden folders) to bring them
  back.

## Context

What exists ([0074](0074-accounts-and-access-on-the-server.md)): on a
UniVerso the unit of access is a **folder** — a vault — with a random id
and a directory under the folders root; an account holds a role in it,
owner, editor or reader, granted by an owner (by e-mail of an existing
account) or carried by an invitation; the grant is audited; a reader only
reads; an admin has no role until one is granted. The desktop app opens a
server's folder online, or syncs a local folder with one server folder
([0079](0079-sync-a-local-folder-with-a-server.md) item 1). The browser's
window lists the folders the person may enter and opens one. A folder's
members are managed by the owner in Settings › Account › Folders, and by
the admin in the console.

So **sharing a whole vault exists**: Sérgio grants Ana *editor* on his
folder, and it appears in her list. What does not exist is sharing **part
of it**. Notion's model, which the maintainer named, is a tree where any
page can be shared with a person in read or write, where what was shared
with me appears under "Shared", and where a child inherits the parent's
sharing. The maintainer asks for the folder; the single document only if
it costs little.

The scene is two people, each with a vault of their own, syncing to the
same server, and each sharing a folder of theirs with the other. The
questions are what the receiver sees and where, what the owner sees, what
a role means inside part of a folder, and how the server keeps what was
not shared from leaking through search, links, backlinks, the graph, the
rooms and sync.

Two ways to build a shared sub-folder were weighed:

- **(A) Served as a folder of its own**: the sub-folder is registered as a
  second folder of the server whose directory lies inside the owner's —
  a second root. Everything existing works unchanged for the receiver (a
  folder id, a role, a window, sync), and nothing works right for the
  server: two indexes walk the same files, two watchers report the same
  change, a note open in a room is two rooms over one file (the room's
  place is the folder key and the path), the change log records every
  write twice, the quota counts the files twice, and the owner's rename
  of the sub-folder orphans the second root's directory.
- **(B) A grant on a path inside one folder**: the grant of
  [0074](0074-accounts-and-access-on-the-server.md) gains a path; a
  receiver's commands are checked against the roles whose path covers
  theirs, and every answer is filtered to those paths. One index, one
  watcher, one room, one log, one count — and nothing else exists for the
  receiver: no id to open, nothing for sync to point at, no place in the
  lists, and the owner's whole tree would have to cross so that a prefix
  of it could be shown.

## Decision

Proposed (2026-10-10); accepted 2026-10-11 (Status). Each `[OPEN]`
carried a recommendation; the maintainer decided. Open items answered
2026-10-10 (Status).

1. **A share is a grant on a path.** A grant becomes *folder, account,
   path, role*: the path is `""` for the whole folder — every grant of
   today — or a folder inside it. The roles are
   [0074](0074-accounts-and-access-on-the-server.md)'s: a share is
   **read** (*reader*) or **write** (*editor*) — the maintainer's two
   modes; *owner* exists only at `""`. A whole vault and a folder inside
   it are shared by the same gesture, and "share a whole vault" is the
   existing members list given this ADR's words and places.
2. **The receiver sees a folder of their own; the server keeps one
   folder.** This takes (A)'s experience on (B)'s storage. A share has an
   **id** of its own in the server's database, and to the receiver it is
   a folder: it is listed, opened, synced and addressed by that id, and
   every path that crosses the contract is relative to the shared folder
   ([0026](0026-core-ui-contract-inviolable-rules.md) rule 4, unchanged).
   On the server the share resolves to *the owner's folder, the path, the
   role*: the session that opens a share holds the path beside the folder
   key, every command's paths are joined to it and confined (`..` is
   refused where it is refused today, before `verso-fs` acts,
   [0073](0073-self-hosted-server-first.md) item 3), and every answer —
   the tree, a listing, a search, backlinks, the graph, a base's rows,
   the change log — is filtered to the path and re-rooted at it. The
   files are read and written once, by the owner's folder's `verso-fs`;
   the index, the watcher, the rooms and the change log are the owner's
   folder's. Attachments are served at `/f/<share-id>/<relative path>`
   behind the same check.
3. **What a share is named**, for the receiver: the shared folder's name
   and the owner's — "Campanha (Sérgio)". Only the last component crosses:
   the owner's path above it is theirs. `[DECIDED 2026-10-10]`: whether the owner may
   give a share a name of its own. Recommended: no, in the first version
   — decided 2026-10-10: no name of its own in the first version.
4. **Who shares, with whom.** The **owner** of the folder shares; an
   editor does not, and a receiver does not re-share (`[DECIDED 2026-10-10]`;
   recommended so, as the audit log then has one author per share —
   decided 2026-10-10: only the owner shares; a receiver does not
   re-share). The
   receiver is an account on the same UniVerso, named by e-mail, or a
   person invited: [0074](0074-accounts-and-access-on-the-server.md) item
   4's invitation, which already carries a folder and a role, carries a
   path too, so "invite a player to the campaign's folder" is one link.
   Links that anyone holding them may open are not in this ADR
   (`[DECIDED 2026-10-10]`, for when asked; a server of private notes starts without
   them — decided 2026-10-10: not now). *(Decided 2026-10-12, Revisions:
   only the admin invites a person who has no account.)* *(Revised
   2026-11-04, Revisions: an account the admin lets make folders may also
   invite people into tables of its own folders — readers, audited, in the
   console's invitations — per [0117](0117-this-app-is-a-universo-server.md)
   D14 (e); not built.)* *(2026-11-13: built, `205cdfb8`; 0117's D14 (e)
   is now its D7 (e), which adds at most 20 pending per game master, an
   account made by their link starts without making folders, and the
   power taken away ends their pending invitations.)*
5. **Where it appears.** A section **"Shared with me"** — *Compartilhados
   comigo* — in every place that lists a person's folders: the browser's
   folder picker and Settings › Account › Folders; the desktop app's
   Settings › Servers, under each server; the phone, which is the
   browser. Each entry shows the name of item 3, the role and the owner.
   A whole folder someone else owns, where the person is editor or
   reader, moves into that section too: "my folders" are the ones I own.
   The owner has **"Shared by me"** in the same places: each share with
   its path, the people and their roles.
   **The folder switcher** — decided 2026-10-10, built with this ADR: in
   the desktop app and in the browser, the folder switcher at the top of
   the side bar groups the folders under "On this computer", "Mine" and
   "Shared with me" — *Neste computador*, *Meus*, *Compartilhados
   comigo*.
6. **How the receiver uses it.** Online, in the browser or in the desktop
   app connected to the server, as any folder of the server; and
   **synced**, in the desktop app, as a local folder of its own
   ([0079](0079-sync-a-local-folder-with-a-server.md) item 1 holds: one
   local folder, one share), read-only when the share is read-only, as
   item 1 of 0079 already does for a reader. A share opens in a window of
   its own ([0065](0065-a-folder-per-window.md)).
   `[OPEN]`: whether a share may appear **inside** the receiver's own
   vault, as a sub-folder of it. *(2026-10-31: to be discussed with the
   maintainer on 2026-11-02; unchanged meanwhile.)* Recommended: **no**. It would be one
   local folder syncing with two server folders, against 0079 item 1; the
   receiver's index would hold the owner's notes and their links would
   resolve across the two, the questions [0041](0041-multi-root-workspace.md)
   has not answered; Obsidian opening the receiver's vault would read
   the owner's notes as the receiver's; and a deletion of the sub-folder
   by the receiver would be a deletion in the owner's folder. Seeing
   one's vault and a share side by side in one window is 0041's, when it
   comes; until then a focus ([0062](0062-focuses.md)) stays inside one
   folder, and a share is a window — decided 2026-10-10: a share never
   appears inside the receiver's vault; synced, it is a local folder of
   its own ([0079](0079-sync-a-local-folder-with-a-server.md) item 1).
7. **What the owner sees.** In the file tree, a shared folder carries a
   mark (people), and its menu has **"Share…"** — *Compartilhar…* —
   which opens the share: who has access, in which role, add a person,
   change a role, remove; the whole folder's members are the same dialog
   on the root. Settings › Account › Folders and the console's folder
   page list the folder's shares by path, with their people.
8. **Revocation.** The owner removes a person or the whole share; the
   receiver's open windows are told at once, as a role change is today,
   and the share leaves their lists. A local folder the receiver synced
   stays on their computer as it is, its sync off and saying why
   ([0079](0079-sync-a-local-folder-with-a-server.md) item 1's rule for
   turning sync off): what was downloaded was theirs to keep from the
   moment it was shared, and the dialog says so to the owner at the
   moment of sharing, in one line. *(Decided 2026-10-12, Revisions: the
   revoked share's sync turns off on the receiver's device with a notice;
   being built that night, on `feat/universo-small`; built in 873921a,
   merged by 97bb3a3.)*
9. **Audit.** A share created, changed and removed, and an invitation
   that carries one, are entries of the audit log with the path
   ([0074](0074-accounts-and-access-on-the-server.md) item 9), read by
   the owner and by the admin; writes inside a share are the folder's
   writes, with their actor, in the change log ([0079](0079-sync-a-local-folder-with-a-server.md)
   item 4) as they are today.
10. **Quota.** The owner's folder's ([0077](0077-the-server-administration-console-and-folder-quotas.md)):
    a receiver's write grows the owner's folder and is refused by the same
    rule with the same words; the receiver sees the folder's quota
    warning as an editor does. A receiver's own folders are not touched.
11. **What the receiver's window may not know.** Search, backlinks, the
    graph, tags, properties and a base's rows answer only with notes
    inside the share; a note outside is not a result, not a node, not a
    backlink. A link from a shared note to a note outside the share
    resolves to a distinct state, **"not in what was shared with you"**,
    shown like an unresolved link and never creating a note: the name is
    already in the note's text, written by the owner, and nothing more
    crosses — not whether it exists, not its path, not its content. An
    embed of a note or an image outside the share shows the same words in
    its place. `[DECIDED 2026-10-10]`: a shared folder whose notes embed attachments
    kept outside it — Obsidian's default attachment folder at the vault's
    root is the common case — shows those words where the pictures
    should be. Recommended: when sharing, the owner is told which
    attachments the notes embed lie outside the folder and may **add the
    attachments folder to the share, read-only**: a share may then hold a
    second path, and the model of item 1 already allows it (one grant per
    path, same share id). Not in the first version if it costs the
    round; said in the dialog either way — decided 2026-10-10, as
    recommended: when sharing, the owner is told which attachments lie
    outside the shared folder and may add the attachments folder to the
    share, read-only.
    *Decided 2026-10-12 (Revisions):*
    **a receiver's rename rewrites the owner's links outside the share**,
    as Notion updates them (*"no Notion atualiza, imagino que vamos
    precisar também"* — Notion updates them, I imagine we will need it
    too) — built 2026-10-12: a rename or a move through the share, in a
    window or by the receiver's synced device, has the server write the
    rewrites of the owner's notes outside the shared folder itself, by
    the rules of a window's rewrite (over the revision the rename read,
    atomically, within the quota; a note open in a room or changed since
    is left as it was), each in the folder's change log with the
    receiver as its author and told to the owner's windows and devices
    as any change made on the server; the receiver hears only of the
    notes inside, and the server's log says what was written and what
    was left; and **the aggregates a receiver sees — the index's counts,
    a base's formulas — are zeroed** — built 2026-10-12: each counts
    only what is inside the share — the status bar's notes are the
    share's; a base through the share is evaluated over the shared folder
    (and its attachments folder) alone, so its rows, total, property
    names, formulas (a backlink from outside included) and summaries
    are the share's; tags, backlinks, outgoing links and the graph were
    already filtered — and what cannot be scoped is zero, never the
    folder's total: an index run's counts pushed with a change; a walk's
    progress crosses without its count, and the window says
    *Indexing…* with no number.
    *Decided the same day:* attachments
    loose at the vault's root stay outside a shared sub-folder, as there
    is no attachments folder to add, and the sharing dialog asks the owner
    to move them into one; sharing the whole vault has no such limit.
    *As built 2026-10-27 (a board's card paths):* **the paths inside a
    board's content cross the share boundary like every other path.** A
    card of a board (ADR 0057) names its note by `file`, a path from the
    root of the owner's folder, matched exactly; the room and the file on
    the server hold only those. Through a share, the window's side is the
    share's: `crates/verso-server/src/share_board.rs` re-roots a card's
    path at the share on the way out and joins it to the share's on the
    way in, by the same rule as `Scope::to_full` (no `..`, nothing
    absolute, so an edit can name nothing outside the share). A card of a
    file outside the share is told as the locked card every veiled card
    has (no path, no name, one text whatever the reason); the locked card
    is the file's, not the window's: a save gives it back as it was, and a
    card the window dropped is not deleted. The player's shadow of a
    board room is kept per account **and share** (one account may be in
    the board through the whole folder and through a share), holds the
    share's paths, and what it gives the room it gives in the owner's.
    `read_text`, `write_text`, `write_board`, `board_preview`,
    `read_file_text` and `links` of a board do the same; the revision is
    always that of the bytes on disk, and only the `file` strings of the
    text are rewritten (invariant 7). *(2026-10-31: whether it waits for
    after V1 was to be discussed with the maintainer on 2026-11-02; decided
    2026-11-01, 13 = b: **into V1**, after the terminal and the music are
    polished.)* The **sync** of a share to a device carried a board's bytes
    as they are on the server (owner paths), and a share window without a
    table joined the board's whole room, whose cards it writes by the
    share's paths: both needed the same re-rooting and, for sync, a hash of
    the bytes the device holds that is not the server's.
    *Fixed 2026-11-15 (the room's half closed failing closed, before V.49
    was built):* a share window without a table was no longer let into the
    board's room and followed the board by its file, re-rooted, writing it
    whole (`write_board`, laid over the disk). A **past version** of a board
    read through a share (`history_read`) is re-rooted as the board is live,
    a card beside the share locked; a board is not read as a note
    (`read_note`) through a share; and a board whose file writes a key twice
    is laid anew from the last of each key on the way out, never spliced
    (ADR 0113, "Amended 2026-11-15: five more leaks").
    *Built 2026-11-15 (V.49, the maintainer: "no hack, pull V.49 in";
    `d849174e`, `c36fa5e4`, `2879cd93`):*
    - **The share's sync carries the board cut to the share**
      (`crates/verso-server/src/share_sync_board.rs`): on every path by
      which a receiver's device gets a board — the manifest
      (`sync_state`), the changes (`sync_changes`), the read (`sync_read`)
      — it is the board as a window of the share reads it
      (`share_board::text_out`, over the reader's projection for one who
      reads only), named by the hash and size of that cut; on the way in
      (`sync_put`) the device's text is held whole (16 MB at most), its
      base judged against the cut of the file now, laid over the file
      (`share_board::text_in`: the owner's paths, the cards beside the
      share as the file has them) and written by the ordinary put over the
      file's own hash, so a change landing between is refused as changed
      (invariant 11). `sync_delete` and `sync_rename` name the cut's hash,
      which the server turns into the file's own; a board is not renamed
      through a share (by sync or by a window) into a name that is no
      board, whose bytes would cross as they are; a refusal never names the
      file's own hash. A change the owner makes only to what the share does
      not see gives the same cut, so the device hears a change of the hash
      it holds and does nothing; the device's own write is not heard back
      as another file — the server keeps, in memory, the layout of the
      text a device of the share last wrote (`share_board::shaped_like`: the
      device's bytes when they read as the cut does, its key order
      otherwise), so a restart costs a device at most one more fetch of
      the board. The owner's devices, and any sync of the whole folder,
      hold the file as it is.
    - **A share window without a table joins the board's room through a
      shadow** (`collab_players.rs`, the table player's shadow of ADR 0113
      section H, cut by the share alone): cards re-rooted by
      `share_board::element_out`/`element_in`, a card beside the share a
      locked marker, the presence it hears cut to the elements it sees, its
      edits judged element by element, the file it makes laid over the
      disk. What `a57b305a` refused is answered again through the shadow; a
      window of the share that only reads still follows the board by its
      file. The Verso app of a synced device of the share joins the same
      way (its room commands go over the sync's session, ADR 0082). *Chosen
      in the code:* the share's shadow leaves secret pins out, as a
      player's does (they stay in the file and in its re-rooted read): the
      shadow judges by one rule; and a table made while a share's shadow is
      open closes it, its windows joining again as players. That switch is
      never silent (the maintainer, 2026-11-15, "B"): the close carries the
      reason `table-made` (`collab-closed`'s `reason`), and the window says
      "A table was made in this folder: you are now on the board as a
      player" as it joins again; the owner's answer to `campaign_make`
      carries `rejoined`, how many people were live on boards of the folder
      through shares, and the table's dialog says so in one line. Tested in
      `tests_share_board_room.rs` and `test/tableMade.test.mjs`.
    Tests: `tests_share_board_sync.rs`, `tests_share_board_room.rs`, and
    the shadow and leak tests of `tests_board_shares.rs`.
12. **Rooms** ([0073](0073-self-hosted-server-first.md) item 7). A note
    open through a share and through the owner's folder is **one room**:
    the room's place is the owner's folder key and the full path, which
    the share resolves to. Presence shows every person in it by name; a
    reader is present and does not type.
13. **The owner moves or renames a shared folder.** A rename or move made
    through the server — a window, sync's rename command — carries the
    grants of that path with it, in the same step: the share follows the
    folder, the receiver's windows are told, the share's id and the
    receiver's synced local folder do not change. A rename made where the
    server only finds it afterwards — on the server's disk by hand, by
    Obsidian over the mount, by a tool — is a deletion and a creation to
    the server ([0079](0079-sync-a-local-folder-with-a-server.md) item
    10): the share then points at a path that is gone, the receiver sees
    an empty folder with a notice, the owner is told in the tree and in
    Settings and re-points or removes the share. Deleting the shared
    folder removes its shares, said first in the confirmation.
14. **Nested shares.** The same folder may hold several shares at
    different paths and the same person may be in more than one; a
    person's role at a path is the **highest** of their grants whose path
    covers it. A share inside a share is a share at a deeper path, with
    the same rule; a receiver's role inside a share is uniform, since a
    receiver does not re-share (item 4).
15. **Tokens and the MCP.** A personal access token ([0074](0074-accounts-and-access-on-the-server.md)
    item 8) may name a share among its folders and reaches what the share
    reaches, never more than the person's role; the MCP under that token
    sees the share as a folder ([0066](0066-mcp-sees-boards-relations-properties-bases.md)).
16. **The trash** ([0080](0080-the-trash-with-expiry-and-restore.md)
    item 7): a writer of a share sees and restores the entries whose
    original path is inside the share; the rest of the folder's trash is
    not theirs.
17. **A single document.** Honestly: the model takes it — a grant whose
    path names a note is a share of one file, and the check is "equal"
    where it is "under" — and the experience does not. A one-note share
    has no folder for its attachments, no place for a new note, syncs as
    a folder with one file, and shows "not in what was shared with you"
    on every link out. The maintainer said optional and only if cheap; the
    server's part is cheap and the window's is not. `[DECIDED 2026-10-10]`; recommended:
    **not in the first version**, the model leaving the door open, and a
    read-only share of one note first if it is asked for — decided
    2026-10-10: not in the first version.
18. **Both languages, accessibility** ([0035](0035-cross-cutting-requirements.md)):
    the share dialog is a form with labelled fields and a list of people
    whose role controls are reachable by keyboard and named for a screen
    reader ("Ana, editor; change role; remove"); the tree's mark has a
    name ("shared with 2 people"); the "Shared with me" section is a
    region with a heading; revocation and deletion ask first, in the
    page. pt-BR and English; e2e tests in the server's suite for two
    accounts sharing both ways, at desktop and phone widths, and Rust
    tests for the filter, the confinement, the rename that carries a
    share and the rename that orphans one.

## Consequences

- The server's database: the grants table gains the path, a shares table
  the id and the name; the invitation gains a path; every list and page
  of the console that shows members shows shares. The role check that
  runs before `verso-fs` acts gains the path and the "highest covering
  grant" rule; the session gains the share's path beside the folder key;
  the answers of listing, search, backlinks, graph, bases and the change
  log gain the filter and the re-rooting; the rename command carries
  grants. Rust tests, and the server's e2e suite, for each.
- The contract: a share id is a folder id to every client, and the
  capabilities say the role; the generated types do not change shape for
  this (invariant 3) beyond the owner's name and the "not in what was
  shared" state of a link.
- The window: the "Shared with me" and "Shared by me" sections, the share
  dialog, the tree's mark, the link state and its words; the demo vault
  cannot show two accounts and the walkthrough says so ([0058](0058-demo-vault-as-tutorial.md));
  the changelog gets its line.
- [0073](0073-self-hosted-server-first.md)'s `[OPEN]` on permissions finer
  than the folder is answered for a folder inside a folder when this ADR
  is accepted, with a Revisions line there; per note and per block (spec
  Q9) stay open.
- **The next step the maintainer named**, not this ADR: a **history of a
  file's changes** — who changed what, when, and bringing a version back —
  on top of the change log of [0079](0079-sync-a-local-folder-with-a-server.md)
  item 4, which today records hashes and actors and keeps no bytes.
  Taken up by [0091](0091-version-history.md) (accepted 2026-10-14); recorded here so that it is not forgotten (*"não esquece"*);
  it is the rest of 0073's "history, attribution and recovery of another
  member's change", and it gets an ADR of its own.

## Discarded alternatives

- **(A) A shared sub-folder served as a second folder of the server**
  (raised by the author, Context): two of everything over the same files,
  and a rename that orphans the second root. Its experience is kept
  (item 2), its storage is not.
- **(B) alone, a grant on a path with nothing of its own for the
  receiver** (raised by the author, Context): nothing to list, open or
  sync; the owner's tree crossing so that a prefix could be shown.
- **The share appearing inside the receiver's own vault** (raised by the
  author, from Google Drive's shortcuts): item 6 says why not, and leaves
  the question to the maintainer, who decided against it on 2026-10-10.
- **Editors sharing** (raised by the author, from Notion's settings):
  item 4 keeps sharing with the owner, open to the maintainer, who kept
  it with the owner on 2026-10-10.
- **Per-note permissions now** (raised by the maintainer as "optional, if
  cheap"): item 17 says what is cheap and what is not.

## Status

**Accepted (2026-10-11).** Open items answered 2026-10-10 as recommended;
read by Opus 5.5 (the handoff of 2026-10-10 and the answers' reading);
accepted by the maintainer on 2026-10-11 (*"Mas eu tinha confirmado"* to
the recommendations). The history of a file's changes went to [0091](0091-version-history.md), accepted 2026-10-14, on
purpose, for its own ADR.

**Built on the night of 2026-10-11 to 12** (e4b35d5, 6c2f640, be98acd,
ffda3f0 and bdf9d2b, merged into `feat/universo` by d46c5db on
2026-10-12). The open questions the building raised were sent to the
maintainer the same night, and answered (below): a receiver's
rename against the owner's links from outside the share; an owner
inviting people who have no account; attachments at the vault's root
(item 11); what a receiver sees of the folder's aggregates; and a
revoked share's sync, turned off on the receiver's device.

**Answered by the maintainer on 2026-10-12** (01:15 BRT), item by item: a receiver's rename **will rewrite the owner's links outside the
share** (*"no Notion atualiza, imagino que vamos precisar também"*) —
decided, the next round (item 11) *(built 2026-10-12)*; only the admin invites
people who have no account (item 4); attachments loose at the vault's
root stay outside a shared sub-folder, the dialog asking the owner to
move them — sharing the whole vault has no such limit (item 11); the
aggregates a receiver sees, the index's counts and a base's formulas,
will be zeroed — decided, the next round (item 11) *(built
2026-10-12)*; a revoked share's
sync turns off with a notice — decided, being built that night on
`feat/universo-small` (item 8) *(built in 873921a, merged into
`feat/universo` by 97bb3a3 on 2026-10-12; in `CHANGELOG.md` under
Unreleased)*. Each is recorded in its item (Revisions).

*(History, before the acceptance above:)* Proposed on 2026-10-10. To be
read by Opus 5.5 before it is accepted. For the maintainer, each with a recommendation: a share's own name (item 3;
no); who shares, and re-sharing (item 4; the owner only, no re-sharing);
links anyone may open (item 4; not now); a share inside the receiver's
own vault (item 6; no, a window of its own until 0041); attachments
outside the shared folder (item 11; a second, read-only path, offered
when sharing); a single document (item 17; not in the first version, the
model allowing it later); and, for its own ADR, the history of a file's
changes (Consequences).

Open items answered 2026-10-10. The maintainer, in session, to the recommendations above: *"Gostei das recomendações, pode seguir"* —
each `[OPEN]` of items 3, 4, 6, 11 and 17 decided as recommended, in
place, and item 5 gaining the folder switcher, built with this ADR. The
history of a file's changes went to its own ADR, [0091](0091-version-history.md).

**2026-10-31.** Who deletes inside a share changed: outside a table only the
folder's **owner** deletes, an editor no longer does (the maintainer, B8:
*"apenas o dono da pasta pode apagar"*), and a move that takes a file out of
a shared folder, a deletion for that share, is the owner's too (decided the
same day); the rule lives in
[0113](0113-one-access-model-for-a-table.md) section B. Items 5 and 11 are
not settled by the list of 2026-10-31: the maintainer kept them apart, to be
discussed with him on 2026-11-02.

**2026-11-01 (the items held for the second, discussed early).** The maintainer
answered the list: *"12. A 13. B 14. B - Mas vamos fazer depois, quero terminal e música redondinho primeiro 15. B - (idem) 16. B - (idem)"* (12 a; 13 b; 14 b, but later, he wants the terminal and the music polished first; 15 b, likewise; 16 b, likewise).

- **Item 5 stays as decided on 2026-10-10 (12 = a):** a share never appears
  inside the receiver's vault; it is under *Shared with me* and in the
  folder switcher. **Confirmed 2026-11-01.**
- **Item 11's shared board with the owner's paths (13 = b):** the sync of a
  share carrying a board's bytes as they are on the server, and a share
  window without a table joining the board's whole room, **move into V1**,
  ordered after the terminal and the music are polished. `[DECIDED
  2026-11-01]`; **built 2026-11-15** (item 11, "Built 2026-11-15"; the
  roadmap's row V.49).
