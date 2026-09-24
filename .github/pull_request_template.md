<!--
Until the whole flow exists (sync, web, mobile), a large PR is fine — the
maintainer's decision of 2026-09-24 (ADR 0033, ADR 0051); small, one subject,
after it.
The five sections below are mandatory (ADR 0033). None of them is a formality:
the maintainer only approves what they can explain in their own words.
-->

## What

<!-- What this PR does, in two or three sentences. Behavior, not implementation. -->

## Why

<!--
Why this PR exists. Which decision it carries out: link the ADR, the briefing
section or the spec question.

If the needed decision was `PROPOSED` or `[OPEN]`, this PR should not exist:
stop and ask the maintainer.
-->

- ADR / section: <!-- e.g.: docs/adr/0030-...md, BRIEFING §11.1 -->
- Roadmap phase: <!-- 0, 1 or 2 — and why it fits in it -->

## Discarded alternatives

<!--
What else was considered and why it was not chosen. One line per
alternative.

If no alternative was actually considered, write "None considered" — do not
invent one to fill the section.
-->

## How to verify

<!--
Step by step that the maintainer runs without reading the code: commands,
expected output, fixture that covers the case.

If the only way to verify it is to read the diff, the PR is incomplete.
-->

```
# commands
```

## Rust concept used

<!--
Explained for someone who is learning Rust, outside the project.

Name the concept (ownership, borrow, lifetime, trait, enum with data, Result,
iterator, `?`, newtype...), say why it showed up here, and what would
happen without it. One short paragraph and a snippet of code from the PR itself.

PR that does not touch Rust: write "Not applicable" and say why.
-->

---

## Before requesting review

- [ ] One subject only (from when the whole flow exists; until then, the subjects are listed under What).
- [ ] Green CI: `cargo fmt --check`, `cargo clippy`, `cargo test`, `cargo deny check`.
- [ ] No new `#[allow]` to silence a guardrail. If a guardrail blocks legitimate work, that is its own PR, with justification (`CLAUDE.md` §3) — not an `#[allow]` in this diff.
- [ ] Feature guardrail (fuzz, round-trip, atomic write, confinement, FTS5, benchmark), if this PR introduces it, was seen failing before passing (ADR 0029).
- [ ] A fixture that answers an `[OPEN]` question of the spec, if any, comes with the update of section 9 of the spec in this same PR (ADR 0031).
- [ ] No invariant of `CLAUDE.md` §2 violated.
- [ ] **No `fixtures/**/expected.yaml` changed.** Changed: the maintainer's explicit approval is linked here.
- [ ] New fixture, if any, marked as an AI draft, awaiting approval.
- [ ] New dependency, if any, justified: what it replaces and why the license passes `cargo-deny`.
- [ ] Author and reviewer in separate sessions (ADR 0032).

<!--
Classification of the review findings:
BLOCKING  — violates an invariant, guardrail or decision, or loses data. Blocks merge.
IMPORTANT — must be resolved, or deferred with a record.
MINOR     — at the author's discretion.
-->
