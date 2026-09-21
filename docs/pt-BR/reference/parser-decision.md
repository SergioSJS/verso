# Memo de decisão: o que "round-trip" significa (Q18) e qual parser base (ADR 0037)

- Data: 2026-09-21
- Status: **decidido pelo mantenedor em 2026-09-21**, em sessão, depois de
  ler este memo: Q18 = leitura **(b)**; parser base = **`pulldown-cmark`**,
  `comrak` como fallback. Registrado em `docs/spec/dialect.md` §9 Q18 e no
  [ADR 0037](../adr/0037-base-parser.md) (Accepted). As seções 2–4 são a
  comparação como estava quando a decisão foi tomada; a seção 5 fica como
  registro de como foi decidido.
- Autor: Opus 5 (documentos, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Revisor: Fable 5.1. Nenhum Rust neste PR.
- Decide sobre: [`docs/spec/dialect.md`](../spec/dialect.md) Q18 e
  [ADR 0037](../adr/0037-base-parser.md), nesta ordem, porque a resposta da
  Q18 é critério do ADR 0037 ([roadmap](../roadmap.md), Fase 1).
- Fontes lidas: [ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [ADR 0020](../adr/0020-sync-merge-in-core-transports-as-plugins.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0031](../adr/0031-fixtures-as-contract.md), spec §4, §5 e §9, as cinco
  fixtures aprovadas, e a documentação pública e o código-fonte de
  `pulldown-cmark` 0.13.4 e `comrak` 0.55.0 como publicados no docs.rs e no
  GitHub em 2026-09-21. A seção 4 lista o que **não** foi verificado.

## 1. O que está sendo decidido, e por que agora

A feature 1 da Fase 1 é o crate do parser, `verso-dialect`. Duas coisas
bloqueiam seu primeiro PR:

1. A **Q18** pergunta o que a frase "o parser tem de preservar o que não
   entende: round-trip vira property test obrigatório" (ADR 0012, ADR 0029)
   exige de fato do código. A spec registra duas leituras e diz que "hoje
   ninguém sabe qual".
2. O **ADR 0037** pergunta qual parser de Markdown fica embaixo do
   `verso-dialect`: `pulldown-cmark`, `comrak` ou um próprio. O ADR diz que a
   resposta da Q18 escolhe o parser, então a Q18 vem antes.

Ambas são reversíveis, mas o custo de reverter cresce a cada fixture e a cada
linha do `verso-dialect`. Decidir agora, antes do código, é o momento mais
barato.

As invariantes que restringem a resposta, todas já Accepted:

- **Abrir um arquivo nunca o reescreve** (invariante 7, ADR 0012).
- **Escrita só por ação do usuário, com diff visível**, inclusive escrita por
  agente (invariantes 8 e 11, ADR 0012, ADR 0018).
- **O parser produz posições** (linha, coluna em caracteres Unicode) para cada
  construção, porque um bloco sem `^id` é citado por posição (spec §4.4,
  ADR 0018).
- `verso-dialect` **não tem IO nem async**, é **fuzzado** e **compila para
  WASM** (ADR 0028, ADR 0029).
- A Fase 1 não tem UI nem escrita em notas: entrega `index`, `search`,
  `backlinks` e um `verso mcp` **somente leitura** (roadmap). Escrita por
  agente com diff ainda não tem fase.
- O modelo de arquivo da Fase 1 **não pode inviabilizar o merge por bloco
  depois** (ADR 0020).

## 2. Decisão 1 — Q18: o que "round-trip" significa

### 2.1 As duas leituras

**Leitura (a) — árvore sem perda.** `parse` transforma o arquivo numa árvore
que guarda *tudo*: cada espaço, cada quebra de linha, cada escape `\`, o
delimitador exato usado (`*` ou `_`), indentação, espaço no fim de linha,
sintaxe desconhecida. `serialize` transforma essa árvore de volta em bytes. O
contrato é `serialize(parse(x)) == x`, byte a byte, para todo arquivo. A
árvore é o que se edita; escrever é serializar a árvore editada.

**Leitura (b) — extração somente leitura.** `parse` lê o arquivo e produz um
*relatório*: os links, embeds, headings, IDs de bloco, callouts e frontmatter
que encontrou, cada um com sua posição e o texto-fonte exato de onde veio. Não
há `serialize`. "Abrir nunca reescreve" é garantido por construção: o caminho
de leitura não tem código que escreve. Uma edição, quando existir, é um patch
textual — "substitua os bytes 120..145 por este texto" — calculado contra o
arquivo original e mostrado como diff antes de ser aplicado.

As duas não são "rigorosa" e "frouxa". Respondem perguntas diferentes. (a)
responde "o app consegue reconstruir o arquivo a partir do que entendeu dele?"
(b) responde "o app precisa disso algum dia?"

### 2.2 A comparação, lado a lado

| Pergunta | (a) árvore sem perda | (b) extração somente leitura |
|---|---|---|
| O que garante "abrir nunca reescreve"? | A propriedade `serialize(parse(x)) == x`, testada em entradas geradas | Nenhuma escrita no caminho de leitura, imposta pela estrutura de crates (ADR 0028) e pelo lint de `std::fs` (ADR 0029); testada comparando os bytes do arquivo antes e depois de uma leitura |
| O que o parser precisa modelar | Todo o CommonMark mais toda a trivia (espaços, escapes, entidades, delimitadores, CRLF, tabs) | Só as construções da spec §5 e §6, com posições; todo o resto é "texto" |
| O que cabe embaixo | Um parser próprio, ou uma base que guarde uma árvore sintática concreta. Nem `pulldown-cmark` nem `comrak` guardam (seção 3) | Qualquer parser que dê posições. Os dois candidatos dão |
| O que as cinco fixtures aprovadas afirmam | Nada sobre árvore. Afirmam fatos e posições | Exatamente isto: fatos e posições (a spec §4 não tem forma de árvore) |
| O que o lado do editor (CodeMirror 6 / Lezer) tem | Uma árvore sintática concreta, em JS, própria dele | Posições, a mesma coisa que a suíte de conformidade compara |
| Como uma edição se expressa | Operação na árvore, depois serialize | Intervalo de texto mais substituição, depois diff |
| Custo na Fase 1 | Grande: o parser vira a maior entrega da fase (seção 2.4) | Pequeno: um parser base mais uma passada sobre a saída dele (seção 2.4) |
| Reversível depois? | Para (b): sim, trivialmente — uma árvore com posições também é um relatório | Para (a): sim, como acréscimo — as posições do relatório são as âncoras que uma árvore precisaria. Nada de (b) precisa ser desfeito |

### 2.3 O que o property test do ADR 0029 testa, em cada leitura

Um property test não verifica um exemplo; gera milhares de entradas e verifica
que uma *propriedade* vale para todas. A propriedade é o que a Q18 decide.

Na **(a)**, a propriedade é uma frase: para toda entrada gerada `x`,
`serialize(parse(x)) == x`. É precisa e forte. Também é só tão boa quanto o
gerador: um gerador que nunca produz tab dentro de item de lista nunca testa
esse caso. O corpus de fuzz (ADR 0029) ajuda aqui, já que toda entrada de fuzz
é também uma entrada de round-trip.

Na **(b)**, "round-trip" não pode significar reserialização, porque não há
nenhuma. O teste tem de nomear o que protege. Quatro propriedades, cada uma um
teste concreto cujo nome o mantenedor lê no `cargo test`:

1. **Não entra em pânico.** Para toda entrada, `parse` retorna. (O alvo de
   fuzz também faz isso; o property test faz sobre entradas estruturadas.)
2. **Determinismo.** `parse(x) == parse(x)`, e o relatório não depende de nada
   além de `x`.
3. **Fidelidade de span.** Toda construção relatada carrega o intervalo de
   bytes de onde veio, e fatiar `x` com esse intervalo devolve o texto-fonte
   da construção: para um link, uma string que começa com `[[` e termina com
   `]]`; para um heading, uma linha que começa com `#`; para um ID de bloco,
   `^` seguido do id. O `pos` (linha, coluna) que as fixtures afirmam é
   derivado desse intervalo, e o teste confere a derivação contra a contagem
   de caracteres desde o início do arquivo. Este é o análogo de round-trip na
   (b): o parser não pode mentir sobre onde as coisas estão, e tudo que relata
   pode ser reencontrado no arquivo intocado.
4. **O caminho de leitura não escreve.** No nível do `verso-fs` (feature 2):
   hash do arquivo antes de uma leitura é igual ao hash depois. No nível do
   `verso-dialect` vale por construção — o crate não tem IO — e o lint do
   clippy torna isso mecânico.

A propriedade 3 é a que faz da (b) mais do que "prometemos não escrever". É
também sobre o que o merge por bloco e a escrita por agente se apoiam
(seção 2.5).

### 2.4 O que cada leitura custa na Fase 1

**(a)** exige um parser que guarde uma árvore sintática concreta do
CommonMark. Nenhum crate Rust que o ADR nomeia faz isso, então (a) significa
**escrever um parser próprio** (a seção 3 mostra por que os dois candidatos não
se qualificam). O CommonMark é especificado por cerca de seiscentos exemplos, e
as partes difíceis — listas aninhadas, linhas de continuação preguiçosa,
definições de referência de link, blocos HTML, a regra de sequência de
crases para code spans — são precisamente as que decidem se "link dentro de
código não é link" (`fixtures/code/no-link-in-code`) sai certo. O ADR 0037 já
diz o que acontece então: "o esforço de fuzzing e conformidade sobe, e isso
tem de aparecer no roadmap". A feature 1 deixaria de ser "links, blocos,
headings e frontmatter" e viraria "um parser de CommonMark, depois links,
blocos, headings e frontmatter". Nada na Fase 1 ou na Fase 2 consome a
árvore: a Fase 1 não escreve, e a Fase 2 edita pelo CodeMirror, que tem
árvore própria.

**(b)** exige um parser base (seção 3) mais uma passada nossa sobre a saída
dele que reconheça o dialeto (partes do wikilink, `^id`, cabeçalho de callout)
e registre posições. O property test são as quatro propriedades acima,
escritas uma vez. O custo é o custo para o qual a feature 1 foi orçada.

### 2.5 O que muda para o merge por bloco (ADR 0020) e a escrita por agente (ADR 0018)

**Merge por bloco** (fora de escopo até depois da Fase 2; a restrição é só
"não inviabilizar"). Um merge precisa saber onde um bloco termina e o próximo
começa, dos dois lados da mudança, e reconciliar o texto entre eles.

- Na (a), o merge operaria sobre árvores. Merge de árvores é problema de
  pesquisa sem resposta de prateleira, e ainda termina em texto para o
  conteúdo inline. A árvore sem perda não compra um algoritmo de merge; compra
  a capacidade de serializar o resultado, que o merge textual tem de graça.
- Na (b), um bloco é um intervalo de bytes delimitado por posições do parser
  (o que é um "bloco" continua sendo a Q21 nas duas leituras). O merge de três
  vias roda então sobre texto dentro das fronteiras de bloco — o modelo que o
  `git` usa, com fronteiras de hunk melhores — e um conflito é apresentado por
  bloco. Toda entrada que o merge precisa (fronteiras de bloco, âncoras `^id`,
  posições) está no relatório da (b). A viabilidade está preservada.

**Escrita por agente** (ADR 0018, `DECIDED`, sem fase atribuída): "um diff com
revisão antes de aplicar, proveniência registrada". Agentes produzem texto,
não árvores.

- Na (a), o texto do agente é parseado numa árvore, a árvore é comparada com
  a árvore original, e um diff *textual* continua sendo o que o usuário
  revisa. A árvore é um passo intermediário que o requisito nunca pede.
- Na (b), o agente propõe um patch — uma referência de bloco ou um intervalo
  de bytes, mais texto de substituição — o core calcula o diff contra o
  arquivo como lido, mostra, confere que o arquivo em disco ainda é o que foi
  lido (invariante 11) e escreve atomicamente (feature 2). Isso é o requisito,
  literalmente.

A invariante 11 (mtime/tamanho ou hash antes de escrever) existe nas duas
leituras e não é afetada.

Uma consequência que a (b) torna visível e a (a) esconderia: uma feature
futura que edite o **frontmatter por formulário** (as propriedades de uma nota
tipada, item 2.6 da Fase 2, se editar em vez de só ler) vai precisar de um
patch textual que preserve o YAML, porque a spec §5.1 proíbe normalizar ordem
de chaves, comentários e aspas. Essa é uma consequência a registrar no ADR da
nota tipada, não algo que a (a) resolveria — uma árvore de Markdown também não
parseia YAML.

### 2.6 Recomendação para a Q18

**Leitura (b)**, com o property test de round-trip definido como as quatro
propriedades da seção 2.3.

Por quê, num parágrafo: toda invariante Accepted é satisfeita pela (b), nenhuma
entrega da Fase 1 ou da Fase 2 consome uma árvore sem perda, as fixtures
aprovadas e o editor já falam em fatos e posições, e a (b) pode crescer para a
(a) depois sem desfazer nada, enquanto a (a) agora coloca um parser de
CommonMark próprio na frente de todas as outras features da Fase 1. A única
coisa que a (a) garante e a (b) não — que um arquivo reserializado é igual ao
original — protege um caminho (reserializar) que a (b) não tem.

O que a (b) abre mão: poder dizer "o app entendeu o arquivo inteiro". Não
precisava. O dialeto do Verso é uma *extensão* de um formato de arquivo que
ele não possui; tratar o resto do arquivo como bytes opacos é o modelo
honesto.

## 3. Decisão 2 — ADR 0037: o parser base

### 3.1 Os três candidatos, como lidos em 2026-09-21

| | `pulldown-cmark` | `comrak` | Próprio |
|---|---|---|---|
| Versão lida | 0.13.4 (2026-07-19) | 0.55.0 (2026-09-06) | — |
| Licença | MIT | BSD-2-Clause | MPL-2.0 (nossa) |
| Forma da saída | Um fluxo de eventos (`Start(Heading)`, `Text(...)`, `End(Link)`) com, sob pedido, o **intervalo de bytes** de cada evento na fonte (`OffsetIter`) | Uma árvore (AST) numa arena, cada nó com `sourcepos` (linha e coluna a partir de 1, início e fim); colunas em bytes por padrão, em **caracteres Unicode** com `parse.sourcepos_chars` | O que desenharmos |
| Usado por | `rustdoc`, mdBook | GitLab, docs.rs | — |
| Dependências com defaults desligados | 3: `bitflags`, `memchr`, `unicase` | 7: `caseless`, `finl_unicode`, `jetscii`, `phf`, `rustc-hash`, `smallvec`, `typed-arena` (+ `entities`, `phf_codegen` no build) | 0 |
| Dependências com defaults **ligados** | + `getopts`, `pulldown-cmark-escape` | + um CLI (`clap`, `xdg`, `shell-words`…) **e `syntect` com Oniguruma em C**. Tem de ser importado com `default-features = false` | — |

"Defaults desligados" importa: o ADR 0028 quer toda dependência nova
justificada e o `cargo-deny` quer toda licença na allowlist. As licenças dos
dois crates estão na allowlist do ADR 0029; as transitivas são conferidas pelo
`cargo deny` no PR da feature 1.

### 3.2 Contra os critérios do ADR 0037, na leitura (b)

| Critério (ADR 0037) | `pulldown-cmark` | `comrak` | Próprio |
|---|---|---|---|
| Sem IO, sem async (ADR 0028) | Sim. Funções puras sobre `&str` | Sim, com defaults desligados. As features `cli` e `syntect` trazem IO e código C; ficam desligadas | Sim |
| Alvo de fuzz (ADR 0029) | Fuzzado upstream; a própria suíte de testes do crate contém regressões "não quebrar" vindas de fuzz | Fuzzado upstream; oferece uma feature `arbitrary` para fuzz estruturado | Tudo começa do zero; o corpus de fuzz é nosso para construir |
| Compila para WASM | Rust puro, sem código de plataforma. Confirmado no PR pelo guardrail `cargo check --target wasm32-unknown-unknown` | Tem casos explícitos de `wasm32` no seu `Cargo.toml`. Mesma confirmação | Nosso para manter verdadeiro |
| Preservação fiel | Na (b) a base nunca serializa, então este critério vira **posições**. Intervalo de bytes por evento, exato (o teste upstream para `[[Wikientry\|click here]]` reporta o intervalo 19..43, com o `[[` incluído) | Na (b), posições: `sourcepos` por nó com início e fim, e uma opção para contar colunas em caracteres como a spec §4.4 pede. Posições inline amadureceram em versões recentes; conferidas contra o `pos` das cinco fixtures no PR | Nossa |
| Preservação fiel na (a) | **Não atende.** Eventos descartam trivia, desfazem escapes, resolvem referências; não há caminho de volta aos bytes | **Não atende.** `format_commonmark` re-renderiza um documento normalizado, não o original | O único jeito de atender a (a) |
| Extensões do dialeto cabem (ADR 0030) | Ver 3.3 | Ver 3.3 | Ver 3.3 |
| Posições (spec §4.4, ADR 0018) | Intervalo de bytes → linha e coluna em caracteres calculados por nós a partir da fonte (uma passada, sem ambiguidade) | Linha e coluna dadas; caracteres com `sourcepos_chars` | Nossas |
| Aderência à leitura (b) | Exata. Um extrator somente leitura *é* um laço sobre eventos com intervalos; nenhuma árvore é construída e jogada fora | Boa. A árvore dá o contexto do pai de graça (este texto está dentro de um blockquote?), ao custo de alocar uma árvore por arquivo | Exata por desenho, ao custo da seção 2.4 |
| Aderência à leitura (a) | Não | Não | Obrigatório |
| Desempenho (benchmark da feature 5) | Parser pull, sem alocação de árvore; historicamente o mais rápido dos dois | Árvore em arena por documento; rápido o bastante para o GitLab | Desconhecido |
| Conformidade CommonMark | Spec completa, testada contra os exemplos da spec | Spec completa mais GFM, testada contra os exemplos da spec | O que alcançarmos; as regras de code span e de fence de que `no-link-in-code` depende são nossas para acertar |

### 3.3 O que cada base deixa para o Verso escrever

O dialeto (spec §5) não é CommonMark. Seja qual for a base, o `verso-dialect`
escreve uma passada própria por cima. A pergunta é quanto, e se a base
atrapalha.

| Construção | `pulldown-cmark` | `comrak` | Nosso nos dois casos |
|---|---|---|---|
| Frontmatter (§5.1) | `ENABLE_YAML_STYLE_METADATA_BLOCKS`: o bloco `---` no início do arquivo sai como um evento de texto opaco com seu intervalo | `front_matter_delimiter("---")`: um nó opaco `FrontMatter(String)` | Parsear o YAML em si, com a questão YAML 1.1 versus 1.2 da Q24. O crate de YAML é uma decisão de dependência à parte para o PR da feature 1 (`serde_yaml` está arquivado upstream; o `cargo deny` dirá o que é aceitável) |
| Wikilink (§5.2–5.5, 5.10) | `ENABLE_WIKILINKS`, documentado como "estilo Obsidian": `[[a\|b]]` dá um link com `dest_url = "a"`, uma flag `has_pothole` dizendo que havia pipe, e `b` como texto do link; o intervalo cobre `[[…]]` | `wikilinks_title_after_pipe` (a ordem do Obsidian): um nó `WikiLink { url }` com o título como texto filho | Separar o alvo em `target`, `heading` (`#`) e `block` (`#^`) como a spec §4.2 define; os escapes e formas combinadas da Q23 |
| Embed (§5.6) | `![[…]]` com `ENABLE_WIKILINKS` é emitido como **imagem** cujo tipo de link é `WikiLink` (verificado no código-fonte do parser) | A confirmar no PR com a fixture de embed: se `![[` é reconhecido ou sai como `!` seguido de wikilink | A mesma separação do wikilink; a regra tamanho-versus-alias da Q23 |
| Definição de bloco `^id` (§5.7) | Não é construção. Nosso: varrer o texto no fim de um parágrafo ou item de lista | Igual | Reconhecer `^id` no fim de um bloco, seu charset (Q22) e posição admissível (Q3, Q4) |
| Callout (§5.8) | `ENABLE_GFM` reconhece as tags de blockquote do GitHub — cinco tipos fixos, sem marcador de fold. Os callouts do Obsidian têm tipos arbitrários e fold `-`/`+`, então a extensão da base fica **desligada** e o callout é nosso, lido da primeira linha de um `BlockQuote` comum | `alerts` reconhece os mesmos cinco tipos do GitHub (`AlertType` não tem variante arbitrária). Mesma conclusão: fica desligada, nosso por cima do `BlockQuote` | Tipo, título, fold, aninhamento (Q5), a partir da primeira linha de um blockquote |
| Link dentro de código não é link (§5.9) | De graça: texto dentro de eventos `Code` e `CodeBlock` nunca é varrido | De graça: nós `Code` e `CodeBlock` | Nada, desde que nossa passada só varra eventos/nós `Text` |
| Headings (§5.12) | Eventos `Heading` com nível e intervalo; texto como filhos | Nós `Heading` com nível e `sourcepos` | Texto bruto sem os espaços das pontas (spec §4.3); casamento de heading (Q19) |
| Links Markdown para arquivo local (§5.13, `PROPOSED`) | Eventos `Link` nativos com `dest_url` | Nós `Link` nativos | Decidir se contam (Q20); decodificação de URL |
| Posições (§4.4) | Intervalo de bytes → (linha, coluna em caracteres) calculado uma vez por arquivo | Nativas, com `sourcepos_chars` | Com `pulldown-cmark`, um helper; com `comrak`, uma opção |

O padrão: com qualquer dos crates, a base cuida do CommonMark e das duas
construções que têm suporte upstream compatível com o Obsidian (frontmatter,
wikilink), e o Verso cuida do resto com as posições que a base entrega. Com um
parser próprio, o Verso cuida também do CommonMark.

### 3.4 Recomendação para o ADR 0037

**`pulldown-cmark`**, na leitura (b).

- A forma da saída dele é a forma do trabalho. Um extrator somente leitura com
  posições é um laço sobre `(evento, intervalo de bytes)`; `pulldown-cmark` é
  exatamente esse iterador, sem nada construído para ser descartado depois.
- Menor superfície de dependências dos dois crates (três crates pequenos, MIT),
  e nenhuma feature que precise ser desligada para manter o crate puro.
- Wikilinks e embeds na forma do Obsidian estão upstream, com intervalos
  exatos, inclusive o embed `![[` como imagem.
- O que falta (linha/coluna em caracteres) é um helper de dez linhas sobre a
  string-fonte, e o mesmo helper é necessário de qualquer forma para conferir
  as fixtures de `pos` independentemente da base.

**`comrak` é o fallback nomeado**, não um descarte. Se, no PR da feature 1, os
intervalos do `pulldown-cmark` se mostrarem insuficientes para uma construção
que as fixtures precisam, o `comrak` com `default-features = false` e
`sourcepos_chars` cobre o mesmo terreno com uma árvore. Trocar é uma mudança
só dentro do `verso-dialect`; as fixtures não mudam (ADR 0037, consequências).

**Um parser próprio não é recomendado para a Fase 1.** Na (b) nada o exige, e
seu custo vai para a conformidade CommonMark, não para o dialeto do Verso.
Continua sendo o caminho a tomar se o mantenedor escolher a leitura (a).

### 3.5 O que a recomendação fecha, e o que deixa aberto

Se o mantenedor aceitar as duas recomendações, é isto que o PR de fechamento
registra:

**Fecha**

- Q18: leitura (b), com as quatro propriedades da seção 2.3 como definição do
  property test de round-trip no ADR 0029.
- ADR 0037: parser base `pulldown-cmark`, com `default-features = false`,
  opções `ENABLE_WIKILINKS` e `ENABLE_YAML_STYLE_METADATA_BLOCKS`; `comrak`
  como fallback registrado; parser próprio como alternativa registrada,
  atrelada à leitura (a).
- A consequência do ADR 0012 que aponta para a Q18 ganha sua resposta.

**Deixa aberto** (inalterado por este memo; listado para o mantenedor ver que
escolher o parser não escolhe isto):

- Q3, Q4, Q22 — onde um `^id` pode ficar, seu escopo de unicidade, seu charset.
- Q5 — tipos de callout, fold, aninhamento.
- Q19 — casamento de heading. Q20 — links Markdown para arquivo local. Q21 —
  o que é um "bloco". Q23 — formas combinadas e escapes do wikilink.
- Q24, Q25 — fronteira do frontmatter, versão do YAML, CRLF, BOM, encoding. O
  **crate de YAML** é uma decisão de dependência nova para o PR da feature 1,
  com justificativa própria.
- Quais entradas o property test *gera* (a estratégia): detalhe de
  implementação do PR da feature 1, revisado pelo Opus 5 como código do core.
- Edição de frontmatter por formulário (seção 2.5): consequência para o ADR da
  nota tipada da Fase 2.

## 4. O que este memo não verificou

O mantenedor decide lendo, então os limites do que foi lido precisam estar
visíveis:

- Nenhum dos crates foi compilado ou executado neste repositório. Toda
  afirmação sobre comportamento vem de páginas do docs.rs, dos `Cargo.toml`
  dos crates e — para o tratamento de wikilink e embed do `pulldown-cmark` —
  do código-fonte do parser e de seus testes unitários, tudo lido em
  2026-09-21. Onde o memo diz "a confirmar no PR", é literal.
- A compilação para WASM dos dois crates é reportada a partir dos manifestos
  deles e do uso público, não de um `cargo check` aqui. O guardrail do
  ADR 0029 faz essa conferência no PR da feature 1 e é visto falhando antes.
- O tratamento de `![[…]]` pelo `comrak` e a precisão do seu `sourcepos`
  inline nas cinco fixtures não foram testados.
- Nenhuma medição sustenta a linha de desempenho da 3.2; é uma afirmação sobre
  os dois desenhos (parser pull versus árvore), a ser substituída pela
  baseline da feature 5.
- O comportamento do próprio Obsidian não foi consultado para este memo; nada
  aqui muda uma fixture nem responde a uma pergunta sobre o Obsidian
  (ADR 0009).

## 5. Como o mantenedor decide e verifica, sem ler código

**Conferir que o memo é o que o PR diz que é:**

```
git fetch origin && git checkout phase1/parser-decision
git diff --stat origin/main..HEAD          # dois arquivos, ambos em docs/, nada em crates/ nem fixtures/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # fixtures inalteradas continuam passando no lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # autor e Signed-off-by são seus
```

**Decidir, em duas linhas no PR:**

1. Q18: `(a)` ou `(b)`.
2. ADR 0037: `pulldown-cmark`, `comrak` ou `próprio`.

Combinações e sua consequência:

| Q18 | Parser | Consequência |
|---|---|---|
| (b) | `pulldown-cmark` | A recomendação. A feature 1 começa como orçada: crate base, passada do dialeto, teste de quatro propriedades, fuzz, conferência de WASM. |
| (b) | `comrak` | Mesma forma, uma camada a mais de dependências para justificar; `default-features = false` é obrigatório ou código C entra no build. |
| (b) | próprio | Permitido, mas paga o custo da seção 2.4 por nada que a (b) precise; o roadmap tem de crescer antes de a feature 1 começar. |
| (a) | próprio | Consistente. A feature 1 vira primeiro "um parser de CommonMark com árvore sem perda"; o roadmap e os critérios de saída da Fase 1 têm de ser revistos no mesmo PR, pelas consequências do ADR 0037. |
| (a) | `pulldown-cmark` ou `comrak` | Contradição: nenhum atende a (a) (seção 3.2). Par inválido. |

**Depois da decisão.** O mantenedor escolheu (b) e `pulldown-cmark` em sessão
em 2026-09-21 ("eu gostei das suas sugestões, pode seguir com elas"). As
edições de fechamento — spec §9 Q18, "Decisão" e "Status" do ADR 0037, a
consequência do ADR 0012, a tabela da Fase 1 do roadmap, briefing §9 e §17 —
estão no commit que segue o memo na mesma branch, para que a comparação e seu
desfecho sejam um só assunto.
