# ADR 0028 — Estrutura de crates

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §14.2, §10.1
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-23 — os dois outros membros do workspace registrados, a
  pedido do mantenedor (`docs/review/phase-2.md` §6, item 10); os cinco crates
  e as regras deles não mudam. 2026-10-09 — dois crates para o servidor,
  decididos pelo mantenedor com a aceitação do
  [0073](0073-self-hosted-server-first.md), que tinha deixado `[ABERTO]`
  aqui onde moram a tabela de sessões e o despacho do serviço; os cinco
  crates e as regras deles não mudam. 2026-10-21 — `crates/verso-cloud`
  registrado, os remotos de nuvem da [0104](0104-external-cloud-storage-transports-and-quotas.md);
  os cinco crates e as regras deles não mudam.

## Contexto

As regras invioláveis ([0026](0026-core-ui-contract-inviolable-rules.md))
só valem se forem verificáveis mecanicamente. A fronteira de crate é o mecanismo
mais barato para isso em Rust: o que um crate não depende, ele não faz.

## Decisão

```
crates/
├── verso-dialect   # parser puro: sem IO, sem async
├── verso-index     # SQLite/FTS5, grafo
├── verso-fs        # handles opacos, watcher, escrita atômica, confinamento
├── verso-core      # orquestra e expõe o contrato
└── verso-cli       # index, search, backlinks, mcp
```

## Consequências

- `verso-dialect` sem IO e sem async é o que o torna fuzzável e compilável para
  WASM, mitigando a divergência entre o parser do editor e o do índice
  ([0023](0023-stack-core-and-editor.md), §10.3).
- Acesso aos arquivos da pasta aberta confinado a `verso-fs` deixa de ser
  convenção e vira duas verificações: ausência de dependência de IO de arquivo
  fora de `verso-fs`, auditável no `Cargo.toml`, e lint do clippy negando
  `std::fs` fora de `verso-fs` ([0029](0029-guardrails-in-ci.md)). O escopo
  exato da regra, com as exceções do índice e da config, está em
  [0026](0026-core-ui-contract-inviolable-rules.md).
- `verso-index` depende de SQLite e abre o arquivo do índice; isso está dentro
  do escopo delimitado da regra 5, não é violação.
- A ordem da Fase 1 segue a estrutura: dialect, fs, index, cli
  ([0034](0034-roadmap-in-phases.md)).
- Qualquer dependência nova precisa de justificativa no PR e entra na allowlist
  do `cargo-deny` ([0029](0029-guardrails-in-ci.md),
  [0033](0033-pr-workflow.md)).

**Um sexto crate, decidido em 2026-09-22 pelo mantenedor**
(`docs/reference/bench-decision.md` §9, linha 4): `crates/verso-bench`,
`publish = false`, fora do produto — o gerador de vault sintético e o benchmark
da feature 5. Ele carrega o próprio `clippy.toml` declarando por que pode
chamar `std::fs`: escreve só num diretório temporário que ele mesmo criou,
nunca numa pasta aberta, que é o que o invariante 5 protege. Mesma forma das
exceções que `verso-fs` e `verso-index` já carregam. Sem dependência de harness
de benchmark; `divan` fica nomeado como alternativa se a estatística um dia
justificar uma.

**Os outros membros do workspace, registrados em 2026-09-23 a pedido do
mantenedor** (`docs/review/phase-2.md` §6, item 10; a resposta: *"a e b
ok"*). Além dos cinco crates do core e do `verso-bench`, o workspace tem mais
dois, e oito membros ao todo:

- `crates/verso-contract` — os tipos do contrato, dados simples com `serde` e
  `specta` e sem IO, compartilhados pelo host e pelo TypeScript gerado
  ([0026](0026-core-ui-contract-inviolable-rules.md) regra 3,
  [0038](0038-ts-type-generation.md)); o core guarda os próprios tipos, que o
  host traduz para estes.
- `app/src-tauri` — o host desktop da Fase 2. Ele chega às notas só pelo
  `verso-core`, não toca arquivo nenhum da pasta aberta (regra 5), e não tem
  `clippy.toml` próprio, então o lint de `std::fs` do workspace vale para ele
  sem mudança.

Nenhum dos dois muda o que os cinco crates podem fazer.

**Dois crates para o servidor, decididos em 2026-10-09 pelo mantenedor**
([0073](0073-self-hosted-server-first.md) item 2, aceito naquele dia; a
resposta ao B do plano foi a recomendação):

- `crates/verso-service` — a tabela de sessões e o despacho de comandos,
  tirados do `app/src-tauri`. Sem transporte: sem rede e sem runtime
  assíncrono. O host Tauri e o servidor chamam ambos.
- `crates/verso-server` — HTTP e WebSocket, as contas, as sessões e o
  banco do servidor. Não toca nenhum arquivo de uma pasta diretamente:
  alcança-os pelo `verso-service`, pelo `verso-core` e pelo `verso-fs`.
  Abre só o próprio banco em `VERSO_DATA_DIR`
  ([0075](0075-server-packaging-and-storage.md) item 3), uma exceção do
  mesmo tipo do arquivo de índice do `verso-index` (regra 5 do
  [0026](0026-core-ui-contract-inviolable-rules.md), revista no mesmo dia);
  uma exceção de `std::fs`, se precisar, é declarada no pull request dele
  ([0029](0029-guardrails-in-ci.md)).

O `verso serve` é um subcomando do binário `verso` que o `verso-cli` já
constrói, não um binário próprio
([0075](0075-server-packaging-and-storage.md) item 1). Nenhum dos dois
crates muda o que os cinco crates podem fazer.

**Um crate para os remotos de nuvem, 2026-10-21** ([0104](0104-external-cloud-storage-transports-and-quotas.md),
construído naquele dia):

- `crates/verso-cloud` — os remotos de nuvem da ADR 0104 (WebDAV, S3), do
  lado do host. O `verso-core` e o `verso-fs` nunca dependem dele; ele não
  toca disco. Não muda o que os cinco crates podem fazer.

## Alternativas descartadas

Nenhuma registrada. (Crate único com módulos não foi avaliado; a estrutura em
cinco crates veio decidida do briefing.)

## Status

Aceito.
