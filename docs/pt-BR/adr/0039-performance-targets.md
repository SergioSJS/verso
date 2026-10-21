# ADR 0039 — Metas de performance

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §13, §17 item 10
- Status no briefing: `ABERTO`

## Contexto

O briefing decide medir — benchmark com vault sintético registrando linha de
base ([0035](0035-cross-cutting-requirements.md)) — e decide não estabelecer
metas por ora. Medir antes de prometer evita número inventado.

## Decisão

Nenhuma meta de performance por ora. Decidir após a primeira linha de base, que
sai na Fase 1.

## Consequências

- Até lá, o benchmark serve para detectar regressão relativa, não para aprovar
  ou reprovar contra um número absoluto.
- O gerador de vault sintético precisa ser determinístico e versionado, senão a
  linha de base não é comparável entre execuções.
- Uma vez que existam metas, elas viram guardrail de CI
  ([0029](0029-guardrails-in-ci.md)); antes disso, não.
- A dor registrada de vaults grandes travando no iPhone (§16.1) é o cenário que
  mais provavelmente define a primeira meta.

**O que foi decidido em 2026-09-22, e o que não foi.** O mantenedor aprovou a
forma do benchmark e da linha de base (`docs/reference/bench-decision.md`,
[0029](0029-guardrails-in-ci.md)): o gerador, os tamanhos, as operações, as
métricas, onde roda e as tolerâncias de regressão. **Nenhuma meta foi
definida**, e esta ADR continua `[OPEN]` de propósito. As tolerâncias são
limiares contra uma linha de base registrada, não promessa sobre performance
absoluta, e não devem ser lidas como tal.

## Alternativas descartadas

Nenhuma. O briefing não propõe números.

## Status

`[ABERTO]`. Decidir após a primeira linha de base. `[DECIDIDO 2026-10-21]` (a marca do mantenedor, opção A, no questionário de decisões de 2026-10-20): a primeira meta absoluta é fixada só para o congelamento num cofre grande no iPhone, quando houver medida; não há outras metas até lá.
