# ADR 0048 — File operations in the UI: rename, create, delete, move

- Date: 2026-09-21
- Source: `docs/review/phase-0.md` R8
- Status in the briefing: not present

## Context

Phase 2 delivers the file tree (item 2.3). A file tree implies renaming,
creating, deleting and moving. Obsidian, on renaming a note, rewrites every file
that links to it. That is a mass write, with no "opening" and no diff — and it
collides with invariants 7 and 8
([0012](0012-files-are-source-of-truth.md)) if it is automatic, or breaks the
links of whoever uses the same folder in Obsidian if it is not. No document
covers these operations, and all of them have the potential for data loss.

## Decision

None. Questions recorded, to be decided before item 2.3 of Phase 2.

- **Rename a note:** update links in other files (a) automatically, (b) with a
  consolidated diff of the N files before applying, (c) never. Option (b) is the
  only one compatible with the invariants as written; option (a) is what
  Obsidian does and what the user expects.
- **Delete:** system trash, Obsidian's `.trash/` (compatible with the shared
  vault), or `unlink`. Whether there is a confirmation.
- **Move between folders:** same question as rename, plus link resolution by
  path ([spec Q12](../spec/dialect.md)).
- **Create:** default template, initial frontmatter (provenance?), name with
  accents and spaces, collision with an existing file (including by Unicode
  normalization and by case — spec Q7 and Q8).
- **Concurrent external modification:** every write from the UI follows the rule
  in [0012](0012-files-are-source-of-truth.md): verify that the file has not
  changed on disk since it was read; if it has, do not write without showing a
  diff.

## Consequences

- Mass operations (rename with N links) need a logical transaction: if it fails
  on file 7 of 12, the state has to be reported and reversible.
- Phase 2 exit criterion 2 ("no data loss in the period") is the test of these
  decisions.

**Requirement recorded on 2026-09-22, from the maintainer, when Q12 was
closed.** When the app itself moves or renames a note, it should **update the
links that point at it**, as Obsidian does. The requirement is not decorative:
Q12's rule resolves a bare name by preferring a candidate in the source note's
own folder, and resolves a path relative to that folder, so moving a note can
change which note a link reaches and can make a link written as a path stop
resolving. Everything this ADR leaves open — what happens to an external
modification, what is atomic, what is shown as a diff — applies to that
rewrite, which is a write to notes the user did not edit. Phase 2: Phase 1 has
no UI and moves no file.

## Discarded alternatives

None recorded.

## Status

`[OPEN]`. Decide before item 2.3 of Phase 2.
