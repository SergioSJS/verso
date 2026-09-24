# ADR 0052 — Typed note: `type:` in the frontmatter and a schema in the folder

- Date: 2026-09-24
- Source: `docs/BRIEFING.md` §5.3 (the typed-note row), §11.3, §16.1, §17
  item 7; [0014](0014-primitives-catalog.md), Consequences; the memo
  [`docs/reference/typed-note-decision.md`](../reference/typed-note-decision.md)
- Status in the briefing: `PROPOSED`

## Context

[0014](0014-primitives-catalog.md) lists the typed note in its catalog of
primitives — "`type:` in the frontmatter + schema in a text file in the folder;
with no schema, it is plain Markdown" — and, with
[0003](0003-primitives-not-workarounds.md), asks for an ADR of its own before it
is built. Item 2.6 of Phase 2, one note type end to end, waits for this ADR and
for the format and location of the schemas, spec Q11
([roadmap](../roadmap.md)).

Obsidian types a property by its name, one type per name for the whole vault,
and the public documentation read for the memo (section 3) describes no kind of
note that declares its properties. In Obsidian that gap is filled with Dataview,
Templater and statblocks (briefing §5.3, §16.1). In Verso today a property's
type is whatever its YAML value is, and nothing says what an NPC has.

This ADR was drafted with the memo, which lays out the options and the author's
recommendations. Nothing in it is decided.

## Decision (proposed, not confirmed)

Points 1 and 2 restate the briefing's sentence; how the name is compared, and
points 3 to 7, are the memo's recommendation, waiting for the maintainer.

1. **A note is typed when its frontmatter has a `type` holding one text that
   names a schema of the open folder.** The name is compared as spec Q12
   compares note names: after NFC, case ignored (memo, section 4.2).
2. **Without such a schema the note is plain Markdown**, exactly as today, and
   `type` is an ordinary property — no `type`, a `type` naming no schema, or a
   `type` that is not one text. Nothing is reported for it: a vault may use
   `type:` for its own purposes (briefing §5.3; spec §6).
3. **A schema is text in the open folder. Its format and location are spec Q11,
   `[OPEN]`.** The memo recommends a fenced block whose language is
   `verso-schema`, YAML inside, in any note of the folder outside hidden and
   ignored paths, named by the `type` inside it (memo, section 5.6).
4. **A schema declares, in its first version**, the type's name, its label per
   interface language, and an ordered list of properties, each with a key, a
   label and a kind: `text`, `list`, `number`, `checkbox`, `date` or `datetime`
   — the property types Obsidian documents, in the forms it documents (memo,
   section 5.4).
5. **What Verso does with a typed note** (memo, section 4.2): the properties
   panel draws the schema's properties first, in its order, under their labels,
   each with the widget of its kind, and the note's other keys after them; a
   declared key the note lacks is an empty row that writes nothing until the
   user gives it a value; a value that does not fit its kind is shown as
   written, and marked. Search takes `type:`. `verso mcp` carries the type and
   the declared properties, and lists notes by type. A note is typed at query
   time, as links resolve.
6. **What Verso never does with a typed note** (memo, section 4.2): write on
   open; add a missing key, reorder keys or normalize a value; rewrite notes
   when a schema changes; run anything a schema says.
7. **No type is built into the app.** An NPC, a place, a faction are schemas the
   user writes or a pack brings: content, never code
   ([0036](0036-tabletop-rpg-support.md)).

## Consequences

- **Degradation holds by construction.** The typed note is a Markdown note, its
  schema is text in the folder, and the index derives both and holds nothing the
  files lack ([0013](0013-degrades-to-markdown.md), whose acceptance the memo
  puts to the maintainer in the same sitting;
  [0011](0011-config-outside-tree-index-as-cache.md)).
- **Opening never rewrites** ([0012](0012-files-are-source-of-truth.md),
  invariants 7, 8 and 11). Bringing the notes of a type up to a changed schema,
  if it ever exists, is a conversion: a user action, with a diff per note.
- **Obsidian reads a typed note as a note with properties**, as long as Verso
  writes values in Obsidian's documented forms
  ([0030](0030-base-dialect-obsidian-compatible.md)). Obsidian gives one type
  per property name for the whole vault, so a key given two kinds by two
  schemas cannot match it in both.
- **Query by type enters `verso mcp`**
  ([0018](0018-llm-native-mcp-in-core.md)).
- **The contract's new types are generated**
  ([0038](0038-ts-type-generation.md)); labels come from the schema in pt-BR
  and EN, the window's own new texts go through its catalogs, and its new
  controls carry names ([0035](0035-cross-cutting-requirements.md)).
- **A schema is untrusted input** ([0045](0045-server-and-mcp-security.md)):
  it is read under the frontmatter's limits (spec Q17), inside the fuzzed
  parser, and its labels are shown as text.
- **Packs** ([0015](0015-schema-packs.md), Proposed): a schema in which nothing
  runs keeps "installing a pack does not execute code" true
  ([0047](0047-plugin-api-open-questions.md)).
- **Properties holding links** wait for the "wikilinks inside values" part of
  spec Q24, `[OPEN]`, which the memo recommends as the next decision
  (section 6). **Typed relations stay Q10**, `[OPEN]`: a property's key is not a
  relation type.
- **Fixtures.** The answer to Q11 enters with its fixtures, in the PR that
  closes it ([0031](0031-fixtures-as-contract.md)); under the format the memo
  recommends, spec §4 gains a key for a schema block. Typing a note by a schema
  involves two files, which the fixture layout does not have; until it does,
  the core's tests carry it.

## Discarded alternatives

- Reproducing Dataview, Templater and statblocks as third-party plugins —
  recorded in [0014](0014-primitives-catalog.md), where the catalog discards it.
- None of the memo's options is discarded before the maintainer chooses; the
  closing PR records here the ones set aside.

## Status

Proposed. Drafted on 2026-09-24 with the memo
`docs/reference/typed-note-decision.md`; only the maintainer accepts it.
