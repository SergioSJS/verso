# ADR 0087 — Secret blocks: a `[!secret]` callout stays in the note, and a UniVerso serves readers the note without it

- Date: 2026-10-14
- Source: the maintainer, on 2026-10-14 at 11:36 UTC, sending a plan of
  new features drafted with another assistant whose first item is the
  game master's secret: a `> [!secret]` callout that the server filters
  out before sending the note to a player. The reading in session that
  morning found the filter absent from the code and every path a reader
  reaches a note by — the room, sync's bytes, search, the MCP — reading
  the whole note, and proposed instead secrets kept in an unshared folder
  and embedded (Discarded alternatives). The maintainer decided that
  evening, as recorded in session: the `> [!secret]` blocks stay **in the
  note's text**; the server serves members who may only **read** the note
  a projection of it without those blocks, **everywhere** — the screen,
  the bytes synced to their device, search, the MCP, backlinks and
  counts, the index; members who may **edit** the note see everything,
  since their edits would otherwise destroy blocks they cannot see; in
  Obsidian it is a plain callout; the embed alternative not chosen. And,
  on the whole list: *"VAI SER TUDO NA V1"* (it will all be in V1).
  Written by Opus 5.5 from that decision; to be read by the other model
  before it is accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0030](0030-base-dialect-obsidian-compatible.md) (Verso extends
  the dialect and never changes the meaning of a construct — invariant
  12), spec Q9 (per-block visibility, `[OPEN]`), §5.8 and Q5 (callouts;
  nesting `[OPEN]`), [0036](0036-tabletop-rpg-support.md) (the player
  view), [0074](0074-accounts-and-access-on-the-server.md) (roles),
  [0081](0081-sharing-between-people-on-one-universo.md) (a share's role;
  answers filtered to what was shared; a reader present in a room, not
  typing), [0073](0073-self-hosted-server-first.md) (items 3 and 7: the
  session's role checked before `verso-fs`; rooms; its Status leaves
  "per block" `[OPEN]`), [0079](0079-sync-a-local-folder-with-a-server.md)
  (a reader syncs to read), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (rooms), [0066](0066-mcp-sees-boards-relations-properties-bases.md) (the
  MCP), [0080](0080-the-trash-with-expiry-and-restore.md) (readers see
  no trash), [0085](0085-hover-preview.md), [0090](0090-maps-on-the-board.md)
  (secret pins), [0091](0091-version-history.md), [0092](0092-the-phone-offline.md),
  [0035](0035-cross-cutting-requirements.md).
- Status in the briefing: not present (§17 item 8, the per-block
  visibility syntax, is spec Q9); on acceptance.

## Context

What exists. A callout is a blockquote whose first line opens with
`[!kind]`; the reading view draws any kind, lower-cased, with its fold
and title (spec Q5, decided for the reading view on 2026-09-23); the
parser that feeds the index reports each callout with its kind and
position (`crates/verso-dialect/src/callouts.rs`; spec §4.3). Nesting is
`[OPEN]` (Q5): the reading view draws a callout inside a callout, up to
32 deep, as a provisional fact, and the index's parser does not. Spec
§5.8 says *a callout is not the mechanism for the game master's secret*,
and Q9, per-block visibility, is `[OPEN]` with one requirement: it has to
survive opening the file in Obsidian without leaking the secret and
without breaking the text.

On a UniVerso every path by which a member reaches a note gives the whole
note:

- **The room** (`crates/verso-server/src/collab.rs`): one Yjs document per
  note; a reader is present in it and receives every edit
  ([0081](0081-sharing-between-people-on-one-universo.md) item 12).
- **Sync** (`crates/verso-server/src/sync.rs`): a file crosses whole, by
  its hash; the change log (`changes`, `crates/verso-server/src/db.rs`)
  names the hash of each version.
- **The index**: one per folder, the owner's; a share's answers are
  filtered by path and re-rooted (`crates/verso-server/src/scope.rs`), not
  by block.
- **Rendering, embeds, the board's card of a note, the MCP**: each reads
  the note through the core, whole.

A share already hides what lies outside it, failing closed, without
saying whether a note exists (`scope.rs`). Nothing hides part of a note.

## Decision

Proposed (2026-10-14); the direction — items 1, 2, 3 and 5 — decided by
the maintainer on 2026-10-14 (Source). Accepted on 2026-10-14 (Status): each `[OPEN]` was decided as
recommended and is marked `[DECIDED 2026-10-14]`.

1. **The syntax is a callout of kind `secret`.** `> [!secret]`, with a
   title, `+` or `-` as any callout; the kind compared lower-cased, as Q5
   reads kinds. In Obsidian, in another editor and in a folder of the
   person's own computer it is a callout — its text there for whoever
   holds the file. Nothing in the file changes meaning
   ([0030](0030-base-dialect-obsidian-compatible.md), invariant 12):
   what a UniVerso adds is a property of **serving** the file to a reader,
   not of the text. `[DECIDED 2026-10-14]`: other keywords (`[!gm]`, `[!segredo]`).
   Decided: **`secret` only**, a key as `type:` is, its label
   translated in the window ("Segredo", "Secret").
2. **Who sees what, on a UniVerso.** An account whose role on the note is
   *reader* — on the folder ([0074](0074-accounts-and-access-on-the-server.md))
   or through a read share ([0081](0081-sharing-between-people-on-one-universo.md))
   — receives the note's **projection**: its text with every secret block
   removed. An account that may write the note (owner, editor, a write
   share) receives the whole text, as today. The admin has no access to a
   folder's notes beyond a granted role, as today. On a desktop with a
   local folder the person is the owner and sees everything.
3. **The projection.** The note's text with the lines of each secret
   callout removed, from its `[!secret]` line to its last quoted line, and
   nothing else touched: no line ending, spacing or frontmatter changed.
   It is one pure function in `verso-dialect` (no IO, as the crate
   requires), computed from the parser's callout ranges, with fixtures
   ([0031](0031-fixtures-as-contract.md)). It **fails closed**: a secret
   block whose end it cannot place hides through the end of the
   blockquote that holds it. `[DECIDED 2026-10-14]`, with Q5's nesting: a `[!secret]`
   inside another callout. Decided: **removed at any depth the reading
   view draws**, with its contents; and a callout inside a secret block
   goes with it.
4. **Everywhere a reader reads.** Every command of the contract and every
   route a reader may call answers from the projection, and a test proves
   it (item 9):
   - the note's text and its rendering; an embed, a hover preview
     ([0085](0085-hover-preview.md)) and a board's card of the note;
   - an embed or a link naming a heading or an `^id` inside a secret
     block resolves for a reader as a target that does not exist — never
     "secret", which would tell that something is there;
   - search and its snippets; backlinks, outgoing links, the graph, tags
     and tasks, and every count of them: a link, tag or task inside a
     secret block does not exist for a reader;
   - sync: the bytes a reader's device receives are the projection, and
     the hash its manifest and its change log name is the projection's,
     so a change made only inside a secret block is **no change** for a
     reader — no new version, no notice, no new modification time;
   - the room: `[DECIDED 2026-10-14]` how a reader follows a live note that has secret
     blocks. Decided: **a reader does not join the note's Yjs
     document**; the server sends the reader the projection each time the
     room writes the file (0082's quiet of 900 ms), and the reader's
     presence shows **who** is in the note, never the writers' cursors,
     whose positions would place the hidden text. A note with no secret
     block keeps today's room for every member;
   - the MCP, under the reader's token
     ([0066](0066-mcp-sees-boards-relations-properties-bases.md)); the
     trash, which a reader does not see
     ([0080](0080-the-trash-with-expiry-and-restore.md) item 7); the
     history, which [0091](0091-version-history.md) gives readers or not
     under this same rule; an attachment route (`/f/…`), which serves a
     reader no note.
5. **Writers see everything, marked.** A member who may edit the note gets
   the whole text — a block they could not see would be destroyed by their
   next edit — and the window draws a secret block with a lock and the
   words "Hidden from readers" (on a server) or "Visible to anyone with
   the file" (in a local folder, where nothing is hidden). `[DECIDED 2026-10-14]`: a
   "view as a reader" toggle for a writer. Decided: **yes**, drawn
   from the same projection, read-only.
6. **The index serves both.** `[DECIDED 2026-10-14]`: how the server's index answers a
   reader without the secret text. Decided: **one index, the secret
   ranges recorded per note** — the text of secret blocks indexed apart
   from the rest and every link, tag and task inside one flagged — and a
   reader's query excluding them; two indexes per folder (whole and
   projected) double the disk and the work for one bit.
7. **What it does not protect**, said where the block is made: a writer
   sees it; whoever holds the file — the owner's computer, a synced
   writer's device, a copy given by hand, Obsidian — sees it; a reader
   learns that a note changed only when its projection changed. It is a
   guard against readers on a server, not encryption.
8. **Spec Q9.** This ADR proposes for Q9: per-block visibility is a
   callout of kind `secret`, hidden by a UniVerso from readers by
   projection; the requirement "without leaking the secret" read as **a
   reader never holds the bytes** — the file opened in Obsidian by
   someone who holds it shows the secret. Q9 stays `[OPEN]` until the
   maintainer accepts this ADR; the PR that closes it revises spec §5.8
   (*"a callout is not the mechanism for the game master's secret"*), §6's
   row "Per-block visibility" and §9 Q9 in the same PR, with fixtures
   ([0031](0031-fixtures-as-contract.md), invariant 17).
9. **The guardrail** ([0029](0029-guardrails-in-ci.md)), seen failing
   first: a property test that, for generated notes with secret blocks
   placed anywhere — nested, at the end, around links, tags, `^id`s and
   headings — no byte of a secret block's text reaches a reader through
   any read command or route of the server, and a list of the contract's
   commands a reader may call against which a new read command without
   the projection fails the test.

## Consequences

- `verso-dialect` gains the projection; `verso-index` records secret
  ranges and flags; `verso-server` serves readers the projection in the
  room, sync, search, the MCP and every read, and computes a projected
  hash per note for a reader's manifest and change log; the threat model
  (`docs/reference/threat-model.md`) gains the boundary and its test.
- A game master who wants players to **write** in a note cannot also keep
  a secret in it from them: a writer sees everything (item 5). The players'
  writing goes in a note or a folder of their own, shared for writing,
  beside the lore shared for reading.
- [0036](0036-tabletop-rpg-support.md)'s "player view: blocks marked as
  secret disappear in sharing and in export" is answered for sharing.
  Export: there is no export of a note today; `[DECIDED 2026-10-14]` until one exists.
  Decided: an export by a writer asks whether to leave the secret
  blocks out, left out by default.
- [0073](0073-self-hosted-server-first.md)'s `[OPEN]` on permissions finer
  than the folder is answered "per block, for readers" when this ADR is
  accepted, with a Revisions line there; per note stays open.
- The window: the secret callout's look, the words, the toggle, the
  strings in both languages; e2e tests with a reader's and a writer's
  session in the server's suite; the demo vault shows a secret block and
  says what it does and does not hide ([0058](0058-demo-vault-as-tutorial.md));
  the changelog gets its line.

## Discarded alternatives

- **Secrets in an unshared folder, embedded in the shared note**
  (`![[Segredos/Barnaby]]`), with a command "move the selection to a
  secret" and the embed drawn as a secret callout for whoever may read it
  (proposed in the reading of 2026-10-14 as the safe way that works
  today): presented to the maintainer, not chosen — the secret leaves the
  note it belongs to.
- **The block sent to the reader marked so the window does not draw it**
  (raised in the plan of 2026-10-14): the bytes reach the reader's browser
  and device, where any reader of the page or of the synced file finds
  them.

## Status

**Accepted (2026-10-14).** The maintainer, that night, answering
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* with *"Sim, todas"* (yes, all): every `[OPEN]`
decided as recommended, marked `[DECIDED 2026-10-14]` in place. In V1
(`docs/roadmap.md`, Phase 4 — V1). Item 8 applied the same day: spec §5.8, §6 and §9 Q9 revised, Q9 `DECIDED` (spec v0.38), with no fixture — the fixture of Q9 comes with the PR that builds this ADR, for the maintainer's approval ([0031](0031-fixtures-as-contract.md)). [0073](0073-self-hosted-server-first.md) and [0036](0036-tabletop-rpg-support.md) gain their Revisions lines.

*(History, before the acceptance above:)* Proposed (2026-10-14), the direction decided by the maintainer the
same evening (Source). In V1 by the maintainer's word of 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revision 8). For the
maintainer, each with a recommendation: other keywords (item 1), nesting
with Q5 (item 3), a reader in a live note (item 4), the "view as a
reader" toggle (item 5), the index (item 6), the export (Consequences),
and accepting item 8's proposal for spec Q9.
