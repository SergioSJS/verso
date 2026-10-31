# ADR 0100 — Appearance wizard: a live preview in Settings over the real tokens, saved profiles, and `.verso-theme` files

- Date: 2026-10-17; rewritten 2026-10-21
- Source: the maintainer, in session on 2026-10-17: *"Tem uma outra feature
  também que seria importante Da gente ter, é uma Espécie de wizard de
  customização visual aí é customizar o CSS padrão da aplicação a gente tem
  ali algumas opções eu acho ok mas eu acho bem fraquinho não diz muito ali os
  nomes, a pessoa tem que alterar pra ver e eu queria que tivesse um wizard
  que a pessoa conseguisse customizar e salvar esses perfis e exportar e
  importar não seria legal se tivesse isso também já adiciono essa
  funcionalidade na lista aí de coisas pra se fazer antes mesmo de battle
  mapping de zone token etc."* (there is another feature we should have, a
  kind of visual-customization wizard … the options we have are okay but
  weak, the names say little, a person has to change one to see it; I'd like
  a wizard where a person customizes, saves these profiles, exports and
  imports them … before even the battle map). On 2026-10-21, answering the
  review of the rpg round, which had found that only one of the ADR's eleven
  properties exists in the window's CSS under that name: *"Atualize a ADR pra
  refletir a realidade então"* (then update the ADR to reflect reality).
  This text replaces the first one, written on 2026-10-17 by another AI and
  marked Accepted with no acceptance.
- Related: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md),
  [0050](0050-outbound-network-access.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0076](0076-the-window-on-every-screen.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status in the briefing: not present.
- Revisions: 2026-10-20 — the first text went back to Proposed (it called
  itself Accepted on 2026-10-17 with no acceptance recorded).
  2026-10-21 — rewritten over the window's real tokens with the maintainer's
  answers 0100.0 to 0100.6 (marking the options of the decisions
  questionnaire of 2026-10-20); Accepted. The first text's tokens (`--bg`,
  `--card-bg`, `--border`, `--accent`, `--font-body`…), its floating window,
  its 15-second "Keep changes?" dialog and its drag-and-drop-only import are
  gone; its "recommended theme in the folder" stays, now by the maintainer's
  explicit choice (item 3). 2026-10-21, later — **item 2 revised by the
  maintainer** after looking at the installed beta: the panel inside Settings
  is replaced by a gallery of theme cards and a dedicated theme-builder
  window (item 2, Revision); item 4 confirmed (T.1, option A). 2026-10-22 —
  item 3 (`tokensVersion: 1`) **extended, not replaced**, by
  [0109](0109-themes-v2-more-tokens-and-a-catalogue.md): `tokensVersion: 2`
  adds optional colours, structural choices and a credit; version 1 files stay
  valid and look the same.

## Context

Settings › Appearance already offers a theme (auto, light, dark), four
palettes (`paper`, `sepia`, `slate`, `moss`), three tones of dark (`soft`,
`deep`, `dusk`), the font size, a heading font, a body font, a heading colour
and a reading width (`app/ui/src/settings.ts`, `app/ui/css/base.css`), all
kept as the person's settings, never in a note. What it lacks is what the
maintainer complained of on 2026-10-17: a person cannot see the result
before changing it, cannot make a look of their own and keep it, and cannot
hand it to someone.

The first text of this ADR asked for eleven properties. Checked against the
CSS on 2026-10-20 (review D-I15): only `--ink` exists under that name. The
window's tokens are `--paper`, `--paper-2`, `--paper-3`, `--hair`, `--ink`,
`--ink-2`, `--ink-3`, `--seal` (the accent), `--seal-wash`, `--brass`,
`--brass-ink`, `--brass-wash`, `--heading-font`, `--book` (body font),
`--mono`, and the `font-size` of the `<html>` element; there is no radius
token and no "hover" colour. The idea stands; the contract has to be written
over the real names.

## Decision

Accepted on 2026-10-21. Each item is `[DECIDED 2026-10-21]`: the maintainer
marked the option written in it in the decisions questionnaire of 2026-10-20;
where an option differs from the one first recommended, the item says so.

1. **It is in V1, as a small slice** (0100.0, option A; roadmap V.28). A live
   preview in Settings, over the real tokens, with saved profiles and
   export/import; no free-CSS field. No dependency, only CSS variables and
   JSON, so it works offline and weighs nothing.

2. **The panel is inside Settings › Appearance** (0100.1, option A), not a
   floating window: a sample document beside the controls (headings, body
   text, a quotation, code, a table, buttons) that changes at once as a value
   changes. The Settings screen is already keyboard- and screen-reader-
   accessible and works the same on the phone and in the browser
   ([0076](0076-the-window-on-every-screen.md)); the live preview is a change
   of variables on `:root`, with no reload and no flash.

   **Revision, 2026-10-21 (the maintainer, after looking at the beta
   installed that day): this item is revised.** He looked at the beta and
   wrote: *"Quase tudo ok, exceto a parte do wizard de tema, achei a tela
   mega puida [poluída], bora fazer uma nova janela só para construção do tema.
   pensei de em settings aparência ele ter várias caixas com amostra mínima
   de cada tema para simplificar a escolha, e botões para copiar e alterar o
   tema aí sim abrindo a janela com as opções que foram feitas"* (almost
   everything is fine, except the theme wizard; the screen is very cluttered;
   let us make a new window just for building the theme; in Settings ›
   Appearance, several boxes with a minimal sample of each theme to simplify
   the choice, and buttons to copy and to edit the theme, which then opens the
   window with the options that were made). So: **Settings › Appearance shows
   a gallery of theme cards, each with a minimal sample, with Copy and Edit
   buttons; Edit (and Copy, which opens the copy) opens a dedicated
   theme-builder window with the options built.** The controls and the
   sample document of this item move out of Settings into that window. What
   the item says about the sample document updating at once, the keyboard and
   screen-reader accessibility, and the live preview as a change of variables
   on `:root` stays and applies to the new window. The detail of the window
   (its size, whether it is a Verso window or a dialog, how a card is drawn)
   is not decided by this revision. Roadmap: a new row in V1, V.28's slice.

3. **The token contract, `tokensVersion: 1`** (0100.2, option A): a short,
   fixed list over the real names — `--paper`, `--paper-2`, `--hair`,
   `--ink`, `--ink-2`, `--seal`, `--brass-ink`, `--heading-font`, `--book`,
   `--mono` and the font size. A theme is only a list of values for these
   tokens: **never free CSS, never `url()`**, never a rule
   ([0050](0050-outbound-network-access.md)); each value is checked against
   its type (a colour, a font from the allowed set, a size in a range). The
   values the person does not edit one by one (`--paper-3`, `--ink-3`, the
   washes, the dark tones) are derived by the wizard from these, so the
   palettes already validated for contrast are not touched. There is no radius
   token: none exists today and the maintainer did not ask for one.
   `tokensVersion` lets the list grow without breaking a saved theme. A theme
   never touches a note: it is variable values, kept outside the folder.

4. **Where a theme lives: the person's layer, plus an optional suggestion
   from the folder** (0100.3, **option B — the maintainer's explicit
   choice**). Saved profiles are the person's settings
   ([0070](0070-what-travels-with-the-folder.md) item 1; on a server, the
   account's), unsynced between people, so in a room each person sees their
   own theme. A folder may carry an optional `recommendedTheme` in
   `.verso/settings.json`, which the person accepts or dismisses; the folder
   never applies it by itself. The maintainer chose this knowing that
   [0103](0103-feature-presets-and-capability-flags.md) item 4 says "the
   person's choice, never the folder's" for feature switches: for themes he
   decided otherwise, and 0103 carries a dated note saying so.
   **Confirmed 2026-10-21 (T.1, option A):** the suggestion is only the whole
   theme, written inside `.verso/settings.json`; one place, nothing to follow.
   **Amended 2026-10-27 by the maintainer (bug list): the choice is per folder
   and per person; a folder without its own choice uses the person's
   default.** The person's layer holds the default theme and, apart, the
   choices made for single folders (by folder key); neither is written into
   the folder or reaches another person. Accepting the folder's suggestion
   sets this folder's choice, not the default. A folder's choice includes
   the light/dark mode (a theme of one side switches the window to that
   side); the text size stays the person's, for every folder.
   A path to a `.verso-theme` file inside `.verso/` is not accepted.

5. **Contrast is checked live, and an unreadable screen is undone**
   (0100.4, option A). For the real pairs — ink on paper, ink 2 and ink 3 on
   paper, the accent on paper — the panel shows the ratio live and warns
   below 4.5:1 (WCAG AA for text). Only if a choice would drop a pair
   **below 3:1** is it reverted automatically, once, with a message saying
   what was undone; there is no timed "Keep changes?" dialog on every change.
   "Restore default" is always on the panel and reachable by keyboard, with
   a visible label, whatever the state.

6. **Export and import `.verso-theme`** (0100.5, option A). A theme is a small
   JSON (name, light or dark, `tokensVersion`, the values) that is exported
   and imported with **strict validation**: only the tokens of the list, only
   colours and fonts it knows, a maximum size, no `url()`, nothing else. A
   file dragged onto the window is accepted, and there is also an
   **"Import…"** button, so a person who uses only the keyboard or a screen
   reader can do it without dragging. Fonts are only those the app ships and
   the system's; a font fetched from outside would break the network rule
   ([0050](0050-outbound-network-access.md)).

7. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
   every control labelled in pt-BR and EN; colours and sizes operable by
   keyboard; the contrast ratios and a revert announced in a polite live
   region; the preview does not move focus.

## Consequences

- The core stylesheets do not change: a theme overrides variables at `:root`
  (and the existing `data-palette` and dark-tone mechanisms keep working).
- Profiles live in the person's settings (`app/ui/src/settings.ts` gains a
  list of themes); `recommendedTheme` is one more key of
  `.verso/settings.json` (the contract's `FolderSettings`, its bindings
  regenerated).
- A validator for `.verso-theme` files with a test of hostile inputs (a
  `url()`, an unknown token, a huge value, a wrong type); the pairs'
  contrast computed from the real tokens; a test that the revert happens
  only below 3:1.
- The demo vault teaches it ([0058](0058-demo-vault-as-tutorial.md)); the
  changelog gets its line; roadmap row V.28.

## Discarded alternatives

Only what the maintainer refused when he marked these answers (the first
text's "alternatives" were never considered by anyone but its author and are
not recorded):

- **Waiting until after V1, or not doing it** (0100.0, B and C): the
  maintainer wants it in V1.
- **A floating or docked window** (0100.1, B), and **no sample document**
  (0100.1, C): the first is a new focus-and-keys component, hard on a phone;
  the second keeps "change it to see it".
- **Creating the tokens of the first text (`--bg`, `--accent`…) and making the
  CSS use them** (0100.2, B), and **only adding two or three palettes, with no
  editor** (0100.2, C).
- **Only the person's layer, the folder never suggesting** (0100.3, A): the
  maintainer chose the optional suggestion instead.
- **A timed "Keep changes?" dialog on every drastic change** (0100.4, B), and
  **a warning only, with no automatic revert** (0100.4, C).
- **Local profiles only, with no export or import in V1** (0100.5, B).
- **Also accepting the path of a `.verso-theme` inside `.verso/` as the
  folder's suggestion** (T.1, B): one more path to validate.
- **The customization panel kept inside Settings** (the maintainer, 2026-10-21):
  too cluttered; replaced by the gallery and the builder window (item 2).

## Status

Accepted (2026-10-21), the rewrite over the real tokens with the maintainer's
answers to 0100.0–0100.6.

As built 2026-10-21, on `feat/rpg-tools` (not pushed, not released):
`f41fb433` (the colour maths, the theme files and the profiles) and
`6b3ec1fa` (the Customize appearance panel in Settings), with `9e97507d`
(a folder suggests a theme in its settings file) and `55cf1ecf` (the
tutorial and the changelog); merged by `203b8989`.

Revised 2026-10-21 (item 2): the Settings panel gives way to a gallery of
theme cards and a dedicated theme-builder window; to be built.

As built 2026-10-22, after the maintainer's report (*"a configuração de tamanho
da fonte está estranha: eu arrasto, aí a tela muda de tamanho e some a barra,
dependendo do zoom"*): the font size setting — and a theme's `font-size` — now
sizes the notes' text only (`--note-scale`), no longer the `<html>` element; the
interface's size is the window zoom. This contradicts the text of this ADR
(a theme's `font-size` "of the `<html>` element"); recorded, **not decided** —
the maintainer confirms or reverts it.

Confirmed 2026-10-22 by the maintainer — the font size sizes the notes only
(*"deveria ser"*); the as-built note above is now the decision.
