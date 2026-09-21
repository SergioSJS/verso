# ADR 0013 — Todo dado estruturado degrada para Markdown legível

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.2
- Status no briefing: `PROPOSTO`

## Contexto

Estrutura costuma ser adicionada a um app de notas na forma de banco de dados ou
de sintaxe própria. Nos dois casos, quem abre o arquivo em outro editor vê algo
ilegível, e git, busca e agentes deixam de enxergar o conteúdo (§16.1).

## Decisão (proposta, não confirmada)

Todo dado estruturado do Verso degrada para Markdown legível em qualquer editor.

## Consequências

- Nenhum recurso estruturado pode existir apenas no índice
  ([0011](0011-config-fora-da-arvore-indice-como-cache.md)).
- Views precisam poder materializar a saída como Markdown real no arquivo
  ([0014](0014-catalogo-de-primitivas.md)).
- A sintaxe de relação tipada, ainda `[ABERTO]`, fica restringida por esta
  proposta: precisa ser legível fora do Verso (`docs/spec/dialeto.md`).
- O custo é redundância: o mesmo dado aparece no arquivo e no índice, e os dois
  precisam concordar.

## Alternativas descartadas

- Guardar dado estruturado apenas em banco — o briefing cita a transição do
  Logseq para versão em banco de dados como referência, não como caminho (§16.2).

## Status

Proposto.
