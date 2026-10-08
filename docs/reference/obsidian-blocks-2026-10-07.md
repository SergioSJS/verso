# Obsidian's block ids, observed on 2026-10-07

- Date: 2026-10-07
- Observed with: Obsidian 1.14.4 (installer 1.11.5), macOS, through its CLI
- Admissible by [ADR 0009](../adr/0009-external-constraints.md): normal use
  of the app and the public API only (`MetadataCache.getCache`, declared in
  `obsidian.d.ts`); nothing from the binary.
- Why: the open part of Q3 of the [dialect spec](../spec/dialect.md) — what a
  `^id` names inside a list item or a quote, and alone with nothing before it
  — before the fixtures `block/in-list`, `block/in-quote` and
  `block/alone-top` were drafted and approved. See
  [obsidian-cli.md](obsidian-cli.md) for how the CLI is run.

## 1. How

Twenty-eight notes written into a throwaway folder of the `Sandbox` vault
(`verso-fixtures/`, deleted afterwards), then, for each:

```
obsidian vault=Sandbox eval code='JSON.stringify(app.metadataCache.getCache("verso-fixtures/<name>.md"))'
```

Of the answer, three fields are read: `blocks` (id → position),
`sections` (type, position, `id` when one is attached) and `listItems`
(position, `id`, `parent`). Lines are 0-based, start and end inclusive.
`\n` below is a line break, `\t` a tab.

## 2. What was observed

| Note | Input | `blocks` | `sections` / `listItems` |
|---|---|---|---|
| `q3-loose-item` | `- um ^item\n\n  - filho\n- dois` | item: 0..0 | listItems 0..0 #item, 2..2 (parent 0), 3..3 |
| `q3-alone-in-quote` | `> a\n>\n> ^q` | q: 0..2 | blockquote 0..2 #q |
| `q3-alone-under-item` | `- um\n\n  ^x\n\n  - filho` | x: 0..2 | listItems 0..2 #x, 4..4 (parent 0) |
| `q3-non-id-word` | `Texto.\n\n^foo.bar\n\n^ok` | ok: 2..2 | paragraph 0..0, paragraph 2..2 #ok |
| `q3-loose-no-sublist` | `- a ^x\n\n  texto\n- b` | x: 0..2 | listItems 0..2 #x, 3..3 |
| `q3-code-first-in-item` | `- ```\n  code\n  ```\n\n  ^c\n\n  - child\n- next` | c: 0..4 | listItems 0..4 #c, 6..6 (parent 0), 7..7 |
| `q3-heading-in-item` | `- ## H ^h\n  - child\n- next` | h: 0..0 | listItems 0..0 #h, 1..1 (parent 0), 2..2 |
| `q3-tab-nested` | `- pai\n\t- filho ^tab\n\t\t- neto\n- tio` | tab: 1..1 | listItems 0..0, 1..1 #tab (parent 0), 2..2 (parent 1), 3..3 |
| `q3-alone-first` | `^solto\n\nTexto.` | (none) | paragraph 2..2 only; the `^solto` line is no section |
| `q3-nested-list-from-below` | `- a\n\n  - b\n  - c\n\n  ^l` | l: 0..5 | listItems 0..5 #l, 2..2, 3..3 |
| `q3b-quote-end` | `> a ^q` | q: 0..0 | blockquote 0..0 #q |
| `q3b-quote-multi` | `> a\n>\n> b ^q\n>\n> c` | q: 0..4 | blockquote 0..4 #q |
| `q3b-callout` | `> [!note] T\n> texto ^c` | c: 0..1 | callout 0..1 #c |
| `q3b-nested-quote` | `> > a ^q` | q: 0..0 | blockquote 0..0 #q |
| `q3b-list-in-quote` | `> - um ^i\n> - dois` | i: 0..1 | blockquote 0..1 #i; listItems 0..0, 1..1 without id |
| `q3b-alone-in-list-in-quote` | `> - um\n>\n>   ^i` | i: 0..2 | blockquote 0..2 #i |
| `q3b-item-second-para` | `- um\n\n  segundo ^p\n\n  - filho` | p: 0..2 | listItems 0..2 #p, 4..4 (parent 0) |
| `q3b-item-second-alone` | `- um ^u\n- dois\n\n  ^v` | u: 0..0, v: 1..3 | listItems 0..0 #u, 1..3 #v |
| `q3b-table-in-item` | `- um\n\n  | a |\n  | - |\n  | 1 |\n\n  ^t` | t: 0..6 | listItems 0..6 #t |
| `q3b-alone-after-heading` | `# T\n\n^h` | h: 0..0 | heading 0..0 #h |
| `q3b-alone-after-rule` | `Texto.\n\n---\n\n^r` | r: 2..2 | paragraph 0..0, thematicBreak 2..2 #r |
| `q3b-two-alone` | `Texto.\n\n^a\n\n^b` | b: 0..0 (no `a`) | paragraph 0..0 #b |
| `q3b-hard-break` | `Texto  \n^id` | id: 0..1 | paragraph 0..1 #id |
| `q3b-soft-break` | `Texto\n^id` | id: 0..1 | paragraph 0..1 #id |
| `q3c-quote-in-item` | `- > q ^x\n- dois` | x: 0..0 | listItems 0..0 #x, 1..1 |
| `q3c-alone-after-list` | `- a\n- b\n\n^lst` | lst: 0..1 | list 0..1 #lst |
| `q3c-text-after-sublist` | `- um\n\n  - filho ^f\n\n  texto ^t\n- dois` | t: 0..4, f: 2..2 | listItems 0..4 #t, 2..2 #f (parent 0), 5..5 |
| `q3c-list-in-quote-alone-after` | `> - a\n> - b\n\n^q` | q: 0..1 | blockquote 0..1 #q |

## 3. The rule the observation shows

- The block a `^id` names is the **top-level section** its line is in: a
  quote or a callout whole, whatever in it holds the id (a nested quote, a
  list inside the quote, an id alone after a blank quoted line).
- In a list, it is the **innermost list item**: its own content in the
  cache (a loose item's later paragraphs, a table, a code block, an id alone
  under a nested list all belong to it), the nested items listed apart as
  children. The spec's Q21 (decided) puts the nested items in the block,
  so Verso's `lines` run through them where Obsidian's position stops at
  the item's own content.
- Alone at the top level after a blank line, the **section before it**: a
  heading, a list, a thematic break, a paragraph that is no id
  (`^foo.bar`). The `^id` line is no section of its own.
- Alone with **nothing before it**, no block: the line is no section.
- A hard or soft break before the id keeps it in the paragraph.
- Two ids alone in a row: the cache keeps only the last (`q3b-two-alone`).
  What Verso does with the first is Q3's remaining `[OPEN]`.

Not observed, and recorded as open or as what the parser does in the
spec: a `^id` alone right after the frontmatter, after a footnote
definition, and how the reading view draws a `^id` that names nothing.
