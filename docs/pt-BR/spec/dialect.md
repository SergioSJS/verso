# Spec do dialeto do Verso — v0.47

- Versão: v0.47 · 2026-10-21
- Fonte: `docs/BRIEFING.md` §11, §5.2, §4
- ADRs: [0030](../adr/0030-base-dialect-obsidian-compatible.md) (base compatível),
  [0031](../adr/0031-fixtures-as-contract.md) (fixtures),
  [0012](../adr/0012-files-are-source-of-truth.md) (abrir nunca reescreve)

## 1. O que esta versão é

v0 registra o que o briefing decidiu sobre o dialeto e marca, como `[ABERTO]`,
tudo que um parser precisa saber e que o briefing não responde. **Nenhuma
lacuna é preenchida por conta própria**: onde a spec diz `[ABERTO]`, a decisão é
do mantenedor.

v0 não é implementável ponta a ponta. É a lista do que precisa ser decidido
antes de `verso-dialect` existir, e o alvo contra o qual as fixtures são
escritas.

O comportamento normativo é o das fixtures, não o desta prosa. Onde os dois
divergirem, a fixture ganha e a spec é corrigida — **no mesmo PR**. Uma fixture
que responde a uma questão `[ABERTO]` da seção 9 só entra no PR que fecha a
questão, citando a fixture como resposta; a aprovação do mantenedor nesse PR é a
decisão ([ADR 0031](../adr/0031-fixtures-as-contract.md)). Fixture aprovada
sem esse passo não fecha questão nenhuma.

## 2. Regra de ouro

> O Verso estende o dialeto do Obsidian; nunca o contradiz. (§11.1)

Operacionalmente: nenhuma extensão pode mudar o significado de uma construção
que o Obsidian já interpreta. Um arquivo escrito pelo Verso abre no Obsidian sem
perda de sentido; um arquivo escrito pelo Obsidian abre no Verso sem conversão.

Violar isso é achado BLOQUEANTE em revisão.

## 3. Fontes admissíveis

Os termos de uso do Obsidian proíbem engenharia reversa para desenvolver produto
concorrente ([ADR 0009](../adr/0009-external-constraints.md)). Ao determinar o
comportamento a ser compatível, valem apenas:

- a API pública (`obsidian.d.ts`, MIT);
- a documentação pública;
- o comportamento observado de fora, pelo uso normal do app.

Nenhuma fixture, spec ou PR pode citar inspeção, descompilação ou desminificação
do binário como fonte.

## 4. Schema do `expected.yaml` `DECIDIDO`

Cada construção nas seções 5 e 6 traz o `input.md` e o recorte do
`expected.yaml` correspondente. O briefing (§11.4) nomeia só `target`, `alias`,
`heading` e `blocks[].id`; tudo o mais abaixo foi rascunhado pela IA na revisão
da Fase 0 (C7) e **valeu como `PROPOSTO` até 2026-09-21**, quando o mantenedor
aprovou as cinco primeiras fixtures, que seguem este schema (ADR 0031; PR das
fixtures). Fixture que não segue o schema é inválida.

### 4.1 Chaves de primeiro nível

| Chave | Conteúdo | Ausente significa |
|---|---|---|
| `frontmatter` | mapa com os valores YAML interpretados | não afirmado |
| `headings` | lista, em ordem de documento | não afirmado |
| `links` | lista de links do corpo, em ordem de documento | não afirmado |
| `embeds` | lista de embeds, em ordem de documento | não afirmado |
| `blocks` | lista de definições `^id`, em ordem de documento | não afirmado |
| `callouts` | lista, em ordem de documento | não afirmado |
| `property_links` | lista dos links que as propriedades do frontmatter guardam (Q10), na ordem escrita (§4.7) | não afirmado |
| `schemas` | lista dos blocos cercados `verso-schema`, os aninhados inclusive, na ordem do documento (§4.8) | não afirmado |
| `prose` | lista dos trechos de prosa da nota, na ordem do documento (§4.9) | não afirmado |
| `reader` | a nota como um UniVerso a serve a uma conta que só pode lê-la — a projeção dela, as linhas de cada callout secreto removidas (Q9; [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md) item 3) — como texto, byte a byte | não afirmado |
| `observed` | como o comportamento foi verificado no Obsidian | ver 4.5 |
| `source` | ADR ou questão que autoriza um comportamento próprio do Verso | ver 4.5 |

**Chave ausente não afirma nada.** Chave presente afirma de forma estrita: uma
chave de lista afirma a lista inteira — mesmo tamanho, mesma ordem, nenhum item
a mais —, de modo que `links: []` afirma que não há link, e a ordem de uma lista
é a ordem em que a construção aparece no arquivo. O `frontmatter:` é um mapa,
não uma lista, e é a única exceção: afirma cada chave que nomeia e não diz nada
sobre as chaves que não nomeia, então um frontmatter pode ter mais chaves do que
a fixture lista. Dentro de um item de lista, um campo **opcional** ausente
afirma que o campo está ausente, enquanto um `pos` ausente não afirma nada
(seções 4.2 e 4.3).

Decidido em 2026-09-21 pelo mantenedor, pela leitura estrita, fechando o item 3
de [`../review/phase-1-feature-1.md`](../review/phase-1-feature-1.md) §6. A
redação anterior — "o parser pode produzir mais do que a fixture pede, nunca
menos nem diferente" — é falsa para listas e saiu. Quem faz valer a regra é o
harness de fixtures (`crates/verso-dialect/tests/fixtures.rs`).

### 4.2 Itens de `links` e `embeds`

| Campo | Significado | Obrigatório |
|---|---|---|
| `target` | texto do alvo **como escrito**, sem resolver: `[[nota.md]]` dá `nota.md`, `[[pasta/nota]]` dá `pasta/nota`. Resolução para arquivo é Q12, fora do parser | sim; vazio (`""`) para `[[#seção]]` |
| `heading` | texto depois de `#`, sem `^`; caminho aninhado `a#b` fica como `a#b` até Q19 decidir | quando houver |
| `block` | texto depois de `#^` (responde Q1, `DECIDIDO`) | quando houver |
| `alias` | texto depois de `\|` | quando houver |
| `syntax` | `wikilink` (padrão, pode ser omitido) ou `markdown` (seção 5.13) | só para `markdown` |
| `pos` | posição do primeiro caractere da construção (4.4) | quando a fixture testa posição |

Um link com heading e alias tem os dois campos. Um link com heading e bloco
(`[[nota#seção#^id]]`) não é construção documentada pelo Obsidian; até Q19,
fixture nenhuma o usa.

### 4.3 Itens de `headings`, `blocks` e `callouts`

| Lista | Campos |
|---|---|
| `headings` | `level` (1–6), `text` (texto cru, sem `#` e sem espaços nas pontas), `pos` |
| `blocks` | `id` (sem `^`), `pos` (posição do `^`), `lines` (`[primeira, última]`, as linhas do bloco que o id nomeia; conferido quando dado — Q3, Q21) |
| `callouts` | `kind` (texto entre `[!` e `]`, como escrito), `title` (resto da primeira linha, sem espaços nas pontas; ausente se vazio), `fold` (`-`, `+`, ou ausente), `depth` (opcional, afirmado quando dado: quantos callouts o envolvem, ele incluído, de 1 a 32 — Q5), `pos` |

### 4.4 Posição

```yaml
pos: { line: 12, col: 5 }
```

`line` e `col` começam em 1. `col` conta **caracteres Unicode** (scalar values),
não bytes nem unidades UTF-16, para que o número seja o mesmo no parser Rust e
no editor. A posição é do primeiro caractere da construção (`[` de `[[`, `!` de
`![[`, `^` de `^id`, `#` do heading, `>` da primeira linha do callout).

Posição existe porque a citação verificável é decisão
([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)) e bloco sem `^id` é citado
por posição. Fixture sem `pos` não testa posição; pelo menos uma fixture por
construção precisa testar. As cinco primeiras fixtures têm só texto ASCII antes
da construção, então ainda não distinguem caracteres de bytes; uma fixture com
prefixo não-ASCII é necessária antes de a unidade ser exercitada
(`docs/reference/obsidian-cli.md` §4).

### 4.5 Origem da observação

Toda fixture que afirma comportamento compatível com o Obsidian registra como o
comportamento foi observado, pela regra de fontes admissíveis (seção 3):

```yaml
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: "colar o input numa nota nova; ver o painel de backlinks da nota alvo"
```

`version` é texto livre: versão do app, do instalador e sistema operacional
quando importarem. `how` é prosa, repetível por outra pessoa; o CLI do Obsidian
(`docs/reference/obsidian-cli.md`) a transforma em comandos.

Fixture de comportamento **próprio** do Verso (seção 6) omite `observed` e
cita o ADR ou a questão que a autoriza em `source:`.

### 4.6 Fora do schema

Não existe campo para tags inline nem resolução de link: cada um entra no
schema quando a questão correspondente fechar, com PR que atualiza esta
seção. A relação tipada entrou com a Q10, como `property_links` (§4.7,
v0.23); a visibilidade por bloco com a Q9, como `reader` (§4.1, v0.42): um
callout secreto aparece em `callouts` como qualquer callout, e `reader` é o
que um leitor recebe da nota.

### 4.7 Itens de `property_links`

Um link que uma propriedade do frontmatter guarda — a relação tipada da Q10:
um wikilink entre aspas como valor, ou como item de uma lista.

| Campo | Significado | Obrigatório |
|---|---|---|
| `property` | a chave de topo que o guarda, como escrita (uma chave entre aspas sem as aspas) | sim |
| `item` | a posição na lista, a partir de 0, quando o valor é uma lista | quando o valor é uma lista |
| `target`, `heading`, `block`, `alias` | como na §4.2 | como na §4.2 |
| `pos` | posição do primeiro `[` do link (4.4) | quando a fixture testa posição |

Acrescentado em 2026-10-01 pela decisão do mantenedor sobre a revisão crítica
[`../review/board.md`](../review/board.md), §6 item 2, com a fixture
rascunhada `fixtures/frontmatter/property-links`, aprovada em 2026-10-02.

### 4.8 Itens de `schemas`

O schema de um tipo: um bloco de código cercado cuja linguagem é
`verso-schema`, com YAML dentro (seção 6, Q11;
[ADR 0052](../adr/0052-typed-note.md)). Só um bloco no topo de uma nota é
lido; um dentro de um item de lista ou de uma citação é relatado como
aninhado, e não é lido.

| Campo | Significado | Obrigatório |
|---|---|---|
| `type` | o nome que as notas escrevem no seu próprio `type:`, como escrito | para um bloco lido |
| `labels` | o nome do tipo por idioma da interface, um mapa como escrito (`{ pt-BR: PdM, en: NPC }`); ausente afirma nenhum | não |
| `layout` | o layout que o schema nomeia no topo: `infobox` ([ADR 0086](../adr/0086-infobox-a-typed-notes-card.md) item 2); um valor que esta versão não conhece não é layout nem erro; ausente afirma nenhum | não |
| `properties` | as propriedades declaradas, em ordem, cada uma com `key`, `kind` (`text`, `list`, `number`, `checkbox`, `date`, `datetime`, `link`, `image`) e `labels` (como acima); ausente afirma nenhuma | não |
| `error` | por que um bloco no topo não tipa nada: `yaml`, `not_a_mapping`, `no_type`, `label`, `properties`, `property` (sem `key` ou sem `kind`), `unknown_kind`, `duplicate_key` | quando não tipa |
| `nested` | `true` para um bloco dentro de um item de lista ou de uma citação; ausente afirma o topo | para um bloco aninhado |
| `pos` | posição do primeiro caractere da cerca de abertura (4.4) | quando a fixture testa posição |

Um bloco aninhado ou que não tipa nada não tem `type`, `labels` nem
`properties`. Acrescentado em 2026-10-07 com a implementação do ADR 0052
(`docs/reference/typed-note-decision.md` §8, linhas 1 e 2), com as
fixtures rascunhadas `fixtures/schema/top-level` e
`fixtures/schema/nested-and-invalid`, aprovadas em 2026-10-07.

Revisado em 2026-10-14 com a implementação do
[ADR 0086](../adr/0086-infobox-a-typed-notes-card.md) (itens 1, 2 e 5):
dois tipos de valor, `link` — um wikilink entre aspas ou uma lista deles,
a relação tipada da Q10 — e `image` — um wikilink entre aspas para uma
imagem da pasta, um caminho da pasta que termina na extensão de uma
imagem, ou um endereço `http(s)`; e a chave de topo `layout`, cujo único
valor é `infobox`. Um valor que não cabe no seu tipo é mostrado como
escrito e marcado (ADR 0052 ponto 6): um wikilink ou um caminho para uma
nota não é uma imagem. A fixture `fixtures/schema/infobox` foi aprovada
pelo mantenedor em 2026-10-14 (v0.41).

### 4.9 Itens de `prose`

Os trechos de texto que a Leitura mostra como palavras — onde o nome de
uma nota escrito sem link é uma menção dela
([ADR 0089](../adr/0089-linking-unlinked-mentions.md) item 1;
`verso_dialect::prose`). É prosa o texto de um título, de um parágrafo, das
células de uma tabela e o texto dentro de HTML inline; não é o
frontmatter, código (inline ou cercado), um `%%comentário%%`, um wikilink,
um embed, o rótulo de um link Markdown, matemática (inline ou em bloco), um
bloco de HTML, uma `#tag` (as palavras em volta continuam prosa), nem uma
entidade (`&amp;`), deixada de fora inteira porque os bytes dela não são o
texto que ela representa. Pedaços de um trecho que se tocam são um item só.

| Campo | Significado | Obrigatório |
|---|---|---|
| `text` | o trecho como escrito na fonte | sim |
| `table` | `true` para um trecho numa célula de tabela, onde o `\|` de um link encerraria a célula; ausente afirma fora de tabela | para um trecho em tabela |
| `pos` | posição do primeiro caractere do trecho (4.4) | quando a fixture testa posição |

Acrescentado em 2026-10-14 pela resposta M6 do mantenedor (*"Sim,
todas"*), com a fixture `fixtures/prose/what-is-prose`, aprovada pelo
mantenedor no mesmo dia (v0.41).

---

## 5. Base compatível com o Obsidian `DECIDIDO`

### 5.1 Frontmatter YAML

Bloco YAML delimitado por `---` na primeira linha do arquivo, incluindo `tags` e
`aliases`.

```markdown
---
title: Barão Vermelho
tags: [npc, nobreza]
aliases:
  - o barão
  - Lorde Vermelho
---

O barão governa o distrito norte.
```

```yaml
frontmatter:
  title: Barão Vermelho
  tags: [npc, nobreza]
  aliases: [o barão, Lorde Vermelho]
```

- O frontmatter é preservado byte a byte na leitura: ordem de chaves,
  comentários, estilo de aspas e indentação não podem ser normalizados
  ([ADR 0012](../adr/0012-files-are-source-of-truth.md)).
- `tags` e `aliases` são reconhecidos pelo índice; as demais chaves são
  preservadas sem interpretação.
- Forma aceita de `tags` (lista, string separada por espaços, ambas) e de
  `aliases`: `[ABERTO]`.

### 5.2 Wikilink simples

```markdown
Encontramos o [[Barão Vermelho]] na entrada.
```

```yaml
links:
  - target: Barão Vermelho
```

### 5.3 Wikilink com alias

```markdown
Encontramos [[Barão Vermelho|o barão]] na entrada.
```

```yaml
links:
  - target: Barão Vermelho
    alias: o barão
```

### 5.4 Wikilink para seção

```markdown
Ele se escondeu na [[Taverna#Porão]].
```

```yaml
links:
  - target: Taverna
    heading: Porão
```

### 5.5 Wikilink para bloco

```markdown
Ele repetiu o que disse em [[Sessão 3#^juramento]].
```

```yaml
links:
  - target: Sessão 3
    block: juramento
```

O nome do campo para referência de bloco não aparece no briefing; `block` é a
resposta a Q1 (seção 4.2), decidida com a aprovação de `fixtures/wikilink/block-reference`.

### 5.6 Embed

```markdown
![[Mapa da Taverna.png]]

![[Sessão 3#^juramento]]
```

```yaml
embeds:
  - target: Mapa da Taverna.png
  - target: Sessão 3
    block: juramento
```

Em embed de imagem, `![[img.png|300]]`, o texto depois de `|` é tamanho, não
alias, pela documentação pública do Obsidian. Como o `expected.yaml` registra
isso: Q23.

Embed e link são construções distintas no `expected.yaml`. Se um embed também
conta como link no grafo e nos backlinks: `DECIDIDO` em 2026-10-21, sim, marcado como embed (seção 9, Q2).

### 5.7 Definição de bloco

```markdown
Ele jurou vingança. ^juramento
```

```yaml
blocks:
  - id: juramento
```

A mesma sintaxe no fim de um item de lista define o bloco daquele item:

```markdown
- Ele jurou vingança. ^juramento
- Ela riu.
```

```yaml
blocks:
  - id: juramento
    pos: { line: 1, col: 23 }
```

`pos` é a posição do `^` (seção 4.3), contada em caracteres (seção 4.4):
coluna 23 aqui, e 24 se fosse contada em bytes, por causa do `ç` de
"vingança".

O que um `^id` nomeia é a seção de nível superior em que a linha dele está
— um parágrafo, um heading, uma tabela, um bloco de código, uma citação ou
um callout inteiros, seja o que for que na citação segure o id — exceto em
lista, onde é o item de lista mais interno em que a linha está, inteiro, com
os itens aninhados (Q21): o id pode terminar a primeira linha do item, um
parágrafo posterior do item, ou ficar sozinho sob uma lista aninhada ou
depois de um bloco de código no item, e nomeia esse item; um `^id` num item
aninhado nomeia o item aninhado. Um `^id` dentro de um bloco de código ou
de um bloco HTML nunca é um (seção 5.9). Sozinho na sua linha no nível
superior, depois de uma linha em branco, nomeia o bloco de antes; sem nada
antes, não nomeia nada.

O ID estável de bloco, com backlinks e presença no grafo, é primitiva proposta
([ADR 0014](../adr/0014-primitives-catalog.md)). A **sintaxe** `^id` é
compatível e decidida; o que o Verso faz com ela vai além do Obsidian.

Toda posição está decidida (seção 9, Q3, Q4, Q21): a última palavra de um
parágrafo ou de um item de lista (2026-09-21, `fixtures/block/definition`,
`fixtures/block/list-item`); um `^id` sozinho numa linha depois de uma linha
em branco, que nomeia o bloco de antes, e o fim da linha de um heading, que
nomeia o heading (2026-10-07, `fixtures/block/after-a-block`,
`fixtures/block/heading`); um `^id` dentro de uma citação, que nomeia a
citação inteira, dentro de uma lista, que nomeia o item mais interno, e
sozinho sem nada antes, que não nomeia nada (2026-10-07,
`fixtures/block/in-quote`, `fixtures/block/in-list`,
`fixtures/block/alone-top`). Um id é único por nota; com dois, o último
nomeia o bloco (`fixtures/block/duplicate`). De dois `^id` sozinhos em
sequência, só o último nomeia o bloco antes deles, como no Obsidian
(2026-10-09, `fixtures/block/two-alone`). `lines` (seção 4.3) diz qual
bloco um id nomeia.

O id não aparece na leitura, e um `^id` sozinho na sua linha sai junto com
o bloco que nomeia; o editor o mostra, apagado. É assim que o Obsidian
1.14.4 o desenha (observado em 2026-10-07: modo de leitura e Live Preview);
é como o id é desenhado, não o que ele nomeia. Um `^id` que não nomeia nada
fica como escrito na leitura do Verso; como o Obsidian desenha essa linha
não foi observado.

### 5.8 Callout

```markdown
> [!warning] Segredo do mestre
> O barão já está morto. O que anda pela cidade não é ele.
```

```yaml
callouts:
  - kind: warning
    title: Segredo do mestre
```

Quais tipos de callout são reconhecidos, o comportamento de `-`/`+` (recolhido
ou expandido) e o aninhamento: `DECIDIDO` (seção 9, Q5; o aninhamento em 2026-10-21).

Um callout do tipo `secret` é o segredo do mestre (seção 9, Q9,
`DECIDIDO` em 2026-10-14, [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md)):
no arquivo, no Obsidian e numa pasta do computador é um callout como
qualquer outro, o significado dele inalterado; um UniVerso serve a nota a
uma conta que só pode lê-la como uma projeção sem o bloco. *(Até a v0.38
isto dizia que callout não é o mecanismo, a visibilidade por bloco tendo
sintaxe própria, `[ABERTO]`.)*

### 5.9 Link dentro de código não é link

````markdown
Escreva `[[isto não é link]]` para criar um link.

```text
[[isto também não é]]
```
````

```yaml
links: []
```

Vale para código inline (crase) e bloco de código (cercado). O briefing exige as
duas categorias nas fixtures mínimas.

Bloco de código indentado por 4 espaços, HTML embutido e `%%comentário%%`:
`DECIDIDO` em 2026-10-21 (seção 9, Q6).

### 5.10 Nome de nota com acento e espaço

```markdown
Passamos pela [[Ilha da Preguiça]] e pelo [[Café São João|café]].
```

```yaml
links:
  - target: Ilha da Preguiça
  - target: Café São João
    alias: café
```

Normalização Unicode na comparação de nomes (NFC × NFD: arquivos vindos de
HFS+, de outras plataformas e de sync misturam as duas formas; o APFS preserva a
forma recebida e faz busca insensível à normalização): `DECIDIDO` em
2026-10-10 — um nome é um arquivo só em todo lugar, o servidor comparando nomes
em NFC (seção 9, Q7). Sensibilidade a maiúsculas: `DECIDIDO` em 2026-10-21 (seção 9, Q8).

### 5.11 `.canvas` (JSON Canvas)

Arquivos `.canvas` no formato JSON Canvas são lidos e escritos sem quebrar. O
formato é de terceiros e não é redefinido aqui.

Como o Verso estende o JSON Canvas e persiste o board: `DECIDIDO` em
2026-09-30 ([ADR 0057](../adr/0057-board-json-canvas.md), fechando o [ADR 0040](../adr/0040-board-persistence.md)).

1. Um board é um `.canvas`. O desenho livre do Verso mora no mesmo arquivo sob
   a chave de topo `verso`: `{"version": 1, "drawing": [ … ]}`, cujo
   `drawing` é uma lista de elementos do Excalidraw. Não existe tipo de nó ou
   de aresta do próprio Verso: o Obsidian apaga um nó de tipo que não conhece
   (`docs/reference/board-decision.md` §3.2, O5).
2. Uma aresta promovida a relação tipada (Q10) leva
   `"verso": {"relation": "<chave>"}` e a chave como `label`.
3. Abrir um `.canvas` não escreve nada. Escrever um mantém todo campo que o
   Verso não conhece, a ordem de chaves lida e o layout do Obsidian: um objeto
   ou array cujos valores são todos escalares numa linha, qualquer outro com
   uma entrada por linha, indentação com tab, e a quebra de linha final como o
   arquivo a tinha (nenhuma num arquivo que o Verso cria). Um valor que o
   usuário não mudou é escrito como foi lido, fração inclusive; a geometria
   que o usuário mudou é escrita em números inteiros. Um arquivo em outro
   layout só é reescrito neste depois de o usuário ver o diff (ADR 0057
   ponto 13).
4. Para o índice, os nós `file` de um canvas e os links dos seus nós `text`
   são links a partir do canvas (Q16). Um nó `file` nomeia um caminho a partir
   da raiz da pasta, nunca um nome procurado em outro lugar (ADR 0057
   ponto 11).
5. Os campos próprios do Verso num canvas (ADR 0057 pontos 10 e 17), cada um
   escrito só quando não é o padrão do board:
   - o `verso` de topo: `version` (1), `drawing`, `background`;
   - um elemento de `verso.drawing`: `under`, o id do nó sob o qual ele
     fica;
   - o `verso` próprio de um nó: `background`, `fill`, `corners`,
     `strokeWidth`, `roughness`, `angle`, `strokeStyle`, `opacity`,
     `locked`, `groups` e, para mapas
     ([ADR 0090](../adr/0090-maps-on-the-board.md)), `map`, `pin`,
     `secret` (item 6);
   - o `verso` próprio de uma aresta: `relation`, `line` (`curved` ou
     `elbow`), `strokeWidth`, `roughness`, `startHead`, `endHead`, `bends`,
     `labelSize`, `labelFont`, `strokeStyle`, `opacity`, `locked`,
     `groups`.

   Um `verso.version` acima do que um build escreve é um board de um Verso
   mais novo: mostrado, nunca escrito.
6. Mapas ([ADR 0090](../adr/0090-maps-on-the-board.md), `DECIDIDO` em
   2026-10-14). Um mapa é um board: nenhum arquivo `.map` e nenhum tipo de
   nó do próprio Verso, de modo que o Obsidian o abre como um canvas com uma
   imagem e cartões.
   - Um nó `file` de uma imagem marcado `"verso": {"map": true}` é a imagem
     de um mapa. "Usar como mapa" põe essa marca, `"locked": true` e o nó no
     fundo da ordem dos nós (a ordem de empilhamento); "Deixar de usar como
     mapa" tira as três. Um board pode ter vários.
   - Um nó `file` de uma nota marcado `"verso": {"pin": true}` é um
     alfinete: a janela o desenha num só tamanho na tela, em qualquer zoom,
     no meio da sua caixa, e um clique abre a nota. Os alfinetes de um mapa
     estão no grupo dele (`verso.groups`), então mover o mapa os move.
   - Um nó marcado `"verso": {"secret": true}` não é servido a quem só pode
     ler o board num UniVerso (a regra do ADR 0087, aplicada a um board): o
     leitor recebe o board sem esse nó, sem as arestas que o tocam e sem os
     elementos do desenho que ficam sob ele, estão presos a ele ou têm um
     grupo que só nós secretos têm (um grupo que também tem um nó que não é
     secreto, como o mapa a que um alfinete está agrupado, não esconde
     nada). Qualquer valor de `secret` que não seja `false` ou `null`
     conta. Um board sem nó secreto é servido byte a byte; um que não é
     JSON e menciona um segredo é servido vazio. Quem tem o arquivo, e o
     Obsidian, vê o nó: é uma guarda contra leitores num servidor, não
     criptografia.
   - Uma imagem PNG grande é desenhada de ladrilhos do próprio Verso,
     cortados uma vez e guardados fora da pasta; o arquivo não tem nenhum
     ladrilho.
7. Um card de Markdown num board é um card de Markdown ([ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md),
   decidido pelo mantenedor em 2026-10-15): um callout `> [!secret]` dentro
   do `text` de um nó `text` fica escondido de quem só pode ler, pela mesma
   projeção de uma nota (§5.8), em toda saída que serve o board. Um card cujo
   texto fica vazio permanece, vazio, com seu lugar e suas arestas. Um
   arquivo `.txt`, e qualquer arquivo que não é Markdown, não é projetado:
   é servido como está.

### 5.12 Headings

Não estão na lista do briefing §11.1, mas a feature 1 da Fase 1 os parseia
("links, blocos, **headings** e frontmatter") e `[[nota#seção]]` precisa deles
para resolver. Acrescentado na revisão da Fase 0 (L1).

```markdown
# Taverna

## Porão

Texto.
```

```yaml
headings:
  - level: 1
    text: Taverna
    pos: { line: 1, col: 1 }
  - level: 2
    text: Porão
    pos: { line: 3, col: 1 }
```

Como o texto de `[[nota#seção]]` casa com um heading (maiúsculas, pontuação,
formatação inline, emoji, headings duplicados, caminho aninhado
`[[nota#Cap 1#Seção]]`): `DECIDIDO` em 2026-10-21 (seção 9, Q19).

Um heading no estilo setext — uma linha de texto sublinhada com `===` ou
`---` — é heading, como o Obsidian o reporta. `DECIDIDO` em 2026-09-29 pelo
mantenedor, que aprovou na sessão a fixture abaixo (Q19, parte setext).
Observado em 2026-09-29 com a
CLI do Obsidian
([`docs/reference/obsidian-cli.md`](../reference/obsidian-cli.md), admissível
pelo [ADR 0009](../adr/0009-external-constraints.md)), lendo
`app.metadataCache.getCache(...).headings` de uma nota de teste no cofre
Sandbox: `Taverna` sobre `===` é nível 1; `Porão` sobre `---` é nível 2; e um
`---` logo abaixo de uma linha de texto, sem linha em branco entre os dois,
faz dessa linha um heading de nível 2 e nunca é lido como quebra temática. A
posição é a da linha do texto. A fixture `fixtures/heading/setext` registra
isso, e o `verso-dialect` reporta headings setext de acordo. Esta é a parte
setext da Q19, respondida por observação; o mantenedor aprovou essa fixture
em 2026-09-29, na sessão ("ratifique o que precisar", respondendo à lista do
que estava pendente, que a nomeava), e a primeira linha dela agora registra
a aprovação (seção 1; [ADR 0031](../adr/0031-fixtures-as-contract.md)). A
parte do casamento da Q19 estava `[ABERTO]`; decidida em 2026-10-21 (seção 9, Q19).

### 5.13 Links Markdown para arquivo local `PROPOSTO`

A documentação pública do Obsidian resolve `[texto](nota.md)` como link interno,
e o app pode ser configurado para gravar essa forma em vez de wikilink. Um vault
inteiro pode não ter um único `[[ ]]`. Acrescentado na revisão da Fase 0 (L2).

```markdown
Veja [o barão](Barão%20Vermelho.md) e [a taverna](<Taverna.md#Porão>).
```

```yaml
links:
  - target: Barão Vermelho.md
    alias: o barão
    syntax: markdown
  - target: Taverna.md
    heading: Porão
    alias: a taverna
    syntax: markdown
```

Proposta: contam como link, com `syntax: markdown` e `target` já decodificado
de URL-encoding. Detalhes — `<...>` com espaços, caminho relativo `../`, o que
separa link local de URL externa, imagem `![](img.png)` como embed —
`DECIDIDO` em 2026-10-21 (seção 9, Q20). O briefing não lista essa forma; a
decisão é do mantenedor.

---

## 6. Extensões do Verso

Nada nesta seção estava decidido até 2026-09-24, quando o mantenedor decidiu
a nota tipada, os schemas dela e os rótulos deles por idioma
([ADR 0052](../adr/0052-typed-note.md); Q11). O resto é `PROPOSTO` ou
`[ABERTO]`, e nada pode contradizer a seção 5.

| Extensão | Forma | Status |
|---|---|---|
| Nota tipada | `type:` no frontmatter nomeia um schema da pasta, comparado como a Q12 compara nomes de nota; sem schema, é Markdown comum | `DECIDIDO` em 2026-09-24 ([ADR 0052](../adr/0052-typed-note.md)) |
| Proveniência de escrita | autor, modelo e quando, no frontmatter | `PROPOSTO` ([ADR 0014](../adr/0014-primitives-catalog.md)) |
| Views materializáveis | saída de consulta escrita como Markdown real no arquivo | `PROPOSTO` ([ADR 0014](../adr/0014-primitives-catalog.md)) |
| i18n de schema | chave neutra de idioma com rótulo traduzido (`type: npc` exibido como "PdM" ou "NPC") | `DECIDIDO` em 2026-09-24 ([ADR 0052](../adr/0052-typed-note.md): um `label` por idioma da interface) |
| Relação tipada | uma propriedade do frontmatter da nota de origem cujo valor é um wikilink entre aspas ou uma lista deles; a chave é o tipo | `DECIDIDO` em 2026-09-30 (Q10, [ADR 0057](../adr/0057-board-json-canvas.md)) |
| Schemas | um bloco cercado `verso-schema` numa nota, em qualquer lugar da pasta menos caminhos ocultos e ignorados | `DECIDIDO` em 2026-09-24 (Q11) |
| Tipos `link` e `image` de um schema, e o seu layout | uma propriedade do schema do tipo `link` (um wikilink entre aspas ou uma lista deles) ou `image` (o wikilink, o caminho ou o endereço da web de uma imagem); `layout: infobox` no topo do schema desenha as propriedades da nota como um cartão ao lado do texto. Frontmatter comum: uma nota aberta no Obsidian mostra as suas propriedades como o Obsidian mostra | `DECIDIDO` em 2026-10-14 ([ADR 0086](../adr/0086-infobox-a-typed-notes-card.md)) |
| Visibilidade por bloco | segredo do mestre: um callout do tipo `secret` (`> [!secret]`), um callout no arquivo; um UniVerso serve aos leitores a nota sem ele | `DECIDIDO` em 2026-10-14 (Q9, [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md)) |
| Dados e tabelas sorteadas | a forma inline do plugin Dice Roller do Obsidian, `` `dice: 1d20+3` `` ou `` `dice: [[Nota#^id]]` ``: código inline para o dialeto (§5.9, nenhum link nele), desenhado pela janela como um dado; uma tabela ou uma lista com um `^id` é uma tabela sorteada, e uma primeira coluna cujo cabeçalho é um dado (`d100`) guarda a faixa de cada linha | `DECIDIDO` em 2026-10-14 ([ADR 0088](../adr/0088-dice-and-random-tables.md); fixture `code/dice-inline`, um rascunho da IA) |
| Figurinha e cor | `sticker:` nas formas do make.md — `emoji//<hex>`, `lucide//<nome>`, `ui//<nome>` — escritas pelo Verso como o make.md as escreve, ou um emoji escrito como ele mesmo, lido; outro valor não é figurinha. `color:` um hex, como o Verso escreve, ou uma cor CSS, lida. No frontmatter de uma nota ou nota de pasta | `DECIDIDO` em 2026-10-02 ([ADR 0060](../adr/0060-makemd-organizing-features.md)) |
| Capa com reposicionamento | `banner:` (um caminho da pasta ou uma URL) e `banner_y:` (a posição vertical, uma porcentagem de 0 a 100 escrita como texto, `"42"` — como o reposicionar do make.md a escreve, lido no código dele e observado pelo escritor de propriedades dele, 2026-10-02) no frontmatter de uma nota ou nota de pasta | `DECIDIDO` em 2026-10-02 ([ADR 0060](../adr/0060-makemd-organizing-features.md)) |
| Ordem manual na pasta | `order:` no frontmatter da nota de pasta, uma lista de nomes relativos definindo a ordem; sem `order:`, a alfabética; com a árvore em ordem alfabética, todo `order:` é mantido e ignorado. A da raiz, numa nota na raiz com o nome da pasta aberta (o lugar: `PROPOSTO`, do autor, a confirmar) | `DECIDIDO` em 2026-10-02 ([ADR 0060](../adr/0060-makemd-organizing-features.md)) |
| Itens fixados na pasta | `pinned:` no frontmatter da nota de pasta, uma lista de wikilinks entre aspas formando a relação tipada `pinned` | `DECIDIDO` em 2026-10-02 ([ADR 0060](../adr/0060-makemd-organizing-features.md)) |
| Padrões de itens da pasta | `items_sticker:`, `items_color:` e `items_template:` no frontmatter da nota de pasta, herdados por novos itens criados na pasta | `DECIDIDO` em 2026-10-02 ([ADR 0060](../adr/0060-makemd-organizing-features.md)) |
| Cartão de statblock | um bloco de código cercado, ```` ```statblock ````, com YAML nos nomes de chave do Fantasy Statblocks; com a funcionalidade Statblocks ligada ([ADR 0103](../adr/0103-feature-presets-and-capability-flags.md)) o Verso desenha um cartão; o Obsidian mostra um bloco de código, ou o cartão do plugin Fantasy Statblocks quando instalado | `DECIDIDO` em 2026-10-20 ([ADR 0099](../adr/0099-visual-markdown-statblocks-and-cards.md) item 1; `monster:` e `extends:` são `[PROPOSTO]`) |
| Callout de oráculo | um callout do tipo `oracle` (`> [!oracle] Pergunta`), as linhas de resposta no corpo dele; com a funcionalidade Oráculos ligada o Verso acrescenta os botões do oráculo a ele; o Obsidian desenha um callout | `DECIDIDO` em 2026-10-20 ([ADR 0102](../adr/0102-creative-oracles-and-improvisation.md) item 4) |

Exemplo de nota tipada:

```markdown
---
type: npc
title: Barão Vermelho
---

O barão governa o distrito norte.
```

E do schema que a tipa, um bloco em qualquer nota da pasta — a prosa em volta
do bloco é para pessoas e agentes (Q11):

```verso-schema
type: npc
label: { pt-BR: PdM, en: NPC }
properties:
  - key: facção
    kind: text
    label: { pt-BR: Facção, en: Faction }
  - key: nível
    kind: number
    label: { pt-BR: Nível, en: Level }
```

Um vault do Obsidian que já use `type:` no frontmatter para outra finalidade
continua válido: sem schema correspondente na pasta, a nota é Markdown comum.

Exemplo de frontmatter de organização em uma nota:

```markdown
---
sticker: emoji//1f680
color: "#e8590c"
banner: assets/diagrama.svg
banner_y: "42"
---
```

E na nota de uma pasta (`Projetos/Projetos.md`):

```markdown
---
order:
  - "Projeto Alpha.md"
  - "Projeto Beta.md"
pinned:
  - "[[Projeto Alpha]]"
items_sticker: emoji//1f4dd
items_color: "#1971c2"
items_template: "Templates/Nota de Reunião.md"
---
```

Restrições que qualquer extensão precisa respeitar:

1. Degrada para Markdown legível em qualquer editor
   ([ADR 0013](../adr/0013-degrades-to-markdown.md), `DECIDIDO` em
   2026-09-24).
2. Não muda o significado de construção existente (seção 2).
3. Sobrevive a round-trip sem reescrever o arquivo
   ([ADR 0012](../adr/0012-files-are-source-of-truth.md)).

---

## 7. Divergências em relação ao Obsidian

Divergência aqui significa: o Verso faz diferente **de propósito**, com o efeito
registrado. Nenhuma delas muda como um arquivo existente é interpretado.

| # | Assunto | Obsidian | Verso | Status | Efeito para quem vem do Obsidian |
|---|---|---|---|---|---|
| D1 | Unidade de trabalho | vault, criado explicitamente | qualquer pasta aberta, sem vault | `DECIDIDO` ([0010](../adr/0010-folder-is-the-unit-no-vault.md)) | Nenhum no arquivo. O vault continua abrindo |
| D2 | Configuração | `.obsidian/` dentro da árvore | fora da árvore, indexada pelo caminho da pasta | `DECIDIDO` ([0011](../adr/0011-config-outside-tree-index-as-cache.md)) | `.obsidian/` é ignorado, não apagado; conversão explícita, com diff |
| D3 | Campo inline do Dataview | `chave:: valor` no corpo | frontmatter | `PROPOSTO` (§11.2) | Conversão explícita, com diff. O Verso não interpreta `chave:: valor` nativamente |
| D4 | Desenho do Excalidraw | `.excalidraw.md` do plugin | formato do board do Verso, um `.canvas` (§5.11) | `DECIDIDO` em 2026-09-30 ([ADR 0057](../adr/0057-board-json-canvas.md)) | Conversão explícita, com diff; o desenho fica como estava |
| D5 | ID de bloco | usado para referência | além disso, gera backlink e aparece no grafo | `PROPOSTO` ([0014](../adr/0014-primitives-catalog.md)) | Ganho, não perda: a sintaxe é a mesma |
| D6 | Consulta | plugin de terceiro (Dataview) | consulta nativa por tipo, propriedade e relação; view pode materializar em Markdown | `PROPOSTO` ([0014](../adr/0014-primitives-catalog.md)) | Notas com blocos `dataview` não são executadas pelo Verso |
| D7 | Plugins | API síncrona, acesso a disco | TypeScript em Web Worker, sem disco, capabilities declaradas | Execução: `DECIDIDO` ([0016](../adr/0016-plugins-execution-and-capabilities.md)). Shim: `PROPOSTO` ([0017](../adr/0017-plugins-format-shim-loading.md)) | Plugin de Obsidian não roda. Se o shim proposto existir, cobre só a API pública, com tabela declarada |

Sobre D2, D3 e D4: conversão **só por ação do usuário, com diff visível**. Abrir
um arquivo nunca o reescreve ([ADR 0012](../adr/0012-files-are-source-of-truth.md)).

O que o Verso ainda **não** define e o Obsidian define — resolução de link
ambíguo, tags inline, busca — está na seção 9, não aqui. As notas periódicas
são do [ADR 0093](../adr/0093-periodic-notes.md), que aceitou o comportamento.

---

## 8. Fixtures

O contrato de comportamento são as fixtures
([ADR 0031](../adr/0031-fixtures-as-contract.md)):

```
fixtures/<categoria>/<caso>/input.md
fixtures/<categoria>/<caso>/expected.yaml
```

Categorias mínimas, do briefing §11.4:

| Categoria | Coberta pela seção |
|---|---|
| wikilink simples | 5.2 |
| wikilink com alias | 5.3 |
| wikilink com heading | 5.4 |
| wikilink com `#^bloco` | 5.5 |
| embed `![[...]]` | 5.6 |
| definição de bloco `^id` | 5.7 |
| link em código inline e em bloco de código | 5.9 |
| frontmatter com `tags` e `aliases` | 5.1 |
| nome de nota com acento e espaço | 5.10 |

Categorias acrescentadas na revisão da Fase 0, fora do mínimo do briefing:

| Categoria | Coberta pela seção | Status |
|---|---|---|
| heading | 5.12 | exigida pela feature 1 da Fase 1 |
| link Markdown para arquivo local | 5.13 | `PROPOSTO` |
| posição (`pos`) em pelo menos uma fixture por construção | 4.4 | exigida por [ADR 0018](../adr/0018-llm-native-mcp-in-core.md) |
| schema (um bloco `verso-schema`) | 4.8, 6 | rascunhada em 2026-10-07 com a implementação do ADR 0052, aprovada no mesmo dia; `schema/infobox` rascunhada em 2026-10-14 com a do ADR 0086, aprovada no mesmo dia |
| visibilidade por bloco (um callout `[!secret]`) | 4.1, 5.8, 6 | `callout/secret` rascunhada em 2026-10-14 com a implementação do ADR 0087, aprovada pelo mantenedor em 2026-10-15 |

Qualquer fixture pode ser rascunhada pela IA; só vale com a aprovação do
mantenedor no PR que a adiciona (ADR 0031). Rascunho diz que é rascunho na
primeira linha do `expected.yaml` (`# AI draft ...`); a aprovação substitui essa
linha. As cinco primeiras seguem o schema da seção 4 e, aprovadas, o confirmam.
`scripts/check-fixtures.sh` confere o layout de cada fixture e que cada chave é
uma das do schema, sob o pai que o schema lhe dá; os valores são a aprovação do
mantenedor e os testes da Fase 1.

**`expected.yaml` só muda com aprovação explícita do mantenedor.** Se uma
fixture parecer errada, o autor para e pergunta.

---

## 9. Questões em aberto

Cada questão precisa de resposta do mantenedor antes de o comportamento
correspondente ser implementado. Nenhuma tem resposta no briefing.

### Do briefing (§11.3, §17)

- **Q9. Sintaxe de visibilidade por bloco (segredo do mestre).** `DECIDIDO`
  em 2026-10-14.
  Decidir antes de compartilhamento e exportação (§17 item 8). Precisa
  sobreviver a abrir o arquivo no Obsidian sem vazar o segredo nem quebrar o
  texto. Depende disso a visão de jogador e o mapeamento para permissão de
  journal no Foundry ([ADR 0036](../adr/0036-tabletop-rpg-support.md)).

  **Decidido em 2026-10-14 pelo mantenedor**, aceitando o
  [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md) e o item 8
  dele (*"Sim, todas"*, todas as recomendações): a visibilidade por bloco é
  um callout do tipo `secret` — `> [!secret]`, com título, `+` ou `-` como
  qualquer callout, o tipo comparado em minúsculas como a Q5 lê os tipos,
  nenhuma outra palavra-chave. No arquivo ele continua um callout: o
  Obsidian, outro editor e uma pasta do computador o mostram a quem tem o
  arquivo, e o significado dele não muda (ADR 0030). Um UniVerso serve a
  uma conta que só pode ler a nota uma **projeção** dela, as linhas de cada
  callout secreto removidas e nada mais tocado, em todo lugar em que um
  leitor lê — o texto, os bytes do sync, a busca, links, tags, tarefas e
  contagens, o MCP; uma conta que pode escrevê-la recebe o texto inteiro.
  "Sem vazar o segredo" se lê como **um leitor nunca tem os bytes**. Um
  `[!secret]` dentro de outro callout é removido em qualquer profundidade
  que a visualização de leitura desenha, com o que ele contém; um bloco
  cujo fim não se consegue situar esconde até o fim do blockquote dele
  (falha fechado). O aninhamento da Q5 continua `[ABERTO]` para o parser
  que alimenta o índice. **Ainda sem fixture**: a fixture desta questão
  vem com o PR que constrói o ADR 0087, rascunhada pela IA e aprovada pelo
  mantenedor ali (ADR 0031); nenhum arquivo de `fixtures/**` mudou com
  esta resposta. *(v0.42: esse PR rascunhou `fixtures/callout/secret`,
  cuja chave `reader` afirma a projeção — um bloco no nível de cima, um
  dentro de outro callout com o tipo em maiúsculas, um num item de lista,
  um `[!secrets]` mantido — para a aprovação do mantenedor; v0.45:
  aprovada em 2026-10-15.)*
- **Q10. Sintaxe de relação tipada.** `DECIDIDA` em 2026-09-30.
  Decidir antes de implementar relações (§17 item 6). Requisitos já fixados:
  tipo e direção, várias relações entre os mesmos dois nós
  ([ADR 0014](../adr/0014-primitives-catalog.md)), e degradar para Markdown
  legível ([ADR 0013](../adr/0013-degrades-to-markdown.md)).

  **Decidida em 2026-09-30 pelo mantenedor**, em sessão, sobre o memo
  `docs/reference/board-decision.md` (seção 10; [ADR 0057](../adr/0057-board-json-canvas.md), ponto 4):
  uma relação tipada é uma propriedade do frontmatter da nota de origem cujo
  valor é um wikilink entre aspas (`aliado: "[[Barão]]"`) ou uma lista de
  wikilinks entre aspas (`inimigos: ["[[A]]", "[[B]]"]`). A chave é o tipo; a
  direção vai da nota que a guarda para o alvo; várias relações entre duas
  notas são o mesmo alvo sob várias chaves. Um `[[x]]` sem aspas é uma
  sequência YAML e não um link. Como observado no Obsidian 1.13.7 (memo, O10
  e O11), que lista esses valores como links da nota, com as chaves `aliado`,
  `inimigos.0`, `inimigos.1`.
- **Q11. Formato e localização dos schemas.** `DECIDIDA` em 2026-09-24.
  Decidir antes da nota tipada, na Fase 2 (§17 item 7). "Arquivo de texto na
  pasta" é a única pista do briefing. Tensiona com D2: schema dentro da pasta,
  config fora dela. Afeta os packs de schema
  ([ADR 0015](../adr/0015-schema-packs.md)).

  **Decidida em 2026-09-24 pelo mantenedor**, na sessão, sobre o memo
  `docs/reference/typed-note-decision.md` (seções 5 e 6): as recomendações do
  autor no dia foram apresentadas ao mantenedor numa lista só, e a resposta
  foi *"Tirando o plano de fazer vários PR, eu gosto das suas
  recomendações"*. A nota tipada em si é o
  [ADR 0052](../adr/0052-typed-note.md), aceito no mesmo dia.

  1. **Formato:** um bloco de código cercado cuja linguagem é `verso-schema`,
     com YAML dentro, numa nota — um tipo por bloco; vários blocos podem
     dividir uma nota. Na primeira versão ele diz `type` (o nome que as notas
     escrevem no próprio `type:`), `label` por idioma da interface, e
     `properties`, uma lista ordenada de `key`, `kind` e `label`, com os tipos
     de valor `text`, `list`, `number`, `checkbox`, `date` e `datetime`. Nada
     nele executa. É lido sob os limites do frontmatter (Q17). Em 2026-10-14
     o [ADR 0086](../adr/0086-infobox-a-typed-notes-card.md) acrescentou os
     tipos `link` e `image` e um `layout` no topo (§4.8).
  2. **Localização:** qualquer nota da pasta aberta, menos sob caminhos
     ocultos e ignorados (Q26; [ADR 0044](../adr/0044-verso-fs-semantics.md)).
     A identidade de um schema é o `type` que ele traz dentro, não o nome nem
     o lugar da nota. É a escolha do mantenedor entre o briefing §5.3 —
     "arquivo de texto na pasta", com o ADR 0014 e a seção 6 depois dele — e o
     briefing §8 com o [ADR 0021](../adr/0021-sync-automerge-layered-config.md),
     os dois `PROPOSTO`, que põem os schemas na camada compartilhada da
     configuração, fora da árvore: a da §5.3. Um schema é conteúdo, como os
     packs são, então a tensão com D2 não aparece; o ADR 0021 fica como está
     escrito, Proposto, e discorda sobre schemas.
  3. **Dois schemas com o mesmo nome:** nenhum vale; as notas desse tipo
     aparecem sem tipo, com o conflito nomeando os dois. Um schema que não se
     lê não tipa nada, e diz isso.

  Um bloco aninhado numa lista ou num callout não conta: só um no nível de
  cima de uma nota conta, e um aninhado é mostrado como não lido — decidido
  pelo mantenedor em 2026-09-24 (`docs/reference/views-decision.md` §2,
  v0.19), o que deixa de fora um exemplo citado. Nenhuma fixture vem com este
  fechamento — não
  existia nenhuma para a Q11, e ela fechou pela resposta do mantenedor como a
  Q12 e a Q26 fecharam. As fixtures de schema vêm com a implementação, cada
  uma rascunhada pela IA e aprovada pelo mantenedor no pull request que a
  acrescenta ([ADR 0031](../adr/0031-fixtures-as-contract.md)), junto com a
  chave de `expected.yaml` para um bloco de schema (seção 4.1) e a categoria
  dele (seção 8).

### Lacunas de parsing — não respondidas pelo briefing

Levantadas ao escrever esta spec. Todas precisam de resposta antes de
`verso-dialect` (Fase 1, feature 1).

- **Q1. Nome do campo de referência de bloco no `expected.yaml`.** `DECIDIDO`
  O exemplo do briefing nomeia `target`, `alias` e `heading`, mas não o campo de
  `#^bloco` (seção 5.5). Resposta: `block` (seção 4.2). Fechada em 2026-09-21
  pela aprovação, pelo mantenedor, da fixture
  `fixtures/wikilink/block-reference` (ADR 0031).
- **Q2. Embed conta como link no grafo e nos backlinks?** `DECIDIDO` em
  2026-10-21 (seção 5.6)

  **Fato provisório vindo do `verso-index`, registrado em 2026-09-22, que não
  responde a esta questão.** Embed conta como link **e** como backlink: é
  guardado com o tipo dele, resolve pela mesma regra de um link e aparece nos
  backlinks do alvo, marcado como embed para quem chama saber distinguir os
  dois. Observado no Obsidian 1.13.7 pelo CLI dele em 2026-09-22 (ADR 0009; a
  execução está em `docs/reference/index-decision.md` §4.1): os cinco links
  que o `resolvedLinks` conta da nota de teste para `Alvo.md` incluem o embed
  `![[Alvo]]`. Quem decide é o mantenedor; esta linha só registra o que o
  código faz enquanto isso.

  **Decidido em 2026-10-21 pelo mantenedor** (questionário de decisões de
  2026-10-20, opção A): o fato provisório acima é ratificado — um embed é link
  e backlink, marcado como embed. Já observado no Obsidian 1.13.7; nada a
  construir.

- **Q3. Posição admissível do `^id`.** `DECIDIDO`: para o fim de um
  parágrafo e de um item de lista em 2026-09-21; para um `^id` sozinho
  depois de um bloco de nível superior e no fim de um heading em
  2026-10-07; para um `^id` dentro de um item de lista ou de uma citação, e
  para um sozinho sem nada antes, também em 2026-10-07, com as fixtures
  `fixtures/block/in-list`, `fixtures/block/in-quote` e
  `fixtures/block/alone-top` como resposta.
  Fechada para essas duas em 2026-09-21 pelo mantenedor, com as fixtures
  `fixtures/block/definition` e `fixtures/block/list-item` como resposta
  (ADR 0031): um `^id` como última palavra de um parágrafo e um `^id` como
  última palavra de um item de lista definem o bloco (seção 5.7).

  **Decidido em 2026-10-07 pelo mantenedor, para o resto, como o Obsidian
  faz** (observado pelo CLI do Obsidian no mesmo dia, só API pública, ADR
  0009), em dois passos. Primeiro: um `^id` sozinho numa linha depois de uma
  linha em branco nomeia o bloco de antes — um parágrafo, uma tabela, um
  bloco de código, uma citação — e não é bloco próprio; um `^id` no fim da
  linha de um heading nomeia o heading; um `^id` no fim de um item de lista
  nomeia o item com os itens aninhados (Q21). As fixtures
  `fixtures/block/after-a-block` e `fixtures/block/heading` são a resposta,
  com `lines` (seção 4.3) dizendo qual bloco. `pos` continua sendo o `^`,
  como a seção 4.3 pede, seja qual for o bloco que o id nomeia. Depois, após
  uma segunda observação de 28 entradas
  (`docs/reference/obsidian-blocks-2026-10-07.md`), com as três fixtures
  abaixo aprovadas em sessão ("Aprovado"), a regra que contém o primeiro
  passo e o resto: o bloco que um `^id` nomeia é a seção de nível superior
  em que a linha dele está, exceto em lista, onde é o item de lista mais
  interno — um heading dentro de uma citação ou de um item nomeia a citação
  ou o item, não o heading: (1) dentro de
  uma citação ou de um callout — o id no fim de uma linha citada, sozinho
  depois de uma linha citada em branco, numa citação aninhada, numa lista
  dentro da citação — a citação de nível superior inteira
  (`fixtures/block/in-quote`); (2) dentro de uma lista — o id no fim da
  primeira linha de um item, solto ou compacto, no fim de um parágrafo
  posterior do item, depois de um bloco de código ou de uma citação em
  primeiro no item, ou sozinho sob uma lista aninhada — o item mais interno
  em que a linha está, inteiro, a linha do `^id` incluída quando está
  dentro do item; o cache do Obsidian lista os itens aninhados à parte, e a
  Q21 (decidida) os põe no bloco (`fixtures/block/in-list`); (3) sozinho no
  nível superior sem nada antes, nenhum bloco, e depois de um parágrafo que
  não é id (`^foo.bar`), esse parágrafo (`fixtures/block/alone-top`).

  `DECIDIDO` em 2026-10-09 pelo mantenedor ("Recomendado"): **de dois
  `^id` sozinhos em sequência** (`Texto.`, linha em branco, `^a`, linha em
  branco, `^b`), **só o último nomeia o bloco antes deles**, como no
  Obsidian, cujo cache guarda só `b` e deixa `[[nota#^a]]` sem resolver;
  `^a` passa a ser um id que não nomeia nada e fica como escrito
  (`fixtures/block/two-alone`). O Verso reportava os dois, uma extensão que
  o ADR 0030 não permite.
  Também não observado, e registrado como o que o parser faz: um `^id`
  sozinho logo depois do frontmatter, ou depois de uma definição de nota de
  rodapé, não nomeia nada e nomeia o parágrafo antes da definição,
  respectivamente (notas de rodapé não estão ativadas no parser).
- **Q4. Escopo de unicidade do `^id`.** `DECIDIDO` em 2026-10-07 pelo
  mantenedor.
  Único por nota: um link nomeia a nota e o id (`[[nota#^id]]`). Com o mesmo
  id duas vezes numa nota, **o último nomeia o bloco**, como o Obsidian faz
  (observado pelo CLI do Obsidian em 2026-10-07: o cache dele guarda o
  segundo), e o Verso diz que o id está repetido. O parser reporta os dois, em
  ordem do documento (`fixtures/block/duplicate`), e o índice e o `read_note`
  do MCP também, cujo schema de resposta enuncia a regra em `first_line`
  ("com o mesmo id duas vezes numa nota, o último nomeia o bloco"); a
  janela a aplica — um embed, um link para o bloco — e um cliente do MCP a
  lê ali.
- **Q5. Cobertura de callout.** `DECIDIDA` para os tipos, a dobra e o título na
  visualização de leitura em 2026-09-23; `DECIDIDA` para o aninhamento em
  2026-10-21.
  Tipos reconhecidos, `-`/`+`, aninhamento (seção 5.8).

  **Decidido em 2026-09-23 pelo mantenedor, para a visualização de leitura**
  (`docs/review/phase-2.md` §6, item 4; a resposta: *"a e b ok"*), como o código faz. A visualização de leitura mostra como
  callout uma citação cuja primeira linha abre com `[!tipo]`,
  `[!tipo]+` ou `[!tipo]-`, para qualquer tipo, em minúsculas; `+` e `-` o
  tornam recolhível pelo título, e `-` o começa fechado, como a documentação do
  Obsidian mostra — desde `5b7fc69`: antes a dobra só era marcada e nada agia
  sobre ela, o que a leitura da Opus das respostas achou; sem título, o nome do tipo, com inicial maiúscula, é o título; uma
  citação aninhada dentro de um callout continua citação
  (`crates/verso-dialect/src/callouts.rs`) — desde a v0.17, uma que é ela
  mesma um callout é desenhada como callout (o fato provisório abaixo). O
  parser que alimenta o índice não
  mudou. **O aninhamento continua `[ABERTO]`**: a documentação pública do
  Obsidian mostra callouts aninhados dentro de callouts, que a visualização de
  leitura mantinha como citações antes da v0.17. A recomendação apresentada ao
  mantenedor dizia
  que a visualização de leitura segue o Obsidian, o que não vale para o
  aninhamento, então o aninhamento não é tomado como decidido.

  **Fato provisório, registrado em 2026-09-24 a partir do código do branch
  `feat/nested-callouts`, não uma resposta a esta questão.** A visualização de
  leitura desenha um callout dentro de um callout como callout, até 32 níveis
  — um mais fundo fica citação, para que uma nota não faça o desenho recursar
  sem fim — e uma citação comum dentro de um callout continua citação. Segue a
  documentação pública do Obsidian, que mostra callouts aninhados. O parser
  que alimenta o índice não é tocado. O mantenedor decide; esta linha só
  registra o que o código faz enquanto isso.

  **Aninhamento decidido em 2026-10-21 pelo mantenedor** (opção A): o fato
  provisório acima é ratificado — a visualização de leitura desenha um callout
  dentro de um callout, até 32 de fundo — **e o parser que alimenta o índice
  passa a entender o aninhamento**, com o mesmo limite de 32, de modo que
  índice e leitura concordam, e um `[!secret]` dentro de outro callout é
  reconhecido ali também (seção 5.8, Q9). A fixture `callout/nested` é
  rascunhada pela IA e aprovada pelo mantenedor no PR de código separado que
  constrói isto; nenhum arquivo de `fixtures/**` mudou com esta resposta. Pela
  invariante 17, uma questão que precisa de fixture ou de observação do
  Obsidian só fecha por inteiro no PR que a acrescenta, com esta seção
  atualizada no mesmo PR.

  *(2026-10-21: a parte do parser está construída no branch
  `feat/nested-callouts-index` — `Callout.depth`, o limite de 32, a fixture
  `callout/nested` rascunhada para aprovação, `depth` acrescentado à §4.3.)*

- **Q6. Contextos em que `[[...]]` não é link, além de crase e cerca.**
  `DECIDIDA` em 2026-10-21 para o índice e para HTML embutido; os comentários
  na visualização de leitura `DECIDIDOS` em 2026-09-23. Bloco indentado por 4
  espaços, HTML embutido, `%%comentário%%`,
  link dentro de URL (seção 5.9).

  **Decidido em 2026-09-23 pelo mantenedor, para a visualização de leitura e a
  janela** (`docs/review/phase-2.md` §6, item 4; a resposta: *"a e b ok"*), como o código faz — menos o HTML embutido que o
  Obsidian mostra e a janela descarta, abaixo. O parser que alimenta o índice
  não mudou, então se um `[[…]]` dentro de um comentário, de HTML embutido ou de
  um bloco indentado é link continua sendo o que a seção 5.9 diz. O que mudou é
  o que a visualização de leitura mostra: `%%…%%` sai dela, na linha ou
  atravessando linhas, nunca dentro de código — a documentação pública do
  Obsidian mostra comentários só na visualização de edição —, e uma `#tag`
  dentro de um comentário não é tag nem para o índice nem para o leitor. HTML
  embutido só chega à página por uma lista de permissões que a janela aplica
  (scripts, estilos, frames, formulários e atributos de evento saem), já que
  uma nota de uma pasta compartilhada é entrada não confiável
  ([ADR 0045](../adr/0045-server-and-mcp-security.md)). O que o índice conta
  como link nesses contextos continua `[ABERTO]`. Também continua o HTML
  embutido que a lista de permissões descarta e a documentação pública do
  Obsidian mostra numa nota — `<iframe>`, `<video>`, `<audio>`: a premissa
  apresentada ao mantenedor, de que a visualização de leitura segue o
  Obsidian, não vale ali (a leitura da Opus das respostas); a lista de
  permissões fica como está enquanto isso. *(Corrigido em 2026-09-24 por
  `docs/reference/embedded-media-decision.md`: a ajuda pública do Obsidian
  mostra `<iframe>` numa nota; nenhuma página pública mostra `<video>` ou
  `<audio>` no HTML cru de uma nota — áudio e vídeo estão documentados como
  embeds `![[…]]`. A questão continua `[ABERTO]`, e aquele memo expõe as
  opções.)*

  **Decidido em 2026-10-21 pelo mantenedor** (opção A): o estado provisório é
  ratificado — o índice conta um `[[x]]` dentro de um `%%comentário%%`, de
  HTML embutido ou de um bloco indentado por 4 espaços como link (o parser não
  os distingue), e a lista de permissão da visualização de leitura fica como
  está, `<iframe>`, `<video>` e `<audio>` ainda descartados: uma nota de pasta
  compartilhada é entrada não confiável ([ADR 0045](../adr/0045-server-and-mcp-security.md)), então não há risco novo. Fazer o índice ignorar `[[ ]]`
  em comentário e HTML (opção B), ou permitir `<iframe>` com restrições (opção
  C), são melhorias para depois, com observação do Obsidian e revisão de
  segurança (`docs/reference/embedded-media-decision.md`). Pela invariante 17,
  uma questão que precisa de fixture ou de observação do Obsidian só fecha por
  inteiro no PR que a acrescenta, com esta seção atualizada no mesmo PR;
  nenhuma está rascunhada ainda.

- **Q7. Normalização Unicode na comparação de nomes.** `DECIDIDO` em 2026-10-10.
  NFC × NFD. O APFS (macOS, plataforma inicial) preserva a forma recebida e faz
  busca insensível à normalização; HFS+ forçava NFD; Linux compara bytes. Um
  vault que passou por sync ou por HFS+ mistura as duas formas (seção 5.10).

  **Fato provisório vindo do `verso-index`, registrado em 2026-09-22, que não
  responde a esta questão.** Os dois lados de uma comparação de nome passam por
  NFC antes de serem comparados, então um nome escrito em NFC e o mesmo nome
  escrito em NFD são um nome só. Isso **não** foi observado no Obsidian:
  decorre da definição das duas formas, e o APFS, insensível à normalização,
  esconde a diferença na plataforma inicial. Quem decide é o mantenedor; esta
  linha só registra o que o código faz enquanto isso. *(Mantido como o
  histórico que levou à decisão abaixo.)*

  **Decidido em 2026-10-10 pelo mantenedor**, em sessão, ficando com a
  resposta recomendada: *"Gostei das recomendações, pode seguir"*. A questão voltou
  com a campanha de sync de 2026-10-10, no achado F20 dela: dois aparelhos no
  Windows e no Linux guardaram um nome nas duas formas, e um deles nunca enviou
  o arquivo. **Um nome é um arquivo só em todo lugar**: o servidor compara
  nomes em NFC; cada aparelho guarda a grafia que o próprio sistema de arquivos
  deu ao nome; um arquivo mudado dos dois lados sob as duas formas é uma cópia
  de conflito ([ADR 0079](../adr/0079-sync-a-local-folder-with-a-server.md)
  item 8). Sem fixture: o mantenedor não pediu uma.
- **Q8. Sensibilidade a maiúsculas na resolução de nome.** `DECIDIDA` em 2026-10-21.
  Interage com sistemas de arquivo case-insensitive (macOS por padrão — APFS
  pode ser case-sensitive por volume —, Windows) e case-sensitive (Linux) — o
  mesmo vault pode resolver diferente por plataforma (seção 5.10).

  **Fato provisório vindo do `verso-index`, registrado em 2026-09-22, que não
  responde a esta questão.** A resolução é insensível a caixa: os dois lados
  são rebaixados para minúsculas antes da comparação, então `[[alvo]]`,
  `[[ALVO]]` e `[[Alvo]]` chegam todos a `Alvo.md`. Observado no Obsidian
  1.13.7 pelo CLI dele em 2026-09-22 (`docs/reference/index-decision.md` §4.1).
  A outra metade desta questão — quais extensões fazem de um arquivo uma nota —
  é o fato do `verso-fs` registrado sob a Q12. Quem decide é o mantenedor; esta
  linha só registra o que o código faz enquanto isso.

  **O lado da criação, decidido pelo mantenedor em 2026-10-12** (*"Todos
  aprovados"*), não a resolução, que continua `[ABERTO]`: um nome novo que só
  difere em maiúsculas e minúsculas de uma entrada que a pasta dele já lista é
  recusado quando o Verso o cria ou renomeia, em todo sistema e no servidor;
  uma entrada que existe nunca é recusada
  ([ADR 0070](../adr/0070-what-travels-with-the-folder.md) item 3, revisado em
  2026-10-12).

  **Decidido em 2026-10-21 pelo mantenedor** (opção A): o fato provisório
  acima é ratificado — a resolução não distingue maiúsculas e minúsculas, em
  toda plataforma, como o Obsidian 1.13.7; em empate vale o nome exato, depois
  o primeiro pela ordem da Q12. Duas entradas que só diferem em caixa numa
  pasta de disco que diferencia caixa são ambíguas e resolvidas por esse
  desempate. O desempate é o que a Q12 já usa; a confirmar no PR que constrói
  isto. Pela invariante 17, uma questão que precisa de fixture ou de
  observação do Obsidian só fecha por inteiro no PR que a acrescenta, com esta
  seção atualizada no mesmo PR; nenhuma está rascunhada ainda.

- **Q12. Regra de resolução de link para arquivo.** **FECHADA em 2026-09-22
  pelo mantenedor**, seguindo o Obsidian 1.13.7 como observado
  (`docs/reference/index-decision.md` §4.1 e §4.6,
  [ADR 0009](../adr/0009-external-constraints.md)). A regra:

  1. `#…`, `^…` e `|apelido` saem do alvo primeiro. **Alvo vazio**
     (`[[#Cabeçalho]]`) é a própria nota, e ela passa a ser fonte dos próprios
     backlinks.
  2. O resto é tentado **como caminho**, extensão opcional, sem diferenciar
     maiúsculas, comparado depois de NFC: primeiro a partir da **raiz da pasta
     aberta**, depois relativo à **pasta da própria nota de origem**,
     respeitando `..`; um caminho que começa com `./` ou `../` é lido só
     relativo a essa pasta. *(Ordem dita em 2026-09-23, abaixo: o ponto não
     dizia qual vinha primeiro.)*
  3. Se nenhum caminho casa, casa-se o **nome puro** sem diferenciar
     maiúsculas: primeiro um candidato **sob a pasta da própria nota de
     origem**, em qualquer profundidade — nela ou numa pasta dentro dela;
     senão o de **menos segmentos de caminho**; entre iguais, o **primeiro em
     ordem de bytes** (`B/dup.md` antes de `a/dup.md`). *(Emendado em
     2026-09-23, abaixo: o ponto dizia "na".)*
  4. Nada responde: o alvo fica **não resolvido**, guardado com o texto como
     escrito, e nunca é backlink (Q14).
  5. **Alias** de frontmatter **não resolve** link; **embed** resolve pela
     mesma regra e conta como link (Q2); `[[nota/]]` e `[[.md]]` não resolvem.

  A resolução acontece em tempo de consulta, então acrescentar uma nota resolve
  os links que a esperavam. Com workspace multi-raiz
  ([ADR 0041](../adr/0041-multi-root-workspace.md), `PROPOSTO`), se a resolução
  cruza raízes continua em aberto. A linha do alias continua **contradizendo a
  documentação pública do Obsidian**, que apresenta aliases como forma de ligar
  para uma nota; a contradição fica registrada, não resolvida, e a decisão
  segue o que foi observado.

  O código do `verso-index` de 2026-09-22 **não** implementa os pontos 2, 3 e 5
  por inteiro — as cinco diferenças estão em
  `docs/reference/index-decision.md` §4.6 e são o que o código da feature 3
  deve.

  **Ponto 3 emendado pelo mantenedor em 2026-09-23.** Ele dizia um candidato
  **na** própria pasta da nota de origem; o índice preferia um **sob** ela, em
  qualquer profundidade, desde o commit `d1a5272`, seguindo sondas do
  Obsidian 1.13.7 que foram registradas, rodadas de novo, como a terceira
  observação de `docs/reference/index-decision.md` §4.1. Perguntado "sob a
  pasta, sim ou não?", com um exemplo e a recomendação de seguir o Obsidian, o
  mantenedor respondeu: *"boa, gosto da sua ideia, pode seguir"*. O ponto 3
  agora diz "sob", e nada no código se afasta dos pontos 1 a 5.

  **Embeds de arquivos que não são nota, desde `3340a3f`, registrado em
  2026-09-23.** Resolvem pelos pontos 1 a 5 a partir da nota que tem o embed,
  inclusive o "sob" desde a emenda.

  **A ordem do ponto 2 dita pelo mantenedor em 2026-09-23**
  (`docs/review/phase-2.md` §6, item 20; a resposta: *"a e b ok"*). O ponto
  não dizia se um caminho é tentado primeiro a partir da raiz ou relativo à
  pasta da origem. O índice e a resolução dos embeds tentam a raiz primeiro, e
  o Obsidian 1.13.7 também: a partir de `verso-probe/a/src.md`,
  `[[probe-sub/vpx]]` alcançou o `probe-sub/vpx.md` da raiz, não o
  `verso-probe/a/probe-sub/vpx.md`; a partir de `verso-probe2/a/src.md`,
  `[[sub2/rx]]` alcançou o `sub2/rx.md` da raiz, enquanto `[[./sub2/rx]]` e
  `[[../a/sub/rx]]` alcançaram as notas sob a pasta da origem
  (`docs/reference/index-decision.md` §4.1, terceira e quarta observações).
  Então `![[img.png]]` em `a/` alcança um `img.png` da raiz antes de
  `a/img.png` — um caminho a partir da raiz responde antes de chegar ao ponto
  3 — e `![[./img.png]]` alcança `a/img.png`. Testes fixam os dois no índice e
  na resolução dos embeds.

  **Fato do `verso-fs`, inalterado por este fechamento.** O walk classifica um
  arquivo comum como nota quando a extensão é exatamente `md`; `.MD`, `.Md` e
  `.markdown` são arquivos comuns até a Q8 ser decidida.
- **Q13. Tags inline (`#tag` no corpo).** `DECIDIDA` em 2026-09-23.
  O briefing só cita `tags` no frontmatter. Se `#tag` no corpo conta como tag,
  e como conviver com `#` de heading e com `#` de URL.

  **Decidido em 2026-09-23 pelo mantenedor** (`docs/review/phase-2.md` §6, item 4; a resposta: *"a e b ok"*), como o índice e a
  visualização de leitura fazem — registrado antes, no mesmo dia, como
  provisório. A lista de tags do índice conta um `#` no corpo como tag quando ele abre a linha ou vem depois
  de um espaço ou de um `(`, e é seguido de letras, dígitos, `_`, `-` ou `/` que
  não sejam só dígitos, e a tag vai para minúsculas. Assim o `#` de um heading (`# Título`, com o espaço) e o `#` dentro
  de uma URL não são tags. Desde `95b39ee` o índice e a visualização de leitura
  tiram a regra de uma função só do dialeto, `verso_dialect::body_tags`, que lê
  os eventos do parser e pula o frontmatter, trechos e blocos de código
  (cercados ou indentados), HTML cru, destinos e rótulos de link, texto
  alternativo de imagem, matemática e comentários `%%`; antes dela, o índice varria linhas
  cruas e listava tags falsas. A visualização de leitura mostra essa tag como
  um link que a busca.
- **Q14. Link para arquivo que não existe.** `DECIDIDA` em 2026-10-21.
  Se entra no índice como alvo pendente, se aparece no grafo, se conta como
  backlink.

  **Fato provisório vindo do `verso-index`, registrado em 2026-09-22, que não
  responde a esta questão.** Um alvo a que nenhuma nota atende é guardado — com
  o texto como escrito e uma contagem de quantas vezes aparece — e é listado
  pela consulta de alvos não resolvidos do índice; ele **não** é backlink de
  nada. Observado no Obsidian 1.13.7 pelo CLI dele em 2026-09-22
  (`docs/reference/index-decision.md` §4.1): o `unresolvedLinks` reporta
  `nao-existe` com a contagem dele, num mapa separado dos links resolvidos.
  Quem decide é o mantenedor; esta linha só registra o que o código faz
  enquanto isso.

  **Segundo fato provisório vindo do `verso-index`, registrado em 2026-09-22,
  que também não responde a esta questão.** Um link de alvo vazio —
  `[[#Heading]]`, `[[#^id]]`, que a seção 4 dá como `target == ""` — resolve
  para a própria nota que o contém. Ele não é link para arquivo que não existe:
  nunca aparece entre os alvos não resolvidos, e não é backlink da nota para
  ela mesma, então uma nota que linka para os próprios headings não aparece nos
  backlinks dela. *(A última oração foi superada pela Q12, ponto 1, fechada
  depois no mesmo dia: a nota é fonte dos próprios backlinks, e o código faz
  isso desde o commit `d1a5272`.)* Nada foi observado no Obsidian para esse caso; o código
  escolheu assim porque a alternativa conta todo link para heading da própria
  nota como arquivo faltando e põe um alvo vazio no topo da lista de não
  resolvidos de qualquer pasta que os use. Quem decide é o mantenedor; esta
  linha só registra o que o código faz enquanto isso.

  **Decidido em 2026-10-21 pelo mantenedor** (opções A e B ambas marcadas):
  (A) os fatos provisórios acima são ratificados — um alvo a que nenhuma nota
  responde entra no índice como pendente, com o texto como escrito e uma
  contagem, e nunca é backlink de nada; `[[#Heading]]` resolve para a própria
  nota; e (B) **links não resolvidos também aparecem como nós no grafo**, como
  opção, como o grafo do Obsidian tem uma (a confirmar na documentação pública
  do Obsidian antes de ser construída). A opção do grafo não muda nada no
  índice. Pela invariante 17, uma questão que precisa de fixture ou de
  observação do Obsidian só fecha por inteiro no PR que a acrescenta, com esta
  seção atualizada no mesmo PR; nenhuma está rascunhada ainda.

  *2026-10-21: a (B) está construída no branch `feat/graph-unresolved` — o
  filtro do grafo "Só arquivos existentes", ligado por padrão; desligado,
  desenha cada alvo não resolvido como um nó vazio e tracejado, ligado às notas
  que o citam (a ajuda pública "Graph view" do Obsidian documenta o mesmo
  filtro).*

- **Q15. Extensões de Markdown fora da base.** `DECIDIDA` para a visualização
  de leitura em 2026-09-23; `DECIDIDA` para o parser que alimenta o índice em 2026-10-21.
  Tabelas, footnotes, task list, matemática, destaque `==texto==`, strikethrough.
  O briefing não lista nenhuma; a escolha do parser base
  ([ADR 0037](../adr/0037-base-parser.md)) mexe no que sai de graça.

  **Decidido em 2026-09-23 pelo mantenedor, para a visualização de leitura**
  (`docs/review/phase-2.md` §6, item 4; a resposta: *"a e b ok"*), como o código faz. O HTML que o core renderiza para a janela
  (`verso_dialect::to_html`) mostra as seis, como o Obsidian mostra por padrão:
  tabelas, notas de rodapé — inclusive a forma inline do Obsidian, `^[texto]`,
  reescrita como nota de rodapé referenciada antes de renderizar —, task list
  com caixas de marcar, matemática deixada como a fonte num elemento marcado que
  a janela tipografa, destaque e strikethrough. Mostra também uma quebra de
  linha simples dentro de um parágrafo como quebra de linha, que é o padrão do
  Obsidian ("strict line breaks" desligado). Nada disso chega ao parser que
  alimenta o índice: ele continua habilitando só wikilinks e o bloco YAML, então
  um link dentro de uma tabela ou de uma nota de rodapé é achado como em texto
  corrido, e nenhuma fixture cobre a renderização. O mantenedor pediu notas de
  rodapé, matemática e tabelas pelo nome em 2026-09-23; isso resolve o que a
  janela mostra, não esta questão. Desde `7475c03` a visualização de leitura acha
  tudo isso nos eventos do parser, não no próprio HTML: código, rótulos de link
  e texto alternativo nunca são reescritos, e um `</blockquote>` cru não abre
  nem fecha mais um callout. Como o leitor habilita opções que o parser não
  habilita, `$[[x]]$` é link para o índice e matemática para o leitor — uma
  discordância registrada, não resolvida. Se o parser que alimenta o índice
  habilita essas extensões, o que a resolveria, continua `[ABERTO]`.

  **Decidido em 2026-10-21 pelo mantenedor** (opção A): **o parser que
  alimenta o índice habilita os seis** — tabelas, footnotes, task lists,
  matemática, destaque e strikethrough — de modo que índice e visualização de
  leitura leem o mesmo documento, o que fecha a divergência do `$[[x]]$`
  registrada acima. Precisa do teste de ida e volta e de fixtures, e de uma
  observação do que o Obsidian faz com `$[[x]]$`. Pela invariante 17, uma
  questão que precisa de fixture ou de observação do Obsidian só fecha por
  inteiro no PR que a acrescenta, com esta seção atualizada no mesmo PR;
  nenhuma está rascunhada ainda.

- **Q16. Arquivos não-Markdown na pasta.** `DECIDIDA` em 2026-10-21 para o resto;
  `.canvas` abaixo.
  Quais entram no índice como alvo de link (imagens, PDF, `.canvas`) e quais são
  ignorados.

  **`.canvas` decidido em 2026-09-30 pelo mantenedor** ([ADR 0057](../adr/0057-board-json-canvas.md),
  ponto 6), como o Obsidian 1.13.7 faz (`docs/reference/board-decision.md`,
  O7, O8, O12): os nós `file` de um canvas e os wikilinks dentro dos seus nós
  `text` são fontes de backlink; um `.canvas` é alvo de link pelo nome
  completo com a extensão, nunca pelo nome sem ela. Os outros arquivos
  continuam com a pergunta.

  **Fato provisório vindo do `verso-core` e da janela, registrado em
  2026-09-23, que não responde a esta questão.** O walk lista todo arquivo comum
  que não esteja oculto nem ignorado; só notas entram no índice como alvo de
  link e fonte de backlink. Um embed de outro arquivo (`![[mapa.png]]`,
  `![[livro.pdf]]`) fica no índice como alvo não resolvido (Q14), nunca como
  backlink; o core o resolve só para exibição, pela regra da Q12 a partir da nota
  que tem o embed (desde `3340a3f`; antes, só pelo nome do arquivo, fosse qual
  fosse a nota). À primeira vista isso se afasta do ponto 5 da Q12 fechada ("um
  embed resolve pela mesma regra"): o índice resolve embeds só entre notas,
  então um embed de imagem fica sem resolver nele enquanto a janela o resolve
  para exibir. Registrado, não resolvido. Um arquivo cujo conteúdo está na
  nuvem é listado e resolve como presente. A janela mostra imagens, PDFs e arquivos de texto, e edita
  arquivos de texto pela mesma escrita atômica das notas; um arquivo HTML abre
  como texto, porque o visualizador que o mostra como página nunca é
  alcançado (`docs/review/phase-2.md` §6, item 16). Uma nota cujo
  frontmatter tem uma propriedade `url` com `http(s)` é mostrada como aquela
  página web; o índice guarda o endereço para isso. Quem decide é o mantenedor;
  esta linha só registra o que o código faz enquanto isso.

  **Decidido em 2026-10-21 pelo mantenedor** (opção A): **imagens, PDFs e
  outros arquivos viram alvos de link no índice**, pelo nome completo com a
  extensão, como o `.canvas` já é; isto fecha a diferença com o ponto 5 da Q12
  (um embed resolve pela mesma regra), e "arquivos não usados" e os backlinks
  de uma imagem passam a funcionar. O comportamento do Obsidian para os
  backlinks de anexos é para confirmar por observação (ADR 0009) antes de ser
  construído. Pela invariante 17, uma questão que precisa de fixture ou de
  observação do Obsidian só fecha por inteiro no PR que a acrescenta, com esta
  seção atualizada no mesmo PR; nenhuma está rascunhada ainda.

- **Q17. Limite de tamanho e comportamento com arquivo malformado.**
  `DECIDIDA` em 2026-10-21 para o resto (limites no núcleo); a parte do
  frontmatter está `DECIDIDA` abaixo.
  O fuzzing garante que não trava ([ADR 0029](../adr/0029-guardrails-in-ci.md)),
  mas o resultado esperado — erro, parse parcial ou arquivo tratado como texto —
  não está definido. Inclui limites de recurso: arquivo de centenas de MB, linha
  única de dezenas de MB, colchetes aninhados aos milhares (parser quadrático).
  Fuzzing pega crash, não lentidão; o limite e o que acontece ao ultrapassá-lo
  precisam ser ditos. **Continua `[ABERTO]`**: tamanho de arquivo, comprimento
  de linha e aninhamento ou lentidão do lado do Markdown. O mantenedor observou
  em 2026-09-21 que "lento" precisa de resposta fora do parser — um timeout no
  core, não no `verso-dialect` —, e essa resposta também não está decidida.

  **Limites do frontmatter: `DECIDIDO`** — pelo mantenedor em 2026-09-21, sobre
  a revisão do PR do `verso-dialect`
  ([`../review/phase-1-feature-1.md`](../review/phase-1-feature-1.md) §6,
  item 1): no máximo **64 níveis** de aninhamento e no máximo **10 000 nós** em
  um frontmatter. Os dois são contados no fluxo de eventos do YAML antes de
  existir qualquer árvore; um alias é cobrado pelo que o loader clona no lugar
  dele, e o nível a mais que uma tag fora do core acrescenta também é contado.
  Um frontmatter acima de qualquer um dos limites é reportado com o seu span e
  com `values` como erro; o corpo continua sendo parseado e nada mais no
  arquivo muda. A justificativa que o mantenedor aceitou: um frontmatter real
  tem dois ou três níveis e dezenas de nós, então números maiores só aumentam o
  que um arquivo malicioso pode custar. Os dois números não são mais
  provisórios; vivem como constantes `pub(crate)` em
  `crates/verso-dialect/src/frontmatter.rs`, fora da API pública. Nenhuma
  fixture as afirma: nenhuma foi pedida no PR que fecha esta parte, e uma que
  venha depois cita esta questão em `source:` (seção 4.5).

  Do lado do Markdown há um fato e nenhum limite: o guardrail de fuzz achou uma
  entrada de cerca de 5 KB em que o parser base leva tempo exponencial —
  exatamente a "lentidão" que esta questão nomeia. Ela está registrada no
  [ADR 0037](../adr/0037-base-parser.md), e o que fazer a respeito é daquele
  ADR, não desta questão.

  **O resto decidido em 2026-10-21 pelo mantenedor** (opção A): os limites
  ficam **no núcleo**, não no parser — acima de um teto de tamanho a nota abre
  como texto puro e não é indexada, e o índice tem um tempo limite por arquivo
  — e o usuário vê um aviso. Os valores exatos ficam para um ADR curto, com
  uma fixture do comportamento; a proposta ali é 10 MB e 5 s, a confirmar com
  a linha de base do [ADR 0039](../adr/0039-performance-targets.md). A entrada
  exponencial registrada acima segue sendo do [ADR 0037](../adr/0037-base-parser.md). Pela invariante 17, uma questão que precisa de fixture ou de
  observação do Obsidian só fecha por inteiro no PR que a acrescenta, com esta
  seção atualizada no mesmo PR; nenhuma está rascunhada ainda.

### Lacunas levantadas na revisão da Fase 0

Fonte: `docs/review/phase-0.md`, seção 4. Mesma regra das anteriores: resposta do
mantenedor antes de implementar; Q18 foi respondida primeiro, antes de o parser
ser escolhido.

- **Q18. Definição de round-trip.** `DECIDIDO` — pelo mantenedor em
  2026-09-21, sobre a comparação em
  [`docs/reference/parser-decision.md`](../reference/parser-decision.md):
  leitura **(b)**. O parser é somente leitura: produz um relatório (links,
  embeds, headings, blocos, callouts, frontmatter) com posições e intervalos de
  bytes, e não tem `serialize`. "Abrir nunca reescreve" vale porque o caminho
  de leitura não tem escrita; uma edição, quando existir, é patch textual por
  posição, mostrado como diff antes de aplicar
  ([ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md)). O property test de
  round-trip do [ADR 0029](../adr/0029-guardrails-in-ci.md) testa quatro
  propriedades: (1) `parse` retorna para toda entrada; (2)
  `parse(x) == parse(x)`; (3) fidelidade de span — toda construção relatada
  carrega o intervalo de bytes de onde veio, fatiar a entrada com esse
  intervalo devolve o texto-fonte da construção, e `pos` (seção 4.4) é
  derivado dele; (4) o caminho de leitura não escreve — os bytes do arquivo
  antes de uma leitura são iguais aos de depois (conferido no `verso-fs`,
  feature 2; `verso-dialect` não tem IO por construção). A leitura (a), árvore
  sem perda com `serialize(parse(x)) == x`, não foi escolhida: nenhuma entrega
  da Fase 1 ou da Fase 2 consome uma árvore, e ela exigiria um parser de
  CommonMark próprio antes da feature 1; pode ser acrescentada por cima da (b)
  depois sem desfazer nada. O merge por bloco
  ([ADR 0020](../adr/0020-sync-merge-in-core-transports-as-plugins.md)) opera
  sobre intervalos de bytes delimitados por posições do parser. O parser base
  escolhido nessa leitura está no [ADR 0037](../adr/0037-base-parser.md).
- **Q19. Casamento de heading.** `DECIDIDA` em 2026-10-21 para o casamento, a
  parte setext `DECIDIDA` em 2026-09-29 (seção 5.12)
  Como `[[nota#seção]]` casa com um heading: maiúsculas, pontuação e espaços,
  emoji, formatação inline (`## *Porão*`), headings duplicados, caminho
  aninhado `[[nota#Cap 1#Seção]]`, heading setext, e o que o `expected.yaml`
  registra em `heading` para o caminho aninhado.
  **A parte setext está `DECIDIDA`** (2026-09-29, seção 5.12): uma linha
  sublinhada com `===` é heading de nível 1 e uma sublinhada com `---`
  heading de nível 2, e o `---` nunca é quebra temática quando fica logo
  abaixo de texto, como observado no Obsidian. A resposta é a fixture
  `fixtures/heading/setext`, aprovada pelo mantenedor em 2026-09-29, na
  sessão; essa aprovação fecha a subquestão setext, e só ela. A parte do casamento —
  maiúsculas, pontuação, emoji, formatação, duplicados, o caminho aninhado e o
  valor de `heading` dele — continua `[ABERTO]`.

  **O casamento decidido em 2026-10-21 pelo mantenedor** (opção A): observar o
  Obsidian (a CLI, `metadataCache`) em 8 a 10 casos — maiúsculas, pontuação,
  emoji, formatação inline como `## *Porão*`, headings duplicados, o caminho
  aninhado `[[nota#Cap 1#Seção]]` — e **adotar o observado**, uma fixture por
  caso. Pela invariante 17, uma questão que precisa de fixture ou de
  observação do Obsidian só fecha por inteiro no PR que a acrescenta, com esta
  seção atualizada no mesmo PR; nenhuma está rascunhada ainda.

- **Q20. Links Markdown para arquivo local.** `DECIDIDA` em 2026-10-21 (seção 5.13)
  Se contam como link (proposta: sim); `<...>` com espaços; caminho relativo
  `../`; o que separa link local de URL externa; `![](img.png)` como embed;
  URL-encoding.

  **Decidido em 2026-10-21 pelo mantenedor** (opção A): **sim** — um link
  Markdown para arquivo local é link e backlink, com `%20` decodificado e
  caminhos relativos resolvidos. Uma observação do Obsidian por forma (`<...>`
  com espaços, `../`, `![](img.png)` como embed) antes de fixar os detalhes; a
  proposta da seção 5.13 vale até lá. Pela invariante 17, uma questão que
  precisa de fixture ou de observação do Obsidian só fecha por inteiro no PR
  que a acrescenta, com esta seção atualizada no mesmo PR; nenhuma está
  rascunhada ainda.

- **Q21. O que é um "bloco".** `DECIDIDO` em 2026-10-07 pelo mantenedor.
  A unidade do editor ([ADR 0061](../adr/0061-blocks-in-edit-mode.md) D5): um
  nó da árvore de sintaxe, nunca uma linha — um parágrafo, um heading, um
  item de lista com os itens aninhados, uma citação ou um callout inteiro, um
  bloco de código inteiro, uma tabela inteira, uma divisória. Uma célula de
  tabela não é bloco. O que um `^id` nomeia (Q3) e o que um embed
  `![[nota#^id]]` mostra são blocos nesse sentido.
- **Q22. Charset do `^id` e forma das tags.** `DECIDIDA` para o charset e a
  caixa das tags em 2026-09-23; `DECIDIDA` para o resto em 2026-10-21.
  A documentação pública do Obsidian restringe `^id` a letras, números e hífen;
  o que acontece com `^id` inválido. Para tags (Q13): charset, aninhamento
  `#a/b`, sensibilidade a maiúsculas, prefixo `#` em `tags` de frontmatter.

  **Decidido em 2026-09-23 pelo mantenedor, para as tags** (`docs/review/phase-2.md` §6, item 4; a resposta: *"a e b ok"*): o
  charset e a passagem para minúsculas são os registrados na Q13. A parte do
  `^id`, o que `#a/b` significa como hierarquia e um prefixo `#` nas `tags` do
  frontmatter continuam `[ABERTO]`.

  **O resto decidido em 2026-10-21 pelo mantenedor** (as três opção A). (a)
  **O `^id`**: só letras, números e hífen, como diz a documentação pública do
  Obsidian; o resto fica texto comum; se letras acentuadas contam é para
  observar. (b) **Tags**: `#a` acha `#a/b`, como o painel de tags do Obsidian
  faz com tags aninhadas. (c) **`tags` no frontmatter**: `[#ideia]` e
  `[ideia]` são a mesma tag, a confirmar por observação. Pela invariante 17,
  uma questão que precisa de fixture ou de observação do Obsidian só fecha por
  inteiro no PR que a acrescenta, com esta seção atualizada no mesmo PR;
  nenhuma está rascunhada ainda.

- **Q23. Formas combinadas e escapes de wikilink.** `DECIDIDA` em 2026-10-21.
  `[[nota#seção|alias]]`, `[[nota#^bloco|alias]]`, `[[#seção]]` e `[[#^bloco]]`
  (mesmo arquivo — conta como backlink de si mesmo?), `[[pasta/nota]]`,
  `[[nota.md]]`, `[[nota\|alias]]` em tabela, `\[[não é link]]`, `[[ nota ]]`
  com espaços, `![[img.png|300]]` (tamanho, não alias), `[[nota|alias|extra]]`,
  wikilink dentro de link Markdown ou de imagem.

  **Decidido em 2026-10-21 pelo mantenedor** (opção A): observar cada forma
  combinada no Obsidian — `[[nota\|alias]]` numa tabela, `\[[não é link]]`,
  `[[ nota ]]` com espaços, `![[img.png|300]]`, `[[nota|a|b]]`, um wikilink
  dentro de um link Markdown ou de uma imagem — uma fixture por caso, e
  **adotar o observado**. Pela invariante 17, uma questão que precisa de
  fixture ou de observação do Obsidian só fecha por inteiro no PR que a
  acrescenta, com esta seção atualizada no mesmo PR; nenhuma está rascunhada
  ainda.

- **Q24. Fronteira e dialeto do frontmatter.** `DECIDIDA` em 2026-10-21 (seção
  5.1); a parte da janela `DECIDIDA` em 2026-09-23.
  BOM antes do `---`; CRLF (a invariante 7 exige preservar a quebra de linha
  "do arquivo" — qual, quando há mistura?); `---` fechado por `...`; frontmatter
  vazio; YAML inválido (parte de Q17); versão do YAML — em 1.1 `yes`, `no`,
  `on` e datas viram booleanos e timestamps, em 1.2 não; `tags: 2024` é número
  ou tag?; wikilinks dentro de valores (`related: "[[nota]]"`), que as
  Properties do Obsidian tratam como links.

  **Decidido em 2026-09-23 pelo mantenedor, para a janela** (`docs/review/phase-2.md` §6, item 4; a resposta: *"a e b ok"*), como
  o código faz. O frontmatter dobrado da janela e o painel de propriedades
  acham o frontmatter onde o core o acha, pela regra da seção 5.1 como o parser
  a aplica; usavam uma regra própria, mais frouxa, que aceitava `...` e aparava
  as cercas, até a leitura da Opus de 2026-09-23 achar os dois discordando. Um
  valor que o painel não consegue reescrever sem mudar o tipo — um mapa, uma
  lista com qualquer coisa além de texto simples — é mostrado e não editado. Um
  arquivo com quebras de linha misturadas abre só para leitura na janela, então
  nunca é convertido ali. O resto da questão — um BOM, `...`, a versão do
  YAML, `tags: 2024`, wikilinks dentro de valores — continua `[ABERTO]`, e
  também uma conversão de quebras de linha misturadas por ação do usuário, com
  o diff (invariante 8), que o mantenedor deixou para depois
  (`docs/review/phase-2.md` §6, item 23).

  **A parte dos links é a próxima, pela resposta do mantenedor de
  2026-09-24** ([ADR 0052](../adr/0052-typed-note.md), ponto 9): propriedades
  que guardam links ficam fora da primeira fatia da nota tipada, e "wikilinks
  dentro de valores" é a próxima parte desta questão a decidir. Continua
  `[ABERTO]` até lá.

  **A parte dos links decidida em 2026-09-30 pelo mantenedor**, com a Q10
  ([ADR 0057](../adr/0057-board-json-canvas.md), ponto 4): um wikilink entre aspas que é o valor de uma
  propriedade, ou um item de uma lista que é o valor de uma propriedade, é um
  link, e a propriedade é uma relação tipada nomeada pela chave; um `[[x]]`
  sem aspas é YAML.

  **O resto decidido em 2026-10-21 pelo mantenedor** (as quatro opção A). (a)
  **BOM e `...`**: um BOM antes do `---` é aceito, e o frontmatter fecha com
  `---` ou `...`; o arquivo nunca é reescrito (invariante 7). (b) **YAML**:
  versão 1.2 (`yes` é texto) e `tags: 2024` é a tag "2024"; o que o Obsidian
  faz com `tags: 2024` é para observar, e a resposta se ajusta se diferir. (c)
  **Wikilinks dentro de valores** contam como link e backlink, no índice e no
  grafo — coerente com a parte de links decidida em 2026-09-30. (d) **Quebras
  de linha mistas**: o arquivo continua abrindo só para leitura, e um comando
  "Converter quebras de linha…" oferece a conversão com um diff visível, por
  ação do usuário (invariantes 7 e 8). Pela invariante 17, uma questão que
  precisa de fixture ou de observação do Obsidian só fecha por inteiro no PR
  que a acrescenta, com esta seção atualizada no mesmo PR; nenhuma está
  rascunhada ainda.

- **Q25. Codificação.** `DECIDIDA` em 2026-09-23.
  Arquivo `.md` que não é UTF-8 válido (Latin-1 de vault antigo, UTF-16 com BOM
  do Windows): erro, texto com substituição, ou ignorado. Separado de Q17
  porque codificação não é sintaxe.

  **Decidido em 2026-09-23 pelo mantenedor** (`docs/review/phase-2.md` §6,
  item 4, com a recomendação de continuar recusando; a resposta: *"a e b
  ok"*), como o código faz. Um arquivo cujos bytes não são UTF-8 válido não é
  aberto para edição: lê-lo para um editor responde `not_text`, então nenhum
  editor guarda uma cópia com caracteres de substituição que salvar escreveria
  de volta; um plano de renomeação deixa essa nota de fora e a nomeia; o
  `verso mcp` responde `not_text`. O índice continua decodificando com
  substituição, só para a busca, que não escreve nada. Antes disso, o texto era
  decodificado com substituição e salvar ou aplicar um plano escrevia os
  caracteres de substituição de volta — a leitura da Opus de 2026-09-23 achou
  isso.
- **Q26. Caminhos ignorados pela varredura e seu efeito em backlinks.**
  `DECIDIDA` em 2026-09-22 pelo mantenedor, sobre o memo
  `docs/reference/fs-decision.md`; a regra em si vive no
  [ADR 0044](../adr/0044-verso-fs-semantics.md), por ser de `verso-fs`. Entrada
  cujo nome começa com `.` não é percorrida em nenhuma profundidade — o que
  cobre `.obsidian/`, `.git/` e `.trash/` — mais uma lista configurável de
  caminhos relativos na configuração fora da árvore, vazia por padrão, e nenhum
  `.gitignore` na Fase 1. Nota ignorada é alvo de link não resolvido e nunca é
  fonte de backlink, então nota em `.trash/` que linka para outra não conta como
  backlink no critério de saída 2 da Fase 1.
  *(Revisto no ADR 0044 em 2026-09-29 pelo mantenedor: ao lado dessa lista,
  uma lista embutida de diretórios de build e o `.gitignore` de cada
  diretório, com a semântica do git, também ficam de fora, cada um atrás de
  um ajuste ligado por padrão. Uma entrada deixada de fora por qualquer um
  deles segue a mesma regra: alvo não resolvido, nunca fonte de backlink.)*

## 10. Histórico

| Versão | Data | Mudança |
|---|---|---|
| v0 | 2026-09-21 | Primeira versão, derivada de `docs/BRIEFING.md` §11. Nenhuma questão em aberto resolvida |
| v0.1 | 2026-09-21 | Aplicação da revisão da Fase 0 (`docs/review/phase-0.md`, aceita pelo mantenedor): seção 4 vira schema do `expected.yaml` (`PROPOSTO`), com `block` como resposta proposta a Q1, posições e `observed`; seções 5.12 (headings) e 5.13 (links Markdown, `PROPOSTO`) acrescentadas; D7 com status separado por item; Q7 e Q8 corrigidas quanto ao APFS; Q17 ampliada; Q18–Q26 acrescentadas. Nenhuma questão fechada |
| v0.2 | 2026-09-21 | Regra de fixtures alterada pelo mantenedor (ADR 0031 item 4): §4 e §8 atualizadas; Q1 fecha com a aprovação de `fixtures/wikilink/block-reference`. Nenhuma questão fechada ainda |
| v0.3 | 2026-09-21 | Mantenedor aprovou as cinco primeiras fixtures: schema §4 `DECIDIDO`; Q1 fechada (`block`). Primeira questão fechada |
| v0.4 | 2026-09-21 | Q18 fechada pelo mantenedor: leitura (b), parser somente leitura com property test de round-trip de quatro propriedades (`docs/reference/parser-decision.md`, ADR 0037). Segunda questão fechada |
| v0.5 | 2026-09-21 | Limites provisórios do frontmatter registrados sob a Q17 (64 níveis de aninhamento, 10 000 nós), vindos da revisão do PR do `verso-dialect` (`docs/review/phase-1-feature-1.md`). Nenhuma questão fechada |
| v0.6 | 2026-09-21 | Q3 fechada pelo mantenedor para o fim de um parágrafo e o fim de um item de lista, com a fixture `fixtures/block/list-item` como resposta e a §5.7 atualizada; o `^id` em linha própria depois de linha em branco, num heading e depois de bloco de várias linhas continuam em aberto, e a Q4 também |
| v0.7 | 2026-09-21 | Q17 fechada pelo mantenedor na parte do frontmatter (64 níveis de aninhamento, 10 000 nós), com o resto da questão continuando `[ABERTO]`; contradição dentro da §4.1 resolvida pela leitura estrita (chave de lista afirma a lista inteira). Terceira questão fechada, em parte |
| v0.8 | 2026-09-22 | Q26 fechada pelo mantenedor (ADR 0044, memo `docs/reference/fs-decision.md`): entradas ocultas não são percorridas em nenhuma profundidade, e nota ignorada é alvo não resolvido e nunca fonte de backlink |
| v0.9 | 2026-09-22 | Fato provisório registrado sob a Q12, vindo do código do `verso-fs`: nota é arquivo comum cuja extensão é exatamente `md`; `.MD`, `.Md` e `.markdown` são arquivos comuns até Q12 e Q8 serem decididas. Nenhuma questão fechada |
| v0.10 | 2026-09-22 | Fatos provisórios registrados sob Q2, Q8, Q12, Q14 e Q7, vindos do código do `verso-index` e da observação do Obsidian 1.13.7 no mesmo dia (`docs/reference/index-decision.md`): como um link resolve, caixa, embeds, alvos não resolvidos e NFC. Nenhuma questão fechada |
| v0.11 | 2026-09-22 | Fatos provisórios registrados sob Q12 e Q14, vindos do código do `verso-index` como ele ficou depois da leitura do Opus 5: alvo vazio (`[[#Heading]]`) resolve para a própria nota, colisão de caixa entre dois caminhos resolve como colisão de nomes simples, e alvo não resolvido é mostrado pela menor das grafias dele na ordem de bytes. Nada observado no Obsidian para esses três; nenhuma questão fechada |
| v0.12 | 2026-09-22 | **Q12 fechada pelo mantenedor**, seguindo o Obsidian 1.13.7 observado uma segunda vez no mesmo dia (`docs/reference/index-decision.md` §4.1, §4.6): alvo vazio é a própria nota e backlink dela; caminho é resolvido relativo à pasta da nota de origem além de a partir da raiz; nome puro prefere a pasta da própria origem, depois menos segmentos, depois ordem de bytes; alias não resolve; `[[nota/]]` e `[[.md]]` não resolvem. As partes de Q2, Q8 e Q14 de que a regra precisa são respondidas junto; o resto dessas três continua aberto. Quarta questão fechada |
| v0.13 | 2026-09-23 | Fatos provisórios registrados em Q12, Q13, Q15 e Q16, vindos do código da branch da Fase 2: onde o código se afasta do ponto 3 da Q12 ("sob" a pasta de origem onde o ponto 3 diz "na", o que o mantenedor ainda não resolveu), tags no corpo, as extensões de Markdown e quebras de linha que a visualização de leitura renderiza, e os arquivos que não são nota. A linha da Q14 sobre `[[#Heading]]` marcada como superada pelo ponto 1 da Q12. Nenhuma questão fechada |
| v0.14 | 2026-09-23 | Fatos provisórios em Q6, Q12, Q13, Q15, Q16, Q24 e Q25 trazidos até o código depois da leitura da Opus do branch da Fase 2: comentários escondidos e HTML embutido sanitizado na visualização de leitura, uma regra de tag só para o índice e o leitor, embeds resolvidos pela Q12 a partir da nota, a fronteira do frontmatter da janela, arquivos que não são UTF-8 não abertos para edição. Nenhuma questão fechada |
| v0.15 | 2026-09-23 | **Ponto 3 da Q12 emendado pelo mantenedor**: um nome solto prefere um candidato sob a pasta da nota de origem, em qualquer profundidade, como o Obsidian 1.13.7 faz (a terceira observação de `docs/reference/index-decision.md` §4.1); o índice já fazia, e embeds de arquivos agora fazem também. A Q12 continua fechada |
| v0.16 | 2026-09-23 | As respostas do mantenedor sobre a revisão da Fase 2 (`docs/review/phase-2.md` §6, itens 4 e 20): **Q13 e Q25 fechadas** como o código faz; Q5 (tipos, dobra — sobre a qual a visualização de leitura agora age, `5b7fc69` — e título), Q6 (comentários), Q15 e Q24 decididas para a visualização de leitura e a janela, com a parte do índice e o resto ainda abertos — o aninhamento da Q5 e os `<iframe>`, `<video>` e `<audio>` da Q6 continuam abertos porque a visualização de leitura não segue o Obsidian ali; Q22 decidida para o charset e a caixa das tags; **a ordem do ponto 2 da Q12 dita**: um caminho a partir da raiz primeiro, depois relativo à pasta da origem, e `./` ou `../` só relativo, como o Obsidian 1.13.7 faz. Duas questões fechadas, cinco em parte |
| v0.17 | 2026-09-24 | Q5: um fato provisório, não uma resposta — a visualização de leitura desenha um callout dentro de um callout, até 32 níveis (branch `feat/nested-callouts`); o aninhamento continua `[ABERTO]` |
| v0.18 | 2026-09-24 | **Q11 fechada pelo mantenedor** (`docs/reference/typed-note-decision.md`, [ADR 0052](../adr/0052-typed-note.md)): um schema é um bloco cercado `verso-schema`, com YAML dentro, numa nota em qualquer lugar da pasta aberta menos caminhos ocultos e ignorados, nomeado pelo `type` que traz dentro; dois schemas com o mesmo nome não tipam nada, e o conflito aparece; se um bloco aninhado conta não está decidido. Seção 6: a nota tipada, os schemas e o i18n de schema `DECIDIDOS`, a restrição 1 (ADR 0013) aceita. Q24: a parte dos links é a próxima decisão. Nenhuma fixture ainda: a implementação as traz. Q6: um ponteiro para `docs/reference/embedded-media-decision.md`, que corrige a afirmação de que a documentação do Obsidian mostra `<video>` e `<audio>`; a Q6 continua aberta |
| v0.19 | 2026-09-24 | Q11: **um bloco `verso-schema` aninhado não conta**, decidido pelo mantenedor (`docs/reference/views-decision.md` §2, [ADR 0052](../adr/0052-typed-note.md) ponto 3): só um bloco no nível de cima de uma nota é schema, e um aninhado é mostrado como não lido. As bases (arquivos `.base` e blocos `base`) são do [ADR 0053](../adr/0053-views-bases.md), não desta spec, que é o dialeto das notas |
| v0.20 | 2026-09-29 | Q19, parte setext: **uma resposta observada e uma fixture rascunhada** — `Título` sobre `===` é heading de nível 1, sobre `---` de nível 2, e um `---` logo abaixo de texto nunca é quebra temática (CLI do Obsidian, `docs/reference/obsidian-cli.md`; `fixtures/heading/setext`, rascunho da IA). Seção 5.12 atualizada; a subquestão setext fecha com a aprovação dessa fixture pelo mantenedor no pull request dela. A parte do casamento da Q19 continua aberta |
| v0.21 | 2026-09-29 | **Q19, parte setext, fechada pelo mantenedor**: a fixture `fixtures/heading/setext` aprovada na sessão ("ratifique o que precisar"); um sublinhado setext é heading, como observado no Obsidian. Seção 5.12 atualizada. A parte do casamento da Q19 continua `[ABERTO]`. Q26: uma nota apontando para a revisão do ADR 0044 do mesmo dia — diretórios de build e `.gitignore` de fora, atrás de ajustes. Uma questão fechada, em parte |
| v0.22 | 2026-09-30 | **Q10 fechada pelo mantenedor** (`docs/reference/board-decision.md` §10, [ADR 0057](../adr/0057-board-json-canvas.md)): uma relação tipada é uma propriedade do frontmatter da nota de origem cujo valor é um wikilink entre aspas ou uma lista deles, a chave o seu tipo; com ela, **a parte de links da Q24**. **Q16 decidida para `.canvas`** como o Obsidian faz: nós `file` e os links dos nós `text` são fontes de backlink, um canvas é alvo de link pelo nome completo. §5.11: o formato do board — o desenho sob uma chave de topo `verso`, nenhum tipo do próprio Verso, o layout do Obsidian mantido na escrita. Seção 6: a relação tipada `DECIDIDA`; o D4 da tabela de conversão `DECIDIDO`. Uma questão fechada, duas em parte |
| v0.23 | 2026-10-01 | Sobre a revisão crítica `docs/review/board.md`, §6, aceita pelo mantenedor: **`property_links`** entra no schema do `expected.yaml` (§4.1, §4.7, §4.6), com a fixture rascunhada `fixtures/frontmatter/property-links` (rascunho de IA, observada no Obsidian 1.13.7); a §5.11 registra os campos próprios do Verso num canvas, que um nó `file` é um caminho a partir da raiz, e que um salvamento escreve o que o usuário não mudou como foi lido. Nenhuma questão fechada |
| v0.24 | 2026-10-02 | A fixture `fixtures/frontmatter/property-links` **aprovada pelo mantenedor** em sessão ("Já aprovo agora"), antes da 0.3.0-beta.3; a marca de rascunho removida. Nada mais muda. |
| v0.25 | 2026-10-02 | Propriedades de organização ([ADR 0060](../adr/0060-makemd-organizing-features.md)): `sticker`, `color`, `banner`, `banner_y`, `order`, `pinned`, `items_sticker`, `items_color`, `items_template` `DECIDIDAS` na seção 6. |
| v0.26 | 2026-10-07 | Começa a implementação da nota tipada ([ADR 0052](../adr/0052-typed-note.md)): **`schemas`** entra no schema das fixtures (§4.1, §4.8), com a categoria `schema` na §8 e duas fixtures rascunhadas à espera da aprovação do mantenedor. A versão do cabeçalho, deixada em v0.24 pela v0.25, se acerta |
| v0.27 | 2026-10-07 | As fixtures `fixtures/schema/top-level` e `fixtures/schema/nested-and-invalid` **aprovadas pelo mantenedor** em sessão ("ta aprovado a fixture"); a marca de rascunho removida. Nada mais muda. |
| v0.28 | 2026-10-07 | **Q3, Q4 e Q21 decididas pelo mantenedor**, depois de uma observação do Obsidian pelo CLI no mesmo dia: um bloco é a unidade do editor (Q21); um `^id` sozinho depois de uma linha em branco nomeia o bloco de antes, um no fim de um heading nomeia o heading (Q3); um id é único por nota, o último de dois nomeando o bloco (Q4). Os itens de `blocks` ganham `lines` (§4.3). Três fixtures rascunhadas, à espera da aprovação do mantenedor: `block/after-a-block`, `block/heading`, `block/duplicate`. A §5.7 diz como o id é desenhado: escondido na leitura, apagado no editor, como observado. |
| v0.29 | 2026-10-07 | As fixtures `fixtures/block/after-a-block`, `fixtures/block/heading` e `fixtures/block/duplicate` **aprovadas pelo mantenedor** em sessão ("tao aprovados"), depois de conferir os blocos no app; a marca de rascunho removida. Nada mais muda. |
| v0.30 | 2026-10-07 | Depois da leitura do revisor sobre o recurso de blocos (PR #37): a Q3 ganha quatro **fatos provisórios da implementação**, `[ABERTO]` para o mantenedor — item solto nomeado inteiro pelo primeiro parágrafo, "o bloco de antes" na mesma profundidade, um `^palavra` que não é id como parágrafo comum, e a linha do `^id` dentro do item que ela nomeia — com a linha de status dizendo o que está decidido e o que está aberto; a Q4 diz onde a regra do último id está enunciada (o schema de resposta do `read_note`) e aplicada (a janela). Nenhuma fixture até o mantenedor decidir. |
| v0.31 | 2026-10-07 | A parte aberta da Q3 **observada no Obsidian pelo CLI dele** (28 entradas): o bloco é a seção de nível superior, ou o item de lista mais interno; sozinho sem nada antes, nenhum bloco. Implementado; três fixtures rascunhadas (`block/in-list`, `block/in-quote`, `block/alone-top`), aguardando a aprovação do mantenedor; os fatos provisórios da v0.30 substituídos pela observação. A frase "Sem mudança:" da Q3 cita a seção 5.7, onde mora a regra do texto próprio. |
| v0.32 | 2026-10-07 | As fixtures `fixtures/block/in-list`, `fixtures/block/in-quote` e `fixtures/block/alone-top` **aprovadas pelo mantenedor** em sessão ("Aprovado"); a marca de rascunho removida. **A Q3 fecha por inteiro.** Nada mais muda. |
| v0.33 | 2026-10-07 | Depois da segunda leitura da Opus: a §5.7 diz a regra decidida (a seção de nível superior, ou o item de lista mais interno) no lugar da frase do "texto próprio", lista as três fixtures novas e diz como fica um `^id` que não nomeia nada; os dois parágrafos de decisão da Q3 viram um, em dois passos; **dois `^id` sozinhos em sequência** fica `[ABERTO]` (a extensão ou o "só o último" do Obsidian), com os casos do frontmatter e da nota de rodapé registrados como não observados; as 28 entradas observadas estão em `docs/reference/obsidian-blocks-2026-10-07.md`. |
| v0.34 | 2026-10-09 | **Dois `^id` sozinhos em sequência** `DECIDIDO` pelo mantenedor: só o último nomeia o bloco antes deles, como no Obsidian; a fixture `fixtures/block/two-alone` rascunhada, aguardando a aprovação do mantenedor. |
| v0.35 | 2026-10-09 | A fixture `fixtures/block/two-alone` aprovada pelo mantenedor em sessão ("aprovado"). |
| v0.36 | 2026-10-10 | **Q7 `DECIDIDO`** pelo mantenedor em sessão, como recomendado, a partir do achado F20 da campanha de sync de 2026-10-10 (dois aparelhos no Windows e no Linux guardaram as duas formas de um nome, e um nunca enviou): um nome é um arquivo só em todo lugar — o servidor compara nomes em NFC, cada aparelho guarda a grafia que o próprio sistema de arquivos deu ao nome, um arquivo mudado dos dois lados sob as duas formas é uma cópia de conflito (item 8 da ADR 0079). A §5.10 diz isso; o fato provisório da v0.10 mantido como histórico. Sem fixture: o mantenedor não pediu uma. |
| v0.37 | 2026-10-12 | O lado da criação da Q8 `DECIDIDO` pelo mantenedor em sessão (*"Todos aprovados"*, como recomendado): um nome novo que só difere em maiúsculas e minúsculas de uma entrada da pasta dele é recusado quando o Verso o cria ou renomeia, em todo sistema e no servidor (ADR 0070 item 3, revisado). A Q8 em si, a caixa na resolução de nome, continua `[ABERTO]`. Sem fixture: nomes criados, não o dialeto. |
| v0.38 | 2026-10-14 | **Q9 `DECIDIDO`** pelo mantenedor, aceitando o ADR 0087 e o item 8 dele (*"Sim, todas"*): a visibilidade por bloco é um callout do tipo `secret`, um callout no arquivo, servido por um UniVerso aos leitores como uma projeção sem ele; a §5.8 e a linha da §6 revisadas. Sem fixture: a fixture da Q9 vem com o PR que constrói o ADR 0087, para a aprovação do mantenedor. |
| v0.39 | 2026-10-14 | O [ADR 0086](../adr/0086-infobox-a-typed-notes-card.md), aceito no mesmo dia, implementado: os tipos `link` e `image` de um schema e o seu `layout` de topo (`infobox`) entram na §4.8, na §6 e no formato da Q11; a fixture `fixtures/schema/infobox` rascunhada, aguardando a aprovação do mantenedor. A fixture aprovada `fixtures/schema/nested-and-invalid` escreve `kind: link` como o seu tipo desconhecido, o que `link` deixou de ser: a entrada dela espera o mantenedor (invariantes 14 e 16). Nenhuma questão fechada. |
| v0.40 | 2026-10-14 | O schema ganha `prose` (§4.1, §4.9): os trechos de prosa do [ADR 0089](../adr/0089-linking-unlinked-mentions.md) item 1, onde as menções são procuradas, pela resposta M6 do mantenedor (*"Sim, todas"*); a fixture `fixtures/prose/what-is-prose` rascunhada, aguardando a aprovação do mantenedor. Nenhuma questão fechada. |
| v0.41 | 2026-10-14 | As fixtures `fixtures/code/dice-inline`, `fixtures/prose/what-is-prose` e `fixtures/schema/infobox` **aprovadas pelo mantenedor** em sessão (*"Aprovo as 3"*), e com elas a chave `prose` do schema (§4.1, §4.9) da v0.40; a marca de rascunho delas removida. `code/dice-inline` observada no Obsidian 1.14.4 pelo CLI dele, sem o plugin Dice Roller, antes de a aprovação ser registrada: os links e o bloco dela são os do Obsidian, e o `observed:` dela diz como. Nada mais muda. |
| v0.42 | 2026-10-14 | O schema ganha `reader` (§4.1, §4.6): a nota como um UniVerso a serve a um leitor, a projeção da Q9 e do [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md) item 3. A fixture rascunhada `fixtures/callout/secret`, com o PR que constrói o ADR 0087, espera a aprovação do mantenedor; o parágrafo da Q9 o diz. Nenhuma decisão mudou |
| v0.43 | 2026-10-15 | §5.11 item 5 e um novo item 6: mapas no board ([ADR 0090](../adr/0090-maps-on-the-board.md)) — o `verso` de um nó ganha `map`, `pin` e `secret`, e um nó secreto fica de fora do que um leitor recebe. Sem fixture: o schema das fixtures (§4) descreve uma nota Markdown, e um canvas não é parseado pelo dialeto; a guarda é o teste de propriedade da projeção no núcleo. Nenhuma questão fechada |
| v0.44 | 2026-10-15 | §5.11 item 7: um callout `> [!secret]` dentro do nó de texto de um board fica escondido dos leitores como numa nota, e um `.txt` (qualquer arquivo que não é Markdown) não é projetado ([ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md), a decisão do mantenedor sobre o achado I3). Sem fixture (um canvas não é parseado pelo dialeto); a guarda é o teste de propriedade do núcleo e a sonda de leitor do servidor. Nenhuma questão fechada |
| v0.45 | 2026-10-15 | A fixture `fixtures/callout/secret` **aprovada pelo mantenedor** em 2026-10-15 em sessão (*"aceito todas recomendações"*); a marca de rascunho dela removida. Ela afirma o `reader` (§4.1, §4.6) da Q9 e do [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md): um bloco no nível de cima, um dentro de outro callout com o tipo em maiúsculas, um num item de lista, um `[!secrets]` mantido. Nada mais muda |
| v0.46 | 2026-10-20 | §6: duas linhas, o bloco cercado ```` ```statblock ```` ([ADR 0099](../adr/0099-visual-markdown-statblocks-and-cards.md)) e o callout `> [!oracle]` ([ADR 0102](../adr/0102-creative-oracles-and-improvisation.md)), construções que o Verso desenha e o Obsidian lê como um bloco de código e um callout; o parser não muda. Nenhuma fixture (nada aqui responde a uma pergunta da §9 nem muda o que o parser devolve). Nenhuma pergunta fechada |
| v0.47 | 2026-10-21 | As respostas do mantenedor ao questionário de decisões de 2026-10-20 (respondido em 2026-10-21): **Q2, Q5 (aninhamento), Q6, Q8, Q14, Q15, Q16, Q17, Q19, Q20, Q22, Q23 e Q24 `DECIDIDAS`**, cada uma como a opção marcada — a Q14 com as duas opções, A (ratificar) e B (links não resolvidos como nós do grafo). Cada decisão está registrada; nenhuma fecha por inteiro, pois as que precisam de fixture ou de observação do Obsidian esperam o PR que as acrescenta (invariante 17); a `callout/nested` da Q5 é um PR de código separado. §5 e §7 atualizadas: a §7 agora aponta para o [ADR 0093](../adr/0093-periodic-notes.md) para as notas periódicas, não para a §9. Nenhuma fixture mudou |
