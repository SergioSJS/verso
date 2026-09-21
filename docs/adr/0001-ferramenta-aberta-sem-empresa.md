# ADR 0001 — Ferramenta aberta, sem empresa e sem produto pago

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §1, §3
- Status no briefing: `DECIDIDO`

## Contexto

O Verso nasce como alternativa aberta a um app de notas mantido por uma empresa.
O mantenedor constrói o projeto porque gosta de construir ferramentas, não por
expectativa de receita. As consequências de licença, governança e escopo derivam
desse ponto de partida.

## Decisão

1. O Verso é uma ferramenta aberta que a comunidade pode evoluir sem depender de
   uma empresa.
2. Não há serviço pago nem plano de sustentação além de doações.
3. A sustentação é apenas via Ko-fi. Doação não compra feature.

## Consequências

- Não existe orçamento para comprar tempo: o escopo é limitado pelo tempo do
  mantenedor, o que reforça o núcleo pequeno e as features como plugins
  (ver [0014](0014-catalogo-de-primitivas.md), [0017](0017-plugins-formato-shim-carregamento.md)).
- A escolha de licença precisa preservar a ausência de uma empresa no meio
  (ver [0005](0005-licenca.md)).
- Sem CLA, relicenciar depois exige consentimento dos contribuintes
  (ver [0006](0006-contribuicao-dco-sem-cla.md)).
- Pedidos financiados não entram na fila por terem sido financiados; a fila é do
  mantenedor.
- Risco declarado de burnout (§10.3) é tratado por escopo, não por contratação.

## Alternativas descartadas

- Serviço pago ou qualquer plano de sustentação além de doações — descartado em
  §1 ("O que não é").

## Status

Aceito.
