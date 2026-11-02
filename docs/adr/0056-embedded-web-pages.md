# ADR 0056 — Embedded web pages: the proxy, its origin and the local network

- Date: 2026-09-29
- Source: the maintainer, in session, on 2026-09-29, on the reading of branch
  `fix/backlog-2-issues` ("ajustar pra aplicação ficar segura sem perder
  feature" — make the app safe without losing the feature; and "Registrar");
  [0050](0050-outbound-network-access.md) (the window's network paths);
  [0026](0026-core-ui-contract-inviolable-rules.md), rule 5
- Status in the briefing: not present
- Revisions: 2026-10-21 — two `[OPEN]` items answered by the maintainer's marks
  in the decisions questionnaire of 2026-10-20 (answered 2026-10-21): the
  warning at approval time (0056.aviso, option B, not the recommended A) and a
  page's own links and frames (0056.links, option A). A web page embedded as
  a card on a board is allowed, reusing this ADR ([0057](0057-board-json-canvas.md),
  decided the same day).
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
  each superseded part with a note. 2026-10-14 — **revised by the maintainer**
  in session ("A agora, B depois"): an embed is an `<iframe>` when its site
  allows being framed, the child web view otherwise. 2026-10-15 — **revised
  again** by the maintainer, in session (*"A e B juntos"*): the child web
  view is drawn as a frame is — laid out at its box's whole size and place,
  drawn only in the part that shows — by a native clipping container per
  operating system, under the one exception to `unsafe_code = "forbid"` of
  [0029](0029-guardrails-in-ci.md). Recorded as the last two sections of the
  Decision, "Revised: an `<iframe>` when the site allows" and "Revised again:
  the page clipped as a frame is".

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
blocklist that refused private and local addresses. Commit `42edbe0`, to let a
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
   (commit `05b9563`). For a few hours the proxy moved to a loopback HTTP
   listener on an ephemeral port, gated by a session token only the host and
   its web view knew, with the navigation guard letting exactly that
   address's `/__proxy` path through (commit `05b9563`).
2. **A document proxy cannot render a page built on module scripts.** A
   `<script type="module">` is always fetched with CORS, against the origin
   of the document that asks for it. A proxied document's origin is the
   proxy's; the site's server answers for its own origin, and the browser
   refuses the scripts: a single-page application stayed blank. The proxy
   also did what the Context left unrecorded ("its reason was not
   recorded"): it answered with headers of its own (commit `ac18e1d` passed
   on the site's `Content-Type` and nothing else of the site's), so a site's `X-Frame-Options` and `frame-ancestors`, which forbid
   embedding, never reached the frame; commit `675c89e` names this as why
   the proxy existed. Dropping those headers needs the document to come from
   somewhere other than the site; loading the site's module scripts needs it
   to come from the site. **No proxy design serves both.**

**Decided on 2026-09-29 by the maintainer**, in session, shown three
options, A, B and C: option A, an allowlist by consent.

3. **An embedded page loads directly, in its own real origin, and only from
   an origin the user approved.** Points 1 and 2 above stand; this replaces
   how they are kept.

How the author built it under that decision (commit `675c89e`;
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
- **A warning at approval time.** When the user approves an origin, the host
  sends a `HEAD` to the address and warns when the site forbids embedding, so
  that nobody approves an empty frame. It brings back one request from the
  host's side (the frameability check below already does it, once per
  origin). `[DECIDED 2026-10-21]` (0056.aviso, **option B**, not the
  recommended A): **warn at the moment of approval.** To build.
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
- **Decided on 2026-10-07 — the web view's cache after an update.** Found on
  the way, not about embeds: after an app update, WKWebView served the
  previous version's cached UI until its caches were cleared; hit twice on
  2026-09-29. The maintainer, asked, chose the version in the files'
  addresses: the build writes the page loading `main.js?v=<version>` and
  each of its stylesheets so (`app/ui/build-index.mjs`), and what the window
  asks for by a fixed name — the PDF worker, Excalidraw's stylesheet —
  carries the same stamp (`app/ui/src/version.ts`); the bundler's chunks
  already carry a hash in their names. A new version never reuses the
  previous one's cached files, and nothing is deleted. Not chosen: clearing
  the web view's cache when the version changes.

## Discarded alternatives

- **Refusing every private or local address**, as the first proxy did — set
  aside by the maintainer on 2026-09-29: it loses the feature ("sem perder
  feature").
- **Allowing every private or local address**, as commit `42edbe0` did — any
  note, including one the user did not write (a downloaded folder, a shared
  one, an agent's write), could make the app fetch from the user's router, a
  network drive or a development server and show the answer.
- **The proxy in the files' origin, `verso://localhost`**, as 0.3.0-beta.1
  shipped it — an embedded page could request the folder's files.

Set aside on 2026-09-29, with the revision:

- **The proxy in an origin of its own, `verso://proxy`** — the design first
  decided above; WebKit never delivered a frame's request to it.
- **The proxy over a loopback listener**, commit `05b9563` — built and
  replaced within hours: a page built on module scripts stays blank behind
  any document proxy, and the listener was a second HTTP stack on the user's
  machine.
- **Option B: the open web, as Obsidian does it** — the guard would allow
  any `http(s)` frame in an app view, with no question asked. Smoother, and
  a weaker posture: any note embeds any site without consent.
- **Option C: keep the proxy** — server-rendered pages worked and every
  module-script page stayed blank; rejected with the proxy itself.

### Revised again, hours later: the child web view — decided on 2026-09-29

The direct iframe met the last wall: a site that sends `X-Frame-Options`
or `frame-ancestors` (huggingface.co, rolai.app) refuses every frame, in
any application. The page's real place was in the app all along: the
**child web view** (`web_open`), a top-level view those headers do not
bind — the same machinery that has always shown a web note's page. An
approved embed's box (`.embed-web[data-embed-web]`) gets a child view
overlaid on it, clipped to the pane it scrolls in, following it frame by
frame (`tickEmbedViews`, the pattern of the web note's `tickWeb`), hidden
with the overlays, closed when the box leaves the DOM.

With that, the app view itself never navigates to the web at all, and
the navigation guard went back to fully closed — stronger than option A
as first built (`app_views_never_navigate_to_the_web_even_approved`).
The gate and the settings list are unchanged: the child view is only
made for an origin the user approved. Verified on 2026-09-29 with
huggingface.co and rolai.app rendering whole, X-Frame-Options and all.

### Revised: an `<iframe>` when the site allows, the child view when it does not — decided on 2026-10-14

**Decided on 2026-10-14 by the maintainer**, in session, after testing the
child web view in the installed app ("A agora, B depois"): the child view
floats over the window, so an embed half out of its pane could be drawn
over the status bar, the page scrolled with the note's wheel, and its size
was not the box's. His requirement: an embed behaves like a normal
`<iframe>` — the page respects the size of the box it is rendered in,
scrolls with the note, is clipped by the pane, never draws over other
chrome, and scrolling the note never scrolls the page inside.

- **A.** (this revision) An embed is a real `<iframe>` in the note's
  document whenever its site allows being framed by the window's origin;
  a site that refuses keeps the child web view (the fallback), clipped as
  the next section says. A web page opened as a tab (the
  web note's own view) stays a child web view: it fills its pane.
- **B.** (decided on 2026-10-15, *"A e B juntos"*; built in the next
  section) A native clipping container for the fallback, under the exception
  to `unsafe_code = "forbid"` that [0029](0029-guardrails-in-ci.md) records.

How the author built A (`app/src-tauri/src/framing.rs`, `web.rs`,
`app/ui/src/leaves/web.ts`):

- **A frameability check in the host**, `embed_frameable(url)`: one `HEAD`
  (a `GET` read only as far as its headers when `HEAD` errors or answers 4xx
  or 5xx), to an address a note wrote and the reader approved
  ([0050](0050-outbound-network-access.md) item 1), six seconds at most, at
  most five redirects followed by hand, the final response judged. The
  response may be framed unless: any `X-Frame-Options` value is present
  (`DENY`, `SAMEORIGIN`, `ALLOW-FROM`, in any case, or one nobody can read);
  or a `Content-Security-Policy` has a `frame-ancestors` that does not allow
  the window's origin (`*` only for a network-scheme origin, so not
  `tauri://localhost`; a matching scheme, host, wildcard host and port; not
  `'none'`, `'self'` or an empty list); every policy of the response must
  allow. A redirect from a public page to a local name or address, a
  timeout, an error: not frameable. Answered once per origin for the
  session. This is a request from the host's side that the revision of
  2026-09-29 had removed ("nothing is fetched on the host's side"): one
  request per approved origin, headers only, and the answer is one bit that
  crosses to the window. It is the "warning at approval time" the `[OPEN]`
  item above left open, used for a different end.
- **The embed.** Frameable: the box holds `<iframe sandbox="allow-scripts
  allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
  referrerpolicy="no-referrer" loading="lazy">`, no `allow`, 100 % of the
  box. Not frameable, or the answer an error: the child web view of the
  revision above. The browser window keeps its own frame with the link to
  open the page in a tab ([0076](0076-the-window-on-every-screen.md), item 11 as the code cites it).
- **The window's policy** already had `frame-src https: http: verso:
  http://verso.localhost` for the child view's days; it is unchanged. The
  server's policy for the browser window is unchanged too
  (`frame-src 'self' https:`).
- **The navigation guard** changes by one allowance: an app view's frame may
  load the exact origins the check judged frameable (and where their
  redirects end) and no other page of the web. wry hands the guard an
  address and no frame, so it cannot tell a frame from the window; the
  allowance is as narrow as the handler lets it be. The cost is recorded in
  the threat model (`docs/reference/threat-model.md`, "A web page embedded
  in a note"), with the reasoning that a framed page cannot reach the app's
  commands.
- **A page's own links to another origin, and the frames inside it** (a
  video, an advertisement), are refused by the guard and stay blank (its
  cost is the same one: the guard cannot tell a frame from the window).
  `[DECIDED 2026-10-21]` (0056.links, option A): **keep them blocked and show
  that something was blocked**, without opening a security gap. Allowing a
  frame after approving its origin would need a new guard and no concrete
  request exists.

Discarded in this revision: none recorded.

### Revised again: the page clipped as a frame is — decided on 2026-10-15

The child web view kept one fault an iframe does not have. A native view
floats over the window's page, and CSS cannot clip it; so the view was
shrunk to the visible part of its box, and when the note was scrolled
until the box was half above its pane, the page showed its top again in a
shorter view, instead of moving up with the note. The maintainer, trying
it in the app on 2026-10-15: *"era para funcionar como iframe normal…
qual a dificuldade de fazer a página respeitar o tamanho da janela que
ela foi renderizada"* (it should work as a normal iframe; what is hard
about making the page respect the size of the window it was rendered
in). His own sites all refuse to be framed, measured that day —
olddragon.com.br (`X-Frame-Options: SAMEORIGIN`; `frame-ancestors 'self'
*.owlbear.rodeo`), rolai.app (`DENY`), a Calibre-Web on the local network
(`SAMEORIGIN`) — so they stay child web views.

**Decided by the maintainer on 2026-10-15**, in session: *"A e B
juntos"*. A: a real `<iframe>` where a site allows framing, recorded in the
section above. B: for the pages that stay child
web views, a native clipping container, under an exception to
`unsafe_code = "forbid"` confined to one module, one small file per
system, each `unsafe` block with its `SAFETY` comment, tested, in its own
pull request ([0029](0029-guardrails-in-ci.md), revision of the same
day).

**B, as built** (`app/src-tauri/src/web_clip/`):

- The window sends two rectangles (`WebPlace`): the **slot**, the box's
  whole size and true place, which may reach outside the pane and the
  window; and the **visible** part, where the box shows — inside every
  scroller, the window, and clear of the tab bar and the status bar
  (`embedPlace`, `app/ui/src/leaves/embedClip.ts`). The scroll fields of
  the first place are gone: nothing the window sends scrolls the page.
- The host puts the page's view inside a container whose frame is the
  visible part, at the slot's offset inside it, with the slot's size: the
  page is laid out for the whole box (its `100vh` is the box's height),
  moves up with the note, and is drawn only inside the container. The
  note's scroll never scrolls the page; the page's own scroll and clicks
  work in the part that shows.
- macOS: a layer-backed `NSView` that clips to its bounds, in the
  window's content view just above where wry put the page, the page's
  `WKWebView` moved into it; AppKit's unflipped coordinates and the
  screen's scale handled (`geometry.rs`, `macos.rs`). Windows: WebView2's
  host window moved into a child window of ours
  (`WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS`) at the visible part, in
  the window's physical pixels (`windows.rs`). Linux: GTK's safe API —
  the window's page moved once into a `GtkOverlay`, each page in a
  `GtkLayout` laid over it at the visible part, no `unsafe`
  (`linux.rs`).
- A web note's own view goes the same way, with one rectangle for both.
- If a platform cannot build the container, that view falls back to the
  place before this revision — cut to the visible part, the page's top
  shown — with one WARN line in the log.
- A window moved to a screen of another scale keeps its CSS size; the
  window looks again when the scale changes, so the page is placed in the
  new screen's pixels.

What only the real app shows — the clipping on each system — is listed in
`docs/reference/manual-checks.md`; no test without a window reaches a
native view. Linux had not been seen with child web views at all
([0071](0071-linux-port.md)); its container is built and compiled, and
waits for that check like the rest.

## Status

Accepted on 2026-09-29 by the maintainer, in session: points 1 and 2 of the
Decision. The mechanism under them is the author's, built under that decision
and labelled as such above. Confirmed on 2026-09-29 by the maintainer: the
ADR stands Accepted. Revised on 2026-09-29 by the maintainer, in session:
point 3, option A, Accepted; the mechanism under it is the author's, and
supersedes the proxy. The one item left `[OPEN]` then, a warning at approval time, was decided on
2026-10-21 (above);
the web view's cache after an update was decided on 2026-10-07 (above).
Revised on 2026-10-14 by the maintainer, in session ("A agora, B depois"):
embeds are `<iframe>`s when the site allows framing, child web views
otherwise. Revised again on 2026-10-15, in session (*"A e B juntos"*): the
child web view is drawn as a frame is, by a native clipping container
(B); the mechanism is the author's.
Revised on 2026-10-15, in session, accepted as recommended: the host's frameability check (one `HEAD`, or a `GET` read only as far as its headers, once per origin) is **accepted**, which revises the earlier line that "nothing is fetched on the host's side" for an approved origin; a page's own links to another origin and the frames nested inside a framed page stay `[OPEN]`, as recorded above.
Decided on 2026-10-21 by the maintainer (D.3 of the decisions list, option A): when the frameability check of a site fails (network down, timed out), the app asks again after **30 seconds**, instead of remembering the failure until the window closes.

### Amendment (2026-11-01): the pages have an engine profile of their own

Decided by the maintainer, in chat, for Share audio (ADR 0116, amendment of
the same day): *"B: um ambiente só p/ páginas"*. The embedded pages that are
child web views (`web_open`) no longer run in the window's own web engine
environment. They run in **one shared "pages" environment**, apart from the
window's:

- Windows: a WebView2 user-data folder of its own, `pages-profile` under the
  app's local data directory, so WebView2 starts a second environment with its
  own browser process and audio service. Linux: the same folder as a second
  web context. macOS 14 and later: a named website data store (a fixed
  identifier); before macOS 14 the system has none to give and the pages keep
  the window's.
- What it buys: the sound of the window itself (the dice, the chimes, the
  table's music) plays in a process the pages do not share, so a share of the
  pages' sound can never carry it.
- What it costs, and what stays: all pages share the one profile, so a login
  made in one page holds in the others, as before. **The cookies and logins
  of pages made before this change are not carried over** (they lived in the
  window's profile): a person signs in again once. Memory: a second set of
  engine processes while a page is open.
- Not changed: iframes (pages that allow framing) stay inside the note, in the
  window's environment; they cannot be captured apart from the window's sounds,
  so Share audio asks for a page opened as a page.
