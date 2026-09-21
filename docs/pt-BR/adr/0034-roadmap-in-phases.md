# ADR 0034 — Roadmap em três fases com portões de saída verificáveis

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §15, §10.3
- Status no briefing: `DECIDIDO`

## Contexto

Escopo e burnout são risco declarado. A mitigação registrada é núcleo pequeno,
features como plugins e um portão de um mês de uso real antes de seguir.

## Decisão

1. **Fase 0 — Fundação**: ADRs, spec do dialeto v0, corpus inicial de fixtures,
   `CLAUDE.md`, template de PR; revisão crítica; decisão de licença; workspace e
   CI com todos os guardrails, sem nenhuma feature.
2. **Fase 1 — Core via CLI, sem UI**: `verso-dialect`, `verso-fs`, `verso-index`,
   `verso-cli`, bench, `verso mcp` somente leitura.
3. **Fase 2 — Esqueleto andante no macOS**: Tauri + CM6, contrato com tipos
   gerados, um tipo de nota ponta a ponta.
4. Fora de escopo até o fim da Fase 2: sync, mobile, plugins, board e shim de
   compatibilidade.

Os critérios de saída estão em `docs/roadmap.md`.

## Consequências

- Fase 1 inteira sem UI: o core precisa ser utilizável pela CLI antes de existir
  janela.
- O portão da Fase 2 é uso real, não checklist de features: um mês de preparação
  de mesa usando o próprio app.
- Nenhuma decisão de plugin, sync ou board precisa ser fechada agora, o que
  mantém os ADRs `PROPOSTO` correspondentes sem pressa.
- A Fase 0 depende de uma decisão que não é técnica ([0005](0005-license.md)):
  sem `LICENSE`, a fase não fecha.

## Alternativas descartadas

- Começar pela UI — descartado pela ordem das fases em §15.
- Incluir sync, mobile, plugins ou board antes do fim da Fase 2 — descartado em
  §15.

## Status

Aceito.
