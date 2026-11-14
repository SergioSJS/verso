# The server's threat model (2026-10-09, refreshed 2026-10-11 and 2026-10-13)

What UniVerso — `verso serve` — protects, from whom, and how. [ADR 0073](../adr/0073-self-hosted-server-first.md)
item 6 asks for it before the server is announced to anyone but the
maintainer, and for security in full before the first user who is not the
maintainer; [ADR 0074](../adr/0074-accounts-and-access-on-the-server.md)
names what of its own it must cover; [ADR 0045](../adr/0045-server-and-mcp-security.md)
names the prompt-injection risk it takes up. Written by Opus 5.5; it
decides nothing — where a gap needs a decision it says `[OPEN]`, and a
recommended answer is marked as a recommendation.

**Refreshed on 2026-10-11 against HEAD 14ac192** of `feat/universo`
(`docs/roadmap.md`, revision 6, row 3.15: third after this round, before
sharing). First written on 2026-10-09 against `feat/web`; rows added on
2026-10-11 by d4ff0db for the syncing device and sharing. Read for this
refresh: the server's routes and handlers (`crates/verso-server/src`:
`http.rs`, `auth.rs`, `api.rs`, `admin.rs`, `console.rs`, `folders.rs`,
`device.rs`, `passkeys.rs`, `rpc.rs`, `state.rs`, `sync.rs`, `collab.rs`,
`files.rs`, `access.rs`, `limit.rs`, `quota.rs`, `large.rs`), the window's
sanitizer (`app/ui/src/sanitize.ts`), the packaging
(`packaging/server/`), and ADRs [0075](../adr/0075-server-packaging-and-storage.md),
[0077](../adr/0077-the-server-administration-console-and-folder-quotas.md),
[0079](../adr/0079-sync-a-local-folder-with-a-server.md),
[0080](../adr/0080-the-trash-with-expiry-and-restore.md),
[0081](../adr/0081-sharing-between-people-on-one-universo.md) and
[0082](../adr/0082-live-co-editing-of-a-synced-folder.md). 0080, 0081 and
0082 are accepted and **not built** at this HEAD; their rows say what they
decide, not what runs.

**Gaps closed on 2026-10-11** on `feat/universo-sec` (from 512e75f), each
by the commit its entry names: 1, 2, 3, 4, 6, 7, 8 and 13 to 16. The
attack surface and the threats below say the bounds as built there; 5, 9,
10, 11, 12 and 17 stay open, each with its reason.

**See the review of 2026-10-13 and ADR 0083.** On 2026-10-13, at the
maintainer's request, Fable 5.1 read the server again against HEAD d0d280e
with bots, abuse and attacks from outside in hand, and probed it on a
loopback port: [`security-review-2026-10-13.md`](security-review-2026-10-13.md)
(findings F1 to F23, none BLOCKING, ten IMPORTANT — a failed sign-in with
no log line for fail2ban or CrowdSec, no ceiling or notice on guesses, a
password checked for length only, recovery leaving tokens alive, one
trusted proxy address, the server's inputs not fuzzed, npm advisories
unchecked, no disclosure channel, the outside review still open, a backup
in the clear) and [ADR 0083](../adr/0083-security-hardening-of-universo.md)
(the measures, their numbers, guardrails and order of work). The ADR was
accepted on 2026-10-13 and built the same day, in one round: items 1 to
15 and 17 are built, with item 16's reading of the sanitizer and its suite
run in WebKit and Chromium, and its section "As built" says where the code
departs from its text; item 16's pentest by a person outside the project
stays a condition of the announcement. Of the gaps below, gap 7's
remainder (a mailbox flooded) is closed by its item 8 (ecd5fab), and gap
10 is answered in part by its item 16 (the sanitizer's reading done, the
pentest pending). What the review found is new, not a correction of what
was written here.

**Refreshed on 2026-10-13 against f6ae4eb** of `docs/security-hardening`:
the attack surface and the threat rows below say the measures of ADR 0083
as built, each with its item; the commits are in the ADR's section "As
built" and in the review's findings table.

**See the second review of 2026-10-13 (night).** After ADR 0083's items 1
to 17 were built, an Opus 5.5 session that wrote none of the code read
the server again at 52dc95c, read-only, assuming an attacker who has read
the public source: [`security-review-2026-10-13.md`](security-review-2026-10-13.md),
section 10 (findings S1 to S25: three BLOCKING, all leaks between people
sharing a folder; twelve IMPORTANT; ten MINOR). All 25 were closed in the
same round (ADR 0083, As built, "The second review"). **Refreshed against
bf31c238**: the rows below that a fix changed say so, with its commit.

**Read links added on 2026-10-21** ([ADR 0105](../adr/0105-read-links-without-an-account.md)): the
first public surface of a server of private notes — `/r/<token>/…` and
the owner's and the administrator's routes that make it. New rows below:
"Whoever holds a read link", boundary 8, four rows of the surface and the
section "Read links". Read for it: `readlinks.rs`, `visit.rs`, `scope.rs`,
`files.rs`, `http.rs`, `db/readlinks.rs` and their tests.

## What is protected

| Asset | Where | Why it matters |
|---|---|---|
| The notes and attachments | the folders under `VERSO_FOLDERS_DIR` | the person's writing; a folder may be shared by several people |
| What was deleted | each folder's `.trash/`, on the server and on a syncing computer | a deletion by another member or a device is recoverable only from here until ADR 0080 |
| Accounts and password hashes | `server.sqlite` in `VERSO_DATA_DIR` | Argon2id hashes; a stolen one is attacked offline |
| Sessions, device sessions, personal access tokens, single-use links | the same database, as SHA-256 only; sign-in links by e-mail and pending device codes in memory | each opens an account until it ends |
| Passkey credentials | the same database | public keys and counters; no secret |
| A read link's address, and its passphrase | the database keeps the address as SHA-256 and the passphrase as an Argon2id hash; the address itself only with whoever the owner gave it to (ADR 0105) | opens a folder or a note to anyone who has it, with no account |
| The audit log and each folder's change log | the same database; the audit log's rows kept `VERSO_AUDIT_DAYS` days, 365 by default (ADR 0083 item 10) | who did what, from which device; a member's evidence |
| A device's token on a desktop | `servers.json` in the app's configuration directory, `0600` on macOS and Linux; on Windows, the profile's own permissions | opens the account from that computer |
| The server's memory and threads | the process | one member's connections can starve every other member's |

## Who

- **A stranger on the network** (the internet, or a home Wi-Fi): no account.
- **A member**: an account, with roles in some folders.
- **A member with a hostile note**: writes HTML, SVG, links or text meant
  for another member's window or agent.
- **A member's program**: a personal access token, scoped to folders and
  to reading or writing.
- **A member's device**: the desktop app's device session, syncing.
- **The admin**: manages accounts; no implicit access to folders.
- **The host**: whoever runs the machine or the container. Reads the disk,
  the database and the log. Out of scope as an adversary: the
  documentation says in those words that whoever hosts sees the notes
  (ADR 0073 item 6, no end-to-end encryption). Another local user of the
  same machine is not the host.
- **A page of another site** open in a member's browser.
- **Whoever holds a read link** ([ADR 0105](../adr/0105-read-links-without-an-account.md)):
  no account, only an address of 256 bits that whoever it was passed to
  has; reads what the link points at, in a browser, and nothing else.

## Boundaries

1. The network → the server: TLS, `Host`, `Origin`, the session.
2. One member → another, inside one server: roles per folder, the
   window's sanitizer and policies, the files' sandbox.
3. The browser's page → the server's API: the cookie, the CSRF token.
4. The server → the disk: `verso-fs`, path confinement, symlinks kept
   inside a folder.
5. The server → the internet: the release feed, and the host's mail
   server when one is set; with its own link on (ADR 0117 D4 item 2),
   GitHub's releases for the pinned `cloudflared` and Cloudflare's edge,
   which then reaches the server back through the link's listener.
6. One connection → the server's shared resources: the per-connection
   bounds of the WebSocket, the per-address delays, the quotas.
7. A note's writers → its readers: the note's secret blocks (ADR 0087).
   One who may only read a note is served its projection — the lines of
   its `> [!secret]` callouts taken out, `verso_dialect::project` — at
   every exit it has.
8. A read link's holder → the folder it points at (ADR 0105): the link's
   scope, joined and confined before `verso-fs` acts, the same projection
   at every exit, and a list of commands of its own that holds no write.

## The attack surface at HEAD

Every connection first takes a place — 512 on the server, 128 per address
(an IPv6 /64 as one; this machine and the trusted proxies are not counted) —
before a TLS handshake or a byte of HTTP is read, and holds it to its end,
a WebSocket's included; a request then takes a place among its address's
32 in flight, the address walked past the trusted proxies (429 past it;
a direct connection from this machine not counted; 0a04d1b7) — one that
opens an account instead among its account's 32 and its address's 128
signed-in, and a file of the window itself (a `GET` with no body, not
under `/api/`, `/f/` or a read link's routes) none: it is answered as
soon as it is opened (the re-test of 2026-11-04, a table of ten behind
one address). A
request's headers have 30 s, the wait for the next request on a
kept-alive connection included; a request has 60 s and its body 10 s
(408 past either; 0a04d1b7); a request's head is 64 KiB at most (431 past
it, ADR 0083 item 8). Every request passes the `Host`
check first (421 otherwise) and gets the server's headers after:
`nosniff`, `no-referrer`, `SAMEORIGIN`, `Cross-Origin-Opener-Policy`, a
`Permissions-Policy`, HSTS with `includeSubDomains` over HTTPS and,
except under `/f/`, the window's own policy (under `/f/`,
`Cross-Origin-Resource-Policy: same-origin`) — the whole set asserted,
name and value (ADR 0083 item 9). A body of the REST API is 1 MB at
most. Every route under `/api/` keeps a pace per address, 20 a second
and 100 at once, 429 with `Retry-After` past it; only a direct
connection from this machine is unpaced (ADR 0083 item 7). Every delay
"by address" below keys an IPv4 address whole and an IPv6 address by
its /64, the address being the connection's or, behind a trusted proxy,
the right-most `X-Forwarded-For` entry that is not a trusted proxy (ADR
0083 item 5); the maps strangers fill are bounded — the delays' and the
REST pace's 100 000 keys each, and 10 000 each of device codes, sign-in
links and passkey ceremonies — the oldest tenth going first, and one
address keeps at most 8 waiting in each of these three (09b19924). A secret sent over plain HTTP from another machine is read like
any other since 2026-10-16 (ADR 0073 item 6, amended): see the row "A
password or a token read on the wire" below. "Origin" below is `Ctx::changes()`: a browser's change carries a
matching `Origin` and the session's CSRF token; a bearer (a token or a
device) carries neither; with no session, `Origin` alone. "The person" is
`Ctx::person()`: a browser or a device signed in as them, never a token.
"Admin" is `Ctx::admin()`: an admin's browser or device session, never a
token.

| Surface | Who may call it | What checks it | What limits it | What logs it |
|---|---|---|---|---|
| `GET /api/state`, the pages, the window's files | anyone; the server's version and the contract's only to someone signed in | `Host` | the page is never cached; `/api/state` at the REST pace | nothing |
| `POST /api/signin` | anyone, over TLS | Origin | a growing delay by address and by account (`in:`): 3 free, then 1 s doubling to 60 s, forgotten after an hour; the server's refused sign-ins share one bucket, 4 a second and 20 at once, and every sign-in waits its debt, never more than 2 s; 20 refused in an hour tell the account by mail, once a day at most (ADR 0083 item 2); every Argon2id in one of the server's places, two per core (two at least), 503 past a 5 s wait, and one attempt in flight per sign-in key, 429 past 10 s (b570239b) | audit `sign_in`, failed or not, and `sign_in_noticed`; a refusal is a `WARN sign-in failed` line of the server's log, which the shipped fail2ban filter reads (ADR 0083 item 1) |
| `POST /api/passkey/start`, `/finish` | anyone, over TLS | Origin; WebAuthn with user verification; the ceremony 5 minutes in memory | a delay by address (`pk:`), every start counted, 8 ceremonies waiting per address (09b19924); the finish waits the server's sign-in debt (ADR 0083 item 2) | audit `sign_in_passkey`; a refusal a `WARN sign-in failed` line |
| `POST /api/signin/link`, `POST /api/forgot` | anyone, only when the server has a mail server | Origin | a delay by address (`mail:`) and by the address mailed to (`mail:<e-mail>`, ADR 0083 item 8), every request counted; answered before the address is looked up — the link, the mail and the audit line follow the answer; a sign-in link lives 15 minutes, in memory, 8 waiting per address, past which none is made (09b19924) | audit `signin_link_sent`, `reset_link_mailed` when the address has an account |
| `GET`/`POST /api/signin/link/{token}` (the `GET` names the link's account without using it; the page posts only on a click, ae7d3926), `GET`/`POST /api/invite/{token}`, `GET`/`POST /api/reset/{token}`, `POST /api/setup` | whoever holds the link | Origin on `POST`; the link's hash, single use, expiry (setup 1 hour, invitation 7 days, reset 24 hours); setup only while there is no account; a new password not among the commonest nor the account's e-mail (ADR 0083 item 3) | a delay by address on a wrong link (`link:`) | audit `sign_in_link`, `invitation_used`, `password_reset`, `setup` |
| `POST /api/device/start` | anyone, over TLS | nothing more | every start counted by address (`device:`), the same delay; a code lives 10 minutes; 8 waiting per address, 429 past them (09b19924) | nothing |
| `POST /api/device/poll` | whoever holds the poll secret (256 bits) | the secret's hash, compared in constant time | a wrong secret or an unknown code counted against the address's `device:` delay and waiting it; the right secret answered whatever that delay (ADR 0083 item 8); the server's sign-in debt (item 2) | a wrong secret a `WARN sign-in failed` line, `for -` (ADR 0083 item 1) |
| `POST /api/device/describe`, `/approve`, `/refuse` (no route takes the code from the address since 2026-10-14) | signed in; approving only from a browser session | Origin (approve); a fresh proof within ten minutes before approving, checked before the code is read (ADR 0083 item 6) | the code: 10 minutes, once; entered by the person from the app's screen, never taken from a link (decided 2026-10-14), compared in constant time with every pending code behind the address's `device:` delay, a wrong one counted, a right one not clearing it (ADR 0083 item 17); the session an approval makes born without a proof (ce0bcc42) | audit `device_approved` |
| `/api/me`, `/api/me/*` | the person (profile, password, sessions, settings, passkeys); a token is made only from a browser; a device renames only itself | Origin; the current password for a new one, not among the commonest (ADR 0083 item 3); a fresh proof within ten minutes for a token, a passkey added or removed and the password change, made by `POST /api/me/prove` or `/api/me/prove/passkey`, never with a token (ADR 0083 item 6) | the password change by account (`in:`), its Argon2id in one of the server's places (b570239b); settings 256 KB; names 200 characters | audit `password_change`, `session_ended`, `sessions_ended`, `token_created`, `token_revoked`, `passkey_added`, `passkey_removed`, `device_renamed`; a profile or settings change is not audited |
| `/api/folders`, `/api/folders/{id}/*` | signed in; creating: an account allowed to, never a token; members and the folder's audit: the folder's owner | Origin; the role in the folder, 404 when none; a fresh proof for an owner giving or changing a member's role or a share's (ADR 0083 item 6) | — | audit `folder_created`, grants, `revoke` |
| `/api/admin/*` | admin | Origin on changes; a fresh proof within ten minutes for deleting an account, changing powers, ending another's sessions, entering a folder, a reset link for another account (ADR 0083 item 6) and an invitation that carries a folder or a share (714e974f) | every list paged on the server (50 rows) | audit for every change (`account_created`, `powers_*`, `account_deleted`, `account_sessions_ended`, `reset_link`, invitations, `folder_adopted`, `admin_self_grant_*`, `folder_quota`); reads are not audited |
| `GET /f/{folder}/{*path}` | a reader of the folder or more; a token within its folders | TLS; the role, on every request; the core's path confinement | `Content-Security-Policy: sandbox`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin`; sent 256 KiB at a time, never whole in memory, a single `Range` answered 206 (cbf905a3) | nothing |
| `GET /api/ws`, the contract | a browser (only with `--web`, `Origin` checked before the cookie is accepted), a device, a token | TLS; the session or token alive before every command; the role in the folder before the core acts; a token's folders and write flag; a sync version older than the previous one refused for `sync_*` | 48 MB a message for an upload, 32 MB for a command that carries a note's or a board's text or folder data, 1 MB for any other, judged by its name before it is parsed; messages and answers above 1 MB share 128 MB of the server, refused past it (767fbb41); 8 requests under way, past which the connection is not read; a queue of 1024 messages and 64 MiB of pushes, full = closed; each write within 30 s plus its size at 32 KiB/s, else closed; a ping every 30 s, closed after 2 unanswered; 32 connections per account and 64 per address, 429 past them; each command at its account's pace (100 a second, 400 at once; a `sync_read` has its own, 1 000 and 4 000) and the server's (1 000, 2 000), waiting its turn past it; a window's log lines 60 a minute | the server's log: a sync change refused, a slow or silent connection closed, a sync version refused; each folder's change log names the account and the device of every write |
| — folder commands | the window's folder, opened by `open_server_folder` or `reopen_folder` | a write command needs editor or owner and a writing credential; a write's bytes checked against the quota first, its growth held there until it lands (7ed171c9) | the quota (ADR 0077 item 5); a text read or written 16 MB at most, judged before it is read (bc65b8d6) | the change log |
| — folder data: `list_folder_data`, `read_folder_data`, `write_folder_data`, `remove_folder_data` (`.verso/layouts/` and `.verso/bundles/`, ADR 0099 item 2, ADR 0098 item 2) | members of the folder; through a share, none | listing and reading: any member of the folder; writing and removing: an editor or an owner with a writing credential, a reader's refused | the path is built by the core from a kind (`layouts` or `bundles`) and an id matching `^[a-z0-9][a-z0-9-]{0,63}$`, never from a string the window sends; an id that is a name Windows keeps for a device is refused; nothing else under `.verso/` is reachable through these four commands; a text of 256 KiB at most for a layout and 4 MiB for a bundle, and one JSON object; a file of those directories is written by these commands only (`create_file`, `write_text`, a rename or a move into them refused); a write atomic and over the revision that was read, refused if the file changed; a removal goes through the trash; a write counts against the quota like any file; a layout is data, never code (ADR 0099 item 3), and a hostile layout is hostile input to every window that draws it: its dice-rule patterns are refused by structure (one unbounded quantifier at most, no nesting, no back-reference) and by a timed probe against adversarial texts (10 ms at the 400-character scan bound, once per pattern), a value past 400 characters or a match past 50 stays text, a card has a total time budget for dice matching and says when it skipped rules, its expressions run without `eval`, bounded, and its appearance is a closed set of hex colours and fonts; a bundle only declares folders and files and is bounded again when used (ADR 0098 item 5); a share lists none and reads none | the folder's change log, for sync |
| — `collab_*` (shared notes, text files and boards, ADR 0082 item 12) | members of the folder | a room's path is the confined one, one room per file (7c0d4792); `collab_update`, `_save`, `_resolve` and `_canvas` need a writer; a malformed Yjs update refused, and before yrs reads one, an update that declares more than its bytes, nests past 64 levels, holds a run or a deletion of length 0 or a clock past `u32::MAX`, or makes or deletes the room's own Yjs items ahead of the room; a connection's updates taken in the order sent, one that leaves anything pending refused; a panic of yrs caught, the update refused and the room made again from its file; what `join` sends and a board's write tells applied in a scratch document first (ADR 0083 item 14); a board's file (`collab_canvas`) is written only when it is of exactly the state the room holds, through the core's board writer, over the revision read | presence (`collab_awareness`) 16 KB at most, from a window in the room, stamped with the sender's account name and only its own Yjs clients (gap 11); a roll of dice (`collab_roll`, ADR 0088 item 4), from a window in the room, a reader's too: the server reads the notation itself — 200 characters, 20 terms, 100 dice, 1000 sides at most — and rolls with the system's generator, the table it names a link of 512 bytes on one line, the roll stamped with the sender's account name; the room keeps its last 20 in memory, nothing written; a note room: an update 4 MB at most (ADR 0083 item 8), the room 64 MB (9629fac2); a window in 64 rooms at most (9629fac2); one update of a window in flight per room, what is typed meanwhile merged into the next (item 14); a board room: an update 4 MB and 10 000 entries at most, the room 100 000 entries and 64 MB, a file handed to it 16 MB (`collab_board.rs`), past which refused; an oracle draw (`collab_oracle`, ADR 0102 item 5), from a window in the room, a reader's too: the server draws with the system's generator, from the odds row or the word lists the window sends (six numbers adding to 100; four lists of 1 to 200 words of 60 characters at most; a table of 500 entries of 300 characters at most), so the window cannot send what fell; the question's text never reaches the server; the draw is stamped with the sender's account name and told to the room, nothing kept or written; the readers served a projection hear a question draw only, never the words of a spark or of a table, which may come from a secret block; what is relayed counts in each receiver's 64 MiB of pushes | the server's log: an update the room could not integrate, with the account's id (ADR 0083 item 14) |
| — `sync_*` | a device (any credential may ask) | a write, deletion or rename needs a writer, names its base hash and is refused when the file changed; a deletion goes to `.trash/`; the quota on the whole file | pieces of 1 MiB, read from the disk and written to a temporary file as they go, one in memory per transfer (82fb2c3); 2 transfers each way per connection, dropped after 120 s idle and when the connection ends, a send's temporary file with it; 1 GiB per file; a send's declared size held in the quota from its first piece until it lands or is dropped (7ed171c9), and judged again at its last; a walk at most once a minute | the server's log for a refusal other than "changed" |
| — `render_markdown`, `board_text`, `log_write`, `capabilities` | signed in | — | the parser is fuzzed and checked for linear time; log lines one line each, 2000 characters | the server's log (`log_write`) |
| `GET /r/{token}` (a read link's page, ADR 0105) | anyone | `Host`; one static page, the same for every address, so it says nothing of a token | the connection limits, as the window's files; `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow` | nothing |
| `GET /r/{token}/state`, `POST /r/{token}/unlock`, `GET /r/{token}/ws`, `GET /r/{token}/f/{*path}` | whoever holds the link's address (256 bits, kept as its SHA-256) | `Host`; the feature on, the link not revoked and not expired, every refusal the same 404 (item 6) and judged again by every request and command; a passphrase proved first when the link has one (a cookie for that path alone, `HttpOnly`, `SameSite=Strict`, 12 hours, in memory); the WebSocket and the passphrase's `POST` want this server's `Origin`; a command is on the list of a visitor (`visit::allowed`: the folder's read commands a reader may call, and a few of the window's own that say nothing of a note) or refused before the core acts; every path joined to the link's scope and confined (`scope.rs`), a reader's projection at every exit (ADR 0087); a file under `/r/<token>/f/` sent as `/f/` is, a note never sent | 20 a second and 100 at once per address and per link, 429 past them (ADR 0083 item 7); a place among the connections of the link (32) and of the address (64); the commands of a link at its pace (100 a second, 400 at once), messages judged by name and size as the WebSocket's (`inflight`); a wrong passphrase delayed by address and by link as a sign-in is, one attempt in flight per key, its Argon2id in one of the server's places | audit `read_link_passphrase` (a wrong one); a wrong passphrase is a `WARN sign-in failed` line of the server's log under the owner's masked e-mail, which the shipped fail2ban filter reads, and the 20th in an hour tells the owner (ADR 0083 items 1 and 2) |
| `GET`, `POST /api/folders/{id}/readlinks`, `GET …/readlinks/secrets`, `DELETE …/readlinks/{link}` | the folder's owner, the person (never a token) | Origin; the owner's role, 404 when none; a fresh proof within ten minutes to make a link (ADR 0083 item 6); the feature on; the target a folder or a served note inside the folder, no hidden part; a passphrase of 6 to 200 characters; an expiry of 1, 7 or 30 days or a date within ten years | the token is in the answer that makes the link and nowhere else | audit `read_link_made` and `read_link_revoked`, with the path |
| `GET`, `PUT /api/admin/read-links` | admin | Origin; a fresh proof to change it | off on a new server | audit `read_links_on`, `read_links_off` |
| `GET`, `POST`, `DELETE /api/admin/link`, `POST /api/admin/link/extend` (the UniVerso's own link, ADR 0117 D4 item 2) | admin, never a token | Origin and CSRF on a change; a fresh proof to turn it on or extend it, none to turn it off; a pasted token checked for its shape, never repeated in an answer | one link at a time | audit `link_on` (`quick` or `own`; the environment's at start with the address `environment`), `link_extend`, `link_off` |
| The link's listener (a UniVerso's own link) | `cloudflared` on the same machine, `127.0.0.1` only, for the internet | as the server's own routes, but `Host` the link's name alone (421 otherwise, none while it has no address), `Origin` the link's alone, `Secure` from the tunnel's `X-Forwarded-Proto` | the client is the rightmost `X-Forwarded-For` (loopback the named proxies), and every limit above counts it; 256 places of its own beside the server's 512; Cloudflare's own bounds on a quick link (200 in flight, ~100 s an answer) | `the internet link's listener is open/closed`, `the internet link has its address` — never the address |
| GitHub's releases and Cloudflare's edge | the server, outbound, only while its link is on or starting | the pinned `cloudflared`'s SHA-256 before it is kept, and again before each run | one download at a time, 128 MiB at most | `cloudflared … downloaded and checked`; `cloudflared`'s `ERR` lines, addresses taken out |
| The release feed | the server, outbound | — | once a day; no redirect followed (ADR 0083 item 8); the version alone in the `User-Agent`; `VERSO_UPDATE_TOKEN` when the repository is private; `VERSO_UPDATE_CHECK=off` | a line when it fails |
| The host's mail server | the server, outbound, when `VERSO_SMTP_URL` is set | — | what the mail routes above allow | a line when sending fails |

## Threats and what answers them

### Reaching the server

| Threat | Answer as built |
|---|---|
| A password or a token read on the wire | **Plain HTTP is served** (the maintainer, 2026-10-16, ADR 0073 item 6 amended): over HTTP anyone on the same network reads the password, the session and the notes. This is a residual risk accepted for a home network and wrong for a public Wi-Fi; the window says it (sign-in page, Settings, one notice a session) and turns off what needs a secure context. Over HTTPS — the server's own TLS (`VERSO_TLS_CERT_FILE`), or a believed proxy's (`X-Forwarded-Proto: https`, which alone decides) — the session cookie is `Secure` and `__Host-`, and HSTS, with `includeSubDomains`, is sent. |
| Forwarded headers forged to look secure | Believed only from an address or range of `VERSO_TRUSTED_PROXY`, a list; the client's address is the right-most `X-Forwarded-For` entry that is not a trusted proxy, walking left; an untrusted peer's header is ignored, and a trusted proxy that forwards none is served as itself, said in the log once a minute when the proxy was named (ADR 0083 item 5). An empty `VERSO_TRUSTED_PROXY` believes loopback and private networks (2026-10-16): a client on the home network can forge `X-Forwarded-For` and be paced under the address it writes, which blunts the per-address pace but not the account's own delay. `X-Forwarded-Proto` is believed from any trusted proxy, not walked. A loopback peer that is not a trusted proxy and sends `X-Forwarded-For` is said in the log once a minute, and so is, at start, an `https://` address served on loopback with neither TLS of its own nor a trusted proxy (2757decd). A trusted proxy at `127.0.0.1` believes every local program that connects to the port; the installation guide says how a shared host keeps the port to the proxy's user (ea265421, not run). |
| DNS rebinding: a site resolving its own name to the server | The `Host` header must be the public address's or a loopback name — `localhost`, `127.0.0.1` or `[::1]`, compared whole: `[::1]` followed by anything had passed, found by the fuzzing of ADR 0083 item 14 (c0b9924); else 421. The links the server mails and prints are built from `VERSO_PUBLIC_URL`, never from a request's `Host`. |
| A server announcing itself on the network, and a forged announcement | Beyond loopback the server announces `_verso._tcp` by mDNS on its private and unique-local interfaces only: its version, whether it speaks TLS, a random id, and its public address when `VERSO_PUBLIC_URL` is set — no computer, folder or account name; `VERSO_ANNOUNCE=off` stops it (ADR 0097). The announcement is unauthenticated, so the desktop app only **lists** what it finds while Settings › Servers is open (at most 50, names cut, unusable addresses dropped), shows the address, and connects to nothing and sends nothing until the person clicks; a forged one can at worst offer a wrong address (an IP, or a `url` it chose) that the person sees before clicking; the click starts a device approval at that address, which learns the device's name and gets no credential. |
| A bad DNS answer sending the app to the wrong host, or another resolver's answer trusted too far | **New with ADR 0097**, and a real new exposure, bounded: when a connection to a server fails, the desktop asks each global DNS server of the system for the name (UDP, port 53, unauthenticated) and tries the other addresses after the system's. For an `https` server the certificate is verified for the URL's name, so a wrong address cannot take the token; the scheme is never changed. For an `http` server the token would cross in the clear to whatever answers, so another resolver's addresses are used only when on a network this machine is on (inside the subnet of one of its interfaces — never carrier-grade NAT's 100.64.0.0/10 as such, never loopback), and not at all when the system said the name does not exist. An address that worked is reordered only among the addresses the current resolution returned (a café's network is not sent to the home address), and one that failed goes last. The queries are sent to the system's own resolvers and only after a failure. The error names the addresses tried. |
| Listening beyond loopback by accident | Refused at start without `VERSO_PUBLIC_URL`; the default is `127.0.0.1`. |
| A password or a token read on the wire | **Plain HTTP is served** (the maintainer, 2026-10-16, ADR 0073 item 6 amended): over HTTP anyone on the same network reads the password, the session and the notes. This is a residual risk accepted for a home network and wrong for a public Wi-Fi; the window says it (sign-in page, Settings, one notice a session) and turns off what needs a secure context. Over HTTPS — the server's own TLS (`VERSO_TLS_CERT_FILE`), or a believed proxy's (`X-Forwarded-Proto: https`, which alone decides) — the session cookie is `Secure` and `__Host-`, and HSTS, with `includeSubDomains`, is sent only for the server's own TLS or an `https://` `VERSO_PUBLIC_URL`. Cookies are not separated by port: over HTTP the `verso-session` cookie goes to every other HTTP service on the same host or IP — on CasaOS or ZimaOS every other app at `http://<ip>:<port>` receives the session token, and can set one; `__Host-` over HTTPS closes it. |
| Forwarded headers forged to look secure | Believed only from an address or range of `VERSO_TRUSTED_PROXY`, a list; the client's address is the right-most `X-Forwarded-For` entry that is not a trusted proxy, walking left; an untrusted peer's header is ignored, and a trusted proxy that forwards none is served as itself, said in the log once a minute when the proxy was named (ADR 0083 item 5). An empty `VERSO_TRUSTED_PROXY` believes loopback and private networks (2026-10-16): a client on a private network, or in Docker any visitor of a published port (docker-proxy connects from the bridge gateway, in 172.16.0.0/12), can write `X-Forwarded-For` and be counted under any address; a forwarded `127.0.0.1` is counted like any other, and only a loopback socket that forwarded nothing is exempt from the pace, the in-flight cap and the WebSocket cap. An attacker who rotates forged addresses defeats the per-address limits; the account's own delay and lock still hold. Name the real proxies in `VERSO_TRUSTED_PROXY`, or write `none`, to close it. `X-Forwarded-Proto` is believed from any trusted proxy, not walked. A loopback peer that is not a trusted proxy and sends `X-Forwarded-For` is said in the log once a minute,. A trusted proxy at `127.0.0.1` believes every local program that connects to the port; the installation guide says how a shared host keeps the port to the proxy's user (ea265421, not run). |
| A password or a token read on the wire | **Plain HTTP is served** (the maintainer, 2026-10-16, ADR 0073 item 6 amended): over HTTP anyone on the same network reads the password, the session and the notes. This is a residual risk accepted for a home network and wrong for a public Wi-Fi; the window says it (sign-in page, Settings, one notice a session) and turns off what needs a secure context. Over HTTPS — the server's own TLS (`VERSO_TLS_CERT_FILE`), or a believed proxy's (`X-Forwarded-Proto: https`, which alone decides) — the session cookie is `Secure` and `__Host-`, and HSTS, with `includeSubDomains`, is sent only for the server's own TLS or an `https://` `VERSO_PUBLIC_URL`. Cookies are not separated by port: over HTTP the `verso-session` cookie goes to every other HTTP service on the same host or IP — on CasaOS or ZimaOS every other app at `http://<ip>:<port>` receives the session token, and can set one; `__Host-` over HTTPS closes it only against plain-HTTP neighbours: cookies ignore ports, so the cookie still reaches other HTTPS services on the same host. |
| Forwarded headers forged to look secure | Believed only from an address or range of `VERSO_TRUSTED_PROXY`, a list; the client's address is the right-most `X-Forwarded-For` entry that is not a trusted proxy, walking left; an untrusted peer's header is ignored, and a trusted proxy that forwards none is served as itself, said in the log once a minute when the proxy was named (ADR 0083 item 5). An empty `VERSO_TRUSTED_PROXY` believes loopback and private networks (2026-10-16): a client on a private network, or in Docker any visitor of a port published through docker-proxy (a loopback-published port, a hairpin, IPv6 onto an IPv4 bridge, Docker Desktop, rootless Docker), who arrives from the bridge gateway (172.16.0.0/12; rootful Linux Docker with iptables NAT keeps the client's address), can write `X-Forwarded-For` and be counted under any address; a forwarded `127.0.0.1` is counted like any other, and only a loopback socket that forwarded nothing is exempt from the pace, the in-flight cap and the WebSocket cap. An attacker who rotates forged addresses defeats the per-address limits; the account's own delay and lock still hold. Name the real proxies in `VERSO_TRUSTED_PROXY`, or write `none`, to close it. `X-Forwarded-Proto` is believed from any trusted proxy, not walked. A loopback peer that is not a trusted proxy and sends `X-Forwarded-For` is said in the log once a minute. A trusted proxy at `127.0.0.1` believes every local program that connects to the port; the installation guide says how a shared host keeps the port to the proxy's user (ea265421, not run). |
| DNS rebinding: a site resolving its own name to the server | With `VERSO_PUBLIC_URL`: its name, or a loopback name — `localhost`, `127.0.0.1` or `[::1]`, compared whole (`[::1]` followed by anything had passed, found by the fuzzing of ADR 0083 item 14, c0b9924); else 421. Without it (2026-10-16): only names a public page cannot make resolve here — an IP address, a name of one label, `.local`, `.home.arpa` — or any name carried by a request that a proxy *named* in `VERSO_TRUSTED_PROXY` forwarded; the default list widens nothing, since a rebound page adds `X-Forwarded-For` itself. Other names get 421 saying to set `VERSO_PUBLIC_URL`. The links the server mails are built from `VERSO_PUBLIC_URL` only, never from a request's `Host`: the sign-in link and "forgot the password" are refused without it (a poisoned `Host` once would have mailed the victim a link to the attacker's server); an admin's invitation or reset link uses the admin's own session. |
| Listening beyond loopback by accident | No longer refused at start (2026-10-16): the package listens on `127.0.0.1` until `VERSO_LISTEN` says otherwise, and the Docker image on every address, answering over plain HTTP; the log says once at start that plain HTTP works, and the window says what is off. |
| A connection held open to tie up the server | Every connection takes a place first — 512 on the server, 128 per address — before its TLS handshake (10 seconds) or a byte of HTTP; a request's headers have 30 seconds and 64 KiB, a request 60, its body 10; an address keeps 32 requests in flight, through a proxy too (0a04d1b7). A WebSocket is pinged every 30 seconds and closed after two pings unanswered, and closed when a write is not taken in time; an account holds 32 of them, an address 64 (gaps 2, 4 and 8, closed). |
| The process taking the host | The container starts as root only for the entrypoint (it hands what root owns under `/data` and `/folders` to uid 1000 when 1000 cannot write there: `find -xdev -user 0`, `chown -h`, no symlink followed, only under the two mounts, a file with several hard links left alone; device nodes, FIFOs and sockets left alone; two races remain, by someone who can write inside a mount: a directory swapped for a symlink between `find` and `chown`, or a listed one-name file renamed away and replaced by a hard link to a root file outside the mount (needs `fs.protected_hardlinks=0` or write access to the target); the mounts are the administrator's and it is before uid 1000 runs). The mend reaches the whole tree under each mount (the maintainer chose "the whole folder, always"): a mount that is too wide, such as `/DATA` on ZimaOS, hands the root-owned files of other apps to uid 1000, and the log counts what was handed over), holding `CHOWN`, `SETUID` and `SETGID` and nothing else, and the server runs as user 1000 with no capability (`CapEff` 0, seen in `/proc/1/status`), `docker exec` commands too; the container is declared read-only with a `tmpfs` `/tmp`, every capability dropped and `no-new-privileges`; the systemd unit runs as `universo` with `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectProc=invisible`, `ProcSubset=pid`, no capabilities, `SystemCallFilter=@system-service` less `@privileged` and `@resources`, a narrow address-family set and `UMask=0027`; a folder is made `0750` (ADR 0075; ADR 0083 item 11). |

### Signing in and staying signed in

| Threat | Answer as built |
|---|---|
| Guessing passwords | Argon2id (OWASP's first parameters); a growing delay by address and by account, and one bucket for the server's refused sign-ins, never a lock a stranger can use; 20 refusals in an hour tell the account by mail, once a day at most (ADR 0083 item 2); every refusal a log line the shipped fail2ban filter reads (item 1) — an IPv4 address or an IPv6 /64 and no wider range, the jail closing http and https only, the Docker recipe matching the container's lines by `_SYSTEMD_UNIT` (1c507ac5); one attempt in flight per account and per address, so attempts sent together meet the delay as they do one by one (b570239b); 12 characters at least, none of the 10 000 commonest of 12 or more, nor the account's e-mail (item 3). |
| Learning who has an account | A wrong password and an unknown e-mail are answered alike, in about the same time (a hash is computed either way, for an account with no password yet too, 59189d6a); a passkey's start answers an unknown e-mail and an account without passkeys alike, and gives an account with passkeys its challenge — which says that the address has passkeys, never that an account without them exists. A sign-in link and "forgot the password" answer alike in their words and in their time: the answer leaves before the address is looked up (gap 6, closed). |
| A stolen session cookie | `HttpOnly`, `SameSite=Lax`, `Secure` and `__Host-` over HTTPS; 14 days idle, 90 at most; listed in Settings and ended there; a password change ends the others; checked again before every command of an open WebSocket, and an ended session's connections are told and closed at once. A sensitive action — a token, a passkey, a device approved, the password, an admin's powers or reset link, an admin's invitation that carries a folder or a share (714e974f), a member's role — asks for a fresh proof within ten minutes (ADR 0083 item 6). |
| Cross-site requests | Every request that changes something checks `Origin` against the server's and carries the session's CSRF token; the WebSocket checks `Origin` before it accepts the cookie. A sign-in link from a mail names its account and is used only on a click (ae7d3926); sign-in's `next` follows only a path of the server itself (e56b5679). |
| A token leaked from a script | Personal access tokens are scoped to folders and to reading or writing, never more than the member's role; never an admin, never the account's own pages; made only from a browser; prefixed `verso_pat_` for secret scanners; kept as SHA-256; an expiry of a year at most, or none said in red; revocable; revoked by a password reset, by `admin reset`, and by a change when asked (ADR 0083 item 4). |
| The first admin taken by whoever arrives first | No setup page open to anyone: the admin comes from the environment on the first start, or from a single-use setup link valid one hour, printed once in the log — whoever reads the log is whoever runs the server. The install's next steps, the guide and the compose note say that the link stays in the journal and opens nothing once the admin exists, and to remove `VERSO_ADMIN_PASSWORD` then (ea265421). |
| A lost admin | `universo admin reset <e-mail>` (or `verso serve admin reset`) on the machine: access to the machine is the last factor; the reset is in the audit log, ends the account's sessions and revokes its tokens (ADR 0083 item 4). |
| An invitation or a reset link forwarded or guessed | 256 bits, single use, an expiry (7 days, 24 hours), its use recorded (by whom, when), ended by the admin before use; attempts slowed by address. |
| A device approved by mistake | The approval page shows the device's name and the code the app shows, the address and the time of the request, asks a signed-in person in the browser *Was it you who asked, on this device?* and offers to refuse, and the device's session is listed and revocable. The device's name is the one the requester sent; the address and the time are the server's (gap 12). The page always asks for the code the app shows — copied by the app to the clipboard, pasted or typed — and never takes one from its link, so a link someone else sent approves nothing (ADR 0083 item 17; decided 2026-10-14, 96cf6a82); approving asks for a fresh proof (item 6). The device's name is kept without bidi or other format characters, a joined emoji's joiner apart, and said in a `<bdi>` wherever it is shown (ae82caed, e3015123, d861f522). The session an approval makes is born without a proof, and proves before a sensitive action as any session does — the desktop app with the password, when its server asks (ce0bcc42, 0d168223). |
| A device or a phone lost | The person ends the session in Settings; an admin ends every session of an account and revokes its tokens from the console, its open connections closed at once, with an audit line (ADR 0077 item 3, built). |
| Passkeys | WebAuthn with user verification required (webauthn-rs); the ceremony's state lives five minutes in memory; counters stored. |

### One member against another

| Threat | Answer as built |
|---|---|
| Reaching a folder one was not given | Every command and every file request checks the member's role in the folder before the core acts; a folder one may not see answers 404. The admin is no exception: entering a folder is a grant to oneself, in the log the owner reads. |
| A reader writing | Write commands, a shared note's update, save and resolve, a device's put, delete and rename, and the folder's settings are refused below the editor's role; the window hides what the role cannot do. A role changed or removed reaches the member's open windows at once. The walk's rules and the folder note's name are the owner's: an editor's change of the folder's settings leaves them as they were (3681a59f, 9000fc29). |
| Stored XSS through an attachment (HTML, SVG) | Files are served from `/f/` with `Content-Security-Policy: sandbox` and `nosniff`: a document made of them runs no script. |
| Stored XSS through a note's HTML | The window's sanitizer, `app/ui/src/sanitize.ts`, is the boundary between members (ADR 0073 item 6): an allowlist of elements, attributes and the renderer's classes, parsed in an inert document; scripts, styles, forms and foreign content dropped; links to the web, mail and the page only; an embedded page behind the reader's approval of its origin; inline style kept but never fixed or absolute. The window's own policy, sent as a header, allows scripts from the server only. Mermaid runs at `securityLevel: "strict"`; KaTeX with its defaults. What the sanitizer guarantees, and the suite that holds it to that: below (gap 1, closed). The review by the model that did not write it done on 2026-10-13 (ADR 0083 item 16); its `[OPEN]` left for the maintainer (the gaps before the announcement). |
| Remote content leaking who reads | Remote pictures and embedded pages follow the reader's own setting, never the author's (the maintainer's answer I). A browser's window settings, the approved embed origins among them, say whose they are: another account's are dropped before the window reads them, and signing out forgets them (aea753e0). |
| Symlinks leading out of a shared folder | On a server a link is followed only when it leads inside the folder; one that leaves is refused and listed as a problem. |
| An edit that erases another's text | Simultaneous editing merges; a write from elsewhere is merged line by line or refused as changed; a change made outside while edits wait stops the room for people to choose. A board merges by element, Excalidraw's rule (ADR 0082 item 12): a member's change to one element can win over another's to the same element — the higher version — but never touches the others' elements, and a deletion is a tombstone a later undo can bring back; a window that hands the room a false file of the board is a writer writing, as any write. One room per file: a room's path is the confined one (7c0d4792). `[OPEN]`: history, attribution and recovery of another member's change (ADR 0073). |
| A deletion of another's file | A deletion goes to the folder's `.trash/`, from the window and from a device alike; seeing and restoring it in the window, and its retention, are ADR 0080, accepted, being built. |
| A huge message or many requests to exhaust memory | A WebSocket message is 48 MB at most for an upload, 32 MB for a note's or a board's text or a folder-data write (a bundle is up to 4 MiB), 1 MB for any other command, judged before it is parsed, and the messages and answers above 1 MB share 128 MB of the server (767fbb41); a text is read or written 16 MB at most on the server (bc65b8d6); a file under `/f/` is sent 256 KiB at a time (cbf905a3); Argon2id runs in a few places at once (b570239b); a malformed Yjs update is refused, and an update's counts and nesting are read against its bytes before yrs reserves anything (ADR 0083 item 14); a note room takes an update of 4 MB at most (item 8) and holds 64 MB, and a window is in 64 rooms at most (9629fac2); a connection has 8 requests under way at most, and a queue of 1024 messages and 64 MiB of pushes, closed when it fills; a presence is 16 KB at most; a board room takes an update of 4 MB and 10 000 entries at most and holds 100 000 entries and 64 MB, and a board's file handed to it is 16 MB at most (ADR 0082 item 12). Commands keep a pace per account and on the server, and connections are counted per account and per address (gaps 3 and 4, closed). A folder's space is bounded by its quota (ADR 0077 item 5): a write that would pass it is refused and nothing is written, and writes under way hold their room, so two together cannot pass it (7ed171c9). |
| An update that crashes a room or the server | The server's inputs are fuzzed on `main`, 60 s a target with `-O` (ADR 0083 item 14): the WebSocket's request, a sync frame, a note's and a board's Yjs update, a presence, the `Host` and `Origin` headers, a size. A panic of yrs at a room's boundary is caught, the update refused with a `WARN` line naming the account, and the room made again from its file: the room's members lose the edits since it last wrote, 900 ms after the last edit. What ended the process — a value nested deep enough to overflow the stack, a run of length 0 that panicked again during the unwinding — is refused before yrs reads it; a window's updates are taken in the order it sent them, so none waits on yrs's pending path; what a joining window and a board's write are sent is applied in a scratch document first, and the room made again when it does not apply. |
| Presence that lies | The server stamps a presence with the sender's account name, keeps only a colour that is a colour, and lets a connection speak only for its own Yjs clients: a member's cursor cannot wear another's name, nor move or remove another's (gap 11). |
| A reader reaching a note's secret block (ADR 0087) | One who may only read — a reader's role, a read share, a token that only reads — is served every note through one projection (`verso_dialect::project`): the folder's read commands by `verso_service::reader::READER_COMMANDS` (a read command not on that list is refused to a reader, and its test fails); search, links, backlinks, tags, graph and bases from one index whose secret text is searched apart and whose constructs inside a secret block are flagged, a reader's lines numbered as its projection numbers them; a live note through a document of its own holding the projection, updated when the room writes, its presence names without cursors, and a reader in the room's own document sent out before a secret block's first edit reaches it; sync's bytes, hashes and change log the projection's, a change only inside a secret block none for a reader, nor a notice; a writer made a reader leaves the rooms it wrote in. The guardrail: `tests_secret.rs` sends every command of the contract as a reader and fails on any word of a secret block in what it hears (seen failing with the projection turned off), beside the dialect's property test and fixture `callout/secret`. Not protected, by design (ADR 0087 item 7): whoever may write the note, and whoever holds the file. A reader learns that a note changed when its projection changed. |
| A reader reaching a board's secret pin (ADR 0090 item 5) | A node of a `.canvas` marked `"verso": {"secret": true}` is taken out for one who may only read, by one pure projection (`verso_core::canvas_secret::project`): the node, its edges, and the drawn elements that lie under it, are bound to it or hold a group only secret nodes hold; a board with no secret node is served as it is, an unreadable one that mentions a secret is served empty, a `secret` that is anything but `false` or `null` counts. Every exit a reader has to a board answers from it: `read_text`, `read_file_text` and `read_note` (the board read as text), `board_preview` (laid over the projection), the listing's size, search and backlinks and the graph (the index flags the links of secret nodes, searches the public text apart, numbers a reader's lines by the projection), sync's manifest, pieces and change log, `/f/` (refused for a board), and the board's room, which a reader does not join (the room holds every element). The guardrail: `tests_secret_pins.rs` sends every command of the contract as a reader and fails on any word of a secret pin in what it hears (seen failing with the projection turned off), beside the projection's property test (`tests/canvas_secret.rs`, idempotent, non-secret elements untouched, no id, text, file, address or coordinate of a secret node left). Not protected, by design: whoever may write the board, and whoever holds the file; a secret callout inside a board's text node is projected as in a note (finding I3 below). `map_open` and `map_tile` serve the bytes of a picture of the folder a reader may already read through `resolve_attachment`; cutting a large PNG costs the host one thread, one picture at a time, 384 MB at most. |

### What the sanitizer guarantees

`app/ui/src/sanitize.ts` is written by hand, with no library. Read again
on 2026-10-13 by Fable 5.1, the model that did not write it (ADR 0083
item 16). Reviewed line
by line on 2026-10-11 against what reaches it — the dialect's `to_html`
with a note's raw HTML, embedded notes and blocks, callouts, links, and a
table's cells in Live Preview, which reached the page uncleaned until then
— it parses the HTML in an inert document and keeps an allowlist: the
renderer's elements and plain formatting; the attributes `class`, `id`,
`title`, `lang`, `dir`, `style`, `align` and the renderer's `data-*` on any
of them, and each element's own (a link's `href`, a picture's `src`, `alt`,
`width`, `height`…); the renderer's classes only. What runs, loads, styles
the page or is raw text — `script`, `style`, `object`, `embed`, `base`,
`meta`, form controls, `template`, `noscript`, `svg`, `math`, any element
outside HTML's namespace — goes with all it holds; comments go; every
`on*` attribute goes. A link reaches http(s), mail or the page; a picture
the web, data (`data:image/`) or a file beside the note; each address as
the URL parser reads it, so `java&#9;script:` and its kind go. Every id and
every `#` link moves under `note-`: a note names none of the window's ids
and no global (`isTauri`). An inline style is kept as the CSSOM reads it,
never `fixed` or `absolute`, its `url()` only to the web (remote content
on) or a picture in data. An `<iframe>` is a box until the reader approves
its origin, and never one for an address off the web; the box carries
what its button needs, the button takes the origin from the address
itself, and a box does not survive a second cleaning, so a note cannot
forge one (4b8a04c). What it gives back
parses to itself and cleans to itself: no mutation XSS on the way through
`cleanHtmlText`. The hostile inputs, 102, live in
`app/ui/test/sanitize-cases.mjs` — the OWASP cheat sheet's staples, the
known mXSS payloads, encoding tricks, clobbering, and since 2026-10-13
what a browser's parser does with foreign content, `noscript`,
`template`, `textarea` and `title`, a forged gate box, a note ten
thousand levels deep. `app/ui/test/sanitize.test.mjs` prints this
policy, checks it against the module's, and runs them in `npm test`, in
happy-dom; `app/ui/e2e/sanitize.spec.mjs` runs the same cases in WebKit
and Chromium through the harness (`npm run e2e`), where the window's own
sanitizer cleans each and the browser's parser reads the output back
(ADR 0083 item 16, 95b7a22).

### A device that syncs

| Threat | Answer as built |
|---|---|
| A device writing where its account may not | A device syncs over its device session (ADR 0074 item 8): each write, deletion and rename it sends is checked against the account's role in the folder before the core acts — a reader's device receives, its local changes refused (ADR 0079 item 1) — and a write against the folder's quota (ADR 0077 item 5). |
| A device's write over a newer version | Every change a device sends names the hash it was based on and is refused when the file on the server is no longer that one (invariant 11); the device then keeps both, its own as a conflict copy (ADR 0079 item 8). Two pure appends to a note's end are joined instead, on the device, and said "merged" in the sync's log (built, 0fae650). A known limit: a program outside Verso saving a stale buffer is an ordinary change (ADR 0079, finding F18); keeping the version it replaced is ADR 0080 item 12, accepted, being built. |
| A device deleting a folder's files | A deletion a device sends is checked against its base like a write and goes to the folder's `.trash/` on the server; on the computer, a pass that would delete more than a fifth of the files or more than 50 (3 at least) pauses and asks (ADR 0079 item 9), and a placeholder is never a deletion (ADR 0043). Seeing and restoring the trash in the window is ADR 0080, accepted, being built. |
| A device token stolen | Kept `0600` on the computer (above), listed among the account's sessions under the name the person gave the computer, and revocable there; an admin ends it from the console with the account's other sessions and tokens (ADR 0077 item 3, built); the change log names the device beside the account (ADR 0079 item 4). |
| A device speaking another sync | The device sends its sync version as `x-verso-sync`; the server answers its own in the hello and refuses the `sync_*` commands of a version older than the previous one, with the reason (ADR 0079 item 5, built). A window or a program that says none is never refused. |
| A huge file to exhaust memory | Sync moves a file in pieces of 1 MiB, read from the disk as each is sent and written to a temporary file as each arrives — a transfer holds one piece in memory, never the file (82fb2c3) — two transfers at a time each way per connection, dropped after two idle minutes and when the connection ends, and no file larger than 1 GiB (ADR 0079 item 12); a file above it on the server is never read by the walk, and is listed on the folder's console page. A send's declared size is checked against the quota at its first piece (gap 5, closed), and held there until it lands or is dropped (7ed171c9). |

### Sharing a folder inside a folder

ADR 0081, accepted on 2026-10-11 and **not built**: these rows say what it
decides, not what runs. *2026-10-13:* the second review read sharing as
built at 52dc95c; its findings S1 to S3 are closed in the rows below.

| Threat | Answer as decided |
|---|---|
| A receiver reaching beyond the shared path | A share is a grant on a path; the session that opens it holds the path, every command's paths are joined to it and confined (`..` refused before `verso-fs` acts), and every answer — the tree, a search, backlinks, the graph, a base's rows, the change log — is filtered to the path and re-rooted at it (items 1 and 2). |
| Learning of the notes outside the share | A link to a note outside resolves to "not in what was shared with you": not whether it exists, not its path, not its content (item 11). *Found and closed on 2026-10-13 (second review, S2 and S3):* a link outside the share and a link resolving nowhere were answered differently, which told whether a note of a given name existed outside; both now cross alike (b900c346). A note's type named a schema outside the share; it is now resolved over the share alone, and a type naming a schema outside is dropped (be1f069b). |
| A share passed on, or kept after it ends | Only the folder's owner shares, and a receiver does not re-share (item 4); a revocation reaches the receiver's open windows at once, and a synced copy stays on their computer with its sync off — said to the owner when sharing (item 8). *Found and closed on 2026-10-13 (second review, S1):* an invitation to a share accepted after the share was removed granted the whole folder; it now ends with the share and grants nothing (5e2bf8d8). |
| A share left pointing elsewhere | A rename made through the server carries the grants with it; one the server only finds afterwards leaves the share on a path that is gone — an empty folder for the receiver, the owner told (item 13). |
| A share made unseen | A share created, changed and removed is an entry of the audit log with its path, read by the owner and the admin (item 9). |
| A warning or a problem naming a note outside the share | Gap found and closed on 2026-10-12: a warning of the core (a rename's examination, an index run's problems) reached the receiver when it named no `/`, so a note at the owner's root crossed by name; now a warning reaches a receiver only when it begins with a path inside the share, re-rooted there, and any other is dropped (item 11; `scope.rs`, its test). A second gap of the same row, closed the same day: a warning that began inside the share could name an outside path later in the line (`Mesa/x.md: links to Segredo.md`); now every name the message holds — a link, a word with a `/` or an extension — must be a path inside the share or its attachments folder, or the whole warning is dropped (`scope.rs`, `a_warning_naming_an_outside_path_later_in_the_line_is_dropped`). |

### The trash and live co-editing of a synced folder

ADR 0080 and ADR 0082, accepted and **not built** at this HEAD (0080 is
being built): these rows say what they decide, not what runs.

| Threat | Answer as decided |
|---|---|
| A member erasing the evidence of a deletion | The trash is seen by writers; any writer restores; "delete now" and "empty the trash" are the owner's and the admin's; every entry names who deleted it; a restore, a delete-now and an emptying are in the audit log (ADR 0080 item 7). |
| The trash used to pass the quota | Shown, not counted against the quota, bounded by expiry; when a folder's trash alone exceeds its quota, its oldest entries expire early, said on the folder's page (ADR 0080 item 8, decided 2026-10-10). |
| A device's write replacing a version unseen | The version a device's write replaced is kept (ADR 0080 item 12). |
| A device in a room as someone else, or a reader typing | The person in a room is the account the device signed in as, its role the folder's as the sync's link learned it, followed on a change; a reader is present and does not type, and the server refuses a reader's update as it does already (ADR 0082 item 4). |

### The server's own reach

| Threat | Answer as built |
|---|---|
| The server as an open proxy | It reaches the network only for the update check — the project's release feed, once a day, with nothing but its version in the `User-Agent`; `VERSO_UPDATE_CHECK=off` stops it — and for the host's mail server when `VERSO_SMTP_URL` is set. |
| The databases corrupted on a NAS | Warned in the log and on the admin page when `VERSO_DATA_DIR` is on a network file system. |
| Secrets in the log | No password, token or link is logged; a refused sign-in's line masks the e-mail to one word (ADR 0083 item 1); the setup link is the one secret printed, once, by design. A window's log lines are one line each, control characters replaced. The console shows the configuration with its secrets (`VERSO_UPDATE_TOKEN`, `VERSO_SMTP_URL`) as set or not, never their value. |
| A vulnerable or unlicensed dependency | `cargo-deny` (advisories, licenses), the npm license allowlist and the npm advisories in CI — a high or critical one fails unless `app/ui/audit-exceptions.json` excepts it with a reason, a link and an expiry (ADR 0083 item 13); one unmaintained notice excepted with an expiry (RUSTSEC-2026-0215, smallstr via yrs), and one npm advisory (braces 3.0.3, absent from the window's bundle, until 2027-01-11). |
| A backup read where it was copied | `universo.sh backup --encrypt` encrypts it with `age`, to a public key or a passphrase; the secret key is never a command's argument and is left on none of the host's usual directories (ADR 0083 item 12). Without `age`, an encrypted backup asked for stops and writes nothing (decided 2026-10-14); the plain tarball is made only when no encryption is asked (a7dbf5c1). |
| A backup or a package replaced where it was kept | `universo.sh restore` lists a backup first and refuses it whole, writing nothing, when any entry is not a plain file or a directory under the backup's own paths — an absolute name, a `..`, a link, a device or a set-id file (a1fd623e). A backup is written under a name `mktemp` makes, `0600`, never inside what it copies, `..` and links resolved (fa860685). `install` and `update` stop when the release's signature is missing, unless `--no-signature` settles for the checksum (fa860685). |
| A flaw found with nowhere to report it | `SECURITY.md` and `/.well-known/security.txt` name the address and the promise (ADR 0083 item 15). |

### A UniVerso's own Cloudflare link (ADR 0117 D4 item 2, R5)

The UniVerso runs the desktop app's tunnel (`crates/verso-tunnel`) itself: a quick link or an own address by a tunnel's token, turned on by `VERSO_TUNNEL`, `universo.sh link` or the console. The tests are in `crates/verso-server/src/tests_tunnel.rs` and `crates/verso-tunnel/src/tests_token.rs`, a stand-in `cloudflared`, no network; the `Host` and the forwarded-address guards were seen failing with their check taken away (2026-11-14).

| Threat | Answer as built |
|---|---|
| The server put on the internet by mistake | Off unless `VERSO_TUNNEL` says `quick` or `own`, or an admin turns it on in the console with a fresh proof; the console and the log say when it is on (never its address); a quick link stops after 12 hours unless an admin extends it; it never comes back by itself after `cloudflared` ends, and a console start does not outlive the run. |
| A forged `X-Forwarded-For` through the link, to move or dodge a limit | The link's listener believes `127.0.0.1` and `::1` alone, named; the client is the rightmost address, which `cloudflared` appends and a client cannot forge (spike of 2026-11-03); a forged address before it changes nothing (test: a fourth wrong password from a new forged address is still delayed). A forwarded loopback is counted, never "this machine". |
| A page that rebinds a name onto the link's listener, or a link's page used against the server's own address | The link's listener answers only the link's name; the server's own listener never answers it; `Origin` follows the listener; both checked again at each change of the address — the old quick link's name refused at once, the new one's answered, with no restart (test). |
| The tunnel's token stolen | It is the tunnel's alone (it runs that connector, not the account): kept in the environment or a file `0640` (`universo.sh link`), handed to `cloudflared` in its environment (`TUNNEL_TOKEN`), never on a command line, never logged, never in an answer; a pasted one is held in memory for the run. A token Cloudflare refuses ends the start in its words. Revoking it is Cloudflare's dashboard. A host's own stray `TUNNEL_TOKEN` never reaches a quick link's `cloudflared`. |
| A replaced `cloudflared` | Downloaded only from `github.com/cloudflare/cloudflared/releases`, its SHA-256 pinned in Verso's source, checked before it is kept and before every run, into `VERSO_DATA_DIR/tunnel/` (`0700`), never the `PATH`. Whoever can write that directory can already read the database. |
| What is not covered | A quick link is Cloudflare's testing mode, and Cloudflare sees every request in clear (it ends TLS): as with any Cloudflare Tunnel. A token pasted in the console is not kept across a restart (smallest choice, `[OPEN]` in ADR 0117). The own address by a real token, the image's `read_only` and the package's systemd hardening with `cloudflared` running are manual checks. |

### The laptop as a server (ADR 0096)

"This app is a server" gives the desktop app its first listening socket, on a network the person does not control. What answers each threat, as built (the tests are in `crates/verso-server/src/local`; each was seen failing with its guard taken away):

| Threat | Answer as built |
|---|---|
| The port found by a scan, or left on in a café | Off until turned on and off again at every start unless *Keep on when the app starts* is ticked; a mark and *Stop* in the status bar while it serves; only the private addresses of the interfaces (RFC 1918, IPv4 link-local, IPv6 unique-local), never a public address and never the wildcard; a peer is admitted only from a private address on a subnet of the machine, before a place or a byte is read; a different set of addresses stops serving and asks again, and a wake with the same set resumes; a random port from the dynamic range, kept (not a defence, said so). |
| What the network learns from mDNS | Announced only while the pairing dialog is open, on the served interfaces only; `Verso-` and four random hexadecimal digits, never the computer's or the person's name; a record of the protocol version and the port; a goodbye when it ends. |
| A pairing guessed, raced or replayed | A token of 256 bits, single use, two minutes, only while the dialog is open; the typed code is the same secret; three wrong or reused attempts close the window; one phone waits at a time; with no dialog open the routes answer as an unknown route does, Origin and TLS checks included; the token travels in the QR's fragment, which a browser never sends. |
| A person in the middle while pairing | The limit of a self-signed certificate (trust on first use), said in Settings, in the dialog and in the tutorial: an active person at that moment could pass for the laptop. Bounded, not removed, by the laptop's *Was it you?* (name, address, time, Allow or Refuse; only Allow makes a session), by the fingerprint shown and carried in the QR for a native client, and by *for a network you trust*. |
| A paired phone lost or taken | *Revoke* ends the session and closes its connection at once; 14 days idle, 90 at most; *Forget all phones*; *Replace this computer's identity* makes a new key and ends every pairing; at most four phones paired. |
| A phone making the laptop do what it should not | An allowlist of commands, default deny, by role: a phone reads, or edits when the person let it from the laptop, and is never an owner or an admin; no `reveal`, open, updater, settings, log, MCP, sync, share, account, pairing or folder-opening command, nor the web-embed probe (a note cannot make the laptop fetch an address for a phone). A test reads the generated bindings and fails when a command of the contract is on no list. Only the ticked folders, by the name of their directory, never a path; a folder that also syncs with a UniVerso is refused. |
| The laptop exhausted | 64 connections in all and 16 per address, at most two phones connected, the other bounds of ADR 0083 (heads, headers, pace, WebSocket) in the same layers as `verso serve`. |
| A page on the network reaching the laptop (rebinding, cross-site) | The `Host` must be one of the addresses served; `Origin` is checked on every change and on the WebSocket; the session cookie is `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`; no token or device credential opens anything in this mode. |
| Secrets and records | The log and the audit record events — serving on or off, a window opened, closed, expired or failed, a token redeemed, allowed or refused, a phone revoked, a first connection — never a token, the QR's contents or a note; the audit is kept 365 days and shown in Settings. The database and the key are in the configuration directory, `0600`, never in a served folder. |
| What is not covered | A network with client isolation (a café, a hotel) will not route a phone to the laptop at all, which is the safer failure and is said. The first visit's trust is the person's. Windows does not serve yet. The firewall prompt, once explained, is the system's; the app never adds a rule. |

### Read links (ADR 0105)

A read link lets whoever holds an address read a folder, or one note, with no account: the first route a server of private notes opens to a stranger on purpose. The feature starts off and is turned on by the administrator (item 3). What answers each threat, as built; the tests are `crates/verso-server/src/tests_readlinks.rs`, `tests_threats.rs` and `scope.rs`, and each guard was seen failing with the guard taken away:

| Threat | Answer as built |
|---|---|
| The address guessed | 256 bits from the system's generator, base64url; the database keeps its SHA-256 and the passphrase's Argon2id hash, never the address; a token that is not shaped like one is refused before the database is asked, and a link that does not open — revoked, expired, never made, the feature off — answers one and the same 404, which says nothing of why; every route under `/r/<token>/` is paced per address and per link. |
| A secret block reaching a visitor | A visitor is a reader without an account: the notes' projection, without any `[!secret]` block or board pin, at every exit — the page, search, backlinks, the graph, counts, the files — by the code ADR 0087 built. A test calls every command of the contract as a visitor and fails on any answer or event holding a word only a secret block holds. |
| A visitor reaching beyond what was shared | The link's scope is a share's (`scope.rs`): a folder link joins every path to the folder and confines it (`..`, an absolute path, a hidden part and a sibling are refused before `verso-fs` acts); a note link reaches the note and what it embeds as a reader sees it — never an embed inside a secret block — followed four deep and 300 paths at most, and the set follows the note as it changes. A link out of what was shared shows as plain text "not shared", the same for a note that exists and one that does not. |
| A visitor writing, or reaching sync, a room, the history, the bin or MCP | A visitor's credential reads only; the list of commands (`visit::allowed`) holds no write, no `sync_*`, no `collab_*`, no history, no bin, no folder settings, nothing that makes the server fetch an address; the rest is refused with the same words before the core acts. A dice roll is made in the visitor's browser and written nowhere. The fuzz target `link` feeds arbitrary text as a token, a command and an address. |
| The passphrase guessed | A wrong one is a refused sign-in: the delays by address and by link, the Argon2id in the server's places, the log line the fail2ban filter reads — under the owner's masked e-mail, so that a ban follows the address —, and the owner told by mail on the 20th in an hour. A right one gives a secret for that link and path, `HttpOnly`, `SameSite=Strict`, 12 hours, held in memory: a restart asks again. |
| The address leaking to a search engine or another site | `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow` on every answer under `/r/`, the page never cached; the WebSocket and the passphrase's `POST` refuse an `Origin` that is not this server's. |
| A link that outlives its welcome | The owner revokes it from the panel and every page that holds it is told and closed at once; the expiry closes an open page when it comes; the administrator turning the feature off closes every one; each command is judged against the link again, so a page the server could not reach still refuses. A rename of what a link points at carries the link; a deletion ends it. |
| A link made and forgotten | The tree marks every folder and note with a live link; making one for a place with secret blocks says, before it is made, how many notes have them; the panel lists the live links with who made each, its expiry and when it was last opened; making and revoking are in the audit log. |
| A flood of strangers | The paces above; 32 connections per link and 64 per address; a visitor's messages share the server's budget of large messages; the folder is opened once, whoever and however many hold the link; a passphrase's Argon2id is the only hash a visitor makes. |
| What is not covered | Whoever has the address has it: it is in the browser's history and in the chat it was sent through, and a link without a passphrase is the address alone. The address is shown once, so it cannot be recovered by the owner, only made again. The host sees the notes, as for every account. A table of players behind one address shares that address's pace; a link read by more than 32 pages at once refuses the rest. "This app is a server" (ADR 0096) has no read links. |

### Agents

Another member's note can carry text written to steer an agent that reads
it (ADR 0045). The server exposes no MCP over the network yet
(`[OPEN]`, ADR 0073 item 11); a member who syncs or opens a shared folder
with a local agent brings that risk to their own machine. The documentation
says so where agents are set up. A personal access token is the one way a
program reaches the server meanwhile, scoped as above.

### A web page embedded in a note

A note's `<iframe>`, or an embedded web note, shows a page of a site the
reader approved (ADR 0056). Since 2026-10-15 that page is a real `<iframe>`
inside the window's document when its site allows being framed, and a
child web view of the host when it does not (ADR 0056, revised). The
reasoning below is read from Tauri 2.11 and wry 0.55 (the versions in
`Cargo.lock`); what only the real app can show is listed in
`docs/reference/manual-checks.md`.

| Threat | Answer as built |
|---|---|
| A framed page calls the app's commands | Tauri decides on the origin of the request, not on the frame: `Webview::on_message` takes the request's address, `is_local_url` is false for any `http(s)` address that is not the app's own, and a remote origin is resolved against capabilities that name a `remote` url. `capabilities/default.json` has none, so every command, a plugin's included, is refused (`Command … not allowed by ACL`). Held by `the_frame_check_answers_the_apps_views_and_refuses_a_remote_origin` (a call from `https://evil.example/…` to `embed_frameable` and to `web_open` is refused) and, for a command that was already there, by `only_the_apps_own_views_reach_the_commands`. |
| A framed page finds `__TAURI_INTERNALS__` and the invoke key | Tauri adds its own scripts to the main frame only (`for_main_frame_only: true` in `manager/webview.rs`), so a cross-origin frame on macOS and Linux has neither. wry documents the exception: on Windows (WebView2) initialization scripts reach every frame. A frame there could see the object and the key, and its calls are still refused by the row above, since the key never replaces the origin check. The window adds no script of its own to frames. |
| A framed page reads the app's DOM, storage or files | It is cross-origin: its origin is its site's (`allow-same-origin` gives it that, never the window's), so the browser keeps it out of the window's DOM, storage and cookies. `verso://` answers only the app's own views and a note's origin never (ADR 0056); the page cannot request the folder's files. |
| A framed page steers the window | The frame has no `allow-top-navigation`; its scripts cannot navigate the window. Popups: `allow-popups` is set, but the host's view has no new-window handler and the system web view opens none (the child view denies them too, `on_new_window` → `Deny`). A link it opens goes nowhere in the app, as it went nowhere from the child view. |
| A framed page asks for the camera, the microphone, the location | The frame has no `allow` attribute: nothing is lent to a cross-origin frame, and the app has granted none of those. |
| The page learns where the reader comes from | `referrerpolicy="no-referrer"`. |
| A note gets the app to load a page into the window itself | The navigation guard asks for every frame, and wry hands it the address only, so it cannot tell a frame from the window. The guard stays closed to the web for an app view, with one allowance: the exact origins (scheme, host and port) that the frame check judged frameable and recorded for the session, which are origins of pages the reader approved. A navigation of the window itself to one of them (a meta refresh a note cannot write; the sanitizer drops it) would load that page in the window; the window's own policy (`form-action 'none'`, scripts from the app only, no script in a note) leaves a note with no way to cause it. Recorded as the cost of an iframe over the child view, whose view the guard never had to open (ADR 0056, revised 2026-10-15). A page's own links to another origin, and the frames inside it (an advertisement, a video), are refused by the same guard: they stay blank. |
| The frame check as a probe of the local network | One `HEAD` (a `GET` read only as far as its headers when that fails) to an address a note wrote and the reader approved, six seconds at most, at most five redirects, the final response judged; nothing of the body is read, and the answer is a yes or a no. A redirect from a public page to a local name or address (loopback, private ranges, link-local, carrier-grade NAT, `.local`, a name without a dot) ends the check with a no; a name that a public DNS answer points at a private address is not caught (the same limit ADR 0056 recorded for the proxy). An error, a timeout, an unreadable header: no, and the child view takes the page. Answered once per origin for the session. |
| A framed page writes into the folder (ADR 0120 item 6, revising ADR 0056, 2026-11-12) | The frame has `allow-downloads`, and the guard lets an app view's frame reach a `blob:` of an origin already judged frameable (`blob_origin`), the way a page's download starts — no other `blob:`. The host's download hook writes the file to the system's temporary folder, never to the folder, and hands it to the window as a picked file; the window places it beside the note in front through the core (`create_picked`, `create_file`): confined, under the file's own name made fit, never over a file (a name taken moves on to "name (2)"), within the import limit. What a page can do is add a file beside the note the reader is looking at; it cannot choose the place, overwrite, or reach the rest of the folder. A page that downloads in a loop adds files: each shows in the tree and the status line. The temporary file is left to the system. |
| A wrong yes: an empty frame | The headers are read as a browser reads them, conservatively: any `X-Frame-Options` value (`DENY`, `SAMEORIGIN`, `ALLOW-FROM`, an unreadable one) says no, even when a `frame-ancestors` is there to override it; `frame-ancestors` says yes only to `*` (a network-scheme app origin only: `tauri://localhost` is not covered by `*`), a matching scheme, host or wildcard host, and every policy on the response must allow. A site that answers the check one way and the frame another shows an empty frame, the site's decision as it is anywhere. |

### A review of the secret blocks (2026-10-15)

An independent defensive review of ADR 0087 item 4 (a reader receives no
secret block "or anything derived from it", failing closed) found the
paths below; each is fixed and has a test in the crate it belongs to
(`tests_secret_review.rs` in `verso-server`, the dialect's `tests/secret.rs`,
the index's `tests/secret.rs`, `verso-fs`'s `tests/ops.rs`).

| Finding | What it told a reader | The fix |
|---|---|---|
| I1: the folder's space | `folder_space` carried the index's size, which grows with the secret text | A reader is told an index of 0, as a share is |
| I2: a byte order mark | A leading U+FEFF before a first-line `> [!secret]` made the projection miss it | The callout is found on the text after the mark, its range kept on the original; the property test's generator has the mark |
| M1: change numbers | A reader's sync log kept the folder's numbers, so gaps counted the changes only inside secret blocks | A reader's cursor, changes and head are numbered in its own count (`reader_command`) |
| M2: a note past 16 MB | A reader's manifest told it the whole file's size and hash for a note it is refused | Such a note is left out of a reader's manifest and log |
| M3: the order of search | The rank of FTS5 weighs the length of the whole row, the secret column with it (a weight of 0 does not change that), so the order moved with a secret block | A reader's content hits come ordered by path (its name hits keep their own rank); a cost in relevance for readers, for the maintainer to weigh |
| M4: `stale` and `reindex` | After an edit inside a secret block made outside the server, a reader saw `stale: true` and a reindex of `indexed: 1` | A reader's `stale` compares the projection with the index's public text; its reindex counts nothing |
| M5: `[!secret\|x]` | A kind followed by metadata was not read as secret | The projection reads the kind up to the bar and fails closed; the renderer may draw it as it did |
| A link to a note | A symlink inside the folder under a name that is no note's (`espelho.txt` to `Nota.md`) was read, synced and served by `/f/` as a plain file, the note whole | What a reader reads is judged by the file it is (`Root::resolved_name`, and `hard_linked` for a second name): its projection through the contract and sync, a refusal on `/f/` |

Finding I3, decided by the maintainer on 2026-10-15 (*"Card de Markdown
num board é card de Markdown"*, a Markdown card on a board is a Markdown
card): a `> [!secret]` callout inside a `.canvas` text node is hidden from
readers exactly as in a note, by the board projection applying the note
projection (`verso_dialect::Secrets`) to every text node's `text`, at every
exit that serves a board (the same exits as a secret pin). A card whose
text becomes empty stays, empty, with its place and its edges, as a wholly
secret note is served as an empty note; a link written inside the callout
is a secret link for the index. A `.txt` file, and every file that is not
Markdown, is **not** projected and is served as it is.

The history tests also flaked under load, and the cause was in the
product: the history kept the file as it was at the time it was recorded,
not the bytes the change was hashed from, so a write that won the race
against the log's first look lost the found version and took its name.
A version is now recorded only when the bytes match the change.

### Sync with a cloud provider (ADR 0104)

Accepted 2026-10-21. **WebDAV and S3 are built (2026-10-21, merge `d5a4ff73`)**; the OAuth providers (Dropbox, OneDrive, Google Drive) are not. This section was written before the code so each row becomes a test (or a manual check) in the PR that builds it. A folder syncs with a cloud the person chose (WebDAV, S3, Dropbox, OneDrive, Google Drive) through the sync of ADR 0079; the adapters live on the desktop host's side and the core still reaches no network (0104 item 3).

| Threat | Answer decided (to be built) |
|---|---|
| The app reaching hosts nobody listed | Nothing is asked of a provider before the person connects it. Once connected, the app talks to that provider's API and sign-in hosts and to the addresses the provider hands back for one transfer (OneDrive's pre-authenticated download and upload-session URLs, S3 pre-signed URLs): the list is per provider, with those patterns, not one fixed list (0104 item 15). |
| A handed-back transfer URL leaking | Those URLs are bearer secrets: anyone holding one can read or write that transfer. Never logged, never shown in the sync log or an error, never sent to the window. |
| The loopback listener of the OAuth sign-in | Binds the loopback only (`127.0.0.1`), checks `state`, answers one request, closes after it or after five minutes; PKCE, so a code caught on the way is useless without the verifier; the system's browser, never an embedded web view (0104 item 12). |
| A secret on disk | Refresh tokens, WebDAV passwords and S3 secrets live only in the system's keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service), never in the folder, the configuration file or a log, and never read back by the window. On a Linux without Secret Service the cloud sync is refused with the reason (0104 item 14). Disconnect deletes the secrets and revokes the token where the provider allows. |
| Too much reach granted | One scope per provider, the narrowest: Dropbox App folder, OneDrive `Files.ReadWrite.AppFolder`, Google Drive `drive.file` (never the full `drive`), S3 and WebDAV as the person scopes the key (the how-to says to scope it to the bucket and prefix) (0104 item 6). |
| A silent overwrite | Every write is conditional on the base (`update` with the `rev`, `If-Match` on the ETag); Google Drive, with no precondition, reads the head revision and checks the revisions after the upload, keeping both versions. A service with neither a precondition nor revisions is refused at connect. The guardrail is a property test that races two devices on every adapter (0104 item 7). |
| A stolen refresh token | It reaches only the app folder (or, on Google, only the files this OAuth client created or the person opened with it) of that one provider; it does not reach the person's other files, and Disconnect revokes it. A stolen WebDAV password or S3 key reaches what the person scoped it to. |
| Provider data corrupting the folder | Names are NFC and made safe for every provider; a name a provider forbids is not synced and is listed; a file is written here only when every piece arrived and its hash or size matched (0104 items 9 and 10). A lost cursor is a full comparison from the bases, never a first sync that treats everything as new (item 8). |
| A deletion spreading | Remote deletions go into the provider's trash where it has one (Drive with `trashed: true`, never `files.delete`); 0079's mass-deletion pause and the placeholder guard (0043) hold for a cloud folder (0104 items 4 and 11). |
| A flood against a provider | HTTP 429 and 503, and Drive's 403 with a rate-limit reason, are honoured with `Retry-After` or exponential backoff with jitter; small concurrency per provider; polls never in a fast loop (0104 items 8 and 15). |
| The probe's objects in the person's storage (built) | At connect the WebDAV and S3 adapters write a probe object (`.verso-probe`) and temporary keys (`.verso-tmp`) to the person's storage to test conditional writes, and delete them; a failure to clean up leaves a small named file the person can delete. |
| `keyring` and the Secret Service on Linux (built) | Secrets go through the `keyring` crate (4.2); on Linux that reaches the Secret Service over D-Bus (zbus). A Linux with no Secret Service is refused with the reason. A secret over 2000 bytes is refused, never truncated: 2560 bytes is the Windows Credential Manager's own limit (Microsoft's) and 2000 is the build's margin below it (ADR 0104, "As built"). |
| HEAD then DELETE on S3 services that ignore a conditional DELETE (built) | Where a service ignores `If-Match` on DELETE, the delete is a HEAD followed by a DELETE and a writer can slip in between; the window says so at connect. |
| A redirect leading the credentials elsewhere (built) | The WebDAV adapter never follows a redirect, so a server cannot send the Basic credentials to another host. |

### A table's hidden notes (ADR 0110)

Built 2026-10-22 (phase 1). A folder of a UniVerso made a table keeps most of its notes from the players invited to it (readers) until the game master releases them. The state is in the server's database, never in a file. It is a guard against readers on a server, like ADR 0087's: whoever holds the file, a game master or an editor sees it.

| Threat | Answer built, and where it is tried (`tests_campaign.rs`) |
|---|---|
| A hidden note in a list | Notes, files, folders and entries are filtered by the veil (`campaign_serve.rs`) in the one place every command of the folder passes (`rpc::folder_run`); a folder shows only with something visible under it. |
| A hidden note asked for by name | It answers as a note that does not exist, tested against a missing name, for every spelling of the path (`./`, case, `..`); a hidden name cannot be told from a missing one. |
| A hidden note's words in search, the graph, backlinks, tags, mentions, bases | Answered from the reader's projection, then filtered; a search excerpt is cut again from the veiled text, and a hit whose words were inside a link now drawn as text is dropped. |
| The name of a hidden note in a link | The text served has no link to it: the alias or the name as written, with a lock, or four blocks for a secret name; a path, a heading and an id are never sent, in the body, the frontmatter or code. The property test runs 500 generated notes. The name as written, without an alias, is sent (a decision recorded for the maintainer). |
| A hidden note in a board | A card of a hidden note is a locked text card; the text cards are served as notes. A board cannot be granted for editing, so the locks are never written back. |
| A hidden note in a room | The room of a hidden note is refused; a released note's is a document of its own for the players, remade when a release changes. |
| A hidden file on a device | The file is out of the reader's manifest and log, `sync_read` refuses it, a release is a new change and a hide a deletion; at table creation the log says nothing of what it never told. A device that had a note before the table keeps its copy: it cannot be recalled. |
| An attachment of a hidden note | Served only when a released note or board links or embeds it, or the table shows it as an image; `/f/` answers 404 as for a missing file. |
| The folder's events | A hidden note's change is not told to a player; a player is told what a release gives or takes. |
| The table's entries | The note a roll was made in is not told to a player when it is hidden. |
| The folder's counts | A player's summary counts the notes it sees and names no problem. |
| A player writing | Only a note granted to it or to the group, by `write_note`, `write_text`, the room or (the group's) a device; create, rename, move, delete, attachments and boards stay the game master's. A grant is the game master's act and is kept in the database. |
| A closed table | A player's open is refused ("a mesa está fechada"), the files route too; windows inside are sent out; a command from one is refused. |
| A grant widening reach | A grant releases only the one note, and never beyond the folder's share. |
| The invitation | Single use, seven days, a reader's; only the admin, with a fresh proof. |

## Gaps found on 2026-10-11

Found by reading the code at HEAD 14ac192; findings, not fixes. Classified
for a release to a first user who is not the maintainer, by
[ADR 0033](../adr/0033-pr-workflow.md)'s levels; the classification is a
recommendation for the maintainer to confirm.

**BLOCKING**

1. **The sanitizer of note HTML has had no review against hostile notes,
   and no test of its own.** It is the boundary between members (ADR 0073
   item 6) and is written by hand (`app/ui/src/sanitize.ts`); no unit test
   in `app/ui/test/` and no end-to-end test feeds it hostile HTML. The
   model's own `[OPEN]` below. **Closed: dcdd5fb** — reviewed and fixed (a
   table's cells reached the page uncleaned; ids and `#` links, a style's
   addresses, `svg` and `math` by name, an embedded page off the web), with
   a suite of its own: "What the sanitizer guarantees", above. The review
   by another model stays `[OPEN]` below.

**IMPORTANT**

2. **No send timeout on the WebSocket.** The connection's loop awaits each
   `socket.send`: a peer that stops reading at the TCP level holds the loop
   there, so neither the full-queue notice nor the ping can close it, until
   the operating system gives up on the socket. A ping is also skipped
   while the connection's 8 requests are all under way.
   **Closed: 06facd6** — every write, at both ends, within 30 s plus its
   size at 32 KiB/s (about 3 minutes for a piece of a file, 25 for a
   message at the limit), else the connection closes. A ping is still not
   sent while the 8 requests are under way: the connection is not read
   then, and the write's bound answers a peer that stopped reading.
3. **The connection's queue is bounded in messages, not bytes.** The
   1024-message bound assumes small events, but `collab-update` and
   `collab-awareness` are relayed as their sender wrote them, up to the
   48 MB message limit; a member — a reader too, through presence — can
   make a slow peer's queue hold up to 1024 such frames. Each connection
   may also hold 8 parsed requests of up to 48 MB at once.
   **Closed: dfb1b8b** — 64 MiB of pushes per connection beside the 1024
   messages, a presence 16 KB at most. The 8 parsed requests stay, bounded
   by the message limit and now by the connections below.
4. **No cap on connections and no global rate on commands.** Nothing
   bounds the connections of one account, of one address or of the
   server; each takes up to 8 commands on the blocking pool. One member's
   program can starve every other member. The model's own `[OPEN]` on a
   rate limit beyond sign-ins.
   **Closed: 2c2ea75 and a3d7eae** — 32 WebSockets per account, 64 per
   address; 512 connections on the server, 128 per address; commands at
   100 a second per account (400 at once) and 1 000 on the server (2 000),
   waiting their turn past it, said in the log once a minute. Reasoned,
   not measured on the 1-core host yet. A presence (`collab_awareness`)
   past the pace is dropped, never queued ahead of an edit, and a window
   sends one at most every 100 ms (2026-10-13: three windows of one
   account at ~45 presences a second each held the edits back 30 s).
5. **An upload is held in memory until its last piece, and the quota is
   checked only then.** Up to two uploads of 1 GiB per connection, times
   the connections above; the declared size is known at the first piece
   and could be checked against the quota there. **Closed: 82fb2c3** —
   an upload's pieces are written to a temporary file of the folder as
   they arrive, one in memory at a time, and its declared size is checked
   against the quota at the first piece (and again at the last); a
   transfer dropped takes its temporary file with it.
6. **The mail routes answer later when the address has an account.**
   `signin_link` and `forgot` await the mail server only for an existing
   account; the comment says "after the same delay", the code adds none.
   The time tells who has an account, which the password route avoids.
   **Closed: bbc2b7c** — both answer once the address's delay is passed;
   looking the address up, the link, the mail and the audit line follow
   the answer, the same for every address.
7. **The per-address delays key on the whole address.** Over IPv6 one
   host has a /64 to rotate through: the delays of device start, mail,
   links and passkeys are passed, the in-memory maps (the limiter, the
   pending device codes) grow until pruned (one hour, ten minutes), and a
   person's mailbox can be flooded with sign-in and reset mails, limited
   only by sender address. **Closed: 76a89b7** — keyed by /64 (an IPv4
   address whole); the delays keep 100 000 keys, the device codes, sign-in
   links and passkey ceremonies 10 000 each, the oldest tenth going first.
   A mailbox is still bounded only by the senders' /64s: a delay by the
   address mailed to is not built. **Closed: ecd5fab** (ADR 0083 item 8)
   — the mail routes take a second key, `mail:<folded e-mail>`, with the
   sender's delay.
8. **No HTTP timeouts or connection limit on the listener** (unverified:
   none is configured in `lib.rs`; whether the defaults of `axum::serve`
   time out a slow header was not checked). Behind Caddy or `tailscale
   serve` the proxy answers this; a server on its own TLS faces it.
   **Closed: a3d7eae** — checked: `axum::serve` sets no timer, so hyper
   applied no deadline. Each connection is now served by hyper's HTTP/1
   builder with one: headers 30 s, a request 60 s; 512 connections, 128
   per address, counted before the TLS handshake.
9. **The trash is unbounded until ADR 0080 is built.** Deletions go to
   `.trash/`, which the walk and the quota do not count, with no
   retention yet: a writer can write and delete in a loop and fill the
   host's disk past the quota. ADR 0080 item 8 decided the guard.
   **Closed: db609b1, 03c21bf, a9a9bb5, 08f4032, 069cb3a** — ADR 0080 built
   on the night of 2026-10-11 to 12: the trash expires (30 days by
   default), and a folder's trash larger than its quota has its oldest
   entries expire early, said in the folder's page (item 8).
10. **An external review of this model**, as the model asked on
    2026-10-09; ADR 0073 asks for security "in full". **Still open:**
    after the gaps above. *2026-10-13:* ADR 0083 item 16 answers it in
    two parts: the sanitizer read by the model that did not write it,
    done on 2026-10-13 (f6ae4eb); the pentest of the lab server by a
    person outside the project, pending, a condition of the
    announcement.

**MINOR**

11. **Presence can claim another name.** `collab_awareness` is relayed
    opaque; the server does not stamp the sender's account, so a member's
    cursor can wear another member's name and colour. **Closed: 8259d01**
    — the server reads each awareness update, sets each state's `user` to
    the sender's account name and a `#rrggbb` colour (the window's first
    otherwise), and drops a Yjs client another account speaks for (at
    most 8 per connection); malformed bytes, and a presence from a window
    not in the room, are refused (the maintainer, 2026-10-12: "temos que
    ser seguros desde o dia 0").
12. **Device-code phishing.** Whoever starts a code chooses the device's
    name the approval page shows; a person sent a link can approve a
    stranger's device into their own account. The page shows no address
    or time of the request. **Closed: 8871f4e** — the pending code keeps
    the address and the time it was asked from; the page shows them with
    the device's name under *Who asked*, then asks *Was it you who asked,
    on this device?* before *Approve this device: <name>* and *It was not
    me: refuse*; a refusal ends the code. The name stays the requester's:
    the address and the time are what tell a stranger's request.
13. **The server's database is created with the process's umask.** The
    desktop's index and `servers.json` are `0600`; `server.sqlite` and
    `VERSO_DATA_DIR` get no mode from the server (unverified per package:
    the container runs as its own user; the systemd unit sets no
    `UMask` or `StateDirectoryMode`). Another local user of the host could
    read the hashes. **Closed: da272c2** — `server.sqlite` and its journal
    files `0600` at every open (`verso_fs::server::owner_only`); the
    directory keeps the mode its host gave it.
14. **`/f/` sends no `Cross-Origin-Resource-Policy`.** `SameSite=Lax`
    already keeps the cookie off another site's subresource request;
    `same-origin` would say so twice. **Closed: da272c2.**
15. **`/api/state` tells anyone the exact version.** Useful to the window
    before sign-in; also to someone matching a version to an advisory.
    **Closed: da272c2** — told only to someone signed in; the sign-in page
    used neither the version nor the contract.
16. **A password change checks the current password on the async
    runtime's thread**, where sign-in moves Argon2id to the blocking pool.
    **Closed: da272c2.**
17. **On Windows the device token's file gets no restriction of its own**
    (`private()` sets nothing off Unix); the profile's permissions are
    what keeps it. **Still open:** no restriction is cheap — a file's ACL
    is set through the system's API, which needs `unsafe` (forbidden,
    CLAUDE.md §2), or through `icacls` in a subprocess; the profile's own
    permissions (the person, SYSTEM, the administrators) keep it meanwhile.

## Gaps before the announcement

The model's own `[OPEN]` items, kept open. Each carries a recommended
answer — a recommendation, not a decision; the maintainer decides.

- `[OPEN]` A review of the note HTML sanitizer against hostile members.
  *Recommendation:* before the first outside user, a review by the model
  that did not write `sanitize.ts` (ADR 0032), with a hostile-HTML suite in
  `app/ui/test/` that stays as a guardrail: mutation XSS on the way through
  `cleanHtmlText`, SVG and MathML, `id` clobbering of the window's
  globals, the `data-*` attributes the window acts on (`data-target`,
  `data-task-line`), inline style laid over the window, the embed gate,
  and the other renderers of a note's content (Mermaid, KaTeX, PDF.js, the
  board's Excalidraw). *Done on 2026-10-11 (dcdd5fb), by Opus 5.5:* the
  review line by line and the suite, which stays as a guardrail in
  `npm test`; left `[OPEN]` for the maintainer: the review by the model
  that did not write `sanitize.ts`, the other renderers, and the gate and
  the suite run in a browser. *Done on 2026-10-13 (ADR 0083 item 16,
  f6ae4eb):* the reading by Fable 5.1, the model that did not write
  `sanitize.ts` — no BLOCKING, three MINOR, the gate box's resolved in
  4b8a04c *(reported)* — and the suite run in WebKit and Chromium
  through the harness; of the other renderers, PDF.js's build asserted
  to hold no `eval` (ADR 0083 item 8, 724aeb0), Mermaid, KaTeX and
  Excalidraw not read. Left `[OPEN]` for the maintainer.
- `[OPEN]` History and recovery of another member's change or deletion.
  *Recommendation:* ADR 0080 (the trash, and the version a device's write
  replaced) answers deletions and devices for the first outside user; a
  member's edit inside a room stays `[OPEN]` for an ADR of its own, as the
  roadmap says, and the documentation says until then that a member with
  write access can change another's text.
- A rate limit beyond sign-ins. *(Quotas per folder: ADR 0077
  item 5, built on 2026-10-10; per connection: 8 requests, a queue of 1024
  messages, pings, built on 2026-10-11, 30c3bfc.)* *Recommendation:* before
  the first outside user, gaps 2 to 5: a send timeout, the queue bounded in
  bytes, a cap on connections per account and on the server, the quota
  checked at an upload's first piece; the numbers measured on the 1-core,
  1 GB host of the server's installation notes. *Built on 2026-10-11:*
  gaps 2, 3, 4 and 8 (their commits above); gap 5 on 2026-10-12
  (82fb2c3); the numbers are reasoned, not measured on that host.
  *Built on 2026-10-13:* a pace on the REST routes per address, 20 a
  second and 100 at once (64f2021, ADR 0083 item 7), and a pace on the
  server's refused sign-ins (6cc3d50, ADR 0083 item 2); measuring them is
  ADR 0083 item 18. **Closed: 64f2021 and 6cc3d50** — decided by the
  maintainer on 2026-10-13 (*"sobre as decisões em aberto, siga as
  recomendações"*, on the open decisions, follow the recommendations):
  the limits as built answer it; measuring the numbers on the 1-core host
  stays ADR 0083 item 18.
- `[OPEN]` The desktop's device token in the system's keychain instead of a
  `0600` file. *Recommendation:* after the first outside user, recorded as
  deferred: the token is revocable from Settings and the console, and the
  keychain differs on each of the three systems.
- `[OPEN]` The MCP transport and its authorization over the network.
  *Recommendation:* no MCP over the network for the first outside user; a
  personal access token remains the program's way in until ADR 0073
  item 11 is answered in an ADR of its own.
- An external review of this model, as ADR 0073 asks of the server's
  security "in full". *Recommendation:* after the BLOCKING and IMPORTANT
  gaps above are closed, so that the review reads the server as it will
  be released. *2026-10-13:* the review of that date and ADR 0083 item 16
  say what it is and when — a pentest of the lab server before the
  announcement, the sanitizer read by the model that did not write it —
  and what comes before it: every other item of the ADR, built in one
  round (its order of work, rewritten when it was accepted on 2026-10-13)
  — items 1 to 15 and 17 built on 2026-10-13, with item 16's reading of
  the sanitizer; the pentest pending.
