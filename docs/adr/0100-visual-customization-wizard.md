# ADR 0100 — Visual customization wizard: live CSS styler, versioned token contract, and personal theme profiles

- Date: 2026-10-17
- Source: the maintainer, in session on 2026-10-17: *"Tem uma outra feature
  também que seria importante Da gente ter, é uma Espécie de wizard de
  customização visual aí é customizar o CSS padrão da aplicação a gente tem
  ali algumas opções eu acho ok mas eu acho bem fraquinho não diz muito ali os
  nomes, a pessoa tem que alterar pra ver e eu queria que tivesse um wizard
  que a pessoa conseguisse customizar e salvar esses perfis e exportar e
  importar não seria legal se tivesse isso também já adiciono essa
  funcionalidade na lista aí de coisas pra se fazer antes mesmo de battle
  mapping de zone token etc."* Reviewed by Claude Opus 5.5 on 2026-10-17
  (`review_adrs_0098_0102.md`) to establish a versioned token contract, align
  with personal settings layering ([0070](0070-what-travels-with-the-folder.md)),
  enforce WCAG AA contrast validation, and prevent remote CSS injections.
- Related: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md),
  [0050](0050-outbound-network-access.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0076](0076-the-window-on-every-screen.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status in the briefing: not present; visual customization primitive.

## Context

Verso provides a curated aesthetic ("Manuscript") with light/dark modes and
vault accent colors ([0070](0070-what-travels-with-the-folder.md)). However, writers and
game masters desire tailored visual atmospheres (such as sepia parchment for
fantasy campaigns, high-contrast dark for late-night editing, or clean editorial
serif for long-form prose).

Currently, testing appearance adjustments requires navigating modal dialogs blind.
Furthermore, ad-hoc CSS overrides risk breaking interface contrast, and importing
arbitrary CSS files poses security hazards (such as `url(https://tracker/...)`
invoking outbound network requests in violation of ADR 0050
([0050](0050-outbound-network-access.md))).

A native visual styler is required, operating via a **versioned design token
contract**, previewing changes live, checking WCAG AA readability, and keeping
theme profiles at the personal device layer ([0070](0070-what-travels-with-the-folder.md)).

## Decision

Proposed (2026-10-17). The first text said it was accepted that day, with every item
marked `[DECIDED 2026-10-17]`; no acceptance by the maintainer is recorded, and on
2026-10-20 it went back to Proposed: each item marked so is a proposal (the review of
2026-10-20, docs/review/).

1. **The Visual Styler Wizard ("Personalizar aparência…")**.
   `[DECIDED 2026-10-17]`: Opens a floating or docked customizer alongside a live
   sample document (featuring headings, body paragraphs, blockquotes, code blocks,
   tables, and UI buttons). Changes apply to the preview in real time without
   reloading or flashing the window.

2. **Versioned Design Token Contract (`tokensVersion: 1`)**.
   `[DECIDED 2026-10-17]`: Customization is strictly mapped to defined CSS custom
   properties:
   - **Surfaces**: `--bg` (canvas), `--card-bg` (cards/panels), `--border` (dividers).
   - **Typography**: `--font-body`, `--font-heading`, `--font-mono`, `--font-size-base`.
   - **Accents & State**: `--accent`, `--accent-hover`, `--ink` (primary text), `--ink-muted`.
   - **Geometry**: `--radius` (corner radius: 0px, 6px, 12px), interface density.
   Tokens are typed and sanitized: raw CSS rules and external `url()` references are
   forbidden, guaranteeing local-first privacy ([0050](0050-outbound-network-access.md)).

3. **Layering follows ADR 0070: personal themes with optional vault suggestion**.
   `[DECIDED 2026-10-17]`: Theme profiles live in the **person layer** (`localStorage` /
   local app config, unsynced). A shared vault never forces an unreadable theme
   onto another reader. A vault may declare an optional `"recommendedTheme": "parchment"`
   in `.verso/settings.json`, which the user may choose to accept or dismiss.

4. **Live WCAG AA contrast check and safety revert**.
   `[DECIDED 2026-10-17]`: The styler computes live luminance contrast ratios
   between text (`--ink`) and background (`--bg`). If a color choice produces a
   ratio below WCAG AA requirements (4.5:1 for normal text), an accessible warning
   is displayed. When applying a drastic theme change, a 15-second "Keep changes?"
   confirmation dialog offers an automatic safety rollback to prevent lockouts.

5. **Theme Export and Import (`.verso-theme`)**.
   `[DECIDED 2026-10-17]`: Users can export their saved themes as clean `.verso-theme`
   JSON files containing metadata (name, author, light/dark mode, `tokensVersion: 1`)
   and token values. Dragging a `.verso-theme` file onto the window validates the
   schema and registers the profile into the local theme library.

6. **Accessibility and internationalization ([0035](0035-cross-cutting-requirements.md))**.
   `[DECIDED 2026-10-17]`: All slider controls, color swatches, font pickers, and
   contrast indicators provide descriptive ARIA labels in Portuguese (`pt-BR`) and
   English (`en`).

## Consequences

- Core application stylesheets remain unchanged and clean; themes override CSS
  variables at the `:root` level.
- Contrast validation protects accessibility and prevents unusable color combinations.
- Users can share curated aesthetics across the community safely as plain JSON.

## Discarded alternatives

- **Storing active themes in synced vault folders (`.verso/themes/`)**: Rejected
  because it forces one person's color scheme onto all collaborators in a room
  ([0070](0070-what-travels-with-the-folder.md)).
- **Allowing arbitrary raw CSS stylesheet imports**: Rejected because unchecked CSS
  allows remote network tracking (`url()`) and selector injections.

## Status

**Proposed (2026-10-17)**; back to Proposed on 2026-10-20, nothing built.
