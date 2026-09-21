# ADR 0015 — Packs de schema distribuíveis como conteúdo

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.4, §16.1
- Status no briefing: `PROPOSTO`

## Contexto

Uma das dores registradas é a paralisia de começar com o app vazio: o usuário
precisa inventar a própria estrutura antes de escrever a primeira nota.

## Decisão (proposta, não confirmada)

Schemas são distribuíveis como conteúdo — diário, worldbuilding, sistemas de RPG
— e não como código de plugin.

## Consequências

- Instalar um pack não executa código, o que o separa do sistema de plugins e do
  seu modelo de consentimento ([0016](0016-plugins-execucao-e-capabilities.md)).
  Isso só se sustenta se schema não tiver templates, expressões ou consultas;
  onde passa a linha entre conteúdo e código é questão registrada em
  [0047](0047-questoes-abertas-da-api-de-plugin.md), e a integridade do pack
  baixado (hash, origem) também.
- Depende do formato e da localização dos schemas, ainda `[ABERTO]`
  (`docs/spec/dialeto.md`).
- Um pack por sistema de jogo é o caminho previsto para o suporte a RPG
  ([0036](0036-suporte-a-rpg-de-mesa.md)).
- Packs precisam sobreviver ao usuário editar o schema depois de instalado: a
  atualização de pack não pode sobrescrever edição local sem diff
  ([0012](0012-arquivos-sao-fonte-de-verdade.md)).

## Alternativas descartadas

- Distribuir schema como plugin — o briefing trata packs como conteúdo, não como
  código (§5.4).

## Status

Proposto.
