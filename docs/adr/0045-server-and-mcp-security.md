# ADR 0045 — Security of the server, the MCP and the contract

- Date: 2026-09-21
- Source: `docs/review/phase-0.md` R4, R5, I5
- Status in the briefing: not present;
  [0025](0025-own-server-and-mobile-pwa.md) records "authentication and
  exposure" as a question to open
- Revisions: 2026-09-23 — the contract group: kept `[OPEN]` by the maintainer
  until a server enters scope, with the Phase 2 contract accepted as built
  (`docs/review/phase-2.md` §6, item 6). 2026-09-24 — the note identifier:
  the decision of 2026-09-22, the path relative to the root, is the text that
  stands, by the maintainer's answer on `docs/reference/handles-decision.md`,
  which found this ADR, [0026](0026-core-ui-contract-inviolable-rules.md) and
  [0044](0044-verso-fs-semantics.md) disagreeing about it; the older
  paragraph that called the `verso mcp` group provisional brought in line
  with a note. 2026-10-07 — the MCP's surface: nine read-only tools, with typed relations, boards, properties and tags, and bases ([0066](0066-mcp-sees-boards-relations-properties-bases.md)).
  2026-10-09 — the contract group and the `verso serve` group answered,
  with the maintainer's acceptance of [0073](0073-self-hosted-server-first.md)
  and [0074](0074-accounts-and-access-on-the-server.md) that day; each
  answer is a paragraph after its group, and the text above it is kept.
  The MCP over the network stays `[OPEN]` (0073 item 11) —
  `[DECIDED 2026-10-21]`: after V1, with the local MCP over stdio unchanged
  (0073.mcp). 2026-10-21 — the language of what a model reads is decided:
  English only (0045.lang). 2026-10-21 — the first surface open to a visitor
  with no account, the read links of [0105](0105-read-links-without-an-account.md),
  is built; the threat model (`docs/reference/threat-model.md`) has its rows,
  and this ADR's decisions are unchanged.

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

**`verso mcp` decided on 2026-09-22 by the maintainer**
(`docs/reference/mcp-decision.md` §9). The three questions above, answered:

- **Transport: stdio.** The client spawns `verso mcp <folder>` as a child
  process. No port, so no `Origin` checking, no DNS-rebinding defence and no
  session token to get wrong. HTTP stays a later feature and brings the
  `verso serve` questions with it when it comes.
- **Surface: seven read-only tools** — `search`, `read_note`, `links`,
  `backlinks`, `unresolved`, `list_notes`, `index` — with citations by `^id`,
  or by line and column when the block has none. No tool writes. The Q9
  warning stands and is written into the command's own help: until per-block
  visibility exists in the spec, **`verso mcp <folder>` hands the whole folder
  to whoever connects**, and the only control is which folder is opened. The
  ignore list of [0044](0044-verso-fs-semantics.md) is available as a blunt
  second line of defence, at the price of those notes also leaving the index.
- **Protocol version:** whatever `initialize` negotiates with the client,
  recorded in the PR; the dependency is `rmcp` 3.4, which brings 61 crates and
  passes `cargo deny check licenses`. The maintainer accepted that weight
  knowingly, as the alternative is writing the protocol by hand.
- **Note identifier:** the path relative to the root, as a string, under the
  amended rule 4 of [0026](0026-core-ui-contract-inviolable-rules.md) —
  identity crosses as a relative path, access crosses as a handle — with
  confinement applied to every path a client sends and the opaque `Handle`
  staying inside the process.
- **Staleness:** one incremental index at start, an `index()` tool to refresh,
  no watcher, and `stale: true` on `read_note` when the file's stamp differs
  from the index's.

### Core↔UI contract — decide before item 2.1 of Phase 2

- The contract has to have, from the first design on, session identity,
  per-operation authorization and a notion of "who is on the other side", even
  if in local IPC everything is granted. Adding it later means redoing it.

**The maintainer's answer of 2026-09-23** (`docs/review/phase-2.md` §6, item
6; *"a e b ok"*): the question stays `[OPEN]` until `verso serve`, or any
other side that is not the app's own window, enters scope; for Phase 2 the
contract is accepted as built. It has no session identity and no
per-operation authorization. The host grants the commands to the app's own
views only — the main window and the note windows — through an app manifest;
a web view that shows a site gets none, and neither does a remote origin.
`verso://`, the file protocol beside the contract, answers the app's own
views only and never serves a note. The host-only commands (`web_*`,
`open_url`, `open_window`, `reveal`) sit in the same generated bindings as
the core's. The risk this group names — identity added later means the
contract redone — is accepted with it.

**Answered on 2026-10-09** ([0074](0074-accounts-and-access-on-the-server.md)
item 11, accepted with [0073](0073-self-hosted-server-first.md)): every
command carries the session that the transport authenticated — a cookie or
a bearer token — and the core resolves it to an account and a role in the
folder **before** `verso-fs` acts; a refusal is a contract error like the
others, in both languages. The desktop app with a local folder keeps the
implicit owner and asks for no sign-in. The risk accepted above is met
before the server's first release, not after it.

### `verso serve` — decide before it enters scope

- Authentication, TLS, exposure outside the machine, multi-user or not.

**Answered on 2026-10-09**, with the acceptance of
[0073](0073-self-hosted-server-first.md) and
[0074](0074-accounts-and-access-on-the-server.md): authentication —
accounts with a password hashed with Argon2id, passkeys, sessions and
personal access tokens (0074); TLS — behind a reverse proxy or
`tailscale serve`, or the server's own certificate and key, and no login
served without TLS except on loopback or behind the configured proxy
(0073 item 6, amended 2026-10-16: plain HTTP is served too, without what
needs a secure context); exposure outside the machine — the user's choice, a VPN or
a reverse proxy recommended, never a port the server opens on its own
(0073, Consequences); multi-user — several accounts per server and roles
per folder (0074 item 6). The MCP over the network, its transport and its
authorization, stays `[OPEN]` (0073 item 11); the prompt-injection risk of
the Consequences below is taken up by the threat model 0073 item 6 asks
for.

## Consequences

- **Risk to record in §10.3:** the folder's content is untrusted input for the
  agent. Downloaded schema packs, notes shared by players and material pasted
  from the web can contain instructions to the model. The mitigation already
  decided — a diff before applying any agent write
  ([0018](0018-llm-native-mcp-in-core.md)) — is now recorded as a mitigation for
  this risk, and no agent write can bypass the diff for "convenience".
- The choice of MCP transport in Phase 1 is reversible; the shape of the
  contract in Phase 2 is not cheap to reverse.

**The `verso mcp` group as the feature 6 code implements it. Recorded on
2026-09-22 from the feature 6 code — provisional, the maintainer decides**,
under the recommendations of `docs/reference/mcp-decision.md` §2 to §6. This is
what the code does, not a decision: the three questions above stay `[OPEN]`, and
the code changes if the maintainer decides otherwise. *(Superseded the same day
for what it calls `[OPEN]`: the maintainer decided the `verso mcp` group on
2026-09-22 — the list above, with which this record agrees — and on 2026-09-24
confirmed the relative path as the note identifier
(`docs/reference/handles-decision.md`). The rest stays the record of what the
code does; the language of what a model reads was still `[OPEN]` then,
below, and is decided: English only, 2026-10-21.)*

- **Transport: stdio, and nothing listens.** `verso mcp <folder>` is spawned by
  the client as a child process and speaks JSON-RPC over its own standard input
  and output. No port is bound, so the `Origin`, DNS-rebinding and per-session
  token surface named above does not exist to get wrong. The process runs one
  incremental index pass before the first answer, serves until the client closes
  stdin, and exits 0. **stdout carries the protocol**: everything said to a
  human — the serving line, a failure — goes to stderr.
- **Surface: seven tools, read-only**, with the JSON shapes of the memo's §3.3:
  `search` (words, `limit`), `read_note` (path, `from_line`/`to_line`), `links`,
  `backlinks`, `unresolved`, `list_notes` and `index`. They are MCP **tools**
  and not resources, so every access to the folder is a call the client can show
  and refuse. `index` is the only one that writes anything, and what it writes
  is the index file outside the tree
  ([0011](0011-config-outside-tree-index-as-cache.md)); no tool creates,
  renames, deletes or edits a note ([0018](0018-llm-native-mcp-in-core.md),
  [0034](0034-roadmap-in-phases.md)).
- **Caps, with `truncated` on every capped answer:** `search` returns 20 hits by
  default and at most 100, `read_note` at most 400 lines per call, `list_notes`
  at most 5000 paths. Each number is in its tool's description, so a model that
  gets half an answer is told so. They are round numbers, not measurements
  (memo §8).
- **Protocol version: negotiated by the SDK, not chosen by our code.** `rmcp`
  3.4.0 negotiates at `initialize` against its own ceiling (`LATEST`,
  `2025-11-25` in that version) and the code overrides nothing. The end-to-end
  tests ask for `2025-06-18` and for `2025-03-26` and observe each one answered
  as asked. Which date Claude Desktop or Claude Code sends is still unobserved:
  no external client has connected.
- **The Q9 exposure is written where a human reads it.** `verso help` prints, in
  both languages, that *"the client that connects reads the whole folder (every
  note the index lists); there is no way to hide a block or a note yet. Choose
  the folder."* Per-block visibility (spec Q9) has no syntax, so nothing inside
  a note is hidden from a connected client; what is excluded is only what the
  walk already excludes — hidden entries at any depth and ignored paths
  ([0044](0044-verso-fs-semantics.md)) — plus a placeholder's content, which is
  never opened ([0043](0043-placeholder-guard.md)).
- **The tool descriptions and the server instructions are English-only string
  literals**, and so are the `ErrorData` messages the client receives. Whether
  what a model reads is bilingual like the user-facing messages
  ([0035](0035-cross-cutting-requirements.md)) was `[OPEN]` (memo §7);
  `[DECIDED 2026-10-21]` (0045.lang, option A): **English only** — a model
  reads it, a person does not, and the messages to the user stay bilingual
  ([0035](0035-cross-cutting-requirements.md) covers text for people, not for
  models). It is what the code does.
- **Dependency:** `rmcp` 3.4 with `default-features = false` and
  `features = ["server", "transport-io", "macros"]` — the server side, the
  stdio transport and the tool macros, with the whole HTTP, auth and client half
  left uncompiled — plus `tokio` (`rt`, `macros`, `io-std`), `serde` and
  `serde_json`. `verso-cli` is the only crate that depends on any of it, its
  tree resolves to 97 crates, and `cargo deny` is green on it. The async
  boundary is one crate deep: the tool handlers are `async fn` over synchronous
  `verso-core` calls.
- **One open workspace behind a mutex**, so two calls never interleave on the
  index and a second `index` waits for the first (memo §6.3).

## Discarded alternatives

None recorded.

## Status

`[OPEN]` for the contract and the server; **MCP decided on 2026-09-22** (above). MCP: closed. Contract: accepted as built
for Phase 2 on 2026-09-23, `[OPEN]` until a server enters scope. Server:
before it enters scope. Contract and server: answered on 2026-10-09 by
[0074](0074-accounts-and-access-on-the-server.md) item 11 and
[0073](0073-self-hosted-server-first.md), Accepted with them; the MCP over
the network `[OPEN]` there.
