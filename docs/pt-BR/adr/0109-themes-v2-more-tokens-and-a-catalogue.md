# ADR 0109 — Temas, segundo passo: mais tokens, um construtor mais rico e um catálogo atrás de "Mais temas…"

- Data: 2026-10-22
- Origem: o mantenedor, em 2026-10-22, com uma especificação que ele gerou
  com o Gemini (`~/Projects/person/apps/verso-especificacao-temas-expandidos-2026-10-22.md`,
  fora do repositório): *"Seria uma coisa muito legal se a gente
  conseguisse incorporar já todos esses temas no Verso, só que de um jeito
  um pouco diferente. Em vez de listar toda a caralhada de temas ali e ficar
  uma coisa mega poluída, tem um botãozinho que se a pessoa clicar, aí ele
  expande ou abre uma janela nova que lista todos os temas que a gente já
  tem dentro do Verso, incluindo esses extras"*; e *"a gente sentiu aqui
  uma falta de muitas tags do lado do Verso… pouquíssimas tags ali e isso
  pode ser meio paia no quesito de falta de customização… expandir a
  seleção de temas e expandir também as tags cobertas pelos temas do Verso
  e pelo modo de edição de temas"*. A especificação foi conferida contra os
  repositórios dos temas no mesmo dia
  (`~/Projects/person/apps/verso-temas-verificacao-2026-10-22.md`): ver
  Contexto. Escrita pelo Opus 5.5; a ser lida pelo outro modelo antes de
  aceita ([0032](0032-author-and-reviewer-roles.md)).
- Relacionadas: [0100](0100-visual-customization-wizard.md) (o contrato de
  tokens `tokensVersion: 1`, o construtor, a galeria, exportar e importar,
  piso de contraste 3:1 e aviso 4,5:1), [0005](0005-license.md) (MPL-2.0),
  [0009](0009-external-constraints.md) (fontes admissíveis sobre o
  Obsidian), [0050](0050-outbound-network-access.md) (nenhuma rede a partir
  de um tema), [0035](0035-cross-cutting-requirements.md),
  [0099](0099-visual-markdown-statblocks-and-cards.md) (cores de statblock),
  [0102](0102-creative-oracles-and-improvisation.md) (cores de oráculo).

## Contexto

Um tema do Verso hoje ([0100](0100-visual-customization-wizard.md) item 3) é
um arquivo JSON com 7 tokens de cor por lado (`--paper`, `--paper-2`,
`--hair`, `--ink`, `--ink-2`, `--seal`, `--brass-ink`) mais fontes e um
tamanho, conferido campo a campo, 16 KB no máximo, sem CSS e sem rede.
Exportar um dos temas do Verso mostra quão pouco um tema consegue dizer:
títulos, código, callouts, tabelas e tags decorrem todos desses 7.

A especificação propõe `tokensVersion: 2`: 23 tokens de cor por lado (os 7,
mais fundo e texto de código, uma cor por nível de título e 8 cores
semânticas usadas por callouts e pelo oráculo) e escolhas estruturais de
listas fechadas (modo de superfície, estilo de título, estilo de tabela,
estilo de tag, raio), cada token novo opcional com um valor de reserva
derivado dos 7; um crédito `inspiredBy`; e 36 temas extraídos dos temas de
comunidade mais populares do Obsidian.

A conferência da especificação contra as fontes encontrou:

- **Licenças.** A especificação dá MIT para os 36; está errada para muitos.
  GPL-3.0: AnuPpuccin, Primary, Velocity, Fancy-a-Story, Typewriter.
  GPL-2.0: ITS Theme. MPL-2.0: Yin and Yang. Unlicense: Atom, Obsidianotion
  ("Sky"), Red Graphite. Sem licença: os repositórios do Ayu; o do Gruvbox
  declara MIT/X11 apenas no README.
- **Existência.** As 36 entradas são 28 repositórios: o ITS "WotC D&D" é uma
  configuração do ITS Theme; as três entradas do Catppuccin são um só tema;
  Everforest, Solarized, Ayu e E-Ink são esquemas de cor dentro do Minimal
  (daí a contagem de estrelas do Minimal neles). "Rosé Pine" é creditado a
  outro tema (Underwater); a contagem de estrelas do Dracula não é a do
  repositório oficial.
- **Cores.** 14 entradas batem com o CSS do tema ou com os valores oficiais
  da paleta; 14 batem em parte; 5 (Border, Velocity, Yin and Yang, Red
  Graphite, Shiba Inu) parecem inventadas. O lado claro do Dracula é
  inventado (o Dracula não tem tema claro oficial).
- **Contra o código do Verso.** O piso de 3:1, o aviso de 4,5:1, o limite de
  16 KB e as chaves de fonte batem; estender os pares de contraste a títulos
  e código faria alguns dos temas propostos falharem no piso (AnuPpuccin
  claro e Solarized claro `--h5-color`); `inspiredBy` usa dois nomes de
  chave diferentes no documento; `--sb-*` e `--orc-*` já existem com outros
  valores ou em outro arquivo.

Portanto a direção é sólida e os dados não são: nenhum valor da
especificação é usado sem ser tomado de novo da sua fonte.

## Decisão

Situação **Proposta**. Os itens `[DECIDED]` são palavras do mantenedor
acima; os itens `[OPEN]` são dele para responder; os itens `[PROPOSED]` são
a recomendação do autor.

1. **"Mais temas…" abre a lista completa.** `[DECIDED 2026-10-22]`
   Ajustes › Aparência › Temas mantém a sua galeria curta; um botão
   **"Mais temas…"** / **"More themes…"** abre uma janela que lista todos os
   temas que o Verso distribui, o catálogo incluído. `[PROPOSED]` A janela
   tem um campo de busca, filtros (claro / escuro / ambos; estilo: tonal,
   chapado, cartões), cartões desenhados com os tokens do próprio tema como
   os da galeria, e a linha de crédito de cada um; um clique aplica o tema
   como um cartão da galeria; no celular é uma tela cheia com controle de
   voltar.

2. **Mais tokens, no tema e no construtor.** `[DECIDED 2026-10-22]` na
   direção (palavras dele acima); até onde `[DECIDED 2026-10-22]`: opção A
   (TM.1, o mantenedor marcou a opção recomendada):
   - **A — O `tokensVersion: 2` da especificação:** as 7 cores base, fundo e
     texto de código, `--h1-color`…`--h6-color`, 8 cores semânticas
     (vermelho, laranja, amarelo, verde, ciano, azul, roxo, rosa — usadas
     por callouts, pelo oráculo e por statblocks) e as escolhas estruturais
     modo de superfície, estilo de título, estilo de tabela, estilo de tag e
     raio; todos opcionais, derivados da base quando ausentes; arquivos da
     versão 1 continuam válidos. _(recomendado)_
   - **B — Só cores** (as 23), sem escolhas estruturais.
   - **C — Um conjunto menor:** títulos como uma só cor, código e as cores
     semânticas.

3. **O contraste cobre os tokens novos.** `[PROPOSED]` O piso (3:1, desfeito
   ou recusado) e o aviso (4,5:1) se estendem ao texto de código sobre o
   fundo de código e a cada cor de título sobre a página; um tema do
   catálogo que falhe no piso é corrigido antes de ser distribuído (a cor
   mais próxima que passa), e a correção é dita na sua linha de crédito.

4. **O construtor mostra os tokens novos.** `[PROPOSED]` Agrupados — Base,
   Títulos, Código, Cores de callout, Estrutura — cada grupo dobrado até ser
   aberto, com a pré-visualização ao vivo e os avisos de contraste como hoje;
   no celular, um grupo por vez.

5. **Um crédito para um tema inspirado em outro.** `[PROPOSED]` Um objeto
   opcional `inspiredBy` no arquivo — `theme`, `author`, `repoUrl`,
   `license`, strings limitadas, só `https`, nunca buscado — mostrado sob o
   cartão e no construtor ("Inspirado em Minimal, de Steph Ango (MIT)"),
   mantido quando um tema é copiado.

6. **Quais temas são distribuídos.** `[DECIDED 2026-10-22]` Opção A (TM.2,
   marcada pelo mantenedor):
   - **A — Só de licenças permissivas ou compatíveis, cores tomadas de novo
     da fonte.** Temas sob MIT, Unlicense ou MPL-2.0, e paletas abertas com
     especificação oficial (Catppuccin, Nord, Dracula escuro, Rosé Pine,
     Everforest, Gruvbox, Tokyo Night, Solarized, Flexoki, a paleta oficial
     do Ayu), cada valor tomado de novo do CSS do tema ou da especificação
     da paleta, com crédito. Não distribuídos: os temas GPL (AnuPpuccin — a
     paleta dele é Catppuccin, que é distribuída —, Primary, Velocity,
     Fancy-a-Story, Typewriter, ITS Theme) e repositórios sem licença.
     _(recomendado)_
   - **B — Todos os temas da lista, cores tomadas de novo da fonte,** os GPL
     incluídos apenas como valores de cor, com crédito — cores e escolhas de
     fonte, não CSS; se isso basta para uma licença copyleft é um juízo do
     mantenedor.
   - **C — Só as paletas abertas,** nenhum dos temas do Obsidian.

7. **Nomes.** `[DECIDED 2026-10-22]` Opção A (TM.3, marcada pelo
   mantenedor):
   - **A — Uma paleta aberta mantém o seu nome** (Catppuccin Mocha, Nord,
     Dracula, Solarized…), seguindo as diretrizes de adaptação da própria
     paleta quando as tem; **um tema derivado de um tema do Obsidian mantém
     o nome com o crédito** ("Minimal", "Inspirado em Minimal, de Steph
     Ango"); um nome que é marca registrada de terceiros não é usado (a
     variante ITS "WotC D&D"; "LYT" é renomeado). _(recomendado)_
   - **B — Nomes próprios do Verso para todos,** o original só no crédito.

8. **Onde o catálogo vive.** `[PROPOSED]` Como arquivos `.verso-theme`
   distribuídos com a janela (lidos como um tema importado, de modo que um
   tema distribuído nunca é mais poderoso que um que uma pessoa importa),
   cada um com a sua URL de origem, licença e o commit ou versão de onde as
   cores foram tomadas, listados em `docs/reference/` e na página de
   Créditos.

9. **Acessibilidade e idiomas**
   ([0035](0035-cross-cutting-requirements.md)). `[PROPOSED]` A janela é um
   diálogo com título, a busca rotulada, os cartões botões com o nome e o
   modo do tema; as regras de contraste do item 3 valem para todo tema
   distribuído; pt-BR e inglês.

## Consequências

- `app/ui/src/theme/` ganha a leitura e a escrita da versão 2, os valores
  derivados, os pares de contraste estendidos, os grupos do construtor, a
  janela "Mais temas" e os arquivos do catálogo; `css/` consome os tokens
  novos (títulos, código, callouts, tabelas, tags, raio, superfícies) com o
  visual da versão 1 inalterado quando eles estão ausentes.
- A [0100](0100-visual-customization-wizard.md) ganha uma linha de Revisões:
  o seu item 3 (`tokensVersion: 1`) é estendido, não substituído.
- Cada tema distribuído passa o piso nos dois modos; um teste lê cada
  arquivo do catálogo com o mesmo leitor de uma importação.

## Alternativas descartadas

Nenhuma registrada. Listar todos os temas na própria galeria foi apontado
pelo mantenedor como o que se deve evitar ("mega poluída"); é o problema que
o item 1 responde, não uma alternativa que tenha sido pesada.

## Situação

Proposta (2026-10-22). Itens 2, 6 e 7 decididos pelo mantenedor no mesmo
dia (`~/Projects/person/apps/verso-decisoes-0109-temas-2026-10-22.md`,
opções A); os itens `[PROPOSED]` continuam do autor até a aceitação. Em
construção; aguarda uma leitura pelo outro modelo.

Decidido em 2026-10-22, mais tarde (`~/Projects/person/apps/verso-decisoes-temas-fidelidade-2026-10-22.md`),
depois que o mantenedor viu que o catálogo não parecia com os originais
(*"tá a mesma fonte do nosso… não tá mudando tanta coisa"*) e de uma
comparação lado a lado: **TM.4 = B** — mais dez chaves de estrutura, listas
fechadas, sem CSS: tamanho dos títulos, peso dos títulos, largura do texto,
entrelinha, estilo de citação, estilo de link, cor da ênfase, estilo de
caixa de seleção, espaço entre parágrafos e estilo de callout (a opção A
eram só as quatro primeiras; a C, só as duas dos títulos); **TM.5 = A** —
"Ayu" é a paleta oficial MIT com a fonte padrão do catálogo, não o tema
antigo do Obsidian sem licença; **TM.6 = A** — "Things" e "Atom" mantêm o
nome com o crédito. Registrado também: toda fonte que um tema usa precisa
mostrar o português completo (acentos, cedilha, ª º, aspas, travessões) — o
mantenedor: *"o foco principal vai ser a aplicação atender público
brasileiro"*; as cinco chaves de fonte foram conferidas e passam.

Decidido em 2026-10-22, por último: um tema do catálogo cujo CSS não declara
largura de coluna nem entrelinha fica com os padrões do Obsidian (coluna de
700 px, entrelinha 1,5) — `line-width: narrow`, `line-height: snug` — para
parecer como o original parece no Obsidian (o mantenedor, opção A: *"A
então"*; a B era manter os da janela).

Decidido em 2026-10-22, depois da linha horizontal: o mantenedor viu que os
temas do catálogo ainda desenhavam uma só linha, uma linha com três asteriscos
(⁂), e disse *"Tem uma coisa que esses temas não estão customizando, que é a
linha horizontal. Vários desses temas têm uma linha horizontal customizada e a
gente está usando a mesma coisa, que é uma linha horizontal e três asteriscos,
que em algum momento a gente fez isso e nunca mudou."* Mais uma chave
estrutural, `hr-style`, de lista fechada — `asterism` (a da janela, não
escreve nada), `line` (a linha simples de 2px do Obsidian), `thin` (1px) e
`fade` (linha que se desfaz nas duas pontas) — e uma cor opcional,
`--hr-color` (a cor da linha fina quando não há), as duas na leitura e no Live
Preview; os valores são só os que os originais usam (levantamento em
`docs/reference/theme-catalogue.md`). São dezesseis chaves estruturais.
