# ADR 0024 — Board: Excalidraw como camada de anotação livre

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §4, §9
- Status no briefing: `DECIDIDO` (Excalidraw); `PROPOSTO` (camada semântica);
  `ABERTO` (persistência)

## Contexto

O board é um dos recursos que motivam o projeto, especialmente para mesa de RPG.
A alternativa mais conhecida, tldraw, tem licença source-available que exige
chave de licença em produção e marca d'água obrigatória, e proíbe relicenciar —
incompatível com [0001](0001-ferramenta-aberta-sem-empresa.md).

## Decisão

O board usa Excalidraw (MIT) como camada de anotação livre.

## Consequências

- A camada semântica é proposta, não decidida: nós são notas, arestas são
  relações tipadas, e uma seta livre pode ser promovida a relação tipada.
- A persistência do board é `[ABERTO]` ([0040](0040-persistencia-do-board.md)).
- O board precisa de vista equivalente acessível — lista ou tabela das mesmas
  notas e relações ([0035](0035-requisitos-transversais.md), `PROPOSTO`).
- Vaults com `.excalidraw.md` do plugin do Obsidian exigem conversão explícita
  (`docs/spec/dialeto.md`, `PROPOSTO`).
- Board fica fora de escopo até o fim da Fase 2
  ([0034](0034-roadmap-em-fases.md)).

## Alternativas descartadas

- tldraw — descartado por restrição de licença, não por preferência
  ([0009](0009-restricoes-externas.md)).

## Status

Aceito para o Excalidraw. Camada semântica: Proposto. Persistência: `[ABERTO]`.
