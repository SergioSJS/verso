# Observations of Obsidian for nine open questions of the dialect spec

- Date: 2026-09-24
- Status: **not decided.** Nothing here is a decision. For nine `[OPEN]`
  questions of [`docs/spec/dialect.md`](../spec/dialect.md) §9 (Q2, Q14, Q19,
  Q20, Q24, Q7, Q4, Q21 and Q23, in that order of priority), the memo records
  what Obsidian 1.13.7 does on inputs written for them, what Verso does on the
  same inputs, and one recommendation per question, labelled as such. The
  maintainer decides (`CLAUDE.md` §1). No `[OPEN]` is closed here, the spec is
  not changed and `fixtures/` is not touched: the draft fixtures are text in
  this memo, because a fixture that answers an open question enters only in
  the PR that closes it (`CLAUDE.md` invariant 17,
  [ADR 0031](../adr/0031-fixtures-as-contract.md)).
- Observed with: Obsidian 1.13.7 (installer 1.11.5), macOS, on 2026-09-24, in a
  throwaway folder of the maintainer's `Sandbox` vault, which runs with the
  default settings. The folder was deleted afterwards (section 2.3).
- Admissible by [ADR 0009](../adr/0009-external-constraints.md): the Obsidian
  CLI (normal use of the app), `eval` on the public API declared in
  `obsidian.d.ts`, and the public documentation at `obsidian.md/help`. Nothing
  comes from inspecting the app, and the window was not driven: no note was
  opened in it, nothing was clicked.
- Verso: `6cc0714` (v0.2.0-beta.1, the head of `main`), run on a copy of the
  same inputs outside the vault, with a scratch configuration directory.
- Author: Opus 5.5 (documents, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Reader: a fresh Opus 5.5 session, standing in for Fable 5.1 by the
  maintainer's decision of 2026-09-23 (`../review/phase-2.md` §6, item 17) —
  the model that wrote the memo, the departure from ADR 0032 that decision
  accepts. Its findings, and what was done with each, are in section 16. No
  Rust and no fixture in this change.
- Sources read: spec §4, §5.1, §5.6, §5.7, §5.10, §5.12, §5.13 and §9;
  ADR 0009, [ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md) and
  ADR 0031; [`obsidian-cli.md`](obsidian-cli.md);
  [`index-decision.md`](index-decision.md) §4, whose observations this memo
  does not repeat; the fixtures and their harness
  (`crates/verso-dialect/tests/fixtures.rs`).

## 1. What this memo is for

Nine questions of the spec are open with an answer that is, at least in part,
"what Obsidian does": invariant 12 says Verso extends the Obsidian dialect and
never contradicts it. This memo gathers that evidence, so that each question
can be put to the maintainer with the facts in front of them, the way
`index-decision.md` §4 did for Q12.

Each question has the same parts: the inputs; what Obsidian did, with the
commands and their output; what Verso does now; whether the two agree, with a
recommendation for the maintainer; and a draft fixture when one fits the schema
of spec §4. Section 3 is the summary, section 13 lists what turned up along the
way for other questions, section 14 what could not be observed and why, and
section 15 how the maintainer decides — and repeats any line of this — without
reading code. Section 16 records the reading of this memo.

Q8 was observed before (spec §9, Q8) and is not repeated; Q12 is closed and its
rule is taken as given.

## 2. How the observations were made

### 2.1 Obsidian

- The app was running; `obsidian version` answered `1.13.7 (installer 1.11.5)`.
  The CLI is on `PATH` in a login shell ([`obsidian-cli.md`](obsidian-cli.md)
  §2), and every command carried `vault=Sandbox`. `obsidian vault vault=Sandbox`
  gave the vault's path. Its `.obsidian/app.json` is `{}`, so every setting is
  Obsidian's default — "Use `[[Wikilinks]]`" included, which changes how the app
  writes links, not how it reads them. Two community plugins were enabled
  there and left on, `obsidian-livesync` and `task-list-kanban`. What they do
  with notes was not checked — a kanban of tasks reads notes to find its
  tasks, and LiveSync copies them to its remote (section 2.3) — and neither
  was whether either changes what the metadata cache reports.
- Baseline before the run: 8 files, one folder (`assets`), one unresolved target
  (`create a link`, 2 links).
- The inputs were written as plain files, byte for byte, into a new folder
  `verso-fixtures/`, one sub-folder per question, and every name was prefixed
  with its question (`q2-alvo`, `q20-src`…), so that a bare name has exactly one
  candidate in the vault. At the peak: 72 notes and 3 one-pixel PNG images.
  Names and link text in NFD were written with explicit escapes; APFS keeps the
  form it is given (`ls | xxd` shows `61 cc 83` — `a` plus a combining tilde —
  for the `ã` of `q7-Pão.md`).
- Queries: the CLI's own commands — `links`, `backlinks … format=json counts`,
  `unresolved verbose counts`, `orphans`, `deadends`, `tags`, `tag`, `aliases`,
  `properties`, `outline` — and `eval` on the public API:
  `app.metadataCache.getCache(path)` (its `links`, `embeds`, `frontmatterLinks`,
  `headings`, `blocks`, `sections`, `listItems`, `tags`, `frontmatter`,
  `frontmatterPosition`), `app.metadataCache.resolvedLinks` and
  `unresolvedLinks`, `app.metadataCache.getFirstLinkpathDest(linkpath, source)`,
  `app.vault.getFiles()` and `app.vault.getAbstractFileByPath(path)`. The `eval`
  code went to the binary as one argument, from a small script outside the
  repository, to avoid shell quoting. A query ran only once `getCache` answered
  for every probe note and every note was a key of `resolvedLinks`.
- What `eval` cannot reach: `require("obsidian")` answers
  `Error: Cannot find module 'obsidian'`, so the functions that module exports —
  `resolveSubpath`, `parseLinktext`, `getAllTags`, `parseFrontMatterTags` and
  the rest — were out of reach. Section 14 says what that leaves unobserved.
- Obsidian's positions are 0-based (`line 0 col 5`); spec §4.4 positions and the
  "line" columns of the tables below are 1-based.
- Public documentation read on 2026-09-24 at `obsidian.md/help`: "Internal
  links", "Embed files", "Properties", "Tags", "Aliases", "Basic formatting
  syntax", "Obsidian Flavored Markdown", "Graph view" and "Backlinks". Quoted
  where used.

### 2.2 Verso

- Built in this worktree (`cargo build -p verso-cli`); `verso --version`
  answers `0.2.0-beta.1 (6cc0714)`.
- The same inputs were copied to a scratch folder outside the vault — `diff -r`
  against the vault's folder found no difference — and indexed with
  `VERSO_CONFIG_DIR` pointing at a scratch directory, never the default one:
  `verso index <copy>`, `verso backlinks <copy> <note> --json`,
  `verso backlinks <copy> --unresolved --json`, and the `links` tool of
  `verso mcp <copy>`, which lists each link of a note with what it resolves to.
- The parser's own report (`verso_dialect::parse`: frontmatter, headings,
  links, embeds, blocks) came from a throwaway program outside the repository
  that links the crate by path, with the workspace's `Cargo.lock` and
  pulldown-cmark revision. It reads a file's bytes as the core decodes them, so
  a BOM reaches the parser as the core would hand it over.
- The Phase 2 window was not run. Where this memo says what the window does, it
  is read from `app/ui/src/main.ts`, and the sentence says so.

### 2.3 What was left in the vault

`verso-fixtures/` was deleted at the end and is gone: `ls` does not show it, and
the CLI answers `files 8`, `folders 1` and the baseline's single unresolved
target. One trace remains, written by Obsidian itself: when the files appeared,
the app added their paths and sub-folders to `lastOpenFiles` in
`.obsidian/workspace.json` (39 entries, written at 01:34). This session did not
open, edit or revert that file; the entries name files that no longer exist, in
the app's own list of recent files. Nothing else outside the throwaway folder
changed: `find .obsidian -newer <start of the run>` lists `workspace.json`
only. Any run by this method should be expected to do the same;
`obsidian-cli.md` §5 does not say so.

Not checked, and for the maintainer: `obsidian-livesync` is enabled in that
vault, so the 72 notes and 3 images — and then their deletion — may have
been sent to its remote database and on to any other device synced with it.
Whether they were, and what a deletion leaves there, is to be looked at in
LiveSync, not in the vault.

## 3. Summary

| Question | Observed | Verso now, against Obsidian | Recommendation, for the maintainer |
|---|---|---|---|
| Q2 — an embed as a link | yes | agrees for notes (backlink, graph edge); an embedded image stays an unresolved target in the index (Q16) | an embed counts as a link, a backlink and a graph edge, as observed |
| Q14 — a missing target | yes | agrees: kept with its count, never a backlink, resolved once the note exists; lists case variants as one row where Obsidian lists two; not a graph node | keep it; state how the list groups spellings and whether the graph shows missing targets |
| Q19 — heading matching | the parsing, yes; which heading a link reaches, no | agrees on the heading text and on the nested path; does not see setext headings | setext headings are headings; `heading` keeps a nested path as written; the matching rule waits for a check by hand |
| Q20 — Markdown links | yes | differs: neither parsed nor indexed | count them as links, `syntax: markdown`, by the rules observed |
| Q24 — the frontmatter | yes | agrees on CRLF, YAML 1.2 and invalid YAML; differs on a BOM, an empty block, a duplicate key, an empty value, number and string `tags`, links in properties, and a block closed by `...` or with spaces after its `---` lines, whose lines Verso reads as neither frontmatter nor body | follow Obsidian on each point |
| Q7 — NFC and NFD | yes | agrees on resolution and on the unresolved list; the CLI does not find an NFD-named note from an NFC argument | compare after NFC, as the index does, at the CLI's argument too |
| Q4 — the `^id` scope | yes, except which duplicate a click reaches | agrees: per note, every definition reported as written | unique per note, case-insensitive, and the last of a duplicate |
| Q21 — what a block is | yes | recognizes the same ids except on a heading and before trailing spaces; says nothing of which block an id names | a block is a section or a list item, as observed |
| Q23 — combined forms | yes | agrees on 18 of 30 forms, differs on 11, and one is undocumented; two rows go against the wording of closed Q12 (section 12.3) | follow Obsidian's reading of the eleven — one point of which would amend Q12 |

---

## 4. Q2 — does an embed count as a link, in the graph and in backlinks?

### 4.1 Inputs

In `verso-fixtures/q2/`:

```text
q2-alvo.md             # Alvo Q2 / ## Seção / Parágrafo com id. ^bloco
q2-so-link.md          Só um link: [[q2-alvo]].
q2-so-embed.md         ![[q2-alvo]]
q2-so-embed-secao.md   ![[q2-alvo#Seção]]
q2-so-embed-bloco.md   ![[q2-alvo#^bloco]]
q2-link-e-embed.md     Link [[q2-alvo]] e embed:   (a blank line)   ![[q2-alvo]]
q2-alvo-e.md           Nota só embutida, nunca linkada.
q2-src-e.md            ![[q2-alvo-e]]
q2-img.png             a 1×1 PNG
q2-so-embed-img.md     ![[q2-img.png]]
q2-so-link-img.md      [[q2-img.png]]
q2-orfa.md             Nota sem nada.
```

### 4.2 What Obsidian did

| Command | Result |
|---|---|
| `getCache(p).links` and `.embeds` | two separate lists: `q2-link-e-embed` has one entry in `links` (line 0 col 5) and one in `embeds` (line 2 col 0) |
| `resolvedLinks` of the three embed-only notes | `{"verso-fixtures/q2/q2-alvo.md": 1}` each — the whole note, a heading and a block alike |
| `resolvedLinks["…/q2-link-e-embed.md"]` | `{"verso-fixtures/q2/q2-alvo.md": 2}`: the link and the embed |
| `backlinks path=verso-fixtures/q2/q2-alvo.md format=json counts` | `q2-link-e-embed` 2, `q2-so-embed-bloco` 1, `q2-so-embed-secao` 1, `q2-so-embed` 1, `q2-so-link` 1 |
| `backlinks path=…/q2-alvo-e.md` | `q2-src-e` 1: a note that is only embedded has a backlink |
| `links path=…/q2-so-embed.md` | `verso-fixtures/q2/q2-alvo.md` |
| `backlinks path=…/q2-img.png` | `q2-so-embed-img` 1, `q2-so-link-img` 1 |
| `orphans` ("files with no incoming links") | lists `q2-orfa` and the source notes; not `q2-alvo-e` |
| `deadends` ("files with no outgoing links") | lists `q2-alvo`, `q2-alvo-e` and `q2-orfa`; not `q2-src-e`, whose only outgoing reference is an embed |

The graph view itself was not looked at (section 14). The "Graph view" page says
that "Lines represent Internal links between two nodes" and names no rule for
embeds. `resolvedLinks`, `orphans` and `deadends` are what the app's own index
reports, and all three count the embed.

### 4.3 What Verso does now

- `verso backlinks <copy> verso-fixtures/q2/q2-alvo --json` lists six rows, one
  per occurrence: the link and the embed of `q2-link-e-embed` (`embed: false` at
  1:6, `embed: true` at 3:1), the three embed-only notes (`embed: true`) and
  `q2-so-link`. `q2-alvo-e` has one backlink, from `q2-src-e`, `embed: true`.
- The graph the window draws is every resolved link between two notes, embeds
  included (`Index::graph` in `crates/verso-index/src/store.rs`, which the
  window's graph view calls; read from the code).
- An image is not a note: `verso backlinks … q2-img.png` answers "unknown
  note", and `--unresolved` lists `q2-img.png` with count 2, the embed and the
  link. That is Q16, and the spec records it there.

### 4.4 Agreement and recommendation

For notes they agree: an embed resolves like a link and is a backlink of its
target — embeds of a heading or a block of that note included — and an edge of
the graph. Verso keeps one row per occurrence and marks the embed; Obsidian's
CLI shows one row per source, with a count that adds the two. That is
presentation, not meaning. They differ on attachments: Obsidian resolves
`![[q2-img.png]]` and `[[q2-img.png]]` to the image and lists both notes as its
backlinks, while Verso's index keeps them unresolved. That difference belongs
to Q16.

**Recommendation, for the maintainer to decide:** close Q2 as the code does it —
an embed counts as a link, in backlinks and in the graph, and keeps its embed
mark — and leave attachments to Q16. Point 5 of the closed Q12 already says an
embed "counts as a link"; this adds backlinks and the graph, with an
observation behind them.

### 4.5 Draft fixture

None fits. Whether something counts as a link, a backlink or a graph edge is
resolution, and spec §4.6 says the schema has no field for it; a `verso-index`
fixture has no schema yet ([`index-decision.md`](index-decision.md) §8).
`fixtures/embed/simple` already asserts that an embed is reported as an embed.
Until an index fixture exists, a Rust test in `verso-index` is where this
behaviour is pinned.

---

## 5. Q14 — a link to a file that does not exist

### 5.1 Inputs

`verso-fixtures/q14/q14-src-a.md`, one construct per paragraph:

```markdown
Duas vezes: [[q14-nao-existe]] e [[q14-nao-existe]].

Outra caixa: [[Q14-Nao-Existe]].

Com extensão: [[q14-nao-existe.md]].

Com seção: [[q14-nao-existe#Seção]].

Com bloco: [[q14-nao-existe#^bloco]].

Com pasta: [[q14-pasta/q14-nao-existe]].

Embed: ![[q14-nao-existe]]

Imagem: ![[q14-imagem-nao-existe.png]]

Vai virar nota: [[q14-vira-nota]].
```

Also `q14-src-b.md` (`Outra fonte: [[q14-nao-existe]].`) and `q14-so-quebrado.md`
(`Só um link quebrado: [[q14-outro-nao-existe]].`). Later in the run,
`q14-vira-nota.md` was created and then deleted.

### 5.2 What Obsidian did

`unresolvedLinks["verso-fixtures/q14/q14-src-a.md"]`:

```json
{"q14-nao-existe": 6, "Q14-Nao-Existe": 1, "q14-pasta/q14-nao-existe": 1,
 "q14-vira-nota": 1, "q14-imagem-nao-existe.png": 1}
```

`obsidian unresolved verbose counts`, the lines of this folder:

```text
q14-imagem-nao-existe.png   1   verso-fixtures/q14/q14-src-a.md
q14-nao-existe              7   verso-fixtures/q14/q14-src-a.md, verso-fixtures/q14/q14-src-b.md
Q14-Nao-Existe              1   verso-fixtures/q14/q14-src-a.md
q14-outro-nao-existe        1   verso-fixtures/q14/q14-so-quebrado.md
q14-pasta/q14-nao-existe    1   verso-fixtures/q14/q14-src-a.md
q14-vira-nota               1   verso-fixtures/q14/q14-src-a.md
```

What that shows:

- a missing target is kept, keyed by its text without `.md` and without the
  `#…` part: the two plain links, `[[q14-nao-existe.md]]`, the `#Seção` and
  `#^bloco` links and the embed all land on `q14-nao-existe` — 6 in the note,
  7 in the vault;
- the key keeps its case: `Q14-Nao-Existe` is a row of its own, although one
  note named either way would answer both (Q12 resolves case-insensitively);
- an embed of a missing image is kept the same way;
- `obsidian links path=…/q14-src-a.md` lists each spelling as written, with
  `(unresolved)` after it — `q14-nao-existe.md` included;
- `obsidian backlinks file=q14-nao-existe` answers
  `Error: File "q14-nao-existe" not found.`: a missing file has no backlinks to
  ask for;
- `deadends` lists `q14-src-a`, `q14-src-b` and `q14-so-quebrado`: a link to a
  missing note is not an outgoing link in that sense.

Creating `q14-vira-nota.md` moved the link at once: `resolvedLinks` of
`q14-src-a` became `{"verso-fixtures/q14/q14-vira-nota.md": 1}`,
`q14-vira-nota` left `unresolvedLinks`, and the new note's `backlinks` listed
`q14-src-a`. Deleting the file put `q14-vira-nota: 1` back in
`unresolvedLinks` within seconds.

The graph view was not looked at. The "Graph view" page describes a filter that
implies missing targets are drawn unless it is on: "Existing files only:
toggles whether to show notes that exists in your vault. Since a note doesn't
need to exist to link to it, this can help limit your graph to notes that you
actually have in your vault."

### 5.3 What Verso does now

- `verso backlinks <copy> --unresolved --json` lists `Q14-Nao-Existe` with
  count 8 — one row for everything the folded key joins (case, `.md`, `#…`,
  the embed), shown under the smallest spelling in byte order — then
  `q14-imagem-nao-existe.png` 1, `q14-outro-nao-existe` 1,
  `q14-pasta/q14-nao-existe` 1 and `q14-vira-nota` 1.
- The `links` tool of `verso mcp` gives all ten links of `q14-src-a` with
  `resolved: null`.
- Creating `q14-vira-nota.md` in the copy and running `verso index` again: the
  backlink appeared and the target left the unresolved list; deleting it and
  indexing again put it back.
- The window's graph draws resolved links only, so a missing target is not a
  node (`Index::graph`, read from the code).

### 5.4 Agreement and recommendation

They agree on everything that decides meaning: a missing target is kept with
its text and a count, is never a backlink, and resolves as soon as a note
answers it. They differ in two matters of presentation: Obsidian lists
`q14-nao-existe` (7) and `Q14-Nao-Existe` (1) apart where Verso lists one row
(8); and Obsidian's graph, by its documentation, draws missing targets unless a
filter is on, where Verso's never does.

**Recommendation, for the maintainer to decide:** close Q14 as the code does it
— a pending target with its text and count, never a backlink, resolved when the
note appears — and answer the two smaller points. On the list: keep Verso's
grouping, since resolution is case-insensitive and one note settles the whole
row. On the graph: draw missing targets as Obsidian's documentation describes,
with a filter, the next time the graph is worked on.

### 5.5 Draft fixture

None fits, for the reason of section 4.5: this is resolution, outside the
dialect schema.

---

## 6. Q19 — how a link matches a heading

### 6.1 Inputs

`verso-fixtures/q19/q19-alvo.md`:

```markdown
# Cap 1

## Seção

Texto um.

# Cap 2

## Seção

Texto dois.

## Porão: a entrada

## *Ênfase* e **forte**

## Link [[q19-outra]] no título

## 🍺 Bar do Zé

## Café   com   espaços

## C# e F#

## Pergunta?

## Barra | vertical

## Final com fechamento ##

## Dup

Primeiro dup.

## Dup

Segundo dup.

Setext nível um
===============

Setext nível dois
-----------------

### Caixa MiStUrAdA

####### Sete cerquilhas

#Sem espaço

## Título com `código`
```

`verso-fixtures/q19/q19-src.md`, the 24 links below in this order, each in a
paragraph of its own (`q19-outra.md` exists too):

```text
[[q19-alvo#Seção]]
[[q19-alvo#seção]]
[[q19-alvo#SEÇÃO]]
[[q19-alvo#Cap 2#Seção]]
[[q19-alvo#Cap 1#Seção]]
[[q19-alvo#Cap 2]]
[[q19-alvo#Porão: a entrada]]
[[q19-alvo#Porão a entrada]]
[[q19-alvo#*Ênfase* e **forte**]]
[[q19-alvo#Ênfase e forte]]
[[q19-alvo#Link q19-outra no título]]
[[q19-alvo#🍺 Bar do Zé]]
[[q19-alvo#Café com espaços]]
[[q19-alvo#Café   com   espaços]]
[[q19-alvo#C# e F#]]
[[q19-alvo#Pergunta?]]
[[q19-alvo#Final com fechamento]]
[[q19-alvo#Dup]]
[[q19-alvo#Setext nível um]]
[[q19-alvo#Setext nível dois]]
[[q19-alvo#caixa misturada]]
[[q19-alvo#Título com código]]
[[q19-alvo#Não existe]]
[[q19-alvo#Seção#Não existe]]
```

### 6.2 What Obsidian did

Headings of `q19-alvo`, from `getCache(...).headings` and `obsidian outline`,
next to Verso's parser:

| Input | Obsidian | Verso's parser |
|---|---|---|
| `# Cap 1`, `## Seção`, `# Cap 2`, `## Seção` | four headings, levels 1, 2, 1, 2 | the same |
| `## Porão: a entrada` | `Porão: a entrada` | the same |
| `## *Ênfase* e **forte**` | `*Ênfase* e **forte**`: the formatting kept as written | the same |
| `## Link [[q19-outra]] no título` | `Link [[q19-outra]] no título`; the wikilink also counts as a link of the note | the same |
| `## 🍺 Bar do Zé`, `## C# e F#`, `## Pergunta?` | as written | the same |
| `## Café   com   espaços` | the three spaces kept | the same |
| `## Barra \| vertical` | `Barra \| vertical` | the same |
| `## Final com fechamento ##` | `Final com fechamento`: the closing `##` dropped | the same |
| `## Dup`, twice | two headings | the same |
| `Setext nível um` over `===` | a heading, level 1, its section spanning both lines | **not a heading** |
| `Setext nível dois` over `---` | a heading, level 2 | **not a heading** |
| `### Caixa MiStUrAdA` | as written | the same |
| `####### Sete cerquilhas` | not a heading | the same |
| `#Sem espaço` | not a heading; the tag `#Sem` | not a heading |
| `` ## Título com `código` `` | `` Título com `código` ``: the backticks kept | the same |

Links of `q19-src`, from `getCache(...).links`: `link` keeps all the text inside
the brackets (`q19-alvo#Cap 2#Seção`) and `displayText` shows how the app reads
it; Verso's parser puts everything after the first `#` in `heading`:

| Link | `displayText` | Verso's `heading` |
|---|---|---|
| `[[q19-alvo#Seção]]` and the other links with one `#` | `q19-alvo > Seção`: the text as written | `Seção`: as written |
| `[[q19-alvo#Cap 2#Seção]]` | `q19-alvo > Cap 2 > Seção` | `Cap 2#Seção` |
| `[[q19-alvo#Seção#Não existe]]` | `q19-alvo > Seção > Não existe` | `Seção#Não existe` |
| `[[q19-alvo#C# e F#]]` | `q19-alvo > C >  e F`: the heading's own `#` read as a separator | `C# e F#` |

`resolvedLinks["…/q19-src.md"]` is `{"verso-fixtures/q19/q19-alvo.md": 24}`,
and the `backlinks` of `q19-alvo` list `q19-src` with 24: every heading link
counts toward the note, `#Não existe` and `#Seção#Não existe` included, which
name no heading.

**Which heading each link reaches was not observed.** The public function that
resolves a subpath (`resolveSubpath`, in `obsidian.d.ts`) is out of reach of
`eval` (section 2.1); the CLI's `file=` does not take a subpath
(`obsidian read file=q19-alvo#Dup` answers
`Error: File "q19-alvo#Dup" not found.`); and following a link means clicking
in the maintainer's window. The documentation says only that "You can add
multiple hash symbols for each subheading" and that "A string which contains
the following characters may not work as a link: `# | ^ : %% [[ ]]`" ("Internal
links") — consistent with the `C# e F#` row above.

### 6.3 What Verso does now

- The parser reports ATX headings only ("Setext headings wait for Q19", in
  `crates/verso-dialect/src/lib.rs`), with their text as written. For a link it
  records `heading` as everything after the first `#` (`Cap 2#Seção`,
  `C# e F#`), which is the spec's rule until Q19 (§4.2).
- The index and the CLI ignore the heading when counting: 24 backlink rows, as
  in Obsidian.
- Only an embed matches a link's heading against a heading. Read from the
  code: `![[nota#seção]]` keeps the section whose rendered heading text equals
  the link's text, both trimmed and lower-cased, taking the first such heading
  (`sliceHeading`, `app/ui/src/main.ts`); the window's `follow()` opens the
  note and does not move to the heading; and the `[[Nota#` completion inserts
  the heading's text as the index holds it.

### 6.4 Agreement and recommendation

They agree on the heading text (as written, closing `#`s dropped, formatting and
spaces kept), on duplicate headings being two headings, on the nested path kept
as one string, and on every heading link counting toward its note. They differ
on setext headings: Obsidian sees them and Verso's parser does not, so the
headings a note writes with `===` or `---` are in Obsidian's outline and missing
from Verso's.

**Recommendation, for the maintainer to decide**, in three parts:

1. **Setext headings are headings**, with the level of their underline, as
   Obsidian reads them (draft 6.5 a).
2. **`heading` keeps a nested path as written** (`Cap 2#Seção`), as the spec's
   interim rule does and as Obsidian's `link` field does (draft 6.5 b). How a
   nested path is matched belongs to part 3.
3. **The matching rule stays open until it is observed by hand.** Case,
   punctuation, formatting, spaces, emoji, duplicates, the nested path and
   setext headings are exactly what the 24 links of section 6.1 separate, and
   section 15 gives the procedure: about ten minutes in the Obsidian window.
   Until then nothing in Verso navigates to a heading, so nothing depends on the
   rule; the embed's case-insensitive match stays as it is, provisional.

Two facts for part 3, read from the code rather than observed: the completion
writes the heading's text as indexed — `[[q19-alvo#*Ênfase* e **forte**]]` —
while the embed compares with the rendered text, `Ênfase e forte`, so a link
Verso writes would not select the section in Verso's own embed; and a heading
that contains `#` gives a link that Obsidian reads as a nested path.

### 6.5 Draft fixtures

a) `fixtures/heading/setext/` — `input.md`:

```markdown
Taverna
=======

Porão
-----

## Adega ##

## *Barril* e **tonel**
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §6), awaiting the maintainer's approval (ADR 0031).
# Construct: setext headings, a closing sequence, inline formatting. Spec: docs/spec/dialect.md §5.12.
# Would answer the setext part of Q19, and only in the PR that closes it (rule 17).
# Fails today: the parser reports ATX headings only.
headings:
  - level: 1
    text: Taverna
    pos: { line: 1, col: 1 }
  - level: 2
    text: Porão
    pos: { line: 4, col: 1 }
  - level: 2
    text: Adega
    pos: { line: 7, col: 1 }
  - level: 2
    text: "*Barril* e **tonel**"
    pos: { line: 9, col: 1 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...).headings` ->
    "Taverna" level 1 at line 0 col 0, "Porão" level 2 at line 3 col 0,
    "Adega" level 2 at line 6 col 0, "*Barril* e **tonel**" level 2 at
    line 8 col 0 (0-based); `sections` -> heading 0-1, heading 3-4,
    heading 6, heading 8.
```

b) `fixtures/wikilink/nested-heading/` — `input.md`:

```markdown
Ele desceu ao [[Taverna#Andar de baixo#Porão]].
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §6), awaiting the maintainer's approval (ADR 0031).
# Construct: wikilink to a nested heading path. Spec: docs/spec/dialect.md §4.2, §5.4.
# Would answer what `heading` records for a nested path (Q19), and only in the PR
# that closes it (rule 17). Says nothing about which heading the link reaches.
# Passes today.
links:
  - target: Taverna
    heading: "Andar de baixo#Porão"
    pos: { line: 1, col: 15 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...).links` ->
    link "Taverna#Andar de baixo#Porão",
    displayText "Taverna > Andar de baixo > Porão", start line 0 col 14.
```

---

## 7. Q20 — Markdown links to a local file

### 7.1 Inputs

`verso-fixtures/q20/` holds `q20-alvo.md` (`# Alvo Q20`, `## Porão`,
`Texto. ^bloco`), `q20 alvo com espaço.md`, `q20-img.png` and `q20-src.md`: the
26 constructs of the table in section 7.2, each in a paragraph of its own and in
that order, followed by the reference definition `[r1]: q20-alvo.md`. The
sub-folder `sub/` holds `q20-sub-src.md`, with three links in three paragraphs:

```markdown
[acima](../q20-alvo.md)

[da raiz](verso-fixtures/q20/q20-alvo.md)

[só o nome](q20-alvo.md)
```

### 7.2 What Obsidian did

From `getCache(...).links` and `.embeds`, and `getFirstLinkpathDest` on each
link's path:

| # | Input | Obsidian | Reaches |
|---|---|---|---|
| 1 | `[md simples](q20-alvo.md)` | link `q20-alvo.md`, display `md simples` | `q20-alvo.md` |
| 2 | `[sem extensão](q20-alvo)` | link `q20-alvo` | `q20-alvo.md` |
| 3 | `[caminho da raiz](verso-fixtures/q20/q20-alvo.md)` | link, as written | `q20-alvo.md` |
| 4 | `[barra inicial](/verso-fixtures/q20/q20-alvo.md)` | link `/verso-fixtures/q20/q20-alvo.md` | `q20-alvo.md` |
| 5 | `[ponto barra](./q20-alvo.md)` | link `./q20-alvo.md` | `q20-alvo.md` |
| 6 | `[codificado](q20%20alvo%20com%20espa%C3%A7o.md)` | link `q20 alvo com espaço.md`: decoded | `q20 alvo com espaço.md` |
| 7 | `[ângulos](<q20 alvo com espaço.md>)` | link `q20 alvo com espaço.md` | `q20 alvo com espaço.md` |
| 8 | `[espaço cru](q20 alvo com espaço.md)` | **not a link** | — |
| 9 | `[com seção](q20-alvo.md#Porão)` | link `q20-alvo.md#Porão` | `q20-alvo.md` |
| 10 | `[seção codificada](q20-alvo.md#Por%C3%A3o)` | link `q20-alvo.md#Porão`: the fragment decoded too | `q20-alvo.md` |
| 11 | `[com bloco](q20-alvo.md#^bloco)` | link `q20-alvo.md#^bloco` | `q20-alvo.md` |
| 12 | `[só âncora](#Porão)` | link `#Porão` | the note itself: `q20-src` is in its own backlinks |
| 13 | `[externo https](https://example.com/q20-alvo.md)` | not a link | — |
| 14 | `[mailto](mailto:ninguem@example.com)` | not a link | — |
| 15 | `[esquema obsidian](obsidian://open?vault=Sandbox&file=q20-alvo)` | not a link | — |
| 16 | `[file url](file:///tmp/q20-alvo.md)` | not a link | — |
| 17 | `[domínio sem esquema](example.com)` | **link `example.com`** | unresolved |
| 18 | `[não existe](q20-nao-existe.md)` | link | unresolved, key `q20-nao-existe` |
| 19 | `[caixa diferente](Q20-ALVO.md)` | link `Q20-ALVO.md` | `q20-alvo.md` |
| 20 | `[com título](q20-alvo.md "Título")` | link `q20-alvo.md`: the title dropped | `q20-alvo.md` |
| 21 | `[por referência][r1]`, with `[r1]: q20-alvo.md` | **not a link** | — |
| 22 | `<q20-alvo.md>` | not a link | — |
| 23 | `![imagem](q20-img.png)` | **embed** `q20-img.png`, display `imagem` | `q20-img.png` |
| 24 | `![imagem externa](https://example.com/q20.png)` | not an embed | — |
| 25 | `![nota como imagem](q20-alvo.md)` | **embed** of the note, display `nota como imagem` | `q20-alvo.md` |
| 26 | `[vazio]()` | not a link | — |

Totals for `q20-src`: `resolvedLinks` is
`{"…/q20-alvo.md": 11, "…/q20 alvo com espaço.md": 2, "…/q20-src.md": 1, "…/q20-img.png": 1}`
and `unresolvedLinks` is `{"example.com": 1, "q20-nao-existe": 1}`. From
`sub/q20-sub-src.md`, the three links — `../`, a path from the root and the
bare name — all reach `q20-alvo.md`, and the `backlinks` of `q20-alvo` list
`q20-src` 11 and `sub/q20-sub-src` 3. On the draft of section 7.5 the
unresolved key of `Barão%20Vermelho.md` is `Barão Vermelho`: decoded, without
`.md`.

The documentation says: "When using the Markdown format, make sure to URL
encode the link destination. For example, blank spaces become %20." and
"Folder paths start at the vault root and use forward slashes (/), even on
Windows." ("Internal links"); for external links, "You can also escape the URL
by wrapping it with angled brackets (< >)." ("Basic formatting syntax").

### 7.3 What Verso does now

- The parser does not read Markdown links — spec §5.13 is `PROPOSED`, and
  `crates/verso-dialect/src/lib.rs` says so: on `q20-src.md` and on the draft
  of section 7.5 it reports no link and no embed. The fixture harness refuses
  `syntax: markdown` ("PROPOSED … not parsed").
- So the index holds none of them: the `backlinks` of `q20-alvo` are empty, and
  neither `example.com` nor `q20-nao-existe` is in the unresolved list.
- Read from the code: the renderer emits a Markdown link as an ordinary
  anchor, and the window's sanitizer strips a relative `href` or `src` before
  the page sees it — it keeps web, mail and in-page addresses on a link, and
  web or `data:image` addresses on an image (`address()`,
  `app/ui/src/sanitize.ts`). So `[x](q20-alvo.md)` is shown as an anchor with
  no address, which `guardLink` never matches, and a click on it does
  nothing; `![imagem](q20-img.png)` is left as an `<img>` with no `src`. The
  window resolves `![[…]]` embeds only.

### 7.4 Agreement and recommendation

They differ entirely: Obsidian reads every row above that has a result, and
Verso none. A vault written with "Use [[Wikilinks]]" off — the setting the spec
cites — has no backlinks in Verso today.

**Recommendation, for the maintainer to decide:** close Q20 with Markdown links
counted as links, `syntax: markdown`, following the rows observed:

1. a destination with a URL scheme (`https:`, `mailto:`, `obsidian:`, `file:`)
   is external; anything else is internal — `example.com` included — and
   resolves by the rule of Q12;
2. the destination is percent-decoded, its fragment too; `<…>` allows spaces;
   a raw space means there is no link;
3. `.md` optional, `./`, `../`, a leading `/` and a path from the root,
   case-insensitive: Q12 as it stands;
4. `#Heading` and `#^block` split as in a wikilink, and `[t](#Heading)` names
   the note itself;
5. a link title is dropped, and the link text is the `alias`, as §5.13
   proposes;
6. reference-style links (`[t][r]` with `[r]: dest`) and `<dest>` are not
   links — counting them would give a note backlinks in Verso that Obsidian
   never shows;
7. `![alt](file)` is an embed, of an image or of a note; an external image is
   not.

### 7.5 Draft fixture

`fixtures/markdown-link/local/` — `input.md`, the example of spec §5.13 with an
external URL, a bare domain and an image added:

```markdown
Veja [o barão](Barão%20Vermelho.md) e [a taverna](<Taverna.md#Porão>).

[O site](https://example.com/Taverna.md) não é interno; [este](example.com) é.

![O mapa](Mapa%20da%20Taverna.png)
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §7), awaiting the maintainer's approval (ADR 0031).
# Construct: Markdown links to local files. Spec: docs/spec/dialect.md §5.13 (PROPOSED).
# Would answer Q20, and only in the PR that closes it (rule 17). Fails today: the
# parser does not read Markdown links and the harness refuses `syntax: markdown`.
# The image's alt text goes in `alias`, as §5.13 does with a link's text; no field
# for it is decided. It decodes the destination, while spec §4.2's `target` is
# "as written": closing Q20 with it changes §4.2 too.
links:
  - target: Barão Vermelho.md
    alias: o barão
    syntax: markdown
    pos: { line: 1, col: 6 }
  - target: Taverna.md
    heading: Porão
    alias: a taverna
    syntax: markdown
    pos: { line: 1, col: 39 }
  - target: example.com
    alias: este
    syntax: markdown
    pos: { line: 3, col: 57 }
embeds:
  - target: Mapa da Taverna.png
    alias: O mapa
    syntax: markdown
    pos: { line: 5, col: 1 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> links
    "Barão Vermelho.md" (displayText "o barão", line 0 col 5),
    "Taverna.md#Porão" (displayText "a taverna", line 0 col 38) and
    "example.com" (displayText "este", line 2 col 56), none for the https
    link; embeds "Mapa da Taverna.png" (displayText "O mapa", line 4 col 0);
    unresolvedLinks "Barão Vermelho", "Taverna", "example.com",
    "Mapa da Taverna.png".
```

The draft decodes the destination — `Barão Vermelho.md` for
`Barão%20Vermelho.md` — and drops the angle brackets around
`Taverna.md#Porão`, as point 2 of section 7.4 recommends, while spec §4.2
defines `target` as the text of the target "as written". A pull request that
closes Q20 with this draft has to change §4.2 as well, for `syntax: markdown`.

---

## 8. Q24 — the frontmatter's boundary and dialect

### 8.1 Inputs

One note per case in `verso-fixtures/q24/`, written out here with `\n` for a
line feed, `\r\n` for CR LF and `\ufeff` for the BOM:

```text
q24-bom.md          \ufeff---\ntitle: bom\ntags: [q24bom]\n---\nCorpo.\n
q24-crlf.md         ---\r\ntitle: crlf\r\ntags: [q24crlf]\r\n---\r\nCorpo.\r\n
q24-misto.md        ---\r\ntitle: misto\ntags: [q24misto]\r\n---\nCorpo.\n
q24-pontos.md       ---\ntitle: pontos\ntags: [q24pontos]\n...\nCorpo.\n
q24-vazio.md        ---\n---\nCorpo.\n
q24-vazio-linha.md  ---\n\n---\nCorpo.\n
q24-espacos.md      ---   \ntitle: espacos\ntags: [q24espacos]\n---   \nCorpo.\n
q24-linha-antes.md  \n---\ntitle: tarde\ntags: [q24tarde]\n---\nCorpo.\n
q24-invalido.md     ---\ntitle: [aberto\ntags: [q24invalido]\n---\nCorpo.\n
q24-sem-fechar.md   ---\ntitle: aberto\ntags: [q24semfechar]\n\nCorpo sem fechar.\n
q24-duplicada.md    ---\ntitle: um\ntitle: dois\n---\nCorpo.\n
q24-json.md         ---\n{"title": "json", "tags": ["q24json"]}\n---\nCorpo.\n
```

Also `q24-yaml11.md`, with the keys of the second table in section 8.2; one note
per `tags` and `aliases` form of the third table, each with that line alone in
its frontmatter; and `q24-links.md`, with `q24-alvo.md` to `q24-alvo6.md`
present:

```markdown
---
relacionado: "[[q24-alvo]]"
lista:
  - "[[q24-alvo2]]"
  - "[[q24-nao-existe]]"
sem-aspas: [[q24-alvo3]]
texto: "veja [[q24-alvo4]] aqui"
markdown: "[md](q24-alvo5.md)"
embed: "![[q24-alvo6]]"
---
Corpo sem link.
```

### 8.2 What Obsidian did, and what Verso does

The boundary (Obsidian: `getCache(...).frontmatter`, `sections`, `properties`;
Verso: the parser):

| Case | Obsidian 1.13.7 | Verso |
|---|---|---|
| a BOM before `---` | read; its positions leave the BOM out (`frontmatterPosition` offsets 0 to 33); `tags` lists `#q24bom` | **no frontmatter**: the core hands U+FEFF to the parser, and the index has no tags for the note |
| CRLF | read | read |
| CRLF and LF mixed | read | read |
| closed by `...` | not a frontmatter: a thematic break and a paragraph | **neither frontmatter nor body**: the base parser takes the block as metadata, Verso then refuses it, and its lines are lost (section 8.3) |
| empty (`---` right after `---`) | a `yaml` section with no values; `properties`: "No frontmatter found." | **no frontmatter**: two thematic breaks |
| only a blank line inside | a `yaml` section with no values | **no frontmatter** |
| spaces after the `---` | not a frontmatter | **neither frontmatter nor body**, the same way |
| a blank line before the `---` | not a frontmatter | not a frontmatter |
| invalid YAML (`title: [aberto`) | a `yaml` section with no values; `properties`: "No frontmatter found." | a frontmatter whose values are an error (`illegal placement of ':' indicator …`), which the index marks |
| never closed | not a frontmatter | not a frontmatter |
| a key twice (`title: um`, `title: dois`) | a `yaml` section with **no values** | **`title: dois`**: the last one kept |
| JSON (`{"title": "json", …}`) | read | read |

The YAML version, `q24-yaml11.md` (Obsidian: the JavaScript type in `getCache`,
the same as `properties format=json`; Verso: the parser's `Value`):

| Line | Obsidian | Verso |
|---|---|---|
| `sim: yes`, `nao: no`, `ligado: on`, `desligado: off` | strings | strings |
| `verdade: true`, `Verdade: True` | booleans | booleans |
| `data: 2024-01-15`, `datahora: 2024-01-15T10:30:00` | strings, not dates | strings |
| `octal: 0o17`, `octal11: 017`, `hexa: 0x1F` | 15, 17, 31 | 15, 17, 31 |
| `sexagesimal: 12:30:00`, `sublinhado: 1_000` | strings | strings |
| `infinito: .inf` | `Infinity` | infinity |
| `til: ~`, `nulo: null` | null | null |
| `vazio:`, with no value | null | **`""`**, an empty string |
| `numero: 2024`, `decimal: 3.10`, `string: "2024"` | 2024, 3.1, `"2024"` | the same |

Every line reads as the YAML 1.2 core schema: under 1.1, `yes` would be a
boolean, `017` fifteen and `12:30:00` a number.

`tags` and `aliases` (Obsidian: `obsidian tags path=…`, `tag name=…`,
`aliases path=…`; Verso: the index's `tags` and `aliases` columns, read from the
scratch index):

| Frontmatter | Obsidian | Verso |
|---|---|---|
| `tags: 2024` | the value is the number 2024, and **no tag**: `tags` answers "No tags found.", `tag name=2024` "not found" | the tag `2024` |
| `tags: [2024, q24tag, "#q24hash", q24/aninhada]` | `#q24/aninhada`, `#q24hash`, `#q24tag`: 2024 dropped, the `#` accepted | `2024`, `q24tag`, `#q24hash`, `q24/aninhada`; the tag list strips the `#` |
| `tags: q24a q24b` | **no tag** | one tag, `q24a q24b` |
| `tags: q24c, q24d` | **no tag** | one tag, `q24c, q24d` |
| `tag: q24singular` | no tag | no tag |
| `aliases: q24 apelido um, q24 apelido dois` | one alias, the whole string | the same |
| `alias: q24 apelido singular` | no alias | no alias |

Links in properties, `q24-links.md`:

| Property | Obsidian | Verso |
|---|---|---|
| `relacionado: "[[q24-alvo]]"` | a link (`frontmatterLinks`, key `relacionado`): in `resolvedLinks` and in `links`, and `q24-links` is a backlink of `q24-alvo` | a string |
| `lista`, with `"[[q24-alvo2]]"` and `"[[q24-nao-existe]]"` | two links (keys `lista.0`, `lista.1`), the missing one in `unresolvedLinks` | strings |
| `sem-aspas: [[q24-alvo3]]` | no link: YAML reads a list inside a list, `[["q24-alvo3"]]` | the same list |
| `texto: "veja [[q24-alvo4]] aqui"` | no link: the value has to be the link alone | a string |
| `markdown: "[md](q24-alvo5.md)"` | **a link** (display `md`), a backlink of `q24-alvo5` | a string |
| `embed: "![[q24-alvo6]]"` | no link | a string |

In the body, `getCache(...).links` of `q24-links` is empty: a property link is
kept in a list of its own. In Verso none of them is a link, and `q24-alvo` has
no backlink.

The documentation says: "Text properties can contain URLs and Internal links
using the `[[Link]]` syntax." and "Internal links in text properties must be
surrounded with quotes."; "each name must be unique within a note"; `tag`,
`alias` and `cssclass` were deprecated in Obsidian 1.4 ("Properties"). "Tags
must contain at least one non-numerical character. For example, #1984 isn't a
valid tag, but #y1984 is." and "Tags in YAML should always be formatted as a
list" ("Tags"). "Aliases should always be formatted as a list in YAML."
("Aliases").

### 8.3 Agreement and recommendation

They agree on CRLF, mixed endings, a blank line before the delimiter, a block
never closed, invalid YAML (a frontmatter without values), JSON, the YAML 1.2
reading of every value but one, the singular `tag` and `alias` ignored, and a
string of aliases kept whole. They differ on a BOM, an empty block, a duplicate
key, an empty value, a number in `tags`, a string in `tags`, links in
properties — and on a block closed by `...` or with spaces after its `---`
lines, which the first version of this memo counted as agreement.

**The `...` and spaces divergence.** Neither app reads such a block as a
frontmatter, but they part on what its lines are. pulldown-cmark takes both
shapes as a YAML metadata block — it accepts `...` as a closing line, and
spaces after either `---` — and the dialect pass then refuses the block,
because it wants a closing `---` with nothing after it: `frontmatter()` in
`crates/verso-dialect/src/parse.rs`, its `strip_suffix("---")` around line
337, for the event taken around line 84. The lines in between are then
neither frontmatter nor body: the parser reports no link in them,
`body_tags` skips them as metadata, and the reading view drops them
(`render.rs`). Obsidian reads them as body — for `...`, a thematic break and a
paragraph over lines 1 to 3 (the observation of draft c, below); for the
spaces, the sections were not recorded. Checked in Verso on 2026-09-24, with
the parser of `6cc0714`, whose `parse.rs`, `events.rs` and `tags.rs` are
unchanged at the head of this stack: `---`, `title: Taverna [[Adega]]`,
`...`, `[[Porão]]` gives one link, `Porão`, and `[[Adega]]` is gone, from the
parser and from the index's unresolved targets alike; the same with spaces
after both `---`, the shape observed. With spaces after the opening `---`
only, the dialect pass accepts the block as a frontmatter; what Obsidian does
with that shape was not observed. So a link or a tag written in such a block
counts in Obsidian and disappears in Verso: a construct Obsidian interprets,
read another way (invariant 12).

**Recommendation, for the maintainer to decide**, point by point, following
Obsidian:

1. a BOM before the opening `---` does not prevent the frontmatter: it is
   skipped to find the block and never removed from the file (invariant 7);
2. an empty block — `---` right after `---`, or only blank lines between — is a
   frontmatter with no values, not two thematic breaks;
3. a key written twice makes the block invalid, with no values, as the
   Properties page requires unique names;
4. YAML 1.2 core schema, as the parser already reads it, with an empty value
   read as null;
5. a `tags` entry that is all digits is not a tag — the rule Q13 decided for
   body tags — and a `tags` string is not split into tags: only a list gives
   tags;
6. a property whose whole value is `"[[x]]"` or `"[t](x.md)"`, or a list of
   them, is a link — resolved by Q12, a backlink, an unresolved target when it
   is missing — and is kept apart from body links, as Obsidian keeps
   `frontmatterLinks` apart from `links`;
7. a block opened by `---` that Obsidian does not read as a frontmatter —
   closed by `...`, or with spaces after both `---` lines, as observed — is
   body, as Obsidian reads it: its links and tags count, and none of its lines
   is lost between the two readings.

On CRLF the observation says only that Obsidian reads it; which line break Verso
keeps when a file mixes them is a matter of writing, which the maintainer left
for later (spec §9, Q24).

### 8.4 Draft fixtures

The harness cannot assert that a file has no frontmatter: `frontmatter:` fails
when the parser finds none (spec §4.1). So the `...` case shows it through a
link inside the would-be block: a body link to Obsidian, lost in Verso today
(section 8.3). Five drafts.

a) `fixtures/frontmatter/bom/` — `input.md` is the text below preceded by the
three bytes `EF BB BF`:

```markdown
---
title: Taverna
tags: [lugar]
---

Texto.
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §8), awaiting the maintainer's approval (ADR 0031).
# Construct: frontmatter after a UTF-8 BOM. Spec: docs/spec/dialect.md §5.1, Q24.
# input.md begins with the bytes EF BB BF. Would answer the BOM part of Q24, and
# only in the PR that closes it (rule 17). Fails today: the parser does not look
# past a leading BOM.
frontmatter:
  title: Taverna
  tags: [lugar]
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> frontmatter
    { title: "Taverna", tags: ["lugar"] }; frontmatterPosition line 0 col 0
    offset 0 .. line 3 col 3 offset 36, which leaves the BOM out; sections:
    yaml 0-3, paragraph 5.
```

b) `fixtures/frontmatter/crlf/` — `input.md` is the same text without the BOM,
every line ending in CR LF. `expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §8), awaiting the maintainer's approval (ADR 0031).
# Construct: frontmatter in a file whose lines end in CR LF. Spec: docs/spec/dialect.md §5.1, Q24.
# input.md: every line ends in CR LF. Would answer the CRLF part of Q24, and only in
# the PR that closes it (rule 17). Passes today.
frontmatter:
  title: Taverna
  tags: [lugar]
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> frontmatter
    { title: "Taverna", tags: ["lugar"] }; frontmatterPosition line 0 col 0
    offset 0 .. line 3 col 3 offset 39; sections: yaml 0-3, paragraph 5.
```

c) `fixtures/frontmatter/dots-do-not-close/` — `input.md`:

```markdown
---
title: Taverna
lugar: "[[Adega]]"
...
[[Porão]]
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §8), awaiting the maintainer's approval (ADR 0031).
# Construct: a block opened by `---` and "closed" by `...` is not a frontmatter; its lines are body.
# Spec: docs/spec/dialect.md §5.1, Q24. No key asserts that a file has no frontmatter
# (§4.1): the link on line 3, inside the would-be block, being a body link is what
# shows it. Would answer the `...` part of Q24, and only in the PR that closes it
# (rule 17). Fails today: Verso drops the block's lines, so `Adega` is missing.
links:
  - target: Adega
    pos: { line: 3, col: 9 }
  - target: Porão
    pos: { line: 5, col: 1 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md), on this input
    without its third line: `obsidian eval` on `app.metadataCache.getCache(...)`
    -> no frontmatter; sections: thematicBreak 0, paragraph 1-3; links:
    "Porão" at line 3 col 0; unresolvedLinks { "Porão": 1 }. The line
    `lugar: "[[Adega]]"` was added after the run, at the reading (section 16):
    this input is to be observed before approval.
```

d) `fixtures/frontmatter/yaml-1-2/` — `input.md`:

```markdown
---
aberta: yes
fechada: no
data: 2024-01-15
octal: 017
tags: 2024
---

Texto.
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §8), awaiting the maintainer's approval (ADR 0031).
# Construct: the YAML version of the frontmatter. Spec: docs/spec/dialect.md §5.1, Q24.
# YAML 1.2 core schema: `yes`, `no` and dates are strings, `017` is seventeen and
# `2024` a number. Whether `tags: 2024` is a tag is the index's question, not this
# fixture's. Would answer the YAML-version part of Q24, and only in the PR that
# closes it (rule 17). Passes today.
frontmatter:
  aberta: "yes"
  fechada: "no"
  data: "2024-01-15"
  octal: 17
  tags: 2024
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...).frontmatter` ->
    aberta "yes", fechada "no", data "2024-01-15" (strings; not a Date),
    octal 17 and tags 2024 (numbers).
```

e) `fixtures/frontmatter/property-link/` — `input.md`:

```markdown
---
relacionado: "[[Taverna]]"
---

Texto.
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §8), awaiting the maintainer's approval (ADR 0031).
# Construct: a wikilink as a property's value. Spec: docs/spec/dialect.md §4.1, §5.1, Q24.
# `links` lists body links only; whether a property link counts as a link is
# resolution, outside this schema (§4.6) — Obsidian counts it (frontmatterLinks,
# resolvedLinks, backlinks). Would answer part of Q24, and only in the PR that
# closes it (rule 17). Passes today.
frontmatter:
  relacionado: "[[Taverna]]"
links: []
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> frontmatter
    { relacionado: "[[Taverna]]" }; no links; frontmatterLinks: key
    "relacionado", link "Taverna"; unresolvedLinks { "Taverna": 1 }.
```

---

## 9. Q7 — NFC and NFD in name comparison

### 9.1 Inputs

- `q7-José.md`, its name in NFC (`é` is U+00E9); `q7-Pão.md`, its name in NFD on
  disk (`a` followed by U+0303).
- `q7-src.md`, one link per paragraph. The text is shown here in NFC; the
  right-hand column gives the form the file had:

```text
NFC para nome NFC: [[q7-José]]                        NFC
NFD para nome NFC: [[q7-José]]                        NFD (e + U+0301)
NFC para nome NFD: [[q7-Pão]]                         NFC
NFD para nome NFD: [[q7-Pão]]                         NFD (a + U+0303)
Não existe, NFC: [[q7-Ação]]                          NFC
Não existe, NFD: [[q7-Ação]]                          NFD (c + U+0327, a + U+0303)
Caixa fora do ASCII: [[Q7-JOSÉ]]                      NFC, a capital É
Seção NFC para título NFD: [[q7-titulos#Coração]]     NFC
```

- `q7-titulos.md`: `## Coração`, with the heading's text in NFD.

### 9.2 What Obsidian did

- `app.vault.getFiles()` lists the NFD-named file under an NFC path (code
  points `50 e3 6f` for `Pão`): the vault's paths are NFC, whatever the disk
  holds.
- `getCache("…/q7-src.md").links`: `link` is NFC for all eight links, while
  `original` keeps the file's bytes (`e` plus U+0301 for the second one). Link
  text is normalized to NFC when it is read.
- Resolution: `resolvedLinks` is
  `{"…/q7-José.md": 3, "…/q7-Pão.md": 2, "…/q7-titulos.md": 1}` — the four
  combinations resolve, and the capital `Q7-JOSÉ` reaches `q7-José.md`, so Q8's
  case-insensitivity holds beyond ASCII. The `backlinks` list `q7-src` with 3
  for `q7-José.md` and 2 for `q7-Pão.md`.
- Missing: `unresolvedLinks` is `{"q7-Ação": 2}`, one NFC key for both forms,
  and `unresolved verbose` prints it with NFC bytes.
- Called directly, the lookups do **not** normalize: `getFirstLinkpathDest`
  answers the note for the NFC strings and `null` for the NFD ones, for both
  files; `getAbstractFileByPath` finds each note by its NFC path and not by its
  NFD one.
- Headings are not normalized: the heading of `q7-titulos.md` keeps its NFD code
  points (`63 327 61 303`). Whether the NFC link `#Coração` reaches it was not
  observed (section 14).

### 9.3 What Verso does now

- The index folds both sides to NFC before comparing (spec §9, Q7, provisional;
  `crates/verso-index/src/keys.rs`). Through the `links` tool of `verso mcp`,
  both José links and `Q7-JOSÉ` resolve to `q7-José.md` and both Pão links to
  the NFD-named file, under its path as the file system stores it;
  `--unresolved` lists `q7-Ação` once, count 2; the `backlinks` of `q7-José` are
  3 rows.
- The name of a note given to the CLI is not normalized:
  `verso backlinks <copy> verso-fixtures/q7/q7-Pão` typed in NFC answers
  "unknown note", and the same name in NFD gives the two backlinks. The `path`
  of `verso mcp` goes through the same `note_key`.
- Headings: nothing matches them (section 6.3).

### 9.4 Agreement and recommendation

They agree on the outcome: both forms of a name reach the same note, and both
forms of a missing name make one unresolved entry. How Obsidian gets there is
an inference from section 9.2, not an observation: its paths and its `link`
text are NFC while its lookups, called directly, do not normalize, which fits
normalizing at the edges and then comparing strings. Verso folds both sides
when it compares. They differ where Verso compares without folding: the CLI's
note argument and `verso mcp`'s `path`.

**Recommendation, for the maintainer to decide:** close Q7 as the index does it
— every name comparison after NFC on both sides — and apply the same fold
wherever a user names a note (the CLI's argument, `verso mcp`'s `path`), which
today is a byte comparison with the stored path. The parser's `target` stays as
written, NFD if the file has NFD, as spec §4.2 says: the fold belongs to
comparison, and the span still slices back to the file's bytes (Q18, property
3). A heading comparison, when Q19 decides one, should fold the same way; that
part was not observed.

### 9.5 Draft fixture

None fits: the outcome is resolution (spec §4.6). A parser fixture could only
assert `target` as written in NFD (with a YAML escape such as
`"Jose\u0301"`), which is the spec's current wording and not an observation of
Obsidian, whose `link` field is NFC.

---

## 10. Q4 — the uniqueness scope of the `^id`

### 10.1 Inputs

`q4-alvo.md`:

```markdown
Primeiro. ^dup

Segundo. ^dup

Terceiro. ^MAIUSC

Quarto. ^minusc
```

`q4-outro.md` is `Outro. ^dup`. `q4-src.md` has, one per paragraph,
`[[q4-alvo#^dup]]`, `[[q4-alvo#^maiusc]]`, `[[q4-alvo#^MAIUSC]]`,
`[[q4-alvo#^MINUSC]]`, `[[q4-alvo#^nao-existe]]` and `[[q4-outro#^dup]]`.

`q4-charset.md`, the probe of section 13 (Q22), has one id per paragraph;
line 11 ends in three spaces after the id, shown here as `···`:

```text
Sublinhado. ^a_b

Ponto. ^a.b

Acento. ^ação

Só dígitos. ^123

Hífen. ^a-b

Espaços depois. ^fim···

Emoji. ^🍺

Barra. ^a/b
```

*(Recorded at the reading, which found `q4-charset.md` cited in sections 11.2
and 13 and missing here. Recovered from the run's own generator script and
the scratch copy Verso read, both kept outside the repository, and matched
against Obsidian's recorded `getCache` output for the note: blocks `123` and
`a-b` only, and no id on the paragraph of line 11.)*

### 10.2 What Obsidian did

- The `sections` of `q4-alvo` are four paragraphs whose ids are `dup`, `dup`,
  `MAIUSC` and `minusc`: both paragraphs carry `dup`.
- The `blocks` of `q4-alvo` are
  `{"dup": line 2, "maiusc": {id "MAIUSC", line 4}, "minusc": line 6}`: one
  entry per id, keyed in lower case with the id as written kept, and for `dup`
  the **last** definition (line 2, the second paragraph).
- The `blocks` of `q4-outro` hold its own `dup`, unaffected by `q4-alvo`'s.
- `resolvedLinks` of `q4-src` is `{"…/q4-alvo.md": 5, "…/q4-outro.md": 1}`: a
  block link counts toward its note whether the id exists, and whatever its
  case.
- Where a click on `[[q4-alvo#^dup]]` lands was not observed (section 14). A
  link always names a note, so the scope is the note by construction.

### 10.3 What Verso does now

- The parser reports every definition, as written — `dup` at 1:11 and 3:10,
  `MAIUSC` at 5:11, `minusc` at 7:9 — and the index stores every row, with no
  uniqueness.
- The index counts the same backlinks: 5 for `q4-alvo` and 1 for `q4-outro`.
- Nothing resolves `#^id` to a block: citation by `^id`
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)) and navigation do not use
  it yet, so a duplicate changes nothing today.

### 10.4 Agreement and recommendation

They agree on everything both do: the scope is the note, every definition is a
definition, and block links count toward the note. Obsidian's map keeps one
block per id (the last, keyed in lower case), which Verso does not model yet.
That Obsidian's lookup of `#^id` is case-insensitive and answers with the last
definition is an inference from that map's shape, not an observation: where a
click lands was not observed (section 14).

**Recommendation, for the maintainer to decide:** an id is unique per note; the
lookup of `#^id` is case-insensitive; with a duplicate, the last definition
answers, as Obsidian's cache suggests (above); and the parser goes on
reporting every definition, so that a later decision can warn about duplicates
without touching the parser. A duplicate is never an error on read and is
never rewritten (invariant 7).

### 10.5 Draft fixture

`fixtures/block/duplicate/` — `input.md`:

```markdown
Primeiro. ^dup

Segundo. ^dup

Terceiro. ^MAIUSC
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §10), awaiting the maintainer's approval (ADR 0031).
# Construct: the same `^id` twice in a note, and an id in capitals. Spec: docs/spec/dialect.md §5.7, Q4.
# Asserts that both definitions are reported, as written; which one a link reaches
# is resolution (§4.6). Would answer part of Q4, and only in the PR that closes it
# (rule 17). Passes today.
blocks:
  - id: dup
    pos: { line: 1, col: 11 }
  - id: dup
    pos: { line: 3, col: 10 }
  - id: MAIUSC
    pos: { line: 5, col: 11 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> sections:
    paragraph 0 id "dup", paragraph 2 id "dup", paragraph 4 id "MAIUSC";
    blocks { dup: line 2 (the last definition), maiusc: id "MAIUSC",
    line 4 }. The spec's `pos` is the `^` (§4.3).
```

---

## 11. Q21 — what a block is

### 11.1 Inputs

`verso-fixtures/q21/q21-blocos.md`:

````markdown
---
title: blocos
---

# Título com id ^h1id

Parágrafo simples. ^p1

Parágrafo de
várias linhas. ^p2

Parágrafo com id
^p3meio
na linha do meio.

Parágrafo solto.

^p4solto

- Item um ^li1
- Item dois
  - Sub item ^li2sub
- Item três

^lista

> Citação linha um
> linha dois ^q1dentro

> Citação sem id

^q2depois

> [!note] Callout
> Corpo do callout ^c1dentro

> [!note] Outro callout
> Corpo

^c2depois

| a | b |
|---|---|
| 1 | 2 | ^t1linha

| c | d |
|---|---|
| 3 | 4 |

^t2depois

```text
código ^naoebloco
```

^cod1depois

$$
x = 1
$$

^mat1depois

Antes da regra.

***

^hr1depois

Texto com nota[^1].

[^1]: Nota de rodapé. ^fn1

<div>HTML</div>

^html1depois

%%comentário%%

^com1depois

Última linha. ^ultimo
````

and `q21-extra.md`:

```markdown
Parágrafo de duas linhas
^ultima

- Item
^apos-item

Texto^colado

Texto ^meio-da-linha e mais texto
```

### 11.2 What Obsidian did, and what Verso does

Obsidian: `getCache(...).blocks`, `sections` and `listItems`; Verso: the
parser's `blocks`. Lines are 1-based lines of the input.

| `^id` | Where it is | Obsidian: the block it names | Verso's parser |
|---|---|---|---|
| `h1id` | end of the heading on line 5 | the heading; the heading's text stays `Título com id ^h1id` | **no block**; the same heading text |
| `p1` | end of a one-line paragraph | the paragraph | 7:20 |
| `p2` | end of a paragraph's second line | the whole paragraph, lines 9–10 | 10:16 |
| `p3meio` | alone on a paragraph's middle line | **none**: the paragraph (12–14) has no id | none |
| `p4solto` | alone on a line after a blank line | the paragraph before it (16) | 18:1, at its own position |
| `li1` | end of a list item | the item (20) | 20:11 |
| `li2sub` | end of a nested item | that nested item (22) | 22:14 |
| `lista` | after the list, a blank line before | the whole list, 20–23 | 25:1 |
| `q1dentro` | end of a blockquote's last line | the whole blockquote, 27–28 | 28:14 |
| `q2depois` | after a blockquote | the blockquote (30) | 32:1 |
| `c1dentro` | end of a callout's last line | the whole callout, 34–35 | 35:20 |
| `c2depois` | after a callout | the callout, 37–38 | 40:1 |
| `t1linha` | end of a table's last row | the whole table, 42–44 | 44:11 |
| `t2depois` | after a table | the table, 46–48 | 50:1 |
| `naoebloco` | inside a fenced code block | none | none |
| `cod1depois` | after the code block | the code block, 52–54 | 56:1 |
| `mat1depois` | after a `$$` block | the math block, 58–60 | 62:1 |
| `hr1depois` | after `***` | the thematic break (66) | 68:1 |
| `fn1` | end of a footnote definition | the footnote definition: its section carries the id, and the `blocks` entry has an empty position at the end of the file | 72:23 |
| `html1depois` | after an HTML block | the HTML block (74) | 76:1 |
| `com1depois` | after `%%comentário%%` | the comment's paragraph (78) | 80:1 |
| `ultimo` | end of the last paragraph | the paragraph | 82:15 |
| `ultima` (`q21-extra`) | alone on a paragraph's last line, no blank line | the paragraph, 1–2 | 2:1 |
| `apos-item` (`q21-extra`) | alone on the line after an item, no blank line | the item, 4–5 | 5:1 |
| `colado` (`q21-extra`) | `Texto^colado`, no space before | none | none |
| `meio-da-linha` (`q21-extra`) | followed by more text | none | none |
| `fim` (`q4-charset.md`, section 10.1) | followed by three spaces | **none** | **`fim`**, 11:17 |

The section types Obsidian reported: `yaml`, `heading`, `paragraph`, `list`,
`blockquote`, `callout`, `table`, `code`, `math`, `thematicBreak`,
`footnoteDefinition` and `html`, with the list items in `listItems`.

The documentation says: "A block is a unit of text in your note, such as a
paragraph, block quote, or list item."; for a paragraph, "place a blank space
followed by a caret (^) and the block identifier at the end of the line"; for
lists, quotes, callouts and tables, "the block identifier should be on a
separate line, with a blank line before and after"; and "We do not support
links to specific parts of quotations, callouts, and tables." ("Internal
links").

### 11.3 Agreement and recommendation

On which ids exist they agree on 25 of the 27 rows, and differ on the heading
(`h1id`) and on the trailing spaces (`fim`). On which block an id names, Verso's
report says nothing (it has the `^`'s position only), while Obsidian attaches
every id to a section or to a list item.

**Recommendation, for the maintainer to decide:** define a block as Obsidian's
index does — a top-level section (paragraph, heading, list, blockquote, callout,
table, code block, math block, thematic break, HTML block, footnote definition)
or a list item at any depth — and an `^id` as naming:

1. the section or list item whose last line ends in `^id`, with a space before
   it or at the start of that line, and nothing after it, not even spaces;
2. when the `^id` stands alone on a line after a blank line, the section right
   before it;
3. nothing from inside code, and nothing from a middle line.

That also answers the positions Q3 left open — alone after a blank line: the
block before it; on a heading: the heading; after a multi-line block: the whole
block — and gives citation by position (ADR 0018) its unit. If fixtures are to
assert *which* block an id names, the schema needs a field for it (the block's
first line, say); spec §4.3 has only the `^`'s position.

### 11.4 Draft fixture

`fixtures/block/positions/` — `input.md`:

````markdown
# Taverna ^topo

Parágrafo de
duas linhas. ^fim

Parágrafo com
^meio
no meio.

> Citação
> em duas linhas. ^citacao

| a | b |
|---|---|
| 1 | 2 |

^tabela

```text
^nao-e-bloco
```
````

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §11), awaiting the maintainer's approval (ADR 0031).
# Construct: where a `^id` defines a block. Spec: docs/spec/dialect.md §5.7, Q3, Q21.
# Asserts which ids exist and where each `^` is; which block an id names has no
# field (§4.3). Would answer part of Q21 and Q3, and only in the PR that closes
# them (rule 17). Fails today: the parser sees no id on a heading.
headings:
  - level: 1
    text: Taverna ^topo
    pos: { line: 1, col: 1 }
blocks:
  - id: topo
    pos: { line: 1, col: 11 }
  - id: fim
    pos: { line: 4, col: 14 }
  - id: citacao
    pos: { line: 11, col: 19 }
  - id: tabela
    pos: { line: 17, col: 1 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> headings
    "Taverna ^topo" level 1 at line 0; blocks topo (the heading, line 0),
    fim (paragraph 2-3), citacao (blockquote 9-10), tabela (table 12-14);
    no block "meio" or "nao-e-bloco"; sections: heading 0 id "topo",
    paragraph 2-3 id "fim", paragraph 5-7, blockquote 9-10 id "citacao",
    table 12-14 id "tabela", code 18-20. The spec's `pos` is the `^` (§4.3).
```

---

## 12. Q23 — combined forms and wikilink escapes

### 12.1 Inputs

`verso-fixtures/q23/q23-src.md`, with `q23-alvo.md` (`# Alvo Q23`, `## Seção`,
`Texto. ^bloco`) and `q23-img.png` present:

```markdown
[[q23-alvo#Seção|apelido de seção]]

[[q23-alvo#^bloco|apelido de bloco]]

[[#Local]]

[[#^local]]

[[verso-fixtures/q23/q23-alvo]]

[[q23-alvo.md]]

[[ q23-alvo ]]

[[q23-alvo | apelido com espaços ]]

[[q23-alvo|apelido|extra]]

\[[q23-alvo]]

\[\[q23-alvo\]\]

[[q23-alvo\|escapado fora de tabela]]

![[q23-img.png|300]]

![[q23-img.png|300x200]]

![[q23-img.png|legenda|300]]

[texto [[q23-alvo]] dentro](https://example.com)

[[[q23-alvo]]](https://example.com)

![alt [[q23-alvo]]](q23-img.png)

[[q23-alvo|[md](https://example.com)]]

[[q23-alvo#Seção#^bloco]]

[[]]

[[|só apelido]]

[[#]]

a[[q23-alvo]]b

[[[q23-alvo]]]

[[q23-alvo
quebrado]]

[[q23-alvo#]]

[[q23-alvo^bloco]]

| Coluna | Outra |
|---|---|
| [[q23-alvo\|apelido na tabela]] | x |
| ![[q23-img.png\|100]] | y |

## Local

Bloco local. ^local
```

### 12.2 What Obsidian did, and what Verso does

Obsidian: `getCache(...).links` and `.embeds` (`link`, `displayText`) and
`getFirstLinkpathDest`; Verso: the parser's fields and the `links` tool of
`verso mcp`.

They agree on 18 forms:

- `[[q23-alvo#Seção|apelido de seção]]` and `[[q23-alvo#^bloco|apelido de bloco]]`:
  target, `heading` or `block`, and alias, in both; both resolve.
- `[[#Local]]`, `[[#^local]]` and `[[#]]`: an empty target, the note itself, and
  a backlink of itself in both (the `backlinks` of `q23-src` list `q23-src`, 3).
- `[[verso-fixtures/q23/q23-alvo]]` and `[[q23-alvo.md]]`: resolve in both.
- `[[q23-alvo|apelido|extra]]`: the alias is `apelido|extra` in both.
- `\[[q23-alvo]]` and `\[\[q23-alvo\]\]`: no link in either.
- `![[q23-img.png|300]]`, `|300x200` and `|legenda|300`: the text after the first
  `|` (`300`, `300x200`, `legenda|300`) is Obsidian's `displayText` — the field
  an alias uses — and Verso's `alias`. The image resolves in Obsidian and is an
  unresolved target in Verso's index (Q16).
- `[texto [[q23-alvo]] dentro](https://example.com)`: the wikilink inside the
  link's text is a link in both.
- `[[]]`: no link in either.
- `a[[q23-alvo]]b`: a link in both.
- `[[q23-alvo#]]`: resolves to the note in both (Obsidian's display is
  `q23-alvo`; Verso's `heading` is empty).
- `[[q23-alvo^bloco]]`: the target `q23-alvo^bloco`, unresolved, in both.
  Q12's wording would resolve it (section 12.3).

They differ on 11:

- `[[ q23-alvo ]]`: Obsidian trims, link `q23-alvo`. Verso: target
  ` q23-alvo `; the index trims before resolving, so it resolves.
- `[[q23-alvo | apelido com espaços ]]`: Obsidian trims both, link `q23-alvo`
  and display `apelido com espaços`. Verso: target `q23-alvo ` and alias
  ` apelido com espaços `.
- `[[q23-alvo\|escapado fora de tabela]]`, outside a table: Obsidian drops the
  backslash and takes `\|` as the alias separator — link `q23-alvo`, display
  `escapado fora de tabela` — and resolves. Verso: target `q23-alvo\`,
  **unresolved**.
- The same inside a table, `| [[q23-alvo\|apelido na tabela]] | x |`: Obsidian,
  link `q23-alvo` and display `apelido na tabela`, resolved. Verso: target
  `q23-alvo\`, unresolved.
- `| ![[q23-img.png\|100]] | y |`: Obsidian, embed `q23-img.png`, display `100`.
  Verso: target `q23-img.png\`.
- `[[[q23-alvo]]](https://example.com)` and `[[[q23-alvo]]]`: Obsidian, a link
  whose target is `[q23-alvo`, unresolved (`original` `[[[q23-alvo]]`). Verso,
  a link to `q23-alvo`, one column later, resolved.
- `![alt [[q23-alvo]]](q23-img.png)`: Obsidian, an embed of `q23-img.png` whose
  display text is `alt [[q23-alvo]]`, and no link. Verso, a link to `q23-alvo`
  inside the alt text, and no embed (Markdown images are Q20).
- `[[q23-alvo|[md](https://example.com)]]`: Obsidian, a link to `q23-alvo` with
  display `[md](https://example.com)`. Verso: **no link at all**.
- `[[|só apelido]]`: Obsidian, a link whose target is `|só apelido`,
  unresolved. Verso: no link. Q12's wording would make it the note itself
  (section 12.3).
- `[[q23-alvo` and `quebrado]]` on two lines: Obsidian, no link. Verso, a link
  whose target holds the line break, unresolved.

One form is not documented by Obsidian: `[[q23-alvo#Seção#^bloco]]`. Obsidian
keeps the text (`link` `q23-alvo#Seção#^bloco`, display
`q23-alvo > Seção > ^bloco`) and resolves the note; Verso's `heading` is
`Seção#^bloco`, with no block. The spec keeps it out of fixtures until Q19
(§4.2).

### 12.3 Agreement and recommendation

Of the 30 forms, 18 agree, 11 differ and one is undocumented (section 12.2).
Nine of the eleven change a backlink or an entry of the unresolved list; the
other two, the spaces, change only the fields the parser reports.

**Recommendation, for the maintainer to decide:** follow Obsidian's reading of
the eleven:

1. spaces at the ends of the target and of the alias are not part of them — the
   index already trims the target to resolve it;
2. inside a wikilink, `\|` separates the alias, in a table or outside one, and
   the backslash belongs to neither part — an embed's size included;
3. `[[[x]]]` is a link to `[x`, as Obsidian reads it;
4. a wikilink inside an image's alt text is not a link;
5. a Markdown link inside an alias does not break the wikilink;
6. `[[|x]]` is a link whose target is `|x` — odd, but it keeps the unresolved
   lists of the two apps the same; accepting it would amend Q12 (below);
7. a wikilink never spans a line break.

Also: keep an image's size in `alias`, as written — it is where Obsidian's API
puts it too, and whether the text is a size depends on the target being an
image, which is the renderer's concern. `[[n#s#^b]]` stays with Q19.

**Two rows and one point go against closed Q12's wording.** Q12 point 1, as
the spec and `index-decision.md` §4.6 word it, says that "`#…`, `^…` and
`|alias` are removed from the target first". Read literally,
`[[q23-alvo^bloco]]` would resolve to `q23-alvo`, and `[[|só apelido]]` would
be an empty target — the note itself. Obsidian did neither (section 12.2).
The index agrees with Obsidian on the first: it keeps `^…` in a target with
no `#` before it and leaves it unresolved, so the code departs from Q12's
wording there, and the spec's sentence that "nothing in the code departs from
points 1 to 5" does not hold for that case. On the second the parser reports
no link at all, which matches neither reading. Recommendation 6 follows
Obsidian, so accepting it would amend Q12 point 1, which is the maintainer's
to do. This memo records the contradiction and does not pick a side
(`CLAUDE.md` §1, rule 3). Related, and older than this memo: the comment on
`RESOLVE` in `crates/verso-index/src/store.rs` (around line 74) calls
`[[^id]]` an empty target that names the note itself, while the parser gives
it the target `^id` and the index leaves it unresolved — checked on
2026-09-24: `[[^meu]]` is listed among the unresolved targets, and
`[[#^meu]]` is the note's own backlink.

### 12.4 Draft fixture

`fixtures/wikilink/combined-forms/` — `input.md`:

```markdown
[[Taverna#Porão|o porão]] e [[Sessão 3#^juramento|o juramento]].

[[#Porão]] e [[#^juramento]].

[[ Taverna ]], [[Taverna | a taverna ]] e [[Taverna|a|b]].

\[[Taverna]] não é link.

| Lugar | Nota |
|---|---|
| [[Taverna\|a taverna]] | x |

![[Mapa.png|300]]
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §12), awaiting the maintainer's approval (ADR 0031).
# Construct: combined forms, spaces, an escape, `\|` in a table, an image size.
# Spec: docs/spec/dialect.md §4.2, Q23. Would answer part of Q23, and only in the PR
# that closes it (rule 17). Fails today on the fifth, sixth and eighth links: the
# parser keeps the spaces and the backslash.
links:
  - target: Taverna
    heading: Porão
    alias: o porão
    pos: { line: 1, col: 1 }
  - target: Sessão 3
    block: juramento
    alias: o juramento
    pos: { line: 1, col: 29 }
  - target: ""
    heading: Porão
    pos: { line: 3, col: 1 }
  - target: ""
    block: juramento
    pos: { line: 3, col: 14 }
  - target: Taverna
    pos: { line: 5, col: 1 }
  - target: Taverna
    alias: a taverna
    pos: { line: 5, col: 16 }
  - target: Taverna
    alias: "a|b"
    pos: { line: 5, col: 43 }
  - target: Taverna
    alias: a taverna
    pos: { line: 11, col: 3 }
embeds:
  - target: Mapa.png
    alias: "300"
    pos: { line: 13, col: 1 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> links
    "Taverna#Porão" (displayText "o porão", line 0 col 0),
    "Sessão 3#^juramento" ("o juramento", line 0 col 28), "#Porão" (line 2
    col 0), "#^juramento" (line 2 col 13), "Taverna" (original
    "[[ Taverna ]]", line 4 col 0), "Taverna" ("a taverna", line 4 col 15),
    "Taverna" ("a|b", line 4 col 42), "Taverna" ("a taverna", original
    "[[Taverna\|a taverna]]", line 10 col 2); no link for the escaped one;
    embeds "Mapa.png" (displayText "300", line 12 col 0).
```

---

## 13. Observed along the way

- **Q22, the characters of an `^id`.** On `q4-charset.md` (section 10.1),
  one id per paragraph, Obsidian recognized `^a-b` and `^123`, and none of
  `^a_b`, `^a.b`, `^ação`, `^🍺` and `^a/b`, which matches "Block identifiers
  can only consist of Latin letters, numbers, and dashes." ("Internal
  links"). Verso's parser agrees on all of them, and differs on one thing:
  `^fim` followed by spaces is an id to Verso and not to Obsidian (section
  11.2). A draft for the `^id` part of Q22, if the maintainer wants to close
  it with one — `fixtures/block/charset/`, `input.md`:

```markdown
Hífen. ^a-b

Dígitos. ^123

Sublinhado. ^a_b

Acento. ^ação
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §13), awaiting the maintainer's approval (ADR 0031).
# Construct: the characters of a block id. Spec: docs/spec/dialect.md §5.7, Q22.
# Would answer the `^id` part of Q22, and only in the PR that closes it (rule 17).
# Trailing spaces after an id are left out: invisible in review, and editors strip
# them. Passes today.
blocks:
  - id: a-b
    pos: { line: 1, col: 8 }
  - id: "123"
    pos: { line: 3, col: 10 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> blocks
    { "a-b": line 0, "123": line 2 }; sections: paragraph 0 id "a-b",
    paragraph 2 id "123", paragraphs 4 and 6 with no id.
```

- **Q3.** Section 11 covers the positions it left open: an `^id` alone after a
  blank line names the block before it; on a heading, the heading; after a
  multi-line block, the whole block.
- **The alias contradiction recorded under Q12.** Q12 records that an alias
  does not resolve a link although "Obsidian's public documentation presents
  aliases as a way of linking to a note". The "Aliases" page, read today, says
  how that linking is done: "Obsidian creates the link with the alias as its
  custom display text, for example `[[Artificial Intelligence|AI]]`", and
  "Rather than just using the alias as the link destination (`[[AI]]`),
  Obsidian uses the `[[Artificial Intelligence|AI]]` link format to ensure
  interoperability with other applications using the Wikilink format." The
  documented way writes the note's name, which agrees with `[[apelido]]` being
  unresolved. Recorded only: Q12 is closed and this changes nothing in it.
- **The CLI's note argument** is compared with the stored path byte for byte
  (section 9.3).
- **Frontmatter tags and the Q13 rule.** The rule decided for body tags leaves
  out an all-digit tag; the index takes frontmatter `tags` without it (section
  8.2).
- **For `obsidian-cli.md`.** Two facts that page does not have: `eval` cannot
  `require("obsidian")`, and a run leaves its paths in Obsidian's recent files
  (section 2.3).

## 14. What was not observed, and why

- **Which heading a link reaches (Q19), which of two duplicate ids a link
  reaches (Q4), and whether an NFC subpath reaches an NFD heading (Q7).** All
  three need `resolveSubpath` — exported by the `obsidian` module, out of reach
  of `eval` ("Cannot find module 'obsidian'") — or a click in the maintainer's
  window, which this session was told not to drive. The CLI's `file=` takes no
  subpath.
- **The graph view (Q2, Q14).** It is a view in the window, and it was not
  opened. The evidence is `resolvedLinks`, `orphans`, `deadends` and the "Graph
  view" page.
- **`tags` as a single word** (`tags: lugar`): not among the probes; the string
  forms observed had a space or a comma.
- **Two ids that differ only in case, in one note**: the lower-case key suggests
  they collide; no probe had both.
- **Rendering**: nothing here says how the reading view shows a construct.
- **What Obsidian writes**: every probe was read and none edited in the app, so
  which line break an edit keeps in a mixed file (Q24) was not observed.
- **Columns after a character outside the Basic Multilingual Plane**: Obsidian's
  columns come from JavaScript strings, and no probe checked one after an emoji.
- **Other platforms and settings**: macOS and default settings only.
- **The Phase 2 window**: read from the code (sections 4.3, 5.3, 6.3 and 7.3),
  not run.

## 15. How the maintainer decides and verifies, without reading code

**Check that the change is what it says.** The memo came in `323d070`, on the
local stack, which was not pushed; the corrections of its reading came later,
in the commit that adds section 16:

```
git show --stat 323d070                                        # two files: this memo and its pt-BR twin
git log --oneline -- docs/reference/obsidian-observations.md   # every commit that touched it
git log -1 --format='%an <%ae>%n%b' 323d070                    # author and Signed-off-by are yours
bash scripts/check-docs-mirror.sh                              # "docs mirror: ok"
bash scripts/check-fixtures.sh                                 # fixtures/ untouched
```

**Repeat any observation.** Create a folder in the `Sandbox` vault, save an
input of this memo in it as a note, and run the command of its row, for
example `obsidian eval vault=Sandbox code='JSON.stringify(app.metadataCache.getCache("folder/note.md"))'`,
`obsidian backlinks vault=Sandbox path=folder/note.md format=json counts` or
`obsidian unresolved vault=Sandbox verbose counts` ([`obsidian-cli.md`](obsidian-cli.md)).
Delete the folder afterwards.

**The check by hand for Q19**, about ten minutes in the Obsidian window: save
`q19-alvo.md` and `q19-src.md` of section 6.1 in the `Sandbox` vault, open
`q19-src` in reading view, click each of the 24 links, and write down the heading
the view moves to — or "top of the note". The rows separate:

| Link | Separates |
|---|---|
| `#seção`, `#SEÇÃO` | case |
| `#Porão a entrada`, against the heading `Porão: a entrada` | punctuation |
| `#Ênfase e forte`, against `*Ênfase* e **forte**` | inline formatting |
| `#Café com espaços`, against the heading with three spaces | spaces |
| `#Link q19-outra no título` | a wikilink inside the heading |
| `#Cap 2#Seção`, `#Cap 1#Seção` | the nested path |
| `#Dup` | duplicates: the first or the last |
| `#Setext nível um`, `#Setext nível dois` | setext headings |
| `#C# e F#` | a `#` inside the heading |
| `#Final com fechamento` | the closing `##` |
| `#caixa misturada` | case, on a heading in mixed case |
| `#Título com código` | a code span in the heading |
| `#Não existe` | a missing heading |

**Decide, one line per question:**

1. **Q2** — an embed counts as a link, a backlink and a graph edge: yes or no.
2. **Q14** — keep it as it is; group the spellings in the unresolved list
   (Verso) or keep them apart (Obsidian); missing targets in the graph: yes or
   no.
3. **Q19** — setext headings are headings (draft 6.5 a); `heading` keeps a
   nested path as written (draft 6.5 b); the matching rule after the check by
   hand.
4. **Q20** — Markdown links count, by the seven points of section 7.4 (draft
   7.5).
5. **Q24** — the seven points of section 8.3 (drafts 8.4 a to e).
6. **Q7** — NFC on both sides of every name comparison, the CLI's argument
   included.
7. **Q4** — unique per note, case-insensitive, the last of a duplicate (draft
   10.5).
8. **Q21** — a block is a section or a list item, with the three rules of
   section 11.3 (draft 11.4).
9. **Q23** — the seven points of section 12.3 (draft 12.4).

**What a closing PR carries**, for each question closed: the fixture drafted
here, with its first line replaced by the approval and its line added to
`fixture_tests!` in `crates/verso-dialect/tests/fixtures.rs` (the fixture lint
fails without it); spec §9 updated in the same PR (rule 17); and the parser or
index change the answer needs, written by Fable 5.1 and read by Opus
([ADR 0032](../adr/0032-author-and-reviewer-roles.md)). This memo carries none
of them.

## 16. The reading

A fresh Opus 5.5 session read this memo and its twin, standing in for Fable
5.1 by the maintainer's decision of 2026-09-23 (header). Its findings, under
its labels, and what was done with each:

| Finding | Level | What was done |
|---|---|---|
| Section 8 counted a block closed by `...`, and spaces after `---`, as agreement, while Verso reads those lines as neither frontmatter nor body; draft 8.4 c's only link sat after the block, where both apps agree | IMPORTANT | Checked, and it holds. The divergence is in sections 3, 8.2 and 8.3, with point 7 of the recommendation; draft c gains a link inside the block, fails today, and says that its new line was not observed |
| Section 11.2's `fim` row cited an input that section 10.1 did not list | IMPORTANT | The input, `q4-charset.md`, recovered and recorded in section 10.1; sections 11.2 and 13 point to it |
| Two Q23 rows and recommendation 6 went against closed Q12's wording without saying so, and so does a comment in `store.rs` | IMPORTANT | Recorded in section 12.3, with the note that recommendation 6 would amend Q12; no side taken |
| Section 15 compared against `origin/main`, which does not fit the local stack | IMPORTANT | `git show --stat 323d070` instead |
| The header named Fable 5.1 as the reviewer | IMPORTANT | The header names the reader and the maintainer's decision; this section |
| Section 2.1 said, with no source, that the vault's two plugins do not parse notes | MINOR | Softened: not checked |
| Section 2.3 did not consider LiveSync carrying the run and its deletion elsewhere | MINOR | Recorded for the maintainer |
| Sections 9.4 and 10.4 worded inferences about Obsidian as facts | MINOR | Marked as inferences |
| Section 6.3 said nothing matches a link's heading, then described `sliceHeading`, which does | MINOR | Corrected: only an embed does |
| Section 7.3 gave `guardLink` as why a relative link does nothing; the sanitizer strips the address first | MINOR | Corrected |
| Draft 7.5 decodes the destination while spec §4.2 defines `target` as written | MINOR | A line in section 7.5 and in the draft: closing Q20 with it changes §4.2 too |

These corrections were written by Opus 5.5 and have not been read again.

## 17. make.md 1.3.5 in the Sandbox vault (ADR 0060 D13)

- Date: 2026-10-02
- Status: **partly observed.** [ADR 0060](../adr/0060-makemd-organizing-features.md)
  D13 asks for the twelve steps of the [memo](makemd-decision.md) §8 to be
  run in Obsidian before S3. A first record, written by the implementation,
  gave twelve results nobody had observed; the review of the slices (Opus
  5.5, 2026-10-02) withdrew them, and S3 had been built without them. The
  maintainer then asked for them to be run ("rodar"). This section is that
  run.
- How: Obsidian 1.13.7, make.md 1.3.5 enabled, the Sandbox vault, a
  throwaway folder `verso-makemd-probe/`, removed afterwards. Through the
  Obsidian CLI (`eval`), make.md's menus cannot be clicked: each step that
  ran called the function make.md's own menu calls to write — its space
  manager's `saveLabel` and `saveProperties` — or ran its command from the
  palette (`app.commands`), and read the vault's files before and after
  (`find -newer`). make.md is a third party's plugin, MIT; nothing of the
  Obsidian app was inspected ([ADR 0009](../adr/0009-external-constraints.md)).
  Where a step needs make.md's own picker or drag, it was not observed.

### 17.1 What is in the Sandbox vault

Before the run, with `ls`: `.obsidian/plugins/make-md/` installed and
enabled in `.obsidian/community-plugins.json`, beside `obsidian-livesync`;
`.makemd/` (16:35); `.space/waypoints.json` —
`[{"name":"Home","sticker":"ui//home","paths":["/"]}]` — and
`.space/iconsets/` (11:35); an empty `Tags/` (11:35). The vault has no
`.git`. D13 asked that the plugin be removed afterwards; the maintainer
chose on 2026-10-02 to keep it there, with these files, to compare make.md's
behaviour with Verso's ("deixa lá … vou usar pra validar comparando
funcionamento"). The probe folder is gone; make.md is enabled, as it was.

### 17.2 The twelve steps

| # | Do | Settles | Result |
|---|---|---|---|
| O1 | Set a sticker on a note | the frontmatter written, and nothing else touched | **Observed** (`saveLabel(note, "sticker", "emoji//1f3b2")`): the note alone changed, to `sticker: emoji//1f3b2`, bare. No `.space/` file. Which value the picker passes is the source's (`emoji//<hex>`), not observed. |
| O2 | Set a sticker and a colour on a folder | the folder note, created if missing (D3); the form of `color:` | **Observed** (`saveLabel(folder, …)`): `Pasta/Pasta.md` was created inside the folder with only `sticker: emoji//1f4c1` and `color: "#e05252"` (a hex, quoted) in its frontmatter; no `.space/` file. Whether make.md's colour picker passes a hex: not observed. |
| O3 | Add a cover; reposition it | the values of `banner:` and `banner_y:` | **In part.** `saveLabel` does not take `banner` (nothing written). `saveProperties(note, {banner_y: "42"})` wrote `banner_y: "42"`. make.md's reposition, in its source, saves the percentage it shows (`S.toString()`, shown as `S%`); one of its readers takes the value as a percentage (`Math.min(100, v)%`), another as a fraction (`v*100%`). Verso writes and reads a percentage. The gesture itself: not observed. |
| O4 | Drag a note above its sibling | where the order is written; whether `rank:` appears | not observed (a drag in make.md's navigator) |
| O5 | Pin a note to a folder | `def.json`'s `links` | **Inconclusive**: the command `make-md:mk-pin-active` on `Pasta/Item.md` changed `.obsidian/plugins/make-md/data.json` and `.makemd/` caches; no file of the vault, `.space/` included, named the note. |
| O6 | Hide a note | the plugin's settings only, or the vault | not observed (make.md's context menu) |
| O7 | Add a text property to a folder's context | the frontmatter of every note, or only `context.mdb` | not observed |
| O8 | Turn a note into a folder | the paths after; links rewritten or not | **Observed** (`make-md:mk-convert-folder-note` on `Vira.md`): `Vira.md` became `Vira/Vira.md`; `[[Vira]]` in another note was left as it was, and still reaches the note by name. A link by path was not tried. |
| O9 | Insert a flow block from `/`; open the note with make.md disabled | the Markdown written; what Obsidian alone shows | not observed |
| O10 | Rename a tag from its tag page | which files change | not observed |
| O11 | Open the vault, change nothing, close | that make.md writes nothing on open | not observed |
| O12 | Disable make.md | what Obsidian shows of everything above | **Inconclusive**: disabling it from the CLI returned nothing to read. With it enabled, Obsidian's own metadata cache reads `sticker: emoji//1f3b2` as an ordinary property. |

### 17.3 What the code does with it

Verso writes `sticker: emoji//<hex>` and `lucide//<name>` (O1, the
source), a colour as a hex (O2's form; the maintainer, 2026-10-02), the
folder's labels in its folder note, created when missing,
with no question (O2, D3) — and `banner_y` as a percentage (O3). `order:` and `pinned:` in the
folder note are Verso's own (D4, D5) and do not depend on O4 and O5. O4–O7
and O9–O12 still wait for someone at make.md's menus.

## 18. A board edited hard together, opened in Obsidian 1.14.4 (2026-10-12)

Observed from outside (ADR 0009) after the board stress of ADR 0082 item
12 (`crates/verso-server/src/tests_board_stress.rs`, seed 2): the file the
room wrote — 34 cards (11 of them groups), 12 edges (5 with a label), 55
drawn elements under `verso`, and an unknown top-level key — copied into
`Sandbox/verso-fixtures/`, read and opened with the CLI's `eval` on the
public API (`app.vault.read`, `JSON.parse`, `workspace.getLeaf(true)`,
`leaf.openFile`, `view.getViewType()`), then removed.

| What | Seen |
|---|---|
| The file read and parsed | yes: 34 nodes, 12 edges, 55 drawn |
| Opened in a tab | the `canvas` view, no error |
| Written by Obsidian on opening | **yes**: each of the 12 edges, which had no `fromSide`/`toSide`, gained both; nothing else changed — every node as it was, `verso` (the drawing) equal as JSON, the unknown top-level key kept |

So a canvas whose edges carry no sides is rewritten by Obsidian the first
time its canvas view opens it. An edge the board draws gets its sides as
it is attached (ADR 0057 points 14 and 20); the stress test's edges had
none because the test makes the file itself. In a room, Obsidian's write
over the mount is a change from outside: taken in, or the people in the
board choose (ADR 0082 item 12).

## 19. Page preview, in Obsidian's public help (2026-10-14)

Read before building the hover preview, as [ADR
0085](../adr/0085-hover-preview.md) item 3 asks: Obsidian's public help,
<https://obsidian.md/help/plugins/page-preview>, read on 2026-10-14 — the
help only, never the app ([ADR 0009](../adr/0009-external-constraints.md)).

| What the help says | Verso |
|---|---|
| Hovering over an internal link previews the file, on by default, in the file explorer, search, backlinks "and more" | a plain hover in Reading, the Links panel, the graph and a board's card; not the file tree in the first version (ADR 0085 item 2) |
| In Editing view, `Ctrl` (`Cmd` on macOS) pressed while hovering shows it | Edit mode previews only with ⌘ or Ctrl held (item 3, decided) |
| An option requires the modifier everywhere | not built: no such option was decided; the setting turns the hover off (item 8) |

The help does not say what Reading view does beyond the default, how long
the pointer rests, or whether a preview opens inside a preview; Verso's
answers are the ADR's (half a second; no preview inside a preview).

## 20. Daily and periodic notes' settings files (2026-10-14)

Observed before building [ADR 0093](../adr/0093-periodic-notes.md) item 11,
from outside ([ADR 0009](../adr/0009-external-constraints.md)): the
`Sandbox` test vault, Obsidian 1.14.4 (installer 1.11.5) on macOS, read only
— nothing was created or changed in it.

| What | Found |
|---|---|
| `.obsidian/core-plugins.json` | `"daily-notes": true`, `"templates": true` |
| `.obsidian/daily-notes.json` | absent: the core plugin on, its settings never changed |
| `obsidian vault=Sandbox daily:path` (the CLI) | `2026-10-14.md`: no file means the defaults — the vault's root, `YYYY-MM-DD` |
| `.obsidian/plugins/` | `make-md`, `obsidian-livesync`, `task-list-kanban`: no `periodic-notes` |

None of the maintainer's other vaults holds either file, so their shape
with values was not observed in a file Obsidian wrote. It is taken from
the public, MIT-licensed source of the community Periodic Notes plugin
(`liamcain/obsidian-periodic-notes`, read 2026-10-14 through GitHub's API —
a third party's plugin, not the app): in 0.0.17 `data.json` holds one object
per period, `daily` … `yearly`, each `{enabled, format, folder, template}`;
in 1.0 it holds `calendarSets`, each with `day` … `year` as
`{enabled, openAtStartup, format, folder, templatePath}`, the active one
named by `activeCalendarSet`, and a `weekStart` of `sunday` … `saturday` or
`locale` among its defaults (the plugin also reads the week's start from the
vault's configuration, which Verso does not read). The core plugin's
`daily-notes.json` keys, `folder`, `format` and `template`, are those
community code reads (ADR 0093, Context). Verso reads both shapes; a
`daily-notes.json` with values, and a vault with the plugin, are left to
the manual checks.
