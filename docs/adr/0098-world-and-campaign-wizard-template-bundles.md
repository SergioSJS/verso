# ADR 0098 — Project creation wizard and template bundles: declarative structures, dry-run safety, and AI prompt loop

- Date: 2026-10-17
- Source: the maintainer, in session on 2026-10-17, inspecting `cofre-rpg-dados-criticos`
  (Igor Téuri's campaign and world vault): *"ele funciona assim, criou automações no obsidian
  que replica 'mundos' a partir do padrão, entao acho que podemos fazer nesse padrão, a partir
  de um cofre, vc abre algum tipo de criador de mundos/contexto que cria a pastinha do mundo com
  as sub-pastas seguindo um template base ou template que o usuário arrumou."* Reviewed and
  hardened by Claude Opus 5.5 on 2026-10-17 (`review_adrs_0098_0102.md`) with path traversal
  protections, resource limits, YAML frontmatter serialization, and dry-run planning.
- Related: [0003](0003-primitives-not-workarounds.md),
  [0009](0009-external-constraints.md),
  [0012](0012-files-are-source-of-truth.md),
  [0015](0015-schema-packs.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0044](0044-verso-fs-semantics.md),
  [0048](0048-file-operations-in-ui.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0080](0080-the-trash-with-expiry-and-restore.md),
  [0086](0086-infobox-a-typed-notes-card.md),
  [0087](0087-secret-blocks-hidden-from-readers.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status in the briefing: not present; declarative project scaffolding primitive.

## Context

In Obsidian, establishing a structured workspace for a novel, a worldbuilding
encyclopedia, or an RPG campaign requires complex community plugins (such as
Templater) executing arbitrary JavaScript snippets (`tp.system.prompt`,
`app.vault.createFolder`), as seen in Igor Téuri's Dados Críticos vault
(`5. Infraestrutura/Templates/Criar Nova Campanha.md`).

Verso deliberately executes no arbitrary third-party JavaScript scripts for
security, speed, and cross-platform mobile parity. However, the requirement to
bootstrap new projects with consistent folder hierarchies, initial notes,
typed frontmatter, and dashboards is universal across disciplines.

Because template bundles arrive from external LLMs and community sharing, they
represent untrusted input. An unvalidated template bundle could attempt path
traversal (`../../.ssh/`) or create forbidden filenames on Windows. A native,
declarative template bundle primitive is therefore required, combining
rigorous security confinement ([0044](0044-verso-fs-semantics.md)), dry-run
previewing, safe YAML serialization, and Human-in-the-Loop (HITL) AI generation.

## Decision

Proposed (2026-10-17). Accepted on 2026-10-17 (Status): each `[OPEN]` was decided as
recommended and is marked `[DECIDED 2026-10-17]`.

1. **The Project Creation Wizard ("Novo projeto a partir de modelo…")**.
   `[DECIDED 2026-10-17]`: Accessible via the Command Palette and the file
   tree header. The wizard prompts for:
   - **Project Name** (e.g., `Tormenta - O Reinado`, `Livro II - As Cinzas`).
   - **Target Folder** (defaults to the active directory or vault root).
   - **Template Bundle** (selected from built-in presets or imported bundles).
   Available bundles are filtered by the active capability preset
   ([0103](0103-feature-presets-and-capability-flags.md)): writers see writing
   and PARA structures, worldbuilders see world encyclopedias, and RPG players
   see campaign structures.

2. **Declarative Template Bundle Schema v1**.
   `[DECIDED 2026-10-17]`: Bundles are declared as clean JSON definitions:
   - `folders`: relative folder paths to scaffold.
   - `files`: path, optional frontmatter object, and markdown content.
   - Files may specify `.md` notes or arbitrary project files (`.base`, `.canvas`).
   - Single-file JSON acts as the distribution and import format; vaults can
     also store template folders in `.verso/templates/<bundle-id>/`.

3. **Confinement, path validation, and resource bounds ([0044](0044-verso-fs-semantics.md))**.
   `[DECIDED 2026-10-17]`: Every path segment is strictly validated before any
   filesystem mutation:
   - Path traversal (`..`) and absolute paths are rejected.
   - Writes targeting internal folders (`.verso`, `.obsidian`, `.git`) are refused.
   - Forbidden Windows characters (`:`, `*`, `?`, `"`, `<`, `>`, `|`) and reserved
     device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`9`, `LPT1`–`9`) are blocked.
   - Slashes and illegal characters in `{{title}}` are safely sanitized into dashes
     for path components ([0070](0070-what-travels-with-the-folder.md) item 3).
   - Bounds: maximum 200 folders, 500 files, 256 KB per file, 4 MB total, and
     depth of 8 folders.

4. **Safe YAML frontmatter serialization**.
   `[DECIDED 2026-10-17]`: Frontmatter properties are serialized using standard
   YAML stringification. Wikilinks in lists (`- "[[NPC]]"`), colons, booleans,
   and flow syntax characters are properly quoted, preventing Obsidian YAML
   parser syntax corruption.

5. **Dry-run planning and non-destructive instantiation ([0012](0012-files-are-source-of-truth.md))**.
   `[DECIDED 2026-10-17]`: A pure planning step (`planBundle`) evaluates all
   folders, files, and variable substitutions before writing. If any file
   already exists on disk ([0048](0048-file-operations-in-ui.md)),
   it is never overwritten; an explicit warning is logged and existing notes
   remain intact.

6. **Variable substitutions aligned with core Templates plugin**.
   `[DECIDED 2026-10-17]`: Placeholders follow Obsidian core Templates syntax:
   `{{title}}`, `{{date}}` (`YYYY-MM-DD`), `{{time}}` (`HH:mm`), and `{{uuid}}`
   (generated via `crypto.randomUUID()`). Any unrecognised template tags (such
   as raw `<% ... %>`) are preserved verbatim as plain text.

7. **AI-assisted Generator and recovery feedback loop**.
   `[DECIDED 2026-10-17]`: The wizard includes a "Copiar prompt para IA" button.
   The embedded system prompt contains the full schema and instructions for an
   interactive interview. When importing, tolerance sanitization extracts JSON
   from markdown code fences. If schema validation fails, Verso provides a
   specific correction prompt containing JSON Pointers and exact field errors.

8. **Attribution and community sharing ([0009](0009-external-constraints.md))**.
   `[DECIDED 2026-10-17]`: The built-in Campaign bundle explicitly credits
   Igor Téuri's Dados Críticos vault structure in its description.

9. **Accessibility and internationalization ([0035](0035-cross-cutting-requirements.md))**.
   `[DECIDED 2026-10-17]`: All wizard dialogs, error messages, tabs, and bundle
   descriptions are fully localized in Portuguese and English. Dialogs follow
   `role="dialog"` modal conventions with focus management and ARIA labels.

## Consequences

- `app/ui/src/bundles/` provides pure planning (`plan.ts`), schema validation
  (`types.ts`), built-in presets (`presets.ts`), AI system prompt
  (`systemPrompt.ts`), and secure instantiation (`instantiate.ts`).
- Unit tests (`app/ui/test/bundles.test.mjs`) verify path validation,
  traversal rejections, wikilink quoting in YAML, and variable substitutions.
- Users can create complete, structured project environments in seconds
  without installing community plugins.

## Discarded alternatives

- **Running arbitrary JavaScript templating scripts (Templater)**: Rejected
  to eliminate remote code execution risks and maintain mobile performance.
- **Silent overwriting of existing files**: Rejected to uphold invariant 7
  ([0012](0012-files-are-source-of-truth.md)).

## Status

**Accepted (2026-10-17).**
