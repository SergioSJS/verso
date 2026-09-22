# ADR 0029 — Guardrails no CI antes da primeira linha de lógica de produto

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §14.3, §10.3
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-21 — guardrails separados em "de workspace" e "de feature";
  linhas de verificação de WASM, tipos gerados e `std::fs` acrescentadas;
  requisitos da escrita atômica e política de advisories registrados (revisão da
  Fase 0, C3, C9, R1, R10); 2026-09-22 — onde cada sistema operacional roda,
  depois do incidente de custo; 2026-09-22 — a linha do confinamento de caminho
  reescrita depois da decisão sobre symlinks
  ([0044](0044-verso-fs-semantics.md)); 2026-09-22 — como o código da feature 2
  responde aos requisitos da escrita atômica, registrado como provisório, vindo
  de duas leituras desse código; 2026-09-22 — como o código da feature 3
  atende ao guardrail do FTS5, registrado como provisório.

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
| clippy `disallowed_methods` negando `std::fs` fora de `verso-fs` (exceções declaradas: arquivo do índice em `verso-index`, config em `verso-core`) | acesso à pasta aberta fora de `verso-fs` ([0026](0026-core-ui-contract-inviolable-rules.md), regra 5) |
| `cargo-deny`: allowlist de licenças compatível com a licença escolhida; advisories negadas | dependência incompatível ou vulnerável |
| Espelho da documentação: cada `.md` canônico tem gêmeo em `docs/pt-BR/` com a mesma estrutura de títulos, e vice-versa | documento mudado em um idioma só ([0008](0008-documentation-language.md)) |

### Guardrails de feature — entram no mesmo PR da feature que protegem, nunca depois

| Guardrail | Evita | Entra com |
|---|---|---|
| Fuzzing do parser com `cargo-fuzz` | arquivo malformado travando o app | Fase 1, feature 1 |
| Property test de round-trip (definição em `docs/spec/dialect.md`, Q18) | abrir reescrevendo arquivo | Fase 1, feature 1 |
| `cargo check --target wasm32-unknown-unknown -p verso-dialect` | parser deixar de compilar para WASM e perder a suíte de conformidade com o editor | Fase 1, feature 1 |
| Escrita atômica (ver requisitos abaixo) | corrupção em queda de energia | Fase 1, feature 2 |
| Confinamento de caminho no adapter | plugin ou agente alcançando fora da pasta com caminho absoluto, componente `..` ou byte NUL; symlink dentro da pasta é do usuário, é seguido, e o que ele alcança conta como dentro da pasta ([0044](0044-verso-fs-semantics.md)) | Fase 1, feature 2 |
| Queries parametrizadas + escape da sintaxe FTS5 | busca quebrando com aspas e operadores | Fase 1, feature 3 |
| Benchmark com vault sintético | regressão de performance | Fase 1, feature 5 |
| Verificação de que os tipos TS gerados estão atualizados | regra 3 do contrato virar convenção ([0038](0038-ts-type-generation.md)) | Fase 2, item 2.1 |

CI em macOS e Linux: `cargo fmt --check`, `cargo clippy`, `cargo test`,
`cargo deny check`, mais os comandos dos guardrails de feature conforme entram.

Um pull request roda os guardrails só no Linux; o macOS roda no `main`, depois
de cada merge. Os dois sistemas operacionais ficam, portanto, verificados onde o
código aterrissa. O motivo é custo: o minuto de macOS é cobrado a dez vezes o de
Linux, e um dia de pushes em branches empilhadas gastou a cota mensal inteira do
repositório privado, depois do que o GitHub parou de iniciar jobs. Decisão do
mantenedor de 2026-09-22.

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

**Como o código da feature 2 responde à lista acima, registrado em 2026-09-22 e
provisório: o mantenedor decide ao acordar.** Cada item é o que o código faz,
não uma decisão; os requisitos acima continuam como estão.

- **Hard links: detecta e avisa.** A escrita reporta
  `WriteReport::hard_link_shared` quando o arquivo substituído tinha mais de um
  nome, para o usuário saber que o outro nome ficou com o conteúdo antigo. O
  requisito acima continua dizendo "decidir se detecta e avisa", e essa decisão
  continua sendo do mantenedor — o código escolheu a opção mais barulhenta das
  duas.
- **O dono não é alterado.** O arquivo temporário pertence a quem está
  escrevendo, e `chown` exige privilégios que o Verso não pede; o relatório diz
  se o dono ficou igual ao do original. Modo e atributos estendidos são
  preservados como o requisito pede.
- **Os atributos estendidos são copiados antes do `fsync` do arquivo**, então
  ficam duráveis junto com o conteúdo, e não depois dele.
- **O arquivo temporário é criado já com o modo do original**, em vez de criado
  no padrão e ajustado depois. A janela entre as duas coisas é curta e real:
  a substituição de uma nota que o usuário tinha posto em `0600` ficaria legível
  para todo mundo durante uma escrita, e uma janela basta para quem está
  olhando.
- **`WriteReport` é `#[must_use]` e lista os avisos dele.** Um relatório que
  carrega `hard_link_shared` ou `durability_not_confirmed` e é descartado sem
  ser lido não avisa ninguém; o tipo transforma ignorá-lo em aviso do
  compilador, em vez de hábito.
- **Os dois `fsync` não são observáveis por teste.** Nem o do arquivo, nem o do
  diretório: nenhuma asserção portável distingue "sincronizado" de "não
  sincronizado" sem tirar da tomada. O requisito é cumprido pela leitura do
  código. Registrado sem rodeio, porque é o único requisito acima sem teste por
  trás: **o `fsync` do diretório não tem teste, adiado**, e o que faz as vezes
  de um é alguém lendo o código.
- **Falha depois do `rename` é reportada, não levantada como escrita falha.** O
  `fsync` do diretório e a releitura do novo stamp acontecem com o conteúdo já
  no lugar; o relatório carrega `durability_not_confirmed` em vez de erro,
  porque repetir uma escrita que já caiu mostraria ao usuário um diff contra a
  edição dele mesmo.
- **Sistema de arquivos de rede é detectado no macOS pela ausência de
  `MNT_LOCAL` nas flags de montagem**, não por uma lista de nomes de sistema de
  arquivos. Nas demais plataformas ainda não é detectado.
- **O teste com cliente de sync está pendente do mantenedor, e ele trava o
  fechamento da feature.** "Testar com pasta dentro de pelo menos um deles antes
  de fechar a feature" não foi feito: exige uma pasta real de iCloud Drive,
  Dropbox, OneDrive ou Syncthing na máquina do mantenedor. O requisito continua
  de pé, não cumprido, e a feature 2 não fecha enquanto ele não for cumprido.
- **O código só de macOS é compilado por um pull request apenas num Mac.** A
  verificação de `st_flags` da guarda de placeholder e a de `statfs` para
  sistema de arquivos de rede estão atrás de `#[cfg(target_os = "macos")]`, e um
  pull request roda no Linux, com o macOS rodando no `main` depois do merge —
  então o CI que guarda o PR não compila nem exercita nenhuma das duas. A
  leitura de 2026-09-22 compilou e rodou os 35 testes no macOS 15 com a
  toolchain fixada 1.98.1, todos verdes; essa execução manual está declarada
  como passo no PR, e é o que a execução no Linux não dá.

### FTS5 e queries parametrizadas — como o código da feature 3 atende ao guardrail

**Registrado em 2026-09-22 e provisório: o mantenedor decide ao acordar**, na
linha 5 da §9 de `docs/reference/index-decision.md`. O guardrail acima continua
como está; isto é o que o `verso-index` faz.

- **Todo valor entra como parâmetro ligado.** Nenhuma query é montada
  formatando um valor dentro do SQL: caminhos, alvos e limites entram como
  `?1`, `?2`.
- **As palavras do usuário nunca chegam à gramática de consulta do FTS5.** Cada
  palavra separada por espaço numa busca vira uma string do FTS5 — entre aspas
  duplas, com aspa dupla interna duplicada — e as palavras são unidas pelo AND
  implícito do FTS5. Assim `NOT`, `OR`, `*`, `:`, `(` e `"` são procurados como
  texto e não conseguem mudar a query.
- **O que isso custa, declarado em vez de escondido:** o usuário não consegue
  digitar `casa*` para busca por prefixo nem `titulo:casa` para filtro de
  coluna. Isso vira flag do `verso search` se o mantenedor quiser (feature 4).
- **Visto falhando**, como este ADR exige: com o uso de aspas removido, o teste
  da gramática falha com `fts5: syntax error near "NOT"`.

## Consequências

- A Fase 0 não fecha enquanto os guardrails **de workspace** não forem vistos
  disparando numa branch de teste — existir no arquivo de CI não basta
  ([0034](0034-roadmap-in-phases.md)). Os guardrails de feature têm o mesmo
  critério, aplicado no PR da feature: cada um é visto falhando antes de o PR
  ser mesclado.
- A allowlist de licenças do `cargo-deny` segue [0005](0005-license.md)
  (MPL-2.0): MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, MPL-2.0,
  Unicode-3.0 e CC0-1.0 entram; GPL, LGPL e AGPL ficam fora; qualquer outra só
  com justificativa no PR. Fecha no PR do item 0.10.
- Advisory nova deixa o CI vermelho sem PR culpado. Política: exceção no
  `deny.toml` só com justificativa, link para a advisory e data de expiração;
  exceção expirada é CI vermelho de novo. `Cargo.lock` é versionado.
- `unwrap_used` negado fora de teste muda como o código é escrito desde o
  primeiro PR, não como refatoração posterior.
- Benchmark é guardrail sem meta: a linha de base existe, mas metas de
  performance são `[ABERTO]` ([0039](0039-performance-targets.md)).

## Alternativas descartadas

- Adicionar guardrails depois de ter features — descartado em §14.3 ("Todos no
  CI antes da primeira linha de lógica de produto"). A separação em dois grupos
  não reabre isso: guardrail de feature entra **com** a feature, não depois.

## Status

Aceito.
