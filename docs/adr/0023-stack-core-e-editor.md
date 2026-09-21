# ADR 0023 — Stack: Rust no core, Tauri v2 como shell, CodeMirror 6 no editor, SQLite com FTS5 no índice

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §9, §10
- Status no briefing: `DECIDIDO`

## Contexto

O Verso precisa de um núcleo que rode igual em desktop, em mobile e sem UI
(`verso serve`), e de um editor com Live Preview equivalente ao que o público
já usa.

## Decisão

| Item | Escolha |
|---|---|
| Core | Rust |
| Shell | Tauri v2 (desktop e mobile) |
| Editor | CodeMirror 6 com Live Preview |
| Índice | SQLite com FTS5 |

## Consequências

- O mantenedor é iniciante em Rust (§10.3): a mitigação são guardrails
  mecânicos, fixtures legíveis e revisão independente
  ([0029](0029-guardrails-no-ci.md), [0032](0032-papeis-autor-e-revisor.md)).
- CodeMirror 6 traz o Lezer, um parser em JS, enquanto o índice usa parser em
  Rust: a divergência entre os dois é risco registrado, mitigado pelo corpus de
  fixtures como suíte de conformidade para ambos
  ([0031](0031-fixtures-como-contrato.md)).
- Um Tauri v2 único para desktop e mobile mantém um só shell, mas não apaga as
  restrições de plataforma ([0009](0009-restricoes-externas.md)).
- FTS5 exige escape da sintaxe de busca e queries parametrizadas; vira guardrail
  ([0029](0029-guardrails-no-ci.md)).
- O parser base em Rust ainda não foi escolhido
  ([0037](0037-parser-base.md), `[ABERTO]`).
- O tokenizador do FTS5 precisa tratar acentos e maiúsculas de pt-BR e EN antes
  da primeira linha de base do benchmark
  ([0046](0046-indice-localizacao-ciclo-de-vida-tokenizador.md), `[ABERTO]`).
- Riscos não avaliados na decisão, registrados na revisão da Fase 0 (I4):
  Tauri v2 mobile é jovem; o WKWebView do iOS impõe limites a CodeMirror 6 e a
  Web Workers que nenhum documento lista. A UI é reversível antes da Fase 2;
  esses riscos precisam aparecer no PR do item 2.2 antes de deixarem de ser.

## Alternativas descartadas

Nenhuma registrada: o briefing não lista outras opções de core, shell, editor ou
índice avaliadas. Para registro, não como descarte: Electron (shell),
ProseMirror/Tiptap e Lexical (editor) não foram avaliados.

## Status

Aceito.
