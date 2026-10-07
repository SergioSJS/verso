# ADR 0062 — Focuses: named roots of the file tree, shared with make.md

- Date: 2026-10-03
- Source: the maintainer, 2026-10-02 and 2026-10-03, in session, after
  testing [ADR 0060](0060-makemd-organizing-features.md)'s slices: "e sobre a
  criação de Navigator que define atalhos como se tivesse movendo a raiz da
  aplicação pra outras pastas" (and the navigator that sets shortcuts, as if
  moving the app's root to other folders); "pensei de aproveitarmos a barra
  da direita que praticamente não tem uso, aí teria uma aba a mais que
  listaria todos os focos, que inclui automaticamente o foco da raiz real"
  (use the right panel, nearly unused: one more tab listing every focus,
  the real root's included by itself); on where focuses are kept, "onde o
  obsidian guarda? … a gente copia e fica até compatível" (where does
  Obsidian keep them? we copy it and stay compatible), and then: "Só ler, mas
  poderíamos criar um mecanismo de converter e aplicar as mudanças no
  arquivo do obsidian, avisando do risco de compatibilidade … se for
  diferente do que sabemos, mantemos só leitura, se for igual ao esperado,
  escrevemos no arquivo pra manter syncado … a pessoa poderia usar os 2"
  (read only, but convert and write back to Obsidian's file, warning of the
  risk: an unknown format stays read only, the known one is written to keep
  both in sync, so the person can use both apps). The implementation is
  delegated to Antigravity ("vou ter que delegar o focos para o
  antigravity").
- Status in the briefing: not present

## Context

make.md calls them focuses (memo
[`makemd-decision.md`](../reference/makemd-decision.md), N3): a row of named
roots above its navigator, each a set of folders and files; choosing one
shows the navigator from there. [ADR 0060](0060-makemd-organizing-features.md)
D5 left them for later, with [ADR 0041](0041-multi-root-workspace.md) (several
roots, `PROPOSED`). Obsidian itself has none; the file is make.md's.

make.md keeps them in one file at the vault's root, `.space/waypoints.json`.
Seen in the maintainer's Sandbox vault on 2026-10-03, make.md 1.3.5:

```json
[{"name":"Home","sticker":"ui//home","paths":["/"]},
 {"sticker":"ui//spaces","name":"aaaa","paths":["Untitled","Untitled/pasta","Untitled/xxxxx.md"]}]
```

An array of objects, each with `name` (text), `sticker` (make.md's form,
[ADR 0060](0060-makemd-organizing-features.md) D2) and `paths` (a list): `"/"`
is the vault's root, other paths are relative to it, and a path may name a
note as well as a folder. The keys come in either order.

Two accepted decisions stand in the way of writing it: ADR 0060 D2 ("nothing
under a `.space/` folder is ever written") and
[ADR 0044](0044-verso-fs-semantics.md) (a name that starts with `.` is not
walked, and `verso-fs` refuses a handle to it).

The right panel holds Outline, Backlinks, Outgoing links, Tags, Bookmarks
and Calendar ([ADR 0049](0049-phase-2-scope-widened.md) §1).

## Decision

Written by the author from the maintainer's words above, and accepted by
the maintainer as written (Status).

1. **What a focus is (D1).** A name, a sticker and a list of paths inside
   the open folder — folders and notes. Choosing a focus shows the file tree
   from those paths: each folder as a root of the tree, each note as a row.
   **"Início"** (*Home*) is always first: the open folder itself, made by
   Verso, never deleted. Paths outside the open folder are
   [ADR 0041](0041-multi-root-workspace.md), not this.
2. **Where they are shown (D2).** A tab **"Focos"** (*Focuses*) in the right
   panel, beside Bookmarks: every focus, Início first, the one in use
   marked. A click chooses it. The tab adds one, renames it, changes its
   sticker, reorders and deletes them. The file tree's heading names the
   focus in use ("ARQUIVOS · Projetos") with a way back to Início.
3. **How one is made (D3).** From a folder's or a note's menu in the tree:
   "Criar foco aqui" (a focus with that path) and "Adicionar ao foco…"
   (adds the path to one). A palette command, "Trocar foco", lists them; it
   can be bound to keys (Settings › Hotkeys).
4. **What a focus does not change (D4).** Search, links, backlinks, the
   graph, the bases and the index stay the whole open folder's. A focus is
   a view of the tree only.
5. **Where they are kept (D5).**
   - With **no** `.space/waypoints.json` in the open folder: in Verso's
     configuration, per open folder, outside the folder
     ([ADR 0011](0011-config-outside-tree-index-as-cache.md)). Verso does not
     create `.space/`.
   - With one, its focuses are **read** and shown, always.
   - They are **written back** only when the file is in the **known format**
     (D6), and only after the person is told once, per open folder, that
     make.md's file is not a published format and a later make.md may read
     it otherwise; their answer is kept. Then a change made in Verso is
     written there, and both apps show the same focuses.
   - In any other case — an unknown format, an answer of no — the file is
     read only, the tab says why, and focuses made in Verso stay in its
     configuration, beside make.md's.
6. **The known format (D6).** A JSON array; each element an object whose
   keys are `name` (a string), `paths` (an array of strings) and, optionally,
   `sticker` (a string), and no other key; each path `"/"` or relative, with
   no `..`. Anything else is unknown, and the file stays read only. Writing
   keeps what Verso did not change as it was: the elements' order, the keys'
   order, a focus Verso does not show.
7. **The exceptions this asks for (D7).** To ADR 0060 D2: Verso writes one
   file under `.space/` — `waypoints.json` at the open folder's root — under
   D5 and D6, and nothing else under `.space/`. To ADR 0044: `verso-fs` reads
   and writes that one path, by name, as it does `.trash/`; every other
   dot-leading entry stays unwalked and refused. Each write is atomic and
   checks that the file is the one read (invariants 9 and 11); a file changed
   since — make.md writing it at the same time — is read again and the one
   change is applied anew, or, if it no longer can be, nothing is written and
   the tab says so.
8. **Freshness (D8).** The watcher does not see dot-leading entries; the file
   is read again when the tab is shown, when the window takes the focus, and
   before every write.
9. **Settings (D9).** One setting outside [ADR 0060](0060-makemd-organizing-features.md)
   D12's ten, in Settings › Organizing: "Sincronizar focos com o make.md"
   (*Sync focuses with make.md*), the answer of D5 for this folder, so it can
   be changed later.

## Consequences

- Slices, each a pull request of its own:
  - **F1** — Rust: the `verso-fs` exception, read and write of
    `.space/waypoints.json` with the format check (D6), contract commands, the
    harness's answers. Tests: the known format read; an unknown key, a `..`,
    a non-array each read only; a write that changes one focus leaves every
    other byte as it was; a file changed since the read is read again; a
    hidden path other than this one still refused.
  - **F2** — the window: the Focos tab, Início, choosing a focus, the tree
    from its paths, the heading, the menus, the palette command, the setting
    and the one-time warning, the Verso-configuration store.
  - **F3** — the tutorial: a note of the demo vault and a stop on "Tour do
    Verso" ([ADR 0058](0058-demo-vault-as-tutorial.md)); walkthrough steps;
    changelog lines in both languages.
- e2e tests in the harness for D1–D5 and D8, each seen failing without its
  change; level-A steps in the real app with make.md open on the same vault
  (the Sandbox keeps make.md for that, by the maintainer's choice of
  2026-10-02), the app's log read after each.
- New Tauri commands go in `app/src-tauri/build.rs`'s list and
  `capabilities/default.json`; the harness does not see that list.
- The real app's `window.confirm` is asynchronous and `window.prompt`
  returns nothing: the warning of D5 uses the window's own dialog (`ask`).
- [ADR 0060](0060-makemd-organizing-features.md) D5 ("focuses wait for 0041")
  is replaced by this, for paths inside the open folder; 0060 gets a line
  pointing here when this is accepted.
- **Authorship.** The maintainer delegates the implementation to Antigravity
  — a deviation from [ADR 0032](0032-author-and-reviewer-roles.md)'s roles,
  as in ADR 0060 — and each pull request is read by a Claude model in a
  session of its own before the merge. This record was written by Opus 5.5.

## Discarded alternatives

Weighed by the maintainer in session:

- Focuses only in Verso's configuration — no compatibility with make.md.
- Reading and writing make.md's file whatever it holds — the risk of
  writing over a format Verso does not know.

Considered by the author and put to the maintainer:

- A row of focuses above the tree, as make.md shows them — the right panel
  was the maintainer's choice; switching from the palette covers the panel
  being closed.

## Status

Accepted (2026-10-03): the maintainer, in session, on this text — "parece
estar tudo certo, aceito".
