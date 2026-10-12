# ADR 0018 — LLM-nativo: servidor MCP no core, consulta estruturada, escrita revisada

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §7
- Status no briefing: `DECIDIDO`
- Revisões: 2026-10-12 — os registros provisórios de 2026-09-22 ratificados pelo
  mantenedor como construídos e testados, respondendo à auditoria dos
  ADRs em sessão: *"Ajuste tudo que precisar. Está aprovado os ADRs"*; uma
  nota datada ao lado de cada um.

## Contexto

Requisito declarado: um agente deve navegar e aproveitar o conteúdo da pasta tão
bem quanto uma pessoa. Isso é diferente de "ter IA": significa que a estrutura
que serve a pessoa é a mesma que serve o agente.

## Decisão

1. Servidor MCP no core, não em plugin: buscar, ler, caminhar o grafo, consultar
   por tipo.
2. Consulta estruturada (tipo, propriedades, relações) antes de busca por
   similaridade.
3. IDs de bloco permitem citação verificável, com link de volta à posição exata.
4. Escrita por agente: diff com revisão antes de aplicar, proveniência
   registrada, permissão declarada.
5. Endpoint de modelo trazido pelo usuário; nenhum modelo fixo.

## Consequências

- MCP no core implica que o contrato core↔UI e a superfície MCP compartilham as
  mesmas consultas ([0026](0026-core-ui-contract-inviolable-rules.md)).
- A Fase 1 entrega `verso mcp` somente leitura, sem UI: buscar, ler e caminhar
  o grafo ([0034](0034-roadmap-in-phases.md)). **Consultar por tipo** depende de
  nota tipada e do formato de schema (spec Q11), decididos só na Fase 2; entra
  no MCP quando a nota tipada entrar.
- Citação verificável tem duas formas: por `^id`, quando o bloco tem um escrito
  no arquivo; por **posição** (linha e coluna, na forma definida em
  `docs/spec/dialect.md` §4), quando não tem. Um ID que morasse só no índice
  não seria estável (o índice é cache,
  [0011](0011-config-outside-tree-index-as-cache.md)), e um ID escrito
  pelo app violaria "abrir nunca reescreve"
  ([0012](0012-files-are-source-of-truth.md)). Logo, o parser produz
  posições desde a Fase 1, e as fixtures as testam.
- O conteúdo da pasta é entrada não confiável para o agente (packs baixados,
  notas de jogadores, texto colado). O diff antes de aplicar é a mitigação
  registrada e não pode ser contornado
  ([0045](0045-server-and-mcp-security.md)).
- Transporte do MCP, superfície exposta e versão do protocolo suportada são
  `[ABERTO]` em [0045](0045-server-and-mcp-security.md), a decidir antes
  da feature 6 da Fase 1. *(Decididos para o `verso mcp` em 2026-09-22:
  stdio, sete ferramentas só de leitura, a versão que o `initialize`
  negocia — 0045.)*
- "Consulta estruturada antes de similaridade" define a ordem de implementação:
  índice e grafo antes de qualquer embedding.
- Escrita por agente cai sob a mesma regra de diff das conversões
  ([0012](0012-files-are-source-of-truth.md)).
- No mobile não há processo residente: o MCP é remoto ou in-process
  ([0009](0009-external-constraints.md)).

**A citação e o índice desatualizado como o código da feature 6 os implementa.
Registrado em 2026-09-22 a partir do código da feature 6 — provisório, o
mantenedor decide** (§3.4 e §6 de `docs/reference/mcp-decision.md`). É o que o
código faz, não uma decisão.
*(Ratificado pelo mantenedor em 2026-10-12, como construído e testado:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

- **O `read_note` devolve linhas numeradas.** Cada linha chega como
  `{ "n": 12, "text": "…" }`, então o número que um modelo cita é **lido do
  payload, não contado**. Ao lado delas vêm os títulos da nota e os blocos com
  `^id`, cada um com `line` e `col`, base 1, com `col` contando escalares
  Unicode (§4.4 de `docs/spec/dialect.md`). As duas formas de citação estão,
  portanto, numa resposta só: o `^id` quando o bloco tem um, a posição quando
  não tem.
- **Nenhum `^id` é inventado.** Nenhuma ferramenta propõe um id para um bloco
  que não tem, o que seria o app reescrever um arquivo na leitura
  ([0012](0012-files-are-source-of-truth.md)).
- **`stale: true`** quando o carimbo do arquivo — data de modificação, tamanho,
  hash — difere do que o índice guarda. É um booleano só, e diz ao modelo que as
  respostas de grafo que ele recebeu podem ser anteriores ao texto que está
  lendo, e que chamar o `index` resolve. Não há watcher na feature 6
  ([0044](0044-verso-fs-semantics.md)).
- **`unverified: true`** quando o índice guarda a nota apenas como última versão
  conhecida, porque um placeholder estava no lugar dela
  ([0043](0043-placeholder-guard.md)).
- **Um placeholder é erro, nunca texto vazio.** O `read_note` numa nota cujo
  conteúdo não foi baixado responde "conteúdo indisponível"; um modelo nunca
  recebe uma nota vazia que poderia ler como exclusão
  ([0043](0043-placeholder-guard.md)).
- **Não existe ferramenta de escrita na Fase 1**, então a mitigação de diff
  antes de aplicar, acima, não é exercitada, e nada do que o modelo lê pode
  causar uma escrita.

## Alternativas descartadas

- MCP como plugin — descartado explicitamente em §7.
- Busca por similaridade como caminho principal — descartada em §7, que a coloca
  depois da consulta estruturada.
- Modelo embutido ou provedor fixo — descartado em §1
  ([0002](0002-negative-scope.md)).

## Status

Aceito.
