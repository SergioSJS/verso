# ADR 0012 — Arquivos são a fonte de verdade; abrir nunca reescreve

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.2
- Status no briefing: `DECIDIDO`

## Contexto

Perda de dados é o risco mais caro do projeto (§10.3). A confiança em um app de
notas se perde na primeira vez que ele mexe em um arquivo sem ser mandado.

## Decisão

1. Compatibilidade com vaults do Obsidian, ou conversão explícita onde não
   houver compatibilidade.
2. Abrir um arquivo nunca o reescreve.
3. Conversão só por ação do usuário, com diff visível.

## Consequências

- O parser precisa preservar o que não entende: round-trip vira property test
  obrigatório ([0029](0029-guardrails-no-ci.md)).
- Normalização silenciosa de qualquer tipo (quebras de linha, ordem de chaves do
  frontmatter, espaçamento) é proibida no caminho de abertura.
- Toda conversão precisa de tela de diff antes de aplicar, inclusive as
  conversões propostas em `docs/spec/dialeto.md`.
- Escrita por agente entra na mesma regra: diff antes de aplicar
  ([0018](0018-llm-nativo-mcp-no-core.md)).

## Alternativas descartadas

- Migração automática ao abrir — incompatível com a decisão, por §5.2.

## Status

Aceito.
