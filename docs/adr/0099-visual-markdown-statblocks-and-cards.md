# ADR 0099 — Visual Markdown: statblocks and RPG note cards: layout integration, CRDT safety, and compatibility matrix

- Date: 2026-10-17
- Source: the maintainer, in session on 2026-10-17: *"depois disso seriam as
  fichas, o stat blocks, os visuais markdown. Eu acho que esse visual markdown
  tem a ver com o que a gente prometeu na V1, então talvez bote ele antes até
  dessas outras funcionalidades."* Reviewed by Claude Opus 5.5 on 2026-10-17
  (`review_adrs_0098_0102.md`) to integrate with the `layout:` primitive of
  ADR 0086, eliminate accidental heuristic triggers, establish a compatibility
  matrix, and secure collaborative sessions against CRDT text desync.
- Related: [0003](0003-primitives-not-workarounds.md),
  [0009](0009-external-constraints.md),
  [0012](0012-files-are-source-of-truth.md),
  [0015](0015-schema-packs.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0086](0086-infobox-a-typed-notes-card.md),
  [0088](0088-dice-and-random-tables.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status in the briefing: not present; visual Markdown card primitive.

## Context

Game masters running live sessions and worldbuilders documenting fictional
creatures require statblocks (Armor Class, Hit Points, Ability Scores, Speeds,
Actions, and Traits) to be formatted with book-grade legibility rather than
raw YAML or unstyled prose.

In Obsidian, users author statblocks either via the community *Fantasy Statblocks*
plugin (`javalent/fantasy-statblocks`) using fenced code blocks (`statblock`)
or via custom CSS snippets. Without the plugin installed, Obsidian displays
the fence as plain, unstyled code.

Verso's landing page promises visual cards for notes: *"Ficha da nota. As
propriedades viram um cartão ao lado do texto, com imagem — a ficha de um
personagem, de um lugar, de um projeto"* ([0086](0086-infobox-a-typed-notes-card.md)).
However, ad-hoc heuristic triggers (e.g., detecting `hp:` or `ac:` in generic
frontmatter) cause unintended conversions of real estate or device notes into
monster sheets. Furthermore, attempting to mutate Hit Points by rewriting
frontmatter text directly during live multiplayer sessions corrupts concurrent
Yjs character-by-character editing ([0082](0082-live-co-editing-of-a-synced-folder.md)).

## Decision

Proposed (2026-10-17). Accepted on 2026-10-17 (Status): each `[OPEN]` was decided as
recommended and is marked `[DECIDED 2026-10-17]`.

1. **Explicit triggering via ADR 0086 layout primitive and fenced blocks.**
   `[DECIDED 2026-10-17]`: Statblocks are activated strictly through two
   explicit, non-heuristic mechanisms:
   - **Note-level card**: Frontmatter specifies `layout: statblock` (building
     upon ADR 0086 item 1's `layout` property, alongside `infobox`).
   - **Inline block**: A fenced codeblock using language `statblock`
     (compatible with Obsidian Fantasy Statblocks).
   Heuristic triggers based on property keys (`hp:`, `ac:`) are strictly
   rejected. The feature is active only when the `rpg` preset is enabled
   ([0103](0103-feature-presets-and-capability-flags.md)).

2. **CRDT safety and ephemeral session state ([0082](0082-live-co-editing-of-a-synced-folder.md)).**
   `[DECIDED 2026-10-17]`: Opening, viewing, and interacting with a statblock
   never mutates the note text on disk ([0012](0012-files-are-source-of-truth.md)).
   Temporary in-combat damage tracking is kept purely in local session memory
   (keyed by note path and block ID). Persisting HP into note frontmatter by
   character-by-character text mutation is forbidden because concurrent edits
   by multiple game masters cause semantic corruption (`hp: 12` merging into
   `1209`).

3. **Interactive dice rolls reuse ADR 0088 engine.**
   `[DECIDED 2026-10-17]`: Attack bonuses, damage formulas, and recharge
   notations (e.g., `1d20+5`, `2d6+3`, `recharge 5-6`) within traits and
   actions are automatically rendered as clickable dice badges. Clicking a
   badge triggers a roll using the unified dice engine
   ([0088](0088-dice-and-random-tables.md)), announced to the room in
   collaborative sessions and relayed to screen readers.

4. **Live Preview ergonomics and source editing.**
   `[DECIDED 2026-10-17]`: In Live Preview, placing the cursor inside a
   `statblock` codeblock reveals the raw YAML text, matching CodeMirror 6's
   native block widget behavior. A dedicated toggle button in the card header
   allows quick switching between visual and source views. When YAML parsing
   fails during typing, Verso displays the last valid rendered card with an
   inline error badge, never flashing an empty white box.

5. **Compatibility matrix for third-party formats ([0009](0009-external-constraints.md)).**
   `[DECIDED 2026-10-17]`:
   - **Supported**: Core 5e SRD keys (`name`, `size`, `type`, `alignment`,
     `ac`, `hp`, `speed`, `stats`, `saves`, `skills`, `damage_resistances`,
     `condition_immunities`, `senses`, `languages`, `cr`, `traits`, `actions`,
     `reactions`, `legendary_actions`), Tormenta20 / Portuguese variants
     (`nd`, `ca`, `pv`, `pm`, `deslocamento`, `pericias`, `ataques`), and
     generic key-value dictionaries.
   - **Graceful fallback**: Plugin-specific keys requiring internal database
     resolutions (`monster: Goblin`, `extends:`, plugin layouts) render cleanly
     as generic key-value stat cards rather than failing.

6. **Accessibility and internationalization ([0035](0035-cross-cutting-requirements.md)).**
   `[DECIDED 2026-10-17]`: All statblock labels, modifier abbreviations, and
   action titles support Portuguese (`pt-BR`) and English (`en`). Ability
   score tables implement proper `<table>`, `<th>`, and `<td>` markup with
   column headers. Dice roll buttons provide descriptive `aria-label` tags
   (e.g., "Roll 1d20+5 attack in Verso").

## Consequences

- `app/ui/src/statblock/` provides parsing (`parser.ts`), DOM rendering
  (`render.ts`), and type contracts (`types.ts`).
- Fenced codeblocks degrade gracefully to standard syntax-highlighted code
  when the `rpg` capability preset is disabled
  ([0103](0103-feature-presets-and-capability-flags.md)).
- Unit tests (`app/ui/test/statblock.test.mjs`) verify 5e monster parsing,
  Tormenta20 compatibility, ability score modifier math, and fallback behavior.

## Discarded alternatives

- **Heuristic frontmatter triggers without explicit layout property**:
  Rejected to prevent false positives on general writing and device notes.
- **Direct file mutation for combat HP trackers**: Rejected due to CRDT
  text corruption risks in collaborative rooms ([0082](0082-live-co-editing-of-a-synced-folder.md)).

## Status

**Accepted (2026-10-17).**
