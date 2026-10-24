# ADR 0113 — One access model for a table: a seat, per-path access, per-player rights

- Date: 2026-10-24
- Source: the maintainer's live test of a table on 2026-10-24 (his report is
  quoted in Context), the read-only audit made the same day at his request
  ([review 2026-10-24](../review/2026-10-24-permissions-audit.md), on
  `feat/rpg-tools` at `6919e533`), and his answers to that audit's proposal
  the same day, quoted under each item of the Decision. Written by Opus 5.5;
  to be read by the other model before it is built
  ([0032](0032-author-and-reviewer-roles.md)).
- Supersedes in part: [0110](0110-a-table-is-a-campaign-folder.md) items 4,
  5 and 12 as amended on 2026-10-23 (a note's audience, per-note edit grants,
  the journal as a released and granted note), its "Chosen in the code" (2)
  (editors are game masters), its "As built" sections on grants, the
  audience and who may send images; and
  [0107](0107-the-table-a-shared-roll-and-chat-log.md) item 3's amendment of
  2026-10-24 (the right to send images). Revises the reader's mark of
  [0076](0076-the-window-on-every-screen.md) item 11 (2026-10-23) inside a
  table. History is kept in those ADRs; each carries a dated line pointing
  here.
- Related: [0074](0074-accounts-and-access-on-the-server.md) (roles per
  folder, tokens), [0081](0081-sharing-between-people-on-one-universo.md)
  (shares, the highest covering grant),
  [0087](0087-secret-blocks-hidden-from-readers.md) (item 5: whoever edits
  sees the secret blocks), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (item 12: a board's room merges by element),
  [0090](0090-maps-on-the-board.md) (secret pins),
  [0096](0096-this-app-is-a-server.md) (a phone paired as reader or editor),
  [0105](0105-read-links-without-an-account.md) (read links),
  [0079](0079-sync-a-local-folder-with-a-server.md) (a synced folder),
  [0092](0092-the-phone-offline.md) (shared test vectors),
  [0026](0026-core-ui-contract-inviolable-rules.md) (the contract; rule 3,
  generated types), [0029](0029-guardrails-in-ci.md),
  [0035](0035-cross-cutting-requirements.md),
  [0067](0067-source-files-stay-small.md).
- Status in the briefing: not present.

## Context

**The live test.** On 2026-10-24 the maintainer ran a table as game master
with players on other devices. His report, verbatim:

> *"Cara, tá com fluxo péssimo. Você criou menus diferentes, um para liberar
> acesso e o outro para liberar edição. Um tá num canto, o outro tá no outro
> canto... Sem falar que eu não estou achando um lugar onde eu libero um
> board para edição... quando eu solto ele fala que você só lê esta pasta
> mesmo eu tendo permissão de edição na minha nota... Você precisa sentar,
> repensar todo esse fluxo de permissionamento... um macarrão de código de
> permissões, em vez de fazer um negócio inteiro, sólido, que faz sentido
> para o fluxo que a gente quer na aplicação."*

(The flow is terrible: two menus, one to release access and another to
release editing, each in a different corner; no place to release a board for
editing; dropping onto a note he may edit says "you only read this folder";
the permissions must be rethought as one solid whole instead of a tangle of
permission code.)

**What the audit found** ([review 2026-10-24](../review/2026-10-24-permissions-audit.md),
part 1, with `file:line` for every claim). "May I change this?" is answered
today by two dimensions mixed together — the folder role, which says at once
*what I see* and *whether I write*, and the table, which adds an audience and
an edit grant per note — and by about 115 places in the window reading seven
different sources (the capabilities, a sync flag kept three times, the
campaign status, the share list's success, the table join, the folder layer).
The contradictions:

- **C1** — "May Ana write in her sheet?" has four answers: the server's window
  command and room say yes, a device's sync says no unless the grant is the
  group's, the editor says yes, drag and drop, paste and the image menu say no
  (the "Você só lê esta pasta" of the report: a folder-level check runs before
  the drop asks about the note).
- **C2** — "Is Bia a game master?": owner and editors for the veil, the owner
  only for running the table, secret rolls and deleting rolls, owner or editor
  for images, and the status tells an editor `"none"`.
- **C3** — A board cannot be made editable for a player anywhere (menu, server
  command, write path, board room, board leaf); the only way, making the
  player an editor of the folder, silently makes them a co-game-master who sees
  every hidden note and secret block.
- **C4** — "Who sees" is a set, "who edits" is one player or the group.
- **C5** — The two lists change each other unsaid.
- **C6** — "Is this a player?" is decided by the credential: the owner's own
  phone paired as reader, or a read token, is a player of his own table.
- **C7** — A synced desktop reader can type but cannot drop.
- **C8** — "Owner" in the window is inferred from an error.
- **C9** — The phone's narrowing is written in four places.
- **C10** — The e2e harness is a fourth implementation of the rules.

The audit lists fourteen bugs (B1–B14) that follow from these; they are in the
review, each with its root cause and the step of this ADR that removes it.

**What was proposed.** The same review's proposal (now this ADR): one answer on
the server, `may(who, action, target)`; one "Access…" dialog; three things kept
apart — the **seat** (who the person is at a table), the **access of each file**
per player (does not see / sees / edits), and the **rights** per player at a
table (sending images, and whatever comes later) — under a **credential cap**
that can only take writing away, never change who the person is.

## Decision

Accepted on 2026-10-24: items 1–5 are the maintainer's answers to the
proposal, item 6 is the proposal's recommendation taken with his general
approval. Sections A–J below are the design that follows from them: the
proposal as he approved it, adjusted to his answers. The five points those
answers left to him were answered the same day (section K). Where the author had
to choose a detail no answer reaches, it is marked `[PROPOSED]`; what the code
chose where the maintainer was not asked is marked *chosen in the code*.

1. **One model, one dialog, any path.** `[DECIDED 2026-10-24]` The maintainer:
   *"Aprovo, mas deveria ser por qualquer arquivo (nota, board, etc) e pasta,
   a pasta sobrescrevendo o que tem dentro"* (I approve, but it should be for
   any file — note, board, etc. — and folder, the folder overriding what is
   inside). So:
   - The server answers every "may this person do this here?" with **one
     function**, `may(who, action, target)` (section A).
   - **One "Access…" dialog** — *Does not see | Sees | Edits* per player, and a
     *Whole table* row — opened from the title icon of **any** file, from
     **one** row of the tree's right-click, from a multiple selection, and from
     the Table window (section F).
   - Rights of a **person** are set only in the Table window; access to a
     **file** only in the dialog. The rule to keep in mind: *"arquivo → diálogo
     Acesso; pessoa → janela da Mesa"* (file → Access dialog; person → Table
     window).
   - Access applies to **any path inside a table**: notes, boards, bases,
     attachments and images, any other file, and **folders**.

2. **A folder's access, then exceptions.** `[DECIDED 2026-10-24]` The
   maintainer: *"Aplica e depois permite exceção"* (apply, then allow
   exceptions). Setting a folder's access **replaces** the access of everything
   inside it — files and subfolders, earlier exceptions included — and the
   dialog says, before applying, how many files change. Afterwards a single
   file (or subfolder) may be changed alone; it becomes an **exception**, listed
   in the folder's dialog with a way back, *↺ Follow the folder*. A new file
   takes the access of its folder: the nearest folder above it with an access
   set, else the table's default, **hidden** (0110 item 4, MC.2 = A, unchanged).

3. **A folder editor inside a table is a player.** `[DECIDED 2026-10-24]` The
   maintainer: *"Jogador que edita tudo"* (a player who edits everything). An
   account whose folder role (or share) is *editor*, inside a table, **stays a
   player**: it does not see hidden files nor others' secret rolls, and has no
   table controls. There is **no co-master seat**: the folder's owner is the
   only game master (two owners are two game masters, 0110 item 15). The
   proposal recommended a co-master seat (an editor seeing everything and
   running the rolls); that recommendation **was not taken**. What "edits
   everything" covers was answered the same day: **every file he sees** (K.1).

4. **Boards a player edits: a room by element.** `[DECIDED 2026-10-24]` The
   maintainer: *"Sala por elemento"* (a room by element). A player who edits a
   board joins its live room receiving **only the elements they see**; the
   server **refuses** any change to an element they do not see or that is
   locked, and **never accepts a whole-file write of a board from a player**
   (section H).

5. **Images: one right, the chat and the notes.** `[DECIDED 2026-10-24]` The
   maintainer: *"Sim, chat e notas"* (yes, chat and notes). One per-player
   right, **Images**, covers sending an image to the table's chat **and** putting
   a **new** image into a note or board the player edits (the server writes the
   file, as for the chat). Dragging an image **already in the folder** — from the
   chat, from the tree — into a note the player edits needs only **Edits**: it
   links the existing file, nothing is uploaded. Widened the same day to every
   kind of file and renamed **Send files** (K.4).

6. **The game master's own read-only credential; exceptions downwards.**
   Taken as recommended, with the maintainer's general approval of the
   proposal (not an explicit answer of his):
   - The game master's own read-only credential — his phone paired as reader,
     a read token — **stays game master**: sees everything, a closed table does
     not shut him out; it only cannot write.
   - **Exceptions below the default** are allowed: *"toda a mesa vê, menos o
     Caio"* (the whole table sees, except Caio) is a *Whole table: Sees* row
     with Caio's row at *Does not see*, and a player who joins later sees.

### A. The model: `may(facts, who, action, target)`

A pure function in `verso-server` (a new `access::may`, no IO), fed a snapshot,
`AccessFacts`, that the server builds once per request.

```
may(facts, who, action, target) -> Allow | Deny(reason)

who    = { account, role: Owner | Editor | Reader | None   // folder or share, the highest covering grant (0081 item 14)
           cap: Write | Read                               // token, phone pairing, read link
           phone: bool }
target = { path, kind: Note | Board | Base | Attachment | OtherFile | Folder | Table }
action = See | Edit | Attach | Create | Move | Delete
       | Rename | Say | Roll | RollSecret | SeeSecretRolls | DeleteEntry | Clear | SendFile
       | ManageAccess | ManageTable | Share | Invite
```

**The seat** (`seat(who, table)`), derived from the role, never from the
credential (item 6):

| Role at the table's path | Seat |
|---|---|
| owner | **game master** |
| editor (of the folder, or of a share covering the table) | **player** who edits every file they see (item 3, K.1) |
| reader | **player** |
| the account `link:<id>` of a read link (0105) | **visitor** — a player with no name: only the *Whole table* rows |

Outside any table, the folder role of 0074 and 0081 holds as today; this ADR
changes nothing there.

**The level of a path for a player** (`level(path, account)` ∈
{`none`, `see`, `edit`}):

1. Take the nearest node with an access set: the path itself, else its folder,
   else each folder above it, up to the table's root.
2. At that node, the player's own row if there is one, else the node's *Whole
   table* row.
3. With no node set anywhere: the table's default, `none` (hidden, MC.2 = A).

A player whose role is *editor* edits wherever their level is at least `see`
(K.1): for them *Sees* in the dialog already means editing, and their row
says so (*edits all they see*). `[PROPOSED]` (the author's reading of K.1 with K.5): a folder they see
counts as a folder they edit, so they create and rename inside it.

`[PROPOSED]` (the author's reading of item 2): a node's access is **one whole
set** — a *Whole table* row and the per-player rows that differ from it. Changing
a file alone writes its whole set, so the file stops consulting its folder
entirely; *↺ Follow the folder* deletes the file's set. A node never mixes its
own rows with its folder's per player.

An **attachment** (any file that is not a note, board or base) follows K.3,
*chosen in the code*: an explicit access wins; with none, it keeps today's
derived rule — seen by a player when a file that player sees links or embeds
it, or when the table shows it (0110 "Chosen in the code" (5)).

### B. The rules (one table)

| Action | Outside a table | Game master | Player | Visitor (read link) |
|---|---|---|---|---|
| See a file or folder | role ≥ reader | yes | table open ∧ level ≥ see | table open ∧ *Whole table* ≥ see |
| See an attachment | role ≥ reader | yes | table open ∧ the attachment's level ≥ see (K.3) | same, by the *Whole table* rows |
| See secret blocks (0087) | role ≥ editor | yes | Edit(file) (0087 item 5; the dialog warns, F) | no |
| Edit (a note's text, a board's elements, a base's rows, a file's bytes) | role ≥ editor ∧ cap Write | cap Write | cap Write ∧ (level = edit, or role editor ∧ level ≥ see, K.1) | no |
| Attach (a **new** file into a file the person edits) | role ≥ editor ∧ cap Write | cap Write | Edit(target) ∧ right *Send files* ∧ cap Write (item 5, K.4) | no |
| Link something already seen (drag from the chat, the tree) | = Edit(target) | = Edit(target) | = Edit(target), no further right (item 5) | no |
| Create, Rename (inside a folder) | role ≥ editor ∧ cap Write | cap Write | Edit(folder) ∧ cap Write (K.5); a new file takes the folder's access | no |
| Move (into or out of a folder) | role ≥ editor ∧ cap Write | cap Write | no (K.5) | no |
| Delete | role ≥ editor ∧ cap Write | cap Write | no (K.5) | no |
| Say, Roll, RollSecret | — | yes | yes (table open) | no |
| See others' secret rolls | — | yes | no (an editor neither, item 3) | no |
| Delete an entry, clear the table | — | yes | only their own message or file | no |
| SendFile (chat) | — | cap Write | right *Send files* ∧ cap Write (K.4) | no |
| ManageAccess, ManageTable | — | cap Write ∧ not a phone (as built) | no | no |
| Share, Invite | owner ∧ cap Write (Invite of a person with no account: the admin, 0081 item 4) | owner | no | no |

The credential cap is one line: **every writing action needs `cap = Write`**. A
phone paired as reader, a read token and a read link are `cap = Read`; that is
the only place a phone is narrowed (C9 ends). The game master's closed-table and
hidden-file rows do not depend on the cap (item 6).

**What collapses into what:**

| Today | Becomes |
|---|---|
| `campaign_notes.released` + `campaign_audience` + `grant_kind`/`grant_account` | one table of rows per **path**: `campaign_access (folder, path, account NULL = whole table, level)`, where `path` may be a folder |
| "Liberar para…" + "Editável por" + "Alterar quem vê…" + "Liberar/Ocultar tudo daqui" | one **Access…** dialog |
| a grant to one player or the group | Edit for any set of players |
| a board that cannot be edited | a board like any file (item 4, H) |
| `campaign_images` | `campaign_rights (folder, root, account, right)` with `right = 'files'` (*Send files*, K.4) |
| `granted_write`, `group_put`, `may_send_images`, `acting`, `game_master`, the repeated `role.writes() && token_writes` | calls to `may` |
| the window's `viewer` owner/player/none + `mayShare` + `can("write")` + three synced-reader flags | `FolderAccess` + `FileAccess` (C) |
| `campaign_notes.secret_name` | a column of `campaign_files (folder, path, secret_name)` |

The `Veil` (public, union, per account) of 0110 "As built (a note's audience)"
stays inside the server, computed from the new rows; every read path it covers
keeps its test.

### C. The contract — the window never re-derives

Types generated from Rust (0026 rule 3):

- `FileAccess { level: "none" | "see" | "edit", attach: bool, why: AccessWhy }`
  comes with **every read answer** (`read_note`, `read_text`, `read_board`,
  `board_preview`, a file's metadata) and on each entry of
  `list_notes`/`list_entries`, so the tree and every drop target know it.
  `attach` is `may(Attach)`. `AccessWhy` says where the level comes from (game
  master, the file's own set, a folder's, the table's default, the credential)
  so the window can word it, never so it can recompute it.
- `FolderAccess { seat: "master" | "player" | "visitor" | "none", role, cap }` in
  the capabilities: the one source of "who am I here" (C8 ends).
- The event `access-changed { paths }`, made per player as today's
  `campaign-changed` is (a player is told only what it gained or lost). It
  replaces `campaign-changed`, `verso:role` and the use of `verso:sync-state`
  for permissions.
- Commands:
  - `access_get(paths)` — for the game master, per path: the whole-table row,
    each player's level and where it comes from; for a folder, also how many
    files are under it and its exceptions (the files and subfolders with a set
    of their own). For a player: only who sees, as `campaign_access` does today.
  - `access_set(paths, set | "follow", options)` — writes a whole set (A) on
    each path; on a folder it replaces everything inside and answers how many
    files changed; `"follow"` deletes the set (*↺ Follow the folder*); `options`
    carries the secret name (0110 item 7).
  - `table_rights_set(root, accounts, right, on)` — today `right` is only
    `files` (*Send files*, K.4); `TableJoin.files` says it at the join.
- **The rule for the window:** it shows, enables and guards from `FileAccess`
  and `FolderAccess` only, and asks again on `access-changed`; it never derives
  a permission from a role, a flag or an error. The server decides every write
  regardless of what the window showed.

In the window, one module `app/ui/src/access.ts` (`may(path, action)`, `seat()`)
feeds every guard: the editor's and the board's read-only state, each drop by
its target, paste, the image menu, a base's properties, the tree's menus, the
folder's lock and the reader's notice.

### D. Drag and drop

| Dragged | Onto | Rule | Today |
|---|---|---|---|
| A roll from the log | a file I edit | `may(Edit, target)` → the roll block is inserted | refused (B1) |
| An image from the chat | a file I edit | `may(Edit, target)` → `![[<root>/<place>/mesa-…]]`, **the file that exists**; nothing is uploaded | refused (B2) |
| A file from the computer, or a pasted screenshot | a file I edit | `may(Attach, target)` → the server writes it into the **table's** attachments place, with K.4's checks | refused (B3) |
| A tree row | a pane | always opens | refused for a reader (B8) |
| A tree row | a file I edit | a link or a card, if I see the file | refused |
| A tree row | a folder | `may(Move)` | as today |

The chat's thumbnail becomes an `armDrag` source of kind `file` carrying the
image's path, as the tree's rows are, instead of a native `<img>`.

### E. Defaults

- A new note, board, base, attachment or other file in a table: its folder's
  access, else **hidden** (item 2; MC.2 = A).
- A new player: every file's *Whole table* row applies to them; *Send files* **off**
  (as built).
- "Release to the table" is simply *Whole table: Sees*.

### F. The screens

**One dialog, four doors:** (1) the people icon in the title row of **any** file
(a click opens it; hover keeps showing the read-only summary); (2) **one** row
of the tree's right-click, *Access… · Ana edits · 2 see*, with no submenus — on
a file and on a folder; (3) a multiple selection, *Access for 5 files…*; (4) in
the Table window, a player's *Sees*/*Edits* count opens that player's list, with
the same control per file.

Desktop, a popover anchored on the icon, about 340 px:

```
┌ Access · Ana's sheet ──────────────────────────────── × ┐
│ Table: Ruins of Valdor                                   │
│                                                          │
│ Whole table   ( Does not see | ▣ Sees | Edits )          │
│ ──────────────────────────────────────────────────────── │
│ (A) Ana  ●    ( Does not see |  Sees  | ▣ Edits ) her own │
│ (B) Bruno     ( Does not see | ▣ Sees | Edits )  = table  │
│ (C) Caio      ( Does not see | ▣ Sees | Edits )  = table  │
│                                                          │
│ ⚠ This note has 2 secret blocks: whoever edits sees them.│
│ Follows the folder "Sheets" — ↺ Follow the folder        │
│ ▸ More options                                           │
│     [ ] Secret name — links to it show as ▒▒▒▒           │
│                                                          │
│ You, the game master, always see and edit.     Saved ✓   │
└──────────────────────────────────────────────────────────┘
```

- A segmented control per row (`role=radiogroup`; arrow keys change it): saves
  at once and answers beside itself (*Saved ✓* or the error in red), as the
  *Table open* switch does.
- *Whole table* is the default of the file: it changes the rows that read
  *= table* and holds for whoever joins later. A row that differs reads *their
  own* with a *↺* that returns it to the whole table's value (item 6).
- The line *Follows the folder "Sheets"* shows while the file has no set of its
  own; once changed alone it reads *Own access (exception of "Sheets")* with
  *↺ Follow the folder*.
- Choosing *Edits* on a file with secret blocks shows the warning before it
  saves (0087 item 5).
- On a **board**: the same, and when it has cards of files that player does not
  see, a line *Ana will see 3 locked cards* (H).

The folder's dialog — the same control, applied with a button because it
replaces what is inside (item 2):

```
┌ Access · folder "Places" ──────────────────────────── × ┐
│ Table: Ruins of Valdor                                   │
│                                                          │
│ Whole table   ( Does not see | ▣ Sees | Edits )          │
│ ──────────────────────────────────────────────────────── │
│ (A) Ana       ( Does not see | ▣ Sees | Edits )  = table  │
│ (B) Bruno     ( Does not see | ▣ Sees | Edits )  = table  │
│ (C) Caio      ( ▣ Does not see | Sees | Edits ) his own ↺ │
│                                                          │
│ Applying changes the access of 14 files,                 │
│ 2 exceptions included.                     [ Apply ]     │
│ ──────────────────────────────────────────────────────── │
│ Exceptions (2) — files with their own access             │
│   Crypt.md           Ana edits · 2 see  ↺ Follow the folder │
│   crypt-map.png      nobody sees        ↺ Follow the folder │
└──────────────────────────────────────────────────────────┘
```

A file moved into the folder from elsewhere keeps its own access (K.2) and is
listed among the exceptions with its *↺*, like a file changed alone.

Phone, a bottom sheet at 390 px, 44 px targets, the close button focused on
opening (as today's sheet):

```
┌───────────────────────────────┐
│ ▔▔▔                           │
│ Access · Ana's sheet      ✕   │
│ Table: Ruins of Valdor        │
│                               │
│ Whole table                   │
│ [ Not ][ ▣ Sees ][ Edits ]    │
│ ───────────────────────────── │
│ Ana ●               her own   │
│ [ Not ][  Sees  ][▣ Edits ]   │
│ Bruno               = table   │
│ [ Not ][ ▣ Sees ][ Edits ]    │
│ Caio                = table   │
│ [ Not ][ ▣ Sees ][ Edits ]    │
│                               │
│ ⚠ 2 secret blocks: whoever    │
│   edits sees them.            │
│ ↺ Follow the folder           │
│ ▸ More options                │
└───────────────────────────────┘
```

What a player sees — never the controls:

```
 Ana's sheet                          [✎ You edit]
 Lighthouse diary                     [👁 You read]
```

- In the title row a chip *You edit* or *You read*; hover or a tap shows who
  else sees ("You, Bruno and the game master"), as today.
- In the tree a small pencil on the files they edit; nothing on the ones they
  only read. In a folder they edit, *New note* and *Rename* are offered; never
  *Delete* nor a move (K.5).
- Inside a table the folder's lock is **not** shown to a player (they edit some
  files; the lock would lie); it stays for a reader outside a table (0076 item
  11).
- Trying to write where they only read: *You only read **this note**. The game
  master gives editing.* — near the attempt, as today.

The Table window — the rights per person:

```
 PLAYERS  3                                  Send files: [■ everyone]
 ┌───────────┬──────┬────────┬──────────────┐
 │ Player    │ Sees │ Edits  │ Send files   │
 ├───────────┼──────┼────────┼──────────────┤
 │ (A) Ana ● │  7 ▸ │  2 ▸   │ [■■□] Saved  │
 │ (B) Bruno │  5 ▸ │  1 ▸   │ [□□■]        │
 └───────────┴──────┴────────┴──────────────┘
 ▸ opens that player's list of files, each with
   ( Does not see | Sees | Edits ) — the dialog's own control.
```

*Send files* covers the chat **and** a new file in a file the player edits
(item 5, K.4). Rights live here; access to files lives in the dialog.

### G. The secret name

Stays (0110 item 7), as an option of the dialog (*More options*), kept in
`campaign_files`.

### H. A board a player edits (item 4)

Today's reason to refuse (`campaign_cmds.rs:487-488`) is real: a player is
served the board **projected** — cards of hidden files as locked text cards,
secret pins absent — and a whole-file write from them would write the
projection over the board. So:

- A player who **edits** a board joins the board's **room**, which already merges
  by element (0082 item 12), and receives **only the elements they see**: a card
  of a file they do not see as a locked marker with the **same id**, secret pins
  (0090) absent.
- The server **refuses** an update that touches an id the player does not see,
  a locked marker, or a secret pin, and **never** accepts a whole-file write of a
  board from a player (`write_text`, `sync_put` of a `.canvas`).
- New elements, and changes to elements they see, are accepted. A text element
  of the board follows 0087 item 5 as a note does: whoever edits sees its
  secret blocks, and the dialog warns.
- A player who only **sees** a board is served the projection, as today.
- Tests: a property "no hidden id or text reaches a player" and "an update to
  an id not seen is refused", in the manner of 0087's.

### I. Migration (nothing lost)

Schema 20, in one transaction:

- `released = 1` → `(path, NULL, 'see')`;
- each `campaign_audience (path, a)` → `(path, a, 'see')`;
- `grant_kind = 'group'` → `(path, NULL, 'edit')` (over the `see`);
- `grant_kind = 'player', a` → `(path, a, 'edit')`;
- `secret_name` → `campaign_files`;
- `campaign_images` → `campaign_rights (…, 'files')`.

No folder gets a set (today's "release everything here" wrote rows per note),
so after the migration every row is a file's own and the inheritance of item 2
changes nothing. The old tables stay one version, read-only (going back is
possible), and go in the next. An **equivalence test** is required: for
generated old states, today's `Veil` and the new `may(See | Edit)` give the same
answer for every player and every path — so the per-player sync logs
(`campaign_epoch`, `_viewer`, `_skip`, `_lost`, `_gone`) do not move and no
device gets a forced deletion at the upgrade. The differences decided here
are outside that test and tested on their own: an editor of the folder inside a
table becomes a player who edits what they see (item 3, K.1), and the game
master's read-only credential stays game master (item 6).

### J. The rebuild, step by step

| Step | What | Tests | Deletes |
|---|---|---|---|
| S0 | This ADR | — | — |
| S1 | `access::may` pure + `AccessFacts` | the **exhaustive table test** below; it writes `access-vectors.json` | — |
| S2 | Schema 20 + migration | old × new equivalence (I) | — |
| S3 | Every door of the server calls `may`: `folder_command` (`rpc.rs:906-915`), `rpc_collab` (`:64-72`), `sync_put` (`sync.rs:619-626`), `table_send_image`/`may_send_images`, `game_master`, the masking of secret rolls, deleting and clearing, `campaign_status`; a player's create and rename in a folder they edit (K.5); a move or rename carrying the file's set (K.2) | today's `tests_campaign*`, `tests_audience*`, `tests_table*` pass with unchanged expectations except the decided changes | `granted_write`, `group_put`, `acting`, the seat branch of `campaign::player`/`guard` |
| S4 | Contract: `FileAccess`, `FolderAccess`, `access-changed`, `access_get`, `access_set`, `table_rights_set`; folders and every kind of file | bindings checked; the harness answers from the vectors | `campaign_audience`, `campaign_grant`, `campaign_release*`, `campaign_secret_name`, `campaign_permission` (once the window has moved) |
| S5 | The window's `access.ts`; the ~115 places of the review's 1.1; drop by target; the chat's thumbnail as `armDrag`; `attachImage` through the server | `test/access.test.mjs` over the vectors; e2e | `canChange`, `readsSynced`, both `syncedReader`, `mayEditGranted`, `readable` (`files.ts`), the inference in `mayShare` |
| S6 | The **Access…** dialog (desktop and sheet) for any file, the folder's dialog with its exceptions (moved files included, K.2), one menu row, the multiple selection, the indicator on every file, the Table window's players re-wired | e2e at 1500, 820 and 390 px; screen reader | `audienceItems`, the "Editável por" submenu, "Alterar quem vê…", `campaignSelectionItems`, "Liberar/Ocultar tudo daqui" |
| S7 | The board a player edits (H) | the two properties | the refusals of `campaign_cmds.rs:489` and `collab.rs:444` for whoever edits |
| S8 | The synced desktop: the host asks `access_get` over the sync's link and keeps the last answer (offline the last one holds); `sync_put` by `may(Edit)` (closes B9); a player's board is never uploaded whole (H) | `tests_live_table.rs`, `tests_sync.rs` | — |
| S9 | The live test's scenarios as the server's e2e: Ana in the browser drops a roll on her sheet; drags the map from the chat onto her sheet; edits the group's board; Bruno does not; the game master gives *Edits* to Ana and Bruno together; a folder set, then an exception, then *↺*; Ana makes and renames a note in a folder she edits and cannot delete it; a file moved by the game master keeps its access; a PDF sent with *Send files* | `e2e-server/access.spec.mjs` | — |
| S10 | The tutorial (note 32 "Rodando uma Mesa", a card on the tour) and both CHANGELOGs | the walkthrough | — |

**The exhaustive table test** (S1): role {owner, editor, reader, none} ×
credential {write, read, phone as reader, phone as editor, read link} × table
{none, open, closed} × where the level comes from {nothing, the file's set, a
folder's set, an exception under a folder's set, a per-player row below the
whole table's, a file moved in with its own set} × level {none, see, edit} ×
kind {note, board, base, attachment, other file, folder} × right *Send files*
{off, on} × every action → the expected
answer, written by hand as a table in the test. It writes the shared vectors,
`app/ui/test/access-vectors.json` (as `sync-vectors.json` serves
[0092](0092-the-phone-offline.md)); the window's test and the harness read the
same vectors, so the harness stops being a fourth implementation (C10). A
guardrail of the feature, seen failing before the merge
([0029](0029-guardrails-in-ci.md)).

### K. Answered the same day

The points the first answers left open went back to the maintainer on
2026-10-24; four were answered, one (K.3) was not asked and is the code's
choice.

1. **What "edits everything" covers for a folder editor inside a table.**
   `[DECIDED 2026-10-24]` The maintainer: *"Tudo o que ele vê"* (everything he
   sees). A folder-role (or share) editor inside a table stays a player — does
   not see hidden files nor others' secret rolls, has no table controls — but
   **edits every file they see**, with no per-file *Edits* needed. By 0087 item
   5 they therefore see the secret blocks of every file they see; the share
   dialog says so when the path holds a table.
2. **A file moved or renamed into another folder.** `[DECIDED 2026-10-24]` The
   maintainer: *"Leva o próprio acesso"* (it takes its own access along). A
   moved or renamed file keeps its own set and becomes an **exception** in the
   new folder, listed in that folder's dialog with *↺ Follow the folder*.
   `[PROPOSED]` (the author's reading): a file that had no set of its own takes
   along the access it had — its old folder's, written as its own set — so a
   move never changes who sees it; a moved folder carries its set the same way,
   and the files that followed it keep following it. A rename inside the same
   folder changes nothing.
3. **An attachment with an explicit access and a file that embeds it.** Not
   asked; *chosen in the code*, to confirm: an **explicit access on the
   attachment wins**; with none, it follows the notes and boards that embed or
   link it, today's rule. `[PROPOSED]` (the author's reading of "explicit"): a
   folder's set covering the attachment counts as explicit, since applying a
   folder replaces what is inside (item 2); a note a player sees that embeds an
   attachment hidden from them shows "🔒 (not revealed yet)" there, and the
   note's dialog says *this note shows 2 files Ana does not see*.
4. **A new file that is not an image.** `[DECIDED 2026-10-24]` The maintainer:
   *"Sim, pelo mesmo direito 'Imagens'"* (yes, through the same "Images"
   right). The per-player right is renamed **Send files** (*Enviar arquivos*):
   images, PDF, audio and other files, with the same checks — the type by the
   bytes where it is known, the table's size limit, the folder's quota, never
   SVG, HTML or a script — and it covers the chat **and** a new file put into a
   note or board the player edits. This widens item 5 and 0107 item 3 (the chat
   carries files, not only images). `[PROPOSED]`: the chat shows a file that is
   not an image as a card with its name, kind and size; the table's limit keeps
   its value and is named *file size limit*.
5. **Edits on a folder for a player.** `[DECIDED 2026-10-24]` The maintainer:
   *"Cria e renomeia, não apaga"* (creates and renames, does not delete). A
   player with *Edits* on a folder **may create** files inside it — a new file
   takes the folder's access (item 2) — and **may rename** files inside it; a
   player **may not delete**, and **moving a file into or out of a folder stays
   the game master's**. This gives 0110 item 6 (MC.3 = A) its way: a folder the
   game master releases as *Edits* is the players' place for their own boards
   and notes.

## Consequences

- `verso-server` gains `access::may` and `AccessFacts`; every permission check
  of the table — commands, rooms, sync, the table's log, images, the status —
  calls it. The veil stays and is computed from the new rows.
- The database goes to schema 20 with `campaign_access`, `campaign_files` and
  `campaign_rights`; the old tables are read-only for one version.
- The contract gains `FileAccess`, `FolderAccess`, `access-changed`,
  `access_get`, `access_set` and `table_rights_set`; types generated; five
  campaign commands and `campaign-changed` go once the window has moved.
- The window gains `access.ts`, one dialog for any file and folder, the folder's
  exceptions, a player's *You edit* / *You read* chip, a pencil in the tree; it
  loses the two submenus, the bulk folder rows, the inference of the owner from
  an error and the three synced-reader flags.
- A folder editor inside a table **sees less than today** (item 3): it stops
  seeing hidden files and others' secret rolls, but edits every file it sees
  (K.1). A table that relied on an editor as a helper game master loses the
  hidden half; the change is said in both CHANGELOGs when built.
- Players create and rename inside a folder they edit, never delete nor move
  (K.5); a move keeps a file's access (K.2); *Send files* replaces the images
  right and covers any file the checks accept (K.4).
- The game master's own read-only phone or token **sees more than today**
  (item 6): it is served the folder whole, read-only.
- A player's synced desktop uploads the notes they edit (B9 closed) but never a
  board whole: a player edits a board only live, and the window says so
  offline.
- 0076 item 11's lock is not shown to a player inside a table; the notice
  names the note, not the folder.
- The e2e harness answers from the shared vectors instead of its own copy of
  the rules.
- The demo vault's note 32 and the tour's card are rewritten for the dialog.

**Risks.**
- The migration moves every per-player sync log's basis; the equivalence test
  is what keeps a device from being told a deletion it should not get. It must
  be seen failing (on a deliberately wrong mapping) before it counts.
- A folder's *Apply* replaces many files at once, and exceptions vanish with
  it; the count before applying is the only guard. It goes in the audit log
  (one row per apply, with the count).
- The board room by element is new code on a path that leaks if it is wrong;
  the two properties of H are the guard.
- About 115 call sites move in S5; the vectors and the e2e of S9 must pass
  before the old predicates are deleted, not after.

## Discarded alternatives

- **Fixing the current menus one by one.** The state the live test found; the
  maintainer rejected it in his report (*"um macarrão de código de permissões,
  em vez de fazer um negócio inteiro, sólido"*).
- **Access for notes, boards and bases only.** The proposal's scope; the
  maintainer widened it to any file and folder (item 1).
- **A co-master seat** for a folder editor inside a table (the proposal's
  recommendation for its Q1: sees and edits everything, sees secret rolls,
  deletes rolls). Not taken: *"Jogador que edita tudo"* (item 3).
- **Only boards with nothing hidden may be edited by a player** (the
  proposal's cheaper option B for its Q2). Not taken: *"Sala por elemento"*
  (item 4).

## Status

Accepted 2026-10-24; not built yet. Items 1–5 are the maintainer's answers of
2026-10-24; item 6 the proposal's recommendation taken with his general
approval; K.1, K.2, K.4 and K.5 are his answers of the same day, K.3 the
code's choice to confirm. Sections A–J are the approved proposal adjusted to
those answers; the details marked `[PROPOSED]` are the author's. Nothing is
`[OPEN]`. To be read by the other model before S1 starts
([0032](0032-author-and-reviewer-roles.md)).

### As built, S1–S3 (2026-10-24, `feat/one-access-model`)

Server side only; the contract and the window are S4–S6.

- **S1.** `access::may(facts, asker, action, target)` in `verso-server`
  (`access/rules.rs`, no IO), `AccessFacts` (the tables, the sets by path,
  the rights), the seat from the role alone, `level` with folder
  inheritance and exceptions, the credential ceiling. The exhaustive matrix
  test (`access/vectors.rs`) compares it with a second statement of
  section B written by hand and writes `app/ui/test/access-vectors.json`
  (895 cases, checked in, checked to be up to date; seen failing on a wrong
  rule).
- **S2.** Schema 20: `campaign_access`, `campaign_files`, `campaign_rights`,
  the old rows carried over (a hidden note stays a note the table knows, as
  an explicit `none`); the old tables stay, never written. The veil is built
  from the sets. The equivalence test (`db/tests_access.rs`) generates every
  old state and checks the veil answers as the old one did for every player
  and path, and drives the new `campaign_audience` / `campaign_grant`
  against a model of the old writes; both were seen failing on a wrong
  mapping.
- **S3.** `access::Door` (the asker of a request and the facts) is what
  every door asks: `folder_command` (`check_write`), `rpc_collab`, the
  device's `sync_put` / `sync_delete` / `sync_rename` (`check_sync`), the
  table's log (`log_role`, `DeleteEntry`, `Clear`, `SendFile`), `game_master`
  (`ManageTable`, `ManageAccess`), the status, `files` over HTTP, history and
  the bin, the closed-table guard, the pushes (`readers::split`). Deleted:
  `granted_write`, `group_put`, `acting`, `images_allowed` and the repeated
  `role.writes() && token_writes`.
- **Read as the ADR is silent, to confirm.** (1) `Attachment` and `OtherFile`
  follow the same rules. (2) An editor outside a table keeps the folder's
  role (everything is theirs); inside, *Sees* already means editing (K.1)
  and a folder they see is one they create and rename in (K.5). (3) A board
  is never written whole by a player nor typed in by one until S7 (H): a
  folder editor loses the board's room at a table meanwhile. (4) A device's
  `sync_put` by a player still needs the note to be served whole (the whole
  group edits it), S8 lifts it. (5) The game master's read-only credential
  joins a room as a reader; it reads the notes whole, over the commands. (6)
  Making a file's set empty keeps an explicit `none` (the row an old hidden
  note had), so a later folder set does not decide for it.

### Review of S1–S3 (2026-10-24): what a player is shown of what it does not see

Anything of a file shown, named or answered to someone outside its access is
BLOCKING (the maintainer's rule). The review found five ways and the
maintainer decided two behaviours; all are tested (`tests_access_review.rs`).

- **A rename's answer** (the maintainer, 2026-10-24, *"Servidor corrige sem
  contar"*): the server still rewrites the links in the notes a player may not
  edit, as `share_links::apply` does for a share; the answer to a player keeps
  only the rewrites of notes it may *Edit*, the skipped and the moved of what
  it may *See*, and nothing of what is hidden.
- **A name taken by something hidden** (the maintainer, 2026-10-24, *"Sufixo
  automático"*): creating or renaming onto a name that something the player
  cannot see holds is never answered "exists"; the server uses the next free
  name (`Cripta 2.md`), as a duplicate does, and answers with the name used.
  A name taken by something the player sees is refused as ever.
- A file moved or renamed into a table by anyone but the game master is
  refused (K.5), and always needs *Create* on the new folder; a folder is not a
  non-master's to rename when it holds a table, or anything the person does not
  see; the bin is refused to a player at any table of the folder; a new file
  that is no note, board or base made by a player at a table is a file sent
  (the right, the bytes by their first bytes, the limit — never SVG, a page or a
  script) and a device's `sync_put` of one is refused until S8.
- One statement of "sees the secret blocks": `Player::sees_secrets` asks
  `may(SeeSecretBlocks)`; a room joins whole for whoever it allows, the game
  master's read-only credential included (typing stays the writers').
  `history_copy` asks *Create* on the folder; the pathless commands of a table's
  root are the game master's; the migration reads audience rows only of notes
  the old tables had; a paired phone's ceiling follows its pairing live.
- Left as built: *Say* and *Roll* with a read-only credential stay allowed
  (the chat is not a file write). The `none` the migration wrote for a note the
  table had hidden is marked (`migrated`) and is no exception in a folder's list.
