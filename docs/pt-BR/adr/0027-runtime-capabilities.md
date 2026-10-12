# ADR 0027 — Capabilities consultáveis em runtime

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §10.2, §4
- Status no briefing: `PROPOSTO`
- Revisões: 2026-10-12 — aceito pelo mantenedor, respondendo à auditoria dos ADRs
  em sessão: *"Ajuste tudo que precisar. Está aprovado os ADRs"*. Estava
  Proposto enquanto o [0073](0073-self-hosted-server-first.md), o
  [0076](0076-the-window-on-every-screen.md), a invariante 2 do
  `CLAUDE.md` e o `crates/verso-contract` já se apoiavam nele. O item 3
  revisado para a regra do item 11 do 0076, o comportamento construído;
  o texto antigo fica ao lado como histórico.

## Contexto

As limitações por plataforma são aceitáveis desde que explícitas
([0022](0022-target-platforms-macos-first.md)). Para serem explícitas,
precisam ser consultáveis por código, não documentadas em prosa.

## Decisão (proposta, não confirmada)

*(Aceita em 2026-10-12, o item 3 revisado: Status.)*

1. Capabilities consultáveis pela UI e por plugins (ex.: `fs:arbitrary`,
   `fs:watch`, `net:fetch`, `proc:spawn`, `bg:sync`, `offline`).
2. O manifesto de plugin declara o que exige; o catálogo filtra por plataforma.
3. Um recurso que o lado não consegue fazer não aparece — nunca mostrado
   e falhando — com um caminho de volta nos Ajustes: a regra do item 11
   do [0076](0076-the-window-on-every-screen.md), o comportamento
   construído; revisado em 2026-10-12. *(O texto até 2026-10-12,
   guardado como histórico: "A UI explica a ausência de um recurso em vez
   de escondê-lo.")*

## Consequências

- Há dois vocabulários de capability em jogo — o de permissão de plugin
  ([0016](0016-plugins-execution-and-capabilities.md): `vault:read`, `vault:write`)
  e o de disponibilidade de plataforma (este ADR). Se são o mesmo namespace ou
  dois, o briefing não diz: registrar como questão antes de implementar.
- "Explicar em vez de esconder" é requisito de UI verificável em revisão, e se
  conecta à acessibilidade ([0035](0035-cross-cutting-requirements.md)).
  *(Revisado com o item 3 em 2026-10-12: o que o lado não consegue fazer
  fica ausente, nunca mostrado e falhando.)*
- O catálogo de plugins precisa da flag de plataforma no manifesto
  ([0017](0017-plugins-format-shim-loading.md)).

## Alternativas descartadas

- Esconder o que a plataforma não suporta — descartado em §10.2.
  *(Retomado em 2026-10-12, para o que o lado não consegue fazer, pela
  revisão do item 3.)*

## Status

**Aceito em 2026-10-12** pelo mantenedor
(*"Ajuste tudo que precisar. Está aprovado os ADRs"*), com o item 3
revisado para a regra do item 11 do
[0076](0076-the-window-on-every-screen.md) (Revisões).

*(Histórico, o status até 2026-10-12:)* Proposto.
