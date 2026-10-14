# ADR 0089 — Linking unlinked mentions: a "Link" per mention and "Link all", with a diff

- Date: 2026-10-14
- Source: the maintainer, on 2026-10-14 at 11:36 UTC, sending a plan of
  new features drafted with another assistant whose second item is
  "auto-link": suggesting a link while a person types a note's name, off
  by default, with settings. The reading in session that morning found
  half of it built — the `[[` completion, backlinks, the unlinked mentions
  — and proposed first a "Link" button on each unlinked mention with
  "Link all", the suggestion while typing later and off by default. The
  maintainer's answer that evening, on the whole list: *"VAI SER TUDO NA
  V1"* (it will all be in V1). Written by Opus 5.5; to be read by the
  other model before it is accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0048](0048-file-operations-in-ui.md) (plans shown as diffs),
  [0012](0012-files-are-source-of-truth.md) (invariants 8 and 11),
  [0046](0046-index-location-lifecycle-tokenizer.md) (the tokenizer),
  [0082](0082-live-co-editing-of-a-synced-folder.md) (a write to a live
  note goes through its room), [0087](0087-secret-blocks-hidden-from-readers.md)
  (what a reader does not see), [0076](0076-the-window-on-every-screen.md)
  (what a side cannot do is not shown), spec Q7, Q8 and Q12 (names),
  [0035](0035-cross-cutting-requirements.md).
- Status in the briefing: not present; on acceptance.

## Context

What exists. The editor completes `[[` and `![[` with the folder's notes
and their headings (`app/ui/src/editor/complete.ts`). The side panel
lists a note's backlinks and, under them, its **unlinked mentions**
(`app/ui/src/panel/panel.ts`, `mentions`): the window searches the index
for the words of the note's name (40 results at most), drops the notes
that already link to it, and lists each remaining **note** with a
snippet. It finds notes, not occurrences: it has no position for a
mention, it matches the name's words as the full-text search does
(`unicode61`, accents removed, no stemming — [0046](0046-index-location-lifecycle-tokenizer.md)),
not the name as a phrase, and it does not look at a note's `aliases`.
Nothing turns a mention into a link but typing it by hand.

## Decision

Proposed (2026-10-14). Accepted on 2026-10-14 (Status): each `[OPEN]` was decided as
recommended and is marked `[DECIDED 2026-10-14]`.

1. **Mentions are occurrences.** A new command of the contract answers a
   note's unlinked mentions as occurrences — the note, the line, the
   column and the text as written — found by the core from the index's
   candidates and a scan of their text. A mention is the note's name as a
   phrase, on word boundaries, outside code, frontmatter, comments, an
   existing link or embed, and, for a reader, outside a secret block
   ([0087](0087-secret-blocks-hidden-from-readers.md)). `[DECIDED 2026-10-14]`: case,
   accents and aliases. Decided: **case ignored, accents kept**
   ("Porto" finds "porto", not "pôrto"), and each of the note's `aliases`
   a name too.
2. **"Link" on each mention** replaces that occurrence with `[[Name]]`, or
   `[[Name|text]]` when the text differs from the name in case or is an
   alias, through the contract, with invariant 11's check on the file's
   revision; a note open in a room is written through the room, as the
   properties panel's writes are (Phase 3 row 3.19). A mention whose text
   moved since it was listed is refused and the list refreshed.
3. **"Link all"** shows the plan — every file and every line it would
   change — as a diff, as a rename's plan is shown
   ([0048](0048-file-operations-in-ui.md)), and writes on confirmation,
   file by file, each with its own check; a file changed meanwhile is
   skipped and named (invariants 8 and 11).
4. **Who may link.** The buttons are shown to whoever may write the
   mentioning note; a reader sees the list and no button
   ([0076](0076-the-window-on-every-screen.md)'s rule).
5. **A suggestion while typing.** `[DECIDED 2026-10-14]`: whether it is in V1.
   Decided: **not in V1**; when built, **off by default**, a setting
   in Settings › Editor with a minimum length and folders to ignore, as
   the plan of 2026-10-14 described it — names that are common words
   ("Porto", "Mesa", "Ordem") make it noisy in Portuguese.
6. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
   each mention is a row whose button is named "Link *text* in *note*";
   the plan's diff is reachable by keyboard and read as a list of
   changes; pt-BR and English.

## Consequences

- `verso-core` gains the occurrences command, with tests on boundaries,
  code, links, aliases and accents; the contract's types are generated as
  always (invariant 3); the panel draws occurrences instead of notes.
- The window gains the buttons, the plan's dialog and the strings; e2e
  tests for one link, "Link all" with a file changed meanwhile, and a
  reader's view; the demo vault teaches it ([0058](0058-demo-vault-as-tutorial.md));
  the changelog gets its line.
- A link made here is undone in an open tab with ⌘Z; in a note that was
  not open, by the history of [0091](0091-version-history.md).

## Discarded alternatives

- **An in-memory prefix tree of the folder's names** for the suggestion
  (raised in the plan of 2026-10-14 for folders of 2,000 notes): the index
  already holds the names, and 2,000 names do not need one.

## Status

**Accepted (2026-10-14).** The maintainer, that night, answering
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* with *"Sim, todas"* (yes, all): every `[OPEN]`
decided as recommended, marked `[DECIDED 2026-10-14]` in place. In V1
(`docs/roadmap.md`, Phase 4 — V1).

*(History, before the acceptance above:)* Proposed (2026-10-14). In V1 by the maintainer's word of 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revision 8). For the
maintainer, each with a recommendation: case, accents and aliases
(item 1), and the suggestion while typing (item 5).
