# ADR 0038 — Geração de tipos TypeScript a partir do Rust

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §9, §17 item 5
- Status no briefing: `ABERTO`

## Contexto

A regra 3 do contrato exige que os tipos TS sejam gerados a partir do Rust, não
escritos à mão ([0026](0026-contrato-core-ui-regras-inviolaveis.md)). O briefing
lista dois candidatos, sem escolher: `ts-rs` ou `specta`.

## Decisão

Nenhuma. Decidir no início da Fase 2.

## Consequências

- Até a decisão, não há contrato tipado no lado JS; a Fase 1 não precisa dele,
  por ser só CLI ([0034](0034-roadmap-em-fases.md)).
- A escolha afeta como os tipos do contrato são anotados no Rust, então mexe no
  código do core mesmo sendo uma ferramenta do lado TS.
- O CI precisa verificar que os tipos gerados estão atualizados; caso contrário
  a regra 3 vira convenção ([0029](0029-guardrails-no-ci.md)).

## Alternativas descartadas

- Tipos TS escritos à mão — descartados pela regra 3 do contrato (§10.1).

## Status

`[ABERTO]`. Decidir no início da Fase 2.
