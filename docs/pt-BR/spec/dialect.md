# Spec do dialeto do Verso — v0.21

- Versão: v0.21 · 2026-09-29
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
| `blocks` | `id` (sem `^`), `pos` (posição do `^`) |
| `callouts` | `kind` (texto entre `[!` e `]`, como escrito), `title` (resto da primeira linha, sem espaços nas pontas; ausente se vazio), `fold` (`-`, `+`, ou ausente), `pos` |

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

Não existe campo para relação tipada, visibilidade por bloco, tags inline nem
resolução de link: cada um entra no schema quando a questão correspondente
fechar, com PR que atualiza esta seção.

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
conta como link no grafo e nos backlinks: `[ABERTO]` (seção 9, Q2).

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

Num item de lista o `^id` é procurado no texto próprio do item, antes de
qualquer bloco aninhado: um `^id` dentro de um bloco de código, de um bloco
HTML ou de uma lista aninhada que termina o item não define bloco daquele item
— a seção 5.9 já põe código fora do que é varrido — e um item mantém o seu
`^id` quando vem uma lista aninhada depois. É como o parser se comporta; não é
uma decisão a mais.

O ID estável de bloco, com backlinks e presença no grafo, é primitiva proposta
([ADR 0014](../adr/0014-primitives-catalog.md)). A **sintaxe** `^id` é
compatível e decidida; o que o Verso faz com ela vai além do Obsidian.

Duas posições estão decididas, em 2026-09-21 pelo mantenedor, com as fixtures
`fixtures/block/definition` e `fixtures/block/list-item` como resposta: um `^id`
como última palavra de um parágrafo e um `^id` como última palavra de um item de
lista. As demais posições — um `^id` sozinho numa linha depois de linha em
branco, um `^id` num heading e um `^id` depois de bloco de várias linhas — e o
escopo de unicidade do id continuam `[ABERTO]` (seção 9, Q3 e Q4).

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
ou expandido) e o aninhamento: `[ABERTO]` (seção 9, Q5).

Callout **não** é o mecanismo de segredo do mestre: a visibilidade por bloco tem
sintaxe própria, ainda `[ABERTO]` (seção 9, Q9).

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
`[ABERTO]` (seção 9, Q6).

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
forma recebida e faz busca insensível à normalização) e sensibilidade a
maiúsculas: `[ABERTO]` (seção 9, Q7 e Q8).

### 5.11 `.canvas` (JSON Canvas)

Arquivos `.canvas` no formato JSON Canvas são lidos e escritos sem quebrar. O
formato é de terceiros e não é redefinido aqui.

Se o Verso estende o JSON Canvas e como persiste o board:
`[ABERTO]` ([ADR 0040](../adr/0040-board-persistence.md)).

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
`[[nota#Cap 1#Seção]]`): `[ABERTO]` (seção 9, Q19).

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
parte do casamento da Q19 continua `[ABERTO]`.

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
`[ABERTO]` (seção 9, Q20). Proposta, não decisão: o briefing não lista essa
forma.

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
| Relação tipada | aresta com tipo e direção; várias relações entre os mesmos dois nós | `[ABERTO]` (Q10) |
| Schemas | um bloco cercado `verso-schema` numa nota, em qualquer lugar da pasta menos caminhos ocultos e ignorados | `DECIDIDO` em 2026-09-24 (Q11) |
| Visibilidade por bloco | segredo do mestre | `[ABERTO]` (Q9) |

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
| D4 | Desenho do Excalidraw | `.excalidraw.md` do plugin | formato do board do Verso | `PROPOSTO` (§11.2) | Conversão explícita, com diff |
| D5 | ID de bloco | usado para referência | além disso, gera backlink e aparece no grafo | `PROPOSTO` ([0014](../adr/0014-primitives-catalog.md)) | Ganho, não perda: a sintaxe é a mesma |
| D6 | Consulta | plugin de terceiro (Dataview) | consulta nativa por tipo, propriedade e relação; view pode materializar em Markdown | `PROPOSTO` ([0014](../adr/0014-primitives-catalog.md)) | Notas com blocos `dataview` não são executadas pelo Verso |
| D7 | Plugins | API síncrona, acesso a disco | TypeScript em Web Worker, sem disco, capabilities declaradas | Execução: `DECIDIDO` ([0016](../adr/0016-plugins-execution-and-capabilities.md)). Shim: `PROPOSTO` ([0017](../adr/0017-plugins-format-shim-loading.md)) | Plugin de Obsidian não roda. Se o shim proposto existir, cobre só a API pública, com tabela declarada |

Sobre D2, D3 e D4: conversão **só por ação do usuário, com diff visível**. Abrir
um arquivo nunca o reescreve ([ADR 0012](../adr/0012-files-are-source-of-truth.md)).

O que o Verso ainda **não** define e o Obsidian define — resolução de link
ambíguo, tags inline, notas periódicas, busca — está na seção 9, não aqui.

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

- **Q9. Sintaxe de visibilidade por bloco (segredo do mestre).** `[ABERTO]`
  Decidir antes de compartilhamento e exportação (§17 item 8). Precisa
  sobreviver a abrir o arquivo no Obsidian sem vazar o segredo nem quebrar o
  texto. Depende disso a visão de jogador e o mapeamento para permissão de
  journal no Foundry ([ADR 0036](../adr/0036-tabletop-rpg-support.md)).
- **Q10. Sintaxe de relação tipada.** `[ABERTO]`
  Decidir antes de implementar relações (§17 item 6). Requisitos já fixados:
  tipo e direção, várias relações entre os mesmos dois nós
  ([ADR 0014](../adr/0014-primitives-catalog.md)), e degradar para Markdown
  legível ([ADR 0013](../adr/0013-degrades-to-markdown.md)).
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
     nele executa. É lido sob os limites do frontmatter (Q17).
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
- **Q2. Embed conta como link no grafo e nos backlinks?** `[ABERTO]` (seção 5.6)

  **Fato provisório vindo do `verso-index`, registrado em 2026-09-22, que não
  responde a esta questão.** Embed conta como link **e** como backlink: é
  guardado com o tipo dele, resolve pela mesma regra de um link e aparece nos
  backlinks do alvo, marcado como embed para quem chama saber distinguir os
  dois. Observado no Obsidian 1.13.7 pelo CLI dele em 2026-09-22 (ADR 0009; a
  execução está em `docs/reference/index-decision.md` §4.1): os cinco links
  que o `resolvedLinks` conta da nota de teste para `Alvo.md` incluem o embed
  `![[Alvo]]`. Quem decide é o mantenedor; esta linha só registra o que o
  código faz enquanto isso.
- **Q3. Posição admissível do `^id`.** `DECIDIDO` para o fim de um parágrafo e
  o fim de um item de lista; `[ABERTO]` para o resto.
  Fechada para essas duas em 2026-09-21 pelo mantenedor, com as fixtures
  `fixtures/block/definition` e `fixtures/block/list-item` como resposta
  (ADR 0031): um `^id` como última palavra de um parágrafo e um `^id` como
  última palavra de um item de lista definem o bloco (seção 5.7). Continuam
  `[ABERTO]`: um `^id` sozinho numa linha depois de linha em branco, um `^id`
  num heading e um `^id` depois de bloco de várias linhas.

  Ficam registradas aqui duas observações do mesmo dia, e nenhuma das duas fecha
  nada. (1) Na entrada `Primeiro parágrafo.`, linha em branco e `^solto`, o
  Obsidian prende o id ao bloco **anterior**: observado pelo CLI do Obsidian,
  só API pública (ADR 0009; `docs/reference/obsidian-cli.md`), em que
  `app.metadataCache.getCache(...)` reporta `blocks.solto` com a posição do
  parágrafo da linha 0, e a linha `^solto` não é seção própria. O nosso parser
  trata essa linha como parágrafo próprio e reporta o `^` na posição dele
  (linha 3, coluna 1), que é o que a seção 4.3 pede de `pos` seja qual for o
  bloco que o id nomeia; **qual** bloco ele nomeia é esta questão, e depende da
  Q21 ("o que é um bloco"). (2) Um `^id` num heading não foi observado e nada
  está implementado para ele. Fica registrado também um fato da implementação,
  que não decide nada: num item de lista o `^id` é procurado no texto próprio do
  item, até o primeiro filho de bloco, de modo que um `^id` dentro de um bloco
  de código, de um bloco HTML ou de uma lista aninhada que termina o item não
  define bloco daquele item (seção 5.9), e um item cuja própria linha termina em
  `^id` mantém o id quando vem uma lista aninhada depois.
- **Q4. Escopo de unicidade do `^id`.** `[ABERTO]`
  Único por arquivo ou por pasta; o que fazer com duplicata (seção 5.7).
- **Q5. Cobertura de callout.** `DECIDIDA` para os tipos, a dobra e o título na
  visualização de leitura em 2026-09-23; `[ABERTO]` para o aninhamento.
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
- **Q6. Contextos em que `[[...]]` não é link, além de crase e cerca.**
  `[ABERTO]` para o índice e para HTML embutido; os comentários na
  visualização de leitura `DECIDIDOS` em 2026-09-23. Bloco indentado por 4
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
- **Q7. Normalização Unicode na comparação de nomes.** `[ABERTO]`
  NFC × NFD. O APFS (macOS, plataforma inicial) preserva a forma recebida e faz
  busca insensível à normalização; HFS+ forçava NFD; Linux compara bytes. Um
  vault que passou por sync ou por HFS+ mistura as duas formas (seção 5.10).

  **Fato provisório vindo do `verso-index`, registrado em 2026-09-22, que não
  responde a esta questão.** Os dois lados de uma comparação de nome passam por
  NFC antes de serem comparados, então um nome escrito em NFC e o mesmo nome
  escrito em NFD são um nome só. Isso **não** foi observado no Obsidian:
  decorre da definição das duas formas, e o APFS, insensível à normalização,
  esconde a diferença na plataforma inicial. Quem decide é o mantenedor; esta
  linha só registra o que o código faz enquanto isso.
- **Q8. Sensibilidade a maiúsculas na resolução de nome.** `[ABERTO]`
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
- **Q14. Link para arquivo que não existe.** `[ABERTO]`
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
- **Q15. Extensões de Markdown fora da base.** `DECIDIDA` para a visualização
  de leitura em 2026-09-23; `[ABERTO]` para o parser que alimenta o índice.
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
- **Q16. Arquivos não-Markdown na pasta.** `[ABERTO]`
  Quais entram no índice como alvo de link (imagens, PDF, `.canvas`) e quais são
  ignorados.

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
- **Q17. Limite de tamanho e comportamento com arquivo malformado.**
  `[ABERTO]` — a parte do frontmatter está `DECIDIDA` abaixo; o resto da
  questão continua aberto.
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
- **Q19. Casamento de heading.** `[ABERTO]`, a parte setext `DECIDIDA` em
  2026-09-29 (seção 5.12)
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
- **Q20. Links Markdown para arquivo local.** `[ABERTO]` (seção 5.13)
  Se contam como link (proposta: sim); `<...>` com espaços; caminho relativo
  `../`; o que separa link local de URL externa; `![](img.png)` como embed;
  URL-encoding.
- **Q21. O que é um "bloco".** `[ABERTO]`
  Usado em toda a documentação (ID de bloco, merge por bloco, visibilidade por
  bloco, citação por posição) e nunca definido: parágrafo, item de lista,
  célula de tabela, callout inteiro, bloco de código, heading com seu
  conteúdo? A documentação pública do Obsidian descreve a noção dele; a spec
  precisa da sua antes de Q3 e Q4 fazerem sentido.
- **Q22. Charset do `^id` e forma das tags.** `DECIDIDA` para o charset e a
  caixa das tags em 2026-09-23; `[ABERTO]` para o resto.
  A documentação pública do Obsidian restringe `^id` a letras, números e hífen;
  o que acontece com `^id` inválido. Para tags (Q13): charset, aninhamento
  `#a/b`, sensibilidade a maiúsculas, prefixo `#` em `tags` de frontmatter.

  **Decidido em 2026-09-23 pelo mantenedor, para as tags** (`docs/review/phase-2.md` §6, item 4; a resposta: *"a e b ok"*): o
  charset e a passagem para minúsculas são os registrados na Q13. A parte do
  `^id`, o que `#a/b` significa como hierarquia e um prefixo `#` nas `tags` do
  frontmatter continuam `[ABERTO]`.
- **Q23. Formas combinadas e escapes de wikilink.** `[ABERTO]`
  `[[nota#seção|alias]]`, `[[nota#^bloco|alias]]`, `[[#seção]]` e `[[#^bloco]]`
  (mesmo arquivo — conta como backlink de si mesmo?), `[[pasta/nota]]`,
  `[[nota.md]]`, `[[nota\|alias]]` em tabela, `\[[não é link]]`, `[[ nota ]]`
  com espaços, `![[img.png|300]]` (tamanho, não alias), `[[nota|alias|extra]]`,
  wikilink dentro de link Markdown ou de imagem.
- **Q24. Fronteira e dialeto do frontmatter.** `[ABERTO]` (seção 5.1); a parte
  da janela `DECIDIDA` em 2026-09-23.
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
