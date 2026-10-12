# ADR 0022 — Target platforms and macOS first

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §9
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-23 — the Windows and Linux apps, their order and how CI
  follows them, from the maintainer. 2026-10-07 — the Windows app starts
  now, while Phase 2 is open, from the maintainer
  ([0069](0069-windows-port.md)).
  2026-10-12 — Linux shipped in Phase 3, on 2026-10-09
  ([0071](0071-linux-port.md), 0.6.0-beta.1), not after Phase 2; recorded
  with the maintainer's acceptance of the ADR audit, in session:
  *"Ajuste tudo que precisar. Está aprovado os ADRs"*. The sentence that
  said otherwise is kept as history. The same day, item 3 of
  [0027](0027-runtime-capabilities.md), which the first Consequence
  cites, revised.

## Context

The project has one maintainer. Supporting five platforms from the start is the
fastest route to the burnout recorded in §10.3.

## Decision

1. Target platforms: macOS, Windows, Linux, iOS and Android.
2. Initial platform: macOS.
3. Per-platform limitations are acceptable, as long as they are explicit.

## Consequences

- "Explicit" has an address: runtime capabilities, and the rule that the UI
  explains the absence of a feature instead of hiding it
  ([0027](0027-runtime-capabilities.md)). *(That rule revised on
  2026-10-12: a feature the side cannot do is not shown — 0027 item 3.)*
- Phase 2 is a walking skeleton on macOS only
  ([0034](0034-roadmap-in-phases.md)); mobile is out of scope until then.
- CI runs on macOS and Linux from Phase 0 on, even with no UI on Linux
  ([0029](0029-guardrails-in-ci.md)), so as not to accumulate platform
  divergence in the core.
- The iOS and Android constraints are already recorded and should not be
  rediscovered when mobile lands ([0009](0009-external-constraints.md)).
- **Windows and Linux, by the maintainer on 2026-09-23**: both apps ship,
  after Phase 2, **Windows first** — there is no Linux machine at hand, and a
  virtual machine is extra work (*"windows e linux tem que sair também …
  Windows na frente de linux"*). Each joins CI's platform checks on `main`
  when its port lands, and the packaging of a version
  ([0029](0029-guardrails-in-ci.md)); CI already builds and tests the core on
  Linux on every pull request.
- **Windows brought forward, by the maintainer on 2026-10-07**: the Windows
  app starts now, while Phase 2 is open and before a stable version
  (*"uma das coisas que a gente tem para fazer é implementar uma versão para
  Windows"*, then *"Tô querendo já iniciar windows"*). How it is built and
  tested is [0069](0069-windows-port.md). Asked whether that puts the
  Windows app in Phase 2, the maintainer answered the same day: *"Vou
  passar windows na frente"* — the Windows app is part of Phase 2's scope,
  ahead of the rest of Phase 2's work, and ships before Phase 2 closes;
  "Phase 2 is a walking skeleton on macOS only" above holds for Phase 2 as
  it was planned, and the roadmap carries the revision. Linux is unchanged
  (2026-09-23): after Phase 2. *(Kept as history. Revised on 2026-10-12:
  Linux shipped in Phase 3, on 2026-10-09 — [0071](0071-linux-port.md),
  0.6.0-beta.1.)*

## Discarded alternatives

None recorded: the briefing does not discuss another initial platform.

## Status

Accepted. Revised on 2026-10-12: Linux shipped in Phase 3, on 2026-10-09
(Revisions).
