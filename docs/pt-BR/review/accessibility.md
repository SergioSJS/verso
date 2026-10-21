# Revisão de acessibilidade — a janela (Fase 2, item 2.7)

- Data: 2026-09-24
- Revisor: Opus 5.5, numa sessão que auditou a janela e depois escreveu as
  correções. O [ADR 0032](../adr/0032-author-and-reviewer-roles.md) dá a
  janela à Opus como autora e ao Fable 5.1 como revisor, e diz que o
  modelo que escreveu um artefato não o revisa. Daí saem dois desvios,
  registrados e não resolvidos (seção 8, itens 1 e 2): parte do código
  auditado — as correções de 2026-09-23, entre elas correções anteriores
  de acessibilidade — foi escrita pela Opus 5.5; e as correções desta
  passada, escritas pela Opus 5.5, ainda não foram lidas por mais ninguém.
- Entrada: uma leitura estática de `app/ui` (`index.html`, `style.css`,
  `src/*.ts` exceto o `bindings.ts` gerado) em `1222492`, o merge da
  v0.2.0-beta.1 na `main`. A janela não foi executada, e nenhum leitor de
  tela foi usado (seção 9). O contraste foi calculado das cores da folha
  de estilo: cada token `oklch()` de cada paleta, clara e escura,
  convertido para sRGB, e a razão da WCAG 2.x tomada entre cada cor de
  texto ou de controle e cada fundo sobre o qual ela é desenhada.
- Régua: WCAG 2.2, nível AA, o nível pedido quando esta passada começou.
  O [ADR 0035](../adr/0035-cross-cutting-requirements.md) decide
  "acessibilidade desde o início" e não nomeia nível; qual nível é a meta é
  do mantenedor (seção 8, item 3).
- Item do roadmap: Fase 2, item 2.7, "acessibilidade não auditada"
  ([`../roadmap.md`](../roadmap.md)); o que
  [`../reference/app-decision.md`](../reference/app-decision.md) §10
  registra como não construído: "nenhum jeito pelo teclado de arrastar uma
  aba ou um arquivo, e ninguém percorreu o app com um leitor de tela".
- Código: branch `feat/a11y-pass`, reempilhado em 2026-09-24 sobre os
  branches locais embaixo dele (as correções da beta, o watcher, callouts
  aninhados, os memos de decisão): treze commits do código da janela (seção
  7) — TypeScript, CSS e HTML sob `app/ui`; nada de Rust, nada do contrato,
  nenhuma dependência nova — e depois este registro e o changelog, `0d27fcc`
  onde a passada encontra o watcher, e `f80fe96`, as correções da leitura
  (seção 11).
- Estado: nenhum achado BLOQUEANTE. Dos achados IMPORTANTES, todos menos
  dois estão corrigidos na branch; esses dois — as bordas dos controles e
  o padrão da árvore — esperam o mantenedor ou estão registrados como
  adiados. Todo achado MENOR está corrigido, registrado ou na seção 8.
  Nada neste documento decide uma questão `[ABERTO]`.

## Como ler

Cada seção é uma área da auditoria, com os achados na ordem em que a
leitura os encontrou. A coluna "Resolução" dá o commit que corrigiu o
achado, ou diz que ele está registrado e não corrigido e por quê, ou que
é do mantenedor (seção 8). Um critério é nomeado pelo seu número na WCAG
2.2 quando algum se aplica.

| Nível | Significado ([ADR 0033](../adr/0033-pr-workflow.md)) |
|---|---|
| BLOQUEANTE | Viola invariante, guardrail ou decisão; ou perde dado. Impede merge |
| IMPORTANTE | Deve ser resolvido, ou explicitamente adiado com registro |
| MENOR | A critério do autor |

A leitura anterior da janela (`phase-2.md`, leitura 5, achados 10 e 11)
classificou nomes ausentes, falta de tratamento do foco e contraste baixo
como IMPORTANTES, não BLOQUEANTES: são barreiras, e nenhuma perde
dado. Esta revisão mantém essa escala. Nada achado aqui perde dado: uma
escrita recusada enquanto o leitor de tela ficava calado (seção 3, achado
1) ainda guarda o texto, e fechar ou sair com ele ainda pergunta.

## Resumo

| Seção | Área | BLOQUEANTE | IMPORTANTE | MENOR |
|---|---|---|---|---|
| 1 | Teclado | 0 | 7 | 12 |
| 2 | Nomes, papéis e estados | 0 | 4 | 14 |
| 3 | Mensagens de status | 0 | 1 | 3 |
| 4 | Foco | 0 | 2 | 3 |
| 5 | Cor e contraste | 0 | 2 | 1 |
| 6 | Tamanho do texto, movimento e tamanho do alvo | 0 | 1 | 2 |
| | Todas | 0 | 17 | 35 |

O que já cumpria a régua, lido e deixado como estava: os diálogos
(`dialog.ts` e os diálogos modais de `main.ts`: com nome, foco mantido
dentro, Escape, foco devolvido); a linha de status, uma região viva
educada pela qual contagens de busca, indexação e erros já passavam; os
atalhos, todos com ⌘ ou Ctrl (2.1.4); movimento reduzido para toda
animação e transição da folha de estilo; o texto secundário a 4,51:1 ou
mais (a correção de `83d4a0a`, confirmada); o idioma da página; os diffs
de conflito e de plano, que marcam as linhas com "+" e "−" além da cor
(1.4.1); os divisores, os callouts, o menu `/` e a paleta, que já
respondiam ao teclado.

---

## 1. Teclado

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | IMPORTANTE | Uma aba só se movia arrastada: pela sua barra, para outra área, para a aba de outra área de trabalho (2.1.1, 2.5.7). O `app-decision.md` §10 registrava isso | **Corrigido** em `4784d50`: no menu da aba (a tecla de menu ou Shift-F10 numa aba), na paleta e em Ajustes → Atalhos: "Mover aba para trás", "Mover aba para a frente", "Mover aba para a área seguinte", "… para a área anterior", e no menu "Mover para: ⟨área de trabalho⟩" para cada outra área de trabalho. Sem teclas padrão (seção 8, item 7). Soltar na aba de uma área de trabalho agora usa a mesma função do menu, o que também corrige uma área focada que ficava apontando para a outra área de trabalho |
| 2 | IMPORTANTE | Um arquivo só se movia pelo teclado a partir da linha de um arquivo na árvore: a linha de uma pasta não tinha menu pelo teclado, uma aba aberta não tinha "Mover para…", e o campo que "Mover para…" abre fica na barra lateral, onde uma barra oculta o impedia de receber o foco, e o comando parecia não fazer nada | **Corrigido** em `3335369` (a linha de uma pasta abre o seu menu pelo teclado; os campos da barra lateral a mostram antes; Enter e Escape devolvem o foco) e em `4784d50` ("Mover para…" no menu da aba e na paleta) |
| 3 | IMPORTANTE | Os wikilinks e as tags da visão de leitura não eram alcançáveis: o core os escreve como `<a>` sem endereço (`crates/verso-dialect/src/render.rs`), que não é focável nem link; assim também o embed de um arquivo, aberto por um clique (2.1.1, 4.1.2) | **Corrigido** em `989818b`: marcados depois do sanitizador como links na ordem do Tab; Enter os clica. O HTML do core não muda |
| 4 | IMPORTANTE | As abas de uma área: cada aba uma parada do Tab, as setas sem fazer nada | **Corrigido** em `21e991a`: uma parada do Tab por barra de abas; as setas ao longo da barra, Home e End escolhem uma aba; a barra das áreas de trabalho e as abas do painel direito do mesmo jeito |
| 5 | IMPORTANTE | Um item de menu escolhido pelo teclado (fixar uma aba, copiar um caminho…) fechava o menu e deixava o foco na página; sair do menu com Tab fazia o mesmo (2.4.3) | **Corrigido** em `4164414`: o foco volta ao que abriu o menu antes de o item rodar; o Tab o devolve como o Escape já devolvia |
| 6 | IMPORTANTE | A árvore de arquivos: as setas não faziam nada, e a árvore era redesenhada — um renomear, um apagar, um mover, uma busca, em breve uma mudança feita fora — com o foco largado na página | **Corrigido em parte** em `3335369`: as setas percorrem as linhas, Direita e Esquerda abrem, fecham, entram e saem de pastas, Home e End; redesenhadas, a árvore e a visão de pasta devolvem ao teclado a sua linha, e um renomear ou um mover feito da árvore cai na entrada. **Registrado, não feito:** a árvore mantém os papéis nativos (botões, summaries de disclosure, listas aninhadas), cada linha ainda uma parada do Tab; uma `tree` ARIA com uma parada só é uma mudança maior no desenho da árvore, adiada com este registro em vez de feita estaticamente, sem um leitor de tela para conferir |
| 7 | IMPORTANTE | Fechar uma aba pelo teclado — ⌘W, o seu menu, "Fechar as outras", "Fechar todas" — deixava o foco na página | **Corrigido** em `78983ef`: ele cai na aba agora à frente (no conteúdo quando a barra está oculta, nas ferramentas da área quando não sobra aba) |
| 8 | MENOR | A faixa só se reordenava arrastando; o seu menu (ocultar, mostrar, restaurar) só abria com o botão direito; um alternador da faixa acionado pelo teclado largava o foco (a faixa é redesenhada) | **Corrigido** em `4164414`: o menu abre pelo teclado e oferece "Mover para cima" e "Mover para baixo"; redesenhada, a faixa devolve o foco |
| 9 | MENOR | O grafo: cada nota uma parada do Tab, centenas delas antes dos controles do grafo; uma nota focada podia ficar fora do palco visível (2.4.11) | **Corrigido** em `98024c4`: uma parada do Tab, as setas percorrem as notas, uma nota focada é trazida à vista e acende os seus links. Deslocar pelo teclado continua sendo os botões de zoom e "Ver tudo" |
| 10 | MENOR | Uma aba de imagem só passava ao tamanho real por um clique, e não recebia o foco, e uma imagem grande não rolava pelo teclado | **Corrigido** em `8ff41c4`: um alternador para Enter e Espaço, focável, com o estado dito |
| 11 | MENOR | As páginas de um PDF não recebiam o foco (a folha de estilo ainda tirava o anel): nada de rolar dentro de uma página pelo teclado | **Corrigido** em `8ff41c4`: uma região com o nome do arquivo, na ordem do Tab |
| 12 | MENOR | O endereço de uma nota web, que abre a página numa janela própria, era um `span` clicável | **Corrigido** em `8ff41c4`: um botão |
| 13 | MENOR | Numa nota, o Tab indenta: a saída do CodeMirror (Escape e depois Tab, ou ⇧⌥M) não era dita em lugar nenhum (o 2.1.2 pede que uma saída que não seja o Tab seja dita) | **Corrigido** em `b2e933d`: Ajustes → Atalhos a diz |
| 14 | MENOR | No Live Preview e na Fonte, um wikilink abre só com ⌘-clique; nada segue o link sob o cursor | **Registrado.** A visão de leitura (achado 3) e os "Links de saída" do painel direito chegam às mesmas notas. Um comando que siga o link sob o cursor é a seção 8, item 11 |
| 15 | MENOR | Na nota da própria pasta, mostrada no topo da visão de pasta, os wikilinks não fazem nada, pelo ponteiro ou pelo teclado: nenhum tratador os alcança | **Registrado, não corrigido:** uma lacuna da visão de pasta, não só de acessibilidade; esta passada deixou os links da nota da pasta como estavam em vez de tornar focáveis links inertes |
| 16 | MENOR | Os divisores se movem com as setas mas não têm jeito de ponteiro único (2.5.7), e só dizem o seu valor depois de uma tecla — os das áreas em porcentagem, os das barras laterais em pixels contra a faixa padrão de 0 a 100 | **Registrado**; seção 8, item 9 |
| 17 | MENOR | Arquivos soltos do sistema sobre a árvore não têm entrada pelo teclado ou por um clique: a janela não tem comando "copiar arquivos para a pasta" | **Corrigido** (seção 8, item 10): o comando "Importar arquivos…" abre o seletor de arquivos do sistema e copia os escolhidos para uma pasta, pela paleta ou pelo submenu "Novo" de um menu |
| 18 | MENOR | A largura de uma imagem no Live Preview é ajustada arrastando o canto; o outro jeito é digitar a largura (`![[mapa.png\|300]]`) | **Registrado**: digitar cobre o teclado; um jeito de ponteiro único (2.5.7) seriam controles novos |
| 19 | MENOR | As notas do grafo só se posicionam, e a vista só se desloca, arrastando | **Registrado**: o layout é automático e "Ver tudo" o enquadra; nada que o usuário precise fazer exige o arrasto |

## 2. Nomes, papéis e estados

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | IMPORTANTE | Abas: `tablist` numa caixa que também guardava as ferramentas da área; as abas eram botões, nos quais `aria-selected` não significa nada; o nome de uma aba terminava em "Fechar aba" (a marca de fechar oculta era lida junto); nenhum painel. A tablist das áreas de trabalho continha o botão "nova área"; as abas do painel direito não tinham painel (4.1.2, 1.3.1) | **Corrigido** em `21e991a`: `tab`s de uma `tablist` própria, cada uma controlando o `tabpanel` que nomeia; as marcas fora dos nomes |
| 2 | IMPORTANTE | O editor de notas e o editor de arquivos de texto — o elemento de conteúdo do CodeMirror — não tinham nome (4.1.2) | **Corrigido** em `57c7a6d`: com o nome da nota ou do arquivo |
| 3 | IMPORTANTE | O painel de propriedades: campos de valor e caixas de marcar sem nome (o placeholder dizia "Vazio"), botões de remover que não diziam o que removem, o botão "↗" nomeado pela seta (4.1.2, 3.3.2) | **Corrigido** em `57c7a6d`: com o nome da sua chave ou do seu item |
| 4 | IMPORTANTE | A caixa de marcar de uma tarefa na visão de leitura não tinha nome: alcançada com o Tab, dizia "caixa de seleção" (4.1.2) | **Corrigido** em `989818b`: com as palavras do próprio item |
| 5 | MENOR | O botão da pasta mostrava o nome da pasta e se chamava "Abrir pasta": um comando de voz que diz o que está na tela não o alcança (2.5.3) | **Corrigido** em `57c7a6d`: "⟨pasta⟩ — Abrir pasta" |
| 6 | MENOR | Os alternadores da barra lateral e do painel direito mostravam o estado só por um ícone mais apagado | **Corrigido** em `8ff41c4`: `aria-expanded`, também nas gavetas de uma janela estreita |
| 7 | MENOR | A ordenação da visão de pasta era `aria-sort` em botões, onde não significa nada | **Corrigido** em `8ff41c4`: o nome da coluna diz "crescente" ou "decrescente" |
| 8 | MENOR | Regiões: a faixa era uma navegação chamada "Verso"; as duas regiões laterais não tinham nome; o caminho de pasta de cada aba era uma navegação sem nome | **Corrigido** em `57c7a6d`: "Comandos", "Pasta", "Painel lateral", "Caminho" |
| 9 | MENOR | Os campos de busca dos ajustes, do grafo e de um PDF tinham placeholder e nenhum nome | **Corrigido** em `57c7a6d` |
| 10 | MENOR | "Português (Brasil)" e "English" no ajuste de idioma não estavam marcados no próprio idioma (3.1.2) | **Corrigido** em `57c7a6d` |
| 11 | MENOR | Menus: um `li` entre o `menu` e os seus `menuitem`s, separadores não marcados, nenhum `aria-haspopup` nos botões que abrem um | **Corrigido** em `4164414` |
| 12 | MENOR | As marcas de não salvo eram lidas como "marcador": o ponto desenhado da aba e o "•" do título | **Corrigido** em `21e991a`: a aba diz "alterações não salvas"; as marcas não são lidas |
| 13 | MENOR | A volta de uma nota de rodapé se chamava "↩" | **Corrigido** em `989818b`: "Voltar ao texto" |
| 14 | MENOR | O campo de renomear da árvore e o campo "Mover para…" não nomeavam a entrada sobre a qual agem | **Corrigido** em `3335369` |
| 15 | MENOR | O desenho do grafo não tinha nome | **Corrigido** em `98024c4`: um grupo com o título do grafo |
| 16 | MENOR | Um item de uma propriedade de lista que não é tag aparece como botão desativado | **Registrado**: lido como "botão esmaecido", o que diz a coisa errada; uma pílula de texto simples é a correção, uma mudança no desenho do painel deixada para outra passada |
| 17 | MENOR | O seletor rápido e a paleta mantêm `aria-expanded="true"` com a lista vazia, e não dizem quantos resultados há | **Registrado** |
| 18 | MENOR | Em pt-BR, "área" nomeia tanto uma área da divisão quanto uma área de trabalho: "Fechar área" é tanto "Close pane" quanto "Close workspace", dois controles com um nome | **Do mantenedor**: uma escolha de redação; seção 8, item 8 |

## 3. Mensagens de status

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | IMPORTANTE | Uma escrita recusada porque o arquivo mudou em disco mostrava o aviso de conflito acima do texto e limpava a linha de status: o leitor de tela não ouvia nada, e quem continuava digitando não ficava sabendo que nada estava sendo salvo (4.1.3) | **Corrigido** em `519b1eb`: a linha de status diz "Nada gravado: o arquivo mudou em disco — escolha acima…", e é anunciada |
| 2 | MENOR | A contagem da busca de um PDF ("3 de 10", "Nada encontrado") e a contagem de notas e links do grafo não eram anunciadas (4.1.3) | **Corrigido** em `519b1eb` |
| 3 | MENOR | "Salvo." é anunciado depois de cada autosave, a cada pausa na digitação: a linha de status é viva, e o leitor de tela a ouve enquanto se escreve | **Do mantenedor**: se os salvamentos de rotina são anunciados; seção 8, item 6 |
| 4 | MENOR | Enquanto uma pasta abre, a linha de status diz "…", que o leitor de tela lê como um símbolo | **Registrado** |

## 4. Foco

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | IMPORTANTE | O anel de foco era o latão de destaque: 2,87:1 na faixa e 2,97:1 no realce da linha atual na paleta clara padrão, abaixo dos 3:1 que um indicador precisa (1.4.11, 2.4.7) | **Corrigido** em `78983ef`: o latão como o texto é desenhado (`--brass-ink`), 4,51:1 ou mais em todo papel, realce e paleta; o anel do modo escuro, o mesmo latão de antes, 6,10:1 ou mais nos papéis e no realce vermelho, 5,89:1 no realce de latão em sépia |
| 2 | IMPORTANTE | O item focado de um menu e a opção escolhida de uma lista (a paleta, o seletor rápido, o menu `/`, as sugestões do editor) eram mostrados por um realce de 1,15:1 a 1,28:1 contra a página e uma troca da cor do texto; o menu tirava o seu anel (1.4.11) | **Corrigido** em `78983ef`: um anel interno os marca |
| 3 | MENOR | O botão "Editar ao lado" de uma nota embutida e o botão "Editar" da nota de uma pasta ficavam invisíveis quando focados (só apareciam com o ponteiro em cima); as ferramentas de uma área ficavam a 55% de opacidade com o foco entre elas (2.4.7) | **Corrigido** em `78983ef` |
| 4 | MENOR | O campo de lista do painel de propriedades não mostrava foco | **Corrigido** em `78983ef` |
| 5 | MENOR | O campo da paleta e os editores tiram o anel e contam com o cursor | **Registrado, mantido**: o cursor de um campo de texto mostra onde está o foco |

## 5. Cor e contraste

Calculado de `app/ui/style.css`, toda paleta (papel, sépia, ardósia, musgo),
clara e escura, cada cor contra cada fundo sobre o qual é desenhada. Os
pares abaixo falharam — a última linha de callout achada pela leitura (seção
11); todo outro par conferido passou — texto do corpo, secundário e terciário,
links, linhas selecionadas, o botão Salvar, os avisos, as cores de código
sobre o fundo de código, e todo par no modo escuro.

| Par | Onde | Antes (pior) | Depois (pior) |
|---|---|---|---|
| Anel de foco na faixa | latão sobre paper-3, clara padrão | 2,87:1 | 4,51:1 (`78983ef`) |
| Anel de foco na linha atual | latão sobre o realce do selo, clara padrão | 2,97:1 | 4,71:1 (`78983ef`) |
| Título de callout de aviso | clara, toda paleta | 3,29:1 | 4,79:1 (`12f1043`) |
| Título de callout de nota | clara, sépia | 4,41:1 | 4,80:1 (`12f1043`) |
| Título de callout de dica | clara, sépia e musgo | 4,23:1 | 4,80:1 (`12f1043`) |
| Título de um tipo de callout sem cor própria (`todo`, `important`, qualquer outro) | clara, toda paleta | 3,19:1 | 5,01:1 (`f80fe96`) |
| O item de um menu, a opção de uma lista | o realce contra a página | 1,15:1 | um anel interno, 4,51:1 ou mais (`78983ef`) |
| Bordas de campos | fio sobre a página, todo modo | 1,36:1 | do mantenedor (item 4 da seção 8) |
| Um interruptor desligado | preenchimento e borda do trilho sobre a página | 1,20:1 e 1,36:1 | do mantenedor (item 4 da seção 8) |

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | IMPORTANTE | Títulos de callout abaixo de 4,5:1 no modo claro (tabela acima) (1.4.3) | **Corrigido** em `12f1043`: só a luminosidade muda, como em `83d4a0a`; os tipos sem cor própria em `f80fe96`, que lhes dá `--brass-ink` (seção 11) |
| 2 | IMPORTANTE | Bordas de controles abaixo de 3:1: as bordas de fio dos campos, e um interruptor desligado, cujo trilho e borda mal diferem da página (1.4.11) | **Do mantenedor**: o fio é a linguagem do desenho; seção 8, item 4, com uma proposta |
| 3 | MENOR | O grafo colore as notas por pasta, e só a cor diz qual (1.4.1); a legenda nomeia as cores, o leitor de tela ouve só o nome da nota | **Do mantenedor**: seção 8, item 12 |

## 6. Tamanho do texto, movimento e tamanho do alvo

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | IMPORTANTE | O texto só crescia até 147%: a janela não tem zoom de página (o host deixa as teclas de zoom do Tauri desligadas) e o ajuste de tamanho da fonte parava em 22 px, sobre um padrão de 15 px (o 1.4.4 pede 200%) | **Corrigido** em `eb2b0dd`: o ajuste vai a 30 px, 200%; a interface e as notas o acompanham (rem). O zoom de página do host é a seção 8, item 5 |
| 2 | MENOR | Seguir uma nota de rodapé, ou voltar de uma, rolava suave quando o sistema pede movimento reduzido (2.3.3) | **Corrigido** em `eb2b0dd` |
| 3 | MENOR | Alvos pequenos (2.5.8): a marca de fechar de uma aba com uns 17 px, o remover de uma pílula de lista com uns 14 px, os alternadores da barra de status com uns 19 px, abaixo de 24 px e perto demais de outros alvos | **Do mantenedor**: alvos maiores mudam a altura da barra de abas; seção 8, item 13 |

## 7. A resolução

Toda correção está no código da janela, em treze commits em
`feat/a11y-pass`, cada um de um assunto, em ordem (os hashes são os
reempilhados), e depois mais dois:

| Commit | O quê |
|---|---|
| `21e991a` | Barras de abas são tablists que o teclado percorre (1.4, 2.1, 2.12) |
| `4784d50` | Uma aba, ou o seu arquivo, movida sem arrastar (1.1, 1.2) |
| `3335369` | A árvore responde às setas e guarda o lugar do teclado; os campos da barra lateral a mostram (1.2, 1.6, 2.14) |
| `4164414` | Os menus devolvem o foco; o menu da faixa pelo teclado (1.5, 1.8, 2.11) |
| `989818b` | Os links e as tarefas da visão de leitura alcançam o teclado (1.3, 2.4, 2.13) |
| `57c7a6d` | Nomes: os editores, as propriedades, as regiões, os campos (2.2, 2.3, 2.5, 2.8, 2.9, 2.10) |
| `8ff41c4` | Estados, e os controles que só respondiam ao ponteiro (1.10, 1.11, 1.12, 2.6, 2.7) |
| `519b1eb` | Uma escrita recusada, as ocorrências de um PDF e a contagem do grafo anunciadas (3.1, 3.2) |
| `78983ef` | Um anel de foco que aparece em todo lugar; um foco que fica no lugar (1.7, 4.1–4.4) |
| `12f1043` | Títulos de callout a 4,5:1 (5.1) |
| `eb2b0dd` | Texto a 200%; movimento reduzido para as notas de rodapé (6.1, 6.2) |
| `98024c4` | O grafo, uma parada do Tab que as setas percorrem (1.9, 2.15) |
| `b2e933d` | Como o teclado sai de um editor, dito (1.13) |
| `0d27fcc` | Onde a passada encontra o watcher: uma aba cuja nota sumiu diz isso, não só pelo estilo |
| `f80fe96` | Os achados da leitura (seção 11) |

As strings novas vêm aos pares, pt-BR e inglês, no catálogo tipado da
janela, e uma que falte reprova a checagem de tipos
([ADR 0035](../adr/0035-cross-cutting-requirements.md)): "Abas"/"Tabs",
"alterações não salvas"/"unsaved changes", "Painel lateral"/"Side panel",
as quatro "Mover aba…"/"Move tab…", "Mover para cima"/"Move up", "Mover
para baixo"/"Move down", "Voltar ao texto"/"Back to the text",
"Caminho"/"Path", "crescente"/"ascending", "decrescente"/"descending",
"Tamanho real"/"Actual size", "Tab no editor"/"Tab in the editor" e a sua
linha; a dica do grafo ganhou as suas teclas nas duas.

Conferido depois de cada commit: `npm run check` e `npm run build` em
`app/ui`; no fim, `node scripts/check-npm-licenses.mjs` (nenhum pacote
acrescentado) e `scripts/check-docs-mirror.sh`. Não rodados aqui:
`scripts/check.sh` e o build do Rust, deixados para a integração.

## 8. Pendente do mantenedor — resolvido em 2026-10-21

Nada disto foi decidido por esta revisão. O mantenedor resolveu cada
um em 2026-10-21, marcando as opções do questionário de decisões de
2026-10-20; cada item abaixo termina com a sua resolução (A11Y.n é o
número do item naquele questionário). Onde a resolução é trabalho novo,
ela é uma linha do roadmap (V.13).

1. **A leitura destas correções.** Foram escritas pela Opus 5.5, que também
   as auditou; o [ADR 0032](../adr/0032-author-and-reviewer-roles.md) pede
   uma leitura pelo outro modelo, numa sessão separada, antes do merge. Em
   2026-09-23 o mantenedor deixou uma sessão nova da Opus 5.5 fazer as
   vezes do Fable 5.1 (`phase-2.md` §6, item 17); se essa resposta cobre
   esta passada é do mantenedor.
   **Resolvido em 2026-10-21** (A11Y.1, opção B): uma sessão nova da Opus
   5.5 vale como o outro leitor, pela regra de 2026-09-23; o desvio do ADR
   0032 fica registrado aqui e no PR que leva as correções.

2. **O próprio autor da auditoria.** Parte da janela que ela audita — as
   correções de 2026-09-23, entre elas correções anteriores de
   acessibilidade (`73e215e`, `83d4a0a`) — foi escrita pela Opus 5.5.
   Registrado; se outro modelo lê a janela de novo é do mantenedor.
   **Resolvido em 2026-10-21** (A11Y.2, opção A): só registrado, e junto com
   a leitura do item 1; uma leitura resolve as duas. A janela não é relida
   por outro modelo.

3. **A meta.** O ADR 0035 diz "acessibilidade desde o início" e não nomeia
   nível. Esta auditoria mediu contra a WCAG 2.2 nível AA, o nível pedido
   quando a passada começou. Se isso vira a meta — uma revisão do ADR
   0035 — é do mantenedor.
   **Resolvido em 2026-10-21** (A11Y.3, opção B): nenhum nível é nomeado; o
   ADR 0035 mantém "acessibilidade desde o início" e não é revisto. Os
   números de WCAG 2.2 AA desta auditoria continuam o que são, medidas e uma
   régua para os achados, não uma meta que o mantenedor tenha fixado.

4. **Bordas dos controles** (seção 5, achado 2). Os campos são desenhados
   com um fio de 1,36:1 a 1,43:1 contra a página, e um interruptor
   desligado com um trilho de 1,20:1; o 1.4.11 pede 3:1 para o que
   identifica um controle. A proposta: uma cor de linha só para controles
   — campos, selects, o interruptor desligado — enquanto os fios da página
   ficam; uma linha de luminosidade perto de 55% no modo claro e de 58% no
   escuro chega a 3,4:1 ou mais em todo papel e paleta (calculado). O fio
   é a linguagem do desenho, então a escolha é do mantenedor.
   **Resolvido em 2026-10-21** (A11Y.4, opção A): uma cor de linha própria
   para controles (campos, selects, o interruptor desligado), luminosidade
   perto de 55% no modo claro e 58% no escuro, 3,4:1 ou mais em todo papel e
   paleta; os fios da página ficam. Trabalho novo, a construir.

5. **Zoom de página.** O host deixa as teclas de zoom do Tauri desligadas
   (`zoomHotkeysEnabled` não está definido), então ⌘+ e ⌘− não fazem nada
   e o ajuste de tamanho da fonte é o único jeito de aumentar o texto.
   Ligá-las é uma mudança no host (`app/src-tauri`), fora desta passada.
   **Resolvido em 2026-10-21** (A11Y.5, opção A): resolvido pelo que foi
   construído depois desta revisão. A janela dá zoom (ADR 0072, revisão de
   2026-10-20: Cmd/Ctrl mais, menos e 0, e Ctrl com a roda, de 50% a 200%,
   guardado por aparelho; na versão do navegador vale o zoom do navegador),
   e o tamanho da fonte vai a 30 px; o 1.4.4 (200%) é cumprido. A frase
   acima sobre as teclas do host desligadas descreve o estado quando esta
   revisão foi escrita.

6. **"Salvo." anunciado a cada autosave** (seção 3, achado 3). Manter, ou
   anunciar só o que dá errado (uma escrita recusada, um erro) e deixar os
   salvamentos de rotina calados para o leitor de tela.
   **Resolvido em 2026-10-21** (A11Y.6, opção A): anunciar só o que dá
   errado (uma escrita recusada, um erro); um salvamento de rotina fica
   calado para o leitor de tela, e a palavra "Salvo." continua visível na
   tela. Trabalho novo, a construir.

7. **Teclas padrão para os comandos novos.** "Mover aba para trás", "Mover
   aba para a frente", "Mover aba para a área seguinte", "… para a área
   anterior" e "Mover para…" não têm nenhuma; qualquer uma pode ser
   atribuída nos ajustes. Se algum ganha uma padrão é do mantenedor.
   **Resolvido em 2026-10-21** (A11Y.7, opção A): nenhuma tecla padrão. Elas
   não colidem com as teclas do sistema nem do Obsidian, e quem precisar de
   uma a atribui nos ajustes.

8. **"Área" em pt-BR** (seção 2, achado 18). Uma palavra para uma área da
   divisão e uma área de trabalho; "Fechar área" nomeia dois controles.
   Uma escolha de redação.
   **Resolvido em 2026-10-21** (A11Y.8, opção A): "Painel" para o painel e
   "Espaço de trabalho" para o espaço de trabalho em pt-BR, de modo que cada
   controle tenha o seu nome; "Painel lateral" já existe no aplicativo. Só
   texto, em pares com o inglês (ADR 0035). Trabalho novo, a construir.

9. **Divisores sem jeito de ponteiro único** (seção 1, achado 16): o 2.5.7
   pede um para o que o arrasto faz. Botões para alargar e estreitar uma
   área, ou aceitar as setas e "Maximizar área" como suficientes.
   **Resolvido em 2026-10-21** (A11Y.9, opção A): as setas e "Maximizar
   painel" são aceitas como suficientes; nenhum botão de alargar ou
   estreitar em cada divisor.

10. **Arquivos do sistema sem arrastar** (seção 1, achado 17): um comando
    "copiar arquivos para a pasta…" precisa do seletor de arquivos do
    host — uma mudança no host.
    **Resolvido em 2026-10-21** (A11Y.10, opção B, não a A recomendada):
    construir um comando "Importar arquivos…" com o seletor de arquivos do
    sistema; muda o host (`app/src-tauri`) nas três plataformas.
    **Construído** em `feat/import-files`: o comando "Importar arquivos…"
    (paleta, submenu "Novo" do menu de um arquivo ou pasta, menu do espaço
    vazio da árvore) abre o seletor do sistema (o `pick_files` do host; no
    navegador, `<input type=file multiple>`), e os arquivos são criados na
    pasta de destino com `create_file`, como numa soltura; um nome já usado
    vira `nome (2).ext`. Não executado no app real: o diálogo nativo em cada
    sistema.
    **Detalhes decididos em 2026-10-21** (I.1 da lista de decisões). (a) Nome
    repetido, opção A: importar renomeia, e **arrastar para a árvore passa a
    renomear também** (hoje recusa o arquivo que já existe), um comportamento
    só, nada sobrescrito nem perdido. (b) Limites, opção B: hoje 32 MB por
    arquivo e 256 MB por vez, os mesmos dos anexos de imagem, acima disso o
    arquivo aparece como não importado; o mantenedor: *"deveria ser
    configurável, eu mesmo devo colocar uns pdfs grandes de 200 MB"* — então
    **o limite de tamanho da importação passa a ser um ajuste**; o padrão e os
    limites dele não são decididos aqui. (c) Nomes, opção A: `.env` vira `env`
    (nenhum arquivo oculto é criado na pasta); `[ ] | # ^` são trocados porque
    quebram links; nomes reservados do Windows (`con.txt`) ganham `_`. A
    construir: (a) e (b).

11. **Seguir um link a partir do editor** (seção 1, achado 14): um comando
    que abre o link sob o cursor, com ou sem tecla padrão.
    **Resolvido em 2026-10-21** (A11Y.11, opção B, não a A recomendada): o
    comando "Abrir link sob o cursor", com uma tecla padrão. O Obsidian usa
    Alt+Enter; isso é para confirmar na documentação pública do Obsidian
    (ADR 0009) antes de a tecla ser atribuída. Trabalho novo, a construir.

12. **As cores do grafo e um equivalente em texto** (seção 5, achado 3). A
    vista equivalente acessível do board no ADR 0035 ainda é `PROPOSTO`;
    se o grafo precisa de uma — ou se os links do painel direito bastam —
    é do mantenedor.
    **Resolvido em 2026-10-21** (A11Y.12, opção A): os links do painel
    direito (de entrada e de saída) valem como o equivalente do grafo;
    nenhuma vista nova.

13. **Tamanhos de alvo** (seção 6, achado 3): marcas de fechar e de remover
    maiores mudam o tamanho da barra de abas e das pílulas.
    **Resolvido em 2026-10-21** (A11Y.13, opção A): a área de clique cresce
    até 24 px (uma área maior invisível) sem aumentar o desenho, de modo que
    a barra de abas mantém a altura; o 2.5.8 é cumprido. Trabalho novo, a
    construir.

14. **Um percurso com leitor de tela.** Ninguém percorreu a janela com o
    VoiceOver; a seção 9 lista o que só isso pode confirmar.
    **Resolvido em 2026-10-21** (A11Y.14, opção A): o mantenedor, ou alguém
    que ele peça, faz o percurso com o VoiceOver no macOS antes da V1,
    seguindo o roteiro da seção 10. Bloqueia a V1 (roadmap V.13).

15. **O padrão da árvore** (seção 1, achado 6): a árvore mantém os papéis
    nativos, e a mudança para uma árvore ARIA fica adiada até um leitor de
    tela poder conferi-la — o adiamento de um achado IMPORTANTE, que cabe ao
    mantenedor aceitar.
    **Resolvido em 2026-10-21** (A11Y.15, opção B, não a A recomendada): a
    árvore de arquivos passa agora ao padrão ARIA `tree`, uma parada só para
    o Tab. O risco, uma regressão que não dá para ouvir, é aceito; o
    percurso com o VoiceOver do item 14 a confere. Trabalho novo, a
    construir.

16. **A contagem do grafo, dita a cada tecla**: agora é um status, e digitar
    no filtro do grafo a reescreve a cada tecla — a mesma questão de
    "Salvo." a cada autosave (item 5).
    **Resolvido em 2026-10-21** (A11Y.16, opção A): a contagem do grafo é
    anunciada só quando a digitação para, depois de um atraso de cerca de um
    segundo. Trabalho novo, a construir.

17. **Apertar um nó perto da borda do grafo** pode mover a vista para
    mostrá-lo antes de um arrasto começar (não verificado: depende de o
    WebKit focar um grupo SVG num aperto).
    **Resolvido em 2026-10-21** (A11Y.17, opção A): verificar no aplicativo,
    junto com o percurso do item 14; se acontecer, mover a vista só quando o
    foco vem do teclado. Trabalho novo se acontecer.

## 9. O que esta revisão não verificou

- **Nada foi executado.** Nenhuma janela, nenhum harness WebKit, nenhum
  VoiceOver: toda correção passou pela checagem de tipos e pelo build,
  nenhuma foi clicada ou ouvida. O que só uma execução pode confirmar: que
  o WebKit expõe os summaries de `details` da árvore como expandidos ou
  recolhidos; que ele anuncia as mudanças de `role="status"` e o
  `aria-activedescendant` do CodeMirror no menu `/`; que ele foca um `g`
  de SVG com `tabindex`; que ele respeita o texto alternativo de `content`
  no CSS (o ponto da aba); que uma âncora sem endereço, com `role="link"`
  e `tabindex`, é falada como link; que o foco volta aonde o código o põe
  depois de um redesenho.
- **As partes nativas.** A página de uma nota web é uma web view nativa
  posta sobre a janela: se o teclado consegue entrar nela e sair, e o que
  o VoiceOver diz lá, não está em `app/ui`. A barra de menus do macOS (só
  em inglês, `phase-2.md` §7) é do host.
- **Terceiros.** Os painéis e os anúncios do próprio CodeMirror, a camada
  de texto do pdf.js, a saída do KaTeX: lidos como vêm, não auditados.
- **O HTML do core.** Níveis de título, cabeçalhos de tabela e o que o
  parser emite não foram auditados; a janela os recebe.
- **O contraste** foi calculado dos valores da folha de estilo, cortados
  para sRGB; uma tela Display P3 pode mostrar algumas cores um pouco
  diferente. Não se mediu contraste sobre imagens, sobre a página de uma
  nota web nem dentro de PDFs.
- **Refluxo e espaçamento de texto** (1.4.10, 1.4.12) e a janela a 30 px
  não foram olhados na tela.

## 10. Como o mantenedor verifica, sem ler código

Compile e abra o app (`docs/reference/app-decision.md` §12), e então, sem
o mouse:

1. **Abas.** Abra três notas. O Tab chega à barra de abas uma vez; as setas
   andam por ela; Shift-F10 numa aba abre o seu menu: "Mover aba para a
   frente" a move, "Dividir à direita" e depois "Mover aba para a área
   anterior" a traz de volta. Com duas áreas de trabalho, "Mover para:
   Área 2".
2. **A árvore.** Na árvore, as setas percorrem as linhas; Direita abre uma
   pasta, Esquerda a fecha. F2 renomeia uma nota: depois do Enter o teclado
   está na nota renomeada. Shift-F10 numa pasta, "Mover para…", digite uma
   pasta, Enter: o teclado está na pasta onde ela foi parar, aberta. Com a
   barra lateral oculta, "Mover para…" no menu de uma aba a mostra.
3. **Menus.** Shift-F10 numa aba, "Fixar aba": o teclado volta à aba.
4. **Visão de leitura.** O Tab chega a um `[[link]]` e a uma `#tag`; Enter
   os segue.
5. **Fechar.** ⌘W numa aba: o teclado está na aba seguinte.
6. **Anel de foco.** Na paleta clara "Papel", Tab até a faixa: o anel é um
   dourado mais escuro que antes e fácil de ver.
7. **Callouts.** O título de um callout `> [!warning]` fica mais escuro no
   modo claro.
8. **Tamanho do texto.** Ajustes → Aparência → Tamanho da fonte vai até 30.
9. **A saída do editor.** Ajustes → Atalhos abre com "Tab no editor"; numa
   nota, Escape e, em até dois segundos, Tab saem do editor.
10. **Com o VoiceOver** (⌘F5). A janela salva toda aba com texto não salvo
    quando perde o foco, e o autosave roda 1,5 s depois de parar de digitar,
    então a mudança do outro app precisa vir sem tirar o foco do Verso: num
    terminal, na pasta aberta, comece
    `sleep 5; printf '\nde fora\n' >> nota.md`, volte ao Verso e digite em
    `nota.md` sem parar até a linha chegar — ou suba antes o ajuste de
    Autosave para 10 segundos. O salvar é recusado: "Nada gravado: o arquivo
    mudou em disco…" é seguido na hora por "Mudou fora do Verso, com texto
    não salvo aqui: …", e o segundo pode ser o que o VoiceOver fala; a linha
    de status nomeia a nota. (Sem nada digitado, o watcher lê a nota de novo, e
    nada é recusado.) Uma aba é dita como uma aba da sua barra, com
    "alterações não salvas" depois do nome enquanto as tiver.

## 11. A leitura

Uma sessão nova do Opus 5.5 leu a passada e o encontro dela com o watcher
(`4a9ae09..0d27fcc`), no lugar do outro modelo por decisão do mantenedor de
2026-09-23 — o mesmo modelo que escreveu a passada, que é o item 1 da seção 8.
Não achou BLOQUEANTE, achou 5 IMPORTANTES e 17 MENORES:

- IMPORTANTES, corrigidos em `f80fe96`: um redesenho da visão de leitura
  (uma tarefa marcada, a nota lida de novo) perdia o foco; um link no título
  de um callout recolhível ficava dentro do botão do título; os títulos de
  tipos sem cor própria ficavam abaixo de 4,5:1 no modo claro.
- IMPORTANTES, corrigidos neste registro: os hashes dele nomeavam os commits
  de antes do reempilhamento; o passo 10 da seção 10 não funcionava mais com
  o watcher.
- MENORES, corrigidos em `f80fe96`: o menu Novo da faixa, a única aba de uma
  área movida para outra área de trabalho, um link seguido com Enter, os
  renomeios do título e da área de trabalho, a gaveta da janela estreita,
  "Todas as abas" e o seu marcador, "apagada ou movida", Esc e Tab em até
  dois segundos, "Mover aba" onde não move nada.
- MENORES, corrigidos antes: o contraste da aba riscada e um redesenho sob o
  renomear de uma pasta (a leitura do watcher, `7190830`); a redação do
  changelog (`f37207c`).
- MENORES, registrados aqui: o número do anel escuro (seção 5), o adiamento
  da árvore, a contagem do grafo e o aperto perto da borda dele (seção 8,
  itens 15 a 17), e a linha do roadmap, que agora aponta para cá em vez de
  contar.

Uma segunda leitura, por uma sessão nova do Opus 5.5 em 2026-09-24, achou o
passo 10 da seção 10 ainda impossível como estava escrito — a janela salva
toda aba com texto não salvo quando perde o foco, então ir para o outro app
gravava antes o texto digitado (IMPORTANTE) — e a seção 5 ainda dizendo que
todo outro par passou ao lado do par que falhou, registrado acima, e este
gêmeo escrevendo "a ADR" onde os memos escrevem "o ADR" (MENORES). Os três
estão corrigidos neste registro.
