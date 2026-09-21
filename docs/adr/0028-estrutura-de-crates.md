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
- Acesso a disco confinado a `verso-fs` deixa de ser convenção e vira ausência
  de dependência, auditável no `Cargo.toml`.
- A ordem da Fase 1 segue a estrutura: dialect, fs, index, cli
  ([0034](0034-roadmap-em-fases.md)).
- Qualquer dependência nova precisa de justificativa no PR e entra na allowlist
  do `cargo-deny` ([0029](0029-guardrails-no-ci.md),
  [0033](0033-fluxo-de-pr.md)).

## Alternativas descartadas

- Crate único com módulos — descartado implicitamente: não dá para provar
  ausência de IO por módulo como se prova por crate.

## Status

Aceito.
