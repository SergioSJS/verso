# ADR 0028 — Estrutura de crates

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §14.2, §10.1
- Status no briefing: `DECIDIDO`

## Contexto

As regras invioláveis ([0026](0026-contrato-core-ui-regras-inviolaveis.md))
só valem se forem verificáveis mecanicamente. A fronteira de crate é o mecanismo
mais barato para isso em Rust: o que um crate não depende, ele não faz.

## Decisão

```
crates/
├── verso-dialect   # parser puro: sem IO, sem async
├── verso-index     # SQLite/FTS5, grafo
├── verso-fs        # handles opacos, watcher, escrita atômica, confinamento
├── verso-core      # orquestra e expõe o contrato
└── verso-cli       # index, search, backlinks, mcp
```

## Consequências

- `verso-dialect` sem IO e sem async é o que o torna fuzzável e compilável para
  WASM, mitigando a divergência entre o parser do editor e o do índice
  ([0023](0023-stack-core-e-editor.md), §10.3).
- Acesso aos arquivos da pasta aberta confinado a `verso-fs` deixa de ser
  convenção e vira duas verificações: ausência de dependência de IO de arquivo
  fora de `verso-fs`, auditável no `Cargo.toml`, e lint do clippy negando
  `std::fs` fora de `verso-fs` ([0029](0029-guardrails-no-ci.md)). O escopo
  exato da regra, com as exceções do índice e da config, está em
  [0026](0026-contrato-core-ui-regras-inviolaveis.md).
- `verso-index` depende de SQLite e abre o arquivo do índice; isso está dentro
  do escopo delimitado da regra 5, não é violação.
- A ordem da Fase 1 segue a estrutura: dialect, fs, index, cli
  ([0034](0034-roadmap-em-fases.md)).
- Qualquer dependência nova precisa de justificativa no PR e entra na allowlist
  do `cargo-deny` ([0029](0029-guardrails-no-ci.md),
  [0033](0033-fluxo-de-pr.md)).

## Alternativas descartadas

Nenhuma registrada. (Crate único com módulos não foi avaliado; a estrutura em
cinco crates veio decidida do briefing.)

## Status

Aceito.
