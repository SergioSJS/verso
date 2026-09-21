# ADR 0017 — Plugins: formato familiar, shim separado, carga lazy e dogfooding

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §6, §16.1
- Status no briefing: `PROPOSTO`

## Contexto

Conjunto de propostas que cercam a decisão de execução
([0016](0016-plugins-execution-and-capabilities.md)) e respondem a dores
registradas: startup lento com muitos plugins e migração de quem já escreve
plugin de Obsidian.

## Decisão (proposta, não confirmada)

1. Formato familiar a quem escreve plugin de Obsidian (`manifest.json`,
   `main.js`, classe base com `onload`/`onunload`, registro de comandos e de
   settings), sem compatibilidade binária.
2. Shim de compatibilidade com plugins do Obsidian: pacote separado, fora do
   core, cobrindo só a API pública, com tabela de compatibilidade declarada.
3. Carregamento lazy por padrão e tempo de carga visível por plugin.
4. Flag de plataforma no manifesto, equivalente ao `isDesktopOnly`.
5. Features do próprio projeto (sync, Foundry, packs de RPG) são escritas como
   plugins; se precisarem de acesso privilegiado, a API está errada.
6. Plugin nativo em WASM dentro do core: possibilidade futura, não planejada.

## Consequências

- O shim só pode se apoiar na API pública (`obsidian.d.ts`, MIT) e em
  comportamento observado de fora ([0009](0009-external-constraints.md)).
- A tabela de compatibilidade declarada é o que evita a promessa que o projeto
  recusou fazer ([0002](0002-negative-scope.md)).
- Escrever as próprias features como plugins é o teste mais honesto da API, e
  também o mais caro: features de primeira parte ficam limitadas ao que a API
  expõe.
- Tempo de carga visível por plugin precisa de instrumentação no carregador
  desde o começo; medir depois é mais caro.
- Nada disso entra antes do fim da Fase 2 ([0034](0034-roadmap-in-phases.md)).

## Alternativas descartadas

- Shim dentro do core — descartado em §6: fica em pacote separado.
- API deliberadamente diferente da do Obsidian, sem familiaridade — descartada
  em §6.

## Status

Proposto.
