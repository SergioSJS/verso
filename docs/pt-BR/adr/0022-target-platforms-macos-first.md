# ADR 0022 — Plataformas-alvo e macOS primeiro

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §9
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-23 — os apps de Windows e Linux, a ordem deles e como o CI
  os acompanha, do mantenedor. 2026-10-07 — o app de Windows começa agora,
  com a Fase 2 aberta, do mantenedor ([0069](0069-windows-port.md)).

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
  ([0027](0027-runtime-capabilities.md)).
- A Fase 2 é um esqueleto andante só no macOS
  ([0034](0034-roadmap-in-phases.md)); mobile fica fora de escopo até lá.
- O CI roda em macOS e Linux desde a Fase 0, mesmo sem UI em Linux
  ([0029](0029-guardrails-in-ci.md)), para não acumular divergência de
  plataforma no core.
- As restrições de iOS e Android já estão registradas e não devem ser
  redescobertas quando o mobile entrar ([0009](0009-external-constraints.md)).
- **Windows e Linux, pelo mantenedor em 2026-09-23**: os dois apps saem,
  depois da Fase 2, **Windows primeiro** — não há máquina Linux à mão, e uma
  máquina virtual é trabalho a mais (*"windows e linux tem que sair também …
  Windows na frente de linux"*). Cada um entra nas checagens de plataforma do
  CI no `main` quando o porte dele chegar, e no empacotamento de uma versão
  ([0029](0029-guardrails-in-ci.md)); o CI já compila e testa o core em Linux
  em todo pull request.
- **Windows antecipado, pelo mantenedor em 2026-10-07**: o app de Windows
  começa agora, com a Fase 2 aberta e antes de uma versão estável (*"uma
  das coisas que a gente tem para fazer é implementar uma versão para
  Windows"*, depois *"Tô querendo já iniciar windows"*). Como é construído e
  testado é o [0069](0069-windows-port.md). Se o app de Windows faz parte do
  escopo e do critério de saída da Fase 2 é `[ABERTO]`; até decidir, a Fase
  2 fica só macOS, como acima. O Linux não muda (2026-09-23): depois da Fase
  2.

## Alternativas descartadas

Nenhuma registrada: o briefing não discute outra plataforma inicial.

## Status

Aceito.
