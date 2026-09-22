# Revisão crítica — Fase 1, feature 1 (`verso-dialect`)

- Data: 2026-09-21
- Revisor: Opus 5, na função de revisor de código do core ([ADR 0032](../adr/0032-author-and-reviewer-roles.md))
- Autor do código revisado: Fable 5.1 ([ADR 0032](../adr/0032-author-and-reviewer-roles.md))
- Entrada: quatro leituras, cada uma em sessão própria, do diff e do repositório, sem acesso à sessão do autor — PR #7 (merge `2448a3d`), depois os commits de acompanhamento `14daba5`, `e5ff1a9` e `71a4bcd` na branch `phase1/dialect-review`.
- Item do roadmap: Fase 1, feature 1 — `verso-dialect`, parsing de links, blocos, headings e frontmatter ([`../roadmap.md`](../roadmap.md)).
- Estado: todo achado BLOQUEANTE das quatro leituras está resolvido em código,
  e a quarta leitura não achou nenhum: o veredito dela é que a branch pode ser
  mesclada como resolução da revisão original. Seis itens foram levantados como
  **pendentes do mantenedor** e aparecem na seção 6; nenhum deles é decidido por
  esta revisão. Em 2026-09-21 o mantenedor decidiu cinco deles — os dois números
  da Q17 (item 1), os dois defeitos do `pulldown-cmark` 0.13.4 (item 2), a
  contradição dentro da spec §4.1 (item 3), o `^id` no fim de um item de lista
  (item 5) e a lacuna no que o CI anuncia (item 6) — e cada um continua na lista,
  marcado como decidido, com a decisão registrada em
  [`../spec/dialect.md`](../spec/dialect.md) (§4.1, §5.7, §9) ou em
  Consequências do [ADR 0037](../adr/0037-base-parser.md). O item 4 segue
  pendente. A Q17 fecha só na parte do frontmatter: tamanho de arquivo,
  comprimento de linha e o lado Markdown continuam `[ABERTO]`; a Q3 só para o
  fim de um parágrafo e de um item de lista. Nada neste documento muda o Status
  ou a Decisão daquele ADR.

## Como ler

Cada leitura é uma seção, com os seus achados na ordem e com a classificação que
a leitura deu a eles. A coluna "Resolução" diz onde o achado foi corrigido, ou
que foi mantido e por quê, ou que é do mantenedor. Nenhum achado propõe decisão:
onde uma decisão é necessária, a linha diz o que precisa ser decidido.

| Nível | Significado ([ADR 0033](../adr/0033-pr-workflow.md)) |
|---|---|
| BLOQUEANTE | Viola invariante, guardrail ou decisão; ou perde dado. Impede merge |
| IMPORTANTE | Deve ser resolvido, ou explicitamente adiado com registro |
| MENOR | A critério do autor |

## Resumo

| Leitura | Entrada | BLOQUEANTE | IMPORTANTE | MENOR |
|---|---|---|---|---|
| 1 | PR #7, merge `2448a3d` | 1 | 5 | 8 |
| 2 | `14daba5` | 3 | 2 | 3 |
| 3 | `e5ff1a9` | 1 | 3 | 5 |
| 4 | `71a4bcd` | 0 | 2 | 5 |

Os achados BLOQUEANTES têm todos a mesma forma: algo que deveria estar limitado
não estava, ou um guardrail que deveria poder falhar não podia. A quarta leitura
não achou nenhum, e os dois IMPORTANTES dela vêm justamente de o guardrail de
fuzz finalmente rodar. Três dos seis itens que sobrevivem até a seção 6 são
questões que a spec já marca `[ABERTO]`; os outros são uma contradição dentro da
spec, dois defeitos do parser base e uma lacuna no que o CI anuncia.

---

## 1. Primeira leitura — PR #7 (merge `2448a3d`)

O PR transforma o crate vazio num extrator somente leitura: `parse(&str) ->
Document` roda o `pulldown-cmark` com `ENABLE_WIKILINKS` e
`ENABLE_YAML_STYLE_METADATA_BLOCKS` ([ADR 0037](../adr/0037-base-parser.md)),
reconfere o intervalo de bytes de cada evento contra a fonte crua, e reporta
wikilinks, embeds, headings ATX, `^id`, callouts e o bloco de frontmatter, cada
um com span em bytes e posição em linha e coluna em caracteres Unicode. Em volta
vêm os três guardrails de feature desta feature
([ADR 0029](../adr/0029-guardrails-in-ci.md)), um harness de fixtures e seis
fixtures em rascunho de IA.

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | BLOQUEANTE | Um frontmatter com cerca de 4 000 sequências de bloco aninhadas (uma nota de 8 KB) estoura a pilha dentro do driver de carga do YAML e aborta o processo com `SIGABRT` — não é panic, então nada acima consegue capturar. Quebra a propriedade 1 da Q18, "o `parse` retorna para toda entrada", que é `DECIDIDA` | **Corrigido** em `14daba5`, completado em `e5ff1a9` e `71a4bcd`. O aninhamento é limitado no fluxo de eventos do `saphyr-parser`, antes de existir qualquer árvore; acima do limite o frontmatter é reportado com o seu span e `values` como erro, e o corpo continua sendo parseado. Visto falhando: com a verificação desligada o teste novo aborta. Os *números* são a Q17 e são do mantenedor (seção 6, item 1) |
| 2 | IMPORTANTE | O guardrail de fuzz estruturalmente não podia achar o achado 1: `-max_len=4096`, e a entrada que quebra precisa de uns 8 KB | **Corrigido** em `14daba5`. `-max_len=65536 -timeout=20`, sementes versionadas em `fuzz/seeds/` e um teste de regressão em `crates/verso-dialect/tests/regressions.rs` |
| 3 | IMPORTANTE | A tabela de "o que foi assumido" do PR não bate com o código quanto ao `^id`: um `^id` sozinho depois de linha em branco **é** reportado; um no fim de item de lista tight **não** é | **Corrigido** em `14daba5`, no doc do reconhecedor e na tabela do PR. A Q3 continua `[ABERTO]` e nada foi implementado num sentido ou no outro (seção 6, item 5) |
| 4 | IMPORTANTE | O harness de fixtures rejeita `syntax: wikilink`, que a spec §4.2 diz que pode ser omitido | **Corrigido** em `14daba5`. `wikilink` e omitir são a mesma afirmação; `markdown` falha com mensagem apontando para a Q20 |
| 5 | IMPORTANTE | O harness escolhe em silêncio um lado de uma contradição dentro da spec §4.1 | **Registrado, não resolvido.** É do mantenedor (seção 6, item 3). O `CLAUDE.md` §1 regra 3 proíbe escolher um lado |
| 6 | IMPORTANTE | Os jobs de `wasm` e de `fuzz` rodam só no Linux; o [ADR 0029](../adr/0029-guardrails-in-ci.md) diz que os guardrails de feature rodam em macOS e Linux | **Corrigido** em `14daba5`. Os dois jobs rodam a matriz dos dois sistemas |
| 7 | MENOR | O comentário de doc de `LineIndex::pos` não descreve o que o código faz (o fallback é `col = 1`, não uma contagem) | **Corrigido** em `14daba5` (comentário) |
| 8 | MENOR | `---\n---\n` e um frontmatter fechado por `...` dão os dois `frontmatter: None`, sem declaração; um bloco de metadados no offset 0 que é rejeitado fica indistinguível de "sem frontmatter" | **Registrado** na tabela de premissas do PR; comportamento inalterado, é a Q24 |
| 9 | MENOR | A Q15 é respondida em código (tabelas, footnotes, task lists, strikethrough, matemática e destaque estão todos desligados) sem ser declarada | **Registrado** na tabela de premissas do PR |
| 10 | MENOR | As convenções de span diferem entre construções: a de um heading para antes da quebra de linha, a de um callout a incluía | **Corrigido** em `14daba5`; refinado em `e5ff1a9` (ver leitura 2, achado 8) |
| 11 | MENOR | O alvo de fuzz não confere nem o span do frontmatter nem posição nenhuma | **Corrigido** em `14daba5` |
| 12 | MENOR | A `property_4` do teste de round-trip não tem como falhar: é verdadeira pelo sistema de tipos | **Mantida** como documentação executável, como a leitura sugeriu; a verificação de verdade é do `verso-fs`, feature 2 |
| 13 | MENOR | O pacote de fuzz fica fora do `cargo deny` e do `[workspace.lints]` | **Mantido.** A leitura considera aceitável sob o [ADR 0029](../adr/0029-guardrails-in-ci.md), já que ele nunca é linkado num crate de produto; acrescentar `cargo deny check` para o manifesto dele é um passo de CI, não dado |
| 14 | MENOR | `fixtures/callout/simple` afirma `kind` e `title`, que o próprio `observed:` dela diz não terem sido observados | **É do mantenedor** (seção 6, item 4). A fixture foi aprovada com o PR #7 e não foi tocada |

## 2. Segunda leitura — `14daba5`

Veredito da leitura: não mesclável como resolução da primeira.

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | BLOQUEANTE | O limite de profundidade não limita a árvore. O `saphyr` expande um alias clonando o nó ancorado, então o limite no fluxo de eventos não o vê: uma cadeia de 1 000 aliases (uns 20 KB, profundidade de evento 2, profundidade expandida 1 001) ainda aborta, e um fan-out de aliases de 347 bytes expande para milhões de nós, 3,0 s e 2,1 GB de pico de memória | **Corrigido** em `e5ff1a9`. A pré-passada mantém uma pilha explícita das coleções abertas, registra a altura e o tamanho de cada nó ancorado, e cobra de cada alias o que o loader vai clonar ali, contra o limite de profundidade e um novo limite de nós. Visto falhando com a cobrança desligada. Os aliases continuam expandindo como antes: nada da Q24 foi decidido |
| 2 | BLOQUEANTE | O guardrail do espelho da documentação está vermelho: três sementes de fuzz são arquivos `*.md` rastreados fora de `docs/pt-BR/` e passam a exigir gêmeos (a verificação tinha sido rodada antes do `git add`, quando eles não eram rastreados) | **Corrigido** em `e5ff1a9`. Semente é dado, não documento: `.txt`; o README das sementes foi dobrado no comentário de doc do alvo de fuzz |
| 3 | BLOQUEANTE | O job de fuzz do CI nunca começou: `fuzz/corpus/parse` está no gitignore e o `cargo-fuzz` 0.13.2 não cria um diretório de corpus que recebe pelo nome | **Corrigido** em `e5ff1a9` (`mkdir -p` antes da execução) |
| 4 | IMPORTANTE | `MAX_YAML_DEPTH = 64` responde à Q17, que está `[ABERTO]`, e está registrado só num comentário de código e numa `pub const` | **Parcialmente corrigido**: `pub(crate)` desde `e5ff1a9`, fora da API pública. O registro em `docs/` está no mesmo PR deste documento (spec §9, Q17); o número em si é do mantenedor (seção 6, item 1) |
| 5 | IMPORTANTE | A propriedade 1 da Q18 continua violada pelo parser base: o `pulldown-cmark` 0.13.4 dá panic com uma entrada de dez bytes. `#[ignore]` é registro, não resolução, e o doc do `parse` dizia "nunca dá panic" | **Parcialmente corrigido**: o doc foi corrigido em `e5ff1a9` e agora nomeia a exceção. O registro em `docs/` está no mesmo PR deste documento ([ADR 0037](../adr/0037-base-parser.md), Consequências); a saída é do mantenedor (seção 6, item 2) |
| 6 | MENOR | A justificativa do limite nomeia a recursão errada: é o driver de carga do `saphyr-parser`, não o loader, que é iterativo | **Corrigido** em `e5ff1a9` |
| 7 | MENOR | O frontmatter é varrido e parseado duas vezes, cerca do dobro do trabalho de YAML | **Mantido.** Irrelevante nos tamanhos de frontmatter; some se a árvore de valores um dia for construída direto dos eventos |
| 8 | MENOR | O span do callout corta toda quebra de linha final, enquanto o comentário dele fala em uma | **Corrigido** em `e5ff1a9`: um `\n` ou `\r\n` |

## 3. Terceira leitura — `e5ff1a9`

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | BLOQUEANTE | O guardrail de fuzz está inerte. O libFuzzer roda as sementes da menor para a maior, e a semente de dez bytes em que o próprio `pulldown-cmark` dá panic rodava primeiro, encerrando todo job do CI antes de uma única mutação. O job ficava permanentemente vermelho sem nunca fuzzar | **Corrigido** em `71a4bcd`. A entrada não é mais semente; continua em `crates/verso-dialect/tests/regressions.rs`, com `#[ignore]` e com a condição para tirar o `#[ignore]` escrita nele. O job agora fuzza os seus 60 segundos a partir da única semente que resta, `fuzz/seeds/deep-yaml.txt` |
| 2 | IMPORTANTE | O orçamento de nós era comparado contra a soma dos tamanhos das subárvores, não contra a contagem de nós, e por isso um mapeamento plano de 2 500 chaves era recusado | **Corrigido** em `71a4bcd`. Cada nó é cobrado uma vez, quando fecha; um alias é cobrado pelo tamanho do nó que ele clona |
| 3 | IMPORTANTE | Os dois números que respondem à Q17 estão registrados só no código Rust | **Registrados** no mesmo PR deste documento, sob a Q17 de [`../spec/dialect.md`](../spec/dialect.md) §9. O registro não decide nada: a questão continua `[ABERTO]` e os números são do mantenedor (seção 6, item 1) |
| 4 | IMPORTANTE | O panic upstream do `pulldown-cmark` está registrado só no código Rust | **Registrado** no mesmo PR deste documento, nas Consequências do [ADR 0037](../adr/0037-base-parser.md). O registro não decide nada: Status e Decisão não mudaram e a saída é do mantenedor (seção 6, item 2) |
| 5 | MENOR | Uma tag fora do core schema acrescenta um nível à árvore que o `saphyr` constrói, e a pré-passada não a cobrava | **Corrigido** em `71a4bcd`. Um teste diferencial mede a árvore que o `saphyr` de fato constrói para onze formas — tags, aliases autorreferentes, chaves complexas, as fronteiras — e afirma que a pré-passada aceita exatamente o que cabe |
| 6 | MENOR | A busca de âncora é linear, o que torna a pré-passada quadrática no pior caso | **Mantido.** O pior caso está limitado pelo orçamento de nós do achado 2 |
| 7 | MENOR | Erro de um na verificação de profundidade: o próprio nó não era contado, então 64 coleções mais um escalar passavam | **Corrigido** em `71a4bcd`: essa forma tem profundidade 65 e é recusada |
| 8 | MENOR | O inventário das sementes de fuzz foi para um comentário de doc em Rust, onde quem lê a documentação não o encontra | **Mantido.** Este documento de revisão nomeia as sementes no lugar: depois do achado 1, a única que resta é `fuzz/seeds/deep-yaml.txt`, o frontmatter profundo |
| 9 | MENOR | Uma mensagem de teste fatiava os primeiros 40 bytes da entrada incondicionalmente | **Corrigido** em `71a4bcd` |

## 4. Quarta leitura — `71a4bcd`

Veredito da leitura: **nenhum BLOQUEANTE**; a branch pode ser mesclada como
resolução da revisão original.

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | IMPORTANTE (contra a branch; preexistente na `main`, não causado pelo diff) | Com o guardrail de fuzz de fato rodando, uma execução de 10 minutos achou uma entrada UTF-8 de 5 068 bytes em que o `parse` não retorna em tempo prático: preso em CPU, exponencial no comprimento da entrada, dobrando aproximadamente a cada 100 bytes (3 600 bytes: 1,3 s; 4 000 bytes: 11 s). Medido depois pelo autor, o `pulldown-cmark` 0.13.4 **sozinho** emite 157 milhões de eventos para os primeiros 3 600 bytes dessa entrada, contra 676 eventos e 313 µs para o arquivo inteiro na `main` upstream: o defeito é do parser base, e a passada do próprio `verso-dialect` é linear sobre os eventos da base. Isso contradiz o propósito que o [ADR 0029](../adr/0029-guardrails-in-ci.md) declara para este guardrail ("arquivo malformado travando o app"), e a Q17 já o nomeia — "parser quadrático … fuzzing pega crash, não lentidão". Consequência: o job de fuzz do CI pode ficar vermelho em qualquer PR ao achá-la (nenhum vermelho em 8 execuções de 60 s, um vermelho numa execução de 600 s) | **Registrado, não corrigido.** A Q17 está `[ABERTO]` e a saída é a mesma decisão do panic ([ADR 0037](../adr/0037-base-parser.md), Consequências; seção 6, item 2). O autor mantém o reprodutor como teste de regressão com `#[ignore]` em `crates/verso-dialect/tests/regressions.rs`, lendo `crates/verso-dialect/tests/data/pulldown-0.13.4-exponential.txt` com `include_str!` |
| 2 | IMPORTANTE | Sem a semente (terceira leitura, achado 1), nada no CI anuncia o release upstream: os testes com `#[ignore]` podem ficar ignorados para sempre, inclusive depois de um `cargo update` | **Adiado com este registro**, é do mantenedor (seção 6, item 6). Duas opções ficam registradas e nenhuma é escolhida: um passo de CI não bloqueante que rode os testes ignorados; ou uma proibição no `deny.toml` de `pulldown-cmark > 0.13.4` cuja justificativa nomeie o teste a designorar |
| 3 | MENOR | `size_of_children` é redundante: é sempre `size - (1 + wrapper)` | **Corrigido** em `17dae4d` |
| 4 | MENOR | `open_depth` duplica estado que a pilha de frames já carrega | **Mantido**, a critério do autor |
| 5 | MENOR | O teste diferencial fixa o modelo apenas nas formas de fronteira dele | **Mantido**, a critério do autor. A própria leitura verificou os limiares exatos em 40 formas construídas à mão, 300 documentos aleatórios e 13 400 fragmentos aleatórios, sem divergência |
| 6 | MENOR | A pré-passada conta a mais chaves duplicadas de mapeamento (pelo lado estrito) | **Anotado** no comentário do teste, em `17dae4d` |
| 7 | MENOR | Duas imprecisões, num comentário e num teste: quais tags acrescentam um nó, e uma fatia de bytes numa mensagem de teste | **Corrigido** em `17dae4d` e `bace77b` |

## 5. Verificado e correto

Nas quatro leituras, e repetido em cada commit:

- Nenhuma fixture foi alterada e nenhum `expected.yaml` foi tocado; as seis
  entradas novas do PR #7 são os exemplos da spec §5 na íntegra, e as seis estão
  marcadas como rascunho de IA
  ([ADR 0031](../adr/0031-fixtures-as-contract.md)). A spec §9 não foi alterada
  pelos PRs de código.
- Sem IO, sem async, sem `unsafe`, sem `unwrap` ou `expect` fora de testes, sem
  `#[allow]` novo; os lints de workspace estão ligados.
- Posições: colunas em caracteres, começando em 1, conferidas à mão em duas
  fixtures; CRLF contado como uma quebra de linha.
- Do lado do Markdown, nada trava nem explode quadraticamente: 32 000
  blockquotes aninhados, 20 000 `[[` aninhados, uma lista de 4 MB fundamente
  indentada e um parágrafo de 400 KB retornam todos.
- Escopo: nada das features 2 a 7 nem da Fase 2 entrou
  (`CLAUDE.md` §2.5).
- Verde na branch: `cargo fmt --check`, `cargo clippy`, `cargo test`,
  `cargo deny check`, a conferência de `wasm32-unknown-unknown`,
  `scripts/check-docs-mirror.sh` e `scripts/check-fixtures.sh`.
- O `saphyr-parser`, a única dependência nova, é a versão exata que já estava na
  árvore transitivamente, MIT OR Apache-2.0, e passa no `cargo deny`.
- Quarta leitura: a contabilidade de nós e de profundidade é exata em toda forma
  que a leitura conseguiu construir; os três reprodutores de `SIGABRT` das duas
  primeiras leituras retornam `Err`; e, num export limpo, o job de fuzz faz de
  407 mil a 733 mil execuções por job de 60 segundos sem alcançar o panic por
  mutação (13 execuções).

## 6. Pendente do mantenedor

Nada nesta lista é decidido aqui.

1. **Os dois números da Q17 — decididos em 2026-09-21.** O código recusa um
   frontmatter aninhado mais fundo que 64 níveis ou que expanda para mais de
   10 000 nós, contados antes de existir qualquer árvore, com os aliases
   cobrados pelo que o loader clona e com o nível que uma tag acrescenta
   contado. Acima de qualquer um dos limites, o bloco é reportado com o seu span
   e `values` como erro, e o corpo continua sendo parseado. O mantenedor
   confirmou os dois números e esse comportamento: eles não são mais
   provisórios, e [`../spec/dialect.md`](../spec/dialect.md) §9 registra a parte
   do frontmatter da Q17 como `DECIDIDA`, com o resto da questão continuando
   `[ABERTO]`. As constantes continuam `pub(crate)` e nenhuma fixture as afirma
   ([ADR 0031](../adr/0031-fixtures-as-contract.md); `CLAUDE.md` invariante 17).
   Outros números considerados: nenhum registrado — os dois foram escolhidos
   para manter o `parse` retornando, não como resposta à Q17.
2. **Os dois defeitos do `pulldown-cmark` 0.13.4** — **decidido em
   2026-09-21.** O primeiro: a entrada de dez bytes `- [a]:b` seguida de uma
   linha com dois tabs dá panic dentro do parser base, o que contradiz o que o
   [ADR 0037](../adr/0037-base-parser.md) esperava dele e viola a propriedade 1
   da Q18 (issue upstream #1129). O segundo, achado pelo guardrail de fuzz em
   `71a4bcd`: uma entrada UTF-8 de 5 068 bytes em que o parser base leva tempo
   exponencial — 157 milhões de eventos para os primeiros 3 600 bytes, dobrando
   aproximadamente a cada 100 bytes — e por isso o `parse` não retorna em tempo
   prático. Os dois estão corrigidos na `main` upstream (verificado na revisão
   `c51a2a4`, lida em 2026-09-21; para o panic, a correção entrou entre a
   0.13.4 e essa revisão, e o autor do PR upstream #1128 relatou em 2026-08-09
   que a `main` já não dava panic na entrada relacionada; o mesmo arquivo leva
   313 µs e 676 eventos lá), sem release desde a 0.13.4 de 2026-05-20. O
   segundo defeito também deixa o job de fuzz do CI vermelho de forma
   intermitente: qualquer execução longa o bastante para achar aquela entrada
   falha. Os dois estão registrados no ADR com as mesmas três saídas: esperar o
   release; fixar a revisão de git, o que também exige mexer em `[sources]` no
   `deny.toml`; ou trocar para o fallback `comrak` do item 2 da Decisão daquele
   ADR. Uma cópia de rascunho do crate em `c51a2a4` passou em todos os testes e
   em 6 M execuções de fuzz, e o `comrak` 0.55 também sobrevive à entrada de dez
   bytes. Os dois reprodutores ficaram em
   `crates/verso-dialect/tests/regressions.rs`, com `#[ignore]`, até a decisão
   abaixo.
   **O mantenedor decidiu em 2026-09-21** pela segunda saída: o workspace e o
   harness de fuzz constroem o `pulldown-cmark` a partir da revisão upstream
   `c51a2a4` via `[patch.crates-io]`, com `allow-git` no `deny.toml` restrito a
   esse único repositório e prazo de validade 2026-12-31 (política de exceções
   do [ADR 0029](../adr/0029-guardrails-in-ci.md)), até o release seguinte à
   0.13.4. O `comrak` não foi tomado porque trocaria a base para escapar de um
   bug que já está corrigido; esperar não foi tomado porque deixa o job de fuzz
   vermelho de forma intermitente e os dois testes ignorados indefinidamente.
   Os dois testes perdem, portanto, o `#[ignore]`, e as duas entradas passam a
   ser sementes de fuzz. Registrado nas Consequências do
   [ADR 0037](../adr/0037-base-parser.md), cuja Decisão e cujo Status não
   mudaram.
3. **A contradição dentro da spec §4.1 — decidida em 2026-09-21.** O mantenedor
   escolheu a leitura estrita, a que o harness de fixtures já implementava: uma
   chave de lista afirma a lista inteira, mesmo tamanho e mesma ordem. A frase
   "o parser pode produzir mais do que a fixture pede, nunca menos e nunca
   diferente" saiu de [`../spec/dialect.md`](../spec/dialect.md) §4.1, que agora
   também diz que o `frontmatter:`, por ser um mapa, afirma só as chaves que
   nomeia.
4. **`fixtures/callout/simple` afirma o que não foi observado.** O `kind` e o
   `title` dela se apoiam na documentação pública do Obsidian; o próprio
   `observed:` dela registra que a API pública expõe apenas uma seção de tipo
   `callout`, sem kind e sem título (o
   [ADR 0009](../adr/0009-external-constraints.md) proíbe olhar além). A Q5 está
   `[ABERTO]`. A fixture foi aprovada com o PR #7; a leitura pede que o
   mantenedor pese isso, e a fixture não foi editada.
5. **`^id` no fim de um item de lista — decidido em 2026-09-21.** O mantenedor
   decidiu que um `^id` que termina um item de lista define o bloco, exatamente
   como um que termina um parágrafo:
   [`../spec/dialect.md`](../spec/dialect.md) §5.7, a Q3 da §9 fechada para
   essas duas posições e a fixture `fixtures/block/list-item` (rascunho de IA
   aguardando aprovação) como resposta. O que a leitura tinha registrado — a
   base não emite evento de parágrafo dentro de um item de lista tight — passa a
   ser tratado pelo reconhecedor acompanhando o texto próprio de cada item, até
   o primeiro filho de bloco, e procurando o `^id` só ali: um bloco de código,
   um bloco HTML ou uma lista aninhada que termina o item nunca é varrido, e um
   item cuja própria linha termina em `^id` mantém o id quando vem uma lista
   aninhada depois. O resto da Q3
   continua `[ABERTO]`: um `^id` sozinho numa linha depois de linha em branco,
   que o Obsidian prende ao bloco anterior, e um `^id` num heading.
6. **Nada no CI anuncia o release upstream** — **decidido em 2026-09-21.**
   Desde que a entrada de dez bytes deixou de ser semente de fuzz (terceira
   leitura, achado 1), os dois testes de regressão com `#[ignore]` do item 2
   podem ficar ignorados indefinidamente,
   inclusive atravessando um `cargo update` que traga a correção. A quarta
   leitura registra duas opções e não escolhe nenhuma: um passo de CI não
   bloqueante que rode os testes ignorados, para que um verde fique visível; ou
   uma proibição no `deny.toml` de `pulldown-cmark > 0.13.4` cuja justificativa
   nomeie o teste a designorar, para que a própria atualização quebre o build
   até alguém olhar. Outras opções consideradas: nenhuma registrada.
   **O mantenedor decidiu em 2026-09-21** pela segunda opção, como fio de
   disparo do patch decidido no item 2: o `deny.toml` proíbe
   `pulldown-cmark` `>=0.13.5`, escrito com as chaves antigas `name` e
   `version`, porque o `version` ali é um requisito semver de verdade,
   enquanto a forma mais nova `crate = "name@>=0.13.5"` é um package-id spec
   que descarta o operador de comparação e casa com uma versão exata
   (cargo-deny 0.20.2); foi visto disparando com o limite baixado para
   `>=0.13.1` contra a 0.13.1 com patch e ficando calado em `>=0.13.2`. A
   justificativa dela nomeia a ação do dia em que disparar: rodar os dois
   testes de regressão no release, conferir que o release tem a feature `std`
   e então remover o patch, a entrada `allow-git` e a proibição juntos. A
   proibição anuncia o release; o que protege o build é o requisito do crate
   pedir `features = ["std"]`, que nenhuma 0.13.x publicada tem, de modo que
   um build sem o patch falha em resolver em vez de cair de volta na 0.13.4 —
   e é por isso que remover o patch significa conferir que o release traz o
   `std`. O passo de CI não bloqueante fica desnecessário assim que esses
   testes deixam de ser ignorados. Registrado nas Consequências do
   [ADR 0037](../adr/0037-base-parser.md).
