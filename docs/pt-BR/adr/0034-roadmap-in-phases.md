# ADR 0034 — Roadmap em três fases com portões de saída verificáveis

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §15, §10.3
- Status no briefing: `DECIDIDO`
- Revisões: 2026-10-01 — o board saiu da lista do ponto 4 em 2026-09-30, pela
  decisão do mantenedor registrada no [0057](0057-board-json-canvas.md),
  ponto 1; este ADR aponta para lá desde a decisão do mantenedor de
  2026-10-01 sobre a revisão crítica
  [`docs/review/board.md`](../review/board.md), §6 item 16.
  2026-10-09 — uma Fase 3 acrescentada pelo
  [0073](0073-self-hosted-server-first.md), aceito pelo mantenedor naquele
  dia; o texto abaixo fica como foi decidido. Fase 3: o app de Linux
  ([0071](0071-linux-port.md), lançado na 0.6.0-beta.1), depois o servidor
  auto-hospedado, cuja primeira versão traz as contas e os papéis, o
  contrato pelo fio, o app desktop conectando, a janela num navegador e em
  toda tela ([0076](0076-the-window-on-every-screen.md)) e a edição
  simultânea de notas; depois dela, sync para as pastas locais do desktop,
  a PWA offline, o bucket do usuário e mobile nativo se preciso (0073 item
  12). A lista do ponto 4: sync e mobile saem dela, na forma que o 0073 lhes
  dá — mobile pelo navegador, servido pelo servidor; sync depois do
  servidor e por ele; plugins e o shim de compatibilidade continuam fora.
  O critério de saída da Fase 3 não está definido (`[ABERTO]`, no roadmap).
  *(Decidido pelo mantenedor em 2026-10-10: a fase termina quando nenhuma
  tarefa dela está pendente e o mantenedor a declara encerrada — a Fase 3
  do roadmap.)*

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
   compatibilidade. *(O board saiu desta lista em 2026-09-30:
   [0057](0057-board-json-canvas.md), ponto 1.)*

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

Aceito. O ponto 4 estreitado pelo [0057](0057-board-json-canvas.md) em
2026-09-30: o board está na Fase 2. Revisto em 2026-10-09 pelo
[0073](0073-self-hosted-server-first.md): uma Fase 3, e sync e mobile fora
da lista do ponto 4 (Revisões).
