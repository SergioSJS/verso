# ADR 0033 — Fluxo de PR

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §14.4
- Status no briefing: `DECIDIDO`

## Contexto

O PR é o ponto onde o mantenedor exerce autoridade sobre código que não
escreveu. Para isso, o PR precisa ser pequeno o bastante para ser entendido e
explicar por que existe.

## Decisão

1. PR pequeno, um assunto.
2. Template: O quê / Por quê / Alternativas descartadas / Como verificar /
   Conceito Rust usado (explicado para iniciante).
3. Se uma fixture parecer errada, o autor para e pergunta; nunca altera
   `expected.yaml`.
4. Dependência nova exige justificativa no PR.
5. Revisão independente classifica achados em BLOQUEANTE, IMPORTANTE ou MENOR.
6. Merge só com CI verde, sem BLOQUEANTE aberto, e se o mantenedor consegue
   explicar o PR com as próprias palavras.

## Consequências

- A seção "Conceito Rust usado" é parte do valor do PR, não burocracia: é o
  canal pelo qual o mantenedor aprende o código que está aprovando
  ([0032](0032-author-and-reviewer-roles.md)).
- "O mantenedor consegue explicar com as próprias palavras" é um portão
  subjetivo e deliberado: um PR incompreensível é um PR grande demais, mesmo com
  CI verde.
- O template vive em `.github/pull_request_template.md`.
- Justificar dependência nova conecta o PR ao `cargo-deny`
  ([0029](0029-guardrails-in-ci.md)).
- A proibição de alterar `expected.yaml` é replicada em `CLAUDE.md`
  ([0031](0031-fixtures-as-contract.md)).

## Alternativas descartadas

- PR grande com vários assuntos — descartado em §14.4.
- Merge com BLOQUEANTE aberto ou CI vermelho — descartado em §14.4.

## Status

Aceito.
