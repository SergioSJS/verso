# ADR 0063 — Pôr imagens e arquivos no board: soltar, colar, escolher e arrastar

- Data: 2026-10-03
- Fonte: o mantenedor, em sessão, depois de o board recusar uma imagem
  solta: "como eu insiro imagem na porra do board? se eu arrasto pra dentro
  ele abre numa aba nova, se arrasto da árvore de arquivos mesma coisa, não
  tem botão algum de importar", e "DEVERIA ESTAR FUNCIONANDO ASSIM, ADR
  FALHA, nao faz sentido algum nao ter essas possibilidades", com o botão
  "Nota ou arquivo" difícil de achar. Parte do ponto 2 do
  [0057](0057-board-json-canvas.md).
- Revisões: 2026-10-06 — ponto 4: o botão é um menu dentro da própria barra
  do Excalidraw, a partir do backlog do mantenedor de 2026-10-04: "o agente
  fez uma barra nova de botões do lado de fora, totalmente sem padrão da
  aplicação sendo que era pra estar dentro como nessas opções dos prints" —
  o botão de imagem do plugin do Excalidraw para o Obsidian e o seu menu.
- Status no briefing: não consta

## Contexto

O ponto 2 do [ADR 0057](0057-board-json-canvas.md) diz que uma imagem no board
é um arquivo da pasta mostrado por um nó `file` do JSON Canvas, nunca um
`dataURL` no desenho. A janela cumpria isso recusando todo arquivo solto ou
colado, com uma linha na barra de status, e oferecendo um caminho só: "Nota ou
arquivo", que abre o seletor rápido. Um arquivo arrastado da árvore abria numa
aba, porque o board não era alvo de soltar.

## Decisão

Escrito pelo autor a partir das palavras do mantenedor acima, e aceito pelo
mantenedor como está escrito (Status).

1. **A regra do 0057 fica**: uma imagem ou um PDF no board é um arquivo da
   pasta mostrado por um cartão de arquivo. Nada é guardado no desenho.
2. **Uma imagem ou um PDF solto no board, ou colado nele, é copiado** para a
   pasta, ao lado do board, na pasta de anexos (Ajustes › Arquivos, como nas
   notas), com um nome livre, e um cartão que o mostra é posto onde foi solto,
   ou no meio da vista quando colado. Vários arquivos entram em escada. Outro
   tipo de arquivo é recusado com uma linha que diz isso e aponta para Inserir ›
   "Nota ou arquivo da pasta".
3. **Um arquivo arrastado da árvore para o board vira um cartão** do arquivo
   que já está na pasta; nada é copiado e nenhuma aba abre. Uma nota, uma
   imagem, um PDF: o que "Nota ou arquivo" aceita.
4. **Um botão "Inserir" na barra do Excalidraw** (revisto em 2026-10-06),
   onde ficaria a ferramenta de imagem do próprio Excalidraw, abre um menu
   com a roupa dos menus do Excalidraw: "Imagem ou PDF do computador…" abre o
   seletor de arquivos do sistema para imagens e PDFs e faz o que o ponto 2
   faz; "Nota ou arquivo da pasta…", "Cartão de texto" e "Link da web…" são
   os outros caminhos do board. Não há barra do Verso ao lado da do
   Excalidraw.

## Consequências

- Código do board: `onDropCapture` e `onPasteCapture` copiam em vez de
  recusar; o arrastar por ponteiro da árvore ganha um board como alvo (o
  arrastar e soltar HTML5 está morto na janela web, por isso o da própria
  árvore).
- Testes e2e (`app/ui/e2e/board-images.spec.mjs`), cada um visto falhando sem
  a mudança: uma imagem solta, uma colada, um arquivo recusado, o botão, uma
  nota arrastada da árvore.
- Changelog, um passo do roteiro e a lição do board de treino nas duas
  línguas.
- Autoria: Sonnet 5.5 em sessão; a revisão de 2026-10-06 por Opus 5.5. As
  duas desviam do [ADR 0032](0032-author-and-reviewer-roles.md) (interface
  por Opus 5, lida por Fable 5.1), e em 2026-10-06 o mantenedor pediu que o
  Fable não fosse usado ("evite usar fable"): a leitura antes do merge é o
  mantenedor quem designa.
- Deixados de fora de propósito, e não decididos (apresentados ao mantenedor
  em 2026-10-06 com a recomendação de deixá-los assim): a mesma imagem solta
  duas vezes é copiada duas vezes — sem comparar conteúdo; um arquivo de fora
  que não é imagem nem PDF (uma nota vinda do Finder) é recusado, não copiado
  — copiar notas para a pasta é uma decisão à parte.

## Alternativas descartadas

Nenhuma registrada.

## Status

Aceito (2026-10-06): o mantenedor, em sessão. Perguntado qual era a decisão e
qual a recomendação do autor — aceitar os pontos 1 a 4 como estão escritos,
o ponto 4 como revisto, deixando de fora os dois itens das Consequências —,
o mantenedor respondeu "gosto da sua sugestão". A linha de status anterior
(2026-10-03) se apoiava só nas palavras citadas no cabeçalho, que pedem a
funcionalidade e não aceitam texto nenhum; uma revisão em 2026-10-06 a achou
sem apoio, e esta linha a substitui.
