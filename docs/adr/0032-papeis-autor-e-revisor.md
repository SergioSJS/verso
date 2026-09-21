# ADR 0032 — Papéis: a IA escreve, o mantenedor revisa comportamento, autor e revisor em sessões separadas

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §14.1
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-21 — revisor de UI/TS definido e "quem escreveu" precisado
  como modelo, não sessão (revisão da Fase 0, C4).

## Contexto

O mantenedor aprende Rust em paralelo, fora do projeto. Se o mesmo modelo
escreve e revisa na mesma sessão, a revisão herda as premissas do autor e deixa
de ser revisão.

## Decisão

1. A IA escreve o código; o mantenedor revisa comportamento pelas fixtures e
   questiona decisões.
2. Opus 5: autor de documentos, autor de UI/TS, revisor do código do core.
3. Fable 5.1: autor do código do core, revisor de documentos e do código de
   UI/TS.
4. Autor e revisor sempre em sessões separadas; o revisor não vê o raciocínio do
   autor.
5. "Quem escreveu não revisa" vale para o **modelo**, não só para a sessão: o
   modelo que escreveu um artefato não o revisa, nem na mesma sessão nem em
   outra. Por isso cada tipo de artefato tem um autor e um revisor de modelos
   diferentes.

| Artefato | Autor | Revisor |
|---|---|---|
| Documentos (ADR, spec, roadmap, `CLAUDE.md`) | Opus 5 | Fable 5.1 |
| Código do core (Rust) | Fable 5.1 | Opus 5 |
| UI e TypeScript | Opus 5 | Fable 5.1 |
| Comportamento (fixtures) e decisões | — | o mantenedor |

## Consequências

- O revisor recebe o diff e o contexto do repositório, nunca a transcrição da
  sessão do autor.
- Quem escreve o core não revisa o core; quem escreve documento não revisa o
  próprio documento; quem escreve UI não revisa UI.
- Quando o mantenedor manda o revisor aplicar os próprios achados (como na
  revisão da Fase 0), o revisor vira autor daquele diff, e o diff precisa de
  leitura pelo outro modelo antes do merge. A autoridade do mantenedor não
  dispensa isso; só decide se o custo vale.
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
