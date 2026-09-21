# ADR 0025 — Servidor próprio (`verso serve`) e mobile inicial como cliente web

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §9, §16.1, §16.2
- Status no briefing: `PROPOSTO`

## Contexto

As restrições de mobile (sem acesso a pasta arbitrária no iOS, operações em
massa lentas no Android, sem processo residente) tornam caro indexar um vault
grande no celular. A dor registrada é justamente vaults grandes travando no
iPhone.

## Decisão (proposta, não confirmada)

1. O servidor é o mesmo binário do core sem UI: `verso serve`.
2. Mobile inicial: cliente web (PWA) servido pelo servidor próprio.
3. Um servidor companheiro indexa e entrega o índice pronto ao celular.

## Consequências

- Reforça a regra de que a UI não assume de que lado do fio o core está
  ([0026](0026-core-ui-contract-inviolable-rules.md)): o mesmo contrato roda
  por IPC local ou por WebSocket remoto.
- Um cliente web que depende de servidor não é offline-first: a disponibilidade
  precisa aparecer nas capabilities
  ([0027](0027-runtime-capabilities.md)).
- O SilverBullet é a referência registrada para o cliente web (§16.2).
- Servir a pasta pela rede levanta autenticação e exposição, que o briefing não
  trata. A questão está registrada em
  [0045](0045-server-and-mcp-security.md), `[ABERTO]`, e parte dela
  (identidade de sessão e autorização no contrato) precisa ser decidida já na
  Fase 2, item 2.1, porque o servidor reaproveita o contrato.
- Mobile está fora de escopo até o fim da Fase 2
  ([0034](0034-roadmap-in-phases.md)).

## Alternativas descartadas

Nenhuma registrada: o briefing não compara PWA com app nativo mobile.

## Status

Proposto.
