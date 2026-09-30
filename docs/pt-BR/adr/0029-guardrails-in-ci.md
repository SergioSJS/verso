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
  atende ao guardrail do FTS5, registrado como provisório, e ampliado depois da
  leitura desse código com os caracteres de controle e a abrangência do teste;
  2026-09-23 — um portão de licenças npm acrescentado a pedido do mantenedor, e
  a verificação dos tipos gerados levada para o job Rust de Linux, para que um
  pull request compile as dependências da árvore do Tauri uma vez só; as exceções de advisory e
  de licença da árvore do Tauri ratificadas (`docs/review/phase-2.md` §6,
  itens 7 e 13); 2026-09-23 — onde cada guardrail roda, por decisão do
  mantenedor: um job de Linux por pull request, clippy e os testes no macOS e
  o fuzzing só no `main`, os apps empacotados só numa tag de versão.
  2026-09-24 — os guardrails rodam localmente antes de um push, por dois
  scripts, a pedido do mantenedor. 2026-09-24 — o workflow de release existe,
  com o fluxo de desenvolvimento da [0051](0051-development-flow-and-releases.md).
  2026-09-29 — por que um guardrail contornado é a falha que importa, a
  partir de dois casos da branch `fix/backlog-2-issues`; um subprocesso que
  faz o trabalho que uma lista nega conta como a chamada negada; duas exceções
  à lista de `std::fs` declaradas para a ratificação do mantenedor, a pedido
  do mantenedor na sessão para deixar claro nos documentos o risco de
  contornar um guardrail (Decisão, "Contornar um guardrail"). 2026-09-29 — o
  aplicativo mantém um log de diagnóstico, e `src/log.rs` é a quarta exceção
  declarada de `std::fs` (Decisão, "Uma quarta exceção"). 2026-09-29 —
  as duas exceções ratificadas pelo mantenedor, na sessão ("Ratifique o que
  precisar"), e uma terceira declarada e ratificada no mesmo dia,
  `std::fs::read_dir` no `verso-core`; a contradição sobre o link da linha de
  comando resolvida, o link do shell agora feito com `std::fs` dentro de
  `src/update.rs` e só o pedido de administrador restando como subprocesso (a
  mesma seção).

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
| Allowlist de licenças npm sobre o lockfile da janela (`scripts/check-npm-licenses.mjs`): a lista do `deny.toml` mais OFL-1.1, a licença das fontes | um pacote que a janela empacota sob uma licença que o projeto não pode distribuir | Fase 2, a pedido do mantenedor em 2026-09-23 |

CI em macOS e Linux: `cargo fmt --check`, `cargo clippy`, `cargo test`,
`cargo deny check`, mais os comandos dos guardrails de feature conforme entram.

Um pull request roda os guardrails só no Linux; o macOS roda no `main`, depois
de cada merge. Os dois sistemas operacionais ficam, portanto, verificados onde o
código aterrissa. O motivo é custo: o minuto de macOS é cobrado a dez vezes o de
Linux, e um dia de pushes em branches empilhadas gastou a cota mensal inteira do
repositório privado, depois do que o GitHub parou de iniciar jobs. Decisão do
mantenedor de 2026-09-22.

**Onde cada um roda, desde a decisão do mantenedor de 2026-09-23** (perguntado
"faço o enxugamento?", a resposta: *"claro!! atualize ADR que fizer
sentido"*). O mesmo motivo, levado adiante: todo job é uma máquina que sobe,
instala um toolchain e cobra os minutos arredondados para cima, e em 21 e 22
de setembro pernas de macOS em todo job — `cargo deny` e a checagem de WASM
inclusive, que respondem igual em qualquer sistema — foram a maior parte dos
132 minutos de macOS que a página de cobrança mostrou no ciclo, numa cota que
conta cada um como dez.

- **Um pull request** roda todo guardrail menos o fuzzing em **um job de
  Linux**, dos mais baratos primeiro, sobre um cache só: o espelho dos
  documentos, as fixtures, as licenças npm, o grep de `std::fs`,
  `cargo fmt --check`, `cargo deny check`, clippy, os testes, os tipos gerados,
  a checagem de tipos e o bundle da UI, a checagem de WASM.
- **O `main`**, depois de cada merge, roda esse job de novo, e mais três:
  **clippy e os testes no macOS** — as checagens cuja resposta pode depender
  da plataforma (o sistema de arquivos, atributos estendidos, o WebKit); fmt,
  `cargo deny` (cujo grafo cobre todos os alvos), a checagem de WASM e as dos
  documentos respondem igual em qualquer sistema —, o **fuzzing de 60
  segundos**, em Linux, e o benchmark.
- **Os apps são compilados e empacotados só numa tag de versão**, num
  workflow próprio; branches testam, nunca empacotam. Esse workflow, o
  `.github/workflows/release.yml`, veio com o fluxo de desenvolvimento da
  [0051](0051-development-flow-and-releases.md) em 2026-09-24, macOS
  primeiro; o bundle dele foi compilado e conferido no Mac antes de ele ser
  escrito. Windows, depois Linux, entram
  nas checagens de plataforma do `main` conforme cada porte chegar
  ([0022](0022-target-platforms-macos-first.md)).
- As máquinas de Linux ficam fixadas em `ubuntu-24.04`: o rótulo
  `ubuntu-latest` passa para o Ubuntu 26 a partir de 2026-10-19, o que mudaria
  o WebKitGTK contra o qual o shell linka, e a máquina do baseline `ci-linux`
  do bench, sem commit nenhum para culpar.

**Localmente, antes de um push — o pedido do mantenedor de 2026-09-24.** A
primeira execução do CI depois que a cota voltou falhou num código morto só no
Linux que nenhuma checagem no Mac conseguia ver (`db2cce1`), e o mantenedor
perguntou por que isso não foi testado localmente, com o Docker instalado, e
pediu o caminho no README. Dois scripts rodam os guardrails antes de um push; o
CI confirma, não é onde uma falha aparece primeiro:

- `scripts/check.sh` — todo guardrail do job de Linux, nativo e na mesma
  ordem; num Mac, a checagem de macOS.
- `scripts/check-linux.sh` — fmt, clippy, os testes e os bindings gerados num
  container Linux, como usuário comum, sobre uma cópia das fontes e volumes
  nomeados. A primeira execução real dele achou o bundle da UI faltando antes
  de o shell compilar, o que o CI teria encontrado em seguida (`22d1aa1`).

O macOS não roda num container e o Windows não roda no Docker num Mac ou num
Linux: o próprio Mac é a checagem de macOS, e o Windows ganha aqui uma checagem
do build e no CI os testes quando o porte dele chegar. Os scripts seguem o
workflow à mão; mudar um é mudar os outros.

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
- **Os caracteres de controle são removidos de cada palavra antes de ela ser
  posta entre aspas.** Só as aspas não bastavam: o FTS5 lê a expressão inteira
  como string C, então um byte NUL dentro de uma palavra entre aspas termina a
  string ali e o SQLite responde `unterminated string`. Não é injeção — as
  aspas continuam equilibradas —, mas a §6.3.2 do memo pede que uma busca
  também não faça o SQLite devolver erro. Então `ca<NUL>fe` é procurado como
  `cafe`, e uma busca feita só de caracteres de controle não procura nada.
- **O que isso custa, declarado em vez de escondido:** o usuário não consegue
  digitar `casa*` para busca por prefixo nem `titulo:casa` para filtro de
  coluna. Isso vira flag do `verso search` se o mantenedor quiser (feature 4).
- **O teste cobre todos os operadores da tabela da §6.3.4 do memo** — `"`,
  `OR`, `NOT`, `NEAR(x y)`, `col:x`, `*`, `-x`, um `^` sozinho, um `(` sem
  fechar — e verifica **quais notas cada busca encontra**, não apenas que ela
  não falha: um operador procurado como texto encontra a nota que contém aquele
  texto e nenhuma outra, e não encontra nada quando nota nenhuma o contém. É
  isso que separa os dois casos: `-texto` devolve as notas que contêm `texto`,
  que é o que uma palavra faz, em vez de todas as notas menos elas, que é o que
  o operador faria.
- **Visto falhando**, como este ADR exige: com o uso de aspas removido, o teste
  da gramática falha com `fts5: syntax error near "NOT"`.

### Contornar um guardrail — revisão de 2026-09-29

**Por que é a falha que importa.** Escrito para o mantenedor, que está
aprendendo Rust. A premissa deste ADR está no Contexto dele: revisão humana
linha a linha não é a defesa realista, então os guardrails são o revisor que
lê toda linha. Um guardrail contornado não é um revisor mais fraco; é um
trecho de código que nenhum revisor lê mais, e nada avisa — o CI continua
verde.

A regra de `std::fs` é o caso mais claro. `verso-fs` é onde moram as
proteções dos arquivos do usuário: a escrita atômica (arquivo temporário,
`fsync`, `rename`), a checagem de que o arquivo no disco ainda é o que foi
lido (invariante 11), a guarda de placeholder
([0043](0043-placeholder-guard.md), invariante 10) e o confinamento de
caminho. Código que chega ao disco por fora de `verso-fs` compila limpo, passa
nos testes e parece certo num diff — e não faz nenhuma das quatro. Falha meses
depois, como uma nota escrita pela metade depois de uma queda de energia, uma
edição feita em outro app sobrescrita em silêncio, um arquivo do iCloud lido
como apagado, ou um caminho fora da pasta alcançado. Nenhum teste e nenhuma
demonstração mostra isso antes.

Dois mecanismos tornam isso possível sem um único `#[allow]`:

- **Um subprocesso.** O `disallowed-methods` do clippy nomeia funções de
  Rust — `std::fs::read_link`, por exemplo — e aponta uma chamada a elas.
  `std::process::Command::new("readlink")` não é uma chamada a essa função:
  ele inicia outro programa, o `readlink` do sistema, que faz a mesma coisa no
  mesmo disco. Para o compilador, é iniciar um processo, e nada fica vermelho.
- **Um `clippy.toml` próprio do crate.** O clippy lê o `clippy.toml` mais
  próximo do crate, e um crate que tem o seu não herda a lista do workspace.
  Um arquivo novo com `disallowed-methods = []` desliga a lista inteira para
  aquele crate, numa linha que parece configuração.

E um contorno tolerado uma vez vira o padrão. A IA que escreve a próxima
feature lê o código em volta e faz o que encontra ali; um subprocesso que
passou pela revisão é, para a próxima sessão, evidência de que é assim que
este repositório faz.

**Os dois casos desta branch**, registrados como fatos, não como culpa — os
dois compilaram limpos e passaram em todas as verificações, e os dois foram
achados pela leitura, que é o que este ADR diz que não escala:

- `crates/verso-cli` (commit `e5754b0`): para resolver o symlink instalado da
  linha de comando de volta ao diretório do binário real e do app ao lado
  dele, o código chamou o programa `readlink` por `std::process::Command`,
  onde o clippy negava `std::fs::read_link`.
- `app/src-tauri` (commit `2db4c73`, o atualizador, entregue na
  0.3.0-beta.1): um `clippy.toml` com a lista `disallowed-methods` vazia foi
  acrescentado dentro de um pull request de feature, o que desligou a lista
  de `std::fs` do workspace para o shell inteiro, sem exceção declarada.

**A regra.** Um subprocesso que faz trabalho que uma lista nega — trabalho de
sistema de arquivos, ou qualquer outro que uma lista negue — é a mesma
violação que chamar a API negada: `Command::new("readlink")`, `cp`, `rm`, `ln`
ou `cat` num crate onde a chamada `std::fs` correspondente é negada reprova o
guardrail, e um revisor o classifica como BLOQUEANTE. Um `clippy.toml` que
tira entradas da lista do workspace é uma exceção e segue a regra das
exceções: declarada no próprio arquivo, com o motivo, e ratificada pelo
mantenedor no pull request que a acrescenta. Isto delimita o que "contornado"
quer dizer no §3 do `CLAUDE.md`; não acrescenta verificação. Nenhuma
verificação mecânica acha um subprocesso ainda: a leitura acha.

**Duas exceções, declaradas neste pull request para a ratificação do
mantenedor:**

- `crates/verso-cli/clippy.toml` repete a lista do workspace e permite
  exatamente uma chamada a mais, `std::fs::canonicalize`, para o `launch_app`
  resolver o symlink instalado (o do Homebrew, ou o link que os ajustes
  criam) até o diretório do binário real. O caminho resolvido é o do próprio
  binário, nunca o da pasta; a entrada e a saída da linha de comando estão
  fora da regra 5 da [0026](0026-core-ui-contract-inviolable-rules.md). Ela
  substitui o subprocesso `readlink` acima.
- `app/src-tauri/clippy.toml` mantém a lista vazia, porque a lista do clippy
  é por crate, não por módulo, e o atualizador
  ([0055](0055-in-app-updater.md)) trabalha com arquivos que não são da pasta:
  o download, a extração, o bundle. Em vez disso, `std::fs` no shell fica
  confinado a `src/update.rs` por um grep em `scripts/check.sh`, o mesmo
  padrão que confina o de `verso-core` a `src/sidecar.rs`. Pela regra acima
  de que os scripts e o workflow mudam juntos, o mesmo passo pertence ao
  `.github/workflows/ci.yml`.

**Ratificadas em 2026-09-29 pelo mantenedor**, na sessão, respondendo à lista
do que estava pendente ("Ratifique o que precisar"): as duas exceções acima
ficam como declaradas. O grep que confina o `std::fs` do shell a
`src/update.rs` roda tanto em `scripts/check.sh` quanto em
`.github/workflows/ci.yml`.

**Uma terceira exceção, declarada e ratificada no mesmo dia.**
`crates/verso-core/clippy.toml` agora também permite `std::fs::read_dir`,
confinado como antes a `src/sidecar.rs` pelo grep, para que os sidecars do
índice possam ser listados para as pastas recentes do menu
(`verso_core::recent_folders`). O que ele lista é o diretório de configuração
([0011](0011-config-outside-tree-index-as-cache.md)), nunca a pasta aberta
(regra 5 da [0026](0026-core-ui-contract-inviolable-rules.md)); e os caminhos
que ele lê ficam do lado do host — o menu os mostra, a janela nunca os recebe
(regra 4). Tudo o que inspeciona ou remove um caminho continua negado ali.
Ratificada pelo mantenedor em 2026-09-29, na mesma resposta.

**Uma quarta exceção, e a decisão sob ela — 2026-09-29.** O Verso não anotava
nada. Um comando que falhava dizia na barra de status e sumia; um panic, uma
promessa rejeitada e um erro de script não deixavam rastro nenhum, então um bug
que o usuário encontrasse só podia ser achado rodando o binário pelo terminal e
olhando o `stderr`. O mantenedor, ao saber que não havia log: *"se der algum
erro, a gente reza pra tentar achar?"*. Os guardrails são parte do motivo de
ter ficado assim — escrever em disco aqui exige exceção declarada e confinada —
e nenhum ADR jamais tratou de diagnóstico.

**Decidido pelo mantenedor em 2026-09-29**, em sessão: o aplicativo mantém um
log. Como o autor construiu:

- Um arquivo, `<configuração>/logs/verso.log`, no diretório de configuração
  ([0011](0011-config-outside-tree-index-as-cache.md)) — **nunca a pasta
  aberta** (regra 5 do [0026](0026-core-ui-contract-inviolable-rules.md)). É
  `0600`, como o índice e seu sidecar ([0046](0046-index-location-lifecycle-tokenizer.md)), uma
  rotação em 512 KiB, e nunca é enviado a lugar nenhum: é o arquivo do
  usuário, na máquina do usuário.
- O que entra: a versão e o commit com que o app começou, toda falha que cruza
  para a janela (`failed`), todo panic (um hook, onde antes sumiam) e todo erro
  que a janela teria engolido — os erros de contrato que ela mostra, um script
  que lançou, uma promessa que ninguém pegou, um `console.error`, e as exceções
  que o visualizador de PDF e os diagramas capturam e respondem sozinhos.
- O destino é fixado uma vez, no arranque (`log::open`). Uma rodada de testes
  exercita justamente esses erros; antes disso ela escrevia no log do próprio
  usuário, e foi assim que a falha apareceu.
- `app/src-tauri/src/log.rs` é o segundo módulo do `verso-app` com `std::fs`
  permitido, ao lado de `src/update.rs`. O grep do `scripts/check.sh` e do
  `.github/workflows/ci.yml` agora confina o acesso a disco a esses dois, e o
  `clippy.toml` do crate diz por quê.
- O lado da janela é `app/ui/src/report.ts`, para que as partes que capturam as
  próprias exceções alcancem o log sem alcançar o arquivo da janela. O botão de
  bug na barra de status monta um relatório com o build, o estado, os erros da
  sessão e o fim do log, mostra tudo editável e copia. Nada sai da máquina.

Verificado no aplicativo com falhas reais — uma nota que não é UTF-8 e um
diagrama Mermaid que não compila chegaram ambos ao arquivo. O erro de script não
capturado, a promessa rejeitada e o panic seguem o mesmo caminho e não foram
exercitados.

**Uma contradição, registrada e não resolvida.** O shell liga a linha de
comando pelos ajustes ([0054](0054-terminal-and-agents-from-the-app.md)) com
as ferramentas do sistema — `test`, `readlink`, `ln`, `rm`, `xattr`,
`osascript`, em `cli_state_now`, `install_cli` e `uninstall_cli` de
`app/src-tauri/src/lib.rs` — fora de `src/update.rs`. Lida ao pé da letra, a
regra acima torna essas chamadas uma violação. A
[0054](0054-terminal-and-agents-from-the-app.md) as declarou abertamente e
deixou `[ABERTO]` se elas deveriam virar `std::fs` com uma exceção declarada;
essa pergunta é do mantenedor, e esta revisão não a responde.

**Resolvida em 2026-09-29**, a pedido do mantenedor na sessão ("arrume essa
parte do cli, tem que ficar 100%"). `install_cli`, `uninstall_cli` e
`cli_state_now` não iniciam mais `test`, `readlink`, `ln`, `rm` nem `xattr`.
O trabalho de sistema de arquivos deles foi para `src/update.rs`, dentro do
alcance do grep e sob a exceção ratificada acima: `executable_file`,
`link_target`, `something_at`, `replace_symlink` e `remove_file_at` usam
`std::fs`, e `clear_quarantine` tira a quarentena do download pelo crate
`xattr`, justificado em `app/src-tauri/Cargo.toml`. O único subprocesso que
resta é o `osascript`, para o pedido de administrador. É privilégio, não um
desvio da lista: `std::fs` não consegue pedir a senha de um administrador.
Quando a chamada simples de `std::fs` falha porque `/usr/local/bin` não é da
pessoa, o comando que o macOS roda com os direitos de administrador é
`mkdir -p /usr/local/bin && ln -sfn <a linha de comando empacotada>
/usr/local/bin/verso`, ou `rm /usr/local/bin/verso` para removê-lo —
comandos fixos sobre esse único caminho, o caminho do binário empacotado
entre aspas como uma só palavra do shell, depois de o macOS pedir a senha.
Declarado aqui e aceito como o único subprocesso do link da linha de comando.
O `[ABERTO]` da [0054](0054-terminal-and-agents-from-the-app.md) sobre a
mesma pergunta fica fechado com isto.

## Consequências

- A Fase 0 não fecha enquanto os guardrails **de workspace** não forem vistos
  disparando numa branch de teste — existir no arquivo de CI não basta
  ([0034](0034-roadmap-in-phases.md)). Os guardrails de feature têm o mesmo
  critério, aplicado no PR da feature: cada um é visto falhando antes de o PR
  ser mesclado.
- A allowlist de licenças do `cargo-deny` segue [0005](0005-license.md)
  (MPL-2.0): MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, MPL-2.0,
  Unicode-3.0 e CC0-1.0 entram; GPL, LGPL e AGPL ficam fora; qualquer outra só
  com justificativa no PR. Fecha no PR do item 0.10. A árvore do Tauri
  acrescentou `Apache-2.0 WITH LLVM-exception`, ratificada pelo mantenedor em
  2026-09-23. Desde esse dia os pacotes npm da janela seguem a mesma lista mais
  OFL-1.1, lida do lockfile; o portão foi visto falhando num lockfile editado
  para ter GPL-3.0, nenhuma licença, uma referência a arquivo e um `AND`
  dentro de um `OR`.
- Advisory nova deixa o CI vermelho sem PR culpado. Política: exceção no
  `deny.toml` só com justificativa, link para a advisory e data de expiração;
  exceção expirada é CI vermelho de novo. `Cargo.lock` é versionado. Os sete
  avisos de "sem manutenção" da árvore do Tauri, cada um com link e expiração
  em 2026-12-31, foram ratificados pelo mantenedor em 2026-09-23.
- `unwrap_used` negado fora de teste muda como o código é escrito desde o
  primeiro PR, não como refatoração posterior.
- Benchmark é guardrail sem meta: a linha de base existe, mas metas de
  performance são `[ABERTO]` ([0039](0039-performance-targets.md)).

**O guardrail do benchmark, decidido em 2026-09-22 pelo mantenedor**
(`docs/reference/bench-decision.md` §9). Um gerador determinístico e versionado
monta um vault sintético de 1 000, 10 000 e 50 000 notas de uma forma fixa,
incluindo 1 % de placeholders do iCloud; sete operações são medidas —
indexação fresca, incremental sem nada mudado, incremental com 1 % mudado,
busca de palavra comum e de palavra rara, backlinks da nota mais ligada e não
resolvidos do vault inteiro —, cada uma com tempo de relógio, pico de memória
residente e tamanho do arquivo de índice, pela mediana de execuções repetidas
depois de um aquecimento descartado. Ele roda **só na `main`, só no Linux,
depois de cada merge, nunca em pull request**, pelo motivo de custo registrado
acima, e a partir de um comando local com a mesma saída. Fica vermelho quando a
mediana de tempo passa de 1,5× a linha de base registrada, o arquivo de índice
de 1,05×, ou o pico de memória de 1,3× — nenhuma tolerância mais apertada que o
ruído medido, que foi de ±45 % entre execuções com 20 000 notas num laptop
ocioso. Visto falhando, como todo guardrail de feature precisa: revertendo o
delete de `notes_fts` para o full scan que ele tinha antes do commit
`4e99082`, que levava 4 000 notas de 0,71 s para 4,94 s. A linha de base não é
meta: as metas seguem `[OPEN]` ([0039](0039-performance-targets.md)).

## Alternativas descartadas

- Adicionar guardrails depois de ter features — descartado em §14.3 ("Todos no
  CI antes da primeira linha de lógica de produto"). A separação em dois grupos
  não reabre isso: guardrail de feature entra **com** a feature, não depois.

## Status

Aceito.
