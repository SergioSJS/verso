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
  seu modelo de consentimento ([0016](0016-plugins-execution-and-capabilities.md)).
  Isso só se sustenta se schema não tiver templates, expressões ou consultas;
  onde passa a linha entre conteúdo e código é questão registrada em
  [0047](0047-plugin-api-open-questions.md), e a integridade do pack
  baixado (hash, origem) também.
- Depende do formato e da localização dos schemas, ainda `[ABERTO]`
  (`docs/spec/dialect.md`). *(Decididos em 2026-09-24: Q11 da spec, ADR
  0052.)*
- Um pack por sistema de jogo é o caminho previsto para o suporte a RPG
  ([0036](0036-tabletop-rpg-support.md)).
- Packs precisam sobreviver ao usuário editar o schema depois de instalado: a
  atualização de pack não pode sobrescrever edição local sem diff
  ([0012](0012-files-are-source-of-truth.md)).

## Alternativas descartadas

- Distribuir schema como plugin — o briefing trata packs como conteúdo, não como
  código (§5.4).

## Status

Proposto.

*2026-10-21* — o questionário de decisões de 2026-10-20 (respondido em 2026-10-21): **0015** `[DECIDIDO 2026-10-21]` (opção A) fica para depois da V1, ligada à [0047](0047-plugin-api-open-questions.md) e à [0098](0098-world-and-campaign-wizard-template-bundles.md). Conciliada com o item 11 da 0098, decidido no mesmo dia (0098.R, opção A): o **pacote da 0098 é o formato dos packs de estrutura distribuídos como conteúdo**, um conceito e uma tela, e esta ADR passa a apontar para lá; tudo o que esta ADR imagina além do que um pacote faz (tipos de nota e esquemas, um pack por sistema de jogo, a integridade de um pack baixado) fica depois da V1. O Status continua Proposto.
