# Theme catalogue

The themes Verso ships behind "More themes…" (ADR 0109, items 6, 7 and 8): `.verso-theme` files under `app/ui/themes/catalogue/`, read by the same reader as an imported theme. Each one was taken again from its source — the palette's own specification, or the theme's CSS at a pinned commit — and none carries CSS, a font file or a request: only colours, the closed font keys and the structural choices of `tokensVersion` 2.

`node scripts/check-theme-catalogue.mjs` (a step of `scripts/check.sh`) holds this page to the files: every theme must be listed here with its SHA-256, credit a licence on the allowlist and pass the 3:1 contrast floor in both modes.

## Rules

- Only themes whose repository licence is MIT, Unlicense or MPL-2.0, and open palettes with an official specification (ADR 0109 item 6, option A, decided 2026-10-22). Not shipped: the GPL themes and repositories with no licence.
- Every value is re-taken from the source named below; nothing is copied from the expanded-themes draft (its colours were found partly invented).
- Names (item 7, option A): an open palette keeps its name, an Obsidian-derived theme keeps its own with the credit; a name that is a third party's mark is not used.
- A colour under 3:1 against its page is replaced by the nearest colour of the same hue and saturation that passes, and the correction is listed under the theme.
- Fonts are Verso's closed keys; no font file is shipped. A structural choice (surface mode, radius, table, tag, heading style) is set only where the theme clearly has that character; its source is listed under each theme as "Structural sources".
- Typography follows the theme's CSS: the body font family goes to the closest closed key (Obsidian's system sans to `system`; Inter and DM Sans to `sans`; Vollkorn, Bookerly and Georgia to `editorial`), the size is the theme's own `--font-text-size` (Obsidian's 16 where it sets none), and a heading colour per level is written where the theme sets one. The Ayu entries keep the catalogue's default fonts: the Obsidian Ayu theme (24px, serif) is unlicensed and is not the target; the maintainer decides later.

## Mapping

Obsidian variables map to Verso tokens: `--background-primary` to `--paper`, `--background-secondary` to `--paper-2`, `--background-modifier-border` to `--hair`, `--text-normal` to `--ink`, `--text-muted` to `--ink-2`, `--text-accent` (or `--interactive-accent`) to `--seal`, the first heading colour to `--brass-ink` (the text colour when the theme sets none), `--code-background` and `--code-normal` to `--code-paper` and `--code-ink`, `--h1-color` to `--h6-color` as they are, `--color-red` to `--color-pink` to the semantic tokens. Variables defined as chains (`hsl(var(--x) …)`, `calc()`) were resolved to their final colour with a small resolver over the theme's CSS and written as `#rrggbb`; where the theme leans on Obsidian's documented defaults (`--background-primary` is `--color-base-00`, `--color-accent` is the accent HSL), those relations were applied. A token the theme does not set is omitted, and Verso derives it.

Palettes map by role: page, panel, line, text, muted text, link, headline, code, and the accent row to the semantic tokens; the per-theme notes say which.

## Contrast

The pairs checked in both modes are `--ink`, `--ink-2`, `--seal` and `--brass-ink` on `--paper`, `--code-ink` on `--code-paper` (on `--paper-2` when the theme sets no code background) and each `--hN-color` on `--paper`. The floor is 3:1 (ADR 0109 item 3); the 4.5:1 warning is the builder's, not the catalogue's, and several palettes sit between the two by design.

## Porting guidelines

- **Catppuccin** (`docs/port-creation.md`, `docs/style-guide.md` at catppuccin/catppuccin): ports are adaptations of the palette; the guide assigns Base for the page, Mantle and Crust for panels, Text for body and headline, Subtext 0 / 1 for sub-headlines and labels, Overlay 1 for subtle text, Blue for links and the accent colours for status. Contributions are published under MIT. The official-port rules (repository under the organisation, `catppuccin/<app>`, a Port Review) concern repositories, not a theme file inside another app; Verso's files credit the palette and do not present themselves as an official port. The names are the four flavours' own.
- **Dracula** (`README.md` and https://draculatheme.com/spec): "use exact colour values from this specification", keep a 4.5:1 text contrast, subtle borders in Current Line, status colours Green / Orange / Red / Cyan, a purple focus ring. MIT, (c) Dracula Theme. The org's submission process (a repository from its template) concerns official ports; Verso's file is a credited adaptation, not one. No trademark policy was found; the name is used as the palette's.
- **Flexoki** (`README.md`): MIT, and ports should "include attribution and a link to stephango.com/flexoki" — carried in the credit's author line.
- The other palettes (Nord, Rosé Pine, Everforest, Gruvbox, Solarized, Tokyo Night, Ayu) state no porting rules beyond their MIT licence; their copyright holders are in each entry.

## Themes

### Catppuccin Latte

- File: `catppuccin-latte.verso-theme` (mode light) — SHA-256: `9ba5aafc9f8342580db50666877ed6b01615e9a6533cebf4448300c39d4da339`
- Credit in the file: Catppuccin Latte, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Structural choices: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: hover`, `emphasis-color: semantic`, `hr-style: line`, `--hr-color`
- Structural sources: Vollkorn (a book serif; headings use the body font): the closest book serif key, `editorial` (Literata) for body and headings; `font-size: 16`; every heading in the accent colour, Mauve (catppuccin/obsidian theme.css), so `--h1-color`…`h6` are the Mauve of this flavour; 1px table grid: `bordered`; accent-coloured pill tag: `pill`; radii 4/8/10px: `soft`. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's h1 2em, repeated in theme.css; `line-width: narrow`, `--file-line-width: 700px`, near `narrow`; `line-height: snug`, `--line-height-normal: 1.5`; `blockquote-style: bar`, a 2px accent bar, upright (look profile 3.1); `link-style: hover`, underline only on hover (look profile 3.1); `emphasis-color: semantic`, bold in Sapphire, italic in Green (look profile 3.1): `semantic` is the theme's cyan for bold and green for italic, the nearest pair. Horizontal rule (`---`, decided 2026-10-22): theme.css sets `--hr-color: rgb(var(--ctp-blue))` over Obsidian's 2px `--hr-thickness`: `line`, `--hr-color` Blue.
- Contrast adjustments: none

### Catppuccin Frappé

- File: `catppuccin-frappe.verso-theme` (mode dark) — SHA-256: `bc2d01eae322854b3d732214ff766a87abdcfae796b82a71ab5a42dddc8fa0b5`
- Credit in the file: Catppuccin Frappé, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Structural choices: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: hover`, `emphasis-color: semantic`, `hr-style: line`, `--hr-color`
- Structural sources: Vollkorn (a book serif; headings use the body font): the closest book serif key, `editorial` (Literata) for body and headings; `font-size: 16`; every heading in the accent colour, Mauve (catppuccin/obsidian theme.css), so `--h1-color`…`h6` are the Mauve of this flavour; 1px table grid: `bordered`; accent-coloured pill tag: `pill`; radii 4/8/10px: `soft`. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's h1 2em, repeated in theme.css; `line-width: narrow`, `--file-line-width: 700px`, near `narrow`; `line-height: snug`, `--line-height-normal: 1.5`; `blockquote-style: bar`, a 2px accent bar, upright (look profile 3.1); `link-style: hover`, underline only on hover (look profile 3.1); `emphasis-color: semantic`, bold in Sapphire, italic in Green (look profile 3.1): `semantic` is the theme's cyan for bold and green for italic, the nearest pair. Horizontal rule (`---`, decided 2026-10-22): theme.css sets `--hr-color: rgb(var(--ctp-blue))` over Obsidian's 2px `--hr-thickness`: `line`, `--hr-color` Blue.
- Contrast adjustments: none

### Catppuccin Macchiato

- File: `catppuccin-macchiato.verso-theme` (mode dark) — SHA-256: `94e5698be1a37cf7e0a13c427cf4efc0d2f927924af1eeb9433dac34a4a3be57`
- Credit in the file: Catppuccin Macchiato, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Structural choices: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: hover`, `emphasis-color: semantic`, `hr-style: line`, `--hr-color`
- Structural sources: Vollkorn (a book serif; headings use the body font): the closest book serif key, `editorial` (Literata) for body and headings; `font-size: 16`; every heading in the accent colour, Mauve (catppuccin/obsidian theme.css), so `--h1-color`…`h6` are the Mauve of this flavour; 1px table grid: `bordered`; accent-coloured pill tag: `pill`; radii 4/8/10px: `soft`. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's h1 2em, repeated in theme.css; `line-width: narrow`, `--file-line-width: 700px`, near `narrow`; `line-height: snug`, `--line-height-normal: 1.5`; `blockquote-style: bar`, a 2px accent bar, upright (look profile 3.1); `link-style: hover`, underline only on hover (look profile 3.1); `emphasis-color: semantic`, bold in Sapphire, italic in Green (look profile 3.1): `semantic` is the theme's cyan for bold and green for italic, the nearest pair. Horizontal rule (`---`, decided 2026-10-22): theme.css sets `--hr-color: rgb(var(--ctp-blue))` over Obsidian's 2px `--hr-thickness`: `line`, `--hr-color` Blue.
- Contrast adjustments: none

### Catppuccin Mocha

- File: `catppuccin-mocha.verso-theme` (mode dark) — SHA-256: `b83a37d9cdc14143f4ce85709b9f3fbb60668ffc9bb01e703d2160b6d2221f7e`
- Credit in the file: Catppuccin Mocha, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Structural choices: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: hover`, `emphasis-color: semantic`, `hr-style: line`, `--hr-color`
- Structural sources: Vollkorn (a book serif; headings use the body font): the closest book serif key, `editorial` (Literata) for body and headings; `font-size: 16`; every heading in the accent colour, Mauve (catppuccin/obsidian theme.css), so `--h1-color`…`h6` are the Mauve of this flavour; 1px table grid: `bordered`; accent-coloured pill tag: `pill`; radii 4/8/10px: `soft`. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's h1 2em, repeated in theme.css; `line-width: narrow`, `--file-line-width: 700px`, near `narrow`; `line-height: snug`, `--line-height-normal: 1.5`; `blockquote-style: bar`, a 2px accent bar, upright (look profile 3.1); `link-style: hover`, underline only on hover (look profile 3.1); `emphasis-color: semantic`, bold in Sapphire, italic in Green (look profile 3.1): `semantic` is the theme's cyan for bold and green for italic, the nearest pair. Horizontal rule (`---`, decided 2026-10-22): theme.css sets `--hr-color: rgb(var(--ctp-blue))` over Obsidian's 2px `--hr-thickness`: `line`, `--hr-color` Blue.
- Contrast adjustments: none

### Nord

- File: `nord.verso-theme` (mode dark) — SHA-256: `ff2ca311005d4e546e8af093789b57ff13ffc86b2981b4db64318d26847d2f79`
- Credit in the file: Nord, Sven Greb (Arctic Ice Studio), MIT
- Source: https://github.com/nordtheme/nord/blob/1cef71605416a222e57225b544540ce0fcec18d4/src/nord.css
- Commit or tag: 1cef71605416a222e57225b544540ce0fcec18d4 (develop, tag v0.2.0 is older)
- Licence: MIT, (c) 2016-present Sven Greb
- Author: Sven Greb
- Mapping: Polar Night nord0 / nord1 / nord2 for page, panels and lines; nord4 text; links in Frost nord8, headings nord9; the Aurora colours for the semantic ones (no pink in the palette: omitted). Nord has no light palette, so none is shipped. ink-2 is nord3, the palette's comment colour.
- Structural choices: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `table-style: striped`, `tag-style: pill`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: plain`, `hr-style: line`
- Structural sources: System sans (`system`), Hack mono (`mono`), `font-size: 16`; heading colours are the theme's `--h1-color`…`h6` = red, yellow, green, purple, frost0, frost2; striped tables: `striped`; tag pill (.5em): `pill`. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's default h1 (2em); the theme sets none (look profile 3.5); `blockquote-style: bar`, Obsidian's default bar (look profile 1); `link-style: plain`, no underline (look profile 3.5). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): the source styles no rule: Obsidian's own (2px in the border colour), `line`.
- Contrast adjustments: dark `--ink-2` `#4c566a` → `#6f7d98` (3.01:1, adjusted for contrast)

### Dracula

- File: `dracula.verso-theme` (mode dark) — SHA-256: `f1a0ae3a24eba94f911cdee71b124bd2d50e107b90cba4350fc95e04dab842f7`
- Credit in the file: Dracula, Zeno Rocha, MIT
- Source: https://github.com/dracula/dracula-theme/blob/e22ebcc048b8aff586f9bc94db30ff5347070b42/README.md and https://draculatheme.com/spec (UI palette, read 2026-10-22)
- Commit or tag: e22ebcc048b8aff586f9bc94db30ff5347070b42 (tag v1.2.5 is older)
- Licence: MIT, (c) 2023 Dracula Theme
- Author: Zeno Rocha
- Mapping: Background, Foreground, Comment, Current Line and the functional colours from the README palette; "Background Dark" #21222C and "Floating interactive elements" #343746 from the spec's UI table. Borders use Current Line, as the spec's component guidelines say. Dracula's spec has no Blue, so --blue is the Purple (the spec maps ANSI blue to it). The spec asks for 4.5:1 text contrast and "exact colour values"; the comment colour used for ink-2 is under 4.5:1 and is corrected only to the 3:1 floor, if needed.
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `radius: soft`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: plain`, `hr-style: line`, `--hr-color`
- Structural sources: The theme sets no font (Obsidian's system sans: `system`); `font-size: 16` is Obsidian's own default (`--font-text-size`); the theme does not change it; the six heading colours are the theme's `--text-title-h1`…`h6` (#bd93f9, #ffb86c, #50fa7b, #ff5555, #f1fa8c, #bd93f4); code blocks with 4px radius: `soft`. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's default h1 (2em); the theme sets none (look profile 3.2); `blockquote-style: bar`, a plain bar (`#b294bb`) on upright text (look profile 3.2); `link-style: plain`, no underline (look profile 3.2). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): theme.css sets the rule's background and border to `--text-normal`: `line`, `--hr-color` the text colour.
- Contrast adjustments: none

### Dracula Alucard

- File: `dracula-alucard.verso-theme` (mode light) — SHA-256: `1981c2f460f77da9daf3fe3058b74b0c74dbbbbd307419818cee2caa447b84da`
- Credit in the file: Dracula Alucard, Zeno Rocha, MIT
- Source: https://github.com/dracula/dracula-theme/blob/e22ebcc048b8aff586f9bc94db30ff5347070b42/README.md and https://draculatheme.com/spec (Alucard UI palette)
- Commit or tag: e22ebcc048b8aff586f9bc94db30ff5347070b42
- Licence: MIT, (c) 2023 Dracula Theme
- Author: Zeno Rocha
- Mapping: Dracula's own light palette, Alucard (README "Alucard" table and the spec's UI table); it is not an invented light for Dracula. Same mapping as Dracula; Verso names it "Dracula Alucard" to say whose palette it is.
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `radius: soft`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: plain`, `hr-style: line`, `--hr-color`
- Structural sources: Same structure as Dracula (the theme sets no font, Obsidian's defaults); heading colours by Dracula's role order (purple, orange, green, red, yellow, purple) in this palette's own light equivalents. Alucard is not in the Obsidian theme, so the order is Dracula's, not Alucard's. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's default h1 (2em); the theme sets none (look profile 3.2); `blockquote-style: bar`, a plain bar (`#b294bb`) on upright text (look profile 3.2); `link-style: plain`, no underline (look profile 3.2). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): theme.css sets the rule's background and border to `--text-normal`: `line`, `--hr-color` the text colour.
- Contrast adjustments: none

### Rosé Pine

- File: `rose-pine.verso-theme` (mode both) — SHA-256: `e472b5a000acaeff02a22ad4daf0d6395cdf13bb645dabb6994a9717e4c99d0a`
- Credit in the file: Rosé Pine, Rosé Pine, MIT
- Source: https://github.com/rose-pine/palette/blob/92af52b465ab6e47437aca223c9b8d3009a2023b/palette.json
- Commit or tag: 92af52b465ab6e47437aca223c9b8d3009a2023b (tag v4.0.1)
- Licence: MIT, (c) mvllow
- Author: Rosé Pine
- Mapping: Base / Surface / Overlay for page, panels and lines; Text and Subtle for text; Iris for links, Rose for headings; Love, Gold, Foam, Pine, Iris and Rose for red, yellow, cyan, blue, purple and pink. Rosé Pine has no orange or green: left to Verso's own. Dark is Rosé Pine (main), light is Dawn.
- Structural choices: `--heading-font: sans`, `--book: editorial`, `font-size: 18`, `heading-weight: regular`, `line-width: narrow`, `line-height: snug`, `blockquote-style: panel`, `emphasis-color: accent`, `hr-style: fade`, `--hr-color`
- Structural sources: Inter for editing and headings: `sans`; Georgia for reading: the closest book serif key, `editorial` (its stack ends in Georgia); `font-size: 18` (theme.css `--font-text-size`); heading colours are `--rp-h1`…`h6` = love, iris, rose, gold, foam, pine (here red, purple, pink, yellow, cyan, blue). The light side's pink and gold were corrected for contrast. New keys (ADR 0109, TM.4 = B): `heading-weight: regular`, headings at weight 500 (look profile 3.3), nearer `regular` than `semibold`; `blockquote-style: panel`, a panel on the code background with a 4px bar, italic (look profile 3.3); `emphasis-color: accent`, italic in Iris (look profile 3.3): `accent` is Iris here (`--seal`); it colours bold too, which the original does not. Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): theme.css draws a 0.35rem rule with a gradient from transparent through gold, love, rose, iris and foam back to transparent: `fade`, `--hr-color` Gold (the gradient's first colour; the rainbow itself is not a closed value).
- Contrast adjustments: light `--brass-ink` `#d7827e` → `#d2726d` (3.02:1, adjusted for contrast); light `--h3-color` `#d7827e` → `#d2716c` (3.04:1, adjusted for contrast); light `--h4-color` `#ea9d34` → `#c77c15` (3.04:1, adjusted for contrast)

### Rosé Pine Moon

- File: `rose-pine-moon.verso-theme` (mode dark) — SHA-256: `d0a245eb45ed26a66ee491b1a3902213770b2478027a2be3e2a1e1a8b441fbe2`
- Credit in the file: Rosé Pine Moon, Rosé Pine, MIT
- Source: https://github.com/rose-pine/palette/blob/92af52b465ab6e47437aca223c9b8d3009a2023b/palette.json
- Commit or tag: 92af52b465ab6e47437aca223c9b8d3009a2023b (tag v4.0.1)
- Licence: MIT, (c) mvllow
- Author: Rosé Pine
- Mapping: Base / Surface / Overlay for page, panels and lines; Text and Subtle for text; Iris for links, Rose for headings; Love, Gold, Foam, Pine, Iris and Rose for red, yellow, cyan, blue, purple and pink. Rosé Pine has no orange or green: left to Verso's own.
- Structural choices: `--heading-font: sans`, `--book: editorial`, `font-size: 18`, `heading-weight: regular`, `line-width: narrow`, `line-height: snug`, `blockquote-style: panel`, `emphasis-color: accent`, `hr-style: fade`, `--hr-color`
- Structural sources: Inter for editing and headings: `sans`; Georgia for reading: the closest book serif key, `editorial` (its stack ends in Georgia); `font-size: 18` (theme.css `--font-text-size`); heading colours are `--rp-h1`…`h6` = love, iris, rose, gold, foam, pine (here red, purple, pink, yellow, cyan, blue). New keys (ADR 0109, TM.4 = B): `heading-weight: regular`, headings at weight 500 (look profile 3.3), nearer `regular` than `semibold`; `blockquote-style: panel`, a panel on the code background with a 4px bar, italic (look profile 3.3); `emphasis-color: accent`, italic in Iris (look profile 3.3): `accent` is Iris here (`--seal`); it colours bold too, which the original does not. Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): theme.css draws a 0.35rem rule with a gradient from transparent through gold, love, rose, iris and foam back to transparent: `fade`, `--hr-color` Gold (the gradient's first colour; the rainbow itself is not a closed value).
- Contrast adjustments: none

### Everforest

- File: `everforest.verso-theme` (mode both) — SHA-256: `3e79dd7e7649328e53ea7d013318dd2d5d9fb5c641cd7796fee695bbb6ec8887`
- Credit in the file: Everforest, sainnhe, MIT
- Source: https://github.com/sainnhe/everforest/blob/85a86eb62409e3ec88713bff3d1b9d7374e112e4/docs/palette.md
- Commit or tag: 85a86eb62409e3ec88713bff3d1b9d7374e112e4 (tag v0.3.0)
- Licence: MIT, (c) 2019 sainnhe
- Author: sainnhe
- Mapping: The palette's medium-contrast variant, dark and light. bg0 / bg1 / bg2 (dark) and bg0 / bg1 / bg4 (light) for the surfaces; fg for text, grey2 (dark) and grey1 (light) for muted text; green for links and yellow for headings; the accent row for the semantic colours (aqua is the cyan). The light accents are pale on the light page and several are corrected for contrast (see adjustments).
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: outline`, `heading-scale: large`, `heading-weight: regular`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `hr-style: line`
- Structural sources: System sans, 16px (`system`, `font-size: 16`, theme.css `--font-text-size`); heading colours are the theme's `--h1-color`…`--h6-color` (dim set in dark, light set in light: red, orange, yellow, green, aqua, purple); tags with an aqua 1px border: `outline`. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, h1 2.125em (look profile 3.7); `heading-weight: regular`, headings at weight 500 (look profile 3.7), nearer `regular`; `blockquote-style: bar`, Obsidian's default bar (look profile 1). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): the source styles no rule: Obsidian's own (2px in the border colour), `line`.
- Contrast adjustments: light `--ink-2` `#939f91` → `#849282` (3.03:1, adjusted for contrast); light `--seal` `#8da101` → `#859801` (3:1, adjusted for contrast); light `--brass-ink` `#dfa000` → `#ba8500` (3.02:1, adjusted for contrast); light `--h2-color` `#f57d26` → `#e8670b` (3.05:1, adjusted for contrast); light `--h3-color` `#bf983d` → `#ac8937` (3.05:1, adjusted for contrast); light `--h4-color` `#899c40` → `#84973e` (3.01:1, adjusted for contrast); light `--h5-color` `#569d79` → `#559b78` (3.07:1, adjusted for contrast)

### Gruvbox

- File: `gruvbox.verso-theme` (mode both) — SHA-256: `a398c29e80c04eee4b70b4554e4b09e4d15d61c54c6f669bf984432580e5f177`
- Credit in the file: Gruvbox, Pavel Pertsev (morhetz), MIT
- Source: https://github.com/gruvbox-community/gruvbox/blob/180ad85971343df68be3422a5630fa84e45a9ab2/colors/gruvbox.vim
- Commit or tag: 180ad85971343df68be3422a5630fa84e45a9ab2 (tag v3.6.1)
- Licence: MIT, (c) 2018 Pavel Pertsev (community fork; morhetz/gruvbox, the original, has no LICENSE file)
- Author: Pavel Pertsev (morhetz)
- Mapping: The palette and the dark/light role table of colors/gruvbox.vim: dark uses bg0 / bg1 / bg2, fg1 and fg4 with the bright accents; light uses light0 / light1 / light2, dark1 and dark4 with the faded accents. Links in blue, headings in yellow, as the vim script's Markdown groups do. The community fork is credited because the original repository carries no licence file.
- Structural choices: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `table-style: striped`, `tag-style: pill`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: plain`, `callout-style: outlined`, `hr-style: line`
- Structural sources: System sans (`system`), Hack Nerd Font mono (`mono`), `font-size: 16`; heading colours are the theme's `--h1-color`…`h6` = neutral red, yellow, green, aqua, blue, purple; tables with alternate rows: `striped`; tag pill (radius .5em): `pill`. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's default h1 (2em); the theme sets none (look profile 3.5); `blockquote-style: bar`, Obsidian's default bar (look profile 1); `link-style: plain`, no underline (look profile 3.5); `callout-style: outlined`, 1px border, opacity .4 (look profile 3.5). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): the source styles no rule: Obsidian's own (2px in the border colour), `line`.
- Contrast adjustments: dark `--h1-color` `#cc241d` → `#dc271f` (3.06:1, adjusted for contrast); light `--h2-color` `#d79921` → `#b6811c` (3.01:1, adjusted for contrast); light `--h3-color` `#98971a` → `#8f8e19` (3.06:1, adjusted for contrast); light `--h4-color` `#689d6a` → `#629764` (3.02:1, adjusted for contrast)

### Solarized

- File: `solarized.verso-theme` (mode both) — SHA-256: `0e9bef27a5de7f0d18f8284e1002e656eb6eb7646142fba47378f763cbf2ecd6`
- Credit in the file: Solarized, Ethan Schoonover, MIT
- Source: https://github.com/altercation/solarized/blob/62f656a02f93c5190a8753159e34b385588d5ff3/README.md ("The Values" table)
- Commit or tag: 62f656a02f93c5190a8753159e34b385588d5ff3 (tag v1.0.0beta1)
- Licence: MIT, (c) 2011 Ethan Schoonover
- Author: Ethan Schoonover
- Mapping: The 16 values of the README table, with Solarized's own light/dark role swap: base3 / base2 (light) and base03 / base02 (dark) for page and panels, base00 / base0 for body text, base1 / base01 for secondary content, blue for links, orange for headings; magenta is the pink and violet the purple. The secondary text colours are below the floor on the page (the palette is low contrast by design) and are corrected.
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: pill`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `hr-style: line`
- Structural sources: The theme sets no font (Obsidian's system sans: `system`) and `font-size: 16`; tag pill with the accent at 10–20%: `pill`. Only the code blocks' radius is `unset`, so `radius` stays the window's own. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's default h1 (2em); the theme sets none (look profile 3.4, 3.6); `blockquote-style: bar`, Obsidian's default bar (look profile 1). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): the source styles no rule: Obsidian's own (2px in the border colour), `line`.
- Contrast adjustments: light `--ink-2` `#93a1a1` → `#829292` (3.01:1, adjusted for contrast); dark `--ink-2` `#586e75` → `#5d747c` (3.04:1, adjusted for contrast)

### Flexoki

- File: `flexoki.verso-theme` (mode both) — SHA-256: `22b5591166fd7fbc7e68d9ccac87cb753e69f06f8e9594338d66e8fead4b3283`
- Credit in the file: Flexoki, Steph Ango (kepano), stephango.com/flexoki, MIT
- Source: https://github.com/kepano/flexoki/blob/8d723bac4a9ac46adfdf99d42155286977aac72a/README.md
- Commit or tag: 8d723bac4a9ac46adfdf99d42155286977aac72a (tag 2.0.0)
- Licence: MIT, (c) 2023 Steph Ango
- Author: Steph Ango
- Mapping: Flexoki's scale as its README gives it: paper / base-50 / base-100 and black / base-950 / base-900 for surfaces and lines, black and base-200 for text, base-600 and base-500 for muted text; the 600 accents on the light side and the 400 accents on the dark side; blue for links, orange for headings. Flexoki's README asks ports to "include attribution and a link to stephango.com/flexoki": the author line of the credit carries it and the Credits page must show it.
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `hr-style: line`
- Structural sources: The theme is only colour variables (1.9 KB): typography is Obsidian's default, `system` and `font-size: 16`. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's default h1 (2em); the theme sets none (look profile 3.4, 3.6); `blockquote-style: bar`, Obsidian's default bar (look profile 1). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): the source styles no rule: Obsidian's own (2px in the border colour), `line`.
- Contrast adjustments: none

### Tokyo Night

- File: `tokyo-night.verso-theme` (mode both) — SHA-256: `4b66e14777aa68af3c385872f19aebe076f8c5fbd137b572d776e76ba674eb45`
- Credit in the file: Tokyo Night, enkia (Tokyo Night VS Code theme), MIT
- Source: https://github.com/tokyo-night/tokyo-night-vscode-theme/blob/7c0f11eaef322f293621ca7befe462214b7ea468/themes/tokyo-night-color-theme.json and tokyo-night-light-color-theme.json
- Commit or tag: 7c0f11eaef322f293621ca7befe462214b7ea468
- Licence: MIT (LICENSE.txt)
- Author: enkia
- Mapping: Colours: read from the two VS Code colour themes (editor and side-bar backgrounds, editor and description text, the link colour, the text-code-block background, the inline-code colour); the ANSI colours for red, yellow, green, cyan, blue and purple. The six heading colours are not the VS Code Markdown ones but the Obsidian theme's order (red, yellow, green, cyan, blue, magenta) over those ANSI colours. Dark is "Tokyo Night", light is the theme's own light variant.
- Structural choices: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `tag-style: pill`, `radius: soft`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: panel`, `emphasis-color: semantic`, `checkbox-style: round`, `hr-style: line`
- Structural sources: System sans (the declared JetBrains Mono default font is not used by the theme): `system`, JetBrains mono: `mono`, `font-size: 16`; heading colours are the Obsidian theme's `--h1-color`…`h6` = red, yellow, green, cyan, blue, magenta, taken in this file's palette values; magenta tag pill: `pill`; callout radius 4px: `soft`. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's default h1 (2em); the theme sets none (look profile 3.8); `blockquote-style: panel`, quote on a darker background (look profile 3.8); `emphasis-color: semantic`, bold and italic both cyan (look profile 3.8): `semantic` gives the theme's cyan bold and green (teal) italic, the nearest; `checkbox-style: round`, checkbox radius 12px (look profile 3.8). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): the source styles no rule: Obsidian's own (2px in the border colour), `line`.
- Contrast adjustments: none

### Ayu Light

- File: `ayu-light.verso-theme` (mode light) — SHA-256: `06206165d3ee0635fd88138ca2545ab49a10da698801dd94e1c0647379e5a1eb`
- Credit in the file: Ayu Light, Konstantin Pschera, MIT
- Source: https://github.com/ayu-theme/ayu-colors/blob/d461f02983546636bc6e1e0c48190fdb74036426/themes/light.yaml
- Commit or tag: d461f02983546636bc6e1e0c48190fdb74036426 (tag v8.0.1)
- Licence: MIT, (c) Konstantin Pschera
- Author: Konstantin Pschera
- Mapping: The YAML theme's own values: editor background (surface lift) for the page, surface base for panels, editor and UI foregrounds for text, the accent tint for links, the palette orange for headings, ui.line (or surface sunk) for lines; palette red, orange, yellow, green, teal (cyan), blue and purple. Ayu's palette has no pink of its own: omitted. Values the YAML derives with colour expressions (syntax roles) are not used.
- Structural choices: `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `hr-style: line`
- Structural sources: Palette entry; the keys are set where its CSS or the look profile says so (ADR 0109, TM.4 = B): `heading-scale: large`, h1 1.9em (look profile 3.9), nearer `large` (2.1em) than `standard` (1.65em); line height 1.7 and weight 600 are Verso's own, so left unset. Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): the official palette has no rule and Ayu ships with the default font (TM.5): Obsidian's own, `line` (the old Ayu themes drew a 0.1px, half-width rule; not shipped).
- Contrast adjustments: light `--seal` `#f29718` → `#d27f0c` (3.02:1, adjusted for contrast); light `--brass-ink` `#fa8532` → `#f36806` (3.01:1, adjusted for contrast)

### Ayu Mirage

- File: `ayu-mirage.verso-theme` (mode dark) — SHA-256: `6fb4229ba46a2f253d4c4569ac051106c65c0a5be2a12f3fe5f17e007d89e9f2`
- Credit in the file: Ayu Mirage, Konstantin Pschera, MIT
- Source: https://github.com/ayu-theme/ayu-colors/blob/d461f02983546636bc6e1e0c48190fdb74036426/themes/mirage.yaml
- Commit or tag: d461f02983546636bc6e1e0c48190fdb74036426 (tag v8.0.1)
- Licence: MIT, (c) Konstantin Pschera
- Author: Konstantin Pschera
- Mapping: The YAML theme's own values: editor background (surface lift) for the page, surface base for panels, editor and UI foregrounds for text, the accent tint for links, the palette orange for headings, ui.line (or surface sunk) for lines; palette red, orange, yellow, green, teal (cyan), blue and purple. Ayu's palette has no pink of its own: omitted. Values the YAML derives with colour expressions (syntax roles) are not used.
- Structural choices: `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `hr-style: line`
- Structural sources: Palette entry; the keys are set where its CSS or the look profile says so (ADR 0109, TM.4 = B): `heading-scale: large`, h1 1.9em (look profile 3.9), nearer `large` (2.1em) than `standard` (1.65em); line height 1.7 and weight 600 are Verso's own, so left unset. Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): the official palette has no rule and Ayu ships with the default font (TM.5): Obsidian's own, `line` (the old Ayu themes drew a 0.1px, half-width rule; not shipped).
- Contrast adjustments: none

### Ayu Dark

- File: `ayu-dark.verso-theme` (mode dark) — SHA-256: `23284e288c84e27840a295740cf1c28ffa31f4020ad6eb84f85417698e0abb20`
- Credit in the file: Ayu Dark, Konstantin Pschera, MIT
- Source: https://github.com/ayu-theme/ayu-colors/blob/d461f02983546636bc6e1e0c48190fdb74036426/themes/dark.yaml
- Commit or tag: d461f02983546636bc6e1e0c48190fdb74036426 (tag v8.0.1)
- Licence: MIT, (c) Konstantin Pschera
- Author: Konstantin Pschera
- Mapping: The YAML theme's own values: editor background (surface lift) for the page, surface base for panels, editor and UI foregrounds for text, the accent tint for links, the palette orange for headings, ui.line (or surface sunk) for lines; palette red, orange, yellow, green, teal (cyan), blue and purple. Ayu's palette has no pink of its own: omitted. Values the YAML derives with colour expressions (syntax roles) are not used.
- Structural choices: `--heading-font: system`, `--book: system`, `heading-scale: large`, `line-height: snug`, `line-width: narrow`, `blockquote-style: bar`, `hr-style: line`
- Structural sources: Palette entry; the keys are set where its CSS or the look profile says so (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's default h1 (2em); the theme sets none (look profile 3.9); `line-height: snug`, line height 1.5 (look profile 3.9); `blockquote-style: bar`, Obsidian's default bar (look profile 1). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` — the theme's CSS sets no `--file-line-width`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): the official palette has no rule and Ayu ships with the default font (TM.5): Obsidian's own, `line` (the old Ayu themes drew a 0.1px, half-width rule; not shipped).
- Contrast adjustments: none

### Minimal

- File: `minimal.verso-theme` (mode both) — SHA-256: `d55a6c6af0da8f848bebca73aa628057191403e3de02eb7aee2cddce192c4938`
- Credit in the file: Minimal, Steph Ango (kepano), MIT
- Source: https://github.com/kepano/obsidian-minimal/blob/93321bdc23fc879966e1e3aa0cfeda77012f540f/theme.css
- Commit or tag: 93321bdc23fc879966e1e3aa0cfeda77012f540f
- Licence: MIT, (c) 2020-2024 Steph Ango
- Author: Steph Ango (kepano)
- Mapping: The default colour scheme (minimal-default-light / minimal-default-dark) with the theme's own base and accent variables resolved; Minimal sets no heading or code colours of its own in that scheme, so the headline is the text colour and the code colours are left to Verso.
- Structural choices: `surface-mode: flat`, `--heading-font: system`, `--book: system`, `font-size: 16`, `table-style: hairline`, `tag-style: minimal`, `radius: soft`, `heading-scale: compact`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: plain`, `paragraph-spacing: loose`, `callout-style: outlined`, `hr-style: line`
- Structural sources: System sans for body and headings (`system`), 16px, the flat sidebar (`surface-mode: flat`), tags as plain text with no fill or border (`tag-style: minimal`), a table with a small header and no outer borders (`hairline`), Obsidian radii (`soft`). New keys (ADR 0109, TM.4 = B): `heading-scale: compact`, h1 at 1.125em (`--h1-size`); `line-width: narrow`, `--line-width: 40rem`; `line-height: snug`, `--line-height: 1.5`; `blockquote-style: bar`, a 1px bar on muted upright text (`--blockquote-border-thickness: 1px`); `link-style: plain`, `--link-decoration: none`; `paragraph-spacing: loose`, `--p-spacing: 1.75rem` (look profile 2.1); `callout-style: outlined`, `--callout-border-width: 1px`. Horizontal rule (`---`, decided 2026-10-22): the theme's own CSS leaves Obsidian's rule (the older obsidian.css gave it a 2px top border): `line`.
- Contrast adjustments: none

### E-Ink

- File: `e-ink.verso-theme` (mode both) — SHA-256: `99b9f79388abee8e9b7937df1d2b886328ccd8b738303bb0cd863a4741388131`
- Credit in the file: Minimal (E-Ink colour scheme), Steph Ango (kepano), MIT
- Source: https://github.com/kepano/obsidian-minimal/blob/93321bdc23fc879966e1e3aa0cfeda77012f540f/theme.css
- Commit or tag: 93321bdc23fc879966e1e3aa0cfeda77012f540f
- Licence: MIT, (c) 2020-2024 Steph Ango
- Author: Steph Ango (kepano)
- Mapping: Minimal's own minimal-eink-light / minimal-eink-dark colour scheme: pure black on white and white on black, page and panels the same colour (flat surfaces). The scheme is monochrome, so no semantic colours are set; Minimal's default ones are not borrowed.
- Structural choices: `surface-mode: flat`, `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: outline`, `radius: soft`, `heading-scale: compact`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: plain`, `paragraph-spacing: loose`, `callout-style: outlined`, `hr-style: line`
- Structural sources: The E-Ink scheme belongs to Minimal: system sans body and headings (`system`), `font-size: 16`; tags are outlined with a 1.25px border in the text colour: `outline`; radii are Obsidian's: `soft`. Surface stays `flat`. New keys (ADR 0109, TM.4 = B): `heading-scale: compact`, h1 at 1.125em (`--h1-size`); `line-width: narrow`, `--line-width: 40rem`; `line-height: snug`, `--line-height: 1.5`; `blockquote-style: bar`, a 1px bar on muted upright text (`--blockquote-border-thickness: 1px`); `link-style: plain`, `--link-decoration: none`; `paragraph-spacing: loose`, `--p-spacing: 1.75rem` (look profile 2.1); `callout-style: outlined`, `--callout-border-width: 1px`. Horizontal rule (`---`, decided 2026-10-22): the theme's own CSS leaves Obsidian's rule (the older obsidian.css gave it a 2px top border): `line`.
- Contrast adjustments: none

### Blue Topaz

- File: `blue-topaz.verso-theme` (mode both) — SHA-256: `02c10cc979f45de748d897bf7a63ff4412f6afd3ca17fa427fe43d33a844f51b`
- Credit in the file: Blue Topaz, whyt-byte & Pkmer, MIT
- Source: https://github.com/pkm-er/Blue-Topaz_Obsidian-css/blob/8395f0d6d2966b517946dd2f202301d6b00763c4/theme.css
- Commit or tag: 8395f0d6d2966b517946dd2f202301d6b00763c4
- Licence: MIT, (c) 2020 whyt-byte
- Author: whyt-byte & Pkmer
- Mapping: Default colours without Style Settings choices; the six heading colours and the code colours are the theme's own. Fonts: Bookerly maps to the closest book serif key, `editorial`.
- Structural choices: `--heading-font: editorial`, `--book: editorial`, `--mono: mono`, `font-size: 16`, `table-style: bordered`, `tag-style: outline`, `radius: soft`, `line-width: narrow`, `line-height: snug`, `blockquote-style: panel`, `callout-style: title-bar`, `hr-style: line`
- Structural sources: Bookerly (body) and the heading levels inherit it, so the closest book serif key, `editorial` (Literata), for body and headings; JetBrains Mono: `mono`; `font-size: 16` (1em); tag with a 1px border: `outline`; table grid with tinted header: `bordered` (its alternate rows cannot be added to it); radii 3/5/7/15px: `soft`. New keys (ADR 0109, TM.4 = B): `line-width: narrow`, `--file-line-width: 45rem`, nearer `narrow` (40rem) than `standard` (about 55rem); `line-height: snug`, `--line-height-main: 1.5`; `blockquote-style: panel`, quotes in translucent coloured boxes (look profile 2.2); `callout-style: title-bar`, a coloured title on the callout (look profile 2.2). Horizontal rule (`---`, decided 2026-10-22): the default setting (`default-hr`) is a border in `--background-modifier-border-hr`; the ornamented rules (icon, gradient, numbered) are opt-in Style Settings choices, not the default: `line`.
- Contrast adjustments: light `--h5-color` `#5aa0e2` → `#4e99e0` (3.02:1, adjusted for contrast); light `--h6-color` `#89b9e6` → `#5399db` (3.02:1, adjusted for contrast)

### Things

- File: `things.verso-theme` (mode both) — SHA-256: `7fdbd6ffed5d09ea4737e14931f2fd203f86156a4b5f018a2fe5c0f4a4f9f089`
- Credit in the file: Things, Colin Eckert, MIT
- Source: https://github.com/colineckert/obsidian-things/blob/9b8bef93d3919f7693ac78597beaa35bbbd4cfff/theme.css
- Commit or tag: 9b8bef93d3919f7693ac78597beaa35bbbd4cfff
- Licence: MIT, (c) 2020-2021 Stephan Ango (@kepano)
- Author: Colin Eckert
- Mapping: Default hue/saturation/lightness variables resolved (base 212, accent 215). The theme's name is also the name of a third-party app (Things, Cultured Code): kept as the Obsidian theme's own name, credited, and flagged for the maintainer. Fonts: the theme's system sans stack maps to the system key.
- Structural choices: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `heading-style: rule`, `table-style: hairline`, `tag-style: pill`, `radius: soft`, `line-width: narrow`, `line-height: snug`, `checkbox-style: round`, `hr-style: line`
- Structural sources: System sans (`system`), JetBrains / Fira mono (`mono`), `font-size: 16`; section headings carry a thin rule in the theme's capture: `heading-style: rule`; green pill tag: `pill`; radii 4/8/10/16: `soft`; heading colours were already the theme's. New keys (ADR 0109, TM.4 = B): `line-width: narrow`, `--line-width: 40rem`; `line-height: snug`, `--line-height: 1.5`; `checkbox-style: round`, `--checkbox-radius: 30%` and round blue boxes (look profile 2.3). Horizontal rule (`---`, decided 2026-10-22): the theme's own CSS leaves Obsidian's rule (the older obsidian.css gave it a 2px top border): `line`.
- Contrast adjustments: light `--h4-color` `#e5b567` → `#c78822` (3.01:1, adjusted for contrast)

### Sanctum

- File: `sanctum.verso-theme` (mode both) — SHA-256: `28af7e7b51204bf08a60b756c1e296a2a2b30c1290218aaa97d20b887d6f67cc`
- Credit in the file: Sanctum, José Daniel Mourão (jdanielmourao), MIT
- Source: https://github.com/jdanielmourao/obsidian-sanctum/blob/ac69e5992a66d2aeabb30d8c2d90c636d155fc25/theme.css
- Commit or tag: ac69e5992a66d2aeabb30d8c2d90c636d155fc25
- Licence: MIT, (c) 2021-2022 José Daniel Mourão
- Author: José Daniel Mourão (jdanielmourao)
- Mapping: Page and panels are the same colour in the theme (--background-secondary equals --background-primary), so the surface mode is flat; Inter maps to the sans key.
- Structural choices: `surface-mode: flat`, `--heading-font: sans`, `--book: sans`, `font-size: 16`, `tag-style: pill`, `radius: soft`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: plain`, `checkbox-style: round`, `hr-style: line`
- Structural sources: Inter: `sans`; `font-size: 16`; flat surface; pill tag with no border (radius 2em): `pill`; radii 4/8/10px, so `soft` — not `sharp`, as the spec §1.4 says (recorded contradiction, not decided here). New keys (ADR 0109, TM.4 = B): `heading-scale: large`, h1 `--h1-size: 2em`; `line-width: narrow`, `--file-line-width: 40rem`; `line-height: snug`, `--line-height-normal: 1.5`; `blockquote-style: plain`, `--blockquote-border-thickness: 0px`; `checkbox-style: round`, `--checkbox-radius: 16px` on a small box. Horizontal rule (`---`, decided 2026-10-22): `--hr-thickness: 1.5px` in the border colour: `line` (2px is the closest).
- Contrast adjustments: light `--seal` `#f68d45` → `#e8650b` (3.02:1, adjusted for contrast)

### Obsidianotion

- File: `obsidianotion.verso-theme` (mode both) — SHA-256: `b6f462a8127fad9426729746975116ce8880594b53ccf39b72c3fce7604a42df`
- Credit in the file: Obsidianotion, Diego Eis, Unlicense
- Source: https://github.com/diegoeis/obsidianotion/blob/420469845836be3f116d9070e7548362289b8ee7/theme.css
- Commit or tag: 420469845836be3f116d9070e7548362289b8ee7
- Licence: Unlicense, public domain
- Author: Diego Eis
- Mapping: The theme's own light and dark variables; its system-ui font stack maps to the system key. The name stays the theme's own (it is not called Notion).
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: pill`, `radius: soft`, `heading-scale: large`, `heading-weight: bold`, `line-height: snug`, `line-width: narrow`, `blockquote-style: bar`, `callout-style: outlined`, `hr-style: line`
- Structural sources: ui-sans-serif / -apple-system stack: `system`; 16px; tags are pills (colour cycle not expressible): `pill`; radii 4/8/12/16: `soft`. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, h1 `--h1-size: 1.875em`, nearer `large` (2.1em) than `standard` (1.65em); `heading-weight: bold`, `--h1-weight: 700`; `line-height: snug`, `--line-height-normal: 1.5`; `blockquote-style: bar`, a 3px grey bar on muted text (look profile 2.5); `callout-style: outlined`, `--callout-border-width: 1px`, tinted border (look profile 2.5). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` — the theme's CSS sets no `--file-line-width`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): `hr { border-color: var(--background-modifier-border) }`: `line`.
- Contrast adjustments: none

### Atom

- File: `atom.verso-theme` (mode both) — SHA-256: `905f585c5631be0afe712f11176c20477b187366ee986cea30624df1132e554d`
- Credit in the file: Atom, kognise, Unlicense
- Source: https://github.com/kognise/obsidian-atom/blob/650d6463d377a096520373c4752fef66f3f18f46/obsidian.css
- Commit or tag: 650d6463d377a096520373c4752fef66f3f18f46
- Licence: Unlicense, public domain
- Author: kognise
- Mapping: The theme sets page, panel, border, text, muted text and accent for both sides and nothing else.
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: pill`, `radius: soft`, `heading-scale: large`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: plain`, `checkbox-style: rounded`, `hr-style: line`
- Structural sources: no font family is set by the theme, so Obsidian's system sans: `system`; `font-size: 16` is Obsidian's own default (`--font-text-size`); the theme does not change it; the tag is a rounded chip with 4px radius (theme.css, `a.tag`), radii are Obsidian's: `tag-style: pill`, `radius: soft`; the yellow tag colour cannot be set. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, Obsidian's default h1 (2em); the theme sets none (look profile 2.6); `blockquote-style: bar`, Obsidian's default bar (look profile 1); the theme only adds an indent; `link-style: plain`, `--link-decoration: none`; `checkbox-style: rounded`, accent-coloured rounded square (look profile 2.6). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): the source styles no rule: Obsidian's own (2px in the border colour), `line`.
- Contrast adjustments: none

### Yin and Yang

- File: `yin-and-yang.verso-theme` (mode both) — SHA-256: `dd28057f87c6e16d293a6a57672f28d5ec669870c69cf27be2065cd52fbe323e`
- Credit in the file: Yin and Yang, Chetachi Ezikeuzor, MPL-2.0
- Source: https://github.com/chetachiezikeuzor/Yin-and-Yang-Theme/blob/e780f0d58301cfa11c05d0cc351ee82a95d920de/obsidian.css
- Commit or tag: e780f0d58301cfa11c05d0cc351ee82a95d920de
- Licence: MPL-2.0, Mozilla Public License 2.0 (colour values only; the CSS is not redistributed)
- Author: Chetachi Ezikeuzor
- Mapping: Page, panel, border, text and accent for both sides. The theme's accent colours are pastel and are corrected for contrast on the page.
- Structural choices: `--heading-font: sans`, `--book: sans`, `font-size: 17`, `radius: soft`, `heading-scale: large`, `heading-weight: bold`, `line-width: narrow`, `line-height: snug`, `hr-style: thin`
- Structural sources: Inter (`--default-font`): `sans`; `font-size: 17` (`--normal-font-size`); heading colours are the theme's `--text-title-h1`…`h6` (dark: pink, purple, red, orange, green, pale blue; light: light pink, purple, red, orange, green, cornflower blue); radii 4–6px: `soft`. Its pastels fail 3:1 on the light page and were darkened by the rule below. New keys (ADR 0109, TM.4 = B): `heading-scale: large`, h1 1.98em (look profile 2.7); `heading-weight: bold`, h1 weight 750, nearer `bold` (700). Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` and `line-height: snug` — the theme's CSS sets neither `--file-line-width` nor `--line-height-normal`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): `border-top: 1px solid` in `--background-modifier-border`: `thin`.
- Contrast adjustments: light `--seal` `#cd94ff` → `#bc6fff` (3.01:1, adjusted for contrast); light `--h1-color` `#ffabf4` → `#ff33e4` (3.01:1, adjusted for contrast); light `--h2-color` `#d2b3ff` → `#ae76ff` (3.01:1, adjusted for contrast); light `--h3-color` `#ff5582` → `#ff5280` (3.04:1, adjusted for contrast); light `--h4-color` `#ffb86c` → `#e17400` (3.08:1, adjusted for contrast); light `--h5-color` `#85ffa4` → `#00ab2c` (3.00:1, adjusted for contrast); light `--h6-color` `#a1c4fd` → `#5192fb` (3.01:1, adjusted for contrast)

### Border

- File: `border.verso-theme` (mode both) — SHA-256: `8fb28bfa32ecf94b8b76924ec7145a417f60307debd8c2cd93ea7703df216f25`
- Credit in the file: Border, Akifyss, MIT
- Source: https://github.com/akifyss/obsidian-border/blob/dd59bd54438597f61b38eb5b967919e979526c41/theme.css
- Commit or tag: dd59bd54438597f61b38eb5b967919e979526c41
- Licence: MIT, (c) 2022 Akifyss
- Author: Akifyss
- Mapping: Colours resolved from the theme's default variables (its HSL chains computed).
- Structural choices: `--heading-font: sans`, `--book: sans`, `font-size: 16`, `table-style: bordered`, `tag-style: outline`, `radius: soft`, `heading-weight: bold`, `line-height: snug`, `line-width: narrow`, `blockquote-style: bar`, `checkbox-style: rounded`, `hr-style: line`
- Structural sources: Inter in the theme's own capture (Style Settings): `sans`; `font-size: 16`; 2em pill tag with a 1px border: `outline`; table grid: `bordered`; radii 8px (cards) and 6px (checkbox): `soft`. The cards layout is an optional Style Settings choice, not the default, so the default look (tonal surface) is kept and `surface-mode: cards` was removed; no heading style (an h1 rule and an h2 bar, mixed). New keys (ADR 0109, TM.4 = B): `heading-weight: bold`, `--h1-weight: 700` falling to 575 by level, so `bold`; `line-height: snug`, `--line-height-normal: 1.5`; `blockquote-style: bar`, `--blockquote-border-thickness: 3px`; `checkbox-style: rounded`, `--checkbox-radius: 6px`. Obsidian defaults (ADR 0109, last paragraph): `line-width: narrow` — the theme's CSS sets no `--file-line-width`, so Obsidian's own default is used. Horizontal rule (`---`, decided 2026-10-22): the source styles no rule: Obsidian's own (2px in the border colour), `line`.
- Contrast adjustments: none

### Mapa de Conteúdo

- File: `mapa-de-conteudo.verso-theme` (mode dark) — SHA-256: `ea70c67de1f7a46e98110a69ff2286cfa9092824fba045da041d8f7a8c15c948`
- Credit in the file: LYT Mode, Nick Milo, MIT
- Source: https://github.com/nickmilo/LYT-Mode/blob/28f67f18a24f5c8d3b58954eb8374bf2ecffbb50/theme.css
- Commit or tag: 28f67f18a24f5c8d3b58954eb8374bf2ecffbb50
- Licence: MIT, (c) 2022 nickmilo
- Author: Nick Milo
- Mapping: The theme's dark side only (it sets no light colours). Renamed from "LYT Mode": LYT (Linking Your Thinking) is the author's method and mark, and ADR 0109 item 7 keeps third-party marks out of names; the credit still names the original.
- Structural choices: `--heading-font: sans`, `--book: sans`, `--mono: mono`, `font-size: 16`, `tag-style: pill`, `radius: sharp`, `heading-weight: bold`, `line-width: narrow`, `line-height: snug`, `blockquote-style: bar`, `link-style: plain`, `hr-style: thin`
- Structural sources: DM Sans (Inter as fallback): `sans`, DM Mono / Fira Code: `mono`, `font-size: 16`; radii 0/2/4px: `sharp`; dark tag pill: `pill`. Heading colours were already the theme's. New keys (ADR 0109, TM.4 = B): `heading-weight: bold`, `--h1-weight: 700`; `line-width: narrow`, `--file-line-width: 700px`, near `narrow`; `line-height: snug`, `--line-height-normal: 1.58`, nearer `snug` (1.5) than `normal` (1.7); `blockquote-style: bar`, `--blockquote-border-thickness: 2px`; `link-style: plain`, `--link-decoration: none` and `--link-decoration-hover: none`. Horizontal rule (`---`, decided 2026-10-22): `--hr-thickness: 1px` in `--border-900`: `thin`.
- Contrast adjustments: none

## Not shipped

- **GPL themes** (ADR 0109 item 6): AnuPpuccin (GPL-3.0; its palette is Catppuccin, which ships), Primary (GPL-3.0), Velocity (GPL-3.0), Fancy-a-Story (GPL-3.0), Typewriter (GPL-3.0), ITS Theme (GPL-2.0) and its "WotC D&D" variant (also a third party's mark).
- **No licence file:** the Ayu repositories listed in the Obsidian catalogue (Ayu is shipped from its official, MIT `ayu-theme/ayu-colors`) and the original `morhetz/gruvbox` (shipped from the MIT community fork `gruvbox-community/gruvbox`).
- **Licence fine, colours not shipped in this pass:** Baseline and Cupertino (a palette computed with `oklch()` and `pow()` from the user's chosen hue: there is no fixed set of values to take), Maple, Prism (palettes built from several selectable schemes through `:not()` chains and runtime variables), Shimmering Focus (colours behind `color-mix()` and layered variables), Shiba Inu (twelve selectable accents, none the default) and Red Graphite (its light side has a dark side panel that Verso's surface modes cannot yet express). Each can be added by taking its values again from the source in a later pass.
- **Dracula light:** Dracula has no light palette of its own other than Alucard, which ships under that name; no light was invented.

## Fidelity pass, 2026-10-22

The side-by-side comparison (screenshots of the originals against Verso) was checked against each original's CSS, which is the authority; where the two disagree the file follows the CSS and the screenshot is recorded as a user-configured or cover image.

- **Changed.** Rosé Pine and Rosé Pine Moon: `--book` is now `sans` (the original's editor stack is Inter; its reading-view stack is Georgia, but the screenshots and the editor are sans, the maintainer's call). Tokyo Night: `--heading-font` and `--book` are `mono` (the original sets `--default-font` to JetBrains Mono). Ayu Dark: `system` for both (the adnan-malik CSS sets no font, so Obsidian's system sans). Solarized: h1 to h6 are cyan (the original's `--text-title` is its cyan on all six), #2aa198 in dark and #279a91 in light, the minimal darkening that clears the 3:1 floor on the page. Flexoki: h1 to h6 are the text colour (the original sets none, so Obsidian's default applies).
- **Checked, not changed.** Catppuccin x4: the CSS body font is Vollkorn (`--font-text-theme`), a book serif, so `editorial` stays (the comparison's "sans" came from a textless sketch), and every heading is the accent (`--ctp-hN` defaults to `--ctp-accent`), which the files already carry. Nord and Gruvbox: the CSS gives h1 to h6 as red, yellow, green, purple, frost0, frost2 (Nord) and red, yellow, green, aqua, blue, purple (Gruvbox), exactly the files; the orange h2 in the screenshots is not in the CSS. Mapa de Conteúdo: the CSS rainbow (yellow-900, purple-700, cyan-533, green-710, slate-500, slate-700) is what the file has. Blue Topaz: the CSS defaults are the lime h1 and `#202020` page the file has, with Bookerly as the text font; the pink and navy of the screenshot are Style Settings choices. Ayu Light and Mirage: the originals read in Gentium Plus (serif) and are 24px by their own choice; the file keeps the palette only.
- **Border.** Not a renderer bug: `border.verso-theme` simply does not declare `heading-style`, and the renderer applies the key when a file does (`data-heading-style` in `css/theme-tokens.css`). Left undeclared on purpose: the original draws its orange bar on h2 only (`--h2-accent-color`, a `::before` of 3px), while Verso's `accent-bar` draws a bar in the heading colour on h1 to h4, which would add bars the original does not have. `surface-mode: cards` was removed on purpose (optional Style Settings, ADR 0109).

## Ten more structural keys, 2026-10-22

ADR 0109, TM.4 = B: ten more closed lists in `values` of a version 2 file, all optional. The first value of each list is the window's own look and writes nothing, so a file without the key (or with that value) renders as before. The reader refuses a value outside its list and any of these keys in a version 1 file. The rules are in `css/theme-tokens.css`, for reading and for Live Preview.

| Key | Values (first = the window's own) | What each does |
|---|---|---|
| `heading-scale` | `standard`, `compact`, `large` | h1 / h2 / h3 at 1.65 / 1.35 / 1.12em; 1.2 / 1.1 / 1.04em; 2.1 / 1.7 / 1.35em |
| `heading-weight` | `semibold`, `regular`, `bold` | 600, 400, 700 |
| `line-width` | `standard`, `narrow`, `wide` | the reading column: 100ch, 40rem, 72rem (the person's own wide measure still wins) |
| `line-height` | `normal`, `snug`, `relaxed` | 1.7 (lists 1.6), 1.5 (1.4), 1.9 (1.8) |
| `blockquote-style` | `bar-italic`, `bar`, `panel`, `plain` | a 2px bar and italic; the bar upright; a tinted panel with a 4px bar (italic); no bar, upright |
| `link-style` | `underline`, `hover`, `plain` | a hairline under the text; only on hover; the colour alone |
| `emphasis-color` | `ink`, `accent`, `semantic` | bold and italic in the text colour; both in the accent (`--seal`); bold in the cyan and italic in the green |
| `checkbox-style` | `square`, `rounded`, `round` | corner radius .2em, .35em, 50% |
| `paragraph-spacing` | `standard`, `tight`, `loose` | the gap after a paragraph (reading): 1em, .5em, 1.6em |
| `callout-style` | `tinted`, `outlined`, `title-bar` | a wash and a bar; a 1px outline and the bar; a coloured title bar over an outlined box |

Where the numbers differ from the draft: `line-width: wide` is 72rem, not 52rem, because the window's own column (100ch in the body font) is already about 55rem; `line-height: relaxed` is 1.9, not 1.75, because the window's own is 1.7; `heading-weight` calls today's 600 `semibold`; the `bar` quote is upright because today's quote (`bar-italic`) is italic.

Rules used to set the keys per theme (the sources are under each theme): a value is set where the theme's own CSS gives one (nearest of the closed values); where the theme sets none and the profile records Obsidian's default (h1 2em, the plain 2px quote bar), that default is used; line width and line height are set where the theme's CSS declares them; where it declares none, Obsidian's default is used (`line-width: narrow`, the 700px column, and `line-height: snug`, 1.5; ADR 0109, last paragraph). The checkbox cannot be square-cornered (radius 0) as Gruvbox, Nord and Solarized draw it: `square` is today's small radius.
