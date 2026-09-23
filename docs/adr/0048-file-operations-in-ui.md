# ADR 0048 — File operations in the UI: rename, create, delete, move

- Date: 2026-09-21
- Source: `docs/review/phase-0.md` R8
- Status in the briefing: not present
- Revisions: 2026-09-23 — what the Phase 2 code does recorded under
  Consequences, as **provisional**; every question stays `[OPEN]`.

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

**What the Phase 2 code does. Recorded on 2026-09-23 — provisional; every
question above stays `[OPEN]`, the maintainer decides.** It is the code as it
stands after the Opus reading of the Phase 2 branch
(`docs/review/phase-2.md`), whose findings changed several of these points.

- **Rename and move: option (b).** Before anything moves, the core reads every
  note whose links may name the entry, with what each link reaches by the
  index's rule (spec Q12). It then moves the entry with one rename — refused
  when something stands at the destination, a cloud placeholder included, or
  when the entry itself is a placeholder — makes the index follow (a moved
  note keeps what the index knew of it, a placeholder's last known version
  included) and answers with a plan: for each note whose links no longer reach
  what they reached, its text before and after, with the revision it was read
  at. Only those links are rewritten, in a form that reaches the same entry
  again — a bare name that would now reach another note becomes a path — and
  never inside code. A move that would silently send a bare link elsewhere
  gets a plan too, which was the requirement above.
- **Nothing is written until the user applies the plan**, shown as one diff
  per note. Each note is then written by itself, atomically, over its own
  revision: a note edited since the plan is refused and counted, never
  overwritten, and an open tab that cannot be saved first is left out and
  named. A note that links to what moved but cannot be planned — a
  placeholder, a file that is not UTF-8, a read error — is listed as skipped.
- **No logical transaction.** The Consequences above ask for one; there is
  none. The move is one rename and the rewrites are separate writes: a failure
  on the seventh of twelve leaves six written and the rest not, the window says
  how many, and nothing undoes them. Once the entry has moved, nothing is reported
  as a failure; what could not be confirmed is a warning.
- **Folders** move with everything under them; the notes and attachments
  inside keep their links, and notes outside that linked in get a plan.
  **Attachments** plan the notes whose embeds reached them.
- **Delete** goes to `.trash/` at the root of the open folder, Obsidian's bin,
  keeping the relative path and adding ` (n)` on a collision; nothing is
  unlinked. The window asks first, in the page — a first version's confirmation
  never asked (the Opus reading found it).
- **Create** writes the text the window gives: `# Name` for a new note, the
  `url` for a web note, the template for the daily note. A name that is taken
  is refused with `exists`, whatever stands there; the window also checks names
  case-insensitively before asking. Names keep their accents and spaces as
  typed; no Unicode normalization (Q7) is applied.
- **Case.** A rename that only changes case is allowed on a case-insensitive
  volume, where both names are the same file.
- **Placeholders.** A single placeholder cannot be renamed or deleted, its
  content being in the cloud; a folder that holds placeholders moves and goes
  to the bin as a whole.
- **Concurrent external modification** follows [0012](0012-files-are-source-of-truth.md):
  every write checks the revision it was given, and the revision a write hands
  back is that of the bytes it wrote.

## Discarded alternatives

None recorded.

## Status

`[OPEN]`. Decide before item 2.3 of Phase 2.
