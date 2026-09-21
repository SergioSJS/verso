# ADR 0003 — O que hoje exige plugin deve ser primitiva do app

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §1, §5.3 (cabeçalho)
- Status no briefing: `DECIDIDO` (princípio); o catálogo de primitivas é `PROPOSTO`

## Contexto

No Obsidian, boa parte do uso avançado é montada com plugins encadeados
(Dataview, Templater, Periodic Notes, statblocks). O resultado é frágil: quebra
em atualização, não sobrevive à saída de um autor e produz conteúdo invisível ao
git, à busca e a um agente.

## Decisão

A experiência precisa ser redonda sem gambiarra: o que hoje exige plugin de
terceiro para ser usável deve ser primitiva do app.

## Consequências

- Cada gambiarra comum vira um candidato a primitiva, e cada primitiva precisa
  do seu próprio ADR antes de ser implementada.
- O catálogo concreto de primitivas ainda é proposta, não decisão
  ([0014](0014-catalogo-de-primitivas.md)).
- O princípio não autoriza um núcleo grande: features específicas continuam
  candidatas a plugin de primeira parte
  ([0017](0017-plugins-formato-shim-carregamento.md)).

## Alternativas descartadas

- Depender de plugins de terceiros para a experiência básica — é exatamente o
  problema que motiva a decisão (§1, §5.3, §16.1).

## Status

Aceito.
