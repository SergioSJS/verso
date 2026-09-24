# ADR 0033 — Fluxo de PR

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §14.4
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-24 — como um pull request chega à `main`, é mesclado e
  entra numa versão: [0051](0051-development-flow-and-releases.md).
  2026-09-24 — a decisão 1 suspensa pelo mantenedor até o fluxo inteiro
  existir — sync, a web, mobile: até lá o trabalho vai em pull requests
  grandes, e os pull requests pequenos, de um assunto, voltam depois dele
  (Consequências, com as palavras do mantenedor).

## Contexto

O PR é o ponto onde o mantenedor exerce autoridade sobre código que não
escreveu. Para isso, o PR precisa ser pequeno o bastante para ser entendido e
explicar por que existe.

## Decisão

1. PR pequeno, um assunto. *(Até o fluxo inteiro existir — sync, a web,
   mobile — o trabalho vai em pull requests grandes, por decisão do mantenedor
   de 2026-09-24; pull requests pequenos, de um assunto, depois dele:
   Consequências.)*
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

**Desde 2026-09-24** ([0051](0051-development-flow-and-releases.md)): a
`main` é protegida e só recebe pull requests; uma branch guarda um assunto; o
mantenedor faz o merge com um merge commit, que guarda os hashes que os
documentos citam; uma mudança que o usuário vê acrescenta a sua linha no
changelog, nas duas línguas.

**O tamanho de um pull request, a partir de 2026-09-24.** Diante do plano do
autor de levar o trabalho do dia em vários pull requests, o mantenedor
respondeu, na sessão: *"Tirando o plano de fazer vários PR, eu gosto das suas
recomendações"*; e, sobre pull requests: *"Quando a gente tiver todo o fluxo
completo com sync, web, mobile, etc fará sentido pra menores"*. Então, até o
fluxo inteiro existir — sync, a web, mobile —, o trabalho vai em pull
requests grandes, e ninguém pede que um seja partido em pequenos; quando ele
existir, a decisão 1 volta a valer. Uma branch pode levar vários assuntos até
lá ([0051](0051-development-flow-and-releases.md), Decisão 2). Nada mais aqui
muda: o template, a parada diante de uma fixture que parece errada, a
justificativa de uma dependência nova, os três níveis de achados e as três
condições de merge — o mantenedor ainda precisa conseguir explicar o pull
request com as próprias palavras.

## Alternativas descartadas

- PR grande com vários assuntos — descartado em §14.4. *(Retomado pelo
  mantenedor em 2026-09-24 até o fluxo inteiro existir: Consequências.)*
- Vários pull requests menores para o trabalho de 2026-09-24 — o plano do
  autor, posto de lado pelo mantenedor no mesmo dia (Consequências).
- Merge com BLOQUEANTE aberto ou CI vermelho — descartado em §14.4.

## Status

Aceito.
