# ADR 0029 — Guardrails no CI antes da primeira linha de lógica de produto

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §14.3, §10.3
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-21 — guardrails separados em "de workspace" e "de feature";
  linhas de verificação de WASM, tipos gerados e `std::fs` acrescentadas;
  requisitos da escrita atômica e política de advisories registrados (revisão da
  Fase 0, C3, C9, R1, R10).

## Contexto

O mantenedor é iniciante em Rust e a IA escreve o código. Revisão humana linha a
linha não é a defesa realista nesse arranjo; o que escala é a verificação
mecânica. Por isso os guardrails entram antes de existir lógica de produto, e
não depois.

"Antes" tem dois sentidos, e a revisão da Fase 0 mostrou que misturá-los torna
a Fase 0 impossível de fechar: alguns guardrails são configuração do workspace
e existem com crates vazios; outros são testes de uma feature e só podem existir
com ela. Os dois grupos estão separados abaixo.

## Decisão

### Guardrails de workspace — no CI na Fase 0, com crates vazios

| Guardrail | Evita |
|---|---|
| `cargo fmt --check` | diff de formatação escondendo diff de lógica |
| `unsafe_code = "forbid"` via `[workspace.lints]` | corrupção de memória |
| clippy com `-D warnings`; `unwrap_used` e `expect_used` negados, permitidos só em testes | panic derrubando o app |
| clippy `disallowed_methods` negando `std::fs` fora de `verso-fs` (exceções declaradas: arquivo do índice em `verso-index`, config em `verso-core`) | acesso à pasta aberta fora de `verso-fs` ([0026](0026-contrato-core-ui-regras-inviolaveis.md), regra 5) |
| `cargo-deny`: allowlist de licenças compatível com a licença escolhida; advisories negadas | dependência incompatível ou vulnerável |
| Espelho da documentação: cada `.md` canônico tem gêmeo em `docs/pt-BR/` com a mesma estrutura de títulos, e vice-versa | documento mudado em um idioma só ([0008](0008-idioma-da-documentacao.md)) |

### Guardrails de feature — entram no mesmo PR da feature que protegem, nunca depois

| Guardrail | Evita | Entra com |
|---|---|---|
| Fuzzing do parser com `cargo-fuzz` | arquivo malformado travando o app | Fase 1, feature 1 |
| Property test de round-trip (definição em `docs/spec/dialeto.md`, Q18) | abrir reescrevendo arquivo | Fase 1, feature 1 |
| `cargo check --target wasm32-unknown-unknown -p verso-dialect` | parser deixar de compilar para WASM e perder a suíte de conformidade com o editor | Fase 1, feature 1 |
| Escrita atômica (ver requisitos abaixo) | corrupção em queda de energia | Fase 1, feature 2 |
| Confinamento de caminho no adapter | plugin ou agente saindo da pasta via `../` ou symlink | Fase 1, feature 2 |
| Queries parametrizadas + escape da sintaxe FTS5 | busca quebrando com aspas e operadores | Fase 1, feature 3 |
| Benchmark com vault sintético | regressão de performance | Fase 1, feature 5 |
| Verificação de que os tipos TS gerados estão atualizados | regra 3 do contrato virar convenção ([0038](0038-geracao-de-tipos-ts.md)) | Fase 2, item 2.1 |

CI em macOS e Linux: `cargo fmt --check`, `cargo clippy`, `cargo test`,
`cargo deny check`, mais os comandos dos guardrails de feature conforme entram.

### Requisitos da escrita atômica

"Arquivo temporário + `fsync` + `rename`" é o esqueleto. Para não perder dado
justamente no guardrail contra perda de dado, a feature 2 da Fase 1 precisa
tratar, com teste para cada item:

- `fsync` do **diretório** depois do `rename`; sem isso o rename pode não
  sobreviver a queda de energia.
- Preservar modo, dono e xattrs do arquivo original quando a plataforma
  permitir (tags do Finder, quarentena); registrar o que não dá para preservar.
- Hard links e aliases: o rename troca o inode. Decidir se detecta e avisa.
- Clientes de sync (iCloud Drive, Dropbox, OneDrive, Syncthing) veem
  "apagou e criou". Testar com pasta dentro de pelo menos um deles antes de
  fechar a feature.
- Sistemas de arquivo de rede onde rename não é atômico: detectar e degradar
  com aviso, não silenciosamente.
- Windows: substituir arquivo existente exige `MoveFileEx` com
  `REPLACE_EXISTING`; handle aberto por antivírus ou OneDrive faz o rename
  falhar. Entra quando Windows entrar.

## Consequências

- A Fase 0 não fecha enquanto os guardrails **de workspace** não forem vistos
  disparando numa branch de teste — existir no arquivo de CI não basta
  ([0034](0034-roadmap-em-fases.md)). Os guardrails de feature têm o mesmo
  critério, aplicado no PR da feature: cada um é visto falhando antes de o PR
  ser mesclado.
- A allowlist de licenças do `cargo-deny` segue [0005](0005-licenca.md)
  (MPL-2.0): MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, MPL-2.0,
  Unicode-3.0 e CC0-1.0 entram; GPL, LGPL e AGPL ficam fora; qualquer outra só
  com justificativa no PR. Fecha no PR do item 0.10.
- Advisory nova deixa o CI vermelho sem PR culpado. Política: exceção no
  `deny.toml` só com justificativa, link para a advisory e data de expiração;
  exceção expirada é CI vermelho de novo. `Cargo.lock` é versionado.
- `unwrap_used` negado fora de teste muda como o código é escrito desde o
  primeiro PR, não como refatoração posterior.
- Benchmark é guardrail sem meta: a linha de base existe, mas metas de
  performance são `[ABERTO]` ([0039](0039-metas-de-performance.md)).

## Alternativas descartadas

- Adicionar guardrails depois de ter features — descartado em §14.3 ("Todos no
  CI antes da primeira linha de lógica de produto"). A separação em dois grupos
  não reabre isso: guardrail de feature entra **com** a feature, não depois.

## Status

Aceito.
