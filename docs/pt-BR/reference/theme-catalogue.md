# Catálogo de temas

Os temas que o Verso entrega atrás de "Mais temas…" (ADR 0109, itens 6, 7 e 8): arquivos `.verso-theme` em `app/ui/themes/catalogue/`, lidos pelo mesmo leitor de um tema importado. Cada um foi tirado de novo da sua fonte — a especificação da própria paleta, ou o CSS do tema em um commit fixado — e nenhum leva CSS, arquivo de fonte ou requisição: só cores, as chaves fechadas de fonte e as escolhas estruturais do `tokensVersion` 2.

`node scripts/check-theme-catalogue.mjs` (um passo de `scripts/check.sh`) prende esta página aos arquivos: todo tema deve estar listado aqui com seu SHA-256, creditar uma licença da lista permitida e passar o piso de contraste de 3:1 nos dois modos.

## Regras

- Só temas cuja licença do repositório é MIT, Unlicense ou MPL-2.0, e paletas abertas com especificação oficial (ADR 0109 item 6, opção A, decidido em 2026-10-22). Não entregues: os temas GPL e repositórios sem licença.
- Todo valor é tirado de novo da fonte nomeada abaixo; nada é copiado do rascunho de temas expandidos (suas cores foram achadas em parte inventadas).
- Nomes (item 7, opção A): uma paleta aberta mantém seu nome, um tema derivado do Obsidian mantém o seu com o crédito; um nome que é marca de terceiro não é usado.
- Uma cor abaixo de 3:1 contra a página é trocada pela cor mais próxima, do mesmo matiz e saturação, que passa, e a correção é listada sob o tema.
- As fontes são as chaves fechadas do Verso; nenhum arquivo de fonte é entregue. Uma escolha estrutural (modo de superfície, raio, tabela, tag, estilo de título) só é definida onde o tema tem claramente esse caráter; a fonte de cada uma está listada sob o tema como "Fontes das escolhas estruturais".
- A tipografia segue o CSS do tema: a família do corpo vai para a chave fechada mais próxima (a sans do sistema do Obsidian para `system`; Inter e DM Sans para `sans`; Vollkorn, Bookerly e Georgia para `editorial`), o tamanho é o `--font-text-size` do próprio tema (16 do Obsidian onde ele não define), e uma cor de título por nível é escrita onde o tema a define. As entradas Ayu mantêm as fontes padrão do catálogo: o tema Ayu do Obsidian (24px, serifado) não tem licença e não é o alvo; o maintainer decide depois.

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

- Arquivo: `catppuccin-latte.verso-theme` (modo light) — SHA-256: `48674b5cb50a7dd64b755e7f6d9f56a3be3902b659b359d980e4545dfc87722f`
- Crédito no arquivo: Catppuccin Latte, Catppuccin, MIT
- Fonte: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit ou tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licença: MIT, (c) 2021 Catppuccin
- Autor: Catppuccin
- Mapeamento: Base, Mantle, Surface 0, Text e Subtext 0 para superfícies e texto; links em Blue e título em Text, como o guia de estilo do Catppuccin atribui (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); código em linha em Text sobre Mantle; Peach é o laranja, Teal o ciano, Mauve o roxo.
- Escolhas estruturais: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`
- Fontes das escolhas estruturais: Vollkorn (serifada de livro; os títulos usam a fonte do corpo): a chave de serifada de livro mais próxima, `editorial` (Literata), no corpo e nos títulos; `font-size: 16`; todo título na cor de acento, Mauve (catppuccin/obsidian theme.css), então `--h1-color`…`h6` são o Mauve deste sabor; grade de tabela de 1px: `bordered`; tag pílula na cor de acento; raios 4/8/10px: `soft`.
- Ajustes de contraste: nenhum

### Catppuccin Frappé

- Arquivo: `catppuccin-frappe.verso-theme` (modo dark) — SHA-256: `c793a0e9e6742b3f3809db5fb75ebb0f92f91b1cbc6c5b92b646566e099aacd7`
- Crédito no arquivo: Catppuccin Frappé, Catppuccin, MIT
- Fonte: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit ou tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licença: MIT, (c) 2021 Catppuccin
- Autor: Catppuccin
- Mapeamento: Base, Mantle, Surface 0, Text e Subtext 0 para superfícies e texto; links em Blue e título em Text, como o guia de estilo do Catppuccin atribui (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); código em linha em Text sobre Mantle; Peach é o laranja, Teal o ciano, Mauve o roxo.
- Escolhas estruturais: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`
- Fontes das escolhas estruturais: Vollkorn (serifada de livro; os títulos usam a fonte do corpo): a chave de serifada de livro mais próxima, `editorial` (Literata), no corpo e nos títulos; `font-size: 16`; todo título na cor de acento, Mauve (catppuccin/obsidian theme.css), então `--h1-color`…`h6` são o Mauve deste sabor; grade de tabela de 1px: `bordered`; tag pílula na cor de acento; raios 4/8/10px: `soft`.
- Ajustes de contraste: nenhum

### Catppuccin Macchiato

- Arquivo: `catppuccin-macchiato.verso-theme` (modo dark) — SHA-256: `960e77dab31022eb495f38a188124bc5440a12a7e2eb4a8330ae7b6dfa782064`
- Crédito no arquivo: Catppuccin Macchiato, Catppuccin, MIT
- Fonte: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit ou tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licença: MIT, (c) 2021 Catppuccin
- Autor: Catppuccin
- Mapeamento: Base, Mantle, Surface 0, Text e Subtext 0 para superfícies e texto; links em Blue e título em Text, como o guia de estilo do Catppuccin atribui (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); código em linha em Text sobre Mantle; Peach é o laranja, Teal o ciano, Mauve o roxo.
- Escolhas estruturais: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`
- Fontes das escolhas estruturais: Vollkorn (serifada de livro; os títulos usam a fonte do corpo): a chave de serifada de livro mais próxima, `editorial` (Literata), no corpo e nos títulos; `font-size: 16`; todo título na cor de acento, Mauve (catppuccin/obsidian theme.css), então `--h1-color`…`h6` são o Mauve deste sabor; grade de tabela de 1px: `bordered`; tag pílula na cor de acento; raios 4/8/10px: `soft`.
- Ajustes de contraste: nenhum

### Catppuccin Mocha

- Arquivo: `catppuccin-mocha.verso-theme` (modo dark) — SHA-256: `0aa0730debaea232be8f2f3e2a3ae7ac5237b2bdaf098bb1d61a7cc9f121bbe3`
- Crédito no arquivo: Catppuccin Mocha, Catppuccin, MIT
- Fonte: https://github.com/catppuccin/palette/blob/v1.8.0/palette.json
- Commit ou tag: v1.8.0 (07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd)
- Licença: MIT, (c) 2021 Catppuccin
- Autor: Catppuccin
- Mapeamento: Base, Mantle, Surface 0, Text e Subtext 0 para superfícies e texto; links em Blue e título em Text, como o guia de estilo do Catppuccin atribui (docs/style-guide.md: "Links, URLs: Blue", "Main Headline: Text", "Sub-Headlines, Labels: Subtext 0/1"); código em linha em Text sobre Mantle; Peach é o laranja, Teal o ciano, Mauve o roxo.
- Escolhas estruturais: `--heading-font: editorial`, `--book: editorial`, `font-size: 16`, `table-style: bordered`, `tag-style: pill`, `radius: soft`
- Fontes das escolhas estruturais: Vollkorn (serifada de livro; os títulos usam a fonte do corpo): a chave de serifada de livro mais próxima, `editorial` (Literata), no corpo e nos títulos; `font-size: 16`; todo título na cor de acento, Mauve (catppuccin/obsidian theme.css), então `--h1-color`…`h6` são o Mauve deste sabor; grade de tabela de 1px: `bordered`; tag pílula na cor de acento; raios 4/8/10px: `soft`.
- Ajustes de contraste: nenhum

### Nord

- Arquivo: `nord.verso-theme` (modo dark) — SHA-256: `03ffb7abd67cd2152fc23e787a8bc08998507e39040fded701d478e80c7adbb6`
- Crédito no arquivo: Nord, Sven Greb (Arctic Ice Studio), MIT
- Fonte: https://github.com/nordtheme/nord/blob/1cef71605416a222e57225b544540ce0fcec18d4/src/nord.css
- Commit ou tag: 1cef71605416a222e57225b544540ce0fcec18d4 (develop, tag v0.2.0 is older)
- Licença: MIT, (c) 2016-present Sven Greb
- Autor: Sven Greb
- Mapeamento: Polar Night nord0 / nord1 / nord2 para página, painéis e linhas; nord4 no texto; links em Frost nord8, títulos em nord9; as cores Aurora para as semânticas (a paleta não tem rosa: omitido). O Nord não tem paleta clara, então nenhuma é entregue. ink-2 é nord3, a cor de comentário da paleta.
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `table-style: striped`, `tag-style: pill`
- Fontes das escolhas estruturais: Sans do sistema (`system`), mono Hack (`mono`), `font-size: 16`; as cores de título são `--h1-color`…`h6` do tema = vermelho, amarelo, verde, roxo, frost0, frost2; tabelas listradas: `striped`; tag pílula (.5em): `pill`.
- Ajustes de contraste: dark `--ink-2` `#4c566a` → `#6f7d98` (3.01:1, ajustado para contraste)

### Dracula

- Arquivo: `dracula.verso-theme` (modo dark) — SHA-256: `60932f1ee2bef85b215637f90f67b5cd6e4583cbead5b057e2bd81447fd53d7b`
- Crédito no arquivo: Dracula, Zeno Rocha, MIT
- Fonte: https://github.com/dracula/dracula-theme/blob/e22ebcc048b8aff586f9bc94db30ff5347070b42/README.md and https://draculatheme.com/spec (UI palette, read 2026-10-22)
- Commit ou tag: e22ebcc048b8aff586f9bc94db30ff5347070b42 (tag v1.2.5 is older)
- Licença: MIT, (c) 2023 Dracula Theme
- Autor: Zeno Rocha
- Mapeamento: Background, Foreground, Comment, Current Line e as cores funcionais da paleta do README; "Background Dark" #21222C e "Floating interactive elements" #343746 da tabela de UI da especificação. Bordas usam Current Line, como as diretrizes de componentes da especificação. A especificação não tem Blue, então --blue é o Purple (ela mapeia o azul ANSI para ele). A especificação pede contraste 4,5:1 no texto e "valores exatos de cor"; a cor de comentário usada em ink-2 fica abaixo de 4,5:1 e só é corrigida até o piso de 3:1, se preciso.
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `font-size: 16`, `radius: soft`
- Fontes das escolhas estruturais: O tema não define fonte (sans do sistema do Obsidian: `system`); `font-size: 16` é o padrão do próprio Obsidian (`--font-text-size`); o tema não o altera; as seis cores de título são `--text-title-h1`…`h6` do tema (#bd93f9, #ffb86c, #50fa7b, #ff5555, #f1fa8c, #bd93f4); blocos de código com raio 4px: `soft`.
- Ajustes de contraste: nenhum

### Dracula Alucard

- Arquivo: `dracula-alucard.verso-theme` (modo light) — SHA-256: `a03d67353d7d57ca479156813ea86d982a8bdcb8023bf8c66325243b5057e3cf`
- Crédito no arquivo: Dracula Alucard, Zeno Rocha, MIT
- Fonte: https://github.com/dracula/dracula-theme/blob/e22ebcc048b8aff586f9bc94db30ff5347070b42/README.md and https://draculatheme.com/spec (Alucard UI palette)
- Commit ou tag: e22ebcc048b8aff586f9bc94db30ff5347070b42
- Licença: MIT, (c) 2023 Dracula Theme
- Autor: Zeno Rocha
- Mapeamento: A paleta clara do próprio Dracula, Alucard (tabela "Alucard" do README e tabela de UI da especificação); não é um claro inventado para o Dracula. Mesmo mapeamento do Dracula; o Verso a chama de "Dracula Alucard" para dizer de quem é a paleta.
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `font-size: 16`, `radius: soft`
- Fontes das escolhas estruturais: Mesma estrutura do Dracula (o tema não define fonte, padrões do Obsidian); cores de título na ordem de papéis do Dracula (roxo, laranja, verde, vermelho, amarelo, roxo) nos equivalentes claros desta paleta. O Alucard não existe no tema do Obsidian, então a ordem é a do Dracula, não a do Alucard.
- Ajustes de contraste: nenhum

### Rosé Pine

- Arquivo: `rose-pine.verso-theme` (modo both) — SHA-256: `1d290c49a970dcb0507db1f78dea9e4ca0a5b86ac0db0422d08720b0d4b6102d`
- Crédito no arquivo: Rosé Pine, Rosé Pine, MIT
- Fonte: https://github.com/rose-pine/palette/blob/92af52b465ab6e47437aca223c9b8d3009a2023b/palette.json
- Commit ou tag: 92af52b465ab6e47437aca223c9b8d3009a2023b (tag v4.0.1)
- Licença: MIT, (c) mvllow
- Autor: Rosé Pine
- Mapeamento: Base / Surface / Overlay para página, painéis e linhas; Text e Subtle para o texto; Iris nos links, Rose nos títulos; Love, Gold, Foam, Pine, Iris e Rose para vermelho, amarelo, ciano, azul, roxo e rosa. O Rosé Pine não tem laranja nem verde: ficam os do Verso. O escuro é o Rosé Pine (main), o claro é o Dawn.
- Escolhas estruturais: `--heading-font: sans`, `--book: editorial`, `font-size: 18`
- Fontes das escolhas estruturais: Inter na edição e nos títulos: `sans`; Georgia na leitura: a serifada de livro mais próxima, `editorial` (a pilha termina em Georgia); `font-size: 18` (theme.css `--font-text-size`); as cores de título são `--rp-h1`…`h6` = love, iris, rose, gold, foam, pine (aqui vermelho, roxo, rosa, amarelo, ciano, azul). O rosa e o dourado do claro foram corrigidos para contraste.
- Ajustes de contraste: light `--brass-ink` `#d7827e` → `#d2726d` (3.02:1, ajustado para contraste); light `--h3-color` `#d7827e` → `#d2716c` (3.04:1, ajustado para contraste); light `--h4-color` `#ea9d34` → `#c77c15` (3.04:1, ajustado para contraste)

### Rosé Pine Moon

- Arquivo: `rose-pine-moon.verso-theme` (modo dark) — SHA-256: `e6ab43d78d7fa8b6e8eb9cf0b470262b61afc2e42dc1a41eb6f80a1c1675c1a1`
- Crédito no arquivo: Rosé Pine Moon, Rosé Pine, MIT
- Fonte: https://github.com/rose-pine/palette/blob/92af52b465ab6e47437aca223c9b8d3009a2023b/palette.json
- Commit ou tag: 92af52b465ab6e47437aca223c9b8d3009a2023b (tag v4.0.1)
- Licença: MIT, (c) mvllow
- Autor: Rosé Pine
- Mapeamento: Base / Surface / Overlay para página, painéis e linhas; Text e Subtle para o texto; Iris nos links, Rose nos títulos; Love, Gold, Foam, Pine, Iris e Rose para vermelho, amarelo, ciano, azul, roxo e rosa. O Rosé Pine não tem laranja nem verde: ficam os do Verso.
- Escolhas estruturais: `--heading-font: sans`, `--book: editorial`, `font-size: 18`
- Fontes das escolhas estruturais: Inter na edição e nos títulos: `sans`; Georgia na leitura: a serifada de livro mais próxima, `editorial` (a pilha termina em Georgia); `font-size: 18` (theme.css `--font-text-size`); as cores de título são `--rp-h1`…`h6` = love, iris, rose, gold, foam, pine (aqui vermelho, roxo, rosa, amarelo, ciano, azul).
- Ajustes de contraste: nenhum

### Everforest

- Arquivo: `everforest.verso-theme` (modo both) — SHA-256: `d7d4d685af4f6067890a41d5193c1d2f3e6570b353c7967e7874a29715a6d528`
- Crédito no arquivo: Everforest, sainnhe, MIT
- Fonte: https://github.com/sainnhe/everforest/blob/85a86eb62409e3ec88713bff3d1b9d7374e112e4/docs/palette.md
- Commit ou tag: 85a86eb62409e3ec88713bff3d1b9d7374e112e4 (tag v0.3.0)
- Licença: MIT, (c) 2019 sainnhe
- Autor: sainnhe
- Mapeamento: A variante de contraste médio da paleta, escura e clara. bg0 / bg1 / bg2 (escuro) e bg0 / bg1 / bg4 (claro) nas superfícies; fg no texto, grey2 (escuro) e grey1 (claro) no texto discreto; verde nos links e amarelo nos títulos; a linha de acentos nas semânticas (aqua é o ciano). Os acentos claros são pálidos sobre a página clara e vários são corrigidos para contraste (veja os ajustes).
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: outline`
- Fontes das escolhas estruturais: Sans do sistema, 16px (`system`, `font-size: 16`, theme.css `--font-text-size`); as cores de título são `--h1-color`…`--h6-color` do tema (conjunto dim no escuro, light no claro: vermelho, laranja, amarelo, verde, aqua, roxo); tags com borda aqua de 1px: `outline`.
- Ajustes de contraste: light `--ink-2` `#939f91` → `#849282` (3.03:1, ajustado para contraste); light `--seal` `#8da101` → `#859801` (3:1, ajustado para contraste); light `--brass-ink` `#dfa000` → `#ba8500` (3.02:1, ajustado para contraste); light `--h2-color` `#f57d26` → `#e8670b` (3.05:1, ajustado para contraste); light `--h3-color` `#bf983d` → `#ac8937` (3.05:1, ajustado para contraste); light `--h4-color` `#899c40` → `#84973e` (3.01:1, ajustado para contraste); light `--h5-color` `#569d79` → `#559b78` (3.07:1, ajustado para contraste)

### Gruvbox

- Arquivo: `gruvbox.verso-theme` (modo both) — SHA-256: `95ba9894c30fe2c006222fe0e32bd2b777779df62c083613656a72af676d7114`
- Crédito no arquivo: Gruvbox, Pavel Pertsev (morhetz), MIT
- Fonte: https://github.com/gruvbox-community/gruvbox/blob/180ad85971343df68be3422a5630fa84e45a9ab2/colors/gruvbox.vim
- Commit ou tag: 180ad85971343df68be3422a5630fa84e45a9ab2 (tag v3.6.1)
- Licença: MIT, (c) 2018 Pavel Pertsev (community fork; morhetz/gruvbox, the original, has no LICENSE file)
- Autor: Pavel Pertsev (morhetz)
- Mapeamento: A paleta e a tabela de papéis escuro/claro de colors/gruvbox.vim: o escuro usa bg0 / bg1 / bg2, fg1 e fg4 com os acentos bright; o claro usa light0 / light1 / light2, dark1 e dark4 com os acentos faded. Links em azul, títulos em amarelo, como os grupos de Markdown do script vim. O fork da comunidade é creditado porque o repositório original não tem arquivo de licença.
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `table-style: striped`, `tag-style: pill`
- Fontes das escolhas estruturais: Sans do sistema (`system`), mono Hack Nerd Font (`mono`), `font-size: 16`; as cores de título são `--h1-color`…`h6` do tema = vermelho, amarelo, verde, aqua, azul e roxo neutros; tabelas com linhas alternadas: `striped`; tag pílula (raio .5em): `pill`.
- Ajustes de contraste: dark `--h1-color` `#cc241d` → `#dc271f` (3.06:1, ajustado para contraste); light `--h2-color` `#d79921` → `#b6811c` (3.01:1, ajustado para contraste); light `--h3-color` `#98971a` → `#8f8e19` (3.06:1, ajustado para contraste); light `--h4-color` `#689d6a` → `#629764` (3.02:1, ajustado para contraste)

### Solarized

- Arquivo: `solarized.verso-theme` (modo both) — SHA-256: `8e4b49c57e05733894ebd10cdccd81e0329f8a1aaaeb5996424bbc793542a167`
- Crédito no arquivo: Solarized, Ethan Schoonover, MIT
- Fonte: https://github.com/altercation/solarized/blob/62f656a02f93c5190a8753159e34b385588d5ff3/README.md ("The Values" table)
- Commit ou tag: 62f656a02f93c5190a8753159e34b385588d5ff3 (tag v1.0.0beta1)
- Licença: MIT, (c) 2011 Ethan Schoonover
- Autor: Ethan Schoonover
- Mapeamento: Os 16 valores da tabela do README, com a troca de papéis claro/escuro do próprio Solarized: base3 / base2 (claro) e base03 / base02 (escuro) em página e painéis, base00 / base0 no texto, base1 / base01 no conteúdo secundário, azul nos links, laranja nos títulos; magenta é o rosa e violet o roxo. As cores de texto secundário ficam abaixo do piso sobre a página (a paleta é de baixo contraste por desenho) e são corrigidas.
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: pill`
- Fontes das escolhas estruturais: O tema não define fonte (sans do sistema do Obsidian: `system`) e `font-size: 16`; tag pílula com o acento a 10–20%: `pill`. Só o raio dos blocos de código é `unset`, então `radius` segue o da janela.
- Ajustes de contraste: light `--ink-2` `#93a1a1` → `#829292` (3.01:1, ajustado para contraste); dark `--ink-2` `#586e75` → `#5d747c` (3.04:1, ajustado para contraste)

### Flexoki

- Arquivo: `flexoki.verso-theme` (modo both) — SHA-256: `edad3c96733d4316f017092760464e9be9c99e13e3ab786653ab3d53a4020f93`
- Crédito no arquivo: Flexoki, Steph Ango (kepano), stephango.com/flexoki, MIT
- Fonte: https://github.com/kepano/flexoki/blob/8d723bac4a9ac46adfdf99d42155286977aac72a/README.md
- Commit ou tag: 8d723bac4a9ac46adfdf99d42155286977aac72a (tag 2.0.0)
- Licença: MIT, (c) 2023 Steph Ango
- Autor: Steph Ango
- Mapeamento: A escala do Flexoki como o README a dá: paper / base-50 / base-100 e black / base-950 / base-900 em superfícies e linhas, black e base-200 no texto, base-600 e base-500 no texto discreto; os acentos 600 no lado claro e os 400 no escuro; azul nos links, laranja nos títulos. O README do Flexoki pede que os portes "incluam atribuição e um link para stephango.com/flexoki": a linha de autor do crédito o traz e a página de Créditos deve mostrá-lo.
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `font-size: 16`
- Fontes das escolhas estruturais: O tema é só variáveis de cor (1,9 KB): a tipografia é a padrão do Obsidian, `system` e `font-size: 16`.
- Ajustes de contraste: nenhum

### Tokyo Night

- Arquivo: `tokyo-night.verso-theme` (modo both) — SHA-256: `be37a2d1971ddc9022fcbb75af6c1aa661a6ca934c27d7171b71fa142e9ad4f0`
- Crédito no arquivo: Tokyo Night, enkia (Tokyo Night VS Code theme), MIT
- Fonte: https://github.com/tokyo-night/tokyo-night-vscode-theme/blob/7c0f11eaef322f293621ca7befe462214b7ea468/themes/tokyo-night-color-theme.json and tokyo-night-light-color-theme.json
- Commit ou tag: 7c0f11eaef322f293621ca7befe462214b7ea468
- Licença: MIT (LICENSE.txt)
- Autor: enkia
- Mapeamento: Cores: lidas dos dois temas de cor do VS Code (fundos do editor e da barra lateral, texto do editor e de descrição, a cor de link, o fundo de bloco de código, a cor de código em linha); as cores ANSI para vermelho, amarelo, verde, ciano, azul e roxo. As seis cores de título não são as do Markdown do VS Code, e sim a ordem do tema do Obsidian (vermelho, amarelo, verde, ciano, azul, magenta) sobre essas cores ANSI. O escuro é "Tokyo Night", o claro é a variante clara do próprio tema.
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `tag-style: pill`, `radius: soft`
- Fontes das escolhas estruturais: Sans do sistema (a JetBrains Mono declarada como fonte padrão não é usada pelo tema): `system`, mono JetBrains: `mono`, `font-size: 16`; as cores de título são `--h1-color`…`h6` do tema do Obsidian = vermelho, amarelo, verde, ciano, azul, magenta, tomadas dos valores da paleta deste arquivo; tag pílula magenta: `pill`; raio do callout 4px: `soft`.
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

- Arquivo: `ayu-dark.verso-theme` (modo dark) — SHA-256: `699d3526d729b0451c42eb4533418c0a08303a3a6811f4a3a528020019dd31b0`
- Crédito no arquivo: Ayu Dark, Konstantin Pschera, MIT
- Fonte: https://github.com/ayu-theme/ayu-colors/blob/d461f02983546636bc6e1e0c48190fdb74036426/themes/dark.yaml
- Commit ou tag: d461f02983546636bc6e1e0c48190fdb74036426 (tag v8.0.1)
- Licença: MIT, (c) Konstantin Pschera
- Autor: Konstantin Pschera
- Mapeamento: Os valores do tema YAML: fundo do editor (surface lift) na página, surface base nos painéis, primeiros planos do editor e da UI no texto, o tom de acento nos links, o laranja da paleta nos títulos, ui.line (ou surface sunk) nas linhas; vermelho, laranja, amarelo, verde, teal (ciano), azul e roxo da paleta. A paleta do Ayu não tem rosa próprio: omitido. Valores que o YAML deriva com expressões de cor (papéis de sintaxe) não são usados.
- Ajustes de contraste: nenhum

### Minimal

- Arquivo: `minimal.verso-theme` (modo both) — SHA-256: `f8f998e83101d2ba1c9d66a4245dbeb2b25091667552df3314766221a4ecbf75`
- Crédito no arquivo: Minimal, Steph Ango (kepano), MIT
- Fonte: https://github.com/kepano/obsidian-minimal/blob/93321bdc23fc879966e1e3aa0cfeda77012f540f/theme.css
- Commit ou tag: 93321bdc23fc879966e1e3aa0cfeda77012f540f
- Licença: MIT, (c) 2020-2024 Steph Ango
- Autor: Steph Ango (kepano)
- Mapeamento: O esquema de cores padrão (minimal-default-light / minimal-default-dark) com as variáveis de base e de acento do próprio tema resolvidas; o Minimal não define cores de título nem de código nesse esquema, então o título é a cor do texto e as cores de código ficam com o Verso.
- Escolhas estruturais: `surface-mode: flat`, `--heading-font: system`, `--book: system`, `font-size: 16`, `table-style: hairline`, `tag-style: minimal`, `radius: soft`
- Fontes das escolhas estruturais: Sans do sistema no corpo e nos títulos (`system`), 16px, barra lateral chapada (`surface-mode: flat`), tags em texto simples sem fundo nem borda (`tag-style: minimal`), tabela com cabeçalho pequeno e sem bordas externas (`hairline`), raios do Obsidian (`soft`).
- Ajustes de contraste: nenhum

### E-Ink

- Arquivo: `e-ink.verso-theme` (modo both) — SHA-256: `57623dc8df66bfed811cfbbbb13e0f483b304d5add4ea2563665917cca0494e6`
- Crédito no arquivo: Minimal (E-Ink colour scheme), Steph Ango (kepano), MIT
- Fonte: https://github.com/kepano/obsidian-minimal/blob/93321bdc23fc879966e1e3aa0cfeda77012f540f/theme.css
- Commit ou tag: 93321bdc23fc879966e1e3aa0cfeda77012f540f
- Licença: MIT, (c) 2020-2024 Steph Ango
- Autor: Steph Ango (kepano)
- Mapeamento: O esquema de cores minimal-eink-light / minimal-eink-dark do próprio Minimal: preto sobre branco e branco sobre preto, página e painéis da mesma cor (superfícies planas). O esquema é monocromático, então não define cores semânticas; as padrão do Minimal não são emprestadas.
- Escolhas estruturais: `surface-mode: flat`, `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: outline`, `radius: soft`
- Fontes das escolhas estruturais: O esquema E-Ink é do Minimal: corpo e títulos em sans do sistema (`system`), `font-size: 16`; tags com contorno de 1,25px na cor do texto: `outline`; raios do Obsidian: `soft`. A superfície segue `flat`.
- Ajustes de contraste: nenhum

### Blue Topaz

- Arquivo: `blue-topaz.verso-theme` (modo both) — SHA-256: `76b35c424b38510156f761b911aff38e28f23be1d1b33f5060fbe0a53793aebf`
- Crédito no arquivo: Blue Topaz, whyt-byte & Pkmer, MIT
- Fonte: https://github.com/pkm-er/Blue-Topaz_Obsidian-css/blob/8395f0d6d2966b517946dd2f202301d6b00763c4/theme.css
- Commit ou tag: 8395f0d6d2966b517946dd2f202301d6b00763c4
- Licença: MIT, (c) 2020 whyt-byte
- Autor: whyt-byte & Pkmer
- Mapeamento: Cores padrão sem escolhas do Style Settings; as seis cores de título e as de código são do próprio tema. Fontes: a Bookerly vira a chave de serifada de livro mais próxima, `editorial`.
- Escolhas estruturais: `--heading-font: editorial`, `--book: editorial`, `--mono: mono`, `font-size: 16`, `table-style: bordered`, `tag-style: outline`, `radius: soft`
- Fontes das escolhas estruturais: Bookerly (corpo) e os títulos herdam dela, então a serifada de livro mais próxima, `editorial` (Literata), no corpo e nos títulos; JetBrains Mono: `mono`; `font-size: 16` (1em); tag com borda de 1px: `outline`; grade de tabela com cabeçalho tingido: `bordered` (as linhas alternadas não cabem junto); raios 3/5/7/15px: `soft`.
- Ajustes de contraste: light `--h5-color` `#5aa0e2` → `#4e99e0` (3.02:1, ajustado para contraste); light `--h6-color` `#89b9e6` → `#5399db` (3.02:1, ajustado para contraste)

### Things

- Arquivo: `things.verso-theme` (modo both) — SHA-256: `0476f339086ffd733cfad75e6ef96cb294ef65cfdf8fd7a10f976e8a4a7173d1`
- Crédito no arquivo: Things, Colin Eckert, MIT
- Fonte: https://github.com/colineckert/obsidian-things/blob/9b8bef93d3919f7693ac78597beaa35bbbd4cfff/theme.css
- Commit ou tag: 9b8bef93d3919f7693ac78597beaa35bbbd4cfff
- Licença: MIT, (c) 2020-2021 Stephan Ango (@kepano)
- Autor: Colin Eckert
- Mapeamento: Variáveis padrão de matiz/saturação/luminosidade resolvidas (base 212, acento 215). O nome do tema também é o de um app de terceiros (Things, Cultured Code): mantido como nome do tema do Obsidian, com crédito, e sinalizado ao mantenedor. Fontes: a pilha sans do sistema do tema vira a chave system.
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `--mono: mono`, `font-size: 16`, `heading-style: rule`, `table-style: hairline`, `tag-style: pill`, `radius: soft`
- Fontes das escolhas estruturais: Sans do sistema (`system`), mono JetBrains / Fira (`mono`), `font-size: 16`; os títulos de seção têm um filete fino na captura do tema: `heading-style: rule`; tag pílula verde: `pill`; raios 4/8/10/16: `soft`; as cores de título já eram as do tema.
- Ajustes de contraste: light `--h4-color` `#e5b567` → `#c78822` (3.01:1, ajustado para contraste)

### Sanctum

- Arquivo: `sanctum.verso-theme` (modo both) — SHA-256: `9a1cc5b125a29c0ab0c015197cf03da0776499cc16ac892ed0a0ba2a6f84d6a5`
- Crédito no arquivo: Sanctum, José Daniel Mourão (jdanielmourao), MIT
- Fonte: https://github.com/jdanielmourao/obsidian-sanctum/blob/ac69e5992a66d2aeabb30d8c2d90c636d155fc25/theme.css
- Commit ou tag: ac69e5992a66d2aeabb30d8c2d90c636d155fc25
- Licença: MIT, (c) 2021-2022 José Daniel Mourão
- Autor: José Daniel Mourão (jdanielmourao)
- Mapeamento: Página e painéis têm a mesma cor no tema (--background-secondary igual a --background-primary), então o modo de superfície é flat; Inter vira a chave sans.
- Escolhas estruturais: `surface-mode: flat`, `--heading-font: sans`, `--book: sans`, `font-size: 16`, `tag-style: pill`, `radius: soft`
- Fontes das escolhas estruturais: Inter: `sans`; `font-size: 16`; superfície chapada; tag pílula sem borda (raio 2em): `pill`; raios 4/8/10px, portanto `soft`, não `sharp` como diz o spec §1.4 (contradição registrada, não decidida aqui).
- Ajustes de contraste: light `--seal` `#f68d45` → `#e8650b` (3.02:1, ajustado para contraste)

### Obsidianotion

- Arquivo: `obsidianotion.verso-theme` (modo both) — SHA-256: `b91748f64cb118b5f119668ea4fb03586ba7f5e4569c26134f9e588ce7a24c52`
- Crédito no arquivo: Obsidianotion, Diego Eis, Unlicense
- Fonte: https://github.com/diegoeis/obsidianotion/blob/420469845836be3f116d9070e7548362289b8ee7/theme.css
- Commit ou tag: 420469845836be3f116d9070e7548362289b8ee7
- Licença: Unlicense, public domain
- Autor: Diego Eis
- Mapeamento: As variáveis claras e escuras do próprio tema; a pilha de fontes system-ui vira a chave system. O nome continua o do tema (não se chama Notion).
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: pill`, `radius: soft`
- Fontes das escolhas estruturais: Pilha ui-sans-serif / -apple-system: `system`; 16px; tags em pílula (o ciclo de cores não é expressável): `pill`; raios 4/8/12/16: `soft`.
- Ajustes de contraste: nenhum

### Atom

- Arquivo: `atom.verso-theme` (modo both) — SHA-256: `2942674c704ee67ecc1a11dd90695cda397a8e8b9912fe5decf3b3110ebbb339`
- Crédito no arquivo: Atom, kognise, Unlicense
- Fonte: https://github.com/kognise/obsidian-atom/blob/650d6463d377a096520373c4752fef66f3f18f46/obsidian.css
- Commit ou tag: 650d6463d377a096520373c4752fef66f3f18f46
- Licença: Unlicense, public domain
- Autor: kognise
- Mapeamento: O tema define página, painel, borda, texto, texto discreto e acento nos dois lados, e mais nada.
- Escolhas estruturais: `--heading-font: system`, `--book: system`, `font-size: 16`, `tag-style: pill`, `radius: soft`
- Fontes das escolhas estruturais: o tema não define fonte, então vale a sans do sistema do Obsidian: `system`; `font-size: 16` é o padrão do próprio Obsidian (`--font-text-size`); o tema não o altera; a tag é um chip arredondado de raio 4px (theme.css, `a.tag`), raios do Obsidian: `tag-style: pill`, `radius: soft`; a cor amarela da tag não pode ser definida.
- Ajustes de contraste: nenhum

### Yin and Yang

- Arquivo: `yin-and-yang.verso-theme` (modo both) — SHA-256: `5fbb274045a0c251834513cd65c1e2f5917259d4b6697db54f71f55a496f0685`
- Crédito no arquivo: Yin and Yang, Chetachi Ezikeuzor, MPL-2.0
- Fonte: https://github.com/chetachiezikeuzor/Yin-and-Yang-Theme/blob/e780f0d58301cfa11c05d0cc351ee82a95d920de/obsidian.css
- Commit ou tag: e780f0d58301cfa11c05d0cc351ee82a95d920de
- Licença: MPL-2.0, Mozilla Public License 2.0 (colour values only; the CSS is not redistributed)
- Autor: Chetachi Ezikeuzor
- Mapeamento: Página, painel, borda, texto e acento nos dois lados. Os acentos do tema são pastel e são corrigidos para contraste sobre a página.
- Escolhas estruturais: `--heading-font: sans`, `--book: sans`, `font-size: 17`, `radius: soft`
- Fontes das escolhas estruturais: Inter (`--default-font`): `sans`; `font-size: 17` (`--normal-font-size`); as cores de título são `--text-title-h1`…`h6` do tema (escuro: rosa, roxo, vermelho, laranja, verde, azul pálido; claro: rosa claro, roxo, vermelho, laranja, verde, azul centáurea); raios 4–6px: `soft`. Os pastéis não passam 3:1 na página clara e foram escurecidos pela regra abaixo.
- Ajustes de contraste: light `--seal` `#cd94ff` → `#bc6fff` (3.01:1, ajustado para contraste); light `--h1-color` `#ffabf4` → `#ff33e4` (3.01:1, ajustado para contraste); light `--h2-color` `#d2b3ff` → `#ae76ff` (3.01:1, ajustado para contraste); light `--h3-color` `#ff5582` → `#ff5280` (3.04:1, ajustado para contraste); light `--h4-color` `#ffb86c` → `#e17400` (3.08:1, ajustado para contraste); light `--h5-color` `#85ffa4` → `#00ab2c` (3.00:1, ajustado para contraste); light `--h6-color` `#a1c4fd` → `#5192fb` (3.01:1, ajustado para contraste)

### Border

- Arquivo: `border.verso-theme` (modo both) — SHA-256: `5fda8b3eff0f0187c703be7407baee9339eafe73dfa806e9775d64dbf896b7ab`
- Crédito no arquivo: Border, Akifyss, MIT
- Fonte: https://github.com/akifyss/obsidian-border/blob/dd59bd54438597f61b38eb5b967919e979526c41/theme.css
- Commit ou tag: dd59bd54438597f61b38eb5b967919e979526c41
- Licença: MIT, (c) 2022 Akifyss
- Autor: Akifyss
- Mapeamento: Cores resolvidas das variáveis padrão do tema (suas cadeias HSL calculadas).
- Escolhas estruturais: `--heading-font: sans`, `--book: sans`, `font-size: 16`, `table-style: bordered`, `tag-style: outline`, `radius: soft`
- Fontes das escolhas estruturais: Inter na captura do próprio tema (Style Settings): `sans`; `font-size: 16`; tag pílula de 2em com borda de 1px: `outline`; grade de tabela: `bordered`; raios 8px (cartões) e 6px (checkbox): `soft`. O layout em cartões é opção do Style Settings, não o padrão, então vale o visual padrão (superfície tonal) e `surface-mode: cards` foi removido; sem estilo de título (filete no h1 e barra no h2, misturados).
- Ajustes de contraste: nenhum

### Mapa de Conteúdo

- Arquivo: `mapa-de-conteudo.verso-theme` (modo dark) — SHA-256: `fc0e3f209f4a270e7e8861051b35f561ab3068b2b8041a8e19aed842f46d044a`
- Crédito no arquivo: LYT Mode, Nick Milo, MIT
- Fonte: https://github.com/nickmilo/LYT-Mode/blob/28f67f18a24f5c8d3b58954eb8374bf2ecffbb50/theme.css
- Commit ou tag: 28f67f18a24f5c8d3b58954eb8374bf2ecffbb50
- Licença: MIT, (c) 2022 nickmilo
- Autor: Nick Milo
- Mapeamento: Só o lado escuro do tema (ele não define cores claras). Renomeado de "LYT Mode": LYT (Linking Your Thinking) é o método e a marca do autor, e o ADR 0109 item 7 mantém marcas de terceiros fora dos nomes; o crédito ainda nomeia o original.
- Escolhas estruturais: `--heading-font: sans`, `--book: sans`, `--mono: mono`, `font-size: 16`, `tag-style: pill`, `radius: sharp`
- Fontes das escolhas estruturais: DM Sans (Inter de reserva): `sans`, DM Mono / Fira Code: `mono`, `font-size: 16`; raios 0/2/4px: `sharp`; tag pílula escura: `pill`. As cores de título já eram as do tema.
- Ajustes de contraste: nenhum

## Não entregues

- **Temas GPL** (ADR 0109 item 6): AnuPpuccin (GPL-3.0; sua paleta é a do Catppuccin, que é entregue), Primary (GPL-3.0), Velocity (GPL-3.0), Fancy-a-Story (GPL-3.0), Typewriter (GPL-3.0), ITS Theme (GPL-2.0) e sua variante "WotC D&D" (também marca de terceiro).
- **Sem arquivo de licença:** os repositórios do Ayu listados no catálogo do Obsidian (o Ayu é entregue a partir do oficial, MIT, `ayu-theme/ayu-colors`) e o `morhetz/gruvbox` original (entregue a partir do fork MIT da comunidade `gruvbox-community/gruvbox`).
- **Licença boa, cores não entregues nesta passada:** Baseline e Cupertino (uma paleta calculada com `oklch()` e `pow()` a partir do matiz escolhido pela pessoa: não há um conjunto fixo de valores a tirar), Maple, Prism (paletas montadas de vários esquemas selecionáveis por cadeias `:not()` e variáveis de execução), Shimmering Focus (cores atrás de `color-mix()` e variáveis em camadas), Shiba Inu (doze acentos selecionáveis, nenhum o padrão) e Red Graphite (seu lado claro tem um painel lateral escuro que os modos de superfície do Verso ainda não expressam). Cada um pode ser acrescentado tirando seus valores de novo da fonte numa passada futura.
- **Dracula claro:** o Dracula não tem paleta clara própria além do Alucard, que é entregue com esse nome; nenhum claro foi inventado.

## Passe de fidelidade, 2026-10-22

A comparação lado a lado (capturas dos originais contra o Verso) foi conferida com o CSS de cada original, que é a autoridade; onde os dois divergem o arquivo segue o CSS e a captura é registrada como imagem de capa ou configurada pelo usuário.

- **Alterados.** Rosé Pine e Rosé Pine Moon: `--book` agora é `sans` (a pilha do editor do original é Inter; a da leitura é Georgia, mas as capturas e o editor são sans, decisão do maintainer). Tokyo Night: `--heading-font` e `--book` são `mono` (o original define `--default-font` como JetBrains Mono). Ayu Dark: `system` nos dois (o CSS de adnan-malik não define fonte, vale o sans do sistema do Obsidian). Solarized: h1 a h6 em ciano (o `--text-title` do original é o ciano nos seis), #2aa198 no escuro e #279a91 no claro, o menor escurecimento que passa do piso de 3:1 sobre a página. Flexoki: h1 a h6 na cor do texto (o original não define nenhuma, vale o padrão do Obsidian).
- **Conferidos, sem mudança.** Catppuccin x4: a fonte do corpo no CSS é Vollkorn (`--font-text-theme`), serifada de livro, então `editorial` fica (o "sans" da comparação veio de um esboço sem texto), e todo título é o acento (`--ctp-hN` cai em `--ctp-accent`), o que os arquivos já têm. Nord e Gruvbox: o CSS dá h1 a h6 como vermelho, amarelo, verde, roxo, frost0, frost2 (Nord) e vermelho, amarelo, verde, aqua, azul, roxo (Gruvbox), exatamente como nos arquivos; o h2 laranja das capturas não está no CSS. Mapa de Conteúdo: o arco-íris do CSS (yellow-900, purple-700, cyan-533, green-710, slate-500, slate-700) é o do arquivo. Blue Topaz: os padrões do CSS são o h1 lima e a página `#202020` do arquivo, com Bookerly no texto; o rosa e o azul-marinho da captura são escolhas do Style Settings. Ayu Light e Mirage: os originais leem em Gentium Plus (serifada) e usam 24px por conta própria; o arquivo guarda só a paleta.
- **Border.** Não é bug do renderizador: `border.verso-theme` simplesmente não declara `heading-style`, e o renderizador aplica a chave quando o arquivo a declara (`data-heading-style` em `css/theme-tokens.css`). Deixado sem declarar de propósito: o original desenha a barra laranja só no h2 (`--h2-accent-color`, um `::before` de 3px), enquanto o `accent-bar` do Verso desenha uma barra na cor do título em h1 a h4, o que acrescentaria barras que o original não tem. `surface-mode: cards` foi removido de propósito (Style Settings opcional, ADR 0109).
