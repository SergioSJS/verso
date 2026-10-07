# ADR 0066 — The MCP sees boards, relations, properties and bases

- Date: 2026-10-07
- Source: the maintainer, in session: "o mcp ta certinho ainda? estamos
  contemplando tudo que faz sentido?" (is the MCP still right? are we
  covering everything that makes sense?). Shown that its seven tools work
  and stopped at what Phase 1 had, and asked what it should come to see,
  they chose all four options put to them: typed relations, boards,
  properties and tags, bases.
- Revises: the MCP surface decided in [0045](0045-server-and-mcp-security.md)
  on 2026-09-22 (stdio, seven read-only tools,
  `docs/reference/mcp-decision.md`); [0018](0018-llm-native-mcp-in-core.md)
  stands.
- Status in the briefing: not present

## Context

`verso mcp` was built in Phase 1 (feature 6): search, read a note, its
links and backlinks, the unresolved targets, the list of notes, a reindex.
Phase 2 gave the folder structures the agent could not see: a typed
relation is a link held by a frontmatter property (ADR 0057 point 4), and
the agent saw only "a link at line 9"; a board is a `.canvas`, which
`read_note` handed over as raw JSON lines (1942 of them for the tutorial's
Tour) and `list_notes` did not list; properties and tags came only as
frontmatter text; a `.base` could not be read at all — the error named
`Projetos.base.md`. ADR 0018 point 2 asks for structured query before
similarity.

## Decision

Written by the author from the maintainer's choice above, and accepted by
it (Status). Every tool stays read-only: nothing here writes the folder.

1. **Typed relations.** A link that `links` or `backlinks` returns carries
   `relation`: the key of the frontmatter property that holds it
   (`aliado`, `inimigos`), or null for a link of the body. The index kept
   the key already (ADR 0057 point 4); the answers now say it.
2. **Boards.** `list_notes` lists the boards (`.canvas`) with the notes, in
   path order. A new tool, `read_board`, reads a board from its file now
   and answers its structure: each card — its id, kind (`text`, `file`,
   `link`, `group`), its text, file, address or label, its box, and the
   group it sits in — each edge — its ends, the sides it meets, its label
   and its relation (`verso.relation`) — and the texts written in the
   board's drawing — at most 2000 cards and 2000 texts, as every tool caps
   its answer. `read_note` on a board keeps answering its lines, to cite by
   line.
3. **Properties and tags.** `read_note` answers the note's properties,
   typed as the properties panel reads them (text, number, checkbox, list,
   empty, nested as written), and its tags, from the frontmatter and the
   body, as a base counts them. `list_notes` takes an optional `tag` — a
   tag matches its nested tags (`projeto` matches `projeto/ativo`), case
   ignored, as `file.hasTag` — and an optional `property`, with an
   optional `value`: a note matches a property it has, or the value it
   holds (a list holds each of its items), case ignored.
4. **Bases.** A new tool, `query_base`, evaluates a `.base` as the app
   evaluates it ([0053](0053-views-bases.md)): its views, the view it
   evaluated (the first, or the one named), the columns, the rows — each
   file's path and one value per column — in their groups, and the total
   before the view's limit, at most 1000 rows. Dates are given in UTC; a
   base's problems come with the answer. Like `search`, it answers from the
   index, and so do `list_notes`'s filters; `read_note`'s properties and
   tags come from the text it reads.
5. **A path that is not a note** — a `.base`, a picture — is refused by
   `read_note` with `not_a_note`, naming the tool that reads it, instead of
   `not_found` for a `.md` that was never asked for.
6. **What does not change:** query by type waits for the typed note
   (Phase 2 item 2.6, [0052](0052-typed-note.md)); an agent's writes, with
   a diff, still have no phase ([0018](0018-llm-native-mcp-in-core.md));
   the transport, the protocol version and the path as identifier stand.

## Consequences

- `verso-index`: a link and a backlink read their `relation`.
- `verso-core`: a board read for an agent, a note's tags, and the notes
  that have a tag or a property, from the facts the bases already keep.
- `verso-cli` (`mcp.rs`): nine tools; the instructions and the
  descriptions say what each answers. The end-to-end test checks every new
  answer against its declared schema, as it checks the others.
- The tutorial's note on the terminal and agents, the walkthrough, the
  changelog and the reference memo `docs/reference/mcp-decision.md` follow.
- Authorship: Opus 5.5 — core code by
  [ADR 0032](0032-author-and-reviewer-roles.md) is Fable 5.1's, and the
  maintainer asked on 2026-10-06 that Fable not be used: a deviation, with
  the reading before the merge the maintainer's to assign.

## Discarded alternatives

None recorded: the four options were chosen together.

## Status

Accepted (2026-10-07): the maintainer, in session, choosing all four
options put to them.
