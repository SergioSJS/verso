# ADR 0099 — Statblocks: a card from a `statblock` block, layouts as files of the folder, rolls by system

- Date: 2026-10-17; rewritten 2026-10-20
- Source: the maintainer, 2026-10-17: *"depois disso seriam as fichas, o
  stat blocks, os visuais markdown"*; 2026-10-18, on the first build:
  *"veja como o plugin do obsidian resolve e replique … geralmente a pessoa
  vai usar para registrar inimigos e desafios, e dependendo do sistema a
  ficha de desafio é diferente da ficha de personagem, PESQUISE!"* (see how
  the Obsidian plugin solves it and replicate it … people mostly record
  enemies and challenges, and depending on the system the challenge sheet
  differs from the character sheet — research it), and a list of systems.
  The first text and code, written by another AI (Gemini, in Antigravity),
  invented a system's attributes, shipped a layout editor the maintainer
  called *"péssimo"*, kept layouts in each device's browser storage and was
  marked Accepted with no acceptance. On 2026-10-20 the maintainer answered
  the review of it (quoted in the items) and accepted the design that
  followed: *"adorei as sugestões e melhorias e correções. pode definir uma
  sequencia e atuar em tudo"*. This text replaces the first one. The
  research behind it: the Fantasy Statblocks plugin's public source
  (MIT, Jeremy Valentine; studied at f248f4af, v4.10.3), and the published
  rules, SRDs and licences of about 35 systems, each field with its source,
  in `docs/reference/statblock-sources.md`.
- Related: [0003](0003-primitives-not-workarounds.md),
  [0009](0009-external-constraints.md),
  [0012](0012-files-are-source-of-truth.md),
  [0015](0015-schema-packs.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0083](0083-security-hardening-of-universo.md),
  [0088](0088-dice-and-random-tables.md) (item 5 revised by item 4),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status in the briefing: not present.

## Context

A game master writes down the enemies and challenges of a session; a
worldbuilder the creatures of a world. In Obsidian the community plugin
Fantasy Statblocks draws a ```` ```statblock ```` block of YAML as a book's
statblock, through a layout: a list of blocks (a heading, properties, an
ability table, traits…) that a settings editor builds. Its weak points, from
its own issues: the layout preview is a separate tab, dragging jitters,
layouts live in the plugin's private data (one device's, not the vault's),
and ten fields of a layout are JavaScript run with `new Function` — code
from a file someone else shared.

Systems differ, and in most of them an adversary is not a character: a
Daggerheart adversary has a difficulty, thresholds and features; a Fractal
challenge is a list of obstacles, each of which may be another challenge.
Their licences differ more: some are open (CC BY, ORC, OGL), some allow
fan works but not apps, some allow nothing.

## Decision

Accepted on 2026-10-20 for the design proposed to the maintainer that day;
`[DECIDED 2026-10-20]` quotes his own answers, `[PROPOSED]` marks a detail
he has not read.

1. **A card comes from a ```` ```statblock ```` block, and only from it.**
   The block holds YAML. Its keys are Fantasy Statblocks' key names (`name`,
   `size`, `type`, `ac`, `hp`, `stats`, `saves`, `skills`, `traits`,
   `actions`, `reactions`, `legendary_actions`, `cr`, `image`, `layout`…),
   so a block written for the plugin draws in Verso and the other way round
   ([0030](0030-base-dialect-obsidian-compatible.md)). `layout:` names a
   layout by id or by name, exactly, ignoring case and accents; an unknown
   one draws the default layout with a visible "layout not found". No card
   is guessed from ordinary properties (`hp:` in a note about a computer).
   `[PROPOSED]`: `monster: Goblin` and `extends: [[Goblin]]` take the
   statblock of the note so named and override its keys — the plugin's
   bestiary, made of notes.

2. **Layouts are files of the folder.** `[DECIDED 2026-10-20]`: *"deveria
   ser tudo igual, não? se eu compartilhar com alguém, é pra essa pessoa
   ver como eu"*. A layout someone made or changed is
   `.verso/layouts/<id>.json` in the folder ([0070](0070-what-travels-with-the-folder.md),
   extended): it syncs, everyone opening the folder sees the same card, and
   it is written by `verso-fs` with the stale check, through contract
   commands that list, read, write and remove layouts and nothing else
   under `.verso/`. Built-in layouts ship with the app and cannot be
   changed; "duplicate" copies one into the folder. Nothing of a layout
   lives in a device's browser storage; what an earlier build kept there
   moves into the folder once.

3. **The layout model is the plugin's, without code.** Blocks: heading,
   subheading, property, table (an ability table, its modifier from a
   closed list — `floor((x-10)/2)`, none — or an expression of Rolai's
   restricted evaluator, which has no `eval`), saves, traits, text, image,
   group, inline, collapse, conditional (a structured test: a key is
   present, equals, is above), **tracker** and **roll** (items 4–5). Each
   block names its keys, a label per language, whether it hides when empty
   and a fallback. **No field of a layout is ever run as code**: each of
   the plugin's ten JavaScript fields has a declarative replacement or none.
   A layout's appearance is a short list of tokens (colours, one of the
   app's fonts), each checked against its type, never raw CSS
   ([0083](0083-security-hardening-of-universo.md)). A Fantasy Statblocks
   layout JSON imports, its code fields dropped and listed to the person;
   Verso exports its own JSON.

4. **Rolls follow the system, through Rolai's profiles.** The maintainer:
   *"tudo relacionado a rolagem dá pra copiar numa boa do rolai, app meu
   aberto"* (everything about rolling can be copied from Rolai, my open
   app). [0088](0088-dice-and-random-tables.md) item 5, which copied
   Rolai's parser and roller, is revised: its system profiles and their
   restricted expression evaluator are copied too, with the MIT notice — 21
   profiles: d20, d100, roll-under, d6 pool, Year Zero, Forged in the Dark,
   PbtA 2d6 and 2d10, Ironsworn, Fate, World of Darkness 5, Fractal, Trophy
   and others. A layout names its profile. A value with a bonus or a dice
   expression (`+5`, `2d6+3`) becomes a button by the layout's dice rules;
   a **roll** block runs the profile with inputs taken from the sheet (a
   Fractal risk roll asks how many facts apply). The answer reads the way
   the system reads it — the highest die, successes counted, a band of
   2d6 — and is shown, not written ([0088](0088-dice-and-random-tables.md)
   item 2); in a room the server draws and the room sees it (item 4 there).

5. **Trackers write into the note.** `[DECIDED 2026-10-20]`: *"13. deveria
   gravar"* (it should be saved). A **tracker** block shows a current value
   against a maximum — hit points, Fractal's reserves, stress, a clock,
   Hope — as boxes or a number. A click is the person's action (invariant
   8): it replaces that one value in the block's YAML, through the editor or
   the room, never the whole block, never straight to disk. `[PROPOSED]`: in
   a room, after two clicks merge, a value that no longer reads as a number
   within its bounds shows a badge and a one-click repair, never a silent
   guess.

6. **Which layouts ship.** `[DECIDED 2026-10-20]`, on the recommendation
   after the licence research. Built in, each field with its source in
   `docs/reference/statblock-sources.md`, each licence's line on the
   Credits page:
   - systems whose rules are open: the D&D 5e SRD (5.1 and 5.2.1, CC BY
     4.0), Pathfinder 2e (ORC), Starfinder 2e (ORC; its creature only, until
     its character sheet is read from a source), 13th Age (OGL 1.0a), Dungeon World and
     Blades in the Dark (CC BY 3.0), Fate Condensed and Accelerated (CC BY
     3.0), Mausritter and Ironsworn/Starforged's open parts (CC BY 4.0),
     Cairn and Old Dragon 2e (CC BY-SA 4.0: field names only, no text);
   - **Fractal** (Igor Téuri and Walter Licínio, CC BY 4.0 by its SRD's
     text, whose badge shows BY-SA — to be confirmed with the authors; field
     names only either way): a character (reserves, up to twelve facts that break and mend,
     XP) and a **challenge** whose obstacles may each be a `[[link]]` to
     another challenge's note — a campaign, its arcs and its episodes as one
     tree the graph already draws;
   - generic layouts named by their mechanics, with no system's name: d20
     creature, percentile, 2d6 moves (the Powered by the Apocalypse family),
     d6 pool (the Year Zero family), dice pool by difficulty, ladder and
     aspects.
   For the rest — Daggerheart, Tormenta20, Call of Cthulhu, Savage Worlds,
   the Free League games, Mothership and others — a layout is a file a person
   imports, or ships once the publisher allows it in writing. `[PROPOSED]`:
   the World of Darkness 5th-edition games under Paradox's Dark Pack, and a
   blank Cyberpunk RED layout under R. Talsorian's homebrew policy, each
   with its notice. Every built-in layout has a character sheet and, where
   the system has one, a separate adversary sheet.

7. **Editing in place.** In Live Preview the YAML shows while the caret is
   in the block; the card has a button to its source and the source one
   back, in both views. YAML that does not parse while typing keeps the last
   card drawn, with an error badge. A block past 256 KB is not parsed and
   says so. Nothing a statblock holds can stop the rest of the note from
   drawing.

8. **The layout editor, rebuilt.** `[DECIDED 2026-10-20]`: *"o construtor
   de layout tá muito ruim, péssimo na real, precisava que vc revisasse ou
   até refizesse"* (the layout builder is very bad, awful really; review it
   or even redo it). The block tree on one side and the card it makes on
   the other, drawn from a sample or from a statblock of the open note, both
   at once; adding a block from a menu; a block's options in place, not in
   a stack of dialogs; moving a block by drag or by keys; undo; leaving
   with unsaved changes asks first. It writes the layout's file through the
   contract.

9. **The switch.** Statblocks are a feature of [0103](0103-feature-presets-and-capability-flags.md),
   their roll buttons part of "Dice": off, the block is a code block, as
   Obsidian draws it without the plugin.

10. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
    an ability table is a `<table>` with column headers; every roll button
    and tracker box has a name and works from the keyboard; a layout's
    labels carry both languages.

## Consequences

- `app/ui/src/statblock/` is rewritten around the layout model; the first
  build's per-system layouts and its editor go.
- Rust: contract commands for `.verso/layouts/`, confined to that
  directory and to `.json`, bounded in size; `FolderSettings` unchanged
  for layouts. Generated bindings, the harness's answers, the Tauri
  permissions and the server's routes follow.
- `app/ui/src/dice/rolai/` gains `profile.ts`, `expression.ts` and the
  profiles, with their notices and Rolai's tests.
- `docs/reference/statblock-sources.md` (and its pt-BR twin) lists, per
  built-in layout, each field's source URL and the licence line.
- Spec §6 gains a row for ```` ```statblock ```` and for `[!oracle]` as
  constructs Verso draws, both read by Obsidian as a code block and a
  callout; the parser itself does not change.

## Discarded alternatives

- **Layouts in a device's browser storage** (the first build): a note drew
  differently on each device and for each person.
- **Layout fields run as JavaScript** (the plugin's): code from a shared
  file, run on everyone's machine.
- **A layout per system with fields from memory** (the first build): it
  shipped attributes no edition of the game has.
- **A card triggered by ordinary properties**: turns a note about a
  computer with `hp:` into a monster.

## Status

Accepted (2026-10-20), the design proposed to the maintainer that day; the
`[PROPOSED]` details wait for his reading.
