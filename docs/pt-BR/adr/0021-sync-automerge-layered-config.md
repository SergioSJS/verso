# ADR 0021 — Sync: Automerge e config em camadas

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §8, §16.1
- Status no briefing: `PROPOSTO`
- Revisões: 2026-09-21 — a guarda contra placeholder saiu deste ADR e virou
  [0043](0043-placeholder-guard.md), Aceito (revisão da Fase 0, C1).

## Contexto

Propostas que detalham [0020](0020-sync-merge-in-core-transports-as-plugins.md),
respondendo à dor registrada de sync de config que falha entre dispositivos.

## Decisão (proposta, não confirmada)

1. Candidato ao motor de merge: Automerge.
2. Config em camadas: compartilhada (lista de plugins, schemas) e por dispositivo
   (hotkeys, layout).

## Consequências

- Automerge implica representar o documento como CRDT, com estado que precisa
  morar em algum lugar — provavelmente fora da árvore
  ([0011](0011-config-outside-tree-index-as-cache.md)). Confirmar antes de
  adotar.
- Config em camadas só funciona se a fronteira entre compartilhado e por
  dispositivo for explícita no formato de config.
- A guarda contra placeholder, antes item 3 deste ADR, é decisão própria em
  [0043](0043-placeholder-guard.md) e vale para todo o core desde a
  Fase 1.
- Automerge mantém estado de CRDT fora do arquivo; edições feitas por outro app
  (Obsidian, editor de texto) chegam sem esse estado. Como reconciliar as duas
  fontes é parte da confirmação, não detalhe de implementação.

## Alternativas descartadas

Nenhuma registrada: o briefing cita Automerge como candidato, sem comparação com
outras bibliotecas de CRDT.

## Status

Proposto.
