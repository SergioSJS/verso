# ADR 0042 — Open from the command line: `verso <folder>`

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.1
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-21 — consequence on the Obsidian CLI as a parity reference
  added at the maintainer's request ("vale até anotar essas coisas do cli que
  pode ser útil pra gente implementar paralelos melhorados"); it names a
  reference, not a new scope item — Phase 1 features 4 and 6 stay as the
  roadmap lists them.
- Revisions: 2026-09-22 — what the feature 4 code does recorded under
  Consequences, as **provisional**; the disambiguation rule stays `[OPEN]`, the
  Decision is unchanged (memo `docs/reference/cli-decision.md`).
- Revisions: 2026-09-23 — what the Phase 2 code does with `verso <folder>`
  and `verso open` recorded under Consequences, as **provisional**; the rule
  stays `[OPEN]`.

## Context

If the folder is the unit and Verso opens any folder the way a code editor does
([0010](0010-folder-is-the-unit-no-vault.md)), the gesture of opening also has
to be that of a code editor: from the terminal, where the person already is.

## Decision

Verso opens from the command line, on the model of `code .`: `verso <folder>`.

**Decided on 2026-09-22 by the maintainer, for Phase 1**
(`docs/reference/cli-decision.md` §10, line 1). A **subcommand is required in
first position**: `verso index <folder>`, `verso search <folder> <words…>`,
`verso backlinks <folder> <note>`, `verso mcp <folder>`, `verso help`. The
folder is an argument of the subcommand and there is no default folder. An
argument that starts with `--` and is not a known option is a usage error, not
a folder.

**Recorded, not decided, for Phase 2**: a first argument that names an existing
directory opens it, anything else is read as a subcommand, with
`verso open <folder>` and `verso -- <folder>` as the escape hatches. `--` as a
separator is not supported in Phase 1, so a folder whose name begins with `--`
cannot be passed yet.

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
- The Obsidian CLI (app 1.13) is the closest public description of what the
  Obsidian index answers: links, backlinks, unresolved, orphans, dead ends,
  search, outline, properties, tags. `verso-cli` and `verso mcp` should cover at
  least that surface, better; the mapping is in
  `docs/reference/obsidian-cli.md`.

**What the feature 4 code does with the collision above. Recorded on
2026-09-22 — provisional, the maintainer decides on waking**, on line 1 of
`docs/reference/cli-decision.md` §10. This is what the binary does today, not a
decision; the disambiguation rule above stays `[OPEN]`.

- **In Phase 1 the first argument is always a subcommand.** The set is `index`,
  `search` and `backlinks`, with `mcp` joining it in feature 6; `help`,
  `--help` and `-h` print the usage. Anything else in first position is a usage
  error that names the set, with exit code 2.
- **The folder is the subcommand's first argument** — `verso index <folder>`,
  `verso search <folder> <words…>`, `verso backlinks <folder> <note>` — and
  there is no default folder: omitting it is a usage error. Whether the current
  directory is implied belongs to the same Phase 2 question as `verso <folder>`.
- **`verso <folder>` does not exist yet**, and cannot: opening needs a UI, which
  is Phase 2 ([0034](0034-roadmap-in-phases.md)). So no Phase 1 invocation
  exercises the ambiguity this ADR names, and adding the open command later is
  additive over the surface above.
- **The rule the memo recommends for Phase 2 is a recommendation, not a
  decision of this ADR**: a first argument that names an existing directory
  opens it, otherwise it is a subcommand, with `verso open <folder>` and
  `verso -- <folder>` as the escape hatches for a folder named like a
  subcommand. Nothing in the code implements it.

**After the Opus 5 reading of 2026-09-22 the code also does:**

- **An argument beginning with `--` that is not a known option is a usage
  error** that names it, with exit code 2 — and so are a missing or invalid
  value for `--limit` or `--lang`, a positional the subcommand did not ask for,
  and `--unresolved` outside `backlinks`. Before this,
  `verso search <folder> dragões --limit castelos` silently searched for
  `dragões` alone with the default limit: a wrong answer with no diagnostic.
- **`--lang` is still read before any of those errors is printed**, so the
  error comes out in the language the user asked for even when the rest of the
  line is wrong.
- **`verso help` prints the usage and exits 0**; asking for help is not a usage
  error. `verso -h` and `verso --help` do the same: `--help` is the one
  argument beginning with `--` that the unknown-option rule above lets through.
- **`--` is not supported as a separator.** It falls under the same rule, so a
  folder whose name begins with `--` cannot be passed at all in Phase 1. The
  memo only wants the separator from Phase 2 on; the gap is recorded rather
  than decided.
- **A folder name that is not UTF-8 stays an `OsString`**, from `args_os` until
  it becomes a `PathBuf` for `verso-fs`. Only the subcommand, the search words
  and the note are read as text.

**What the Phase 2 code does. Recorded on 2026-09-23 — provisional; the
disambiguation rule above stays `[OPEN]`.** The open command landed in Phase 2
with the window, at the maintainer's request of 2026-09-22 ("ser possível
fazer um verso . no terminal e fazer com que ele abra naquele diretório"); in
which phase it lands was left open above, and this is the phase the code
chose.

- **A subcommand in first position is always the subcommand** — `index`,
  `search`, `backlinks`, `mcp`, `open`, `help`, `--help`, `-h` — even when a
  directory of that name exists: `verso index` inside a folder that holds
  `index/` answers "missing the folder".
- **Any other first argument that names an existing directory opens it** in
  the window: `verso notas`, `verso .`, `verso ../outra`, an absolute path.
  This is the rule the memo recommends. Whether the argument names a directory
  is asked of `verso-fs` (`Root::open`, which reads nothing). A second argument
  after the folder is a usage error.
- **Anything else in first position is a usage error**, exit code 2, that says
  there is neither a command nor a folder by that name ("comando desconhecido,
  e nenhuma pasta com esse nome"), followed by the usage.
- **`verso open <folder>` opens a folder whatever its name** — the escape hatch
  for a folder named like a subcommand (`verso open index`). It does not ask
  the disk first; a folder that is not there is reported by the window. **`verso
  open` alone is a usage error**: there is no default folder, as this ADR
  decided for the subcommands.
- **`--` is still not a separator**, so a folder whose name begins with `--`
  opens only through a path that does not, such as `./--nome`.
- **How the window starts**: the CLI runs `$VERSO_APP` when it is set, else the
  `verso-app` binary beside it, else, on macOS, the installed app through
  `open -a Verso --args <folder>`. Each run starts a new process; an app that
  is already running does not receive the folder through `open -a`
  (`docs/review/phase-2.md`, reading 3, finding 20).
- **The first version of this code** used a lexical rule — `.`, `..`, a `/` or
  a leading `~` made an argument a folder — so `verso notas` was an unknown
  command and `verso ./nao-existe` said it was opening; and `verso open` alone
  opened `.`. The Opus reading of 2026-09-23 found both
  (`docs/review/phase-2.md`, reading 3, finding 9), and they were replaced by
  the behaviour above.

## Discarded alternatives

None recorded in the briefing.

## Status

Accepted.
