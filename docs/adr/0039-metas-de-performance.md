# ADR 0039 — Metas de performance

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §13, §17 item 10
- Status no briefing: `ABERTO`

## Contexto

O briefing decide medir — benchmark com vault sintético registrando linha de
base ([0035](0035-requisitos-transversais.md)) — e decide não estabelecer metas
por ora. Medir antes de prometer evita número inventado.

## Decisão

Nenhuma meta de performance por ora. Decidir após a primeira linha de base, que
sai na Fase 1.

## Consequências

- Até lá, o benchmark serve para detectar regressão relativa, não para aprovar
  ou reprovar contra um número absoluto.
- O gerador de vault sintético precisa ser determinístico e versionado, senão a
  linha de base não é comparável entre execuções.
- Uma vez que existam metas, elas viram guardrail de CI
  ([0029](0029-guardrails-no-ci.md)); antes disso, não.
- A dor registrada de vaults grandes travando no iPhone (§16.1) é o cenário que
  mais provavelmente define a primeira meta.

## Alternativas descartadas

Nenhuma. O briefing não propõe números.

## Status

`[ABERTO]`. Decidir após a primeira linha de base.
