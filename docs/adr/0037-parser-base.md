# ADR 0037 — Parser base do `verso-dialect`

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §9, §17 item 4
- Status no briefing: `ABERTO`

## Contexto

O `verso-dialect` precisa de uma base de parsing de Markdown. O briefing lista
três caminhos, sem escolher: `pulldown-cmark`, `comrak` ou parser próprio.

A escolha é restringida por decisões já tomadas:

- parser puro, sem IO e sem async ([0028](0028-estrutura-de-crates.md));
- alvo de `cargo-fuzz` e de property test de round-trip
  ([0029](0029-guardrails-no-ci.md));
- compilável para WASM, para servir de suíte de conformidade contra o Lezer do
  CodeMirror 6 (§10.3);
- preservação fiel do arquivo, já que abrir nunca reescreve
  ([0012](0012-arquivos-sao-fonte-de-verdade.md));
- extensões do dialeto (wikilink, embed, `^id`, callout) precisam caber na base
  ([0030](0030-dialeto-base-compativel-obsidian.md));
- **posições** (linha e coluna) para cada construção, exigidas pela citação
  verificável ([0018](0018-llm-nativo-mcp-no-core.md)) e pelo schema do
  `expected.yaml` (`docs/spec/dialeto.md` §4);
- **a definição de round-trip** (`docs/spec/dialeto.md`, Q18). Há duas leituras
  — árvore sem perda com `serialize(parse(x)) == x`, ou parser somente leitura
  com edições por patch textual — e elas escolhem parsers diferentes:
  `pulldown-cmark` não atende à primeira sem trabalho grande. Q18 é decidida no
  mesmo PR que este ADR, antes da comparação, porque é critério dela.

## Decisão

Nenhuma. Decidir no PR da feature 1 da Fase 1, com comparação justificada entre
as três opções contra os critérios acima, depois de Q18 respondida.

## Consequências

- A Fase 1 não começa pelo parser sem essa comparação no PR
  ([0033](0033-fluxo-de-pr.md)).
- Escolher errado é reversível, mas o custo cresce com o tamanho do corpus de
  fixtures; as fixtures em si são independentes da escolha
  ([0031](0031-fixtures-como-contrato.md)).
- Se a escolha for parser próprio, o esforço de fuzzing e conformidade sobe, e
  isso precisa aparecer no roadmap.

## Alternativas descartadas

Nenhuma. As três opções seguem vivas.

## Status

`[ABERTO]`. Decidir no PR da feature 1 (Fase 1).
