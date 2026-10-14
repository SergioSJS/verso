# ADR 0086 — The infobox: a typed note's properties as a card beside its text

- Date: 2026-10-14
- Source: the maintainer, on 2026-10-14 at 11:36 UTC, sending a plan of
  new features drafted with another assistant — among them an "infobox"
  drawn from the frontmatter, as a wiki's — and asking for a critical
  reading and a roadmap toward *"uma V1 bem sólida"* (a really solid V1).
  The reading in session found most of it built (typed notes, the
  properties panel, the cover banner, pictures on a base's cards) and
  named what is missing: an image kind, a link kind and a layout chosen
  by the schema. The maintainer's answer that evening, on the whole list:
  *"VAI SER TUDO NA V1"* (it will all be in V1). Written by Opus 5.5; to
  be read by the other model before it is accepted
  ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0052](0052-typed-note.md) (the typed note, its schema and its
  kinds; link kinds deferred in point 9), [0057](0057-board-json-canvas.md)
  (the typed relation, a quoted wikilink as a property's value; spec Q10
  and Q24's link part), [0060](0060-makemd-organizing-features.md) (the
  `banner:` cover), [0053](0053-views-bases.md) (a base's cards with a
  picture), [0013](0013-degrades-to-markdown.md) (structured data
  degrades to Markdown), [0036](0036-tabletop-rpg-support.md) (schema
  packs, statblocks), [0076](0076-the-window-on-every-screen.md) (narrow
  screens), [0085](0085-hover-preview.md) (a link's preview),
  [0035](0035-cross-cutting-requirements.md) (both languages,
  accessibility).
- Status in the briefing: not present; on acceptance.

## Context

What exists. A note is typed by `type:` in its frontmatter and a
`verso-schema` block somewhere in the folder ([0052](0052-typed-note.md)).
A schema's properties have one of six kinds — `text`, `list`, `number`,
`checkbox`, `date`, `datetime` (`crates/verso-dialect/src/schema.rs`,
`PropertyKind`); any other kind makes the schema type nothing, with the
error `unknown_kind`, while a top-level key the parser does not read is
ignored. The properties panel, in the note's leaf
(`app/ui/src/props.ts`, `app/ui/src/leaves/note.ts`), draws a typed
note's declared properties first, each with the widget of its kind, and
edits them in place. A note or a folder note may carry a cover picture,
`banner:` and `banner_y:` ([0060](0060-makemd-organizing-features.md),
`app/ui/src/labels.ts`). A base's cards and kanban show a picture taken
from a property (`app/ui/src/bases/view.ts`, the view's `image` option).

What is missing for a page that reads as a wiki's — the picture, a few
facts and the related pages at the side, the text beside them:

- **No image kind.** A property holding a picture is `text`; the panel
  shows its path.
- **No link kind.** [0052](0052-typed-note.md) point 9 deferred
  properties holding links until spec Q24's link part was decided; it was
  decided on 2026-09-30 with Q10 ([0057](0057-board-json-canvas.md)): a
  quoted wikilink that is a property's value, or an item of a list that
  is, is a link — a typed relation. The panel still shows it as text, not
  as a link to follow.
- **No layout.** The panel is the same strip for every note.

## Decision

Proposed (2026-10-14). Accepted on 2026-10-14 (Status): each `[OPEN]` was decided as
recommended and is marked `[DECIDED 2026-10-14]`.

1. **Two new kinds in a schema.**
   - `link`: a quoted wikilink or a list of them — the typed relation
     already decided; the panel and the infobox show each as a link,
     followed with a click and previewed on hover
     ([0085](0085-hover-preview.md)), and the editor offers the folder's
     notes as `[[` does.
   - `image`: a picture of the folder, written as a quoted wikilink
     (`"[[roderick.jpg]]"`, which Q24 already reads as a link, so the
     picture's backlinks count it) or as a path of the folder, as
     `banner:` takes it. `[DECIDED 2026-10-14]`: a web address as a value. Decided:
     **shown only from origins the person approved**, as an embedded page
     is ([0050](0050-outbound-network-access.md),
     [0056](0056-embedded-web-pages.md)); otherwise the address as text.
   A value that does not fit its kind is shown as written and marked, as
   [0052](0052-typed-note.md) point 6 says of every kind.
2. **A layout named by the schema.** A schema may say `layout: infobox`
   at its top level, beside `type`, `label` and `properties`; with no
   `layout`, the panel stays as it is. The key is ignored by builds that
   do not read it, so a folder's schemas keep typing in an older Verso.
   `[DECIDED 2026-10-14]`: the key's name and value. Decided: `layout: infobox`.
3. **The infobox** is the properties panel drawn as a card at the right of
   the text, in the reading view and in Edit mode: the first `image`
   property at its head, the type's label under it, then the declared
   properties in the schema's order, under their labels in the interface
   language, the note's other keys folded below. It is the same panel —
   the same rows, the same widgets, the same writes — laid out
   differently, so editing a property in the infobox is editing it in the
   panel, with invariant 11's check. On a narrow pane or a phone
   ([0076](0076-the-window-on-every-screen.md)), the card goes above the
   text, at full width, collapsed to the picture and the first three
   properties.
4. **Nothing is written to make a note look like a wiki.** The frontmatter
   stays the frontmatter; a note opened in Obsidian shows its properties
   as Obsidian does, the links resolved there too
   ([0013](0013-degrades-to-markdown.md)). Opening a typed note writes
   nothing (invariant 7); a declared property the note lacks writes
   nothing until given a value ([0052](0052-typed-note.md) point 6).
5. **The new kinds are dialect.** The schema's grammar is spec §4.8 and
   Q11: `link` and `image` come with fixtures marked as drafts for the
   maintainer's approval ([0031](0031-fixtures-as-contract.md)), and
   `docs/spec/dialect.md` is revised in the same PR.
6. **Accessibility** ([0035](0035-cross-cutting-requirements.md)): the
   infobox is a complementary region named after the note; the picture's
   alternative text is `alt` when the property gives one (`[DECIDED 2026-10-14]`: where.
   Decided: the wikilink's alias, `"[[roderick.jpg|Lorde Roderick]]"`),
   otherwise the note's title; the card keeps the panel's keyboard order.

## Consequences

- `verso-dialect`'s `PropertyKind` gains `Link` and `Image`, the schema
  parser reads `layout`; `verso-index` and the MCP carry the kinds
  ([0066](0066-mcp-sees-boards-relations-properties-bases.md)); the
  contract's types are generated as always (invariant 3).
- **An older Verso types nothing with a schema that uses `link` or
  `image`**: its parser refuses an unknown kind (`unknown_kind`), so the
  whole schema stops typing there until it is updated. Recorded, not
  worked around: a schema is content, and the error says so.
- The window: the infobox layout of `props.ts`, the link and picture
  widgets, the strings; e2e tests for the layout, the narrow pane and an
  edit made in the card; the demo vault gains a typed note in the
  infobox layout ([0058](0058-demo-vault-as-tutorial.md)); the changelog
  gets its line.
- A base's card picture and the infobox read the same `image` kind once
  it exists; the base's `image` option keeps working on any property.

## Discarded alternatives

- **Mandatory forms**, as World Anvil's (named and set aside in the plan
  of 2026-10-14 itself): a schema that refuses a note missing a field
  contradicts [0052](0052-typed-note.md) point 7 and the folder as the
  source of truth.

## Status

**Accepted (2026-10-14).** The maintainer, that night, answering
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* with *"Sim, todas"* (yes, all): every `[OPEN]`
decided as recommended, marked `[DECIDED 2026-10-14]` in place. In V1
(`docs/roadmap.md`, Phase 4 — V1).

*(History, before the acceptance above:)* Proposed (2026-10-14). In V1 by the maintainer's word of 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revision 8). For the
maintainer, each with a recommendation: a web address as a picture
(item 1), the layout key (item 2), and the picture's alternative text
(item 6).
