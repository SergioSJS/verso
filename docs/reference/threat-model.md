# The server's threat model (2026-10-09)

What `verso serve` protects, from whom, and how, as built on the branch
`feat/web` on 2026-10-09. [ADR 0073](../adr/0073-self-hosted-server-first.md)
item 6 asks for it before the server is announced to anyone but the
maintainer; [ADR 0074](../adr/0074-accounts-and-access-on-the-server.md)
names what of its own it must cover; [ADR 0045](../adr/0045-server-and-mcp-security.md)
names the prompt-injection risk it takes up. Written by Opus 5.5; it
decides nothing — where a gap needs a decision it says `[OPEN]`.

## What is protected

| Asset | Where | Why it matters |
|---|---|---|
| The notes and attachments | the folders under `VERSO_FOLDERS_DIR` | the person's writing; a folder may be shared by several people |
| Accounts and password hashes | `server.sqlite` in `VERSO_DATA_DIR` | Argon2id hashes; a stolen one is attacked offline |
| Sessions, device sessions, personal access tokens, single-use links | the same database, as SHA-256 only | each opens an account until it ends |
| Passkey credentials | the same database | public keys and counters; no secret |
| The audit log | the same database | who did what; a member's evidence |
| A device's token on a desktop | `servers.json` in the app's configuration directory, `0600` | opens the account from that computer |

## Who

- **A stranger on the network** (the internet, or a home Wi-Fi): no account.
- **A member**: an account, with roles in some folders.
- **A member with a hostile note**: writes HTML, SVG, links or text meant
  for another member's window or agent.
- **The admin**: manages accounts; no implicit access to folders.
- **The host**: whoever runs the machine or the container. Reads the disk,
  the database and the log. Out of scope as an adversary: the
  documentation says in those words that whoever hosts sees the notes
  (ADR 0073 item 6, no end-to-end encryption).
- **A page of another site** open in a member's browser.

## Boundaries

1. The network → the server: TLS, `Host`, `Origin`, the session.
2. One member → another, inside one server: roles per folder, the
   window's sanitizer and policies, the files' sandbox.
3. The browser's page → the server's API: the cookie, the CSRF token.
4. The server → the disk: `verso-fs`, path confinement, symlinks kept
   inside a folder.
5. The server → the internet: the release feed only.

## Threats and what answers them

### Reaching the server

| Threat | Answer as built |
|---|---|
| A password or a token read on the wire | Nothing that signs in or carries a secret is served without TLS — the server's own (`VERSO_TLS_CERT_FILE`), a configured proxy's (`VERSO_TRUSTED_PROXY` with `X-Forwarded-Proto: https`) — or from this machine to a server that listens on loopback only. A secret over plain HTTP from elsewhere is not even read. |
| Forwarded headers forged to look secure | Believed only from `VERSO_TRUSTED_PROXY`'s address. |
| DNS rebinding: a site resolving its own name to the server | The `Host` header must be the public address's or a loopback name; else 421. |
| Listening beyond loopback by accident | Refused at start without `VERSO_PUBLIC_URL`; the default is `127.0.0.1`. |

### Signing in and staying signed in

| Threat | Answer as built |
|---|---|
| Guessing passwords | Argon2id (OWASP's first parameters); a growing delay by address and by account, never a lock a stranger can use; 12 characters at least. |
| Learning who has an account | A wrong password and an unknown e-mail are answered alike, in about the same time (a hash is computed either way); a passkey's start answers alike too. |
| A stolen session cookie | `HttpOnly`, `SameSite=Lax`, `Secure` and `__Host-` over HTTPS; 14 days idle, 90 at most; listed in Settings and ended there; a password change ends the others; checked again before every command of an open WebSocket. |
| Cross-site requests | Every request that changes something checks `Origin` against the server's and carries the session's CSRF token; the WebSocket checks `Origin` before it accepts the cookie. |
| A token leaked from a script | Personal access tokens are scoped to folders and to reading or writing, never more than the member's role; never an admin; prefixed `verso_pat_` for secret scanners; kept as SHA-256; revocable. |
| The first admin taken by whoever arrives first | No setup page open to anyone: the admin comes from the environment on the first start, or from a single-use setup link valid one hour, printed once in the log — whoever reads the log is whoever runs the server. |
| A lost admin | `verso serve admin reset <e-mail>` on the machine: access to the machine is the last factor; the reset is in the audit log and ends the account's sessions. |
| An invitation or a reset link forwarded or guessed | 256 bits, single use, an expiry (7 days, 24 hours), its use recorded (by whom, when), ended by the admin before use; attempts slowed by address. |
| A device approved by mistake | The approval page shows the device's name and the code the app shows, asks a signed-in person in the browser, and the device's session is listed and revocable. |
| Passkeys | WebAuthn with user verification required (webauthn-rs); the ceremony's state lives five minutes in memory; counters stored. |

### One member against another

| Threat | Answer as built |
|---|---|
| Reaching a folder one was not given | Every command and every file request checks the member's role in the folder before the core acts; a folder one may not see answers 404. The admin is no exception: entering a folder is a grant to oneself, in the log the owner reads. |
| A reader writing | Write commands, edits of a shared note and the folder's settings are refused below the editor's role; the window hides what the role cannot do. |
| Stored XSS through an attachment (HTML, SVG) | Files are served from `/f/` with `Content-Security-Policy: sandbox` and `nosniff`: a document made of them runs no script. |
| Stored XSS through a note's HTML | The window's sanitizer of note HTML is the boundary between members (ADR 0073 item 6); the window's own policy, sent as a header, allows scripts from the server only. `[OPEN]`: a dedicated review of the sanitizer against hostile notes before the announcement. |
| Remote content leaking who reads | Remote pictures and embedded pages follow the reader's own setting, never the author's (the maintainer's answer I). |
| Symlinks leading out of a shared folder | On a server a link is followed only when it leads inside the folder; one that leaves is refused and listed as a problem. |
| An edit that erases another's text | Simultaneous editing merges; a write from elsewhere is merged line by line or refused as changed; a change made outside while edits wait stops the room for people to choose. `[OPEN]`: history, attribution and recovery of another member's change (ADR 0073). |
| A huge message to exhaust memory | A WebSocket message is 48 MB at most; a malformed Yjs update is refused. `[OPEN]`: quotas per folder (ADR 0075 item 4 says limits come later) and a global rate limit on commands. |

### The server's own reach

| Threat | Answer as built |
|---|---|
| The server as an open proxy | It reaches the network only for the update check: the project's release feed, once a day, with nothing but its version in the `User-Agent`; `VERSO_UPDATE_CHECK=off` stops it. |
| The databases corrupted on a NAS | Warned in the log and on the admin page when `VERSO_DATA_DIR` is on a network file system. |
| Secrets in the log | No password, token or link is logged; the setup link is the one secret printed, once, by design. |
| A vulnerable or unlicensed dependency | `cargo-deny` (advisories, licenses) and the npm license allowlist in CI; one unmaintained notice excepted with an expiry (RUSTSEC-2026-0215, smallstr via yrs). |

### Agents

Another member's note can carry text written to steer an agent that reads
it (ADR 0045). The server exposes no MCP over the network yet
(`[OPEN]`, ADR 0073 item 11); a member who syncs or opens a shared folder
with a local agent brings that risk to their own machine. The documentation
says so where agents are set up.

## Gaps before the announcement

- `[OPEN]` A review of the note HTML sanitizer against hostile members.
- `[OPEN]` History and recovery of another member's change or deletion.
- `[OPEN]` Quotas and a rate limit beyond sign-ins.
- `[OPEN]` The desktop's device token in the system's keychain instead of a
  `0600` file.
- `[OPEN]` The MCP transport and its authorization over the network.
- An external review of this model, as ADR 0073 asks of the server's
  security "in full".
