# ADR 0007 — Repositório privado até a licença ser decidida

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §3
- Status no briefing: `DECIDIDO`

## Contexto

Código publicado sem licença não é código aberto: sem licença, ninguém tem
permissão de uso. Publicar antes de decidir também abre a porta para
contribuições que depois precisariam consentir com uma relicenciamento.

## Decisão

O repositório permanece privado até a licença ser decidida.

## Consequências

- Nenhuma contribuição externa antes da decisão de licença
  ([0005](0005-license.md), [0006](0006-contribution-dco-no-cla.md)).
- A verificação de disponibilidade do nome em crates.io, npm, org do GitHub e
  domínio precisa acontecer antes de tornar o repositório público
  ([0004](0004-project-name-verso.md)).
- Publicação e primeira release são eventos distintos: o repositório pode abrir
  antes de existir release.

## Alternativas descartadas

Nenhuma registrada. (Publicar cedo e licenciar depois não foi avaliado; §3 já
condiciona a visibilidade à decisão de licença.)

## Status

Aceito.
