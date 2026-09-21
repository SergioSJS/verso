# ADR 0045 — Security of the server, the MCP and the contract

- Date: 2026-09-21
- Source: `docs/review/phase-0.md` R4, R5, I5
- Status in the briefing: not present;
  [0025](0025-own-server-and-mobile-pwa.md) records "authentication and
  exposure" as a question to open

## Context

Three decisions already made expose the folder to the network or to an external
process: the MCP server in the core
([0018](0018-llm-native-mcp-in-core.md), Accepted), the core↔UI contract that
travels over a remote WebSocket
([0026](0026-core-ui-contract-inviolable-rules.md), Accepted) and the own server
`verso serve` ([0025](0025-own-server-and-mobile-pwa.md), Proposed). None of
them says who can connect, how they identify themselves, or what they can do.

The risk is not implementing authentication now. It is designing a contract in
Phase 2 that cannot accommodate it and having to redo it when the server
arrives.

## Decision

None. Questions recorded, with the moment to decide them.

### `verso mcp` — decide before feature 6 of Phase 1

- **Transport:** stdio (child process of the client, no port) or HTTP/SSE on a
  local port. If a port: binding only to `localhost`, `Origin` checking,
  protection against DNS rebinding and a per-session token are the publicly
  known minimum for local MCP servers.
- **Surface:** "read only" still hands over the whole folder, including what the
  player view (spec Q9) will want to hide, to any client that connects. Whether
  the MCP respects per-block visibility once it exists.
- **Protocol version:** which version of the MCP specification is supported and
  what happens when it changes (the specification has already changed transport
  and authorization model more than once).

### Core↔UI contract — decide before item 2.1 of Phase 2

- The contract has to have, from the first design on, session identity,
  per-operation authorization and a notion of "who is on the other side", even
  if in local IPC everything is granted. Adding it later means redoing it.

### `verso serve` — decide before it enters scope

- Authentication, TLS, exposure outside the machine, multi-user or not.

## Consequences

- **Risk to record in §10.3:** the folder's content is untrusted input for the
  agent. Downloaded schema packs, notes shared by players and material pasted
  from the web can contain instructions to the model. The mitigation already
  decided — a diff before applying any agent write
  ([0018](0018-llm-native-mcp-in-core.md)) — is now recorded as a mitigation for
  this risk, and no agent write can bypass the diff for "convenience".
- The choice of MCP transport in Phase 1 is reversible; the shape of the
  contract in Phase 2 is not cheap to reverse.

## Discarded alternatives

None recorded.

## Status

`[OPEN]`. MCP: before feature 6 of Phase 1. Contract: before item 2.1 of
Phase 2. Server: before it enters scope.
