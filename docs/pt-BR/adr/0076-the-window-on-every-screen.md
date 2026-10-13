# ADR 0076 — A janela em toda tela: celular, tablet, um painel estreito

- Data: 2026-10-09
- Fonte: o mantenedor, em sessão em 2026-10-08: *"a gente vai precisar
  ter uma revisão muito forte da aplicação sendo responsiva … tablet,
  celular, assim como o Notion faz … vale essa investigação mais
  aprofundada"*; em 2026-10-09, uma revisão minuciosa da janela num
  celular e num tablet, e depois *"A ADR de responsividade com o que a
  auditoria deixou"*. Escrito pela Opus 5.5 a partir da primeira revisão
  de 2026-10-09 (`docs/reference/responsive-review-2026-10-09.md`, no
  ramo `feat/web-groundwork`); a ser lido pela Fable 5.1
  ([0032](0032-author-and-reviewer-roles.md)) antes de ser aceito.
- Relacionados: [0073](0073-self-hosted-server-first.md) (item 9: esta
  investigação, antes de construir a janela do servidor; item 8: o celular
  e o tablet chegam ao Verso primeiro pelo navegador),
  [0035](0035-cross-cutting-requirements.md) (as duas línguas;
  acessibilidade, os leitores de tela do celular e do tablet incluídos),
  [0027](0027-runtime-capabilities.md) (o que a janela sabe do lado em que
  roda), [0026](0026-core-ui-contract-inviolable-rules.md) (regra 2),
  [0053](0053-views-bases.md) (o kanban), [0057](0057-board-json-canvas.md)
  (o board), [0061](0061-blocks-in-edit-mode.md) (blocos no modo Editar),
  [0065](0065-a-folder-per-window.md) (uma janela por pasta),
  [0009](0009-external-constraints.md) (o que se pode observar de outro
  app: só de fora).
- Status no briefing: ausente; na aceitação, com o
  [0073](0073-self-hosted-server-first.md).
- Revisões: 2026-10-09 (noite) — aceito pelo mantenedor com todas as
  recomendações, junto com o [0073](0073-self-hosted-server-first.md), na
  resposta citada lá (*"P tudo"*); construído nesta rodada, antes de a
  janela do servidor sair. As opções não escolhidas ficam ao lado de cada
  recomendação.
  2026-10-12 — a regra do item 11 é agora o item 3 do
  [0027](0027-runtime-capabilities.md), revisado para ela pelo mantenedor
  naquele dia com a aceitação do 0027 (*"Ajuste tudo que precisar. Está aprovado os ADRs"*).

## Contexto

A janela foi feita para um Mac com mouse e teclado. Desde 2026-10-09 ela
também roda numa tela de toque sem perder nota: um dedo só arrasta depois
de um toque longo, um toque longo abre o menu de contexto, os menus ficam
na tela, os campos não fazem o iOS dar zoom, os controles que o mouse
achava passando por cima aparecem em repouso, e as configurações cabem
num celular. Abaixo de 760 px de janela a barra lateral esquerda é uma
gaveta. Tudo isso está na revisão citada acima, que lista o que ficou
porque cada item pede uma escolha de como a janela se arruma num celular.

O item 8 do [0073](0073-self-hosted-server-first.md) faz do navegador no
celular e no tablet o primeiro cliente móvel; o item 9 pede esta
investigação antes de construir a janela do servidor, nomeando os pontos
de quebra, o que cada superfície perde, os alvos de toque e os gestos, os
leitores de tela e as duas línguas, e a suíte e2e rodando nessas larguras.

O Notion é a referência que o mantenedor nomeou. O que ele faz num
celular, observado de fora ([0009](0009-external-constraints.md)) e a
confirmar no celular e no iPad do mantenedor antes da aceitação (o ADR
foi aceito em 2026-10-09 antes dessa confirmação, que ainda espera): uma
página por vez, nada lado a lado; a barra lateral como uma tela própria;
uma barra de poucos verbos embaixo (início, busca, caixa de entrada, nova
página); uma barra de ferramentas acima do teclado da tela com as ações
de bloco; um link numa página em edição abre um cartãozinho com "abrir"
em vez de levar o leitor embora.

Como a janela é medida hoje, e os limites da medida: o harness no
navegador pelo Playwright com toque ligado, em 390 × 844 (WebKit, um
iPhone), 412 × 915 (Chromium, um celular Android), 820 × 1180 e
1180 × 820 (WebKit, um iPad) e 1024 × 768 (Chromium). O Playwright só
move um dedo no Chromium; o toque longo no iOS, o teclado da tela e os
leitores de tela não foram observados.

## Decisão

**Aceito em 2026-10-09** com todas as recomendações: a opção (a) nos itens
2, 4 e 6, a opção (a) para o zoom da página no item 10, e a recomendação
única de cada outro item (Status). *(Histórico: proposto em todos os
itens. Cada um nomeia as opções e a recomendação do autor; o mantenedor
escolhe.)*

1. **Dois níveis decidem o layout: a tela decide a moldura, o painel
   decide o conteúdo dele.** A moldura — gaveta ou barras laterais, ribbon,
   barra de status — segue a largura da janela (media queries, como a
   gaveta de 760 px faz hoje). O que fica dentro de um painel — as
   ferramentas dele, as propriedades, as colunas de uma base — segue a
   largura do próprio painel (container queries, como a barra de status já
   faz em `.work`), de modo que um painel estreito num desktop e um celular
   fiquem iguais. Pontos de quebra: **celular** abaixo de 760 px,
   **tablet** de 760 a 1180 px, **desktop** acima; os limites do próprio
   painel em 520 e 820 px, os dois que a barra de status usa.
   - Alternativa: a tela decide tudo (só media queries): mais simples, e um
     painel dividido num desktop continua esmagado.
2. **Painéis divididos no celular.** Hoje dois painéis de 173 px; o rótulo
   da aba empurrado pelas ferramentas do painel; num iPad em retrato as
   propriedades esmagadas.
   - (a) Abaixo de 760 px os comandos de dividir somem e um layout já
     dividido mostra um painel por vez, os outros atrás de um seletor na
     barra de abas; o layout é guardado, não descartado, e volta numa
     janela mais larga. Acima de 760 px as divisões ficam, e um painel
     abaixo de 520 px recolhe as ferramentas num botão "…".
   - (b) Abaixo de 760 px os painéis se empilham, um acima do outro.
   - (c) Como hoje.
   - Recomendado: **(a)**, uma página por vez como no Notion; painéis
     empilhados num celular deixam meia tela para cada um com um teclado
     por cima.
3. **O grafo.** Os controles ocupam 15 rem e deixam 90 px para o grafo; o
   gesto de pinça só funciona pelos eventos de gesto do WebKit; a ajuda
   fala da roda do mouse e de cliques duplos.
   - Recomendado: abaixo de 760 px (ou num painel abaixo de 520 px) os
     controles viram um painel fechado por padrão, aberto por um botão
     sobre o grafo; a pinça e o arrasto com dois dedos por eventos de
     ponteiro, que todo motor envia; a ajuda escrita para a entrada que a
     tela tem (toque ou mouse).
4. **Seguir um link no modo Editar.** Hoje pede ⌘ ou Ctrl, que um celular
   não tem.
   - (a) Um toque põe o cursor, como agora, e um cartãozinho ao lado do
     link oferece "Abrir" (e "Editar link"), como o Notion faz.
   - (b) Um toque abre o link; um toque longo edita.
   - (c) Um botão na barra do teclado (item 7) abre o link sob o cursor.
   - Recomendado: **(a)**: um toque nunca tira a pessoa do texto que está
     escrevendo, e o cartão é alcançável por um leitor de tela.
5. **O kanban numa tela de toque.** Um deslize que começa num cartão não
   rola (`touch-action: none`); as colunas não cabem num celular.
   - Recomendado: a regra que a árvore de arquivos já segue — um cartão só
     se move depois de um toque longo, um deslize rola; abaixo de 760 px o
     quadro rola para o lado uma coluna por vez (scroll snap), cada coluna
     da largura da tela menos uma margem que mostra a próxima. Mover um
     cartão também pelo menu do toque longo ("Mover para a coluna…"), para
     um leitor de tela e para um quadro comprido.
6. **O ribbon e a barra de status no celular.** Hoje 44 px de verbos de
   desktop e uma barra de status com contagens do índice; números de linha
   no modo Fonte.
   - (a) Abaixo de 760 px o ribbon e a barra de status saem; uma barra
     embaixo leva quatro ou cinco verbos — a gaveta, a busca, nova nota,
     voltar, a paleta — acima da área segura do celular; o que a barra de
     status diz que importa num celular (a conexão com o servidor, um
     salvamento que falhou) vai para o topo do painel. Números de linha
     desligados abaixo de 760 px, a menos que a pessoa os tenha ligado.
   - (b) O ribbon fica, como uma coluna estreita.
   - Recomendado: **(a)**, como o Notion e como o próprio app de celular do
     Obsidian mostram de fora.
7. **O teclado da tela.** O menu de contexto fica dentro do que o teclado
   deixa (`visualViewport`); o menu `/`, as sugestões de link e de tag e o
   seletor de figurinhas ainda se posicionam pela altura da janela, debaixo
   do teclado.
   - Recomendado, em dois passos: primeiro, toda superfície flutuante se
     posiciona pela viewport visual e o editor mantém o cursor acima do
     teclado; depois, uma barra acima do teclado com um conjunto curto —
     desfazer, refazer, indentar, desindentar, `[[`, `/`, esconder o
     teclado — cujo conteúdo é um `[ABERTO]` para depois do uso.
8. **Teclas modificadoras e cliques duplos.** Seleção múltipla na árvore,
   manter uma aba de prévia e abrir sem prévia pedem um modificador ou um
   clique duplo.
   - Recomendado: "Selecionar" no menu do toque longo transforma a árvore
     numa seleção com uma caixa em cada linha e uma barra das ações que
     aceitam várias notas (mover, lixeira, copiar), como o app Arquivos do
     iOS faz; "Manter aberta" no menu do toque longo de uma aba mantém uma
     aba de prévia; "Abrir" no menu de uma nota a abre sem prévia.
9. **Leitores de tela com toque.** O VoiceOver no iPhone e no iPad e o
   TalkBack no Android não foram testados
   ([0035](0035-cross-cutting-requirements.md) item 2), e uma página não
   consegue saber que um deles está ligado.
   - Recomendado: nenhuma ação é alcançada **só** por um gesto: o que o
     toque longo abre também fica atrás de um botão visível na linha em
     foco ou no "…" do painel; o toque longo da janela só escuta o que um
     leitor de tela transforma no seu próprio toque duplo e segurar, e não
     o impede; antes de anunciar o servidor
     ([0073](0073-self-hosted-server-first.md) item 6), uma passada com
     cada leitor, nos aparelhos do mantenedor, registrada em
     `docs/reference/manual-checks.md`.
10. **Alvos, texto pequeno, áreas seguras, o zoom da página.**
    - As linhas da árvore têm 40 px hoje, abaixo dos 44 px que Apple e
      Google pedem (o mínimo do WCAG 2.2, 2.5.8, é 24 px). Recomendado:
      44 px abaixo de 760 px, onde a árvore é uma gaveta própria; 40 px
      num tablet.
    - Texto abaixo de 12 px (a barra de status, os títulos laterais): 12 px
      no mínimo numa tela de toque.
    - O entalhe e os cantos arredondados do celular: a página declara
      `viewport-fit=cover` e a moldura respeita `env(safe-area-inset-*)`.
    - A pinça dá zoom na página inteira hoje. (a) Manter — o WCAG 1.4.4
      pede que o texto possa ser ampliado, e o iOS ignora
      `user-scalable=no` de qualquer jeito — com o board, o grafo e um PDF
      tomando a pinça para si; (b) recusar, como um app faria.
      Recomendado: **(a)**.
11. **O que não significa nada num navegador.** "Mostrar no Finder",
    "Abrir em nova janela", "Copiar caminho completo", o terminal e os
    agentes do [0054](0054-terminal-and-agents-from-the-app.md): ausentes
    quando as capacidades ([0027](0027-runtime-capabilities.md)) dizem que
    o lado não consegue fazê-los — nunca mostrados e falhando. "Abrir em
    nova janela" vira "Abrir em nova aba" num navegador, e "Copiar caminho
    completo" vira "Copiar link", o endereço da nota no servidor.
12. **As duas línguas.** Todo controle que esta ADR acrescenta tem rótulo
    em pt-BR e em inglês ([0035](0035-cross-cutting-requirements.md) item
    1), e um rótulo que cresce em português é medido em 390 px.
13. **A suíte e2e nessas larguras.** Um teste da janela que trata de
    layout ou de toque é marcado, e os testes marcados rodam, além do
    tamanho de desktop, em 390 × 844 no WebKit, 412 × 915 no Chromium com
    toque e 820 × 1180 no WebKit — não a suíte inteira três vezes, o que
    triplicaria a execução local do `scripts/check.sh`.

## Consequências

- A janela ganha uma moldura de celular (a barra de baixo, o seletor de
  painéis) e layout por painel com container queries; `css/touch.css`
  continua sendo a última palavra para um dedo.
- Os menus ganham itens que substituem um modificador ou um clique duplo
  (item 8) e as ações que só um toque longo alcançava ganham um caminho
  visível (item 9).
- Os itens só do host saem dos menus por capacidade, o que o servidor
  precisa de qualquer jeito ([0073](0073-self-hosted-server-first.md)
  item 6).
- O harness ganha as execuções marcadas do item 13; as verificações
  manuais ganham as passadas com VoiceOver e TalkBack.
- O tour do vault de demonstração ganha uma nota sobre usar o Verso num
  celular ([0058](0058-demo-vault-as-tutorial.md)).

## Alternativas descartadas

- **Uma interface móvel separada** (levantada pelo autor, para
  descartá-la): duas janelas para manter em sincronia; o item 8 do
  [0073](0073-self-hosted-server-first.md) já diz uma base de código só.
- **A suíte e2e inteira em toda largura** (levantada pelo autor): uma
  execução local três vezes mais longa para testes que não tratam do
  layout.

Item a item, as opções não recomendadas ficam ao lado de cada
recomendação acima.

## Status

**Aceito em 2026-10-09** pelo mantenedor, com todas as recomendações,
junto com o [0073](0073-self-hosted-server-first.md) (*"P tudo"*): (a) nos
itens 2, 4 e 6, (a) para o zoom da página no item 10, e a recomendação de
cada outro item. Tudo é construído nesta rodada, antes de a janela do
servidor sair. A barra do teclado do item 7 sai com o conjunto curto
recomendado. Segue `[ABERTO]`: o conteúdo da barra, a rever depois do uso.
As observações do Notion no Contexto ainda esperam o celular e o iPad do
mantenedor.

*(Histórico, o status antes da aceitação:)* Proposto. Todo item espera a
escolha do mantenedor; as observações do Notion no Contexto esperam o
celular e o iPad dele. `[ABERTO]`: o conteúdo da barra do teclado (item
7), depois do uso.
