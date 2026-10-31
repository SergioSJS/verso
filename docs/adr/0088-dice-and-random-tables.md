# ADR 0088 — Dice and random tables: `dice:` in a note rolls, the result never written

- Date: 2026-10-14
- Source: the maintainer, on 2026-10-14 at 11:36 UTC, sending a plan of
  new features drafted with another assistant whose fifth item is dice
  and oracles, reusing the maintainer's own dice roller, Rolai
  (`github.com/SergioSJS/rolai`): a roll in the text that does not change
  the file, a side drawer, or a slash command. The reading in session
  that morning proposed the inline form with the syntax of the Obsidian
  community's Dice Roller plugin, the result never written, shown to a
  room through presence, and random tables joined with
  [0036](0036-tabletop-rpg-support.md). The maintainer's answer that
  evening, on the whole list: *"VAI SER TUDO NA V1"* (it will all be in
  V1). Written by Opus 5.5; to be read by the other model before it is
  accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0036](0036-tabletop-rpg-support.md) (the random table as a
  roll action, Proposed), [0003](0003-primitives-not-workarounds.md)
  (what needs a plugin is a primitive), [0012](0012-files-are-source-of-truth.md)
  (opening never writes), [0030](0030-base-dialect-obsidian-compatible.md)
  (the dialect extended, never contradicted), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (rooms), [0005](0005-license.md) (MPL-2.0; the npm licence allowlist),
  [0009](0009-external-constraints.md), [0035](0035-cross-cutting-requirements.md).
- Status in the briefing: not present; [0036](0036-tabletop-rpg-support.md)'s
  random table is `PROPOSED` there; on acceptance.
- Revisions: 2026-10-20 — item 2 holds for `` `dice:` `` in a note; an
  oracle's answer, asked by the person with "Insert into note", is written
  in the note ([0102](0102-creative-oracles-and-improvisation.md) item 4,
  the maintainer: *"qual o motivo de não poder gravar na nota?"*).
  2026-10-20 — item 5: besides the parser and the roller, Rolai's system
  profiles and their restricted expression evaluator are copied, with the
  MIT notice, so a statblock rolls the way its system reads a roll
  ([0099](0099-visual-markdown-statblocks-and-cards.md) item 4, the
  maintainer: *"tudo relacionado a rolagem dá pra copiar numa boa do rolai,
  app meu aberto"*).
  2026-10-21 — item 5 revised again: "no new runtime dependency" no longer
  forbids the 3D roll. The maintainer put 3D dice in V1
  ([0101](0101-3d-dice-physics-overlay.md), 0101.0 and 0101.1, marking
  options of the questionnaire of 2026-10-20): a lazy chunk, loaded by
  `import()` only when the "3D dice" switch is on and cached by the service
  worker, the initial bundle staying free of any 3D library. The library is
  not chosen yet (0101 item 3). "The 3D roll … stays Rolai's" in item 5 no
  longer holds.
  2026-10-21 — item 4 revised for the table of [0107](0107-the-table-a-shared-roll-and-chat-log.md):
  a roll in a note of a UniVerso folder also reaches the folder's table,
  whose log is kept with no expiry (0107 item 5, the maintainer:
  *"deveria ficar salvo, sem prazo de validade"*), so "nothing is stored"
  no longer holds there; the roll carries the roller's dice appearance
  (0107 item 11); a secret roll reaches only the roller and the folder's
  owners (0107 item 7). A note's room still keeps its last rolls in memory.

## Context

What exists. Nothing rolls dice in Verso: no `dice` in `app/ui/src` or
`crates`. A note's inline code is drawn as code. A room relays presence —
each window's cursor and name — stamped by the server with the sender's
account (`crates/verso-server/src/presence.rs`), and stores none of it.
A block of a note can carry an `^id` (spec Q3, Q21), and a table or a
list is a block.

Rolai is the maintainer's: a multiplayer dice roller for tabletop games
(3D rolls, rooms by link, an OBS mode), in TypeScript, under the **MIT
licence** — checked on GitHub on 2026-10-14 (`gh api repos/SergioSJS/rolai`:
`"license": "MIT"`). Its notation parser and roller are a package of
their own, `packages/rules-engine` (`@rolai/rules-engine`: `parser.ts`,
`roller.ts`, `rng.ts`, `profile.ts`), whose one dependency, `yaml`, is
already a dependency of Verso's window (`app/ui/package.json`).

The Obsidian community's Dice Roller plugin writes a roll as inline code,
`` `dice: 1d20+3` ``, and rolls a row of a table or a list named by a
block reference — as the reading of 2026-10-14 recalled it, not yet
checked against the plugin's public README for this ADR (item 1). A vault
that uses it shows that code as code wherever the plugin is absent.

## Decision

Proposed (2026-10-14). Accepted on 2026-10-14 (Status): each `[OPEN]` was decided as
recommended and is marked `[DECIDED 2026-10-14]`.

1. **The syntax is Dice Roller's inline form**, `` `dice: <notation>` ``,
   so a vault that already uses the plugin rolls in Verso, and a note
   written in Verso rolls in Obsidian with the plugin and reads as code
   without it. It is inline code: nothing in the dialect changes meaning
   ([0030](0030-base-dialect-obsidian-compatible.md)). `[DECIDED 2026-10-14]`: the
   notation read beyond `NdM±K`. Decided: **what Rolai's parser reads
   that Dice Roller's README documents with the same meaning** — keep and
   drop, explode, a fudge die, `d%` — checked against the README before
   building ([0009](0009-external-constraints.md): public documentation);
   a form one reads and the other does not stays code, never a different
   roll.
2. **A roll is never written to the file.** In the reading view and in
   Live Preview the code is drawn as a die button with its notation; a
   click or Enter rolls and shows the result beside it in a small card —
   the total, each die, the modifier — with "Roll again". Opening, rolling
   and closing write nothing (invariant 7).
3. **Random tables are plain Markdown.** A table or a list with an `^id`
   is a random table; `` `dice: [[Note#^id]]` `` — the form checked
   against Dice Roller's README with item 1 — rolls one row and shows it,
   its links followed with a click. No note type and no file format
   of Verso's own: the table reads as a table everywhere. `[DECIDED 2026-10-14]`: rows
   of unequal chance. Decided: **a first column whose header is a die
   (`d100`, `2d6`) holds each row's range** (`01–05`, `7`), as printed
   tables do; any other table, every row equally likely. This answers
   [0036](0036-tabletop-rpg-support.md)'s "random table as a note type
   with a roll action" with a table instead of a type — recorded there
   when accepted.
4. **A roll in a room is seen by the room.** `[DECIDED 2026-10-14]`: who draws the
   number when others are present. Decided: **the server**, in a room
   — the window asks, the server rolls with its own generator and relays
   the result stamped with the account, as it stamps presence, so no
   window can show a roll it chose; alone, offline or in a folder of the
   computer, the window rolls. A room keeps its last rolls in memory for
   those who join, and nothing is stored.
5. **Rolai's engine is reused.** `[DECIDED 2026-10-14]`: how. Decided: **its parser
   and roller copied into the window** (`app/ui/src/dice/`), the MIT
   notice kept in the files, rather than a dependency on a package not
   published to npm; no new runtime dependency. The 3D roll, rooms by
   link and the OBS mode stay Rolai's (revised 2026-10-21: the 3D roll does
   not, see Revisions and [0101](0101-3d-dice-physics-overlay.md)).
6. **A roller without a note.** `[DECIDED 2026-10-14]`: a "Roll dice…" command that
   opens a small roller, a notation typed and rolled, nothing written.
   Decided: **yes**, in the command palette; a drawer as Rolai's
   later.
7. **Randomness** comes from the platform's cryptographic generator
   (`crypto.getRandomValues` in the window, the system's in the server),
   uniform, with no modulo bias.
8. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
   the button is named "Roll 1d20+3"; a result is announced in a polite
   live region ("1d20+3: 17 — 14 plus 3"); a roll from another member is
   announced with their name; pt-BR and English throughout.

## Consequences

- The window gains the dice widget, the card, the command and the copied
  engine, with unit tests on the notation and on the distribution;
  `verso-server` gains a roll command and its relay in a room; the
  contract's types are generated as always (invariant 3).
- [0036](0036-tabletop-rpg-support.md)'s Consequences say no tabletop
  feature enters the core as a special case — only through primitives,
  schema packs or a plugin. This ADR treats dice and random tables as
  primitives in [0003](0003-primitives-not-workarounds.md)'s sense, of use
  outside games too; whether that satisfies 0036 is the maintainer's to
  say when accepting it.
- The demo vault gains a note with rolls and a random table
  ([0058](0058-demo-vault-as-tutorial.md)); the changelog gets its line.

## Discarded alternatives

- **A slash command that inserts the result into the text** (raised in
  the plan of 2026-10-14): the reading proposed the result never written,
  so a roll changes no file; item 2.

## Status

**Accepted (2026-10-14).** The maintainer, that night, answering
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* with *"Sim, todas"* (yes, all): every `[OPEN]`
decided as recommended, marked `[DECIDED 2026-10-14]` in place. In V1
(`docs/roadmap.md`, Phase 4 — V1). [0036](0036-tabletop-rpg-support.md) gains a Revisions line: dice, random tables, secret blocks and maps enter as primitives. [0101](0101-3d-dice-physics-overlay.md) revises item 5: 3D dice are admitted as an optional, lazy-loaded module under the RPG preset ([0103](0103-feature-presets-and-capability-flags.md)).

**Answered while building (2026-10-14, the maintainer: "Sim, todas").** The questions the build raised, answered as recommended (*"Aceita todas as recomendações acima (P1–P5, M1–M6, I1–I7, D1–D11, G1–G4)?"*): D1 — the ADR named explode (`1d6!`) and `d%` while Rolai read neither: both are read, in the window's parser and the server's, with the Dice Roller README's meaning, an explosion chain capped at 100 added dice in a roll, the same on both sides (built that night); D2 to D11, as built — both forms of a table's link, `[[Note^id]]` and `[[Note#^id]]`; the header `dice: 1d20`; `00` is 100, and lists like `13,14` are read; a one-row table is refused; in a room the server rolls even when you are alone; a reader may roll; the palette's roller rolls in your window only; your own roll does not show your name; the bounds of 100 dice and 1000 sides.

*(History, before the acceptance above:)* Proposed (2026-10-14). In V1 by the maintainer's word of 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revision 8). For the
maintainer, each with a recommendation: the notation (item 1), unequal
rows (item 3), who rolls in a room (item 4), how Rolai's engine is
reused (item 5), the roller without a note (item 6), and whether
primitives satisfy [0036](0036-tabletop-rpg-support.md)'s Consequences.

*Added (2026-10-23):* "não existe comando /dice ou /roll na nota para adicionar rolagem né?". The editor's `/` menu gets **Dice roll** (keywords dice, dado, roll, rolar, d20), shown only while the Dice feature is on: it inserts an inline `` `dice: 1d20` `` with the notation selected, so the person types over it.

**Amendment (2026-10-31): a roll heard in a room lands on its own chip.**
`[DECIDED 2026-10-31, to be built]` Item 4's room roll carries no place in
the note, so a roll by another person lands on the first chip with the same
notation (the bow and the dagger both `1d20+6`;
[review 2026-10-23](../review/2026-10-23-table-three-devices.md) finding 4,
fixed then for one's own rolls only). Put to the maintainer as B1 of the list
of 2026-10-31, option a, *"corrigir os dois numa mudança de contrato (servidor
antes dos apps)"* (fix both in one contract change, the server before the
apps), and approved as recommended: *"Todo resto pode ir de recomendado e aprovado"* (everything else may go as recommended, and is approved). The room's roll carries the
chip's place, in the **same contract change** as the oracle's callout found
by its line ([0102](0102-creative-oracles-and-improvisation.md), amendment of
the same day); the server is deployed before the apps.
