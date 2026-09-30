# ADR 0057 — O board: um arquivo JSON Canvas, o Excalidraw como superfície, relações tipadas no frontmatter

- Data: 2026-09-30
- Fonte: o mantenedor, em sessão — em 2026-09-29, "vamos puxar a demanda do
  canvas hexcalidraw etc agora" e "vamos fazer isso mesmo"; em 2026-09-30, as
  respostas ao memo
  [`docs/reference/board-decision.md`](../reference/board-decision.md), seção
  9, e às duas perguntas que vieram depois delas (seção 10 do memo);
  [0024](0024-board-excalidraw.md) (Excalidraw),
  [0040](0040-board-persistence.md) (persistência, `[ABERTO]` até este ADR),
  [0030](0030-base-dialect-obsidian-compatible.md) (estender, nunca
  contradizer), [0013](0013-degrades-to-markdown.md) (texto legível),
  [0035](0035-cross-cutting-requirements.md) (a vista acessível),
  [0049](0049-phase-2-scope-widened.md) §3 (pedido e não construído, até este
  ADR)
- Status no briefing: §9 "Persistência do board" `ABERTO` e "Board — camada
  semântica" `PROPOSTO`, §11.3 e §17 item 6 "Sintaxe de relação tipada"
  `ABERTO`, §17 item 9 `ABERTO` — todos `DECIDIDO` a partir de 2026-09-30
  (briefing v0.11)

## Contexto

O board estava fora de escopo até o fim da Fase 2
([0034](0034-roadmap-in-phases.md)). Em 2026-09-29 o mantenedor o puxou para
agora. O ADR 0040 mandava decidir a persistência antes do board; o memo expôs
as perguntas com o que foi observado de fora no Obsidian 1.13.7 (memo, seção
3): campos desconhecidos nos nós, nas arestas e no topo de um `.canvas`
sobrevivem às renomeações do Obsidian e aos salvamentos dele; um nó de um tipo
que o Obsidian não conhece é apagado no salvamento seguinte; os nós `file` de
um canvas e os `[[links]]` dos nós `text` contam como backlinks; um wikilink
entre aspas num valor do frontmatter é link, e um sem aspas é YAML.

## Decisão

**Decidido em 2026-09-30 pelo mantenedor**, em sessão, escolhendo entre as
opções do memo. Os pontos 7 e 9 foram delegados ao autor ("pode seguir a
melhor escolha para nossa aplicação se baseando no mercado") e são escolha do
autor, para o mantenedor questionar.

1. **Escopo.** O board entra agora, registrado como foram as vistas: este
   ADR, uma revisão do 0049 §3, e o roadmap e o `CLAUDE.md` deixando de listar
   o board como fora de escopo. O portão de saída da Fase 2, um mês de uso,
   não muda.
2. **O arquivo é um `.canvas`** (JSON Canvas 1.0). O desenho livre mora no
   mesmo arquivo sob uma chave de topo do próprio Verso:
   `"verso": {"version": 1, "drawing": [ … ]}`, cujo `drawing` guarda
   elementos do Excalidraw. Uma imagem posta no board é um arquivo na pasta
   mostrado por um nó `file` de JSON Canvas, nunca um `dataURL` dentro do
   desenho. O Verso escreve um `.canvas` mantendo todo campo que não conhece e
   a ordem de chaves que leu, no layout do Obsidian (memo, seção 3.2): um
   objeto ou array de escalares numa linha, o resto uma entrada por linha,
   indentação com tab, e a quebra de linha final como o arquivo a tinha
   (nenhuma, num arquivo que o Verso cria).
3. **O Excalidraw desenha o board inteiro** (R1). Nós e arestas de JSON
   Canvas viram elementos do Excalidraw ao abrir e voltam ao salvar pelo
   mapeamento da seção 5 do memo; notas, textos, links, imagens e PDFs são
   desenhados pelo Verso dentro de elementos `embeddable` do Excalidraw;
   grupos são frames; arestas são setas ligadas. O que não tem forma em JSON
   Canvas fica em `drawing`.
   *(Acrescentado em 2026-09-30 pelo mantenedor, em sessão: "no hexcalidraw,
   se eu clico duas vezes ele faz o que vc falou, se eu clico mais uma vez
   entre em modo de edição daquela nota sem sair da tela do board".)* Entra-se
   no cartão de uma nota com um clique duplo, como o Excalidraw entra em
   qualquer embeddable, e ele mostra a nota para leitura; mais um clique no
   texto edita a nota ali, no editor de notas da janela (Live Preview), salva
   como a aba de uma nota salva — de forma atômica, sobre a revisão lida, e
   uma escrita recusada mostra as duas versões no cartão (invariantes 9 e
   11). Esc, ou sair do cartão, volta à leitura; ⌘ com clique duplo, ou o
   botão de abrir do cartão, abre a nota numa aba.
4. **A camada semântica entra**, e a Q10 da spec é decidida com ela. **Uma
   relação tipada é uma propriedade do frontmatter da nota de origem cujo
   valor é um wikilink entre aspas, ou uma lista deles**:
   `aliado: "[[Barão]]"`, `inimigos: ["[[A]]", "[[B]]"]`. A chave é o tipo da
   relação; a direção vai da nota que a guarda para o alvo; várias relações
   entre as mesmas duas notas são o mesmo alvo sob várias chaves. Um `[[x]]`
   sem aspas é uma lista YAML, como o Obsidian o lê, e não um link. No board,
   uma seta desenhada entre dois nós de nota é promovida a relação por ação do
   usuário: o Verso mostra a mudança no frontmatter da nota de origem como um
   plano com o seu diff ([0048](0048-file-operations-in-ui.md)), grava na
   confirmação, e marca a aresta com `"verso": {"relation": "<chave>"}` e a
   chave como rótulo. Isso fecha a parte de links da Q24 da spec.
5. **A conversão do `.excalidraw.md` do plugin Excalidraw vem agora**, por
   ação do usuário, como um plano com o diff: cria um `.canvas` ao lado do
   desenho e deixa o desenho como estava. É escrita a partir da estrutura do
   próprio arquivo e do schema do Excalidraw (MIT); nada do código do plugin
   (AGPL-3.0) é lido.
6. **`.canvas` no índice, como o Obsidian** (Q16 da spec, só para `.canvas`):
   os nós `file` de um canvas e os `[[links]]` dos seus nós `text` são fontes
   de backlink; um `.canvas` é alvo de link pelo nome completo com a extensão
   (`![[Quadro.canvas]]`), nunca pelo nome sem ela. Renomear ou mover uma nota
   atualiza os nós `file` que apontam para ela, no mesmo plano que os links.
7. **A vista acessível é um sumário ao lado do board** — escolha do autor. O
   board desenha num `<canvas>` que um leitor de tela não lê; os quadros
   brancos do mercado chegam lá por uma ordem de foco sobre os objetos do
   quadro (o suporte a leitor de tela do FigJam move o foco pelo canvas e
   deixa conectores e decorações de fora por padrão, com uma opção para
   incluí-los; o Miro entrega os objetos ao leitor de tela e ao teclado). O
   board do Verso tem um painel de sumário que lista os grupos com os seus nós
   (uma nota como link, o texto de um nó `text`, o endereço de um link), as
   arestas como "A → B (rótulo)", e, atrás de um botão, os textos livres do
   desenho; percorrê-lo pelo teclado seleciona e centraliza o mesmo objeto no
   board, e Enter abre uma nota. Isso promove a proposta do ADR 0035 para o
   board.
8. **Os recursos e as funções online do Excalidraw.** Toda fonte é servida
   pelo app, a Xiaolai incluída; nada carrega de `esm.sh`. O link de
   compartilhamento, a colaboração, a IA, o Excalidraw+ e o navegador de
   bibliotecas online ficam escondidos, pelo
   [0050](0050-outbound-network-access.md). O recurso "Mermaid to Excalidraw"
   fica, com a segunda cópia do Mermaid que ele traz. `0BSD` entra na
   allowlist de licenças npm e `fuzzy` é aceito à mão como MIT (`LICENSE-MIT`
   no pacote).
9. **A vista de texto fica**: um `.canvas` abre como board, e "abrir como
   texto" mantém o JSON cru a um clique — escolha do autor.
10. **O acabamento do board e as suas configurações** *(acrescentado em
    2026-09-30 pelo mantenedor, em sessão: "pode fazer, deixa tudo
    redondinho", sobre a revisão do autor das funções do Excalidraw no
    board).*
    - **Exportar.** O board tem o seu próprio "Exportar imagem" (⌘⇧E, e o
      menu principal), no lugar do do Excalidraw, que desenhava cada cartão
      como uma incorporação web vazia: cada cartão sai como a sua caixa, o seu
      nome e o seu texto como se lê (um cartão de imagem, como a imagem). PNG
      ou SVG, de 1× a 3×, com ou sem fundo, claro ou escuro, o board inteiro
      ou a seleção; salvo ao lado do board na pasta de anexos, salvo em
      Downloads, ou copiado. As cópias como PNG ou SVG do próprio Excalidraw
      ficam escondidas.
    - **Incorporação web** fica escondida: o board desenha só os seus
      cartões, e a ferramenta terminava num erro. Incorporar uma página num
      board não está decidido.
    - **Fundo.** A cor de fundo de um board fica no arquivo, em
      `verso.background`; nenhuma quer dizer o papel do app.
    - **Palavras.** As palavras do Excalidraw que a sua tradução pt-BR não tem
      aparecem em português quando a janela está em português; a faixa
      "clique para interagir" some (entra-se num cartão com clique duplo).
    - **Fontes.** O endereço reserva das fontes do Excalidraw (`esm.sh`) sai:
      toda fonte é a do app, como diz o ponto 8.
    - **Configurações**, numa seção "Board": abrir um `.canvas` como board ou
      como texto (o padrão do ponto 9 vira configuração); ao abrir um board,
      mostrar tudo ou voltar onde ele ficou naquela janela (guardado no
      armazenamento da janela, nunca no arquivo); o traço das formas novas
      (limpo ou à mão livre) e a fonte do texto novo (manuscrita, comum ou de
      código); a grade ligada ou não ao abrir um board; a pasta que "Novo
      board" usa quando não é chamado de uma pasta.

## Consequências

- O ADR 0040 é decidido pelo ponto 2; a camada semântica do ADR 0024 pelo
  ponto 4; a vista acessível do board do ADR 0035 pelo ponto 7.
- O ADR 0052 dizia "a chave de uma propriedade não é tipo de relação"
  enquanto a Q10 estava aberta. Pelo ponto 4 uma propriedade cujo valor é um
  link é uma relação, nomeada pela chave; uma propriedade com qualquer outro
  valor não é.
- O ponto 2 se apoia em comportamento observado no Obsidian 1.13.7 e não
  prometido pela spec do JSON Canvas: um Obsidian futuro que descartasse
  chaves de topo desconhecidas perderia o desenho ao salvar. As sondagens O4 e
  O6 do memo são repetidas a cada versão do Obsidian que o mantenedor
  instalar, e registradas em `docs/reference/obsidian-observations.md`.
- O escritor de `.canvas` está sob as invariantes de toda escrita — atômica,
  e conferida contra a revisão que leu (invariantes 9 e 11) — e abrir um board
  não escreve nada (invariante 7). Um teste de ida e volta, visto falhando
  antes do merge, guarda o layout: um arquivo no layout do Obsidian lido e
  escrito sem mudança sai byte a byte igual.
- A janela ganha o React, só dentro do painel do board, e um chunk carregado
  quando um board abre; o resto da janela continua TypeScript sem framework.
- Os textos e rótulos do board em pt-BR e inglês
  ([0035](0035-cross-cutting-requirements.md)); o locale `pt-BR` do próprio
  Excalidraw segue a língua da janela.

## Alternativas descartadas

Consideradas pelo mantenedor no memo e deixadas de lado em 2026-09-30:

- Um sidecar `.excalidraw` ao lado do `.canvas` — fica órfão quando o
  Obsidian renomeia, move ou apaga o canvas.
- Um arquivo Excalidraw como o board, com `.canvas` só por exportação — não
  cabe no ADR 0040.
- O Verso desenhando os nós com o Excalidraw só como camada transparente por
  cima (R2) — dois motores mantidos em passo.
- A relação guardada só na aresta do board; a camada semântica adiada.
- A conversão do `.excalidraw.md` deixada para depois.

Descartado por observação, não por preferência: o desenho guardado como nós
de canvas de um tipo do próprio Verso, que o Obsidian apaga no salvamento
seguinte (memo, seção 3.2, O5).

## Status

Aceito (2026-09-30).
