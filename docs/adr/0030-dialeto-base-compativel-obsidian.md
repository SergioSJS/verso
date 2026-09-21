# ADR 0030 — Dialeto base compatível com o Obsidian; o Verso estende, nunca contradiz

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §11.1, §10.4
- Status no briefing: `DECIDIDO`

## Contexto

O dialeto de arquivo é a segunda decisão cara de reverter (§10.4): depois que
existirem vaults escritos no dialeto do Verso, mudá-lo quebra o conteúdo de
quem confiou no projeto.

## Decisão

O Verso lê e escreve, sem quebrar:

- wikilinks: `[[nota]]`, `[[nota|alias]]`, `[[nota#seção]]`, `[[nota#^bloco]]`
- embeds: `![[...]]`
- callouts
- definição de bloco: `^id`
- frontmatter YAML, incluindo `tags` e `aliases`
- `.canvas` (JSON Canvas)

O Verso estende esse dialeto; nunca o contradiz.

## Consequências

- "Nunca contradiz" é um critério de revisão: qualquer extensão que mude o
  significado de uma construção existente é BLOQUEANTE
  ([0033](0033-fluxo-de-pr.md)).
- O comportamento concreto vive em `docs/spec/dialeto.md` e nas fixtures
  ([0031](0031-fixtures-como-contrato.md)); a spec é onde as lacunas ficam
  marcadas `[ABERTO]`.
- As fontes admissíveis para determinar o comportamento do Obsidian são só a API
  pública, a documentação pública e o comportamento observado de fora
  ([0009](0009-restricoes-externas.md)).
- Três itens de dialeto seguem sem decisão: sintaxe de relação tipada, formato e
  localização dos schemas, sintaxe de visibilidade por bloco.

## Alternativas descartadas

- Dialeto próprio sem compromisso de compatibilidade — descartado em §1 e §11.1.

## Status

Aceito.
