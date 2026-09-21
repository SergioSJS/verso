# ADR 0042 — Open from the command line: `verso <folder>`

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.1
- Status in the briefing: `DECIDED`

## Context

If the folder is the unit and Verso opens any folder the way a code editor does
([0010](0010-folder-is-the-unit-no-vault.md)), the gesture of opening also has
to be that of a code editor: from the terminal, where the person already is.

## Decision

Verso opens from the command line, on the model of `code .`: `verso <folder>`.

## Consequences

- It requires an executable on `PATH` and a way to install it; how that is done
  on each platform, the briefing does not say.
- It collides with the subcommand space already planned for `verso-cli` — `verso
  index`, `verso search`, `verso backlinks`, `verso mcp`
  ([0028](0028-crate-structure.md), Accepted) and `verso serve`
  ([0025](0025-own-server-and-mobile-pwa.md), Proposed). `verso <folder>` means
  the first argument is a path when it does not match a known subcommand. A
  folder named `index` or `search` is the ambiguous case, and the
  disambiguation rule is `[OPEN]`.
- Opening the UI from the CLI is only possible when there is a UI, that is, from
  Phase 2 on ([0034](0034-roadmap-in-phases.md)). In Phase 1 the binary is CLI
  only. In which phase the open command lands, the briefing does not say:
  `[OPEN]`.
- `verso-cli` already appears in Phase 1, so the subcommands are born before the
  open command; the disambiguation rule has to be decided before the set of
  subcommands grows.
- With a multi-root workspace ([0041](0041-multi-root-workspace.md),
  `PROPOSED`), opening several folders at once is the natural extension. It is
  not decided.

## Discarded alternatives

None recorded in the briefing.

## Status

Accepted.
