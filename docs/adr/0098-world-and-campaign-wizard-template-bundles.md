# ADR 0098 — The project wizard: a folder tree from a bundle, shown and edited before it is written

- Date: 2026-10-17; rewritten 2026-10-20
- Source: the maintainer, 2026-10-17, looking at Igor Téuri's campaign
  vault "Dados Críticos": *"ele funciona assim, criou automações no obsidian
  que replica 'mundos' a partir do padrão, então acho que podemos fazer
  nesse padrão, a partir de um cofre, vc abre algum tipo de criador de
  mundos/contexto que cria a pastinha do mundo com as sub-pastas seguindo um
  template base ou template que o usuário arrumou"* (it works like this: he
  made Obsidian automations that replicate "worlds" from a pattern, so I
  think we can do it that way: from a vault, you open some kind of world
  maker that creates the world's folder with its subfolders from a base
  template or one the user arranged). The first text and code, by another
  AI (Gemini, in Antigravity), were marked Accepted with no acceptance; the
  review of 2026-10-20 found the wizard reporting success when the core had
  refused every file. The maintainer's answers of 2026-10-20 are quoted in
  the items; this text replaces the first one.
- Revisions: 2026-10-21 — the four `[PROPOSED]` details decided and the
  question of [0015](0015-schema-packs.md) answered, by the maintainer
  marking the options of the decisions questionnaire of 2026-10-20 (answered
  2026-10-21): items 2, 5, 7 and 10 as proposed, and a new item 11. Status
  Accepted.
- Related: [0012](0012-files-are-source-of-truth.md),
  [0015](0015-schema-packs.md),
  [0019](0019-generative-opt-in-and-keychain.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0044](0044-verso-fs-semantics.md),
  [0048](0048-file-operations-in-ui.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status in the briefing: not present.

## Context

Starting a book, a world or a campaign means the same folders and first
notes each time. In Obsidian, vaults like Dados Críticos do it with
Templater scripts — JavaScript run from a note. Verso runs no code from a
note; a bundle that only *declares* folders and files does the same job
safely, and can come from anywhere, an AI included, which makes it
untrusted input.

## Decision

Accepted on 2026-10-20 for the items marked `[DECIDED 2026-10-20]`, in the
maintainer's words, and on 2026-10-21 for the items marked
`[DECIDED 2026-10-21]`, where the maintainer chose the option written in
the item in the decisions questionnaire of 2026-10-20 (he marked it, with
no words of his own); nothing is left `[PROPOSED]`.

1. **The wizard.** "New project from a bundle…", from the palette and the
   file tree: a name, a target folder, a bundle. Every bundle is listed;
   none is hidden by the features of [0103](0103-feature-presets-and-capability-flags.md),
   whose "Project wizard" switch only hides the wizard itself.

2. **A bundle declares, and does nothing else.** JSON: `folders` (relative
   paths) and `files` (a path, an optional frontmatter object, Markdown
   content; a `.canvas` or `.base` file kept as such). No script, no code.
   `[DECIDED 2026-10-21]` (0098.2, option A): bundles a person imports are
   kept in the folder,
   `.verso/bundles/<id>.json`, through the same contract commands as
   layouts ([0099](0099-visual-markdown-statblocks-and-cards.md) item 2),
   so a shared folder shares them; an import with the id of another bundle
   gets a new id and says so.

3. **The tree is shown, and can be changed, before anything is written.**
   `[DECIDED 2026-10-20]`: *"15. sim, com opção de mudar"* (yes, with the
   option to change it). A dry run plans every folder and file; the person
   sees the tree, unticks what they do not want (what is inside an unticked
   folder goes with it) and renames entries; the edited plan is checked
   again; only then is it written.

4. **Nothing is overwritten, and every answer is read.** Writes go through
   the contract to `verso-core` and `verso-fs` ([0044](0044-verso-fs-semantics.md)):
   a file that exists is refused by the core, never replaced. The wizard
   reads the core's answer to each write, counts only what was created,
   lists what already existed and what was refused and why, and stays open
   when anything did not go through.

5. **Untrusted input is bounded and checked.** A path with `..`, an
   absolute path, a name another OS cannot keep ([0070](0070-what-travels-with-the-folder.md)
   item 3) or a write into `.verso`, `.obsidian` or `.git` is refused
   before the dry run ends. Bounds: 200 folders, 500 files, 256 KB a file,
   4 MB in all, 8 levels; `[DECIDED 2026-10-21]` (0098.5, option A) the 200
   folders count the ancestors the plan creates, so a deep bundle spends
   more of the limit. A pasted bundle is bounded before it is parsed.

6. **Frontmatter is written by a YAML library**, so `Taverna #3`, `05`,
   `2026-10-17`, `yes` and `[[link]]` stay what they were.

7. **Placeholders.** Obsidian's core Templates: `{{title}}`, `{{date}}`,
   `{{time}}`, `{{date:FORMAT}}` `[DECIDED 2026-10-21]` (0098.7, option A: to
   be built, so that a bundle copied from Obsidian works the same); Verso's
   own: `{{uuid}}`. Any
   other tag, `<% … %>` included, is kept as written.

8. **Copying a prompt for an AI.** `[DECIDED 2026-10-20]`: the button
   stays visible (*"16. pq fica desligada por padrão? não entendi"* — why
   would it be off by default?). It copies the bundle's schema and
   instructions to the clipboard and sends nothing anywhere, so it is not
   one of [0019](0019-generative-opt-in-and-keychain.md)'s generative
   features. A bundle pasted back that does not validate gets a message
   naming each field at fault, ready to paste back to the AI.

9. **The Dados Críticos bundle.** `[DECIDED 2026-10-20]`: *"o Igor Téuri é
   meu amigo, ele autorizou a gente a copiar a estrutura"* (Igor Téuri is my
   friend; he authorised us to copy the structure). The campaign bundle
   follows his vault's structure, says so in its description, and is on the
   Credits page. `[DECIDED 2026-10-21]` (S.2, option A): the credit's link
   goes to the vault's own page, `https://linktr.ee/dadoscriticos` (until
   then it pointed provisionally to the Fractal page on itch.io).

10. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
    every word of the wizard in pt-BR and EN, the bundles' names and
    descriptions too; `[DECIDED 2026-10-21]` (0098.10, option A) the bundles'
    folder and note names and contents in the person's language as well
    ("Sessões" becomes "Sessions"). Labels tied to their
    fields, tabs with roles and arrow keys, the result in a live region.

11. **Bundles are the format of the packs.** `[DECIDED 2026-10-21]`
    (0098.R, option A): the bundle is the format [0015](0015-schema-packs.md)
    foresaw for packs of structure distributed as content, not code; 0015
    now points here, one concept and one screen. What 0015 imagines beyond
    what a bundle does (note types and schemas, a pack per game system)
    stays after V1, as the maintainer decided for 0015 in the same
    questionnaire.

## Consequences

- `app/ui/src/bundles/`: `types.ts` (the schema), `plan.ts` (the dry run
  and its checks), `run.ts` (writing through the contract and reading each
  answer), `presets.ts` (the built-in bundles), `systemPrompt.ts`;
  `app/ui/src/dialogs/worldWizard.ts`.
- Rust, with item 2: contract commands for `.verso/bundles/`.

## Discarded alternatives

- **Running Templater-style scripts**: code from a note, on every machine
  that opens it.
- **Counting a write as done without reading the answer** (the first
  build): it reported a world created when nothing was.

## Status

Accepted (2026-10-20, with every detail decided on 2026-10-21).
