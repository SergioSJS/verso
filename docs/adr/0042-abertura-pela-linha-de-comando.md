# ADR 0042 — Abrir pela linha de comando: `verso <pasta>`

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.1
- Status no briefing: `DECIDIDO`

## Contexto

Se a pasta é a unidade e o Verso abre qualquer pasta como um editor de código
abre ([0010](0010-pasta-e-a-unidade-sem-vault.md)), o gesto de abrir também
precisa ser o de um editor de código: do terminal, onde a pessoa já está.

## Decisão

O Verso abre pela linha de comando, no modelo do `code .`: `verso <pasta>`.

## Consequências

- Exige um executável no `PATH` e uma forma de instalá-lo; como isso é feito em
  cada plataforma, o briefing não diz.
- Colide com o espaço de subcomandos já previsto para o `verso-cli` — `verso
  index`, `verso search`, `verso backlinks`, `verso mcp`
  ([0028](0028-estrutura-de-crates.md), Aceito) e `verso serve`
  ([0025](0025-servidor-proprio-e-mobile-pwa.md), Proposto). `verso <pasta>` significa que o
  primeiro argumento é um caminho quando não casa com um subcomando conhecido.
  Uma pasta chamada `index` ou `search` é o caso ambíguo, e a regra de
  desambiguação é `[ABERTO]`.
- Abrir a UI a partir da CLI só é possível quando existe UI, ou seja, a partir da
  Fase 2 ([0034](0034-roadmap-em-fases.md)). Na Fase 1 o binário é só CLI. Em
  que fase o comando de abertura entra, o briefing não diz: `[ABERTO]`.
- O `verso-cli` já aparece na Fase 1, então os subcomandos nascem antes do
  comando de abertura; a regra de desambiguação precisa ser decidida antes de o
  conjunto de subcomandos crescer.
- Com workspace multi-raiz ([0041](0041-workspace-multi-raiz.md), `PROPOSTO`),
  abrir várias pastas de uma vez é a extensão natural. Não está decidido.

## Alternativas descartadas

Nenhuma registrada no briefing.

## Status

Aceito.
