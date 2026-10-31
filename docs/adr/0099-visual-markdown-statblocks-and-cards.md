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
- Revisions: 2026-10-21 — the maintainer marked the options of the decisions
  questionnaire of 2026-10-20 (answered 2026-10-21): the `[PROPOSED]` details
  of items 1, 5 and 6 are decided as proposed (0099.1, 0099.5, 0099.6a to c),
  and the English result words of the dice profiles (item 4) are approved.
  Status Accepted. 2026-10-21, review of the batch — two entries of
  "Discarded alternatives" ("Layout fields run as JavaScript" and "A card
  triggered by ordinary properties") are removed: no document or answer
  records that anyone considered them as alternatives to the design (CLAUDE.md
  rule zero, item 4). The decision itself, that no field of a layout is run
  as code and that a card comes only from a `statblock` block, is unchanged.
  2026-10-21, later — the maintainer answered S.3a to S.3d and A.1 of the
  decisions list of 2026-10-21 (items 1 and 6 below) and, in A.1, the two
  entries marked "(the first build)" are also removed from "Discarded
  alternatives" (nobody considered them either; rule zero, item 4).
  2026-10-21, review of the afternoon batch — (a) the build kept a one-line
  pointer to the Credits page on each licensed card, which S.3b = B (item 6)
  does not say: recorded below as a builder's choice awaiting the maintainer
  (question S.3b-bis of the decisions list of the afternoon), the decision of
  item 6 itself unchanged; (b) the pt-BR field names of the World of Darkness
  and Cyberpunk RED layouts were chosen by the build from community terms,
  provisional (S.3c, "translate now, correct later"); (c) "Discarded
  alternatives" reads "None recorded." (rule zero, item 4).
  2026-10-22 — the maintainer answered the decisions list of the afternoon of
  2026-10-21 (`verso-decisoes-pendentes-2026-10-21-tarde.md`) on 2026-10-22:
  (a) T.1, option A: the Fractal credit **stays CC BY 4.0**, as the SRD's text
  says (item 6b); 2026-10-29 the maintainer closed it for good: the licence
  is CC BY 4.0, with no open question left about it. (b)
  T.4, option A: the attribute names on the Vampire and Cyberpunk sheets
  (`strength`, `INT`) **stay as the note's data keys, in English, for now**;
  translating them needs a new feature (a label per key) that was not chosen
  (option B). (c) S.3b-bis, option A: **keep the short licence line on the
  World of Darkness and Cyberpunk RED sheets**, the full text and the logo
  only on the Credits page — "cumpre os dois acordos" (it meets both
  agreements). The deviation recorded under S.3b is now the maintainer's
  decision, not a builder's choice.
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
`[DECIDED 2026-10-20]` quotes his own answers; `[DECIDED 2026-10-21]` is the
option he marked in the decisions questionnaire of 2026-10-20 (the option
written in the item, with no words of his own); nothing is left
`[PROPOSED]`.

1. **A card comes from a ```` ```statblock ```` block, and only from it.**
   The block holds YAML. Its keys are Fantasy Statblocks' key names (`name`,
   `size`, `type`, `ac`, `hp`, `stats`, `saves`, `skills`, `traits`,
   `actions`, `reactions`, `legendary_actions`, `cr`, `image`, `layout`…),
   so a block written for the plugin draws in Verso and the other way round
   ([0030](0030-base-dialect-obsidian-compatible.md)). `layout:` names a
   layout by id or by name, exactly, ignoring case and accents; an unknown
   one draws the default layout with a visible "layout not found". No card
   is guessed from ordinary properties (`hp:` in a note about a computer).
   `[DECIDED 2026-10-21]` (0099.1, option A): `monster: Goblin` and
   `extends: [[Goblin]]` take the
   statblock of the note so named and override its keys — the plugin's
   bestiary, made of notes. `[DECIDED 2026-10-21]` (S.3d, option A): when an
   `extends:` lists several bases and two disagree, **the first listed
   wins**, as in the Fantasy Statblocks plugin, so a block copied from
   Obsidian gives the same result.

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
   `[DECIDED 2026-10-21]` (S.1, option A): the English result words of the
   profiles Fractal, Trophy and Infaernum in `app/ui/src/dice/profileWords.ts`
   are approved as built (Success / Failure, Success with Momentum ×2 to ×4,
   Rupture ×1 to ×4, Miracle, Misfortune, Feat and Glimpse ×1 to ×3, Yes /
   No, "Ruin rises", Number of Facts / Dark dice / Your Ruin, and
   Infaernum's "ideas" lists); literal translations, replaced when the
   authors publish their English terms.

5. **Trackers write into the note.** `[DECIDED 2026-10-20]`: *"13. deveria
   gravar"* (it should be saved). A **tracker** block shows a current value
   against a maximum — hit points, Fractal's reserves, stress, a clock,
   Hope — as boxes or a number. A click is the person's action (invariant
   8): it replaces that one value in the block's YAML, through the editor or
   the room, never the whole block, never straight to disk.
   `[DECIDED 2026-10-21]` (0099.5, option A): in a room, after two clicks
   merge, a value that no longer reads as a number within its bounds shows a
   badge and a one-click repair, never a silent guess (and never a silent
   clamp).

6. **Which layouts ship.** `[DECIDED 2026-10-20]`, on the recommendation
   after the licence research: built in only where the rules are open, plus
   generic layouts named by their mechanics; the rest imported, or shipped
   once the publisher allows it. `[DECIDED 2026-10-21]` (0099.6a, option A: the list approved as it is,
   thirteen families of `credits.ts`): the list below, worked out after
   that answer. Built in, each field with its source in
   `docs/reference/statblock-sources.md`, each licence's line on the
   Credits page:
   - systems whose rules are open: the D&D 5e SRD (5.1 and 5.2.1, CC BY
     4.0), Pathfinder 2e (ORC), Starfinder 2e (ORC; its creature only, until
     its character sheet is read from a source), 13th Age (OGL 1.0a), Dungeon World and
     Blades in the Dark (CC BY 3.0), Fate Condensed and Accelerated (CC BY
     3.0), Mausritter (its Third Party Licence; the line it asks for names
     who makes Verso — the maintainer, 2026-10-20: *"coloque Sérgio Sousa
     (Meio-Orc)"*), Ironsworn/Starforged's open
     parts (CC BY 4.0),
     Cairn and Old Dragon 2e (CC BY-SA 4.0: field names only, no text);
   - **Fractal** (Igor Téuri and Walter Licínio, CC BY 4.0;
     `[DECIDED 2026-10-21]` (0099.6b, option A), closed 2026-10-29: it
     stays built in, field names only, credited CC BY 4.0): a character (reserves, up to twelve facts that break and mend,
     XP) and a **challenge** whose obstacles may each be a `[[link]]` to
     another challenge's note — a campaign, its arcs and its episodes as one
     tree the graph already draws;
   - generic layouts named by their mechanics, with no system's name: d20
     creature, percentile, 2d6 moves (the Powered by the Apocalypse family),
     d6 pool (the Year Zero family), dice pool by difficulty, ladder and
     aspects.
   For the rest — Daggerheart, Tormenta20, Call of Cthulhu, Savage Worlds,
   the Free League games, Mothership and others — a layout is a file a person
   imports, or ships once the publisher allows it in writing. `[DECIDED 2026-10-21]`
   (0099.6c, option A): the World of Darkness 5th-edition games under
   Paradox's Dark Pack, and a blank Cyberpunk RED layout under
   R. Talsorian's homebrew policy, each built in with its notice on the
   Credits page. Every built-in layout has a character sheet and, where
   the system has one, a separate adversary sheet.

   `[DECIDED 2026-10-21]` — the six layouts as built (Vampire, character and
   antagonist; Werewolf and Hunter, character; Cyberpunk RED blank, character
   and NPC; field names only) and four details, answering S.3a to S.3c:
   - **The Dark Pack logo** (S.3a, "Outra"): *"Como no A mas vc faz tudo"*
     — option A was that the maintainer downloads the official logo from
     Paradox's Dark Pack kit; he asks instead that **the agent does all of
     it: fetches the official Dark Pack logo and puts it on the Credits
     page.** The logo is Paradox's, taken from the publisher's own kit, not
     drawn or altered.
   - **Where the licence notice sits** (S.3b, option B): **only on the
     Credits page**, not at the foot of each card (the card is cleaner).
     The notice of the Cyberpunk RED policy asks to be shown "in an easily
     noticeable location such as the end of the document"
     (`docs/reference/statblock-sources.md`, 3.28), and Paradox's agreement
     asks for the logo "somewhere in your material"; the maintainer chose the
     Credits page for both.
     *Deviation, 2026-10-21 (review of the afternoon batch), a builder's
     choice awaiting the maintainer (question S.3b-bis):* the build kept a
     one-line pointer to the Credits page on each licensed card (the six
     World of Darkness and Cyberpunk RED layouts), because the Dark Pack
     agreement asks for a notice "somewhere on Your Material" and R.
     Talsorian's policy asks for its disclaimer "in an easily noticeable
     location". The maintainer's answer (S.3b = B) did not say to add it and
     it is not attributed to him; the full notices and the logo stay on the
     Credits page only. Keep the pointer or remove it: his call.
   - **Field names** (S.3c, "Outra"): *"Como em B, depois a gente corrige"*
     — the names of the fields of the World of Darkness and Cyberpunk RED
     layouts are **translated to pt-BR now**, and corrected later against the
     Brazilian books (they were built in English, since the official names of
     the Brazilian editions were not verified). The risk of not matching the
     books is accepted. *Recorded 2026-10-21 (review of the afternoon batch):*
     the pt-BR names themselves were chosen by the build from common Brazilian
     RPG-community terms, not from the books: provisional, to be corrected as
     he said.

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

- None recorded.

## Status

Accepted (2026-10-20), the design proposed to the maintainer that day, with
every detail decided on 2026-10-21. Still outside this ADR: the Fractal
licence, which the maintainer is asking the authors (item 6).

**Decided (2026-10-31): the pt-BR field names stay provisional, with a
notice.** `[DECIDED 2026-10-31]` The pt-BR field names of the World of
Darkness and Cyberpunk RED layouts, chosen by the build from community terms
(Revisions, 2026-10-21 (b)), were put to the maintainer as B4 of the list of
2026-10-31: a) he gives the terms of the books, b) they stay provisional with
a notice on the Credits page. Approved as recommended, b: *"Todo resto pode ir de recomendado e aprovado"* (everything else may go as recommended, and is approved). They
stay provisional and the Credits page says so; the books' own terms replace
them when someone brings them.
