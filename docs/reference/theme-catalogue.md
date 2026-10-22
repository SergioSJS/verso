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

- File: `catppuccin-latte.verso-theme` (mode light) — SHA-256: `48674b5cb50a7dd64b755e7f6d9f56a3be3902b659b359d980e4545dfc87722f`
- Credit in the file: Catppuccin Latte, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Structural choices: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`
- Structural sources: Vollkorn (a book serif; headings use the body font): the closest book serif key, `editorial` (Literata) for body and headings; `font-size: 16`; every heading in the accent colour, Mauve (catppuccin/obsidian theme.css), so `--h1-color`…`h6` are the Mauve of this flavour; 1px table grid: `bordered`; accent-coloured pill tag: `pill`; radii 4/8/10px: `soft`.
- Contrast adjustments: none

### Catppuccin Frappé

- File: `catppuccin-frappe.verso-theme` (mode dark) — SHA-256: `c793a0e9e6742b3f3809db5fb75ebb0f92f91b1cbc6c5b92b646566e099aacd7`
- Credit in the file: Catppuccin Frappé, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Structural choices: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`
- Structural sources: Vollkorn (a book serif; headings use the body font): the closest book serif key, `editorial` (Literata) for body and headings; `font-size: 16`; every heading in the accent colour, Mauve (catppuccin/obsidian theme.css), so `--h1-color`…`h6` are the Mauve of this flavour; 1px table grid: `bordered`; accent-coloured pill tag: `pill`; radii 4/8/10px: `soft`.
- Contrast adjustments: none

### Catppuccin Macchiato

- File: `catppuccin-macchiato.verso-theme` (mode dark) — SHA-256: `960e77dab31022eb495f38a188124bc5440a12a7e2eb4a8330ae7b6dfa782064`
- Credit in the file: Catppuccin Macchiato, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Structural choices: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`
- Structural sources: Vollkorn (a book serif; headings use the body font): the closest book serif key, `editorial` (Literata) for body and headings; `font-size: 16`; every heading in the accent colour, Mauve (catppuccin/obsidian theme.css), so `--h1-color`…`h6` are the Mauve of this flavour; 1px table grid: `bordered`; accent-coloured pill tag: `pill`; radii 4/8/10px: `soft`.
- Contrast adjustments: none

### Catppuccin Mocha

- File: `catppuccin-mocha.verso-theme` (mode dark) — SHA-256: `0aa0730debaea232be8f2f3e2a3ae7ac5237b2bdaf098bb1d61a7cc9f121bbe3`
- Credit in the file: Catppuccin Mocha, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Structural choices: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`
- Structural sources: Vollkorn (a book serif; headings use the body font): the closest book serif key, `editorial` (Literata) for body and headings; `font-size: 16`; every heading in the accent colour, Mauve (catppuccin/obsidian theme.css), so `--h1-color`…`h6` are the Mauve of this flavour; 1px table grid: `bordered`; accent-coloured pill tag: `pill`; radii 4/8/10px: `soft`.
- Contrast adjustments: none

### Nord

- File: `nord.verso-theme` (mode dark) — SHA-256: `03ffb7abd67cd2152fc23e787a8bc08998507e39040fded701d478e80c7adbb6`
- Credit in the file: Nord, Sven Greb (Arctic Ice Studio), MIT
- Source: https://github.com/nordtheme/nord/blob/1cef71605416a222e57225b544540ce0fcec18d4/src/nord.css
- Commit or tag: 1cef71605416a222e57225b544540ce0fcec18d4 (develop, tag v0.2.0 is older)
- Licence: MIT, (c) 2016-present Sven Greb
- Author: Sven Greb
- Mapping: Polar Night nord0 / nord1 / nord2 for page, panels and lines; nord4 text; links in Frost nord8, headings nord9; the Aurora colours for the semantic ones (no pink in the palette: omitted). Nord has no light palette, so none is shipped. ink-2 is nord3, the palette's comment colour.
- Structural choices: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `table-style: striped`, `tag-style: pill`
- Structural sources: System sans (`system`), Hack mono (`mono`), `font-size: 16`; heading colours are the theme's `--h1-color`…`h6` = red, yellow, green, purple, frost0, frost2; striped tables: `striped`; tag pill (.5em): `pill`.
- Contrast adjustments: dark `--ink-2` `#4c566a` → `#6f7d98` (3.01:1, adjusted for contrast)

### Dracula

- File: `dracula.verso-theme` (mode dark) — SHA-256: `60932f1ee2bef85b215637f90f67b5cd6e4583cbead5b057e2bd81447fd53d7b`
- Credit in the file: Dracula, Zeno Rocha, MIT
- Source: https://github.com/dracula/dracula-theme/blob/e22ebcc048b8aff586f9bc94db30ff5347070b42/README.md and https://draculatheme.com/spec (UI palette, read 2026-10-22)
- Commit or tag: e22ebcc048b8aff586f9bc94db30ff5347070b42 (tag v1.2.5 is older)
- Licence: MIT, (c) 2023 Dracula Theme
- Author: Zeno Rocha
- Mapping: Background, Foreground, Comment, Current Line and the functional colours from the README palette; "Background Dark" #21222C and "Floating interactive elements" #343746 from the spec's UI table. Borders use Current Line, as the spec's component guidelines say. Dracula's spec has no Blue, so --blue is the Purple (the spec maps ANSI blue to it). The spec asks for 4.5:1 text contrast and "exact colour values"; the comment colour used for ink-2 is under 4.5:1 and is corrected only to the 3:1 floor, if needed.
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `radius: soft`
- Structural sources: The theme sets no font (Obsidian's system sans: `system`); `font-size: 16` is Obsidian's own default (`--font-text-size`); the theme does not change it; the six heading colours are the theme's `--text-title-h1`…`h6` (#bd93f9, #ffb86c, #50fa7b, #ff5555, #f1fa8c, #bd93f4); code blocks with 4px radius: `soft`.
- Contrast adjustments: none

### Dracula Alucard

- File: `dracula-alucard.verso-theme` (mode light) — SHA-256: `a03d67353d7d57ca479156813ea86d982a8bdcb8023bf8c66325243b5057e3cf`
- Credit in the file: Dracula Alucard, Zeno Rocha, MIT
- Source: https://github.com/dracula/dracula-theme/blob/e22ebcc048b8aff586f9bc94db30ff5347070b42/README.md and https://draculatheme.com/spec (Alucard UI palette)
- Commit or tag: e22ebcc048b8aff586f9bc94db30ff5347070b42
- Licence: MIT, (c) 2023 Dracula Theme
- Author: Zeno Rocha
- Mapping: Dracula's own light palette, Alucard (README "Alucard" table and the spec's UI table); it is not an invented light for Dracula. Same mapping as Dracula; Verso names it "Dracula Alucard" to say whose palette it is.
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `radius: soft`
- Structural sources: Same structure as Dracula (the theme sets no font, Obsidian's defaults); heading colours by Dracula's role order (purple, orange, green, red, yellow, purple) in this palette's own light equivalents. Alucard is not in the Obsidian theme, so the order is Dracula's, not Alucard's.
- Contrast adjustments: none

### Rosé Pine

- File: `rose-pine.verso-theme` (mode both) — SHA-256: `1d290c49a970dcb0507db1f78dea9e4ca0a5b86ac0db0422d08720b0d4b6102d`
- Credit in the file: Rosé Pine, Rosé Pine, MIT
- Source: https://github.com/rose-pine/palette/blob/92af52b465ab6e47437aca223c9b8d3009a2023b/palette.json
- Commit or tag: 92af52b465ab6e47437aca223c9b8d3009a2023b (tag v4.0.1)
- Licence: MIT, (c) mvllow
- Author: Rosé Pine
- Mapping: Base / Surface / Overlay for page, panels and lines; Text and Subtle for text; Iris for links, Rose for headings; Love, Gold, Foam, Pine, Iris and Rose for red, yellow, cyan, blue, purple and pink. Rosé Pine has no orange or green: left to Verso's own. Dark is Rosé Pine (main), light is Dawn.
- Structural choices: `--heading-font: sans`, `--book: editorial`, `font-size: 18`
- Structural sources: Inter for editing and headings: `sans`; Georgia for reading: the closest book serif key, `editorial` (its stack ends in Georgia); `font-size: 18` (theme.css `--font-text-size`); heading colours are `--rp-h1`…`h6` = love, iris, rose, gold, foam, pine (here red, purple, pink, yellow, cyan, blue). The light side's pink and gold were corrected for contrast.
- Contrast adjustments: light `--brass-ink` `#d7827e` → `#d2726d` (3.02:1, adjusted for contrast); light `--h3-color` `#d7827e` → `#d2716c` (3.04:1, adjusted for contrast); light `--h4-color` `#ea9d34` → `#c77c15` (3.04:1, adjusted for contrast)

### Rosé Pine Moon

- File: `rose-pine-moon.verso-theme` (mode dark) — SHA-256: `e6ab43d78d7fa8b6e8eb9cf0b470262b61afc2e42dc1a41eb6f80a1c1675c1a1`
- Credit in the file: Rosé Pine Moon, Rosé Pine, MIT
- Source: https://github.com/rose-pine/palette/blob/92af52b465ab6e47437aca223c9b8d3009a2023b/palette.json
- Commit or tag: 92af52b465ab6e47437aca223c9b8d3009a2023b (tag v4.0.1)
- Licence: MIT, (c) mvllow
- Author: Rosé Pine
- Mapping: Base / Surface / Overlay for page, panels and lines; Text and Subtle for text; Iris for links, Rose for headings; Love, Gold, Foam, Pine, Iris and Rose for red, yellow, cyan, blue, purple and pink. Rosé Pine has no orange or green: left to Verso's own.
- Structural choices: `--heading-font: sans`, `--book: editorial`, `font-size: 18`
- Structural sources: Inter for editing and headings: `sans`; Georgia for reading: the closest book serif key, `editorial` (its stack ends in Georgia); `font-size: 18` (theme.css `--font-text-size`); heading colours are `--rp-h1`…`h6` = love, iris, rose, gold, foam, pine (here red, purple, pink, yellow, cyan, blue).
- Contrast adjustments: none

### Everforest

- File: `everforest.verso-theme` (mode both) — SHA-256: `d7d4d685af4f6067890a41d5193c1d2f3e6570b353c7967e7874a29715a6d528`
- Credit in the file: Everforest, sainnhe, MIT
- Source: https://github.com/sainnhe/everforest/blob/85a86eb62409e3ec88713bff3d1b9d7374e112e4/docs/palette.md
- Commit or tag: 85a86eb62409e3ec88713bff3d1b9d7374e112e4 (tag v0.3.0)
- Licence: MIT, (c) 2019 sainnhe
- Author: sainnhe
- Mapping: The palette's medium-contrast variant, dark and light. bg0 / bg1 / bg2 (dark) and bg0 / bg1 / bg4 (light) for the surfaces; fg for text, grey2 (dark) and grey1 (light) for muted text; green for links and yellow for headings; the accent row for the semantic colours (aqua is the cyan). The light accents are pale on the light page and several are corrected for contrast (see adjustments).
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: outline`
- Structural sources: System sans, 16px (`system`, `font-size: 16`, theme.css `--font-text-size`); heading colours are the theme's `--h1-color`…`--h6-color` (dim set in dark, light set in light: red, orange, yellow, green, aqua, purple); tags with an aqua 1px border: `outline`.
- Contrast adjustments: light `--ink-2` `#939f91` → `#849282` (3.03:1, adjusted for contrast); light `--seal` `#8da101` → `#859801` (3:1, adjusted for contrast); light `--brass-ink` `#dfa000` → `#ba8500` (3.02:1, adjusted for contrast); light `--h2-color` `#f57d26` → `#e8670b` (3.05:1, adjusted for contrast); light `--h3-color` `#bf983d` → `#ac8937` (3.05:1, adjusted for contrast); light `--h4-color` `#899c40` → `#84973e` (3.01:1, adjusted for contrast); light `--h5-color` `#569d79` → `#559b78` (3.07:1, adjusted for contrast)

### Gruvbox

- File: `gruvbox.verso-theme` (mode both) — SHA-256: `95ba9894c30fe2c006222fe0e32bd2b777779df62c083613656a72af676d7114`
- Credit in the file: Gruvbox, Pavel Pertsev (morhetz), MIT
- Source: https://github.com/gruvbox-community/gruvbox/blob/180ad85971343df68be3422a5630fa84e45a9ab2/colors/gruvbox.vim
- Commit or tag: 180ad85971343df68be3422a5630fa84e45a9ab2 (tag v3.6.1)
- Licence: MIT, (c) 2018 Pavel Pertsev (community fork; morhetz/gruvbox, the original, has no LICENSE file)
- Author: Pavel Pertsev (morhetz)
- Mapping: The palette and the dark/light role table of colors/gruvbox.vim: dark uses bg0 / bg1 / bg2, fg1 and fg4 with the bright accents; light uses light0 / light1 / light2, dark1 and dark4 with the faded accents. Links in blue, headings in yellow, as the vim script's Markdown groups do. The community fork is credited because the original repository carries no licence file.
- Structural choices: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `table-style: striped`, `tag-style: pill`
- Structural sources: System sans (`system`), Hack Nerd Font mono (`mono`), `font-size: 16`; heading colours are the theme's `--h1-color`…`h6` = neutral red, yellow, green, aqua, blue, purple; tables with alternate rows: `striped`; tag pill (radius .5em): `pill`.
- Contrast adjustments: dark `--h1-color` `#cc241d` → `#dc271f` (3.06:1, adjusted for contrast); light `--h2-color` `#d79921` → `#b6811c` (3.01:1, adjusted for contrast); light `--h3-color` `#98971a` → `#8f8e19` (3.06:1, adjusted for contrast); light `--h4-color` `#689d6a` → `#629764` (3.02:1, adjusted for contrast)

### Solarized

- File: `solarized.verso-theme` (mode both) — SHA-256: `8e4b49c57e05733894ebd10cdccd81e0329f8a1aaaeb5996424bbc793542a167`
- Credit in the file: Solarized, Ethan Schoonover, MIT
- Source: https://github.com/altercation/solarized/blob/62f656a02f93c5190a8753159e34b385588d5ff3/README.md ("The Values" table)
- Commit or tag: 62f656a02f93c5190a8753159e34b385588d5ff3 (tag v1.0.0beta1)
- Licence: MIT, (c) 2011 Ethan Schoonover
- Author: Ethan Schoonover
- Mapping: The 16 values of the README table, with Solarized's own light/dark role swap: base3 / base2 (light) and base03 / base02 (dark) for page and panels, base00 / base0 for body text, base1 / base01 for secondary content, blue for links, orange for headings; magenta is the pink and violet the purple. The secondary text colours are below the floor on the page (the palette is low contrast by design) and are corrected.
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: pill`
- Structural sources: The theme sets no font (Obsidian's system sans: `system`) and `font-size: 16`; tag pill with the accent at 10–20%: `pill`. Only the code blocks' radius is `unset`, so `radius` stays the window's own.
- Contrast adjustments: light `--ink-2` `#93a1a1` → `#829292` (3.01:1, adjusted for contrast); dark `--ink-2` `#586e75` → `#5d747c` (3.04:1, adjusted for contrast)

### Flexoki

- File: `flexoki.verso-theme` (mode both) — SHA-256: `edad3c96733d4316f017092760464e9be9c99e13e3ab786653ab3d53a4020f93`
- Credit in the file: Flexoki, Steph Ango (kepano), stephango.com/flexoki, MIT
- Source: https://github.com/kepano/flexoki/blob/8d723bac4a9ac46adfdf99d42155286977aac72a/README.md
- Commit or tag: 8d723bac4a9ac46adfdf99d42155286977aac72a (tag 2.0.0)
- Licence: MIT, (c) 2023 Steph Ango
- Author: Steph Ango
- Mapping: Flexoki's scale as its README gives it: paper / base-50 / base-100 and black / base-950 / base-900 for surfaces and lines, black and base-200 for text, base-600 and base-500 for muted text; the 600 accents on the light side and the 400 accents on the dark side; blue for links, orange for headings. Flexoki's README asks ports to "include attribution and a link to stephango.com/flexoki": the author line of the credit carries it and the Credits page must show it.
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`
- Structural sources: The theme is only colour variables (1.9 KB): typography is Obsidian's default, `system` and `font-size: 16`.
- Contrast adjustments: none

### Tokyo Night

- File: `tokyo-night.verso-theme` (mode both) — SHA-256: `be37a2d1971ddc9022fcbb75af6c1aa661a6ca934c27d7171b71fa142e9ad4f0`
- Credit in the file: Tokyo Night, enkia (Tokyo Night VS Code theme), MIT
- Source: https://github.com/tokyo-night/tokyo-night-vscode-theme/blob/7c0f11eaef322f293621ca7befe462214b7ea468/themes/tokyo-night-color-theme.json and tokyo-night-light-color-theme.json
- Commit or tag: 7c0f11eaef322f293621ca7befe462214b7ea468
- Licence: MIT (LICENSE.txt)
- Author: enkia
- Mapping: Colours: read from the two VS Code colour themes (editor and side-bar backgrounds, editor and description text, the link colour, the text-code-block background, the inline-code colour); the ANSI colours for red, yellow, green, cyan, blue and purple. The six heading colours are not the VS Code Markdown ones but the Obsidian theme's order (red, yellow, green, cyan, blue, magenta) over those ANSI colours. Dark is "Tokyo Night", light is the theme's own light variant.
- Structural choices: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `tag-style: pill`, `radius: soft`
- Structural sources: System sans (the declared JetBrains Mono default font is not used by the theme): `system`, JetBrains mono: `mono`, `font-size: 16`; heading colours are the Obsidian theme's `--h1-color`…`h6` = red, yellow, green, cyan, blue, magenta, taken in this file's palette values; magenta tag pill: `pill`; callout radius 4px: `soft`.
- Contrast adjustments: none

### Ayu Light

- File: `ayu-light.verso-theme` (mode light) — SHA-256: `b2fc0ca5feaab245f3404ca045d96ef48cda2c158e680d83bddcb2d35bdaf29d`
- Credit in the file: Ayu Light, Konstantin Pschera, MIT
- Source: https://github.com/ayu-theme/ayu-colors/blob/d461f02983546636bc6e1e0c48190fdb74036426/themes/light.yaml
- Commit or tag: d461f02983546636bc6e1e0c48190fdb74036426 (tag v8.0.1)
- Licence: MIT, (c) Konstantin Pschera
- Author: Konstantin Pschera
- Mapping: The YAML theme's own values: editor background (surface lift) for the page, surface base for panels, editor and UI foregrounds for text, the accent tint for links, the palette orange for headings, ui.line (or surface sunk) for lines; palette red, orange, yellow, green, teal (cyan), blue and purple. Ayu's palette has no pink of its own: omitted. Values the YAML derives with colour expressions (syntax roles) are not used.
- Contrast adjustments: light `--seal` `#f29718` → `#d27f0c` (3.02:1, adjusted for contrast); light `--brass-ink` `#fa8532` → `#f36806` (3.01:1, adjusted for contrast)

### Ayu Mirage

- File: `ayu-mirage.verso-theme` (mode dark) — SHA-256: `897d1618087bb3a7bf8b4051601cc814ad14e1776f16f4ceacf376ffbf40c4bb`
- Credit in the file: Ayu Mirage, Konstantin Pschera, MIT
- Source: https://github.com/ayu-theme/ayu-colors/blob/d461f02983546636bc6e1e0c48190fdb74036426/themes/mirage.yaml
- Commit or tag: d461f02983546636bc6e1e0c48190fdb74036426 (tag v8.0.1)
- Licence: MIT, (c) Konstantin Pschera
- Author: Konstantin Pschera
- Mapping: The YAML theme's own values: editor background (surface lift) for the page, surface base for panels, editor and UI foregrounds for text, the accent tint for links, the palette orange for headings, ui.line (or surface sunk) for lines; palette red, orange, yellow, green, teal (cyan), blue and purple. Ayu's palette has no pink of its own: omitted. Values the YAML derives with colour expressions (syntax roles) are not used.
- Contrast adjustments: none

### Ayu Dark

- File: `ayu-dark.verso-theme` (mode dark) — SHA-256: `699d3526d729b0451c42eb4533418c0a08303a3a6811f4a3a528020019dd31b0`
- Credit in the file: Ayu Dark, Konstantin Pschera, MIT
- Source: https://github.com/ayu-theme/ayu-colors/blob/d461f02983546636bc6e1e0c48190fdb74036426/themes/dark.yaml
- Commit or tag: d461f02983546636bc6e1e0c48190fdb74036426 (tag v8.0.1)
- Licence: MIT, (c) Konstantin Pschera
- Author: Konstantin Pschera
- Mapping: The YAML theme's own values: editor background (surface lift) for the page, surface base for panels, editor and UI foregrounds for text, the accent tint for links, the palette orange for headings, ui.line (or surface sunk) for lines; palette red, orange, yellow, green, teal (cyan), blue and purple. Ayu's palette has no pink of its own: omitted. Values the YAML derives with colour expressions (syntax roles) are not used.
- Contrast adjustments: none

### Minimal

- File: `minimal.verso-theme` (mode both) — SHA-256: `f8f998e83101d2ba1c9d66a4245dbeb2b25091667552df3314766221a4ecbf75`
- Credit in the file: Minimal, Steph Ango (kepano), MIT
- Source: https://github.com/kepano/obsidian-minimal/blob/93321bdc23fc879966e1e3aa0cfeda77012f540f/theme.css
- Commit or tag: 93321bdc23fc879966e1e3aa0cfeda77012f540f
- Licence: MIT, (c) 2020-2024 Steph Ango
- Author: Steph Ango (kepano)
- Mapping: The default colour scheme (minimal-default-light / minimal-default-dark) with the theme's own base and accent variables resolved; Minimal sets no heading or code colours of its own in that scheme, so the headline is the text colour and the code colours are left to Verso.
- Structural choices: `surface-mode: flat`, `--heading-font: system`, `--book: system`, `font-size: 16`, `table-style: hairline`, `tag-style: minimal`, `radius: soft`
- Structural sources: System sans for body and headings (`system`), 16px, the flat sidebar (`surface-mode: flat`), tags as plain text with no fill or border (`tag-style: minimal`), a table with a small header and no outer borders (`hairline`), Obsidian radii (`soft`).
- Contrast adjustments: none

### E-Ink

- File: `e-ink.verso-theme` (mode both) — SHA-256: `57623dc8df66bfed811cfbbbb13e0f483b304d5add4ea2563665917cca0494e6`
- Credit in the file: Minimal (E-Ink colour scheme), Steph Ango (kepano), MIT
- Source: https://github.com/kepano/obsidian-minimal/blob/93321bdc23fc879966e1e3aa0cfeda77012f540f/theme.css
- Commit or tag: 93321bdc23fc879966e1e3aa0cfeda77012f540f
- Licence: MIT, (c) 2020-2024 Steph Ango
- Author: Steph Ango (kepano)
- Mapping: Minimal's own minimal-eink-light / minimal-eink-dark colour scheme: pure black on white and white on black, page and panels the same colour (flat surfaces). The scheme is monochrome, so no semantic colours are set; Minimal's default ones are not borrowed.
- Structural choices: `surface-mode: flat`, `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: outline`, `radius: soft`
- Structural sources: The E-Ink scheme belongs to Minimal: system sans body and headings (`system`), `font-size: 16`; tags are outlined with a 1.25px border in the text colour: `outline`; radii are Obsidian's: `soft`. Surface stays `flat`.
- Contrast adjustments: none

### Blue Topaz

- File: `blue-topaz.verso-theme` (mode both) — SHA-256: `76b35c424b38510156f761b911aff38e28f23be1d1b33f5060fbe0a53793aebf`
- Credit in the file: Blue Topaz, whyt-byte & Pkmer, MIT
- Source: https://github.com/pkm-er/Blue-Topaz_Obsidian-css/blob/8395f0d6d2966b517946dd2f202301d6b00763c4/theme.css
- Commit or tag: 8395f0d6d2966b517946dd2f202301d6b00763c4
- Licence: MIT, (c) 2020 whyt-byte
- Author: whyt-byte & Pkmer
- Mapping: Default colours without Style Settings choices; the six heading colours and the code colours are the theme's own. Fonts: Bookerly maps to the closest book serif key, `editorial`.
- Structural choices: `--heading-font: editorial`, `--book: editorial`, `--mono: mono`, `font-size: 16`, `table-style: bordered`, `tag-style: outline`, `radius: soft`
- Structural sources: Bookerly (body) and the heading levels inherit it, so the closest book serif key, `editorial` (Literata), for body and headings; JetBrains Mono: `mono`; `font-size: 16` (1em); tag with a 1px border: `outline`; table grid with tinted header: `bordered` (its alternate rows cannot be added to it); radii 3/5/7/15px: `soft`.
- Contrast adjustments: light `--h5-color` `#5aa0e2` → `#4e99e0` (3.02:1, adjusted for contrast); light `--h6-color` `#89b9e6` → `#5399db` (3.02:1, adjusted for contrast)

### Things

- File: `things.verso-theme` (mode both) — SHA-256: `0476f339086ffd733cfad75e6ef96cb294ef65cfdf8fd7a10f976e8a4a7173d1`
- Credit in the file: Things, Colin Eckert, MIT
- Source: https://github.com/colineckert/obsidian-things/blob/9b8bef93d3919f7693ac78597beaa35bbbd4cfff/theme.css
- Commit or tag: 9b8bef93d3919f7693ac78597beaa35bbbd4cfff
- Licence: MIT, (c) 2020-2021 Stephan Ango (@kepano)
- Author: Colin Eckert
- Mapping: Default hue/saturation/lightness variables resolved (base 212, accent 215). The theme's name is also the name of a third-party app (Things, Cultured Code): kept as the Obsidian theme's own name, credited, and flagged for the maintainer. Fonts: the theme's system sans stack maps to the system key.
- Structural choices: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `heading-style: rule`, `table-style: hairline`, `tag-style: pill`, `radius: soft`
- Structural sources: System sans (`system`), JetBrains / Fira mono (`mono`), `font-size: 16`; section headings carry a thin rule in the theme's capture: `heading-style: rule`; green pill tag: `pill`; radii 4/8/10/16: `soft`; heading colours were already the theme's.
- Contrast adjustments: light `--h4-color` `#e5b567` → `#c78822` (3.01:1, adjusted for contrast)

### Sanctum

- File: `sanctum.verso-theme` (mode both) — SHA-256: `9a1cc5b125a29c0ab0c015197cf03da0776499cc16ac892ed0a0ba2a6f84d6a5`
- Credit in the file: Sanctum, José Daniel Mourão (jdanielmourao), MIT
- Source: https://github.com/jdanielmourao/obsidian-sanctum/blob/ac69e5992a66d2aeabb30d8c2d90c636d155fc25/theme.css
- Commit or tag: ac69e5992a66d2aeabb30d8c2d90c636d155fc25
- Licence: MIT, (c) 2021-2022 José Daniel Mourão
- Author: José Daniel Mourão (jdanielmourao)
- Mapping: Page and panels are the same colour in the theme (--background-secondary equals --background-primary), so the surface mode is flat; Inter maps to the sans key.
- Structural choices: `surface-mode: flat`, `--heading-font: sans`, `--book: sans`, `font-size: 16`, `tag-style: pill`, `radius: soft`
- Structural sources: Inter: `sans`; `font-size: 16`; flat surface; pill tag with no border (radius 2em): `pill`; radii 4/8/10px, so `soft` — not `sharp`, as the spec §1.4 says (recorded contradiction, not decided here).
- Contrast adjustments: light `--seal` `#f68d45` → `#e8650b` (3.02:1, adjusted for contrast)

### Obsidianotion

- File: `obsidianotion.verso-theme` (mode both) — SHA-256: `b91748f64cb118b5f119668ea4fb03586ba7f5e4569c26134f9e588ce7a24c52`
- Credit in the file: Obsidianotion, Diego Eis, Unlicense
- Source: https://github.com/diegoeis/obsidianotion/blob/420469845836be3f116d9070e7548362289b8ee7/theme.css
- Commit or tag: 420469845836be3f116d9070e7548362289b8ee7
- Licence: Unlicense, public domain
- Author: Diego Eis
- Mapping: The theme's own light and dark variables; its system-ui font stack maps to the system key. The name stays the theme's own (it is not called Notion).
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: pill`, `radius: soft`
- Structural sources: ui-sans-serif / -apple-system stack: `system`; 16px; tags are pills (colour cycle not expressible): `pill`; radii 4/8/12/16: `soft`.
- Contrast adjustments: none

### Atom

- File: `atom.verso-theme` (mode both) — SHA-256: `2942674c704ee67ecc1a11dd90695cda397a8e8b9912fe5decf3b3110ebbb339`
- Credit in the file: Atom, kognise, Unlicense
- Source: https://github.com/kognise/obsidian-atom/blob/650d6463d377a096520373c4752fef66f3f18f46/obsidian.css
- Commit or tag: 650d6463d377a096520373c4752fef66f3f18f46
- Licence: Unlicense, public domain
- Author: kognise
- Mapping: The theme sets page, panel, border, text, muted text and accent for both sides and nothing else.
- Structural choices: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: pill`, `radius: soft`
- Structural sources: no font family is set by the theme, so Obsidian's system sans: `system`; `font-size: 16` is Obsidian's own default (`--font-text-size`); the theme does not change it; the tag is a rounded chip with 4px radius (theme.css, `a.tag`), radii are Obsidian's: `tag-style: pill`, `radius: soft`; the yellow tag colour cannot be set.
- Contrast adjustments: none

### Yin and Yang

- File: `yin-and-yang.verso-theme` (mode both) — SHA-256: `5fbb274045a0c251834513cd65c1e2f5917259d4b6697db54f71f55a496f0685`
- Credit in the file: Yin and Yang, Chetachi Ezikeuzor, MPL-2.0
- Source: https://github.com/chetachiezikeuzor/Yin-and-Yang-Theme/blob/e780f0d58301cfa11c05d0cc351ee82a95d920de/obsidian.css
- Commit or tag: e780f0d58301cfa11c05d0cc351ee82a95d920de
- Licence: MPL-2.0, Mozilla Public License 2.0 (colour values only; the CSS is not redistributed)
- Author: Chetachi Ezikeuzor
- Mapping: Page, panel, border, text and accent for both sides. The theme's accent colours are pastel and are corrected for contrast on the page.
- Structural choices: `--heading-font: sans`, `--book: sans`, `font-size: 17`, `radius: soft`
- Structural sources: Inter (`--default-font`): `sans`; `font-size: 17` (`--normal-font-size`); heading colours are the theme's `--text-title-h1`…`h6` (dark: pink, purple, red, orange, green, pale blue; light: light pink, purple, red, orange, green, cornflower blue); radii 4–6px: `soft`. Its pastels fail 3:1 on the light page and were darkened by the rule below.
- Contrast adjustments: light `--seal` `#cd94ff` → `#bc6fff` (3.01:1, adjusted for contrast); light `--h1-color` `#ffabf4` → `#ff33e4` (3.01:1, adjusted for contrast); light `--h2-color` `#d2b3ff` → `#ae76ff` (3.01:1, adjusted for contrast); light `--h3-color` `#ff5582` → `#ff5280` (3.04:1, adjusted for contrast); light `--h4-color` `#ffb86c` → `#e17400` (3.08:1, adjusted for contrast); light `--h5-color` `#85ffa4` → `#00ab2c` (3.00:1, adjusted for contrast); light `--h6-color` `#a1c4fd` → `#5192fb` (3.01:1, adjusted for contrast)

### Border

- File: `border.verso-theme` (mode both) — SHA-256: `5fda8b3eff0f0187c703be7407baee9339eafe73dfa806e9775d64dbf896b7ab`
- Credit in the file: Border, Akifyss, MIT
- Source: https://github.com/akifyss/obsidian-border/blob/dd59bd54438597f61b38eb5b967919e979526c41/theme.css
- Commit or tag: dd59bd54438597f61b38eb5b967919e979526c41
- Licence: MIT, (c) 2022 Akifyss
- Author: Akifyss
- Mapping: Colours resolved from the theme's default variables (its HSL chains computed).
- Structural choices: `--heading-font: sans`, `--book: sans`, `font-size: 16`, `table-style: bordered`, `tag-style: outline`, `radius: soft`
- Structural sources: Inter in the theme's own capture (Style Settings): `sans`; `font-size: 16`; 2em pill tag with a 1px border: `outline`; table grid: `bordered`; radii 8px (cards) and 6px (checkbox): `soft`. The cards layout is an optional Style Settings choice, not the default, so the default look (tonal surface) is kept and `surface-mode: cards` was removed; no heading style (an h1 rule and an h2 bar, mixed).
- Contrast adjustments: none

### Mapa de Conteúdo

- File: `mapa-de-conteudo.verso-theme` (mode dark) — SHA-256: `fc0e3f209f4a270e7e8861051b35f561ab3068b2b8041a8e19aed842f46d044a`
- Credit in the file: LYT Mode, Nick Milo, MIT
- Source: https://github.com/nickmilo/LYT-Mode/blob/28f67f18a24f5c8d3b58954eb8374bf2ecffbb50/theme.css
- Commit or tag: 28f67f18a24f5c8d3b58954eb8374bf2ecffbb50
- Licence: MIT, (c) 2022 nickmilo
- Author: Nick Milo
- Mapping: The theme's dark side only (it sets no light colours). Renamed from "LYT Mode": LYT (Linking Your Thinking) is the author's method and mark, and ADR 0109 item 7 keeps third-party marks out of names; the credit still names the original.
- Structural choices: `--heading-font: sans`, `--book: sans`, `--mono: mono`, `font-size: 16`, `tag-style: pill`, `radius: sharp`
- Structural sources: DM Sans (Inter as fallback): `sans`, DM Mono / Fira Code: `mono`, `font-size: 16`; radii 0/2/4px: `sharp`; dark tag pill: `pill`. Heading colours were already the theme's.
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
