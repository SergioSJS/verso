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
- Revisões: 2026-10-03 — como imagens e arquivos chegam ao board (soltar, colar, escolher, arrastar) está no [0063](0063-files-onto-the-board.md); o ponto 2 continua valendo. 2026-10-06 — o ponto 10 ganha o recorte de um cartão de imagem, guardado no nó dele (o mantenedor, perguntado onde o recorte fica: "No card, sem tocar no arquivo"). 2026-10-06 — ponto 5: um desenho do plugin abre no seu desenho; ponto 20: uma seta fica presa no ponto para onde foi desenhada, sobre as builds de desenvolvimento do Excalidraw (o mantenedor, abaixo).
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
opções do memo. O ponto 7 foi delegado ao autor ("pode seguir a melhor
escolha para nossa aplicação se baseando no mercado", a resposta à pergunta 7
do memo); o ponto 9 é escolha do autor, não perguntada. Os dois foram
decididos pelo mantenedor em 2026-10-01 (ponto 18).

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
   *(Revisto em 2026-10-06 pelo mantenedor, em sessão: "nao to conseguindo
   abrir um excalidraw criado no obisidian nao abre no nosso board";
   perguntado como, escolheu "Mostrar o desenho + converter" em vez de
   editar o arquivo do plugin no lugar e em vez de só um botão mais
   visível.)* Um desenho do plugin abre no seu desenho, mostrado como foi
   desenhado, para ver — o modo de visualização do Excalidraw, as imagens
   pelos arquivos que o desenho nomeia — no lugar do seu texto, com
   "Converter em board" acima e o texto a um clique. Mostrar não escreve
   nada; a conversão continua sendo ação do usuário, como acima.
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
   no pacote) — confirmado pelo mantenedor em 2026-10-01 (revisão
   [`board.md`](../review/board.md) §6 item 11).
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
    - **A cor de um cartão.** O fundo escolhido para um cartão no painel do
      board fica no nó dele, na chave `verso` do próprio nó
      (`"verso":{"background":"#a5d8ff","fill":"hachure"}`, o preenchimento
      como o painel o chama, sólido não escrito), como uma relação fica numa
      aresta: o JSON Canvas não tem campo para isso, e o Obsidian mantém os
      campos desconhecidos de um nó (memo O1). Nenhuma, ou transparente, tira
      a chave. Pedido pelo mantenedor em 2026-09-30 ("tem como respeitar?").
    - **O recorte de um cartão de imagem.** Uma imagem no board pode ser
      recortada — pedido pelo mantenedor em 2026-10-06 ("senti falta de
      ferramenta de cortar imagem"). O recorte fica no nó do cartão, na
      chave `verso` dele, como a parte da imagem mostrada, em frações da
      largura e da altura (`"verso":{"crop":{"x":0.1,"y":0.2,"w":0.6,"h":0.5}}`);
      o arquivo da imagem nunca é gravado, o recorte muda ou sai a qualquer
      momento, e uma imagem pode ser recortada de jeitos diferentes em dois
      cartões. O cartão toma as proporções do recorte. O Obsidian, que mantém
      a chave, mostra a imagem inteira; a exportação do board como imagem
      mostra o recorte. Escolhido pelo mantenedor em 2026-10-06 em vez de uma
      cópia recortada do arquivo.
    - **O estilo de um cartão e de uma aresta.** O mais que o painel define e
      o JSON Canvas não tem campo para guardar fica do mesmo jeito, na chave
      `verso` do próprio item, e só quando não é como o board desenha o item
      por padrão: num cartão, `corners` (`"sharp"`), `strokeWidth`,
      `roughness` e `angle`; numa aresta, `line` (`"curved"` ou `"elbow"`),
      `strokeWidth`, `roughness`, `startHead` e `endHead` (o tipo de ponta,
      onde a aresta tem uma), `bends` (os pontos onde uma aresta reta dobra, a
      partir do início dela) e, do rótulo, `labelSize` e `labelFont`; nos
      dois, `strokeStyle`, `opacity`, `locked` e `groups`. O Obsidian não
      desenha nenhum deles e mantém todos (memo O1). Uma aresta em cotovelo é
      traçada de novo em ângulos retos quando o board abre. Pedido pelo
      mantenedor em 2026-09-30 ("coloquei porta reta, ele aplica mas nao
      salva, se fecho e abro volta arredondada").
    - **O lugar de um desenho entre os cartões** *(acrescentado em
      2026-10-01: o mantenedor, "Corrija qualquer pendência que tenha
      ficado", sendo a pendência que um desenho mandado para trás de um
      cartão voltava por cima dele).* Um elemento desenhado que fica por
      baixo de um cartão guarda, no arquivo, o cartão sob o qual está
      (`"under":"<id do nó>"` no elemento, em `verso.drawing`); nenhum quer
      dizer por cima de todos os cartões, como antes, então um board cujo
      desenho está todo por cima dos cartões é escrito como foi lido. O board
      o põe de volta logo abaixo daquele cartão quando abre; um cartão que
      sumiu o põe por cima.
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

**Decidido em 2026-10-01 pelo mantenedor**, em sessão, sobre a revisão
crítica [`docs/review/board.md`](../review/board.md), seção 6: "Aceito todas
(Recomendado)", aceitando a recomendação do autor escrita sob cada item dessa
seção (a seção 8 da revisão guarda a lista como foi apresentada).

11. **O `file` de um cartão é um caminho a partir da raiz** (item 1), como o
    JSON Canvas o descreve e a janela o lê: o core o resolve só por esse
    caminho, nunca por um nome achado em outra pasta, então um cartão
    deixado num caminho que sumiu não liga a nada, e mover a nota dele o
    reescreve (ponto 6).
12. **Só a mudança do usuário no board é gravada** (item 3): uma mudança num
    cartão, numa aresta, no desenho ou no fundo, feita com as ferramentas do
    board. Um clique, uma seleção, um arrasto da vista ou um zoom não gravam
    nada. O que o board ajusta sozinho — um texto medido de novo quando a
    fonte chega, um marcador tirado, uma aresta tirada de um grupo — não é
    gravado por si, e vai junto com a primeira edição de verdade.
13. **Um canvas em outro layout** (item 4) — escrito por outra ferramenta, ou
    com fins de linha do Windows — só é reescrito no layout do Obsidian pelo
    primeiro salvamento numa aba depois de a reescrita aparecer como diff e
    ser aceita; recusada, nada é gravado.
14. **Um salvamento muda só o que o usuário mudou** (item 5). Uma aresta
    mantém os seus lados enquanto cada ponta fica no cartão em que estava, e
    uma sem lado não ganha nenhum; uma ponta presa de novo toma o lado que
    encontra. A geometria onde o arquivo a pôs mantém o valor do arquivo,
    fração inclusive; o que o usuário moveu ou redimensionou é gravado em
    números inteiros. O que o board não consegue desenhar — uma entrada sem
    id ou tipo, uma aresta cuja ponta não nomeia nó, um rótulo vazio — volta
    para onde estava.
15. **Um board aberto segue o seu arquivo** (item 6): mudado em disco
    enquanto o board não guarda nada não salvo, ele é desenhado de novo a
    partir do arquivo, como a aba de uma nota toma o texto do disco; com algo
    não salvo, o salvamento encontra a diferença e mostra as duas versões
    (invariante 11).
16. **O leitor de canvas passa por fuzzing** (item 9), ao lado do parser do
    dialeto e sob o mesmo guardrail (ADR 0029): um parser escrito à mão de
    arquivos da pasta.
17. **Os campos do ponto 10 são o formato** (item 14), com os nomes de lá; a
    §5.11 da spec os registra. Para uma seta com dobras, o ponto 10 vale
    sobre a seção 5 do memo.
18. **Os pontos 7 e 9 estão decididos** (item 15): o sumário ao lado do board,
    e a vista de texto a um clique.
19. **Uma página web mantém os comandos de edição do sistema** (item 20).
    Desfazer, Refazer e Selecionar tudo do menu Edição avisam as janelas do
    app (para que o ⌘Z chegue a um board); numa página web — uma janela só
    dela, ou um site mostrado numa janela do app — roda o comando da própria
    página, como o item do sistema rodava.

**Decidido em 2026-10-06 pelo mantenedor**, em sessão: "fui testar o
excalidraw, ele ta muito mais elegante em si tratando com as setas [...] se
eu faço uma seta entre dois elementos, ele salva exatalemte o lugar onde a
seta ta pontando"; perguntado como, escolheu "Excalidraw next" em vez de
ficar na versão estável e pôr o ponto por código do próprio Verso, e em vez
de manter as setas no meio de um lado.

20. **Uma seta fica presa no ponto para onde foi desenhada.** As builds de
    desenvolvimento do Excalidraw prendem cada ponta de uma seta a um ponto
    do elemento, em frações da sua caixa, encontrado no contorno (`orbit`)
    ou no próprio ponto (`inside`); a versão estável, 0.18.1, prende uma
    ponta por um foco em direção ao meio, e o Verso desenhava toda aresta a
    partir do meio de um lado. O board passa a usar uma build de
    desenvolvimento, fixada numa versão exata no `package.json`
    (`@excalidraw/excalidraw@0.18.0-<commit>`), trocada só numa mudança
    própria com a suíte inteira verde. Uma aresta — uma seta de um cartão a
    um cartão — passa por baixo dos cartões, como o canvas a desenha: as
    pontas ficam presas no contorno dos cartões, mirando os seus pontos, já
    que uma ponta dentro de um cartão esconderia a cabeça da seta. Uma seta
    com uma ponta numa forma do desenho é do desenho, desenhada por cima dos
    cartões, e vale o jeito do próprio Excalidraw: a cabeça no ponto para
    onde foi desenhada, dentro de uma imagem inclusive; o cartão que ela
    alcança a lista, lido do arquivo, e assim ela se move com o cartão. Uma
    aresta do canvas escreve, para o Obsidian, o lado que a seta encontra, e
    sob o `verso` da aresta o ponto (`"fromPoint": [x, y]`, `"toPoint"`)
    quando ele não é o meio desse lado. Lida, uma aresta fica presa no seu
    ponto, senão no meio do seu lado, senão no meio do lado voltado para o
    outro cartão. O ponto 14 continua valendo, com mais um caso: uma ponta
    movida no seu cartão ganha o lado que agora encontra.

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
- O ponto 20 prende o board a uma build de desenvolvimento do Excalidraw, a
  que o plugin Excalidraw do Obsidian usa: a API e o layout dela mudam entre
  builds (na primeira troca, `scrollToContent` virou `setViewport`, o
  callback da API virou `onExcalidrawAPI`, a barra do layout de celular foi
  para o pé do board, e o vínculo da seta perdeu foco e distância). Os
  testes e2e do board é que dizem quando uma build o quebra; a lista de
  licenças npm permitidas roda com as verificações, e o `npm audit` é lido
  a cada troca contra o da anterior (na primeira, os mesmos 16 avisos da
  0.18.1, nenhum novo). Desenhos do
  plugin feitos com essas builds abrem com as setas onde foram desenhadas.

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

Oferecidas com as revisões de 2026-10-06 e não escolhidas:

- Setas: ficar no Excalidraw 0.18.1 e pôr uma ponta no seu ponto por código
  do próprio Verso; manter toda aresta no meio de um lado.
- Um desenho do plugin: editá-lo no lugar, escrito de volta no formato do
  plugin (que muda sem aviso); só um botão mais visível sobre o seu texto.

Descartado por observação, não por preferência: o desenho guardado como nós
de canvas de um tipo do próprio Verso, que o Obsidian apaga no salvamento
seguinte (memo, seção 3.2, O5).

## Status

Aceito (2026-09-30); os pontos 11 a 19 em 2026-10-01; o ponto 20 e a
revisão do ponto 5 em 2026-10-06.
