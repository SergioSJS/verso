# Spec do dialeto do Verso — v0

- Versão: v0 · 2026-09-21
- Fonte: `docs/BRIEFING.md` §11, §5.2, §4
- ADRs: [0030](../adr/0030-dialeto-base-compativel-obsidian.md) (base compatível),
  [0031](../adr/0031-fixtures-como-contrato.md) (fixtures),
  [0012](../adr/0012-arquivos-sao-fonte-de-verdade.md) (abrir nunca reescreve)

## 1. O que esta versão é

v0 registra o que o briefing decidiu sobre o dialeto e marca, como `[ABERTO]`,
tudo que um parser precisa saber e que o briefing não responde. **Nenhuma
lacuna é preenchida por conta própria**: onde a spec diz `[ABERTO]`, a decisão é
do mantenedor.

v0 não é implementável ponta a ponta. É a lista do que precisa ser decidido
antes de `verso-dialect` existir, e o alvo contra o qual as fixtures são
escritas.

O comportamento normativo é o das fixtures, não o desta prosa. Onde os dois
divergirem, a fixture ganha e a spec é corrigida.

## 2. Regra de ouro

> O Verso estende o dialeto do Obsidian; nunca o contradiz. (§11.1)

Operacionalmente: nenhuma extensão pode mudar o significado de uma construção
que o Obsidian já interpreta. Um arquivo escrito pelo Verso abre no Obsidian sem
perda de sentido; um arquivo escrito pelo Obsidian abre no Verso sem conversão.

Violar isso é achado BLOQUEANTE em revisão.

## 3. Fontes admissíveis

Os termos de uso do Obsidian proíbem engenharia reversa para desenvolver produto
concorrente ([ADR 0009](../adr/0009-restricoes-externas.md)). Ao determinar o
comportamento a ser compatível, valem apenas:

- a API pública (`obsidian.d.ts`, MIT);
- a documentação pública;
- o comportamento observado de fora, pelo uso normal do app.

Nenhuma fixture, spec ou PR pode citar inspeção, descompilação ou desminificação
do binário como fonte.

## 4. Notação usada aqui

Cada construção traz o `input.md` e o recorte do `expected.yaml` correspondente,
no formato de fixture de §11.4. Os nomes de campo vêm do exemplo do briefing
(`target`, `alias`, `heading`, `blocks[].id`). Campos que o briefing não nomeia
aparecem como `<campo ainda não definido>` e estão listados na seção 9.

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
  ([ADR 0012](../adr/0012-arquivos-sao-fonte-de-verdade.md)).
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
    <campo ainda não definido>: juramento
```

O nome do campo para referência de bloco não aparece no briefing: `[ABERTO]`
(seção 9, Q1).

### 5.6 Embed

```markdown
![[Mapa da Taverna.png]]

![[Sessão 3#^juramento]]
```

```yaml
embeds:
  - target: Mapa da Taverna.png
  - target: Sessão 3
    <campo ainda não definido>: juramento
```

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
([ADR 0014](../adr/0014-catalogo-de-primitivas.md)). A **sintaxe** `^id` é
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

Normalização Unicode na comparação de nomes (NFC × NFD — relevante em macOS, que
grava nomes de arquivo em NFD) e sensibilidade a maiúsculas: `[ABERTO]`
(seção 9, Q7 e Q8).

### 5.11 `.canvas` (JSON Canvas)

Arquivos `.canvas` no formato JSON Canvas são lidos e escritos sem quebrar. O
formato é de terceiros e não é redefinido aqui.

Se o Verso estende o JSON Canvas e como persiste o board:
`[ABERTO]` ([ADR 0040](../adr/0040-persistencia-do-board.md)).

---

## 6. Extensões do Verso

Nada nesta seção está decidido. Tudo aqui é `PROPOSTO` ou `[ABERTO]`, e nada
pode contradizer a seção 5.

| Extensão | Forma | Status |
|---|---|---|
| Nota tipada | `type:` no frontmatter + schema em arquivo de texto na pasta; sem schema, é Markdown comum | `PROPOSTO` ([ADR 0014](../adr/0014-catalogo-de-primitivas.md)) |
| Proveniência de escrita | autor, modelo e quando, no frontmatter | `PROPOSTO` ([ADR 0014](../adr/0014-catalogo-de-primitivas.md)) |
| Views materializáveis | saída de consulta escrita como Markdown real no arquivo | `PROPOSTO` ([ADR 0014](../adr/0014-catalogo-de-primitivas.md)) |
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
   ([ADR 0013](../adr/0013-degradacao-para-markdown.md), `PROPOSTO`).
2. Não muda o significado de construção existente (seção 2).
3. Sobrevive a round-trip sem reescrever o arquivo
   ([ADR 0012](../adr/0012-arquivos-sao-fonte-de-verdade.md)).

---

## 7. Divergências em relação ao Obsidian

Divergência aqui significa: o Verso faz diferente **de propósito**, com o efeito
registrado. Nenhuma delas muda como um arquivo existente é interpretado.

| # | Assunto | Obsidian | Verso | Status | Efeito para quem vem do Obsidian |
|---|---|---|---|---|---|
| D1 | Unidade de trabalho | vault, criado explicitamente | qualquer pasta aberta, sem vault | `DECIDIDO` ([0010](../adr/0010-pasta-e-a-unidade-sem-vault.md)) | Nenhum no arquivo. O vault continua abrindo |
| D2 | Configuração | `.obsidian/` dentro da árvore | fora da árvore, indexada pelo caminho da pasta | `DECIDIDO` ([0011](../adr/0011-config-fora-da-arvore-indice-como-cache.md)) | `.obsidian/` é ignorado, não apagado; conversão explícita, com diff |
| D3 | Campo inline do Dataview | `chave:: valor` no corpo | frontmatter | `PROPOSTO` (§11.2) | Conversão explícita, com diff. O Verso não interpreta `chave:: valor` nativamente |
| D4 | Desenho do Excalidraw | `.excalidraw.md` do plugin | formato do board do Verso | `PROPOSTO` (§11.2) | Conversão explícita, com diff |
| D5 | ID de bloco | usado para referência | além disso, gera backlink e aparece no grafo | `PROPOSTO` ([0014](../adr/0014-catalogo-de-primitivas.md)) | Ganho, não perda: a sintaxe é a mesma |
| D6 | Consulta | plugin de terceiro (Dataview) | consulta nativa por tipo, propriedade e relação; view pode materializar em Markdown | `PROPOSTO` ([0014](../adr/0014-catalogo-de-primitivas.md)) | Notas com blocos `dataview` não são executadas pelo Verso |
| D7 | Plugins | API síncrona, acesso a disco | TypeScript em Web Worker, sem disco, capabilities declaradas | `DECIDIDO` ([0016](../adr/0016-plugins-execucao-e-capabilities.md)) | Plugin de Obsidian não roda; shim separado cobre só a API pública, com tabela declarada |

Sobre D2, D3 e D4: conversão **só por ação do usuário, com diff visível**. Abrir
um arquivo nunca o reescreve ([ADR 0012](../adr/0012-arquivos-sao-fonte-de-verdade.md)).

O que o Verso ainda **não** define e o Obsidian define — resolução de link
ambíguo, tags inline, notas periódicas, busca — está na seção 9, não aqui.

---

## 8. Fixtures

O contrato de comportamento são as fixtures
([ADR 0031](../adr/0031-fixtures-como-contrato.md)):

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

As 5 primeiras fixtures são escritas à mão pelo mantenedor. As seguintes podem
ser rascunhadas pela IA e aprovadas por ele.

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
  journal no Foundry ([ADR 0036](../adr/0036-suporte-a-rpg-de-mesa.md)).
- **Q10. Sintaxe de relação tipada.** `[ABERTO]`
  Decidir antes de implementar relações (§17 item 6). Requisitos já fixados:
  tipo e direção, várias relações entre os mesmos dois nós
  ([ADR 0014](../adr/0014-catalogo-de-primitivas.md)), e degradar para Markdown
  legível ([ADR 0013](../adr/0013-degradacao-para-markdown.md)).
- **Q11. Formato e localização dos schemas.** `[ABERTO]`
  Decidir antes da nota tipada, na Fase 2 (§17 item 7). "Arquivo de texto na
  pasta" é a única pista do briefing. Tensiona com D2: schema dentro da pasta,
  config fora dela. Afeta os packs de schema
  ([ADR 0015](../adr/0015-packs-de-schema.md)).

### Lacunas de parsing — não respondidas pelo briefing

Levantadas ao escrever esta spec. Todas precisam de resposta antes de
`verso-dialect` (Fase 1, feature 1).

- **Q1. Nome do campo de referência de bloco no `expected.yaml`.** `[ABERTO]`
  O exemplo do briefing nomeia `target`, `alias` e `heading`, mas não o campo de
  `#^bloco` (seção 5.5).
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
  NFC × NFD; o macOS é a plataforma inicial e grava nomes em NFD
  (seção 5.10).
- **Q8. Sensibilidade a maiúsculas na resolução de nome.** `[ABERTO]`
  Interage com sistemas de arquivo case-insensitive (macOS, Windows) e
  case-sensitive (Linux) — o mesmo vault pode resolver diferente por plataforma
  (seção 5.10).
- **Q12. Regra de resolução de link para arquivo.** `[ABERTO]`
  Como `[[nota]]` vira um arquivo: caminho relativo, caminho mais curto único,
  extensão `.md` implícita, comportamento com nome ambíguo, e como `aliases`
  participa. Com workspace multi-raiz
  ([ADR 0041](../adr/0041-workspace-multi-raiz.md), `PROPOSTO`), a resolução
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
  ([ADR 0037](../adr/0037-parser-base.md)) mexe no que sai de graça.
- **Q16. Arquivos não-Markdown na pasta.** `[ABERTO]`
  Quais entram no índice como alvo de link (imagens, PDF, `.canvas`) e quais são
  ignorados.
- **Q17. Limite de tamanho e comportamento com arquivo malformado.** `[ABERTO]`
  O fuzzing garante que não trava ([ADR 0029](../adr/0029-guardrails-no-ci.md)),
  mas o resultado esperado — erro, parse parcial ou arquivo tratado como texto —
  não está definido.

## 10. Histórico

| Versão | Data | Mudança |
|---|---|---|
| v0 | 2026-09-21 | Primeira versão, derivada de `docs/BRIEFING.md` §11. Nenhuma questão em aberto resolvida |
