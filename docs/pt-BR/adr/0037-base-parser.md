# ADR 0037 — Parser base do `verso-dialect`

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §9, §17 item 4
- Status no briefing: `ABERTO` até 2026-09-21; `DECIDIDO` a partir da decisão
  do mantenedor
- Revisões: 2026-09-21 — `[ABERTO]` fechado pelo mantenedor sobre a comparação
  em `docs/reference/parser-decision.md`, depois de Q18 respondida na mesma
  sessão. Decisão, Consequências, Alternativas descartadas e Status preenchidos
  no lugar; Contexto inalterado.
  2026-09-21 — panic upstream do `pulldown-cmark` 0.13.4 registrado nas
  Consequências, vindo da terceira leitura do PR da feature 1
  (`docs/review/phase-1-feature-1.md`). Decisão e Status inalterados.
  2026-09-21 — um segundo defeito da mesma versão, tempo de parsing
  exponencial, registrado nas Consequências, vindo da quarta leitura daquele
  PR. Decisão e Status inalterados.
  2026-09-21 — a saída do mantenedor para esses dois defeitos registrados nas
  Consequências: construir a base a partir da revisão upstream que os corrige,
  até o release seguinte à 0.13.4. Decisão e Status inalterados.

## Contexto

O `verso-dialect` precisa de uma base de parsing de Markdown. O briefing lista
três caminhos, sem escolher: `pulldown-cmark`, `comrak` ou parser próprio.

A escolha é restringida por decisões já tomadas:

- parser puro, sem IO e sem async ([0028](0028-crate-structure.md));
- alvo de `cargo-fuzz` e de property test de round-trip
  ([0029](0029-guardrails-in-ci.md));
- compilável para WASM, para servir de suíte de conformidade contra o Lezer do
  CodeMirror 6 (§10.3);
- preservação fiel do arquivo, já que abrir nunca reescreve
  ([0012](0012-files-are-source-of-truth.md));
- extensões do dialeto (wikilink, embed, `^id`, callout) precisam caber na base
  ([0030](0030-base-dialect-obsidian-compatible.md));
- **posições** (linha e coluna) para cada construção, exigidas pela citação
  verificável ([0018](0018-llm-native-mcp-in-core.md)) e pelo schema do
  `expected.yaml` (`docs/spec/dialect.md` §4);
- **a definição de round-trip** (`docs/spec/dialect.md`, Q18). Há duas leituras
  — árvore sem perda com `serialize(parse(x)) == x`, ou parser somente leitura
  com edições por patch textual — e elas escolhem parsers diferentes:
  `pulldown-cmark` não atende à primeira sem trabalho grande. Q18 é decidida no
  mesmo PR que este ADR, antes da comparação, porque é critério dela.

## Decisão

Decidido pelo mantenedor em 2026-09-21, sobre a comparação em
`docs/reference/parser-decision.md`, na leitura (b) da Q18 (parser somente
leitura, edições por patch textual; `docs/spec/dialect.md` §9):

1. **Parser base: `pulldown-cmark`**, importado com `default-features = false`
   (só a feature `std`), opções `ENABLE_WIKILINKS` e
   `ENABLE_YAML_STYLE_METADATA_BLOCKS`. A saída dele — um fluxo de eventos,
   cada um com seu intervalo de bytes na fonte — é a forma de um extrator
   somente leitura; wikilinks e embeds `![[…]]` na forma do Obsidian têm
   suporte upstream com intervalos exatos; três dependências pequenas, MIT.
2. **`comrak` é o fallback registrado.** Se os intervalos do `pulldown-cmark`
   se mostrarem insuficientes para uma construção que as fixtures precisam, o
   `comrak` com `default-features = false` e `parse.sourcepos_chars` cobre o
   mesmo terreno com uma árvore. A troca fica dentro do `verso-dialect`; as
   fixtures não mudam.
3. **O `verso-dialect` escreve a passada do dialeto ele mesmo**, por cima da
   base: separar o alvo do wikilink em `target`, `heading` e `block`; `^id`
   no fim de um bloco; callouts a partir da primeira linha de um blockquote (a
   extensão de alertas do GitHub da base fica desligada: conhece cinco tipos
   fixos e nenhum marcador de fold, e os callouts do Obsidian são abertos);
   posições em linha e coluna em caracteres Unicode (spec §4.4) calculadas a
   partir dos intervalos de bytes; parsing do YAML do bloco de frontmatter que
   a base entrega opaco.

## Consequências

- A feature 1 da Fase 1 começa como orçada: crate base, passada do dialeto, o
  teste de round-trip de quatro propriedades da Q18, o alvo de fuzz e a
  conferência de WASM ([0029](0029-guardrails-in-ci.md)). Nenhuma mudança no
  roadmap.
- `pulldown-cmark` e suas três dependências entram no `Cargo.toml` e na
  allowlist do `cargo-deny` (MIT) no PR da feature 1, com a justificativa
  acima; o mesmo PR decide o **crate de YAML**, uma decisão de dependência
  nova à parte (`serde_yaml` está arquivado upstream; a Q24 sobre YAML 1.1
  versus 1.2 continua aberta).
- As afirmações sobre os dois crates na comparação foram lidas da documentação
  pública, dos manifestos e do código-fonte deles em 2026-09-21, não
  compiladas aqui. Os guardrails do PR da feature 1 as confirmam: `cargo check`
  para `wasm32-unknown-unknown`, o alvo de fuzz e o `pos` das cinco fixtures
  aprovadas contra os intervalos que a base reporta. Uma afirmação que falhe
  ali é reportada naquele PR, não contornada em silêncio.
- Escolher errado é reversível, mas o custo cresce com o tamanho do corpus de
  fixtures; as fixtures em si são independentes da escolha
  ([0031](0031-fixtures-as-contract.md)). Trocar para o fallback é mudança só
  dentro do `verso-dialect`.
- Uma feature futura que edite o frontmatter por formulário (nota tipada, item
  2.6 da Fase 2) precisa de um patch textual que preserve o YAML, já que a
  spec §5.1 proíbe normalizar ordem de chaves, comentários e aspas. A
  registrar no ADR da nota tipada; não é assunto do parser.
- **O `pulldown-cmark` 0.13.4 dá panic com uma entrada de dez bytes**,
  registrado em 2026-09-21 pela terceira leitura do PR da feature 1: `- [a]:b`
  seguido de uma linha com dois tabs — um item de lista contendo uma definição
  de referência de link, e depois uma linha de tabs — dá panic dentro do
  parser base. Isso contradiz o que este ADR esperava da base e viola a
  propriedade 1 da Q18 (o `parse` retorna para toda entrada). Issue upstream
  #1129; corrigido na `main` do `pulldown-cmark` (verificado na revisão
  `c51a2a4`, lida em 2026-09-21; a correção entrou em algum ponto entre a
  0.13.4 e essa revisão — o autor do PR upstream #1128 relatou em 2026-08-09
  que a `main` já não dava panic na entrada relacionada), sem release desde a
  0.13.4 de 2026-05-20. A `main` upstream precisa de
  `features = ["std"]` junto com `default-features = false`; uma cópia de
  rascunho do crate nessa revisão passou em todos os testes daqui e em 6 M
  execuções de fuzz, e o `comrak` 0.55 — o fallback do item 2 da Decisão —
  também sobrevive à entrada. Até a decisão abaixo, o repositório registrou o
  panic em vez de contorná-lo: a entrada foi mantida como teste de regressão em
  `crates/verso-dialect/tests/regressions.rs`, com `#[ignore]` e a condição
  para tirar o `#[ignore]` escrita nele (a base parar de dar panic ali); ela
  deliberadamente **não** era semente de fuzz, porque o libFuzzer roda as
  sementes da menor para a maior e esta encerrava todo job de fuzz antes da
  primeira mutação; e o job de fuzz rodava o seu orçamento a partir da semente
  restante. **A saída era do mantenedor:** esperar o release upstream, fixar a
  revisão de git — o que também exigia mexer em `[sources]` no `deny.toml`,
  onde `unknown-git` está como `deny` — ou trocar para o fallback `comrak` já
  registrado no item 2.
- **O `pulldown-cmark` 0.13.4 também leva tempo exponencial em certas
  entradas**, registrado em 2026-09-21 pela quarta leitura do PR da feature 1,
  que a achou com o guardrail de fuzz: uma entrada UTF-8 de 5 068 bytes em que o
  `parse` não retorna em tempo prático — preso em CPU, dobrando aproximadamente
  a cada 100 bytes de entrada (3 600 bytes: 1,3 s; 4 000 bytes: 11 s). O parser
  base sozinho emite 157 milhões de eventos para os primeiros 3 600 bytes dessa
  entrada, contra 676 eventos e 313 µs para o arquivo inteiro na `main` upstream
  (verificado na `c51a2a4`), então o defeito é da base e a passada do próprio
  `verso-dialect` é linear sobre os eventos dela. Esta é a "lentidão" que a Q17
  de `docs/spec/dialect.md` já nomeia, e contradiz o propósito que o
  [0029](0029-guardrails-in-ci.md) declara para o guardrail de fuzz. Duas
  consequências enquanto isso durou: o job de fuzz do CI podia ficar vermelho
  em qualquer PR ao achar a entrada de novo (não visto em execuções de 60
  segundos, visto uma vez numa de 600 segundos), e o reprodutor era um segundo
  teste de regressão com `#[ignore]`, que lê
  `crates/verso-dialect/tests/data/pulldown-0.13.4-exponential.txt`. **A saída
  era o mesmo trio de opções do panic, e a mesma decisão**, já que os dois
  defeitos não existem na `main` upstream.
- **A base é construída a partir da revisão upstream `c51a2a4` até o release
  seguinte à 0.13.4**, decisão do mantenedor em 2026-09-21 sobre as três saídas
  que os dois itens acima deixam em aberto. Os dois defeitos já estão
  corrigidos nessa revisão e não há release de onde tirar a correção, então o
  `Cargo.toml` do workspace e o harness de fuzz — pacote próprio — levam o
  mesmo `[patch.crates-io]`, e o `deny.toml` ganha um `allow-git` restrito a
  esse único repositório, com a justificativa escrita no lugar e prazo de
  validade 2026-12-31, como exige a política de exceções do
  [0029](0029-guardrails-in-ci.md). As outras duas saídas não foram tomadas: o
  `comrak` trocaria a base para escapar de um bug que já está corrigido, e
  esperar o release deixa o job de fuzz do CI vermelho de forma intermitente e
  dois testes de regressão ignorados indefinidamente. Elas ficam registradas
  aqui e não nas Alternativas descartadas porque eram saídas desta
  consequência, não alternativas à Decisão. Os dois testes de regressão em
  `crates/verso-dialect/tests/regressions.rs` perdem, portanto, o `#[ignore]`,
  e as duas entradas passam a ser sementes de fuzz, já que uma semente só é
  acrescentada depois de passar. O que impede um build sem o patch de cair de
  volta na 0.13.4 defeituosa é o próprio requisito do crate: ele é afrouxado
  para `"0.13"`, já que o manifesto da revisão com patch ainda diz 0.13.1, e
  pede `features = ["std"]`, uma feature que nenhuma 0.13.x publicada tem — a
  0.13.4 oferece `default`, `gen-tests`, `html` e `simd` —, de modo que sem o
  patch a resolução falha com "does not have that feature" em vez de resolver
  para a 0.13.4. No dia em que o patch sair, o release tem de trazer a feature
  `std` — a separação `no_std` — ou essa linha muda no mesmo PR. O fio de
  disparo para esse dia é uma proibição do `cargo-deny` a `pulldown-cmark`
  `>=0.13.5`, escrita com as chaves antigas `name` e `version`, porque o
  `version` ali é um requisito semver de verdade, enquanto a forma mais nova
  `crate = "name@>=0.13.5"` é um package-id spec que descarta o operador de
  comparação e casa com uma versão exata (cargo-deny 0.20.2); a proibição foi
  vista disparando com o limite baixado para `>=0.13.1` contra a 0.13.1 com
  patch e ficando calada em `>=0.13.2`. A justificativa dela nomeia a ação do
  dia em que disparar: rodar esses dois testes no release, conferir que o
  release tem `std` e então remover o patch, a entrada `allow-git` e a
  proibição juntos, num PR só. O prazo de validade é uma data em três
  comentários — o bloco do patch e as duas entradas do `deny.toml` — e nada o
  faz valer mecanicamente, que é a mesma situação que o
  [0029](0029-guardrails-in-ci.md) dá às suas exceções de advisory; se nenhum
  release chegar até lá, a decisão volta para o mantenedor por alguém ler a
  data. O custo de cadeia de suprimentos fica registrado aqui para que a
  escolha seja consciente: a dependência é fixada por SHA-1 completo, o CI
  precisa alcançar o github.com para o próprio parser, um force-push upstream
  deixaria o build impossível de baixar, e nada é vendorizado — nenhum ADR
  exige vendorizar.

## Alternativas descartadas

- **`comrak`** como base — não descartado, mantido como fallback (Decisão,
  item 2). Não escolhido primeiro porque constrói uma árvore por arquivo que
  um extrator somente leitura não usa, suas features padrão trazem um CLI e o
  `syntect` com Oniguruma em C (têm de ser desligadas), e tem sete
  dependências contra três do `pulldown-cmark`.
- **Parser próprio** — descartado para a Fase 1. Na leitura (b) nada o exige, e
  seu custo vai para a conformidade CommonMark (cerca de seiscentos exemplos
  da spec; as regras de code span e de fence de que `no-link-in-code`
  depende), não para o dialeto do Verso. É o caminho atrelado à leitura (a)
  da Q18, que o mantenedor não escolheu.
- **`pulldown-cmark` ou `comrak` na leitura (a)** — par inválido: nenhum dos
  dois guarda a trivia necessária para reserializar os bytes originais.

## Status

Accepted.
