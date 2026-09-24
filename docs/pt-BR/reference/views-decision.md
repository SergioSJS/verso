# Memo de decisão: visões sobre a pasta, uma segunda janela, e o terminal e os agentes pelos ajustes

- Data: 2026-09-24
- Status: **as seis perguntas da seção 2 decididas pelo mantenedor em
  2026-09-24**, em sessão; registradas no [ADR 0053](../adr/0053-views-bases.md)
  e no [ADR 0054](../adr/0054-terminal-and-agents-from-the-app.md), no
  [ADR 0049](../adr/0049-phase-2-scope-widened.md) (a segunda janela) e no
  [ADR 0052](../adr/0052-typed-note.md) (ponto 3). As seções 3 a 5 são como o
  autor construiu o que foi decidido; onde escolhem algo que as respostas não
  disseram, dizem isso, e essas escolhas são do mantenedor para questionar.
- Autor: Opus 5.5 — dos documentos, o papel que o
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) dá ao "Opus 5", e do
  Rust e do TypeScript, no lugar do Fable 5.1 como autor do código pela
  decisão do mantenedor de 2026-09-23 (`../review/phase-2.md` §6, item 17).
  Leitor: uma sessão nova de Opus 5.5 sob a mesma decisão (seção 8).

## 1. O que foi pedido

- 2026-09-22, os primeiros dias da janela: "imagem 1 nao tem kanbam ainda?"
  (sobre um arquivo de quadro do plugin Task List Kanban aberto no Verso),
  "data tables?", "como abro mais de uma pasta/vault?".
- 2026-09-23: "chegou a hora de copiarmos as features do make.md" — entre
  elas as visões sobre notas do make.md, que o
  [ADR 0049](../adr/0049-phase-2-scope-widened.md) §3 registrou como pedidas e
  fora da Fase 2.
- 2026-09-24, sobre o panorama do que faltava: "Visões e janelas: kanban,
  calendário e tabela sobre as notas; uma segunda janela na mesma pasta. deve
  ser a prioridade agora. são funções básicas e importantes", e "acabando vc
  pode gerar novo beta".
- 2026-09-24, enquanto era construído: "na tela de settings deveria ter opção
  de habilitar o cli/mcp e aproveitar e simplificar a instalação do path pra
  funcionar os comandos verso no terminal".

## 2. As perguntas, as opções e as respostas

Apresentadas ao mantenedor como múltipla escolha, a recomendação do autor
primeiro.

| Pergunta | Opções | Resposta |
|---|---|---|
| Um bloco `verso-schema` dentro de uma lista ou de um callout conta? (ADR 0052, ponto 3) | só no nível de cima, com aviso num aninhado (recomendada); em qualquer lugar; nível de cima e callouts | **só no nível de cima** |
| Qual kanban? | o formato do plugin Task List Kanban, o que o Sandbox tem (recomendada); o kanban das próprias bases (Obsidian 1.14); os dois | **o kanban das bases** |
| Tabelas: as bases do Obsidian? | sim, `.base` e blocos `base` (recomendada); um formato próprio do Verso | **sim** |
| O calendário, de quê? | os dois: um layout de calendário de bases e o mês das notas diárias (recomendada); só o layout; só as notas diárias | **os dois** |
| A linha de comando pelos ajustes: como? | um link em `/usr/local/bin`, a senha pedida uma vez (recomendada); `~/.local/bin` e uma linha no `~/.zprofile`; só instruções | **o link em `/usr/local/bin`** |
| Os agentes: até onde o app vai? | um clique no Claude Desktop, a entrada mostrada antes e uma cópia guardada, mais texto para copiar (recomendada); só texto para copiar | **um clique, e o texto** |

## 3. Visões: o que foi construído (ADR 0053)

### 3.1 De onde vem o formato do Obsidian

Só fontes admissíveis (ADR 0009): as páginas públicas de ajuda ("Bases
syntax", "Views", "Functions", "Formulas", "Create a base", as páginas dos
layouts), lidas em 2026-09-24 em `obsidian.md/help` e no repositório público
delas, `obsidianmd/obsidian-help`, cuja última mudança nelas naquele dia foi
"Bases: Add kanban view" (2026-09-04); e 84 arquivos `.base` em repositórios
públicos do GitHub, achados buscando as chaves deles — arquivos que o app
escreveu, lidos como comportamento observado de fora. Nenhum Obsidian 1.14
estava disponível: o Sandbox roda o 1.13.7.

| Chave | Onde está documentada ou observada | O que o Verso faz |
|---|---|---|
| `filters` (`and`, `or`, `not`, afirmações) | "Bases syntax" | os da base e os da visão, juntos por `and` |
| `formulas`, `summaries` | "Bases syntax", "Functions" | avaliadas; resumos próprios com `values` |
| `properties.<id>.displayName` | "Bases syntax" | o nome da coluna |
| `views[].type`, `name`, `limit`, `filters`, `order`, `groupBy`, `summaries` | "Bases syntax" | como documentado |
| `views[].sort` (`property`, `direction`) | 110 das 153 visões de tabela observadas | como escrito |
| `columnSize`, `rowHeight` (tabela) | observadas em 98 e 22 visões | larguras das colunas, altura da linha |
| `image`, `imageFit`, `imageAspectRatio`, `cardSize` (cards) | observadas; os ajustes são os de "Cards view" | a capa e a largura do card |
| `markers`, `separator`, `indentProperties` (lista) | observadas; os ajustes são os de "List view" | como os ajustes dizem |
| a ordem, as cores e as larguras das colunas do kanban | não públicas: os arquivos de kanban observados são de plugins da comunidade (`boardColumns`, `cardTitleProperty`…) | o Verso guarda a ordem das colunas em `verso: columnOrder` da visão, e não lê chave de plugin |
| `startDate`, `endDate`, `weekStartDay` (calendário) | observadas nas visões de calendário da comunidade de 14 arquivos públicos | lidas e gravadas como elas as escrevem |

### 3.2 A linguagem, como avaliada

Lida no `verso-dialect` (`bases/expr.rs`): os operadores, literais de números,
textos, booleanos, `null`, listas, objetos e expressões regulares, nomes,
membros, índices e chamadas; no máximo 16 KiB e 128 níveis, sob o alvo de
fuzzing junto com toda nota. Avaliada no `verso-core` (`bases/`), com no
máximo 50 milhões de passos por consulta e textos de no máximo 1 MiB.

- Toda função global de "Functions" menos o efeito de `escapeHTML` e de
  `html` (o texto delas é mostrado, nunca desenhado); todo método de texto,
  número, lista, data, link, arquivo e objeto; `mean`, `sum`, `min`, `max`,
  `median`, `stddev` em listas, que "Functions" usa no próprio exemplo e não
  lista.
- **Não avaliadas**: expressões regulares — `replace`, `split` e `matches`
  com uma mostram um erro na célula. `[ABERTO]` se avaliá-las, e com qual
  motor: a sintaxe do JavaScript não é a do crate `regex` do Rust.
- **Leituras do autor, não observadas**, cada uma `[ABERTO]` até o mantenedor
  ou uma observação decidir: um texto `AAAA-MM-DD` (ou com hora) numa
  propriedade é uma data — o Obsidian tipa pelo tipo da propriedade, que o
  Verso não conhece; `file.tags` lista as tags com o `#`; o `file.folder` de
  um arquivo na raiz é `/`; `==` entre um texto e um número compara o número,
  como o `==` do JavaScript; um método numa propriedade ausente é `null`, não
  um erro; `file.backlinks` conta links, embeds e links em propriedades.

### 3.3 Os layouts

- **Tabela**: larguras pela borda da coluna; o menu da coluna a ordena, a
  tira ou a resume; a célula de uma propriedade de nota é editada no lugar
  (texto, número, data, caixa de marcar); grupos com os resumos deles.
- **Cards** e **lista**: como os ajustes deles dizem; a primeira propriedade
  é o título.
- **Kanban** (o do Obsidian 1.14, como a página dele o descreve): uma coluna
  por valor de `groupBy`, "None" por último; um cartão arrastado, ou movido
  pelo menu dele, grava o valor; "+" cria uma nota com ele; uma coluna
  acrescentada pelo nome, colunas reordenadas arrastando o cabeçalho; uma
  coluna cujo último cartão saiu fica até o quadro ser aberto de novo.
- **Calendário** (do Verso): um mês de dias; uma nota arrastada para outro
  dia, ou movida com Alt e as setas, tem a data gravada — a hora mantida, a
  data de término movida junto; "+" num dia cria uma nota nele.
- **O mês das notas diárias**, no painel lateral: uma marca em cada dia com
  nota; um clique a abre ou a cria pelo modelo da nota diária; as setas
  andam entre os dias.

Os arrastos seguem o ponteiro, como as abas da janela: o arrastar e soltar
do próprio web view não chega a elementos dentro da página (visto no app
rodando).

### 3.4 Gravação

- A propriedade de uma nota: só as linhas dela (`props.ts`, o código do
  painel de propriedades), sobre a revisão lida, depois de as abas abertas da
  nota serem salvas; as abas da nota leem o resultado; toda base na tela
  pergunta de novo.
- O YAML de uma base: só pelos menus dela, pelo pacote `yaml`, que manteve 83
  dos 84 arquivos públicos byte a byte quando lidos e gravados sem mudança — o
  84º espaça as listas inline (`[ a, b ]`), o que o Verso mantém quando o
  arquivo faz isso.

## 4. Uma segunda janela na mesma pasta

Window → New Window, ou a paleta de comandos: outra janela da pasta aberta,
com abas próprias sobre a mesma sessão.

- Ela entra na pasta aberta e começa com uma área de trabalho vazia; o layout
  dela não é lembrado — o da janela principal é.
- O que uma janela grava, a outra lê como lê qualquer mudança feita fora (o
  vigia avisa toda janela); uma gravação sobre uma nota que a outra mudou é
  recusada e mostra as duas versões (invariante 11).
- Abrir outra pasta é recusado enquanto mais de uma janela estiver aberta —
  a outra continuaria mostrando a pasta antiga e gravando com os nomes dela.
- Não construído: arrancar uma aba para uma janela própria arrastando-a
  (ADR 0049 §3, pelo motivo dado lá).

## 5. O terminal e os agentes (ADR 0054)

- Ajustes → Terminal e agentes: o estado do comando — instalado, não
  instalado, outro `verso` ali, ou nenhum nesta versão — e "Instalar",
  "Substituir" (depois de perguntar) ou "Remover".
- "Adicionar ao Claude Desktop", com o comando instalado: a entrada
  mostrada, depois gravada; a resposta nomeia a cópia do arquivo anterior.
- Texto para copiar para o Claude Code (`claude mcp add verso-<pasta> --
  verso mcp --key <chave>`) e para qualquer outro cliente (a entrada JSON).
- `verso mcp --key <chave>`: a forma nova do comando, nomeando a pasta pela
  chave que o app deu a ela.

## 6. O que este memo não verificou

- **O Obsidian lendo o que o Verso grava**: não havia Obsidian 1.14 para
  abrir uma base de kanban; as chaves de tabela, cards e lista são as
  documentadas e observadas.
- **O pedido de senha**: o `/usr/local/bin` deste Mac é do usuário, então
  "Instalar" ligou sem pedir; o caminho pelo `osascript` rodou sem
  privilégios numa pasta de rascunho, com um caminho contendo um espaço e um
  apóstrofo.
- **O arquivo real do Claude Desktop**: não gravado; a gravação é testada em
  pastas temporárias (`verso_core::clients`), com outro servidor e uma chave
  do próprio cliente mantidos, uma cópia feita, e um arquivo que não é JSON
  deixado como estava.
- **Windows e Linux**: não rodados.

## 7. Como o mantenedor verifica, sem ler código

1. Abra uma pasta de notas com propriedades; paleta de comandos → "Nova
   base": uma tabela de todos os arquivos abre. Menus: ordenar, filtrar
   (`status == "ativo"`), propriedades, ajustes; troque o layout para cards,
   lista, kanban, calendário.
2. Kanban: Ordenar → Agrupar por uma propriedade; arraste um cartão para
   outra coluna; abra a nota — só a linha daquela propriedade mudou (o
   `git diff` mostra uma linha).
3. Calendário: ajustes → propriedade de data; arraste uma nota para outro
   dia; a linha da data é a única mudança.
4. Numa nota, paleta de comandos → "Inserir base": a visão aparece no texto;
   no modo Editar, os menus dela mudam o bloco; `![[Arquivo.base#Visão]]`
   mostra uma visão de outra base.
5. Painel da direita → calendário: o mês; um dia com nota diária está
   marcado; um clique a abre ou a cria.
6. Window → New Window: uma segunda janela da pasta; edite uma nota numa, veja
   a outra mudar.
7. Ajustes → Terminal e agentes → Instalar; num terminal novo, `verso --help`
   e `verso .`; "Adicionar ao Claude Desktop", reinicie-o, pergunte sobre as
   notas.

## 8. A leitura

Pendente: uma sessão nova de Opus 5.5 lê a mudança e este memo; os achados
dela, e o que foi feito com cada um, entram aqui.
