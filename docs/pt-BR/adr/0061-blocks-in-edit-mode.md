# ADR 0061 — Blocos no modo Editar: uma alça para arrastar, um + para adicionar, um menu por bloco

- Data: 2026-10-02
- Fonte: o mantenedor, 2026-10-02, em sessão: "o principal aqui é ter essa
  experiência desse arraste de componentes" e "considere que essa
  funcionalidade vai rodar no modo editar"; sobre a unidade, "linha eu não
  curto, no parágrafo ok, e duplo enter pra separar o bloco tb"; ao pedir
  este registro, "quero que as pessoas consigam migrar do notion praticamente
  sem atritos", uma funcionalidade que chamou de importante e que falta no
  Obsidian.
- Status no briefing: não consta

## Contexto

O editor do Notion é feito de blocos. Passar o mouse sobre um mostra, na
margem esquerda, um `+` e uma alça de seis pontos (⋮⋮). A alça arrastada move
o bloco; clicada, abre o menu do bloco — excluir, duplicar, transformar em,
copiar link para o bloco, mover para, cor, comentário. O `+` abre o menu de
tipos de conteúdo que o `/` abre. Enter começa um bloco novo e Shift-Enter
quebra a linha dentro de um; ⌘⇧↑/↓ move os blocos selecionados, ⌘D os
duplica, ⌘/ muda o tipo deles. As fontes são a ajuda pública do Notion —
[atalhos de teclado](https://www.notion.com/help/keyboard-shortcuts) e
[noções de escrita e edição](https://www.notion.com/help/writing-and-editing-basics),
lidas em 2026-10-02 — e nada do Notion além delas.

O editor do Obsidian não tem alça de bloco: o mantenedor não conhece nenhuma,
e existem ao menos quatro plugins da comunidade para acrescentá-la —
[Dragger](https://community.obsidian.md/plugins/dragger),
[Notion Block](https://community.obsidian.md/plugins/notion-block),
[Feel the Notion](https://community.obsidian.md/plugins/feel-the-notion) e
[Block Drag & Drop](https://community.obsidian.md/plugins/block-drag-drop),
conhecidos só pelas suas páginas públicas — ao lado de um
[pedido no fórum do Obsidian](https://forum.obsidian.md/t/reorder-text-blocks-lines-paragraphs-with-mouse-drag-and-drop/5049?page=2)
para reordenar parágrafos arrastando. [ADR 0003](0003-primitives-not-workarounds.md):
o que exige plugin deve ser primitiva. Um deles, o Notion Block, oferece um
modo por linha e um modo por parágrafo — a escolha que o mantenedor fez
abaixo.

O Verso já tem a maior parte das peças:

- O modo Editar é o CodeMirror 6 com Live Preview
  ([0023](0023-stack-core-and-editor.md); item 2.4 do roadmap;
  `app/ui/src/live.ts`). A árvore sintática dele é a do parser de Markdown do
  CodeMirror, não a do `verso-dialect`: o `Document` do dialeto é um
  relatório, não uma árvore ([spec](../spec/dialect.md) Q18, leitura (b)), e
  o editor nunca o consulta.
- `blocksOf`, em `live.ts`, já encontra blocos inteiros nessa árvore —
  tabelas, matemática em destaque, cercas `base` e `mermaid`, embeds sozinhos
  na linha — para desenhá-los no lugar.
- O menu `/` (`app/ui/src/slash.ts`) insere onde um `/` é digitado no começo
  de um bloco; os itens dele são uma lista separada de como o menu abre.
- `app/ui/src/bases/drag.ts` arrasta cartões do kanban pelo ponteiro, como a
  janela arrasta abas e linhas da árvore: o arrastar e soltar do próprio web
  view não alcança elementos dentro da página.
- `app/ui/src/listKeymap.ts` renumera uma lista numerada depois de Tab e
  Shift-Tab.
- As teclas padrão do CodeMirror valem em toda nota: ⌥↑/↓ move a linha,
  ⇧⌥↑/↓ a copia, ⌘/ alterna um comentário HTML. Os atalhos da janela rodam
  antes dos do editor (`appHotkeys` em `main.ts`), e ⌘D é a nota diária
  ([0049](0049-phase-2-scope-widened.md) §2).
- Um heading se contrai com a sua seção (as setas de contrair, "Contrair
  todas as seções").

O que é um bloco continua indefinido para o dialeto: a Q21 da spec está
`[ABERTO]`, e com ela a Q3 além das duas posições decididas (o fim de um
parágrafo, o fim de um item de lista) e a Q4.

A D9 do [ADR 0060](0060-makemd-organizing-features.md) — "o compositor de
blocos espera o mês de uso" — é outra coisa: os blocos de layout de página do
make.md (botões, colunas, avaliações, progresso), guardados em SQLite
([memo](../reference/makemd-decision.md), F4). Mover blocos de Markdown dentro
de uma nota não grava nada novo.

## Decisão

Proposto pelo autor ao mantenedor. Nada abaixo está decidido até o
mantenedor dizer (Status); onde há opções, a recomendação está marcada.

### 1. Escopo e princípio

1. **Escopo (D1).** A Fase 2 é ampliada, como foi para as visões
   ([0053](0053-views-bases.md)), o board
   ([0057](0057-board-json-canvas.md)) e as funcionalidades do make.md
   ([0060](0060-makemd-organizing-features.md)), para duas fatias: **S1** a
   alça, o `+`, o menu do bloco e as teclas; **S2** vários blocos de uma vez,
   e movimentos entre contêineres. Mover um bloco para outra nota (o "Mover
   para" do Notion), que grava dois arquivos sem transação entre eles
   ([0048](0048-file-operations-in-ui.md)), e importar um export do Notion
   são decididos depois, cada um por si. O critério de saída da Fase 2 não
   muda ([0034](0034-roadmap-in-phases.md)).
2. **As mãos do Notion, os arquivos do Obsidian (D2).** Os gestos seguem o
   Notion; o arquivo continua Markdown como o Obsidian o lê. Nenhuma sintaxe
   nova, nenhuma chave nova no frontmatter, nenhum dado por bloco: a
   invariante 12 não é tocada e o
   [ADR 0013](0013-degrades-to-markdown.md) vale sem nada a degradar. Onde o
   gesto do Notion e o sentido do Markdown divergem, vale o do Markdown: `> `
   continua citação, embora o Notion faça dele um toggle; o toggle do Notion
   é um callout recolhível.
3. **Onde (D3).** No modo Editar, na aba de uma nota. O modo Fonte continua
   texto puro, como o mantenedor disse; a Leitura não tem alças. Os outros
   editores — o cartão do board, o embed editado no lugar (0060 S4) — não as
   ganham na S1.
4. **Só no editor (D4).** Os blocos vêm da árvore sintática do editor, na
   janela. O `verso-dialect`, o contrato, o índice e o core não mudam, e
   nenhum comando entra no contrato
   ([0026](0026-core-ui-contract-inviolable-rules.md)). Um movimento é uma
   edição, como digitar: o mesmo salvamento automático, a mesma verificação
   de que o arquivo no disco é o que foi lido (invariante 11), a mesma
   escrita atômica (invariante 9). Não é uma conversão no sentido da
   invariante 8 ([0012](0012-files-are-source-of-truth.md)): muda o texto
   como as mãos do usuário mudariam, e ⌘Z desfaz.

### 2. O que é um bloco (D5)

Um nó da árvore sintática — nunca uma linha (o mantenedor: "linha eu não
curto").

| Construção | O bloco | Notas |
|---|---|---|
| Parágrafo | Da primeira à última linha | Um Enter fica dentro dele, como quebra de linha (Q15); uma linha em branco o encerra, então um Enter duplo começa o próximo bloco — a regra do próprio Markdown. Matemática em destaque e um embed sozinho na linha são parágrafos. |
| Heading | A sua linha (duas, num heading setext) | Contraído, com a sua seção, como a tela mostra |
| Item de lista — marcador, numerado, tarefa | O item, com as linhas de continuação e os itens aninhados | Itens são blocos em qualquer profundidade |
| Citação, callout | A citação inteira | Parágrafos dentro de uma citação não são blocos próprios na S1 |
| Código, cercado ou indentado | O bloco inteiro | |
| Tabela | A tabela inteira | |
| Divisor, bloco HTML, comentário | A construção inteira | |
| Frontmatter | Nunca é bloco | O parser de Markdown do CodeMirror não conhece frontmatter: `frontmatterEnd`, em `live.ts`, o encontra, e o painel de propriedades o edita |

Duas regras mantêm o sentido de um bloco movido:

- **Um `^id` viaja com o seu bloco.** Um `^id` no fim de um bloco está dentro
  dele. Uma linha só com um `^id`, depois de uma linha em branco, vai junto
  com o bloco anterior: o Obsidian o associa a esse bloco (Q3 da spec,
  observado em 2026-09-21) e o parser do Verso à própria linha, então mover
  os dois juntos mantém o sentido do arquivo qualquer que seja a resposta da
  Q3.
- **Uma lista numerada é renumerada.** O CommonMark tira o início de uma
  lista numerada do primeiro item e ignora os outros números: mover o
  terceiro item de `1. 2. 3.` para o topo, sem renumerar, faz a Leitura
  contar 3, 4, 5. A lista que o item deixa e a lista em que ele entra são
  renumeradas como o Tab as renumera hoje; uma lista que começa num número
  diferente de 1 mantém o seu início.

A definição é do editor e não fecha nada na spec: a Q21 continua `[ABERTO]`.
Ela concorda com as duas posições que a Q3 decidiu — o parágrafo e o item de
lista são blocos aqui — e fica oferecida como insumo quando a Q21 for
respondida.

### 3. A alça, o + e o soltar (D6)

- Passar o mouse sobre um bloco mostra, na margem esquerda e nunca sobre o
  texto, um `+` e um ⋮⋮ ao lado da primeira linha, e um contorno leve em
  volta do bloco inteiro: onde ele começa e termina se vê antes de qualquer
  coisa se mover. O bloco é achado pela árvore no ponto do ponteiro; nada é
  desenhado para cada bloco da nota.
- ⋮⋮ pressionado e movido além de cinco pixels é um arraste (o limiar do
  `drag.ts`). Um rótulo com a primeira linha do bloco segue o ponteiro, uma
  linha entre blocos mostra onde ele vai cair, e a nota rola quando o
  ponteiro chega perto da borda de cima ou de baixo. Esc, ou soltar fora da
  nota, não solta nada.
- **Onde um bloco pode cair (S1):** entre blocos do seu próprio contêiner —
  um bloco de primeiro nível entre blocos de primeiro nível, um item de lista
  entre os itens da sua própria lista, na sua própria profundidade. Entre
  contêineres — um parágrafo para dentro de uma lista ou de um callout, um
  item para fora, para o primeiro nível, um item para outra profundidade pela
  posição horizontal do ponteiro, como o Notion aninha — é a S2: o texto
  movido então ganha ou perde marcas `> ` ou indentação.
- **Linhas em branco.** O texto do bloco se move byte a byte. Ele é cortado
  com as linhas em branco que o seguem (as que o antecedem, quando é o último
  bloco da nota) e inserido seguido de uma linha em branco (precedido de uma,
  no fim da nota). Um item de lista toma o espaçamento da sua lista: uma
  lista compacta continua compacta, uma espaçada continua espaçada. Nenhuma
  outra linha muda, fora a renumeração da seção 2.
- Um ⌘Z desfaz o movimento inteiro, e só ele. Se a nota muda durante o
  arraste — outro programa a grava —, o soltar não faz nada, como o `drag.ts`
  não solta nada quando a sua visão foi redesenhada.
- ⋮⋮ clicado abre o menu do bloco (D7).
- `+` clicado adiciona um parágrafo vazio abaixo do bloco e abre o menu `/`
  ali; Esc fecha o menu e desfaz o que o `+` adicionou.
- Um bloco desenhado no lugar — uma tabela, uma base, um diagrama, matemática,
  um embed — também tem a alça; arrastá-lo move a sua fonte.

### 4. O menu do bloco (D7)

Cada item também é um comando da paleta, então o teclado e um leitor de tela
alcançam tudo ([0035](0035-cross-cutting-requirements.md)), e cada um pode
ganhar teclas em Configurações › Atalhos.

- **Excluir.**
- **Duplicar** — a cópia abaixo, separada como um bloco movido.
- **Transformar em** — Texto, Heading 1–3, Lista com marcadores, Lista
  numerada, Tarefa, Citação, Callout, Código. Um destino que não comporta o
  texto do bloco sem mudança não é oferecido: um parágrafo de várias linhas
  não vira heading, um bloco de código não vira lista. Nenhum texto se perde
  ou é refeito.
- **Copiar link para o bloco** — num parágrafo ou item de lista, escreve um
  `^id` no fim se não houver (as duas posições que a Q3 decidiu) e copia
  `[[Nota#^id]]` na forma que a configuração de formato de link dá; num
  heading, copia `[[Nota#Heading]]` e não escreve nada. Não é oferecido nos
  outros blocos até a Q3 decidir onde vai o `^id` deles. O id tem seis letras
  minúsculas e dígitos, dentro do conjunto que a documentação do Obsidian dá
  (Q22), e é único na nota; a unicidade na pasta é da Q4.
- **Não oferecidos:** cor e comentário do Notion — sem forma em Markdown
  ([0013](0013-degrades-to-markdown.md)); "Mover para" — depois (D1).

### 5. Teclas (D8)

As teclas do Notion já têm dono no Verso: ⌘⇧↑/↓ seleciona até o começo ou o
fim da nota (macOS), ⌘D é a nota diária, ⌘/ alterna um comentário.

- **(a) Recomendada.** ⌥↑/↓ move o bloco do cursor e ⇧⌥↑/↓ o duplica acima
  ou abaixo — as teclas que movem e copiam a linha hoje, então um bloco de
  uma linha se comporta como agora. Dentro de uma tabela ou de um bloco de
  código elas continuam movendo a linha da tabela ou do código, como agora.
  As teclas do Notion ficam com os donos atuais; quem as quiser associa
  "Mover bloco para cima" e "Mover bloco para baixo" a ⌘⇧↑/↓ em
  Configurações › Atalhos.
- **(b)** As teclas do Notion por padrão, tirando o selecionar até o começo e
  até o fim, o ⌘D da nota diária e o alternar comentário.

### 6. Enter (D9)

- **(a)** Como hoje, palavra do mantenedor em 2026-10-02: Enter quebra a
  linha dentro do bloco, e um Enter duplo começa o próximo. Nada muda no
  editor.
- **(b) Recomendada.** (a), mais uma configuração, "Enter começa um bloco
  novo", desligada por padrão. Ligada, Enter num parágrafo escreve a linha em
  branco que começa um parágrafo novo e Shift-Enter escreve a quebra de linha
  simples — as duas teclas do Notion, ainda Markdown puro. Listas, citações,
  código e tabelas mantêm o seu Enter. O padrão continua o do mantenedor; a
  configuração é para as mãos que chegam do Notion esperando um Enter só.

### 7. Coisas menores (D10)

- O `/` ganha **Toggle**, que escreve um callout recolhível (`> [!note]- `).
  Ele se recolhe na Leitura (Q5); o Editar o mostra aberto, como mostra todo
  callout hoje.
- `[] ` digitado no começo de uma linha vira `- [ ] ` — o atalho de tarefa do
  Notion; no começo de uma linha, `[] ` não significa nada em Markdown.
- Configurações, ao lado dos números de linha do modo Editar: **Alças de
  bloco** (ligada) e, com a D9 (b), **Enter começa um bloco novo**
  (desligada).
- Todo texto em pt-BR e EN, nenhum solto; a dica da alça diz as suas duas
  ações ("Arraste para mover · clique para o menu").

### 8. O Notion, gesto por gesto

| Notion | Verso | Quando |
|---|---|---|
| ⋮⋮ arrastado | A alça | S1 |
| ⋮⋮ clicado: excluir, duplicar, transformar em, copiar link | O menu do bloco | S1 |
| ⋮⋮ clicado: mover para | — | Depois (D1) |
| ⋮⋮ clicado: cor, comentário | — | Não planejado (D7) |
| `+` | `+`: um parágrafo abaixo, `/` aberto | S1 |
| `/` | `/`, como hoje, mais Toggle | S1 |
| ⌘⇧↑/↓ | ⌥↑/↓, ou ⌘⇧↑/↓ depois de reassociar (D8) | S1 |
| ⌘D | ⇧⌥↓ (D8) | S1 |
| ⌘/ transformar em | Menu do bloco; comandos da paleta | S1 |
| Tab, Shift-Tab | Em listas, como hoje | Hoje |
| Enter, Shift-Enter | Enter duplo; ou a configuração (D9) | Hoje; S1 |
| `- `, `1. `, `# `, `[] ` | O próprio Markdown; `[] ` adicionado | Hoje; S1 |
| `> ` toggle | `> ` é citação; Toggle no `/` | S1 |
| Vários blocos arrastados juntos | Os blocos que uma seleção de texto toca | S2 |
| Arrastado para a direita para aninhar | Itens de lista, pela posição do ponteiro | S2 |
| Arrastado para o lado, em colunas | — | O compositor da D9 do 0060 |

## Consequências

- Cada fatia é um pull request próprio, com as suas linhas de changelog nas
  duas línguas; uma nota do cofre de exemplo que ensina a alça, o `+`, o menu
  e as teclas, uma parada no "Tour do Verso" e os seus passos
  [no roteiro](../reference/demo-vault-walkthrough.md)
  ([0058](0058-demo-vault-as-tutorial.md)); os arrastes rodam por máquina no
  harness do navegador, pelo ponteiro, como os testes do board arrastam; e
  `scripts/check.sh` e `scripts/check-linux.sh` verdes.
- Achar um bloco e calcular um movimento é uma função pura do estado do
  editor, testada pelos testes unitários da janela (`npm test` em `app/ui`,
  [0029](0029-guardrails-in-ci.md)), vistos falhando antes do código: um
  parágrafo de várias linhas, um item de lista com itens aninhados, uma lista
  numerada renumerada, uma linha de `^id` levada junto, um heading contraído,
  o frontmatter nunca bloco, uma lista compacta mantida compacta.
- ⌥↑ num parágrafo de várias linhas muda de sentido: hoje move uma linha para
  fora do parágrafo; com a D8 (a), o parágrafo inteiro. Intencional, e dito
  no changelog.
- O `drag.ts` é generalizado, não copiado: o tratamento do ponteiro serve aos
  dois, e a busca da zona de soltar — presa aos elementos `[data-drop]` de uma
  base — dá lugar, no editor, às posições dos blocos na árvore.
- A spec não muda. Quando este ADR for aceito, a Q21 ganha uma linha
  apontando para cá, nas duas línguas.
- Nenhuma dependência nova é esperada.
- Não coberto: toque (sem mobile nesta fase,
  [0034](0034-roadmap-in-phases.md)); arrastar entre duas notas, que é o
  "Mover para" (D1).
- Fontes: o comportamento do Notion pelas páginas públicas de ajuda linkadas
  acima, e os plugins do Obsidian pelas suas páginas públicas; o código de
  nenhum plugin foi lido. O próprio Obsidian não foi inspecionado
  ([0009](0009-external-constraints.md)).
- **Autoria.** Este registro foi escrito pelo Opus 5.5, no papel de autor de
  documentos do [ADR 0032](0032-author-and-reviewer-roles.md), e é lido pelo
  Fable 5.1 numa sessão própria antes de o mantenedor decidir. O código, UI e
  TypeScript, segue a mesma tabela.

## Alternativas descartadas

Pesadas pelo mantenedor em 2026-10-02:

- A linha como unidade — "linha eu não curto" (o modo por linha do Notion
  Block).
- Um Enter encerrando um bloco, o que faz da linha a unidade de novo — a
  primeira ideia do mantenedor, trocada no mesmo dia pelo Enter duplo. A D9
  (b) não é isso: ela escreve uma linha em branco, então a unidade continua o
  parágrafo.
- Alças no modo Fonte — o Fonte continua código puro.

Consideradas pelo autor e levadas ao mantenedor com este registro:

- Uma árvore de blocos construída no `verso-dialect` e enviada pelo contrato
  — o dialeto é um relatório pela Q18 (b), o editor seria o único
  consumidor, e o editor já tem uma árvore.
- Esperar a Q21 — a Q21 amarra `^id`, merge e visibilidade; a unidade do
  editor pode vir antes, dentro das posições que a Q3 já decidiu.
- Colunas arrastando um bloco para o lado, cores de bloco, comentários — sem
  forma em Markdown ([0013](0013-degrades-to-markdown.md)); colunas são do
  compositor da D9 do 0060.

## Status

Proposto (2026-10-02). D1–D10 esperam o mantenedor. A unidade da D5 e a parte
(a) da D9 são palavras do mantenedor de 2026-10-02, mas o registro como um
todo não está confirmado.
