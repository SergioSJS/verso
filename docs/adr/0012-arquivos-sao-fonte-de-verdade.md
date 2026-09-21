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
- **Modificação externa concorrente.** A mesma pasta pode estar aberta no
  Obsidian ou em outro editor. Toda escrita do Verso verifica que o arquivo em
  disco é o mesmo que foi lido (mtime e tamanho, ou hash); se mudou, a escrita
  não acontece sem mostrar o diff entre o que está em disco e o que seria
  gravado. Gravar por cima de edição alheia é reescrever sem ação do usuário,
  e é a forma mais comum de perder dado com dois apps na mesma pasta. Vale para
  UI ([0048](0048-operacoes-de-arquivo-na-ui.md)), agente e conversão.
  (Acrescentado na revisão da Fase 0, R2.)
- "Round-trip" tem duas leituras possíveis, e elas escolhem parsers diferentes;
  qual delas vale é `docs/spec/dialeto.md` Q18, a decidir no PR da feature 1 da
  Fase 1 junto com [0037](0037-parser-base.md).

## Alternativas descartadas

- Migração automática ao abrir — incompatível com a decisão, por §5.2.

## Status

Aceito.
