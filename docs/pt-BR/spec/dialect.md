# Spec do dialeto do Verso — v0.3

- Versão: v0.3 · 2026-09-21
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

**Chave ausente não afirma nada**; `links: []` afirma que não há link. A ordem
das listas é a ordem em que a construção aparece no arquivo. Uma fixture afirma
só o que lista: o parser pode produzir mais do que a fixture pede, nunca menos
nem diferente.

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

O ID estável de bloco, com backlinks e presença no grafo, é primitiva proposta
([ADR 0014](../adr/0014-primitives-catalog.md)). A **sintaxe** `^id` é
compatível e decidida; o que o Verso faz com ela vai além do Obsidian.

Posição admissível do `^id` (fim de linha, linha própria, depois de bloco de
várias linhas) e escopo de unicidade: `[ABERTO]` (seção 9, Q3 e Q4).

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
`[[nota#Cap 1#Seção]]`) e heading no estilo setext (`===`/`---`): `[ABERTO]`
(seção 9, Q19).

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

Nada nesta seção está decidido. Tudo aqui é `PROPOSTO` ou `[ABERTO]`, e nada
pode contradizer a seção 5.

| Extensão | Forma | Status |
|---|---|---|
| Nota tipada | `type:` no frontmatter + schema em arquivo de texto na pasta; sem schema, é Markdown comum | `PROPOSTO` ([ADR 0014](../adr/0014-primitives-catalog.md)) |
| Proveniência de escrita | autor, modelo e quando, no frontmatter | `PROPOSTO` ([ADR 0014](../adr/0014-primitives-catalog.md)) |
| Views materializáveis | saída de consulta escrita como Markdown real no arquivo | `PROPOSTO` ([ADR 0014](../adr/0014-primitives-catalog.md)) |
| i18n de schema | chave neutra de idioma com rótulo traduzido (`type: npc` exibido como "PdM" ou "NPC") | `PROPOSTO` (§11.3) |
| Relação tipada | aresta com tipo e direção; várias relações entre os mesmos dois nós | `[ABERTO]` (Q10) |
| Schemas | formato e localização | `[ABERTO]` (Q11) |
| Visibilidade por bloco | segredo do mestre | `[ABERTO]` (Q9) |

Exemplo de nota tipada, na forma proposta:

```markdown
---
type: npc
title: Barão Vermelho
---

O barão governa o distrito norte.
```

Um vault do Obsidian que já use `type:` no frontmatter para outra finalidade
continua válido: sem schema correspondente na pasta, a nota é Markdown comum.

Restrições que qualquer extensão precisa respeitar:

1. Degrada para Markdown legível em qualquer editor
   ([ADR 0013](../adr/0013-degrades-to-markdown.md), `PROPOSTO`).
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
- **Q11. Formato e localização dos schemas.** `[ABERTO]`
  Decidir antes da nota tipada, na Fase 2 (§17 item 7). "Arquivo de texto na
  pasta" é a única pista do briefing. Tensiona com D2: schema dentro da pasta,
  config fora dela. Afeta os packs de schema
  ([ADR 0015](../adr/0015-schema-packs.md)).

### Lacunas de parsing — não respondidas pelo briefing

Levantadas ao escrever esta spec. Todas precisam de resposta antes de
`verso-dialect` (Fase 1, feature 1).

- **Q1. Nome do campo de referência de bloco no `expected.yaml`.** `DECIDIDO`
  O exemplo do briefing nomeia `target`, `alias` e `heading`, mas não o campo de
  `#^bloco` (seção 5.5). Resposta: `block` (seção 4.2). Fechada em 2026-09-21
  pela aprovação, pelo mantenedor, da fixture
  `fixtures/wikilink/block-reference` (ADR 0031).
- **Q2. Embed conta como link no grafo e nos backlinks?** `[ABERTO]` (seção 5.6)
- **Q3. Posição admissível do `^id`.** `[ABERTO]`
  Fim de linha, linha própria, depois de lista ou de bloco de várias linhas
  (seção 5.7).
- **Q4. Escopo de unicidade do `^id`.** `[ABERTO]`
  Único por arquivo ou por pasta; o que fazer com duplicata (seção 5.7).
- **Q5. Cobertura de callout.** `[ABERTO]`
  Tipos reconhecidos, `-`/`+`, aninhamento (seção 5.8).
- **Q6. Contextos em que `[[...]]` não é link, além de crase e cerca.**
  `[ABERTO]` Bloco indentado por 4 espaços, HTML embutido, `%%comentário%%`,
  link dentro de URL (seção 5.9).
- **Q7. Normalização Unicode na comparação de nomes.** `[ABERTO]`
  NFC × NFD. O APFS (macOS, plataforma inicial) preserva a forma recebida e faz
  busca insensível à normalização; HFS+ forçava NFD; Linux compara bytes. Um
  vault que passou por sync ou por HFS+ mistura as duas formas (seção 5.10).
- **Q8. Sensibilidade a maiúsculas na resolução de nome.** `[ABERTO]`
  Interage com sistemas de arquivo case-insensitive (macOS por padrão — APFS
  pode ser case-sensitive por volume —, Windows) e case-sensitive (Linux) — o
  mesmo vault pode resolver diferente por plataforma (seção 5.10).
- **Q12. Regra de resolução de link para arquivo.** `[ABERTO]`
  Como `[[nota]]` vira um arquivo: caminho relativo, caminho mais curto único,
  extensão `.md` implícita, comportamento com nome ambíguo, e como `aliases`
  participa. Com workspace multi-raiz
  ([ADR 0041](../adr/0041-multi-root-workspace.md), `PROPOSTO`), a resolução
  também atravessa raízes.
- **Q13. Tags inline (`#tag` no corpo).** `[ABERTO]`
  O briefing só cita `tags` no frontmatter. Se `#tag` no corpo conta como tag,
  e como conviver com `#` de heading e com `#` de URL.
- **Q14. Link para arquivo que não existe.** `[ABERTO]`
  Se entra no índice como alvo pendente, se aparece no grafo, se conta como
  backlink.
- **Q15. Extensões de Markdown fora da base.** `[ABERTO]`
  Tabelas, footnotes, task list, matemática, destaque `==texto==`, strikethrough.
  O briefing não lista nenhuma; a escolha do parser base
  ([ADR 0037](../adr/0037-base-parser.md)) mexe no que sai de graça.
- **Q16. Arquivos não-Markdown na pasta.** `[ABERTO]`
  Quais entram no índice como alvo de link (imagens, PDF, `.canvas`) e quais são
  ignorados.
- **Q17. Limite de tamanho e comportamento com arquivo malformado.** `[ABERTO]`
  O fuzzing garante que não trava ([ADR 0029](../adr/0029-guardrails-in-ci.md)),
  mas o resultado esperado — erro, parse parcial ou arquivo tratado como texto —
  não está definido. Inclui limites de recurso: arquivo de centenas de MB, linha
  única de dezenas de MB, colchetes aninhados aos milhares (parser quadrático).
  Fuzzing pega crash, não lentidão; o limite e o que acontece ao ultrapassá-lo
  precisam ser ditos.

  Registrado em 2026-09-21, e a questão continua `[ABERTO]`: desde a revisão do
  PR do `verso-dialect` (`docs/review/phase-1-feature-1.md`) o código carrega
  dois limites **provisórios** no frontmatter — no máximo 64 níveis de
  aninhamento e no máximo 10 000 nós. Os dois são contados no fluxo de eventos
  do YAML antes de existir qualquer árvore; um alias é cobrado pelo que o
  loader clona no lugar dele, e o nível a mais que uma tag acrescenta também é
  contado. Um frontmatter acima de qualquer um dos limites é reportado com o
  seu span e com `values` como erro; o corpo continua sendo parseado e nada
  mais no arquivo muda. Os dois números foram escolhidos para manter o `parse`
  retornando para toda entrada (Q18, propriedade 1), não como resposta a esta
  questão: são do mantenedor, e vivem como constantes `pub(crate)` em
  `crates/verso-dialect/src/frontmatter.rs`, fora da API pública. Nenhuma
  fixture as afirma, porque uma fixture que responde a uma questão `[ABERTO]`
  só entra no PR que fecha a questão
  ([ADR 0031](../adr/0031-fixtures-as-contract.md)). Nada aqui cobre o resto da
  Q17: tamanho de arquivo, comprimento de linha e aninhamento do lado do
  Markdown continuam indefinidos. Do lado do Markdown há um fato e nenhum
  limite: o guardrail de fuzz achou uma entrada de cerca de 5 KB em que o parser
  base leva tempo exponencial — exatamente a "lentidão" que esta questão nomeia
  —, registrada no [ADR 0037](../adr/0037-base-parser.md) e corrigida na `main`
  upstream daquele parser.

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
- **Q19. Casamento de heading.** `[ABERTO]` (seção 5.12)
  Como `[[nota#seção]]` casa com um heading: maiúsculas, pontuação e espaços,
  emoji, formatação inline (`## *Porão*`), headings duplicados, caminho
  aninhado `[[nota#Cap 1#Seção]]`, heading setext, e o que o `expected.yaml`
  registra em `heading` para o caminho aninhado.
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
- **Q22. Charset do `^id` e forma das tags.** `[ABERTO]`
  A documentação pública do Obsidian restringe `^id` a letras, números e hífen;
  o que acontece com `^id` inválido. Para tags (Q13): charset, aninhamento
  `#a/b`, sensibilidade a maiúsculas, prefixo `#` em `tags` de frontmatter.
- **Q23. Formas combinadas e escapes de wikilink.** `[ABERTO]`
  `[[nota#seção|alias]]`, `[[nota#^bloco|alias]]`, `[[#seção]]` e `[[#^bloco]]`
  (mesmo arquivo — conta como backlink de si mesmo?), `[[pasta/nota]]`,
  `[[nota.md]]`, `[[nota\|alias]]` em tabela, `\[[não é link]]`, `[[ nota ]]`
  com espaços, `![[img.png|300]]` (tamanho, não alias), `[[nota|alias|extra]]`,
  wikilink dentro de link Markdown ou de imagem.
- **Q24. Fronteira e dialeto do frontmatter.** `[ABERTO]` (seção 5.1)
  BOM antes do `---`; CRLF (a invariante 7 exige preservar a quebra de linha
  "do arquivo" — qual, quando há mistura?); `---` fechado por `...`; frontmatter
  vazio; YAML inválido (parte de Q17); versão do YAML — em 1.1 `yes`, `no`,
  `on` e datas viram booleanos e timestamps, em 1.2 não; `tags: 2024` é número
  ou tag?; wikilinks dentro de valores (`related: "[[nota]]"`), que as
  Properties do Obsidian tratam como links.
- **Q25. Codificação.** `[ABERTO]`
  Arquivo `.md` que não é UTF-8 válido (Latin-1 de vault antigo, UTF-16 com BOM
  do Windows): erro, texto com substituição, ou ignorado. Separado de Q17
  porque codificação não é sintaxe.
- **Q26. Caminhos ignorados pela varredura e seu efeito em backlinks.**
  `[ABERTO]` — vive em [ADR 0044](../adr/0044-verso-fs-semantics.md) por ser
  de `verso-fs`, mas muda o resultado do critério de saída 2 da Fase 1: nota em
  `.trash/` que linka para outra conta como backlink?

## 10. Histórico

| Versão | Data | Mudança |
|---|---|---|
| v0 | 2026-09-21 | Primeira versão, derivada de `docs/BRIEFING.md` §11. Nenhuma questão em aberto resolvida |
| v0.1 | 2026-09-21 | Aplicação da revisão da Fase 0 (`docs/review/phase-0.md`, aceita pelo mantenedor): seção 4 vira schema do `expected.yaml` (`PROPOSTO`), com `block` como resposta proposta a Q1, posições e `observed`; seções 5.12 (headings) e 5.13 (links Markdown, `PROPOSTO`) acrescentadas; D7 com status separado por item; Q7 e Q8 corrigidas quanto ao APFS; Q17 ampliada; Q18–Q26 acrescentadas. Nenhuma questão fechada |
| v0.2 | 2026-09-21 | Regra de fixtures alterada pelo mantenedor (ADR 0031 item 4): §4 e §8 atualizadas; Q1 fecha com a aprovação de `fixtures/wikilink/block-reference`. Nenhuma questão fechada ainda |
| v0.3 | 2026-09-21 | Mantenedor aprovou as cinco primeiras fixtures: schema §4 `DECIDIDO`; Q1 fechada (`block`). Primeira questão fechada |
| v0.4 | 2026-09-21 | Q18 fechada pelo mantenedor: leitura (b), parser somente leitura com property test de round-trip de quatro propriedades (`docs/reference/parser-decision.md`, ADR 0037). Segunda questão fechada |
| v0.5 | 2026-09-21 | Limites provisórios do frontmatter registrados sob a Q17 (64 níveis de aninhamento, 10 000 nós), vindos da revisão do PR do `verso-dialect` (`docs/review/phase-1-feature-1.md`). Nenhuma questão fechada |
