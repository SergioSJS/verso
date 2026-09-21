# ADR 0035 — Requisitos transversais: pt-BR e EN, acessibilidade, benchmark

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §13
- Status no briefing: `DECIDIDO` (i18n, acessibilidade, benchmark);
  `PROPOSTO` (vista acessível do board); `ABERTO` (metas de performance)

## Contexto

i18n e acessibilidade são baratas no começo e caras depois: adicionar idioma ou
semântica acessível a uma UI pronta costuma exigir reescrever a UI.

## Decisão

1. pt-BR e EN desde o primeiro commit.
2. Acessibilidade desde o início.
3. Benchmark com vault sintético registrando linha de base.

## Consequências

- "Desde o primeiro commit" significa **desde o primeiro commit de código de
  produto**: a Fase 0 é documentação e crates vazios. Vale para a UI da Fase 2 e
  para as mensagens da CLI da Fase 1: nenhuma string literal solta. A Fase 1
  ganha item de escopo e critério de saída para isso (`docs/roadmap.md`), e a
  dependência de i18n que `verso-cli` precisar é justificada no PR como qualquer
  outra ([0033](0033-pr-workflow.md)).
- O idioma do produto (pt-BR e EN, decidido) é independente do idioma da
  documentação do repositório, decidido à parte: inglês fonte, pt-BR espelho
  ([0008](0008-documentation-language.md)).
- O board precisa de vista equivalente acessível — lista ou tabela das mesmas
  notas e relações (`PROPOSTO`, [0024](0024-board-excalidraw.md)).
- O benchmark entra como guardrail na Fase 1
  ([0029](0029-guardrails-in-ci.md)), mas sem meta: metas de performance são
  `[ABERTO]` ([0039](0039-performance-targets.md)).
- i18n de schema com chave neutra de idioma é proposta separada
  (`docs/spec/dialect.md`).

## Alternativas descartadas

- Lançar só em um idioma e traduzir depois — descartado em §13.
- Acessibilidade como etapa posterior — descartada em §13.

## Status

Aceito.
