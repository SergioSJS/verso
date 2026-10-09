# A janela num celular e num tablet: primeira revisão (2026-10-09)

O que a janela faz hoje numa tela de toque, medido no harness do navegador,
e o que foi consertado na hora, a pedido do mantenedor em 2026-10-09, de
uma revisão minuciosa da janela num celular e num tablet. É também o ponto
de partida da investigação que o item 9 do ADR 0073 (proposto, na branch
`docs/server-first`) pede, e que termina num ADR próprio; nada aqui decide
como a janela fica num celular.

## Como foi medido

Em 2026-10-09, por uma sessão do Opus 5.5, no harness compilado a partir da
`main` (7ce2407) com o cofre de exemplo, pelo Playwright com o toque ligado:

| Viewport | Motor | Representa |
|---|---|---|
| 390 × 844 | WebKit | iPhone |
| 412 × 915 | Chromium | celular Android |
| 820 × 1180 e 1180 × 820 | WebKit | iPad, em retrato e em paisagem |
| 1024 × 768 | Chromium | um tablet pequeno ou uma janela estreita |

O Playwright só move um dedo no Chromium (pelo protocolo do DevTools); um
toque longo no iOS, o teclado da tela e os botões da própria janela não
puderam ser observados no harness.

## Consertado no mesmo branch

| Achado | Nível | Conserto |
|---|---|---|
| Um deslizar que rola a árvore de arquivos começava um arraste: o toque seguinte numa pasta movia a nota para dentro dela | BLOQUEANTE (dados) | um dedo só arrasta depois de um toque longo; um ponteiro que o navegador toma de volta cancela o arraste (`layout/drag.ts`) |
| Nenhum menu de contexto numa tela de toque: o iOS não dispara `contextmenu` num toque longo | BLOQUEANTE | um toque longo e o levantar do dedo abrem o menu que o clique direito abre (`touch.ts`); campos, o editor, o board e o texto mantêm o toque longo do próprio sistema |
| O menu de arquivo, 26 itens, 866 px de altura, passava do pé da tela | BLOQUEANTE | o menu fica dentro do que a tela mostra e rola (`menu.ts`, `.menu`) |
| O diálogo de ajustes deixava 140 px para a sua página num celular, e só fechava com Esc ou um toque ao lado | BLOQUEANTE | abaixo de 760 px as seções viram uma fileira acima da página; um × o fecha |
| A busca nas notas só se limpava apagando ou com Esc (o achado do mantenedor) | IMPORTANTE | um × no campo |
| O iOS dá zoom num campo cujo texto tem menos de 16 px | IMPORTANTE | todo campo escreve com 16 px no mínimo numa tela de toque (`css/touch.css`) |
| Controles mostrados só ao passar o ponteiro (remover uma propriedade, fechar uma aba, dobrar, copiar código, capa, ações de foco…) | IMPORTANTE | mostrados em repouso quando a tela não tem hover |
| Alvos de toque de 19 a 32 px (barra de status, ribbon, linhas da árvore) | IMPORTANTE | 44 px para o ribbon e a barra de status, linhas de 40 px (abaixo dos 44 px pedidos, para a árvore seguir legível; para o ADR), divisórias mais largas |
| O campo "Mover para…" tinha 17 px de largura num celular | IMPORTANTE | o rótulo dele quebra para cima do campo |
| A tabela de uma base quebrava palavras letra por letra num celular | IMPORTANTE | cada coluna guarda 7 rem; a tabela rola para o lado |
| A busca do seletor de figurinhas dizia "Buscar nas notas" | MENOR | palavras próprias |

## Deixado para o ADR de responsividade

Cada um precisa de uma escolha sobre como a janela se organiza num celular,
que cabe ao ADR fazer:

- **Áreas divididas num celular**: duas áreas de 173 px, o rótulo da aba
  empurrado para fora pelas ferramentas da área; num iPad em retrato, as
  propriedades espremidas. Recusar ou empilhar divisões abaixo de uma certa
  largura; deixar a área, e não a tela, decidir o seu layout (container
  queries); recolher as ferramentas da área.
- **O grafo**: os controles dele ocupam 15 rem, deixando 90 px para o grafo;
  pinça só pelos eventos de gesto do WebKit; texto de ajuda que fala da
  roda do mouse e de cliques duplos.
- **Seguir um link no modo Editar** exige ⌘ ou Ctrl.
- **O kanban**: um deslizar que começa num cartão não consegue rolar
  (`touch-action: none`); as colunas não cabem num celular.
- **O ribbon e a barra de status num celular**: 44 px de verbos que são de
  um desktop, contagens do índice na barra de status, números de linha no
  modo Fonte.
- **O teclado da tela**: o menu de contexto agora fica dentro do que o
  teclado deixa (`visualViewport`); o menu `/` e o seletor de figurinhas
  ainda são posicionados contra a altura da janela.
- **Leitores de tela com toque**: o VoiceOver no iPhone e no iPad, o
  TalkBack no Android ([ADR 0035](../adr/0035-cross-cutting-requirements.md)
  item 2) — não testados; o toque longo do `touch.ts` não pode tomar os
  gestos do próprio leitor de tela.
- **Teclas modificadoras e cliques duplos**: seleção múltipla na árvore,
  manter uma aba de pré-visualização, abrir sem pré-visualização.
- **Texto abaixo de 12 px** na barra de status e nos títulos laterais; as
  áreas seguras de um celular com notch (`env(safe-area-inset-*)`); a página
  inteira dá zoom numa pinça.
- **Itens de menu que não significam nada num navegador** ("Mostrar no
  Finder", "Abrir em nova janela", "Copiar caminho completo") — para as
  capacidades do servidor
  ([ADR 0027](../adr/0027-runtime-capabilities.md)).

## O que já funcionava

A gaveta abaixo de 760 px abre e fecha como deve; a barra lateral direita
e o calendário cabem num celular; o seletor rápido, a paleta e o menu `/`
cabem e fecham com um toque ao lado; o board troca para a barra de
ferramentas de celular do Excalidraw; um PDF preenche a sua área.
