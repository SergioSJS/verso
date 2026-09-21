# ADR 0022 — Plataformas-alvo e macOS primeiro

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §9
- Status no briefing: `DECIDIDO`

## Contexto

O projeto tem um mantenedor. Suportar cinco plataformas desde o início é a via
mais rápida para o burnout registrado em §10.3.

## Decisão

1. Plataformas-alvo: macOS, Windows, Linux, iOS e Android.
2. Plataforma inicial: macOS.
3. Limitações por plataforma são aceitáveis, desde que explícitas.

## Consequências

- "Explícitas" tem endereço: as capabilities em runtime, e a regra de que a UI
  explica a ausência de um recurso em vez de escondê-lo
  ([0027](0027-capabilities-em-runtime.md)).
- A Fase 2 é um esqueleto andante só no macOS
  ([0034](0034-roadmap-em-fases.md)); mobile fica fora de escopo até lá.
- O CI roda em macOS e Linux desde a Fase 0, mesmo sem UI em Linux
  ([0029](0029-guardrails-no-ci.md)), para não acumular divergência de
  plataforma no core.
- As restrições de iOS e Android já estão registradas e não devem ser
  redescobertas quando o mobile entrar ([0009](0009-restricoes-externas.md)).

## Alternativas descartadas

Nenhuma registrada: o briefing não discute outra plataforma inicial.

## Status

Aceito.
