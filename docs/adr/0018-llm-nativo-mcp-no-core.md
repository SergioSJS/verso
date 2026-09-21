# ADR 0018 — LLM-nativo: servidor MCP no core, consulta estruturada, escrita revisada

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §7
- Status no briefing: `DECIDIDO`

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
  mesmas consultas ([0026](0026-contrato-core-ui-regras-inviolaveis.md)).
- A Fase 1 entrega `verso mcp` somente leitura, sem UI: buscar, ler e caminhar
  o grafo ([0034](0034-roadmap-em-fases.md)). **Consultar por tipo** depende de
  nota tipada e do formato de schema (spec Q11), decididos só na Fase 2; entra
  no MCP quando a nota tipada entrar.
- Citação verificável tem duas formas: por `^id`, quando o bloco tem um escrito
  no arquivo; por **posição** (linha e coluna, na forma definida em
  `docs/spec/dialeto.md` §4), quando não tem. Um ID que morasse só no índice
  não seria estável (o índice é cache,
  [0011](0011-config-fora-da-arvore-indice-como-cache.md)), e um ID escrito
  pelo app violaria "abrir nunca reescreve"
  ([0012](0012-arquivos-sao-fonte-de-verdade.md)). Logo, o parser produz
  posições desde a Fase 1, e as fixtures as testam.
- O conteúdo da pasta é entrada não confiável para o agente (packs baixados,
  notas de jogadores, texto colado). O diff antes de aplicar é a mitigação
  registrada e não pode ser contornado
  ([0045](0045-seguranca-do-servidor-e-do-mcp.md)).
- Transporte do MCP, superfície exposta e versão do protocolo suportada são
  `[ABERTO]` em [0045](0045-seguranca-do-servidor-e-do-mcp.md), a decidir antes
  da feature 6 da Fase 1.
- "Consulta estruturada antes de similaridade" define a ordem de implementação:
  índice e grafo antes de qualquer embedding.
- Escrita por agente cai sob a mesma regra de diff das conversões
  ([0012](0012-arquivos-sao-fonte-de-verdade.md)).
- No mobile não há processo residente: o MCP é remoto ou in-process
  ([0009](0009-restricoes-externas.md)).

## Alternativas descartadas

- MCP como plugin — descartado explicitamente em §7.
- Busca por similaridade como caminho principal — descartada em §7, que a coloca
  depois da consulta estruturada.
- Modelo embutido ou provedor fixo — descartado em §1
  ([0002](0002-escopo-negativo.md)).

## Status

Aceito.
