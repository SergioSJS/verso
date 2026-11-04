# ADR 0111 — Online mode: a table from this app, through a tunnel

- Superseded by [0117](../0117-this-app-is-a-universo-server.md) (2026-11-03): not a second mode beside 0096 but a box inside one feature; every rule here is carried over there, read inside it. Never built. This file is not edited further.
- Date: 2026-10-23
- Source: the maintainer, 2026-10-23. Asked whether a person who turns their
  app into a server could run a table from it: *"se a pessoa habilita o
  aplicativo dela como servidor, ela conseguiria montar uma mesa em cima do
  aplicativo dela? Seria algo parecido com rodar o foundry na minha máquina
  local e compartilhar link com as pessoas ... Às vezes vale até a pena a
  gente simplificar o uso de túnel para poder ser possível compartilhar link
  assim."* (if a person turns their app into a server, could they set up a
  table on top of it? Like running Foundry on my own machine and sharing a
  link; sometimes it is worth simplifying the use of a tunnel so that sharing
  a link like that is possible). With a pasted spec (Cloudflare Quick Tunnel
  through `cloudflared tunnel --no-autoupdate --url http://127.0.0.1:<PORT>`,
  the URL read from its stderr, the server on `127.0.0.1` only, the child
  process killed on stop and on quit), he said: *"quando ela ativa, bota modo
  online, seria como se ela tivesse subindo o servidor, e ela vai gerar um
  link pelo Cloudflare Quick ... passa para os jogadores, os jogadores logam
  e tal e usam como se estivesse usando o universo"* (when she turns it on,
  "online mode", it would be as if she were starting the server, and it
  generates a Cloudflare Quick link; she passes it to the players, who sign
  in and use it as if it were the UniVerso). After the assistant's analysis:
  *"zero problemas o link mudar e tal. Inclusive até melhor assim, porque
  fica mais seguro ... A pessoa liga esse modo online quando ela quiser. E
  já que é um modo de desenvolvimento, depois a gente pode até, num segundo
  momento, implementar um modo oficial ... eu concordo de ter um método
  oficial depois e da gente testar desse modo agora"* (no problem with the
  link changing, even better, it is safer; she turns it on when she wants;
  as it is a development mode we can later implement an official one; I agree
  to have an official method later and to test this one now). Written by
  Sonnet 5.5 at the request of the session; to be read by the other model
  before it is accepted. Nothing is built.
- Related: [0096](0096-this-app-is-a-server.md) (this ADR is a second mode
  beside it; it changes items 2, 3 and 5 for that mode only),
  [0073](../0073-self-hosted-server-first.md) (item 6, TLS),
  [0074](../0074-accounts-and-access-on-the-server.md) (accounts),
  [0075](../0075-server-packaging-and-storage.md) (storage),
  [0081](../0081-sharing-between-people-on-one-universo.md) (invitations, shares),
  [0083](../0083-security-hardening-of-universo.md) (the security round),
  [0045](../0045-server-and-mcp-security.md) (`Host`, DNS rebinding),
  [0050](../0050-outbound-network-access.md) (outbound access),
  [0055](../0055-in-app-updater.md) (releases),
  [0029](../0029-guardrails-in-ci.md) (guardrails),
  [0005](../0005-license.md) (licences),
  [0107](../0107-the-table-a-shared-roll-and-chat-log.md) (the Table),
  [0110](../0110-a-table-is-a-campaign-folder.md) (a table is a campaign folder),
  [0058](../0058-demo-vault-as-tutorial.md) (the tutorial),
  [0035](../0035-cross-cutting-requirements.md) (languages, accessibility),
  [0069](../0069-windows-port.md) and
  [the cross-platform checklist](../../reference/cross-platform-checklist.md).
- Status in the briefing: not present.

## Context

**What exists.** The desktop app can already be a server on the local network
([0096](0096-this-app-is-a-server.md)): the same service as `verso serve`,
started from the host (`crates/verso-server/src/local`), listening only on
private addresses with its own certificate, no accounts but one implicit
local owner, phones paired by a QR code and a "Was it you?" approval, off
again at the next start, always visible (status mark, tray with "Stop" on
macOS and Windows). The web window runs in a phone's browser
([0076](../0076-the-window-on-every-screen.md)). The full UniVerso has accounts,
invitations, roles per folder, campaign folders and the Table
([0074](../0074-accounts-and-access-on-the-server.md),
[0081](../0081-sharing-between-people-on-one-universo.md),
[0110](../0110-a-table-is-a-campaign-folder.md),
[0107](../0107-the-table-a-shared-roll-and-chat-log.md)). Its rooms and sync use
WebSockets (the window's code uses `WebSocket`; the search found no
`EventSource` or `text/event-stream` in `crates` or `app/ui/src`; to confirm
in the build PR).

**What is missing.** 0096 serves the owner's own phones on the owner's own
network, with no other person. A game master whose players are in other
homes has two choices today: rent or run a UniVerso, or use a VPN such as
Tailscale (0073's documented path), which every player must install. The
maintainer wants the Foundry experience: one person turns a switch on their
laptop and sends a link. For that the laptop must be reachable from the
internet, which usually fails by itself: home routers sit behind carrier-grade
NAT (common in Brazil), so port forwarding or UPnP cannot be relied on.

**What a Cloudflare Quick Tunnel is, from Cloudflare's own page**
(<https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/>,
read 2026-10-23). `cloudflared` on the laptop makes an outbound connection to
Cloudflare, which gives a random `*.trycloudflare.com` hostname and relays
HTTPS to a local address. The page says: "You do not need a Cloudflare
account or domain."; "The hostname changes each time you create a Quick
Tunnel."; "Quick Tunnels are for testing and development."; "Quick Tunnels
have no uptime guarantee."; "Each Quick Tunnel supports up to 200 in-flight
requests. Additional requests return a `429` response."; "Quick Tunnels do
not support Server-Sent Events (SSE)." The page does not mention terms of
service, a request body size limit, or WebSockets; the maintainer's pasted
spec says WebSockets work, which this ADR has **not** verified (item 12).

**The attack surface this opens.** Larger than 0096's. A hostname on the open
internet, guessable by nobody but readable by anyone who is sent the link,
forwarded or leaked, reaches a server running on a person's personal laptop.
Anyone holding the link can try to sign in, flood, or attack the HTTP stack.
The defences exist (accounts, roles, the bounds of
[0083](../0083-security-hardening-of-universo.md)); what is new is who the
proxy is, where TLS ends, which origin the server believes it has, and a
third-party binary launched and kept running by the app.

## Decision

**Decided by the maintainer on 2026-10-23** (quoted above), three points:

- **D1. `[DECIDED 2026-10-23]` Build an online mode now on Cloudflare Quick
  Tunnels.** The link changing at each run is accepted, even preferred
  (*"zero problemas o link mudar ... fica mais seguro"*).
- **D2. `[DECIDED 2026-10-23]` It is on only when the person wants**
  (*"A pessoa liga esse modo online quando ela quiser"*).
- **D3. `[DECIDED 2026-10-23]` An official mode comes later**, as a second
  step (*"depois a gente pode ... implementar um modo oficial"*): which one is
  item 13.

Every item below was written as an `[OPEN]` with options and a
recommendation; on 2026-10-23 the maintainer decided item 1 in their own
words, item 13 as listed, and items 2 to 12 as recommended (*"Sim"*, asked
whether all the recommendations were accepted). Throughout, the recommendation is
the smallest surface that lets a group of players sign in from their own
homes. None of it changes an Accepted ADR; where one needs a line, the item
says so.

1. **`[DECIDED 2026-10-23]` What the online mode serves.**
   - (a) Only the folders the owner explicitly turns into tables
     ([0110](../0110-a-table-is-a-campaign-folder.md)) or shares; nothing by
     default.
   - (b) The full UniVerso model for any folder the owner ticks, like 0096
     item 2.
   - (c) Every open folder. (Not recommended.)
   - Recommendation: **(a)**. It is the smallest surface; the tunnel is for a
     table, not for the laptop's notes. Folders not made tables are not
     reachable by any id (the two locks of 0096 item 2's amendment apply).
   - **Decided by the maintainer on 2026-10-23, as on the UniVerso:** *"eu
     acho que a pasta servida seria o mesmo funcionamento do universo. É o
     que a pessoa compartilhar. Ele não vai compartilhar tudo, exceto se a
     pessoa quiser compartilhar tudo. É o que ela compartilhar que é o que
     vai ser servido."* The online mode serves what the person shares, by
     the UniVerso's own rules ([0074](../0074-accounts-and-access-on-the-server.md),
     [0110](../0110-a-table-is-a-campaign-folder.md)): a folder shared with an
     account, or made a table and joined by invitation, is reachable by
     that account at its role; nothing is shared by default; sharing every
     folder is the person's choice, never the app's. This is option (a)
     read as the UniVerso reads it — "shares" includes any folder shared,
     not only tables.

2. **`[DECIDED 2026-10-23]` Accounts and how a player gets in.**
   - (a) Accounts in the local server's database (the 0096 state directory,
     [0075](../0075-server-packaging-and-storage.md)); players invited by link
     ([0110](../0110-a-table-is-a-campaign-folder.md) item 2,
     [0081](../0081-sharing-between-people-on-one-universo.md)) and signing in
     with a password under
     [0074](../0074-accounts-and-access-on-the-server.md) and
     [0083](../0083-security-hardening-of-universo.md): the password list, the
     limits per address and per account, the refused-sign-in log line. The
     owner is the app's person, signed in implicitly on the desktop.
   - (b) A secret token in the URL, no accounts (the pasted spec's idea).
   - Recommendation: **(a)**. (b) is recorded as discarded below. The invite
     link is the only secret in a link, it is single-use, and it is not the
     session. Whether a player's e-mail is needed on a laptop with no mail
     server is a question for the build: the invitation of 0081 may need a
     sign-in that works without mail. Not decided here.

3. **`[DECIDED 2026-10-23]` Where it listens.**
   - (a) `127.0.0.1` on a random port, never a LAN or public address; the
     only way in is the tunnel. Independent of 0096's LAN mode (two
     switches; either, both or none).
   - (b) The online mode also listens on the LAN.
   - Recommendation: **(a)**, separate switches. This changes 0096 item 3
     (private ranges) for this mode only: loopback is narrower.

4. **`[DECIDED 2026-10-23]` TLS, the proxy and the origin.**
   - Facts: Cloudflare ends HTTPS; the hop from `cloudflared` to the server
     is plain HTTP on loopback, which
     [0073](../0073-self-hosted-server-first.md) item 6 allows ("except on
     loopback or behind a configured proxy"). This changes 0096 item 5 (its
     own certificate) for this mode only.
   - (a) The server learns its public origin at runtime from the captured
     `https://<name>.trycloudflare.com` and uses it for the `Secure`
     cookies, the `Origin` check, the invitation and share links; it checks
     the `Host` header against that one hostname (DNS rebinding,
     [0045](../0045-server-and-mcp-security.md)) and answers nothing else. The
     only trusted proxy is loopback ([0083](../0083-security-hardening-of-universo.md)
     item 5, `proxy.rs`), and the client address is read from
     `CF-Connecting-IP` or the `X-Forwarded-For` walk, so rate limits and the
     fail2ban line see the player, not `127.0.0.1`.
   - (b) A fixed list of allowed origins in a setting.
   - Recommendation: **(a)**. Which of `CF-Connecting-IP` and
     `X-Forwarded-For` Cloudflare sets for a Quick Tunnel is **unverified**
     (the page above is silent); the build must test it on a real tunnel
     before choosing, and a spoofed value must not move a limit.

5. **`[DECIDED 2026-10-23]` The `cloudflared` binary.**
   - (a) Download on first use a **pinned** version into the app's data
     directory, from `github.com/cloudflare/cloudflared/releases`, check its
     SHA-256 (the release page lists a checksum for each asset) against a
     value written in Verso's source, and only then run it. Never "latest",
     never `PATH` by default.
   - (b) Bundle it in the installers (about 35 MB more per platform; the
     size is not verified).
   - (c) Use one already on `PATH`.
   - Recommendation: **(a)**, with (c) only if the person points to a path in
     Settings. The pinned version moves with Verso's releases
     ([0055](../0055-in-app-updater.md)). Facts and unknowns:
     - Release 2026.10.3 (read 2026-10-23) lists, among others,
       `cloudflared-darwin-amd64.tgz`, `cloudflared-darwin-arm64.tgz`,
       `cloudflared-windows-amd64.exe`, `cloudflared-linux-amd64` and
       `cloudflared-linux-arm64`, each with a SHA-256.
     - Licence: the repository states Apache-2.0. `cargo-deny` covers Rust
       crates, not this binary; if (b) is chosen, the licence text and notice
       travel in the installer and in the app's licences screen; under (a)
       the download is the person's, but the notice is still shown on the
       online mode's screen. Apache-2.0 is on the `deny.toml` allowlist.
     - Signing: **unknown.** The release page says nothing about code signing
       or notarization. A file downloaded by the app with `fetch` or a Rust
       client does not carry the macOS quarantine attribute, so Gatekeeper
       normally does not prompt, but this is not verified here; on Apple
       silicon an unsigned executable may not run at all. Windows SmartScreen
       and Defender may prompt or block an unsigned `.exe`; no administrator
       rights are needed. Linux: `chmod +x`. All four to be tried on the real
       systems in the build.
     - Outbound use: downloading a binary is a new outbound use for
       [0050](../0050-outbound-network-access.md), which lists the allowed ones;
       this needs a line there (the person's switch, one host, a pinned
       file). The tunnel itself is a new outbound connection to Cloudflare.
     - Where the code lives: launching a subprocess is not covered by the
       `std::fs` list, but [0029](../0029-guardrails-in-ci.md) says a subprocess
       that does denied work is the same violation. `cloudflared` touches
       no file of the open folder; it receives a loopback URL. Recommended
       owner: the Tauri host (`app/src-tauri`), which already owns the tray
       and the local server's start; `verso-server` and `verso-service` stay
       free of process spawning. The download and the checksum write one file
       in the app's data directory, which is outside the open folder
       (configuration is outside the tree, [0011](../0011-config-outside-tree-index-as-cache.md))
       but is a disk write, so it goes through whichever module owns the
       configuration directory, never `verso-fs`. The exact crate is for the
       reader to confirm.

6. **`[DECIDED 2026-10-23]` Lifecycle and visibility.**
   - Recommendation: off by default and off again at the next start (like
     0096 item 1 (a), without the "keep on at start" switch); while on, always
     visible: a mark in the status bar, a tray or menu-bar entry with
     "Stop" (macOS and Windows, as 0096; Linux has no tray, so the status bar
     and Settings), the link with a copy button and a QR. It stops when the
     app quits (the child is killed; on Windows a Job Object so a crash does
     not leave an orphan; on Unix the child is also stopped if the parent
     dies, to be tested), when the person presses "Stop", and after a
     ceiling of **12 hours** (a number for the maintainer to confirm). If
     `cloudflared` exits by itself, the mode shows "offline" and does not
     restart silently; restarting gives a **new link**, and says so. What
     players see: their pages say the table is offline, in their language,
     and offer to retry.
   - Alternatives: no ceiling; a shorter idle limit; restart on failure.

7. **`[DECIDED 2026-10-23]` The limits of Quick Tunnels** (stated above, from Cloudflare):
   testing and development only, no uptime guarantee, a new hostname each
   run, 200 in-flight requests with `429` beyond, no SSE. For Verso: the
   rooms and sync use WebSockets (to confirm that a Quick Tunnel carries
   them, and for how long a connection lives); a table of a handful of
   players is far below 200 in-flight requests, but the build must measure
   the window's first load (many files at once) against the cap and ship the
   static files cached ([0092](../0092-the-phone-offline.md)); any upload body
   limit is unknown, so uploads of images and attachments must be tried
   through the tunnel. Terms-of-use risk: the service is offered for
   testing, and Cloudflare may change or end it; the official mode of item
   13 is the answer, and the screen says it is a testing mode.
   - Recommendation: build it, label it "testing mode" in Settings, and
     record the measured numbers in "As built".

8. **`[DECIDED 2026-10-23]` Security review for the build PR.** Recommendation: a
   checklist, not a design. Everything [0083](../0083-security-hardening-of-universo.md)
   lists applies to this server too (limits, pacing, bounds, the full set of
   headers, the audit log, the password list, the token revocation); the
   laptop's other folders are never reachable (item 1); the desktop-only
   commands (agents, terminal, reveal in the system, local paths, the
   updater, the web-embed proxy of
   [0056](../0056-embedded-web-pages.md)) are not served, on the model of the
   phones' allowlist of 0096 item 12, with a test that fails when a command
   is added without a verdict; logs hold no link of invitation, no cookie, no
   password. A test for each guardrail is seen failing before merge, as
   [0029](../0029-guardrails-in-ci.md) asks. Cross-platform work reads
   [the checklist](../../reference/cross-platform-checklist.md) and
   [0069](../0069-windows-port.md).

9. **`[DECIDED 2026-10-23]` Accessibility, languages and phones.** Recommendation: the
   served window is the existing web window; the online mode's screen, its
   messages and the "table offline" page are written in pt-BR and EN
   ([0035](../0035-cross-cutting-requirements.md)), keyboard-reachable, with the
   link, the QR and the state readable by a screen reader; players on a phone
   at 390x844 reach every panel and every hide has a way back.

10. **`[DECIDED 2026-10-23]` The tutorial** ([0058](../0058-demo-vault-as-tutorial.md)).
    Recommendation: when built, a demo-vault note "Mesa online" (and its pt-BR
    twin) with the real steps: turn it on, copy the link, invite, what players
    see, stop. Followed in the app before the PR.

11. **`[DECIDED 2026-10-23]` Coexistence with 0096's LAN mode and with the sync.**
    Recommendation: separate switches (item 3); a folder the laptop also syncs
    with a UniVerso keeps the rules of 0096 item 11 for both modes; the
    online mode never serves a folder made a table on a UniVerso that is
    someone else's.

12. **`[DECIDED 2026-10-23]` What is not verified.** WebSocket support through a Quick
    Tunnel (the pasted spec says yes, Cloudflare's page is silent), the
    client-address header, the upload limit, code signing of the binaries,
    the quarantine behaviour, the size of a bundled binary. Recommendation:
    a short spike (a script, no product code) before the build PR, with its
    results written in "As built".

13. **`[DECIDED 2026-10-23]` The later official mode** (for a future ADR; no
    recommendation beyond the order in which they look cheapest):
    - (a) A named Cloudflare Tunnel with the person's own Cloudflare account
      and domain (stable link, the person's terms).
    - (b) Tailscale Funnel.
    - (c) The UniVerso on a host (0073), which is the product's own answer.
    - Order of effort, as the assistant sees it: (c) exists, (a) and (b) are
      mostly configuration and documentation. Not decided which, or whether
      more than one.
    - **Decided by the maintainer on 2026-10-23** (*"perfeita a lista para
      modo oficial"*): these three are the candidates for the official mode;
      which one, or more than one, is for its own ADR.

## Consequences

- A game master can run a table from their laptop and share a link, without a
  host, a domain or an account at Cloudflare. The link changes at each run.
- The laptop faces the internet while the mode is on. The mitigations are the
  switch (D2), loopback-only listening, one served folder at most per table,
  accounts and 0083's limits; the residual risk is a bug in the HTTP stack
  reachable by anyone with the link.
- The app downloads and runs a third-party binary: pinned version, checksum,
  data directory. A new line in [0050](../0050-outbound-network-access.md) and
  one of notices in the licence screen.
- The app depends on a free testing service with no guarantee. When it
  changes, the mode stops working until the official mode exists.
- 0096's items 2, 3 and 5 stay as decided for the LAN mode; this ADR adds a
  second mode and changes nothing there.
- Cost: S for the process and the link, M for the origin and proxy handling,
  M for the account flow without a mail server, plus the spike. Phase 3,
  within the server's scope ([0073](../0073-self-hosted-server-first.md)).

## Discarded alternatives

Only alternatives actually considered in the session:

- **Port forwarding or UPnP.** Raised by the assistant: it fails behind
  carrier-grade NAT, common in Brazil, and exposes the laptop's address.
- **A token in the URL** (the pasted spec): leaks through screenshots,
  browser history, forwarding and link previews; replaced by accounts and a
  single-use invitation (item 2).
- **Downloading "latest"** (the pasted spec): an unpinned binary run on the
  person's machine with no check; replaced by a pinned version and a
  checksum (item 5).

## Status

**Accepted (2026-10-23).** Proposed the same day, written by Sonnet 5.5 at
the request of the session. D1, D2 and D3 are the maintainer's words of
2026-10-23; item 1 was decided in the maintainer's words, item 13 as
listed (*"perfeita a lista para modo oficial"*), and items 2 to 12 as
recommended (*"Sim"*). The reading by the other model is still owed and
goes with the build PR. Nothing is built; the first step is item 12's
spike.

Sources: Cloudflare, "Quick Tunnels" (link in Context); the `cloudflared`
repository and its release 2026.10.3 on GitHub, read 2026-10-23.
