# ADR 0053 — Visões sobre a pasta: bases, no formato do Obsidian

- Data: 2026-09-24
- Fonte: o mantenedor, em sessão, em 2026-09-24 — a prioridade
  ("Visões e janelas: kanban, calendário e tabela sobre as notas; uma segunda
  janela na mesma pasta. deve ser a prioridade agora. são funções básicas e
  importantes") e quatro respostas, registradas no memo
  [`reference/views-decision.md`](../reference/views-decision.md);
  [0014](0014-primitives-catalog.md) (a linha das visões estruturadas),
  [0013](0013-degrades-to-markdown.md) (visões se materializam em Markdown),
  [0030](0030-base-dialect-obsidian-compatible.md) (o Verso estende o dialeto
  do Obsidian, nunca o contradiz), [0049](0049-phase-2-scope-widened.md) §3
  (pedido e não construído, até este ADR)
- Status no briefing: `PROPOSTO` para a linha das visões estruturadas da §5.3
  até 2026-09-24; `DECIDIDO` a partir das respostas do mantenedor naquele dia

## Contexto

O mantenedor pediu visões de kanban, calendário e tabela sobre as notas em
2026-09-22 e 2026-09-23 (os primeiros dias da janela); o
[0049](0049-phase-2-scope-widened.md) §3 as deixou fora da Fase 2 junto com o
quadro. Em 2026-09-24 o mantenedor as tornou a prioridade, como funções
básicas.

O Obsidian as tem como plugin central, Bases, documentado em páginas públicas
lidas em 2026-09-24 em `obsidian.md/help` e na fonte delas, o repositório
público `obsidianmd/obsidian-help`: uma base é YAML — `filters`, `formulas`,
`properties`, `summaries`, `views` — salva como arquivo `.base` ou incorporada
numa nota como bloco cercado cuja linguagem é `base`; as visões dela são
dispostas como tabela, cards ou lista (app 1.9 e 1.10), num mapa por um
plugin, e como kanban a partir do app 1.14, em acesso antecipado quando isto
foi escrito. Não há calendário entre elas; plugins da comunidade acrescentam
um. A invariante 12 diz que o Verso estende esse dialeto e nunca o contradiz:
uma tabela que o Verso mostra tem de ser a base que o Obsidian mostra, a
partir do mesmo arquivo.

## Decisão

**Decidido em 2026-09-24 pelo mantenedor**, em sessão, escolhendo entre
opções que o autor apresentou com a sua recomendação (o memo, seção 2):

1. **Tabelas são as bases do Obsidian** — a recomendação: arquivos `.base` e
   blocos `base`, na sintaxe que "Bases syntax" documenta, com a tabela, os
   cards e a lista como layouts.
2. **O kanban é o das próprias bases** — a escolha do mantenedor contra a
   recomendação, que era o formato do plugin Task List Kanban que o cofre
   Sandbox do mantenedor tem: notas como cartões numa coluna por valor da
   propriedade de `groupBy` da visão, as notas sem valor em "None"; um cartão
   movido para outra coluna grava aquele valor na nota — uma nota Markdown,
   nunca uma fórmula nem um campo do arquivo; "+" numa coluna cria uma nota
   com o valor dela. Como a página "Kanban view" do Obsidian 1.14 o descreve.
3. **O calendário são os dois** — a recomendação: um layout `calendar` de
   bases, uma extensão do Verso, sobre uma propriedade de data das notas (uma
   nota arrastada para outro dia tem a data gravada; "+" num dia cria uma nota
   nele); e o mês das notas diárias no painel lateral, onde um clique abre a
   nota do dia ou a cria ([0014](0014-primitives-catalog.md), a nota diária).
4. **Um bloco `verso-schema` conta só no nível de cima de uma nota** — a
   recomendação, na pergunta que o [0052](0052-typed-note.md) deixou aberta
   (ponto 3): um bloco dentro de uma lista ou de um callout não é lido como
   esquema, e a nota diz isso. O item 2.6 o constrói; nada aqui lê esquemas
   ainda.

O que segue é como o autor construiu os pontos 1 a 3, marcado como do autor
onde as respostas não o disseram (o memo, seção 3):

- **O core avalia, a janela desenha.** O `verso-dialect` lê uma base e a
  linguagem de expressões dos filtros e fórmulas dela, com limites de tamanho
  e profundidade, sob o fuzzing com o parser; o `verso-core` a avalia sobre os
  arquivos que a última varredura listou e o que o índice guarda de cada nota,
  com um orçamento de passos por consulta; o contrato leva as linhas e a
  janela as dispõe ([0026](0026-core-ui-contract-inviolable-rules.md) regra 1).
- **O que não é avaliado é dito, nunca adivinhado**: expressões regulares,
  uma função ou um método que a linguagem não tem, uma fórmula que precisa
  dela mesma — um erro na célula e uma linha acima da visão.
- **Uma visão grava uma propriedade de uma nota**, só as linhas da chave, pela
  escrita comum da janela sobre a revisão que leu (invariante 11), depois de
  salvar as abas abertas da nota; um valor que ela não consegue gravar de
  volta (uma lista, um link) é editado no painel de propriedades da nota.
- **O próprio arquivo da base** muda só pelos menus da visão, mantendo os
  comentários e toda chave que eles não tocam; abrir nunca o reescreve
  (invariante 7). O que o Verso guarda para um layout para o qual o Obsidian
  não nomeia chave pública — a ordem das colunas do kanban — vai no mapa
  `verso:` da própria visão, fora do caminho do Obsidian e dos plugins dele.
- **As chaves do calendário** são as que visões de calendário da comunidade
  escrevem em bases públicas: `startDate`, `endDate`, `weekStartDay`.
- **A saída de uma visão se materializa em Markdown**
  ([0013](0013-degrades-to-markdown.md)): as linhas dela são copiadas como
  tabela Markdown ou como CSV, e salvas numa nota nova como tabela.

## Consequências

- Um arquivo `.base` abre numa aba com dois modos, a visão e o YAML dela; um
  bloco `base` e um embed `![[Arquivo.base]]` ou `![[Arquivo.base#Visão]]`
  mostram a visão na leitura e no Live Preview.
- Toda base na tela pergunta de novo quando a pasta muda: uma nota gravada
  por uma visão, por outra janela ou fora do app.
- Código novo: `verso_dialect::bases` (sob o alvo de fuzzing),
  `verso_core::bases`, o `BaseQuery` e o `BaseResult` do contrato, o
  `query_base` do host, e o `app/ui/src/bases` da janela. Uma dependência
  nova, o pacote npm `yaml` (ISC, sem dependências próprias), para mudar o
  YAML da base sem reescrever o que os menus não tocam.
- As chaves do próprio Obsidian 1.14 para a ordem, as cores e as larguras das
  colunas do kanban não são públicas: até poderem ser observadas, o Verso
  guarda as suas em `verso:` e não lê nenhuma outra.
- Não construído: expressões regulares, o layout de mapa, `html()` desenhado
  como HTML (mostra o texto), a edição por visão de uma base incorporada de
  outro arquivo (só troca de visão).
- O índice não muda: o que uma base pergunta de uma nota é lido do texto que
  o índice guarda, e mantido em memória por hash da nota.

## Alternativas descartadas

- **O formato do plugin Task List Kanban** para o kanban — um arquivo de
  quadro cujas tarefas vêm das notas, uma coluna por tag — recomendado pelo
  autor a partir do próprio Sandbox do mantenedor, e deixado de lado pelo
  mantenedor pelo kanban das bases.
- **Um formato próprio do Verso** para tabelas — apresentado ao mantenedor e
  deixado de lado: repetiria o que o Obsidian já escreve, contra a
  invariante 12.
- **Um calendário só das notas diárias**, e **só um layout de calendário** —
  apresentados ao mantenedor, que escolheu os dois.

## Status

Aceito em 2026-09-24 pelo mantenedor, em sessão: os pontos 1 a 4 da Decisão.
O resto da Decisão é do autor, construído sob ela e marcado como tal no memo,
para o mantenedor questionar.
