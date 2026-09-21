# Obsidian CLI as an observation tool and a parity reference

- Date: 2026-09-21
- Observed with: Obsidian 1.13.7 (installer 1.11.5), macOS
- Admissible by [ADR 0009](../adr/0009-external-constraints.md): the CLI is
  normal use of the app, and `eval` reaches only the public API
  (`obsidian.d.ts`, MIT). Nothing here comes from inspecting the binary.

## 1. Why this page exists

Two uses:

1. **Fixtures.** The CLI turns "behaviour observed from outside" into a
   repeatable command, which is what `observed:` in an `expected.yaml` asks
   for ([spec §4.5](../spec/dialect.md)).
2. **Parity.** The CLI exposes what Obsidian's own index knows about a vault.
   Everything it answers, `verso-cli` and `verso mcp` should answer at least as
   well ([ADR 0042](../adr/0042-open-from-command-line.md), Phase 1 features
   4 and 6). It is the closest thing to a public spec of the index.

## 2. How to run it here

The binary is `/Applications/Obsidian.app/Contents/MacOS/obsidian`, added to
`PATH` by `~/.zprofile`; a non-login shell needs `zsh -lc '...'`. The app must
be running. Every command accepts `vault=<name>`; `file=` resolves like a
wikilink, `path=` is exact.

Do not point it at a real vault for tests. A throwaway folder inside the
`Sandbox` vault worked; a folder under `/private/tmp` opened through
`obsidian://open?path=` did not register as a vault.

## 3. Commands relevant to Verso

| Command | Answers | Verso equivalent |
|---|---|---|
| `links file=X` | outgoing links of X, as resolved file paths | `verso links` (not yet planned; candidate) |
| `backlinks file=X format=json counts` | who links to X, with counts | `verso backlinks` (Phase 1, feature 4) |
| `unresolved verbose` | links to notes that do not exist, with sources | spec Q14 |
| `orphans`, `deadends` | no incoming / no outgoing links | graph queries in `verso-index` |
| `search`, `search:context` | full-text search | `verso search` (Phase 1, feature 4) |
| `outline file=X` | headings | `headings` in the index |
| `properties`, `property:read` | frontmatter keys and values | typed note, Phase 2 |
| `tags`, `tag` | tags in the vault | spec Q13 |
| `aliases` | `aliases` from frontmatter | spec §5.1 |
| `files`, `folders`, `vault` | listing and stats | `verso-fs` walk |
| `history`, `diff`, `sync:*` | local history and sync versions | out of scope until Phase 2 |
| `eval code=...` | any expression on the public `app` object | not applicable |

## 4. What the metadata cache exposes

`obsidian eval code='JSON.stringify(app.metadataCache.getCache("path.md"))'`
(public API: `MetadataCache.getCache` returning `CachedMetadata`, with `links`
as `LinkCache[]`, `headings` as `HeadingCache[]`, `blocks` as
`Record<string, BlockCache>`, all declared in `obsidian.d.ts`)
returns, per file: `links`, `embeds`, `headings`, `blocks`, `tags`,
`frontmatter`, `sections`. Shapes seen on 2026-09-21:

```json
{"links": [{"position": {"start": {"line": 0, "col": 19, "offset": 19},
                          "end":   {"line": 0, "col": 36, "offset": 36}},
            "link": "Taverna#Porão",
            "original": "[[Taverna#Porão]]",
            "displayText": "Taverna > Porão"}],
 "headings": [{"position": {...}, "heading": "Porão", "level": 2}],
 "blocks": {"juramento": {"position": {...}, "id": "juramento"}}}
```

Notes for the dialect spec:

- `link` keeps the heading and block parts (`Taverna#Porão`,
  `Sessão 3#^juramento`); the target file is resolved separately. Verso's
  `target` / `heading` / `block` split is a finer cut of the same string.
- `displayText` is the alias when there is one, and `Note > Heading` or
  `Note > ^block` otherwise.
- `position` is 0-based for `line` and `col`; `offset` is from the start of
  the file. Verso's `pos` is 1-based ([spec §4.4](../spec/dialect.md)). Both
  counted characters, not bytes, in the ASCII prefixes seen; a fixture with a
  non-ASCII prefix is needed before saying more.
- Wikilink syntax inside inline code or a fenced block yields no entry at all
  (`links: null`), matching [spec §5.9](../spec/dialect.md).

## 5. Verification run for the first five fixtures

Notes `Barão Vermelho.md`, `Taverna.md` (with `## Porão`), `Sessão 3.md`
(with ` ^juramento`) and the five `input.md` files copied as `fx-*.md` into
`Sandbox/verso-fixtures/`; then `links`, `backlinks`, `unresolved` and `eval`
on each. Results are recorded in each fixture's `observed:`. The folder was
removed afterwards.
