# Decision memo: one note type end to end, Phase 2 item 2.6 (the typed note, degradation to Markdown, format and location of the schemas)

- Date: 2026-09-24
- Status: **decided by the maintainer on 2026-09-24**, in session. The
  author's recommendations of the day, this memo's among them, were put to the
  maintainer as one list; the answer: *"Tirando o plano de fazer vários PR, eu
  gosto das suas recomendações"* ("apart from the plan of several pull
  requests, I like your recommendations"). All seven lines of section 12 as
  recommended:
  1. the typed note accepted in a new ADR, [ADR 0052](../adr/0052-typed-note.md),
     with section 4.2's answers — `type: <name>` a key, compared as Q12
     compares names; what Verso does and never does;
  2. [ADR 0013](../adr/0013-degrades-to-markdown.md) accepted as written
     (option A), with "views" and "structured data" delimited as section 4.3
     says;
  3. the form (ii): ADR 0052 new, ADR 0013 accepted in place;
  4. Q11's format (c): a fenced `verso-schema` block inside a note;
  5. Q11's location (iii): anywhere in the folder except hidden and ignored
     paths — the maintainer's choice between briefing §5.3 and briefing §8
     with ADR 0021 (section 10, item 1);
  6. two schemas with one name (α): neither applies, and the conflict is
     shown;
  7. link kinds (a): out of the first slice, Q24's link part next.

  The one exception the answer names, "the plan of several pull requests",
  covers section 8's one pull request per row: until the whole flow exists
  the rows travel in large pull requests
  ([ADR 0033](../adr/0033-pr-workflow.md), revised the same day). Recorded
  in ADR 0052 (Accepted), ADR 0013 (Accepted in place), ADR 0014, ADR 0021,
  spec Q11 (v0.18), the roadmap, the ADR index and the briefing's History
  (v0.9). No fixture came with the closing: none existed for Q11, and the
  implementation brings them, each approved in the pull request that adds it.
  Item 2.6 stays "not started", no longer waiting for decisions; whether a
  `verso-schema` block nested in a list or a callout counts is still open
  (ADR 0052, point 3). Until the answer nothing here was a decision and, unlike
  features 2 to 6 of Phase 1, no code was written under the recommendations.
  Sections 1 to 11 are the comparison as it stood when the decision was made.
- Author: Opus 5.5, in the role of author of documents that
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) gives "Opus 5". The
  recommendations in sections 4 to 6 are **the author's**, labelled as such;
  they are not decisions. Reader: a fresh Opus 5.5 session, standing in for
  Fable 5.1 by the maintainer's decision of 2026-09-23
  (`../review/phase-2.md` §6, item 17, and §7) — so the model that wrote this
  memo read it, the departure from ADR 0032 that decision accepts. Its
  findings, and what was done with each, are in section 13. No Rust, no
  TypeScript and no fixture in this change. A draft
  [ADR 0052](../adr/0052-typed-note.md), **`[OPEN]`**, comes with it, so that
  the maintainer can accept, change or refuse a text rather than a summary.
- Decides on: the two rows the [roadmap](../roadmap.md) puts before item 2.6 —
  **"Promotion of the typed note
  ([0014](../adr/0014-primitives-catalog.md)) and of degradation to Markdown
  ([0013](../adr/0013-degrades-to-markdown.md)) to an ADR of their own,
  Accepted"** and **"Format and location of the schemas"**,
  [`docs/spec/dialect.md`](../spec/dialect.md) **Q11**. It touches, and says
  where it leaves, spec **Q24** (wikilinks inside values; the YAML version),
  **Q10** (typed relation, left open), the schema i18n proposal of briefing
  §11.3, [ADR 0015](../adr/0015-schema-packs.md) (packs),
  [ADR 0021](../adr/archive/0021-sync-automerge-layered-config.md) (layered
  configuration) and [ADR 0018](../adr/0018-llm-native-mcp-in-core.md) (query
  by type).
- Sources read: `docs/BRIEFING.md` and its pt-BR original, which prevails
  (§5.2, §5.3, §5.4, §8, §11, §12, §16.1, §17); ADRs
  [0003](../adr/0003-primitives-not-workarounds.md),
  [0009](../adr/0009-external-constraints.md),
  [0010](../adr/0010-folder-is-the-unit-no-vault.md),
  [0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [0012](../adr/0012-files-are-source-of-truth.md), 0013, 0014, 0015, 0018,
  0021, [0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [0028](../adr/0028-crate-structure.md),
  [0029](../adr/0029-guardrails-in-ci.md),
  [0030](../adr/0030-base-dialect-obsidian-compatible.md),
  [0031](../adr/0031-fixtures-as-contract.md), 0032,
  [0033](../adr/0033-pr-workflow.md),
  [0034](../adr/0034-roadmap-in-phases.md),
  [0035](../adr/0035-cross-cutting-requirements.md),
  [0036](../adr/0036-tabletop-rpg-support.md),
  [0038](../adr/0038-ts-type-generation.md),
  [0041](../adr/0041-multi-root-workspace.md),
  [0044](../adr/0044-verso-fs-semantics.md),
  [0045](../adr/0045-server-and-mcp-security.md),
  [0047](../adr/0047-plugin-api-open-questions.md),
  [0048](../adr/0048-file-operations-in-ui.md),
  [0049](../adr/0049-phase-2-scope-widened.md),
  [0050](../adr/0050-outbound-network-access.md) and
  [0051](../adr/0051-development-flow-and-releases.md); the roadmap; spec §4,
  §5.1, §6, §7 and §9 (Q10, Q11, Q12, Q16, Q17, Q24);
  [`../review/phase-2.md`](../review/phase-2.md) §6 and §7; the memos
  [`app-decision.md`](app-decision.md), [`fs-decision.md`](fs-decision.md),
  [`index-decision.md`](index-decision.md) and
  [`mcp-decision.md`](mcp-decision.md); and the code at `6cc0714`:
  `crates/verso-dialect/src/{lib,parse,frontmatter}.rs`,
  `crates/verso-core/src/lib.rs`, `crates/verso-contract/src/lib.rs`,
  `crates/verso-index/src/{schema,store}.rs`, `crates/verso-cli/src/mcp.rs`,
  `app/ui/src/props.ts` and the search of `app/ui/src/main.ts`. Obsidian's
  public sources, fetched on 2026-09-24, are listed in section 3. Section 11
  lists what was **not** verified.

## 1. What is being decided, and why now

Item 2.6 of Phase 2, **one note type end to end**, is the only scope item of
the phase not started. The roadmap says it waits for two decisions:

| Decision | When | Where |
|---|---|---|
| Promotion of the typed note (0014) and of degradation to Markdown (0013) to an ADR of their own, Accepted | before the typed note (2.6) | new ADR |
| Format and location of the schemas | before the typed note (2.6) | spec Q11 |

They come before the code for the reason Q18 came before feature 1: every
layer depends on the answer. Which file declares a type, and where it lives,
decides what the parser reports, what the index stores, what crosses the
contract, what the window draws and what `verso mcp` answers. A slice built
under one answer and decided under another is rework with nobody at fault: Q12
closed with feature 3's code already written, and that code then owed five
differences (spec Q12). [ADR 0003](../adr/0003-primitives-not-workarounds.md)
and ADR 0014 say it outright: every primitive needs its own ADR before it is
implemented.

Two things tie it to the gate:

- The phase closes on **a month of real use preparing table sessions** (exit
  criterion 1). A game master's month is NPCs, places, factions and sessions;
  the typed note is the one Phase 2 item aimed at that material rather than at
  notes in general.
- **Query by type** is the agent capability Phase 1 left to this item: its
  exit criterion 4 says "Querying by type waits until the typed note exists
  (Phase 2, item 2.6)", and ADR 0018 puts it in `verso mcp` "when typed notes
  do". (Agent writing is outside Phase 1 too, and has no phase: the roadmap
  lists it after Phase 2.)

The decided material that constrains the answers, none of it reopened here:

- **Opening never rewrites; conversion only by user action, with a visible
  diff; every write checks that the file is the one that was read**
  ([ADR 0012](../adr/0012-files-are-source-of-truth.md), invariants 7, 8
  and 11).
- **Verso extends Obsidian's dialect and never contradicts it; only public
  sources on Obsidian** ([ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md),
  [ADR 0009](../adr/0009-external-constraints.md), invariants 12 and 13).
- **The open folder is the unit; configuration lives outside the tree, with no
  mandatory directory inside it; the index is a rebuildable cache**
  ([ADR 0010](../adr/0010-folder-is-the-unit-no-vault.md),
  [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)).
- **Hidden entries are not walked, at any depth; an ignored note is an
  unresolved target and never a backlink source**
  ([ADR 0044](../adr/0044-verso-fs-semantics.md)).
- **The UI reaches the core only through the contract, whose TypeScript types
  are generated; only `verso-fs` touches the folder's files; `verso-dialect` has
  no IO** ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0038](../adr/0038-ts-type-generation.md)).
- **Query by type enters `verso mcp` with typed notes; structured query comes
  before similarity** ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)).
- **The interface is pt-BR and EN, with no loose string; accessibility from the
  start** ([ADR 0035](../adr/0035-cross-cutting-requirements.md)).
- **No RPG feature enters the core as a special case**
  ([ADR 0036](../adr/0036-tabletop-rpg-support.md)).
- **Folder content, downloaded schema packs included, is untrusted input**
  ([ADR 0045](../adr/0045-server-and-mcp-security.md)).
- **The frontmatter is bounded at 64 levels and 10 000 nodes** (spec Q17);
  **the parser is read-only** (Q18); **note names are compared after NFC with
  case ignored** (Q12, closed).
- **The daily note and templates are accepted primitives** (ADR 0014,
  2026-09-23), and **`url` carries a Verso meaning**
  ([ADR 0050](../adr/0050-outbound-network-access.md)).
- **Out of scope until Phase 2 ends: sync, mobile, plugins, the board and the
  compatibility shim** ([ADR 0034](../adr/0034-roadmap-in-phases.md)).

## 2. What exists today

Read in the code at `6cc0714`. A property's type today comes from its YAML
value, never from a declaration: nothing in Verso says "this note is an NPC,
and an NPC has a faction".

| Layer | What it does with the frontmatter today |
|---|---|
| `verso-dialect` | Parses the block into a `Value` — null, boolean, integer, float, string, sequence, mapping — with keys in the order written. YAML 1.2 core schema: `yes` is a string, `2024` an integer, `2026-09-12` a string (spec Q24 leaves the version open). At most 64 levels and 10 000 nodes. No position per key, and **no link inside a value is reported** (`../review/phase-2.md` §7, "Recorded, not fixed") |
| `verso-index` | Keeps `tags`, `aliases`, an http(s) `url` and whether the YAML parsed; no other key, no `type`. Schema version 6 |
| `verso-core` | Hands a note's properties to the contract in the order written, each typed as the YAML gave it; parses the note again on every read |
| `verso-contract` | `PropertyValue`: `text`, `number` (as its text), `checkbox`, `list` (plain strings only), `nested` (a mapping or a mixed list, shown and never edited), `empty`. No date |
| Window, properties panel (`props.ts`) | One row per key; the widget follows the YAML kind; a text that starts with `YYYY-MM-DD` gets a calendar icon and an http(s) text a link icon, by pattern; an edit changes that key's lines only and is saved as typing is (`app-decision.md` §5) |
| Window, search | `tag:`, `path:` and `file:` narrow a search, composed in the window over the core's commands |
| `verso mcp` | Seven read-only tools; `read_note` returns numbered lines, headings, `^id` blocks, `stale` and `unverified` — the frontmatter only as lines of text, no properties; `list_notes` returns paths |

Two precedents the answers can lean on:

- **A property with a Verso meaning.** ADR 0050 accepted that an http(s) `url`
  makes a note a web note: a meaning Obsidian does not give the property, and
  one that changes nothing in the file. `type` would be the second such key.
- **A role given to notes by a folder.** The daily note and templates, accepted
  in ADR 0014 on 2026-09-23: any note in the folder the settings name is a
  template. Those settings live in the window's own storage (`verso.settings`,
  `app-decision.md` §8), per machine, and neither `verso-core` nor `verso mcp`
  reads them. A typed note cannot copy that arrangement as it is: the core has
  to find the schemas by itself, or `verso mcp` cannot answer by type.

And one absence: the core reads **no per-folder setting** from the
configuration directory. `Workspace::open` hands `verso-fs` an empty ignore list
(`Root::open(folder, Vec::new())`), so the configurable list ADR 0044 decided has
no file behind it yet; only the index's sidecar lives there, as bookkeeping. A
schema location named by a setting would be the first per-folder setting the
core reads.

## 3. What Obsidian does with properties, from public sources

Admissible under [ADR 0009](../adr/0009-external-constraints.md): the public
documentation and the public API, fetched on 2026-09-24. Nothing was observed in
the running app for this memo.

| Fact | Source |
|---|---|
| Property types: Text, List, Number, Checkbox, Date (`date: 2020-08-21`), Date & time (`time: 2020-08-21T10:30:00`), and Tags as a list | "Properties", `https://obsidian.md/help/properties` |
| "Once a property type is assigned to a property name, all properties with that name across your vault will use the same type." | same page |
| "Internal links in text properties must be surrounded with quotes" — `link: "[[Episode IV]]"`; the same inside lists | same page |
| Nested properties: "To view nested properties, we recommend using the source mode." Markdown is not rendered in properties, "an intentional limitation" | same page |
| Default properties: `tags`, `aliases` and `cssclasses`; `tag`, `alias` and `cssclass` were deprecated in 1.4, and their support as default properties is dropped in 1.9. `type` is not one of them | same page; the 1.4 deprecation also in the changelog of the next row |
| "Backlinks: Properties with links will now properly show in backlink entries." | "Obsidian 1.4 Desktop", 2023-08-31, `https://obsidian.md/changelog/2023-08-31-desktop-v1.4.5/` |
| `CachedMetadata.frontmatterLinks?: FrontmatterLinkCache[]`, `@since 1.4.0`, each one carrying the property's `key` | `obsidian.d.ts`, npm package `obsidian` 1.13.1, MIT |
| A base is a `.base` file of "valid YAML conforming to the schema" — filters, formulas, properties, summaries, views — and can be "embedded in a code block" | "Bases syntax", `https://obsidian.md/help/bases/syntax` |
| Supported formats: `.md`, `.base`, `.canvas`, images, audio, video, PDF; other formats through community plugins | "Accepted file formats", `https://obsidian.md/help/file-formats` |

Where Obsidian keeps the type it assigns to each property name is in neither the
pages read nor `obsidian.d.ts`, and this memo does not say.

What follows for Verso — readings, not decisions:

1. **Obsidian types properties by name, per vault; the documentation read
   describes no kind of note that declares its properties.** That is the gap
   the typed note fills (briefing
   §16.1: "Dataview without evolution; Bases reads frontmatter only"). It is an
   extension, not a contradiction, as long as it gives no new meaning to
   anything Obsidian interprets (invariant 12).
2. **A typed note is a note with properties in Obsidian's documented forms**, so
   Obsidian reads it correctly with no Verso code — provided Verso writes values
   in those forms: a date as `2020-08-21`, a link as `"[[Note]]"`, a list with
   `- `.
3. **A per-type schema can give one key two kinds** — `nível` a number for
   NPCs, a text for places. Obsidian's documentation gives a name one type for
   the whole vault, so one of the two cannot match what Obsidian holds for that
   name; how Obsidian shows a value that does not match was not observed.
4. **A schema cannot take an extension or a code block Obsidian gives a meaning
   to** — `.base`, `.canvas`, the code block Obsidian embeds a base in — without
   changing what that construct means in Obsidian.

## 4. Decision 1 — the typed note, and degradation to Markdown

### 4.1 What the documents ask, and in what form

They agree on what, not on how:

| Document | What it says |
|---|---|
| [Roadmap](../roadmap.md), Phase 2 | "Promotion of the typed note (0014) and of degradation to Markdown (0013) to an ADR of their own, Accepted"; the "ADR" column says "new ADR" |
| [ADR 0014](../adr/0014-primitives-catalog.md), Consequences | "Each primitive needs its own ADR before being implemented"; "Typed note (item 2.6 of Phase 2) requires promoting this catalog row to its own ADR, Accepted" |
| [ADR 0049](../adr/0049-phase-2-scope-widened.md), Consequences; [`app-decision.md`](app-decision.md) §10 | item 2.6 waits for 0013 and 0014 "to become Accepted" / "accepted" — which, read literally, accepts the whole catalog, relations and views included |
| [ADR index](../adr/README.md), "How to change an existing ADR" | promoting a Proposed is done **in place**: "Edit the Decision section and the Status in place" |
| ADR 0014, Decision, 2026-09-23 | the daily note and templates were accepted inside 0014 itself; whether each still needs an ADR of its own "stays the maintainer's" |

Section 4.4 lays out the forms; section 10 records the difference.

### 4.2 What an accepted typed note would say

The briefing gives one sentence (§5.3): "`type:` in the frontmatter + schema in
a text file in the folder; with no schema, it is plain Markdown". An ADR that
can be built from needs five more answers.

**(a) When a note is typed.** When its frontmatter has `type` holding one text
that names a schema of the open folder. Every other case — no `type`, a `type`
naming no schema, a `type` that is a list, a number or a mapping — leaves the
note plain Markdown, as today, with `type` an ordinary property and nothing
reported: a vault may use `type:` for its own purposes (spec §6). A list of
types (`type: [npc, merchant]`) is left out of the first version: two schemas on
one note need a rule for a key both declare.

**(b) What the value is.**

| | a key: `type: npc` | a link to the schema's note: `type: "[[PdM]]"` |
|---|---|---|
| What the note depends on | a schema that calls itself `npc` | the note `PdM.md`, found by the rule of Q12 |
| Language | neutral: the file never changes with the interface language; the label does (briefing §11.3, `PROPOSED`) | the schema note's name, in one language |
| In Obsidian | a text property | a link: each NPC appears in the schema note's backlinks (section 3) |
| Renaming the schema | changes nothing | every typed note's value has to be rewritten, by a rename plan over frontmatter links, which Verso's plans do not see today |
| Depends on | nothing open | spec Q24, "wikilinks inside values" |

**(c) How the name is compared.** As written, byte for byte; or as the closed
Q12 compares note names — after NFC, case ignored — so that `type: NPC` and
`type: npc` reach one schema. The second keeps one rule for "these two names are
the same" across the app; the first is simpler to explain.

**(d) What Verso does with a typed note** — the smallest set that is end to
end:

1. **Properties panel.** The schema's properties first, in the schema's order,
   each under its label in the interface language and with the widget of its
   declared kind; the note's other keys after them, as today. A declared key the
   note lacks is an empty row that **writes nothing until the user gives it a
   value**, and then goes where the panel puts a new key today, at the end of
   the frontmatter. A value that does not fit its declared kind is shown as
   written and marked; the user may replace it through the declared widget,
   which is an edit, not a conversion; nothing changes it by itself.
2. **The type is named** above the properties ("PdM", or "NPC" in English).
3. **Search** takes `type:npc`, as it takes `tag:`.
4. **`verso mcp`**: `read_note` carries the type and the declared properties;
   `list_notes` takes an optional type ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)).
5. **Creation** goes through templates, already accepted: a new note, then a
   template whose frontmatter says `type: npc`. No new command in the first
   version.
6. **The index** keeps each note's `type` as written and folded, and the schemas
   it found. A note is typed **at query time**, as links resolve (Q12): a schema
   added types the notes that were waiting for it, a schema binned untypes them,
   and no file changes either way.

**(e) What Verso never does with a typed note.** Write on open. Add a missing
key, reorder keys, or normalize a value (quotes, date format, case). Rewrite
notes when a schema changes: bringing every NPC up to a new schema is a
conversion — a user action with a diff per note (invariant 8). Run anything a
schema says. Build any type into the app: an NPC is content, never code
([ADR 0036](../adr/0036-tabletop-rpg-support.md)).

### 4.3 Degradation to Markdown (ADR 0013)

The typed note degrades by construction: it is a Markdown note, its schema is
text — in the folder, under three of the four locations of section 5.3 — and
the index derives both. What the maintainer chooses is how much of
[ADR 0013](../adr/0013-degrades-to-markdown.md) becomes binding with it.

| | A. Accept 0013 as written, with two words delimited | B. Accept it for typed notes and schemas only |
|---|---|---|
| What binds | every structured feature: typed notes and schemas now, relations and views when they come | typed notes and schemas; for relations and views it stays a proposal |
| What is built today | complies: notes, templates, the daily note, `url`, the bin and the rename plans are all files | the same |
| Future cost | a query view — the kanban, calendar and table views ADR 0049 §3 kept out of Phase 2 — must be able to write its output as Markdown | none now; the question comes back with each primitive |
| What needs delimiting | **"views"** in its second consequence means the structured-views primitive of 0014, not the window's panels — graph, backlinks, search, folder view — which show what the files already hold; **"structured data"** means what users write about their notes (properties, types, schemas, relations, a view's output), not the app's settings and layout, which [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) puts outside the tree — bookmarks sit on that line | the same two words, later |
| Status afterwards | Accepted: one principle | a split like 0014's: accepted for one primitive, proposed for the rest |

### 4.4 The form of the promotion

| | (i) one new ADR holding both | (ii) a new ADR for the typed note; 0013 accepted in place | (iii) both in place: 0014's row accepted like the daily note, 0013 accepted |
|---|---|---|---|
| Follows | the roadmap's words, "an ADR of their own", "new ADR" | ADR 0003 and 0014 (a primitive's own ADR) and the index's rule for promoting a Proposed | the precedent of 2026-09-23 |
| 0013 afterwards | Proposed while its content is accepted elsewhere, or superseded — and the index keeps superseding for changing a decision, not for accepting one | Accepted, same text, the delimitations added | Accepted |
| 0014's row afterwards | points to the new ADR | points to [0052](../adr/0052-typed-note.md) | Accepted in place |
| What it strains | nothing, but it leaves 0013 in an odd state | nothing | 0014's own consequence that the typed note needs its own ADR |

### 4.5 Recommendation of the author for decision 1

**Accept the typed note in a new ADR — the draft
[0052](../adr/0052-typed-note.md) — with the answers of section 4.2:** the value
a **key** (`type: npc`), compared **as Q12 compares names**; the six behaviours
of (d); the never-list of (e). **Accept ADR 0013 as written, in place (option
A), with the two delimitations of section 4.3** written into its Consequences.
**Form (ii).**

The reasoning:

- The key keeps the typed note independent of any open question (Q24) and of
  any language, which is what briefing §11.3 proposes. The link has real charm
  in Obsidian's backlinks, but it makes every schema rename a mass rewrite of
  frontmatter that no plan of Verso's sees today.
- Q12's comparison is already the app's answer to "are these two names the
  same"; a second answer for types would be one more thing to remember.
- 0013 as written costs nothing that is built — every feature of Phase 2 is a
  file — and its one future cost, query views that can materialize, is what
  briefing §5.3 already proposes for views. Accepting half a principle leaves
  the next primitive to argue it again.
- (ii) is the only form that follows both documented procedures; (i) leaves
  0013 half alive, and (iii) strains 0014's own consequence.

**Discarded alternatives considered:** none beyond the options above.

## 5. Decision 2 — format and location of the schemas (spec Q11)

### 5.1 What the documents give, and where they pull apart

- **"A text file in the folder"** is the briefing's only clue (§5.3; ADR 0014;
  spec §6), and **packs are content, not code**
  ([ADR 0015](../adr/0015-schema-packs.md), briefing §5.4): a pack installs
  files the user can edit, and an update cannot overwrite a local edit without a
  diff.
- **Configuration lives outside the tree, and no directory inside it is
  mandatory** ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  decided; spec D2). Q11 records the tension: the schema inside the folder, the
  configuration outside it.
- **Briefing §8 and [ADR 0021](../adr/archive/0021-sync-automerge-layered-config.md)**
  (both `PROPOSED`) list schemas in the **shared layer of the configuration**,
  beside the plugin list. That is a second place the documents put schemas;
  section 10 records it.
- **Hidden entries are not walked, at any depth**
  ([ADR 0044](../adr/0044-verso-fs-semantics.md), decided), and a handle is
  refused for them (provisional).
- **Folder content is untrusted input**, "downloaded schema packs" by name
  ([ADR 0045](../adr/0045-server-and-mcp-security.md)).
- **Where content ends and code begins** is an open question for packs
  ([ADR 0047](../adr/0047-plugin-api-open-questions.md)): a schema with
  templates, expressions or queries would make installing a pack run something.
- **The core has to find the schemas by itself** (section 2): query by type is a
  `verso mcp` answer, and `verso mcp` never reads the window's settings.

### 5.2 The format, side by side

| | (a) a YAML file, `npc.yaml` | (b) a note, the definition in its frontmatter | (c) a note, the definition in a fenced block marked for Verso | (d) a JSON Schema file |
|---|---|---|---|---|
| Readable in any editor (0013) | yes, as YAML | yes | yes | yes, verbosely |
| Prose beside the definition, for people and agents | comments | the note's body | the note's body, around the block | a `description` string |
| In Obsidian | not a supported format (section 3); what the app shows was not observed | a note whose properties hold a nested value — Obsidian recommends source mode for those | a note with a code block | not a supported format |
| Adds to Obsidian's vault-wide property names | no | yes — one name, if the whole definition sits under a single key | no | no |
| Found and read today | listed by the walk as a file, never read | walked and parsed; its frontmatter is already a `Value` | walked and parsed; the block is new to the parser's report | listed as a file, never read |
| An agent reads it through `verso mcp` today | no tool reads it | `read_note` | `read_note` | no tool reads it |
| Work in the parser | a new read path in the core for a file that is not a note, then YAML | a pure function over the `Value` the parser already builds | a new field in `verso-dialect`'s report — span and position — then YAML | a JSON parser (a new dependency) and a chosen subset of JSON Schema |
| Fixture contract (spec §4: one `input.md` per case) | a new layout: the input is not Markdown | fits: a new key in `expected.yaml` | fits: a new key in `expected.yaml` | a new layout |
| Editing in Verso's window | as a text file | in source mode only: Live Preview folds the frontmatter, and the panel shows nested values without editing them | in any mode, as a code block | as a text file |
| Room for code (0047) | low | low | low | high: conditionals, references, patterns |

### 5.3 The location, side by side

| | (i) a hidden folder at the root, `.verso/schemas/` | (ii) a visible folder at the root | (iii) anywhere in the folder, by its marker | (iv) outside the tree, in the configuration directory |
|---|---|---|---|---|
| "A text file in the folder" (§5.3) | yes | yes | yes | no |
| ADR 0011 | the `.obsidian/` model it discarded, used for content | holds, if the app works without the folder | holds | holds — and schemas become configuration |
| ADR 0044 | against it: needs an exception to "hidden entries are not walked" | holds | holds: a schema under a hidden or ignored path does not count | not concerned |
| Travels with the folder — git, iCloud, a copy for a co-GM | yes | yes | yes | no: the folder opened on another machine has no types |
| Seen in Obsidian and by the agent | no | yes | yes | no |
| What names the place | a fixed name | a fixed name, in one language; or a per-folder setting the core would read — the first one (section 2) — and a folder copied without it loses its types | nothing | the configuration |
| Main risk | content hidden from the user | a Verso folder name imposed on every vault that uses types | an example block pasted into a note becomes a live schema | types lost with the configuration; rebuilding the index cannot bring them back |
| A pack installs | into the hidden folder | into that folder | wherever the user chooses | into the configuration (0021's shared layer) |

### 5.4 What a first schema says

The smallest vocabulary that carries one type end to end, in the form (c) would
give it:

````markdown
# PdM

Personagens do mestre que o grupo encontra.

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
  - key: aparição
    kind: date
    label: { pt-BR: Primeira aparição, en: First appearance }
```
````

| Field | What it says | In the first version |
|---|---|---|
| `type` | the name notes write in their own `type:` | yes |
| `label` | the type's name per interface language; a missing one falls back to the name | yes — the interface is pt-BR and EN ([ADR 0035](../adr/0035-cross-cutting-requirements.md)); this adopts the form briefing §11.3 proposes |
| `properties` | an ordered list, each item with `key`, `kind` and `label` | yes |
| `values`, `required` | a closed list of values; a key that must be there | no — later, if the month of use asks for them |
| kinds `link`, `links` | a property holding quoted wikilinks | only under option (b) of section 6 |

| `kind` | A YAML value that fits | Obsidian's type | Today's `PropertyValue` | Widget |
|---|---|---|---|---|
| `text` | a string | Text | `text` | a text field |
| `list` | a sequence of strings | List | `list` | pills |
| `number` | an integer or a float | Number | `number` | a number field |
| `checkbox` | `true` or `false` | Checkbox | `checkbox` | a checkbox |
| `date` | a string `YYYY-MM-DD` | Date | `text` | a date picker |
| `datetime` | a string `YYYY-MM-DDTHH:mm:ss` | Date & time | `text` | a date and time picker |

Under YAML 1.2, the parser's reading (Q24 open), a date is a string and `yes` is
not a boolean: `aliado: yes` does not fit `checkbox`, and it is shown as not
fitting, never converted.

What a schema never says in its first version: an expression, a formula, a
query, a computed default, inheritance between types, a template with logic —
anything that runs. That keeps ADR 0015's "installing a pack does not execute
code" true, on the line [ADR 0047](../adr/0047-plugin-api-open-questions.md)
asks for. A schema is untrusted input
([ADR 0045](../adr/0045-server-and-mcp-security.md)): the block is read under
the frontmatter's limits (spec Q17), inside the parser the fuzz target already
runs.

### 5.5 Identity, changes and conflicts

- **Identity is the `type` inside the definition, not the file's name.**
  Renaming or moving the schema's note changes nothing.
- **A schema edited changes what the panel shows, and no note.** A property
  added shows as an empty row in every note of the type; one removed leaves its
  key in the notes, shown among their other keys; a kind changed shows the
  values as fitting or not, none converted.
- **A schema binned untypes its notes**; restored, it types them again. The
  index is a cache ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)).
- **A definition that does not parse** — invalid YAML, an unknown kind — types
  nothing, and says so in the schema's note and on the notes that name it.
- **Two definitions with one name.** A likely way to get there: the window's
  "duplicate" makes `PdM copy.md` — `PdM cópia.md` in pt-BR — beside
  `PdM.md`. The options:

| | (α) neither applies, and the conflict is shown | (β) the first in path order applies (Q12's tie-break) | (γ) the most recently modified applies |
|---|---|---|---|
| What the user sees | the notes of the type untyped, with a line naming both schemas | the notes typed by one of the two, silently | the same, silently |
| The duplicate case | loud until one of the two is changed or removed | the copy wins: its name sorts before `PdM.md` in byte order, in either language, since a space comes before a dot | the copy wins: it is the newer |
| Depends on | nothing | path order | file times, which a sync or a copy can change |

### 5.6 Recommendation of the author for decision 2

**Format (c): a note of the folder, with the definition in a fenced block whose
language is `verso-schema`, YAML inside, one type per block** (several blocks may
share a note). **Location (iii): anywhere in the open folder, except hidden and
ignored paths. Identity by the `type` inside. Conflicts by (α). The vocabulary
of section 5.4**, without `values` and `required`, and without link kinds unless
section 6 says otherwise. Whether a block nested in a list or a callout counts,
or only one at the top level of the note, is a detail for the closing PR; the
top level alone is the stricter reading, and it keeps a quoted example out.

The reasoning:

- A note is what every part of Verso already reads — the walk, the parser, the
  index, the window, `verso mcp` — and what Obsidian shows. The schema is
  documentation as well as definition: the prose around the block is what an
  agent reads to learn what an NPC is for.
- The block keeps the definition out of the note's properties, so Obsidian's
  vault-wide property names gain nothing and the panel's limits on nested values
  do not apply; it is edited in any mode. It costs a new field in the parser's
  report, which (b) avoids: **(b) is the cheaper variant**, with the whole
  definition under one key, if the maintainer prefers less parser work to
  cleaner files.
- Anywhere-by-marker needs no folder name in any language, no setting and
  nothing outside the tree; a folder copied or cloned carries its types.
  Obsidian keeps a base the same way, as a `.base` file of the vault rather than
  as a setting. The risk — an example pasted into a note becomes live — is loud
  under (α), and the marker makes pasting one a deliberate act.
- It follows briefing §5.3 and ADR 0015 (schemas are content) against §8 and
  ADR 0021 (schemas are configuration). That is a recommendation, not a
  resolution of the contradiction (section 10); if the maintainer takes it,
  0021's wording is the maintainer's to correct.

**Discarded alternatives considered:** none beyond the options above.

## 6. A question the slice raises: properties that hold links

A game master's NPC is mostly relations: its faction, where it is found, the
session it appeared in. Obsidian's documented form for them is a quoted wikilink
in a property (`facção: "[[Guilda dos Ladrões]]"`), and Obsidian counts it in
backlinks (section 3). Verso does not: its parser reports no link inside a
frontmatter value, so the index has no such link and a rename plan does not
rewrite one (`../review/phase-2.md` §7, "Recorded, not fixed"; spec Q24,
"wikilinks inside values", `[OPEN]`). The gap exists today, typed notes or not.

| | (a) no link kind in the first slice | (b) `link` and `links` kinds in the first slice |
|---|---|---|
| `facção: "[[Guilda dos Ladrões]]"` | a `text` property, shown as text | a link: in the backlinks and the graph, rewritten by rename plans |
| Needs deciding first | nothing beyond decisions 1 and 2 | Q24's "wikilinks inside values": whether a quoted wikilink in a value is a link, a backlink and something rename plans rewrite |
| Code beyond the slice | none | the parser reports frontmatter links with positions; the index stores them with their key; rename plans rewrite inside the frontmatter, keeping the quoting |
| Risk | the NPC's relations stay plain text for a while | a rename plan that writes inside the frontmatter: the territory of exit criterion 2 (no data loss in the month) |
| Q10 (typed relation) | untouched | untouched, if the ADR says so: a property's key is recorded with the link, and it is not a relation type with a direction until Q10 says so |

**Recommendation of the author:** **(a) for item 2.6**, and **Q24's link part
as the next decision, in a memo and a pull request of its own**. The value is
real, and it follows Obsidian, as the maintainer's answers on Q12 and on the
reading view did; but it changes backlinks and makes rename plans write inside
the frontmatter, and a change to what a rename writes deserves its own subject
and its own reading ([ADR 0033](../adr/0033-pr-workflow.md)). Deciding it helps
the month of use with or without types: a vault that already writes links in
properties, the form Obsidian documents, shows fewer backlinks in Verso today
than in Obsidian.

## 7. The slice end to end, on a campaign

Two files of a game master's folder, under the recommendations above.

`Tipos/PdM.md`, the schema:

````markdown
# PdM

Personagens do mestre que o grupo encontra. Cada um tem facção, lugar e a
sessão em que apareceu.

```verso-schema
type: npc
label: { pt-BR: PdM, en: NPC }
properties:
  - key: facção
    kind: text
    label: { pt-BR: Facção, en: Faction }
  - key: local
    kind: text
    label: { pt-BR: Local, en: Location }
  - key: status
    kind: text
    label: { pt-BR: Situação, en: Status }
  - key: nível
    kind: number
    label: { pt-BR: Nível, en: Level }
  - key: aparição
    kind: date
    label: { pt-BR: Primeira aparição, en: First appearance }
  - key: aliado
    kind: checkbox
    label: { pt-BR: Aliado do grupo, en: Party ally }
```
````

`PdMs/Barão Vermelho.md`, a typed note:

```markdown
---
type: npc
facção: "[[Guilda dos Ladrões]]"
nível: 5
aparição: 2026-09-12
tags: [nobreza]
---

O barão governa o distrito norte.
```

| Layer | What it answers |
|---|---|
| `verso-dialect` | the baron's frontmatter as today: `type` the string `npc`, `nível` the integer 5, `aparição` the string `2026-09-12`; in `Tipos/PdM.md`, one `verso-schema` block, with its span, its position and the type `npc` with six properties |
| `verso-index` | the baron's `type`, `npc`; the schema `npc`, defined in `Tipos/PdM.md`; `type:npc` finds every note whose type folds to `npc` |
| `verso-core` and the contract | the baron's note carries its type — `npc`, labelled PdM and NPC, from `Tipos/PdM.md` — and each declared property with its label, kind, value and whether it fits: three fit, three are missing, none fails |
| Window, in pt-BR | "PdM" above the properties; then Facção `[[Guilda dos Ladrões]]` as text (section 6, option a), Local empty, Situação empty, Nível 5, Primeira aparição in a date picker, Aliado do grupo empty — nothing written until the user fills one; then `tags` with #nobreza. In English: Faction, Location, Status, Level, First appearance, Party ally |
| Search | `type:npc` lists the baron and every other NPC; `type:npc barão` narrows by word |
| `verso mcp` | `list_notes` with `type: "npc"` answers the NPCs' paths and their declared properties; `read_note` of the baron carries `type: "npc"`. An agent asked "which NPCs are allied with the party?" answers from structure, before any similarity search (ADR 0018, decision 2) |
| Obsidian | the baron's note shows its properties, typed by Obsidian's own rule per name; `Tipos/PdM.md` is a note with a code block. Opening either note in Verso writes nothing (invariant 7) |

Four changes, and what each does:

1. The schema gains `idade` (number): every NPC shows an empty "Idade" row. No
   NPC file changes.
2. `Tipos/PdM.md` moves to `Campanha/PdM.md`: nothing changes.
3. `Tipos/PdM.md` goes to the bin: every NPC shows its properties as today,
   untyped; restored, the types come back.
4. "Duplicate" on `Tipos/PdM.md`: two schemas named `npc`; every NPC shows the
   conflict, untyped, until one of the two is changed or removed (section 5.5,
   α).

One wrinkle: a template whose frontmatter says `type: npc` is itself an NPC to
the index and to `verso mcp`, which do not know the templates folder — it is a
window setting (section 2). The window can leave it out of its own lists; an
agent sees it among the NPCs.

Out of this slice: link kinds (section 6), allowed values, required keys, a "New
PdM" command, a table of NPCs (a view: 0014's views primitive, Proposed), several
types on one note, packs.

## 8. What it would take to build

Each row is a pull request of one subject ([ADR 0033](../adr/0033-pr-workflow.md)),
on its own short branch ([ADR 0051](../adr/0051-development-flow-and-releases.md)),
with the author and the reader ADR 0032 assigns — or whoever the maintainer
names. *(Set aside on 2026-09-24: until the whole flow exists the rows travel
in large pull requests, by the maintainer's decision recorded in ADR 0033 and
ADR 0051; the rows stay the order of the work.)*

| # | Pull request | What it carries | Checked without reading code |
|---|---|---|---|
| 1 | The decision (documents) | ADR 0052 with the maintainer's answer; 0013 accepted in place with the delimitations, if A; 0014's row pointing at 0052; spec Q11 closed, §6's two rows, a new first-level key in §4.1 for a schema block — which `scripts/check-fixtures.sh` learns (it checks keys, not category names) — a `schema` category among spec §8's categories, and the history line; the roadmap's two rows struck; the briefing's statuses (§5.3, §11.3, §17 item 7) changed in its History, as its header allows; **the schema fixtures, drafted by the AI and approved by the maintainer in this same PR, each listed in `crates/verso-dialect/tests/fixtures.rs`, as the script requires** — invariant 17: a fixture that answers an `[OPEN]` question enters only in the PR that closes it | the fixtures' `input.md` and `expected.yaml` |
| 2 | `verso-dialect`: the schema block | a report field for `verso-schema` blocks — span, position, the parsed definition or its error — under the frontmatter's limits | the fixtures pass; the fuzz target, which runs `parse`, reaches the block; the round-trip test's span fidelity covers the field; the WASM check stays green |
| 3 | `verso-index`: types and schemas | the note's `type`, as written and folded; the schemas found; notes by type; the index's schema version to 7, which rebuilds it, as a cache may be | `cargo test`; seen in the window at row 5 |
| 4 | `verso-core` and the contract | the typed properties of a note, and whether each fits; the list of types; notes by type; the bindings regenerated | the generated-bindings check ([ADR 0038](../adr/0038-ts-type-generation.md)) |
| 5 | The window | the panel drawn from the schema; `type:` in search; the type's name above the properties; every new text in both catalogs; names on the new controls ([ADR 0035](../adr/0035-cross-cutting-requirements.md)) | the walk of section 7, in both languages |
| 6 | `verso mcp` | `read_note` with the type and the typed properties; `list_notes` with an optional type; the descriptions | a recorded session: "which NPCs are allied with the party?" |
| later | Link kinds, after Q24's link part | the parser reports frontmatter links; the index counts them; rename plans rewrite them | a rename of a note a property links to |

Rows 5 and 6 change what a user sees, and each adds its line under "Unreleased"
in both changelogs (ADR 0051).

What it does not need:

- **No new dependency.** YAML goes through `saphyr`, already in
  `verso-dialect`; a date picker is the web view's own `<input type="date">`.
- **No new guardrail in [ADR 0029](../adr/0029-guardrails-in-ci.md).** The
  existing feature guardrails reach the new code: fuzzing and round-trip in the
  parser, parameterized queries in the index, generated types in the contract,
  and the npm license gate if a package came in (none is expected).
- **No new write path.** A declared key filled in the panel is the same one-key
  change the panel makes today (`app-decision.md` §5), and creation goes through
  templates. Exit criterion 2 of the phase meets no new kind of write, only new
  widgets on the old one.

One gap in the fixture contract, recorded rather than filled: a fixture tests
one `input.md`, and "this note is typed by that schema" involves two files — the
same gap [`fs-decision.md`](fs-decision.md) and
[`mcp-decision.md`](mcp-decision.md) record for their crates. Until a layout for
two files exists, typing is tested in the core's tests, and the fixtures cover
the schema block alone.

## 9. Not for decision here

- **Q10, typed relation**, and **Q9, per-block visibility**: untouched.
- **Q24's other parts** — a BOM, `...`, the YAML version, `tags: 2024` — and its
  link part, which section 6 recommends deciding next.
- **The structured-views primitive**
  ([ADR 0014](../adr/0014-primitives-catalog.md), Proposed): a table of NPCs is
  a view; section 4.3 says what accepting 0013 would require of views, not what
  they look like.
- **Packs** ([ADR 0015](../adr/0015-schema-packs.md), Proposed): under the
  recommended format a pack is a folder of notes, and nothing more is designed
  here. Where a pack comes from, how its integrity is checked and how an update
  shows its diff stay open ([ADR 0047](../adr/0047-plugin-api-open-questions.md)).
- **Layered configuration**
  ([ADR 0021](../adr/archive/0021-sync-automerge-layered-config.md), Proposed) and
  sync: out of scope until Phase 2 ends
  ([ADR 0034](../adr/0034-roadmap-in-phases.md)).
- **Write provenance and periodic notes** (ADR 0014): still Proposed.
- **Multi-root** ([ADR 0041](../adr/0041-multi-root-workspace.md), Proposed):
  one root, as today; whether a schema of one root types a note of another is
  for that ADR.
- **The Foundry VTT integration**
  ([ADR 0036](../adr/0036-tabletop-rpg-support.md)): a plugin, after Phase 2.
- **Opaque handles** ([ADR 0044](../adr/0044-verso-fs-semantics.md)): untouched;
  a schema's note is named by its relative path, like every note.

## 10. Contradictions and gaps found

Recorded, not resolved (`CLAUDE.md` §1, rule 3).

1. **Where schemas live.** Briefing §5.3 — and ADR 0014 and spec §6 after it —
   puts a schema in "a text file in the folder"; briefing §8 — and ADR 0021
   after it — puts schemas in the **shared layer of the configuration**, and
   ADR 0011 puts configuration outside the tree. Q11 records the tension with D2
   (ADR 0011); it does not record the §8 and 0021 side. A reading reconciles
   them — schemas in the folder are shared because the folder is — and it is
   not decided.
2. **The form of the promotion.** The roadmap asks for "an ADR of their own" (a
   new ADR); ADR 0014 for the typed-note row's own ADR; ADR 0049 and
   `app-decision.md` §10 for 0013 and 0014 "accepted" — literally, the whole
   catalog; the ADR index promotes a Proposed in place (section 4.1).
3. **ADR 0013's "views", once accepted.** Its consequence "Views have to be able
   to materialize their output as real Markdown in the file" reads, literally,
   on every view the window already has — graph, backlinks, search, folder
   view — and none of them can. Not a contradiction while 0013 is Proposed; one
   on acceptance, unless the word is delimited (section 4.3).
4. **The configurable ignore list.** ADR 0044 decided one "in the
   configuration directory outside the tree", and ADR 0045 calls it "available
   as a blunt second line of defence"; the core hands `verso-fs` an empty list
   and reads no file for it (`Workspace::open`). The rule holds — the list is
   empty by default — but nothing can make it non-empty yet.
5. **A claim about Obsidian in the window's code.** A comment in
   `app/ui/src/props.ts` says that YAML "1.1 readers such as Obsidian's" read
   certain scalars as numbers, which no admissible source in the repository
   records
   ([ADR 0009](../adr/0009-external-constraints.md)); the parser reads YAML 1.2,
   and Q24 leaves the version open. The code quotes such values anyway, which is
   the safe side either way.
6. **Property links.** Obsidian counts a link inside a property in backlinks
   since 1.4 (section 3); Verso's parser, index and rename plans do not see one.
   It is recorded in the Phase 2 review and under Q24; typed notes make it more
   visible (section 6).

## 11. What this memo did not verify

- **No code was written or compiled.** The build list of section 8 comes from
  reading the code at `6cc0714`, not from trying it.
- **Nothing was observed in the running Obsidian for this memo.** Section 3
  comes from public pages and the public API, fetched on 2026-09-24. Not
  observed: how Obsidian shows a `verso-schema` block (taken to be a plain code
  block, since no page read gives that language a meaning), how its properties
  area shows a nested value, where it keeps a property name's type, whether it
  rewrites a property's link when the target is renamed, whether it reads YAML
  1.1 or 1.2, and how it shows a value that does not match the type it holds for
  that name.
- **The maintainer's campaign vault was not read.** How it uses `type:` today,
  and which property names and types it already has, is unknown. If its notes
  already say `type: npc`, they become typed the moment a schema named `npc`
  exists — which is the point, and which the maintainer should know before
  writing the first schema.
- **No fixture was drafted.** A fixture that answers Q11 enters only in the PR
  that closes it (invariant 17); drafting one before the format is chosen would
  draft the wrong one.
- **Nothing was measured.** Typing at query time is a join between a column and
  a small table; its cost on the benchmark's synthetic vault is unknown
  ([ADR 0039](../adr/0039-performance-targets.md), whose targets are open
  anyway).
- **How often an example block would be pasted into a real note** — the risk of
  location (iii) — was not estimated.
- **The date and date-time widgets were not tried** in the Tauri web view; that
  `<input type="date">` works there is taken from WebKit's public support, not
  from a test.

## 12. How the maintainer decides and verifies, without reading code

**Check that this change is what it says it is.** The branch is local; it was
not pushed.

The memo and the draft ADR came in three commits of the local stack, among
others that are not this subject: the memo's (`403c0d8`) and the reading's
(`a920383`), which touch the same six files, and `d676c54`, which corrected
this section and section 13 in the memo and its twin. The maintainer's
decision was recorded after them, and a second reading's corrections after
that. All under `docs/`:

```
git show --stat 403c0d8 a920383 d676c54                      # six, six and two files, all under docs/
git log --oneline -- docs/reference/typed-note-decision.md   # every commit that touched the memo
bash scripts/check-docs-mirror.sh                            # "docs mirror: ok"
bash scripts/check-fixtures.sh                               # fixtures untouched; the lint still passes
git log -1 --format='%an <%ae>%n%b' a920383                  # author and Signed-off-by are yours
```

**Decide, in seven lines:**

1. **The typed note:** accept the draft [ADR 0052](../adr/0052-typed-note.md),
   change it, or not now. The author recommends accepting it with section 4.2's
   answers — the value a key, compared as Q12 compares names.
2. **Degradation:** (A) ADR 0013 as written, with "views" and "structured data"
   delimited, or (B) for typed notes only. Recommended: A.
3. **The form:** (i), (ii) or (iii). Recommended: (ii).
4. **Q11, the format:** (a), (b), (c) or (d). Recommended: (c), a
   `verso-schema` block in a note; (b) as the cheaper variant.
5. **Q11, the location:** (i), (ii), (iii) or (iv). Recommended: (iii),
   anywhere but hidden and ignored paths.
6. **Two schemas with one name:** (α), (β) or (γ). Recommended: (α).
7. **Link kinds in the first slice:** (a) or (b). Recommended: (a), with Q24's
   link part as the next memo.

Answered on 2026-09-24: all seven as recommended (the header).

**What the closing PR records, if the recommendations are accepted:**

| Where | What it gains |
|---|---|
| [ADR 0052](../adr/0052-typed-note.md) | Decision and Status edited in place: Accepted, with the maintainer's words and date, citing the commit or pull request in which they decided; the options set aside move to its Discarded alternatives |
| [ADR 0013](../adr/0013-degrades-to-markdown.md) | Decision and Status edited in place: Accepted, citing the commit or pull request in which the maintainer decided; the two delimitations in its Consequences, with a `Revisions:` line |
| [ADR 0014](../adr/0014-primitives-catalog.md) | the typed-note row points at 0052; a Revisions line |
| [ADR 0018](../adr/0018-llm-native-mcp-in-core.md) | the consequence on query by type points at 0052 |
| [ADR index](../adr/README.md) | the rows of 0013 and 0052 |
| [Spec](../spec/dialect.md) | Q11 closed with the answer; §6's rows for the typed note and the schemas; §4.1's new key; §8's new fixture category; a history line |
| `fixtures/` | the `schema/` cases, approved in that PR, each listed in `crates/verso-dialect/tests/fixtures.rs`; the new key in `scripts/check-fixtures.sh` |
| [Roadmap](../roadmap.md) | the two Phase 2 rows struck through; item 2.6 "decided, not built" |
| `docs/BRIEFING.md` and its pt-BR original | status changes only, in its History: §5.3's typed-note row, §11.3's line on schema format and location, §17 item 7 |
| [ADR 0021](../adr/archive/0021-sync-automerge-layered-config.md) | the contradiction of section 10, item 1, as the maintainer words it |

**What stays open**, so that deciding seven lines does not look like deciding
more: Q10, Q9, Q24 (the link part first), the views primitive, packs, layered
configuration, provenance, periodic notes, multi-root, a fixture layout for two
files, and the opaque handles.

## 13. The reading

A fresh Opus 5.5 session read this memo, the draft ADR 0052, their pt-BR twins
and the ADR index's two rows, standing in for Fable 5.1 by the maintainer's
decision of 2026-09-23 (header). Its findings, under its labels, and what was
done with each:

| Finding | Level | What was done |
|---|---|---|
| I5 — ADR 0052 put the schema "in the open folder" (point 3, the first Consequence), which takes briefing §5.3's side against §8 and ADR 0021 (section 10, item 1) and leaves out location (iv) while calling Q11 open | IMPORTANT | Point 3 of the ADR gives the format and the location as Q11, `[OPEN]`, records both places the documents put schemas, and takes no side; the first Consequence and the title no longer place the schema, nor does section 4.3 here |
| I6 — ADR 0052 entered Proposed, a status that mirrors the briefing, on Decision text the AI drafted | IMPORTANT | `[OPEN]`, a draft for the maintainer, in the ADR, its twin and both index rows, as ADRs 0044 to 0048 entered; the Decision's opening says what restates the briefing (§5.3, §11.3) and what is this memo's recommendation, the "one text" rule and "nothing is reported" among it (section 4.2 (a)) |
| The header named Fable 5.1 as the reader | IMPORTANT | The header names the reader and the maintainer's decision; this section |
| M1 — `tag`, `alias` and `cssclass` "deprecated in 1.9" | MINOR | Deprecated in 1.4 and dropped as default properties in 1.9, both from the Properties page, the first also from the 1.4 changelog (section 3) |
| M5 — pt-BR terms in the twin | MINOR | "modo source" is "modo fonte", as the roadmap and the window say; "Memo de decisão", "Status:" and "o ADR" were already in use, and the twin names no test release |
| M6 — a fixture category put in spec §4, "which `scripts/check-fixtures.sh` learns" | MINOR | Sections 8 and 12: the new key in §4.1, which the script learns; the category among §8's; each fixture listed in `crates/verso-dialect/tests/fixtures.rs` |
| M7 — "Q12 before feature 3" | MINOR | Section 1: Q12 closed with feature 3's code already written |
| M8 — query by type called "the one agent capability Phase 1 postponed" | MINOR | Section 1: agent writing is outside Phase 1 too, with no phase |
| M9 — the closing plan cited no commit or pull request, and gave ADR 0013 no `Revisions:` line | MINOR | Section 12: both, as the ADR index requires |
| M10 — a note among ADR 0052's discarded alternatives | MINOR | Moved to its Status |

The labels are the reading's own, and it read three other memos in the same
pass: the numbers this table skips, and the reading's one BLOCKING finding,
are those memos' — `beta-config-decision.md`, `handles-decision.md` and
`embedded-media-decision.md`, corrected in `eafd9e8`. These changes have not
been read yet.

A second reading, by a fresh Opus 5.5 session on 2026-09-24, found three
MINOR, resolved after the maintainer's decision: ADR 0052 said it entered
`[OPEN]` "like ADRs 0044 to 0048", which entered with questions only, on
subjects the briefing does not have — its Context now says so, and row I6
above overstates the precedent the same way; section 12 said the memo came in
two commits, where `d676c54` is a third — now three, with the decision after
them; and ADR 0052's Consequence that a schema is read "inside the fuzzed
parser" holds only for a schema inside a note, formats (b) and (c), which the
decided format (c) is — now said there.
