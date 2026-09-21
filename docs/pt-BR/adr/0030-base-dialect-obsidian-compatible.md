# ADR 0030 — Dialeto base compatível com o Obsidian; o Verso estende, nunca contradiz

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §11.1, §10.4
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-21 — fonte pública citada e critério da lista registrado
  (revisão da Fase 0, I3).

## Contexto

O dialeto de arquivo é a segunda decisão cara de reverter (§10.4): depois que
existirem vaults escritos no dialeto do Verso, mudá-lo quebra o conteúdo de
quem confiou no projeto.

Fonte pública que embasa a lista abaixo, admissível por
[0009](0009-external-constraints.md): a documentação do Obsidian em
`help.obsidian.md`, em especial as páginas "Obsidian Flavored Markdown",
"Internal links", "Embed files", "Callouts" e "Properties"; e a especificação
JSON Canvas em `jsoncanvas.org`. A documentação pública descreve mais
construções do que a lista abaixo (tags, comentários `%%`, destaque `==`,
matemática, tabelas, footnotes, links Markdown para arquivo, caminhos de
heading aninhados). A lista abaixo é o **mínimo decidido no briefing**, não o
teto: o que fica de fora é `[ABERTO]` na spec (Q13, Q15, Q19, Q20), não
"não suportado".

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
  ([0033](0033-pr-workflow.md)).
- O comportamento concreto vive em `docs/spec/dialect.md` e nas fixtures
  ([0031](0031-fixtures-as-contract.md)); a spec é onde as lacunas ficam
  marcadas `[ABERTO]`.
- As fontes admissíveis para determinar o comportamento do Obsidian são só a API
  pública, a documentação pública e o comportamento observado de fora
  ([0009](0009-external-constraints.md)).
- Três itens de dialeto seguem sem decisão: sintaxe de relação tipada, formato e
  localização dos schemas, sintaxe de visibilidade por bloco.

## Alternativas descartadas

- Dialeto próprio sem compromisso de compatibilidade — descartado em §1 e §11.1.

## Status

Aceito.
