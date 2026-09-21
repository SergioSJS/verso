# ADR 0025 — Own server (`verso serve`) and initial mobile as a web client

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §9, §16.1, §16.2
- Status in the briefing: `PROPOSED`

## Context

The mobile constraints (no access to an arbitrary folder on iOS, slow bulk
operations on Android, no resident process) make indexing a large vault on the
phone expensive. The recorded pain is precisely large vaults freezing on the
iPhone.

## Decision (proposed, not confirmed)

1. The server is the same core binary without UI: `verso serve`.
2. Initial mobile: web client (PWA) served by the own server.
3. A companion server indexes and hands the finished index to the phone.

## Consequences

- Reinforces the rule that the UI does not assume which side of the wire the
  core is on ([0026](0026-core-ui-contract-inviolable-rules.md)): the same
  contract runs over local IPC or over remote WebSocket.
- A web client that depends on a server is not offline-first: availability
  has to show up in the capabilities
  ([0027](0027-runtime-capabilities.md)).
- SilverBullet is the recorded reference for the web client (§16.2).
- Serving the folder over the network raises authentication and exposure, which
  the briefing does not address. The question is recorded in
  [0045](0045-server-and-mcp-security.md), `[OPEN]`, and part of it
  (session identity and authorization in the contract) has to be decided
  already in Phase 2, item 2.1, because the server reuses the contract.
- Mobile is out of scope until the end of Phase 2
  ([0034](0034-roadmap-in-phases.md)).

## Discarded alternatives

None recorded: the briefing does not compare PWA with a native mobile app.

## Status

Proposed.
