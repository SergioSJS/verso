# ADR 0048 — File operations in the UI: rename, create, delete, move

- Date: 2026-09-21
- Source: `docs/review/phase-0.md` R8
- Status in the briefing: not present
- Revisions: 2026-09-23 — what the Phase 2 code does recorded under
  Consequences, as **provisional**; every question stays `[OPEN]`.
  2026-09-23 — **decided by the maintainer**: that record becomes the
  Decision, with names no link can reach now refused by the window
  (`docs/review/phase-2.md` §6, items 2, 19 and 21).
  2026-10-07 — **several entries at once**, at the maintainer's request
  ("deveria ser possível mover vários arquivos juntos, selecionar vários e
  mover para pastas"); asked how a selection should behave, they chose "como
  o Finder/Obsidian".
  2026-10-12 — volumes that name a file by `link` on macOS: a notice once
  per folder, and exFAT's "not supported" taken for what it is
  (Consequences, *Volumes without hard links*).
  2026-11-11 — placeholders are fetched before a rename, move or delete
  (Consequences, "Placeholders"; ADR 0043).

## Context

Phase 2 delivers the file tree (item 2.3). A file tree implies renaming,
creating, deleting and moving. Obsidian, on renaming a note, rewrites every file
that links to it. That is a mass write, with no "opening" and no diff — and it
collides with invariants 7 and 8
([0012](0012-files-are-source-of-truth.md)) if it is automatic, or breaks the
links of whoever uses the same folder in Obsidian if it is not. No document
covers these operations, and all of them have the potential for data loss.

## Decision

**Decided on 2026-09-23 by the maintainer**, who accepted what the Phase 2
code does — recorded under Consequences below — when the review's pending
items were put to them with a recommendation for each
(`docs/review/phase-2.md` §6, items 2, 19 and 21; the answer: *"a e b ok"*).
In short: rename and move by option (b), a plan of link rewrites shown as one
diff per note and applied note by note, with **no logical transaction**;
delete into `.trash/` after a confirmation; create refused when the name is
taken; a rename that only changes case allowed where the volume ignores case;
a typed name no link can reach refused by the window; volumes without hard links
allowed, with a warning; a lone placeholder neither renamed nor deleted.

**Several entries at once (2026-10-07).** In the file tree, ⌘-click (Ctrl
elsewhere) adds a row to a selection or takes it out — the row clicked
before it joins the selection it starts — ⇧-click selects every row from
the last one clicked, and Esc or a plain click clears it; a plain click
still opens. Dragged onto a folder, the selection moves there together;
its menu moves it ("Move to…"), copies the relative paths, or sends it all
to `.trash/` after one confirmation. A move of several entries is one call
to the core, which reads what they may change before any of them moves,
moves each in turn — one the disk refuses (a name taken there) stays,
named, and the others go — and plans the link rewrites **once, over where
everything ended**: a note that links to two of them gets one rewrite, as
option (b) shows it. An entry inside a folder also selected goes with the
folder. ⌘-click in the tree no longer opens a note in a new tab; the
row's menu still does.

The questions as they were first recorded, before item 2.3 of Phase 2:

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
  on file 7 of 12, the state has to be reported and reversible. *(Decided
  otherwise on 2026-09-23: there is none; what was written is reported, not
  undone — the Decision above.)*
- Phase 2 exit criterion 2 ("no data loss in the period") is the test of these
  decisions.

**Requirement recorded on 2026-09-22, from the maintainer, when Q12 was
closed.** When the app itself moves or renames a note, it should **update the
links that point at it**, as Obsidian does. The requirement is not decorative:
Q12's rule resolves a bare name by preferring a candidate under the source
note's own folder (point 3, as amended on 2026-09-23), and resolves a path
relative to that folder, so moving a note can
change which note a link reaches and can make a link written as a path stop
resolving. Everything this ADR leaves open — what happens to an external
modification, what is atomic, what is shown as a diff — applies to that
rewrite, which is a write to notes the user did not edit. Phase 2: Phase 1 has
no UI and moves no file.

**What the Phase 2 code does — decided on 2026-09-23.** Recorded that day as
provisional, then accepted by the maintainer as it stands (the Decision
above). It is the code as it stands after the Opus reading of the Phase 2
branch (`docs/review/phase-2.md`), whose findings changed several of these
points.

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
- **No link is rewritten until the user applies the plan**, shown as one diff
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
- **Names a link cannot hold.** The core accepts note and folder names that
  hold `[`, `]`, `|`, `#` or `^`, which no `[[…]]` can name; a rename to such
  a name writes no link that would be read as another target, and says so.
  The window refuses such a name when the user types it — creating a note or
  a folder, renaming — and says why (`9d13bf2`, the maintainer's choice of
  2026-09-23). A name the window makes itself is not checked — a duplicate, a
  dropped file, the folders the settings name — except a pasted or dropped
  image's, which loses those characters so that its embed reaches it
  (`f232b78`). A file already so named opens as any other, and the core still
  accepts the names for its other clients.
- **Volumes without hard links** (exFAT and FAT on removable drives, some
  network and cloud file systems): a create or a move gives the file its name
  by a rename after a last-moment check instead of a link, and says that the
  guard was weaker. Allowed, with that warning, by the maintainer on
  2026-09-23 — on the recommendation that refusing would leave Verso unusable
  on a removable drive.
  *Revision, 2026-10-12:* on macOS a volume without the exclusive rename
  (`renamex_np` with `RENAME_EXCL`, [0069](0069-windows-port.md) revised
  2026-10-11) but with hard links — some network volumes — names a new or
  moved file by `link`, whose later removal by another program FSEvents may
  never report. Opening such a folder, `verso-fs` asks the volume once (APFS
  and HFS+ by their name; any other by trying, on an empty file of its own
  under a hidden temporary name, removed after); the window then says once
  per folder, in both languages, that changes other programs make there may
  show late and that what Verso writes stays safe, and the log has one WARN
  line at each opening. exFAT has neither the rename nor hard links: its
  files take the checked rename above, which FSEvents does report, so it
  gets no notice — and its "operation not supported" (`ENOTSUP`, which std
  leaves uncategorized) is now taken for that, where every new file there
  failed before. Measured on mounted images: exFAT as said, FAT32 and APFS
  with the exclusive rename. The maintainer's choice for the campaign's
  finding was "document it, or a notice in the app"; both were done.
- **Placeholders.** A single placeholder cannot be renamed or deleted, its
  content being in the cloud; a folder that holds placeholders moves and goes
  to the bin as a whole.
  *Revision, 2026-11-11 (the maintainer):* the window brings a placeholder
  down before it renames, moves or deletes it, alone or in a selection
  ([0043](0043-placeholder-guard.md), "Any action on a file fetches it");
  the core still refuses one, so only a file that could not come down — or
  the older `.icloud` form — is refused, and the window names it.
- **Concurrent external modification** follows [0012](0012-files-are-source-of-truth.md):
  every write checks the revision it was given, and the revision a write hands
  back is that of the bytes it wrote.

## Discarded alternatives

None recorded.

## Status

Accepted on 2026-09-23 by the maintainer, as the Phase 2 code does it (the
Decision and the record under Consequences).
