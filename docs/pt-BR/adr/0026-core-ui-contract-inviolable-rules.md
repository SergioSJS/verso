# ADR 0026 — Contrato core↔UI e regras invioláveis de arquitetura

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §10, §10.1
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-21 — escopo das regras 4 e 5 delimitado (revisão da Fase 0,
  C2). A decisão não mudou; o que mudou é a fronteira em que ela vale.

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
4. A API de filesystem trabalha com handles opacos, nunca com caminho POSIX em
   string.
5. Acesso a disco só dentro do crate `verso-fs`.
6. Plugins nunca acessam disco diretamente.

### Escopo das regras 4 e 5

Lidas literalmente, as regras 4 e 5 são contraditas por decisões já tomadas:
`verso-index` abre um arquivo SQLite ([0028](0028-crate-structure.md)),
`verso <pasta>` recebe um caminho ([0042](0042-open-from-command-line.md))
e a config é indexada pelo caminho da pasta
([0011](0011-config-outside-tree-index-as-cache.md)). A fronteira em que
elas valem é esta:

- **Regra 4** vale para tudo que atravessa o contrato: UI, plugins e MCP recebem
  e devolvem handles, nunca strings de caminho. Caminho em string existe só na
  borda de entrada (argumento da CLI, chave da config) e dentro de `verso-fs`.
  O que um handle identifica e quanto tempo vale é `[ABERTO]` em
  [0044](0044-verso-fs-semantics.md).
- **Regra 5** vale para **os arquivos da pasta aberta** (e de cada raiz de um
  workspace). Só `verso-fs` lê, grava, renomeia, apaga ou observa esses
  arquivos. Ficam fora da regra, por serem arquivos do app e não do usuário: o
  arquivo do índice, aberto por `verso-index`; o diretório de configuração,
  lido e gravado por `verso-core`; a entrada e saída da CLI. Nenhum deles toca
  a pasta aberta. `verso-dialect` continua sem IO nenhum.

## Consequências

- Qualquer PR que viole uma destas regras é BLOQUEANTE por definição, sem
  discussão de mérito ([0033](0033-pr-workflow.md)).
- Handles opacos são o que torna possível o mesmo código atender ao
  security-scoped bookmark do iOS e ao Storage Access Framework do Android
  ([0009](0009-external-constraints.md)).
- "Contrato primeiro" define a ordem de trabalho da Fase 2 e depende da escolha
  de geração de tipos TS ([0038](0038-ts-type-generation.md), `[ABERTO]`).
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
  enquanto o 0045 a mantém aberta.)
- A API pública do Obsidian tem leituras síncronas e o contrato é assíncrono;
  a mitigação registrada é uma projeção somente-leitura do índice no lado JS,
  alimentada por eventos (§10.3).

## Alternativas descartadas

- UI acessando disco ou índice por atalho — descartado em §10.1.
- Tipos TS escritos à mão em paralelo aos tipos Rust — descartado pela regra 3.

## Status

Aceito.
