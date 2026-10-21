# ADR 0103 — Features: a visible switch for each optional feature, all on by default

- Date: 2026-10-17; rewritten 2026-10-20
- Source: the maintainer, 2026-10-17, on a proposal of presets: *"tem que
  ser visível o que está sendo desabilitado, porque talvez a pessoa queira
  habilitar um ou outro recurso"* (what is being turned off has to be
  visible, because a person may want to turn one feature or another on).
  The first text of this ADR, written that day by another AI (Gemini, in
  Antigravity) and marked Accepted with no acceptance by the maintainer,
  made three named presets — "Escrita Pura", "Construção de Mundos", "RPG
  Completo" — chosen from a list that said nothing of what each changed. On
  2026-10-20 the maintainer: *"não tá claro pra mim o que muda esses
  presets … eu acho que nem fica claro pro usuário também … ele deveria vir
  habilitado por padrão um modo completo com todas as features. E eu não sei
  se ele deveria chamar modo RPG"* (it isn't clear to me what these presets
  change … nor to the user … it should come with a complete mode, every
  feature on, by default; and I don't know that it should be called RPG
  mode). This text replaces the first one; the answers of 2026-10-20 are
  quoted in the items.
- Revisions: 2026-10-21 — the maintainer marked the options of the decisions
  questionnaire of 2026-10-20 (answered 2026-10-21): the migration of item 4
  decided as proposed (0103.4); a dated note added to item 4 and a new
  item 7, because [0100](0100-visual-customization-wizard.md) item 3 (the
  folder may suggest a theme), [0101](0101-3d-dice-physics-overlay.md) item
  5 (a switch off by default) and [0106](0106-structured-data-as-a-diagram.md)
  (a new switch) touch this ADR. Status Accepted.
  2026-10-21, evening — where the switches live: the maintainer, *"os
  recursos de rpg deveriam estar separados dos recursos da aplicação"*,
  then, on seeing them as two groups inside one page, *"colocar esses
  recursos de rpg dentro do grupo RPG & Mesa Solo"*. Settings ›
  Features keeps the shortcuts "Everything" / "Writing only" (which
  still cover every switch) and the general switches; the RPG switches
  (dice, random tables, oracles, statblocks, the world wizard, 3D dice),
  their "turn all on / off" (never turning 3D on) and the 3D dice
  appearance move to a page "Dados e RPG" / "Dice and RPG", first in the
  RPG & Solo Play group of Settings. The page name is the author's.
- Related: [0012](0012-files-are-source-of-truth.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0073](0073-self-hosted-server-first.md) item 5,
  [0088](0088-dice-and-random-tables.md),
  [0098](0098-world-and-campaign-wizard-template-bundles.md),
  [0099](0099-visual-markdown-statblocks-and-cards.md),
  [0102](0102-creative-oracles-and-improvisation.md).
- Status in the briefing: not present.

## Context

Verso serves someone writing a novel and someone running a campaign. A
person who only writes should be able to keep game tools out of sight; a
person who plays wants all of them. A preset with a name says neither what
it turns off nor how to get one thing back: the first build's three presets
differed, in practice, by one feature, and three of their six flags were
never read.

## Decision

Accepted on 2026-10-20 (the maintainer: *"adorei as sugestões e melhorias
e correções. pode definir uma sequencia e atuar em tudo"* — I loved the
suggestions, improvements and fixes; set an order and act on all of it),
for the design proposed to him that day; `[DECIDED 2026-10-21]` marks a
detail he decided later, by marking an option of the questionnaire of
2026-10-20.

1. **One switch per optional feature, in Settings › App › Features.** Each
   says in one line what it adds and where it shows:
   - **Dice** — `` `dice: 1d20+3` `` in a note becomes a button; the "Roll
     dice…" command; the roll buttons of a statblock ([0088](0088-dice-and-random-tables.md)).
   - **Random tables** — a table or list with an `^id` rolls ([0088](0088-dice-and-random-tables.md)
     item 3).
   - **Oracles** — the buttons of `[!oracle]`, the "Ask the oracle"
     command and its `/` item ([0102](0102-creative-oracles-and-improvisation.md)).
   - **Statblocks** — a `statblock` block drawn as a card ([0099](0099-visual-markdown-statblocks-and-cards.md)).
   - **Project wizard** — creating a world, campaign or book from a bundle
     ([0098](0098-world-and-campaign-wizard-template-bundles.md)).
   A feature that is not built has no switch. Secrets, maps and the infobox
   are part of the core and have none.

2. **Everything on by default.** *"deveria vir habilitado por padrão um
   modo completo com todas as features"*.

3. **Shortcuts named by what they do**: "Everything" and "Writing only".
   Before applying, a shortcut shows exactly what it turns on and off, and
   nothing changes on cancel. Only the switches are stored; switches that
   match no shortcut read "Custom". No mode is called "RPG".

4. **The person's choice, not the folder's.** The switches are the
   person's settings ([0070](0070-what-travels-with-the-folder.md) item 1;
   on a server, the account's, [0073](0073-self-hosted-server-first.md)
   item 5). A folder never turns a feature on or off. `[DECIDED 2026-10-21]` (0103.4,
   option A): a build
   that stored a preset reads it once — writing → all off, worldbuilding →
   all on but statblocks, anything else → all on — and drops it.
   *Note, 2026-10-21 — themes differ.* "Never the folder" is the rule for
   feature switches. For themes the maintainer decided otherwise, knowingly
   (0100.3, option B, in [0100](0100-visual-customization-wizard.md)
   item 3): a theme is the person's choice, and a folder may add an
   optional `recommendedTheme` suggestion in `.verso/settings.json` that the
   person accepts or ignores. This is a decision of the maintainer for
   themes only; it changes nothing for the switches.

5. **Off changes no file and hides nothing for good.** Off, the construct
   is drawn as what Obsidian draws without a plugin — inline code, a code
   block, a plain callout — and its commands and `/` items are gone; a
   settings page of an off feature says it is off, with a button to turn it
   on. A change applies at once, without a reload, and is announced.

6. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
   a fieldset with a legend; each switch labelled, its line its
   description; keyboard only works; every word in pt-BR and EN.

7. **Two switches whose rule is not "on by default".** `[DECIDED
   2026-10-21]`:
   - **Data diagram** (0106.6, option A) — a switch in Settings › App ›
     Features, on by default like the others; off, no button of the
     diagram appears ([0106](0106-structured-data-as-a-diagram.md)). It
     exists when the feature is built.
   - **3D dice** (0101.5, option A) — its own switch, "3D dice", **off by
     default even with "Everything" on**: the one expensive feature in
     weight and battery, so item 2 has this one exception, approved by the
     maintainer. The "Everything" shortcut says before applying that it does
     not turn 3D dice on. With reduced motion on it never animates, switch on
     or not. Sound is another switch, off. It exists when the feature is
     built ([0101](0101-3d-dice-physics-overlay.md)).

## Consequences

- `app/ui/src/capabilities.ts` keeps `hasCapability(id)` as the one gate;
  the preset id and its list are gone.
- The project wizard lists every bundle; it no longer filters by preset.

## Discarded alternatives

- **Named presets** (the first build): the maintainer could not tell what
  they changed.
- **A preset recommended by the folder**: a person opening a shared folder
  would find their tools changed by someone else's choice.

## Status

Accepted (2026-10-20), the design proposed to the maintainer that day; item
4's migration decided on 2026-10-21.
