# ADR 0045 — Segurança do servidor, do MCP e do contrato

- Data: 2026-09-21
- Fonte: `docs/review/fase0.md` R4, R5, I5
- Status no briefing: não consta; [0025](0025-servidor-proprio-e-mobile-pwa.md)
  registra "autenticação e exposição" como questão a abrir

## Contexto

Três decisões já tomadas expõem a pasta pela rede ou a um processo externo: o
servidor MCP no core ([0018](0018-llm-nativo-mcp-no-core.md), Aceito), o
contrato core↔UI que viaja por WebSocket remoto
([0026](0026-contrato-core-ui-regras-inviolaveis.md), Aceito) e o servidor
próprio `verso serve` ([0025](0025-servidor-proprio-e-mobile-pwa.md), Proposto).
Nenhuma delas diz quem pode conectar, como se identifica, nem o que pode fazer.

O risco não é implementar autenticação agora. É desenhar na Fase 2 um contrato
que não a comporta e ter que refazê-lo quando o servidor chegar.

## Decisão

Nenhuma. Questões registradas, com o momento de decidir.

### `verso mcp` — decidir antes da feature 6 da Fase 1

- **Transporte:** stdio (processo filho do cliente, sem porta) ou HTTP/SSE em
  porta local. Se for porta: bind só em `localhost`, verificação de `Origin`,
  proteção contra DNS rebinding e token por sessão são o mínimo conhecido
  publicamente para servidores MCP locais.
- **Superfície:** "somente leitura" ainda entrega a pasta inteira, inclusive o
  que a visão de jogador (spec Q9) vai querer esconder, a qualquer cliente que
  conecte. Se o MCP respeita visibilidade por bloco quando ela existir.
- **Versão do protocolo:** qual versão da especificação MCP é suportada e o que
  acontece quando ela muda (a especificação já trocou de transporte e de modelo
  de autorização mais de uma vez).

### Contrato core↔UI — decidir antes do item 2.1 da Fase 2

- O contrato precisa ter, desde o primeiro desenho, identidade de sessão,
  autorização por operação e noção de "quem está do outro lado", mesmo que no
  IPC local tudo seja concedido. Adicionar depois é refazer.

### `verso serve` — decidir antes de entrar em escopo

- Autenticação, TLS, exposição fora da máquina, multiusuário ou não.

## Consequências

- **Risco a registrar em §10.3:** o conteúdo da pasta é entrada não confiável
  para o agente. Packs de schema baixados, notas compartilhadas por jogadores e
  material colado da web podem conter instruções ao modelo. A mitigação já
  decidida — diff antes de aplicar qualquer escrita por agente
  ([0018](0018-llm-nativo-mcp-no-core.md)) — passa a ser registrada como
  mitigação deste risco, e nenhuma escrita por agente pode contornar o diff por
  "conveniência".
- A escolha de transporte do MCP na Fase 1 é reversível; a forma do contrato na
  Fase 2 não é barata de reverter.

## Alternativas descartadas

Nenhuma registrada.

## Status

`[ABERTO]`. MCP: antes da feature 6 da Fase 1. Contrato: antes do item 2.1 da
Fase 2. Servidor: antes de entrar em escopo.
