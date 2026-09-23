# ADR 0035 — Cross-cutting requirements: pt-BR and EN, accessibility, benchmark

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §13
- Status in the briefing: `DECIDED` (i18n, accessibility, benchmark);
  `PROPOSED` (accessible board view); `OPEN` (performance targets)
- Revisions: 2026-09-22 — how the feature 4 code meets "no loose string
  literal" recorded under Consequences, as **provisional**; the Decision is
  unchanged (memo `docs/reference/cli-decision.md`).
- Revisions: 2026-09-23 — how the Phase 2 window meets decision 1 recorded
  under Consequences, at the maintainer's request (`docs/review/phase-2.md`
  §6, item 12); the Decision is unchanged.

## Context

i18n and accessibility are cheap at the start and expensive later: adding a
language or accessible semantics to a finished UI usually requires rewriting
the UI.

## Decision

1. pt-BR and EN from the first commit.
2. Accessibility from the start.
3. Benchmark with a synthetic vault recording a baseline.

## Consequences

**Revision of 2026-09-22, by the maintainer.** Decision 1 binds **the
application's interface**: the Phase 2 UI is pt-BR and EN. It does **not** bind
the CLI, which is a developer's tool and may be in one language. The reason
given, verbatim: *"a interface da aplicação deve ter pt-BR, o resto não
precisa"*. What follows from it:

- The bilingual `verso-cli` built in feature 7 **stays as it is** — it works,
  it is tested, and removing it would be work that buys nothing. It is no
  longer a requirement, so a future command may be written in one language
  without breaking this ADR.
- Phase 1's exit criterion 6 is relaxed accordingly (`docs/roadmap.md`).
- "No loose string literal" survives on its own merit for the UI, where it is
  what makes a second language possible at all. In the CLI it is now a
  convention of the existing code, not a rule of this ADR.
- `verso mcp`'s tool results are data for a model, not an interface: English,
  and outside this decision either way.

- "From the first commit" means **from the first commit of product code**:
  Phase 0 is documentation and empty crates. It holds for the Phase 2 UI and
  for the Phase 1 CLI messages: no loose string literal. Phase 1 gets a scope
  item and an exit criterion for that (`docs/roadmap.md`), and whatever i18n
  dependency `verso-cli` needs is justified in the PR like any other
  ([0033](0033-pr-workflow.md)).
- The product language (pt-BR and EN, decided) is independent of the language
  of the repository documentation, decided separately: English as the source,
  pt-BR as the mirror ([0008](0008-documentation-language.md)).
- The board needs an equivalent accessible view — a list or table of the same
  notes and relations (`PROPOSED`, [0024](0024-board-excalidraw.md)).
- The benchmark goes in as a guardrail in Phase 1
  ([0029](0029-guardrails-in-ci.md)), but with no target: performance targets
  are `[OPEN]` ([0039](0039-performance-targets.md)).
- Schema i18n with a language-neutral key is a separate proposal
  (`docs/spec/dialect.md`).

**How "no loose string literal" is met in the CLI. Recorded on 2026-09-22 from
the feature 4 code — provisional, the maintainer decides on waking**, on line 3
of `docs/reference/cli-decision.md` §10. This is what the code does, not a
decision.

- **A `Msg` enum**, one variant per user-facing message, carrying its data as
  fields, and one function `messages::text(msg, lang)` with an **exhaustive
  `match` per language**. A message that exists in one language and not in the
  other does not compile: that is the whole mechanism, and it costs no
  dependency.
- **A test renders every variant in both languages**, which catches the
  copy-paste that leaves the English string in the pt-BR arm — the failure the
  compiler cannot see.
- **The language** comes from `--lang pt-BR|en`, else from the first of
  `VERSO_LANG`, `LC_ALL`, `LC_MESSAGES` and `LANG` that is set and non-empty: a
  value beginning with `pt` selects pt-BR, anything else selects EN, and an
  environment with none of them is EN. The usage and help text go through the
  same table, so `verso help` answers in two languages as well.
- **"Every print goes through `text`" is held by review, not by a lint.**
  `println!` is a macro and clippy's `disallowed_methods` names methods; there
  is no rule for "this `&str` reaches standard output". The code concentrates
  the printing so that the check is a grep, and this line records that the rest
  of the guarantee is human ([0033](0033-pr-workflow.md)).
- **No i18n crate.** `fluent`, `rust-i18n` and `gettext-rs` were looked at and
  not taken for three commands and a few dozen strings
  (`docs/reference/cli-decision.md` §4.2); the question is reopened for the
  Phase 2 UI, with a UI's requirements rather than a CLI's.

**After the Opus 5 reading of 2026-09-22 the code also does:**

- **The walk's problems go through the same table as everything else.**
  `verso-core` hands them over as `WalkProblem` — loop, duplicate, too deep,
  io — and the CLI renders them as four `Msg` variants in both languages. No
  Rust `Debug` rendering reaches the user any more, and none reaches the
  `--json` output either.
- **The one untranslated part is the operating system's own error text**,
  inside the io variant. It is the system's string, in the system's locale, and
  not ours to translate; this line records the exception instead of leaving it
  implied.
- **`backlinks` on a note the index does not know says so** — "unknown note",
  on stderr — instead of answering "no backlinks" like a note that exists and
  has none. Exit criterion 2 is read on that output.
- **stdout carries the answer only.** Usage errors, errors opening the folder
  or the index, the unreadable lines and the problem lines of a run go to
  stderr, so `--json > file` never mixes a translated sentence into the JSON.
- **A closed pipe ends the output quietly.** Every line goes through `writeln!`
  on a locked handle and the writing stops at the first error, so
  `verso search … | head -1` ends with the command's own exit code instead of a
  panic on a broken pipe.

**The window's mechanism, recorded on 2026-09-23 at the maintainer's request**
(`docs/review/phase-2.md` §6, item 12; the answer: *"a e b ok"*):

- **A typed catalog.** Every text the window shows comes from one catalog in
  `app/ui/src/main.ts`: one object per language, each typed as a record over
  one union of keys, so a key missing in either language fails the type check
  instead of reaching the screen as a raw string.
- **A language setting** — automatic, pt-BR or English — that reloads the
  window to apply; the window rejoins the open folder rather than open it
  again.
- **The core's words.** The window says the kind of every error the core
  answers (`not_found`, `changed`, …) in the user's language, and adds the
  core's own detail after it, in English. The core's write warnings reach the
  status line in English too; the contract records their language as
  `[OPEN]`. The plan, accepted with this record: each warning gets a code in
  the contract, so that the window can say it in the user's language. Not
  done yet.

## Discarded alternatives

- Launching in one language only and translating later — discarded in §13.
- Accessibility as a later stage — discarded in §13.

## Status

Accepted.
