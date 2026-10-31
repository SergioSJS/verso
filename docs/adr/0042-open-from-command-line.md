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
- Revisions: 2026-09-24 — `verso --version` (and `-V`) joins `--help` among
  the arguments let through, with the development flow
  ([0051](0051-development-flow-and-releases.md)); no bare `version`, which
  would take a folder's name.
- Revisions: 2026-09-23 — **decided by the maintainer for Phase 2**: the rule
  as the code applies it (Decision); how the window starts changed, so that
  an app already running receives the folder (`docs/review/phase-2.md` §6,
  items 3 and 14).
- Revisions: 2026-10-08 — **decided by the maintainer**: with the app
  running, `verso <folder>` opens the folder in a window of its own; one app
  per user on every system (Status).
- Revisions: 2026-10-30 — **decided by the maintainer** ([ADR 0114](0114-opening-one-markdown-file-without-a-folder.md)
  Q8): a first argument that names an existing Markdown file (`.md`,
  `.markdown`) opens that file without its folder, by the same rule as a
  folder, and `verso open <file>` is the escape hatch; the usage error now
  reads "no folder or Markdown file by that name". 2026-10-31 — **decided by
  the maintainer** ([ADR 0114](0114-opening-one-markdown-file-without-a-folder.md)
  item 34, N1 of the list of 2026-10-31): the same goes for an existing
  `.json`, `.yaml`, `.yml`, `.toml`, `.xml` or `.csv` file; to be built.

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

**Decided on 2026-09-23 by the maintainer, for Phase 2**, as the code does it
(recorded under Consequences; `docs/review/phase-2.md` §6, item 3; the
answer: *"a e b ok"*). A subcommand in first position is always the
subcommand, even when a directory of that name exists; any other first
argument that names an existing directory opens it; anything else is a usage
error. `verso open <folder>` opens a folder whatever its name. `--` is still
not a separator, so a folder whose name begins with `--` opens only through a
path that does not, such as `./--name`. This replaces what was recorded, not
decided, for Phase 2 before: the same rule read the other way round — a
directory first, a subcommand otherwise — with `verso -- <folder>` as a
second escape hatch.

## Consequences

- It requires an executable on `PATH` and a way to install it; how that is done
  on each platform, the briefing does not say.
- It collides with the subcommand space already planned for `verso-cli` — `verso
  index`, `verso search`, `verso backlinks`, `verso mcp`
  ([0028](0028-crate-structure.md), Accepted) and `verso serve`
  ([0025](0025-own-server-and-mobile-pwa.md), Proposed). `verso <folder>` means
  the first argument is a path when it does not match a known subcommand. A
  folder named `index` or `search` is the ambiguous case, and the
  disambiguation rule is `[OPEN]`. *(Decided on 2026-09-23: the subcommand
  wins, and `verso open index` opens the folder — the Decision.)*
- Opening the UI from the CLI is only possible when there is a UI, that is, from
  Phase 2 on ([0034](0034-roadmap-in-phases.md)). In Phase 1 the binary is CLI
  only. In which phase the open command lands, the briefing does not say:
  `[OPEN]`. *(Phase 2: the maintainer asked for it there on 2026-09-22 and
  accepted it on 2026-09-23.)*
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
decision; the disambiguation rule above stays `[OPEN]`. *(Decided by the
maintainer on 2026-09-23 — Status; `docs/review/phase-2.md` §6, item
3.)*

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
  error. `verso -h` and `verso --help` do the same: `--help` and `--version`
  (since 2026-09-24, with `-V`) are the arguments beginning with `--` that the
  unknown-option rule above lets through.
- **`--` is not supported as a separator.** It falls under the same rule, so a
  folder whose name begins with `--` cannot be passed at all in Phase 1. The
  memo only wants the separator from Phase 2 on; the gap is recorded rather
  than decided.
- **A folder name that is not UTF-8 stays an `OsString`**, from `args_os` until
  it becomes a `PathBuf` for `verso-fs`. Only the subcommand, the search words
  and the note are read as text.

**What the Phase 2 code does — decided on 2026-09-23.** Recorded that day as
provisional, then accepted by the maintainer as it stands (the Decision). The
maintainer's request of 2026-09-22 ("ser possível fazer um verso . no terminal
e fazer com que ele abra naquele diretório",
[0049](0049-phase-2-scope-widened.md) §1) put the open command in Phase 2,
with the window.

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
  open` alone is a usage error**: there is no default folder, following,
  provisionally, what this ADR decided for the Phase 1 subcommands.
- **`--` is still not a separator**, so a folder whose name begins with `--`
  opens only through a path that does not, such as `./--nome`.
- **How the window starts**: the CLI runs `$VERSO_APP` when it is set, else the
  `verso-app` binary beside it, else, on macOS, the installed app through
  `open -a Verso <folder>`. The folder goes as a document to open, which macOS
  delivers by an open event whether it launches the app or the app is already
  running; a running app opens it in a window that shows no folder, else in
  a new window (revised 2026-10-08, Status) — until then its main window
  saved its tabs and opened it, as for any
  switch. Until 2026-09-23 it went through `open -a Verso --args`, which an
  app already running never received (`docs/review/phase-2.md`, reading 3,
  finding 20; fixed in `0381644` at the maintainer's request). `open` refuses a
  document that is not there. `verso open` still asks the disk nothing before
  it launches; when nothing could be started, the CLI asks `verso-fs` whether
  the folder is there and says "no folder at …" (exit 3), or, the folder being
  there, that the app was not found (`ecfdfd9`). A first version retried with
  `--args`, which an app already running ignores, so a typo was reported as
  "opening"; the Opus reading of the answers found it. A binary run directly —
  `$VERSO_APP`, a development tree, Windows, Linux — starts a process that,
  with the app running, hands the folder to it and exits (single instance,
  since 2026-10-08, Status); on macOS no binary inside a `.app` is run, the
  installed command line's included. The window reports a folder that is
  not there.
- **The first version of this code** used a lexical rule — `.`, `..`, a `/` or
  a leading `~` made an argument a folder — so `verso notas` was an unknown
  command and `verso ./nao-existe` said it was opening; and `verso open` alone
  opened `.`. The Opus reading of 2026-09-23 found both
  (`docs/review/phase-2.md`, reading 3, finding 9), and they were replaced by
  the behaviour above.

## Discarded alternatives

None recorded in the briefing.

## Status

Accepted. The Phase 2 rule: decided on 2026-09-23 by the maintainer (the
Decision). Revised by the maintainer on 2026-10-08, accepting the
author's recommendation: **with the app running, `verso <folder>` opens
the folder in a window of its own** — a window of the app that shows no
folder takes it, else a new window does (ADR 0065). On every system the
app is one instance: a second launch hands its folder to the running app
and exits (Tauri's single-instance plugin), and on macOS the command line
goes back to `open -a`, as decided above. Since `a28f633` (2026-09-25) it
had run the installed bundle's binary and `open -n`, which started a
second app — one that, run while the first was open, showed no window.
