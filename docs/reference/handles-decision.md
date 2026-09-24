# Decision memo: the opaque handles group of ADR 0044

- Date: 2026-09-24
- Status: **not decided.** Options and a recommendation, labelled as such; the
  maintainer decides (`CLAUDE.md` §1). No code follows this memo: it asks to
  record what the code already does, or not.
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

## 2. What the code does, and what already changed

- **Point 4 is done.** Rule 4 of
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) was amended on
  2026-09-22: a capability of access crosses only as an opaque handle; a
  note's identity crosses as its path relative to the folder; an absolute path
  or one with `..` never crosses.
- **Point 3 is what feature 6 does**, recorded as provisional in ADR 0044: the
  agent names notes by the same relative path the contract uses; the handle
  never leaves the process.
- **No capability crosses the contract today.** The window names notes by
  relative path in every command; what lets it read and write is being one of
  the app's own views, which the host's capabilities check (review phase 2,
  B3). The `revision` a write carries is not a capability: it is the stamp of
  what was read, so that invariant 11 can refuse a write over a changed file.
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
| What changes | ADR 0044's third group: decided as built, re-opened when a capability has to cross | a handle type in the contract, a lifetime rule, a table in the host |
| Who needs it | nobody before mobile (an iOS bookmark, an Android SAF URI — [ADR 0025](../adr/0025-own-server-and-mobile-pwa.md)) or plugins with file access ([ADR 0016](../adr/0016-plugins-execution-and-capabilities.md)) | the same people, later |
| Risk | the design waits for its first consumer | a design made with no consumer to test it against |

**Recommendation: (a)**, with the re-opening written into the ADR: "before
anything outside the app's own views gets access to files — a plugin, a
mobile client, `verso serve`".

## 4. What this memo did not verify

Nothing new was run: it describes the code and the documents as they stand.

## 5. For the maintainer

1. (a) or (b).
