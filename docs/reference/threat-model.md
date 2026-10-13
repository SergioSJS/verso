# The server's threat model (2026-10-09, refreshed 2026-10-11)

What UniVerso — `verso serve` — protects, from whom, and how. [ADR 0073](../adr/0073-self-hosted-server-first.md)
item 6 asks for it before the server is announced to anyone but the
maintainer, and for security in full before the first user who is not the
maintainer; [ADR 0074](../adr/0074-accounts-and-access-on-the-server.md)
names what of its own it must cover; [ADR 0045](../adr/0045-server-and-mcp-security.md)
names the prompt-injection risk it takes up. Written by Opus 5.5; it
decides nothing — where a gap needs a decision it says `[OPEN]`, and a
recommended answer is marked as a recommendation.

**Refreshed on 2026-10-11 against HEAD 7729940** of `feat/universo`
(`docs/roadmap.md`, revision 6, row 3.15: third after this round, before
sharing). First written on 2026-10-09 against `feat/web`; rows added on
2026-10-11 by f4a19c9 for the syncing device and sharing. Read for this
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

**Gaps closed on 2026-10-11** on `feat/universo-sec` (from 4c09fc9), each
by the commit its entry names: 1, 2, 3, 4, 6, 7, 8 and 13 to 16. The
attack surface and the threats below say the bounds as built there; 5, 9,
10, 11, 12 and 17 stay open, each with its reason.

**See the review of 2026-10-13 and ADR 0083.** On 2026-10-13, at the
maintainer's request, Fable 5.1 read the server again against HEAD af4d73a
with bots, abuse and attacks from outside in hand, and probed it on a
loopback port: [`security-review-2026-10-13.md`](security-review-2026-10-13.md)
(findings F1 to F23, none BLOCKING, ten IMPORTANT — a failed sign-in with
no log line for fail2ban or CrowdSec, no ceiling or notice on guesses, a
password checked for length only, recovery leaving tokens alive, one
trusted proxy address, the server's inputs not fuzzed, npm advisories
unchecked, no disclosure channel, the outside review still open, a backup
in the clear) and [ADR 0083](../adr/0083-security-hardening-of-universo.md)
(Proposed: the measures, their numbers, guardrails and order of work). Of
the gaps below, none is shown closed by that review; gap 10 is answered by
its item 16 when done, and gap 7's remainder (a mailbox flooded) by its
item 8. The rows of this model are unchanged: what the review found is
new, not a correction of what is written here.

## What is protected

| Asset | Where | Why it matters |
|---|---|---|
| The notes and attachments | the folders under `VERSO_FOLDERS_DIR` | the person's writing; a folder may be shared by several people |
| What was deleted | each folder's `.trash/`, on the server and on a syncing computer | a deletion by another member or a device is recoverable only from here until ADR 0080 |
| Accounts and password hashes | `server.sqlite` in `VERSO_DATA_DIR` | Argon2id hashes; a stolen one is attacked offline |
| Sessions, device sessions, personal access tokens, single-use links | the same database, as SHA-256 only; sign-in links by e-mail and pending device codes in memory | each opens an account until it ends |
| Passkey credentials | the same database | public keys and counters; no secret |
| The audit log and each folder's change log | the same database | who did what, from which device; a member's evidence |
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

## Boundaries

1. The network → the server: TLS, `Host`, `Origin`, the session.
2. One member → another, inside one server: roles per folder, the
   window's sanitizer and policies, the files' sandbox.
3. The browser's page → the server's API: the cookie, the CSRF token.
4. The server → the disk: `verso-fs`, path confinement, symlinks kept
   inside a folder.
5. The server → the internet: the release feed, and the host's mail
   server when one is set.
6. One connection → the server's shared resources: the per-connection
   bounds of the WebSocket, the per-address delays, the quotas.

## The attack surface at HEAD

Every connection first takes a place — 512 on the server, 128 per address
(an IPv6 /64 as one; this machine and the trusted proxy are not counted) —
before a TLS handshake or a byte of HTTP is read, and holds it to its end,
a WebSocket's included. A request's headers have 30 s, the wait for the
next request on a kept-alive connection included; a request has 60 s, its
body's arrival included (408 past it). Every request passes the `Host`
check first (421 otherwise) and gets the server's headers after:
`nosniff`, `no-referrer`, `SAMEORIGIN`, `Cross-Origin-Opener-Policy`, a
`Permissions-Policy`, HSTS over HTTPS and, except under `/f/`, the
window's own policy (under `/f/`, `Cross-Origin-Resource-Policy:
same-origin`). A body of the REST API is 1 MB at most. Every delay "by
address" below keys an IPv4 address whole and an IPv6 address by its
/64; the maps strangers fill are bounded — the delays' 100 000 keys, and
10 000 each of device codes, sign-in links and passkey ceremonies — the
oldest tenth going first. A secret sent over plain HTTP from another machine is never
read. "Origin" below is `Ctx::changes()`: a browser's change carries a
matching `Origin` and the session's CSRF token; a bearer (a token or a
device) carries neither; with no session, `Origin` alone. "The person" is
`Ctx::person()`: a browser or a device signed in as them, never a token.
"Admin" is `Ctx::admin()`: an admin's browser or device session, never a
token.

| Surface | Who may call it | What checks it | What limits it | What logs it |
|---|---|---|---|---|
| `GET /api/state`, the pages, the window's files | anyone; the server's version and the contract's only to someone signed in | `Host` | the page is never cached | nothing |
| `POST /api/signin` | anyone, over TLS | Origin | a growing delay by address and by account (`in:`): 3 free, then 1 s doubling to 60 s, forgotten after an hour | audit `sign_in`, failed or not |
| `POST /api/passkey/start`, `/finish` | anyone, over TLS | Origin; WebAuthn with user verification; the ceremony 5 minutes in memory | a delay by address (`pk:`), every start counted | audit `sign_in_passkey` |
| `POST /api/signin/link`, `POST /api/forgot` | anyone, only when the server has a mail server | Origin | a delay by address (`mail:`), every request counted; answered before the address is looked up — the link, the mail and the audit line follow the answer; a sign-in link lives 15 minutes, in memory | audit `signin_link_sent`, `reset_link_mailed` when the address has an account |
| `POST /api/signin/link/{token}`, `GET`/`POST /api/invite/{token}`, `GET`/`POST /api/reset/{token}`, `POST /api/setup` | whoever holds the link | Origin on `POST`; the link's hash, single use, expiry (setup 1 hour, invitation 7 days, reset 24 hours); setup only while there is no account | a delay by address on a wrong link (`link:`) | audit `sign_in_link`, `invitation_used`, `password_reset`, `setup` |
| `POST /api/device/start` | anyone, over TLS | nothing more | every start counted by address (`device:`), the same delay; a code lives 10 minutes | nothing |
| `POST /api/device/poll` | whoever holds the poll secret (256 bits) | the secret's hash, compared in constant time | none of its own | nothing |
| `GET`/`POST /api/device/{code}` | signed in; approving only from a browser session | Origin (approve) | the code: 10 minutes, once | audit `device_approved` |
| `/api/me`, `/api/me/*` | the person (profile, password, sessions, settings, passkeys); a token is made only from a browser; a device renames only itself | Origin; the current password for a new one | the password change by account (`in:`), its Argon2id on the blocking pool; settings 256 KB; names 200 characters | audit `password_change`, `session_ended`, `sessions_ended`, `token_created`, `token_revoked`, `passkey_added`, `passkey_removed`, `device_renamed`; a profile or settings change is not audited |
| `/api/folders`, `/api/folders/{id}/*` | signed in; creating: an account allowed to, never a token; members and the folder's audit: the folder's owner | Origin; the role in the folder, 404 when none | — | audit `folder_created`, grants, `revoke` |
| `/api/admin/*` | admin | Origin on changes | every list paged on the server (50 rows) | audit for every change (`account_created`, `powers_*`, `account_deleted`, `account_sessions_ended`, `reset_link`, invitations, `folder_adopted`, `admin_self_grant_*`, `folder_quota`); reads are not audited |
| `GET /f/{folder}/{*path}` | a reader of the folder or more; a token within its folders | TLS; the role, on every request; the core's path confinement | `Content-Security-Policy: sandbox`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin` | nothing |
| `GET /api/ws`, the contract | a browser (only with `--web`, `Origin` checked before the cookie is accepted), a device, a token | TLS; the session or token alive before every command; the role in the folder before the core acts; a token's folders and write flag; a sync version older than the previous one refused for `sync_*` | 48 MB a message; 8 requests under way, past which the connection is not read; a queue of 1024 messages and 64 MiB of pushes, full = closed; each write within 30 s plus its size at 32 KiB/s, else closed; a ping every 30 s, closed after 2 unanswered; 32 connections per account and 64 per address, 429 past them; each command at its account's pace (100 a second, 400 at once) and the server's (1 000, 2 000), waiting its turn past it; a window's log lines 60 a minute | the server's log: a sync change refused, a slow or silent connection closed, a sync version refused; each folder's change log names the account and the device of every write |
| — folder commands | the window's folder, opened by `open_server_folder` or `reopen_folder` | a write command needs editor or owner and a writing credential; a write's bytes checked against the quota first | the quota (ADR 0077 item 5) | the change log |
| — `collab_*` (shared notes, text files and boards, ADR 0082 item 12) | members of the folder | `collab_update`, `_save`, `_resolve` and `_canvas` need a writer; a malformed Yjs update refused; a board's file (`collab_canvas`) is written only when it is of exactly the state the room holds, through the core's board writer, over the revision read | presence (`collab_awareness`) 16 KB at most, from a window in the room, stamped with the sender's account name and only its own Yjs clients (gap 11); a board room: an update 4 MB and 10 000 entries at most, the room 100 000 entries and 64 MB, a file handed to it 16 MB (`collab_board.rs`), past which refused; what is relayed counts in each receiver's 64 MiB of pushes | nothing |
| — `sync_*` | a device (any credential may ask) | a write, deletion or rename needs a writer, names its base hash and is refused when the file changed; a deletion goes to `.trash/`; the quota on the whole file | pieces of 1 MiB, read from the disk and written to a temporary file as they go, one in memory per transfer (2b1f2c4); 2 transfers each way per connection, dropped after 120 s idle and when the connection ends, a send's temporary file with it; 1 GiB per file; the quota checked at a send's first piece and again at its last; a walk at most once a minute | the server's log for a refusal other than "changed" |
| — `render_markdown`, `board_text`, `log_write`, `capabilities` | signed in | — | the parser is fuzzed and checked for linear time; log lines one line each, 2000 characters | the server's log (`log_write`) |
| The release feed | the server, outbound | — | once a day; the version alone in the `User-Agent`; `VERSO_UPDATE_TOKEN` when the repository is private; `VERSO_UPDATE_CHECK=off` | a line when it fails |
| The host's mail server | the server, outbound, when `VERSO_SMTP_URL` is set | — | what the mail routes above allow | a line when sending fails |

## Threats and what answers them

### Reaching the server

| Threat | Answer as built |
|---|---|
| A password or a token read on the wire | Nothing that signs in or carries a secret is served without TLS — the server's own (`VERSO_TLS_CERT_FILE`), a configured proxy's (`VERSO_TRUSTED_PROXY` with `X-Forwarded-Proto: https`) — or from this machine to a server that listens on loopback only. A secret over plain HTTP from elsewhere is not even read. HSTS is sent when the address is HTTPS. |
| Forwarded headers forged to look secure | Believed only from `VERSO_TRUSTED_PROXY`'s address; the client's address is the last one of `X-Forwarded-For`, the one that proxy added. |
| DNS rebinding: a site resolving its own name to the server | The `Host` header must be the public address's or a loopback name; else 421. The links the server mails and prints are built from `VERSO_PUBLIC_URL`, never from a request's `Host`. |
| Listening beyond loopback by accident | Refused at start without `VERSO_PUBLIC_URL`; the default is `127.0.0.1`. |
| A connection held open to tie up the server | Every connection takes a place first — 512 on the server, 128 per address — before its TLS handshake (10 seconds) or a byte of HTTP; a request's headers have 30 seconds, a request 60. A WebSocket is pinged every 30 seconds and closed after two pings unanswered, and closed when a write is not taken in time; an account holds 32 of them, an address 64 (gaps 2, 4 and 8, closed). |
| The process taking the host | The container runs as user 1000; the systemd unit runs as `universo` with `NoNewPrivileges`, `ProtectSystem=strict`, no capabilities and a narrow system-call and address-family set (ADR 0075). |

### Signing in and staying signed in

| Threat | Answer as built |
|---|---|
| Guessing passwords | Argon2id (OWASP's first parameters); a growing delay by address and by account, never a lock a stranger can use; 12 characters at least. |
| Learning who has an account | A wrong password and an unknown e-mail are answered alike, in about the same time (a hash is computed either way); a passkey's start answers an unknown e-mail and an account without passkeys alike, and gives an account with passkeys its challenge — which says that the address has passkeys, never that an account without them exists. A sign-in link and "forgot the password" answer alike in their words and in their time: the answer leaves before the address is looked up (gap 6, closed). |
| A stolen session cookie | `HttpOnly`, `SameSite=Lax`, `Secure` and `__Host-` over HTTPS; 14 days idle, 90 at most; listed in Settings and ended there; a password change ends the others; checked again before every command of an open WebSocket, and an ended session's connections are told and closed at once. |
| Cross-site requests | Every request that changes something checks `Origin` against the server's and carries the session's CSRF token; the WebSocket checks `Origin` before it accepts the cookie. |
| A token leaked from a script | Personal access tokens are scoped to folders and to reading or writing, never more than the member's role; never an admin, never the account's own pages; made only from a browser; prefixed `verso_pat_` for secret scanners; kept as SHA-256; an expiry of a year at most, or none said in red; revocable. |
| The first admin taken by whoever arrives first | No setup page open to anyone: the admin comes from the environment on the first start, or from a single-use setup link valid one hour, printed once in the log — whoever reads the log is whoever runs the server. |
| A lost admin | `universo admin reset <e-mail>` (or `verso serve admin reset`) on the machine: access to the machine is the last factor; the reset is in the audit log and ends the account's sessions. |
| An invitation or a reset link forwarded or guessed | 256 bits, single use, an expiry (7 days, 24 hours), its use recorded (by whom, when), ended by the admin before use; attempts slowed by address. |
| A device approved by mistake | The approval page shows the device's name and the code the app shows, the address and the time of the request, asks a signed-in person in the browser *Was it you who asked, on this device?* and offers to refuse, and the device's session is listed and revocable. The device's name is the one the requester sent; the address and the time are the server's (gap 12). |
| A device or a phone lost | The person ends the session in Settings; an admin ends every session of an account and revokes its tokens from the console, its open connections closed at once, with an audit line (ADR 0077 item 3, built). |
| Passkeys | WebAuthn with user verification required (webauthn-rs); the ceremony's state lives five minutes in memory; counters stored. |

### One member against another

| Threat | Answer as built |
|---|---|
| Reaching a folder one was not given | Every command and every file request checks the member's role in the folder before the core acts; a folder one may not see answers 404. The admin is no exception: entering a folder is a grant to oneself, in the log the owner reads. |
| A reader writing | Write commands, a shared note's update, save and resolve, a device's put, delete and rename, and the folder's settings are refused below the editor's role; the window hides what the role cannot do. A role changed or removed reaches the member's open windows at once. |
| Stored XSS through an attachment (HTML, SVG) | Files are served from `/f/` with `Content-Security-Policy: sandbox` and `nosniff`: a document made of them runs no script. |
| Stored XSS through a note's HTML | The window's sanitizer, `app/ui/src/sanitize.ts`, is the boundary between members (ADR 0073 item 6): an allowlist of elements, attributes and the renderer's classes, parsed in an inert document; scripts, styles, forms and foreign content dropped; links to the web, mail and the page only; an embedded page behind the reader's approval of its origin; inline style kept but never fixed or absolute. The window's own policy, sent as a header, allows scripts from the server only. Mermaid runs at `securityLevel: "strict"`; KaTeX with its defaults. What the sanitizer guarantees, and the suite that holds it to that: below (gap 1, closed). `[OPEN]`: the review by the model that did not write it (the gaps before the announcement). |
| Remote content leaking who reads | Remote pictures and embedded pages follow the reader's own setting, never the author's (the maintainer's answer I). |
| Symlinks leading out of a shared folder | On a server a link is followed only when it leads inside the folder; one that leaves is refused and listed as a problem. |
| An edit that erases another's text | Simultaneous editing merges; a write from elsewhere is merged line by line or refused as changed; a change made outside while edits wait stops the room for people to choose. A board merges by element, Excalidraw's rule (ADR 0082 item 12): a member's change to one element can win over another's to the same element — the higher version — but never touches the others' elements, and a deletion is a tombstone a later undo can bring back; a window that hands the room a false file of the board is a writer writing, as any write. `[OPEN]`: history, attribution and recovery of another member's change (ADR 0073). |
| A deletion of another's file | A deletion goes to the folder's `.trash/`, from the window and from a device alike; seeing and restoring it in the window, and its retention, are ADR 0080, accepted, being built. |
| A huge message or many requests to exhaust memory | A WebSocket message is 48 MB at most; a malformed Yjs update is refused; a connection has 8 requests under way at most, and a queue of 1024 messages and 64 MiB of pushes, closed when it fills; a presence is 16 KB at most; a board room takes an update of 4 MB and 10 000 entries at most and holds 100 000 entries and 64 MB, and a board's file handed to it is 16 MB at most (ADR 0082 item 12). Commands keep a pace per account and on the server, and connections are counted per account and per address (gaps 3 and 4, closed). A folder's space is bounded by its quota (ADR 0077 item 5): a write that would pass it is refused and nothing is written. |
| Presence that lies | The server stamps a presence with the sender's account name, keeps only a colour that is a colour, and lets a connection speak only for its own Yjs clients: a member's cursor cannot wear another's name, nor move or remove another's (gap 11). |

### What the sanitizer guarantees

`app/ui/src/sanitize.ts` is written by hand, with no library. Reviewed line
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
its origin, and never one for an address off the web. What it gives back
parses to itself and cleans to itself: no mutation XSS on the way through
`cleanHtmlText`. `app/ui/test/sanitize.test.mjs` prints this policy,
checks it against the module's, and runs 76 hostile inputs — the OWASP
cheat sheet's staples, the known mXSS payloads, encoding tricks,
clobbering — in `npm test`. It runs in happy-dom, whose parser is not
WebKit's: the guarantees are structural and hold for either, and a run of
the same table in the browser harness is still to add.

### A device that syncs

| Threat | Answer as built |
|---|---|
| A device writing where its account may not | A device syncs over its device session (ADR 0074 item 8): each write, deletion and rename it sends is checked against the account's role in the folder before the core acts — a reader's device receives, its local changes refused (ADR 0079 item 1) — and a write against the folder's quota (ADR 0077 item 5). |
| A device's write over a newer version | Every change a device sends names the hash it was based on and is refused when the file on the server is no longer that one (invariant 11); the device then keeps both, its own as a conflict copy (ADR 0079 item 8). Two pure appends to a note's end are joined instead, on the device, and said "merged" in the sync's log (built, 834dd8d). A known limit: a program outside Verso saving a stale buffer is an ordinary change (ADR 0079, finding F18); keeping the version it replaced is ADR 0080 item 12, accepted, being built. |
| A device deleting a folder's files | A deletion a device sends is checked against its base like a write and goes to the folder's `.trash/` on the server; on the computer, a pass that would delete more than a fifth of the files or more than 50 (3 at least) pauses and asks (ADR 0079 item 9), and a placeholder is never a deletion (ADR 0043). Seeing and restoring the trash in the window is ADR 0080, accepted, being built. |
| A device token stolen | Kept `0600` on the computer (above), listed among the account's sessions under the name the person gave the computer, and revocable there; an admin ends it from the console with the account's other sessions and tokens (ADR 0077 item 3, built); the change log names the device beside the account (ADR 0079 item 4). |
| A device speaking another sync | The device sends its sync version as `x-verso-sync`; the server answers its own in the hello and refuses the `sync_*` commands of a version older than the previous one, with the reason (ADR 0079 item 5, built). A window or a program that says none is never refused. |
| A huge file to exhaust memory | Sync moves a file in pieces of 1 MiB, read from the disk as each is sent and written to a temporary file as each arrives — a transfer holds one piece in memory, never the file (2b1f2c4) — two transfers at a time each way per connection, dropped after two idle minutes and when the connection ends, and no file larger than 1 GiB (ADR 0079 item 12); a file above it on the server is never read by the walk, and is listed on the folder's console page. A send's declared size is checked against the quota at its first piece (gap 5, closed). |

### Sharing a folder inside a folder

ADR 0081, accepted on 2026-10-11 and **not built**: these rows say what it
decides, not what runs.

| Threat | Answer as decided |
|---|---|
| A receiver reaching beyond the shared path | A share is a grant on a path; the session that opens it holds the path, every command's paths are joined to it and confined (`..` refused before `verso-fs` acts), and every answer — the tree, a search, backlinks, the graph, a base's rows, the change log — is filtered to the path and re-rooted at it (items 1 and 2). |
| Learning of the notes outside the share | A link to a note outside resolves to "not in what was shared with you": not whether it exists, not its path, not its content (item 11). |
| A share passed on, or kept after it ends | Only the folder's owner shares, and a receiver does not re-share (item 4); a revocation reaches the receiver's open windows at once, and a synced copy stays on their computer with its sync off — said to the owner when sharing (item 8). |
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
| Secrets in the log | No password, token or link is logged; the setup link is the one secret printed, once, by design. A window's log lines are one line each, control characters replaced. The console shows the configuration with its secrets (`VERSO_UPDATE_TOKEN`, `VERSO_SMTP_URL`) as set or not, never their value. |
| A vulnerable or unlicensed dependency | `cargo-deny` (advisories, licenses) and the npm license allowlist in CI; one unmaintained notice excepted with an expiry (RUSTSEC-2026-0215, smallstr via yrs). |

### Agents

Another member's note can carry text written to steer an agent that reads
it (ADR 0045). The server exposes no MCP over the network yet
(`[OPEN]`, ADR 0073 item 11); a member who syncs or opens a shared folder
with a local agent brings that risk to their own machine. The documentation
says so where agents are set up. A personal access token is the one way a
program reaches the server meanwhile, scoped as above.

## Gaps found on 2026-10-11

Found by reading the code at HEAD 7729940; findings, not fixes. Classified
for a release to a first user who is not the maintainer, by
[ADR 0033](../adr/0033-pr-workflow.md)'s levels; the classification is a
recommendation for the maintainer to confirm.

**BLOCKING**

1. **The sanitizer of note HTML has had no review against hostile notes,
   and no test of its own.** It is the boundary between members (ADR 0073
   item 6) and is written by hand (`app/ui/src/sanitize.ts`); no unit test
   in `app/ui/test/` and no end-to-end test feeds it hostile HTML. The
   model's own `[OPEN]` below. **Closed: c7f8c8d** — reviewed and fixed (a
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
   **Closed: e4b679c** — every write, at both ends, within 30 s plus its
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
   **Closed: fd75ff9** — 64 MiB of pushes per connection beside the 1024
   messages, a presence 16 KB at most. The 8 parsed requests stay, bounded
   by the message limit and now by the connections below.
4. **No cap on connections and no global rate on commands.** Nothing
   bounds the connections of one account, of one address or of the
   server; each takes up to 8 commands on the blocking pool. One member's
   program can starve every other member. The model's own `[OPEN]` on a
   rate limit beyond sign-ins.
   **Closed: aa7fea0 and e3360e1** — 32 WebSockets per account, 64 per
   address; 512 connections on the server, 128 per address; commands at
   100 a second per account (400 at once) and 1 000 on the server (2 000),
   waiting their turn past it, said in the log once a minute. Reasoned,
   not measured on the 1-core host yet.
5. **An upload is held in memory until its last piece, and the quota is
   checked only then.** Up to two uploads of 1 GiB per connection, times
   the connections above; the declared size is known at the first piece
   and could be checked against the quota there. **Closed: 2b1f2c4** —
   an upload's pieces are written to a temporary file of the folder as
   they arrive, one in memory at a time, and its declared size is checked
   against the quota at the first piece (and again at the last); a
   transfer dropped takes its temporary file with it.
6. **The mail routes answer later when the address has an account.**
   `signin_link` and `forgot` await the mail server only for an existing
   account; the comment says "after the same delay", the code adds none.
   The time tells who has an account, which the password route avoids.
   **Closed: 98ce00b** — both answer once the address's delay is passed;
   looking the address up, the link, the mail and the audit line follow
   the answer, the same for every address.
7. **The per-address delays key on the whole address.** Over IPv6 one
   host has a /64 to rotate through: the delays of device start, mail,
   links and passkeys are passed, the in-memory maps (the limiter, the
   pending device codes) grow until pruned (one hour, ten minutes), and a
   person's mailbox can be flooded with sign-in and reset mails, limited
   only by sender address. **Closed: 33878fb** — keyed by /64 (an IPv4
   address whole); the delays keep 100 000 keys, the device codes, sign-in
   links and passkey ceremonies 10 000 each, the oldest tenth going first.
   A mailbox is still bounded only by the senders' /64s: a delay by the
   address mailed to is not built.
8. **No HTTP timeouts or connection limit on the listener** (unverified:
   none is configured in `lib.rs`; whether the defaults of `axum::serve`
   time out a slow header was not checked). Behind Caddy or `tailscale
   serve` the proxy answers this; a server on its own TLS faces it.
   **Closed: e3360e1** — checked: `axum::serve` sets no timer, so hyper
   applied no deadline. Each connection is now served by hyper's HTTP/1
   builder with one: headers 30 s, a request 60 s; 512 connections, 128
   per address, counted before the TLS handshake.
9. **The trash is unbounded until ADR 0080 is built.** Deletions go to
   `.trash/`, which the walk and the quota do not count, with no
   retention yet: a writer can write and delete in a loop and fill the
   host's disk past the quota. ADR 0080 item 8 decided the guard.
   **Closed: 8ad89d2, 9c10495, 02903f1, 173cf7e, f3edc42** — ADR 0080 built
   on the night of 2026-10-11 to 12: the trash expires (30 days by
   default), and a folder's trash larger than its quota has its oldest
   entries expire early, said in the folder's page (item 8).
10. **An external review of this model**, as the model asked on
    2026-10-09; ADR 0073 asks for security "in full". **Still open:**
    after the gaps above.

**MINOR**

11. **Presence can claim another name.** `collab_awareness` is relayed
    opaque; the server does not stamp the sender's account, so a member's
    cursor can wear another member's name and colour. **Closed: 3bc56ae**
    — the server reads each awareness update, sets each state's `user` to
    the sender's account name and a `#rrggbb` colour (the window's first
    otherwise), and drops a Yjs client another account speaks for (at
    most 8 per connection); malformed bytes, and a presence from a window
    not in the room, are refused (the maintainer, 2026-10-12: "temos que
    ser seguros desde o dia 0").
12. **Device-code phishing.** Whoever starts a code chooses the device's
    name the approval page shows; a person sent a link can approve a
    stranger's device into their own account. The page shows no address
    or time of the request. **Closed: 5838c10** — the pending code keeps
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
    read the hashes. **Closed: b8badc7** — `server.sqlite` and its journal
    files `0600` at every open (`verso_fs::server::owner_only`); the
    directory keeps the mode its host gave it.
14. **`/f/` sends no `Cross-Origin-Resource-Policy`.** `SameSite=Lax`
    already keeps the cookie off another site's subresource request;
    `same-origin` would say so twice. **Closed: b8badc7.**
15. **`/api/state` tells anyone the exact version.** Useful to the window
    before sign-in; also to someone matching a version to an advisory.
    **Closed: b8badc7** — told only to someone signed in; the sign-in page
    used neither the version nor the contract.
16. **A password change checks the current password on the async
    runtime's thread**, where sign-in moves Argon2id to the blocking pool.
    **Closed: b8badc7.**
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
  board's Excalidraw). *Done on 2026-10-11 (c7f8c8d), by Opus 5.5:* the
  review line by line and the suite, which stays as a guardrail in
  `npm test`; left `[OPEN]` for the maintainer: the review by the model
  that did not write `sanitize.ts`, the other renderers, and the gate and
  the suite run in a browser.
- `[OPEN]` History and recovery of another member's change or deletion.
  *Recommendation:* ADR 0080 (the trash, and the version a device's write
  replaced) answers deletions and devices for the first outside user; a
  member's edit inside a room stays `[OPEN]` for an ADR of its own, as the
  roadmap says, and the documentation says until then that a member with
  write access can change another's text.
- `[OPEN]` A rate limit beyond sign-ins. *(Quotas per folder: ADR 0077
  item 5, built on 2026-10-10; per connection: 8 requests, a queue of 1024
  messages, pings, built on 2026-10-11, b56c538.)* *Recommendation:* before
  the first outside user, gaps 2 to 5: a send timeout, the queue bounded in
  bytes, a cap on connections per account and on the server, the quota
  checked at an upload's first piece; the numbers measured on the 1-core,
  1 GB host of the server's installation notes. *Built on 2026-10-11:*
  gaps 2, 3, 4 and 8 (their commits above); gap 5 on 2026-10-12
  (2b1f2c4); the numbers are reasoned, not measured on that host. Left `[OPEN]` for the maintainer.
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
  and what comes before it (items 1 to 5, 8 to 10 and 13 of the ADR).
