<!--
Até o fluxo inteiro existir (sync, web, mobile), um PR grande serve — decisão
do mantenedor de 2026-09-24 (ADR 0033, ADR 0051); pequeno, de um assunto,
depois dele.
As cinco seções abaixo são obrigatórias (ADR 0033). Nenhuma delas é formalidade:
o mantenedor só aprova o que consegue explicar com as próprias palavras.
-->

## O quê

<!-- O que este PR faz, em duas ou três frases. Comportamento, não implementação. -->

## Por quê

<!--
Por que este PR existe. Qual decisão ele executa: linkar o ADR, a seção do
briefing ou a questão da spec.

Se a decisão necessária estava `PROPOSTO` ou `[ABERTO]`, este PR não deveria
existir: pare e pergunte ao mantenedor.
-->

- ADR / seção: <!-- ex.: adr/0030-...md, BRIEFING §11.1 -->
- Fase do roadmap: <!-- 0, 1 ou 2 — e por que cabe nela -->

## Alternativas descartadas

<!--
O que mais foi considerado e por que não foi escolhido. Uma linha por
alternativa.

Se nenhuma alternativa foi considerada de verdade, escreva "Nenhuma
considerada" — não invente para preencher a seção.
-->

## Como verificar

<!--
Passo a passo que o mantenedor executa sem ler o código: comandos, saída
esperada, fixture que cobre o caso.

Se a única forma de verificar é ler o diff, o PR está incompleto.
-->

```
# comandos
```

## Conceito Rust usado

<!--
Explicado para quem está aprendendo Rust, fora do projeto.

Nomeie o conceito (ownership, borrow, lifetime, trait, enum com dado, Result,
iterador, `?`, tipo newtype...), diga por que ele apareceu aqui, e o que
aconteceria sem ele. Um parágrafo curto e um trecho de código do próprio PR.

PR que não toca em Rust: escreva "Não se aplica" e diga por quê.
-->

---

## Antes de pedir revisão

- [ ] Um assunto só (a partir de quando o fluxo inteiro existir; até lá, os assuntos vão listados em O quê).
- [ ] CI verde: `cargo fmt --check`, `cargo clippy`, `cargo test`, `cargo deny check`.
- [ ] Nenhum `#[allow]` novo para calar guardrail. Se um guardrail bloqueia trabalho legítimo, isso é PR próprio, com justificativa (`CLAUDE.md` §3) — não `#[allow]` neste diff.
- [ ] Guardrail de feature (fuzz, round-trip, escrita atômica, confinamento, FTS5, benchmark), se este PR o introduz, foi visto falhando antes de passar (ADR 0029).
- [ ] Fixture que responde a questão `[ABERTO]` da spec, se houver, vem com a atualização da seção 9 da spec neste mesmo PR (ADR 0031).
- [ ] Nenhuma invariante de `CLAUDE.md` §2 violada.
- [ ] **Nenhum `fixtures/**/expected.yaml` alterado.** Alterado: a aprovação explícita do mantenedor está linkada aqui.
- [ ] Fixture nova, se houver, marcada como rascunho da IA, aguardando aprovação.
- [ ] Dependência nova, se houver, justificada: o que substitui e por que a licença passa no `cargo-deny`.
- [ ] Autor e revisor em sessões separadas (ADR 0032).

<!--
Classificação dos achados da revisão:
BLOQUEANTE — viola invariante, guardrail ou decisão, ou perde dado. Impede merge.
IMPORTANTE — deve ser resolvido, ou adiado com registro.
MENOR      — a critério do autor.
-->
