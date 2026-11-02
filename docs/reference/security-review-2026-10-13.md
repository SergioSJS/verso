# Security review of UniVerso (2026-10-13)

- Date: 2026-10-13
- Why: the maintainer asked, on 2026-10-13, for a security analysis of
  UniVerso — *"a aplicação deve ser resistente a ataques hackers, nos
  proteger de acessos a bots e etc."* — and for an ADR that turns it into
  work, [ADR 0083](../adr/0083-security-hardening-of-universo.md).
  [ADR 0073](../adr/0073-self-hosted-server-first.md) item 6 asks for
  security "in full" before the first user who is not the maintainer.
- Written by Fable 5.1 at the maintainer's request, a swap of the roles of
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) (documents are
  Opus's); read by Opus 5.5 on 2026-10-13 (ADR 0083, Status). It decides
  nothing: each finding carries a severity as a recommendation, and what
  needs the maintainer is `[OPEN]` in the ADR. The findings table's last
  column, added on 2026-10-13, says what closed each.
- Against HEAD d0d280e of `feat/universo`. Read for this review:
  `crates/verso-server/src` (`http.rs`, `auth.rs`, `api.rs`, `device.rs`,
  `passkeys.rs`, `limit.rs`, `listen.rs`, `fair.rs`, `tls.rs`, `rpc.rs`,
  `crypto.rs`, `db.rs`, `config.rs`, `update.rs`, `mail.rs`, `log.rs`,
  `files.rs`, `console.rs`, `collab.rs`, `collab_board.rs`, `scope.rs`,
  `share_links.rs`, `lib.rs`), `crates/verso-service/src/files.rs`,
  `crates/verso-fs/src/lib.rs` and `server.rs`, `app/ui/src/sanitize.ts`,
  `app/ui/src/web/pages.ts`, `app/ui/src/screen/framed.ts`,
  `app/ui/src/pdf.ts`, `app/ui/src/mermaid.ts`, `packaging/server/*`,
  `.github/workflows/*.yml`, `deny.toml`, the threat model
  (`threat-model.md`, refreshed 2026-10-11) and ADRs 0045, 0073 to 0082.
- How it was verified: by reading, and by running `verso serve --web` on a
  loopback port of this Mac with a scratch data directory and probing it
  with `curl`, `nc` and a Python socket (section 8). Nothing graphical was
  run; nothing but that server was probed.

The threat model of 2026-10-11 is the baseline: it lists what is built and
closed 15 of its 17 gaps. This review does not repeat its rows; it reads
the code once more with the maintainer's question in hand — bots, abuse
and attacks from outside — and says what is in place, what is missing, and
how bad the gap is for a release to a first user who is not the
maintainer, by [ADR 0033](../adr/0033-pr-workflow.md)'s levels: BLOCKING
(an invariant, a guardrail, a decision, or data), IMPORTANT (resolved or
deferred with a record), MINOR (the author's discretion).

## 1. Summary

**In place, and verified on the running server:** `Host` checked before
every route (421 otherwise); `Origin` on every request that changes
something, on sign-in itself (login CSRF) and on the WebSocket before the
cookie is accepted; a CSRF token per session; the cookie `HttpOnly`,
`SameSite=Lax`, `Secure` and `__Host-` over HTTPS; Argon2id at OWASP's
first parameters, on the blocking pool, with the same time spent on an
unknown address; a growing delay by address and by account on sign-ins,
links, device codes, passkeys and mail; the body of the API 1 MB at most
(413 past it); the connection, header and request deadlines; the
WebSocket's bounds; folder files under `Content-Security-Policy: sandbox`
and `nosniff`; the window's own policy as a header; path confinement with
symlinks kept inside a folder; the database `0600`; the systemd unit
sandboxed; the container as uid 1000; releases signed with minisign and
the installer verifying them; GitHub Actions pinned by commit; `cargo
deny` for advisories and licenses.

**Findings by severity.** None is BLOCKING: no invariant, guardrail or
accepted decision is violated and no finding loses data. The IMPORTANT
ones are what stands between this HEAD and the "security in full" of ADR
0073 item 6:

| # | Finding | Severity | Where | Closed by (ADR 0083, 2026-10-13) |
|---|---|---|---|---|
| F1 | A failed sign-in writes no line to the server's log: only the audit table. fail2ban and CrowdSec see nothing; a brute force is invisible to the host until the audit page is read | IMPORTANT | `api.rs:149-157`; probed: 12 failures, the log empty | item 1: 6d17997 |
| F2 | No ceiling on sign-in attempts beyond the per-key delay: at 60 s a key, an account takes ~1 440 guesses a day for ever, from one address or many, and nobody is told | IMPORTANT | `limit.rs:69-73,101`, `api.rs:124-126` | item 2: 6cc3d50, 206b0f6 |
| F3 | A password is checked for length only (12): a common one of 12 characters passes; no deny list, no notice at sign-in | IMPORTANT | `api.rs:70-78`, `config.rs:128` | item 3: f115cfd |
| F4 | A password reset or change ends the sessions and leaves the personal access tokens: an attacker's token survives the person's recovery | IMPORTANT | `api.rs:413-416`, `api.rs:484-487`; the admin's `end_all_of` does revoke (`admin.rs:171`) | item 4: cdee448 |
| F5 | One trusted proxy address: behind Cloudflare, or any proxy with several addresses, forwarded headers cannot be believed, and every per-address limit then keys the proxy's address — one stranger's three failures slow everyone's sign-in | IMPORTANT | `config.rs:171-176`, `auth.rs:99-116` | item 5: fb18410 |
| F6 | The server's own inputs are not fuzzed: the WebSocket's JSON requests, the Yjs updates, the sync frames and the presence states; only the dialect and the canvas reader are | IMPORTANT | `.github/workflows/ci.yml:236-261`; `collab.rs:460`, `rpc.rs:322-331` | item 14: 462b09b and 5e085ab (the merges): c0b9924 (`Host`), a83739f (yrs's panics caught), 5d20971, d7230cb, acaae0d, 755f830 (counts, depth, runs of no length), 12ba832, acf932f (the room's own client), 1e0d357 (what a window is sent), 947814c, 6c4327e, d140c24 (the order), af0ab30 (`config::size`), 34c6526 (`-O`) |
| F7 | The npm dependencies are checked for licenses, never for advisories; the renderers (PDF.js, Mermaid, KaTeX, Excalidraw, Yjs) have had XSS and prototype-pollution advisories | IMPORTANT | `ci.yml:80-81,142-144`; no `npm audit` anywhere | item 13: 5225d6c, a34d9be, f9244b1 |
| F8 | No way to report a vulnerability: no `SECURITY.md`, no `/.well-known/security.txt`, no stated disclosure policy or response time | IMPORTANT | repository root; `http.rs:266-418` (no route) | item 15: f97676a, 1acf805 |
| F9 | The external review ADR 0073 item 6 asks for is still open (threat model gap 10); the sanitizer's review by the model that did not write it too | IMPORTANT | `threat-model.md`, gaps 10 and the first `[OPEN]` | item 16: the sanitizer read by Fable 5.1 on 2026-10-13 and its suite run in WebKit and Chromium (4b8a04c, 95b7a22; f6ae4eb); the pentest pending, a condition of the announcement |
| F10 | A backup is a plain tarball with the notes, the database and the env file (a password inside, maybe); the guide says to copy it off the machine, in the clear | IMPORTANT | `packaging/server/universo.sh:819-879` | item 12: 4167794 |
| F11 | A mailbox can be flooded with sign-in and reset mails: the delay keys the sender's address, never the address mailed to | MINOR | `api.rs:650-654,761-764` (threat model gap 7, remainder) | item 8: ecd5fab |
| F12 | hyper's header buffer is its default (~400 KiB): a 200 KB header line was accepted; 512 connections × 400 KiB is the 1 GB host's fifth | MINOR | `listen.rs:264-267`; probed | item 8: ecd5fab |
| F13 | A note room takes a Yjs update of up to 48 MB (the message limit); the board room caps one at 4 MB | MINOR | `rpc.rs:40`, `collab_board.rs:49`; `collab.rs:460` | item 8: ecd5fab |
| F14 | The REST routes have no rate beyond the sign-in family: a signed-out flood of `/api/state` or the page is bounded by connections alone | MINOR | `http.rs:266-418`; `fair.rs` covers the WebSocket only | item 7: 64f2021, b3a4499, 6f08815 |
| F15 | Sensitive actions need no fresh proof: a token is created, a passkey added, an account deleted by the admin, with a 14-day-old cookie | MINOR | `api.rs:548-585`, `passkeys.rs:79`, `admin.rs:118` | item 6: 068e63b, 8a9c842 |
| F16 | `HSTS` without `includeSubDomains`; `Permissions-Policy` names four features; `style-src 'unsafe-inline'`, `img-src https:`, `frame-src https:` in the page's policy | MINOR | `http.rs:446-454,482-486,512` | item 9: 258be36 |
| F17 | The device's poll endpoint has no delay of its own; the approval page takes the code from the link, so a link in a mail still reaches an *Approve* button (gap 12 made it say who asked) | MINOR | `device.rs:193-231`, `device.rs:159-183` | item 8: ecd5fab (the poll's delay); item 17: 9248705 (the typed code) |
| F18 | The compose file and the Docker guide put the first admin's password in `environment:`, readable with `docker inspect`; the `_FILE` form exists and is not the example | MINOR | `docker-compose.yml:52-57`, `config.rs:110-125` | item 11: c43e578 |
| F19 | The container is not declared read-only and keeps its capabilities in the compose file; the unit could add `ProtectProc`, `SystemCallFilter` | MINOR | `docker-compose.yml:25-59`, `universo.service:33-61` | item 11: c43e578 |
| F20 | A folder is created with the process's umask (`0755` seen): on a host with other local users and a folders directory they can enter, the notes are readable; the package's `0750` directory keeps them | MINOR | probed; `postinstall.sh:22-24` | item 11: c43e578 |
| F21 | A member writes 60 lines of 2 000 characters a minute to the server's log; the audit table grows without retention | MINOR | `rpc.rs:46,592-610`, `db.rs:1417` | item 10: 69ba0ca (the audit table's retention); the log's volume closed on 2026-10-13 by the commit that adds the compose file's `logging:` (rotation left to the host's tools — journald for the package, Docker's `json-file` limits for the compose file — and documented in the install guide; the 60 lines a minute a window may write unchanged; ADR 0083, As built) |
| F22 | PDF.js is opened with `isEvalSupported` at its default (true); the page's policy has no `unsafe-eval`, so the font compiler is blocked by the browser, not by the code | MINOR | `app/ui/src/pdf.ts:246,443` | void: pdfjs-dist 6.3.289 has no `isEvalSupported` and no eval; guardrail test, item 8: 724aeb0 |
| F23 | The update check follows redirects (reqwest's default): a feed that redirected to a private address would be fetched | MINOR | `update.rs:103-114` | item 8: ecd5fab |

## 2. Bots and abuse

### 2.1 Sign-in brute force and credential stuffing

**In place.** `POST /api/signin` (`api.rs:122-163`) needs a matching
`Origin` even without a session (`http.rs:215-221`: login CSRF closed),
takes the longer of two delays — by address `in:<key>` and by account
`in:<folded e-mail>` — from `limit.rs`: three failures free, then 1 s
doubling to 60 s, forgotten an hour after the last failure, cleared by a
success. An unknown address costs a hash too (`crypto.rs:76-78`). The
address key is the IPv4 address or the IPv6 /64 (`limit.rs:24-35`). The
map of keys is bounded at 100 000 (`limit.rs:59`).

Probed (section 8): three failures answered 401 in 0.23 s each, the fourth
429 with `Retry-After: 1`; an unknown address answered 401 in 0.237 s and
the known one in 0.227 s — the same within noise.

**Missing.**

- *The log* (F1). A failed sign-in is an audit row (`ctx.audit("sign_in",
  …, false)`, `api.rs:152`) and nothing on standard error: `grep log::
  api.rs` finds the setup line and a mail error only. The host's tools
  that ban addresses — fail2ban, CrowdSec, a NAS's own — read the journal
  or the container's log, never SQLite. The 429 of the limiter is silent
  too. Without a line, the server's own delay is the whole defence, and it
  is per key: a botnet pays it per address.
- *A ceiling* (F2). The delay caps at 60 s per key (`limit.rs:71`), so a
  single account can be tried about 1 440 times a day without end, and
  from many addresses the per-account key is the only brake. ADR 0074 item
  9 forbids a lock a stranger can use against the owner — rightly — but
  says nothing of telling the owner, of a global rate, or of a cap after
  which the account asks for a second factor it has. Nobody is notified:
  no mail to the account, no line for the admin, no counter on the
  console.
- *The password itself* (F3). `check_password` (`api.rs:70-78`) is length
  and not-all-spaces. `password1234` is 12 characters. Credential stuffing
  works with known pairs: a deny list of the commonest passwords (the
  10 000 of a public list, embedded, a few hundred kilobytes) at setup,
  invitation, reset and change costs nothing at sign-in time and needs no
  third party; a k-anonymity check against Have I Been Pwned would be an
  outbound request the server does not make today (section 3.5).

### 2.2 Invitations, registration and recovery

**In place.** No open registration (ADR 0074 item 4): an account is made
from an invitation (`api.rs:277-351`), 256 bits, single use, 7 days, ended
by the admin; the setup link 1 hour, only while there is no account
(`api.rs:193-229`, `lib.rs:103-146`); a reset link 24 hours, single use,
every session of the account ended on use (`api.rs:382-419`). A wrong
link is slowed by address (`link:`), 404 then 429 — probed. The mail
routes answer before the address is looked up (`api.rs:669-678`), so their
time says nothing. The e-mail is folded (NFC, lower-case, `db.rs:223-227`)
so `Admin@` and `admin@` are one account.

**Missing.**

- *Recovery leaves tokens alive* (F4). `reset` sets the password and ends
  the sessions (`api.rs:413-414`); `password` ends the other sessions
  (`api.rs:485`). Neither touches `tokens`. A person who recovers from a
  stolen password keeps serving the thief's personal access token, up to a
  year (`api.rs:561`) or for ever. The admin's `end_sessions` does revoke
  (`db.end_all_of`, `admin.rs:171`): the person's own recovery should do
  the same, or at least say the tokens are still there.
- *Acceptance tells whether an e-mail has an account* (MINOR, not in the
  table): `accept` answers 409 `exists` (`api.rs:307-313`) to whoever holds
  an invitation link without a fixed address. Only a link holder, only one
  address per link use: low.
- *Mailbox flooding* (F11): `signin_link` and `forgot` are delayed by the
  sender's /64 only; the address mailed to is not a key. A person can be
  sent a mail every few seconds per /64 the attacker holds. A second key,
  `mail:<folded e-mail>`, with the same delay, closes it.

### 2.3 The device-code approval

**In place.** `gh auth login`'s flow (`device.rs`): a code of 8 letters
from a 20-letter alphabet (2.6 × 10¹⁰), 10 minutes, a poll secret of 256
bits compared in constant time, each start slowed by address (`device:`,
probed: 200, 200, 200, 429); the approval page shows the device's name,
the address and the time of the request and asks *Was it you who asked,
on this device?* with a *refuse* (gap 12, closed 2026-10-12); the approval
needs a browser session with `Origin` and the CSRF token.

**Missing (F17).** The code travels in the link (`/device?code=…`,
`device.rs:103`) and the page is one click from *Approve*: a mail that
says "Verso needs you to confirm your device" with that link is still a
phishing page with an honest address line. GitHub makes the person type
the code. The poll (`device.rs:193`) has no delay: each poll is a hash
and a map lookup under the devices' mutex, cheap, and bounded by the
connection limits; a `device:` delay on a wrong secret would cost nothing.
Both are the maintainer's call: gap 12 was decided on 2026-10-12.

### 2.4 Tokens

**In place.** Personal access tokens prefixed `verso_pat_` (secret
scanners), SHA-256 at rest, scoped to folders and to reading or writing
within the member's role (`api.rs:548-585`), never the account's pages,
sessions or the admin's routes (`http.rs:156-171`); made only in the
browser; a year at most or none said in red; listed and revocable. A
device session is a bearer too, bound to kind `device` (`auth.rs:241-250`).

**Missing.** F4 above. And a token created with a 14-day-old cookie and
nothing more (F15): a fresh password or passkey before a token is made, a
passkey added or an admin acts is what the services people compare Verso
with do ("sudo mode").

### 2.5 Connection and message floods

**In place, and the numbers.** 512 connections on the server and 128 per
address, taken before the TLS handshake or a byte of HTTP (`listen.rs:32,
38, 102-127`); the handshake 10 s (`tls.rs:26`); headers 30 s
(`listen.rs:45`), a request 60 s with its body (`http.rs:428`); the API
body 1 MB (`http.rs:421`; probed: 2 MB → 413). The WebSocket: 48 MB a
message (`rpc.rs:40`), 8 requests under way (`rpc.rs:53`), a queue of 1024
messages and 64 MiB, each write within 30 s plus its size at 32 KiB/s
(`rpc.rs:67-88`), a ping every 30 s and closed after two unanswered; 32
connections per account and 64 per address (`fair.rs:24,31`), 429 past
them; commands at 100 a second per account and 1 000 on the server,
waiting their turn past that (`fair.rs:37-47`); a presence 16 KB
(`collab.rs:490`); a board's update 4 MB and 10 000 inserts, the room
100 000 entries and 64 MB (`collab_board.rs:49-58`); sync pieces of 1 MiB,
two transfers each way. Each refusal is one log line a minute
(`listen.rs:130-136`, `fair.rs:171-177`).

**Missing.**

- *The REST routes have no rate* (F14): a signed-out client can ask
  `/api/state` (a `SELECT COUNT(*)` on accounts, `api.rs:28`), the pages
  and the window's files as fast as 128 connections allow; what bounds it
  is the connection count and the 1-core host's own capacity. A proxy's
  rate limit in front is the usual answer (section 2.9); a small
  per-address token bucket on the router, with the `fair.rs` bucket
  already written, is the server's own.
- *A note room's update* (F13) may be 48 MB; `Update::decode_v1`
  (`collab.rs:460`) refuses what is malformed, but a well-formed update of
  tens of megabytes is integrated into the room in memory, and relayed to
  every window in it. The board room's 4 MB is the precedent.
- *Headers* (F12): hyper's `max_buf_size` is its default, about 400 KiB;
  a 200 KB header line was accepted (section 8). Across 512 connections
  that is ~200 MiB of read buffers, a fifth of the 1 GB host. 64 KiB is
  more than any browser sends.
- *The numbers are reasoned, not measured* on the 1-core, 1 GB host, as
  the threat model says. A stress run with the lab kit is the measurement
  the ADR asks for.

### 2.6 Uploads and quotas

**In place.** A write's bytes are checked against the folder's quota
before anything is written (ADR 0077 item 5); a sync send's declared size
at its first piece and again at its last; pieces go to a temporary file as
they arrive, one in memory per transfer; 1 GiB per file; the trash
expires and is bounded by the quota (ADR 0080 item 8). The threat model's
gaps 5 and 9 are closed.

**Missing.** Nothing of its own. A folder with no quota set
(`VERSO_FOLDER_QUOTA` unset: none, `config.rs:54-56`) is bounded by the
disk; the installation guide could say that a quota is the default to set
before the first member who is not the owner.

### 2.7 Scraping and enumeration

**In place.** No public links (ADR 0081, decided); every file and every
command needs a session and a role; a folder one may not see answers 404
(probed: a traversal of `/f/<id>/../../etc/passwd` and its encoded form
answered 404); folder and share ids are 12 random bytes (`crypto.rs:27`).
Sign-in answers unknown and wrong alike, in the same time (probed); the
passkey start says only that an address has passkeys, by design; the mail
routes answer alike. The audit export quotes cells that begin with `=`,
`+`, `-`, `@` (`console.rs:482-493`): no formula injection in the CSV.

**Missing.** A reader is a reader: a member with read access and a
personal access token mirrors a shared folder at 100 commands a second,
which is legitimate use and cannot be told from scraping by the server.
No watermark, no download count, no per-folder read rate. ADR 0081 left a
file's history for its own ADR; a read log per folder (who opened what,
visible to the owner) is the one thing that would tell, at the cost of a
row per read. Recorded, not recommended now.

### 2.8 CAPTCHA and proof-of-work

**Not in place, and not obviously wanted.** A CAPTCHA from a third party
(Cloudflare Turnstile, hCaptcha, reCAPTCHA) brings a script from that
party into the sign-in page — a request the page's policy forbids today
(`script-src 'self'`, `http.rs:448`), a tracker on a self-hosted server
that sends nothing anywhere (ADR 0073, the threat model's "the server's
own reach"), and a wall for a screen-reader user that the project's
accessibility commitments do not allow. A proof-of-work challenge (the
browser hashes until a prefix matches before `POST /api/signin`) is
self-hosted and needs no third party, costs a phone a second or two, and
is blind-friendly because it is invisible; it raises a botnet's cost per
attempt by that second and no more — it is a tax, not a gate — and it
costs a battery.

The server's delays already do what a proof-of-work does, on the server's
clock rather than the client's CPU: after three failures a key waits. What
a proof-of-work adds is a cost before the first failure, which matters
only for a flood of first attempts across many keys — the case F2's global
ceiling and F1's log line also answer, without the battery. Recommended
in the ADR: no CAPTCHA; a proof-of-work as an `[OPEN]` with a no.

### 2.9 What a reverse proxy adds

A proxy in front — Caddy, Traefik, a NAS's own, `tailscale serve` — is
the documented way to TLS (`server-install.md` section 8). What it can
add, and what the server must do for it to work:

- *The address.* The server believes `X-Forwarded-For` from one address
  (`VERSO_TRUSTED_PROXY`, `config.rs:171-176`), taking the last entry
  (`auth.rs:101-106`), which is the right one for a single hop. Cloudflare
  in front of Caddy is two hops: Caddy must be told Cloudflare's ranges
  and rewrite the header, and Verso trusts Caddy — this works today and is
  not written anywhere. Cloudflare straight to Verso cannot be configured
  (F5): its addresses are many. The failure mode is quiet: every request
  looks like it came from the proxy, the by-address delays key one
  address, and three failures by anyone slow sign-in for everyone behind
  it — a stranger's lock on the owner, the very thing ADR 0074 item 9
  forbids. A list of addresses or CIDRs, and a warning at start when the
  proxy is set and a request from it carries no `X-Forwarded-For`, close
  it.
- *Rate limits and bans.* Caddy's `rate_limit`, Traefik's `RateLimit`,
  CrowdSec's bouncer and fail2ban all act on a log line or a status code.
  Verso gives them the 429 (with `Retry-After`) and nothing else: the
  failed sign-in has no line (F1). The line the ADR proposes is one fixed
  format, one per failure, with the address first:
  `WARN sign-in failed from 203.0.113.9 for a***@example.org (3 in a row)`
  — the address as the proxy forwarded it, the e-mail masked, the count
  so that a filter can ban at a threshold. A fail2ban filter
  (`failregex = sign-in failed from <HOST> `) and a CrowdSec parser are a
  few lines each and belong in `packaging/server/` beside the unit.
- *What a proxy must not do.* Buffer the WebSocket (Caddy and Traefik do
  not; nginx needs `proxy_read_timeout` above the ping interval), forward
  both `Content-Length` and `Transfer-Encoding` (hyper takes the latter —
  probed, section 8 — and the proxy must agree), or strip `Origin`.

## 3. Web attacks

### 3.1 XSS: the sanitizer and the renderers

**In place.** `app/ui/src/sanitize.ts` is the boundary between members
(ADR 0073 item 6), reviewed line by line by Opus 5.5 on 2026-10-11 with a
suite of 76 hostile inputs in `npm test` (*2026-10-13:* 102 cases since
95b7a22, run in node and in WebKit and Chromium); the threat model's "What the
sanitizer guarantees" says what it keeps. Mermaid runs at `securityLevel:
"strict"` (`mermaid.ts:27`); KaTeX with `throwOnError: false` and its
default `trust: false` (`render.ts:19`, `live.ts:656,828`), so `\url` and
`\href` to `javascript:` are refused by KaTeX itself; an embedded page in
the browser is an `<iframe>` with `sandbox="allow-scripts
allow-same-origin allow-forms allow-popups
allow-popups-to-escape-sandbox"` and `referrerPolicy = "no-referrer"`
(`framed.ts:22-27`), on the web only (`sanitize.ts:106-113`), behind the
reader's approval; a folder's SVG or HTML file is served under
`Content-Security-Policy: sandbox; default-src 'none'; …`
(`files.rs:23`) with `nosniff` — probed, section 8. Inline `<svg>` and
`<math>` in a note are dropped by name.

**Missing.**

- The review by the model that did not write the sanitizer is `[OPEN]` in
  the threat model (F9). The suite runs in happy-dom; a run in WebKit and
  Chromium through the harness is still to add. *2026-10-13:* added in
  95b7a22 — the 102 cases run in node over happy-dom and in WebKit and
  Chromium through the harness (ADR 0083 item 16).
- PDF.js (F22): `getDocument` is called without `isEvalSupported: false`
  (`pdf.ts:246,443`). Since 4.2.67 (CVE-2024-4367) the font compiler no
  longer evaluates untrusted strings, and `pdfjs-dist` is at 6.x; the
  page's policy has no `unsafe-eval`, so `new Function` fails in the
  worker anyway. The option costs one word and makes the code say it.
- Excalidraw: a board's elements come from another member's file; a text
  element's `link` is opened by Excalidraw through `normalizeLink`, which
  refuses `javascript:`; not verified in this review beyond reading the
  window's binding (`web/bridge.ts:240` opens `http(s)` only, with
  `noopener,noreferrer`). Left to the sanitizer's review.
- `allow` on an `<iframe>` of a note is kept by the sanitizer
  (`sanitize.ts:39`) but the note's frame only donates its size
  (`sanitize.ts:278-280`); the page's `Permissions-Policy` denies camera,
  microphone, geolocation and payment to every frame (`http.rs:482-486`).
  Fine; `usb`, `bluetooth`, `serial`, `interest-cohort` could join the
  list (F16).

### 3.2 CSP and the other headers

**In place** (probed: `http.rs:458-515`): `X-Content-Type-Options:
nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: SAMEORIGIN`,
`Cross-Origin-Opener-Policy: same-origin`, a `Permissions-Policy`, HSTS
`max-age=31536000` when the address is HTTPS, `Cache-Control: no-store` on
the page; the page's policy `default-src 'self'; script-src 'self';
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:;
media-src 'self' blob: https:; frame-src 'self' https:; object-src
'none'; connect-src 'self' <ws origin>; worker-src 'self' blob:;
font-src 'self' data:; base-uri 'none'; form-action 'self';
frame-ancestors 'self'`; under `/f/`, `Cross-Origin-Resource-Policy:
same-origin` and the sandbox policy above.

**Missing (F16).** `includeSubDomains` on HSTS (a subdomain of the
server's name could set a cookie for the parent; `__Host-` already
refuses the one that matters); `preload` is the host's choice and should
not be sent by default. `style-src 'unsafe-inline'` is needed by the
renderer's inline styles (the sanitizer tames them: no `fixed`, no
`absolute`, `url()` to the web only); a nonce would need the whole
window's styles rewritten — not worth it now. `img-src https:` and
`frame-src https:` are the maintainer's answer I (remote content per
reader). No `Cross-Origin-Embedder-Policy`: not needed without
`SharedArrayBuffer`.

### 3.3 CSRF, CORS and cookies

**In place, probed.** A `POST` with the cookie and a good `Origin` but no
`x-verso-csrf` answered 403 `csrf`; with the token and a foreign `Origin`,
403 `forbidden`; with both, 200. No `Access-Control-*` header is ever set
on the API (`grep` finds `cors_origin` only in the files policy, unused on
the server): a page of another site cannot read `/api/me`, and
`SameSite=Lax` keeps the cookie off its subresource requests. The
WebSocket with the cookie and no `Origin` answered 403; with it, 101. The
cookie: `HttpOnly; SameSite=Lax; Max-Age=7776000`, plus `Secure` and the
`__Host-` prefix over HTTPS (`auth.rs:179-194`); on plain loopback neither,
by design, and the probe was on loopback.

**Missing.** Nothing. `SameSite=Strict` would break the link from a mail
(the first navigation carries no cookie under Strict): `Lax` plus the
`Origin` check plus the token is the right set.

### 3.4 Clickjacking and open redirects

**In place.** `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`
on every page. The sign-in page's `next` parameter is resolved against the
page's origin and followed only when it stays there (`pages.ts:26-36`):
`//evil.example`, `https://evil.example` and `/\evil.example` all go to
`/`. The server itself redirects nowhere (no `Location` in `http.rs`).

### 3.5 SSRF

**In place.** The server fetches two things and nothing a member names:
the release feed at a fixed address (`update.rs:20`, once a day, off with
`VERSO_UPDATE_CHECK=off`) and the host's SMTP server. Remote images and
embedded pages are fetched by the reader's browser, never by the server.
No URL preview, no import from a URL, no webhook.

**Missing (F23).** `reqwest::Client::builder()` keeps its default of ten
redirects (`update.rs:103-107`). The feed is GitHub's API; a redirect to
`http://169.254.169.254/` would need GitHub to send it. One line —
`.redirect(Policy::none())` — removes the question, and the response body
is read as JSON of a known shape, so nothing of it is shown to anyone but
the version string, which `parse` constrains to numbers.

### 3.6 Path traversal and symlinks

**In place.** Every path a window or a device sends is confined before
`verso-fs` acts (`..`, `.`, empty parts and absolute paths refused;
`scope.rs` for a share, `confine.rs` for the folder); a symlink on a
server with members is followed only when it lands inside the folder
(`verso-fs/src/lib.rs:266-305`, `links_inside`), judged by each entry's
own `symlink_metadata`, with a hop limit of 40; `/f/` refuses a note by
name in any spelling (`service/files.rs:117-131`). Probed: the two
traversal spellings answered 404.

**Missing.** Nothing found. A race between the check and the read (a
symlink swapped in between) is the known limit of path-based checks on
every platform; the server runs as one user with no other writer in the
folders directory but its members through itself, and a member who can
make a symlink is a writer of that folder already.

### 3.7 Request parsing: size, depth, time

**In place.** The API body 1 MB (413 past it, probed); JSON through
`serde_json`, whose recursion limit (128) refuses a deep body — probed
with 5 000 nested arrays: 422; no decompression layer on requests, so no
decompression bomb (`grep decompression` finds none); headers within 30 s,
the request within 60 s; the dialect parser fuzzed and checked for linear
time; no regex crate in the server, the core, the service or the dialect.
`Transfer-Encoding: chunked` with a `Content-Length` beside it: hyper
follows the chunked body (probed: the second request inside the body was
not read as a request), which is the RFC's choice; a proxy in front must
do the same (Caddy does).

**Missing.** F12 (hyper's header buffer) and F13 (a note's Yjs update).
The WebSocket's own frames are parsed by `tungstenite` with the 48 MB
message limit; a fragmented message is assembled up to that limit.

## 4. Auth and sessions

### 4.1 Passwords and Argon2id

**In place.** `Argon2::default()` of the `argon2` crate: Argon2id, m = 19
MiB, t = 2, p = 1 — OWASP's first recommended set (`crypto.rs:36-49`);
the PHC string carries its parameters, so a later change still verifies
old hashes; a 16-byte random salt; verification on the blocking pool for
sign-in and for a password change (gap 16 closed). 12 characters at least.

**Missing.** F3 (a deny list). A note for later: when the parameters
move, a hash made with the old ones is re-made at the next successful
sign-in — the code does not do that yet, and nothing needs it until the
parameters change.

### 4.2 Passkeys

**In place.** `webauthn-rs` 0.5 with user verification required, the
relying party id and origin from `VERSO_PUBLIC_URL`
(`passkeys.rs:42-53`); the ceremony's state 5 minutes in memory, bounded
at 10 000 (`passkeys.rs:32,99`); counters updated after each use
(`passkeys.rs:225-232`); registration only from a browser session; a
stable opaque user handle from the account id (`passkeys.rs:56-61`).

**Missing.** Nothing found. A passkey is not a second factor for the
password (ADR 0074 item 3 says a passkey is two factors by itself, and
that TOTP comes after passkeys if asked). F2's recommendation — after N
failures, an account that has a passkey asks for it — is where the two
meet.

### 4.3 Sessions and device tokens

**In place.** A session token of 256 bits, SHA-256 at rest, looked up by
hash (`db.rs:703-745`); 14 days idle, 90 at most, device sessions the
same; `last_used` written once a minute; listed in Settings with the
browser and system from the `User-Agent` (never the whole string,
`auth.rs:273-304`) and the address; ended one by one, or all others; a
password change or reset ends them; an ended session's WebSocket is told
and closed; the desktop's device token `0600` in `servers.json` (Windows:
the profile's permissions, threat model gap 17, open).

**Missing.** F4 (tokens survive recovery), F15 (no fresh proof for
sensitive actions). The session id is not rotated after sign-in — it is
new at every sign-in (`create_session`), so there is no fixation to
rotate against.

### 4.4 Admin and privilege boundaries

**In place.** `Ctx::admin()` refuses a token (`http.rs:165-171`); the
admin has no implicit access to folders — entering one is a grant to
oneself in the folder's log (`admin.rs:343-358`); a reader's write, a
share's path outside its grant, a token's folder outside its list are
refused before the core acts; ADR 0081 item 11's two leaks (a warning
naming an outside path) were closed on 2026-10-12 (`scope.rs`, with
tests); the admin cannot end their own sessions from the console
(`admin.rs:161-166`); the console's lists are paged on the server.

**Missing.** F15 for the admin's routes. The console shows the
configuration with secrets as set or not (`console.rs:572-604`): fine.

### 4.5 The audit log

**In place.** One row per sign-in (failed or not), session ended, token,
passkey, invitation, grant, share, device, quota, trash action — who,
when, from where, with `ok`; read by the admin and, per folder, by its
owner; exported as CSV with formula cells quoted.

**Missing.** Tamper-resistance against the host is out of scope (the
host sees everything); against the admin, the API has no delete and no
update of `audit`, which is what matters. No retention (F21): the table
grows for ever; a line per failed sign-in under attack is a row per
attempt — bounded by the delays, but a year of them is millions. A
retention like the trash's (`VERSO_AUDIT_DAYS`, 365 by default) is cheap.
Not audited: a profile or settings change, a read — by design.

### 4.6 Secrets in logs and the first admin

**In place.** No password, token or link in the log except the setup
link, once, by design; a window's log lines are one line each with
control characters replaced (`rpc.rs:597-606`); a device's name likewise
(`device.rs:56-64`); the first admin from `VERSO_ADMIN_EMAIL` and
`VERSO_ADMIN_PASSWORD`, read on the first start only and ignored after
(`lib.rs:103-146`), or from `_FILE`; the env file `0640 root:universo`
(nfpm); the guide says to remove the password once the admin exists.

**Missing.** F18: the compose file's example puts the password in
`environment:`, which `docker inspect` and the panel show; the `_FILE`
form with a Docker secret is the one to show first. The server could zero
the two variables in its own environment after reading them (`std::env::
remove_var` is unsafe since Rust 2024 and `unsafe_code` is forbidden —
so no; the file is the host's). F21: `log_write` lets a member write
120 KB a minute of lines that look like the server's own; the prefix
`window <id> (<account>)` tells them apart, which the fail2ban filter must
respect (F1's format must not be forgeable through `log_write`: the
proposed line begins with `sign-in failed from`, and a window's line
begins with `window`).

## 5. Transport and deployment

### 5.1 TLS and plain HTTP

**In place.** Nothing that signs in or carries a secret is read over plain
HTTP from another machine (`http.rs:124-130`); the server listens on
loopback unless told otherwise and refuses to listen beyond it without
`VERSO_PUBLIC_URL` (`lib.rs:173-178`); its own TLS is rustls with safe
defaults (TLS 1.2 and 1.3, no client auth, `http/1.1` only,
`tls.rs:29-51`), the handshake in a task of its own with a 10 s deadline;
behind a proxy, `X-Forwarded-Proto: https` from the trusted address makes
the request secure; `tailscale serve` is the documented path for a phone.

**Missing.** F5 (one proxy address). ACME built in is "later" by ADR 0073
item 6. The certificate is read once at start: a renewal needs a restart
(documented). HTTP/2 is not spoken (`alpn: http/1.1`): fine behind a proxy
that speaks it to the browser.

### 5.2 The systemd unit and the container

**In place.** `universo.service`: `User=universo`, `NoNewPrivileges`,
`ProtectSystem=strict` with `ReadWritePaths=/var/lib/universo`,
`ProtectHome=read-only`, `PrivateTmp`, `PrivateDevices`, the
`ProtectKernel*` and `ProtectControlGroups`, `RestrictNamespaces`,
`RestrictRealtime`, `RestrictSUIDSGID`, `LockPersonality`,
`MemoryDenyWriteExecute`, `SystemCallArchitectures=native`,
`RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`, no capabilities. The
image: Alpine pinned by digest, a static musl binary, `USER 1000:1000`, no
shell needed by the server, `VOLUME` for the two directories.

**Missing (F19).** The unit could add `ProtectProc=invisible`,
`ProcSubset=pid`, `SystemCallFilter=@system-service` (with `~@privileged
@resources`), `UMask=0027` and `CapabilityBoundingSet=` is already there.
The compose file could declare `read_only: true` with `tmpfs: /tmp`,
`cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`; the image
runs fine that way (it writes under `/data` and `/folders` only). The
`run-cloud.sh` and the lab kit are outside the package and not reviewed.

### 5.3 File permissions, backups

**In place.** `server.sqlite` and its journal `0600` at every open
(`db.rs:453`, `verso-fs/src/server.rs:112-124`); the index files `0600`
in `0700` directories (`verso-index/src/lib.rs:127-133`); the package's
directories `0750 universo:universo` (`postinstall.sh:22-24`); the env
file `0640 root:universo`; the backup tarball made under `umask 077`,
refused inside what it copies, the service stopped for a consistent copy
(`universo.sh:819-879`).

**Missing.** F10: the tarball is in the clear and the guide's advice is
to copy it elsewhere (rclone, scp). The database holds the password
hashes and the session hashes; the env file may hold the admin's
password; the folders hold every note. An `--encrypt` with `age` (one
static binary, a public key the host keeps) or a prompted passphrase
through `openssl enc` costs a dependency the script does not have; the
cheaper step is the warning in the script's own words and a `backup
--to-stdout` for piping into the host's own encryption. F20: a folder is
`mkdir`ed with the process's umask (`0755` seen on this Mac); under the
package's `0750` parent nobody else enters, but a folders directory on a
NAS export or under `/home` is whatever the host gave it. `UMask=0027`
in the unit (F19) and `0750` from `make_folder` close it.

### 5.4 Updates and supply chain

**In place.** Releases signed with minisign; the installer verifies the
signature with the project's public key, or the sha256 GitHub published,
or refuses unless `--insecure-no-verify` (`universo.sh:447-497`); the
server never updates itself, it tells the admin (ADR 0075 item 7);
`cargo deny` for advisories, yanked crates and licenses with dated
exceptions; `Cargo.lock` and `package-lock.json` committed and `--locked`
in CI; every GitHub Action pinned by commit SHA with its version in a
comment; the npm licence allowlist; the image's base pinned by digest;
`nfpm` downloaded by sha256 in the release workflow.

**Missing (F7).** No advisory check on the npm tree: `npm audit` (or
`osv-scanner`, which reads both lockfiles) is not in CI or in
`check.sh`. The window ships PDF.js, Mermaid, KaTeX, Excalidraw, Yjs and
CodeMirror to every member's browser, and those have had advisories that
`cargo deny` cannot see. `npm audit --audit-level=high` in the Linux job,
with the same exception policy as `deny.toml` (an id, a reason, an
expiry), is the same guardrail on the other half of the tree.

### 5.5 security.txt and disclosure

**Missing (F8).** No `SECURITY.md` in the repository, no
`/.well-known/security.txt` served, no address to write to, no promise
of a response time, no statement of what is in scope (the server, the
app, the site) and what is not (the host's own machine). The repository
is private today, so this matters at the announcement; the route costs
ten lines (`http.rs`, a static text with `Contact:`, `Expires:`,
`Preferred-Languages: pt-BR, en`, `Canonical:`) and the file the same.
The mirror check already expects a `SECURITY.md` twin
(`scripts/check-docs-mirror.sh`, its comment).

## 6. Data at rest and privacy

The host sees the notes (ADR 0073 item 6, the compose file's own words:
*"Whoever hosts the server can read them: there is no end-to-end
encryption"*). What an attacker with the disk gets, in order of damage:
every note and attachment of every folder; the database — e-mails, names,
languages, Argon2id hashes (attacked offline at 19 MiB and 2 passes:
slow, not safe for a weak password, F3), the SHA-256 of live session and
device tokens (useless without the tokens), passkey public keys, the
audit log, each folder's change log, the folders' indexes (the notes'
text again, in FTS5); the env file (the admin's password if it was left
there, the SMTP password, the update token); the trash. What they do not
get: a session, a token, a password. Encryption at rest is the host's
(LUKS, a NAS's volume encryption) and the guide should say so in one
line beside the backup advice.

Telemetry: none. The server reaches the release feed with its version in
the `User-Agent` and nothing else, and the SMTP server the host set. The
console shows an account's sessions with their addresses to the admin,
and the audit log with addresses: personal data under the LGPD and the
GDPR, held by whoever hosts, which the documentation says. A retention
for the audit log (F21) is also a privacy answer.

## 7. Verification gaps

What the project can do itself:

- *Fuzzing of the server's inputs* (F6): a `cargo-fuzz` target per parser
  the network feeds — the WebSocket request (`rpc.rs:216-221`, through
  `serde_json`), `verso_core::sync::unframe`, `Update::decode_v1` on a
  note room and a board room (through `collab::integrate` and the board's
  merge), the presence states (`collab.rs:490-520`), `Host` and `Origin`
  parsing (`auth.rs:121-174`), `size` of `config.rs` — beside the two
  that exist, 60 s each on `main`.
- *Property tests* of the limiter (the delay never exceeds 60 s, a success
  clears, the map never passes 100 000) and of `address_key`.
- *A stress run* on the lab's 1-core, 1 GB server with the kit
  (`docs/reference/sync-lab.md`): the connection and command numbers
  measured, not reasoned.
- *The harness*: the sanitizer's 76 cases run in WebKit and Chromium
  (`npm run e2e`), the embed gate clicked.
- *A header and cookie test* in `tests_bounds.rs` beside
  `the_database_the_files_and_the_version_say_no_more_than_they_must`:
  every header of section 3.2 asserted on `/`, `/api/state` and `/f/`.

What needs an outside reviewer (threat model gap 10, F9): the sanitizer
by the model that did not write it, and the whole server by a person —
a pentest of the API, the WebSocket and the window against a hostile
member, with the lab server as the target, before the announcement.
Self-hosted and private, with the maintainer as the only user, there is
no bug bounty to speak of; a disclosure address (F8) is the minimum.

## 8. What was probed on a local server

`verso serve --web` from this worktree's build, on `127.0.0.1:7391`,
`VERSO_UPDATE_CHECK=off`, a scratch `VERSO_DATA_DIR` and
`VERSO_FOLDERS_DIR`, the admin from the environment. Plain HTTP on
loopback counts as secure (`auth.rs:116`), so sign-in works and the cookie
has no `Secure` flag — expected on loopback.

| Probe | Answer | What it shows |
|---|---|---|
| `GET /api/state`, no session | 200, `version: null`, every header of section 3.2 | the version hidden from a stranger (gap 15); the headers |
| `POST /api/signin` without `Origin` | 403 | login CSRF closed |
| `GET /api/state` with `Host: evil.example` | 421 | DNS rebinding refused |
| 6 wrong passwords, one account, one address | 401 (0.23 s), 401, 401, then 429 `Retry-After: 1` in 0.7 ms | three free, then the delay; the server's log stayed empty (F1) |
| unknown e-mail vs known, wrong password, fresh limiter | 401 in 0.237 s, 0.227 s, 0.229 s | no timing tell |
| `POST /api/device/start` × 5 | 200, 200, 200, 429, 429 | the device delay |
| `POST /api/device/poll`, wrong secret | 410 `link_gone` | the secret is checked, the answer uniform |
| sign-in body of 2 MB | 413 | the body limit |
| sign-in body with 5 000 nested arrays | 422 | serde's depth limit, no hang |
| `GET /api/invite/<guess>` × 5 | 404 × 3, 429 × 2 | links slowed by address |
| `POST /api/forgot`, no mail server | 400 `no_mail` | the route is off without SMTP |
| `Content-Length` and `Transfer-Encoding` together, a second request in the body | one answer (405 for the POST), the body not read as a request | hyper follows the chunked body |
| a header line of 200 000 bytes | 200 | hyper's default buffer accepts it (F12) |
| sign-in with the right password | 200, `Set-Cookie: verso-session=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000` | the cookie's flags (`Secure` and `__Host-` over HTTPS only) |
| `GET /api/state` with the cookie | the version and the contract | said to someone signed in |
| `POST /api/folders` with cookie, `Origin`, no CSRF header | 403 `csrf` | the token is required |
| the same with the token and `Origin: https://evil.example` | 403 `forbidden` | the origin is required |
| the same with both | 200, a folder | the happy path |
| `GET /f/<folder>/x.svg` | 404 with `Content-Security-Policy: sandbox; default-src 'none'; …`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store` | the files' policy, on a refusal too |
| `GET /f/<folder>/../../etc/passwd`, plain and `%2F`-encoded | 404, 404 | confinement |
| `GET /api/me` with the cookie and `Origin: https://evil.example` | 200, no `Access-Control-*` header | no CORS: another site cannot read it |
| WebSocket upgrade with the cookie, no `Origin` | 403 | the origin before the cookie |
| the same with `Origin` | 101 | the happy path |
| `GET /api/admin/audit?format=csv` | the rows, `sign_in` with `false` for the failures | the audit log, the CSV quoted |
| `ls -la` of the data directory | `server.sqlite`, `-wal`, `-shm` at `0600`; the folder `probe` at `0755` | the database's mode (gap 13); the folder's (F20) |

The server was stopped after the last probe; nothing of it remains but
the scratch directory.

## 9. Not covered

Not read in this review, and left for the ones it names: the lab kit's
scripts (`docs/reference/sync-lab.md`), `app/src-tauri` (the desktop
host's own surface — its `verso://` protocol and child web views are the
desktop's, not the server's), the Excalidraw bundle's handling of a
hostile board beyond its link normalizer, the Windows build of the device
token's file (gap 17). Not measured: the numbers of section 2.5 on the
1 GB host.

## 10. The second review (2026-10-13, night)

- Date: the night of 2026-10-13, after ADR 0083's items 1 to 17 were
  built.
- Made by Opus 5.5 in a read-only session that took no part in writing
  the code it read, with two helper sessions of its own for the window's
  code and the packaging, whose main claims it checked again in the code.
  The server's code of this round was written by Opus 5.5 sessions too:
  this is a reading by another session, not the other model's reading of
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md).
- Against 52dc95c of `docs/security-hardening`. Closed in the merges of
  sec/shares (f8cfa1de), sec/pkg (4e77830e), sec/bounds (6c8db684) and
  sec/auth2 (a0b31e81) into that branch, and in the maintainer's
  decisions of 2026-10-14, merged from sec/decided (bf31c238; ADR 0083,
  As built).

The review assumed an attacker who has read the public source. It read
the code area by area — sign-in and sessions, authorization and sharing,
paths and files, input handling and bounds, outbound requests, the
window's code outside the sanitizer, the packaging — and asked of each
check what input or sequence gets past it, what it trusts that it should
not, and what happens at the limits: empty, huge, malformed, concurrent,
repeated, out of order, after a restart. It did not repeat F1 to F23.
Nothing was built, edited or run against a server; one helper ran the
logic of the sign-in page's `next()` in node to confirm S8. Each finding
came with a fix and a test to write. Each fix's commit names the test
that holds it, most of them seen failing first. The levels are
[ADR 0033](../adr/0033-pr-workflow.md)'s, as in section 1.

| # | Finding | Level | Closed by |
|---|---|---|---|
| S1 | An invitation to a share, accepted after the share was removed, granted the whole folder the share was in: the foreign key's `ON DELETE SET NULL` erased the share it named, and acceptance took the whole folder's branch | BLOCKING | 5e2bf8d8: an invitation records what it was made for (schema 10); one whose share is gone is not pending and grants nothing; removing a share ends its pending invitations |
| S2 | A note read, written or made through a share carried its type resolved over the owner's whole folder: the path of a schema outside the share, with its labels and properties, reached the receiver ([ADR 0081](../adr/0081-sharing-between-people-on-one-universo.md) item 11) | BLOCKING | be1f069b: the type resolved over the share's roots alone; `answer_out` re-roots a type's schema paths and drops a type that names one outside |
| S3 | `links` through a share answered a link resolving outside it unlike a link resolving nowhere: a receiver who writes links learned whether a note of a given name existed outside (ADR 0081 item 11); the review noted it might deserve a lower level | BLOCKING | b900c346: both answer `outside: true`; the window says the same words for both |
| S4 | Argon2id had no bound on how many ran at once — some 19 MiB each, up to the runtime's 512 blocking threads, so a burst of sign-ins from one address could take the 1 GB host's memory — and the per-account delay was read before the hash and written after it, so wrong passwords sent together all passed it | IMPORTANT | b570239b: two places per core (two at least), 503 past a 5 s wait; one attempt in flight per sign-in key, 429 past 10 s |
| S5 | Memory per request: `/f/` and the text reads held a whole file, and an escaped copy, in memory; answers were outside the queue's byte budget; every message, up to 48 MB, was parsed before the role check, 8 per connection; a note room had no total size, and one window could join every note | IMPORTANT | cbf905a3 (`/f/` sent 256 KiB at a time, a single `Range`); fe139423, moved to the server alone by bc65b8d6 (a text 16 MB at most); 767fbb41 (a size per command, read before the parse; 128 MB shared by the messages and answers above 1 MB); 9629fac2 (a note room 64 MB, a window in 64 rooms) |
| S6 | The admin's invitation could carry a folder or a share, with any role up to owner, without the fresh proof that entering a folder asks for | IMPORTANT | 714e974f: gated whenever the body names a folder or a share |
| S7 | A device's session was born proved: for ten minutes after its approval the app's bearer passed every sensitive route, an admin's included, on the proof made in the browser; and a link carrying a code led to a one-click approval | IMPORTANT | ce0bcc42 (born unproved); 0d168223 (the desktop app proves with the password when its server asks); 96cf6a82 (approval only with the code entered from the app's screen, decided 2026-10-14) |
| S8 | Sign-in's `next` checked the parsed address's origin but returned its path, which can read as another host (`/.//host/`): after a real sign-in the browser left the server | IMPORTANT | e56b5679: the path read again against the page's origin; anything else goes to `/` |
| S9 | Listening on loopback made a request secure whatever a trusted proxy on the same machine said: through a proxy forwarding `X-Forwarded-Proto: http`, sign-ins and their cookie crossed over plain HTTP | IMPORTANT | 5e1603c5: through a trusted proxy, `X-Forwarded-Proto` alone decides |
| S10 | A proxy on the same machine left out of `VERSO_TRUSTED_PROXY` made every visitor `127.0.0.1` without a word: one key for every delay, and none paced | IMPORTANT | 2757decd: two `WARN` lines that say what to set |
| S11 | Connections through a trusted proxy counted only against the server's 512, and a body could trickle for 60 s: one client behind the proxy could hold every place | IMPORTANT | 0a04d1b7: 32 requests in flight per walked address, a body within 10 s |
| S12 | Uploads started together were each judged against a folder's quota at their first piece, with nothing reserved: together they passed it on disk | IMPORTANT | 7ed171c9: a write under way holds its room in the quota until it lands or is dropped |
| S13 | `universo.sh restore` extracted whatever the archive held, as root, onto `/`: a backup kept where someone else could replace it could carry a file outside the backup's own paths, a link or a set-id file | IMPORTANT | a1fd623e: the backup listed first and refused whole, nothing written, unless every entry is a plain file or a directory under its own paths |
| S14 | `backup --encrypt` or `--passphrase` without `age` made the plain tarball in its place, and with `--to-stdout` streamed it before the warning | IMPORTANT | a7dbf5c1: it stops and writes nothing (decided 2026-10-14) |
| S15 | The Docker recipe's fail2ban jail matched lines by a journal field any local program can write; the filter took any prefix, so a line naming `0.0.0.0/0` would have banned every address; the jail named no port, so a ban closed SSH too | IMPORTANT | 1c507ac5: `_SYSTEMD_UNIT` in the match, an IPv4 address or an IPv6 /64 only, http and https only |
| S16 | A sign-in to an account the admin had made, with no password set yet, answered without a hash: its time told that such an account exists | MINOR | 59189d6a |
| S17 | Collab rooms were keyed by the path as sent: `./n.md` and `n.md` were two rooms for one file, each writing over the other's edits | MINOR | 7c0d4792: keyed by the confined path |
| S18 | The maps of device codes, sign-in links and passkey ceremonies (10 000 each, the oldest tenth evicted) could be churned from many addresses, pushing out a person's ceremony under way | MINOR | 09b19924: 8 entries per address in each; many addresses still fill a map, at a higher cost |
| S19 | A device's name kept bidi and zero-width characters and was said inside the approval page's sentence, where it could reverse or hide the words around it | MINOR | ae82caed, e3015123 (the joiner of an emoji kept), d861f522 (a `<bdi>` in the session lists too) |
| S20 | The page of an e-mail's sign-in link used it on load: a link someone else sent, for their own account, signed the reader in to it with no click and no name (login CSRF by mail) | MINOR | ae7d3926: the page names the account and waits for a click |
| S21 | A browser kept one account's window settings after sign-out, approved embed origins among them; the next account started with them and saved them as its own | MINOR | aea753e0: the settings carry their owner; sign-out forgets them |
| S22 | Package hygiene: the token's header file born `0644`; a missing signature falling back to the checksum silently; a backup's name from the clock alone, and its "inside what it copies" check comparing strings; no advice for the restore's identity file; the token typed where the shell's history keeps it | MINOR | fa860685 |
| S23 | `VERSO_TRUSTED_PROXY=127.0.0.1` believes every local program that connects to the port, not only the proxy | MINOR | ea265421: documented, with a rule that keeps the port to the proxy's user (not run) |
| S24 | The first admin's leftovers: the setup link stays readable in the journal, and nothing said to remove the admin's password from the environment once the admin exists | MINOR | ea265421: the install's next steps, the guide and the compose note say both |
| S25 | An editor could change the walk's rules, and the folder note's name, through the folder's settings, though the owner alone sets them elsewhere | MINOR | 3681a59f; 9000fc29 (decided 2026-10-14) |

Not a finding of the review, closed in the same round: the device page
stopped on a 429 with nothing to try again with, once an address had
used its free tries (a2b9955d: it waits the seconds and asks again by
itself, ten times at most).

What it found sound: session tokens of 256 bits, kept as SHA-256 and new
at every sign-in, under `HttpOnly`, `Lax`, and `Secure` and `__Host-`
over HTTPS, with the CSRF token compared in constant time; reset,
invitation and setup links single-use, with an expiry, a reset bound to
its account; access tokens scoped to their folders and to reading or
writing, never the person's own pages or the admin's routes, revoked by
a reset, their WebSockets checked again before every command; roles
checked on REST, the WebSocket, `/f/` and sync, a share's scope on its
arguments and its pushes (S2 and S3 apart), the last owner and the last
admin kept; path confinement and the symlink walk, temporary files made
new, a folder `0750` and the database `0600`; the proxy walk from the
right; mail recipients from stored addresses with fixed subjects, and
the update check at a fixed address with no redirect; no secret in the
log but the setup link; no HTML sink in the window outside
`sanitize.ts`, no `message` handler, `open_url` for http(s) only; the
systemd unit's and the compose file's hardening. It judged the server's
edge solid and named the three BLOCKING findings as leaks between
people sharing a folder, none of them open to a stranger; item 16's
pentest by a person outside the project stays, as it said, for that
class.
