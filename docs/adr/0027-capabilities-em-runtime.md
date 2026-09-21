# ADR 0027 — Capabilities consultáveis em runtime

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §10.2, §4
- Status no briefing: `PROPOSTO`

## Contexto

As limitações por plataforma são aceitáveis desde que explícitas
([0022](0022-plataformas-alvo-e-macos-primeiro.md)). Para serem explícitas,
precisam ser consultáveis por código, não documentadas em prosa.

## Decisão (proposta, não confirmada)

1. Capabilities consultáveis pela UI e por plugins (ex.: `fs:arbitrary`,
   `fs:watch`, `net:fetch`, `proc:spawn`, `bg:sync`, `offline`).
2. O manifesto de plugin declara o que exige; o catálogo filtra por plataforma.
3. A UI explica a ausência de um recurso em vez de escondê-lo.

## Consequências

- Há dois vocabulários de capability em jogo — o de permissão de plugin
  ([0016](0016-plugins-execucao-e-capabilities.md): `vault:read`, `vault:write`)
  e o de disponibilidade de plataforma (este ADR). Se são o mesmo namespace ou
  dois, o briefing não diz: registrar como questão antes de implementar.
- "Explicar em vez de esconder" é requisito de UI verificável em revisão, e se
  conecta à acessibilidade ([0035](0035-requisitos-transversais.md)).
- O catálogo de plugins precisa da flag de plataforma no manifesto
  ([0017](0017-plugins-formato-shim-carregamento.md)).

## Alternativas descartadas

- Esconder o que a plataforma não suporta — descartado em §10.2.

## Status

Proposto.
