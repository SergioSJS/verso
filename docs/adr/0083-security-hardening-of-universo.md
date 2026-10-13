# ADR 0083 — Security hardening of UniVerso: bots, brute force, the host's tools and what comes before the first outside user

- Date: 2026-10-13
- Source: the maintainer, on 2026-10-13: *"Análise de segurança, precisamos
  que a aplicação seja resistente a ataques hackers, nos proteger de
  acessos a bots e etc. Em paralelo, pede para o Fable fazer um ADR a
  respeito para rodarmos assim que der."* Written by Fable 5.1 at the
  maintainer's request, a swap of the roles of
  [0032](0032-author-and-reviewer-roles.md) (documents are Opus's) as
  [0080](0080-the-trash-with-expiry-and-restore.md), 0081 and 0082 were;
  to be read by Opus 5.5 before it is accepted. The analysis behind it:
  [`docs/reference/security-review-2026-10-13.md`](../reference/security-review-2026-10-13.md),
  whose findings F1 to F23 the items below cite.
- Related: [0073](0073-self-hosted-server-first.md) (item 6: security in
  full before the first user who is not the maintainer; the threat model
  before the announcement), [0074](0074-accounts-and-access-on-the-server.md)
  (item 3 sign-in, item 8 tokens and devices, item 9 limits and the audit
  log — "never a lock a stranger can use"), [0075](0075-server-packaging-and-storage.md)
  (the unit, the image, the two directories), [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (the console), [0045](0045-server-and-mcp-security.md), [0029](0029-guardrails-in-ci.md)
  (a feature guardrail enters with its feature and is seen failing first),
  [0033](0033-pr-workflow.md) (the levels), [0035](0035-cross-cutting-requirements.md)
  (both languages, accessibility), `docs/reference/threat-model.md`.

## Context

UniVerso at HEAD af4d73a already has most of what a self-hosted server
needs against a stranger on the network: TLS or nothing, `Host` and
`Origin` checked, a CSRF token, Argon2id, growing delays by address and by
account, bounded connections and queues, confined paths, sandboxed files,
a sandboxed service and a non-root image, signed releases. The threat
model of 2026-10-11 closed 15 of its 17 gaps. The review of 2026-10-13
read the code again with the maintainer's question — bots, abuse, attacks
from outside — and the running server under `curl`, and found no
BLOCKING gap: nothing violates an invariant or an accepted decision, and
nothing loses data.

What it found is the difference between *resistant* and *in full*:

- The server defends itself and tells nobody. A failed sign-in is an
  audit row and no log line (F1), so fail2ban, CrowdSec and a NAS's own
  banning read nothing; the per-key delay caps at 60 s, so one account
  takes some 1 440 guesses a day for ever and the person is never told
  (F2); a 12-character password from the lists attackers try is accepted
  (F3).
- A person who recovers from a stolen password keeps the thief's token
  (F4). Behind Cloudflare, or any proxy with several addresses, the
  forwarded headers cannot be believed and every per-address limit keys
  the proxy — a stranger's three failures slow everyone (F5).
- The server's own parsers are not fuzzed (F6), the npm half of the tree
  is not checked for advisories (F7), there is no address to report a
  vulnerability to (F8), the outside review 0073 asks for is still to
  come (F9), and a backup leaves the machine in the clear (F10).
- Thirteen smaller things (F11 to F23): a mailbox floodable, hyper's
  header buffer, a note room's 48 MB update, no rate on the REST routes,
  no fresh proof for sensitive actions, a few header values, the device
  page's link, secrets in the compose example, the container's
  capabilities, a folder's mode, log and audit growth, PDF.js's eval flag,
  the update check's redirects.

The maintainer's words set the bar — *resistente a ataques*, *proteger
de bots* — and 0073 item 6 sets the moment: before the first user who is
not the maintainer. This ADR turns the review into measures, each with
its default numbers, the crate and file it lands in, and the test that
guards it; each number the maintainer may want to change, and each
measure that costs people something, is `[OPEN]` with a recommendation.

## Decision

Proposed. Each `[OPEN]` carries a recommendation; the maintainer decides.
What has no `[OPEN]` is proposed as written. Sizes: S is hours, M a day
or two, L more.

1. **Every refused sign-in is one line of the server's log, in a fixed
   format, for the host's tools** (F1). `crates/verso-server/src/api.rs`
   (`sign_in`, `password`), `passkeys.rs` (`sign_in_finish`), `device.rs`
   (a wrong poll secret), and the limiter's refusals (`limited`), each:
   `WARN sign-in failed from <address> for <masked e-mail> (<n> in a
   row)` — the address as the trusted proxy forwarded it, IPv4 whole and
   IPv6 by its /64 as the limiter keys it, the e-mail as `a***@example.org`,
   the count of the account's failures since its last success; and
   `WARN sign-in limited from <address>` at most once a minute per key.
   The prefix `sign-in failed from` is reserved: a window's `log_write`
   lines begin with `window <id> (<account>):` (`rpc.rs`), so a member
   cannot forge one. A fail2ban filter and jail
   (`packaging/server/fail2ban/universo.conf`, `jail.d/universo.conf`:
   `failregex = ^\S+ WARN sign-in failed from <HOST> `, `maxretry = 10`,
   `findtime = 10m`, `bantime = 1h`) and a CrowdSec parser and scenario
   (`packaging/server/crowdsec/`) with the same threshold; the
   installation guide gains a section on both and on Caddy's `rate_limit`.
   Guardrail: a test in `tests_bounds.rs` that a failed sign-in says the
   line with that prefix and the masked address, that a `log_write` of
   `sign-in failed from …` comes out prefixed `window`, and that the
   fail2ban regex, run over the test's lines with a small matcher,
   catches exactly the failures. Size S.
   - `[OPEN]` Ship the fail2ban filter in the `.deb`/`.rpm` (under
     `/etc/fail2ban/filter.d/`, inert without fail2ban) or in the
     documentation only. *Recommendation:* in the package, so that
     `sudo systemctl enable fail2ban` is the whole setup; CrowdSec files
     in the documentation, since its parsers live in its hub.

2. **A ceiling, and a notice, on sign-ins** (F2). The per-key delay stays
   as it is (3 free, 1 s doubling to 60 s, never a lock — 0074 item 9).
   Above it: *per account*, after 20 failures within an hour from any
   address, one mail to the account (when the server has a mail server)
   saying when and from where, once a day at most, and an `INFO` line for
   the admin; the console's overview counts "accounts under attack today".
   *On the server*, a token bucket of failed sign-ins — 10 a second
   sustained, 50 at once, `fair.rs`'s bucket — past which every sign-in
   waits its turn (2 s at the bucket's floor), said in the log once a
   minute: a flood across many keys slows the flood and the honest
   sign-in alike by seconds, never locks. `crates/verso-server/src/limit.rs`,
   `api.rs`, `console.rs`, `mail.rs`. Guardrail: unit tests of the
   bucket and the hourly count; a test that the mail is sent once and the
   21st failure does not send again. Size M.
   - `[OPEN]` The numbers: 20 failures an hour for the notice; 10 a
     second, 50 at once for the server. *Recommendation:* as written;
     measured on the 1 GB host in item 18 and adjusted there.
   - `[OPEN]` Whether, after the notice, an account that has a passkey
     refuses its password until the passkey or a reset link is used.
     *Recommendation:* no — it is a lock a stranger can use, the thing
     0074 item 9 forbids; the notice and the delay are enough.

3. **A password from the lists attackers try is refused** (F3). The
   10 000 commonest passwords from a public list under a permissive
   licence (recorded in the PR, as 0029 asks of a dependency), lower-cased,
   in `crates/verso-server/passwords.txt`, `include_str!`'d, looked up in
   a `HashSet` built once; refused — with the message *this password is
   on the lists attackers try first* in both languages — at setup, at an
   invitation's acceptance, at a reset, at a change, and for
   `VERSO_ADMIN_PASSWORD` at start (an error that names the variable);
   also refused: the e-mail's local part, and the e-mail itself. 12
   characters stays the floor. `api.rs` (`check_password`), `config.rs`,
   `lib.rs`. Guardrail: a test that `password1234` and `qwertyuiop12`
   are refused and a four-word passphrase is accepted; the file's size
   bounded in the test (under 200 KB). Size S.
   - `[OPEN]` A k-anonymity check against Have I Been Pwned's range API
     (five characters of the SHA-1 sent, nothing identifying). *Recommendation:*
     no — it is an outbound request to a third party from a server that
     reaches nothing but the release feed and the host's SMTP (threat
     model, "the server's own reach"), and the embedded list catches the
     stuffing lists' bulk.

4. **Recovery revokes the account's tokens** (F4). A password reset (a
   link's use, `api.rs` `reset`, and `admin reset`) revokes every
   personal access token of the account beside ending its sessions, with
   an audit line per token; a password change (`api.rs` `password`) does
   the same when the request says so (`revokeTokens: true`), which the
   window's form offers checked by default, and otherwise says in the
   answer how many tokens stay. `db.rs` gains `revoke_tokens_of`. Guardrail:
   a test that a token answers 401 after a reset, and after a change with
   the flag. Size S.

5. **Several trusted proxies, and a warning when one forwards nothing**
   (F5). `VERSO_TRUSTED_PROXY` takes a comma-separated list of addresses
   and CIDRs (`127.0.0.1, 10.0.0.0/8, 2001:db8::/32`); the client's
   address is the right-most entry of `X-Forwarded-For` that is not in
   the list, walking left, as every proxy chain is read; a request from a
   trusted address with no `X-Forwarded-For` is served with the proxy's
   address and said in the log once a minute (*a request from the trusted
   proxy carried no X-Forwarded-For: is the proxy configured to forward
   it?*). The installation guide gains the Cloudflare recipe (Cloudflare's
   published ranges in the list, or Cloudflare → Caddy → Verso with Caddy
   trusted alone) and the warning that a proxy not in the list makes
   every visitor one address. `crates/verso-server/src/config.rs`,
   `auth.rs` (`peer`), `listen.rs` (`Slots::take`). Guardrail: unit tests
   of the walk (two hops, a spoofed left entry, an address in a CIDR). Size S.

6. **A fresh proof before a sensitive action** (F15, and the device
   page's approval). Creating a token, adding or removing a passkey,
   approving a device, changing the e-mail (when that exists), and, for
   the admin, deleting an account, changing powers, ending another's
   sessions and entering a folder, need a sign-in within the last 10
   minutes: a session keeps `proved_at`; `POST /api/me/prove` takes the
   password or a passkey assertion and stamps it; a sensitive route
   answers 403 `prove_first` otherwise, and the window asks on the spot
   and retries. The 10 minutes are a constant, not a setting. `db.rs`,
   `api.rs`, `passkeys.rs`, `device.rs`, `admin.rs`, the window's
   `web/account.ts` and `web/console.ts`. Guardrail: a test per route
   that it answers `prove_first` after the mark is older than 10 minutes
   and succeeds within. Size M.
   - `[OPEN]` Whether this is before the first outside user or before the
     announcement. *Recommendation:* before the announcement — the first
     outside users are invited people on a server with few accounts, and
     the tokens are already scoped and revocable.

7. **A pace on the REST routes, per address** (F14). A token bucket per
   address key — 20 requests a second sustained, 100 at once — on every
   route under `/api/` except the WebSocket's upgrade (which `fair.rs`
   already counts), loopback and the trusted proxies excluded, 429 with
   `Retry-After` past it, said in the log once a minute per key; the
   window's files and the page are left to the connection limits (a page
   load is a burst of files). `crates/verso-server/src/http.rs` (a layer
   beside `guard`), `fair.rs` (the bucket, reused). Guardrail: a test in
   `tests_bounds.rs` that the 101st request in a burst answers 429 and
   the next second's does not. Size S.
   - `[OPEN]` The numbers. *Recommendation:* as written — a window's
     REST use is a few requests a minute; sync and the window's commands
     go over the WebSocket, under `fair.rs`.

8. **The bounds the review found loose, each tightened** (F11, F12, F13,
   F17, F22, F23), one PR, size S in all:
   - the mail routes take a second key, `mail:<folded e-mail>`, with the
     same delay as the sender's (`api.rs`);
   - hyper's `max_buf_size(64 * 1024)` on the connection builder
     (`listen.rs`), so a request's headers are 64 KiB at most;
   - a note room refuses a Yjs update above 4 MB — `collab_board.rs`'s
     `UPDATE_MOST`, shared — before decoding it (`collab.rs`);
   - a wrong poll secret counts against the `device:` key of its address
     (`device.rs`);
   - `isEvalSupported: false` on both `getDocument` calls (`app/ui/src/pdf.ts`);
   - the update check's client with `redirect(Policy::none())`
     (`update.rs`).
   Guardrail: a test per bound in `tests_bounds.rs` (the 64 KiB header
   refused with 431, the 4 MB update refused, the poll delay) and the
   PDF option asserted by `test/pdf.test.mjs`.

9. **The headers completed, and asserted** (F16). HSTS gains
   `includeSubDomains` when the server serves its own TLS or the public
   address is HTTPS; `Permissions-Policy` gains `usb=(), serial=(),
   bluetooth=(), interest-cohort=()`; nothing else changes (`style-src
   'unsafe-inline'`, `img-src https:` and `frame-src https:` stay, for the
   reasons of the review's section 3.2). `http.rs`. Guardrail: a test
   that asserts the whole set of headers, name and value, on `/`,
   `/api/state` and `/f/<folder>/<file>` — the set the review's section
   3.2 lists — so that a header lost in a refactor is seen. Size S.
   - `[OPEN]` `preload` on HSTS. *Recommendation:* no — it is the host's
     irreversible choice for their domain, not the server's default.

10. **The audit log expires** (F21). `VERSO_AUDIT_DAYS`, 365 by default,
    0 for never, bounded like `VERSO_TRASH_DAYS`; a sweep once a day
    beside the trash's deletes rows older than that; the console's
    overview says the retention. `config.rs`, `db.rs`, `lib.rs`,
    `console.rs`; `packaging/server/universo.env` and the guide. Guardrail:
    a test that a row older than the retention goes and a younger one
    stays. Size S.
    - `[OPEN]` 365 days. *Recommendation:* 365 — a year of who signed in
      from where is what a person asks for after an incident, and it is
      personal data (addresses) that should not be kept for ever.

11. **The package hardened** (F18, F19, F20). The unit gains
    `ProtectProc=invisible`, `ProcSubset=pid`,
    `SystemCallFilter=@system-service`, `SystemCallFilter=~@privileged
    @resources`, `UMask=0027`; `verso_fs::server::make_folder` creates a
    folder `0750`; the compose file declares `read_only: true`, `tmpfs:
    [/tmp]`, `cap_drop: [ALL]`, `security_opt:
    [no-new-privileges:true]`, and shows `VERSO_ADMIN_PASSWORD_FILE` with
    a Docker secret before the plain variable, as the guide does.
    `packaging/server/universo.service`, `docker-compose.yml`,
    `crates/verso-fs/src/server.rs`, `docs/reference/server-install.md`.
    Guardrail: the folder's mode in `server.rs`'s tests; the unit and the
    image started on the lab's VM by `scripts/check-linux.sh`'s package
    step (the server answering `/api/state` under the new unit and the
    read-only container), seen failing first with a syscall the filter
    denies. Size S.

12. **A backup that can leave the machine** (F10). `universo.sh backup`
    gains `--encrypt`: with `age` installed, the tarball is piped through
    `age -r <recipient>` where the recipient is the public key in
    `/etc/universo/backup.pub` (made once by `universo.sh backup --keygen`,
    which prints the secret key for the host to keep elsewhere) or, with
    `--passphrase`, a prompted passphrase; without `age`, the script says
    how to install it and makes the plain tarball with the present warning
    in capitals; `backup --to-stdout` writes the tarball to standard
    output for the host's own pipeline. The restore line in the message
    changes accordingly. `packaging/server/universo.sh`, the guide's
    section 2. Guardrail: `scripts/check-linux.sh`'s script test makes a
    backup with a throw-away key, restores it to a scratch root and
    compares. Size M.
    - `[OPEN]` `age` as the tool (one static binary, in Debian, Ubuntu,
      Fedora and Alpine repositories, X25519 recipients, no key
      management beyond a file) against `openssl enc` (present everywhere,
      a passphrase only, easy to misuse) or GnuPG (heavy). *Recommendation:*
      `age`, optional, the plain backup kept as the fallback with the
      warning.

13. **Advisories on the npm tree, as `cargo deny` on the Rust tree** (F7).
    `node scripts/check-npm-audit.mjs` runs `npm audit --json` in `app/ui`
    and fails on any advisory of severity high or critical that is not in
    `app/ui/audit-exceptions.json` (an id, a reason with a link, an expiry
    date; an expired exception fails, as `deny.toml`'s policy); in the
    Linux CI job beside the licence check and in `scripts/check.sh`.
    Guardrail: it is one; seen failing first with a fabricated exception
    that has expired. Size S.

14. **The server's inputs fuzzed** (F6). `crates/verso-server/fuzz/` with
    `cargo-fuzz` targets for: the WebSocket request (`Request` through
    `serde_json`), `verso_core::sync::unframe`, a Yjs update integrated
    into a note room and into a board room (through the board's merge),
    a presence update (`collab.rs`'s awareness reader), `host_ok` and
    `expected_origin` on arbitrary headers, and `config::size`; each 60 s
    on `main`, in the fuzz job beside the dialect's and the canvas's
    (`.github/workflows/ci.yml`), a crash kept as an artifact. Guardrail:
    it is one; seen failing first with a target over a deliberately
    panicking stub. Size M.

15. **A way to report a vulnerability** (F8). `SECURITY.md` at the root
    (its pt-BR twin under `docs/pt-BR/`, as the mirror check expects): the
    address, the promise — an acknowledgement within 7 days, a fix in the
    next version for the supported line, credit when wanted — what is in
    scope (the server, the app, the site) and what is not (the host's
    machine, a member's own data, denial of service against a server one
    does not run), and the signing key for encrypted mail. The server
    serves `/.well-known/security.txt` (`http.rs`, a static route) with
    `Contact:`, `Expires:` one year ahead of the build, `Preferred-Languages:
    pt-BR, en`, `Canonical:` and `Policy:` pointing at the file; the site
    serves the same. Guardrail: a test that the route answers with the
    required fields and an `Expires` in the future; the mirror check for
    the twin. Size S.
    - `[OPEN]` The address. *Recommendation:* `security@versomd.com`, a
      mailbox the maintainer reads; no bug bounty.

16. **The outside reading, and the sanitizer's cross-review** (F9). Before
    the announcement: `app/ui/src/sanitize.ts` read by the model that did
    not write it (Opus 5.5 wrote c7f8c8d: the reading is Fable's), with
    the suite run in WebKit and Chromium through the harness; and a
    penetration test of the lab server (`docs/reference/sync-lab.md`) by
    a person outside the project, against the API, the WebSocket and the
    window as a hostile member and as a stranger, its findings classified
    and closed in a PR of their own. Guardrail: the harness run of the
    sanitizer's cases, kept in `npm run e2e`. Size L for the pentest
    (outside the project's hours), S for the reading.
    - `[OPEN]` Whether the pentest is a condition of the announcement or
      of the first outside user. *Recommendation:* of the announcement;
      the first outside users are invited and known, and items 1 to 5, 8
      to 10 and 13 are what they need.

17. **No CAPTCHA; no proof-of-work; the device page keeps its link.** A
    CAPTCHA from a third party brings that party's script into the sign-in
    page, which the page's policy forbids and the project's privacy and
    accessibility commitments do not allow (the review's section 2.8). A
    proof-of-work challenge before sign-in is self-hosted and invisible
    but taxes a phone's battery and raises an attacker's cost by a second
    per attempt, which items 1 and 2 raise more without the battery. The
    device approval page keeps taking the code from the link (0074 item
    8, gap 12 as decided on 2026-10-12), and item 6's fresh proof covers
    the approval.
    - `[OPEN]` Proof-of-work. *Recommendation:* no, recorded as considered.
    - `[OPEN]` The device page asks the person to type the code when the
      link carries none, as GitHub does, and shows the typed one. *Recommendation:*
      yes, S, with item 6; the link stays for the app's own flow.

18. **The numbers measured.** The connection, queue, pace and bucket
    numbers of items 2 and 7 and of the threat model's attack surface are
    measured on the lab's 1-core, 1 GB server with the kit, under a flood
    of connections, of sign-ins and of commands, and recorded in
    `docs/reference/server-install.md` section 15 with the date; a number
    the measurement contradicts is changed in the same PR. Size M.

### Order of work

- **Before the first user who is not the maintainer** (0073 item 6):
  items 1, 2, 3, 4, 5, 8, 9, 10 and 13 — the log line and the host's
  filters, the ceiling and the notice, the deny list, recovery revoking
  tokens, the proxy list, the loose bounds, the headers asserted, the
  audit retention, the npm advisories. About two days in all.
- **Before the announcement** (0073 item 6, the threat model's "gaps
  before the announcement"): items 6, 7, 11, 12, 14, 15, 16 and 18 — the
  fresh proof, the REST pace, the package, the encrypted backup, the
  fuzzing, the disclosure channel, the cross-review and the pentest, the
  measurement.
- **Later, in ADRs of their own or not at all:** OIDC and TOTP (0074 item
  3), a read log per folder (the review's section 2.7), the device token
  in the system keychain and end-to-end encryption (the threat model's
  `[OPEN]`), ACME built in (0073 item 6). Not at all, unless the
  maintainer says otherwise: a CAPTCHA, a proof-of-work, Have I Been
  Pwned, account lockout.

## Consequences

- What people feel: a password they chose refused at setup or at an
  invitation because it is on the list (item 3) — the message says why
  and asks for another; a sign-in that waits seconds while the server is
  under a flood (item 2) — never a lock; a mail saying someone is trying
  their password (item 2); their tokens gone after a reset (item 4) — the
  window says so; the password or the passkey asked again before a token
  is made or a device approved (item 6), ten minutes at a time; a
  household behind one address slowed by one member's failures, as today;
  a host that runs fail2ban banning a shared address for an hour after
  ten failures (item 1) — the jail's numbers are the host's to change.
- What the host gains: a log line their tools read, a filter in the
  package, a proxy list, a backup they can copy off the machine, an
  address to write to, a unit and an image that do less.
- What the project pays: a fuzz job of some minutes more on `main`; an
  `npm audit` that goes red on a new advisory with no PR to blame, with
  the same exception policy as `deny.toml`; a password list of a few
  hundred kilobytes in the binary; the pentest's cost, in hours or money,
  before the announcement; a test per bound, which is the point.
- What stays as it is, said again: the host sees the notes; the server
  reaches nothing but the release feed and the host's SMTP; nothing of a
  member leaves the server to a third party; accessibility is not traded
  for a gate.
- The threat model gains a pointer to the review and to this ADR, and
  marks gap 10 as answered by item 16 when it is done; it is refreshed
  again when the items before the first outside user are built.

## Discarded alternatives

Considered in the review of 2026-10-13 and set aside; each may be taken
up by the maintainer:

- **Account lockout** after N failures: forbidden by 0074 item 9, a lock a
  stranger can use against the owner; the notice of item 2 instead.
- **A CAPTCHA** (Turnstile, hCaptcha, reCAPTCHA): a third party's script
  on a self-hosted server, a wall for a screen-reader user, against the
  page's policy; item 17.
- **Have I Been Pwned's range API** for passwords: an outbound request the
  server does not make today; the embedded list of item 3 instead.
- **`SameSite=Strict`** on the session cookie: breaks the first navigation
  from a mail's link; `Lax` plus `Origin` plus the token is the set.
- **A nonce-based `style-src`**: the renderer's inline styles would have
  to be rewritten; the sanitizer tames them instead.
- **Encrypting the backup with `openssl enc` or GnuPG** instead of `age`:
  item 12's `[OPEN]`.
- **A read log per folder** to tell scraping from reading: a row per read,
  recorded for a later ADR, not now.

## Status

Proposed (2026-10-13), written by Fable 5.1 at the maintainer's request;
to be read by Opus 5.5. The maintainer decides each `[OPEN]` and the
order; nothing here is built. When accepted, the items before the first
outside user go in one PR with their guardrails, each seen failing first
(0029), and the review's findings table says what closed each.
