# ADR 0047 — Questões abertas da API de plugin

- Data: 2026-09-21
- Fonte: `docs/review/phase-0.md` R7, I2
- Status no briefing: não consta; cerca [0016](0016-plugins-execution-and-capabilities.md) (Aceito) e [0017](0017-plugins-format-shim-loading.md) (Proposto)

## Contexto

A API de plugin é uma das três decisões caras de reverter (§10.4). O que já
está Aceito — TypeScript em Web Worker, sem disco, capabilities declaradas com
consentimento na instalação — foi decidido sem registro de como resolve os
problemas abaixo. Plugins estão fora de escopo até o fim da Fase 2; este ADR
existe para que as perguntas cheguem ao desenho da API, e não depois dele.

## Decisão

Nenhuma. Questões registradas, a responder antes de desenhar a API.

### Modelo de UI

- Web Worker não tem DOM. Um plugin em worker não registra view, modal,
  extensão de CodeMirror, painel lateral nem ícone — e a maior parte dos plugins
  do Obsidian existe para fazer exatamente isso.
- Caminhos conhecidos: UI declarativa por mensagem, iframe com sandbox,
  extensões de CM6 carregadas na thread principal (o que quebra "sem acesso
  direto" e exige outra fronteira de confiança). Cada um tem custo próprio; o
  modelo de plugin do Figma é a referência mais estudada e é caro.
- "Formato familiar a quem escreve plugin de Obsidian" ([0017](0017-plugins-format-shim-loading.md))
  só é familiar no `manifest.json` se a API for assíncrona e sem DOM.

### Background e mobile

- Transportes de sync como plugin ([0020](0020-sync-merge-in-core-transports-as-plugins.md),
  Aceito) precisam rodar em background. Worker em WebView de mobile não roda em
  background ([0009](0009-external-constraints.md)).

### Modelo de capabilities

- `vault:read` + `net:fetch` é exfiltração completa da pasta; `proc:spawn` está
  fora de qualquer sandbox. O consentimento precisa dizer isso em linguagem de
  quem instala.
- Consentimento só na instalação é o modelo fraco conhecido: falta revogação,
  consentimento em runtime para capabilities perigosas, e novo consentimento
  quando uma atualização pede capability nova.
- Dois vocabulários — permissão (`vault:read`) e plataforma (`fs:watch`) — já
  notados em [0027](0027-runtime-capabilities.md): um namespace ou dois.
- Integridade e origem: assinatura, hash, canal de distribuição.

### Packs de schema

- "Instalar um pack não executa código" ([0015](0015-schema-packs.md)) só é
  verdade se schema não tiver templates, expressões ou consultas. Views
  materializáveis ([0014](0014-primitives-catalog.md)) sugerem que terá.
  Onde passa a linha entre conteúdo e código.

## Consequências

- [0016](0016-plugins-execution-and-capabilities.md) continua Aceito; este ADR não
  o reabre. Ele diz o que precisa estar respondido para que a API possa ser
  desenhada sem contradizê-lo.
- Se alguma resposta exigir mudar [0016](0016-plugins-execution-and-capabilities.md),
  isso é um ADR novo que o supersede, decidido pelo mantenedor.

## Alternativas descartadas

Nenhuma registrada.

## Status

`[ABERTO]`. Responder antes de desenhar a API de plugin (depois da Fase 2).
