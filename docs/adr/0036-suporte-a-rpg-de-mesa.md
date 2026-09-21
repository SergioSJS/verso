# ADR 0036 — Suporte especial a RPG de mesa

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §12, §16.2
- Status no briefing: `DECIDIDO` (intenção); `PROPOSTO` (escopo)

## Contexto

O público-alvo inclui quem joga e mestra RPG de mesa, e é onde o mantenedor tem
uso real — o que torna esse público o teste do portão da Fase 2
([0034](0034-roadmap-em-fases.md)).

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
  primitivas ([0014](0014-catalogo-de-primitivas.md)), packs de schema
  ([0015](0015-packs-de-schema.md)) ou plugin
  ([0017](0017-plugins-formato-shim-carregamento.md)).
- A visão de jogador depende da sintaxe de visibilidade por bloco, `[ABERTO]`
  (`docs/spec/dialeto.md`), e precisa ser decidida antes de compartilhamento e
  exportação.
- A integração com Foundry é plugin, e vale como prova de que a API permite
  features de primeira parte sem acesso privilegiado.
- A sensibilidade desse público a conteúdo gerado por IA é a razão do
  generativo opt-in ([0019](0019-generativo-opt-in-e-keychain.md)).
- Referência registrada para board de mestre com relações tipadas, tabelas
  aleatórias e visão de jogador: Alkemion Studio (§16.2).

## Alternativas descartadas

Nenhuma registrada.

## Status

Aceito para a intenção. Escopo: Proposto.
