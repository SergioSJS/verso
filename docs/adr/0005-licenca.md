# ADR 0005 — Licença do projeto

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §3, §10.4, §17 item 1
- Status no briefing: `ABERTO` até 2026-09-21; `DECIDIDO` a partir do commit
  que adiciona `LICENSE`
- Revisões: 2026-09-21 — `[ABERTO]` fechado pelo mantenedor (Pacote A). A
  seção Decisão e o Status foram preenchidos no lugar, conforme
  `docs/adr/README.md`, "Como alterar um ADR existente".

## Contexto

A arquitetura prevê um servidor (`verso serve`) e um cliente web, o que torna o
uso via rede provável. A licença é uma das três decisões caras de reverter
(§10.4), junto com o dialeto e a API de plugin: depois que houver contribuições
de terceiros, mudar exige consentimento.

O briefing registra dois pacotes:

| Pacote | Core e app | SDK de plugin | Uso via rede |
|---|---|---|---|
| A | MPL-2.0 | MIT | não obriga publicar mudanças |
| B | AGPL-3.0 com exceção explícita para plugins (permissão adicional, GPL-3.0 seção 7) | MIT | coberto |

Critério de desempate registrado no briefing: a MPL-2.0 lista a AGPL-3.0 como
licença secundária, então ir de A para B depois seria possível; de B para A
exige consentimento de todo contribuinte. **Esse critério está mais forte do que
a licença sustenta**: a cláusula 3.3 da MPL-2.0 permite distribuir uma obra
maior sob licença secundária, mas os arquivos MPL continuam MPL. Relicenciar o
projeto inteiro continua exigindo consentimento nos dois sentidos; o que a MPL
dá é a possibilidade de **combinar** com código AGPL depois.

### Análises levantadas antes da decisão

Levantadas na revisão da Fase 0 (I1). Estado de cada uma na data da decisão
está na seção Decisão.

1. **iOS e App Store.** iOS é plataforma-alvo decidida
   ([0022](0022-plataformas-alvo-e-macos-primeiro.md)). Distribuição de código
   sob (A)GPL pela App Store é amplamente considerada incompatível com os termos
   da loja, salvo quando quem publica detém todo o copyright — o que DCO sem CLA
   ([0006](0006-contribuicao-dco-sem-cla.md)) impede assim que houver
   contribuição externa. Pacote B + DCO + iOS precisa de análise antes de ser
   escolhido.
2. **Código escrito por IA e copyleft.** Todo o core será escrito por modelo
   ([0032](0032-papeis-autor-e-revisor.md)). O status de copyright de código
   gerado por IA é indefinido em várias jurisdições, e copyleft depende de
   copyright para ser exigível. O DCO pede que quem assina certifique origem e
   direito de submeter. Não é decisão de engenharia: é pergunta para quem
   entende de direito autoral, antes de fechar a licença.
3. **Allowlist do `cargo-deny`.** Cada pacote implica uma allowlist diferente
   de licenças de dependência; a provisória de [0029](0029-guardrails-no-ci.md)
   precisa ser fechada no mesmo PR da decisão.

## Decisão

**Pacote A**, decidido pelo mantenedor em 2026-09-21:

1. Core e app sob **MPL-2.0**. O texto está em `LICENSE` na raiz, obtido de
   `gh api licenses/mpl-2.0`.
2. SDK de plugin sob **MIT**, com `LICENSE-MIT` no pacote do SDK quando ele
   existir (depois da Fase 2).
3. Nenhum arquivo do projeto usa o aviso do Exhibit B ("Incompatible With
   Secondary Licenses"). É esse aviso que fecharia a porta para combinar com
   AGPL depois; deixá-lo fora é o que preserva o critério de desempate.
4. Cabeçalho de arquivo: o Exhibit A da MPL-2.0, nos arquivos `.rs` e `.ts`
   do core e do app, a partir do primeiro arquivo de código (item 0.10).

Estado das três análises na data da decisão:

| Análise | Estado |
|---|---|
| iOS e App Store | Favorece A: MPL não tem o conflito conhecido da (A)GPL com os termos da loja, e não depende de o mantenedor deter todo o copyright. Foi peso decisivo |
| Código escrito por IA e copyleft | Respondida pelo mantenedor em [0006](0006-contribuicao-dco-sem-cla.md), item 2: código escrito por IA entra pelo DCO comum, e é aceito desde que quem assina tenha domínio do código e se responsabilize por ele. Afeta A e B igualmente, então não muda a escolha. A recomendação de consultar alguém de propriedade intelectual antes de abrir o repositório ([0007](0007-repositorio-privado-ate-licenca.md)) continua, como cautela, não como bloqueio |
| Allowlist do `cargo-deny` | Fecha no PR do workspace (item 0.10): MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, MPL-2.0, Unicode-3.0 e CC0-1.0 são compatíveis; GPL, LGPL e AGPL ficam fora, e qualquer outra entra só com justificativa no PR |

## Consequências

- O repositório pode sair de privado quando idioma ([0008](0008-idioma-da-documentacao.md))
  e disponibilidade do nome ([0004](0004-nome-do-projeto-verso.md)) estiverem
  resolvidos ([0007](0007-repositorio-privado-ate-licenca.md)).
- A allowlist do `cargo-deny` deixa de ser provisória no PR do item 0.10
  ([0029](0029-guardrails-no-ci.md)).
- O critério de saída 2 da Fase 0 (`LICENSE` presente) está satisfeito
  ([0034](0034-roadmap-em-fases.md)).
- Contribuição externa passa a ter base legal; o modelo de contribuição (DCO
  sem CLA, [0006](0006-contribuicao-dco-sem-cla.md)) foi confirmado no mesmo
  dia.
- Ir de A para B continua sendo o caminho possível (combinar numa obra maior
  sob AGPL), nunca o inverso.

## Alternativas descartadas

- GPL-3.0 pura — descartada em §3: não cobre uso via rede, que a arquitetura com
  servidor torna provável.

## Status

Aceito. Pacote A: MPL-2.0 no core e app, MIT no SDK de plugin. Decidido pelo
mantenedor em 2026-09-21, no commit que adiciona `LICENSE`.
