# O CLI do Obsidian como ferramenta de observação e referência de paridade

- Data: 2026-09-21
- Observado com: Obsidian 1.13.7 (instalador 1.11.5), macOS
- Admissível pelo [ADR 0009](../adr/0009-external-constraints.md): o CLI é uso
  normal do app, e o `eval` alcança só a API pública (`obsidian.d.ts`, MIT).
  Nada aqui vem de inspecionar o binário.

## 1. Por que esta página existe

Dois usos:

1. **Fixtures.** O CLI transforma "comportamento observado de fora" em comando
   repetível, que é o que `observed:` num `expected.yaml` pede
   ([spec §4.5](../spec/dialect.md)).
2. **Paridade.** O CLI expõe o que o índice do próprio Obsidian sabe sobre um
   vault. Tudo que ele responde, `verso-cli` e `verso mcp` devem responder pelo
   menos tão bem ([ADR 0042](../adr/0042-open-from-command-line.md), Fase 1,
   features 4 e 6). É o mais perto de uma spec pública do índice que existe.

## 2. Como rodar aqui

O binário é `/Applications/Obsidian.app/Contents/MacOS/obsidian`, adicionado ao
`PATH` pelo `~/.zprofile`; shell que não é de login precisa de `zsh -lc '...'`.
O app precisa estar aberto. Todo comando aceita `vault=<nome>`; `file=` resolve
como wikilink, `path=` é exato.

Não apontar para vault real em teste. Uma pasta descartável dentro do vault
`Sandbox` funcionou; uma pasta em `/private/tmp` aberta por
`obsidian://open?path=` não registrou como vault.

## 3. Comandos relevantes para o Verso

| Comando | Responde | Equivalente no Verso |
|---|---|---|
| `links file=X` | links de saída de X, como caminhos resolvidos | `verso links` (não planejado ainda; candidato) |
| `backlinks file=X format=json counts` | quem linka para X, com contagem | `verso backlinks` (Fase 1, feature 4) |
| `unresolved verbose` | links para notas que não existem, com origem | spec Q14 |
| `orphans`, `deadends` | sem link de entrada / sem link de saída | consultas de grafo em `verso-index` |
| `search`, `search:context` | busca em texto | `verso search` (Fase 1, feature 4) |
| `outline file=X` | headings | `headings` no índice |
| `properties`, `property:read` | chaves e valores de frontmatter | nota tipada, Fase 2 |
| `tags`, `tag` | tags do vault | spec Q13 |
| `aliases` | `aliases` do frontmatter | spec §5.1 |
| `files`, `folders`, `vault` | listagem e estatísticas | varredura do `verso-fs` |
| `history`, `diff`, `sync:*` | histórico local e versões de sync | fora de escopo até a Fase 2 |
| `eval code=...` | qualquer expressão sobre o objeto público `app` | não se aplica |

## 4. O que o cache de metadados expõe

Uma segunda rodada de observação, sobre os ids de bloco (spec Q3), está
registrada em [obsidian-blocks-2026-10-07.md](obsidian-blocks-2026-10-07.md).

`obsidian eval code='JSON.stringify(app.metadataCache.getCache("caminho.md"))'`
(API pública: `MetadataCache.getCache` devolvendo `CachedMetadata`, com `links`
como `LinkCache[]`, `headings` como `HeadingCache[]`, `blocks` como
`Record<string, BlockCache>`, todos declarados em `obsidian.d.ts`)
devolve, por arquivo: `links`, `embeds`, `headings`, `blocks`, `tags`,
`frontmatter`, `sections`. Formas vistas em 2026-09-21:

```json
{"links": [{"position": {"start": {"line": 0, "col": 19, "offset": 19},
                          "end":   {"line": 0, "col": 36, "offset": 36}},
            "link": "Taverna#Porão",
            "original": "[[Taverna#Porão]]",
            "displayText": "Taverna > Porão"}],
 "headings": [{"position": {...}, "heading": "Porão", "level": 2}],
 "blocks": {"juramento": {"position": {...}, "id": "juramento"}}}
```

Notas para a spec do dialeto:

- `link` mantém as partes de heading e bloco (`Taverna#Porão`,
  `Sessão 3#^juramento`); o arquivo alvo é resolvido à parte. A separação do
  Verso em `target` / `heading` / `block` é um corte mais fino da mesma string.
- `displayText` é o alias quando existe, e `Nota > Heading` ou `Nota > ^bloco`
  caso contrário.
- `position` conta de 0 em `line` e `col`; `offset` é do início do arquivo. O
  `pos` do Verso conta de 1 ([spec §4.4](../spec/dialect.md)). Os dois contaram
  caracteres, não bytes, nos prefixos ASCII vistos; uma fixture com prefixo
  não-ASCII é necessária antes de afirmar mais.
- Sintaxe de wikilink dentro de código inline ou bloco cercado não gera entrada
  nenhuma (`links: null`), batendo com a [spec §5.9](../spec/dialect.md).

## 5. Rodada de verificação das cinco primeiras fixtures

Notas `Barão Vermelho.md`, `Taverna.md` (com `## Porão`), `Sessão 3.md` (com
` ^juramento`) e os cinco `input.md` copiados como `fx-*.md` para
`Sandbox/verso-fixtures/`; depois `links`, `backlinks`, `unresolved` e `eval`
em cada um. Os resultados estão no `observed:` de cada fixture. A pasta foi
removida em seguida.
