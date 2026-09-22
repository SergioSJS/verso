# Verso dialect spec — v0.7

- Version: v0.7 · 2026-09-21
- Source: `docs/BRIEFING.md` §11, §5.2, §4
- ADRs: [0030](../adr/0030-base-dialect-obsidian-compatible.md) (compatible base),
  [0031](../adr/0031-fixtures-as-contract.md) (fixtures),
  [0012](../adr/0012-files-are-source-of-truth.md) (opening never rewrites)

## 1. What this version is

v0 records what the briefing decided about the dialect and marks, as `[OPEN]`,
everything a parser needs to know and that the briefing does not answer. **No
gap is filled on our own**: where the spec says `[OPEN]`, the decision is the
maintainer's.

v0 is not implementable end to end. It is the list of what has to be decided
before `verso-dialect` exists, and the target the fixtures are written against.

The normative behavior is the fixtures', not this prose's. Where the two
diverge, the fixture wins and the spec is corrected — **in the same PR**. A
fixture that answers an `[OPEN]` question from section 9 only enters in the PR
that closes the question, citing the fixture as the answer; the maintainer's
approval in that PR is the decision
([ADR 0031](../adr/0031-fixtures-as-contract.md)). A fixture approved without
that step closes no question.

## 2. Golden rule

> Verso extends the Obsidian dialect; it never contradicts it. (§11.1)

Operationally: no extension may change the meaning of a construct that Obsidian
already interprets. A file written by Verso opens in Obsidian with no loss of
meaning; a file written by Obsidian opens in Verso with no conversion.

Violating that is a BLOCKING finding in review.

## 3. Admissible sources

Obsidian's terms of use forbid reverse engineering to develop a competing
product ([ADR 0009](../adr/0009-external-constraints.md)). When determining the
behavior to be compatible with, only these count:

- the public API (`obsidian.d.ts`, MIT);
- the public documentation;
- the behavior observed from the outside, through normal use of the app.

No fixture, spec or PR may cite inspection, decompilation or deminification of
the binary as a source.

## 4. `expected.yaml` schema `DECIDED`

Each construct in sections 5 and 6 comes with the `input.md` and the
corresponding excerpt of the `expected.yaml`. The briefing (§11.4) names only
`target`, `alias`, `heading` and `blocks[].id`; everything else below was
drafted by the AI in the Phase 0 review (C7) and **was `PROPOSED` until
2026-09-21**, when the maintainer approved the first five fixtures, which follow
this schema (ADR 0031; fixtures PR). A fixture that
does not follow the schema is invalid.

### 4.1 First-level keys

| Key | Content | Absent means |
|---|---|---|
| `frontmatter` | map with the interpreted YAML values | not asserted |
| `headings` | list, in document order | not asserted |
| `links` | list of body links, in document order | not asserted |
| `embeds` | list of embeds, in document order | not asserted |
| `blocks` | list of `^id` definitions, in document order | not asserted |
| `callouts` | list, in document order | not asserted |
| `observed` | how the behavior was verified in Obsidian | see 4.5 |
| `source` | ADR or question that authorizes a behavior that is Verso's own | see 4.5 |

**An absent key asserts nothing.** A key that is present asserts strictly: a
list key asserts the whole list — same length, same order, no extra item — so
`links: []` asserts that there is no link, and the order of a list is the order
in which the construct appears in the file. `frontmatter:` is a map, not a
list, and is the one exception: it asserts each key it names and says nothing
about the keys it does not name, so a frontmatter may hold more keys than the
fixture lists. Inside an item of a list, an absent **optional** field asserts
that the field is absent, while an absent `pos` asserts nothing (sections 4.2
and 4.3).

Decided on 2026-09-21 by the maintainer, on the strict reading, closing item 3
of [`../review/phase-1-feature-1.md`](../review/phase-1-feature-1.md) §6. The
earlier wording — "the parser may produce more than the fixture asks for, never
less and never different" — is false for lists and is gone. The fixture harness
(`crates/verso-dialect/tests/fixtures.rs`) is what enforces this rule.

### 4.2 Items of `links` and `embeds`

| Field | Meaning | Required |
|---|---|---|
| `target` | text of the target **as written**, without resolving: `[[nota.md]]` gives `nota.md`, `[[pasta/nota]]` gives `pasta/nota`. Resolution to a file is Q12, outside the parser | yes; empty (`""`) for `[[#seção]]` |
| `heading` | text after `#`, without `^`; a nested path `a#b` stays as `a#b` until Q19 decides | when there is one |
| `block` | text after `#^` (answers Q1, `DECIDED`) | when there is one |
| `alias` | text after `\|` | when there is one |
| `syntax` | `wikilink` (default, may be omitted) or `markdown` (section 5.13) | only for `markdown` |
| `pos` | position of the first character of the construct (4.4) | when the fixture tests position |

A link with a heading and an alias has both fields. A link with a heading and a
block (`[[nota#seção#^id]]`) is not a construct documented by Obsidian; until
Q19, no fixture uses it.

### 4.3 Items of `headings`, `blocks` and `callouts`

| List | Fields |
|---|---|
| `headings` | `level` (1–6), `text` (raw text, without `#` and without spaces at the ends), `pos` |
| `blocks` | `id` (without `^`), `pos` (position of the `^`) |
| `callouts` | `kind` (text between `[!` and `]`, as written), `title` (rest of the first line, without spaces at the ends; absent if empty), `fold` (`-`, `+`, or absent), `pos` |

### 4.4 Position

```yaml
pos: { line: 12, col: 5 }
```

`line` and `col` start at 1. `col` counts **Unicode characters** (scalar
values), not bytes and not UTF-16 units, so that the number is the same in the
Rust parser and in the editor. The position is that of the first character of
the construct (`[` of `[[`, `!` of `![[`, `^` of `^id`, `#` of the heading, `>`
of the first line of the callout).

Position exists because verifiable citation is decided
([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)) and a block with no `^id` is
cited by position. A fixture with no `pos` does not test position; at least one
fixture per construct has to test it. The first five fixtures all have ASCII
text before the construct, so they do not yet distinguish characters from
bytes; a fixture with a non-ASCII prefix is needed before the unit is
exercised (`docs/reference/obsidian-cli.md` §4).

### 4.5 Origin of the observation

Every fixture that asserts behavior compatible with Obsidian records how the
behavior was observed, by the admissible sources rule (section 3):

```yaml
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: "paste the input into a new note; see the target note's backlinks pane"
```

`version` is free text: app version, installer version and operating system
when they matter. `how` is prose, repeatable by someone else; the Obsidian CLI
(`docs/reference/obsidian-cli.md`) turns it into commands.

A fixture for behavior that is **Verso's own** (section 6) omits `observed` and
cites the ADR or the question that authorizes it in `source:`.

### 4.6 Outside the schema

There is no field for typed relation, per-block visibility, inline tags or link
resolution: each one enters the schema when the corresponding question closes,
with a PR that updates this section.

---

## 5. Base compatible with Obsidian `DECIDED`

### 5.1 YAML frontmatter

YAML block delimited by `---` on the first line of the file, including `tags`
and `aliases`.

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

- The frontmatter is preserved byte for byte on read: key order, comments,
  quoting style and indentation cannot be normalized
  ([ADR 0012](../adr/0012-files-are-source-of-truth.md)).
- `tags` and `aliases` are recognized by the index; the other keys are preserved
  without interpretation.
- Accepted form of `tags` (list, space-separated string, both) and of
  `aliases`: `[OPEN]`.

### 5.2 Simple wikilink

```markdown
Encontramos o [[Barão Vermelho]] na entrada.
```

```yaml
links:
  - target: Barão Vermelho
```

### 5.3 Wikilink with alias

```markdown
Encontramos [[Barão Vermelho|o barão]] na entrada.
```

```yaml
links:
  - target: Barão Vermelho
    alias: o barão
```

### 5.4 Wikilink to a section

```markdown
Ele se escondeu na [[Taverna#Porão]].
```

```yaml
links:
  - target: Taverna
    heading: Porão
```

### 5.5 Wikilink to a block

```markdown
Ele repetiu o que disse em [[Sessão 3#^juramento]].
```

```yaml
links:
  - target: Sessão 3
    block: juramento
```

The name of the field for a block reference does not appear in the briefing;
`block` is the answer to Q1 (section 4.2), decided with the approval of `fixtures/wikilink/block-reference`.

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

In an image embed, `![[img.png|300]]`, the text after `|` is a size, not an
alias, per Obsidian's public documentation. How the `expected.yaml` records
that: Q23.

Embed and link are distinct constructs in the `expected.yaml`. Whether an embed
also counts as a link in the graph and in backlinks: `[OPEN]` (section 9, Q2).

### 5.7 Block definition

```markdown
Ele jurou vingança. ^juramento
```

```yaml
blocks:
  - id: juramento
```

The same syntax at the end of a list item defines the block of that item:

```markdown
- Ele jurou vingança. ^juramento
- Ela riu.
```

```yaml
blocks:
  - id: juramento
    pos: { line: 1, col: 23 }
```

`pos` is the position of the `^` (section 4.3), counted in characters
(section 4.4): column 23 here, and 24 if it were counted in bytes, because of
the `ç` of "vingança".

In a list item the `^id` is looked for in the item's own text, before any
nested block: a `^id` inside a code block, an HTML block or a nested list that
ends the item does not define a block of that item — section 5.9 already puts
code outside what is scanned — and an item keeps its `^id` when a nested list
follows it. That is how the parser behaves; it is not a further decision.

The stable block ID, with backlinks and presence in the graph, is a proposed
primitive ([ADR 0014](../adr/0014-primitives-catalog.md)). The **syntax** `^id`
is compatible and decided; what Verso does with it goes beyond Obsidian.

Two positions are decided, on 2026-09-21 by the maintainer, with the fixtures
`fixtures/block/definition` and `fixtures/block/list-item` as the answer: a
`^id` as the last word of a paragraph, and a `^id` as the last word of a list
item. The other positions — a `^id` alone on a line after a blank line, a `^id`
on a heading, and a `^id` after a multi-line block — and the uniqueness scope of
the id stay `[OPEN]` (section 9, Q3 and Q4).

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

Which callout kinds are recognized, the behavior of `-`/`+` (collapsed or
expanded) and nesting: `[OPEN]` (section 9, Q5).

A callout is **not** the mechanism for the game master's secret: per-block
visibility has its own syntax, still `[OPEN]` (section 9, Q9).

### 5.9 A link inside code is not a link

````markdown
Escreva `[[isto não é link]]` para criar um link.

```text
[[isto também não é]]
```
````

```yaml
links: []
```

This holds for inline code (backtick) and code block (fenced). The briefing
requires both categories in the minimal fixtures.

Code block indented by 4 spaces, embedded HTML and `%%comentário%%`: `[OPEN]`
(section 9, Q6).

### 5.10 Note name with accent and space

```markdown
Passamos pela [[Ilha da Preguiça]] e pelo [[Café São João|café]].
```

```yaml
links:
  - target: Ilha da Preguiça
  - target: Café São João
    alias: café
```

Unicode normalization in name comparison (NFC × NFD: files coming from HFS+,
from other platforms and from sync mix the two forms; APFS preserves the form it
receives and does a normalization-insensitive lookup) and case sensitivity:
`[OPEN]` (section 9, Q7 and Q8).

### 5.11 `.canvas` (JSON Canvas)

`.canvas` files in the JSON Canvas format are read and written without breaking.
The format is third-party and is not redefined here.

Whether Verso extends JSON Canvas and how it persists the board:
`[OPEN]` ([ADR 0040](../adr/0040-board-persistence.md)).

### 5.12 Headings

They are not in the list of briefing §11.1, but feature 1 of Phase 1 parses them
("links, blocks, **headings** and frontmatter") and `[[nota#seção]]` needs them
to resolve. Added in the Phase 0 review (L1).

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

How the text of `[[nota#seção]]` matches a heading (case, punctuation, inline
formatting, emoji, duplicate headings, nested path `[[nota#Cap 1#Seção]]`) and
setext-style heading (`===`/`---`): `[OPEN]` (section 9, Q19).

### 5.13 Markdown links to a local file `PROPOSED`

Obsidian's public documentation resolves `[texto](nota.md)` as an internal link,
and the app can be configured to write that form instead of a wikilink. A whole
vault may not have a single `[[ ]]`. Added in the Phase 0 review (L2).

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

Proposal: they count as a link, with `syntax: markdown` and `target` already
decoded from URL-encoding. Details — `<...>` with spaces, relative path `../`,
what separates a local link from an external URL, image `![](img.png)` as an
embed — `[OPEN]` (section 9, Q20). A proposal, not a decision: the briefing does
not list that form.

---

## 6. Verso extensions

Nothing in this section is decided. Everything here is `PROPOSED` or `[OPEN]`,
and nothing may contradict section 5.

| Extension | Form | Status |
|---|---|---|
| Typed note | `type:` in the frontmatter + schema in a text file in the folder; with no schema, it is plain Markdown | `PROPOSED` ([ADR 0014](../adr/0014-primitives-catalog.md)) |
| Write provenance | author, model and when, in the frontmatter | `PROPOSED` ([ADR 0014](../adr/0014-primitives-catalog.md)) |
| Materializable views | query output written as real Markdown in the file | `PROPOSED` ([ADR 0014](../adr/0014-primitives-catalog.md)) |
| Schema i18n | language-neutral key with a translated label (`type: npc` displayed as "PdM" or "NPC") | `PROPOSED` (§11.3) |
| Typed relation | edge with type and direction; several relations between the same two nodes | `[OPEN]` (Q10) |
| Schemas | format and location | `[OPEN]` (Q11) |
| Per-block visibility | game master's secret | `[OPEN]` (Q9) |

Example of a typed note, in the proposed form:

```markdown
---
type: npc
title: Barão Vermelho
---

O barão governa o distrito norte.
```

An Obsidian vault that already uses `type:` in the frontmatter for another
purpose stays valid: with no matching schema in the folder, the note is plain
Markdown.

Constraints that any extension has to respect:

1. Degrades to Markdown readable in any editor
   ([ADR 0013](../adr/0013-degrades-to-markdown.md), `PROPOSED`).
2. Does not change the meaning of an existing construct (section 2).
3. Survives a round-trip without rewriting the file
   ([ADR 0012](../adr/0012-files-are-source-of-truth.md)).

---

## 7. Divergences from Obsidian

Divergence here means: Verso does it differently **on purpose**, with the effect
recorded. None of them changes how an existing file is interpreted.

| # | Subject | Obsidian | Verso | Status | Effect for someone coming from Obsidian |
|---|---|---|---|---|---|
| D1 | Unit of work | vault, created explicitly | any folder that is opened, with no vault | `DECIDED` ([0010](../adr/0010-folder-is-the-unit-no-vault.md)) | None in the file. The vault still opens |
| D2 | Configuration | `.obsidian/` inside the tree | outside the tree, indexed by the folder path | `DECIDED` ([0011](../adr/0011-config-outside-tree-index-as-cache.md)) | `.obsidian/` is ignored, not deleted; explicit conversion, with a diff |
| D3 | Dataview inline field | `chave:: valor` in the body | frontmatter | `PROPOSED` (§11.2) | Explicit conversion, with a diff. Verso does not interpret `chave:: valor` natively |
| D4 | Excalidraw drawing | the plugin's `.excalidraw.md` | Verso's board format | `PROPOSED` (§11.2) | Explicit conversion, with a diff |
| D5 | Block ID | used for reference | beyond that, generates a backlink and appears in the graph | `PROPOSED` ([0014](../adr/0014-primitives-catalog.md)) | A gain, not a loss: the syntax is the same |
| D6 | Query | third-party plugin (Dataview) | native query by type, property and relation; a view can materialize into Markdown | `PROPOSED` ([0014](../adr/0014-primitives-catalog.md)) | Notes with `dataview` blocks are not executed by Verso |
| D7 | Plugins | synchronous API, disk access | TypeScript in a Web Worker, no disk, declared capabilities | Execution: `DECIDED` ([0016](../adr/0016-plugins-execution-and-capabilities.md)). Shim: `PROPOSED` ([0017](../adr/0017-plugins-format-shim-loading.md)) | An Obsidian plugin does not run. If the proposed shim exists, it covers only the public API, with a declared table |

About D2, D3 and D4: conversion **only by user action, with a visible diff**.
Opening a file never rewrites it ([ADR 0012](../adr/0012-files-are-source-of-truth.md)).

What Verso does **not** define yet and Obsidian does — ambiguous link
resolution, inline tags, periodic notes, search — is in section 9, not here.

---

## 8. Fixtures

The behavior contract is the fixtures
([ADR 0031](../adr/0031-fixtures-as-contract.md)):

```
fixtures/<category>/<case>/input.md
fixtures/<category>/<case>/expected.yaml
```

Minimal categories, from briefing §11.4:

| Category | Covered by section |
|---|---|
| simple wikilink | 5.2 |
| wikilink with alias | 5.3 |
| wikilink with heading | 5.4 |
| wikilink with `#^bloco` | 5.5 |
| embed `![[...]]` | 5.6 |
| block definition `^id` | 5.7 |
| link in inline code and in a code block | 5.9 |
| frontmatter with `tags` and `aliases` | 5.1 |
| note name with accent and space | 5.10 |

Categories added in the Phase 0 review, outside the briefing's minimum:

| Category | Covered by section | Status |
|---|---|---|
| heading | 5.12 | required by feature 1 of Phase 1 |
| Markdown link to a local file | 5.13 | `PROPOSED` |
| position (`pos`) in at least one fixture per construct | 4.4 | required by [ADR 0018](../adr/0018-llm-native-mcp-in-core.md) |

Any fixture may be drafted by the AI; it only counts with the maintainer's
approval in the PR that adds it (ADR 0031). A draft says so on the first line
of its `expected.yaml` (`# AI draft ...`); approval replaces that line. The
first five follow the schema in section 4 and, once approved, confirm it.
`scripts/check-fixtures.sh` checks the layout of every fixture and that each
key is one of the schema's, under the parent the schema gives it; the values
are the maintainer's approval and the Phase 1 tests.

**`expected.yaml` only changes with the maintainer's explicit approval.** If a
fixture looks wrong, the author stops and asks.

---

## 9. Open questions

Each question needs an answer from the maintainer before the corresponding
behavior is implemented. None of them has an answer in the briefing.

### From the briefing (§11.3, §17)

- **Q9. Per-block visibility syntax (game master's secret).** `[OPEN]`
  Decide before sharing and export (§17 item 8). It has to survive opening the
  file in Obsidian without leaking the secret and without breaking the text. The
  player view and the mapping to journal permission in Foundry depend on it
  ([ADR 0036](../adr/0036-tabletop-rpg-support.md)).
- **Q10. Typed relation syntax.** `[OPEN]`
  Decide before implementing relations (§17 item 6). Requirements already fixed:
  type and direction, several relations between the same two nodes
  ([ADR 0014](../adr/0014-primitives-catalog.md)), and degrading to readable
  Markdown ([ADR 0013](../adr/0013-degrades-to-markdown.md)).
- **Q11. Format and location of the schemas.** `[OPEN]`
  Decide before the typed note, in Phase 2 (§17 item 7). "A text file in the
  folder" is the briefing's only clue. It is in tension with D2: schema inside
  the folder, config outside it. Affects the schema packs
  ([ADR 0015](../adr/0015-schema-packs.md)).

### Parsing gaps — not answered by the briefing

Raised while writing this spec. All of them need an answer before
`verso-dialect` (Phase 1, feature 1).

- **Q1. Name of the block reference field in the `expected.yaml`.** `DECIDED`
  The briefing's example names `target`, `alias` and `heading`, but not the
  field for `#^bloco` (section 5.5). Answer: `block` (section 4.2). Closed
  on 2026-09-21 by the maintainer's approval of the fixture
  `fixtures/wikilink/block-reference` (ADR 0031).
- **Q2. Does an embed count as a link in the graph and in backlinks?** `[OPEN]`
  (section 5.6)
- **Q3. Admissible position of the `^id`.** `DECIDED` for the end of a
  paragraph and the end of a list item; `[OPEN]` for the rest.
  Closed for those two on 2026-09-21 by the maintainer, with the fixtures
  `fixtures/block/definition` and `fixtures/block/list-item` as the answer
  (ADR 0031): a `^id` as the last word of a paragraph and a `^id` as the last
  word of a list item define the block (section 5.7). Still `[OPEN]`: a `^id`
  alone on a line after a blank line, a `^id` on a heading, and a `^id` after a
  multi-line block.

  Two observations of the same day are recorded here, and neither closes
  anything. (1) On the input `Primeiro parágrafo.`, a blank line and `^solto`,
  Obsidian attaches the id to the block **before** it: observed through the
  Obsidian CLI, public API only (ADR 0009; `docs/reference/obsidian-cli.md`),
  where `app.metadataCache.getCache(...)` reports `blocks.solto` with the
  position of the paragraph on line 0, and the `^solto` line is not a section of
  its own. Our parser treats that line as a paragraph of its own and reports the
  `^` at its own position (line 3, column 1), which is what section 4.3 asks of
  `pos` whichever block the id names; **which** block it names is this question,
  and it depends on Q21 ("what a block is"). (2) A `^id` on a heading was not
  observed and nothing is implemented for it. A fact of the implementation is
  recorded too, and it decides nothing: in a list item the `^id` is looked for
  in the item's own text, up to its first block child, so a `^id` inside a code
  block, an HTML block or a nested list that ends the item does not define a
  block of that item (section 5.9), and an item whose own line ends with `^id`
  keeps it when a nested list follows.
- **Q4. Uniqueness scope of the `^id`.** `[OPEN]`
  Unique per file or per folder; what to do with a duplicate (section 5.7).
- **Q5. Callout coverage.** `[OPEN]`
  Recognized kinds, `-`/`+`, nesting (section 5.8).
- **Q6. Contexts in which `[[...]]` is not a link, besides backtick and fence.**
  `[OPEN]` Block indented by 4 spaces, embedded HTML, `%%comentário%%`, a link
  inside a URL (section 5.9).
- **Q7. Unicode normalization in name comparison.** `[OPEN]`
  NFC × NFD. APFS (macOS, the initial platform) preserves the form it receives
  and does a normalization-insensitive lookup; HFS+ forced NFD; Linux compares
  bytes. A vault that went through sync or through HFS+ mixes the two forms
  (section 5.10).
- **Q8. Case sensitivity in name resolution.** `[OPEN]`
  It interacts with case-insensitive file systems (macOS by default — APFS can
  be case-sensitive per volume —, Windows) and case-sensitive ones (Linux) — the
  same vault may resolve differently per platform (section 5.10).
- **Q12. Rule for resolving a link to a file.** `[OPEN]`
  How `[[nota]]` becomes a file: relative path, unique shortest path, implicit
  `.md` extension, behavior with an ambiguous name, and how `aliases` takes
  part. With a multi-root workspace
  ([ADR 0041](../adr/0041-multi-root-workspace.md), `PROPOSED`), resolution
  also crosses roots.
- **Q13. Inline tags (`#tag` in the body).** `[OPEN]`
  The briefing only mentions `tags` in the frontmatter. Whether `#tag` in the
  body counts as a tag, and how it coexists with the `#` of a heading and with
  the `#` of a URL.
- **Q14. Link to a file that does not exist.** `[OPEN]`
  Whether it enters the index as a pending target, whether it appears in the
  graph, whether it counts as a backlink.
- **Q15. Markdown extensions outside the base.** `[OPEN]`
  Tables, footnotes, task lists, math, highlight `==texto==`, strikethrough.
  The briefing lists none; the choice of base parser
  ([ADR 0037](../adr/0037-base-parser.md)) changes what comes for free.
- **Q16. Non-Markdown files in the folder.** `[OPEN]`
  Which ones enter the index as a link target (images, PDF, `.canvas`) and which
  ones are ignored.
- **Q17. Size limit and behavior with a malformed file.** `[OPEN]` — the
  frontmatter part is `DECIDED` below; the rest of the question stays open.
  Fuzzing guarantees that it does not hang
  ([ADR 0029](../adr/0029-guardrails-in-ci.md)), but the expected result —
  error, partial parse or the file treated as text — is not defined. It includes
  resource limits: a file of hundreds of MB, a single line of tens of MB,
  brackets nested thousands deep (quadratic parser). Fuzzing catches crashes,
  not slowness; the limit and what happens when it is exceeded have to be
  stated. **Still `[OPEN]`**: file size, line length, and nesting or slowness on
  the Markdown side. The maintainer noted on 2026-09-21 that "slow" needs an
  answer outside the parser — a timeout in the core, not in `verso-dialect` —
  and that answer is not decided either.

  **Frontmatter limits: `DECIDED`** — by the maintainer on 2026-09-21, on the
  review of the `verso-dialect` PR
  ([`../review/phase-1-feature-1.md`](../review/phase-1-feature-1.md) §6,
  item 1): at most **64 levels** of nesting and at most **10 000 nodes** in one
  frontmatter. Both are counted on the YAML event stream before any tree is
  built; an alias is charged what the loader clones in its place, and the extra
  level a non-core tag adds is counted too. A frontmatter over either limit is
  reported with its span and with `values` as an error; the body is still
  parsed and nothing else in the file changes. The rationale the maintainer
  accepted: a real frontmatter has two or three levels and dozens of nodes, so
  larger numbers would only raise what a malicious file can cost. The two
  numbers are no longer provisional; they live as `pub(crate)` constants in
  `crates/verso-dialect/src/frontmatter.rs`, not in the public API. No fixture
  asserts them: none was asked for in the PR that closes this part, and one
  added later cites this question in `source:` (section 4.5).

  On the Markdown side there is one fact and no limit: the fuzz guardrail found
  an input of about 5 KB on which the base parser takes exponential time —
  exactly the "slowness" this question names. It is recorded in
  [ADR 0037](../adr/0037-base-parser.md), and what to do about it belongs to
  that ADR, not to this question.

### Gaps raised in the Phase 0 review

Source: `docs/review/phase-0.md`, section 4. Same rule as the previous ones: an
answer from the maintainer before implementing; Q18 was answered first, before
the parser was chosen.

- **Q18. Definition of round-trip.** `DECIDED` — by the maintainer on
  2026-09-21, on the comparison in
  [`docs/reference/parser-decision.md`](../reference/parser-decision.md):
  reading **(b)**. The parser is read-only: it produces a report (links,
  embeds, headings, blocks, callouts, frontmatter) with positions and byte
  ranges, and has no `serialize`. "Opening never rewrites" holds because the
  read path has no write; an edit, when one exists, is a textual patch by
  position, shown as a diff before being applied
  ([ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md)). The round-trip property
  test of [ADR 0029](../adr/0029-guardrails-in-ci.md) tests four properties:
  (1) `parse` returns for every input; (2) `parse(x) == parse(x)`; (3) span
  fidelity — every reported construct carries the byte range it came from,
  slicing the input with that range gives the construct's source text, and
  `pos` (section 4.4) is derived from it; (4) the read path does not write —
  the file's bytes before a read equal the bytes after (checked in `verso-fs`,
  feature 2; `verso-dialect` has no IO by construction). Reading (a), the
  lossless tree with `serialize(parse(x)) == x`, was not chosen: no Phase 1 or
  Phase 2 deliverable consumes a tree, and it would require a CommonMark parser
  of our own before feature 1; it can be added on top of (b) later without
  undoing anything. Per-block merge
  ([ADR 0020](../adr/0020-sync-merge-in-core-transports-as-plugins.md)) works
  over byte ranges delimited by parser positions. The base parser chosen under
  this reading is in [ADR 0037](../adr/0037-base-parser.md).
- **Q19. Heading matching.** `[OPEN]` (section 5.12)
  How `[[nota#seção]]` matches a heading: case, punctuation and spaces, emoji,
  inline formatting (`## *Porão*`), duplicate headings, nested path
  `[[nota#Cap 1#Seção]]`, setext heading, and what the `expected.yaml` records
  in `heading` for the nested path.
- **Q20. Markdown links to a local file.** `[OPEN]` (section 5.13)
  Whether they count as a link (proposal: yes); `<...>` with spaces; relative
  path `../`; what separates a local link from an external URL; `![](img.png)`
  as an embed; URL-encoding.
- **Q21. What a "block" is.** `[OPEN]`
  Used throughout the documentation (block ID, per-block merge, per-block
  visibility, citation by position) and never defined: a paragraph, a list item,
  a table cell, a whole callout, a code block, a heading with its content?
  Obsidian's public documentation describes its notion of it; the spec needs its
  own before Q3 and Q4 make sense.
- **Q22. Charset of the `^id` and form of the tags.** `[OPEN]`
  Obsidian's public documentation restricts `^id` to letters, numbers and
  hyphen; what happens with an invalid `^id`. For tags (Q13): charset, nesting
  `#a/b`, case sensitivity, `#` prefix in frontmatter `tags`.
- **Q23. Combined forms and wikilink escapes.** `[OPEN]`
  `[[nota#seção|alias]]`, `[[nota#^bloco|alias]]`, `[[#seção]]` and `[[#^bloco]]`
  (same file — does it count as a backlink to itself?), `[[pasta/nota]]`,
  `[[nota.md]]`, `[[nota\|alias]]` in a table, `\[[não é link]]`, `[[ nota ]]`
  with spaces, `![[img.png|300]]` (size, not alias), `[[nota|alias|extra]]`,
  wikilink inside a Markdown link or an image.
- **Q24. Frontmatter boundary and dialect.** `[OPEN]` (section 5.1)
  BOM before the `---`; CRLF (invariant 7 requires preserving the line break
  "of the file" — which one, when there is a mix?); `---` closed by `...`; empty
  frontmatter; invalid YAML (part of Q17); YAML version — in 1.1 `yes`, `no`,
  `on` and dates become booleans and timestamps, in 1.2 they do not;
  is `tags: 2024` a number or a tag?; wikilinks inside values
  (`related: "[[nota]]"`), which Obsidian Properties treat as links.
- **Q25. Encoding.** `[OPEN]`
  A `.md` file that is not valid UTF-8 (Latin-1 from an old vault, UTF-16 with a
  BOM from Windows): error, text with replacement, or ignored. Separate from
  Q17 because encoding is not syntax.
- **Q26. Paths ignored by the scan and their effect on backlinks.**
  `[OPEN]` — it lives in [ADR 0044](../adr/0044-verso-fs-semantics.md) because
  it belongs to `verso-fs`, but it changes the result of exit criterion 2 of
  Phase 1: does a note in `.trash/` that links to another one count as a
  backlink?

## 10. History

| Version | Date | Change |
|---|---|---|
| v0 | 2026-09-21 | First version, derived from `docs/BRIEFING.md` §11. No open question resolved |
| v0.1 | 2026-09-21 | Application of the Phase 0 review (`docs/review/phase-0.md`, accepted by the maintainer): section 4 becomes the `expected.yaml` schema (`PROPOSED`), with `block` as the proposed answer to Q1, positions and `observed`; sections 5.12 (headings) and 5.13 (Markdown links, `PROPOSED`) added; D7 with a status separated per item; Q7 and Q8 corrected with respect to APFS; Q17 broadened; Q18–Q26 added. No question closed |
| v0.2 | 2026-09-21 | Fixture rule changed by the maintainer (ADR 0031 item 4): §4 and §8 updated; Q1 closes with the approval of `fixtures/wikilink/block-reference`. No question closed yet |
| v0.3 | 2026-09-21 | Maintainer approved the first five fixtures: schema §4 `DECIDED`; Q1 closed (`block`). First question closed |
| v0.4 | 2026-09-21 | Q18 closed by the maintainer: reading (b), read-only parser with a four-property round-trip test (`docs/reference/parser-decision.md`, ADR 0037). Second question closed |
| v0.5 | 2026-09-21 | Provisional limits on the frontmatter recorded under Q17 (64 levels of nesting, 10 000 nodes), from the review of the `verso-dialect` PR (`docs/review/phase-1-feature-1.md`). No question closed |
| v0.6 | 2026-09-21 | Q3 closed by the maintainer for the end of a paragraph and the end of a list item, with the fixture `fixtures/block/list-item` as the answer and §5.7 updated; the `^id` on its own line after a blank line, on a heading and after a multi-line block stay open, and so does Q4 |
| v0.7 | 2026-09-21 | Q17 closed by the maintainer in its frontmatter part (64 levels of nesting, 10 000 nodes), the rest of the question staying `[OPEN]`; the contradiction inside §4.1 resolved on the strict reading (a list key asserts the whole list). Third question closed, in part |
