# Decision memo: the board — Excalidraw over JSON Canvas

- Date: 2026-09-29
- Status: **decided by the maintainer on 2026-09-30**, in session; the
  answers are in section 10 and recorded in
  [ADR 0057](../adr/0057-board-json-canvas.md). Sections 1 to 9 are the memo
  as the maintainer read it, options and recommendations labelled as such
  ([ADR 0040](../adr/archive/0040-board-persistence.md) said to decide persistence
  "before the board").
- Author: Opus 5.5 — of the documents, the role
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) gives "Opus 5"; and, by
  the maintainer's decision of 2026-09-29, of the whole board sequence,
  Rust included, to save Fable usage. That is a deviation from ADR 0032 for
  the Rust, declared again in each Rust pull request. Reader: Fable 5.1, which
  wrote none of it.

## 1. What was asked

- 2026-09-29: "vamos puxar a demanda do canvas hexcalidraw etc agora., se ja
  nao tiver detalhado, preciso ver a viabilidade e próximos passos".
- 2026-09-29, on the plan that answered it: "detalhe melhor esses próximos
  passos, vamos fazer isso mesmo", and, on who writes it, "vou colocar o opus
  pra fazer […] tenho que economizar o fable".

## 2. What exists now

Decided texts:

| Text | Says | Status |
|---|---|---|
| [ADR 0024](../adr/0024-board-excalidraw.md) | the board uses Excalidraw (MIT) as a free annotation layer; tldraw discarded for its license | Accepted |
| ADR 0024, Consequences | nodes are notes, edges are typed relations, a free arrow can be promoted to a typed relation | `PROPOSED` |
| [ADR 0040](../adr/archive/0040-board-persistence.md) | persistence: none; must fit Obsidian's `.canvas` and degradation to readable Markdown; extending JSON Canvas allowed, replacing it not | `[OPEN]` |
| [ADR 0035](../adr/0035-cross-cutting-requirements.md) | the board needs an equivalent accessible view, a list or table of the same notes and relations | `PROPOSED` |
| [ADR 0034](../adr/0034-roadmap-in-phases.md), `docs/roadmap.md`, `CLAUDE.md` §2.5 | the board is out of scope until the end of Phase 2 | Accepted |
| [ADR 0049](../adr/0049-phase-2-scope-widened.md) §3 | Excalidraw or the Obsidian canvas: asked for and not built | Accepted |
| [Spec §5.11](../spec/dialect.md) | `.canvas` files are read and written without breaking | — |
| Spec, conversion table, D4 | the plugin's `.excalidraw.md` becomes Verso's board format by explicit conversion, with a diff | `PROPOSED` |
| Spec, section 9, Q16 | which non-Markdown files enter the index as link targets (`.canvas` among them) | `[OPEN]` |

The window today opens a `.canvas` as a text file, in the editor, as raw JSON
(`app/ui/src/main.ts`, the `TEXT` extensions). Nothing draws it.

The kanban, calendar and table views came into Phase 2 the same way the board
would now: a revision of ADR 0049 §3 saying the line no longer holds, and an
ADR of their own ([0053](../adr/0053-views-bases.md)). That is the precedent
section 6 proposes to follow.

## 3. What was observed in Obsidian

Obsidian 1.13.7 (installer 1.11.5), macOS, the Sandbox vault
(`cofre-rpg-dados-criticos`), 2026-09-29. Admissible under
[ADR 0009](../adr/0009-external-constraints.md): files written by hand, the
app driven through its own command line (`open`, `rename`, `backlinks`,
`links`), and a node dragged with a synthetic mouse event (`dev:cdp`
`Input.dispatchMouseEvent`) — input from outside, the same as a hand on the
mouse; nothing of the app was read. Throwaway folders `verso-board-probe/`
and `verso-board-probe2/`, removed afterwards.

### 3.1 The vault's own files

- Two `.canvas` files written by Obsidian (`2. Escudo do Mestre/Quadro do
  Mestre.canvas`, three `file` nodes, no edges; `Sem título.canvas`, empty).
  Layout: tab indentation, one node per line, key order `id, x, y, width,
  height, type, file`, no newline at the end of the file.
- One drawing of the Excalidraw plugin, `5. Infraestrutura/Templates/Nova
  Estrutura de Aventura.md` (16 KB): frontmatter `excalidraw-plugin: parsed`,
  a `## Text Elements` section with each text and a `^id` ("Gancho", "Cena 1",
  "pista", "Cena Ativa"…), and a `## Drawing` section in a
  `compressed-json` block — the scene, compressed and base64-encoded, not
  readable. An adventure structure drawn as a board: the use case the
  briefing names.

### 3.2 Probes

| # | What was done | Result |
|---|---|---|
| O1 | A `.canvas` with unknown fields on a node (`"versoExtra":{"k":1}`), on an edge (`"versoRel"`) and at the top level (`"verso":{…}`); a note it points to renamed with the canvas **closed** | the `file` path updated; **every unknown field kept** |
| O2 | The same canvas **opened** in Obsidian | the file not written on open (same hash) |
| O3 | A note it points to renamed with the canvas **open** | path updated; unknown fields kept |
| O4 | A node **dragged** in the canvas view | the view saved: unknown fields on nodes, edges and top level **kept**; the keys of every node **reordered** (`id, type, <type fields>, <unknown fields>, x, y, width, height, color`); the edge's unknown field moved after `id`; the position snapped to the grid (y 0 → 70) |
| O5 | A node of an **unknown type** (`"type":"verso-drawing"`) next to a `file` node | not drawn; on the next save of the view (a drag of the other node) **the unknown node was deleted from the file** |
| O6 | A large top-level extension, written with nested arrays on one line | kept; reformatted by Obsidian's rule below |
| O7 | `backlinks` of a note that a canvas `file` node points to | the canvas is listed as a backlink, count 1 (also for the vault's own `Quadro do Mestre.canvas`) |
| O8 | A note with `[[board]]` and `![[board.canvas]]` | `[[board]]` unresolved; `![[board.canvas]]` resolved, and the canvas lists the note as its backlink |
| O9 | `links` of a `.canvas` | "No links found", although O7 counts its `file` nodes as backlinks elsewhere |

**Obsidian's layout rule, as observed in O1, O4 and O6:** an object or array
whose values are all scalars is written on one line; one that holds an object
or an array is written one entry per line, indented with tabs; the file has no
final newline. A freehand stroke of 500 points saved by Obsidian becomes 500
lines.

What O5 settles: **a drawing cannot live in the canvas as nodes of a type of
our own.** Obsidian deletes them the first time the user moves anything.

## 4. Excalidraw as a dependency

Measured in a scratch install on 2026-09-29, not in the repository.

| | Finding |
|---|---|
| Package | `@excalidraw/excalidraw` 0.18.1, MIT; peers `react` and `react-dom` (17, 18 or 19); 19.3.0, MIT |
| npm license gate (`scripts/check-npm-licenses.mjs`, run over the scratch lockfile) | 278 packages; 2 refused: `tslib` (0BSD, a permissive license not on the allowlist) and `fuzzy` (no `license` field; `LICENSE-MIT` in the package). Same shape as Mermaid's entry on 2026-09-29: one license added for the maintainer's eye, one package taken by hand |
| Bundle, minified, split | ~8.5 MB of JavaScript in 179 chunks; by package: Excalidraw 4.5 MB, **Mermaid 11** 4.2 MB (pulled by `@excalidraw/mermaid-to-excalidraw`; the window already ships Mermaid 12), cytoscape 1.1 MB, react-dom 0.6 MB |
| Fonts | 13 MB, of which 12 MB is Xiaolai (hand-drawn CJK); the others 16–80 KB each |
| Network (ADR 0050) | the fonts load from `esm.sh` unless `window.EXCALIDRAW_ASSET_PATH` points elsewhere; the package also names `libraries.excalidraw.com`, `json.excalidraw.com` (share link), collaboration, AI and Excalidraw+ addresses. Share link appears only with the `onExportToBackend` prop |
| Extension points (`.d.ts`) | `renderEmbeddable` (draw our own content inside an element), `validateEmbeddable`, `onLinkOpen` (intercept a link click), `onChange`, `UIOptions`, `viewModeEnabled`, `langCode` (a `pt-BR` locale ships), `customData` on every element |
| The UI today | vanilla TypeScript, one esbuild bundle, no React. Excalidraw would be a React island mounted only in the board's pane |

## 5. JSON Canvas and Excalidraw, side by side

JSON Canvas 1.0 ([jsoncanvas.org](https://jsoncanvas.org/spec/1.0/), MIT,
`obsidianmd/jsoncanvas`): top-level `nodes` and `edges`; every node has `id`,
`type`, integer `x`, `y`, `width`, `height`, optional `color` (`"1"`–`"6"` or
hex); array order is z-order. The spec says nothing about unknown fields.

| JSON Canvas | Excalidraw | Loss going to Excalidraw | Loss coming back |
|---|---|---|---|
| `text` node (Markdown) | `embeddable` drawn by Verso (`renderEmbeddable`), or a `text` inside a `rectangle` | with a plain `text` element, the Markdown is shown raw | none with `embeddable`; with `text`, Excalidraw's font and size have no place in JSON Canvas |
| `file` node (`file`, `subpath`) | `embeddable` drawn by Verso: the note rendered, an image, a PDF | none | none |
| `link` node (`url`) | `embeddable` with the address; loading it is ADR 0050's business | none if drawn as a card, not a frame | none |
| `group` node (`label`, `background`, `backgroundStyle`) | `frame` (`name`) | Excalidraw's frame has no background image | a frame's clipping of its children has no JSON Canvas meaning |
| edge (`fromNode`/`toNode`, `fromSide`/`toSide`, `fromEnd`/`toEnd`, `label`, `color`) | `arrow` bound at both ends, with a bound `text` for the label; a side as a fixed point (`[0.5, 0]` is top) | none | an arrow bound to a free drawing element, or with a bend, has no edge form: it stays in the drawing |
| `color` `"1"`–`"6"` | a hex from a fixed table | none, given the table | a hex outside the table is written as a hex, which the spec allows |
| integer coordinates | floating point | none | rounded on save; Obsidian also snaps (O4) |
| — | `freedraw`, `line`, `rectangle`, `ellipse`, `diamond`, free `arrow`, free `text` | — | no JSON Canvas form: this is the "free annotation layer" of ADR 0024 |
| — | `image` (stored as `dataURL`, base64, inside the scene) | — | base64 in the file; see D2 |

## 6. The decisions

### D1 — Scope

The maintainer's answer is in section 1; what is left is how to record it.
**Proposal:** as the views were — revise ADR 0049 §3 (the board line no
longer holds, with the quote and date), write a new ADR for the board that
records D2 to D6 once answered, and change the "out of scope" lines of
`docs/roadmap.md` and `CLAUDE.md` §2.5 to drop "board", pointing at the new
ADR. ADR 0034's rule itself stays ("a scope item that is not listed here does
not enter the phase without becoming a recorded decision" — this is that
record). The Phase 2 exit gate (the month of use) does not change.

### D2 — Persistence (ADR 0040)

Two questions: where the drawing lives, and what draws the board.

**Where the drawing lives.**

| | (a) One file: the `.canvas`, the drawing under a top-level key (`"verso"`) | (b) Two files: the `.canvas` and a sidecar `.excalidraw` next to it | (c) The board is an Excalidraw file; `.canvas` only by export |
|---|---|---|---|
| What Obsidian shows | the notes, texts, links, groups and edges; not the drawing | the same | nothing of the board (core Obsidian does not open it) |
| Survives an edit in Obsidian | yes, observed (O1, O3, O4, O6) on 1.13.7; not promised by the spec | yes; Obsidian never opens the sidecar | — |
| Survives rename, move, delete in Obsidian | yes, it is one file | **no**: Obsidian moves the `.canvas` and leaves the sidecar behind; a delete orphans it | yes |
| Readable without Verso | JSON, one element per line by Obsidian's rule; texts legible | the same, plus the sidecar opens in excalidraw.com | JSON; not a `.canvas` |
| Fits ADR 0040 | yes: extends JSON Canvas, does not replace it | yes | **no**: the consequence "fit Obsidian's `.canvas`" |
| Risk | a future Obsidian that drops unknown top-level keys would lose the drawing in Obsidian's hands (O5 shows it does so for unknown node types) | a file pair that other tools do not keep together | — |
| Ruled out by O5 | the drawing as nodes of a type of our own | | |

Under either (a) or (b), an image dropped on the board becomes a file in the
folder and a JSON Canvas `file` node — which Obsidian also shows — never a
base64 `dataURL` inside the drawing.

**Recommendation: (a)**, with the risk recorded: re-run O4 and O6 on each new
Obsidian version the maintainer installs, and record it in
`obsidian-observations.md`. (b) is the fallback if the maintainer weighs
Obsidian's renames above that risk.

**What draws the board.**

| | (R1) Excalidraw draws everything | (R2) Verso draws the nodes; Excalidraw is a transparent layer on top |
|---|---|---|
| Nodes and edges | mapped to Excalidraw elements on open (section 5), back to JSON Canvas on save; notes drawn by Verso inside `embeddable` elements | Verso's own renderer (DOM), as Obsidian's |
| Pan, zoom, undo, selection | one engine | two, kept in step by hand; a mode switch between "move notes" and "draw" |
| Cost | the mapping of section 5 must be exact for everything Obsidian reads | a canvas editor of our own, plus the synchronisation |
| ADR 0024's words | Excalidraw is more than the annotation layer: it is the surface | literally "a free annotation layer" |

**Recommendation: R1.** One surface is simpler for the user and for the code;
the mapping is the part to test (the round trip in section 7). If the
maintainer reads ADR 0024's "annotation layer" as excluding R1, that is the
answer that decides it.

### D3 — The semantic layer in the first version?

It depends on the typed relation syntax, `[OPEN]` in the spec. **Options:**
in; out, with edges as JSON Canvas edges with a free `label`, which Obsidian
already shows. **Recommendation: out** — a first version that promotes
nothing, and the typed relation syntax decided on its own.

### D4 — Converting the plugin's `.excalidraw.md` now?

One real drawing in the Sandbox (section 3.1). The plugin is
**AGPL-3.0** (`zsviczian/obsidian-excalidraw-plugin`); Verso is MPL-2.0. A
converter is written from the file's own structure (section 3.1) and
Excalidraw's MIT schema, reading none of the plugin's code; the
`compressed-json` block would need an LZ-string decoder, a dependency to
justify then. Explicit conversion, with a diff (invariant 8). **Options:** in
this sequence (a third pull request); later. **Recommendation: later**, once
the board is in use — the conversion's target is the format D2 picks.

### D5 — Spec Q16 for `.canvas`

Observed (O7–O9): Obsidian counts a canvas `file` node as a backlink to the
note, resolves `![[board.canvas]]` by its full name and not `[[board]]`.
**Options:** (a) the same in Verso — `file` nodes are backlink sources, a
`.canvas` is a link target by its full name; (b) no; (c) later.
**Recommendation: (a)**, which closes Q16 for `.canvas` only; the other
non-Markdown files keep the question. Whether Obsidian also counts the
`[[links]]` inside a `text` node was not observed; to observe before the
spec text.

### D6 — The accessible view

`PROPOSED` in ADR 0035. **Proposal:** promoted with the board, not after, in
a minimal form: a "list" toggle on the board's pane showing groups with their
nodes (a note as a link, a text node's text, a link node's address), edges as
"A → B (label)", and the drawing's free texts under "annotations"; keyboard
navigation, Enter opens the note. **Options:** that; a table instead; later.

### Also for the maintainer's eye (not decisions of ADR 0040)

- **Fonts and the network (ADR 0050).** Self-hosted, through
  `EXCALIDRAW_ASSET_PATH`: nothing loads from `esm.sh`. Xiaolai (12 MB) ships
  or not: without it, Chinese, Japanese and Korean text on the board falls
  back to a system font. Recommendation: drop it.
- **Excalidraw's online features.** Share link, collaboration, AI, Excalidraw+
  and the library browser off or hidden. Recommendation: all hidden.
- **Licenses.** `0BSD` added to the allowlist and `fuzzy` taken by hand as
  MIT, in the pull request that brings the package, as Mermaid's were.
- **Weight.** The board loads as a separate chunk when a board is opened, so
  the window's start does not grow; the build gains esbuild's code splitting.
  Mermaid 11 comes inside Excalidraw's chunk (its "Mermaid to Excalidraw"
  feature) next to the window's Mermaid 12: accept the duplicate, or hide the
  feature and let the bundler drop it. Recommendation: hide it.
- **The text view stays.** A `.canvas` opens as a board; "open as text"
  keeps today's behaviour one click away.

## 7. What follows the answers

Each item is a pull request of one subject (ADR 0051), in this order.

1. **Documents.** The ADR of D1 with D2–D6; ADR 0040 closed; ADR 0024's and
   ADR 0035's Status; ADR 0049 §3 revised; roadmap and `CLAUDE.md` §2.5;
   spec §5.11, Q16 and section 9; briefing §9's persistence row (pt-BR
   original first). Both languages.
2. **`.canvas` in the core (Rust).** Read and write `.canvas` through the
   contract; atomic write and the revision check (invariants 9 and 11).
   The writer keeps every unknown field and the key order it read, and
   writes by Obsidian's layout rule (section 3.2) — so a file Verso did not
   change comes out byte for byte, and one Verso changed differs only where
   it changed. Guardrail in the same pull request, seen failing first: a
   round-trip test over files in Obsidian's layout (the Sandbox's own
   canvases and the probes of section 3.2), reading then writing with no
   change gives the same bytes; opening writes nothing (invariant 7). If D5
   is (a), the index change rides here.
3. **The board's pane (UI).** React and Excalidraw, loaded only in the pane;
   the mapping of section 5; saving only through the contract, with the
   diff shown on a concurrent change (invariant 11); the accessible view of
   D6; `pt-BR` and English; the network and license points above; a
   changelog line in both languages.
4. **Only if D4 is "in":** the conversion.

## 8. What this memo did not verify

- That Obsidian keeps unknown fields on versions other than 1.13.7, or on
  edits other than rename and drag (resize, recolour, grouping, edge editing
  were not tried).
- Whether Obsidian counts `[[links]]` inside a canvas `text` node as
  backlinks.
- Excalidraw inside the app's WKWebView: nothing was run in the window. The
  measurements of section 4 come from a scratch install and a bundle built
  outside the repository.
- Whether the Excalidraw plugin opens a plain `.excalidraw` sidecar (option
  b's "readable elsewhere").
- The performance of a board with many notes drawn as `embeddable` elements.

## 9. For the maintainer

1. D1: record the scope as the views were (ADR 0049 revision, a new ADR,
   roadmap and `CLAUDE.md`)? Yes / another way.
2. D2, where the drawing lives: (a) one file, (b) sidecar, (c) Excalidraw
   file.
3. D2, what draws the board: R1 or R2.
4. D3, the semantic layer: in or out of the first version.
5. D4, `.excalidraw.md` conversion: in this sequence or later.
6. D5, `.canvas` in the index: (a), (b) or (c).
7. D6, the accessible view: the list, a table, or later.
8. Xiaolai, the online features, the Mermaid duplicate: as recommended, or
   otherwise.

## 10. The answers

Given in session on 2026-09-30, numbered as section 9:

| # | Answer | Recorded as |
|---|---|---|
| 1 | "sim" | ADR 0057 point 1 |
| 2 | "a" — the drawing in the `.canvas`, under a top-level key | ADR 0057 point 2 |
| 3 | "r1" — Excalidraw draws everything | ADR 0057 point 3 |
| 4 | "dentro" — the semantic layer in the first version | ADR 0057 point 4 |
| 5 | "agora" — the conversion in this sequence | ADR 0057 point 5 |
| 6 | "como obsidian" | ADR 0057 point 6 |
| 7 | "Pode seguir a melhor escolha para nossa aplicação se baseando no mercado" | ADR 0057 point 7, the author's choice |
| 8 | "Pode adicionar, tem problema não" | ADR 0057 point 8 |

Answer 4 needed spec Q10, which was `[OPEN]` and which the spec says to decide
"before implementing relations"; answer 8 could be read two ways. Both were
put back to the maintainer as multiple choice the same night, the author's
recommendation first:

| Question | Options | Answer |
|---|---|---|
| Where does a relation promoted on the board live? | in the source note's frontmatter, `aliado: "[[B]]"` (recommended); only on the board's edge; the semantic layer deferred | **the source note's frontmatter** |
| "Pode adicionar": Xiaolai ships, the "Mermaid to Excalidraw" feature stays with its copy of Mermaid, and the online features stay hidden under ADR 0050? | correct (recommended); turn the online features on too, with ADR 0050 amended | **correct** |

Four more probes, run before writing ADR 0057 on the same Sandbox, by the
method of section 3 (a throwaway folder `verso-rel-probe/`, removed
afterwards):

| # | What was done | Result |
|---|---|---|
| O10 | A note with `aliado: "[[B]]"` and `inimigos:` listing `"[[B]]"` and `"[[C]]"` | `backlinks` of B: the note, count 2; the metadata cache's `frontmatterLinks` (public API) name the keys `aliado`, `inimigos.0`, `inimigos.1` |
| O11 | The same note with `semaspas: [[C]]`, unquoted | read as a nested YAML list (`[["C"]]`); not a link |
| O12 | A canvas whose `text` node says `ver [[C]] aqui` | `backlinks` of C lists the canvas, count 1 — the unverified point of D5 in section 8 |
| O13 | A node with the unknown fields `"e":[]` and `"o":{}`, and `"verso":{"version":1,"drawing":[]}` at the top level, dragged (folder `verso-board-probe3/`, removed) | an empty array or object is written `[]` or `{}`, and the object that holds one is written one entry per line: an empty container counts as nested for Obsidian's layout rule (section 3.2), which is how the core's writer counts it |
