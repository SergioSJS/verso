# ADR 0026 — Contrato core↔UI e regras invioláveis de arquitetura

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §10, §10.1
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-21 — escopo das regras 4 e 5 delimitado (revisão da Fase 0,
  C2). A decisão não mudou; o que mudou é a fronteira em que ela vale.
  2026-09-22 — regra 4 emendada pelo mantenedor
  (`docs/reference/mcp-decision.md`, a decisão de 2026-09-22): acesso cruza
  como handle opaco, a identidade de uma nota como o caminho relativo à pasta
  aberta, e caminho absoluto ou com `..` nunca cruza; o texto antigo fica ao
  lado do novo na Decisão. 2026-09-24 — duas frases que ainda diziam os
  handles `[ABERTO]`, ou que a regra 4 não era reescrita, acertadas com uma
  nota cada: a emenda aconteceu, e o grupo dos handles do
  [0044](0044-verso-fs-semantics.md) foi decidido em 2026-09-24, como
  construído para a Fase 2 (`docs/reference/handles-decision.md`).
  2026-10-09 — a regra 4 esclarecida para um servidor, a regra inalterada,
  com a aceitação do [0073](0073-self-hosted-server-first.md) pelo
  mantenedor naquele dia e o grupo dos handles do
  [0044](0044-verso-fs-semantics.md) decidido para o `verso serve`: num
  servidor a capacidade de acesso é a sessão autenticada e o papel dela na
  pasta, conferidos pelo core em todo comando e todo pedido de arquivo
  antes de o `verso-fs` agir; uma nota continua nomeada pelo caminho
  relativo à pasta; nada mais cruza — nenhuma capacidade por arquivo. A
  URL pré-assinada de um bucket segue `[ABERTO]` (0073 item 4). O escopo
  da regra 5 ganha o banco do próprio servidor, ao lado do arquivo do
  índice ([0028](0028-crate-structure.md), revisto no mesmo dia). A
  Consequência que deixava a identidade de sessão para o
  [0045](0045-server-and-mcp-security.md) é respondida pelo item 11 do
  [0074](0074-accounts-and-access-on-the-server.md). Cada um é uma nota ao
  lado do texto a que se refere.
  2026-10-12 — os registros provisórios de 2026-09-22 ratificados pelo
  mantenedor como construídos e testados, respondendo à auditoria dos
  ADRs em sessão: *"Ajuste tudo que precisar. Está aprovado os ADRs"*; uma
  nota datada ao lado de cada um.
  2026-10-21 (revisão do lote da tarde, **à espera do mantenedor**, pergunta
  T.9 da lista de decisões da tarde; nada decidido aqui) — o seletor de
  pastas mostra cada pasta recente com um rótulo `place`, os dois últimos
  componentes da pasta pai (`~/…/Documents/obsidian`, `…/Volumes/Disco`;
  `RecentFolder::place` em `crates/verso-contract`). A letra da regra 4
  vale (nunca absoluto, nunca `..`) e é um rótulo, não uma capacidade; mas a
  [0081](0081-sharing-between-people-on-one-universo.md) item 5 diz "nomes e
  chaves, sem caminho" e não tem linha de revisão para isso. Aceitar o rótulo
  como leitura da regra 4 é decisão dele.

## Contexto

A arquitetura separa um core Rust (fs, watcher, parser, índice, grafo, merge,
MCP, sync) de uma UI web (CodeMirror 6, Excalidraw, board, views, plugins em Web
Worker), ligados por um contrato de comandos e eventos que pode viajar por IPC
local ou por WebSocket remoto.

## Decisão

As seis regras abaixo são invioláveis:

1. A UI só fala com o core pelo contrato. Nenhum atalho.
2. A UI não assume de que lado do fio o core está; latência e disponibilidade
   vêm das capabilities.
3. O contrato é definido primeiro; tipos TS são gerados a partir do Rust.
4. A API de filesystem separa **acesso** de **identidade**: uma capacidade de
   ler ou escrever um arquivo cruza o contrato só como handle opaco, e uma nota
   é nomeada pelo caminho relativo à pasta aberta. Caminho absoluto, ou com
   `..`, nunca cruza o contrato em nenhuma direção. (Emendada em 2026-09-22; o
   texto original dizia "trabalha com handles opacos, nunca com caminho POSIX
   em string".)
5. Acesso a disco só dentro do crate `verso-fs`.
6. Plugins nunca acessam disco diretamente.

### Escopo das regras 4 e 5

Lidas literalmente, as regras 4 e 5 são contraditas por decisões já tomadas:
`verso-index` abre um arquivo SQLite ([0028](0028-crate-structure.md)),
`verso <pasta>` recebe um caminho ([0042](0042-open-from-command-line.md))
e a config é indexada pelo caminho da pasta
([0011](0011-config-outside-tree-index-as-cache.md)). A fronteira em que
elas valem é esta:

- **Regra 4** vale para tudo que cruza o contrato: UI, plugins e MCP. Até
  2026-09-22 ela exigia handle para *tudo*, caminho em string incluído. A
  feature 6 mostrou o custo disso, e o mantenedor a emendou:

  - Uma **capacidade de acesso** — abrir, ler, escrever este arquivo — cruza só
    como **handle opaco**. Era para isso que a regra existia: no iOS a
    capacidade é um bookmark com escopo de segurança e no Android uma URI do
    SAF, e nenhum dos dois é caminho; um contrato construído sobre caminhos não
    conseguiria carregá-los.
  - A **identidade de uma nota dentro da pasta aberta** cruza como o **caminho
    relativo à raiz**, em NFC, com `/` e a extensão `.md`. Essa string não é
    caminho POSIX: não é absoluta, não nomeia nada fora da pasta e não dá
    acesso a nada. É o que o índice usa como chave, o que uma citação precisa
    conter para ser verificável por uma pessoa, e o que o usuário vê no app.
  - **Caminho absoluto, ou com `..`**, nunca cruza. Todo caminho que um cliente
    manda é confinado pelo `verso-fs` antes de qualquer abertura.

  A emenda não é exceção aberta para o MCP: a árvore de arquivos da Fase 2
  mostra caminhos, então o texto original também quebraria lá. Caminho em
  string também existe na borda de entrada (argumento da CLI, chave da config) e
  dentro de `verso-fs`. O que um handle identifica e por quanto tempo vale
  continua `[ABERTO]` no [0044](0044-verso-fs-semantics.md). *(Decidido lá em
  2026-09-24, como construído para a Fase 2: um índice numa tabela de
  caminhos, válido só neste processo, sem nenhuma capacidade cruzando o
  contrato; reaberto antes que qualquer coisa fora das views do próprio app
  ganhe acesso a arquivos.)*
  *(Num servidor, decidido em 2026-10-09: a capacidade de acesso é a
  sessão autenticada e o papel dela na pasta, e nada mais cruza —
  Revisões.)*
- **Regra 5** vale para **os arquivos da pasta aberta** (e de cada raiz de um
  workspace). Só `verso-fs` lê, grava, renomeia, apaga ou observa esses
  arquivos. Ficam fora da regra, por serem arquivos do app e não do usuário: o
  arquivo do índice, aberto por `verso-index`; o diretório de configuração,
  lido e gravado por `verso-core`; a entrada e saída da CLI. Nenhum deles toca
  a pasta aberta. `verso-dialect` continua sem IO nenhum. *(Desde
  2026-10-09 também fora da regra: o banco do próprio servidor em
  `VERSO_DATA_DIR`, aberto pelo `verso-server`, que só alcança os arquivos
  de uma pasta pelo `verso-service`, pelo `verso-core` e pelo `verso-fs`;
  [0028](0028-crate-structure.md).)*

## Consequências

- Qualquer PR que viole uma destas regras é BLOQUEANTE por definição, sem
  discussão de mérito ([0033](0033-pr-workflow.md)).
- Handles opacos são o que torna possível o mesmo código atender ao
  security-scoped bookmark do iOS e ao Storage Access Framework do Android
  ([0009](0009-external-constraints.md)).
- "Contrato primeiro" define a ordem de trabalho da Fase 2 e depende da escolha
  de geração de tipos TS ([0038](0038-ts-type-generation.md), `[ABERTO]`).
  *(Decidida: o 0038 aceito em 2026-09-22.)*
- A regra 5 é verificável mecanicamente em duas camadas: dependências de IO de
  arquivo (`walkdir`, `notify`, `tempfile` e afins) só em `verso-fs`, e chamadas
  a `std::fs` negadas por lint fora de `verso-fs`, com exceção declarada para o
  arquivo do índice e para a config ([0028](0028-crate-structure.md),
  [0029](0029-guardrails-in-ci.md)).
- O mesmo contrato viaja por WebSocket remoto. Se ele carrega identidade de
  sessão e autorização por operação desde o primeiro desenho é `[ABERTO]` em
  [0045](0045-server-and-mcp-security.md), a decidir antes do item 2.1 da
  Fase 2; até lá, a única exigência aqui é que a forma do contrato não impeça
  acrescentá-las. (Redação suavizada em 2026-09-21 após a leitura independente
  da revisão da Fase 0: o texto anterior afirmava a exigência como decidida
  enquanto o 0045 a mantém aberta.) *(Respondido em 2026-10-09 pelo item 11
  do [0074](0074-accounts-and-access-on-the-server.md), aceito com o
  [0073](0073-self-hosted-server-first.md): todo comando carrega a sessão
  que o transporte autenticou.)*
- A API pública do Obsidian tem leituras síncronas e o contrato é assíncrono;
  a mitigação registrada é uma projeção somente-leitura do índice no lado JS,
  alimentada por eventos (§10.3).

**A regra 4 na borda do MCP, como o código da feature 6 a implementa.
Registrado em 2026-09-22 a partir do código da feature 6 — provisório, o
mantenedor decide** (§4 de `docs/reference/mcp-decision.md`). O que um cliente
do `verso mcp` envia e recebe como identificador de nota é o **caminho relativo
à raiz, como string**, não um handle: a frase que o
[0044](0044-verso-fs-semantics.md) antecipa para o caso de o identificador
estável acabar sendo o caminho relativo. O handle opaco fica dentro do processo,
e o que sustenta o peso da regra naquela borda é o **confinamento de todo
caminho que um cliente envia**, verificado antes de tocar o índice ou o disco,
inclusive nas chamadas que só leem o índice. A regra 4 **não** é reescrita aqui:
reescrevê-la é do mantenedor, no PR que fechar o grupo dos handles do
[0044](0044-verso-fs-semantics.md). *(Acertado em 2026-09-24: o mantenedor
emendou a regra 4 em 2026-09-22, no mesmo dia, antes de o grupo dos handles
fechar — a Decisão traz o texto novo — e o caminho relativo na borda do MCP é
a decisão que o [0045](0045-server-and-mcp-security.md) tomou então,
confirmada como o texto que vale quando o grupo foi decidido em
2026-09-24.)*
*(Ratificado pelo mantenedor em 2026-10-12, como construído e testado:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

## Alternativas descartadas

- UI acessando disco ou índice por atalho — descartado em §10.1.
- Tipos TS escritos à mão em paralelo aos tipos Rust — descartado pela regra 3.

## Status

Aceito.
