# Catálogo de temas

Os temas que o Verso entrega atrás de "Mais temas…" (ADR 0109, itens 6, 7 e 8): arquivos `.verso-theme` em `app/ui/themes/catalogue/`, lidos pelo mesmo leitor de um tema importado. Cada um foi tirado de novo da sua fonte — a especificação da própria paleta, ou o CSS do tema em um commit fixado — e nenhum leva CSS, arquivo de fonte ou requisição: só cores, as chaves fechadas de fonte e as escolhas estruturais do `tokensVersion` 2.

`node scripts/check-theme-catalogue.mjs` (um passo de `scripts/check.sh`) prende esta página aos arquivos: todo tema deve estar listado aqui com seu SHA-256, creditar uma licença da lista permitida e passar o piso de contraste de 3:1 nos dois modos.

## Regras

- Só temas cuja licença do repositório é MIT, Unlicense ou MPL-2.0, e paletas abertas com especificação oficial (ADR 0109 item 6, opção A, decidido em 2026-10-22). Não entregues: os temas GPL e repositórios sem licença.
- Todo valor é tirado de novo da fonte nomeada abaixo; nada é copiado do rascunho de temas expandidos (suas cores foram achadas em parte inventadas).
- Nomes (item 7, opção A): uma paleta aberta mantém seu nome, um tema derivado do Obsidian mantém o seu com o crédito; um nome que é marca de terceiro não é usado.
- Uma cor abaixo de 3:1 contra a página é trocada pela cor mais próxima, do mesmo matiz e saturação, que passa, e a correção é listada sob o tema.
- As fontes são as chaves fechadas do Verso; nenhum arquivo de fonte é entregue. Uma escolha estrutural (modo de superfície, raio…) só é definida onde o tema tem claramente esse caráter.

## Mapeamento

As variáveis do Obsidian viram tokens do Verso: `--background-primary` em `--paper`, `--background-secondary` em `--paper-2`, `--background-modifier-border` em `--hair`, `--text-normal` em `--ink`, `--text-muted` em `--ink-2`, `--text-accent` (ou `--interactive-accent`) em `--seal`, a primeira cor de título em `--brass-ink` (a cor do texto quando o tema não define), `--code-background` e `--code-normal` em `--code-paper` e `--code-ink`, `--h1-color` a `--h6-color` como estão, `--color-red` a `--color-pink` nos tokens semânticos. Variáveis definidas em cadeia (`hsl(var(--x) …)`, `calc()`) foram resolvidas até a cor final com um pequeno resolvedor sobre o CSS do tema e escritas como `#rrggbb`; onde o tema se apoia nos padrões documentados do Obsidian (`--background-primary` é `--color-base-00`, `--color-accent` é o HSL de acento), essas relações foram aplicadas. Um token que o tema não define é omitido, e o Verso o deriva.

As paletas mapeiam por papel: página, painel, linha, texto, texto discreto, link, título, código e a linha de acentos nos tokens semânticos; as notas de cada tema dizem qual.

## Contraste

Os pares verificados nos dois modos são `--ink`, `--ink-2`, `--seal` e `--brass-ink` sobre `--paper`, `--code-ink` sobre `--code-paper` (sobre `--paper-2` quando o tema não define fundo de código) e cada `--hN-color` sobre `--paper`. O piso é 3:1 (ADR 0109 item 3); o aviso de 4,5:1 é do construtor, não do catálogo, e várias paletas ficam entre os dois por desenho.

## Diretrizes de porte

- **Catppuccin** (`docs/port-creation.md`, `docs/style-guide.md` em catppuccin/catppuccin): portes são adaptações da paleta; o guia atribui Base à página, Mantle e Crust aos painéis, Text ao corpo e ao título, Subtext 0 / 1 a subtítulos e rótulos, Overlay 1 ao texto sutil, Blue aos links e as cores de acento ao status. Contribuições são publicadas sob MIT. As regras de porte oficial (repositório na organização, `catppuccin/<app>`, um Port Review) dizem respeito a repositórios, não a um arquivo de tema dentro de outro app; os arquivos do Verso creditam a paleta e não se apresentam como porte oficial. Os nomes são os dos quatro sabores.
- **Dracula** (`README.md` e https://draculatheme.com/spec): "use valores exatos de cor desta especificação", mantenha contraste de texto 4,5:1, bordas sutis em Current Line, cores de status Green / Orange / Red / Cyan, anel de foco roxo. MIT, (c) Dracula Theme. O processo de submissão da organização (um repositório a partir do template) diz respeito a portes oficiais; o arquivo do Verso é uma adaptação creditada, não um deles. Nenhuma política de marca foi encontrada; o nome é usado como o da paleta.
- **Flexoki** (`README.md`): MIT, e os portes devem "incluir atribuição e um link para stephango.com/flexoki" — levado na linha de autor do crédito.
- As outras paletas (Nord, Rosé Pine, Everforest, Gruvbox, Solarized, Tokyo Night, Ayu) não declaram regras de porte além da licença MIT; seus detentores de copyright estão em cada entrada.

## Temas

### Catppuccin Latte

- Arquivo: `catppuccin-latte.verso-theme` (modo light) — SHA-256: `3dc442210d05245250f64007e39ea77ccb82400ae2cdf45bc3cec0d12cce435b`
- Crédito no arquivo: Catppuccin Latte, Catppuccin, MIT
- Fonte: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit ou tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licença: MIT, (c) 2021 Catppuccin
- Autor: Catppuccin
- Mapeamento: Base, Mantle, Surface 0, Text e Subtext 0 para superfícies e texto; links em Blue e título em Text, como o guia de estilo do Catppuccin atribui (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); código em linha em Text sobre Mantle; Peach é o laranja, Teal o ciano, Mauve o roxo.
- Ajustes de contraste: nenhum

### Catppuccin Frappé

- Arquivo: `catppuccin-frappe.verso-theme` (modo dark) — SHA-256: `112bc6f27296340fa2bb77ff4382fba4cd3ef6a8eb7be20ff46d0f039d8489e8`
- Crédito no arquivo: Catppuccin Frappé, Catppuccin, MIT
- Fonte: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit ou tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licença: MIT, (c) 2021 Catppuccin
- Autor: Catppuccin
- Mapeamento: Base, Mantle, Surface 0, Text e Subtext 0 para superfícies e texto; links em Blue e título em Text, como o guia de estilo do Catppuccin atribui (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); código em linha em Text sobre Mantle; Peach é o laranja, Teal o ciano, Mauve o roxo.
- Ajustes de contraste: nenhum

### Catppuccin Macchiato

- Arquivo: `catppuccin-macchiato.verso-theme` (modo dark) — SHA-256: `e368f19a2b30290906ac9d2f07ae04166e214086c29830d17951da5a0aacde5e`
- Crédito no arquivo: Catppuccin Macchiato, Catppuccin, MIT
- Fonte: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit ou tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licença: MIT, (c) 2021 Catppuccin
- Autor: Catppuccin
- Mapeamento: Base, Mantle, Surface 0, Text e Subtext 0 para superfícies e texto; links em Blue e título em Text, como o guia de estilo do Catppuccin atribui (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); código em linha em Text sobre Mantle; Peach é o laranja, Teal o ciano, Mauve o roxo.
- Ajustes de contraste: nenhum

### Catppuccin Mocha

- Arquivo: `catppuccin-mocha.verso-theme` (modo dark) — SHA-256: `c021f8e4e7a02297729dad16b90553e6b2cb07f746cb373c25b37d0bdd264228`
- Crédito no arquivo: Catppuccin Mocha, Catppuccin, MIT
- Fonte: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit ou tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licença: MIT, (c) 2021 Catppuccin
- Autor: Catppuccin
- Mapeamento: Base, Mantle, Surface 0, Text e Subtext 0 para superfícies e texto; links em Blue e título em Text, como o guia de estilo do Catppuccin atribui (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); código em linha em Text sobre Mantle; Peach é o laranja, Teal o ciano, Mauve o roxo.
- Ajustes de contraste: nenhum

### Nord

- Arquivo: `nord.verso-theme` (modo dark) — SHA-256: `3f5725420a228f31680fce5fef1a514af57cdc578916e2a55ee88a326531ad4e`
- Crédito no arquivo: Nord, Sven Greb (Arctic Ice Studio), MIT
- Fonte: https://github.com/nordtheme/nord/blob/1cef71605416a222e57225b544540ce0fcec18d4/src/nord.css
- Commit ou tag: 1cef71605416a222e57225b544540ce0fcec18d4 (develop, tag v0.2.0 is older)
- Licença: MIT, (c) 2016-present Sven Greb
- Autor: Sven Greb
- Mapeamento: Polar Night nord0 / nord1 / nord2 para página, painéis e linhas; nord4 no texto; links em Frost nord8, títulos em nord9; as cores Aurora para as semânticas (a paleta não tem rosa: omitido). O Nord não tem paleta clara, então nenhuma é entregue. ink-2 é nord3, a cor de comentário da paleta.
- Ajustes de contraste: dark `--ink-2` `#4c566a` → `#6f7d98` (3.01:1, ajustado para contraste)

### Dracula

- Arquivo: `dracula.verso-theme` (modo dark) — SHA-256: `1d11ae351cf69770bca020fccc733b02a22bcdc52b97fd7cd406430ca4665101`
- Crédito no arquivo: Dracula, Zeno Rocha, MIT
- Fonte: https://github.com/dracula/dracula-theme/blob/e22ebcc048b8aff586f9bc94db30ff5347070b42/README.md and https://draculatheme.com/spec (UI palette, read 2026-10-22)
- Commit ou tag: e22ebcc048b8aff586f9bc94db30ff5347070b42 (tag v1.2.5 is older)
- Licença: MIT, (c) 2023 Dracula Theme
- Autor: Zeno Rocha
- Mapeamento: Background, Foreground, Comment, Current Line e as cores funcionais da paleta do README; "Background Dark" #21222C e "Floating interactive elements" #343746 da tabela de UI da especificação. Bordas usam Current Line, como as diretrizes de componentes da especificação. A especificação não tem Blue, então --blue é o Purple (ela mapeia o azul ANSI para ele). A especificação pede contraste 4,5:1 no texto e "valores exatos de cor"; a cor de comentário usada em ink-2 fica abaixo de 4,5:1 e só é corrigida até o piso de 3:1, se preciso.
- Ajustes de contraste: nenhum

### Dracula Alucard

- Arquivo: `dracula-alucard.verso-theme` (modo light) — SHA-256: `98f1fe25367e20fdd7b9bd02af268daac4f75eddbf7cfcec14de19e0473daad6`
- Crédito no arquivo: Dracula Alucard, Zeno Rocha, MIT
- Fonte: https://github.com/dracula/dracula-theme/blob/e22ebcc048b8aff586f9bc94db30ff5347070b42/README.md and https://draculatheme.com/spec (Alucard UI palette)
- Commit ou tag: e22ebcc048b8aff586f9bc94db30ff5347070b42
- Licença: MIT, (c) 2023 Dracula Theme
- Autor: Zeno Rocha
- Mapeamento: A paleta clara do próprio Dracula, Alucard (tabela "Alucard" do README e tabela de UI da especificação); não é um claro inventado para o Dracula. Mesmo mapeamento do Dracula; o Verso a chama de "Dracula Alucard" para dizer de quem é a paleta.
- Ajustes de contraste: nenhum

### Rosé Pine

- Arquivo: `rose-pine.verso-theme` (modo both) — SHA-256: `4672222f48912229d67bf803320306dc2f0efd4e523ace9bc491c29ed2bbc34c`
- Crédito no arquivo: Rosé Pine, Rosé Pine, MIT
- Fonte: https://github.com/rose-pine/palette/blob/92af52b465ab6e47437aca223c9b8d3009a2023b/palette.json
- Commit ou tag: 92af52b465ab6e47437aca223c9b8d3009a2023b (tag v4.0.1)
- Licença: MIT, (c) mvllow
- Autor: Rosé Pine
- Mapeamento: Base / Surface / Overlay para página, painéis e linhas; Text e Subtle para o texto; Iris nos links, Rose nos títulos; Love, Gold, Foam, Pine, Iris e Rose para vermelho, amarelo, ciano, azul, roxo e rosa. O Rosé Pine não tem laranja nem verde: ficam os do Verso. O escuro é o Rosé Pine (main), o claro é o Dawn.
- Ajustes de contraste: light `--brass-ink` `#d7827e` → `#d2726d` (3.02:1, ajustado para contraste)

### Rosé Pine Moon

- Arquivo: `rose-pine-moon.verso-theme` (modo dark) — SHA-256: `16d4f782859d1671bf08281f706928380c2090fbf519a9309af05db58f797f5e`
- Crédito no arquivo: Rosé Pine Moon, Rosé Pine, MIT
- Fonte: https://github.com/rose-pine/palette/blob/92af52b465ab6e47437aca223c9b8d3009a2023b/palette.json
- Commit ou tag: 92af52b465ab6e47437aca223c9b8d3009a2023b (tag v4.0.1)
- Licença: MIT, (c) mvllow
- Autor: Rosé Pine
- Mapeamento: Base / Surface / Overlay para página, painéis e linhas; Text e Subtle para o texto; Iris nos links, Rose nos títulos; Love, Gold, Foam, Pine, Iris e Rose para vermelho, amarelo, ciano, azul, roxo e rosa. O Rosé Pine não tem laranja nem verde: ficam os do Verso.
- Ajustes de contraste: nenhum

### Everforest

- Arquivo: `everforest.verso-theme` (modo both) — SHA-256: `83cf0470fd7652ea948ba97d3779483ed5774f19345626a1235b1419d718b6e3`
- Crédito no arquivo: Everforest, sainnhe, MIT
- Fonte: https://github.com/sainnhe/everforest/blob/85a86eb62409e3ec88713bff3d1b9d7374e112e4/docs/palette.md
- Commit ou tag: 85a86eb62409e3ec88713bff3d1b9d7374e112e4 (tag v0.3.0)
- Licença: MIT, (c) 2019 sainnhe
- Autor: sainnhe
- Mapeamento: A variante de contraste médio da paleta, escura e clara. bg0 / bg1 / bg2 (escuro) e bg0 / bg1 / bg4 (claro) nas superfícies; fg no texto, grey2 (escuro) e grey1 (claro) no texto discreto; verde nos links e amarelo nos títulos; a linha de acentos nas semânticas (aqua é o ciano). Os acentos claros são pálidos sobre a página clara e vários são corrigidos para contraste (veja os ajustes).
- Ajustes de contraste: light `--ink-2` `#939f91` → `#849282` (3.03:1, ajustado para contraste); light `--seal` `#8da101` → `#859801` (3:1, ajustado para contraste); light `--brass-ink` `#dfa000` → `#ba8500` (3.02:1, ajustado para contraste)

### Gruvbox

- Arquivo: `gruvbox.verso-theme` (modo both) — SHA-256: `978e18f8b475324eed947b9ef7f4110ba905bc89a0f7c8c5325702cd303dd501`
- Crédito no arquivo: Gruvbox, Pavel Pertsev (morhetz), MIT
- Fonte: https://github.com/gruvbox-community/gruvbox/blob/180ad85971343df68be3422a5630fa84e45a9ab2/colors/gruvbox.vim
- Commit ou tag: 180ad85971343df68be3422a5630fa84e45a9ab2 (tag v3.6.1)
- Licença: MIT, (c) 2018 Pavel Pertsev (community fork; morhetz/gruvbox, the original, has no LICENSE file)
- Autor: Pavel Pertsev (morhetz)
- Mapeamento: A paleta e a tabela de papéis escuro/claro de colors/gruvbox.vim: o escuro usa bg0 / bg1 / bg2, fg1 e fg4 com os acentos bright; o claro usa light0 / light1 / light2, dark1 e dark4 com os acentos faded. Links em azul, títulos em amarelo, como os grupos de Markdown do script vim. O fork da comunidade é creditado porque o repositório original não tem arquivo de licença.
- Ajustes de contraste: nenhum

### Solarized

- Arquivo: `solarized.verso-theme` (modo both) — SHA-256: `ece02448fb49f8db0d8fa3aeb91c6c994840c9f2b246a70991fca21e1d396576`
- Crédito no arquivo: Solarized, Ethan Schoonover, MIT
- Fonte: https://github.com/altercation/solarized/blob/62f656a02f93c5190a8753159e34b385588d5ff3/README.md ("The Values" table)
- Commit ou tag: 62f656a02f93c5190a8753159e34b385588d5ff3 (tag v1.0.0beta1)
- Licença: MIT, (c) 2011 Ethan Schoonover
- Autor: Ethan Schoonover
- Mapeamento: Os 16 valores da tabela do README, com a troca de papéis claro/escuro do próprio Solarized: base3 / base2 (claro) e base03 / base02 (escuro) em página e painéis, base00 / base0 no texto, base1 / base01 no conteúdo secundário, azul nos links, laranja nos títulos; magenta é o rosa e violet o roxo. As cores de texto secundário ficam abaixo do piso sobre a página (a paleta é de baixo contraste por desenho) e são corrigidas.
- Ajustes de contraste: light `--ink-2` `#93a1a1` → `#829292` (3.01:1, ajustado para contraste); dark `--ink-2` `#586e75` → `#5d747c` (3.04:1, ajustado para contraste)

### Flexoki

- Arquivo: `flexoki.verso-theme` (modo both) — SHA-256: `1b71ebe7f06f836e90c35fcc758d785ee2249b68911471878f873aae642722f2`
- Crédito no arquivo: Flexoki, Steph Ango (kepano), stephango.com/flexoki, MIT
- Fonte: https://github.com/kepano/flexoki/blob/8d723bac4a9ac46adfdf99d42155286977aac72a/README.md
- Commit ou tag: 8d723bac4a9ac46adfdf99d42155286977aac72a (tag 2.0.0)
- Licença: MIT, (c) 2023 Steph Ango
- Autor: Steph Ango
- Mapeamento: A escala do Flexoki como o README a dá: paper / base-50 / base-100 e black / base-950 / base-900 em superfícies e linhas, black e base-200 no texto, base-600 e base-500 no texto discreto; os acentos 600 no lado claro e os 400 no escuro; azul nos links, laranja nos títulos. O README do Flexoki pede que os portes "incluam atribuição e um link para stephango.com/flexoki": a linha de autor do crédito o traz e a página de Créditos deve mostrá-lo.
- Ajustes de contraste: nenhum

### Tokyo Night

- Arquivo: `tokyo-night.verso-theme` (modo both) — SHA-256: `f02150c5f754fff9e1750dd44ec868d918e5268cd8f854fc4907e3608ad5ca80`
- Crédito no arquivo: Tokyo Night, enkia (Tokyo Night VS Code theme), MIT
- Fonte: https://github.com/tokyo-night/tokyo-night-vscode-theme/blob/7c0f11eaef322f293621ca7befe462214b7ea468/themes/tokyo-night-color-theme.json and tokyo-night-light-color-theme.json
- Commit ou tag: 7c0f11eaef322f293621ca7befe462214b7ea468
- Licença: MIT (LICENSE.txt)
- Autor: enkia
- Mapeamento: Lido dos dois temas de cor do VS Code: fundos do editor e da barra lateral, texto do editor e de descrição, a cor de link, o fundo de bloco de código e as cores de título 1 a 6 e de código em linha das regras de token; as cores ANSI para vermelho, amarelo, verde, ciano, azul e roxo (o Tokyo Night não tem laranja nem rosa nelas). O escuro é "Tokyo Night", o claro é a variante clara do próprio tema.
- Ajustes de contraste: nenhum

### Ayu Light

- Arquivo: `ayu-light.verso-theme` (modo light) — SHA-256: `b2fc0ca5feaab245f3404ca045d96ef48cda2c158e680d83bddcb2d35bdaf29d`
- Crédito no arquivo: Ayu Light, Konstantin Pschera, MIT
- Fonte: https://github.com/ayu-theme/ayu-colors/blob/d461f02983546636bc6e1e0c48190fdb74036426/themes/light.yaml
- Commit ou tag: d461f02983546636bc6e1e0c48190fdb74036426 (tag v8.0.1)
- Licença: MIT, (c) Konstantin Pschera
- Autor: Konstantin Pschera
- Mapeamento: Os valores do tema YAML: fundo do editor (surface lift) na página, surface base nos painéis, primeiros planos do editor e da UI no texto, o tom de acento nos links, o laranja da paleta nos títulos, ui.line (ou surface sunk) nas linhas; vermelho, laranja, amarelo, verde, teal (ciano), azul e roxo da paleta. A paleta do Ayu não tem rosa próprio: omitido. Valores que o YAML deriva com expressões de cor (papéis de sintaxe) não são usados.
- Ajustes de contraste: light `--seal` `#f29718` → `#d27f0c` (3.02:1, ajustado para contraste); light `--brass-ink` `#fa8532` → `#f36806` (3.01:1, ajustado para contraste)

### Ayu Mirage

- Arquivo: `ayu-mirage.verso-theme` (modo dark) — SHA-256: `897d1618087bb3a7bf8b4051601cc814ad14e1776f16f4ceacf376ffbf40c4bb`
- Crédito no arquivo: Ayu Mirage, Konstantin Pschera, MIT
- Fonte: https://github.com/ayu-theme/ayu-colors/blob/d461f02983546636bc6e1e0c48190fdb74036426/themes/mirage.yaml
- Commit ou tag: d461f02983546636bc6e1e0c48190fdb74036426 (tag v8.0.1)
- Licença: MIT, (c) Konstantin Pschera
- Autor: Konstantin Pschera
- Mapeamento: Os valores do tema YAML: fundo do editor (surface lift) na página, surface base nos painéis, primeiros planos do editor e da UI no texto, o tom de acento nos links, o laranja da paleta nos títulos, ui.line (ou surface sunk) nas linhas; vermelho, laranja, amarelo, verde, teal (ciano), azul e roxo da paleta. A paleta do Ayu não tem rosa próprio: omitido. Valores que o YAML deriva com expressões de cor (papéis de sintaxe) não são usados.
- Ajustes de contraste: nenhum

### Ayu Dark

- Arquivo: `ayu-dark.verso-theme` (modo dark) — SHA-256: `1143f49e916593403184f50910e2cab9bce687d06d5a55be9e6fb2e0aa9ea115`
- Crédito no arquivo: Ayu Dark, Konstantin Pschera, MIT
- Fonte: https://github.com/ayu-theme/ayu-colors/blob/d461f02983546636bc6e1e0c48190fdb74036426/themes/dark.yaml
- Commit ou tag: d461f02983546636bc6e1e0c48190fdb74036426 (tag v8.0.1)
- Licença: MIT, (c) Konstantin Pschera
- Autor: Konstantin Pschera
- Mapeamento: Os valores do tema YAML: fundo do editor (surface lift) na página, surface base nos painéis, primeiros planos do editor e da UI no texto, o tom de acento nos links, o laranja da paleta nos títulos, ui.line (ou surface sunk) nas linhas; vermelho, laranja, amarelo, verde, teal (ciano), azul e roxo da paleta. A paleta do Ayu não tem rosa próprio: omitido. Valores que o YAML deriva com expressões de cor (papéis de sintaxe) não são usados.
- Ajustes de contraste: nenhum

### Minimal

- Arquivo: `minimal.verso-theme` (modo both) — SHA-256: `d35061592d5cc0af360d1d6b76879eaa2a20b206f28c4777b675bb22ebd73799`
- Crédito no arquivo: Minimal, Steph Ango (kepano), MIT
- Fonte: https://github.com/kepano/obsidian-minimal/blob/93321bdc23fc879966e1e3aa0cfeda77012f540f/theme.css
- Commit ou tag: 93321bdc23fc879966e1e3aa0cfeda77012f540f
- Licença: MIT, (c) 2020-2024 Steph Ango
- Autor: Steph Ango (kepano)
- Mapeamento: O esquema de cores padrão (minimal-default-light / minimal-default-dark) com as variáveis de base e de acento do próprio tema resolvidas; o Minimal não define cores de título nem de código nesse esquema, então o título é a cor do texto e as cores de código ficam com o Verso.
- Ajustes de contraste: nenhum

### E-Ink

- Arquivo: `e-ink.verso-theme` (modo both) — SHA-256: `d93995c2810e95ee94560f2e66ef9da81cc24c73393d005d51ef799e8ef77486`
- Crédito no arquivo: Minimal (E-Ink colour scheme), Steph Ango (kepano), MIT
- Fonte: https://github.com/kepano/obsidian-minimal/blob/93321bdc23fc879966e1e3aa0cfeda77012f540f/theme.css
- Commit ou tag: 93321bdc23fc879966e1e3aa0cfeda77012f540f
- Licença: MIT, (c) 2020-2024 Steph Ango
- Autor: Steph Ango (kepano)
- Mapeamento: O esquema de cores minimal-eink-light / minimal-eink-dark do próprio Minimal: preto sobre branco e branco sobre preto, página e painéis da mesma cor (superfícies planas). O esquema é monocromático, então não define cores semânticas; as padrão do Minimal não são emprestadas.
- Escolhas estruturais: `surface-mode: flat`
- Ajustes de contraste: nenhum

### Blue Topaz

- Arquivo: `blue-topaz.verso-theme` (modo both) — SHA-256: `1b5c8351614013a4b6aca5c75c5177efbfb32222b996eb82ec2630a87c624ac8`
- Crédito no arquivo: Blue Topaz, whyt-byte & Pkmer, MIT
- Fonte: https://github.com/pkm-er/Blue-Topaz_Obsidian-css/blob/8395f0d6d2966b517946dd2f202301d6b00763c4/theme.css
- Commit ou tag: 8395f0d6d2966b517946dd2f202301d6b00763c4
- Licença: MIT, (c) 2020 whyt-byte
- Autor: whyt-byte & Pkmer
- Mapeamento: Cores padrão sem escolhas do Style Settings; as seis cores de título e as de código são do próprio tema. As fontes (Bookerly, Inter) não são mapeadas.
- Ajustes de contraste: light `--h5-color` `#5aa0e2` → `#4e99e0` (3.02:1, ajustado para contraste); light `--h6-color` `#89b9e6` → `#5399db` (3.02:1, ajustado para contraste)

### Things

- Arquivo: `things.verso-theme` (modo both) — SHA-256: `c9f5bd83e559dfbeadf29b4eaca090dbde95bcec720534e750ee84c1ed4c4fd3`
- Crédito no arquivo: Things, Colin Eckert, MIT
- Fonte: https://github.com/colineckert/obsidian-things/blob/9b8bef93d3919f7693ac78597beaa35bbbd4cfff/theme.css
- Commit ou tag: 9b8bef93d3919f7693ac78597beaa35bbbd4cfff
- Licença: MIT, (c) 2020-2021 Stephan Ango (@kepano)
- Autor: Colin Eckert
- Mapeamento: Variáveis padrão de matiz/saturação/luminosidade resolvidas (base 212, acento 215). O nome do tema também é o de um app de terceiros (Things, Cultured Code): mantido como nome do tema do Obsidian, com crédito, e sinalizado ao mantenedor. Fontes: a pilha sans do sistema do tema vira a chave system.
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `--mono: mono`
- Ajustes de contraste: light `--h4-color` `#e5b567` → `#c78822` (3.01:1, ajustado para contraste)

### Sanctum

- Arquivo: `sanctum.verso-theme` (modo both) — SHA-256: `2639e3508e8d20f9337d553192ced16005c8c28f3e515895661ef485c12b6462`
- Crédito no arquivo: Sanctum, José Daniel Mourão (jdanielmourao), MIT
- Fonte: https://github.com/jdanielmourao/obsidian-sanctum/blob/ac69e5992a66d2aeabb30d8c2d90c636d155fc25/theme.css
- Commit ou tag: ac69e5992a66d2aeabb30d8c2d90c636d155fc25
- Licença: MIT, (c) 2021-2022 José Daniel Mourão
- Autor: José Daniel Mourão (jdanielmourao)
- Mapeamento: Página e painéis têm a mesma cor no tema (--background-secondary igual a --background-primary), então o modo de superfície é flat; Inter vira a chave sans.
- Escolhas estruturais: `surface-mode: flat`, `--heading-font: sans`, `--book: sans`
- Ajustes de contraste: light `--seal` `#f68d45` → `#e8650b` (3.02:1, ajustado para contraste)

### Obsidianotion

- Arquivo: `obsidianotion.verso-theme` (modo both) — SHA-256: `e8b68368fb229a5499a0c98539c1327d49038eb713b99d079b08523b6fc0a0ed`
- Crédito no arquivo: Obsidianotion, Diego Eis, Unlicense
- Fonte: https://github.com/diegoeis/obsidianotion/blob/420469845836be3f116d9070e7548362289b8ee7/theme.css
- Commit ou tag: 420469845836be3f116d9070e7548362289b8ee7
- Licença: Unlicense, public domain
- Autor: Diego Eis
- Mapeamento: As variáveis claras e escuras do próprio tema; a pilha de fontes system-ui vira a chave system. O nome continua o do tema (não se chama Notion).
- Escolhas estruturais: `--heading-font: system`, `--book: system`
- Ajustes de contraste: nenhum

### Atom

- Arquivo: `atom.verso-theme` (modo both) — SHA-256: `6025062b6607b278210f9097d498cb74d4062201c336383a43e4fb49d1350330`
- Crédito no arquivo: Atom, kognise, Unlicense
- Fonte: https://github.com/kognise/obsidian-atom/blob/650d6463d377a096520373c4752fef66f3f18f46/obsidian.css
- Commit ou tag: 650d6463d377a096520373c4752fef66f3f18f46
- Licença: Unlicense, public domain
- Autor: kognise
- Mapeamento: O tema define página, painel, borda, texto, texto discreto e acento nos dois lados, e mais nada.
- Ajustes de contraste: nenhum

### Yin and Yang

- Arquivo: `yin-and-yang.verso-theme` (modo both) — SHA-256: `a5dadc158bc0c76bcd5ea32705988382aeefe07e3515a9739f5623c105179ce9`
- Crédito no arquivo: Yin and Yang, Chetachi Ezikeuzor, MPL-2.0
- Fonte: https://github.com/chetachiezikeuzor/Yin-and-Yang-Theme/blob/e780f0d58301cfa11c05d0cc351ee82a95d920de/obsidian.css
- Commit ou tag: e780f0d58301cfa11c05d0cc351ee82a95d920de
- Licença: MPL-2.0, Mozilla Public License 2.0 (colour values only; the CSS is not redistributed)
- Autor: Chetachi Ezikeuzor
- Mapeamento: Página, painel, borda, texto e acento nos dois lados. Os acentos do tema são pastel e são corrigidos para contraste sobre a página.
- Ajustes de contraste: light `--seal` `#cd94ff` → `#bc6fff` (3.01:1, ajustado para contraste)

### Border

- Arquivo: `border.verso-theme` (modo both) — SHA-256: `f72a503e7ef344667ee6a1fca03f86e6309c9c9b1f3b0b23d51558554a162445`
- Crédito no arquivo: Border, Akifyss, MIT
- Fonte: https://github.com/akifyss/obsidian-border/blob/dd59bd54438597f61b38eb5b967919e979526c41/theme.css
- Commit ou tag: dd59bd54438597f61b38eb5b967919e979526c41
- Licença: MIT, (c) 2022 Akifyss
- Autor: Akifyss
- Mapeamento: Cores resolvidas das variáveis padrão do tema (suas cadeias HSL calculadas); os painéis flutuam como cartões com borda, que é o caráter do tema, então surface-mode é cards.
- Escolhas estruturais: `surface-mode: cards`
- Ajustes de contraste: nenhum

### Mapa de Conteúdo

- Arquivo: `mapa-de-conteudo.verso-theme` (modo dark) — SHA-256: `cfe9a5da9c921a7534f58a71b0c7322e69e823be741fcacb64b6f310e753e7af`
- Crédito no arquivo: LYT Mode, Nick Milo, MIT
- Fonte: https://github.com/nickmilo/LYT-Mode/blob/28f67f18a24f5c8d3b58954eb8374bf2ecffbb50/theme.css
- Commit ou tag: 28f67f18a24f5c8d3b58954eb8374bf2ecffbb50
- Licença: MIT, (c) 2022 nickmilo
- Autor: Nick Milo
- Mapeamento: Só o lado escuro do tema (ele não define cores claras). Renomeado de "LYT Mode": LYT (Linking Your Thinking) é o método e a marca do autor, e o ADR 0109 item 7 mantém marcas de terceiros fora dos nomes; o crédito ainda nomeia o original.
- Ajustes de contraste: nenhum

## Não entregues

- **Temas GPL** (ADR 0109 item 6): AnuPpuccin (GPL-3.0; sua paleta é a do Catppuccin, que é entregue), Primary (GPL-3.0), Velocity (GPL-3.0), Fancy-a-Story (GPL-3.0), Typewriter (GPL-3.0), ITS Theme (GPL-2.0) e sua variante "WotC D&D" (também marca de terceiro).
- **Sem arquivo de licença:** os repositórios do Ayu listados no catálogo do Obsidian (o Ayu é entregue a partir do oficial, MIT, `ayu-theme/ayu-colors`) e o `morhetz/gruvbox` original (entregue a partir do fork MIT da comunidade `gruvbox-community/gruvbox`).
- **Licença boa, cores não entregues nesta passada:** Baseline e Cupertino (uma paleta calculada com `oklch()` e `pow()` a partir do matiz escolhido pela pessoa: não há um conjunto fixo de valores a tirar), Maple, Prism (paletas montadas de vários esquemas selecionáveis por cadeias `:not()` e variáveis de execução), Shimmering Focus (cores atrás de `color-mix()` e variáveis em camadas), Shiba Inu (doze acentos selecionáveis, nenhum o padrão) e Red Graphite (seu lado claro tem um painel lateral escuro que os modos de superfície do Verso ainda não expressam). Cada um pode ser acrescentado tirando seus valores de novo da fonte numa passada futura.
- **Dracula claro:** o Dracula não tem paleta clara própria além do Alucard, que é entregue com esse nome; nenhum claro foi inventado.
