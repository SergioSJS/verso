# ADR 0005 — Licença do projeto

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §3, §10.4, §17 item 1
- Status no briefing: `ABERTO`

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

### Análises pendentes antes da decisão

Levantadas na revisão da Fase 0 (I1). Nenhuma está respondida; a decisão não sai
sem elas.

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

Nenhuma. A preferência atual do mantenedor é o pacote A, sem confirmação. A
decisão cabe ao mantenedor antes do fechamento da Fase 0
([0034](0034-roadmap-em-fases.md), critério de saída 2).

## Consequências

- O repositório fica privado até a licença ser decidida
  ([0007](0007-repositorio-privado-ate-licenca.md)).
- A allowlist de licenças do `cargo-deny` depende da escolha e só pode ser
  fechada depois ([0029](0029-guardrails-no-ci.md)).
- A Fase 0 não fecha sem um arquivo `LICENSE` presente
  ([0034](0034-roadmap-em-fases.md)).
- Enquanto `[ABERTO]`, nenhuma contribuição externa deve ser aceita: aceitar
  contribuição antes da licença aumenta o custo de qualquer mudança futura.

## Alternativas descartadas

- GPL-3.0 pura — descartada em §3: não cobre uso via rede, que a arquitetura com
  servidor torna provável.

## Status

`[ABERTO]`. Decidir antes do fechamento da Fase 0, com as três análises acima
respondidas.
