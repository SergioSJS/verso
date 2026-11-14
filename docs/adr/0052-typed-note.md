# ADR 0052 — Typed note: `type:` in the frontmatter and a schema

- Date: 2026-09-24
- Source: `docs/BRIEFING.md` §5.3 (the typed-note row), §8, §11.3, §16.1,
  §17 item 7; [0014](0014-primitives-catalog.md), Consequences; the memo
  [`docs/reference/typed-note-decision.md`](../reference/typed-note-decision.md)
- Status in the briefing: `PROPOSED` for the typed-note row (§5.3) and for
  schema i18n (§11.3), and `OPEN` for the format and location of the schemas
  (§11.3, §17 item 7), until 2026-09-24; `DECIDED` from the maintainer's
  decision (the briefing's History, v0.9)
- Revisions: 2026-09-24 — `[OPEN]` closed by the maintainer in session, on the
  memo: Decision, Consequences, Discarded alternatives and Status filled in
  place; the Context's last paragraph, which described the draft, rewritten.
  2026-09-24 — point 3's open detail closed by the maintainer the same day
  (`docs/reference/views-decision.md` §2): only a block at the top level of a
  note counts.

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
recommendations, and entered `[OPEN]` as a draft for the maintainer — with a
drafted Decision, unlike ADRs 0044 to 0048, which entered `[OPEN]` with
questions only, on subjects the briefing does not have. The maintainer decided
it the same day.

## Decision

**Decided on 2026-09-24 by the maintainer**, in session, on the memo
[`docs/reference/typed-note-decision.md`](../reference/typed-note-decision.md).
The author's recommendations of the day, this memo's among them, were put to
the maintainer as one list; the answer: *"Tirando o plano de fazer vários PR,
eu gosto das suas recomendações"* ("apart from the plan of several pull
requests, I like your recommendations"). Every recommendation of the memo is
accepted — sections 4.5, 5.6 and 6 — and each point below says where it comes
from. The one exception the answer names is about pull requests, not about
this ADR ([0033](0033-pr-workflow.md), revised the same day).

1. **`type:` in the frontmatter types a note, and its value is a key.** A note
   is typed when its frontmatter has a `type` holding one text — `type: npc` —
   that names a schema of the open folder. The name is compared as spec Q12
   compares note names: after NFC, case ignored, so `type: NPC` and
   `type: npc` reach one schema (memo, section 4.2 (a) to (c)).
2. **Without such a schema the note is plain Markdown**, exactly as today, and
   `type` is an ordinary property — no `type`, a `type` naming no schema, or a
   `type` that is not one text, a list of types included. Nothing is reported
   for it: a vault may use `type:` for its own purposes (memo, section 4.2 (a);
   spec §6).
3. **A schema is a fenced code block whose language is `verso-schema`, with
   YAML inside, in a note** — one type per block; several blocks may share a
   note. **It counts anywhere in the open folder except under hidden and
   ignored paths** ([0044](0044-verso-fs-semantics.md)), and its identity is
   the `type` inside it, not the note's name or place: moving or renaming the
   note changes nothing. This is spec Q11, closed the same day. Where a schema
   lives was the maintainer's choice between two answers of the briefing:
   §5.3 — "a text file in the folder", with ADR 0014 and spec §6 after it —
   and §8, with [0021](archive/0021-sync-automerge-layered-config.md) after it, both
   `PROPOSED`, which put schemas in the shared layer of the configuration that
   [0011](0011-config-outside-tree-index-as-cache.md) keeps outside the tree.
   The maintainer chose §5.3's, as the memo recommends it: a schema is
   content, as packs are ([0015](0015-schema-packs.md)), and travels with the
   folder. §8 and 0021 are left as written, Proposed, and disagree with this
   point on schemas (memo, sections 5.1 to 5.6 and 10, item 1).
   **Only a block at the top level of the note counts**, decided on
   2026-09-24 (`docs/reference/views-decision.md` §2): a block inside a list
   or a callout is not read as a schema, and the note says so — which keeps a
   quoted example out.
4. **A schema declares, in its first version**, `type` (the name notes write
   in their own `type:`), `label` (the type's name per interface language,
   pt-BR and EN; a missing one falls back to the name) and `properties`, an
   ordered list whose items have `key`, `kind` and `label`. The kinds are
   `text`, `list`, `number`, `checkbox`, `date` and `datetime` — the property
   types Obsidian documents, in the forms it documents. Allowed values,
   required keys and link kinds are not in the first version. Nothing a schema
   says runs: no expression, formula, query, computed default, inheritance or
   template with logic (memo, section 5.4).
5. **A schema that does not parse types nothing** and says so, in its note and
   on the notes that name it. **Two schemas with one name: neither applies**,
   and the notes of that type are shown untyped with the conflict, naming both
   (memo, section 5.5, option α). A schema edited changes what the panel
   shows and no note; a schema binned untypes its notes, and restored types
   them again.
6. **What Verso does with a typed note** (memo, section 4.2 (d)): the
   properties panel draws the schema's properties first, in its order, under
   their labels in the interface language, each with the widget of its kind,
   and the note's other keys after them; a declared key the note lacks is an
   empty row that **writes nothing until the user gives it a value**, and then
   goes where the panel puts a new key, at the end of the frontmatter; a value
   that does not fit its kind is shown as written, and marked. The type is
   named above the properties. Search takes `type:`. `verso mcp` carries the
   type and the declared properties in `read_note`, and `list_notes` takes an
   optional type. A new note is typed through a template, with no new command
   in the first version. The index keeps each note's `type`, as written and
   folded, and the schemas it found, and a note is typed at query time, as
   links resolve.
7. **What Verso never does with a typed note** (memo, section 4.2 (e)): write
   on open; add a missing key, reorder keys or normalize a value; rewrite notes
   when a schema changes — bringing the notes of a type up to a changed schema
   is a conversion, a user action with a diff per note; run anything a schema
   says.
8. **No type is built into the app.** An NPC, a place, a faction are schemas the
   user writes or a pack brings: content, never code
   ([0036](0036-tabletop-rpg-support.md)).
9. **Properties that hold links are out of the first slice.** A property
   holding a quoted wikilink stays a `text` property for the typed note, and
   the "wikilinks inside values" part of spec Q24 is the next decision (memo,
   section 6, option (a)).

With this ADR, [0013](0013-degrades-to-markdown.md) is accepted in place, as
written, with "views" and "structured data" delimited (memo, section 4.3,
option A); the form — a new ADR for the typed note, 0013 accepted in place —
is the memo's option (ii) of section 4.4.

## Consequences

- **Degradation holds by construction.** The typed note is a Markdown note,
  its schema is a block of text inside another note, and the index derives
  both and holds nothing the files lack
  ([0013](0013-degrades-to-markdown.md), accepted the same day;
  [0011](0011-config-outside-tree-index-as-cache.md)).
- **Opening never rewrites** ([0012](0012-files-are-source-of-truth.md),
  invariants 7, 8 and 11). Bringing the notes of a type up to a changed schema,
  if it ever exists, is a conversion: a user action, with a diff per note.
- **Obsidian reads a typed note as a note with properties**, as long as Verso
  writes values in Obsidian's documented forms
  ([0030](0030-base-dialect-obsidian-compatible.md)), and a schema's note as a
  note with a code block. Obsidian gives one type per property name for the
  whole vault, so a key given two kinds by two schemas cannot match it in both.
- **Query by type enters `verso mcp`**
  ([0018](0018-llm-native-mcp-in-core.md)).
- **The contract's new types are generated**
  ([0038](0038-ts-type-generation.md)); labels come from the schema in pt-BR
  and EN, the window's own new texts go through its catalogs, and its new
  controls carry names ([0035](0035-cross-cutting-requirements.md)).
- **A schema is untrusted input** ([0045](0045-server-and-mcp-security.md)):
  it is read under the frontmatter's limits (spec Q17), inside the fuzzed
  parser — which holds because a schema is inside a note, the format decided
  in point 3 — and its labels are shown as text.
- **Packs** ([0015](0015-schema-packs.md), Proposed): a schema in which nothing
  runs keeps "installing a pack does not execute code" true
  ([0047](0047-plugin-api-open-questions.md)); under point 3 a pack is a
  folder of notes.
- **Typed relations stay Q10**, `[OPEN]`: a property's key is not a relation
  type. **Amended on 2026-09-30** by [0057](0057-board-json-canvas.md), point 4: Q10 is
  decided, and a property whose value is a quoted wikilink, or a list of
  them, is a relation named by its key.
- **Fixtures.** Q11 closed without one — none existed, as Q12 and Q26 closed
  on the maintainer's answer. The schema fixtures come with the
  implementation: the parser's report of a `verso-schema` block, with a key
  for it in spec §4.1 and a category in spec §8, each fixture drafted by the
  AI and approved by the maintainer in the pull request that adds it
  ([0031](0031-fixtures-as-contract.md)). Typing a note by a schema involves
  two files, which the fixture layout does not have; until it does, the
  core's tests carry it.
- **The work is the memo's section 8**, in that order; under the rule of
  2026-09-24 its rows travel in large pull requests rather than one each
  ([0033](0033-pr-workflow.md), [0051](0051-development-flow-and-releases.md)).

## Discarded alternatives

- Reproducing Dataview, Templater and statblocks as third-party plugins —
  recorded in [0014](0014-primitives-catalog.md), where the catalog discards it.

Considered by the maintainer on the memo, and set aside on 2026-09-24:

- **The value as a link to the schema's note** (`type: "[[PdM]]"`) — each
  typed note would appear in the schema note's backlinks in Obsidian, but
  renaming the schema would rewrite every typed note's frontmatter, and it
  depends on Q24's link part (memo, section 4.2 (b)).
- **The name compared as written, byte for byte** — simpler to explain, and a
  second answer, beside Q12's, to "are these two names the same" (4.2 (c)).
- **ADR 0013 accepted for typed notes and schemas only** — the next primitive
  would argue the principle again (4.3, option B).
- **One new ADR holding both, or both accepted in place in 0014** — the first
  leaves 0013 half alive, the second strains 0014's own consequence that a
  primitive needs its own ADR (4.4, options (i) and (iii)).
- **A schema as a YAML file, as a note's frontmatter, or as a JSON Schema
  file** — a file Verso reads no other way, a definition that adds a name to
  Obsidian's vault-wide properties and is edited in source mode only, or room
  for code (5.2, formats (a), (b) and (d)); (b) was the cheaper variant.
- **A hidden folder at the root, a visible folder at the root, or the
  configuration directory** — an exception to "hidden entries are not
  walked", a folder name imposed on every vault, or types that stay behind
  when the folder is copied (5.3, locations (i), (ii) and (iv)).
- **The first schema in path order, or the most recently modified, when two
  share a name** — silent, and a copy made by "duplicate" would win (5.5,
  options β and γ).

Not discarded, deferred: **link kinds in the first slice** — option (b) of the
memo's section 6 — wait for Q24's link part.

## Status

Accepted on 2026-09-24 by the maintainer, in session, on the memo
`docs/reference/typed-note-decision.md`: the Decision above. Drafted the same
day with the memo and read with it by a fresh Opus 5.5 session (the memo,
section 13). Point 3's open detail — whether a nested `verso-schema` block
counts — closed by the maintainer the same day: it does not.
