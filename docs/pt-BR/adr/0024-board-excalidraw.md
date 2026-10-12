# ADR 0024 — Board: Excalidraw como camada de anotação livre

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §4, §9
- Status no briefing: `DECIDIDO` (Excalidraw); `PROPOSTO` (camada semântica);
  `ABERTO` (persistência)
- Revisões: 2026-09-30 — a camada semântica, a persistência, a vista
  acessível, a conversão do `.excalidraw.md` e o escopo decididos no [0057](0057-board-json-canvas.md);
  as Consequências abaixo estão como escritas em 2026-09-21.

## Contexto

O board é um dos recursos que motivam o projeto, especialmente para mesa de RPG.
A alternativa mais conhecida, tldraw, tem licença source-available que exige
chave de licença em produção e marca d'água obrigatória, e proíbe relicenciar —
incompatível com [0001](0001-open-tool-no-company.md).

## Decisão

O board usa Excalidraw (MIT) como camada de anotação livre.

## Consequências

- A camada semântica é proposta, não decidida: nós são notas, arestas são
  relações tipadas, e uma seta livre pode ser promovida a relação tipada.
- A persistência do board é `[ABERTO]` ([0040](0040-board-persistence.md)).
  *(Decidida: o 0040 aceito em 2026-09-30, pelo ADR 0057.)*
- O board precisa de vista equivalente acessível — lista ou tabela das mesmas
  notas e relações ([0035](0035-cross-cutting-requirements.md), `PROPOSTO`).
- Vaults com `.excalidraw.md` do plugin do Obsidian exigem conversão explícita
  (`docs/spec/dialect.md`, `PROPOSTO`).
- Board fica fora de escopo até o fim da Fase 2
  ([0034](0034-roadmap-in-phases.md)).

## Alternativas descartadas

- tldraw — descartado por restrição de licença, não por preferência
  ([0009](0009-external-constraints.md)).

## Status

Aceito para o Excalidraw. Camada semântica e persistência: Aceito
(2026-09-30), pelo [0057](0057-board-json-canvas.md).
