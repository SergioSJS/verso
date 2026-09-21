# ADR 0032 — Papéis: a IA escreve, o mantenedor revisa comportamento, autor e revisor em sessões separadas

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §14.1
- Status no briefing: `DECIDIDO`

## Contexto

O mantenedor aprende Rust em paralelo, fora do projeto. Se o mesmo modelo
escreve e revisa na mesma sessão, a revisão herda as premissas do autor e deixa
de ser revisão.

## Decisão

1. A IA escreve o código; o mantenedor revisa comportamento pelas fixtures e
   questiona decisões.
2. Opus 5: autor de documentos, autor de UI/TS, revisor de código.
3. Fable 5.1: autor do código do core, revisor de documentos.
4. Autor e revisor sempre em sessões separadas; o revisor não vê o raciocínio do
   autor.

## Consequências

- O revisor recebe o diff e o contexto do repositório, nunca a transcrição da
  sessão do autor.
- Quem escreve o core não revisa o core; quem escreve documento não revisa o
  próprio documento.
- A revisão independente classifica achados em BLOQUEANTE, IMPORTANTE ou MENOR
  ([0033](0033-fluxo-de-pr.md)).
- O mantenedor é a autoridade final: sem entender o PR com as próprias palavras,
  não há merge.
- Este ADR foi escrito pelo Opus 5 na função de autor de documentos; a revisão
  cabe ao Fable 5.1 e ao mantenedor.

## Alternativas descartadas

- Autor e revisor na mesma sessão — descartado em §14.1.

## Status

Aceito.
