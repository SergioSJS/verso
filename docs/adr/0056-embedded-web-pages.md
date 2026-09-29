# ADR 0056 — Embedded web pages: the proxy, its origin and the local network

- Date: 2026-09-29
- Source: the maintainer, in session, on 2026-09-29, on the reading of branch
  `fix/backlog-2-issues` ("ajustar pra aplicação ficar segura sem perder
  feature" — make the app safe without losing the feature; and "Registrar");
  [0050](0050-outbound-network-access.md) (the window's network paths);
  [0026](0026-core-ui-contract-inviolable-rules.md), rule 5
- Status in the briefing: not present
- Revisions: 2026-09-29 — confirmed by the maintainer in session
  ("Ratifique o que precisar", answering the list of what was pending): the
  ADR stands Accepted as written. 2026-09-29 — **revised by the maintainer**
  the same day, in session: shown three options, A, B and C, he chose A, an
  allowlist by consent — an embedded page loads directly, in its own origin,
  and only from an origin the user approved. The proxy this ADR described is
  gone: WebKit never delivered a frame's request to it, and no document proxy
  can render a page built on module scripts. Recorded as a section of its own
  at the end of the Decision, with its Consequences, its discarded
  alternative and two `[OPEN]` items; the text of the first decision is kept,
  each superseded part with a note.

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

Points 1 and 2 stand. How they are kept was revised the same day: the
section "Revised: pages load directly", at the end of the Decision.

How the author built it under that decision (`app/src-tauri/src/lib.rs`,
`app/ui/src/sanitize.ts`) — *superseded on 2026-09-29, the same day, by the
revision below: no proxy remains. Of this list, the sandbox, the approval
per origin pushed through `set_embed_origins` and the remote-content setting
survive, changed; everything else was removed*:

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

### Revised: pages load directly — decided on 2026-09-29

**Why the proxy died**, in two steps, both found on 2026-09-29 while making
the design above work:

1. **WebKit never hands a frame's navigation to a custom scheme.** A frame
   whose `src` is `verso://proxy/…` is never requested of the host in
   WKWebView, the macOS web view: the origin the design above rests on could
   not receive a single request. The same held for the `verso://localhost`
   proxy of 0.3.0-beta.1 — embedded pages had not rendered in any build
   (commit `013489a`). For a few hours the proxy moved to a loopback HTTP
   listener on an ephemeral port, gated by a session token only the host and
   its web view knew, with the navigation guard letting exactly that
   address's `/__proxy` path through (commit `013489a`).
2. **A document proxy cannot render a page built on module scripts.** A
   `<script type="module">` is always fetched with CORS, against the origin
   of the document that asks for it. A proxied document's origin is the
   proxy's; the site's server answers for its own origin, and the browser
   refuses the scripts: a single-page application stayed blank. The proxy
   also did what the Context left unrecorded ("its reason was not
   recorded"): it answered with headers of its own (commit `2db4c73` passed
   on the site's `Content-Type` and nothing else of the site's), so a site's `X-Frame-Options` and `frame-ancestors`, which forbid
   embedding, never reached the frame; commit `3629f0c` names this as why
   the proxy existed. Dropping those headers needs the document to come from
   somewhere other than the site; loading the site's module scripts needs it
   to come from the site. **No proxy design serves both.**

**Decided on 2026-09-29 by the maintainer**, in session, shown three
options, A, B and C: option A, an allowlist by consent.

3. **An embedded page loads directly, in its own real origin, and only from
   an origin the user approved.** Points 1 and 2 above stand; this replaces
   how they are kept.

How the author built it under that decision (commit `3629f0c`;
`app/src-tauri/src/lib.rs`, `app/ui/src/sanitize.ts`, `app/ui/src/main.ts`):

- **The navigation guard is the wall on the host's side.** `may_navigate`
  lets an app view — the main window, a note's window — navigate its frames
  to the app's own URLs, the folder's file protocol and `about:blank`, and,
  through `is_approved_embed`, to an `http` or `https` address whose origin
  (`scheme://host[:port]`) the user approved; to nothing else on the web. The
  window keeps the list with its settings and pushes it whole through
  `set_embed_origins`, as before; the host keeps its own copy, and the guard
  reads it. The test `embeds_navigate_only_to_approved_origins` holds it:
  nothing on the web without approval; an approved origin, and exactly it —
  another port of the same host, another scheme or another site is refused.
- **The gate in the window asks for every origin, public sites included**
  (`gateOf`, `gated`). The first time a note embeds a page of an origin not
  on the list, the note shows a box with the origin, "Always allow" and
  "Cancel"; the frame waits inert inside the box, and nothing is fetched
  before the click. An address on the local network — judged by the name as
  written: loopback, the private ranges, link-local, carrier-grade NAT,
  `localhost`, `.local` names — gets a stronger wording than a public site
  ("Allow it only if you trust it").
- **The remote-content setting of [0050](0050-outbound-network-access.md)
  still applies**: off, an approved page is not loaded until the user clicks
  "Load", for that session.
- **The sandbox stays** `allow-scripts allow-same-origin allow-forms
  allow-popups`, with no `allow-top-navigation`: an embedded page cannot
  steer the window. The same origin it is allowed is now the site's own.
- **The browser's origin isolation is the wall between the page and the
  folder.** The page runs in its site's origin, never in the app's. `verso://`
  answers only the app's own views, refuses a note (403), and allows
  cross-origin reads to the app's origins only (`is_app_origin`): an embedded
  page cannot read the folder's files.
- **A web note embedded** (`![[nota-web]]`, a note with a `url` property)
  renders as its page, through the same gate.
- **"Sites allowed in notes"**, in the settings, lists every approved origin
  with a remove button; a removed origin is asked about again at its next
  embed.
- **Removed with the proxy**: the loopback listener and its token; the fetch
  on the host's side (`proxy_web_page`); the address policy against
  server-side request forgery (`is_allowed_proxy_url`, `is_non_public_ip`,
  the redirects followed by hand, the test
  `proxy_refuses_private_addresses_unless_approved`), since no fetch on the
  host's side remains for it to protect; `PROXY_CSP`; the error page; and the
  `embed_proxy_base` command.

## Consequences

- The window's ways to the network are five, not four: this ADR revises the
  enumeration of [0050](0050-outbound-network-access.md). The fetch happens in
  the host, never in the core ([0026](0026-core-ui-contract-inviolable-rules.md)).
  *(Revised on 2026-09-29: still five ways, but the fifth is now the web
  view's own frame; nothing is fetched on the host's side.)*
- An approval is for an origin and lasts: once allowed, every note that
  embeds a page of that origin loads it. No screen lists or withdraws an
  approval yet; the list lives in the window's settings. *(Revised on
  2026-09-29: "Sites allowed in notes" lists and removes them.)*
- **A name is resolved twice**: once for the check, once by the fetch. A name
  that answers a public address to the first and a private one to the second
  (DNS rebinding) is not caught. Recorded as a known limit of this design.
  *(Gone on 2026-09-29 with the fetch on the host's side.)*
- A public name that resolves to a private address is refused by the host,
  and the window, which judges by the name as written, does not offer to
  approve it: such a page shows the proxy's error page. *(Revised on
  2026-09-29: the next list.)*
- An approved origin is trusted like the public web and no more: its page
  runs under the same policy and origin as any other embed and still cannot
  reach the folder's files.
- `'unsafe-inline'` and `'unsafe-eval'` are allowed inside the embed, so that
  ordinary pages work; they apply to the embedded page only, which is what
  the separate origin is for. *(Gone on 2026-09-29 with `PROXY_CSP`: the
  page runs under its own site's policy.)*

**After the revision of 2026-09-29:**

- **A site that forbids embedding shows an empty frame.**
  `X-Frame-Options: DENY` or `SAMEORIGIN`, or a `frame-ancestors` directive
  that does not name the app, is the site's decision, and Obsidian shows the
  same. Observed on 2026-09-29: `rolai.app` sends `X-Frame-Options: DENY`;
  `olddragon.com.br` sends `frame-ancestors 'self' *.owlbear.rodeo`.
- **`[OPEN]` — a warning at approval time.** When the user approves an
  origin, the host could send a `HEAD` to the address and warn when the site
  forbids embedding, so that nobody approves an empty frame. A possible
  nicety, not decided; it would bring back one request from the host's side.
- **The first embed of every site costs a click**, public sites included,
  and an approval lasts until it is removed in the settings.
- **The host no longer judges addresses.** The local-network check in the
  window chooses the wording and nothing else: a public-looking name that
  points at a local address is shown with the public wording and, approved,
  loads. An approved page has what a web page in a browser has — its own
  origin, its own requests — and nothing of the app's.
- **The guard judges every navigation of a frame**, the embedded page's own
  included. It follows from its rule, and was not observed in the app: a page
  that redirects to another origin (`example.com` to `www.example.com`,
  `http` to `https`), or that frames a third site, loads only as far as the
  approved origins reach.
- **`[OPEN]` — the web view's cache after an update.** Found on the way, not
  about embeds: after an app update, WKWebView serves the previous version's
  cached UI until its caches are cleared; hit twice on 2026-09-29. It needs
  a decision of its own.

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

Set aside on 2026-09-29, with the revision:

- **The proxy in an origin of its own, `verso://proxy`** — the design first
  decided above; WebKit never delivered a frame's request to it.
- **The proxy over a loopback listener**, commit `013489a` — built and
  replaced within hours: a page built on module scripts stays blank behind
  any document proxy, and the listener was a second HTTP stack on the user's
  machine.
- **Option B: the open web, as Obsidian does it** — the guard would allow
  any `http(s)` frame in an app view, with no question asked. Smoother, and
  a weaker posture: any note embeds any site without consent.
- **Option C: keep the proxy** — server-rendered pages worked and every
  module-script page stayed blank; rejected with the proxy itself.

## Status

Accepted on 2026-09-29 by the maintainer, in session: points 1 and 2 of the
Decision. The mechanism under them is the author's, built under that decision
and labelled as such above. Confirmed on 2026-09-29 by the maintainer: the
ADR stands Accepted. Revised on 2026-09-29 by the maintainer, in session:
point 3, option A, Accepted; the mechanism under it is the author's, and
supersedes the proxy. Two items stay `[OPEN]`: a warning at approval time,
and the web view's cache after an update.
