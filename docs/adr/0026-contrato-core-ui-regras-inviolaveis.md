# ADR 0026 — Contrato core↔UI e regras invioláveis de arquitetura

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §10, §10.1
- Status no briefing: `DECIDIDO`

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

## Consequências

- Qualquer PR que viole uma destas regras é BLOQUEANTE por definição, sem
  discussão de mérito ([0033](0033-fluxo-de-pr.md)).
- Handles opacos são o que torna possível o mesmo código atender ao
  security-scoped bookmark do iOS e ao Storage Access Framework do Android
  ([0009](0009-restricoes-externas.md)).
- "Contrato primeiro" define a ordem de trabalho da Fase 2 e depende da escolha
  de geração de tipos TS ([0038](0038-geracao-de-tipos-ts.md), `[ABERTO]`).
- A regra 5 é verificável mecanicamente: nenhuma dependência de IO fora de
  `verso-fs` ([0028](0028-estrutura-de-crates.md)).
- A API pública do Obsidian tem leituras síncronas e o contrato é assíncrono;
  a mitigação registrada é uma projeção somente-leitura do índice no lado JS,
  alimentada por eventos (§10.3).

## Alternativas descartadas

- UI acessando disco ou índice por atalho — descartado em §10.1.
- Tipos TS escritos à mão em paralelo aos tipos Rust — descartado pela regra 3.

## Status

Aceito.
