# ADR 0037 — Parser base do `verso-dialect`

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §9, §17 item 4
- Status no briefing: `ABERTO` até 2026-09-21; `DECIDIDO` a partir da decisão
  do mantenedor
- Revisões: 2026-09-21 — `[ABERTO]` fechado pelo mantenedor sobre a comparação
  em `docs/reference/parser-decision.md`, depois de Q18 respondida na mesma
  sessão. Decisão, Consequências, Alternativas descartadas e Status preenchidos
  no lugar; Contexto inalterado.

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
