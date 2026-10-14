# ADR 0090 — Mapas no board: uma imagem debaixo do board, alfinetes que abrem notas, alfinetes secretos

- Data: 2026-10-14
- Fonte: o mantenedor, em 2026-10-14 às 11:36 UTC, enviando um plano de
  novos recursos rascunhado com outro assistente cujo terceiro item é um
  "Atlas" de mapas interativos — uma imagem grande com alfinetes que
  abrem notas, alfinetes que mantêm o tamanho em qualquer zoom, uma
  prévia ao passar o ponteiro, alfinetes secretos — guardado num arquivo
  `.map` próprio. A leitura em sessão naquela manhã propôs o board no
  lugar, que o Obsidian abre, e listou o que falta a ele; propôs os mapas
  para uma versão posterior. A resposta do mantenedor naquela noite:
  *"VAI SER TUDO NA V1"* — os mapas incluídos, sem versão posterior.
  Escrita por Opus 5.5; a ser lida pelo outro modelo antes de ser aceita
  ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0057](0057-board-json-canvas.md) (o board, um arquivo
  JSON Canvas desenhado com o Excalidraw; spec §5.11), [0063](0063-files-onto-the-board.md)
  (uma imagem é um cartão de arquivo), [0024](0024-board-excalidraw.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md) item 12 (um board é
  uma sala dos seus elementos), [0085](0085-hover-preview.md) (a prévia
  do alfinete), [0087](0087-secret-blocks-hidden-from-readers.md) (aos
  leitores é servida uma projeção), [0036](0036-tabletop-rpg-support.md)
  (viewports nomeados, a vista do jogador), [0011](0011-config-outside-tree-index-as-cache.md)
  (caches fora da pasta), [0009](0009-external-constraints.md),
  [0035](0035-cross-cutting-requirements.md).
- Status no briefing: ausente; ao ser aceita.

## Contexto

O que existe. Um board é um `.canvas` no formato JSON Canvas; o desenho
do Verso vive sob a chave `verso` do nível de cima, e um nó ou uma aresta
pode levar uma chave `verso` própria (`background`, `locked`, `groups` e
outras; spec §5.11 item 5). A ordem dos nós é a ordem de empilhamento do
board, e um elemento desenhado registra o cartão sob o qual está
(`under`; `app/ui/src/board/model.ts`). Uma imagem ou um PDF no board é
um cartão de arquivo de um arquivo da pasta, nunca dados no desenho
([0063](0063-files-onto-the-board.md); `app/ui/src/board/cards.tsx`). Um
board é coeditado ao vivo como uma sala dos seus elementos
(`crates/verso-server/src/collab_board.rs`).

Observado no Obsidian 1.13.7 para a [0057](0057-board-json-canvas.md)
(`docs/reference/board-decision.md`, O1–O5): campos desconhecidos num nó,
numa aresta e no nível de cima são mantidos quando o Obsidian salva o
canvas; um nó de um **tipo** desconhecido é apagado. Então tudo o que um
mapa acrescentar tem de ser um campo num nó de um tipo que o Obsidian
conhece.

O que um mapa precisa e o board não tem: uma imagem que fica debaixo de
tudo e não se move por acidente; alfinetes — pequenas marcas que abrem
uma nota — que mantêm o tamanho na tela em qualquer zoom; uma prévia ao
passar o ponteiro, que ainda não existe em lugar nenhum
([0085](0085-hover-preview.md)); imagens grandes (um continente com
16.000 pixels de lado) desenhadas sem carregá-las inteiras; e alfinetes
que um jogador não pode ver. Se o próprio "Enviar para trás" do
Excalidraw alcança um cartão não foi verificado para esta ADR.

O Atlas VTT, que o plano nomeia, está sob a **AGPL-3.0** (verificado no
GitHub em 2026-10-14, `gh api repos/atlas-vtt/atlas-vtt`); o Verso é
MPL-2.0 ([0005](0005-license.md)): as ideias dele podem ser estudadas, o
código dele não é copiado.

## Decisão

Proposta (2026-10-14). Cada `[ABERTO]` traz uma recomendação; o
mantenedor decide.

1. **Um mapa é um board.** Nenhum arquivo `.map` e nenhum tipo de nó
   próprio do Verso: um mapa abre no Obsidian como um canvas com uma
   imagem e cartões.
2. **A imagem do mapa.** "Usar como mapa" num cartão de imagem o trava
   (`verso.locked`), manda-o para o fundo da ordem de empilhamento e o
   marca `"verso": {"map": true}`; "Deixar de usar como mapa" desfaz as
   três coisas. Um board pode ter vários (um mundo e um recorte em
   detalhe). "Enviar para trás" e "Trazer para a frente" são oferecidos
   em todo cartão. `[ABERTO]`: o nome do campo. Recomendado: `map`.
3. **Alfinetes.** Um alfinete é um cartão de arquivo que nomeia uma nota,
   desenhado sobre um mapa como uma marca com a figurinha da nota ou um
   ícone padrão e o nome dela, num tamanho constante na tela, ancorado no
   seu ponto, qualquer que seja o zoom; passar o ponteiro mostra a prévia da
   nota ([0085](0085-hover-preview.md)), um clique a abre. Soltar uma
   nota da árvore sobre um mapa cria um alfinete; "Fixar uma nota aqui…"
   no menu do mapa também. Um alfinete é marcado `"verso": {"pin": true}`;
   no Obsidian ele é um cartão de arquivo. Os alfinetes de um mapa ficam
   agrupados com ele (`verso.groups`), então mover o mapa os move.
4. **Imagens grandes.** A janela desenha um mapa a partir de tiles no
   zoom mostrado, feitos a partir da imagem uma vez e guardados como
   cache **fora da pasta** ([0011](0011-config-outside-tree-index-as-cache.md);
   num servidor, no diretório de dados dele), nunca gravados ao lado da
   imagem. `[ABERTO]`: como. Recomendado: **tiles próprios do Verso
   desenhados sob o canvas do Excalidraw**, com a câmera do board os
   conduzindo, medidos antes com uma imagem de 16.000 pixels no servidor
   de 1 GB e num celular; um segundo visualizador (Leaflet,
   OpenSeadragon, nomeados no plano) precisaria ter a câmera dele mantida
   em sincronia com a do Excalidraw.
5. **Alfinetes secretos.** `[ABERTO]`: como um alfinete é escondido dos
   leitores. Dois caminhos foram levantados:
   - (a) **a projeção da [0087](0087-secret-blocks-hidden-from-readers.md)
     aplicada ao board**: um nó marcado `"verso": {"secret": true}` — e as
     arestas que tocam nele, e os elementos desenhados agrupados com ele
     — fica de fora do que um UniVerso serve a um leitor: os bytes do
     arquivo, a sala do board (cujos elementos o servidor guarda e pode
     filtrar por leitor), a busca, os links e as contagens; quem escreve o
     vê, desenhado como secreto, com um botão "ver como leitor"; no
     Obsidian ele é um cartão;
   - (b) **uma camada num board separado** numa pasta não compartilhada
     com os jogadores, sobreposta ao mapa para quem puder lê-la — a
     leitura de 2026-10-14, escrita antes de o mantenedor escolher a
     projeção para as notas.
   Recomendado: **(a)**, a mesma regra do bloco secreto de uma nota, de
   modo que uma ideia cubra os dois; (b) não mostra o lugar de um alfinete
   a ninguém, mas precisa de um segundo arquivo mantido em sincronia com o
   primeiro.
6. **Um board exportado como imagem** por quem escreve pergunta se deixa
   os alfinetes secretos de fora, deixados de fora por padrão.
7. **Acessibilidade** ([0035](0035-cross-cutting-requirements.md)): os
   alfinetes de um mapa são listados no painel lateral como uma lista de
   links, em ordem de leitura (de cima para baixo, da esquerda para a
   direita), o equivalente em texto do mapa; um alfinete é alcançável
   pelo Tab e nomeado pela sua nota; pt-BR e inglês.

## Consequências

- O modelo do board ganha `map`, `pin` e (com o item 5a) `secret`,
  mantidos pela escrita como todo campo `verso` é; o item 5 da spec
  §5.11 é revisto no mesmo PR, com uma fixture de um mapa para a
  aprovação do mantenedor ([0031](0031-fixtures-as-contract.md)), e a
  manutenção dos campos pelo Obsidian observada de novo (O4) na versão
  do dia.
- A janela: os comandos do mapa, o desenho do alfinete num tamanho
  constante, os tiles e o cache deles, a lista do painel; testes e2e no
  harness para um mapa, a prévia de um alfinete e o board de um leitor; a
  suíte do servidor para a projeção de um board; o "Treino do Board" do
  tutorial ganha uma lição sobre mapas
  ([0058](0058-demo-vault-as-tutorial.md)); o changelog ganha a sua
  linha.
- Depende da [0085](0085-hover-preview.md) e, para o item 5a, da
  [0087](0087-secret-blocks-hidden-from-readers.md): o último dos
  recursos da V1 na ordem recomendada (`docs/roadmap.md`, revisão 8).
- Névoa de guerra, tokens e combate — o que uma mesa virtual faz — não
  estão nesta ADR.

## Alternativas descartadas

- **Um arquivo `.map` próprio do Verso** (o plano de 2026-10-14), com a
  imagem e os marcadores dela em YAML ou JSON: o Obsidian não o abre, e
  um board já tem uma imagem e cartões.
- **Código do Atlas VTT** (nomeado no plano): AGPL-3.0, incompatível com
  a MPL-2.0 do app; só ideias.

## Status

**Proposta (2026-10-14).** Na V1 pela palavra do mantenedor de
2026-10-14 (*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revisão 8). Para o
mantenedor, cada um com uma recomendação: o nome do campo (item 2), os
tiles (item 4), e alfinetes secretos por projeção ou por um board
separado (item 5).
