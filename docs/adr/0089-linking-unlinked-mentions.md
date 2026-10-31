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
- Revisions: 2026-10-20 — item 5, the suggestion while typing, widened.
  The maintainer, trying it: *"tem que escrever o exato nome? parcial não
  lista?"* (does it have to be the exact name? doesn't a partial one
  list?), then *"nome completo é bem ruim"* (the full name is quite bad),
  and, between three ways other apps do it, *"eu gosto do 1 e do 2, o 1
  pq a gente engloba pessoas já acostumadas com notion … converter para
  [[]] quando usa o @ eu diria que sim. e a opção 2 resolve também, aí se
  a pessoa apertar esc enquanto digita some a sugestão"* (I like 1 and 2;
  1 because we take in people used to Notion … converting to [[ ]] when
  @ is used, I'd say yes; and option 2 also solves it; pressing Esc while
  typing makes the suggestion go away). `[DECIDED 2026-10-20]`:
  (a) **`@` opens the note list**, the same list and matching as `[[`'s
  completion, partial and accent-aware; choosing a note writes
  `[[Name]]` (or `[[Name|typed]]` as item 2 does) in place of the `@` and
  what followed it — so the file stays Obsidian's dialect, where `@`
  means nothing. `[DECIDED 2026-10-21]` (0089.a, "Outra": *"A, mas caso o
  usuário aperte Esc pra dispensar a janela, ela não deve voltar ao
  usuário digitar mais caracteres"* — A, but if the user presses Esc to
  dismiss the window, it must not come back as the user types more
  characters): on by default (it opens only when asked), **and after Esc
  has dismissed the `@` list, typing more characters of the same word does
  not reopen it** (a new `@` does);
  only at the start of a word (`fulano@mail` never opens it); nothing
  chosen, the `@` and the text stay as typed; never in code, the
  frontmatter, a link, math, HTML or a tag.
  (b) **The suggestion while typing lists partial names**: from the
  first letters of the words just typed, a short list of the notes (and
  aliases) whose name starts with them, narrowing as typing goes on;
  arrows choose, Tab or Enter accepts, Escape dismisses for that word.
  `[DECIDED 2026-10-21]` (0089.b, option A: as built, off by default):
  three letters at least, and only for a word that begins
  with a capital letter — names of places, people and factions do, the
  common words that made the whole-name rule necessary mostly do not; at
  most five entries; a whole name typed keeps the chip, which now stays
  after a space or a punctuation mark until the next word starts. Still
  off by default, the same setting, the same ignored folders and names.
  2026-10-20, later — the three letters and the capital letter become the
  person's settings. The maintainer, trying it: *"você não adicionou
  número de caracteres pra acionar a busca por notas nesse parâmetro"*
  (you didn't add a number of characters to trigger the note search in
  this setting). `[DECIDED 2026-10-20]`: the number of letters before the
  list appears is a setting beside the suggestion, default 3.
  `[DECIDED 2026-10-21]` (0089.c, option A): from 1 to 10, default 3; and
  the capital-letter rule a switch beside it, on by default. A word that begins with a digit counts as a capital
  one — the maintainer: *"você não considerou notas que começam com número,
  tipo 2026"* (you didn't consider notes that start with a number, like
  2026), `[DECIDED 2026-10-20]`.
  2026-10-21 — the `[PROPOSED]` details above decided by the maintainer's
  marks in the questionnaire of 2026-10-20 (0089.a to 0089.c), and one
  more question answered: **0089.a2** `[DECIDED 2026-10-21]`, option A —
  `@Goblin` typed in full still lists "Goblin Rei" below "Goblin": the
  exact name first (score 100), names starting with the text next (80),
  names merely containing it last (40), the same behaviour as the `[[`
  list, so a longer name can be chosen without deleting anything.

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
   **Revised 2026-10-15 `[DECIDED 2026-10-15]`:** the maintainer, answering
   *"Sim, na V1, desligada por padrão"* (yes, in V1, off by default): the
   suggestion while typing **is in V1**, **off by default**. Built as
   follows. A setting in Settings › Editor, "Sugerir links enquanto
   escrevo" (off), in the person's layer, with two lists beside it,
   "Pastas ignoradas" and "Nomes ignorados" (for example "Mesa"). While
   typing prose — never in code, the frontmatter, a link, an embed, math,
   HTML or a tag, the same prose rule the mentions follow — when the words
   just typed are a **whole** note name or alias of the folder (case
   ignored, accents kept, NFC = NFD, three characters at least, the longest
   name winning, names of several words included), a small chip in the
   style of the `[[` completion says "Ligar a [[Name]]". It never changes
   the text by itself: Tab or Enter writes `[[Name]]`, or `[[Name|typed]]`
   when the case differs or the words are an alias, as "Link" does
   (item 2); Escape, or typing on, dismisses it, and a name dismissed is
   not suggested again in the same paragraph. The note being written is
   never suggested. The folder's names come from the list the `[[`
   completion draws on, with the aliases the entries now carry, in a map
   built once per walk of the folder, so a keystroke is a few lookups at
   10,000 notes. On a touch screen the chip is tapped; in a live note an
   accepted suggestion is an ordinary edit through the room; a reader gets
   none; a screen reader hears "Sugestão de link: Name, Tab para aceitar"
   politely.
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
  already holds the names, and 2,000 names do not need one. (Item 5, as
  revised on 2026-10-15, keeps a map of the folded names, built once per
  walk of the folder; it is not a prefix tree, and the benchmark of the
  revision says what it costs.)

## Status

**Accepted (2026-10-14).** The maintainer, that night, answering
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* with *"Sim, todas"* (yes, all): every `[OPEN]`
decided as recommended, marked `[DECIDED 2026-10-14]` in place. In V1
(`docs/roadmap.md`, Phase 4 — V1).

**Answered while building (2026-10-14, the maintainer: "Sim, todas").** The questions the build raised, answered as recommended (*"Aceita todas as recomendações acima (P1–P5, M1–M6, I1–I7, D1–D11, G1–G4)?"*): M1 — a note that already links the target still lists its unlinked mentions; M2 — at most 200 candidate notes per name and 500 mentions; M3 — in a table's cell the link is written with `\|`; M4 — the whole secret filter comes with [0087](0087-secret-blocks-hidden-from-readers.md); M5 — an accent written composed (NFC) or decomposed (NFD) is one accent when mentions are matched, as it names one file (the decision of 2026-10-10), the link keeping the note's name as the index has it (built that night); M6 — `verso_dialect::prose` gains a fixture, `fixtures/prose/what-is-prose`, an AI draft for the maintainer's approval (spec §4.9, built that night). M1 to M4 as built.

**Revised (2026-10-15).** The maintainer, answering *"Sim, na V1, desligada por padrão"* to the question whether the suggestion while typing (item 5) belongs in V1: item 5 is revised above — in V1, off by default. Nothing else of the ADR changes.

*(History, before the acceptance above:)* Proposed (2026-10-14). In V1 by the maintainer's word of 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revision 8). For the
maintainer, each with a recommendation: case, accents and aliases
(item 1), and the suggestion while typing (item 5).
