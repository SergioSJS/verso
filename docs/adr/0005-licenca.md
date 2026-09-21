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

Critério de desempate registrado: a MPL-2.0 lista a AGPL-3.0 como licença
secundária, então ir de A para B depois é possível; de B para A exige
consentimento de todo contribuinte.

## Decisão

Nenhuma. A preferência atual do mantenedor é o pacote A, sem confirmação. A
decisão cabe ao mantenedor no Passo 5 do roteiro, antes do esqueleto andante.

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

`[ABERTO]`. Decidir no Passo 5, antes do esqueleto.
