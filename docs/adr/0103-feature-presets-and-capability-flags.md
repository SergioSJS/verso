# ADR 0103 — Feature presets and capability flags: pure writing, worldbuilding, and tabletop RPG

- Date: 2026-10-17
- Source: the maintainer, on 2026-10-17, addressing the architectural review
  of ADRs 0098–0102. Tabletop RPG and worldbuilding features (dice, secret
  blocks, maps, statblocks, bundles, oracles) have entered the product, but
  the invariant that Verso remains a pure, focused, distraction-free
  Markdown workspace for novelists, journalists, and students must never be
  compromised ([0003](0003-primitives-not-workarounds.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0036](0036-tabletop-rpg-support.md)). This ADR formalizes the capability
  presets and the graceful degradation of all domain-specific features.
- Related: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0015](0015-schema-packs.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0086](0086-infobox-a-typed-notes-card.md),
  [0088](0088-dice-and-random-tables.md),
  [0098](0098-world-and-campaign-wizard-template-bundles.md),
  [0099](0099-visual-markdown-statblocks-and-cards.md),
  [0100](0100-visual-customization-wizard.md),
  [0101](0101-3d-dice-physics-overlay.md),
  [0102](0102-creative-oracles-and-improvisation.md).
- Status in the briefing: not present; foundational preset specification.

## Context

Verso is built on the premise that files are the source of truth
([0012](0012-files-are-source-of-truth.md)) and that its dialect extends
Obsidian without contradicting it
([0030](0030-base-dialect-obsidian-compatible.md)). A person writing an essay,
a book, or technical documentation expects a clean reading and editing
experience: code blocks look like code, inline code looks like code, and the
command palette is not overwhelmed with game-mastering tools.

At the same time, Verso provides rich tabletop gaming and worldbuilding
capabilities ([0036](0036-tabletop-rpg-support.md),
[0088](0088-dice-and-random-tables.md),
[0098](0098-world-and-campaign-wizard-template-bundles.md),
[0099](0099-visual-markdown-statblocks-and-cards.md),
[0102](0102-creative-oracles-and-improvisation.md)). Without explicit
feature gating, heuristic triggers (such as detecting `hp:` or `ac:` in
frontmatter) could erroneously turn a real estate or hardware note into a
monster sheet, and RPG commands would clutter non-gaming vaults.

A unified capability and preset architecture is therefore required to
govern how features activate, where settings live, and how unenabled
constructs degrade gracefully without modifying files.

## Decision

Proposed (2026-10-17). Accepted on 2026-10-17 (Status): each `[OPEN]` was decided as
recommended and is marked `[DECIDED 2026-10-17]`.

1. **Three standard presets are established.**
   `[DECIDED 2026-10-17]`:
   - **`writing` ("Escrita Pura" / "Pure Writing")**: A distraction-free
     environment for authors and researchers. All gaming-specific widgets
     are turned off. `` `dice: ...` `` renders as standard inline code;
     a `statblock` code block renders as syntax-highlighted code;
     `[!oracle]` callouts render as generic callouts. RPG commands and
     templates are hidden from the palette and project wizard.
   - **`worldbuilding` ("Construção de Mundos" / "Worldbuilding")**: For
     creative worldbuilders, novelists, and screenwriters. Random tables,
     creative oracles ([0102](0102-creative-oracles-and-improvisation.md)),
     infoboxes ([0086](0086-infobox-a-typed-notes-card.md)), and world lore
     template bundles
     ([0098](0098-world-and-campaign-wizard-template-bundles.md)) are
     active. Statblock rendering and 3D dice remain off.
   - **`rpg` ("RPG Completo" / "Tabletop RPG")**: For players and game
     masters. All features are active: inline dice rolling
     ([0088](0088-dice-and-random-tables.md)), visual statblocks
     ([0099](0099-visual-markdown-statblocks-and-cards.md)), creative
     oracles ([0102](0102-creative-oracles-and-improvisation.md)),
     campaign bundles, and optional 3D dice
     ([0101](0101-3d-dice-physics-overlay.md)).

2. **Settings layering follows ADR 0070.**
   `[DECIDED 2026-10-17]`: A person's active preset is kept in **local
   settings** (`localStorage` / desktop config, unsynced), preserving
   individual preference. A vault may declare a recommended preset in
   `.verso/settings.json` (`"preset": "rpg"`). When opening a vault for the
   first time, the window adopts the vault's recommended preset; the person
   may change their local preset at any time without dirtying the vault's
   files.

3. **Granular capability flags underpin presets.**
   `[DECIDED 2026-10-17]`: Presets are bundles of boolean capability flags:
   `diceRolling`, `randomTables`, `oracles`, `statblocks`, `campaignBundles`,
   and `threeDice`. Power users may fine-tune individual flags under
   Settings › Capabilities.

4. **Graceful degradation is universal and leaves files untouched.**
   `[DECIDED 2026-10-17]`: Turning off a capability never mutates any note
   on disk ([0012](0012-files-are-source-of-truth.md)). CodeMirror 6
   view plugins and decorators inspect the active flags:
   - When `statblocks` is disabled, `statblock` code blocks are drawn as
     fenced code, and `layout: statblock` notes render standard frontmatter
     or infoboxes ([0086](0086-infobox-a-typed-notes-card.md)).
   - When `oracles` is disabled, `[!oracle]` renders as a standard callout
     without interactive action buttons.
   - When `diceRolling` is disabled, `` `dice: ...` `` renders as standard
     inline code.
   - Palette commands corresponding to inactive capabilities are filtered out.

5. **Accessibility and internationalization ([0035](0035-cross-cutting-requirements.md)).**
   `[DECIDED 2026-10-17]`: Preset names and descriptions are localized in
   both Portuguese (`pt-BR`) and English (`en`). Switching presets
   announces the newly active mode in a polite live region (`aria-live="polite"`).
   The preset switcher uses proper radiogroup semantics (`role="radiogroup"`
   and `role="radio"` with `aria-checked`).

## Consequences

- The application settings store gains a `preset` key and capability flags.
- CodeMirror decoration extensions for dice, statblocks, and oracles check
  the active capabilities before creating widgets.
- The command palette respects capability filters, keeping navigation lean
  for pure writers.
- The project wizard ([0098](0098-world-and-campaign-wizard-template-bundles.md))
  filters available templates based on the active preset.
- Documentation and demo vaults ([0058](0058-demo-vault-as-tutorial.md))
  gain examples of each preset.

## Discarded alternatives

- **Separate binaries or compile-time flags**: Rejected because users often
  wear multiple hats (writing a novel in one folder, running an RPG session
  in another) using the same application.
- **Dynamic community plugin marketplace**: Rejected as premature; core
  capabilities are first-class primitives ([0003](0003-primitives-not-workarounds.md))
  gated by transparent flags.

## Status

**Accepted (2026-10-17).**
