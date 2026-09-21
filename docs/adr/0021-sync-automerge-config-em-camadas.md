# ADR 0021 — Sync: Automerge, config em camadas e guarda contra placeholder

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §8, §16.1
- Status no briefing: `PROPOSTO`

## Contexto

Propostas que detalham [0020](0020-sync-merge-no-core-transportes-como-plugin.md),
respondendo a duas dores registradas: sync de config que falha entre dispositivos
e armazenamento sob demanda interpretado como deleção, causando perda de dados.

## Decisão (proposta, não confirmada)

1. Candidato ao motor de merge: Automerge.
2. Config em camadas: compartilhada (lista de plugins, schemas) e por dispositivo
   (hotkeys, layout).
3. Arquivo placeholder de armazenamento sob demanda (iCloud, OneDrive) nunca é
   interpretado como deleção.

## Consequências

- Automerge implica representar o documento como CRDT, com estado que precisa
  morar em algum lugar — provavelmente fora da árvore
  ([0011](0011-config-fora-da-arvore-indice-como-cache.md)). Confirmar antes de
  adotar.
- Config em camadas só funciona se a fronteira entre compartilhado e por
  dispositivo for explícita no formato de config.
- A guarda contra placeholder vale para todo o core, não só para o sync: a
  varredura de pasta da Fase 1 já precisa distinguir placeholder de arquivo
  ausente ([0029](0029-guardrails-no-ci.md)).

## Alternativas descartadas

Nenhuma registrada: o briefing cita Automerge como candidato, sem comparação com
outras bibliotecas de CRDT.

## Status

Proposto.
