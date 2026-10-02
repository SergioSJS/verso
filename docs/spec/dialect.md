# Verso dialect spec — v0.24

- Version: v0.24 · 2026-10-02
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
| `property_links` | list of the links frontmatter properties hold (Q10), in the order written (§4.7) | not asserted |
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

There is no field for per-block visibility, inline tags or link resolution:
each one enters the schema when the corresponding question closes, with a PR
that updates this section. The typed relation entered with Q10, as
`property_links` (§4.7, v0.23).

### 4.7 Items of `property_links`

A link a frontmatter property holds — the typed relation of Q10: a quoted
wikilink as the value, or as an item of a list.

| Field | Meaning | Required |
|---|---|---|
| `property` | the top-level key that holds it, as written (a quoted key without its quotes) | yes |
| `item` | its position in the list, from 0, when the value is a list | when the value is a list |
| `target`, `heading`, `block`, `alias` | as in §4.2 | as in §4.2 |
| `pos` | position of the first `[` of the link (4.4) | when the fixture tests position |

Added on 2026-10-01 by the maintainer's decision on the critical review
[`../review/board.md`](../review/board.md), §6 item 2, with the drafted
fixture `fixtures/frontmatter/property-links`, approved on 2026-10-02.

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

How Verso extends JSON Canvas and persists the board: `DECIDED` on
2026-09-30 ([ADR 0057](../adr/0057-board-json-canvas.md), closing [ADR 0040](../adr/0040-board-persistence.md)).

1. A board is a `.canvas`. Verso's free drawing lives in the same file under
   the top-level key `verso`: `{"version": 1, "drawing": [ … ]}`, whose
   `drawing` is a list of Excalidraw elements. No node or edge type of Verso's
   own exists: Obsidian deletes a node of a type it does not know
   (`docs/reference/board-decision.md` §3.2, O5).
2. An edge promoted to a typed relation (Q10) carries
   `"verso": {"relation": "<key>"}` and the key as its `label`.
3. Opening a `.canvas` writes nothing. Writing one keeps every field Verso does
   not know, the key order read, and Obsidian's layout: an object or array
   whose values are all scalars on one line, any other one entry per line,
   tab indentation, and the final newline as the file had it (none in a file
   Verso creates). A value the user did not change is written as read, a
   fraction included; geometry the user changed is written in whole numbers.
   A file in another layout is rewritten in this one only after the user
   sees the diff (ADR 0057 point 13).
4. For the index, a canvas's `file` nodes and the links in its `text` nodes
   are links from the canvas (Q16). A `file` node names a path from the root
   of the folder, never a name looked up elsewhere (ADR 0057 point 11).
5. The fields of Verso's own on a canvas (ADR 0057 points 10 and 17), each
   written only when it is not the board's default:
   - top-level `verso`: `version` (1), `drawing`, `background`;
   - an element of `verso.drawing`: `under`, the id of the node it lies
     under;
   - a node's own `verso`: `background`, `fill`, `corners`, `strokeWidth`,
     `roughness`, `angle`, `strokeStyle`, `opacity`, `locked`, `groups`;
   - an edge's own `verso`: `relation`, `line` (`curved` or `elbow`),
     `strokeWidth`, `roughness`, `startHead`, `endHead`, `bends`,
     `labelSize`, `labelFont`, `strokeStyle`, `opacity`, `locked`,
     `groups`.

   A `verso.version` above the one a build writes is a board of a later
   Verso: shown, never written.

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
formatting, emoji, duplicate headings, nested path `[[nota#Cap 1#Seção]]`):
`[OPEN]` (section 9, Q19).

A setext-style heading — a line of text underlined with `===` or `---` — is a
heading, as Obsidian reports it. `DECIDED` on 2026-09-29 by the maintainer,
who approved the fixture below in session (Q19, setext part). Observed on 2026-09-29 with the Obsidian CLI
([`docs/reference/obsidian-cli.md`](../reference/obsidian-cli.md), admissible
by [ADR 0009](../adr/0009-external-constraints.md)), reading
`app.metadataCache.getCache(...).headings` of a test note in the Sandbox
vault: `Taverna` over `===` is level 1; `Porão` over `---` is level 2; and a
`---` directly under a line of text, with no blank line between them, makes
that line a level-2 heading and is never read as a thematic break. The
position is the text line's. The fixture `fixtures/heading/setext` records
this, and `verso-dialect` reports setext headings accordingly. This is the
setext part of Q19, answered by observation; the maintainer approved that
fixture on 2026-09-29, in session ("ratifique o que precisar", answering the
list of what was pending, which named it), and its first line now records
the approval (section 1; [ADR 0031](../adr/0031-fixtures-as-contract.md)).
The matching part of Q19 stays `[OPEN]`.

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

Nothing in this section was decided until 2026-09-24, when the maintainer
decided the typed note, its schemas and their labels per language
([ADR 0052](../adr/0052-typed-note.md); Q11). The rest is `PROPOSED` or
`[OPEN]`, and nothing may contradict section 5.

| Extension | Form | Status |
|---|---|---|
| Typed note | `type:` in the frontmatter names a schema of the folder, compared as Q12 compares note names; with no schema, it is plain Markdown | `DECIDED` on 2026-09-24 ([ADR 0052](../adr/0052-typed-note.md)) |
| Write provenance | author, model and when, in the frontmatter | `PROPOSED` ([ADR 0014](../adr/0014-primitives-catalog.md)) |
| Materializable views | query output written as real Markdown in the file | `PROPOSED` ([ADR 0014](../adr/0014-primitives-catalog.md)) |
| Schema i18n | language-neutral key with a translated label (`type: npc` displayed as "PdM" or "NPC") | `DECIDED` on 2026-09-24 ([ADR 0052](../adr/0052-typed-note.md): a `label` per interface language) |
| Typed relation | a frontmatter property of the source note whose value is a quoted wikilink or a list of them; the key is the type | `DECIDED` on 2026-09-30 (Q10, [ADR 0057](../adr/0057-board-json-canvas.md)) |
| Schemas | a fenced `verso-schema` block in a note, anywhere in the folder but hidden and ignored paths | `DECIDED` on 2026-09-24 (Q11) |
| Per-block visibility | game master's secret | `[OPEN]` (Q9) |

Example of a typed note:

```markdown
---
type: npc
title: Barão Vermelho
---

O barão governa o distrito norte.
```

And of the schema that types it, a block in any note of the folder — its
prose around the block is for people and agents (Q11):

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

An Obsidian vault that already uses `type:` in the frontmatter for another
purpose stays valid: with no matching schema in the folder, the note is plain
Markdown.

Constraints that any extension has to respect:

1. Degrades to Markdown readable in any editor
   ([ADR 0013](../adr/0013-degrades-to-markdown.md), `DECIDED` on
   2026-09-24).
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
| D4 | Excalidraw drawing | the plugin's `.excalidraw.md` | Verso's board format, a `.canvas` (§5.11) | `DECIDED` on 2026-09-30 ([ADR 0057](../adr/0057-board-json-canvas.md)) | Explicit conversion, with a diff; the drawing is left as it was |
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
- **Q10. Typed relation syntax.** `DECIDED` on 2026-09-30.
  Decide before implementing relations (§17 item 6). Requirements already fixed:
  type and direction, several relations between the same two nodes
  ([ADR 0014](../adr/0014-primitives-catalog.md)), and degrading to readable
  Markdown ([ADR 0013](../adr/0013-degrades-to-markdown.md)).

  **Decided on 2026-09-30 by the maintainer**, in session, on the memo
  `docs/reference/board-decision.md` (section 10; [ADR 0057](../adr/0057-board-json-canvas.md), point 4):
  a typed relation is a frontmatter property of the source note whose value
  is a quoted wikilink (`aliado: "[[Barão]]"`) or a list of quoted wikilinks
  (`inimigos: ["[[A]]", "[[B]]"]`). The key is the type; the direction goes
  from the note holding it to the target; several relations between two
  notes are the same target under several keys. An unquoted `[[x]]` is a YAML
  flow sequence and not a link. As observed in Obsidian 1.13.7 (memo, O10 and
  O11), which lists such values as links of the note, keyed `aliado`,
  `inimigos.0`, `inimigos.1`.
- **Q11. Format and location of the schemas.** `DECIDED` on 2026-09-24.
  Decide before the typed note, in Phase 2 (§17 item 7). "A text file in the
  folder" is the briefing's only clue. It is in tension with D2: schema inside
  the folder, config outside it. Affects the schema packs
  ([ADR 0015](../adr/0015-schema-packs.md)).

  **Decided on 2026-09-24 by the maintainer**, in session, on the memo
  `docs/reference/typed-note-decision.md` (sections 5 and 6): the author's
  recommendations of the day were put to the maintainer as one list, and the
  answer was *"Tirando o plano de fazer vários PR, eu gosto das suas
  recomendações"* ("apart from the plan of several pull requests, I like your
  recommendations"). The typed note itself is
  [ADR 0052](../adr/0052-typed-note.md), accepted the same day.

  1. **Format:** a fenced code block whose language is `verso-schema`, with
     YAML inside, in a note — one type per block; several blocks may share a
     note. In its first version it says `type` (the name notes write in their
     own `type:`), `label` per interface language, and `properties`, an
     ordered list of `key`, `kind` and `label`, the kinds being `text`,
     `list`, `number`, `checkbox`, `date` and `datetime`. Nothing in it runs.
     It is read under the frontmatter's limits (Q17).
  2. **Location:** any note of the open folder, except under hidden and ignored
     paths (Q26; [ADR 0044](../adr/0044-verso-fs-semantics.md)). A schema's
     identity is the `type` inside it, not the note's name or place. This is
     the maintainer's choice between briefing §5.3 — "a text file in the
     folder", with ADR 0014 and section 6 after it — and briefing §8 with
     [ADR 0021](../adr/0021-sync-automerge-layered-config.md), both
     `PROPOSED`, which put schemas in the shared layer of the configuration,
     outside the tree: §5.3's. A schema is content, as packs are, so the
     tension with D2 does not arise; ADR 0021 is left as written, Proposed,
     and disagrees on schemas.
  3. **Two schemas with one name:** neither applies; the notes of that type
     are shown untyped, with the conflict naming both. A schema that does not
     parse types nothing, and says so.

  A block nested in a list or a callout does not count: only one at the top
  level of a note does, and a nested one is shown as not read — decided by the
  maintainer on 2026-09-24 (`docs/reference/views-decision.md` §2, v0.19),
  which keeps a quoted example out. No fixture comes with this closing — none existed
  for Q11, and it closed on the maintainer's answer as Q12 and Q26 did. The
  schema fixtures come with the implementation, each drafted by the AI and
  approved by the maintainer in the pull request that adds it
  ([ADR 0031](../adr/0031-fixtures-as-contract.md)), together with the
  `expected.yaml` key for a schema block (section 4.1) and its category
  (section 8).

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

  **Provisional fact from `verso-index`, recorded on 2026-09-22, not an answer
  to this question.** An embed counts as a link **and** as a backlink: it is
  stored with its kind, resolves by the same rule as a link, and appears in
  the backlinks of its target, marked as an embed so that a caller can tell
  the two apart. Observed in Obsidian 1.13.7 through its CLI on 2026-09-22
  (ADR 0009; the run is in `docs/reference/index-decision.md` §4.1): the five
  links `resolvedLinks` counts from the sandbox note to `Alvo.md` include the
  embed `![[Alvo]]`. The maintainer decides; this line only records what the
  code does in the meantime.
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
- **Q5. Callout coverage.** `DECIDED` for the reading view's kinds, fold and
  title on 2026-09-23; `[OPEN]` for nesting.
  Recognized kinds, `-`/`+`, nesting (section 5.8).

  **Decided on 2026-09-23 by the maintainer, for the reading view**
  (`docs/review/phase-2.md` §6, item 4; the answer: *"a e b ok"*), as the code does it. The reading view shows as a callout a blockquote
  whose first line opens with `[!kind]`, `[!kind]+` or `[!kind]-`, for any
  kind, lower-cased; `+` and `-` make it foldable from its title, and `-`
  starts it closed, as Obsidian's documentation shows — since `5b7fc69`:
  before it the fold was only marked and nothing acted on it, which the Opus
  reading of the answers found; with no title the
  kind's name, capitalized, is the title; a blockquote nested inside a
  callout stays a blockquote (`crates/verso-dialect/src/callouts.rs`) — since
  v0.17, one that is itself a callout is drawn as a callout (the provisional
  fact below). The
  parser that feeds the index is unchanged. **Nesting stays `[OPEN]`**:
  Obsidian's public documentation shows callouts nested inside callouts,
  which the reading view kept as blockquotes before v0.17. The recommendation put to the
  maintainer said the reading view follows Obsidian, which is not so for
  nesting, so nesting is not taken as decided.

  **Provisional fact, recorded on 2026-09-24 from the code on branch
  `feat/nested-callouts`, not an answer to this question.** The reading view
  draws a callout inside a callout as a callout, up to 32 deep — a deeper one
  stays a blockquote, so that a note cannot make drawing it recurse without
  end — and a plain blockquote inside a callout stays a blockquote. It
  follows Obsidian's public documentation, which shows nested callouts. The
  parser that feeds the index is not touched. The maintainer decides; this
  line only records what the code does in the meantime.
- **Q6. Contexts in which `[[...]]` is not a link, besides backtick and fence.**
  `[OPEN]` for the index and for embedded HTML; the reading view's comments
  `DECIDED` on 2026-09-23. Block indented by 4 spaces, embedded HTML, `%%comentário%%`, a link
  inside a URL (section 5.9).

  **Decided on 2026-09-23 by the maintainer, for the reading view and the
  window** (`docs/review/phase-2.md` §6, item 4; the answer: *"a e b ok"*), as the code does it — except the embedded HTML that
  Obsidian shows and the window drops, below. The parser that feeds the index
  is unchanged, so whether a `[[…]]` inside a comment, embedded HTML or an
  indented block is a link is still what section 5.9 says of it. What changed
  is what the reading view shows: `%%…%%` is dropped from it, inline or across
  lines, never inside code — Obsidian's public documentation shows comments in
  editing view only — and a `#tag` inside a comment is a tag to neither the
  index nor the reader. Embedded HTML reaches the page only through an
  allowlist the window applies (scripts, styles, frames, forms and event
  attributes are dropped), since a note from a shared folder is untrusted input
  ([ADR 0045](../adr/0045-server-and-mcp-security.md)). What the index counts
  as a link in those contexts stays `[OPEN]`. So does the embedded HTML the
  allowlist drops and Obsidian's public documentation shows in a note —
  `<iframe>`, `<video>`, `<audio>`: the premise put to the maintainer, that
  the reading view follows Obsidian, does not hold there (the Opus reading of
  the answers); the allowlist stays as it is meanwhile. *(Corrected on
  2026-09-24 by `docs/reference/embedded-media-decision.md`: Obsidian's public
  help shows `<iframe>` in a note; no public page shows `<video>` or `<audio>`
  in a note's raw HTML — audio and video are documented as `![[…]]` embeds.
  The question stays `[OPEN]`, and that memo lays out the options.)*
- **Q7. Unicode normalization in name comparison.** `[OPEN]`
  NFC × NFD. APFS (macOS, the initial platform) preserves the form it receives
  and does a normalization-insensitive lookup; HFS+ forced NFD; Linux compares
  bytes. A vault that went through sync or through HFS+ mixes the two forms
  (section 5.10).

  **Provisional fact from `verso-index`, recorded on 2026-09-22, not an answer
  to this question.** Both sides of a name comparison go through NFC before
  being compared, so a name written in NFC and the same name written in NFD
  are one name. This was **not** observed in Obsidian: it follows from the
  definition of the two forms, and APFS being normalization-insensitive hides
  the difference on the initial platform. The maintainer decides; this line
  only records what the code does in the meantime.
- **Q8. Case sensitivity in name resolution.** `[OPEN]`
  It interacts with case-insensitive file systems (macOS by default — APFS can
  be case-sensitive per volume —, Windows) and case-sensitive ones (Linux) — the
  same vault may resolve differently per platform (section 5.10).

  **Provisional fact from `verso-index`, recorded on 2026-09-22, not an answer
  to this question.** Resolution is case-insensitive: both sides are
  lower-cased before being compared, so `[[alvo]]`, `[[ALVO]]` and `[[Alvo]]`
  all reach `Alvo.md`. Observed in Obsidian 1.13.7 through its CLI on
  2026-09-22 (`docs/reference/index-decision.md` §4.1). The other half of this
  question — which extensions make a file a note — is the `verso-fs` fact
  recorded under Q12. The maintainer decides; this line only records what the
  code does in the meantime.
- **Q12. Rule for resolving a link to a file.** **CLOSED on 2026-09-22 by the
  maintainer**, following Obsidian 1.13.7 as observed
  (`docs/reference/index-decision.md` §4.1 and §4.6,
  [ADR 0009](../adr/0009-external-constraints.md)). The rule:

  1. `#…`, `^…` and `|alias` are removed from the target first. An **empty
     target** (`[[#Heading]]`) is the note itself, and the note is then a
     source of its own backlinks.
  2. The rest is tried **as a path**, extension optional, case-insensitive,
     compared after NFC: first from the **root of the open folder**, then
     relative to the **source note's own folder**, honouring `..`; a path
     that begins with `./` or `../` is read relative to that folder only.
     *(Order stated on 2026-09-23, below: the point did not say which came
     first.)*
  3. If no path matches, the **bare name** is matched case-insensitively:
     first a candidate **under the source note's own folder**, at any depth —
     in it or in a folder inside it; otherwise the one with the **fewest path
     segments**; among equals, the **first in byte order** (`B/dup.md` before
     `a/dup.md`). *(Amended on 2026-09-23, below: the point said "in".)*
  4. Nothing answers: the target is **unresolved**, stored with its text as
     written, and is never a backlink (Q14).
  5. A frontmatter **alias does not resolve** a link; an **embed** resolves by
     the same rule and counts as a link (Q2); `[[nota/]]` and `[[.md]]` do not
     resolve.

  Resolution happens at query time, so adding a note resolves the links that
  were waiting for it. With a multi-root workspace
  ([ADR 0041](../adr/0041-multi-root-workspace.md), `PROPOSED`), whether
  resolution crosses roots stays open. The alias line still **contradicts
  Obsidian's public documentation**, which presents aliases as a way of linking
  to a note; the contradiction is recorded, not resolved, and the decision
  follows what was observed.

  The `verso-index` code of 2026-09-22 does **not** implement points 2, 3 and 5
  in full — the five differences are listed in
  `docs/reference/index-decision.md` §4.6 and are what the feature 3 code owes.

  **Point 3 amended by the maintainer on 2026-09-23.** It said a candidate
  **in** the source note's own folder; the index had preferred one **under**
  it, at any depth, since commit `d1a5272`, following probes of Obsidian
  1.13.7 that were recorded, run again, as the third observation of
  `docs/reference/index-decision.md` §4.1. Asked "sob a pasta, sim ou não?",
  with an example and the recommendation to follow Obsidian, the maintainer
  answered: *"boa, gosto da sua ideia, pode seguir"*. Point 3 now says
  "under", and nothing in the code departs from points 1 to 5.

  **Embeds of files that are not notes, since `3340a3f`, recorded on
  2026-09-23.** They resolve by points 1 to 5 from the note that holds the
  embed, "under" included since the amendment.

  **Point 2's order stated by the maintainer on 2026-09-23**
  (`docs/review/phase-2.md` §6, item 20; the answer: *"a e b ok"*). The point
  did not say whether a path is tried from the root or relative to the
  source's folder first. The index and the embeds' resolution try the root
  first, and so does Obsidian 1.13.7: from `verso-probe/a/src.md`,
  `[[probe-sub/vpx]]` reached the root's `probe-sub/vpx.md`, not
  `verso-probe/a/probe-sub/vpx.md`; from `verso-probe2/a/src.md`,
  `[[sub2/rx]]` reached the root's `sub2/rx.md`, while `[[./sub2/rx]]` and
  `[[../a/sub/rx]]` reached the notes under the source's folder
  (`docs/reference/index-decision.md` §4.1, third and fourth observations). So
  `![[img.png]]` in `a/` reaches a root `img.png` before `a/img.png` — a path
  from the root answers before point 3 is reached — and `![[./img.png]]`
  reaches `a/img.png`. Tests pin both in the index and in the embeds'
  resolution.

  **Fact from `verso-fs`, unchanged by this closure.** The walk classifies a
  regular file as a note when its extension is exactly `md`; `.MD`, `.Md` and
  `.markdown` are plain files until Q8 is decided.
- **Q13. Inline tags (`#tag` in the body).** `DECIDED` on 2026-09-23.
  The briefing only mentions `tags` in the frontmatter. Whether `#tag` in the
  body counts as a tag, and how it coexists with the `#` of a heading and with
  the `#` of a URL.

  **Decided on 2026-09-23 by the maintainer** (`docs/review/phase-2.md` §6, item 4; the answer: *"a e b ok"*), as the index and
  the reading view do it — recorded first, the same day, as provisional. The
  index's tag list counts a
  `#` in the body as a tag when it opens the line or follows a space or a `(`,
  and is followed by letters, digits, `_`, `-` or `/` that are not all digits,
  and the tag is lower-cased. So the `#` of a
  heading (`# Title`, with its space) and the `#` inside a URL are not tags.
  Since `95b39ee` the index and the reading view take the rule from one
  function of the dialect, `verso_dialect::body_tags`, which reads the parser's
  events and skips the frontmatter, code spans and code blocks (fenced or
  indented), raw HTML, link destinations and labels, image alt text, math and
  `%%` comments; before it, the index scanned raw lines and listed false tags. The
  reading view shows such a tag as a link that searches it.
- **Q14. Link to a file that does not exist.** `[OPEN]`
  Whether it enters the index as a pending target, whether it appears in the
  graph, whether it counts as a backlink.

  **Provisional fact from `verso-index`, recorded on 2026-09-22, not an answer
  to this question.** A target no note answers to is kept — with its text as
  written and a count of how often it appears — and is listed by the index's
  query for unresolved targets; it is **not** a backlink of anything. Observed
  in Obsidian 1.13.7 through its CLI on 2026-09-22
  (`docs/reference/index-decision.md` §4.1): `unresolvedLinks` reports
  `nao-existe` with its count, in a map separate from the resolved links. The
  maintainer decides; this line only records what the code does in the
  meantime.

  **Second provisional fact from `verso-index`, recorded on 2026-09-22, and not
  an answer to this question either.** A link whose target is empty —
  `[[#Heading]]`, `[[#^id]]`, which section 4 gives as `target == ""` —
  resolves to the note that contains it. It is not a link to a file that does
  not exist: it never appears among the unresolved targets, and it is not a
  backlink of the note to itself, so a note that links to its own headings does
  not show up in its own backlinks. *(The last clause is superseded by Q12,
  point 1, closed later the same day: the note is a source of its own
  backlinks, and the code does that since commit `d1a5272`.)* Nothing was observed in Obsidian for this
  case; the code chose it because the alternative counts every same-note
  heading link as a missing file and puts an empty target at the head of the
  unresolved list of any folder that uses them. The maintainer decides; this
  line only records what the code does in the meantime.
- **Q15. Markdown extensions outside the base.** `DECIDED` for the reading view
  on 2026-09-23; `[OPEN]` for the parser that feeds the index.
  Tables, footnotes, task lists, math, highlight `==texto==`, strikethrough.
  The briefing lists none; the choice of base parser
  ([ADR 0037](../adr/0037-base-parser.md)) changes what comes for free.

  **Decided on 2026-09-23 by the maintainer, for the reading view**
  (`docs/review/phase-2.md` §6, item 4; the answer: *"a e b ok"*), as the code does it. The HTML the core renders for the window
  (`verso_dialect::to_html`) shows all six, as Obsidian shows them by default:
  tables, footnotes — including Obsidian's inline form `^[text]`, rewritten
  into a referenced footnote before rendering —, task lists with checkboxes,
  math left as its source in a marked element that the window typesets,
  highlight and strikethrough. It also shows a single newline inside a
  paragraph as a line break, which is Obsidian's default ("strict line
  breaks" off). None of this reaches the parser that feeds the index: it still
  enables only wikilinks and the YAML block, so a link inside a table or a
  footnote is found as in plain text, and no fixture covers the rendering. The
  maintainer asked for footnotes, math and tables by name on 2026-09-23; that
  settles what the window shows, not this question. Since `7475c03` the reading
  view finds all of these on the parser's events, not in its own HTML: code,
  link labels and alt text are never rewritten, and a raw `</blockquote>` can no
  longer open or close a callout. Because the reader enables options the parser
  does not, `$[[x]]$` is a link to the index and math to the reader — a
  disagreement recorded, not resolved. Whether the parser that feeds the index
  enables these extensions, which would settle it, stays `[OPEN]`.
- **Q16. Non-Markdown files in the folder.** `[OPEN]`
  Which ones enter the index as a link target (images, PDF, `.canvas`) and which
  ones are ignored.

  **`.canvas` decided on 2026-09-30 by the maintainer** ([ADR 0057](../adr/0057-board-json-canvas.md),
  point 6), as Obsidian 1.13.7 does (`docs/reference/board-decision.md`, O7,
  O8, O12): a canvas's `file` nodes and the wikilinks inside its `text` nodes
  are backlink sources; a `.canvas` is a link target by its full name with
  the extension, never by its bare name. The other files keep the question.

  **Provisional fact from `verso-core` and the window, recorded on 2026-09-23,
  not an answer to this question.** The walk lists every regular file that is
  not hidden or ignored; only notes enter the index as link targets and
  backlink sources. An embed of another file (`![[mapa.png]]`, `![[livro.pdf]]`)
  stays in the index as an unresolved target (Q14), never a backlink; the core
  resolves it for display only, by the rule of Q12 from the note that holds the
  embed (since `3340a3f`; before, by file name alone, whatever note held it).
  On its face this departs from point 5 of the closed Q12 ("an embed resolves
  by the same rule"): the index resolves embeds among notes only, so an embed
  of an image stays unresolved in it while the window resolves it for display.
  Recorded, not resolved. A file whose content is in the cloud is listed and
  resolves as present. The
  window shows images, PDFs and text files, and edits text files through the
  same atomic write as notes; an HTML file opens as text, since the viewer
  that shows it as a page is never reached (`docs/review/phase-2.md` §6, item
  16). A note
  whose frontmatter has an `http(s)` `url` property is shown as that web page;
  the index keeps the address for it. The maintainer decides; this line only
  records what the code does in the meantime.
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
- **Q19. Heading matching.** `[OPEN]`, the setext part `DECIDED` on
  2026-09-29 (section 5.12)
  How `[[nota#seção]]` matches a heading: case, punctuation and spaces, emoji,
  inline formatting (`## *Porão*`), duplicate headings, nested path
  `[[nota#Cap 1#Seção]]`, setext heading, and what the `expected.yaml` records
  in `heading` for the nested path.
  **The setext part is `DECIDED`** (2026-09-29, section 5.12): a line
  underlined with `===` is a level-1 heading and one underlined with `---` a
  level-2 heading, the `---` never a thematic break when it sits directly
  under text, as observed in Obsidian. The answer is the fixture
  `fixtures/heading/setext`, approved by the maintainer on 2026-09-29, in
  session; that approval closes the setext sub-question, and only it. The
  matching part — case, punctuation, emoji, formatting, duplicates, the
  nested path and its `heading` value — stays `[OPEN]`.
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
- **Q22. Charset of the `^id` and form of the tags.** `DECIDED` for the tags'
  charset and case on 2026-09-23; `[OPEN]` for the rest.
  Obsidian's public documentation restricts `^id` to letters, numbers and
  hyphen; what happens with an invalid `^id`. For tags (Q13): charset, nesting
  `#a/b`, case sensitivity, `#` prefix in frontmatter `tags`.

  **Decided on 2026-09-23 by the maintainer, for the tags** (`docs/review/phase-2.md` §6, item 4; the answer: *"a e b ok"*): their
  charset and case folding are the ones recorded under Q13. The `^id` part,
  what `#a/b` means as a hierarchy, and a `#` prefix in the frontmatter's
  `tags` stay `[OPEN]`.
- **Q23. Combined forms and wikilink escapes.** `[OPEN]`
  `[[nota#seção|alias]]`, `[[nota#^bloco|alias]]`, `[[#seção]]` and `[[#^bloco]]`
  (same file — does it count as a backlink to itself?), `[[pasta/nota]]`,
  `[[nota.md]]`, `[[nota\|alias]]` in a table, `\[[não é link]]`, `[[ nota ]]`
  with spaces, `![[img.png|300]]` (size, not alias), `[[nota|alias|extra]]`,
  wikilink inside a Markdown link or an image.
- **Q24. Frontmatter boundary and dialect.** `[OPEN]` (section 5.1); the
  window's part `DECIDED` on 2026-09-23.
  BOM before the `---`; CRLF (invariant 7 requires preserving the line break
  "of the file" — which one, when there is a mix?); `---` closed by `...`; empty
  frontmatter; invalid YAML (part of Q17); YAML version — in 1.1 `yes`, `no`,
  `on` and dates become booleans and timestamps, in 1.2 they do not;
  is `tags: 2024` a number or a tag?; wikilinks inside values
  (`related: "[[nota]]"`), which Obsidian Properties treat as links.

  **Decided on 2026-09-23 by the maintainer, for the window** (`docs/review/phase-2.md` §6, item 4; the answer: *"a e b ok"*), as
  the code does it. The window's folded frontmatter and its properties panel
  find the frontmatter where the core finds it, by the rule of section 5.1 as
  the parser applies it; they used a looser rule of their own, which accepted
  `...` and trimmed the fences, until the Opus reading of 2026-09-23 found the
  two disagreeing. A value the panel cannot rewrite without changing its type —
  a mapping, a list with anything but plain text — is shown and not edited. A
  file whose line endings are mixed opens read-only in the window, so it is
  never converted there. The rest of the question — a BOM, `...`, the YAML
  version, `tags: 2024`, wikilinks inside values — stays `[OPEN]`, and so does a
  conversion of mixed line endings by the user's action, with the diff
  (invariant 8), which the maintainer left for later
  (`docs/review/phase-2.md` §6, item 23).

  **The link part is next, by the maintainer's answer of 2026-09-24**
  ([ADR 0052](../adr/0052-typed-note.md), point 9): properties that hold links
  are out of the typed note's first slice, and "wikilinks inside values" is the
  next part of this question to decide. It stays `[OPEN]` until then.

  **The link part decided on 2026-09-30 by the maintainer**, with Q10
  ([ADR 0057](../adr/0057-board-json-canvas.md), point 4): a quoted wikilink that is a property's
  value, or an item of a list that is a property's value, is a link, and the
  property is a typed relation named by its key; an unquoted `[[x]]` is YAML.
- **Q25. Encoding.** `DECIDED` on 2026-09-23.
  A `.md` file that is not valid UTF-8 (Latin-1 from an old vault, UTF-16 with a
  BOM from Windows): error, text with replacement, or ignored. Separate from
  Q17 because encoding is not syntax.

  **Decided on 2026-09-23 by the maintainer** (`docs/review/phase-2.md` §6,
  item 4, with the recommendation to keep refusing; the answer: *"a e b ok"*),
  as the code does it. A file whose bytes are not valid UTF-8 is not opened for
  editing: reading it for an editor answers `not_text`, so no editor holds a
  copy with replacement characters that a save would write back; a rename plan
  leaves such a note out and names it; `verso mcp` answers `not_text`. The
  index still decodes it with replacement, for search only, which writes
  nothing. Before this, the text was decoded with replacement and a save or a
  plan wrote the replacement characters back — the Opus reading of 2026-09-23
  found it.
- **Q26. Paths ignored by the scan and their effect on backlinks.**
  `DECIDED` on 2026-09-22 by the maintainer, on the memo
  `docs/reference/fs-decision.md`; the rule itself lives in
  [ADR 0044](../adr/0044-verso-fs-semantics.md), because it belongs to
  `verso-fs`. An entry whose name starts with `.` is not walked at any depth —
  which covers `.obsidian/`, `.git/` and `.trash/` — plus a configurable list of
  relative paths in the configuration outside the tree, empty by default, and no
  `.gitignore` in Phase 1. An ignored note is an unresolved link target and is
  never a backlink source, so a note in `.trash/` that links to another one does
  not count as a backlink in exit criterion 2 of Phase 1.
  *(Revised in ADR 0044 on 2026-09-29 by the maintainer: beside that list, a
  built-in list of build directories and each directory's `.gitignore`, with
  git's semantics, are left out too, each behind a setting that is on by
  default. An entry left out by either follows the same rule: an unresolved
  target, never a backlink source.)*

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
| v0.8 | 2026-09-22 | Q26 closed by the maintainer (ADR 0044, memo `docs/reference/fs-decision.md`): hidden entries are not walked at any depth, and an ignored note is an unresolved target and never a backlink source |
| v0.9 | 2026-09-22 | Provisional fact recorded under Q12, from the `verso-fs` code: a note is a regular file whose extension is exactly `md`; `.MD`, `.Md` and `.markdown` are plain files until Q12 and Q8 are decided. No question closed |
| v0.10 | 2026-09-22 | Provisional facts recorded under Q2, Q8, Q12, Q14 and Q7, from the `verso-index` code and from the observation of Obsidian 1.13.7 on the same day (`docs/reference/index-decision.md`): how a link resolves, case, embeds, unresolved targets and NFC. No question closed |
| v0.11 | 2026-09-22 | Provisional facts recorded under Q12 and Q14, from the `verso-index` code as it stands after the Opus 5 reading: an empty target (`[[#Heading]]`) resolves to the note itself, a case collision of two paths resolves like one of bare names, and an unresolved target is shown under the smallest of its spellings in byte order. Nothing observed in Obsidian for these three; no question closed |
| v0.12 | 2026-09-22 | **Q12 closed by the maintainer**, following Obsidian 1.13.7 as observed a second time on the same day (`docs/reference/index-decision.md` §4.1, §4.6): empty target is the note itself and a backlink of it; a path is resolved relative to the source note's folder as well as from the root; a bare name prefers the source's own folder, then the fewest segments, then byte order; aliases do not resolve; `[[nota/]]` and `[[.md]]` do not resolve. The parts of Q2, Q8 and Q14 that the rule needs are answered with it; the rest of those three stays open. Fourth question closed |
| v0.13 | 2026-09-23 | Provisional facts recorded under Q12, Q13, Q15 and Q16, from the code of the Phase 2 branch: where the code departs from point 3 of Q12 ("under" the source's folder where point 3 says "in", which the maintainer has not settled), body tags, the Markdown extensions and line breaks the reading view renders, and the files that are not notes. The Q14 line on `[[#Heading]]` marked as superseded by Q12 point 1. No question closed |
| v0.14 | 2026-09-23 | Provisional facts under Q6, Q12, Q13, Q15, Q16, Q24 and Q25 brought up to the code after the Opus reading of the Phase 2 branch: comments hidden and embedded HTML sanitized in the reading view, one tag rule for the index and the reader, embeds resolved by Q12 from their note, the window's frontmatter boundary, files that are not UTF-8 not opened for editing. No question closed |
| v0.15 | 2026-09-23 | **Q12 point 3 amended by the maintainer**: a bare name prefers a candidate under the source note's folder, at any depth, as Obsidian 1.13.7 does (the third observation of `docs/reference/index-decision.md` §4.1); the index already did, and embeds of files now do too. Q12 stays closed |
| v0.16 | 2026-09-23 | The maintainer's answers on the Phase 2 review (`docs/review/phase-2.md` §6, items 4 and 20): **Q13 and Q25 closed** as the code does them; Q5 (kinds, fold — which the reading view now acts on, `5b7fc69` — and title), Q6 (comments), Q15 and Q24 decided for the reading view and the window, with the index's part and the rest still open — Q5's nesting and Q6's `<iframe>`, `<video>` and `<audio>` stay open because the reading view does not follow Obsidian there; Q22 decided for the tags' charset and case; **Q12 point 2's order stated**: a path from the root first, then relative to the source's folder, and `./` or `../` relative only, as Obsidian 1.13.7 does. Two questions closed, five in part |
| v0.17 | 2026-09-24 | Q5: a provisional fact, not an answer — the reading view draws a callout inside a callout, up to 32 deep (branch `feat/nested-callouts`); nesting stays `[OPEN]` |
| v0.18 | 2026-09-24 | **Q11 closed by the maintainer** (`docs/reference/typed-note-decision.md`, [ADR 0052](../adr/0052-typed-note.md)): a schema is a fenced `verso-schema` block, YAML inside, in a note anywhere in the open folder but hidden and ignored paths, named by the `type` inside it; two schemas with one name type nothing, and the conflict is shown; whether a nested block counts is not decided. Section 6: the typed note, schemas and schema i18n `DECIDED`, constraint 1 (ADR 0013) accepted. Q24: its link part is the next decision. No fixture yet: the implementation brings them. Q6: a pointer to `docs/reference/embedded-media-decision.md`, which corrects the claim that Obsidian's documentation shows `<video>` and `<audio>`; Q6 stays open |
| v0.19 | 2026-09-24 | Q11: **a nested `verso-schema` block does not count**, decided by the maintainer (`docs/reference/views-decision.md` §2, [ADR 0052](../adr/0052-typed-note.md) point 3): only a block at the top level of a note is a schema, and a nested one is shown as not read. Bases (`.base` files and `base` blocks) are [ADR 0053](../adr/0053-views-bases.md)'s, not this spec's, which is the notes' dialect |
| v0.20 | 2026-09-29 | Q19, setext part: **an observed answer and a drafted fixture** — `Título` over `===` is a level-1 heading, over `---` a level-2 one, and a `---` directly under text is never a thematic break (Obsidian CLI, `docs/reference/obsidian-cli.md`; `fixtures/heading/setext`, AI draft). Section 5.12 updated; the setext sub-question closes with the maintainer's approval of that fixture in its pull request. The matching part of Q19 stays open |
| v0.21 | 2026-09-29 | **Q19, setext part, closed by the maintainer**: the fixture `fixtures/heading/setext` approved in session ("ratifique o que precisar"); a setext underline is a heading, as observed in Obsidian. Section 5.12 updated. The matching part of Q19 stays `[OPEN]`. Q26: a note pointing to the revision of ADR 0044 of the same day — build directories and `.gitignore` left out, behind settings. One question closed, in part |
| v0.22 | 2026-09-30 | **Q10 closed by the maintainer** (`docs/reference/board-decision.md` §10, [ADR 0057](../adr/0057-board-json-canvas.md)): a typed relation is a frontmatter property of the source note whose value is a quoted wikilink or a list of them, the key its type; with it, **Q24's link part**. **Q16 decided for `.canvas`** as Obsidian does: `file` nodes and the links of `text` nodes are backlink sources, a canvas is a link target by its full name. §5.11: the board's format — the drawing under a top-level `verso` key, no type of Verso's own, Obsidian's layout kept on write. Section 6: the typed relation `DECIDED`; the conversion table's D4 `DECIDED`. One question closed, two in part |
| v0.23 | 2026-10-01 | On the critical review `docs/review/board.md`, §6, accepted by the maintainer: **`property_links`** joins the `expected.yaml` schema (§4.1, §4.7, §4.6), with the drafted fixture `fixtures/frontmatter/property-links` (AI draft, observed in Obsidian 1.13.7); §5.11 records the fields of Verso's own on a canvas, that a `file` node is a path from the root, and that a save writes what the user did not change as it was read. No question closed |
| v0.24 | 2026-10-02 | The fixture `fixtures/frontmatter/property-links` **approved by the maintainer** in session ("Já aprovo agora"), before 0.3.0-beta.3; its draft mark removed. Nothing else changes. |
