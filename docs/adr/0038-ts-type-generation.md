# ADR 0038 — TypeScript type generation from Rust

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §9, §17 item 5
- Status in the briefing: `OPEN`
- Revisions: 2026-09-23 — the maintainer's decision of 2026-09-22 recorded in
  Decision, Consequences, Discarded alternatives and Status.

## Context

Rule 3 of the contract requires TS types to be generated from Rust, not written
by hand ([0026](0026-core-ui-contract-inviolable-rules.md)). The briefing lists
two candidates, without choosing: `ts-rs` or `specta`.

## Decision

Taken by the maintainer on 2026-09-22, at the start of Phase 2, in the session
that opened it. Asked how to start the window and told that "a decisão do ADR
0038 é tua", the maintainer chose the option "Tauri agora, specta".

**`specta`, with `tauri-specta` exporting the Tauri commands.**

## Consequences

- What the code does with it, which is not part of the choice: the
  contract's types live in a crate of their own, `crates/verso-contract` — a
  sixth crate beside the five of [0028](0028-crate-structure.md), recorded
  for the maintainer (`docs/review/phase-2.md` §6, item 10) — and derive
  `specta::Type`; each command in `app/src-tauri` carries `#[specta::specta]`;
  `verso-app --export-bindings` writes `app/ui/src/bindings.ts` with both the
  types and one typed function per command. The UI talks to the core only
  through that file.
- The typed contract exists on the JS side from Phase 2 on; Phase 1 did not
  need one, being CLI only ([0034](0034-roadmap-in-phases.md)).
- The whole contract is generated, not only the types: the command signatures
  come out of the same export, so no call from the UI to the core is written
  by hand. That was the reason given for it when the two options were offered.
- The contract types are annotated in Rust (`#[derive(Type)]`), which touches
  core code even though the tool serves the TS side.
- CI regenerates the file and fails when the committed one differs: the `app`
  job of `.github/workflows/ci.yml` runs the export and a `diff`
  ([0029](0029-guardrails-in-ci.md), the Phase 2 row of the guardrail table).
- `specta` and `tauri-specta` are release candidates; the three crates are
  pinned to exact versions (`=2.0.0-rc.25`, and `=0.0.12` for
  `specta-typescript`), so an upgrade is a deliberate change that regenerates
  the bindings in the same commit.
- A 64-bit integer has no plain counterpart in TypeScript without `bigint`.
  Counts and positions cross as `u32`; sizes and dates in `FileEntry` cross as
  `f64`, which the generator types as `number | null`.

## Discarded alternatives

- TS types written by hand — discarded by rule 3 of the contract (§10.1).
- `ts-rs` — offered to the maintainer on 2026-09-22 as the more stable option,
  with less churn, and not chosen. The drawback given with the options: the
  glue that calls the commands would have been written by hand, turning rule
  3 into a convention for that part.

## Status

Accepted on 2026-09-22.
