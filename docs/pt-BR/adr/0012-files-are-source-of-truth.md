# ADR 0012 — Arquivos são a fonte de verdade; abrir nunca reescreve

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.2
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-22 — o que a verificação de modificação concorrente compara
  no código da feature 2 (tempo, tamanho e hash de conteúdo), registrado como
  provisório.

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
  obrigatório ([0029](0029-guardrails-in-ci.md)).
- Normalização silenciosa de qualquer tipo (quebras de linha, ordem de chaves do
  frontmatter, espaçamento) é proibida no caminho de abertura.
- Toda conversão precisa de tela de diff antes de aplicar, inclusive as
  conversões propostas em `docs/spec/dialect.md`.
- Escrita por agente entra na mesma regra: diff antes de aplicar
  ([0018](0018-llm-native-mcp-in-core.md)).
- **Modificação externa concorrente.** A mesma pasta pode estar aberta no
  Obsidian ou em outro editor. Toda escrita do Verso verifica que o arquivo em
  disco é o mesmo que foi lido (mtime e tamanho, ou hash); se mudou, a escrita
  não acontece sem mostrar o diff entre o que está em disco e o que seria
  gravado. Gravar por cima de edição alheia é reescrever sem ação do usuário,
  e é a forma mais comum de perder dado com dois apps na mesma pasta. Vale para
  UI ([0048](0048-file-operations-in-ui.md)), agente e conversão.
  (Acrescentado na revisão da Fase 0, R2.)
- **O que a verificação compara, registrado em 2026-09-22 a partir do código da
  feature 2 e provisório — o mantenedor decide ao acordar.** A regra acima diz
  "mtime e tamanho, ou hash"; o código faz os dois. O stamp que uma leitura
  devolve carrega o tempo de modificação, o tamanho **e** um hash de conteúdo
  (FNV-1a), e a escrita relê o arquivo e compara os três antes de substituí-lo.
  O motivo é um caso reproduzido na leitura do código: uma reescrita do mesmo
  tamanho que preserva o tempo de modificação — `cp -p`, `rsync`, restauração de
  backup, alguns clientes de sync — passa por uma verificação feita só de tempo
  e tamanho, e a escrita então cai por cima da edição alheia, que é exatamente o
  que esta regra existe para impedir. O custo é uma leitura inteira do arquivo
  a mais por escrita, já que a escrita o relê para comparar. O FNV-1a é
  adequado contra acidente, que é do que esta regra trata, e não contra um
  adversário que escolhe os bytes: quem consegue forjar uma colisão já consegue
  escrever dentro do vault, e a invariante 11 pressupõe um sistema de arquivos
  honesto por baixo.
- "Round-trip" tinha duas leituras possíveis, e elas escolhiam parsers
  diferentes. O mantenedor decidiu `docs/spec/dialect.md` Q18 em 2026-09-21:
  leitura (b), parser somente leitura com property test de round-trip de
  quatro propriedades; o parser base vem em [0037](0037-base-parser.md). A
  comparação está em `docs/reference/parser-decision.md`.

## Alternativas descartadas

- Migração automática ao abrir — incompatível com a decisão, por §5.2.

## Status

Aceito.
