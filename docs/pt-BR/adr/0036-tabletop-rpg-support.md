# ADR 0036 — Suporte especial a RPG de mesa

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §12, §16.2
- Status no briefing: `DECIDIDO` (intenção); `PROPOSTO` (escopo)
- Revisões: 2026-10-14 — o mantenedor aceitou naquela noite o
  [0087](0087-secret-blocks-hidden-from-readers.md), o
  [0088](0088-dice-and-random-tables.md) e o [0090](0090-maps-on-the-board.md)
  (*"Sim, todas"*, todas as recomendações): dados, tabelas aleatórias,
  blocos secretos e mapas entram no núcleo como **primitivas**
  ([0003](0003-primitives-not-workarounds.md)), úteis além dos jogos, o
  que as Consequências abaixo permitem. Da tabela de escopo: a tabela
  aleatória é uma tabela ou lista Markdown com um `^id`, rolada por
  `dice:` — sem tipo de nota (item 3 do 0088); a visão do jogador é um
  callout `[!secret]` servido aos leitores sem ele, no compartilhamento,
  e deixado de fora por padrão de uma exportação feita por quem escreve
  (0087); atalhos nomeados de viewport não são decididos ali. O texto
  abaixo fica como foi escrito.

## Contexto

O público-alvo inclui quem joga e mestra RPG de mesa, e é onde o mantenedor tem
uso real — o que torna esse público o teste do portão da Fase 2
([0034](0034-roadmap-in-phases.md)).

## Decisão

Suporte especial a quem joga e mestra é intenção declarada do projeto.

O escopo abaixo é proposta, não decisão:

| Recurso | Status |
|---|---|
| Integração com Foundry VTT mapeando nota tipada ↔ Actor/Item com o data model do sistema; os módulos existentes só sincronizam journals | `PROPOSTO` |
| Tabela aleatória como tipo de nota com ação de rolagem | `PROPOSTO` |
| Visão de jogador: blocos marcados como secretos somem no compartilhamento e na exportação; mapeia para permissão de journal no Foundry | `PROPOSTO` |
| Atalhos nomeados de viewport no board | `PROPOSTO` |
| Packs de schema por sistema de jogo | `PROPOSTO` |

## Consequências

- Nenhum recurso de RPG entra no core como caso especial: todos passam por
  primitivas ([0014](0014-primitives-catalog.md)), packs de schema
  ([0015](0015-schema-packs.md)) ou plugin
  ([0017](0017-plugins-format-shim-loading.md)).
- A visão de jogador depende da sintaxe de visibilidade por bloco, `[ABERTO]`
  (`docs/spec/dialect.md`), e precisa ser decidida antes de compartilhamento e
  exportação.
- A integração com Foundry é plugin, e vale como prova de que a API permite
  features de primeira parte sem acesso privilegiado.
- A sensibilidade desse público a conteúdo gerado por IA é a razão do
  generativo opt-in ([0019](0019-generative-opt-in-and-keychain.md)).
- Referência registrada para board de mestre com relações tipadas, tabelas
  aleatórias e visão de jogador: Alkemion Studio (§16.2).

## Alternativas descartadas

Nenhuma registrada.

## Status

Aceito para a intenção. Escopo: Proposto.

*2026-10-21* — o questionário de decisões de 2026-10-20 (respondido em 2026-10-21), todas opção A: **0036.a** `[DECIDIDO 2026-10-21]` a integração com o Foundry VTT vem depois da V1, como plugin; **0036.b** `[DECIDIDO 2026-10-21]` atalhos de enquadramento (viewports) nomeados no board vêm depois da V1 (a [0090](0090-maps-on-the-board.md) não os decidiu); **0036.c** `[DECIDIDO 2026-10-21]` o pacote de esquemas por sistema de jogo segue a [0015](0015-schema-packs.md), depois da V1.
