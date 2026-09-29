# ADR 0056 — Embedded web pages: the proxy, its origin and the local network

- Date: 2026-09-29
- Source: the maintainer, in session, on 2026-09-29, on the reading of branch
  `fix/backlog-2-issues` ("ajustar pra aplicação ficar segura sem perder
  feature" — make the app safe without losing the feature; and "Registrar");
  [0050](0050-outbound-network-access.md) (the window's network paths);
  [0026](0026-core-ui-contract-inviolable-rules.md), rule 5
- Status in the briefing: not present

## Context

[0050](0050-outbound-network-access.md) enumerates four ways the window
reaches the network. A fifth arrived with 0.3.0-beta.1: a note may embed a web
page with an `<iframe>`, and the page is fetched on the host's side by a proxy
(`proxy_web_page`) and handed to the frame. The first version put the fetch
on the host; its reason was not recorded, and this ADR does not reopen it.

The proxy as 0.3.0-beta.1 shipped it was served from `verso://localhost` —
the same origin that serves the open folder's files — with
`Access-Control-Allow-Origin: *` and no content security policy on its
responses. An embedded page therefore ran in the files' origin, with nothing
in its response to stop it from requesting them. Its only defence was a
blocklist that refused private and local addresses. Commit `9185486`, to let a
note embed a server on the user's own network, deleted that blocklist and
inverted its regression test, which from then on asserted that
`192.168.x.x`, `localhost` and `127.0.0.1` are fetched: any note — one the
user did not write included — could make the app fetch any address on the
user's network and show the answer.

The maintainer's decision on 2026-09-29 was to keep embeds of local-network
pages and make them safe. This ADR is that decision, and it replaces both the
first proxy's design and the deletion of its blocklist.

## Decision

**Decided on 2026-09-29 by the maintainer**, in session:

1. **A note may embed a web page, a page on the user's own network
   included.**
2. **The app must stay safe while it does**: an embedded page gets nothing of
   the app's, and nothing on the local network is fetched without the user's
   say.

How the author built it under that decision (`app/src-tauri/src/lib.rs`,
`app/ui/src/sanitize.ts`):

- **An origin of its own.** The proxy is served from `verso://proxy`,
  deliberately apart from `verso://localhost`, which serves the folder's
  files. A proxy request to any other host is refused (403), and only the
  app's own views are answered. The frame is sandboxed
  (`allow-scripts allow-same-origin allow-forms allow-popups`): the same
  origin it is allowed is the proxy's, never the files'.
- **A policy on every response.** Every answer of the proxy, the error page
  included, carries `PROXY_CSP`:
  `default-src http: https: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-src http: https:`,
  and `X-Content-Type-Options: nosniff`. An embedded page can use the public
  web — its own scripts, styles and images — but no `verso:` or `tauri:`
  request resolves from inside it: it cannot read the folder's files, and it
  cannot re-enter the proxy.
- **The public web by default; the local network by approval.** Before
  fetching, the host judges the address (`is_allowed_proxy_url`,
  `is_non_public_ip`). Loopback, private (RFC 1918), link-local, carrier-grade
  NAT (`100.64.0.0/10`), unique-local IPv6, IPv4-mapped IPv6 forms of those,
  broadcast and unspecified addresses are refused, and so are the names
  `localhost`, `instance-data` and `metadata.google.internal`. A hostname is
  resolved and judged by every address it answers with, so a public-looking
  name that points at the router is refused too. The test
  `proxy_refuses_private_addresses_unless_approved` holds this.
- **Redirects are followed by hand**, at most five, each hop judged by the
  same policy as the first address: a public page cannot bounce the proxy
  into the local network.
- **The exception is an origin the user approved by hand.** When a note
  embeds a page whose host is local — by the name as written: the ranges
  above, `localhost`, and `.local` names — the window shows a box with the
  origin and asks; "Always allow" approves that origin
  (`scheme://host[:port]`). The window keeps the approved list with its
  settings and pushes it whole to the host through the `set_embed_origins`
  command; the host keeps its own copy and is the one that enforces. This is
  how an embed of the user's own server on the local network stays possible.
- **The remote-content setting of [0050](0050-outbound-network-access.md)
  applies.** Off, an embedded page is not fetched until the user clicks
  "Load", for that session.
- **The error page escapes its text.** The error can carry the note's
  address; `&`, `<` and `>` are escaped before it goes into the page, which
  otherwise would be an injection point of its own.

## Consequences

- The window's ways to the network are five, not four: this ADR revises the
  enumeration of [0050](0050-outbound-network-access.md). The fetch happens in
  the host, never in the core ([0026](0026-core-ui-contract-inviolable-rules.md)).
- An approval is for an origin and lasts: once allowed, every note that
  embeds a page of that origin loads it. No screen lists or withdraws an
  approval yet; the list lives in the window's settings.
- **A name is resolved twice**: once for the check, once by the fetch. A name
  that answers a public address to the first and a private one to the second
  (DNS rebinding) is not caught. Recorded as a known limit of this design.
- A public name that resolves to a private address is refused by the host,
  and the window, which judges by the name as written, does not offer to
  approve it: such a page shows the proxy's error page.
- An approved origin is trusted like the public web and no more: its page
  runs under the same policy and origin as any other embed and still cannot
  reach the folder's files.
- `'unsafe-inline'` and `'unsafe-eval'` are allowed inside the embed, so that
  ordinary pages work; they apply to the embedded page only, which is what
  the separate origin is for.

## Discarded alternatives

- **Refusing every private or local address**, as the first proxy did — set
  aside by the maintainer on 2026-09-29: it loses the feature ("sem perder
  feature").
- **Allowing every private or local address**, as commit `9185486` did — any
  note, including one the user did not write (a downloaded folder, a shared
  one, an agent's write), could make the app fetch from the user's router, a
  network drive or a development server and show the answer.
- **The proxy in the files' origin, `verso://localhost`**, as 0.3.0-beta.1
  shipped it — an embedded page could request the folder's files.

## Status

Accepted on 2026-09-29 by the maintainer, in session: points 1 and 2 of the
Decision. The mechanism under them is the author's, built under that decision
and labelled as such above.
