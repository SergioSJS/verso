# ADR 0019 — Recursos generativos opt-in e chaves no keychain

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §7
- Status no briefing: `PROPOSTO`

## Contexto

A comunidade de RPG de mesa é sensível a conteúdo gerado por IA, e o Verso
declara suporte especial a esse público ([0036](0036-tabletop-rpg-support.md)).
Separadamente, chaves de API dentro da pasta seriam sincronizadas e versionadas
junto com as notas.

## Decisão (proposta, não confirmada)

1. Recursos generativos são explícitos e opt-in.
2. Chaves de API ficam no keychain do sistema operacional, nunca dentro da pasta.

## Consequências

- Nada generativo pode ficar ligado por padrão, inclusive sugestão passiva
  durante a escrita.
- O keychain varia por plataforma e não existe de forma equivalente em todos os
  alvos: precisa entrar nas capabilities em runtime
  ([0027](0027-runtime-capabilities.md)).
- Chave fora da pasta é coerente com a config fora da árvore
  ([0011](0011-config-outside-tree-index-as-cache.md)) e evita vazamento
  por sync ou por commit.
- A proveniência de escrita no frontmatter é o que torna o opt-in auditável
  depois ([0014](0014-primitives-catalog.md)).

## Alternativas descartadas

Nenhuma registrada no briefing.

## Status

Aceito (2026-10-21). O mantenedor marcou a opção A no questionário de decisões de 2026-10-20 (respondido em 2026-10-21): IA generativa sempre opt-in, chaves no chaveiro do sistema, fora da pasta. O item 8 da [0098](0098-world-and-campaign-wizard-template-bundles.md) se apoia nela.
