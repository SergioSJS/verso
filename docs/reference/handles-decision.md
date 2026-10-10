# Decision memo: the opaque handles group of ADR 0044

- Date: 2026-09-24
- Status: **decided by the maintainer on 2026-09-24**, in session, on
  section 5:
  1. **option (a)** — ADR 0044's third group decided as built, for Phase 2:
     notes are named by their relative path, no capability crosses the
     contract, and the `Handle` stays an index into a table inside the
     process; the group is re-opened **before anything outside the app's own
     views gets access to files — a plugin, a mobile client, `verso serve`**;
  2. of the disagreeing texts of section 2, **ADR 0045's decision of
     2026-09-22 stands**: the note identifier over MCP is the path relative to
     the root.

  The author's recommendations of the day, this one among them, were put to
  the maintainer as one list; the answer: *"Tirando o plano de fazer vários
  PR, eu gosto das suas recomendações"* ("apart from the plan of several pull
  requests, I like your recommendations"). Recorded in ADR 0044 (the group and
  its Status), ADR 0026 and ADR 0045 (the stale paragraphs, each with a
  revision line), the [roadmap](../roadmap.md)'s two rows on handles and the
  [ADR index](../adr/README.md)'s row for 0044. No code follows this memo:
  it asked to record what the code already does, or not.
- Re-opening answered on 2026-10-09 for `verso serve`, by the
  maintainer's acceptance of
  [ADR 0073](../adr/0073-self-hosted-server-first.md): a note stays named
  by its relative path; on a server the access capability is the session
  and its role in the folder, checked before `verso-fs` acts; attachments
  are served at `/f/<folder-id>/<relative path>` behind that check; no
  per-file capability crosses. Recorded in
  [ADR 0044](../adr/0044-verso-fs-semantics.md), "On a server". A plugin
  and a native mobile client still re-open the group; the pre-signed URL
  of a bucket stays `[OPEN]` in ADR 0073 item 4.
- Written by Opus 5.5 overnight, the author
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) gives documents ("Opus
  5"); read by a fresh Opus 5.5 session standing in for Fable 5.1, the reader
  ADR 0032 gives them, by the maintainer's decision of 2026-09-23
  (`../review/phase-2.md` §6, item 17), and corrected after that reading.
- The question: [ADR 0044](../adr/0044-verso-fs-semantics.md) keeps its third
  group, "opaque handles", `[OPEN]`, to be decided before feature 6 and before
  item 2.1 of Phase 2. Both are built. The [app memo](app-decision.md),
  section 10, lists it among what still waits.

## 1. What the group asks

1. What a handle identifies: an open descriptor (`openat`, immune to a path
   swapped between checking and using) or an index into a table of paths.
2. Whether it survives a restart, a rename, a change of workspace root.
3. What an agent receives over MCP as a note's identifier, and whether it is
   the contract's handle.
4. If the stable identifier ends up being the relative path, rule 4 has to say
   so.

## 2. What the code does, and what the documents say

- **Point 4 is done.** Rule 4 of
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) was amended on
  2026-09-22: a capability of access crosses only as an opaque handle; a
  note's identity crosses as its path relative to the folder; an absolute path
  or one with `..` never crosses.
- **Point 3: the documents disagree about it.**
  [ADR 0045](../adr/0045-server-and-mcp-security.md) lists "Note identifier:
  the path relative to the root…" among the answers the maintainer decided on
  2026-09-22. ADR 0044 still calls that half provisional and the group
  `[OPEN]`; ADR 0026 keeps a paragraph saying rule 4 "is **not** rewritten
  here" and belongs to the PR that closes the 0044 group, though the
  amendment above happened; and ADR 0045 keeps an older paragraph calling it
  provisional. This memo records the contradiction and does not pick a side
  (`CLAUDE.md` §1.3). *(The maintainer chose on 2026-09-24: ADR 0045's text
  stands — the header.)*
- **No capability crosses the contract today.** The window names notes by
  relative path in every command; what lets it read and write is being one of
  the app's own views, which the host's capabilities check
  (`docs/review/phase-2.md`, reading 1, finding 3). The `revision` a write
  carries is not a capability: it is the stamp of what was read, so that
  invariant 11 can refuse a write over a changed file.
- **Points 1 and 2, as built.** Inside `verso-fs`, a `Handle` is an index into
  the root's table of relative paths, valid for that `Root` only, in this
  process only; every use goes by path again. It does not survive a restart,
  and after a rename it still names the old path. The window between checking
  a path and using it stays open — and symlinks are followed wherever they
  point, by decision (ADR 0044), so `openat`-style traversal would not confine
  anything more for the user's own folder.

## 3. The options

| | (a) Record the code as the decision for Phase 2 | (b) Design capability handles now |
|---|---|---|
| What changes | ADR 0044's third group decided as built, re-opened when a capability has to cross; the stale paragraphs of ADR 0026 and ADR 0045, the roadmap's two rows on handles and the ADR index's row for 0044 brought in line | a handle type in the contract, a lifetime rule, a table in the host |
| Who needs it | nobody before a mobile client ([ADR 0025](../adr/0025-own-server-and-mobile-pwa.md)) that holds an iOS security-scoped bookmark or an Android SAF URI ([ADR 0009](../adr/0009-external-constraints.md), ADR 0026 rule 4), or plugins with file access ([ADR 0016](../adr/0016-plugins-execution-and-capabilities.md)) | the same, later |
| Risk | the design waits for its first consumer | a design made with no consumer to test it against |

**Recommendation: (a)**, with the re-opening written into the ADR: "before
anything outside the app's own views gets access to files — a plugin, a
mobile client, `verso serve`".

## 4. What this memo did not verify

Nothing new was run: it describes the code and the documents as they stand.

## 5. For the maintainer

1. (a) or (b).
2. Whichever: which of the disagreeing texts of section 2 stands.

Answered on 2026-09-24: (a), and ADR 0045's text stands (the header).
