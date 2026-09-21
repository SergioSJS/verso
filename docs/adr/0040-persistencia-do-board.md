# ADR 0040 — Persistência do board

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §9, §17 item 9
- Status no briefing: `ABERTO`

## Contexto

O board usa Excalidraw ([0024](0024-board-excalidraw.md)) e o dialeto base já
inclui `.canvas` (JSON Canvas) ([0030](0030-dialeto-base-compativel-obsidian.md)).
O briefing registra como candidato um sidecar em JSON Canvas, com ou sem
extensões, sem decidir.

## Decisão

Nenhuma. Decidir antes do board, que está fora de escopo até o fim da Fase 2.

## Consequências

- A escolha precisa caber em duas decisões já tomadas: compatibilidade com
  `.canvas` do Obsidian e degradação para Markdown legível
  ([0013](0013-degradacao-para-markdown.md), `PROPOSTO`) — um desenho que só
  existe em JSON binário não atende.
- Estender o JSON Canvas com campos próprios é permitido se não contradisser o
  formato; substituí-lo não é ([0030](0030-dialeto-base-compativel-obsidian.md)).
- A camada semântica proposta (nós são notas, arestas são relações tipadas)
  depende da sintaxe de relação tipada, também `[ABERTO]`
  (`docs/spec/dialeto.md`).
- Vaults com `.excalidraw.md` do plugin do Obsidian precisam de conversão
  explícita, o que torna o formato de destino parte desta decisão.

## Alternativas descartadas

Nenhuma. O briefing registra o sidecar em JSON Canvas como candidato, não como
escolha.

## Status

`[ABERTO]`. Decidir antes do board.
