# Verso ADRs

One record per decision from `docs/BRIEFING.md`. Fixed format: Context /
Decision / Consequences / Discarded alternatives / Status.

## Status

The statuses mirror the briefing and cannot be promoted by the AI:

| Status | Meaning |
|---|---|
| Accepted | `DECIDED` in the briefing: chosen or explicitly accepted by the maintainer |
| Proposed | `PROPOSED` in the briefing: recommended in discussion, without confirmation |
| `[OPEN]` | No decision. Records the context and when to decide |
| Constraint | Imposed by platform, license or terms of use; it is not a choice |

Only the maintainer promotes Proposed to Accepted, or closes an `[OPEN]`.

## Index

### Project and governance

| # | Title | Status |
|---|---|---|
| [0001](0001-open-tool-no-company.md) | Open tool, no company and no paid product | Accepted |
| [0002](0002-negative-scope.md) | Negative scope: not a clone, not a host for other people's plugins, no embedded LLM | Accepted |
| [0003](0003-primitives-not-workarounds.md) | What today requires a plugin should be an app primitive | Accepted |
| [0004](0004-project-name-verso.md) | Project name: Verso | Accepted |
| [0005](0005-license.md) | Project license: MPL-2.0 in the core and app, MIT in the plugin SDK | Accepted |
| [0006](0006-contribution-dco-no-cla.md) | Contribution through DCO, without CLA; AI-written code comes in through the same DCO, under the responsibility of whoever signs | Accepted |
| [0007](0007-private-repo-until-license.md) | Repository private until the license is decided | Accepted |
| [0008](0008-documentation-language.md) | Documentation language: English source, pt-BR mirror | Accepted |
| [0009](0009-external-constraints.md) | External constraints assumed as given | Constraint |

### Product principles

| # | Title | Status |
|---|---|---|
| [0010](0010-folder-is-the-unit-no-vault.md) | The open folder is the unit of work; there is no vault | Accepted |
| [0011](0011-config-outside-tree-index-as-cache.md) | Config outside the tree and the index as a rebuildable cache | Accepted |
| [0041](0041-multi-root-workspace.md) | Workspace with multiple roots | Proposed |
| [0042](0042-open-from-command-line.md) | Open from the command line: `verso <folder>` | Accepted |
| [0012](0012-files-are-source-of-truth.md) | Files are the source of truth; opening never rewrites | Accepted |
| [0013](0013-degrades-to-markdown.md) | All structured data degrades to readable Markdown | Proposed |
| [0014](0014-primitives-catalog.md) | Catalog of Verso primitives | Proposed |
| [0015](0015-schema-packs.md) | Schema packs distributable as content | Proposed |

### Plugins and LLM

| # | Title | Status |
|---|---|---|
| [0016](0016-plugins-execution-and-capabilities.md) | Plugins: TypeScript in a Web Worker, no disk, with declared capabilities | Accepted |
| [0017](0017-plugins-format-shim-loading.md) | Plugins: familiar format, separate shim, lazy loading and dogfooding | Proposed |
| [0018](0018-llm-native-mcp-in-core.md) | LLM-native: MCP server in the core, structured query, reviewed writes | Accepted |
| [0019](0019-generative-opt-in-and-keychain.md) | Generative features opt-in and keys in the keychain | Proposed |

### Sync

| # | Title | Status |
|---|---|---|
| [0020](0020-sync-merge-in-core-transports-as-plugins.md) | Sync: merge engine in the core, transports as plugins, out of scope until Phase 2 | Accepted |
| [0021](0021-sync-automerge-layered-config.md) | Sync: Automerge and layered config | Proposed |
| [0043](0043-placeholder-guard.md) | An on-demand storage placeholder file is never a deletion | Accepted (per-provider mechanism: `[OPEN]`) |

### Platforms and architecture

| # | Title | Status |
|---|---|---|
| [0022](0022-target-platforms-macos-first.md) | Target platforms and macOS first | Accepted |
| [0023](0023-stack-core-and-editor.md) | Stack: Rust, Tauri v2, CodeMirror 6, SQLite with FTS5 | Accepted |
| [0024](0024-board-excalidraw.md) | Board: Excalidraw as a free annotation layer | Accepted |
| [0025](0025-own-server-and-mobile-pwa.md) | Own server (`verso serve`) and initial mobile as a web client | Proposed |
| [0026](0026-core-ui-contract-inviolable-rules.md) | Core↔UI contract and inviolable architecture rules | Accepted |
| [0027](0027-runtime-capabilities.md) | Capabilities queryable at runtime | Proposed |
| [0028](0028-crate-structure.md) | Crate structure | Accepted |

### Dialect, engineering and roadmap

| # | Title | Status |
|---|---|---|
| [0029](0029-guardrails-in-ci.md) | Guardrails in CI before the first line of product logic | Accepted |
| [0030](0030-base-dialect-obsidian-compatible.md) | Base dialect compatible with Obsidian; Verso extends, never contradicts | Accepted |
| [0031](0031-fixtures-as-contract.md) | Fixtures are the behavior contract between maintainer and AI | Accepted |
| [0032](0032-author-and-reviewer-roles.md) | Roles: the AI writes, the maintainer reviews behavior | Accepted |
| [0033](0033-pr-workflow.md) | PR workflow | Accepted |
| [0034](0034-roadmap-in-phases.md) | Roadmap in three phases with verifiable exit gates | Accepted |
| [0035](0035-cross-cutting-requirements.md) | Cross-cutting requirements: pt-BR and EN, accessibility, benchmark | Accepted |
| [0036](0036-tabletop-rpg-support.md) | Special support for tabletop RPG | Accepted (intent) |

### Open technical decisions

| # | Title | When to decide |
|---|---|---|
| [0037](0037-base-parser.md) | Base parser for `verso-dialect` | PR for feature 1 (Phase 1) |
| [0038](0038-ts-type-generation.md) | TypeScript type generation from Rust | Start of Phase 2 |
| [0039](0039-performance-targets.md) | Performance targets | After the first baseline |
| [0040](0040-board-persistence.md) | Board persistence | Before the board |

### Open questions raised in the Phase 0 review

Source: [`../review/phase-0.md`](../review/phase-0.md). None has a decision;
each one records what needs to be answered and when.

| # | Title | When to decide |
|---|---|---|
| [0044](0044-verso-fs-semantics.md) | `verso-fs` semantics: symlinks, opaque handles, ignored paths | Feature 2 of Phase 1 (symlinks, paths); feature 6 and item 2.1 (handles) |
| [0045](0045-server-and-mcp-security.md) | Security of the server, the MCP and the contract | Feature 6 of Phase 1 (MCP); item 2.1 of Phase 2 (contract) |
| [0046](0046-index-location-lifecycle-tokenizer.md) | Index: location, lifecycle and tokenizer | Features 3 and 5 of Phase 1 |
| [0047](0047-plugin-api-open-questions.md) | Open questions on the plugin API | Before designing the API (after Phase 2) |
| [0048](0048-file-operations-in-ui.md) | File operations in the UI: rename, create, delete, move | Item 2.3 of Phase 2 |

## Open items that did not become ADRs

Three dialect items from §17 live in [`../spec/dialect.md`](../spec/dialect.md),
where the behavior is specified: typed relation syntax (item 6), format and
location of the schemas (item 7) and per-block visibility syntax (item 8). The
parsing gaps (Q1–Q8, Q12–Q26) also live there.

The check for the availability of the name (item 2) is recorded in
[0004](0004-project-name-verso.md).

## How to write a new ADR

1. Number sequentially: `NNNN-title-in-kebab-case.md`.
2. Use the five sections, in this order, without inventing others.
3. Cite the source in the header (`docs/BRIEFING.md` §X, a PR, an issue, or the
   review that originated it).
4. In "Discarded alternatives", record only alternatives that were actually
   considered. With none: write "None recorded".
5. An ADR is not edited to change one's mind. A new ADR supersedes the previous
   one, and the previous one gets a line pointing to the new one.

## How to change an existing ADR

Three cases, with different treatments:

| Case | What to do |
|---|---|
| Correction or delimitation that **does not change the decision** (citation error, scope that was missing, consequence discovered later) | Edit in place and add a `Revisions:` line in the header, with date and origin (PR or review) |
| **Change** an Accepted decision | A new ADR that supersedes it; the old one gets the line pointing to the new one and is not edited beyond that |
| **Close** an `[OPEN]` or promote a Proposed | Edit the Decision section and the Status in place, citing the commit or PR in which the maintainer decided. An `[OPEN]` has no decision to supersede; promoting a Proposed is the confirmation of the text that was already there |

Only the maintainer does the second and the third case. The first can be done by
the AI, and it is a review finding if it disguises a change of decision as a
correction.
