# ADR 0109 — Themes, second step: more tokens, a richer builder, and a catalogue behind "More themes…"

- Date: 2026-10-22
- Source: the maintainer, 2026-10-22, with a specification he generated with
  Gemini (`~/Projects/person/apps/verso-archive/decisoes-2026-10/verso-especificacao-temas-expandidos-2026-10-22.md`,
  outside the repository): *"Seria uma coisa muito legal se a gente
  conseguisse incorporar já todos esses temas no Verso, só que de um jeito
  um pouco diferente. Em vez de listar toda a caralhada de temas ali e ficar
  uma coisa mega poluída, tem um botãozinho que se a pessoa clicar, aí ele
  expande ou abre uma janela nova que lista todos os temas que a gente já
  tem dentro do Verso, incluindo esses extras"* (incorporate those themes,
  but instead of listing them all and polluting the panel, a small button
  opens a window that lists every theme Verso has, the extras included);
  and *"a gente sentiu aqui uma falta de muitas tags do lado do Verso…
  pouquíssimas tags ali e isso pode ser meio paia no quesito de falta de
  customização… expandir a seleção de temas e expandir também as tags
  cobertas pelos temas do Verso e pelo modo de edição de temas"* (Verso's
  themes cover very few tokens; expand both the selection of themes and the
  tokens a theme and the theme builder cover). The specification was checked
  against the themes' repositories the same day
  (`~/Projects/person/apps/verso-archive/decisoes-2026-10/verso-temas-verificacao-2026-10-22.md`): see
  Context. Written by Opus 5.5; to be read by the other model before it is
  accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0100](0100-visual-customization-wizard.md) (the token contract
  `tokensVersion: 1`, the builder, the gallery, export and import, contrast
  floor 3:1 and warning 4.5:1), [0005](0005-license.md) (MPL-2.0),
  [0009](0009-external-constraints.md) (admissible sources about Obsidian),
  [0050](0050-outbound-network-access.md) (no network from a theme),
  [0035](0035-cross-cutting-requirements.md), [0099](0099-visual-markdown-statblocks-and-cards.md)
  (statblock colours), [0102](0102-creative-oracles-and-improvisation.md)
  (oracle colours).

## Context

A Verso theme today ([0100](0100-visual-customization-wizard.md) item 3) is
a JSON file of 7 colour tokens per side (`--paper`, `--paper-2`, `--hair`,
`--ink`, `--ink-2`, `--seal`, `--brass-ink`) plus fonts and a size, checked
field by field, 16 KB at most, no CSS and no network. Exporting one of
Verso's themes shows how little a theme can say: headings, code, callouts,
tables and tags all follow from those 7.

The specification proposes `tokensVersion: 2`: 23 colour tokens per side
(the 7, plus code background and text, a colour per heading level, and 8
semantic colours used by callouts and the oracle), and structural choices
from closed lists (surface mode, heading style, table style, tag style,
radius), every new token optional with a fallback derived from the 7; an
`inspiredBy` credit; and 36 themes extracted from the most popular Obsidian
community themes.

The check of the specification against the sources found:

- **Licences.** The specification gives MIT for all 36; it is wrong for
  many. GPL-3.0: AnuPpuccin, Primary, Velocity, Fancy-a-Story, Typewriter.
  GPL-2.0: ITS Theme. MPL-2.0: Yin and Yang. Unlicense: Atom, Obsidianotion
  ("Sky"), Red Graphite. No licence: the Ayu repositories; Gruvbox's states
  MIT/X11 only in its README.
- **Existence.** The 36 entries are 28 repositories: ITS "WotC D&D" is a
  setting of ITS Theme; the three Catppuccin entries are one theme;
  Everforest, Solarized, Ayu and E-Ink are colour schemes inside Minimal
  (hence Minimal's star count on them). "Rosé Pine" is credited to another
  theme (Underwater); Dracula's star count is not the official repository's.
- **Colours.** 14 entries match the theme's CSS or the palette's official
  values; 14 match in part; 5 (Border, Velocity, Yin and Yang, Red Graphite,
  Shiba Inu) look invented. Dracula's light side is invented (Dracula has
  no official light theme).
- **Against Verso's code.** The 3:1 floor, the 4.5:1 warning, the 16 KB
  limit and the font keys match; extending the contrast pairs to headings
  and code would make some of the proposed themes fail the floor (AnuPpuccin
  light and Solarized light `--h5-color`); `inspiredBy` uses two different
  key names in the document; `--sb-*` and `--orc-*` exist already with other
  values or in another file.

So the direction is sound and the data is not: no value from the
specification is used without being taken again from its source.

## Decision

Status **Accepted (2026-10-28)** *(history: Proposed until then)*.
`[DECIDED]` items are the maintainer's words above; `[OPEN]` items are his to
answer; items marked `[PROPOSED]` were the author's recommendation, accepted as
built on 2026-10-28.

1. **"More themes…" opens the full list.** `[DECIDED 2026-10-22]` Settings ›
   Appearance › Themes keeps its short gallery; a button **"Mais temas…"** /
   **"More themes…"** opens a window listing every theme Verso ships, the
   catalogue included. `[DECIDED 2026-10-28 — accepted as built]` The window has a search field, filters
   (light / dark / both; style: tonal, flat, cards), cards drawn with each
   theme's own tokens as the gallery's are, and the credit line of each; a
   click applies the theme as a gallery card does; on the phone it is a full
   screen with a back control.

2. **More tokens, in the theme and in the builder.** `[DECIDED 2026-10-22]`
   *(Note, 2026-10-28: the structural keys listed in option A below are the
   first decision's. The decided set is the one in the "Status" section's later
   paragraphs — "Decided 2026-10-22, later" (TM.4 = B) and "after the
   horizontal rule" — which makes **sixteen structural keys**. The text below is
   kept as history.)*
   in direction (his words above); how far `[DECIDED 2026-10-22]`: option
   A (TM.1, the maintainer marked the recommended option):
   - **A — The specification's `tokensVersion: 2`:** the 7 base colours,
     code background and text, `--h1-color`…`--h6-color`, 8 semantic colours
     (red, orange, yellow, green, cyan, blue, purple, pink — used by
     callouts, the oracle and statblocks), and the structural choices
     surface mode, heading style, table style, tag style and radius; all
     optional, derived from the base when absent; version 1 files stay
     valid. _(recommended)_
   - **B — Colours only** (the 23), no structural choices.
   - **C — A shorter set:** headings as one colour, code, and the semantic
     colours.

3. **Contrast covers the new tokens.** `[DECIDED 2026-10-28 — accepted as built]` The floor (3:1, undone
   or refused) and the warning (4.5:1) extend to code text on code
   background and to each heading colour on the page; a catalogue theme that
   fails the floor is corrected before it ships (the nearest colour that
   passes), and the correction is said in its credit line.

4. **The builder shows the new tokens.** `[DECIDED 2026-10-28 — accepted as built]` Grouped — Base,
   Headings, Code, Callout colours, Structure — each group folded until
   opened, with the live preview and the contrast warnings as today; on the
   phone, one group at a time.

5. **A credit for a theme inspired by another.** `[DECIDED 2026-10-28 — accepted as built]` An optional
   `inspiredBy` object in the file — `theme`, `author`, `repoUrl`,
   `license`, bounded strings, `https` only, never fetched — shown under the
   card and in the builder ("Inspirado em Minimal, de Steph Ango (MIT)"),
   kept when a theme is copied.

6. **Which themes ship.** `[DECIDED 2026-10-22]` Option A (TM.2, marked by
   the maintainer):
   - **A — Only from permissive or compatible licences, colours re-taken
     from the source.** Themes under MIT, Unlicense or MPL-2.0, and open
     palettes with an official specification (Catppuccin, Nord, Dracula
     dark, Rosé Pine, Everforest, Gruvbox, Tokyo Night, Solarized, Flexoki,
     Ayu's official palette), each value taken again from the theme's CSS or
     the palette's specification, credited. Not shipped: the GPL themes
     (AnuPpuccin — its palette is Catppuccin, which ships —, Primary,
     Velocity, Fancy-a-Story, Typewriter, ITS Theme) and repositories with
     no licence. _(recommended)_
   - **B — Every theme of the list, colours re-taken from the source,** the
     GPL ones included as colour values only, with credit — colours and
     font choices, not CSS; whether that is enough for a copyleft licence is
     a judgement for the maintainer.
   - **C — Only the open palettes,** none of the Obsidian themes.

7. **Names.** `[DECIDED 2026-10-22]` Option A (TM.3, marked by the
   maintainer):
   - **A — An open palette keeps its name** (Catppuccin Mocha, Nord,
     Dracula, Solarized…), following the palette's own porting guidelines
     where it has them; **a theme derived from an Obsidian theme keeps its
     name with the credit** ("Minimal", "Inspirado em Minimal, de Steph
     Ango"); a name that is a trademark of a third party is not used (the
     ITS "WotC D&D" variant; "LYT" is renamed). _(recommended)_
   - **B — Verso's own names for all,** the original only in the credit.

8. **Where the catalogue lives.** `[DECIDED 2026-10-28 — accepted as built]` As `.verso-theme` files
   shipped with the window (read like an imported theme, so a shipped theme
   is never more powerful than one a person imports), each with its source
   URL, licence and the commit or version its colours were taken from, listed
   in `docs/reference/` and on the Credits page.

9. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)).
   `[DECIDED 2026-10-28 — accepted as built]` The window is a dialog with a heading, its search labelled,
   its cards buttons with the theme's name and mode; the contrast rules of
   item 3 hold for every shipped theme; pt-BR and English.

## Consequences

- `app/ui/src/theme/` gains the version-2 reading and writing, the derived
  values, the extended contrast pairs, the builder's groups, the "More
  themes" window and the catalogue files; `css/` consumes the new tokens
  (headings, code, callouts, tables, tags, radius, surfaces) with the
  version-1 look unchanged when they are absent.
- [0100](0100-visual-customization-wizard.md) gets a Revisions line: its item
  3 (`tokensVersion: 1`) is extended, not replaced.
- Each shipped theme passes the floor in both modes; a test reads every
  catalogue file with the same reader as an import.

## Discarded alternatives

None recorded. Listing every theme in the gallery itself was named by the
maintainer as what to avoid ("mega poluída"); it is the problem item 1
answers, not an alternative that was weighed.

## Status

**Accepted (2026-10-28).** The maintainer, 2026-10-28, on ADRs 0108 and 0109:
*"Aceitar as duas"*. The remaining `[PROPOSED]` items are accepted as built.

Proposed (2026-10-22), until then. Items 2, 6 and 7 decided by the maintainer the same
day (`~/Projects/person/apps/verso-archive/decisoes-2026-10/verso-decisoes-0109-temas-2026-10-22.md`,
options A); the `[PROPOSED]` items stay the author's until accepted. Being
built; waits for a reading by the other model.

Decided 2026-10-22, later (`~/Projects/person/apps/verso-archive/decisoes-2026-10/verso-decisoes-temas-fidelidade-2026-10-22.md`),
after the maintainer saw that the catalogue did not look like its originals
(*"tá a mesma fonte do nosso… não tá mudando tanta coisa"*) and a side-by-side
comparison: **TM.4 = B** — ten more structural keys, closed lists, no CSS:
heading scale, heading weight, line width, line height, blockquote style,
link style, emphasis colour, checkbox style, paragraph spacing and callout
style (option A was the first four only; C, the heading two only);
**TM.5 = A** — "Ayu" is the official MIT palette with the catalogue's
default font, not the unlicensed old Obsidian theme; **TM.6 = A** — "Things"
and "Atom" keep their names with the credit. Also recorded: every font a
theme uses must render Portuguese in full (accents, cedilla, ª º, quotes,
dashes) — the maintainer: *"o foco principal vai ser a aplicação atender
público brasileiro"*; the five font keys were checked and pass.

Decided 2026-10-22, last: a catalogue theme whose CSS declares no line width or
line height takes Obsidian's defaults (a 700 px column, line height 1.5) —
`line-width: narrow`, `line-height: snug` — so it looks as its original does in
Obsidian (the maintainer, option A: *"A então"*; B was to keep the window's own).

Decided 2026-10-22, after the horizontal rule: the maintainer saw that the
catalogue's themes still drew one rule, a line with three asterisks (⁂), and
said *"Tem uma coisa que esses temas não estão customizando, que é a linha
horizontal. Vários desses temas têm uma linha horizontal customizada e a gente
está usando a mesma coisa, que é uma linha horizontal e três asteriscos, que em
algum momento a gente fez isso e nunca mudou."* One more structural key,
`hr-style`, a closed list — `asterism` (the window's own, writes nothing),
`line` (Obsidian's plain 2px rule), `thin` (1px) and `fade` (a rule that fades
at both ends) — and one optional colour, `--hr-color` (the hair colour without
one), both for the reading view and Live Preview; the values are only the ones
the originals use (survey in `docs/reference/theme-catalogue.md`). Sixteen
structural keys now.
