# Memorando de decisão: o benchmark e o vault sintético da feature 5 (forma, medições, guardrail, harness, primeira linha de base)

- Data: 2026-09-22
- Situação: **não decidido.** Nada aqui é decisão: o documento expõe opções,
  registra fatos e carrega recomendações rotuladas como tais. Quem decide é o
  mantenedor (`CLAUDE.md` §1). Ao contrário dos memorandos das features 2, 3, 4
  e 6, **nenhum código foi escrito sob estas recomendações**: a feature 5 não
  foi começada. O memorando vem primeiro de propósito, porque *o que* o
  benchmark mede é a parte cara de mudar depois — uma linha de base tirada
  contra a forma errada é uma linha de base para jogar fora.
- **Decisão: tomada pelo mantenedor em 2026-09-22**, em sessão, em três
  palavras — *"pode fazer tudo"*: as cinco linhas da seção 9 como recomendado.
  A escada de 1 000 / 10 000 / 50 000 notas com a forma da seção 2.5, incluindo
  o 1 % de placeholders do iCloud; as sete operações com tempo de relógio, pico
  de RSS e tamanho do arquivo de índice; um comando local e um job de CI só na
  `main`, só no Linux, com as tolerâncias da seção 4.3; um binário simples em
  `crates/verso-bench`, sem dependência de benchmark; e a linha de base tirada
  na ordem da seção 6.3, com a
  [ADR 0039](../adr/0039-performance-targets.md) deixada `[OPEN]`. O código é
  Rust e portanto sessão da Fable 5.1
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)); este memorando fica
  sendo a especificação contra a qual ela escreve.
- **Revisão, 2026-09-23**, depois da leitura da Opus do branch da Fase 2
  (`docs/review/phase-2.md`, leitura 3, achados 11, 12 e 17). O job de CI não
  conseguia ficar vermelho: só a linha de base do Mac está registrada
  (`macbook-pro-de-sergio`, commit `d1a5272`), e uma máquina sem linha de base
  passava por construção — a ordem da seção 6.3, linha de base de CI primeiro,
  não foi seguida. O `verso-bench --require-baseline` agora falha (saída 1)
  quando a máquina que ele nomeia não tem linha de base, e imprime as entradas
  medidas no formato do próprio arquivo de linhas de base, prontas para colar;
  o job na `main` passa essa opção, então a `main` fica vermelha até as
  entradas de `ci-linux` serem registradas. O tamanho do índice agora é medido
  depois de a conexão fechar, com o arquivo `-wal` incorporado; os três
  tamanhos de índice da linha de base do Mac foram tirados do jeito antigo, 1 a
  2 % abaixo, dentro da tolerância de 1,05×. O teste que comparava amostras
  únicas de tempo, e falhava cerca de uma rodada em vinte, verifica só o
  tamanho do índice.
- **Revisão, 2026-09-24.** A linha de base `ci-linux` está registrada: as 21
  entradas que o job imprimiu na primeira execução na `main`, no merge do PR
  #18 (`95f78dd`), coladas em `crates/verso-bench/baselines.json` com a
  aprovação do mantenedor. Com 50 000 notas: índice do zero em 50,2 s, passada
  incremental com 1 % mudado em 2,6 s, busca comum em 65 ms, backlinks da nota
  mais linkada em 0,9 s, pico de memória abaixo de 37 MB, índice de 376 MB. O
  job na `main` fica vermelho de agora em diante só por uma regressão além das
  tolerâncias da seção 6.
- **Revisão, 2026-10-10.** A linha de base `ci-linux` é revista, com a
  aprovação do mantenedor: a busca por nome de arquivo (schema 14 do
  verso-index) deixou o índice de 1 000 notas 10 % maior (7,6 → 8,4 MB), além
  da tolerância de 1,05×, e as duas operações de lote do watcher (roadmap 3.9)
  não tinham linha de base. Os tamanhos de índice vêm da execução na `main` em
  `1dad5ec` (0.7.0-beta.1); os tempos das 21 entradas anteriores ficam os de
  `95f78dd`; as seis entradas novas tomam a mais lenta de duas execuções
  (`1dad5ec`, `f63c392`). Uma primeira tentativa tirou todos os tempos de
  `1dad5ec`, uma máquina cerca de 1,7× mais rápida que a seguinte, e a
  execução seguinte ficou vermelha por tempo com o código igual: uma execução
  não é linha de base de tempo em máquinas compartilhadas (seção 6).
- Autor: Opus 5 (documentos,
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md)). Revisor: Fable 5.1.
  Nos memorandos anteriores as recomendações eram da Fable 5.1, registradas
  pelo autor, porque a Fable escrevia o código da feature na mesma sessão. Aqui
  o código ainda não existe, então as recomendações das seções 2 a 6 são **do
  próprio autor** e a leitura da Fable 5.1 pode mudá-las antes de qualquer
  linha ser escrita.
- Decide sobre: a linha do benchmark na
  [ADR 0029](../adr/0029-guardrails-in-ci.md) ("benchmark com vault sintético",
  Fase 1, feature 5) — o que ele roda, onde roda e o que o deixa vermelho; a
  colocação do código do benchmark diante da
  [ADR 0028](../adr/0028-crate-structure.md); e a linha do
  [roadmap](../roadmap.md) "bench: gerador de vault sintético + linha de base".
- **Não decide** a [ADR 0039](../adr/0039-performance-targets.md). Aquela ADR
  diz que as metas vêm *depois* da primeira linha de base; este memorando
  produz a linha de base que a ADR 0039 espera e deixa as metas `[OPEN]`. Um
  memorando que propusesse números como meta aqui estaria inventando a decisão
  que a ADR 0039 adiou de propósito.
- Fontes lidas: [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0022](../adr/0022-target-platforms-macos-first.md),
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md),
  [ADR 0034](../adr/0034-roadmap-in-phases.md),
  [ADR 0035](../adr/0035-cross-cutting-requirements.md),
  [ADR 0039](../adr/0039-performance-targets.md),
  [ADR 0043](../adr/0043-placeholder-guard.md),
  [ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md), a tabela e os
  critérios de saída da Fase 1 no [roadmap](../roadmap.md), o
  [`docs/spec/dialect.md`](../spec/dialect.md) §4 e §9, e os quatro memorandos
  anteriores ([`fs-decision.md`](fs-decision.md),
  [`index-decision.md`](index-decision.md),
  [`cli-decision.md`](cli-decision.md), [`mcp-decision.md`](mcp-decision.md)).
  A seção 8 lista o que **não** foi verificado.

---

## 1. O que está sendo decidido, e por que agora

A feature 5 é a única entrega da Fase 1 que não foi começada. Seu guardrail —
"benchmark com vault sintético", contra "regressão de performance" — é um
guardrail **de feature**, então a
[ADR 0029](../adr/0029-guardrails-in-ci.md) exige que ele entre no mesmo PR da
feature e que seja **visto falhando** antes do merge. Para um benchmark,
"visto falhando" não é óbvio, e é a primeira coisa que este memorando precisa
fixar.

Três restrições enquadram todas as opções abaixo.

1. **Sem metas, por decisão.** A
   [ADR 0039](../adr/0039-performance-targets.md) diz: medir primeiro,
   prometer depois. Enquanto não houver metas, o benchmark detecta regressão
   *relativa* contra uma linha de base registrada, e a linha de base só é
   comparável se o gerador for **determinístico e versionado** — a ADR 0039 diz
   isso com essas palavras.
2. **Minutos de CI são escassos, e isso é conhecimento recente e caro.** Em
   2026-09-22 um dia de pushes em branches empilhadas gastou toda a cota mensal
   de Actions do repositório; a ADR 0029 agora roda pull requests só no Linux e
   macOS só na `main`. Um benchmark é o job mais caro que um repositório pode
   rodar por commit. Qualquer desenho que o rode a cada push repete o incidente.
3. **Os números ainda não significam nada.** O tokenizer
   ([ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md)) e a regra de
   resolução de links ([spec](../spec/dialect.md) §9, Q12) são **provisórios**,
   pendentes das cinco respostas do [`index-decision.md`](index-decision.md)
   §9. Os dois mudam quanto trabalho a indexação faz. O roadmap já diz que o
   tokenizer é decidido "antes de a feature 5 tirar a linha de base"; a seção 6
   abaixo tira as consequências disso.

Há ainda um fato de fora do plano: o código que seria medido hoje tem um
defeito conhecido no caminho dos placeholders (a leitura da Opus 5 do PR #15,
2026-09-22). Uma linha de base tirada de código com um BLOCKING aberto é uma
linha de base que será tirada de novo. A seção 6 trata isso como questão de
ordem, não como motivo para adiar o memorando.

---

## 2. Decisão 1 — o vault sintético: forma, tamanhos, determinismo

### 2.1 O que o vault precisa ter para os números quererem dizer algo

O benchmark mede o trabalho do Verso, não o do sistema de arquivos. O que faz
esse trabalho variar, na ordem em que o código o encontra:

| Propriedade | Por que muda a medição | Onde se sente |
|---|---|---|
| Número de notas | Domina o walk e a transação por nota | `verso-fs`, `verso-index` |
| Bytes por nota | Domina o parsing e a tokenização do FTS5 | `verso-dialect`, FTS5 |
| Links por nota | Uma linha por link; a resolução é uma consulta por link na leitura | `verso-index` |
| Fração de alvos não resolvidos | `unresolved()` agrupa sobre a tabela inteira | `verso-index` |
| Profundidade e ramificação das pastas | Entradas por `read_dir`, limite de profundidade (64, [ADR 0044](../adr/0044-verso-fs-semantics.md)) | `verso-fs` |
| Frontmatter presente ou ausente | Um segundo parser (YAML) por nota | `verso-dialect` |
| Texto acentuado e não-ASCII | Trabalho do tokenizer; dobra NFC das chaves | `verso-index` |
| Títulos e blocos `^id` por nota | Linhas em `headings` e `blocks` | `verso-index` |
| Placeholders presentes | Um caminho de código que nunca lê o arquivo ([ADR 0043](../adr/0043-placeholder-guard.md)) | `verso-fs`, `verso-core` |

Um gerador que fixa tudo isso produz um vault *comparável entre execuções*, mas
não necessariamente *parecido com um vault real*. Essa é a troca certa para um
detector de regressão: o vault não precisa ser realista, precisa ser
**idêntico entre duas execuções** e exercitar cada caminho numa fração que não
esconda uma regressão nele. O realismo tem exatamente um trabalho aqui —
escolher os tamanhos —, e é por isso que o vault real do mantenedor é entrada
da decisão 1 e não do resto.

### 2.2 Tamanhos, lado a lado

| Opção | Custo por execução | O que pega | O que deixa passar |
|---|---|---|---|
| (a) Um tamanho, 10 000 notas | ~3 s de indexação num M3 Max | Regressão no fator constante | O que só aparece quando uma estrutura deixa de caber em cache |
| (b) Uma escada: 1 000 / 10 000 | ~4 s | O fator constante e uma inclinação grosseira | Um termo quadrático que só aparece depois de 10 000 |
| (c) Escada com degrau grande: 1 000 / 10 000 / 50 000 | Estimadas dezenas de segundos e ~200 MB de arquivos temporários, extrapolados, não medidos | Mudança de classe de complexidade, que é a regressão que realmente dói | Nada relevante para a Fase 1 |
| (d) O vault real do mantenedor | De graça de escrever, impossível de comparar | Nada reprodutível | Não é benchmark; é o critério de saída 1 do roadmap |

Dois fatos medidos pesam nessa escolha. Primeiro, nesta máquina o custo de
indexar já não é trivial em 20 000 notas (seção 3.4). Segundo, e mais
importante: **a dispersão entre execuções em 20 000 notas foi de ±45 %** numa
máquina ociosa, mesmo vault, mesmo binário — 6,28 s, 9,83 s e 11,60 s para a
mesma operação. Uma escada cujos degraus são mais próximos que o ruído não mede
nada.

### 2.3 Determinismo e versionamento

A [ADR 0039](../adr/0039-performance-targets.md) exige as duas palavras. Em
concreto, uma linha de base só é comparável se tudo isto estiver fixo e
registrado junto:

- a **semente** do gerador pseudoaleatório, e um gerador cuja sequência não
  dependa da plataforma nem da versão de uma dependência;
- um número de **versão do gerador**, incrementado à mão sempre que a forma
  mudar, o que invalida por construção toda linha de base anterior;
- a **contagem de notas e os parâmetros de forma** (bytes, links, fração de não
  resolvidos, ramificação de pastas, fração com frontmatter, fração de
  placeholders);
- o **commit** do código medido, a **máquina** e o **sistema operacional**.

A regra de invalidação é a parte fácil de deixar implícita e cara de errar: uma
linha de base carrega a versão do gerador, e uma execução só compara com uma
linha de base da mesma versão. Sem isso, mudar a forma do vault aparece
silenciosamente como ganho ou perda de performance do código.

### 2.4 Onde o gerador escreve, e o que a lint de `std::fs` diz sobre isso

O gerador escreve dezenas de milhares de arquivos. O invariante 5
([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)) confina o acesso
aos arquivos da pasta aberta ao `verso-fs`, e a lista `disallowed_methods` do
clippy o aplica crate a crate. Quatro saídas:

| Opção | Como fica diante do invariante | Custo |
|---|---|---|
| (a) Um crate de bench com `clippy.toml` próprio, declarando a exceção | Mesma forma das duas exceções que já existem (`verso-fs`, `verso-index`); a exceção fica escrita e revisável | Um arquivo, um parágrafo de justificativa |
| (b) Gerar com `tempfile`, como os testes da CLI já fazem | Nenhuma exceção de lint é necessária — `tempfile` não é `std::fs` | Passa na lint sem declarar nada, que é o motivo errado de ser legal |
| (c) Gerar pela API pública do `verso-fs` | Come da própria comida no caminho real de escrita | `Root::write` escreve arquivos, mas nada na API pública cria diretório, e a semântica de criação ainda é `[OPEN]` ([ADR 0048](../adr/0048-file-operations-in-ui.md)); o gerador estaria medindo o caminho de escrita atômica que deveria apenas preparar |
| (d) Gerar fora do Rust (um script) | Nenhuma questão de lint | O gerador deixa de ser versionado junto do código que o consome, e a CI passa a precisar de uma segunda toolchain |

Note que (a) não é um furo no invariante 5: a regra protege *a pasta aberta do
usuário*, e o gerador escreve apenas num diretório temporário que ele mesmo
criou. O jeito honesto de ter isso é dizê-lo num comentário do `clippy.toml`,
como os outros dois crates fazem.

### 2.5 Recomendação da Opus 5 para a decisão 1

Uma **escada de três tamanhos — 1 000 / 10 000 / 50 000 notas**, uma forma só,
gerada por um **gerador determinístico e versionado, em crate próprio**, que
escreve num diretório temporário e declara sua exceção de `std::fs` no próprio
`clippy.toml`.

Parâmetros de forma, fixos para a versão 1 do gerador: ~4 KB por nota, 6
parágrafos, frontmatter YAML com `tags` e `aliases` em toda nota, um título `#`
e um bloco `^id` por nota, 3 wikilinks resolvidos e 1 alvo não resolvido por
nota, texto pt-BR acentuado do começo ao fim, ramificação plana de 37 pastas
e — esta é a fácil de esquecer — **1 % de placeholders do iCloud**, para que o
caminho que existe por causa da ADR 0043 seja medido em vez de suposto.

O degrau de 50 000 é o que justifica a escada: é o único em que uma mudança de
classe de complexidade aparece antes de um usuário encontrá-la.

---

## 3. Decisão 2 — o que é medido e o que é registrado

### 3.1 As operações candidatas

| Operação | Por que é candidata | Fica? |
|---|---|---|
| Indexação fresca do vault inteiro | O custo dominante e aquele que o usuário espera | Sim |
| Indexação incremental sem nada mudado | O que custa a segunda execução; pega regressão no atalho do stamp | Sim |
| Indexação incremental com 1 % das notas mudadas | O caso de todo dia; distingue "relê tudo" de "relê o que mudou" | Sim |
| `search` de uma palavra comum | Consulta FTS5 mais snippet | Sim |
| `search` de uma palavra rara | Separa o custo de casar do custo do snippet | Sim |
| `backlinks` da nota mais ligada | A consulta de resolução no pior caso | Sim |
| `unresolved` sobre o vault inteiro | Um group-by sobre todas as linhas de link | Sim |
| Só o parse, sem IO | Isolaria o `verso-dialect` | Não — os testes da feature 1 já cobrem o parser, e um segundo harness dobra a manutenção |
| Só o walk, sem parse | Isolaria o `verso-fs` | Só se a indexação fresca regredir e a causa ficar obscura; não na versão 1 |

### 3.2 As métricas

O tempo de relógio é o número que o usuário sente, e também o mais ruidoso.
Outros três custam quase nada para registrar e são bem mais estáveis:

- **Pico de memória residente** do processo. Estável entre execuções, e é o
  número que decide se um vault cabe num celular mais tarde (briefing §16.1).
- **Tamanho do arquivo de índice** depois da execução. Função pura da entrada e
  do schema; muda só quando o schema ou o conteúdo guardado muda, então um
  salto é sinal real, sem nenhum ruído.
- **Notas por segundo**, derivado, para que os três degraus da escada sejam
  comparáveis entre si e não apenas com a própria história.

### 3.3 Como é o arquivo de linha de base, e onde ele fica

Um arquivo legível por máquina ao lado do benchmark, versionado no git, uma
entrada por (versão do gerador, tamanho, operação), cada uma com o valor, o
commit, a máquina e o sistema operacional. Um resumo legível por gente em
`docs/reference/` é o que o mantenedor lê; o arquivo de máquina é contra o que a
próxima execução compara.

A alternativa — nenhuma linha de base versionada, comparando só com a execução
anterior na mesma máquina — não custa nada para construir e não pega nada na
CI, já que um runner novo não tem execução anterior.

### 3.4 Uma primeira medição sobre o código de hoje

Não é linha de base: o gerador ainda não existe, este vault saiu de um script
descartável, e o código medido ainda tem um BLOCKING aberto. Está aqui porque
dimensiona as decisões acima. Apple M3 Max, macOS 26.6.2, rustc 1.98.1, build
de release, `verso index` sobre um vault de notas de ~4 KB com frontmatter, 3
links e 1 alvo não resolvido cada, em 37 pastas:

| Notas | Indexação fresca | Reexecução, nada mudado | `search`, palavra comum | `backlinks` | `unresolved` | Pico de RSS | Vault | Arquivo de índice |
|---|---|---|---|---|---|---|---|---|
| 1 000 | 0,28 s | 0,05 s | < 0,01 s | < 0,01 s | < 0,01 s | 5 MB | 4 MB | 2 MB |
| 5 000 | 1,22 s | 0,57 s | 0,01 s | 0,01 s | 0,03 s | 8 MB | 20 MB | 10 MB |
| 10 000 | 2,50 s | 1,27 s | — | — | — | — | — | — |
| 20 000 | 6,28 / 9,83 / 11,60 s | 2,67 / 2,68 / 3,64 s | 0,01 s | 0,05 s | 0,12 s | 14 MB | 79 MB | 37 MB |

Três leituras da tabela:

1. **O tempo não está nas consultas.** Busca, backlinks e não resolvidos ficam
   na casa das dezenas de milissegundos com 20 000 notas. A versão 1 do
   benchmark deve registrá-las, mas é na indexação fresca que uma regressão vai
   aparecer.
2. **A dispersão em 20 000 notas é o achado.** O mesmo comando sobre o mesmo
   vault levou 6,28 s e 11,60 s. Essa dispersão é maior que a maioria das
   regressões que vale a pena pegar, e é em torno dela que a decisão 3 tem de
   ser desenhada — não é motivo para desconfiar dos números, é a medida de
   quanto controle o harness precisa impor (repetições, aquecimento, estado de
   cache) antes que uma comparação signifique algo.
3. **O crescimento acima de 10 000 notas não está estabelecido.** 1 000 →
   5 000 → 10 000 é quase linear (0,28, 1,22, 2,50 s). 10 000 → 20 000 fica
   entre 2,5× e 4,6× para 2× as notas, e com essa dispersão a afirmação honesta
   é que a forma acima de 10 000 é desconhecida. Estabelecê-la é exatamente
   para o que serve a feature 5, e é um argumento a favor do degrau de 50 000.

### 3.5 Recomendação da Opus 5 para a decisão 2

As sete operações marcadas "Sim" na seção 3.1, cada uma registrada com **tempo
de relógio, pico de RSS e tamanho do arquivo de índice**, mais notas por segundo
derivado; uma linha de base em JSON versionada ao lado do benchmark e uma
tabela-resumo legível em `docs/reference/`; e nenhuma medição do parser ou do
walk isolados até que uma regressão torne alguma necessária.

---

## 4. Decisão 3 — como roda, e o que o torna um guardrail

### 4.1 O que "visto falhando" quer dizer para um benchmark

A [ADR 0029](../adr/0029-guardrails-in-ci.md) diz que todo guardrail de feature
é visto falhando no PR que o introduz. Para o fuzzing isso é um crash; para a
escrita atômica, um arquivo truncado. Para um benchmark o equivalente é:
introduz-se uma lentidão deliberada, a comparação marca vermelho, e a execução
vermelha fica registrada no PR. A lentidão tem de ser do tipo que o guardrail
existe para pegar — um O(N²) acidental, não um `sleep`. A mais fiel já é
conhecida: reverter o delete de `notes_fts` para o full scan que ele tinha antes
do commit `4e99082` fazia 4 000 notas levarem 4,94 s em vez de 0,71 s. É uma
regressão real, da forma exata que um usuário encontraria, está a um revert de
distância, e é o que cabe no PR da feature 5 como a execução vermelha
registrada.

### 4.2 Onde roda

| Opção | Custo por mês | O que pega | Risco |
|---|---|---|---|
| (a) Local, sob demanda, nunca na CI | Zero | O que o autor lembrar de rodar | Uma regressão entra num dia em que ninguém rodou |
| (b) CI na `main` a cada merge, só Linux | Um job por merge; os minutos não foram medidos (seção 8) | Toda regressão, um merge atrasada | O bisect é por merge, não por PR |
| (c) CI em todo PR | O incidente de 2026-09-22, de novo | Regressões antes do merge | Custo, e ruído em runner compartilhado |
| (d) CI na `main` **e** um comando local com a mesma saída | Igual a (b) | O mesmo que (b), e o autor pode conferir antes de empurrar | Nenhum além de (b) |

O ruído do runner compartilhado merece linha própria: a dispersão de ±45 % da
seção 3.4 foi medida num laptop quieto. Um runner hospedado pelo GitHub é uma
máquina virtual compartilhada sem sossego nenhum, então uma comparação na CI
precisa de uma tolerância larga o bastante para sobreviver a isso, ou vai gritar
lobo até alguém desligá-la — remédio que a
[ADR 0029](../adr/0029-guardrails-in-ci.md) proíbe.

### 4.3 Tolerância e ruído

Três coisas reduzem o ruído antes de a tolerância ter de absorvê-lo: várias
repetições com a **mediana** reportada em vez da média, uma execução de
aquecimento descartada, e um vault regerado a cada repetição para que o estado
do cache de páginas seja o mesmo. O que sobra é absorvido por uma tolerância, e
o `tamanho do arquivo de índice` — que não tem ruído nenhum — aguenta uma bem
mais apertada que o tempo.

Forma proposta: o tempo reprova quando a mediana passa de **1,5×** a linha de
base; o tamanho do índice, de **1,05×**; o pico de RSS, de **1,3×**. Um número
mais apertado que o ruído medido é um número que será ignorado.

### 4.4 Recomendação da Opus 5 para a decisão 3

Opção (d): um equivalente a `cargo bench` rodável localmente com um comando, e
um job de CI só na `main`, só no Linux, depois de cada merge — nunca em pull
request. Tolerâncias como em 4.3, com a execução vermelha registrada de 4.1 no
PR da feature 5.

---

## 5. Decisão 4 — o harness e onde o código mora

### 5.1 O harness, lado a lado

Consultado no crates.io em 2026-09-22:

| Opção | Versão | Licença | Dependências normais | O que dá | O que custa |
|---|---|---|---|---|---|
| (a) Sem harness: um binário simples com `Instant` | — | — | nenhuma | Controle total do aquecimento, das repetições, do ciclo de vida do vault e do formato de saída | Tudo escrito à mão, inclusive a estatística |
| (b) `divan` | 0.1.21 | MIT OR Apache-2.0 | 6 (`cfg-if`, `clap`, `condtype`, `divan-macros`, `libc`, `regex-lite`) | Benchmarks por atributo, aquecimento e repetições prontos | O modelo dele é "medir uma função", e o que medimos é um processo inteiro sobre um vault |
| (c) `criterion` | 0.8.2 | Apache-2.0 OR MIT | 21, várias opcionais (`clap`, `ciborium`, `itertools`, `regex`, `serde`, `serde_json`, `tinytemplate`, `walkdir`, `oorandom`, `plotters`(opt), `rayon`(opt), …) | Estatística, armazenamento próprio de linha de base, relatórios HTML | A dependência mais pesada da árvore, num repositório de cinco crates pequenos; e as linhas de base dele ficam fora do git por padrão |

As três licenças passam na allowlist do `deny.toml`.

A pergunta decisiva não é a estatística: é que o que medimos tem **preparo
caro** (gerar um vault de 50 000 notas, indexar, medir, jogar fora), e os dois
harnesses são feitos para medir uma função barata muitas vezes. Um binário
simples que gera uma vez por tamanho, roda cada operação N vezes e imprime uma
linha JSON cai na forma do problema sem dependência nenhuma.

### 5.2 Onde o código mora

A [ADR 0028](../adr/0028-crate-structure.md) fixa cinco crates e diz que uma
dependência nova precisa de justificativa no PR. Ela não diz nada sobre um sexto
crate, e um benchmark não é parte do produto.

| Opção | Diante da ADR 0028 | Observações |
|---|---|---|
| (a) `crates/verso-bench`, `publish = false` | Acrescenta um crate a uma estrutura que a ADR desenha com cinco | É a única colocação em que a exceção de `clippy.toml` da seção 2.4 fica restrita ao benchmark e não toca em mais nada |
| (b) `benches/` dentro do `verso-cli` | Nenhum crate novo | A exceção alargaria a lint do próprio `verso-cli`, que é o crate que não pode tocar na pasta |
| (c) Um binário estilo `xtask` no workspace | Nenhum crate novo de produto | Na prática igual a (a), com nome menos óbvio |

### 5.3 Recomendação da Opus 5 para a decisão 4

(a) mais (a): um **binário simples, sem dependência de harness de benchmark**,
num novo **`crates/verso-bench`** com `publish = false`, carregando seu próprio
`clippy.toml` que declara por que ele pode escrever arquivos. Se mais tarde a
estatística justificar uma dependência, `divan` é a que se acrescenta — seis
dependências, e um modelo que cai melhor que o do `criterion` por um quarto do
peso.

---

## 6. Decisão 5 — quando a primeira linha de base é tirada, e em que máquina

### 6.1 O que precisa ser verdade antes de valer a pena registrar uma linha de base

1. O **tokenizer** está decidido
   ([ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md), e o roadmap
   diz "antes de a feature 5 tirar a linha de base"): ele muda o trabalho do
   FTS5 por nota.
2. A **regra de resolução de links** está decidida (spec Q12): ela muda a
   consulta por link.
3. O **BLOCKING aberto** do PR #15 está corrigido: uma linha de base tirada de
   código que falha no caminho dos placeholders teria de ser tirada de novo de
   qualquer jeito, e o vault recomendado na seção 2.5 contém placeholders de
   propósito.

Os itens 1 e 2 são as cinco linhas que o mantenedor deve no
[`index-decision.md`](index-decision.md) §9. **O benchmark pode ser escrito
antes delas; só a linha de base registrada precisa esperar.** É essa ordem que
permite começar a feature 5 agora.

### 6.2 A máquina

Uma linha de base é propriedade de uma máquina, não do código. Duas interessam:
o Mac do mantenedor, onde os números querem dizer algo para um usuário, e o
runner Linux da CI, onde a comparação roda sozinha. Elas não são comparáveis
entre si, então são duas linhas de base, cada uma nomeada, e nenhuma é jamais
comparada com a outra.

### 6.3 Recomendação da Opus 5 para a decisão 5

Escrever o benchmark e o gerador agora; registrar a linha de base do Linux no PR
da feature 5, já que custa um job na `main`; e registrar a do Mac no primeiro PR
depois que as respostas de tokenizer e resolução chegarem e o BLOCKING do PR #15
for corrigido, como um commit só de documentação. As duas linhas de base
carregam a versão do gerador, o commit, a máquina e o sistema operacional, e
nenhuma delas fecha a [ADR 0039](../adr/0039-performance-targets.md).

---

## 7. Não é decisão daqui

- **Metas de performance.** A [ADR 0039](../adr/0039-performance-targets.md)
  segue `[OPEN]` até existir uma linha de base. Este memorando de propósito não
  propõe nenhum número como meta; as tolerâncias da seção 4.3 são limiares de
  regressão contra uma linha de base, o que é outra coisa e não vira promessa a
  ninguém.
- **O celular.** A dor registrada no briefing (§16.1) é um vault grande num
  iPhone. Mobile está fora de escopo até o fim da Fase 2
  ([ADR 0034](../adr/0034-roadmap-in-phases.md)), então o pico de RSS é
  registrado agora e nada é concluído dele ainda.
- **Comparar com o Obsidian.** Cronometrar o outro aplicativo de fora seria
  admissível (a [ADR 0009](../adr/0009-external-constraints.md) proíbe
  inspecioná-lo, não usá-lo), mas comparação contra um conjunto de features
  diferente não é detector de regressão, e não é o que a ADR 0039 pediu.
- **O watcher.** Indexação incremental dirigida por watcher de sistema de
  arquivos não é da Fase 1; quando chegar, traz as próprias medições.
- **Workspaces multi-raiz**
  ([ADR 0041](../adr/0041-multi-root-workspace.md)): uma raiz por execução na
  versão 1 do gerador.

---

## 8. O que este memorando não verificou

- **O degrau de 50 000 notas não foi medido.** O maior vault de fato executado
  teve 20 000 notas. O custo do degrau de 50 000 é estimativa a partir da tabela
  da seção 3.4, e se ele levar minutos em vez de dezenas de segundos, a decisão
  1 é a que se revisita.
- **Nenhuma medição no Linux.** Todo número aqui é de um único Apple M3 Max. Os
  números do runner da CI e o ruído dele são desconhecidos, e as tolerâncias da
  seção 4.3 vêm portanto do ruído de um laptop, não do de um runner.
- **A fração de placeholders não foi medida.** O vault usado na seção 3.4 não
  tem placeholder nenhum, porque o caminho que eles exercitam é o que está com o
  BLOCKING aberto.
- **`divan` e `criterion` não foram experimentados.** Versões, licenças e
  contagens de dependências vêm dos metadados do crates.io lidos em 2026-09-22,
  não de um build.
- **Nada foi medido sobre memória além do pico de RSS**, e o pico de RSS foi
  lido do `/usr/bin/time -l`, que reporta o máximo do processo e não diz nada
  sobre onde ele foi gasto.
- **A forma do gerador não foi validada contra o vault real do mantenedor**,
  cujo tamanho, comprimento de nota e densidade de links são desconhecidos deste
  memorando. Essa é a única entrada que uma decisão sobre a seção 2.2 deveria
  ter e não tem.

---

## 9. Como o mantenedor decide e verifica, sem ler código

**Confira que o memorando é o que o PR diz que é:**

```
git fetch origin && git checkout phase1/bench-decision
git diff --stat origin/main..HEAD          # dois arquivos em docs/, nada de fixtures/ nem crates/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # as fixtures intocadas seguem passando na lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # autor e Signed-off-by são seus
```

**Reproduza a medição da seção 3.4**, se quiser que os números sejam seus e não
do memorando: gere um vault de N notas com qualquer script, rode
`verso index <pasta>` duas vezes com `/usr/bin/time -p` e compare os dois
números com a tabela. O ponto do exercício é a dispersão, não o valor absoluto —
rode o caso de 20 000 três vezes e veja o terceiro número diferir do primeiro em
quase metade.

**Decida, em cinco linhas no PR:**

1. **O vault.** A Opus 5 recomenda *uma escada de 1 000 / 10 000 / 50 000
   notas, uma forma fixa (~4 KB por nota, frontmatter, um título, um `^id`, três
   links resolvidos, um alvo não resolvido, texto pt-BR acentuado, 37 pastas,
   1 % de placeholders do iCloud), gerada de forma determinística a partir de
   uma semente registrada por um gerador versionado*.
2. **O que é medido.** A Opus 5 recomenda *as sete operações da seção 3.1, cada
   uma com tempo de relógio, pico de RSS e tamanho do arquivo de índice, mais
   notas por segundo derivado; uma linha de base em JSON versionada no
   repositório e um resumo legível em `docs/reference/`*.
3. **Onde roda.** A Opus 5 recomenda *um comando local e um job de CI só na
   `main`, só no Linux, depois de cada merge — nunca em pull request (custo,
   ADR 0029); tolerâncias de 1,5× para tempo, 1,05× para tamanho do índice e
   1,3× para pico de RSS, sobre a mediana de execuções repetidas*.
4. **O harness e a casa dele.** A Opus 5 recomenda *nenhuma dependência de
   benchmark: um binário simples num novo `crates/verso-bench`
   (`publish = false`) com `clippy.toml` próprio declarando a exceção de
   `std::fs`; `divan` como alternativa se a estatística um dia justificar uma
   dependência*.
5. **Quando a linha de base é tirada.** A Opus 5 recomenda *escrever o benchmark
   agora, registrar a linha de base do Linux no PR da feature 5 e registrar a do
   Mac só depois das respostas de tokenizer e resolução e da correção do
   BLOCKING do PR #15 — deixando a
   [ADR 0039](../adr/0039-performance-targets.md) `[OPEN]`*.

**O que o PR de fechamento registra, se as recomendações forem aceitas:** a ADR
0029 ganha o detalhe da linha do benchmark (o que roda, onde, com que
tolerâncias); a ADR 0028 ganha o sexto crate, não de produto, com sua
justificativa; a linha da feature 5 no roadmap ganha sua verificação; e a ADR
0039 ganha uma linha dizendo que a linha de base agora existe e que as metas
continuam abertas.
