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
- Revisions: 2026-10-21 — two points the maintainer answered in the decisions
  questionnaire of 2026-10-20 (answered 2026-10-21): item 15's mailbox
  (0083.15, option B: it does not exist yet, he will create it; the point
  stays open until then) and the `yrs` fuzzing findings (0083.14, option C:
  not reported upstream; our guards stay). 2026-10-21, later — the first
  surface open to a visitor with no account, the read links of
  [0105](0105-read-links-without-an-account.md), is built; the threat model
  (`docs/reference/threat-model.md`) has its rows, and `tests_threats.rs`
  asserts item 9's headers on `/r/<token>`, `/r/<token>/state` and
  `/r/<token>/f/` too. No item of this ADR changes.

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
measure that costs people something, was `[OPEN]` with a recommendation,
and was decided on 2026-10-13 (Status).

## Decision

Accepted on 2026-10-13. Each point that was `[OPEN]` carried a
recommendation and is now marked `[DECIDED 2026-10-13]`: the maintainer
accepted every recommendation (Status). What had no `[OPEN]` is decided
as written. Sizes: S is hours, M a day or two, L more.

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
   catches exactly the failures. Size S. *(2026-10-13, as built: see below)*
   - `[DECIDED 2026-10-13]` Ship the fail2ban filter in the `.deb`/`.rpm` (under
     `/etc/fail2ban/filter.d/`, inert without fail2ban) or in the
     documentation only. *Recommendation:* in the package, so that
     `sudo systemctl enable fail2ban` is the whole setup; CrowdSec files
     in the documentation, since its parsers live in its hub. *Decided:*
     in the package; the CrowdSec files in the documentation.

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
   - `[DECIDED 2026-10-13]` The numbers: 20 failures an hour for the
     notice; 10 a second, 50 at once for the server. *Recommendation:* as
     written; measured on the 1 GB host in item 18 and adjusted there.
     *Decided:* as written, measured in item 18 and adjusted there.
   - `[DECIDED 2026-10-13]` Whether, after the notice, an account that
     has a passkey refuses its password until the passkey or a reset link
     is used. *Recommendation:* no — it is a lock a stranger can use, the
     thing 0074 item 9 forbids; the notice and the delay are enough.
     *Decided:* no.

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
   bounded in the test (under 200 KB). Size S. *(2026-10-13, as built: see below)*
   - `[DECIDED 2026-10-13]` A k-anonymity check against Have I Been
     Pwned's range API
     (five characters of the SHA-1 sent, nothing identifying). *Recommendation:*
     no — it is an outbound request to a third party from a server that
     reaches nothing but the release feed and the host's SMTP (threat
     model, "the server's own reach"), and the embedded list catches the
     stuffing lists' bulk. *Decided:* no; the embedded list only.

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
   *(Amended on 2026-10-16, quoting the maintainer in
   [0073](0073-self-hosted-server-first.md)'s Revisions: an empty
   `VERSO_TRUSTED_PROXY` no longer means "none is believed" but "a proxy on
   loopback or a private network is" — 127.0.0.0/8, ::1, 10.0.0.0/8,
   172.16.0.0/12, 192.168.0.0/16, fc00::/7; a value replaces that list and
   `none` believes no proxy. The connection limit of `Slots` still exempts
   only loopback and the proxies the host named, and the warning of a
   trusted proxy that forwards nothing is said only of a named one. The
   consequence, plainly: a client on a private network can
   forge `X-Forwarded-For` and be counted under the address it writes — and
   in Docker a visitor who comes through a port published through docker-proxy (a loopback-published port, a hairpin, IPv6 onto an IPv4 bridge, Docker Desktop, rootless Docker) arrives from the bridge gateway (172.16.0.0/12), which the default believes, so an internet client can; rootful Linux Docker with iptables NAT keeps the client's address, and is not affected. Only a loopback socket that forwarded nothing is exempt from
   the pace, the in-flight cap and the WebSocket cap; a forwarded `127.0.0.1`
   is counted like any other address. An attacker who rotates forged
   addresses still defeats the per-address limits; the account's own delay
   and the lock hold. Name the real proxies, or `none`, to close it. Item 5's other words stand.)*

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
   - `[DECIDED 2026-10-13]` Whether this is before the first outside
     user or before the announcement. *Recommendation:* before the
     announcement — the first outside users are invited people on a server
     with few accounts, and the tokens are already scoped and revocable.
     *Decided:* a condition of the announcement, not of the first outside
     user; built in this round all the same (Order of work).

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
   - `[DECIDED 2026-10-13]` The numbers. *Recommendation:* as written —
     a window's REST use is a few requests a minute; sync and the window's
     commands go over the WebSocket, under `fair.rs`. *Decided:* as
     written, adjusted after item 18's measurement.

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
   PDF option asserted by `test/pdf.test.mjs`. *(2026-10-13, as built: see below)*

9. **The headers completed, and asserted** (F16). HSTS gains
   `includeSubDomains` when the server serves its own TLS or the public
   address is HTTPS; `Permissions-Policy` gains `usb=(), serial=(),
   bluetooth=(), interest-cohort=()`; nothing else changes (`style-src
   'unsafe-inline'`, `img-src https:` and `frame-src https:` stay, for the
   reasons of the review's section 3.2). `http.rs`. Guardrail: a test
   that asserts the whole set of headers, name and value, on `/`,
   `/api/state` and `/f/<folder>/<file>` — the set the review's section
   3.2 lists — so that a header lost in a refactor is seen. Size S.
   - `[DECIDED 2026-10-13]` `preload` on HSTS. *Recommendation:* no — it
     is the host's irreversible choice for their domain, not the server's
     default. *Decided:* no `preload`.

10. **The audit log expires** (F21). `VERSO_AUDIT_DAYS`, 365 by default,
    0 for never, bounded like `VERSO_TRASH_DAYS`; a sweep once a day
    beside the trash's deletes rows older than that; the console's
    overview says the retention. `config.rs`, `db.rs`, `lib.rs`,
    `console.rs`; `packaging/server/universo.env` and the guide. Guardrail:
    a test that a row older than the retention goes and a younger one
    stays. Size S.
    - `[DECIDED 2026-10-13]` 365 days. *Recommendation:* 365 — a year of
      who signed in from where is what a person asks for after an
      incident, and it is personal data (addresses) that should not be
      kept for ever. *Decided:* 365 days.

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
    denies. Size S. *(2026-10-13, as built: see below)*

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
    - `[DECIDED 2026-10-13]` `age` as the tool (one static binary, in Debian, Ubuntu,
      Fedora and Alpine repositories, X25519 recipients, no key
      management beyond a file) against `openssl enc` (present everywhere,
      a passphrase only, easy to misuse) or GnuPG (heavy). *Recommendation:*
      `age`, optional, the plain backup kept as the fallback with the
      warning. *Decided:* `age`, optional, the plain backup with the
      warning as the fallback.

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
    - `[DECIDED 2026-10-13]` The address. *Recommendation:*
      `security@versomd.com`, a mailbox the maintainer reads; no bug
      bounty. *Decided:* `security@versomd.com`, no bug bounty; that the
      mailbox exists is still for the maintainer to confirm, which does
      not hold the item back. *2026-10-21* (0083.15, option B): **the
      mailbox does not exist yet; the maintainer will create it.** The
      point stays `[OPEN]` until he confirms it exists — until then the
      `security.txt` promises an address nobody reads.

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
    - `[DECIDED 2026-10-13]` Whether the pentest is a condition of the
      announcement or of the first outside user. *Recommendation:* of the
      announcement; the first outside users are invited and known, and
      items 1 to 5, 8 to 10 and 13 are what they need. *Decided:* a
      condition of the announcement; the sanitizer's cross-reading is done
      in this round (Order of work).

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
    - `[DECIDED 2026-10-13]` Proof-of-work. *Recommendation:* no,
      recorded as considered. *Decided:* no.
    - `[DECIDED 2026-10-13]` The device page asks the person to type the
      code when the link carries none, as GitHub does, and shows the typed
      one. *Recommendation:* yes, S, with item 6; the link stays for the
      app's own flow. *Decided:* yes, with item 6.

18. **The numbers measured.** The connection, queue, pace and bucket
    numbers of items 2 and 7 and of the threat model's attack surface are
    measured on the lab's 1-core, 1 GB server with the kit, under a flood
    of connections, of sign-ins and of commands, and recorded in
    `docs/reference/server-install.md` section 15 with the date; a number
    the measurement contradicts is changed in the same PR. Size M.

    *Measured 2026-10-15* (what normal use costs and whether it fits;
    **no flood was run**: nothing here was aimed at overwhelming the
    server or going around a protection, and every number below is for
    use the server is meant to take). Lab: VM 107 on the Proxmox host,
    1 core, 1 GB, Ubuntu 26.04, the release's static musl binary from the
    `.deb` of 0.8.2-beta.1 installed by `universo.sh` (Path 1 of lesson
    24), no swap, systemd's default 1 024 open files. The kit's
    `scripts/server-load.mjs` ran from a Mac over an SSH tunnel to the
    loopback, with `X-Forwarded-For` and `X-Forwarded-Proto: https` of
    one fixed household address, as Caddy would send them
    (`VERSO_TRUSTED_PROXY=127.0.0.1`), because a connection from
    loopback itself is exempt from the per-address limits and would hide
    them. Three accounts (the admin, two editors), devices spread evenly,
    120 s a run (60 s flat out), every read checked byte for byte
    (0 mismatches in 5 runs; the kit's check of the files on the
    server's disk was not run, the disk being on the other machine). The
    only errors were `put_hot:changed`, the shared note's refusals by
    design. Sampled once a second on the VM. The lab's disk is slow: a
    synchronous 4 KiB write takes about 26 ms (`dd oflag=dsync`), so the
    write figures below are the lab's disk, not the server's ceiling; a
    cloud VPS with an SSD will be several times faster.

    | Run | Devices | Ops/s | Write p50 / p95 (ms) | Read p50 / p95 (ms) | Process CPU avg / max | System CPU busy / iowait | RSS peak (MB) |
    |---|---|---|---|---|---|---|---|
    | idle, after start | 0 | 0 | | | 0 % | | 13 |
    | 48 connected, idle | 48 | 0 | | | 4 % | | 53 (139 while connecting) |
    | household, 1 op/s each | 12 | 9 | 314 / 1 430 | 71 / 554 | 11 % / 69 % | n/a | 104 |
    | 2 op/s each | 24 | 14 | 1 397 / 4 656 | 125 / 1 366 | 38 % / 86 % | 50 % / 48 % | 202 |
    | 2 op/s each | 48 | 14 | 3 611 / 8 045 | 116 / 1 189 | 40 % / 91 % | 55 % / 44 % | 274 |
    | flat out | 12 | 16 | 966 / 2 472 | 89 / 221 | 35 % / 87 % | 47 % / 52 % | 143 |
    | flat out | 48 | 15 | 4 335 / 9 900 | 103 / 299 | 42 % / 90 % | 57 % / 43 % | 255 |

    The writes saturate near 15 a second whatever the number of devices
    (the wait grows with the queue; one folder writes one file at a
    time), and the process is waiting on the disk, not computing. A
    change-list question is 5 to 8 ms at p50 and 13 to 69 ms at p95.
    Memory is not the constraint: 290 MB the highest RSS in the whole
    session (the allocator keeps what it took; a restart gives 13 MB
    back), at least 490 MB of the 956 left, 122 descriptors of 1 024.
    Sign-in costs 100 to 190 ms (the password hash); `/api/state` 3 ms
    at p50. A folder of 3 000 notes (12 MB): first open, with the index
    built, 4.5 s; list 33 ms; tag list 336 ms; search p50 37 ms, p95
    73 ms; backlinks p50 113 ms, p95 221 ms; a note read 8 ms; 82 % CPU
    during that window, RSS from 39 to 63 MB. A fresh device's first
    sync of the same folder, 3 000 files, 12 MB: the change list in
    three pages (the first 1.4 s while the folder was scanned, the rest
    40 ms), then 26 s of reads, 115 files a second, whether one at a time
    or eight in flight.

    | Limit (item) | Number | Normal use reached it? | Verdict |
    |---|---|---|---|
    | Sign-in notice (2) | 20 failures an hour | no: three wrong passwords are free, then 1 s and doubling; twenty take 12 minutes of trying | fits |
    | Failed sign-ins on the server (2) | 10 a second, 50 at once | no: only failures count | fits for people; **too loose for this host** by arithmetic, not tested by a flood: a hash is 100 to 190 ms on the core, so 10 a second is more than one core can verify |
    | REST pace per address (7) | 20 a second, 100 at once | no: a sign-in, a pairing and 40 state reads stayed far under; a browser's own count of `/api/` calls on opening the window was not measured (no browser run) | fits |
    | WebSockets per account, per address (fair.rs) | 32, 64 | no: 16 and 48 held together from one address | fits |
    | Connections, per address (listen.rs) | 512, 128 | no: 122 descriptors at the peak | fits |
    | Commands per account (fair.rs) | 100 a second, 400 at once | **yes**, by a fresh device's first sync of a big folder: the log said `account … sends commands past 100 a second: they wait their turn` and 3 000 reads took 26 s (400 + 100 x 26) | too tight for a first sync of thousands of files (a wait, never a refusal); a folder of 10 000 would take about 85 s |
    | Commands on the server (fair.rs) | 1 000 a second, 2 000 at once | no: 115 a second at the most, reads of one account | fits, but it does not bound the queue on this host: the writes saturate at 15 a second, 60 times lower, and the wait is the one folder's |
    | A device pairing (the per-key delay of item 2) | 3 free, then 1 s doubling to 60 s | **yes**, from the fourth pairing in an hour from one address: waits of 2, 4, 16, 32 and 60 s seen on `approve` | too tight for a household setting up its devices in one evening |

    Proposals, for the maintainer to decide (no code was changed):
    (a) lower the failed-sign-in bucket to about 4 a second sustained and
    20 at once, so that a flood at the bucket's rate no longer takes the
    whole core; (b) give a first sync room: count a batch of reads for one
    command, or raise the account's burst to a few thousand, or keep
    100 a second and say in the app that the wait is expected; (c) count
    only failures against the pairing delay, or give `device:` keys six
    free; (d) say in the install guide that on a disk this slow, writes
    top out near 15 a second and that is the disk. Not measured: the
    CPU and the latency behind a real proxy (Caddy on the IP and
    Tailscale cannot be done in the lab), a browser, a phone, a flood of
    connections or sign-ins, the 4 MB room-update bound.

    *Decided 2026-10-15* (the maintainer, "aceito todas recomendações"),
    built on `feat/decisions-1015`: (a) the failed-sign-in bucket is 4 a
    second sustained and 20 at once (`signin.rs`: `FAILED_RATE`,
    `FAILED_BURST`); (b) the `sync_read`s of an account have an allowance
    of their own, 1 000 a second and 4 000 at once (`fair.rs`:
    `READ_RATE`, `READ_BURST`), apart from the 100 and 400 of its other
    commands, which they neither wait behind nor spend; the server's pace
    (1 000 and 2 000) still counts every one, and a flood of reads past
    the allowance waits like any other command, so a hostile account stays
    bounded; a first sync of 3 000 files is then paced by the server's
    burst (about a second), not 26 s; (c) only failed attempts grow the
    pairing delay of a `device:` key: a start counts nothing, a wrong
    code or poll secret still does, and a flood of codes is bounded by
    the codes one address may keep waiting and by the REST pace; (d) the
    install guide says that a slow disk bounds writes (about 15 a second
    on a disk doing 26 ms per synchronous 4 KiB write) and how to check a
    disk.

19. **Validation in a hostile lab.** Decided by the maintainer on
    2026-10-13, in the same answer that accepted the recommendations:
    *"em seguida você deve emular um ambiente de ataque um ambiente hostil
    para validar todas as implementações e outras. Tenha em mente que o
    código é aberto, então o atacante se quiser ele vai ler o código, vai
    tentar encontrar a vulnerabilidade no código e usar isso a seu favor."*
    (next you must emulate an attack environment, a hostile environment,
    to validate all the implementations and others. Keep in mind that the
    code is open, so an attacker who wants to will read the code, try to
    find the vulnerability in it and use it to their advantage.) Once the
    items above are built, they are validated in a local attack lab, in
    Docker: the running server, and scripted attacks against it — over the
    network, as a stranger and as a hostile member — written on the
    assumption that the attacker has read the source code, since the code
    is public. Its findings are classified with the levels of
    [0033](0033-pr-workflow.md), and the fixes are made on the same
    assumption. It does not replace item 16's pentest by a person outside
    the project.

### Order of work

*(Rewritten on 2026-10-13, when the ADR was accepted. As proposed, it put
items 1, 2, 3, 4, 5, 8, 9, 10 and 13 before the first user who is not the
maintainer, and items 6, 7, 11, 12, 14, 15, 16 and 18 before the
announcement; the maintainer ordered everything built now: "toda rotina
de segurança possível que faça sentido para nossa aplicação tem que ser
implementada e feita".)*

- **In this round, from 2026-10-13:** every item — 1 to 15, 17, 18 and
  19 — and item 16's cross-reading of the sanitizer, in the numbered
  order where one depends on another (item 17's typed device code with
  item 6; item 18's measurement once the numbers of items 2 and 7 exist;
  item 19 after the items it attacks). Item 18 measures on the lab's
  server.
- **Outside this round, a condition of the announcement** (0073 item 6):
  item 16's penetration test by a person outside the project. Item 6's
  fresh proof was also decided as a condition of the announcement, not of
  the first outside user, and is built in this round all the same.
- **Later, in ADRs of their own or not at all:** OIDC and TOTP (0074 item
  3), a read log per folder (the review's section 2.7), the device token
  in the system keychain and end-to-end encryption (the threat model's
  `[OPEN]`), ACME built in (0073 item 6). Not at all, unless the
  maintainer says otherwise: a CAPTCHA, a proof-of-work, Have I Been
  Pwned, account lockout.

## As built (2026-10-13)

Built on 2026-10-13 on the branch `docs/security-hardening`, in the
merges of sec/edge (cf0aa7f: items 5, 7, 8, 9), sec/sign-in (fcddbf8:
items 1 to 4), sec/ops (29d11f7 and b5b9dae: items 10 to 13 and 15) and
sec/prove (c6fbf1a: items 6 and 17), sec/fuzz (d5ea899 and c1bc4cc:
item 14) and sec/sanitizer-harness (0b5fea1: item 16's reading and
suite). Below, item by item, where the code departs from the Decision's
text or reads it one way among several, as the builders recorded it in
their commits. Items 18 and 19 are not in these merges, nor item 16's
pentest, which is outside this round. A fact taken from a builder's
report and not found in the code or in a commit says *(reported)*.

**Item 1** (e9dda35). The Decision's `failregex` catches nothing:
fail2ban cuts the time out of a line it reads from a file, and puts
`<host> <program>[<pid>]: ` before a line it reads from the journal, so
`^\S+ WARN` matches neither; and `<HOST>` cannot take the /64 the line
carries for IPv6. The shipped filter is
`^\s*(?:\S+ \S+: )?(?:\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ )?WARN sign-in failed from <SUBNET> for \S+ \(\d+ in a row\)$`,
the jail reads the journal (`backend = systemd`), and nfpm installs both
files as `config|noreplace`. The test's matcher expands `<HOST>`,
`<ADDR>` and `<SUBNET>` as fail2ban 1.1 does and runs the filter over the
lines a test server wrote, in both shapes; it takes `regex` as a
dev-dependency (already in the tree, MIT OR Apache-2.0). `log::line` turns
a message's control characters into spaces, so no message writes a second
line. A device's poll names no account: its line says `for -` and its
count is keyed `device:<address>`. `sign-in limited` is said by every
caller of `api::limited`, by the passkey's start and by the device's
start.

**Item 2** (805febb, 97cfd3e). "Accounts under attack today" is read as
the last 24 hours. The notice is a row of the audit log,
`sign_in_noticed`, so the once-a-day rule holds across a restart; the row
is written whether or not the server has a mail server, and the console's
words say no more than that (97cfd3e). A passkey refused and a wrong
current password at a change count among the 20. Every sign-in — by
password, a passkey's finish, a device's poll — waits the server's debt
before it is heard, the debt never deeper than 2 s.

**Item 3** (c77902e). SecLists' top 10 000 holds only 24 passwords of 12
characters or more, and neither `password1234` nor `qwertyuiop12`; the
list is therefore the 10 000 commonest of 12 characters or more from the
same project's xato-net list of a million (MIT), with the source's
commit, address and SHA-256 and the command that made it in
`crates/verso-server/passwords.LICENSE`; 140 276 bytes. A password equal
to the account's e-mail or its local part answers the same
`common_password`. A reset checks the password before the link is used,
so a refused one leaves the link usable.

**Item 4** (ac59422, 66debdc). `revokeTokens` defaults to false on the
server, for pages older than the change; the window's form offers it
checked by default. `universo admin reset` revokes the tokens too, its
audit rows with the address `machine`. The tokens' queries moved first,
unchanged, to `db/tokens.rs` (66debdc, [0067](0067-source-files-stay-small.md):
`db.rs` was at 1 486 lines), where `revoke_tokens_of` is.

**Item 5** (748838d). `X-Forwarded-Proto` is still believed from any
trusted peer, not walked as `X-Forwarded-For` is. The Cloudflare recipes
of `docs/reference/server-install.md` follow Caddy's documented options
and have not been tried against a live Cloudflare *(reported)*.

**Item 7** (9b4cdf0, 023dcc0, 4bbd292). Only a direct connection from
loopback is left unpaced (023dcc0): through a proxy everyone is paced
under the walked address, or, when the proxy forwarded none, under the
proxy's own address as one key — a forwarded `127.0.0.1` would otherwise
have been exempt, and a proxy that forwarded nothing would have switched
the pace off. A refused WebSocket upgrade takes a request from the pace and
is answered 429 past it, since `fair.rs` counts accepted sockets only. At
most 10 "past the pace" lines a minute for the whole server, then one line
that counts the rest (4bbd292). The map of buckets is bounded at 100 000
keys, the least recently used tenth evicted.

**Item 8** (cb05804, 4b892cc). hyper's `max_buf_size(64 KiB)` alone lets
a head through when it arrives in one read (seen: 100 KiB answered 200),
so the router's `guard` answers 431 past 64 KiB as well. `isEvalSupported`
no longer exists in pdfjs-dist 6.3.289 (tsc refuses the key), and its
build has no `eval(` call and no `Function(` constructor: F22 is void as
written, and its guardrail is a test in `app/ui/test/pdf.test.mjs` that
asserts that of `pdf.mjs` and `pdf.worker.mjs` (4b892cc). A poll's right
secret is answered whatever its address's delay; the delay slows wrong
polls only, so a stranger behind the same address cannot keep the app
from signing in ([0074](0074-accounts-and-access-on-the-server.md)
item 9). The mail key is taken only for a string with an `@`.

**Item 9** (7cd1383). As written; no `preload`. The whole set is asserted
in `tests_threats.rs`, over plain HTTP on this machine and with an HTTPS
public address.

**Item 10** (99683ed). At most 36 500 days, one parser shared with
`VERSO_TRASH_DAYS`. The sweep runs at start and once a day; no route,
command or setting triggers it or names a row, so it is no way to erase
evidence.

**Item 11** (d2af446, 024b9f8). `scripts/check-linux.sh` has no package
step. The unit and the read-only image are started by
`scripts/check-server-image.sh`, since 024b9f8 the last step of
`scripts/check-linux.sh` and not in CI (it would add several minutes to
every pull request's Linux job):
the compose file parsed and its hardening checked, the image run with the
same flags, then the static binary laid out as `nfpm.yaml` lays it in a
Debian 12 container running systemd, started by `universo.service`, and
checked to run under seccomp with the folder 0750 and the database 0600;
seen failing with a write outside the volumes and with a fabricated
`SystemCallFilter=~bind`. Run in Docker on arm64, `systemd-analyze
security` exposure 1.3 (`docs/reference/server-install.md`, section 15). `docker-compose.yml` at 2409498 was invalid
YAML (an unquoted colon in a CasaOS tagline): quoted. The Docker secret
for the first admin's password is shown commented out, since
`docker compose up` refuses to start while the secret's file is missing.

**Item 12** (80f35b3). Beside `backup --encrypt`, `--keygen`,
`--passphrase` and `--to-stdout`, the script gains
`restore FILE [--identity KEY-FILE] [--to DIR]`, beyond the restore line
the Decision names, noted for the maintainer. The secret key is never a
command's argument and is written under none of `/etc`, `/var`, `/root`,
`/tmp`, `/home`, `/run`, `/usr/local` or `/opt`, which the script test
checks. The site's copy, `public/universo.sh` in versomd-site, is to be
refreshed from the package's *(reported)*.

**Item 13** (cda7500, b616d12, d160f38). On 2026-10-13 the gate found five
high advisories with no fix the PR could take, and the maintainer decided
(*"aceito recomendação"*): nanoid overridden to 3.3.20 and 5.1.16
(Excalidraw's pins); lodash-es overridden to 4.18.1 (the pins of langium's
chevrotain and of dagre-d3-es); mermaid 12.0.0 → 12.2.0 (a direct
dependency, approved); braces 3.0.3 excepted in
`app/ui/audit-exceptions.json` until 2027-01-11 — the newest published,
still covered, reaching the tree through Excalidraw → sass → chokidar and
absent from the window's bundle. source-map-js 1.2.1 → 1.2.2 in the
lockfile. One low advisory, KaTeX's, remains *(reported)*: the gate
lists lows and moderates and fails on high and critical only.

**Item 15** (cfd382f, e779585). `Expires` is a year after the date
`CHANGELOG.md` gives the version built (the binary embeds the changelog;
it has no build date of its own), and the test checks that date, not the
clock (e779585). `Canonical` only behind an HTTPS public address (RFC
9116). `Policy` points at the repository's `SECURITY.md` on GitHub, which
answers 404 to the public while the repository is private *(reported)*.
The supported line is the newest release. The site must serve the same
file *(reported)*; that the mailbox exists is still for the maintainer to
confirm.

**Item 6** (40de8b5, 1d7c4e4). The session keeps `proved_at` (schema 9),
stamped by every session's creation — a sign-in by password, passkey or
e-mail link, a reset, an invitation, and until 463ed1ad a device's
approval: a device's session is born unproved since (the second review's
S7, below).
`POST /api/me/prove` by password goes through the sign-in's own keys,
turn, hash and refusal (items 1 and 2) and answers 403 `signin_failed`;
by passkey, `POST /api/me/prove/passkey` starts the ceremony. Gated
beyond the Decision's list: the password change, the admin's reset link
for another account, an owner giving or changing a member's role
(`folders::set_member`), a share's role (`shares::grant`) and, since
ce7f7655 (the /security-review of 2026-10-14, below), adopting a folder.
Left ungated: an invitation with no folder or share — one that carries
either is gated since 3d79d9ad (the second review's S6) — creating
accounts, quotas, the trash, removing a member. The window asks on the spot through
`web/proof.ts` and `web/proveDialog.ts` and retries once. A request with a
personal access token answers 403 "not with an access token".

**Item 17** (73807d2). A typed code is cleaned (`read_code`), compared in
constant time against every pending code, and the address's
`device:<address>` delay is checked before every lookup — describe,
approve, refuse, by link or typed — and counted on a wrong code; a right
code does not clear it. The page sends the code in the body; the path
routes stay. Item 6's proof is checked before the code is read.

**Item 14** (d5ea899, c1bc4cc). Seven `cargo-fuzz` targets in
`crates/verso-server/fuzz`, a harness of its own outside the workspace as
the dialect's is: `request`, `unframe`, `note`, `board`, `presence`,
`host` and `size` (34474a0). The crate's own readers are reached through
`fuzz_api`, a module compiled only with the `fuzzing` feature, which
nothing that ships turns on (f6d52f5). On `main` each runs 60 s with
`-O`, the release profile without debug assertions: with cargo-fuzz's
default flags a run stopped on yrs's debug-only asserts and overflows,
which a release build takes (060f126); the dialect's and the canvas's
keep their flags. The seeds are versioned per target, in
`fuzz/seeds-<target>`, each input a target found among them. What the
targets found, and what closed each:

- (a) A `Host` of the form `[::1]` followed by anything was taken as the
  loopback: on a server with no `VERSO_PUBLIC_URL` it passed the `Host`
  check and became the origin of the links the server mails. The name is
  now compared whole: `localhost`, `127.0.0.1` or `[::1]` (fec23f4).
- (b) yrs 0.28, the newest published, panics in a release build on some
  updates a member who may write can send (7170df6). Decided on
  2026-10-13 (*"aceito recomendação"*): every call into yrs over what a
  window sent is made under `catch_unwind` at the room's boundary; the
  update is refused, a `WARN` line names the account's id, and the room
  is made again from its file, as a change from outside makes it. What a
  member loses: the edits in that room since it last wrote, which it does
  900 ms after the last edit (606ffeb).
- (c) A declared count larger than the bytes left, and a value nested
  deeper than 64 levels, are refused before yrs reads an update:
  `yjs_bounds.rs` walks the update's v1 layout as yrs reads it, each
  number as yrs reads it, and reads no content (40893a6, 658f924,
  4e1338f). Runs of deleted or skipped clocks of length 0, deletions of
  length 0 and clocks past `u32::MAX` are refused too (75872f9). Two of
  these ended the whole process, not one request: a value nested deep
  enough overflowed the thread's stack (seen while writing the tests),
  and a run of length 0 made yrs panic a second time during the
  unwinding, an abort past the catch of (b).
- (d) An update that makes or deletes items as the room's own Yjs client
  beyond those the room has made is refused (670a07f, b7ef994). Other
  clients' items stay unjudged.
- (e) A connection's requests ran side by side, so the server itself
  reordered one window's updates: the only way a legitimate update
  reached yrs's pending path, where yrs read freed memory
  (AddressSanitizer's heap-use-after-free) and rooms and windows came to
  read different texts and boards. A connection's `collab_update` now
  waits for its previous one (`rpc.rs`, a chain per connection), and an
  update that leaves anything pending, or that yrs stops applying
  halfway, is refused and the room made again (8d419e9). Decided on
  2026-10-13, option (a) (*"bora a"* *(reported)*). The desktop host
  writes a window's questions on the server's connection in the order of
  the calls (`remote.rs`, ca4c8a6); that Tauri hands a window's
  invocations on in that order was not verified, and the window makes
  the order its own: one update in flight per room, what is typed
  meanwhile merged into the next (`updateQueue.ts`, 857f4aa).
- (f) What `join` sends and what a board's write tells the windows are
  decoded and applied in a scratch document before they are sent, the
  room made again on a failure (ef1c389); a room's state must also read
  in a window as it reads in the room (8d419e9). Cost: one decode and
  apply of the room's state per join and per board write (the server's
  tests from 22 s to 33 s).
- (g) `config::size` below one byte is an error, no longer a quota of 0
  bytes (bc2b9fc).
- (h) 2026-10-14, the fuzz job on `main` and a 120 s run after it. An
  update that names one Yjs client in two of its sections is refused by
  `yjs_bounds.rs` (44561c8): yrs 0.28 read both into one list out of
  clock order and freed an item a board's room still pointed to
  (AddressSanitizer's heap-use-after-free); Yjs writes each client once.
  Two updates that make the same item with different contents are not a
  fault of the merge: Yjs keeps whichever came first, and the target
  `board` compares the other order only when each item is made once
  (dad8202).
- (i) 2026-10-14, decided by the maintainer (*"sim para os 2"*): a room
  ties each Yjs client to the account, and the connection, that first
  wrote as it (`writers.rs`, as a presence ties its clients), and refuses
  an update that makes items, or deletes clocks, past what the room holds
  of a client another account writes as (4c387d9). This revises (d)'s
  "other clients' items stay unjudged". What the room holds already is
  judged by no one — another window's items in a whole state sent back,
  the deletion of another person's item when an element moves — and the
  same account's window on a new connection speaks for its clients from
  then on. 64 clients per connection, 4096 per room, past which those of
  connections gone are let go first.

Final state: 60 s under `-O` on the `note` and `board` targets with no
crash *(reported)*; the seeds, the six inputs once kept aside as open
(f95226d) among them, replay clean (8d419e9). The yrs findings were to be
reported upstream, waiting for the maintainer's OK *(reported)*;
`[DECIDED 2026-10-21]` (0083.14, option C): **they are not reported** to the
`yrs` project, and our own guards (the bounds, the `yjs_bounds.rs` tests, the
fuzz seeds) stay.

**Item 16** (0b5fea1; e86eee8, 1e25bcf). The reading:
`app/ui/src/sanitize.ts`, written by Opus 5.5, read by Fable 5.1 on
2026-10-13, no BLOCKING finding and three MINOR *(reported)*. The values
of `data-task-line` are not restricted, and `toggleTask` checks again
that the line holds a task before it edits. A relative picture's address
reaches `resolveAttachment` and `verso-fs`'s confinement, which refuses
the UNC and absolute forms (`confine.rs`, tested on Windows). And the
embedded page's gate box held its frame's host in a `<template>`, which
a second cleaning dropped; resolved by making the box self-contained
(e86eee8): it carries the address and the frame's tamed style
(`data-embed-style`), the host is built at the click, the origin is the
address's own and never the box's `data-embed-origin`, "load" works only
for an origin the person approved, and "approve" and "cancel" only for an
http(s) address. A gate box does not survive a second cleaning, on
purpose: a note cannot forge one.

The suite: the hostile-HTML cases, 102, live in
`app/ui/test/sanitize-cases.mjs` and run in node over happy-dom
(`npm test`) and in WebKit and Chromium through
`app/ui/e2e/sanitize.spec.mjs` (`npm run e2e`, local, in
`scripts/check.sh`), through the harness's hook `__harness.sanitize` —
the instance `main.ts` configures — built only into the harness's site,
never into `dist/` (1e25bcf). Seen failing first with a deliberately
wrong assertion in both browsers; then three cases failed in both, their
outputs safe and their expectations written for happy-dom's tree; the
expectations were corrected for the browsers' parser, and no fault of the
sanitizer was found. The pentest by a person outside the project is not
in this round and stays a condition of the announcement.

**The compose file's port** (2026-10-13). Left open after the build and
decided by the maintainer on 2026-10-13 (*"sobre as decisões em aberto,
siga as recomendações"*, on the open decisions, follow the
recommendations): `packaging/server/docker-compose.yml` publishes 7340 on
`127.0.0.1` by default (`host_ip`), TLS in front — Caddy, a tunnel or
Tailscale. *(Superseded on 2026-10-16: it publishes `7340:7340` on every
address and plain HTTP signs in from the network, with the maintainer's
words in [0073](0073-self-hosted-server-first.md)'s Revisions; the
guardrail then checks that binding and that no variable is required.)* Its comment says the one line to change to publish on the
LAN, for a CasaOS box on a home network, and that plain HTTP on the LAN
signs nobody in from another machine anyway
([0073](0073-self-hosted-server-first.md) item 6).
`scripts/check-server-image.sh` checks the binding in the parsed file,
so a comment cannot pass for it.

**The server's log volume** (2026-10-13, F21's remaining part). Decided
by the maintainer on 2026-10-13 (*"sobre as decisões em aberto, siga as
recomendações"*): the server rotates no log of its own; rotation is left
to the host's tools and documented. A package's log is the unit's output,
which journald rotates (`journalctl --vacuum-size`, `SystemMaxUse=`;
`docs/reference/server-install.md`, section 5); the compose file declares
Docker's `json-file` driver with `max-size: "10m"` and `max-file: "3"`
(section 4). The 60 lines a minute a window may write are unchanged.

**The threat model's rate limit beyond sign-ins** (2026-10-13). Its
`[OPEN]` closed by the maintainer's answer of 2026-10-13 (*"sobre as
decisões em aberto, siga as recomendações"*): the paces of items 7
(9b4cdf0) and 2 (805febb), beside the connection limits built before,
answer it; `docs/reference/threat-model.md` says **Closed: 9b4cdf0 and
805febb**. Measuring the numbers stays item 18.

**Two readings of the Decision's text** (2026-10-13), noted here and not
rewritten above. Item 16's guardrail is "kept in `npm run e2e`": that
suite runs locally, in `scripts/check.sh`, not in CI
([0058](0058-demo-vault-as-tutorial.md)), so the browser run of the
sanitizer's cases holds before a push, not on a pull request. Item 14
names "`collab.rs`'s awareness reader": the `presence` target goes
through `presence.rs` (`presence::stamped`, which `collab::awareness`
calls; 34474a0).

**The maintainer's checks in the app** (2026-10-13). What the tests do
not reach is listed in `docs/reference/manual-checks.md`, none of it
blocking: a shared note and board edited from the desktop app beside
another window (the order of (e)), item 6's dialog with a password and a
passkey, item 17's typed code, Mermaid 12.2.0 (item 13), and
`universo.sh`'s Caddy steps beside another site (7755802).

**The second review (2026-10-13).** On the night of 2026-10-13, after
items 1 to 17 were built, an Opus 5.5 session that wrote none of the code
read the server again at e699b57, read-only, assuming an attacker who has
read the public source: 25 findings, none a repetition of F1 to F23 —
three BLOCKING, all leaks between people sharing a folder, twelve
IMPORTANT and ten MINOR. [`security-review-2026-10-13.md`](../reference/security-review-2026-10-13.md),
section 10, lists them as S1 to S25, with what closed each. All 25 were
closed in this round, in the merges of sec/shares (c816ca5b), sec/pkg
(af554af2), sec/bounds (39181303) and sec/auth2 (83066f61), and in the
maintainer's decisions below, merged from sec/decided (c2454064). Two
of the fixes change the contract. 0e9175de adds `ErrorKind::ProveFirst`, which the
host gives for a server's 403 `prove_first`, and the host command
`server_prove`, which sends the password to the window's server's
`/api/me/prove` with the device's bearer. 3e39e23c removes the device
routes that took the code from the path (`GET`, `POST` and
`DELETE /api/device/{code}`), so that an address under `/api/` that no
route names answers 404 instead of the page, and adds the host command
`server_sign_in_page`, which opens, once, the page the server named,
after the app has copied the code.

**The maintainer's decisions of 2026-10-14.** Four points left by the
second review of sign-in and access, sent with a recommendation each,
answered on 2026-10-14: *"com exceção do 3, sim pra recomendado. O 3:
Mudo a recomendação: deixa o app com acesso de admin"* (except for 3,
yes to the recommended. On 3: I change the recommendation: leave the app
with admin access).

- (1) 2026-10-14 — a device is approved only with the code from the
  person's own screen, as GitHub's CLI does: the desktop app copies the
  code to the clipboard when it starts the flow, says "Code copied —
  paste it on the page that opened", and only then opens the page
  (`serverSignIn.ts`; the host's new `server_sign_in_page` opens the page
  the server named, once, so that the copy happens while the window still
  has the focus); the page never pre-fills or approves from its link and
  always shows the labelled code field; `start` answers the page's
  address without `?code=`, and the server's path routes
  `/api/device/{code}` are removed — an address under `/api/` no route
  names answers 404 — so describing, approving and refusing exist only
  through the body's routes with the entered code, behind the same delay
  and constant-time comparison. This revises item 17's "the device page
  keeps its link" and its As built "the path routes stay".
- (2) 2026-10-14 — `universo.sh backup --encrypt` or `--passphrase`
  without `age` stops with an error and writes nothing, neither a file
  nor a stream, saying how to install `age` on this machine's family
  (`age_install`, beside `caddy_install` on the shared `dnf_install`);
  the plain backup is made only when no encryption is asked. This
  replaces item 12's "without `age`, the script says how to install it
  and makes the plain tarball with the present warning in capitals".
- (3) 2026-10-14 — the recommendation changed by the maintainer: a
  desktop app's device session keeps the admin's routes, each sensitive
  one behind item 6's fresh proof, as it is since 463ed1a (a device's
  session born unproved) and 0e9175d (the app proves with the password).
  No code changes; `server-install.md` section 9 and
  `server-hands-on.md` say that an admin action from the app asks for the
  password again.
- (4) 2026-10-14 — the folder note's name is the folder owner's, as the
  walk's rules are: a member who is not the owner changing the folder's
  settings (`set_folder_settings`) leaves `folder_note_name` as it was,
  as `set_folder_note_name` already did (`rpc.rs`,
  `without_owners_settings`); the owner's change sets it.

**The /security-review of 2026-10-14.** A code review of the server for
security, run on 2026-10-14 at b72940c7, reported no finding at
confidence 8 or above. Four items it raised below that threshold were
closed on sec/security-review-followups, each with a test seen failing
first. 9906f2b9: schema 10's upgrade gave `scope = 'folder'` to every
invitation whose `share` was already null, a share's invitation orphaned
before it among them, which would then have granted the whole folder;
in the same transaction as step 10, every pending invitation that names
a folder and no share is now ended, the log says how many once, and the
changelog tells the admin to send them again — used, expired and
folderless links untouched. ce7f7655: `admin::adopt`, which gives a
folder already on the disk to any owner, wants item 6's fresh proof, as
`enter` and `set_member` do. e86ddbdd: `device::describe_typed` refuses
a personal access token ("not with an access token") before the code is
looked at, as approving and refusing want a session. 22e7eb84:
`universo.sh restore` unpacks the checked entries into a fresh root-only
directory inside the target, refuses when a path it would write is a
link under the target (GNU tar followed a link planted in the middle of
a name, such as `/var/lib/universo/folders`) or a directory above a
backup path leads out of it, and only then puts the tree in place; the
script test plants `folders -> /tmp/elsewhere` over `/` and in a
scratch root.

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
- **Item 19's hostile lab**: the round ends with the running server
  attacked, in Docker, by scripts written by someone who has read the
  code. The project pays for the lab and its time; it gains that each
  measure was seen holding against an attacker who knows it, not only
  against its own test.
- What stays as it is, said again: the host sees the notes; the server
  reaches nothing but the release feed and the host's SMTP; nothing of a
  member leaves the server to a third party; accessibility is not traded
  for a gate.
- The threat model gains a pointer to the review and to this ADR, and
  marks gap 10 as answered by item 16 when it is done; it is refreshed
  again when this round's items are built.

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
  item 12's decision, `age`.
- **A read log per folder** to tell scraping from reading: a row per read,
  recorded for a later ADR, not now.

## Status

**Accepted (2026-10-13).** Written by Fable 5.1 at the maintainer's
request; read by Opus 5.5 on 2026-10-13, which confirmed F1, F3, F4 and
F5 against the code. The maintainer was sent the open decisions with
their recommendations and the question *"todas como recomendado?"* (all
as recommended?), and answered on 2026-10-13:
*"seguinte eu preciso que você implemente tudo isso toda rotina de
segurança possível que faça sentido para nossa aplicação tem que ser
implementada e feita [...] em seguida você deve emular um ambiente de
ataque um ambiente hostil para validar todas as implementações e outras.
Tenha em mente que o código é aberto, então o atacante se quiser ele vai
ler o código, vai tentar encontrar a vulnerabilidade no código e usar
isso a seu favor. Então você deve levar isso em conta nas correções e
também na hora que você fizer uma rotina de ataques nesse servidor."*
(here is the thing: I need you to implement all of this; every security
routine that makes sense for our application has to be implemented and
done [...] next you must emulate an attack environment, a hostile
environment, to validate all the implementations and others. Keep in mind
that the code is open, so an attacker who wants to will read the code,
try to find the vulnerability in it and use it to their advantage. So you
must take that into account in the fixes and also when you write a
routine of attacks against this server.)

*"Tudo isso"* (all of this) accepts every recommendation: each `[OPEN]`
is decided as recommended and marked `[DECIDED 2026-10-13]`. The rest of
the answer adds item 19, the hostile lab, and makes the order of work one
round: every item is built in this round except item 16's pentest by a
person outside the project, which stays a condition of the announcement.
The items go in one PR with their guardrails, each seen failing first
([0029](0029-guardrails-in-ci.md)), and the review's findings table says
what closed each.

**Built on 2026-10-13** (As built): items 1 to 15 and 17, and item 16's
reading of the sanitizer with its suite run in WebKit and Chromium. Not
in these merges: item 18's measurement and item 19's hostile lab.
Outside this round: item 16's pentest by a person outside the project, a
condition of the announcement.
