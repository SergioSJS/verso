# ADR 0080 — The trash: what was deleted is seen, restored, and expires

- Date: 2026-10-10
- Source: the maintainer, in session on 2026-10-10, on what happens to a
  deleted file on the server and on the computer: *"Eu acho que faz sentido
  sim a gente ter uma lixeira e com tempo de expiração isso é possível
  voltar. Aí eu imagino que a gente vai ter que ter um mecanismo, né, de
  rollback disso daí, né, de voltar."* Written by Fable 5.1 at the
  maintainer's request (*"bota uma instância do Fable aí pra escrever
  isso"*), a swap of the roles of [0032](0032-author-and-reviewer-roles.md)
  as [0073](0073-self-hosted-server-first.md) was; to be read by Opus 5.5
  before it is accepted.
- Related: [0048](0048-file-operations-in-ui.md) (a deletion is a move into
  `.trash/` at the folder's root, Obsidian's bin, keeping the relative
  path, ` (n)` on a collision — unchanged here),
  [0012](0012-files-are-source-of-truth.md), [0011](0011-config-outside-tree-index-as-cache.md)
  (state outside the folder), [0043](0043-placeholder-guard.md) (a
  placeholder is never a deletion; one is never trashed),
  [0044](0044-verso-fs-semantics.md) (hidden entries are not walked: the
  trash is neither indexed nor listed), [0070](0070-what-travels-with-the-folder.md)
  (item 3, names every OS can keep), [0073](0073-self-hosted-server-first.md)
  (item 7, rooms; its Status leaves "history, attribution and recovery of
  another member's change or deletion" `[OPEN]` — this ADR answers the
  recovery of a deletion), [0074](0074-accounts-and-access-on-the-server.md)
  (roles, the audit log), [0075](0075-server-packaging-and-storage.md)
  (item 4, the space a folder takes; item 6, configuration by environment),
  [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (quotas; the console's folder page), [0079](0079-sync-a-local-folder-with-a-server.md)
  (item 9, deletions across sync; item 4, the change log),
  [0081](0081-sharing-between-people-on-one-universo.md) (a share sees the
  trash of what was shared), [0035](0035-cross-cutting-requirements.md)
  (both languages, accessibility).
- Status in the briefing: not present; on acceptance.

## Context

What exists. Since [0048](0048-file-operations-in-ui.md) a deletion in
Verso is a move into `.trash/` at the root of the open folder, keeping the
entry's relative path and adding ` (2)`, ` (3)`… when the name is already
there (`verso-fs`'s `trash`, the only way the core deletes). The desktop
app does it for a local folder; the server does it for its folders, for
every write path — a window, a device's sync, a token, the MCP. A
deletion that crosses sync is carried out on the other side the same way:
the app's sync moves the file into the local folder's `.trash/`, and the
dialog says so ("they go to the folder's bin").

What does not exist: a way to see what is in the trash, to bring something
back, or for the trash to ever shrink. `.trash/` is a hidden directory, so
the walk does not list it ([0044](0044-verso-fs-semantics.md)): it is not
indexed, not shown in the tree, not synced — each side's trash is its own
— and not counted. The server's quota ([0077](0077-the-server-administration-console-and-folder-quotas.md)
item 5) sums sync's record of the folder, which comes from the index's
listing, so the trash sits **outside the quota and grows forever**: 306 MB
on the test server after one afternoon of use. Restoring today means
opening the folder on disk and moving the file by hand, which on a server
is the admin's shell. Obsidian's public help describes the same shape — a
setting that sends deleted files to the `.trash` folder, with no view in
the app — so Verso is at parity with it, and below what a notes app of
several people needs: another member's deletion is unrecoverable from the
window ([0073](0073-self-hosted-server-first.md)'s `[OPEN]`).

One contradiction to record, not settle here: [0079](0079-sync-a-local-folder-with-a-server.md)
item 9 says a deletion that sync carries out on the computer goes "to the
system's bin"; the code and the dialog send it to the folder's `.trash/`,
as every other deletion in Verso. Item 9 of this ADR recommends one of
the two and asks the maintainer to say. *(Settled on 2026-10-10: the
folder's `.trash/`, item 9; 0079 revised the same day.)*

## Decision

Proposed (2026-10-10); accepted 2026-10-11 (Status). Each `[OPEN]`
carried a recommendation; the maintainer decided. Open items answered
2026-10-10 (Status).

1. **The trash stays `.trash/` at the folder's root**, on the computer and
   on the server, with [0048](0048-file-operations-in-ui.md)'s rules
   unchanged: the relative path kept, ` (n)` on a collision, a whole folder
   trashed as a subtree. It is Obsidian's convention, so a folder opened by
   both apps has one bin, and nothing of [0012](0012-files-are-source-of-truth.md)
   moves into a database: the bytes of a deleted file are on disk, in the
   folder, where a person with a file manager can reach them without
   Verso.
2. **What is known about an entry lives outside the folder** ([0011](0011-config-outside-tree-index-as-cache.md)):
   its original path, when it was deleted, by whom (on a server: the
   account; on the computer: this device, or sync naming the device whose
   change it carried), its size, and when it expires. On the server, a
   table in the server's database; on the desktop, the folder's record in
   the configuration directory. It is a **cache**, rebuilt from `.trash/`:
   an entry nobody recorded — made by Obsidian, by hand, by an older
   Verso, or already there when this ADR ships — is found by a walk of
   `.trash/` (the one place a walk enters a hidden directory, by name, as
   `.space/waypoints.json` is read by name, [0062](0062-focuses.md) D7),
   listed with its date unknown, and its clock starts when it was first
   seen. **Nothing already in a trash is deleted at the upgrade**; the
   306 MB expire after the retention counted from the first walk.
3. **Retention.** An entry past the retention is removed from disk, for
   good, by a sweep at the folder's opening and once a day while it is
   open (on the server: at start and daily, per folder). The removal is a
   plain deletion of a path under `.trash/` and nothing else: a symlink
   there is removed, never followed ([0044](0044-verso-fs-semantics.md)'s
   server rule); empty directories left under `.trash/` are pruned; each
   removal is one line of the log and, on the server, of the audit log.
   `[DECIDED 2026-10-10]`: the default. Recommended: **30 days**, as Notion, Google
   Drive and the Finder keep — decided 2026-10-10: 30 days. Configurable:
   - on the server, `VERSO_TRASH_DAYS` is the default for every folder
     (30 when unset; `0` means never expire), and the console's folder
     page sets a folder's own value, as it sets the quota
     ([0077](0077-the-server-administration-console-and-folder-quotas.md)
     item 5); `[DECIDED 2026-10-10]` whether a folder's owner may change it from the
     window too — recommended: the owner may **shorten** it, only the
     admin lengthens it or turns expiry off, since space is the host's —
     decided 2026-10-10: the owner may shorten it from the window; only
     the admin lengthens it or turns expiry off;
   - on the desktop, a setting of each local folder, "Keep deleted files
     for", with 30 days as the default and "forever" as a choice — the
     disk is the person's own; the setting is the person's layer of
     [0070](0070-what-travels-with-the-folder.md), not written into the
     folder.
4. **Where it is seen.** A **Trash** view of the folder — *Lixeira* — in
   the window, the same in the desktop app and in the browser (and so on
   the phone, [0076](0076-the-window-on-every-screen.md)): a list of the
   entries with the name, the original path, the size, when it was deleted
   and by whom, and when it expires; searchable; sorted by date, newest
   first. Opened from the file tree's root menu and the command palette,
   and from the folder's settings, which show the trash's size and count
   beside the folder's space ([0075](0075-server-packaging-and-storage.md)
   item 4). `[DECIDED 2026-10-10]`: whether the tree also shows a *Trash* row at its
   foot, as Notion's sidebar does. Recommended: **no row in the tree** in
   the first version — the tree is the folder's files, and the trash is
   not one of them — the menu, the palette and the settings reaching it
   — decided 2026-10-10: no Trash row in the tree.
   In the console, the folder's page shows the trash's size, count and
   retention, with "Empty the trash" for the admin; Overview adds the
   server's trash total to its totals.
5. **Restore.** An entry goes back to its original path, its parents made
   again if they are gone. When the path is taken, it is placed beside it
   as `<name> (restored <yyyy-mm-dd>).<ext>` — in the person's language,
   with characters every OS can keep ([0070](0070-what-travels-with-the-folder.md)
   item 3), as the conflict copy of [0079](0079-sync-a-local-folder-with-a-server.md)
   item 8 is named — and the window says where it went. A trashed folder
   restores as a subtree. A restore is a move inside the folder, with
   invariant 11's check on the target; nothing is rewritten.
   *Noted 2026-11-05 (the maintainer: "pode seguir as recomendações"):* as
   a move keeps a file's access ([0113](0113-one-access-model-for-a-table.md)
   K.2), a restore keeps the access the file had at a table — its own set,
   or the one it followed — and a table rooted in a restored folder comes
   back with it ([0110](0110-a-table-is-a-campaign-folder.md) item 4,
   revised 2026-11-05). The bin keeps them with the entry; a version a
   device's write replaced keeps its file's.
6. **A restore and sync** ([0079](0079-sync-a-local-folder-with-a-server.md)).
   A restore is, to sync, a **file that came back**, never the undoing of
   the deletion: the deletion was logged and carried out everywhere, and
   the bases were dropped on both sides (item 9 and the device's state).
   Restored on the server, the change log records a write by the restorer;
   each device sees a file the server alone has and copies it (item 7);
   a device that had moved its own copy into its local `.trash/` keeps
   that trash entry until it expires — a harmless duplicate, not a
   conflict. Restored on the computer, the file reappears in the local
   folder and sync sends it as a new file. A restore into a room of
   simultaneous editing ([0073](0073-self-hosted-server-first.md) item 7)
   is a change from outside, as any write is. The trash itself never
   syncs: it is hidden, and syncing the bytes of files already deleted
   would double the space and the traffic for nothing — the same deletion
   fills both trashes with the same bytes, and either side restores.
7. **Who sees and does what, on a server.** The trash of a folder is seen
   by those who may write in it — editors and owners; a reader deletes
   nothing and sees no trash. Any writer **restores** anything; "delete
   now" and "empty the trash" are the **owner's** (and the admin's, from
   the console): irreversible actions stay with whoever answers for the
   folder. Every entry names who deleted it; a restore, a delete-now and
   an emptying are in the audit log ([0074](0074-accounts-and-access-on-the-server.md)
   item 9), which the owner reads. A share ([0081](0081-sharing-between-people-on-one-universo.md))
   sees the entries whose original path is inside what was shared, and
   nothing else of the folder's trash. On the computer the person is the
   owner and does everything.
8. **The trash and the quota.** `[DECIDED 2026-10-10]`; the trade-off is this. Counting
   the trash against the quota breaks [0077](0077-the-server-administration-console-and-folder-quotas.md)
   item 5's promise that a deletion is always allowed so a full folder can
   be made smaller — with the trash counted, deleting frees nothing until
   the trash is emptied, and the person who hits the quota is pushed to
   destroy for good. Not counting it lets a folder hold its quota plus
   whatever was deleted in the last 30 days, which a member may use to
   fill the host's disk by writing and deleting in a loop. Recommended:
   **shown, not counted, bounded by expiry**, with one guard: when a
   folder's trash alone exceeds the folder's quota, its oldest entries
   expire early until it does not — said in the folder's page, never
   silent. A server with no quotas has no guard beyond the retention —
   decided 2026-10-10: shown, not counted against the quota, with the
   guard: when a folder's trash alone exceeds its quota, the oldest
   entries expire early, said in the folder's page.
9. **A deletion carried out by sync on the computer goes to the folder's
   `.trash/`**, as the code does today and as every deletion in Verso
   does, so that it is seen and restored in the same view and the two
   trashes of item 6 mirror each other. This contradicts the wording of
   [0079](0079-sync-a-local-folder-with-a-server.md) item 9 ("the
   system's bin"); `[DECIDED 2026-10-10]`, the maintainer's to settle. Recommended: the
   folder's bin, with a Revisions line in 0079 and no change of code —
   decided 2026-10-10: a deletion carried out by sync goes to the
   folder's `.trash/`; 0079 item 9 revised the same day.
10. **Agents.** A deletion through the MCP ([0066](0066-mcp-sees-boards-relations-properties-bases.md))
    goes to the trash as it already does; restoring is not exposed to the
    MCP in this ADR.
11. **Both languages, accessibility** ([0035](0035-cross-cutting-requirements.md)):
    the view is a list with a header row, each entry a row whose actions
    are reachable by keyboard and named for a screen reader ("Restore
    *name*", "Delete *name* now"); an irreversible action asks first, in
    the page, with the count and the size; a restore announces where the
    file went; the settings and the console say the retention in words
    ("deleted files are kept for 30 days"). pt-BR and English throughout;
    e2e tests in the harness for the view, the restore beside a taken
    name and the expiry, and the server's suite for the roles and the
    console.
12. **A version a device's write replaced is kept** — decided 2026-10-10.
    When a device's write replaces a file on the server, the server keeps
    the version it replaced in the folder's trash, named `replaced by <device>`, and it restores as any entry does (item 5). It is the
    mitigation for an outside program's stale save, the known limit
    [0079](0079-sync-a-local-folder-with-a-server.md) records
    (Consequences; the sync campaign's finding F18): a program that saves
    a whole-file buffer older than what sync downloaded overwrites the
    newer version, and no file sync can tell.

## Consequences

- `verso-fs` gains a walk of `.trash/` by name (the hidden rule otherwise
  unchanged), a restore (a confined move out of `.trash/`, invariant 11 on
  the target), and a permanent removal confined to `.trash/`, each with
  its tests; `verso-core` and `verso-service` gain the trash's commands —
  list, restore, delete now, empty — and the sweep; the contract's types
  are generated as always (invariant 3).
- The server's database gains the trash table and a folder's retention;
  the console's folder page and Overview show the trash; a new variable,
  `VERSO_TRASH_DAYS`, documented in `docs/reference/server-install.md`
  with the others ([0075](0075-server-packaging-and-storage.md) item 6).
- The window gains the Trash view, the folder setting and the strings;
  the demo vault teaches it ([0058](0058-demo-vault-as-tutorial.md)); the
  changelog gets its line.
- [0073](0073-self-hosted-server-first.md)'s `[OPEN]` on recovering
  another member's deletion is answered by items 5 and 7 when this ADR is
  accepted, with a Revisions line there; history and attribution of a
  **change** stay open, the next step the maintainer named
  ([0081](0081-sharing-between-people-on-one-universo.md), Consequences).
- A guardrail of the feature, seen failing first ([0029](0029-guardrails-in-ci.md)):
  a test that the sweep removes nothing outside `.trash/`, nothing before
  its time, and follows no symlink.

## Discarded alternatives

- **The record of a deletion written inside the folder** (raised by the
  author: a sidecar in `.trash/` or in `.verso/`): Obsidian and a file
  manager delete without writing it, so it would be wrong whenever the
  folder is shared with another app; the record is a cache outside the
  folder, and `.trash/` itself is the truth.
- **Syncing the trash** (raised by the author): the bytes of a deleted
  file crossing again, and the space doubled on every device.
- **The system's bin on the computer** (raised by [0079](0079-sync-a-local-folder-with-a-server.md)
  item 9's wording, and by [0048](0048-file-operations-in-ui.md) as an
  option): outside Verso's reach, so no view, no restore, no expiry of
  Verso's own; and not one bin per folder. Item 9 leaves the choice to
  the maintainer, who chose the folder's bin on 2026-10-10.
- **Permanent deletion with an undo in the window** (raised by the
  author): an undo lives in one window's memory; a deletion by another
  member, by sync or by an agent has no window to undo it in.

## Status

**Accepted (2026-10-11).** Open items answered 2026-10-10 as recommended;
read by Opus 5.5 (the handoff of 2026-10-10 and the answers' reading);
accepted by the maintainer on 2026-10-11 (*"Mas eu tinha confirmado"* to
the recommendations). No `[OPEN]` item stays open *(as written on
2026-10-11; the answers of 2026-10-12 below leave one `[OPEN]`: the layer
of settings that syncs, where a desktop folder's retention would live)*.

**Built on the night of 2026-10-11 to 12** (db609b1, 03c21bf, a9a9bb5,
08f4032 and 069cb3a, with item 12; 2f15f9d, of the same night, is not
the trash's: it fixes the timing of a test of an unreadable directory on
Windows). The open questions
the building raised were sent to the maintainer the same night, and
answered (below): whether a replaced version is kept only when a
device's write replaced it (item 12); the range of days the owner may
set (item 3); where a desktop folder's retention lives; a restore
against the folder's quota (item 8); and the device's name on a deletion
carried out by sync.

**Answered by the maintainer on 2026-10-12** (01:15 BRT), item by item, *"Sobre lixeira, todos aprovados"* (on the trash, all approved), each
as built and recommended: a replaced version is kept only when a
device's write replaced it (item 12); the owner may set a folder's days
anywhere between 1 and the admin's value (item 3); a desktop folder's
retention stays in this computer's index until a layer of settings that
syncs exists — that layer stays `[OPEN]` *(decided on 2026-10-12:
[0070](0070-what-travels-with-the-folder.md) items 1 and 2, the next
round; the retention waits on it)*; a restore on the server counts
against the folder's quota (item 8); and a deletion carried by sync
names the server, the device later.

*(History, before the acceptance above:)* Proposed on 2026-10-10. To be
read by Opus 5.5 before it is accepted. For the maintainer, each with a recommendation: the retention's default
(item 3; 30 days); whether the owner changes a folder's retention from the
window (item 3; shorten only); whether the tree shows a Trash row (item 4;
no); whether the trash counts against the quota (item 8; shown, not
counted, the oldest expiring early when the trash alone passes the
quota); and where a deletion carried out by sync goes on the computer
(item 9; the folder's bin, a Revisions line in 0079).

Open items answered 2026-10-10. The maintainer, in session, to the recommendations above: *"Gostei das recomendações, pode seguir"* —
each `[OPEN]` decided as recommended, in place (items 3, 4, 8 and 9), and
item 12 added, the mitigation of 0079's known limit.

**Decided (2026-10-31): the server's trash gets an age and size cap.**
`[DECIDED 2026-10-31, to be built]` The server's `.trash/` grows with files
replaced again and again (item 12's replaced versions). Put to the maintainer
as B11 of the list of 2026-10-31 — a) a cap by age or size (e.g. 30 days), b)
leave it — and approved as recommended, a: *"Todo resto pode ir de recomendado e aprovado"* (everything else may go as recommended, and is approved). Item 3's retention (30
days by default) already caps by age; what the answer adds is that the
server's trash is kept under a cap by **size** as well, the oldest entries
going first, with the replaced versions of item 12 under both caps. The size
and how it relates to item 8 (the oldest expiring early when the trash alone
passes the quota) are the build's, said in its As built. Read by the author as
above; the answer's words were only "age/size (e.g. 30 days)".

**As built (2026-10-31, B11).** The cap is the server's, one number for every
folder's bin: `VERSO_TRASH_MAX` (a size as `VERSO_FOLDER_QUOTA` is written;
`0` or `none` for no cap), **1 GiB by default**, a choice of the build because
the answer gave no figure — confirmed by the maintainer the same day
(*"Sim"*). `verso_core::trash::due` takes it beside the
quota: after the age (item 3) the oldest entries of what is left go while the
bin alone is larger than the **smaller** of the quota and the cap; a tie
names the quota. The replaced versions of item 12 are entries of the bin like
the others, so both caps and the age apply to them. A removal by the cap is
logged and audited as `trash_over_cap` (`trash_over_quota` and
`trash_expired` as before). Item 8's early expiry is therefore one rule with
two bounds; the console's `early` flag is true when either is passed. What
is removed is only an entry the walk of `.trash/` found, by its exact path
through `verso_fs::trashbin::purge`, which refuses a path outside the bin;
no pattern or prefix match is involved, and a test keeps a live note of the
name of a purged entry. The desktop's own bin (`Workspace::sweep_trash`) has
no size cap: the decision was about the server's trash.

**Amendment (2026-11-01, review finding I5).** The size cap of the build above
purged the newest entry too, at once, when it alone passed the cap (the sweep
runs 5 s after a deletion): a folder of music deleted from the browser was
unrecoverable five seconds later. Put to the maintainer with a recommendation;
he chose both halves, *"Todas pode seguir sua recomendação"* ("follow your
recommendation on all of them"; item 1 = c, never purging a young entry **and**
warning before):

1. **The cap counts an entry younger than a day but never removes it**
   (`verso_core::trash::due`): it waits; the oldest of the rest still go while
   the bin is over; the age cap (item 3) and the quota (item 8) are unchanged.
   Once a day old, the entry is fair game.
2. **The window warns before a deletion that alone passes the cap**: the
   server's capabilities carry `trash_cap` (bytes; none without a cap, and the
   desktop's own bin has none); the confirm of a delete (the tree's menu, the
   selection, the keys) adds *it stays in the trash for 1 day, then goes for
   good and cannot be restored* when the files under the paths, as the window
   knows their sizes, add up past it. A contract change (an optional field of
   `Capabilities`): deploy the server before the apps.

