# Theme catalogue

The themes Verso ships behind "More themes…" (ADR 0109, items 6, 7 and 8): `.verso-theme` files under `app/ui/themes/catalogue/`, read by the same reader as an imported theme. Each one was taken again from its source — the palette's own specification, or the theme's CSS at a pinned commit — and none carries CSS, a font file or a request: only colours, the closed font keys and the structural choices of `tokensVersion` 2.

`node scripts/check-theme-catalogue.mjs` (a step of `scripts/check.sh`) holds this page to the files: every theme must be listed here with its SHA-256, credit a licence on the allowlist and pass the 3:1 contrast floor in both modes.

## Rules

- Only themes whose repository licence is MIT, Unlicense or MPL-2.0, and open palettes with an official specification (ADR 0109 item 6, option A, decided 2026-10-22). Not shipped: the GPL themes and repositories with no licence.
- Every value is re-taken from the source named below; nothing is copied from the expanded-themes draft (its colours were found partly invented).
- Names (item 7, option A): an open palette keeps its name, an Obsidian-derived theme keeps its own with the credit; a name that is a third party's mark is not used.
- A colour under 3:1 against its page is replaced by the nearest colour of the same hue and saturation that passes, and the correction is listed under the theme.
- Fonts are Verso's closed keys; no font file is shipped. A structural choice (surface mode, radius…) is set only where the theme clearly has that character.

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

- File: `catppuccin-latte.verso-theme` (mode light) — SHA-256: `3dc442210d05245250f64007e39ea77ccb82400ae2cdf45bc3cec0d12cce435b`
- Credit in the file: Catppuccin Latte, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Contrast adjustments: none

### Catppuccin Frappé

- File: `catppuccin-frappe.verso-theme` (mode dark) — SHA-256: `112bc6f27296340fa2bb77ff4382fba4cd3ef6a8eb7be20ff46d0f039d8489e8`
- Credit in the file: Catppuccin Frappé, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Contrast adjustments: none

### Catppuccin Macchiato

- File: `catppuccin-macchiato.verso-theme` (mode dark) — SHA-256: `e368f19a2b30290906ac9d2f07ae04166e214086c29830d17951da5a0aacde5e`
- Credit in the file: Catppuccin Macchiato, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Contrast adjustments: none

### Catppuccin Mocha

- File: `catppuccin-mocha.verso-theme` (mode dark) — SHA-256: `c021f8e4e7a02297729dad16b90553e6b2cb07f746cb373c25b37d0bdd264228`
- Credit in the file: Catppuccin Mocha, Catppuccin, MIT
- Source: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit or tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licence: MIT, (c) 2021 Catppuccin
- Author: Catppuccin
- Mapping: Base, Mantle, Surface 0, Text and Subtext 0 for the surfaces and text; links in Blue and the headline in Text, as Catppuccin's style guide assigns them (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); inline code in Text on Mantle; Peach is the orange, Teal the cyan, Mauve the purple.
- Contrast adjustments: none

### Nord

- File: `nord.verso-theme` (mode dark) — SHA-256: `3f5725420a228f31680fce5fef1a514af57cdc578916e2a55ee88a326531ad4e`
- Credit in the file: Nord, Sven Greb (Arctic Ice Studio), MIT
- Source: https://github.com/nordtheme/nord/blob/1cef71605416a222e57225b544540ce0fcec18d4/src/nord.css
- Commit or tag: 1cef71605416a222e57225b544540ce0fcec18d4 (develop, tag v0.2.0 is older)
- Licence: MIT, (c) 2016-present Sven Greb
- Author: Sven Greb
- Mapping: Polar Night nord0 / nord1 / nord2 for page, panels and lines; nord4 text; links in Frost nord8, headings nord9; the Aurora colours for the semantic ones (no pink in the palette: omitted). Nord has no light palette, so none is shipped. ink-2 is nord3, the palette's comment colour.
- Contrast adjustments: dark `--ink-2` `#4c566a` → `#6f7d98` (3.01:1, adjusted for contrast)

### Dracula

- File: `dracula.verso-theme` (mode dark) — SHA-256: `1d11ae351cf69770bca020fccc733b02a22bcdc52b97fd7cd406430ca4665101`
- Credit in the file: Dracula, Zeno Rocha, MIT
- Source: https://github.com/dracula/dracula-theme/blob/e22ebcc048b8aff586f9bc94db30ff5347070b42/README.md and https://draculatheme.com/spec (UI palette, read 2026-10-22)
- Commit or tag: e22ebcc048b8aff586f9bc94db30ff5347070b42 (tag v1.2.5 is older)
- Licence: MIT, (c) 2023 Dracula Theme
- Author: Zeno Rocha
- Mapping: Background, Foreground, Comment, Current Line and the functional colours from the README palette; "Background Dark" #21222C and "Floating interactive elements" #343746 from the spec's UI table. Borders use Current Line, as the spec's component guidelines say. Dracula's spec has no Blue, so --blue is the Purple (the spec maps ANSI blue to it). The spec asks for 4.5:1 text contrast and "exact colour values"; the comment colour used for ink-2 is under 4.5:1 and is corrected only to the 3:1 floor, if needed.
- Contrast adjustments: none

### Dracula Alucard

- File: `dracula-alucard.verso-theme` (mode light) — SHA-256: `98f1fe25367e20fdd7b9bd02af268daac4f75eddbf7cfcec14de19e0473daad6`
- Credit in the file: Dracula Alucard, Zeno Rocha, MIT
- Source: https://github.com/dracula/dracula-theme/blob/e22ebcc048b8aff586f9bc94db30ff5347070b42/README.md and https://draculatheme.com/spec (Alucard UI palette)
- Commit or tag: e22ebcc048b8aff586f9bc94db30ff5347070b42
- Licence: MIT, (c) 2023 Dracula Theme
- Author: Zeno Rocha
- Mapping: Dracula's own light palette, Alucard (README "Alucard" table and the spec's UI table); it is not an invented light for Dracula. Same mapping as Dracula; Verso names it "Dracula Alucard" to say whose palette it is.
- Contrast adjustments: none

### Rosé Pine

- File: `rose-pine.verso-theme` (mode both) — SHA-256: `4672222f48912229d67bf803320306dc2f0efd4e523ace9bc491c29ed2bbc34c`
- Credit in the file: Rosé Pine, Rosé Pine, MIT
- Source: https://github.com/rose-pine/palette/blob/92af52b465ab6e47437aca223c9b8d3009a2023b/palette.json
- Commit or tag: 92af52b465ab6e47437aca223c9b8d3009a2023b (tag v4.0.1)
- Licence: MIT, (c) mvllow
- Author: Rosé Pine
- Mapping: Base / Surface / Overlay for page, panels and lines; Text and Subtle for text; Iris for links, Rose for headings; Love, Gold, Foam, Pine, Iris and Rose for red, yellow, cyan, blue, purple and pink. Rosé Pine has no orange or green: left to Verso's own. Dark is Rosé Pine (main), light is Dawn.
- Contrast adjustments: light `--brass-ink` `#d7827e` → `#d2726d` (3.02:1, adjusted for contrast)

### Rosé Pine Moon

- File: `rose-pine-moon.verso-theme` (mode dark) — SHA-256: `16d4f782859d1671bf08281f706928380c2090fbf519a9309af05db58f797f5e`
- Credit in the file: Rosé Pine Moon, Rosé Pine, MIT
- Source: https://github.com/rose-pine/palette/blob/92af52b465ab6e47437aca223c9b8d3009a2023b/palette.json
- Commit or tag: 92af52b465ab6e47437aca223c9b8d3009a2023b (tag v4.0.1)
- Licence: MIT, (c) mvllow
- Author: Rosé Pine
- Mapping: Base / Surface / Overlay for page, panels and lines; Text and Subtle for text; Iris for links, Rose for headings; Love, Gold, Foam, Pine, Iris and Rose for red, yellow, cyan, blue, purple and pink. Rosé Pine has no orange or green: left to Verso's own.
- Contrast adjustments: none

### Everforest

- File: `everforest.verso-theme` (mode both) — SHA-256: `83cf0470fd7652ea948ba97d3779483ed5774f19345626a1235b1419d718b6e3`
- Credit in the file: Everforest, sainnhe, MIT
- Source: https://github.com/sainnhe/everforest/blob/85a86eb62409e3ec88713bff3d1b9d7374e112e4/docs/palette.md
- Commit or tag: 85a86eb62409e3ec88713bff3d1b9d7374e112e4 (tag v0.3.0)
- Licence: MIT, (c) 2019 sainnhe
- Author: sainnhe
- Mapping: The palette's medium-contrast variant, dark and light. bg0 / bg1 / bg2 (dark) and bg0 / bg1 / bg4 (light) for the surfaces; fg for text, grey2 (dark) and grey1 (light) for muted text; green for links and yellow for headings; the accent row for the semantic colours (aqua is the cyan). The light accents are pale on the light page and several are corrected for contrast (see adjustments).
- Contrast adjustments: light `--ink-2` `#939f91` → `#849282` (3.03:1, adjusted for contrast); light `--seal` `#8da101` → `#859801` (3:1, adjusted for contrast); light `--brass-ink` `#dfa000` → `#ba8500` (3.02:1, adjusted for contrast)

### Gruvbox

- File: `gruvbox.verso-theme` (mode both) — SHA-256: `978e18f8b475324eed947b9ef7f4110ba905bc89a0f7c8c5325702cd303dd501`
- Credit in the file: Gruvbox, Pavel Pertsev (morhetz), MIT
- Source: https://github.com/gruvbox-community/gruvbox/blob/180ad85971343df68be3422a5630fa84e45a9ab2/colors/gruvbox.vim
- Commit or tag: 180ad85971343df68be3422a5630fa84e45a9ab2 (tag v3.6.1)
- Licence: MIT, (c) 2018 Pavel Pertsev (community fork; morhetz/gruvbox, the original, has no LICENSE file)
- Author: Pavel Pertsev (morhetz)
- Mapping: The palette and the dark/light role table of colors/gruvbox.vim: dark uses bg0 / bg1 / bg2, fg1 and fg4 with the bright accents; light uses light0 / light1 / light2, dark1 and dark4 with the faded accents. Links in blue, headings in yellow, as the vim script's Markdown groups do. The community fork is credited because the original repository carries no licence file.
- Contrast adjustments: none

### Solarized

- File: `solarized.verso-theme` (mode both) — SHA-256: `ece02448fb49f8db0d8fa3aeb91c6c994840c9f2b246a70991fca21e1d396576`
- Credit in the file: Solarized, Ethan Schoonover, MIT
- Source: https://github.com/altercation/solarized/blob/62f656a02f93c5190a8753159e34b385588d5ff3/README.md ("The Values" table)
- Commit or tag: 62f656a02f93c5190a8753159e34b385588d5ff3 (tag v1.0.0beta1)
- Licence: MIT, (c) 2011 Ethan Schoonover
- Author: Ethan Schoonover
- Mapping: The 16 values of the README table, with Solarized's own light/dark role swap: base3 / base2 (light) and base03 / base02 (dark) for page and panels, base00 / base0 for body text, base1 / base01 for secondary content, blue for links, orange for headings; magenta is the pink and violet the purple. The secondary text colours are below the floor on the page (the palette is low contrast by design) and are corrected.
- Contrast adjustments: light `--ink-2` `#93a1a1` → `#829292` (3.01:1, adjusted for contrast); dark `--ink-2` `#586e75` → `#5d747c` (3.04:1, adjusted for contrast)

### Flexoki

- File: `flexoki.verso-theme` (mode both) — SHA-256: `1b71ebe7f06f836e90c35fcc758d785ee2249b68911471878f873aae642722f2`
- Credit in the file: Flexoki, Steph Ango (kepano), stephango.com/flexoki, MIT
- Source: https://github.com/kepano/flexoki/blob/8d723bac4a9ac46adfdf99d42155286977aac72a/README.md
- Commit or tag: 8d723bac4a9ac46adfdf99d42155286977aac72a (tag 2.0.0)
- Licence: MIT, (c) 2023 Steph Ango
- Author: Steph Ango
- Mapping: Flexoki's scale as its README gives it: paper / base-50 / base-100 and black / base-950 / base-900 for surfaces and lines, black and base-200 for text, base-600 and base-500 for muted text; the 600 accents on the light side and the 400 accents on the dark side; blue for links, orange for headings. Flexoki's README asks ports to "include attribution and a link to stephango.com/flexoki": the author line of the credit carries it and the Credits page must show it.
- Contrast adjustments: none

### Tokyo Night

- File: `tokyo-night.verso-theme` (mode both) — SHA-256: `f02150c5f754fff9e1750dd44ec868d918e5268cd8f854fc4907e3608ad5ca80`
- Credit in the file: Tokyo Night, enkia (Tokyo Night VS Code theme), MIT
- Source: https://github.com/tokyo-night/tokyo-night-vscode-theme/blob/7c0f11eaef322f293621ca7befe462214b7ea468/themes/tokyo-night-color-theme.json and tokyo-night-light-color-theme.json
- Commit or tag: 7c0f11eaef322f293621ca7befe462214b7ea468
- Licence: MIT (LICENSE.txt)
- Author: enkia
- Mapping: Read from the two VS Code colour themes: editor and side-bar backgrounds, editor and description text, the link colour, the text-code-block background and the Markdown heading 1 to 6 colours and inline-code colour of the token rules; the ANSI colours for red, yellow, green, cyan, blue and purple (Tokyo Night has no orange or pink in those). Dark is "Tokyo Night", light is the theme's own light variant.
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

- File: `ayu-dark.verso-theme` (mode dark) — SHA-256: `1143f49e916593403184f50910e2cab9bce687d06d5a55be9e6fb2e0aa9ea115`
- Credit in the file: Ayu Dark, Konstantin Pschera, MIT
- Source: https://github.com/ayu-theme/ayu-colors/blob/d461f02983546636bc6e1e0c48190fdb74036426/themes/dark.yaml
- Commit or tag: d461f02983546636bc6e1e0c48190fdb74036426 (tag v8.0.1)
- Licence: MIT, (c) Konstantin Pschera
- Author: Konstantin Pschera
- Mapping: The YAML theme's own values: editor background (surface lift) for the page, surface base for panels, editor and UI foregrounds for text, the accent tint for links, the palette orange for headings, ui.line (or surface sunk) for lines; palette red, orange, yellow, green, teal (cyan), blue and purple. Ayu's palette has no pink of its own: omitted. Values the YAML derives with colour expressions (syntax roles) are not used.
- Contrast adjustments: none

### Minimal

- File: `minimal.verso-theme` (mode both) — SHA-256: `d35061592d5cc0af360d1d6b76879eaa2a20b206f28c4777b675bb22ebd73799`
- Credit in the file: Minimal, Steph Ango (kepano), MIT
- Source: https://github.com/kepano/obsidian-minimal/blob/93321bdc23fc879966e1e3aa0cfeda77012f540f/theme.css
- Commit or tag: 93321bdc23fc879966e1e3aa0cfeda77012f540f
- Licence: MIT, (c) 2020-2024 Steph Ango
- Author: Steph Ango (kepano)
- Mapping: The default colour scheme (minimal-default-light / minimal-default-dark) with the theme's own base and accent variables resolved; Minimal sets no heading or code colours of its own in that scheme, so the headline is the text colour and the code colours are left to Verso.
- Contrast adjustments: none

### E-Ink

- File: `e-ink.verso-theme` (mode both) — SHA-256: `d93995c2810e95ee94560f2e66ef9da81cc24c73393d005d51ef799e8ef77486`
- Credit in the file: Minimal (E-Ink colour scheme), Steph Ango (kepano), MIT
- Source: https://github.com/kepano/obsidian-minimal/blob/93321bdc23fc879966e1e3aa0cfeda77012f540f/theme.css
- Commit or tag: 93321bdc23fc879966e1e3aa0cfeda77012f540f
- Licence: MIT, (c) 2020-2024 Steph Ango
- Author: Steph Ango (kepano)
- Mapping: Minimal's own minimal-eink-light / minimal-eink-dark colour scheme: pure black on white and white on black, page and panels the same colour (flat surfaces). The scheme is monochrome, so no semantic colours are set; Minimal's default ones are not borrowed.
- Structural choices: `surface-mode: flat`
- Contrast adjustments: none

### Blue Topaz

- File: `blue-topaz.verso-theme` (mode both) — SHA-256: `1b5c8351614013a4b6aca5c75c5177efbfb32222b996eb82ec2630a87c624ac8`
- Credit in the file: Blue Topaz, whyt-byte & Pkmer, MIT
- Source: https://github.com/pkm-er/Blue-Topaz_Obsidian-css/blob/8395f0d6d2966b517946dd2f202301d6b00763c4/theme.css
- Commit or tag: 8395f0d6d2966b517946dd2f202301d6b00763c4
- Licence: MIT, (c) 2020 whyt-byte
- Author: whyt-byte & Pkmer
- Mapping: Default colours without Style Settings choices; the six heading colours and the code colours are the theme's own. Fonts (Bookerly, Inter) are not mapped.
- Contrast adjustments: light `--h5-color` `#5aa0e2` → `#4e99e0` (3.02:1, adjusted for contrast); light `--h6-color` `#89b9e6` → `#5399db` (3.02:1, adjusted for contrast)

### Things

- File: `things.verso-theme` (mode both) — SHA-256: `c9f5bd83e559dfbeadf29b4eaca090dbde95bcec720534e750ee84c1ed4c4fd3`
- Credit in the file: Things, Colin Eckert, MIT
- Source: https://github.com/colineckert/obsidian-things/blob/9b8bef93d3919f7693ac78597beaa35bbbd4cfff/theme.css
- Commit or tag: 9b8bef93d3919f7693ac78597beaa35bbbd4cfff
- Licence: MIT, (c) 2020-2021 Stephan Ango (@kepano)
- Author: Colin Eckert
- Mapping: Default hue/saturation/lightness variables resolved (base 212, accent 215). The theme's name is also the name of a third-party app (Things, Cultured Code): kept as the Obsidian theme's own name, credited, and flagged for the maintainer. Fonts: the theme's system sans stack maps to the system key.
- Structural choices: `--heading-font: system`, `--book: system`, `--mono: mono`
- Contrast adjustments: light `--h4-color` `#e5b567` → `#c78822` (3.01:1, adjusted for contrast)

### Sanctum

- File: `sanctum.verso-theme` (mode both) — SHA-256: `2639e3508e8d20f9337d553192ced16005c8c28f3e515895661ef485c12b6462`
- Credit in the file: Sanctum, José Daniel Mourão (jdanielmourao), MIT
- Source: https://github.com/jdanielmourao/obsidian-sanctum/blob/ac69e5992a66d2aeabb30d8c2d90c636d155fc25/theme.css
- Commit or tag: ac69e5992a66d2aeabb30d8c2d90c636d155fc25
- Licence: MIT, (c) 2021-2022 José Daniel Mourão
- Author: José Daniel Mourão (jdanielmourao)
- Mapping: Page and panels are the same colour in the theme (--background-secondary equals --background-primary), so the surface mode is flat; Inter maps to the sans key.
- Structural choices: `surface-mode: flat`, `--heading-font: sans`, `--book: sans`
- Contrast adjustments: light `--seal` `#f68d45` → `#e8650b` (3.02:1, adjusted for contrast)

### Obsidianotion

- File: `obsidianotion.verso-theme` (mode both) — SHA-256: `e8b68368fb229a5499a0c98539c1327d49038eb713b99d079b08523b6fc0a0ed`
- Credit in the file: Obsidianotion, Diego Eis, Unlicense
- Source: https://github.com/diegoeis/obsidianotion/blob/420469845836be3f116d9070e7548362289b8ee7/theme.css
- Commit or tag: 420469845836be3f116d9070e7548362289b8ee7
- Licence: Unlicense, public domain
- Author: Diego Eis
- Mapping: The theme's own light and dark variables; its system-ui font stack maps to the system key. The name stays the theme's own (it is not called Notion).
- Structural choices: `--heading-font: system`, `--book: system`
- Contrast adjustments: none

### Atom

- File: `atom.verso-theme` (mode both) — SHA-256: `6025062b6607b278210f9097d498cb74d4062201c336383a43e4fb49d1350330`
- Credit in the file: Atom, kognise, Unlicense
- Source: https://github.com/kognise/obsidian-atom/blob/650d6463d377a096520373c4752fef66f3f18f46/obsidian.css
- Commit or tag: 650d6463d377a096520373c4752fef66f3f18f46
- Licence: Unlicense, public domain
- Author: kognise
- Mapping: The theme sets page, panel, border, text, muted text and accent for both sides and nothing else.
- Contrast adjustments: none

### Yin and Yang

- File: `yin-and-yang.verso-theme` (mode both) — SHA-256: `a5dadc158bc0c76bcd5ea32705988382aeefe07e3515a9739f5623c105179ce9`
- Credit in the file: Yin and Yang, Chetachi Ezikeuzor, MPL-2.0
- Source: https://github.com/chetachiezikeuzor/Yin-and-Yang-Theme/blob/e780f0d58301cfa11c05d0cc351ee82a95d920de/obsidian.css
- Commit or tag: e780f0d58301cfa11c05d0cc351ee82a95d920de
- Licence: MPL-2.0, Mozilla Public License 2.0 (colour values only; the CSS is not redistributed)
- Author: Chetachi Ezikeuzor
- Mapping: Page, panel, border, text and accent for both sides. The theme's accent colours are pastel and are corrected for contrast on the page.
- Contrast adjustments: light `--seal` `#cd94ff` → `#bc6fff` (3.01:1, adjusted for contrast)

### Border

- File: `border.verso-theme` (mode both) — SHA-256: `f72a503e7ef344667ee6a1fca03f86e6309c9c9b1f3b0b23d51558554a162445`
- Credit in the file: Border, Akifyss, MIT
- Source: https://github.com/akifyss/obsidian-border/blob/dd59bd54438597f61b38eb5b967919e979526c41/theme.css
- Commit or tag: dd59bd54438597f61b38eb5b967919e979526c41
- Licence: MIT, (c) 2022 Akifyss
- Author: Akifyss
- Mapping: Colours resolved from the theme's default variables (its HSL chains computed); panels float as bordered cards, which is the theme's character, so surface-mode is cards.
- Structural choices: `surface-mode: cards`
- Contrast adjustments: none

### Mapa de Conteúdo

- File: `mapa-de-conteudo.verso-theme` (mode dark) — SHA-256: `cfe9a5da9c921a7534f58a71b0c7322e69e823be741fcacb64b6f310e753e7af`
- Credit in the file: LYT Mode, Nick Milo, MIT
- Source: https://github.com/nickmilo/LYT-Mode/blob/28f67f18a24f5c8d3b58954eb8374bf2ecffbb50/theme.css
- Commit or tag: 28f67f18a24f5c8d3b58954eb8374bf2ecffbb50
- Licence: MIT, (c) 2022 nickmilo
- Author: Nick Milo
- Mapping: The theme's dark side only (it sets no light colours). Renamed from "LYT Mode": LYT (Linking Your Thinking) is the author's method and mark, and ADR 0109 item 7 keeps third-party marks out of names; the credit still names the original.
- Contrast adjustments: none

## Not shipped

- **GPL themes** (ADR 0109 item 6): AnuPpuccin (GPL-3.0; its palette is Catppuccin, which ships), Primary (GPL-3.0), Velocity (GPL-3.0), Fancy-a-Story (GPL-3.0), Typewriter (GPL-3.0), ITS Theme (GPL-2.0) and its "WotC D&D" variant (also a third party's mark).
- **No licence file:** the Ayu repositories listed in the Obsidian catalogue (Ayu is shipped from its official, MIT `ayu-theme/ayu-colors`) and the original `morhetz/gruvbox` (shipped from the MIT community fork `gruvbox-community/gruvbox`).
- **Licence fine, colours not shipped in this pass:** Baseline and Cupertino (a palette computed with `oklch()` and `pow()` from the user's chosen hue: there is no fixed set of values to take), Maple, Prism (palettes built from several selectable schemes through `:not()` chains and runtime variables), Shimmering Focus (colours behind `color-mix()` and layered variables), Shiba Inu (twelve selectable accents, none the default) and Red Graphite (its light side has a dark side panel that Verso's surface modes cannot yet express). Each can be added by taking its values again from the source in a later pass.
- **Dracula light:** Dracula has no light palette of its own other than Alucard, which ships under that name; no light was invented.
