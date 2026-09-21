# ADR 0016 — Plugins: TypeScript em Web Worker, sem disco, com capabilities declaradas

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §6, §10.1
- Status no briefing: `DECIDIDO`

## Contexto

O sistema de plugins é central ao projeto: é o que permite que a comunidade
evolua o Verso sem depender do mantenedor. Também é a terceira decisão cara de
reverter (§10.4): depois que existirem plugins, a API não muda de graça.

## Decisão

1. O sistema de plugins é próprio e central ao projeto.
2. Plugins são escritos em TypeScript e executam em Web Worker, sem acesso
   direto a disco; todo acesso passa pelo core.
3. O manifesto declara as capabilities exigidas (ex.: `vault:read`,
   `vault:write`, `net:fetch`, `fs:external`), com consentimento na instalação.

## Consequências

- Nenhuma API de plugin pode expor caminho de filesystem; o acesso é mediado por
  handles opacos do core ([0026](0026-core-ui-contract-inviolable-rules.md)).
- O Web Worker impõe assincronia: a API de plugin é assíncrona por construção,
  o que diverge da API do Obsidian e alimenta o risco registrado em §10.3.
- Consentimento na instalação exige que as capabilities sejam legíveis por quem
  instala, não só por quem programa.
- Um plugin que precise de acesso privilegiado é sinal de que a API está errada
  ([0017](0017-plugins-format-shim-loading.md)).
- Plugins ficam fora de escopo até o fim da Fase 2
  ([0034](0034-roadmap-in-phases.md)); a API não deve ser congelada antes disso.
- Esta decisão foi tomada sem registro de como um plugin em Web Worker, sem DOM,
  contribui UI — que é o que a maior parte dos plugins faz — nem de como um
  transporte de sync roda em background em mobile. As questões que precisam de
  resposta antes de a API ser desenhada estão em
  [0047](0047-plugin-api-open-questions.md), `[ABERTO]`. Este ADR
  continua Aceito; se alguma resposta o contradisser, um ADR novo o supersede.

## Alternativas descartadas

- Plugin com acesso direto a disco — descartado em §6 e §10.1 (regra 6).
- Compatibilidade binária com plugins do Obsidian — descartada em §1 e §6
  ([0002](0002-negative-scope.md)).

## Status

Aceito.
