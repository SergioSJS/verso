# ADR 0034 — Roadmap in three phases with verifiable exit gates

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §15, §10.3
- Status in the briefing: `DECIDED`
- Revisions: 2026-10-01 — the board left point 4's list on 2026-09-30, by the
  maintainer's decision recorded in [0057](0057-board-json-canvas.md),
  point 1; this ADR points there since the maintainer's decision of
  2026-10-01 on the critical review
  [`docs/review/board.md`](../review/board.md), §6 item 16.
  2026-10-09 — a Phase 3 added by [0073](0073-self-hosted-server-first.md),
  accepted by the maintainer that day; the text below is kept as it was
  decided. Phase 3: the Linux app ([0071](0071-linux-port.md), shipped in
  0.6.0-beta.1), then the self-hosted server, whose first release brings
  the accounts and roles, the contract over the wire, the desktop app
  connecting, the window in a browser and on every screen
  ([0076](0076-the-window-on-every-screen.md)) and simultaneous editing of
  notes; after it, sync for the desktop's local folders, the PWA offline,
  the user's bucket and native mobile if needed (0073 item 12). Point 4's
  list: sync and mobile leave it, in the shape 0073 gives them — mobile
  through the browser, served by the server; sync after the server and
  through it; plugins and the compatibility shim stay out. Phase 3's exit
  criterion is not set (`[OPEN]`, in the roadmap). *(Decided by the
  maintainer on 2026-10-10: the phase ends when no task of it is pending
  and the maintainer declares it ended — the roadmap's Phase 3.)*

## Context

Scope and burnout are a declared risk. The recorded mitigation is a small core,
features as plugins and a gate of one month of real use before moving on.

## Decision

1. **Phase 0 — Foundation**: ADRs, dialect spec v0, initial fixture corpus,
   `CLAUDE.md`, PR template; critical review; license decision; workspace and
   CI with all the guardrails, with no feature at all.
2. **Phase 1 — Core via CLI, no UI**: `verso-dialect`, `verso-fs`,
   `verso-index`, `verso-cli`, bench, read-only `verso mcp`.
3. **Phase 2 — Walking skeleton on macOS**: Tauri + CM6, contract with
   generated types, one note type end to end.
4. Out of scope until the end of Phase 2: sync, mobile, plugins, board and the
   compatibility shim. *(The board left this list on 2026-09-30:
   [0057](0057-board-json-canvas.md), point 1.)*

The exit criteria are in `docs/roadmap.md`.

## Consequences

- All of Phase 1 without UI: the core has to be usable from the CLI before a
  window exists.
- The Phase 2 gate is real use, not a feature checklist: one month of session
  preparation using the app itself.
- No plugin, sync or board decision needs to be closed now, which keeps the
  corresponding `PROPOSED` ADRs unhurried.
- Phase 0 depends on a decision that is not technical
  ([0005](0005-license.md)): without `LICENSE`, the phase does not close.

## Discarded alternatives

- Starting with the UI — discarded by the order of the phases in §15.
- Including sync, mobile, plugins or board before the end of Phase 2 —
  discarded in §15.

## Status

Accepted. Point 4 narrowed by [0057](0057-board-json-canvas.md) on 2026-09-30:
the board is in Phase 2. Revised on 2026-10-09 by
[0073](0073-self-hosted-server-first.md): a Phase 3, and sync and mobile
out of point 4's list (Revisions).
