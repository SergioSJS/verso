# Decision memo: `verso-cli` for feature 4 (command surface, configuration directory, messages in two languages, arguments, output)

- Date: 2026-09-22
- Status: **not decided.** Nothing in this memo is a decision: it lays out
  options, records facts and carries recommendations that are labelled as
  such. The maintainer decides (`CLAUDE.md` §1). While there is no decision,
  the feature 4 code is written **under the recommendations, marked
  provisional**, and changes if the maintainer decides otherwise — the same
  arrangement used for features 2 and 3. That code is now in the tree: commits
  `e3d86c0` and `e7975b3` implement sections 2 to 7 provisionally, pending the
  six answers of section 10, with two departures from what these pages
  recommend. **The tension of §7.2 is resolved in the code, not by a decision:**
  `verso-index` gained `notes.unverified` (schema version 2), a placeholder
  keeps the note's last known version marked unverified, and a note only ever
  seen as a placeholder gets an empty unverified row, so ADR 0043 decision 2 is
  implemented. **The sidecar of §3.4 was not taken:** the folder's absolute path
  and the time of the last run are rows of the index file's own `meta` table
  (`Index::set_root`), which is where an orphan listing would read them; the
  `--list` and `--forget` flags are not written. **The exit-code tension of
  §6.2 stays open** — the code returns `1` when the run reported a walk problem
  or a note it could not read, and `0` otherwise.
- Author: Opus 5 (documents, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Reviewer: Fable 5.1. The recommendations in sections 2 to 7 are **Fable
  5.1's**, recorded here as the author's input; they are not decisions. No Rust
  in this PR.
- Decides on: [ADR 0042](../adr/0042-open-from-command-line.md) (the
  disambiguation rule between `verso <folder>` and a subcommand — "before
  feature 4 closes the set of subcommands") and the four questions feature 4
  cannot be written without: where the configuration directory is and how a
  folder is keyed ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md)), how messages
  exist in pt-BR and EN with no loose string literal
  ([ADR 0035](../adr/0035-cross-cutting-requirements.md)), how arguments are
  parsed, and what the three commands print and return. Features 4 and 7 of
  Phase 1 cannot close without them, and Phase 1 exit criteria 1, 2 and 6 are
  read on their output ([roadmap](../roadmap.md)).
- Sources read: [ADR 0009](../adr/0009-external-constraints.md),
  [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [ADR 0022](../adr/0022-target-platforms-macos-first.md),
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0033](../adr/0033-pr-workflow.md),
  [ADR 0034](../adr/0034-roadmap-in-phases.md),
  [ADR 0035](../adr/0035-cross-cutting-requirements.md),
  [ADR 0039](../adr/0039-performance-targets.md),
  [ADR 0041](../adr/0041-multi-root-workspace.md),
  [ADR 0042](../adr/0042-open-from-command-line.md),
  [ADR 0043](../adr/0043-placeholder-guard.md),
  [ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0045](../adr/0045-server-and-mcp-security.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md), the
  [roadmap](../roadmap.md) Phase 1 table and exit criteria, spec §4.4
  (position) and §9, the three earlier memos
  ([`parser-decision.md`](parser-decision.md), [`fs-decision.md`](fs-decision.md),
  [`index-decision.md`](index-decision.md)) and
  [`docs/reference/obsidian-cli.md`](obsidian-cli.md). The feature 2 and
  feature 3 code already in the repository was read for the facts in sections
  3.3, 6.1 and 7.2. Section 9 lists what was **not** verified.

## 1. What is being decided, and why now

Feature 4 of Phase 1 is `verso-cli`, and the roadmap gives it three
deliverables — `verso index`, `verso search`, `verso backlinks` — plus
feature 7, **messages in pt-BR and EN with no loose string literal**, which
"ships with feature 4". The roadmap lists one decision tied to it:

1. **The disambiguation rule between `verso <folder>` and a subcommand**,
   `[OPEN]` in [ADR 0042](../adr/0042-open-from-command-line.md), "before
   feature 4 closes the set of subcommands".

Five more are not in that table and are still unavoidable, because they are
the shape of the program rather than an implementation detail: where the
configuration directory is (the CLI is the first thing that has to *find* the
index that feature 3 knows only as a path it is handed), how two languages are
made checkable, how arguments are read, what the commands print, and what a
second `verso index` does to an entry that is no longer there. Three of Phase
1's exit criteria are read directly on that output:

- **Criterion 1** — a real vault indexes "with exit code 0, with no error and
  no panic". That makes the exit code a contract, not a detail (section 6.2,
  which records one tension between the recommendation and this criterion).
- **Criterion 2** — the maintainer's hand-written backlinks list is compared
  with `verso backlinks`. A list is compared by eye, so the output format is
  part of whether the criterion can be applied at all (section 6.1).
- **Criterion 6** — each command answers in pt-BR and in EN "according to the
  locale", and the verification is running it twice (section 4).

The decided material that constrains the answers, none of it reopened here:

- **The CLI is an entry edge.** A path as a string exists "only at the entry
  edge (CLI argument, config key) and inside `verso-fs`"
  ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), scope of
  rule 4). So `verso index <folder>` taking a path string is not a violation;
  what the CLI must not do is touch the folder itself.
- **The CLI does not orchestrate.** `verso-core` "orchestrates and exposes the
  contract" ([ADR 0028](../adr/0028-crate-structure.md)); the walk is
  `verso-fs`'s, the parse is `verso-dialect`'s, the storage is
  `verso-index`'s. `verso-cli` reads arguments and prints (section 8).
- **The config lives outside the tree, keyed by the folder path, and the index
  is a rebuildable cache** ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)),
  with the location, permissions, backup and cleanup answers recommended in
  [`index-decision.md`](index-decision.md) §2.6 and not yet decided.
- **pt-BR and EN from the first commit of product code**
  ([ADR 0035](../adr/0035-cross-cutting-requirements.md)), with the i18n
  dependency — if any — justified in the PR like any other
  ([ADR 0033](../adr/0033-pr-workflow.md)).
- **Citation is by `^id` or by line and column**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)), positions 1-based and
  counted in characters ([spec §4.4](../spec/dialect.md)). The CLI's backlinks
  output carries positions for that reason, not for prettiness.
- **A placeholder is never a deletion** ([ADR 0043](../adr/0043-placeholder-guard.md)),
  which is a rule about `verso index`'s removal pass before it is a rule about
  anything else (section 7).
- **Phase 1 has no UI** ([ADR 0034](../adr/0034-roadmap-in-phases.md)), so the
  open command of ADR 0042 cannot exist yet — the fact section 2 turns on.
- **The Obsidian CLI is a parity reference**
  ([ADR 0042](../adr/0042-open-from-command-line.md), consequence added
  2026-09-21; [`obsidian-cli.md`](obsidian-cli.md)): what it answers,
  `verso-cli` should answer at least as well.

## 2. Decision 1 — the command surface and the disambiguation rule (ADR 0042)

### 2.1 What ADR 0042 decided and what it left open

Decided: Verso opens from the command line on the model of `code .`,
`verso <folder>`. Open: the collision with the subcommand space — "`verso
<folder>` means the first argument is a path when it does not match a known
subcommand. A folder named `index` or `search` is the ambiguous case, and the
disambiguation rule is `[OPEN]`". The ADR also records that opening the UI
from the CLI "is only possible when there is a UI, that is, from Phase 2 on",
and that in which phase the open command lands the briefing does not say.

Two facts follow, and they are what makes this decision smaller than it looks:

1. **In Phase 1 there is nothing for `verso <folder>` to do.** With no UI, a
   bare folder argument has no behaviour to name. The ambiguity is real only
   once the open command exists.
2. **The ADR asks for the rule "before the set of subcommands grows"**, which
   is feature 4 — not because the rule runs in Phase 1, but so that the
   subcommand names are chosen knowing the rule they will live under.

### 2.2 The options for Phase 1, side by side

| | (a) subcommand required | (b) `verso <folder>` already accepted, doing nothing useful | (c) first argument is a folder if it names an existing directory, else a subcommand — from now |
|---|---|---|---|
| What `verso ~/vault` does in Phase 1 | a usage error naming the three subcommands | indexes? opens nothing? there is no behaviour to give it | same problem as (b): the rule resolves the ambiguity but there is still nothing to do |
| What a folder named `index` costs | nothing: `index` in first position is always the subcommand, and the folder is an argument of it | the case ADR 0042 names, live from Phase 1 | the case ADR 0042 names, live from Phase 1 |
| Freedom in Phase 2 | total: the rule is decided when the open command exists and has behaviour | constrained by what Phase 1 shipped | constrained by what Phase 1 shipped |
| Cost of changing it later | adding `verso <folder>` in Phase 2 is additive: no Phase 1 invocation changes meaning | removing a form that was accepted breaks what users learned | a first argument that is a directory changes meaning if the rule is revised |
| Effect on the roadmap's decision row | the row closes with "Phase 1: subcommand required; Phase 2 rule recorded, not decided" | the row closes on a rule nothing exercises | the row closes on a rule nothing exercises |

### 2.3 The Phase 2 rule this memo records but does not decide

Recorded so that the subcommand names are chosen with it in view, and so the
maintainer can reject it now rather than in Phase 2. It is **not** part of the
recommendation for Phase 1:

- A first argument that **names an existing directory** opens it; otherwise it
  is a subcommand. The check is on the filesystem, so `verso index` with a
  directory named `index` in the current directory would open the folder —
  which is why the escape hatches matter.
- `verso open <folder>` always opens, whatever the folder is called.
- `verso -- <folder>` always opens: everything after `--` is a path.
- A subcommand name is never a path, so `verso index index` (subcommand
  `index`, folder `index`) stays unambiguous.

The property that makes it worth writing down: it is **additive** over the
Phase 1 surface of option (a). Every Phase 1 invocation starts with a
subcommand name, and under this rule a subcommand name in first position still
means the subcommand, unless a directory of that name exists next to the user.

### 2.4 Recommendation of Fable 5.1 for decision 1

**Option (a): in Phase 1 the first argument must be a subcommand.**

- The set for Phase 1 is `index`, `search`, `backlinks`, with `mcp` joining it
  in feature 6. Anything else in first position is a usage error that names the
  set.
- **The folder is an argument of the subcommand**, not of the binary:
  `verso index <folder>`, `verso search <folder> <words…>`,
  `verso backlinks <folder> <note>`.
- **No default folder in Phase 1.** Whether the current directory is implied
  when the folder is omitted is a Phase 2 question, decided together with
  `verso <folder>`; until then the folder is always written out, and omitting
  it is a usage error.
- **The Phase 2 rule of section 2.3 is recorded in ADR 0042 as the
  recommended direction and stays `[OPEN]`.** What closes now is Phase 1's
  half: the subcommand set and the "subcommand required" rule it lives under.

**Discarded alternatives considered:** options (b) and (c) of section 2.2.
Nothing else was considered.

## 3. Decision 2 — the configuration directory and the index key (ADR 0011, ADR 0046)

### 3.1 What is already decided, and what is left

Decided: the config lives outside the tree, in the user's configuration
directory, keyed by the folder path, and the index is a rebuildable cache
([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)). Recommended
and not yet decided in [`index-decision.md`](index-decision.md) §2.6: one
SQLite file per folder under that directory, directory `0700`, file `0600`,
excluded from Time Machine, a `<key>.json` sidecar so orphans are listable,
cleanup on demand only, and **the Linux location explicitly left open**.

What is missing, and what feature 4 cannot run without, is the first line of
all of it: **which directory, on this machine, is "the user's configuration
directory"**. `verso-index` today receives an absolute path and creates its
parent; nobody computes that path. The CLI is where the computation has to
happen, because the CLI is the first caller.

### 3.2 Where the directory goes, side by side

| | (a) platform convention only | (b) `$XDG_CONFIG_HOME` when set, else the platform convention | (c) one path everywhere (`~/.config/verso`) |
|---|---|---|---|
| macOS | `~/Library/Application Support/verso` | the same, unless the user exports `$XDG_CONFIG_HOME` | `~/.config/verso`, against Apple's convention |
| Linux, when it arrives | `~/.config/verso` (XDG) | the same | the same |
| A user who already organizes their dotfiles by XDG on macOS | not served | served, by a variable they already set | served by accident |
| Tests | need an override of their own | need an override of their own | need an override of their own |
| Surprise | none, per platform | one: on macOS the location depends on an environment variable | one: a directory where macOS users do not look |
| Interaction with [`index-decision.md`](index-decision.md) §2.6 | that memo names the macOS path and leaves Linux open | same, plus the variable | decides the Linux question this memo was told not to decide |

Whatever the answer, **tests need a way to redirect the whole thing**, and so
does a user whose folder is sensitive enough that they want the index on an
encrypted volume — the case [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md)
raises. One environment variable covers both.

### 3.3 Which crate touches it, and what the lint sees

Rule 5 of [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), in its
delimited scope: **the configuration directory is read and written by
`verso-core`**, the index file is opened by `verso-index`, and "the CLI's input
and output" are outside the rule. Facts read from the repository on
2026-09-22, which constrain where the code can go:

- `crates/verso-index/clippy.toml` already grants `verso-index` a narrower
  exception — `create_dir_all`, `set_permissions` and `metadata`, "for the
  index's own file only". `verso-index::Index::open` uses it: it creates the
  parent directory at `0700` and sets the file to `0600`.
- `crates/verso-cli` has **no** `clippy.toml`, so the workspace list applies to
  it in full: any `std::fs` call in `verso-cli` is denied by the lint. Printing
  to standard output is not a `std::fs` call, so the CLI as described here
  needs no exception.
- **The sidecar of [`index-decision.md`](index-decision.md) §2.4 does not exist
  in the code.** Nothing writes a `<key>.json`. Whoever writes it needs a
  `std::fs::write` exception of its own, declared in the PR
  ([ADR 0029](../adr/0029-guardrails-in-ci.md)); the crate that should own it
  is `verso-core`, since the sidecar is configuration-directory bookkeeping and
  not part of the index file.
- **`verso-core` is empty** (nine lines, a doc comment). Feature 4 is where the
  orchestration it is named for gets written; `verso-cli` depends on
  `verso-core` and on nothing else of ours.
- `verso-index::Index::file_name_for` already computes a name: the folder's
  file name with non-alphanumeric characters replaced and truncated to 32
  characters, plus a 16-hex-digit FNV-1a of the absolute path's bytes, plus
  `.sqlite`. It is a name, not a directory: the caller decides where it goes.

### 3.4 Recommendation of Fable 5.1 for decision 2

**Option (b), with an override.**

1. **The directory.** `$VERSO_CONFIG_DIR` when it is set and non-empty;
   otherwise `$XDG_CONFIG_HOME/verso` when that variable is set and non-empty;
   otherwise `~/Library/Application Support/verso` on macOS and
   `~/.config/verso` elsewhere. `$HOME` unset with no override is an error the
   user sees, not a fallback to a relative path.
2. **The index of a folder** at `<config>/index/<name>-<hash>.sqlite`, where
   `<name>-<hash>` is what `Index::file_name_for` already computes from the
   folder's **absolute** path. Relative paths given on the command line are
   made absolute before the key is computed, so `verso index .` and
   `verso index ~/vault` from elsewhere name one index.
3. **A sidecar `<same>.json`**, written by `verso-core`, recording the folder's
   absolute path and the time of the last indexing, so orphans are listable
   (`verso index --list`) and forgettable (`verso index --forget <folder>`) —
   the names [`index-decision.md`](index-decision.md) §2.4 left to feature 4.
   Whether those two flags ship in feature 4 or later is the maintainer's call;
   the sidecar is written from the first `verso index` either way, because a
   sidecar that starts being written later cannot describe the indexes that
   already exist.
4. **No crate for the directory.** Reading two environment variables and
   joining them to `$HOME` is a few lines. `dirs` 7.0.0 and `directories`
   6.0.0 (both MIT OR Apache-2.0, checked on 2026-09-22) do this and more, and
   are **not** taken: the "and more" is a platform table we do not need while
   macOS is the only target ([ADR 0022](../adr/0022-target-platforms-macos-first.md)),
   and a dependency whose whole job is three `if`s is hard to justify under
   [ADR 0033](../adr/0033-pr-workflow.md). Recorded so the maintainer sees that
   the option existed.
5. **`$XDG_CONFIG_HOME` on macOS is a deviation from Apple's convention**,
   chosen deliberately: it costs one `if`, it serves the user who already
   exports it, and it never fires for the user who does not.

**What this does not decide:** the Linux location question
[`index-decision.md`](index-decision.md) §2.6 left open is *narrowed*, not
closed — item 1 names `~/.config/verso` for "elsewhere", and that memo said the
XDG question (config, data or cache directory) would be answered in the PR
that brings Linux. The maintainer may accept the narrowing or keep Linux open;
either way the decision belongs in one place, and section 10 asks for it.

**Discarded alternatives considered:** options (a) and (c) of section 3.2, and
the `dirs`/`directories` crates. Nothing else.

## 4. Decision 3 — messages in pt-BR and EN with no loose string literal (ADR 0035)

### 4.1 What "no loose string literal" has to mean to be checkable

[ADR 0035](../adr/0035-cross-cutting-requirements.md) says "no loose string
literal" and the roadmap makes it exit criterion 6: run each command in both
locales "and check that no message stays in the other language". Two different
things are being asked:

- **Completeness** — every message exists in both languages. This can be made
  a compile error.
- **Discipline** — no code path prints a string that never went through the
  message table. This **cannot** be made a lint: clippy has no rule for "this
  `&str` reaches stdout", `disallowed_methods` on `println!` does not exist
  (a macro is not a method), and forbidding `std::io::Write` would forbid the
  program's only way of speaking. What can be done is to concentrate every
  print in one module, so that a grep for `println!` outside it is a one-line
  check, and to say plainly that the rest is review
  ([ADR 0033](../adr/0033-pr-workflow.md)).

Recorded as a fact, not as a gap to fix later: **feature 7 is held by a
compile error for completeness and by review for discipline.** A guardrail row
in [ADR 0029](../adr/0029-guardrails-in-ci.md) that claimed more than that
would be claiming a check that does not exist.

### 4.2 The options, side by side

| | (a) enum of message ids + `match` per language | (b) an i18n crate with external catalogues | (c) `format!` at each site with an `if lang` |
|---|---|---|---|
| A message missing in one language | compile error: the `match` is not exhaustive | runtime: a missing key falls back or prints the key | invisible |
| Where the translations live | in the source, next to each other | in `.ftl`/`.po`/`.yml` files shipped beside the binary or embedded | scattered |
| Interpolation (`{n} notes indexed`) | Rust's own `format!`, type-checked | the catalogue's syntax, checked at runtime | Rust's own |
| Plural rules (1 nota / 2 notas) | written by hand, per message | provided (Fluent does CLDR plurals) | written by hand |
| New dependency to justify | none | one, plus its tree | none |
| Cost when the UI arrives (Phase 2) | the enum is not reusable by TypeScript; a catalogue would be | already in the right shape, if the crate has a JS counterpart | none, and no reuse |
| Fit for three commands and a few dozen strings | exact | more machinery than the problem | fails completeness |

The crates, checked with `cargo info` on 2026-09-22 and **not** taken:
`fluent` 0.17.0 (Apache-2.0 OR MIT), `rust-i18n` 4.2.2 (MIT), `gettext-rs`
0.8.0 (MIT). The argument against them is not quality; it is that Phase 1 has
three commands and that a catalogue's value — translators who do not build the
project, plural and gender rules, runtime language packs — starts in Phase 2,
if at all ([ADR 0035](../adr/0035-cross-cutting-requirements.md) item 2.7).

### 4.3 Where the language comes from

No decision in the repository says how the locale is read. The conventional
chain on a Unix shell, and what each part is for:

| Source | Why it is in the chain |
|---|---|
| `VERSO_LANG` | lets the maintainer run exit criterion 6 twice without touching the shell's locale, and lets a test be deterministic |
| `LC_ALL` | POSIX: overrides every other locale variable |
| `LC_MESSAGES` | POSIX: the category that governs program messages |
| `LANG` | POSIX: the fallback for every category |

The mapping: a value whose language part is `pt` — in practice `pt_BR`,
`pt_BR.UTF-8`, `pt-BR`, `pt` — selects pt-BR; **anything else, including an
unset or empty environment, selects EN**. English as the fallback is a choice
and not a neutral default: it means a machine with no locale at all answers in
English, which is the language of the repository's source documents
([ADR 0008](../adr/0008-documentation-language.md)) but not the maintainer's
first language.

### 4.4 Recommendation of Fable 5.1 for decision 3

**Option (a), in `verso-cli`, with the locale chain of section 4.3.**

1. **An enum of message ids**, one variant per message, carrying its data as
   fields: `Msg::IndexedNotes { n }`, `Msg::NoBacklinks`,
   `Msg::UnknownCommand { given }`, `Msg::FolderNotOpened { path, why }`, and
   so on.
2. **One function, `text(msg: &Msg, lang: Lang) -> String`**, with one
   exhaustive `match` per language. A new variant that one language forgot does
   not compile; that is the whole mechanism, and it costs no dependency.
3. **Every user-facing print goes through `text()`**, from one module that owns
   stdout and stderr. Paths, note names and search words are interpolated
   values, not messages: they are not translated.
4. **A test that iterates every variant in both languages** — a `const` slice
   of one sample of each variant, rendered twice, asserting that neither side
   is empty and that the two differ wherever the message has words of its own.
   It catches the copy-paste that leaves the English string in the pt-BR arm,
   which the compiler cannot see.
5. **No i18n crate**, for the reason in section 4.2; the three candidates are
   recorded there so the choice is visible. When the UI arrives, the question
   is reopened with a UI's requirements, not a CLI's.
6. **The enforcement is honest:** compile error for completeness, review for
   "no loose literal" (section 4.1). No guardrail row is claimed in
   [ADR 0029](../adr/0029-guardrails-in-ci.md) for something a lint cannot see.
7. **`--lang pt-BR|en`**, an option on every subcommand, above `VERSO_LANG` in
   the chain. It makes exit criterion 6 a single command line rather than an
   exported variable, and it is three lines of argument parsing.

**Discarded alternatives considered:** options (b) and (c) of section 4.2,
with the three crates named. Nothing else.

## 5. Decision 4 — argument parsing

### 5.1 What was checked in the crates, on 2026-09-22

Read with `cargo info` against the crates.io index, not from memory:

- **`clap` 4.6.7, MIT OR Apache-2.0.** Default features are `std`, `color`,
  `help`, `usage`, `error-context` and `suggestions`; the crate is a façade
  over `clap_builder`, with `clap_derive` behind the `derive` feature.
- **`lexopt` 0.3.2, MIT.** A parser with no dependencies and no help
  generation: it hands you options and values, and the program does the rest.

One fact that decides more than the dependency count: **`clap` generates the
help text**, and under [ADR 0035](../adr/0035-cross-cutting-requirements.md)
the help text is a user-facing message that has to exist in pt-BR and EN. The
derive API takes its text from doc comments and `#[arg(help = "…")]`, which are
one string each, chosen at compile time. Two-language help with `clap` means
building the command tree at runtime with strings from our own table — that is,
using the builder API and *not* the derive API, which is most of what `clap`
was brought in for.

### 5.2 The options, side by side

| | (a) hand-rolled over `std::env::args_os` | (b) `clap` 4, builder API, strings from our table | (c) `lexopt` |
|---|---|---|---|
| Dependencies | none | `clap` plus its tree (not resolved here, section 9) | one, no tree |
| Help text in two languages | ours already | ours, fed into the builder | ours |
| Error messages ("unknown flag") in two languages | ours | `clap`'s own, in English, unless every error is intercepted | ours |
| Suggestions ("did you mean `index`?") | not for free | yes, in English | not for free |
| Cost for three subcommands, `--json`, `--lang`, `--unresolved`, `--limit` | small: a `match` on the first argument and a loop | small, but the two-language work is still ours | small |
| Cost when `mcp` arrives (feature 6) and the surface grows | grows with the surface | flat | grows, more slowly |
| Non-UTF-8 arguments (a path is `OsString`) | handled directly: the folder never has to be valid UTF-8 | handled through `OsString` APIs | handled |

### 5.3 Recommendation of Fable 5.1 for decision 4

**Option (a): hand-rolled over `std::env::args_os` for Phase 1.**

- Three subcommands and a handful of options do not pay for a dependency whose
  main product — generated help and errors — arrives in one language and would
  have to be replaced anyway (section 5.1).
- The folder argument stays an `OsString` until `verso-fs` receives it, so a
  folder whose name is not valid UTF-8 is not rejected by our own parsing.
- **When the surface grows, the candidates are recorded:** `clap` 4.6.7 (MIT OR
  Apache-2.0) with the builder API, or `lexopt` 0.3.2 (MIT). Feature 6 (`mcp`)
  is the moment to look again, and by then the message table of section 4 is
  what either of them would be fed.
- Whatever is parsed, **the parse is a value**: a `Command` enum handed to one
  `run` function, so the argument handling can be tested without a process.

**Discarded alternatives considered:** options (b) and (c) of section 5.2.
Nothing else.

## 6. Decision 5 — output, positions and exit codes

### 6.1 What each command prints

The reference for *what* to answer is the Obsidian CLI
([`obsidian-cli.md`](obsidian-cli.md) §3): `backlinks file=X format=json
counts`, `search`, `unresolved verbose`. The reference for *how* to print a
position is [spec §4.4](../spec/dialect.md): `line` and `col`, both 1-based,
`col` counted in Unicode characters. The index already stores what is needed —
`Backlink { from, target, embed, line, col }`, `Unresolved { target, count }`,
`Hit { path, snippet }`.

Proposed default (human-readable) output, one line per result:

| Command | One line of output | Why this shape |
|---|---|---|
| `verso index <folder>` | a summary: notes indexed, unchanged, removed, placeholders present, problems — then one line per problem | exit criterion 1 is read on it |
| `verso search <folder> <words…>` | `path: snippet` | the snippet is what makes a hit checkable without opening the file |
| `verso backlinks <folder> <note>` | `from: line:col  [[target]]` | exit criterion 2 compares it by eye with a hand-written list; the position makes each occurrence distinct when one note links twice |
| `verso backlinks --unresolved <folder>` | `target: count` | the `unresolved verbose` of the Obsidian CLI, and spec Q14's pending targets |

`from` is a path **relative to the folder**, as the index stores it, so the
output does not change when the folder moves and two runs on two machines
compare equal. `[[target]]` is the target **as written** in the note, not the
resolved path: it is what the maintainer will find when they open the file to
check.

### 6.2 Exit codes, and one tension with exit criterion 1

Proposed: `0` success; `1` the run completed but a problem in the folder was
reported (an unreadable entry, the depth cap, a symlink loop — the `Problem`
values `verso-fs` already returns); `2` usage error; `3` the folder or the
index could not be opened at all.

**The tension, recorded and not resolved** (`CLAUDE.md` §1.3): Phase 1 exit
criterion 1 says `verso index` over the maintainer's real vault "finishes with
exit code 0, with no error and no panic". A real vault with one broken symlink
produces a `Problem`, and under the code above that is exit `1` — so the
criterion would read as failed on a vault that indexed correctly and said so.
Three ways out, and this memo picks none:

| | keep `1` for problems | problems are warnings, exit `0` | `1` only for a problem that lost a note |
|---|---|---|---|
| Exit criterion 1 on a vault with a broken symlink | fails | passes | passes, unless the symlink was a note |
| A script that wants "did anything go wrong?" | one check | has to read the output | one check, finer |
| Risk | a criterion that fails for the wrong reason | a real problem silently ignored by a script | the definition of "lost a note" has to be written |

### 6.3 `--json`, and what "stable shape" commits to

`--json` on every subcommand, because feature 6 (`mcp`) will answer the same
questions to an agent and the two answers should not diverge
([ADR 0018](../adr/0018-llm-native-mcp-in-core.md): the contract and the MCP
surface share the same queries). What "stable" has to mean, said now so it is
not discovered later:

- One JSON **object** per run on stdout, not a stream of lines, so a consumer
  can parse it in one go.
- Paths relative to the folder; positions as `line` and `col`, 1-based,
  characters ([spec §4.4](../spec/dialect.md)).
- Adding a field is not a break; renaming or removing one is, and it needs a
  line in the PR.
- The human-readable output has **no** such promise: it is for eyes, and it is
  translated, so a script that parses it is a script that will break.

### 6.4 Recommendation of Fable 5.1 for decision 5

**The output of section 6.1, the exit codes of section 6.2 with `1` for a
reported problem, and `--json` as described in section 6.3.** Specifically:

1. **`verso index` reports:** notes indexed, notes unchanged (by stamp),
   notes removed, placeholders present (never removed —
   [ADR 0043](../adr/0043-placeholder-guard.md)), and every walk problem, one
   line each.
2. **`verso backlinks`** prints one line per **link**, not per source note:
   `from: line:col  [[target]]`. Obsidian reports per note
   ([`index-decision.md`](index-decision.md) §4.1); per occurrence is a
   superset, and exit criterion 2's hand-written list can be compared either
   way.
3. **`verso backlinks --unresolved <folder>`** lists pending targets with their
   counts. It takes no note argument, which makes it a different command
   wearing the same name; `verso unresolved <folder>` is the alternative and is
   not recommended only because it adds a subcommand to the set decision 1 is
   closing.
4. **`--json` on all three**, shape as in section 6.3.
5. **Exit codes** `0`/`1`/`2`/`3` as above, **with the tension of section 6.2
   put to the maintainer**: either the criterion's wording gains "no error
   other than a reported walk problem", or exit `1` is reserved for a problem
   that cost a note. The code ships with `1` for any reported problem until
   then.

**Discarded alternatives considered:** the two alternative exit-code rules in
section 6.2, and `verso unresolved` as a subcommand of its own. Nothing else.

## 7. Decision 6 — what a second `verso index` does, and what it does with a placeholder

### 7.1 The removal rule

The index already carries a `NoteStamp { modified, len, hash }` per note and
answers `stamp_of(path)`, `notes()` and `remove(path)`; `verso-fs` produces the
same three values in `Stamp`. So an incremental run is:

1. Walk the folder. For each note, compare the stamp with the one the index
   has: equal → **unchanged**, nothing is parsed and nothing is written;
   different or absent → read, parse, upsert.
2. Compute the notes the index has that this walk did not produce, and remove
   them — **with two exceptions**.

The exceptions are where the decision is:

| | (a) remove everything not walked | (b) never remove anything | (c) remove, except a placeholder and except a note under a reported problem |
|---|---|---|---|
| A note the user deleted | removed | stays forever: backlinks to a file that is gone | removed |
| A note whose content is not downloaded (placeholder) | **removed — this is the failure [ADR 0043](../adr/0043-placeholder-guard.md) forbids** | kept | kept |
| An unreadable directory (a permission, a disconnected network share) | its whole subtree is removed, because the walk did not reach it | kept | kept, and the problem is printed |
| Cost | none | disk grows | one set of "paths under a problem" per run |

Case three is the one that is easy to miss: a folder the walk could not enter
produces *no entries*, which is indistinguishable from "the user deleted
everything in it" unless the problem is taken into account.

### 7.2 The placeholder, and a gap between ADR 0043 and the schema

Two facts read from the repository on 2026-09-22, recorded because they change
what feature 4 can promise:

- **The removal rule needs nothing new.** A placeholder appears in the walk as
  `EntryKind::Placeholder { of }`, so the note is "seen" in this run and never
  falls into the removal set. The rule of section 7.1 is implementable today.
- **But the index cannot mark it.** [ADR 0043](../adr/0043-placeholder-guard.md),
  decision 2, says the index "keeps the last known version, **marked as
  unverified**". The `notes` table of feature 3 (`schema::VERSION = 1`) has no
  such column, and [`index-decision.md`](index-decision.md) §5.1 proposed one
  ("whether it is a placeholder") that the code does not have. So today:
  - a placeholder whose note was indexed before keeps its old row, unmarked;
  - a placeholder seen for the **first** time — a fresh index of a vault whose
    files are not downloaded — has no row at all: the note is present in the
    folder, absent from the index, and its links are missing from everyone's
    backlinks.

  This memo does not resolve it. It is a contradiction between an Accepted ADR
  and the shipped schema, recorded for the maintainer (`CLAUDE.md` §1.3). What
  it would cost: one column on `notes`, which is a schema version bump, which
  is a rebuild — cheap, because the index is a cache
  ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)) — plus a
  decision on what backlinks *from* an unverified note mean.
- **Meanwhile `verso index` counts and prints placeholders**, so a user whose
  vault is half-downloaded sees the number rather than a silent gap. That is
  the part feature 4 can do without touching the schema.

### 7.3 Recommendation of Fable 5.1 for decision 6

**Option (c), stated as a rule:**

> A second `verso index` skips a note whose stamp the index already has, and
> removes from the index every note it did not see in this walk — **except** a
> note seen as a placeholder, and **except** a note under a path the walk
> reported a problem for. Both exceptions are provisional and are printed, not
> assumed.

- The placeholder exception is [ADR 0043](../adr/0043-placeholder-guard.md) and
  is not negotiable; what is provisional is only the second exception.
- The problem exception is **provisional** because it is a judgement about what
  an unreadable directory means, and nothing in the ADRs says. The conservative
  reading — do not delete what you could not look at — is chosen because the
  opposite error (removing a subtree the user still has) is the one that costs
  the user something, and the cost of being wrong is a stale row until the next
  successful run.
- `verso index --force` (or `--rebuild`) re-reads everything, ignoring stamps.
  A name, not a decision: the flag is what a user reaches for when they suspect
  the index is wrong, and it is the cheapest possible answer since the index is
  a cache.
- **The gap of section 7.2 is put to the maintainer**, not worked around in
  feature 4.

**Discarded alternatives considered:** options (a) and (b) of section 7.1.
Nothing else.

## 8. Not for decision here

Listed so the maintainer sees what feature 4 carries out from decisions already
taken. Nothing in this section is open.

- **What `verso-cli` is** ([ADR 0028](../adr/0028-crate-structure.md)): it
  reads arguments and prints. `verso-core` orchestrates
  `verso-fs` → `verso-dialect` → `verso-index`; `verso-cli` depends on
  `verso-core` and on no other crate of ours.
- **The CLI as an entry edge**
  ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), scope of rules
  4 and 5): a path as a string is accepted on the command line and nowhere
  else; the CLI never opens a file of the folder, and the folder's files are
  `verso-fs`'s alone.
- **The walk's semantics** ([ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0043](../adr/0043-placeholder-guard.md)): symlinks followed with a depth
  cap, hidden entries not walked, an ignored note is an unresolved target and
  never a backlink source, a placeholder is never a deletion. The CLI reports
  them; it does not re-decide them.
- **Link resolution** ([`index-decision.md`](index-decision.md) §4.5,
  provisional): what counts as a backlink is the index's rule, and exit
  criterion 2's hand-written list follows the same one.
- **FTS5 escaping** ([ADR 0029](../adr/0029-guardrails-in-ci.md), feature 3
  guardrail): `verso search` passes the user's words to
  `verso-index`, which quotes them. The consequence recorded in
  [`index-decision.md`](index-decision.md) §6.3 stands — `casa*` searches for
  the literal text, and a prefix or column search would be a flag, which this
  memo does not propose.
- **Positions** ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [spec §4.4](../spec/dialect.md)): 1-based, characters. The CLI prints what
  the index stores.
- **MCP** ([ADR 0045](../adr/0045-server-and-mcp-security.md)): `verso mcp` is
  feature 6, with its transport, surface and protocol version decided before
  it. The only thing feature 4 owes it is the `--json` shape of section 6.3.
- **Multi-root** ([ADR 0041](../adr/0041-multi-root-workspace.md),
  `PROPOSED`): one folder per invocation in Phase 1.
- **Performance** ([ADR 0039](../adr/0039-performance-targets.md)): feature 5
  takes the baseline; nothing here is a target.

**What stays open after this memo**, so that deciding six things does not look
like deciding more: the Phase 2 open command and its disambiguation rule
([ADR 0042](../adr/0042-open-from-command-line.md), section 2.3); whether the
current directory is a default folder; the Linux configuration location
([`index-decision.md`](index-decision.md) §2.6, narrowed in section 3.4); the
placeholder column and what an unverified note's backlinks mean (section 7.2);
`verso index --list` and `--forget` as a shipped surface rather than names;
`verso links`, `orphans` and `deadends`, which the Obsidian CLI answers and the
roadmap does not list for Phase 1 ([`obsidian-cli.md`](obsidian-cli.md) §3);
every spec question the CLI does not touch; and the `verso-fs` and
`verso-index` fixture schemas, still missing
([`fs-decision.md`](fs-decision.md) §6).

## 9. What this memo did not verify

- **No CLI code exists and none was written.** `crates/verso-cli/src/main.rs`
  is ten lines with an empty `main`, and `crates/verso-core/src/lib.rs` is a
  doc comment. Everything in sections 2 to 7 is a proposal on paper.
- **The locale variables on the maintainer's machine were not read.** Section
  4.3 states the POSIX chain, not what this shell exports. `locale` and
  `echo $LANG` in the maintainer's terminal are what would settle whether
  exit criterion 6 needs `--lang` to be exercised at all.
- **What the Obsidian CLI prints for these same queries was not re-observed.**
  [`obsidian-cli.md`](obsidian-cli.md) §3 records which commands answer what,
  and §4 records the shape of the metadata cache; the exact text of a
  `backlinks` or `search` run was not captured, so section 6.1 is parity in
  substance and not in format.
- **The `clap` dependency tree was not resolved.** Section 5.1 records the
  crate's version, license and default features from `cargo info`; how many
  crates `clap` 4.6.7 actually pulls with those features was not computed here,
  and `cargo deny` was not run against it. If the maintainer prefers `clap`,
  that is part of the PR's dependency justification
  ([ADR 0033](../adr/0033-pr-workflow.md)).
- **No environment-variable behaviour was tested.** `$XDG_CONFIG_HOME`,
  `$VERSO_CONFIG_DIR` and the locale chain are described from their
  conventions; nothing was run.
- **The exit-code tension of section 6.2 was found by reading, not by running.**
  Whether the maintainer's real vault produces any walk problem at all is
  unknown; a `verso index` over it is what would tell.
- **The placeholder gap of section 7.2 was read from the schema**, not
  exercised: no vault with undownloaded files was indexed here.
- **No measurement of anything.** Feature 5 takes the baseline
  ([ADR 0039](../adr/0039-performance-targets.md)).
- **No fixture schema exists for `verso-cli`** — nor for `verso-fs` or
  `verso-index` ([`fs-decision.md`](fs-decision.md) §6,
  [`index-decision.md`](index-decision.md) §8). Spec §4 covers dialect fixtures
  only, and this memo does not invent an extension of it; the CLI's behaviour is
  tested by ordinary Rust tests, and exit criteria 1, 2 and 6 are the
  maintainer's check on a real vault.

## 10. How the maintainer decides and verifies, without reading code

**Check that the memo is what the PR says it is:**

```
git fetch origin && git checkout phase1/cli-decision
git diff --stat origin/main..HEAD          # two files under docs/, no crates/, no fixtures/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # unchanged fixtures still pass the lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # author and Signed-off-by are yours
```

**Decide, in six lines on the PR:**

1. **Command surface.** Fable 5.1 recommends *a subcommand in first position in
   Phase 1 (`index`, `search`, `backlinks`; `mcp` in feature 6), the folder as
   an argument of the subcommand, no default folder*; and, for Phase 2,
   **recorded and not decided**, *a first argument that names an existing
   directory opens it, otherwise it is a subcommand, with `verso open <folder>`
   and `verso -- <folder>` as the escape hatches*.
2. **Configuration directory.** Fable 5.1 recommends *`$VERSO_CONFIG_DIR`, else
   `$XDG_CONFIG_HOME/verso`, else `~/Library/Application Support/verso` on
   macOS and `~/.config/verso` elsewhere; the index at
   `<config>/index/<name>-<hash>.sqlite`; a `<same>.json` sidecar with the
   folder's absolute path and the last index time; no `dirs`/`directories`
   crate*. Say also whether the Linux half stays open.
3. **Messages.** Fable 5.1 recommends *an enum of message ids plus one
   `text(msg, lang)` with an exhaustive `match` per language, the locale from
   `--lang`, `VERSO_LANG`, `LC_ALL`, `LC_MESSAGES`, `LANG`, anything not `pt*`
   being EN, a test over every variant in both languages, and no i18n crate* —
   with the enforcement stated as it is: compile error for completeness, review
   for "no loose literal" (section 4.1).
4. **Argument parsing.** Fable 5.1 recommends *hand-rolled over
   `std::env::args_os` for Phase 1*, with `clap` 4.6.7 or `lexopt` 0.3.2 as the
   candidates when feature 6 grows the surface.
5. **Output and exit codes.** Fable 5.1 recommends *human-readable by default,
   one line per result, `--json` on every subcommand, `backlinks` printing
   `from: line:col  [[target]]`, `--unresolved` listing pending targets, and
   exit codes 0/1/2/3* — **and asks for an answer on the tension of section
   6.2**: does a reported walk problem make `verso index` exit `1`, and if so,
   does exit criterion 1's wording change?
6. **Second run.** Fable 5.1 recommends *skip by stamp; remove what the walk
   did not see, except placeholders (ADR 0043) and except paths under a
   reported problem (provisional)*; and asks whether the placeholder column of
   section 7.2 is added now, which is a schema bump and a rebuild.

**What the closing PR records, if the recommendations are accepted:**

| Where | What it gains |
|---|---|
| [ADR 0042](../adr/0042-open-from-command-line.md) | the Phase 1 rule (subcommand required) and the subcommand set; the Phase 2 rule recorded as the recommended direction and still `[OPEN]` |
| [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) / [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md) | the concrete configuration directory, the key, the sidecar and the override variable |
| [ADR 0035](../adr/0035-cross-cutting-requirements.md) | how "no loose string literal" is held: compile error plus review, with no lint claimed |
| [ADR 0043](../adr/0043-placeholder-guard.md) | what `verso index` does with a placeholder on a second run, and the gap of section 7.2 either closed or recorded |
| [roadmap](../roadmap.md), Phase 1 | the ADR 0042 decision row struck through, as Q18, ADR 0037, Q26 and the index rows were; exit criterion 1's wording, if section 6.2 changes it |
| `fixtures/` | nothing: a `verso-cli` fixture would need a schema first (section 9) |
