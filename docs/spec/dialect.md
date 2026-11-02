# Verso dialect spec — v0.52

- Version: v0.52 · 2026-11-01
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
| `schemas` | list of the fenced `verso-schema` blocks, nested ones included, in document order (§4.8) | not asserted |
| `prose` | list of the note's runs of prose, in document order (§4.9) | not asserted |
| `reader` | the note as a UniVerso serves it to an account that may only read it — its projection, the lines of each secret callout removed (Q9; [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md) item 3) — as a text, byte for byte | not asserted |
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
| `blocks` | `id` (without `^`), `pos` (position of the `^`), `lines` (`[first, last]`, the lines of the block the id names; asserted when given — Q3, Q21) |
| `callouts` | `kind` (text between `[!` and `]`, as written), `title` (rest of the first line, without spaces at the ends; absent if empty), `fold` (`-`, `+`, or absent), `depth` (optional, asserted when given: how many callouts enclose it, itself included, 1 to 32 — Q5), `pos` |

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

There is no field for inline tags or link resolution: each one enters the
schema when the corresponding question closes, with a PR that updates this
section. The typed relation entered with Q10, as `property_links` (§4.7,
v0.23); per-block visibility with Q9, as `reader` (§4.1, v0.42): a secret
callout is listed in `callouts` as any callout is, and `reader` is what a
reader receives of the note.

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

### 4.8 Items of `schemas`

A type's schema: a fenced code block whose language is `verso-schema`,
YAML inside (section 6, Q11; [ADR 0052](../adr/0052-typed-note.md)). Only
a block at the top level of a note is read; one inside a list item or a
quote is reported as nested, and not read.

| Field | Meaning | Required |
|---|---|---|
| `type` | the name notes write in their own `type:`, as written | for a block read |
| `labels` | the type's name per interface language, a map as written (`{ pt-BR: PdM, en: NPC }`); absent asserts none | no |
| `layout` | the layout the schema names at its top level: `infobox` ([ADR 0086](../adr/0086-infobox-a-typed-notes-card.md) item 2); a value this version does not know is no layout and no error; absent asserts none | no |
| `properties` | the declared properties, in order, each with `key`, `kind` (`text`, `list`, `number`, `checkbox`, `date`, `datetime`, `link`, `image`) and `labels` (as above); absent asserts none | no |
| `error` | why a block at the top level types nothing: `yaml`, `not_a_mapping`, `no_type`, `label`, `properties`, `property` (no `key` or no `kind`), `unknown_kind`, `duplicate_key` | when it does |
| `nested` | `true` for a block inside a list item or a quote; absent asserts the top level | for a nested block |
| `pos` | position of the first character of the opening fence (4.4) | when the fixture tests position |

A block that is nested or that types nothing has no `type`, `labels` or
`properties`. Added on 2026-10-07 with the implementation of ADR 0052
(`docs/reference/typed-note-decision.md` §8, rows 1 and 2), with the drafted
fixtures `fixtures/schema/top-level` and `fixtures/schema/nested-and-invalid`,
approved on 2026-10-07.

Revised on 2026-10-14 with the implementation of
[ADR 0086](../adr/0086-infobox-a-typed-notes-card.md) (items 1, 2 and 5):
two kinds, `link` — a quoted wikilink or a list of them, the typed
relation of Q10 — and `image` — a quoted wikilink to a picture of the
folder, a path of the folder ending in a picture's extension, or an
`http(s)` address; and the top-level key `layout`, whose one value is
`infobox`. A value that does not fit its kind is shown as written and
marked (ADR 0052 point 6): a wikilink or a path to a note is not a
picture. The fixture `fixtures/schema/infobox` was approved by the
maintainer on 2026-10-14 (v0.41).

### 4.9 Items of `prose`

The runs of text the reading view shows as words — where a note's name
written plainly is an unlinked mention of it
([ADR 0089](../adr/0089-linking-unlinked-mentions.md) item 1;
`verso_dialect::prose`). Prose is a heading's text, a paragraph's, a
table's cells and the text inside inline HTML; it is not the frontmatter,
code (inline or fenced), a `%%comment%%`, a wikilink, an embed, a Markdown
link's label, math (inline or block), an HTML block, a `#tag` (the words
around it stay prose), nor an entity (`&amp;`), left out whole because its
bytes are not the text it stands for. Pieces of one run that touch are one
item.

| Field | Meaning | Required |
|---|---|---|
| `text` | the run as written in the source | yes |
| `table` | `true` for a run in a table's cell, where a link's `\|` would end the cell; absent asserts outside a table | for a run in a table |
| `pos` | position of the run's first character (4.4) | when the fixture tests position |

Added on 2026-10-14 by the maintainer's answer M6 (*"Sim, todas"*), with
the fixture `fixtures/prose/what-is-prose`, approved by the maintainer the
same day (v0.41).

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
  `aliases`: `[OPEN]`. *(2026-10-31: the maintainer keeps it open until a
  real case asks for it; still `[OPEN]`.)*

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
also counts as a link in the graph and in backlinks: `DECIDED` on 2026-10-21, yes, marked as an embed (section 9, Q2).

An embed of a sound file — `![[taverna.mp3]]`, or `![](sons/taverna.mp3)` by
Q20 — is **rendered as a player** in the reading view, in Live Preview and on
a board's card, as Obsidian renders an audio embed
([ADR 0116](../adr/0116-music-and-sound-at-the-table-heard-by-everyone.md),
amendment of 2026-11-01). Rendering only: the parser records it as any other
embed, and no fixture asserts how it is drawn.

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

What a `^id` names is the top-level section its line is in — a paragraph, a
heading, a table, a code block, a quote or a callout whole, whatever in the
quote holds the id — except in a list, where it is the innermost list item
its line is in, whole, with its nested items (Q21): the id may end the
item's first line, a later paragraph of the item, or stand alone under a
nested list or after a code block in the item, and it names that item; a
`^id` in a nested item names the nested item. A `^id` inside a code block
or an HTML block is never one (section 5.9). Alone on its line at the top
level, after a blank line, it names the block before it; with nothing
before it, it names nothing.

The stable block ID, with backlinks and presence in the graph, is a proposed
primitive ([ADR 0014](../adr/0014-primitives-catalog.md)). The **syntax** `^id`
is compatible and decided; what Verso does with it goes beyond Obsidian.

Every position is decided (section 9, Q3, Q4, Q21): the last word of a
paragraph or of a list item (2026-09-21, `fixtures/block/definition`,
`fixtures/block/list-item`); a `^id` alone on a line after a blank line,
which names the block before it, and the end of a heading's line, which names
the heading (2026-10-07, `fixtures/block/after-a-block`,
`fixtures/block/heading`); a `^id` inside a quote, which names the whole
quote, inside a list, which names the innermost item, and alone with nothing
before it, which names nothing (2026-10-07, `fixtures/block/in-quote`,
`fixtures/block/in-list`, `fixtures/block/alone-top`). An id is unique per
note; with two, the last names the block (`fixtures/block/duplicate`). Of
two `^id`s alone in a row, only the last names the block before them, as in
Obsidian (2026-10-09, `fixtures/block/two-alone`).
`lines` (section 4.3) says which block an id names.

The id is not shown when reading, and a `^id` alone on its line goes with
the block it names; the editor shows it, quiet. That is how Obsidian 1.14.4
draws it (observed on 2026-10-07: reading view and Live Preview); it is
how the id is drawn, not what it names. A `^id` that names nothing stays as
written in Verso's reading view; how Obsidian draws that line was not
observed.

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
expanded) and nesting: `DECIDED` (section 9, Q5; nesting on 2026-10-21).

A callout of kind `secret` is the game master's secret (section 9, Q9,
`DECIDED` on 2026-10-14, [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md)):
in the file, in Obsidian and in a folder of the computer it is a callout
like any other, its meaning unchanged; a UniVerso serves the note to an
account that may only read it as a projection without the block. *(Until
v0.38 this said a callout is not the mechanism, per-block visibility
having a syntax of its own, `[OPEN]`.)*

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

Code block indented by 4 spaces, embedded HTML and `%%comentário%%`: `DECIDED`
on 2026-10-21 (section 9, Q6).

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
receives and does a normalization-insensitive lookup): `DECIDED` on 2026-10-10 —
one name is one file everywhere, the server comparing names in NFC (section 9,
Q7). Case sensitivity: `DECIDED` on 2026-10-21 (section 9, Q8).

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
     `roughness`, `angle`, `strokeStyle`, `opacity`, `locked`, `groups`,
     and, for maps ([ADR 0090](../adr/0090-maps-on-the-board.md)), `map`,
     `pin`, `secret` (item 6);
   - an edge's own `verso`: `relation`, `line` (`curved` or `elbow`),
     `strokeWidth`, `roughness`, `startHead`, `endHead`, `bends`,
     `labelSize`, `labelFont`, `strokeStyle`, `opacity`, `locked`,
     `groups`.

   A `verso.version` above the one a build writes is a board of a later
   Verso: shown, never written.
6. Maps ([ADR 0090](../adr/0090-maps-on-the-board.md), `DECIDED` on
   2026-10-14). A map is a board: no `.map` file and no node type of
   Verso's own, so Obsidian opens it as a canvas with a picture and cards.
   - A file node of a picture marked `"verso": {"map": true}` is a map's
     picture. "Use as map" sets that, `"locked": true` and the node's place
     at the bottom of the order of nodes (the stacking order); "Stop using
     as map" takes the three off. A board may hold several.
   - A file node of a note marked `"verso": {"pin": true}` is a pin: the
     window draws it at one size on the screen at any zoom, at the middle
     of its box, and a click opens its note. The pins of a map are in its
     group (`verso.groups`), so moving the map moves them.
   - A node marked `"verso": {"secret": true}` is not served to those who
     may only read the board on a UniVerso (ADR 0087's rule, applied to a
     board): the reader is served the board without that node, the edges
     that touch it, and the drawn elements that lie under it, are bound to
     it or hold a group only secret nodes hold (a group that also holds a
     node that is not secret, such as the map a pin is grouped with, hides
     nothing). Any value of `secret` but `false` or `null` counts. A board
     with no secret node is served byte for byte; one that is not JSON and
     mentions a secret is served empty. Whoever holds the file, and
     Obsidian, sees the node: it is a guard against readers on a server,
     not encryption.
   - A large PNG is drawn from tiles of Verso's own, cut once and kept
     outside the folder; the file holds no tile.
7. A Markdown card on a board is a Markdown card ([ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md),
   decided by the maintainer on 2026-10-15): a `> [!secret]` callout inside
   the `text` of a `text` node is hidden from those who may only read, by
   the same projection as in a note (§5.8), at every exit that serves the
   board. A card whose text becomes empty stays, empty, with its place and
   its edges. A `.txt` file, and any file that is not Markdown, is not
   projected: it is served as it is.

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
`DECIDED` on 2026-10-21 (section 9, Q19).

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
The matching part of Q19 was `[OPEN]`; decided on 2026-10-21 (section 9, Q19).

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
embed — `DECIDED` on 2026-10-21 (section 9, Q20). The briefing does not list
that form; the decision is the maintainer's.

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
| Schema kinds `link` and `image`, and its layout | a schema's property of kind `link` (a quoted wikilink or a list of them) or `image` (a picture's wikilink, path or web address); `layout: infobox` at the schema's top level draws the note's properties as a card beside its text. Plain frontmatter: a note opened in Obsidian shows its properties as Obsidian does | `DECIDED` on 2026-10-14 ([ADR 0086](../adr/0086-infobox-a-typed-notes-card.md)) |
| Per-block visibility | game master's secret: a callout of kind `secret` (`> [!secret]`), a callout in the file; a UniVerso serves readers the note without it | `DECIDED` on 2026-10-14 (Q9, [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md)) |
| Dice and random tables | the Obsidian Dice Roller plugin's inline form, `` `dice: 1d20+3` `` or `` `dice: [[Note#^id]]` ``: inline code to the dialect (§5.9, no link in it), drawn by the window as a die; a table or a list with an `^id` is a random table, and a first column whose header is a die (`d100`) holds each row's range | `DECIDED` on 2026-10-14 ([ADR 0088](../adr/0088-dice-and-random-tables.md); fixture `code/dice-inline`, an AI draft) |
| Sticker and color | `sticker:` in make.md's forms — `emoji//<hex>`, `lucide//<name>`, `ui//<name>` — written by Verso as make.md writes them, or an emoji written as itself, read; another value is no sticker. `color:` a hex, as Verso writes it, or a CSS color, read. In the frontmatter of a note or a folder note | `DECIDED` on 2026-10-02 ([ADR 0060](../adr/0060-makemd-organizing-features.md)) |
| Cover banner | `banner:` (a path of the folder or a URL) and `banner_y:` (the vertical position, a percentage from 0 to 100 written as text, `"42"` — as make.md's reposition writes it, read in its source and observed through its property writer, 2026-10-02) in the frontmatter of a note or a folder note | `DECIDED` on 2026-10-02 ([ADR 0060](../adr/0060-makemd-organizing-features.md)) |
| Manual folder order | `order:` in the folder note's frontmatter, a list of relative child names defining sort order; no `order:`, the alphabetical one; with the tree set to alphabetical, every `order:` is kept and ignored. The root's, in a note at the root named after the open folder (its place: `PROPOSED`, the author's, to confirm) | `DECIDED` on 2026-10-02 ([ADR 0060](../adr/0060-makemd-organizing-features.md)) |
| Folder pins | `pinned:` in the folder note's frontmatter, a list of quoted wikilinks forming a `pinned` typed relation | `DECIDED` on 2026-10-02 ([ADR 0060](../adr/0060-makemd-organizing-features.md)) |
| Folder item defaults | `items_sticker:`, `items_color:`, and `items_template:` in the folder note's frontmatter, inherited by newly created items in that folder | `DECIDED` on 2026-10-02 ([ADR 0060](../adr/0060-makemd-organizing-features.md)) |
| Statblock card | a fenced code block, ```` ```statblock ````, holding YAML with Fantasy Statblocks' key names; with the Statblocks feature on ([ADR 0103](../adr/0103-feature-presets-and-capability-flags.md)) Verso draws a card; Obsidian shows a code block, or the Fantasy Statblocks plugin's card when it is installed | `DECIDED` on 2026-10-20 ([ADR 0099](../adr/0099-visual-markdown-statblocks-and-cards.md) item 1; `monster:` and `extends:` are `[PROPOSED]`) |
| Oracle callout | a callout of kind `oracle` (`> [!oracle] Question`), the answer lines in its body; with the Oracles feature on Verso adds the oracle's buttons to it; Obsidian draws a callout | `DECIDED` on 2026-10-20 ([ADR 0102](../adr/0102-creative-oracles-and-improvisation.md) item 4) |
| Roll block | a fenced code block, ```` ```roll ````, holding a roll of the Table ([ADR 0107](../adr/0107-the-table-a-shared-roll-and-chat-log.md)): an optional header line (`quem: Ana · quando: 2026-10-22 21:40 · onde: [[Sessão 12]]`), the roll (`1d20+5 → [16] + 5 = 21`), and for a random table or an oracle the lines `tabela:` / `linha:` or `oráculo:` / `resposta:`; Verso draws a fixed result card and never rolls it again; Obsidian shows a code block | `DECIDED` on 2026-10-22 (the maintainer's option A, [ADR 0107](../adr/0107-the-table-a-shared-roll-and-chat-log.md) "As built", roll block) |

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

Example of organizing frontmatter on a note:

```markdown
---
sticker: emoji//1f680
color: "#e8590c"
banner: assets/diagrama.svg
banner_y: "42"
---
```

And on a folder note (`Projetos/Projetos.md`):

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

Example of a roll block, and its grammar. Everything between the fences is
plain text a person can write by hand; the keys are written in the language of
the window and read in either (`quem`/`who`, `quando`/`when`, `onde`/`where`,
`tabela`/`table`, `linha`/`row`, `oráculo`/`oracle`, `resposta`/`answer`,
`rolagem`/`draw`, `dados`/`dice`):

````markdown
```roll
quem: Ana · quando: 2026-10-22 21:40 · onde: [[Sessão 12]]
4d6dl1 → [6, 5, 3, ~2] + 2 = 16
dados: #1d9e75 #f4f7f5 #0c3527
```
````

- Header: `key: value` pairs separated by ` · `, each optional; `onde` is a
  wikilink to the note where the roll was made. The time is the local time of
  the person who wrote it, as written.
- The roll line: the notation, an arrow (`→`, or `->`), the dice and the
  total (`= 16`). A group `[...]` is one term of the notation; a face with `~`
  was dropped (kept/drop and keep/drop modifiers); a group is joined to the
  next by ` + ` or ` - `, a leading `-` makes a term negative; a bare number is
  the modifier. Fudge faces are written `+`, `-` and `0`.
- A random table's roll adds `tabela: [[Note#^id]]` and `linha: <the row on
  one line>`. An oracle draw has no roll line: `oráculo: pergunta`
  (`faísca`, `tabela`), `tabela: <name>` for an oracle table, `resposta: <text>`
  and, except for a spark, `rolagem: <the d100 face or place>`.
- `dados: <body> <number> <outline>`: three `#rrggbb` colours, the roller's
  dice; omitted when the roller uses the app's own look. A texture or a
  material is not written.
- Reading is tolerant: a line that is none of these is kept and written back
  last; a block with no roll line and no oracle line is not a roll block and is
  shown as the plain code it is. Opening a note never rewrites a block
  ([ADR 0012](../adr/0012-files-are-source-of-truth.md)); the card is drawn in
  Reading and Live Preview, the text is what Source shows.

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
resolution, inline tags, search — is in section 9, not here. Periodic notes are
[ADR 0093](../adr/0093-periodic-notes.md)'s, which accepted the behaviour.

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
| schema (a `verso-schema` block) | 4.8, 6 | drafted on 2026-10-07 with ADR 0052's implementation, approved the same day; `schema/infobox` drafted on 2026-10-14 with ADR 0086's, approved the same day |
| per-block visibility (a `[!secret]` callout) | 4.1, 5.8, 6 | `callout/secret` drafted on 2026-10-14 with ADR 0087's implementation, approved by the maintainer on 2026-10-15 |

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

- **Q9. Per-block visibility syntax (game master's secret).** `DECIDED` on
  2026-10-14.
  Decide before sharing and export (§17 item 8). It has to survive opening the
  file in Obsidian without leaking the secret and without breaking the text. The
  player view and the mapping to journal permission in Foundry depend on it
  ([ADR 0036](../adr/0036-tabletop-rpg-support.md)).

  **Decided on 2026-10-14 by the maintainer**, accepting
  [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md) and its item
  8 (*"Sim, todas"*, every recommendation): per-block visibility is a
  callout of kind `secret` — `> [!secret]`, with a title, `+` or `-` as any
  callout, the kind compared lower-cased as Q5 reads kinds, no other
  keyword. In the file it stays a callout: Obsidian, another editor and a
  folder of the computer show it to whoever holds the file, and its meaning
  is unchanged (ADR 0030). A UniVerso serves an account that may only read
  the note a **projection** of it, the lines of each secret callout removed
  and nothing else touched, everywhere a reader reads — the text, sync's
  bytes, search, links, tags, tasks and counts, the MCP; an account that may
  write it gets the whole text. "Without leaking the secret" reads as **a
  reader never holds the bytes**. A `[!secret]` inside another callout is
  removed at any depth the reading view draws, with what it holds; a block
  whose end cannot be placed hides through the end of its blockquote (it
  fails closed). Q5's nesting stays `[OPEN]` for the parser that feeds the
  index *(as written on 2026-10-14; decided on 2026-10-21 under Q5)*. **No fixture yet**: the fixture of this question comes with the
  PR that builds ADR 0087, drafted by the AI and approved by the
  maintainer there (ADR 0031); no `fixtures/**` file changed with this
  answer. *(v0.42: that PR drafted `fixtures/callout/secret`, whose
  `reader` key asserts the projection — a block at the top level, one
  inside another callout with the kind in capitals, one in a list item, a
  `[!secrets]` kept — for the maintainer's approval; v0.45: approved on
  2026-10-15.)*

  **Confirmed on 2026-10-31 by the maintainer.** The list of 2026-10-31 put
  "per-block visibility resolved by `[!secret]`" to him again as a point to
  accept; he answered *"O restante ta aprovado"* (the rest is approved).
  Nothing changes: the decision above stands as it is. No fixture changed.
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
     It is read under the frontmatter's limits (Q17). On 2026-10-14
     [ADR 0086](../adr/0086-infobox-a-typed-notes-card.md) added the kinds
     `link` and `image` and a top-level `layout` (§4.8).
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
- **Q2. Does an embed count as a link in the graph and in backlinks?** `DECIDED`
  on 2026-10-21 (section 5.6)

  **Provisional fact from `verso-index`, recorded on 2026-09-22, not an answer
  to this question.** An embed counts as a link **and** as a backlink: it is
  stored with its kind, resolves by the same rule as a link, and appears in
  the backlinks of its target, marked as an embed so that a caller can tell
  the two apart. Observed in Obsidian 1.13.7 through its CLI on 2026-09-22
  (ADR 0009; the run is in `docs/reference/index-decision.md` §4.1): the five
  links `resolvedLinks` counts from the sandbox note to `Alvo.md` include the
  embed `![[Alvo]]`. The maintainer decides; this line only records what the
  code does in the meantime.

  **Decided on 2026-10-21 by the maintainer** (decisions questionnaire of
  2026-10-20, option A): the provisional fact above is ratified — an embed is
  a link and a backlink, marked as an embed. Already observed in Obsidian
  1.13.7; nothing to build.

- **Q3. Admissible position of the `^id`.** `DECIDED`: for the end of a
  paragraph and of a list item on 2026-09-21; for a `^id` alone after a
  top-level block and at the end of a heading on 2026-10-07; for a `^id`
  inside a list item or a quote, and for one alone with nothing before it,
  on 2026-10-07 as well, with the fixtures `fixtures/block/in-list`,
  `fixtures/block/in-quote` and `fixtures/block/alone-top` as the answer.
  Closed for those two on 2026-09-21 by the maintainer, with the fixtures
  `fixtures/block/definition` and `fixtures/block/list-item` as the answer
  (ADR 0031): a `^id` as the last word of a paragraph and a `^id` as the last
  word of a list item define the block (section 5.7).

  **Decided on 2026-10-07 by the maintainer, for the rest, as Obsidian
  does** (observed through the Obsidian CLI the same day, public API only,
  ADR 0009), in two steps. First: a `^id` alone on a line after a blank line
  names the block before it — a paragraph, a table, a code block, a quote —
  and is no block of its own; a `^id` at the end of a heading's line names
  the heading; a `^id` at the end of a list item names the item with its
  nested items (Q21). The fixtures `fixtures/block/after-a-block` and
  `fixtures/block/heading` are the answer, with `lines` (section 4.3) saying
  which block. `pos` stays the `^`, as section 4.3 asks, whichever block the
  id names. Then, after a second observation of 28 inputs
  (`docs/reference/obsidian-blocks-2026-10-07.md`), with the three fixtures
  below approved in session ("Aprovado"), the rule that holds the first step
  and the rest: the block a `^id` names is the top-level section its line is
  in, except in a list, where it is the innermost list item — a heading
  inside a quote or an item names the quote or the item, not the heading: (1) inside a quote or a
  callout — the id at the end of a quoted line, alone after a blank quoted
  line, in a nested quote, in a list inside the quote — the whole top-level
  quote (`fixtures/block/in-quote`); (2) inside a list — the id at the end
  of an item's first line, loose or tight, at the end of a later paragraph
  of the item, after a code block or a quote first in the item, or alone
  under a nested list — the innermost item its line is in, whole, the
  `^id` line included when it is inside the item; Obsidian's cache lists
  the nested items apart, and Q21 (decided) puts them in the block
  (`fixtures/block/in-list`); (3) alone at the top level with nothing before
  it, no block at all, and after a paragraph that is no id (`^foo.bar`),
  that paragraph (`fixtures/block/alone-top`).

  `DECIDED` on 2026-10-09 by the maintainer ("Recomendado"): **of two
  `^id`s alone in a row** (`Texto.`, a blank line, `^a`, a blank line,
  `^b`), **only the last names the block before them**, as in Obsidian,
  whose cache keeps only `b` and leaves `[[nota#^a]]` unresolved; `^a` is
  then an id that names nothing and stays as written
  (`fixtures/block/two-alone`). Verso had reported both, an extension that
  ADR 0030 does not allow. Not observed either, and
  recorded as what the parser does: a `^id` alone right after the
  frontmatter, or after a footnote definition, names nothing and the
  paragraph before the definition respectively (footnotes are not enabled
  in the parser).

  **Confirmed on 2026-10-31 by the maintainer**: the four provisional facts
  of the implementation recorded in v0.30 — a loose item named whole by its
  first paragraph, "the block before it" at the same depth, a non-id `^word`
  as a plain paragraph, and the `^id` line inside the item it names — are
  accepted as they are (*"O restante ta aprovado"*, the rest is approved, to
  the list of 2026-10-31). They had already been replaced by the observation
  of v0.31 and the fixtures approved in v0.32, and they agree with the rule
  above, so this confirms what is decided and changes nothing. No fixture
  changed.
- **Q4. Uniqueness scope of the `^id`.** `DECIDED` on 2026-10-07 by the
  maintainer.
  Unique per note: a link names the note and the id (`[[nota#^id]]`). With
  the same id twice in one note, **the last one names the block**, as Obsidian
  does (observed through the Obsidian CLI on 2026-10-07: its cache keeps the
  second), and Verso says the id is repeated. The parser reports both, in
  document order (`fixtures/block/duplicate`), and so do the index and the
  MCP's `read_note`, whose answer schema states the rule on `first_line`
  ("with the same id twice in a note, the last names the block"); the
  window applies it — an embed, a link to the block — and a client of the
  MCP reads it there.
- **Q5. Callout coverage.** `DECIDED` for the reading view's kinds, fold and
  title on 2026-09-23; `DECIDED` for nesting on 2026-10-21; **closed in full
  on 2026-10-21** (fixture approved, below).
  Recognized kinds, `-`/`+`, nesting (section 5.8).

  **Decided on 2026-09-23 by the maintainer, for the reading view**
  (`docs/review/phase-2.md` §6, item 4; the answer: *"a e b ok"*), as the code does it. The reading view shows as a callout a blockquote
  whose first line opens with `[!kind]`, `[!kind]+` or `[!kind]-`, for any
  kind, lower-cased; `+` and `-` make it foldable from its title, and `-`
  starts it closed, as Obsidian's documentation shows — since `7679916`:
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

  **Nesting decided on 2026-10-21 by the maintainer** (option A): the
  provisional fact above is ratified — the reading view draws a callout inside
  a callout, up to 32 deep — **and the parser that feeds the index learns the
  nesting**, with the same limit of 32, so index and reading view agree, and a
  `[!secret]` inside another callout is recognized there too (section 5.8,
  Q9). The fixture `callout/nested` is drafted by the AI and approved by the
  maintainer in the separate code PR that builds this; no `fixtures/**` file
  changed with this answer. Per invariant 17, a question that needs a fixture
  or an observation of Obsidian closes in full only in the PR that adds it,
  with this section updated in the same PR.

  *(2026-10-21: the parser part is built on branch `feat/nested-callouts-index`
  — `Callout.depth`, the limit of 32, `fixtures/callout/nested` drafted for
  approval, `depth` added to §4.3.)*

  **Closed in full on 2026-10-21 by the maintainer** (question Q5.fx of the
  decisions list of 2026-10-21, option A, "Aprovar como está"): the fixture
  `fixtures/callout/nested` is **approved as drafted**, and its draft mark is
  removed. It asserts, case by case, the nesting to 32 levels in the index, the
  `depth` field (§4.3), the `+`/`-` folds kept, a `[!secret]` inside another
  callout listed as a level-2 callout (what a reader sees stays governed by
  `callout/secret`), and the 33rd level a plain blockquote. A plain blockquote
  inside a callout does not count as a level, and a callout inside that
  blockquote counts as nested: this is what the reading view does, and it is
  recorded here as the rule (no earlier sentence of the spec said it).

  *Correction, 2026-10-21 (review of the afternoon batch):* the sentence above
  (a plain blockquote inside a callout is not a level; a callout inside it
  counts as nested) is **the build's behaviour, awaiting the maintainer, not a
  decision**: his answer approved the fixture, and the fixture's own note left
  the case out on purpose because no sentence of the spec said it. Question
  Q5-bis of the decisions list of the afternoon asks him to confirm it or
  decide otherwise; until then it is a provisional fact like the one at the
  top of this entry.

  *Answered 2026-10-22 (Q5-bis of the decisions list of the afternoon of
  2026-10-21, option A):* the maintainer accepted the rule as the reading
  already follows it. **A plain blockquote (`>`) inside a callout is not a
  nesting level; a callout inside that blockquote is nested.** It is now a
  decision, not a provisional fact, and the correction above is answered.
  Fixture `callout/nested` is not touched.

  **Confirmed on 2026-10-31 by the maintainer**: the list of 2026-10-31 put
  the limit of 32 levels of a callout inside a callout to him again as a
  point to accept — it read the sentences above that say nesting "stays
  `[OPEN]`", which are history — and he answered *"O restante ta aprovado"*
  (the rest is approved). The decision of 2026-10-21 stands; no fixture
  changed.

- **Q6. Contexts in which `[[...]]` is not a link, besides backtick and fence.**
  `DECIDED` on 2026-10-21 for the index and for embedded HTML; the reading
  view's comments `DECIDED` on 2026-09-23. Block indented by 4 spaces, embedded HTML, `%%comentário%%`, a link
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

  **Decided on 2026-10-21 by the maintainer** (option A): the provisional
  state is ratified — the index counts a `[[x]]` inside a `%%comment%%`,
  embedded HTML or a block indented by 4 spaces as a link (the parser does not
  tell them apart), and the reading view's allowlist stays as it is,
  `<iframe>`, `<video>` and `<audio>` still dropped: a note of a shared folder
  is untrusted input ([ADR 0045](../adr/0045-server-and-mcp-security.md)), so
  there is no new risk. Making the index ignore `[[ ]]` in comments and HTML
  (option B), or allowing `<iframe>` with restrictions (option C), are
  improvements for later, with an observation of Obsidian and a security
  review (`docs/reference/embedded-media-decision.md`). Per invariant 17, a
  question that needs a fixture or an observation of Obsidian closes in full
  only in the PR that adds it, with this section updated in the same PR; none
  is drafted yet.

  **2026-10-31, the maintainer:** embedded HTML **stays `[OPEN]`** beyond the
  decision above — options B (the index ignores `[[ ]]` in comments and HTML)
  and C (`<iframe>` allowed with restrictions) — until a real case asks for it
  (the list of 2026-10-31, answered *"O restante ta aprovado"*). Still open.

- **Q7. Unicode normalization in name comparison.** `DECIDED` on 2026-10-10.
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
  only records what the code does in the meantime. *(Kept as the history that
  led to the decision below.)*

  **Decided on 2026-10-10 by the maintainer**, in session, taking the
  recommended answer: *"Gostei das recomendações, pode seguir"*. The question
  came back from the sync campaign of 2026-10-10, its finding F20: two devices
  on Windows and Linux kept a name in both forms, and one of them never
  uploaded its file. **One name is one file everywhere**: the server compares
  names in NFC; each device keeps the spelling its own file system gave the
  name; a file changed on both sides under the two forms is a conflict copy
  ([ADR 0079](../adr/0079-sync-a-local-folder-with-a-server.md) item 8). No
  fixture: the maintainer did not ask for one.
- **Q8. Case sensitivity in name resolution.** `DECIDED` on 2026-10-21.
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

  **The creation side, decided by the maintainer on 2026-10-12** (*"Todos
  aprovados"*), not the resolution, which stays `[OPEN]`: a new name that
  differs only in case from an entry its folder already lists is refused
  when Verso makes or renames it, on every OS and on the server; an entry
  that exists is never refused ([ADR 0070](../adr/0070-what-travels-with-the-folder.md)
  item 3, revised 2026-10-12).

  **Decided on 2026-10-21 by the maintainer** (option A): the provisional fact
  above is ratified — resolution does not distinguish case, on every platform,
  as Obsidian 1.13.7; on a tie the exact name wins, then the first by the
  order of Q12. Two entries that differ only in case in a folder on a case-
  sensitive disk are ambiguous and resolved by that tie-break. The tie-break
  is the one Q12 already uses; it is to be confirmed in the PR that builds
  this. Per invariant 17, a question that needs a fixture or an observation of
  Obsidian closes in full only in the PR that adds it, with this section
  updated in the same PR; none is drafted yet.

  **Confirmed on 2026-10-31 by the maintainer**: renaming a file only in case
  **stays as it is** (*"O restante ta aprovado"*, to the list of 2026-10-31).
  What that list called open was already decided: a file renamed to its own
  name in another case is allowed, a new name differing only in case from
  another entry of its folder is refused
  ([ADR 0070](../adr/0070-what-travels-with-the-folder.md) item 3, revised
  2026-10-12), and resolution ignores case (2026-10-21, above). What is still
  open around it is elsewhere and unchanged: the tie-break, to be confirmed
  in the PR that builds it (above), and two names differing only in case on
  Linux, after V1 ([ADR 0071](../adr/0071-linux-port.md), 0071.case). No
  fixture changed.

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
  it, at any depth, since commit `4712f85`, following probes of Obsidian
  1.13.7 that were recorded, run again, as the third observation of
  `docs/reference/index-decision.md` §4.1. Asked "sob a pasta, sim ou não?",
  with an example and the recommendation to follow Obsidian, the maintainer
  answered: *"boa, gosto da sua ideia, pode seguir"*. Point 3 now says
  "under", and nothing in the code departs from points 1 to 5.

  **Embeds of files that are not notes, since `8a284f8`, recorded on
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
  Since `fd6bcfa` the index and the reading view take the rule from one
  function of the dialect, `verso_dialect::body_tags`, which reads the parser's
  events and skips the frontmatter, code spans and code blocks (fenced or
  indented), raw HTML, link destinations and labels, image alt text, math and
  `%%` comments; before it, the index scanned raw lines and listed false tags. The
  reading view shows such a tag as a link that searches it.
- **Q14. Link to a file that does not exist.** `DECIDED` on 2026-10-21.
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
  backlinks, and the code does that since commit `4712f85`.)* Nothing was observed in Obsidian for this
  case; the code chose it because the alternative counts every same-note
  heading link as a missing file and puts an empty target at the head of the
  unresolved list of any folder that uses them. The maintainer decides; this
  line only records what the code does in the meantime.

  **Decided on 2026-10-21 by the maintainer** (options A and B both marked):
  (A) the provisional facts above are ratified — a target no note answers to
  enters the index as pending, with its text as written and a count, and is
  never a backlink of anything; `[[#Heading]]` resolves to the note itself;
  and (B) **unresolved links are also shown as nodes in the graph**, as an
  option, as Obsidian's graph has one (to be confirmed in Obsidian's public
  documentation before it is built). The graph option changes nothing in the
  index. Per invariant 17, a question that needs a fixture or an observation
  of Obsidian closes in full only in the PR that adds it, with this section
  updated in the same PR; none is drafted yet.

  *2026-10-21: (B) is built on branch `feat/graph-unresolved` — the graph's
  filter "Existing files only", on by default, off draws each unresolved
  target as a hollow, dashed node linked from the notes that name it
  (Obsidian's public "Graph view" help documents the same filter).*

  **Decided on 2026-10-21 by the maintainer** (question G.1 of the decisions
  list of 2026-10-21). (a) Option A: in a shared folder of a UniVerso the
  filter "Existing files only" off shows nothing and says why, since the name
  of a note that does not exist would tell someone who sees only part of the
  folder whether that note exists outside the share
  ([ADR 0081](../adr/0081-sharing-between-people-on-one-universo.md) item 11).
  (b) Option **B**: clicking an unresolved node **asks before creating** the
  note (the build created it at once, as a click on a link to a note that does
  not exist does; the maintainer chose to ask). To be built.

- **Q15. Markdown extensions outside the base.** `DECIDED` for the reading view
  on 2026-09-23; `DECIDED` for the parser that feeds the index on 2026-10-21.
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
  settles what the window shows, not this question. Since `f0f94ac` the reading
  view finds all of these on the parser's events, not in its own HTML: code,
  link labels and alt text are never rewritten, and a raw `</blockquote>` can no
  longer open or close a callout. Because the reader enables options the parser
  does not, `$[[x]]$` is a link to the index and math to the reader — a
  disagreement recorded, not resolved. Whether the parser that feeds the index
  enables these extensions, which would settle it, stays `[OPEN]`.

  **Decided on 2026-10-21 by the maintainer** (option A): **the parser that
  feeds the index enables the six** — tables, footnotes, task lists, math,
  highlight and strikethrough — so index and reading view read the same
  document, which closes the `$[[x]]$` divergence recorded above. It needs the
  round-trip property test and fixtures, and an observation of what Obsidian
  does with `$[[x]]$`. Per invariant 17, a question that needs a fixture or an
  observation of Obsidian closes in full only in the PR that adds it, with
  this section updated in the same PR; none is drafted yet.

- **Q16. Non-Markdown files in the folder.** `DECIDED` on 2026-10-21 for the rest;
  `.canvas` below.
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
  embed (since `8a284f8`; before, by file name alone, whatever note held it).
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

  **Decided on 2026-10-21 by the maintainer** (option A): **images, PDFs and
  other files become link targets in the index**, by their full name with the
  extension, as `.canvas` already is; this closes the difference with point 5
  of Q12 (an embed resolves by the same rule), and "unused files" and the
  backlinks of an image start to work. Obsidian's behaviour for the backlinks
  of attachments is to be confirmed by observation (ADR 0009) before it is
  built. Per invariant 17, a question that needs a fixture or an observation
  of Obsidian closes in full only in the PR that adds it, with this section
  updated in the same PR; none is drafted yet.

- **Q17. Size limit and behavior with a malformed file.** `DECIDED` on 2026-10-21 for the rest (limits in the core); the
  frontmatter part is `DECIDED` below.
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

  **The rest decided on 2026-10-21 by the maintainer** (option A): the limits
  live **in the core**, not in the parser — above a ceiling of size a note
  opens as plain text and is not indexed, and the index has a timeout per file
  — and the user sees a notice. The exact values are left to a short ADR, with
  a fixture of the behaviour; the proposal there is 10 MB and 5 s, to be
  confirmed with the baseline of [ADR 0039](../adr/0039-performance-targets.md). The exponential input recorded above stays [ADR
  0037](../adr/0037-base-parser.md)'s. Per invariant 17, a question that needs
  a fixture or an observation of Obsidian closes in full only in the PR that
  adds it, with this section updated in the same PR; none is drafted yet.

  **2026-10-31, the maintainer: one ceiling decided, the rest still open.**
  To the list of 2026-10-31 he answered that the limits **stay `[OPEN]`**
  until a real case (*"O restante ta aprovado"*), and, in the same list, B7
  = a: **a note above 16 MiB stays out of the index** — it is listed and
  syncs as a file, it is not read, parsed or indexed (built on the night of
  2026-10-29, `INDEX_MOST` in `verso-core`, after a 60 MB note took the 1 GB
  server down) — **and the big note shows a notice** that it is not indexed
  (`[DECIDED 2026-10-31]`, the notice to be built). That answer fixes the
  index's size ceiling at 16 MiB in place of the 10 MB proposed above. Still
  `[OPEN]`: opening above a ceiling as plain text, the per-file timeout of the
  index, a line's length, and the short ADR with their values. A fixture of
  the ceiling, if one is wanted, is drafted and approved separately; none is.
  **As built (2026-10-31), the notice:** the window draws it above the note's
  text (`pastIndexCeiling` in `app/ui/src/indexLimit.ts`, flag `pastIndex`),
  from the text the core read whole: its UTF-8 length against the same 16 MiB
  as `INDEX_MOST`. No contract field carries it, so there is no contract
  change; a file opened without its folder has no index and shows none.

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
- **Q19. Heading matching.** `DECIDED` on 2026-10-21 for the matching, the setext
  part `DECIDED` on 2026-09-29 (section 5.12)
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

  **The matching decided on 2026-10-21 by the maintainer** (option A): observe
  Obsidian (the CLI, `metadataCache`) in 8 to 10 cases — case, punctuation,
  emoji, inline formatting such as `## *Porão*`, duplicate headings, the
  nested path `[[nota#Cap 1#Seção]]` — and **adopt what is observed**, one
  fixture per case. Per invariant 17, a question that needs a fixture or an
  observation of Obsidian closes in full only in the PR that adds it, with
  this section updated in the same PR; none is drafted yet.

- **Q20. Markdown links to a local file.** `DECIDED` on 2026-10-21 (section 5.13)
  Whether they count as a link (proposal: yes); `<...>` with spaces; relative
  path `../`; what separates a local link from an external URL; `![](img.png)`
  as an embed; URL-encoding.

  **Decided on 2026-10-21 by the maintainer** (option A): **yes** — a Markdown
  link to a local file is a link and a backlink, with `%20` decoded and
  relative paths resolved. One observation of Obsidian per form (`<...>` with
  spaces, `../`, `![](img.png)` as an embed) before the details are fixed; the
  proposal of section 5.13 stands until then. Per invariant 17, a question
  that needs a fixture or an observation of Obsidian closes in full only in
  the PR that adds it, with this section updated in the same PR; none is
  drafted yet.

- **Q21. What a "block" is.** `DECIDED` on 2026-10-07 by the maintainer.
  The editor's unit ([ADR 0061](../adr/0061-blocks-in-edit-mode.md) D5): a
  node of the syntax tree, never a line — a paragraph, a heading, a list item
  with its nested items, a whole quote or callout, a whole code block, a
  whole table, a divider. A table cell is no block. What a `^id` names (Q3)
  and what an embed `![[nota#^id]]` shows are blocks in this sense.
- **Q22. Charset of the `^id` and form of the tags.** `DECIDED` for the tags'
  charset and case on 2026-09-23; `DECIDED` for the rest on 2026-10-21.
  Obsidian's public documentation restricts `^id` to letters, numbers and
  hyphen; what happens with an invalid `^id`. For tags (Q13): charset, nesting
  `#a/b`, case sensitivity, `#` prefix in frontmatter `tags`.

  **Decided on 2026-09-23 by the maintainer, for the tags** (`docs/review/phase-2.md` §6, item 4; the answer: *"a e b ok"*): their
  charset and case folding are the ones recorded under Q13. The `^id` part,
  what `#a/b` means as a hierarchy, and a `#` prefix in the frontmatter's
  `tags` stay `[OPEN]`.

  **The rest decided on 2026-10-21 by the maintainer** (all three option A).
  (a) **The `^id`**: only letters, digits and hyphen, as Obsidian's public
  documentation says; anything else stays plain text; whether accented letters
  count is to be observed. (b) **Tags**: `#a` finds `#a/b`, as Obsidian's tag
  pane does with nested tags. (c) **`tags` in the frontmatter**: `[#ideia]`
  and `[ideia]` are the same tag, to be confirmed by observation. Per
  invariant 17, a question that needs a fixture or an observation of Obsidian
  closes in full only in the PR that adds it, with this section updated in the
  same PR; none is drafted yet.

  **Built on branch `feat/dialect-q22-q24`, 2026-10-21 (fixtures awaiting the
  maintainer's approval).** Observed on Obsidian 1.13.7 through its CLI. (a)
  Only `abc-1` of `^abc-1`, `^ação`, `^a_b`, `^é1`, `^ab.c` is a block in the
  metadata cache: accented letters, `_` and `.` do not count, which is what
  the parser already did; fixture `block/id-chars`. (b) The tag pane counts
  `#a` 2 for a note with `#a` and another with `#a/b`; the index's tag list now
  counts a nested tag under each tag above it (the window's `tag:` search and
  `notes_where` already matched nested tags); test in `verso-index`. (c) A
  quoted `"#ideia"` and `ideia` list one tag `#ideia`; an unquoted
  `tags: [#ideia]` is invalid YAML to Obsidian, which then reads no
  frontmatter for that note (Verso reports the invalid block; not changed).
  Fixture `frontmatter/tags-hash`. The fixture schema has no key for a note's
  tags (§4.6), so the tag rules are tests in `crates/verso-dialect/tests/tags.rs`
  and `crates/verso-index/tests/search.rs`.

  **Closed in full on 2026-10-21 by the maintainer** (question DL.3 of the
  decisions list of 2026-10-21, option A, "Aprovar todas"): the fixtures
  `block/id-chars` and `frontmatter/tags-hash` are **approved as drafted** and
  their draft marks removed. Q22 is closed: (a) `^id` charset, (b) nested tags
  counted under the tag above, (c) `#ideia` and `ideia` one tag.
  *Recorded 2026-10-21 (review of the afternoon batch):* (b) **is** decided: it
  is the maintainer's answer Q22b = A of the decisions list of 2026-10-20
  ("Sim, `#a` acha `#a/b`", as Obsidian's tag pane does, per the public
  documentation of nested tags); no fixture covers it.

- **Q23. Combined forms and wikilink escapes.** `DECIDED` on 2026-10-21.
  `[[nota#seção|alias]]`, `[[nota#^bloco|alias]]`, `[[#seção]]` and `[[#^bloco]]`
  (same file — does it count as a backlink to itself?), `[[pasta/nota]]`,
  `[[nota.md]]`, `[[nota\|alias]]` in a table, `\[[não é link]]`, `[[ nota ]]`
  with spaces, `![[img.png|300]]` (size, not alias), `[[nota|alias|extra]]`,
  wikilink inside a Markdown link or an image.

  **Decided on 2026-10-21 by the maintainer** (option A): observe each
  combined form in Obsidian — `[[nota\|alias]]` in a table, `\[[not a link]]`,
  `[[ nota ]]` with spaces, `![[img.png|300]]`, `[[nota|a|b]]`, a wikilink
  inside a Markdown link or an image — one fixture per case, and **adopt what
  is observed**. Per invariant 17, a question that needs a fixture or an
  observation of Obsidian closes in full only in the PR that adds it, with
  this section updated in the same PR; none is drafted yet.

- **Q24. Frontmatter boundary and dialect.** `DECIDED` on 2026-10-21 (section 5.1);
  the window's part `DECIDED` on 2026-09-23.
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

  **The rest decided on 2026-10-21 by the maintainer** (all four option A).
  (a) **BOM and `...`**: a BOM before the `---` is accepted, and the
  frontmatter closes with `---` or `...`; the file is never rewritten
  (invariant 7). (b) **YAML**: version 1.2 (`yes` is text) and `tags: 2024` is
  the tag "2024"; what Obsidian does with `tags: 2024` is to be observed, and
  the answer adjusts if it differs. (c) **Wikilinks inside values** count as a
  link and a backlink, in the index and the graph — consistent with the link
  part decided on 2026-09-30. (d) **Mixed line endings**: the file keeps
  opening read-only, and a "Convert line endings…" command offers the
  conversion with a visible diff, by the user's action (invariants 7 and 8).
  Per invariant 17, a question that needs a fixture or an observation of
  Obsidian closes in full only in the PR that adds it, with this section
  updated in the same PR; none is drafted yet.

  **Adjusted by the build, 2026-10-21, awaiting the maintainer** (under the
  decision's own clause "the answer adjusts if it differs"; the maintainer
  confirms or reverses it through the fixtures and the questions DL.1 and
  DL.2 of the decisions list of 2026-10-21): (a) the closing `...` was **not**
  built, because Obsidian does not accept it (observed, below) — question
  DL.1. (b) `tags: 2024` is **not** the tag "2024": Obsidian reads a number
  in `tags` as no tag (observed, below), and the build follows Obsidian —
  fixture `frontmatter/tags-number`, a draft, and question DL.2. The text
  above is the decision as recorded; this line records that the build does
  not do it as written.

  **Built on branch `feat/dialect-q22-q24`, 2026-10-21 (fixtures awaiting the
  maintainer's approval).** Observed on Obsidian 1.13.7 through its CLI. (a)
  A BOM before the `---` is accepted (Obsidian's cache has the frontmatter,
  its offsets not counting the mark): built for the parser, the reader and the
  window's boundary; the file is never rewritten; fixture `frontmatter/bom`.
  **`...` as a closing line is NOT built: Obsidian was observed and does not
  accept it** (`---`, `tags: [x]`, `...` reads as a divider and text, no
  frontmatter), so accepting it would contradict the Obsidian dialect
  (invariant 12). It waits for the maintainer: keep the `---`-only close as
  Obsidian does, or accept `...` as a Verso extension (and then say that a
  note with `...` shows differently in the two apps). No fixture for it yet.
  (b) YAML 1.2 was already the parser's: `yes` and `2024-01-02` are text
  (fixture `frontmatter/yaml-12`). **`tags: 2024` differs from the decision's
  premise**: Obsidian reads `tags: 2024` as a number and lists no tag
  (`tags: [2025, yes]` lists only `#yes`; `true`, `1.5` and `"7"` list none), so
  the index now takes only a string that is not digits only as a tag
  (fixture `frontmatter/tags-number`, the decision's own clause "adjust if it
  differs"). (c) Already built (typed relations, ADR 0057 point 4; backlinks
  and graph in `crates/verso-index/tests/board.rs`); Obsidian's
  `frontmatterLinks`, `backlinks` and `links` agree; fixture
  `frontmatter/wikilink-values`.

  **Closed in full on 2026-10-21 by the maintainer** (questions DL.1, DL.2 and
  DL.3 of the decisions list of 2026-10-21).
  (a) **`...` (DL.1, option A):** it does **not** close the frontmatter; only
  `---` does, as in Obsidian. The decision of 2026-10-21 that accepted `...`
  is replaced by this one. (b) **`tags: 2024` (DL.2, option B, the maintainer's
  explicit choice):** the maintainer chose *"Voltar ao que eu decidi: `2024`
  vira a tag '2024'"* — a numeric `tags` value **is** a tag in Verso. **This
  differs from Obsidian, and both facts are on record**: Obsidian was observed
  (1.13.7, repeated on 1.14.4) and does not list a number in `tags` as a tag
  (`tags: [2025, yes]` lists only `#yes`; `true`, `1.5` and `"7"` list none).
  Invariant 12 asks that Verso never contradict Obsidian; the maintainer
  decided knowingly, so this is an extension decided by him, not a build
  choice, and a note with `tags: 2024` shows a tag in Verso and none in
  Obsidian. The code is changed to follow this and the fixture
  `frontmatter/tags-number`, which today asserts the Obsidian reading, is
  updated by the code that builds it; that fixture's draft mark was removed
  once it was approved with DL.2 B (v0.48, `1a184eab`; see the dated lines
  below), and the other five fixtures of Q22 and Q24 (`block/id-chars`,
  `frontmatter/bom`, `frontmatter/yaml-12`, `frontmatter/tags-hash`,
  `frontmatter/wikilink-values`) are **approved as drafted** (DL.3, option A),
  their draft marks removed. (c) The BOM, YAML 1.2, wikilinks in values and
  mixed line endings stand as decided on 2026-10-21 and built.

  *Dated lines, 2026-10-21 (review of the afternoon batch).* (1) The file
  `fixtures/frontmatter/tags-number/expected.yaml` has no draft mark and was
  approved with DL.2 B (v0.48). Its comment and its `observed:` text **changed
  after the approval** (they now say that Verso diverges from Obsidian by the
  maintainer's decision); the asserted value (`frontmatter: tags: 2024`, an
  integer) did not. Invariant 14 reads "never change `expected.yaml` without
  explicit approval", so a one-line re-confirmation of the file as it now
  stands is asked (question I-8 of the decisions list of the afternoon).
  (2) That "a negative integer is no tag" and "a float is no tag" (`tags:
  1.5`, `tags: -3`) are **the build's choice**: the answer named only `2024`;
  it sits in the code comment and its test
  (`crates/verso-dialect/src/tags.rs`) and is asked as T.3 of the same list.

  *Answered 2026-10-22 (decisions list of the afternoon of 2026-10-21).*
  **T.3, option A:** a numeric `tags` value is a tag **only when it is a
  non-negative integer** (`2024`); a negative integer, a number with a decimal
  point and `true` are not tags. The maintainer's reason on the list: he spoke
  of `2024`. The build's choice of (2) is now his decision. **I-8, option A:**
  he **reconfirms the fixture `frontmatter/tags-number` as it stands now**,
  with its changed comment and `observed:` text and the same asserted value
  (`tags: 2024` an integer); this is the explicit approval invariant 14 asks
  for. No fixture file was edited for this record.

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
| v0.16 | 2026-09-23 | The maintainer's answers on the Phase 2 review (`docs/review/phase-2.md` §6, items 4 and 20): **Q13 and Q25 closed** as the code does them; Q5 (kinds, fold — which the reading view now acts on, `7679916` — and title), Q6 (comments), Q15 and Q24 decided for the reading view and the window, with the index's part and the rest still open — Q5's nesting and Q6's `<iframe>`, `<video>` and `<audio>` stay open because the reading view does not follow Obsidian there; Q22 decided for the tags' charset and case; **Q12 point 2's order stated**: a path from the root first, then relative to the source's folder, and `./` or `../` relative only, as Obsidian 1.13.7 does. Two questions closed, five in part |
| v0.17 | 2026-09-24 | Q5: a provisional fact, not an answer — the reading view draws a callout inside a callout, up to 32 deep (branch `feat/nested-callouts`); nesting stays `[OPEN]` |
| v0.18 | 2026-09-24 | **Q11 closed by the maintainer** (`docs/reference/typed-note-decision.md`, [ADR 0052](../adr/0052-typed-note.md)): a schema is a fenced `verso-schema` block, YAML inside, in a note anywhere in the open folder but hidden and ignored paths, named by the `type` inside it; two schemas with one name type nothing, and the conflict is shown; whether a nested block counts is not decided. Section 6: the typed note, schemas and schema i18n `DECIDED`, constraint 1 (ADR 0013) accepted. Q24: its link part is the next decision. No fixture yet: the implementation brings them. Q6: a pointer to `docs/reference/embedded-media-decision.md`, which corrects the claim that Obsidian's documentation shows `<video>` and `<audio>`; Q6 stays open |
| v0.19 | 2026-09-24 | Q11: **a nested `verso-schema` block does not count**, decided by the maintainer (`docs/reference/views-decision.md` §2, [ADR 0052](../adr/0052-typed-note.md) point 3): only a block at the top level of a note is a schema, and a nested one is shown as not read. Bases (`.base` files and `base` blocks) are [ADR 0053](../adr/0053-views-bases.md)'s, not this spec's, which is the notes' dialect |
| v0.20 | 2026-09-29 | Q19, setext part: **an observed answer and a drafted fixture** — `Título` over `===` is a level-1 heading, over `---` a level-2 one, and a `---` directly under text is never a thematic break (Obsidian CLI, `docs/reference/obsidian-cli.md`; `fixtures/heading/setext`, AI draft). Section 5.12 updated; the setext sub-question closes with the maintainer's approval of that fixture in its pull request. The matching part of Q19 stays open |
| v0.21 | 2026-09-29 | **Q19, setext part, closed by the maintainer**: the fixture `fixtures/heading/setext` approved in session ("ratifique o que precisar"); a setext underline is a heading, as observed in Obsidian. Section 5.12 updated. The matching part of Q19 stays `[OPEN]`. Q26: a note pointing to the revision of ADR 0044 of the same day — build directories and `.gitignore` left out, behind settings. One question closed, in part |
| v0.22 | 2026-09-30 | **Q10 closed by the maintainer** (`docs/reference/board-decision.md` §10, [ADR 0057](../adr/0057-board-json-canvas.md)): a typed relation is a frontmatter property of the source note whose value is a quoted wikilink or a list of them, the key its type; with it, **Q24's link part**. **Q16 decided for `.canvas`** as Obsidian does: `file` nodes and the links of `text` nodes are backlink sources, a canvas is a link target by its full name. §5.11: the board's format — the drawing under a top-level `verso` key, no type of Verso's own, Obsidian's layout kept on write. Section 6: the typed relation `DECIDED`; the conversion table's D4 `DECIDED`. One question closed, two in part |
| v0.23 | 2026-10-01 | On the critical review `docs/review/board.md`, §6, accepted by the maintainer: **`property_links`** joins the `expected.yaml` schema (§4.1, §4.7, §4.6), with the drafted fixture `fixtures/frontmatter/property-links` (AI draft, observed in Obsidian 1.13.7); §5.11 records the fields of Verso's own on a canvas, that a `file` node is a path from the root, and that a save writes what the user did not change as it was read. No question closed |
| v0.24 | 2026-10-02 | The fixture `fixtures/frontmatter/property-links` **approved by the maintainer** in session ("Já aprovo agora"), before 0.3.0-beta.3; its draft mark removed. Nothing else changes. |
| v0.25 | 2026-10-02 | Organizing properties ([ADR 0060](../adr/0060-makemd-organizing-features.md)): `sticker`, `color`, `banner`, `banner_y`, `order`, `pinned`, `items_sticker`, `items_color`, `items_template` `DECIDED` in section 6. |
| v0.26 | 2026-10-07 | The typed note's implementation ([ADR 0052](../adr/0052-typed-note.md)) begins: **`schemas`** enters the fixture schema (§4.1, §4.8), with the category `schema` in §8 and two drafted fixtures awaiting the maintainer's approval. The header's version, left at v0.24 by v0.25, catches up |
| v0.27 | 2026-10-07 | The fixtures `fixtures/schema/top-level` and `fixtures/schema/nested-and-invalid` **approved by the maintainer** in session ("ta aprovado a fixture"); their draft mark removed. Nothing else changes. |
| v0.28 | 2026-10-07 | **Q3, Q4 and Q21 decided by the maintainer**, after an observation of Obsidian through its CLI the same day: a block is the editor's unit (Q21); a `^id` alone after a blank line names the block before it, one at the end of a heading names the heading (Q3); an id is unique per note, the last of two naming the block (Q4). `blocks` items gain `lines` (§4.3). Three fixtures drafted, awaiting the maintainer's approval: `block/after-a-block`, `block/heading`, `block/duplicate`. §5.7 says how the id is drawn: hidden when reading, quiet in the editor, as observed. |
| v0.29 | 2026-10-07 | The fixtures `fixtures/block/after-a-block`, `fixtures/block/heading` and `fixtures/block/duplicate` **approved by the maintainer** in session ("tao aprovados"), after checking the blocks in the app; their draft mark removed. Nothing else changes. |
| v0.30 | 2026-10-07 | After the reviewer's reading of the block feature (PR #37): Q3 gains four **provisional facts of the implementation**, `[OPEN]` for the maintainer — a loose item named whole by its first paragraph, "the block before it" at the same depth, a non-id `^word` as a plain paragraph, and the `^id` line inside the item it names — with its status line saying what is decided and what is open; Q4 says where the rule of the last id is stated (the `read_note` answer schema) and applied (the window). No fixture until the maintainer decides. |
| v0.31 | 2026-10-07 | Q3's open part **observed in Obsidian through its CLI** (28 inputs): the block is the top-level section, or the innermost list item; alone with nothing before it, no block. Implemented; three fixtures drafted (`block/in-list`, `block/in-quote`, `block/alone-top`), awaiting the maintainer's approval; the provisional facts of v0.30 replaced by the observation. The "Unchanged:" sentence of Q3 cites section 5.7, where the own-text rule lives. |
| v0.32 | 2026-10-07 | The fixtures `fixtures/block/in-list`, `fixtures/block/in-quote` and `fixtures/block/alone-top` **approved by the maintainer** in session ("Aprovado"); their draft mark removed. **Q3 is closed in full.** Nothing else changes. |
| v0.33 | 2026-10-07 | After the second Opus reading: §5.7 says the decided rule (the top-level section, or the innermost list item) in place of the "own text" sentence, lists the three new fixtures and says what a `^id` that names nothing looks like; Q3's two decision paragraphs are one, in two steps; **two `^id`s alone in a row** is `[OPEN]` (the extension or Obsidian's last-only), with the frontmatter and footnote cases recorded as unobserved; the 28 observed inputs are in `docs/reference/obsidian-blocks-2026-10-07.md`. |
| v0.34 | 2026-10-09 | **Two `^id`s alone in a row** `DECIDED` by the maintainer: only the last names the block before them, as in Obsidian; the fixture `fixtures/block/two-alone` drafted, awaiting the maintainer's approval. |
| v0.35 | 2026-10-09 | The fixture `fixtures/block/two-alone` approved by the maintainer in session ("aprovado"). |
| v0.36 | 2026-10-10 | **Q7 `DECIDED`** by the maintainer in session, as recommended, from finding F20 of the sync campaign of 2026-10-10 (two devices on Windows and Linux kept both forms of a name, and one never uploaded): one name is one file everywhere — the server compares names in NFC, each device keeps the spelling its own file system gave the name, a file changed on both sides under the two forms is a conflict copy (ADR 0079 item 8). §5.10 says so; the provisional fact of v0.10 kept as history. No fixture: the maintainer did not ask for one. |
| v0.37 | 2026-10-12 | Q8's creation side `DECIDED` by the maintainer in session (*"Todos aprovados"*, as recommended): a new name differing only in case from an entry of its folder is refused when Verso makes or renames it, on every OS and on the server (ADR 0070 item 3, revised). Q8 itself, case in name resolution, stays `[OPEN]`. No fixture: names made, not the dialect. |
| v0.38 | 2026-10-14 | **Q9 `DECIDED`** by the maintainer, accepting ADR 0087 and its item 8 (*"Sim, todas"*): per-block visibility is a callout of kind `secret`, a callout in the file, served by a UniVerso to readers as a projection without it; §5.8 and §6's row revised. No fixture: the fixture of Q9 comes with the PR that builds ADR 0087, for the maintainer's approval. |
| v0.39 | 2026-10-14 | [ADR 0086](../adr/0086-infobox-a-typed-notes-card.md), accepted the same day, implemented: a schema's kinds `link` and `image` and its top-level `layout` (`infobox`) enter §4.8, §6 and Q11's format; the fixture `fixtures/schema/infobox` drafted, awaiting the maintainer's approval. The approved fixture `fixtures/schema/nested-and-invalid` writes `kind: link` as its unknown kind, which `link` no longer is: its input waits for the maintainer (invariants 14 and 16). No question closed. |
| v0.40 | 2026-10-14 | The schema gains `prose` (§4.1, §4.9): the runs of prose of [ADR 0089](../adr/0089-linking-unlinked-mentions.md) item 1, what the mentions are looked for in, by the maintainer's answer M6 (*"Sim, todas"*); the fixture `fixtures/prose/what-is-prose` drafted, awaiting the maintainer's approval. No question closed. |
| v0.41 | 2026-10-14 | The fixtures `fixtures/code/dice-inline`, `fixtures/prose/what-is-prose` and `fixtures/schema/infobox` **approved by the maintainer** in session (*"Aprovo as 3"*), and with them the schema's key `prose` (§4.1, §4.9) of v0.40; their draft mark removed. `code/dice-inline` observed in Obsidian 1.14.4 through its CLI, without the Dice Roller plugin, before the approval was recorded: its links and its block are Obsidian's, its `observed:` says how. Nothing else changes. |
| v0.42 | 2026-10-14 | The schema gains `reader` (§4.1, §4.6): the note as a UniVerso serves a reader, the projection of Q9 and [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md) item 3. The drafted fixture `fixtures/callout/secret`, with the PR that builds ADR 0087, awaits the maintainer's approval; Q9's paragraph says so. No decision changed |
| v0.43 | 2026-10-15 | §5.11 item 5 and a new item 6: maps on the board ([ADR 0090](../adr/0090-maps-on-the-board.md)) — a node's `verso` gains `map`, `pin` and `secret`, and a secret node is left out of what a reader is served. No fixture: the fixture schema (§4) describes a Markdown note, and a canvas is not parsed by the dialect; the guardrail is the core's property test of the projection. No question closed |
| v0.44 | 2026-10-15 | §5.11 item 7: a `> [!secret]` callout inside a board's text node is hidden from readers as in a note, and a `.txt` (any non-Markdown file) is not projected ([ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md), the maintainer's decision of finding I3). No fixture (a canvas is not parsed by the dialect); the guardrail is the core's property test and the server's reader probe. No question closed |
| v0.45 | 2026-10-15 | The fixture `fixtures/callout/secret` **approved by the maintainer** on 2026-10-15 in session (*"aceito todas recomendações"*); its draft mark removed. It asserts `reader` (§4.1, §4.6) of Q9 and [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md): a block at the top level, one inside another callout with the kind in capitals, one in a list item, a `[!secrets]` kept. Nothing else changes |
| v0.46 | 2026-10-20 | §6: two rows, the fenced block ```` ```statblock ```` ([ADR 0099](../adr/0099-visual-markdown-statblocks-and-cards.md)) and the `> [!oracle]` callout ([ADR 0102](../adr/0102-creative-oracles-and-improvisation.md)), constructs Verso draws and Obsidian reads as a code block and a callout; the parser does not change. No fixture (nothing here answers a §9 question or changes what the parser returns). No question closed |
| v0.47 | 2026-10-21 | The maintainer's answers of the decisions questionnaire of 2026-10-20 (answered 2026-10-21): **Q2, Q5 (nesting), Q6, Q8, Q14, Q15, Q16, Q17, Q19, Q20, Q22, Q23 and Q24 `DECIDED`**, each as the option marked — Q14 with both options, A (ratify) and B (unresolved links as graph nodes). Every decision is recorded; none closes in full, since each that needs a fixture or an observation of Obsidian waits for the PR that adds it (invariant 17); Q5's `callout/nested` is a separate code PR. §5 and §7 brought up to date: §7 now points to [ADR 0093](../adr/0093-periodic-notes.md) for periodic notes, not to §9. No fixture changed |
| v0.48 | 2026-10-21 | The maintainer's answers of the decisions list of 2026-10-21: **Q5, Q22 and Q24 closed in full**, six of the seven fixtures drafted on 2026-10-21 **approved** (`callout/nested`, `block/id-chars`, `frontmatter/bom`, `frontmatter/yaml-12`, `frontmatter/tags-hash`, `frontmatter/wikilink-values`; draft marks removed). Q24: `...` does not close the frontmatter (as Obsidian); `tags: 2024` **is** the tag "2024", the maintainer's explicit choice, knowingly different from Obsidian, which is on record; `frontmatter/tags-number` is approved, its expectation changed with the code of DL.2 B and its draft mark removed (`1a184eab`). Q14: clicking an unresolved graph node asks before creating the note. |
| v0.49 | 2026-10-22 | The maintainer's answers of the afternoon list of 2026-10-21: **Q5-bis A** (a plain blockquote inside a callout is no level; a callout inside it is nested), **T.3 A** (`tags`: only non-negative integers), **I-8 A** (`frontmatter/tags-number` reconfirmed as it stands). No fixture changed |
| v0.50 | 2026-10-22 | §6: one row and an example, the fenced block ```` ```roll ```` — a roll of the Table kept in a note ([ADR 0107](../adr/0107-the-table-a-shared-roll-and-chat-log.md) "As built", roll block; the maintainer's option A of 2026-10-22). Verso draws a fixed card; Obsidian reads a code block; the parser does not change. No fixture. No question closed. (The header above still reads v0.48 while the history reaches v0.49: a contradiction already in the document, left for the maintainer.) |
| v0.51 | 2026-10-31 | The maintainer's answers to the list of 2026-10-31 (*"O restante ta aprovado"*). **Confirmed, nothing changed**, since each was already decided and the list had read sentences that are history: Q5's limit of 32 levels of nesting (decided 2026-10-21), Q9's per-block visibility by `[!secret]` (decided 2026-10-14), Q8's case-only rename as it is (ADR 0070 item 3), and Q3's four provisional facts of v0.30 (replaced by the observation of v0.31, closed in v0.32). **Kept `[OPEN]` until a real case**: Q6's embedded HTML beyond its decision (options B and C), Q17's limits, and §5.1's accepted forms of `tags` and `aliases`. **Q17, one ceiling `DECIDED`** (his B7 = a): a note above 16 MiB stays out of the index, syncing as a file, and shows a notice (to be built). No fixture added or changed; a fixture of the ceiling would be approved separately. The header's version, left at v0.48 by v0.49 and v0.50, catches up |
| v0.52 | 2026-11-01 | §5.6: an embed of a sound file is rendered as a player ([ADR 0116](../adr/0116-music-and-sound-at-the-table-heard-by-everyone.md), amendment of 2026-11-01, the maintainer's request), as Obsidian renders it; `![](…)` of a sound file too, by Q20. Rendering only: the parser does not change. No fixture added or changed; no question closed |
