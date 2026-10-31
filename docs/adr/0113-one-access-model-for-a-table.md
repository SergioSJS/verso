# ADR 0113 — One access model for a table: a seat, per-path access, per-player rights

- Date: 2026-10-24
- Source: the maintainer's live test of a table on 2026-10-24 (his report is
  quoted in Context), the read-only audit made the same day at his request
  ([review 2026-10-24](../review/2026-10-24-permissions-audit.md), on
  `feat/rpg-tools` at `210dab16`), and his answers to that audit's proposal
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
   kind of file and renamed **Send files** (K.4). **Amended 2026-10-28 (K.6):**
   a new image in a note or board needs only *Edits*; the chat's image right
   is *Images* again, apart from *Files*. **Amended 2026-10-28 (where the
   file goes):** the maintainer: *"A imagem que o jogador põe no board deve ir
   para a pasta de assets referente àquele board. Se o board está dentro de uma
   pasta, dentro daquela pasta vai ter uma pasta assets, onde vai ter a imagem
   que ele colou. Essa é a regra geral da aplicação, não deveria ser diferente
   aqui."* `[DECIDED 2026-10-28]` A new file a player puts into a note or board
   goes where the app puts any attachment of that file — the file's own folder,
   then the person's attachments subfolder (Settings, `assets` by default) — as
   the game master's own paste does; only the chat keeps the table's
   attachments place. The server checks the subfolder it is given (relative,
   no `..`, no hidden segment; `assets` otherwise) and a name taken by a file
   the player does not see gets the silent suffix (S1–S3 review).
   `[DECIDED 2026-10-29]` (the maintainer: *"a nota deveria receber o acesso
   de onde ele ta colocando uai"*, the image takes the access of where it is
   put): the new file takes, as its own set, the access of the file it was
   put into, so the players who see
   that board see its image and no one else — a folder's set over `assets/`
   would otherwise hide the image of a board that is an exception. A player's
   *Export to folder* of a board still goes to the table's attachments
   (the maintainer, 2026-10-28: *"sim"*).

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
says so (*edits all they see*). `[DECIDED 2026-10-31]` (the author's reading of K.1 with K.5, accepted; Status): a folder they see
counts as a folder they edit, so they create and rename inside it.

`[DECIDED 2026-10-31]` (the author's reading of item 2, accepted; Status): a node's access is **one whole
set** — a *Whole table* row and the per-player rows that differ from it. Changing
a file alone writes its whole set, so the file stops consulting its folder
entirely; *↺ Follow the folder* deletes the file's set. A node never mixes its
own rows with its folder's per player.

An **attachment** (any file that is not a note, board or base) follows K.3,
*chosen in the code* and decided 2026-10-31: an explicit access wins; with none, it keeps today's
derived rule — seen by a player when a file that player sees links or embeds
it, or when the table shows it (0110 "Chosen in the code" (5)).

### B. The rules (one table)

| Action | Outside a table | Game master | Player | Visitor (read link) |
|---|---|---|---|---|
| See a file or folder | role ≥ reader | yes | table open ∧ level ≥ see | table open ∧ *Whole table* ≥ see |
| See an attachment | role ≥ reader | yes | table open ∧ the attachment's level ≥ see (K.3) | same, by the *Whole table* rows |
| See secret blocks (0087) | role ≥ editor | yes | Edit(file) (0087 item 5; the dialog warns, F) | no |
| Edit (a note's text, a board's elements, a base's rows, a file's bytes) | role ≥ editor ∧ cap Write | cap Write | cap Write ∧ (level = edit, or role editor ∧ level ≥ see, K.1) | no |
| Attach (a **new** file into a file the person edits) | role ≥ editor ∧ cap Write | cap Write | image: Edit(target) ∧ cap Write; other: Edit(target) ∧ right *Files* ∧ cap Write (K.6) | no |
| Link something already seen (drag from the chat, the tree) | = Edit(target) | = Edit(target) | = Edit(target), no further right (item 5) | no |
| Create (inside a folder) | role ≥ editor ∧ cap Write | cap Write | Edit(folder) ∧ right *Creates notes* or *Creates boards* by kind ∧ cap Write (K.6); a new file takes the folder's access | no |
| Rename (same folder) | role ≥ editor ∧ cap Write | cap Write | Edit(file) ∧ cap Write (K.6) | no |
| Move (into or out of a folder) | role ≥ editor ∧ cap Write | cap Write | no (K.5) | no |
| Delete | role ≥ editor ∧ cap Write | cap Write | no (K.5) | no |
| Say, Roll, RollSecret | — | yes | yes (table open) | no |
| See others' secret rolls | — | yes | no (an editor neither, item 3) | no |
| Delete an entry, clear the table | — | yes | only their own message or file | no |
| SendFile (chat) | — | cap Write | image: right *Images*; other: right *Files*; ∧ cap Write (K.6) | no |
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
   `[DECIDED 2026-10-31]` (the author's reading, accepted): a file that had no set of its own takes
   along the access it had — its old folder's, written as its own set — so a
   move never changes who sees it; a moved folder carries its set the same way,
   and the files that followed it keep following it. A rename inside the same
   folder changes nothing.
3. **An attachment with an explicit access and a file that embeds it.** Not
   asked; *chosen in the code*, `[DECIDED 2026-10-31]`: an **explicit access on the
   attachment wins**; with none, it follows the notes and boards that embed or
   link it, today's rule. `[DECIDED 2026-10-31]` (the author's reading of "explicit", accepted): a
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
   carries files, not only images). `[DECIDED 2026-10-31]`: the chat shows a file that is
   not an image as a card with its name, kind and size; the table's limit keeps
   its value and is named *file size limit*. *As built (checked 2026-10-31,
   `app/ui/src/table/view.ts` `fileCard`):* the card shows the name and the
   kind — PDF or audio, the only kinds besides images that the server's
   `table_image.rs` takes — and a click opens the file; it does **not** show
   the size yet, a gap to build. The limit keeps its value; it is not yet
   named *file size limit* where it is shown (the refusal says "the table's
   most", the code calls it `image_limit` / `IMAGE_MAX`), a gap to build with
   the size. **Amended 2026-10-28 (K.6):**
   *Send files* is split into *Images* and *Files*.
5. **Edits on a folder for a player.** `[DECIDED 2026-10-24]` The maintainer:
   *"Cria e renomeia, não apaga"* (creates and renames, does not delete). A
   player with *Edits* on a folder **may create** files inside it — a new file
   takes the folder's access (item 2) — and **may rename** files inside it; a
   player **may not delete**, and **moving a file into or out of a folder stays
   the game master's**. This gives 0110 item 6 (MC.3 = A) its way: a folder the
   game master releases as *Edits* is the players' place for their own boards
   and notes. **Amended 2026-10-28 (K.6):** creating needs a right of its own,
   and renaming needs *Edits* on the file, not on the folder.

### K.6 Amended 2026-10-28: what Edits covers, and four rights per player

The maintainer, after the live test (2026-10-28): *"Editar tudo inserir
imagens, alterar o texto, apagar texto, renomear arquivo. Só não pode apagar.
Arquivo movido leva a permissão. Arquivos não imagem podem ser inseridos, mas
o mestre deve dar permissão, imagem separado de outros arquivos. Criação de
notas, boards deveriam ser permissões à parte."* His answers to the three
questions that followed, the same day, are quoted below.

1. **Edits covers the whole file but its deletion.** `[DECIDED 2026-10-28]` A
   player with *Edits* on a file changes its text or elements, puts a **new
   image** into it (the server writes the image, item 5, with the same checks
   as the chat), and **renames** it inside its folder. They never delete it.
2. **A move stays the game master's; a moved file takes its access.**
   `[DECIDED 2026-10-28]` *"Só o mestre"*: a rename into another folder is a
   move, and K.5 holds. K.2 holds.
3. **Four rights per player, all off for a new player.** `[DECIDED 2026-10-28]`
   They live in the Table window's players list (F), where *Send files* was:
   - **Images** (*Imagens*), *"Direito 'Imagens'"*: send an image to the
     table's chat.
   - **Files** (*Arquivos*): send a file that is not an image (PDF, audio,
     other kinds; the checks of K.4) to the chat **and** put one into a file the
     player edits.
   - **Creates notes** (*Cria notas*) and **Creates boards** (*Cria boards*),
     *"2 direitos por jogador"*: create a note, or a board, inside a folder the
     player has *Edits* on. Without the right, *Edits* on the folder lets them
     edit and rename what is in it, not add to it.
4. `[DECIDED 2026-10-28]` The maintainer: *"essa parte aí eu acho que tá ok"*. *Creates notes* also covers
   a base and a new folder; *Creates boards* also covers a drawing
   (`.excalidraw`). A folder-role editor inside a table (K.1) is a player for
   these rights too: the game master gives them.
5. `[DECIDED 2026-10-28]` The maintainer: *"Ganha (como está)"*. **Migration, nothing lost:** a player who had *Send files* gets
   *Images* and *Files*; a player who had *Edits* on any folder of the table
   gets *Creates notes* and *Creates boards*, so no one loses a power they used
   the day before.

In B: *Attach* of an image is `Edit(target) ∧ cap Write`; of another file
`Edit(target) ∧ right Files ∧ cap Write`. *Create* is `Edit(folder) ∧ right
Creates notes|boards (by kind) ∧ cap Write`. *Rename* is `Edit(file) ∧ cap
Write`, the same folder only. *SendFile* (chat) is right *Images* for an image,
*Files* otherwise.

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

**The author's readings and K.3 decided (2026-10-31).** Put to the maintainer
in the list of 2026-10-31 (the four `[PROPOSED]` readings — a folder a table
editor sees is one they create and rename in, a node's access is one whole set,
a moved file with no set of its own takes the access it had, a file that is not
an image is a card in the chat — and K.3's "explicit"), he answered *"O
restante ta aprovado"* (the rest is approved), keeping apart only five items of
other ADRs. Each is marked `[DECIDED 2026-10-31]` in place (A, K.2, K.3, K.4):
a folder's set covering an attachment counts as explicit, the note shows 🔒 and
its dialog warns. K.4's card was checked against the code before it was marked:
the size and the limit's name are not built yet (the as-built note in K.4).
Whether the 🔒 and the dialog's warning of K.3 are built was not checked in
this record. No `[PROPOSED]` stays in this record.

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

### As built, S4–S6 and S10 (2026-10-25, `feat/one-access-model`)

The contract, the window, the dialog and the tutorial. The server side is
S1–S3 and the synced desktop is S8.

- **The contract (S4, `2beb63be`, `703f0159`).** `FileAccess` (`level`,
  `attach`, `why`) on every read answer and every listing entry; `FolderAccess`
  in the capabilities (the seat, the role, the credential's ceiling); the
  `access-changed` event with its paths (empty when a table or a right
  changed); `access_get`, `access_set` (`AccessChange::Set` replaces a folder's
  whole set and answers how many files changed; `Follow` deletes a path's own
  set) and `table_rights_set`. Types in `verso-contract/src/access.rs`, commands
  in `verso-server/src/access_cmds.rs` and `campaign_cmds.rs`, with the Tauri
  stubs, permissions, remote forwards and the phone's deny list. Bindings
  regenerated. `AccessInfo.master` is the owner's account name, never an
  e-mail (`master_name`; `62281f9c`). `703f0159` has the harness answer the new
  commands from the shared vectors.
- **One question in the window (S5, `1745f329`).** `access.ts` keeps what the
  server said and asks `accessCore.decide` through `may(path, action)`, which
  replaces `canChange`, `readsSynced`, `syncedReader`, `mayEditGranted`, the
  folder-wide `readable()` and the owner inferred from an error. The chip and
  the badge ask `tableViewer()` (`tableChip.ts`) instead of the campaign's
  `viewer`.
- **Chat drag (S5, `1745f329`, `f3a152af`).** Every chat entry is a drag
  source (`table/view.ts`): a roll, a draw, an oracle or a message is dragged as
  its block or line; an image or a file as a link to the file already in the
  folder, nothing uploaded. The drop needs `may(path, "edit")` on the target
  and nothing of the entry's author. A masked secret entry (kind `secret`) holds
  nothing to drag and is not draggable.
- **The Acesso… dialog (S6, `6672ee0a`, `d1a68806`).** `accessDialog.ts`, its
  strings in `accessStrings.ts`, its controls in `accessControl.ts`. It opens
  from a file's title icon, one row of the tree's menu and a multiple selection
  (`noteAccess.ts`, `menu.ts`); a folder shows how many files an *Apply* changes
  before it applies. The indicator is the table chip (`tableChip.ts`); the Table
  window keeps a per-file control and a per-player control (`campaign.ts`,
  `campaignPlayers.ts`).
- **Send files (K.4, merge `f96e403e`: `cde87295`, `4e636369`, `4f2a6ff0`,
  `084a699c`).** A player with *Send files* sends images, PDF and audio (MP3,
  Ogg, WAV, M4A) to the chat, and into the notes and boards they edit. The kind
  is judged by the first bytes, never by the name (`file_ext` in `table.rs`);
  an MP3 needs a real MPEG Layer II or III frame header (`084a699c`). The bytes
  are written under the table's attachments place (`table_image.rs`, `PLACE`).
  The window: `table/send.ts` (`sendable`), `table/compose.ts`, the file card
  in `table/view.ts`. A rename at a table keeps a file's kind (`door.rs`): a
  sent PNG is never renamed into a page, an SVG or a PDF, and a text write
  makes no non-note file.
- **Removed.** `campaign_permission`, its Tauri command, permission and the
  old access-menu strings in `campaignStrings.ts` (`c796555f`); `table_rights_set`
  replaces it.
- **Dialog tests (T6, merge `125845e4`: `d04ca6e3`, `ff320747`, `4beabaf8`,
  `fc5db141`, `edc74df5`, `449b6277`).** `app/ui/e2e/access-dialog.spec.mjs`
  drives the dialog by keyboard alone; at 1500, 820 and 390 px every control is
  reachable inside the dialog's width, and the spec checks fair targets on the
  phone's sheet (Apply, Follow the folder and More options are 44 px there); the
  dark theme keeps the words legible and a chosen level distinct. Focus returns
  to the opener's row after a save draws the tree again; the folder page redraws
  its table card when the seat arrives.
- **Tutorial and changelog (S10, merge `b83d201e`: `29b1b1e8`, `908b18f4`,
  `15f767aa`, `ba876279`, `e93a037d`).** Notes 31 (`31 - A Mesa.md`) and 32
  (`32 - Rodando uma Mesa.md`) describe the one model, `app/ui/src/demoVault.ts`
  is regenerated, walkthrough §18 ("Running a table (note 32)") holds the steps,
  and both CHANGELOGs carry the entries.
- **Read as the ADR is silent, to confirm.** (1) K.4's "other files" are images,
  PDF and audio only; any other kind is refused. (2) The file card shows the
  name and the kind (PDF or audio), with no size. (3) A non-player's note editor
  still takes images only (`leaves/note/editing.ts`); a player's takes PDF and
  audio too.

Not done, said: the Table window's *Liberar tudo* and *Ocultar tudo* buttons
stay, calling `campaign_release_all` and `campaign_release`; the commands
`campaign_audience`, `campaign_grant` and `campaign_secret_name` stay in the
server and the harness and are called by the tests, not by the window. The
secret name's database write (`db/access.rs`) is also what `access_set` runs
when `secret_name` is given in `AccessChange::Set` (`access_cmds.rs`), so
`campaign_secret_name` has an access_set path, while the command remains.

### As built, S7 (2026-10-25, `feat/access-s7`)

The board a player edits (H). Server side in `board_sight.rs` (pure) and
`collab_players.rs` (the room); the dialog follows.

- **A shadow of the room per account.** A player whose `may(Edit)` holds on a
  board joins a document of their own, made by the server of what the account
  sees (`board_sight::see`): an element is *Open* (as it is — a text card whole,
  secret blocks included, 0087 item 5), *Locked* (the card of a file the account
  does not see: the **same id**, the same place and size, the words every veiled
  card has, `locked: true` so that the board will not select it — never the
  file's path, colour or text) or *Gone* (a secret pin, 0090 item 5, and what
  belongs to it: the edges that touch it, the drawn elements bound to it,
  inside it or grouped only with secret pins; a tombstone of one is not told
  either). The snapshot at the join and every update after it are one
  function; a card's `boundElements` and a group are cut the same way, and the
  `base` of the room's facts is the file's projection (`shape_canvas`: the
  same pins left out, the same locked cards). A player who only *sees* the
  board still follows the file, as before (0090 item 5 revised 2026-10-15).
- **The room follows the shadow by element.** What a player's window sends is
  tried on a copy of the shadow and judged (`board_sight::check`): the edit is
  refused **whole**, with nothing of it in the room, when it puts or removes an
  entry of an id the account does not see (a marker, a pin, an id only the file
  holds), when an entry is not its key's element, when it makes a secret pin,
  when a card it makes or changes names a file the account does not see **or
  that is not there** (so a card is no way to ask whether a hidden file
  exists), or when it changes what any other element is to the account (a
  group opened, an edge to a pin). New elements and changes to the ones they see
  are taken into the room by the server as its own edits, merged by element
  as 0082 item 12 says, and told to the other windows; the facts of the
  board they may change are their count of edits and the background.
  `write_text`, `write_board` and `sync_put` of a board stay refused to a
  player, and so does `collab_resolve` (it closes the room for everyone).
- **Who writes the file.** The game master's window, when it is in the room: it
  makes the file of the whole room, as ever, and a player's file is dropped.
  With only players in it, the file a player's window made of its shadow
  (`collab_canvas`, at the shadow's state) is **laid over the file on disk**
  (`board_sight::lay_over`): what the account does not see is the disk's, byte
  for byte; what they see is theirs; what their window dropped, they deleted;
  and a canvas that would change what an element is to them is not taken at
  all. A board drawn in by a player alone (no game master yet) is drawn into
  the shadow only; the game master's window draws the whole when it comes, and
  the versions merge by rank.
- **When what an element is to an account changes** — a pin made secret, a
  card's file released or hidden, the level changed — the account's shadow is
  closed: its windows are told the room closed (`collab-closed`) and join anew,
  from the file, as a note's readers do (`veil_changed`; a change inside the
  room by the game master is seen by `sync`). A game master demoted live leaves
  every room as before (`demoted`).
- **What else is cut.** The selection in a presence names an element only when
  the receiving account sees it (`presence::keep_selected`); `collab-saved`
  reaches a shadow without the file's hash; `access_get` counts the secret
  blocks of a board's text cards (not a pin's) and the dialog asks before
  giving *Edits* on a board that has some, and says what the player is shown.
  `campaign_grant` accepts a board. The refusals the step deletes are the
  board's of `rpc_collab` and `campaign_grant`; the one of `collab.rs` stays
  for a window that only reads.
- **Tests.** Two properties over rooms made at random (`board_sight_tests.rs`):
  *no hidden id or text reaches a player* and *an update to an id not seen is
  refused*, each seen failing on a wrong rule (a pin not hidden, the check
  skipped, the file left in a marker); and `tests_board_players.rs` against a
  real server (every frame Ana hears is checked for the canaries; her edits
  reach the game master; the refused ones leave no trace; the file keeps the
  pin, the hidden card and its edge byte for byte; the dialog; the closing of
  the shadow). The end-to-end test is `e2e-server/board-players.spec.mjs`.
- **Chosen where the ADR is silent, to confirm.** (1) A hidden file's card is
  *Locked*, never absent: the maintainer's wording (*a locked marker with the
  same id*). (2) A text
  card of the board is whole to whoever edits (H, 0087 item 5) — including its
  links to hidden notes, as a note they edit shows them. (3) A player cannot
  resolve a conflict between the room and the disk. (4) Presence of the game
  master (pointer) is told to the player; only the ids it selects are cut.
  (5) The desktop's synced board of a player (S8) is not touched.
- **Review of S7 (2026-10-25).** (1) *No activity oracle*: a shadow is told only
  `seeded` and `background` of the room's facts, never the others' edit
  counts; its `saved` is made for the account (its own count of edits, moved
  when the room writes), and the revision it is told of the file — at the join,
  in `read_text`, in `collab-saved` — is a hash of the text it is shown, so a
  save of what it does not see is none to it. (2) Presence told to a player is
  an allowlist of fields (`user`, `pointer`, `button`, `selected` cut to what
  it sees). (3) Her file is laid over the disk's when no window *that may
  type* and sees the whole board is in the room — a read-only one does not
  count. (4) And only when the file lacks nothing the whole board's windows
  left unsaved (`Board::whole_saved`): otherwise nothing is written, her work
  stays in the room, and the file is written when a whole window makes it —
  neither side is dropped. (5) A secret flag is read as the file's projection
  reads it, every duplicate key. (6) What a player draws into her shadow before
  the game master draws the room in (the seeding) stays in her shadow only; it
  never reaches the room, and the room's own versions of the same keys replace
  it when they come.

  Echoes and refusals of a board in a shadow (fix/board-loop, 2026-10-26):
  an element a window sends again, equal in substance to the latest version
  the room told the account (or the window drew when it seeded; `version`,
  `versionNonce`, `updated`, `seed` are noise, `index` is not), is no change
  and is never judged. A refusal does not close the board: the window joins
  once more, takes the room's state in place (view, selection and tool
  kept), keeps what the person did meanwhile, and a second refusal within 3 s
  with no change of hers stops it with a line. A card of a file that is not
  there is a locked card, with the one text every locked card has. Left as
  is: a card's id is not hidden from the player (the ids of locked cards are
  random, so an id says nothing of the file), so no oracle is added by it.

### As built, S8 (2026-10-25, `feat/access-s8`)

The synced desktop is one more door of the model; the host decides nothing of
its own.

- **What a device is served and may put.** A note is served to a device whole,
  and its `sync_put` accepted, exactly when the person edits it:
  `Veil::serves_whole` is the one statement (the whole group edits it, the
  person's own row says *edits*, or they are a folder's editor who sees it —
  K.1), asked by the reader pipeline (`reader_view_in`, `device_bytes`) and by
  `Door::check_sync`. This lifts S3's note (4): an editor's device writes the
  notes it edits again (closes B9). A note a person only sees is still served
  as the projection and its put refused. A board is never served whole to
  one who edits it alone, and never put whole (H). The folder's editor is read
  from the members **live** (never kept in the veil: a demoted editor is served
  the projection at once, the told-files cache is keyed by it); a read-only
  credential of the same account is not told apart in the per-player log
  (decided: the account's right decides what is served, the credential's
  ceiling still gates the put in `check_sync`).
- **What a device may do, asked.** `access_get` with `brief: true` answers
  `{path, see, put, delete, rename}` per path from the same judgement the
  writes meet (`check_sync`); a path the person does not see is answered as a
  free name is, never as an error. The host never derives it.
- **The host keeps the answer.** `State.access` (path → `Rights`, only the
  files the device may change) is saved with the sync's other per-folder state
  and holds while offline. A pass asks for the paths it is about to change; it
  asks for every file when the answer is stale (a connection made, the
  `access-changed` event, a change of role), and replaces the whole memo only
  once the server answered. A server or a cloud with no per-file answer leaves
  the role to decide (reader: nothing; editor: all, the server judging).
  Before, `role == "reader"` was the only gate.
- **What crosses.** `Gate` (`sync/transfer.rs`) replaces the `reader` flag: an
  upload, a remote deletion or a remote rename the memo does not allow stays
  here, said once as a file held apart (reason `reader`), never sent to be
  refused, never a conflict copy, no retry storm (a player's board lands here
  too: it is never put, H). The live note's catch-up pass asks the same gate.
- **Hidden files.** The listing and the log a device is given were already cut
  by the veil (`viewer_files`, `viewer_page`): a hidden file's bytes and name
  never reach it. A file that becomes hidden arrives as the server's forced
  deletion, which the engine carries out as `DeleteLocal` (to the system's bin,
  only the file the pass hashed); it is not a deletion by the device, the
  server's copy stays, and a local edit of it is kept and held apart, never
  re-uploaded.
- **The window.** `sync_rights(paths)` answers from the memo as a `FileAccess`
  per path the host was asked about (a path never asked is left out, `fresh` is
  false while the question is asked again). `access.ts` asks it for what the
  window lists or reads, once, and again at `access-changed` and after each
  pass; for a folder synced here that is not the person's own, `may(path, edit)`
  is that answer, so a reader edits the notes they have the right to and an
  editor leaves those they only see. A room's typing follows (`collab.reader`).

Not done, said: (1) creating, renaming, deleting and moving in the synced
window still follow the role alone (the host gate refuses what the server
would, the window does not show it yet); (2) a player's new non-note file
(a *Send files* upload) is not sent by a device; (3) the desktop board's room
keeps `reader` for a reader of the folder until S7's room answers for the
player's elements; (4) after a restart offline, an editor's see-only notes
show unlocked until the first online pass (the memo keeps only what may be
changed).

Review fixes (2026-10-25): `brief` answers one fixed tuple for a path that is
not seen or does not exist (`see`, `delete`, `rename` false; `put` is the
free-name rule, Create on the parent), so no answer tells a hidden file from a
free name; a device is served a note whole only with a credential that writes
(the pipeline and `check_sync` ask `view_for(account, editor, writes)`), as the
window is; only a folder with no table is "no answer" (the role decides), any
other failure keeps the last memo; the memo is looked up by the name as the
server compares names (case, NFC); a change held apart for a file no longer
shared says so (`unshared`); and the edit of a file the person may not send is
set aside as a conflict copy once (the same bytes are not copied again at each
change of the server).

### As built, S9 (2026-10-25, `test/access-s9`)

The maintainer's table scenarios as server end-to-end tests, through the real
window, with the game master, Ana and Bruno. Each step checks that a hidden
name never reaches the player's page.

- **The spec.** `app/ui/e2e-server/zz-access-scenarios.spec.mjs` (468 lines)
  with its helpers in `app/ui/e2e-server/access-helpers.mjs` (283 lines). The
  scenarios run last in the server suite (`b43f6e57`): their accounts crowd
  the admin console's first page, which `server.spec` reads. Their folders
  sort after the demo one and their e-mails are their own (`abb93fcb`).
- **Scenario a.** The chat's map onto a sheet one edits, refused to one who
  only sees it (`1ddac59e`).
- **Scenario b.** The group's board: Ana edits live, Bruno does not, then both
  with one change; each drawing gets a free spot (`e01fe658`, `923dc427`).
- **Scenario c.** Folder set, one exception, and the arrow back; what Ana sees
  at each step (`de95a666`).
- **Scenario d.** Ana creates and renames in a folder she edits and cannot
  delete; the silent suffix over a hidden name (`eb1d114b`).
- **Scenario e.** A file moved by the game master keeps its own access
  (`7ecf1967`).
- **Scenario f.** A PDF sent with *Send files*; without the right, none
  (`0c3f7e6d`).
- **Scenario g.** An open tab, the board and a picture drop: a file that is no
  longer shared is gone from each (`dc1f2060`).
- **Helpers.** Failure messages show where a hidden name stands; the board's
  text is read from its scene (`c5086131`). Bruno's list of what he sees is
  read from the core where the tree draws itself closed (`2a69e7af`). A folder
  of the tree looks again until it is open (`2568c6ea`). Notes are read through
  `list_entries`, because `list_files` lists only what is not a note
  (`94a1eb50`).
- **Product bugs found and fixed.** (1) The tree's prompts asked the folder's
  root instead of the chosen folder; `guardCreate` in
  `app/ui/src/readerNotice.ts` and `app/ui/src/tree/prompts.ts` (`a82cf4fe`).
  (2) A note's rename sent without `.md` was judged as a non-note, so it was
  refused and blind to the silent suffix; `Door::rename_target` in
  `crates/verso-server/src/access/door.rs` (`0ef9f3ce`, tests in
  `crates/verso-server/src/tests_access_review.rs`). (3) An open tab kept the
  text and name of a file no longer shared; `dropUnshared` in
  `app/ui/src/unshared.ts` and `Leaf.unshare` in `app/ui/src/leaves/leaf.ts`
  (`f33a3e12`). The same follows in recent files, closed tabs, back and
  forward, the switcher, the hover card and embeds (`f33a3e12`), in the
  outline, the history button and the switcher's list (`dc1f2060`), and in the
  failed-open line and the row's floating button (`f5f0c6a1`). The changelog
  records it (`03e086f0`).

Not done, said: (1) the scenarios skip the phone project; (2) the PDF leaf and
split panes are not exercised; (3) the desktop synced window is not checked
for the live unshare; (4) a tab unshared stays neutral if access returns; the
file must be reopened.

### As built, K.6 (2026-10-28, `feat/rights-split`)

- **Rules.** `Action::Attach { image }`, `Action::Create(Made)` (`Note`, `Board`,
  `Image`, `File`) and `Action::SendFile { image }` replace the three actions
  that took one right; `Rename` is `Edit` on the file. `Right` is the four
  rights (`images`, `files`, `create_notes`, `create_boards`); `AccessFacts`
  holds them by table root and account. The matrix of `vectors.rs` asks all
  sixteen combinations of the four rights against its hand-written
  expectation, and `app/ui/test/access-vectors.json` is generated from it; the
  window's `access.test.mjs` and the harness read the same file.
- **Database.** Schema 20 → 21 (`RIGHTS` in `db/access.rs`): `campaign_rights`
  is made again, because its `CHECK` could not change. Every `files` row stays
  and gains `images`; a player with *Edits* on a folder path of a table (their
  own row or the whole table's) and every folder-role editor get
  `create_notes` and `create_boards`. Test: `schema_21_splits_send_files_and_keeps_what_players_could_do`.
- **Contract.** `FileAccess` gains `attach_image`, `create_note`, `create_board`
  (the last two told of a folder only); `TableJoin`/`TableImages` gain `files`;
  `CampaignTable` gains `file_players`, `note_players`, `board_players` and
  `files`; `table_rights_set` takes any of the four words.
- **Window.** The players list has a *Direitos* count per player opening four
  labelled switches, and a box per right for everyone; refusals say which right
  is missing near the attempt.
- *Chosen in the code:* (1) a folder-role editor at the migration gets both
  creating rights on every table of its folder; (2) a path is a folder at the
  migration when it is the folder, a table's root, its last segment has no
  dot, or another stored path (access or file rows) lies under it, so
  `Mapas.v2` counts; the players it reaches are the folder's non-owner grants
  and the people of shares that cover the table or lie inside it; (3) creating an image or another file directly in a folder (`create_file`)
  needs *Images* or *Files* by its name; a text write never makes a file that
  is not a note; (4) `.excalidraw` counts as a drawing (*Creates boards*),
  `.excalidraw.md` as a note; (5) the rights are one count per player opening
  four switches, not four columns, so the list fits at 390 px.

### As built, where the file goes (2026-10-28, `fix/player-attach-beside`)

- **Contract.** `table_attach(base64, into, sub)`: `sub` is the window's
  attachments setting. The server (`table_image::attach`) takes the parent
  folder of `into` joined with `clean_sub(sub)`, so the file lands beside the
  note or board, in `assets` by default; the subfolder is made by
  `create_file`. The rules' `Attach` is still judged on `into`; the chat
  (`table_send_image`) and a board's *Export to folder* keep the table's
  attachments place. An old window that sends no `sub` gets `assets`.
- **The new file's access** (the `[PROPOSED]` of item 5, built): before the
  file is made, in the same server step, it is given as its own set the
  effective set of `into` (`keep_access`, `access_put`), only inside a table and
  only when it would not follow that set already; the file is then told to the
  players as any change of the table. If the write fails, the set is removed.
- **A name** taken by something the player does not see goes through
  `Door::guard_names` (the S1–S3 suffix), so `zqsegredo.png` becomes
  `zqsegredo 2.png` and nothing says why. Tested in `tests_attach_beside.rs`.
- *Chosen in the code:* (1) `clean_sub` accepts at most 120 bytes and 4
  segments, refuses an empty or dot-leading segment, a trailing space, a
  leading slash, a backslash, a control character and `<>:"|?*`, drops one
  trailing slash, and answers `assets` for anything refused (never an error);
  (2) the generated name stays `mesa-<stamp>-<id>.<ext>`; (3) a later change of
  the board's access does not move its images' sets, as for any file with a
  set of its own; (4) the window's status line ("copiado para <sub>") and its
  relative link are the game master's own.

**Review fixes (2026-10-28).** A folder name the player chooses would be a
probe: a create fails differently on a hidden twin, a hidden file or a hidden
folder, and the path of the answer shows where the file went. So for a table
player (anyone who is not the game master) the server **ignores `sub`** (the
contract still carries it, for the game master's own call and for old and new
windows) and uses the fixed name `assets` beside `into`, the maintainer's own
words. `Door::dir_clear` judges that folder: it must be new or the one folder
of that exact name the player sees (it holds something they see, or is a
table's root) — never a file, a hidden folder, or a twin by case or Unicode
form — and lie in the same table as `into`. If it is not clear the S1–S3
silent automatic suffix applies: `assets 2`, `assets 3`… (up to 50), the first
that is clear, created new; none clear is the one neutral refusal. There is no
fallback to the table's attachments place on this path. `into` must be an
existing file of the folder; an absent one or a folder is told with the message
of a file one may not touch. Any error of the create on this path is one
message ("the file could not be saved"). A path that already exists is not
given a set and none is rolled back. The window says the folder really used
("copiado para ...") from the returned path. The first As-built bullets above,
which say the file lands in the person's subfolder, hold for the game master
only.
