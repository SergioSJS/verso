# ADR 0029 — Guardrails no CI antes da primeira linha de lógica de produto

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §14.3, §10.3
- Status no briefing: `DECIDIDO`

## Contexto

O mantenedor é iniciante em Rust e a IA escreve o código. Revisão humana linha a
linha não é a defesa realista nesse arranjo; o que escala é a verificação
mecânica. Por isso os guardrails entram antes de existir lógica de produto, e
não depois.

## Decisão

| Guardrail | Evita |
|---|---|
| `unsafe_code = "forbid"` via `[workspace.lints]` | corrupção de memória |
| clippy com `-D warnings`; `unwrap_used` e `expect_used` negados, permitidos só em testes | panic derrubando o app |
| `cargo-deny`: allowlist de licenças compatível com a licença escolhida; advisories negadas | dependência incompatível ou vulnerável |
| Fuzzing do parser com `cargo-fuzz` | arquivo malformado travando o app |
| Property test de round-trip | abrir reescrevendo arquivo |
| Escrita atômica (arquivo temporário + fsync + rename) | corrupção em queda de energia |
| Confinamento de caminho no adapter | plugin ou agente saindo da pasta via `../` ou symlink |
| Queries parametrizadas + escape da sintaxe FTS5 | busca quebrando com aspas e operadores |
| Benchmark com vault sintético | regressão de performance |

CI em macOS e Linux: `cargo fmt --check`, `cargo clippy`, `cargo test`,
`cargo deny check`.

## Consequências

- A Fase 0 não fecha enquanto os guardrails não forem vistos disparando numa
  branch de teste — existir no arquivo de CI não basta
  ([0034](0034-roadmap-em-fases.md)).
- A allowlist de licenças do `cargo-deny` depende de [0005](0005-licenca.md),
  ainda `[ABERTO]`; até lá ela é provisória e deve ser marcada como tal.
- `unwrap_used` negado fora de teste muda como o código é escrito desde o
  primeiro PR, não como refatoração posterior.
- Benchmark é guardrail sem meta: a linha de base existe, mas metas de
  performance são `[ABERTO]` ([0039](0039-metas-de-performance.md)).

## Alternativas descartadas

- Adicionar guardrails depois de ter features — descartado em §14.3 ("Todos no
  CI antes da primeira linha de lógica de produto").

## Status

Aceito.
