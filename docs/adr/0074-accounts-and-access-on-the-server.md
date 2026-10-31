# ADR 0074 — Accounts and access on the server: the first admin, sign-in, tokens

- Date: 2026-10-09
- Source: the maintainer, in session on 2026-10-09, opening the web
  version: *"como que vai ser feito esse [início] de usuário. Se a gente vai
  ter um admin que ele é cadastrado ao subir a imagem. Sendo definido pelas
  variáveis de ambiente daquela imagem. como que a gente vai fazer esse
  controle de acesso por e-mail, por token, autenticação porque isso vai ser
  importante da gente ter a partir do momento que a gente roda isso no
  navegador"*. Written by Opus 5.5; to be read by Fable 5.1
  ([0032](0032-author-and-reviewer-roles.md)) before it is accepted.
- Related: [0050](0050-outbound-network-access.md) (the core reaches no
  server of its own: `VERSO_SMTP_URL` is outbound traffic that 0073
  proposes to allow and 0050 forbids until then — allowed since
  2026-10-09, an address the host wrote in a configuration, 0050 revised),
  [0073](0073-self-hosted-server-first.md) (the server; its item 5
  proposes accounts, sessions and roles, and leaves account recovery
  without a mail server and the number of owners per server `[OPEN]` —
  this ADR details item 5 and proposes answers to those two),
  [0045](0045-server-and-mcp-security.md) (session identity and
  authorization in the contract, `[OPEN]` until a server enters scope),
  [0026](0026-core-ui-contract-inviolable-rules.md) (rule 2: the window does
  not know which side of the wire the core is on),
  [0027](0027-runtime-capabilities.md) (what a window learns of the side it
  talks to), [0011](0011-config-outside-tree-index-as-cache.md) (the
  configuration lives outside the folder), [0012](0012-files-are-source-of-truth.md),
  [0035](0035-cross-cutting-requirements.md) (both languages,
  accessibility), [0070](0070-what-travels-with-the-folder.md) (the
  person's layer of settings).
- Status in the briefing: not present; §9 marks the server `PROPOSED`. On
  acceptance, together with [0073](0073-self-hosted-server-first.md).
- Revisions: 2026-10-09 (night) — accepted by the maintainer together with
  [0073](0073-self-hosted-server-first.md), in the answer quoted there
  (*"… vc segue o recomendado"*): items 2, 7, 9, 10 and 11, proposed until
  then, as written; the desktop app's connection through the browser of
  item 8 built in this round (K of the plan, not the recommendation); the
  order of work for passkeys in the Status. 2026-10-11 — item 8: the
  device's name, kept with its session, may be set by the person in
  Settings › Servers, the system's name by default — the maintainer's
  *"Sim para todos"* of that evening, recorded in
  [0079](0079-sync-a-local-folder-with-a-server.md) (Revisions, item 8). 2026-10-21 — [0104](0104-external-cloud-storage-transports-and-quotas.md) item 14 (C.5): the device token moves from `servers.json` to the system's keychain (to be built). 2026-10-23 — item 4: an account that already exists accepts an invitation with the account it has (signed in, one button; not signed in, the sign-in fields on the invitation's page, then the join; an invitation made for an e-mail serves that account only; what the account already has is never lowered) — the maintainer: *"recebi um convite para entrar numa mesa nova e fui tentar entrar com a Ana e deu que o usuário já existia com esse e-mail... não tem fluxo de usuário igual aceitar convite de mesa diferente?"*.

## Context

[0073](0073-self-hosted-server-first.md) puts a server first: the core
without a window, reached by a browser, a phone and the desktop app, with
several people in one folder. From the moment the window runs in a browser,
every request comes from a network the server does not control, and three
things have to exist before anyone but the maintainer is let in: **how the
first account appears** on a server that has none, **how a person proves
who they are** in a browser, and **how a program that is not a browser**
(the desktop app connecting, the command line, an agent) is let in.

0073 item 5 already proposes the shape: accounts with a password hashed
with Argon2id, passkeys when the browser offers them, OpenID Connect
later; sessions by token with expiry and revocation; per folder the roles
owner, editor and reader, granted by an invitation link or by the owner.
It leaves open account recovery without a mail server and whether a server
has one owner or many. The maintainer adds the first account defined by the
image's environment, and access by e-mail and by token.

How other self-hosted services do the first account, observed from their
public documentation:

- **Created from the environment on first start**: Grafana
  (`GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD`, read only when
  the database has no admin yet), Gitea's `gitea admin user create` run by
  the operator, Keycloak (`KC_BOOTSTRAP_ADMIN_USERNAME`,
  `KC_BOOTSTRAP_ADMIN_PASSWORD`, a temporary admin).
- **A setup page for whoever arrives first**: Nextcloud, Jellyfin. Simple,
  and a server exposed before its owner opens it belongs to a stranger.
- **A secret printed in the log** that the setup page asks for: Jenkins's
  initial admin password.
- **A secret in the environment that is the admin**, with no account:
  Vaultwarden's `ADMIN_TOKEN` for its admin page.

## Decision

Proposed; the maintainer decided the six questions on 2026-10-09
(Status): items 1, 3, 4, 5, 6 and 8 say what was decided; items marked
*Proposed* wait for the acceptance of this ADR with 0073. *(Accepted with
0073 on 2026-10-09, the items marked Proposed as written.)*

1. **The first admin comes from the environment, on the first start
   only.** `verso serve` reads `VERSO_ADMIN_EMAIL` and
   `VERSO_ADMIN_PASSWORD` — or `VERSO_ADMIN_PASSWORD_FILE`, for Docker and
   Kubernetes secrets, which keep the password out of `docker inspect` —
   and creates that account with the admin role **when the server has no
   account yet**. Once one exists the variables are ignored, and the log
   says so in one line, without the value: changing the variable never
   resets a password silently, and the admin's later password changes are
   not undone by a restart. A password under 12 characters, or the two
   variables half set, stops the start with an error naming the variable.
   - **Without the variables**, the server does not open a setup page to
     whoever arrives first: it prints once in its log a setup link with a
     single-use token, valid for one hour, and that page creates the
     admin. Whoever can read the container's log is whoever runs the
     server.
   - Decided by the maintainer on 2026-10-09: the variables are read on the
     first start only, with a way back for an admin who forgets the
     password or loses the account (item 5).
2. *Proposed; accepted as written on 2026-10-09.* **The e-mail is the account's name, verified or not** —
   refining the "user name" of 0073 item 5. An account is an
   e-mail address (trimmed, NFC, lower-cased for comparison, shown as
   typed), a display name and a language (pt-BR or English,
   [0035](0035-cross-cutting-requirements.md)). Without a mail server the
   address is an identifier the admin vouches for, not a verified mailbox,
   and the interface says so. With a mail server configured
   (`VERSO_SMTP_URL`, optional) the address is verified by a link, and
   e-mail sign-in links and password resets become available (item 3).
3. **Signing in.** In the first version: **password** (Argon2id, the
   OWASP parameters of the day, recorded in the code), and **passkeys**
   (WebAuthn) added from Settings once signed in — which need HTTPS and a
   stable address, `VERSO_PUBLIC_URL`, which 0073 item 6 implies (TLS and
   a configured proxy address). *(Since 2026-10-16 the server also works
   over plain HTTP, the passkeys being off there: Revisions of
   [0073](0073-self-hosted-server-first.md).)*
   With a mail server: a **sign-in link by e-mail**, single use, fifteen
   minutes. **OpenID Connect** (Authelia, Authentik, Keycloak, Google)
   after, for the servers that already have an identity provider. A
   one-time code app (TOTP) as a second factor: after passkeys, if asked
   — a passkey is already two factors.
   - Alternatives: e-mail links only (Notion's default; impossible without
     a mail server, which most home servers lack); OIDC only (pushes a
     second service on every host).
4. **Nobody signs themselves up.** No open registration, not even as an
   option in the first version. The admin creates an account or an
   **invitation**: a single-use link with a token, valid for seven days,
   that the admin copies to send however they like (and that the server
   e-mails when it has a mail server). The invitation can already carry a
   folder and a role (item 6), so "invite a player to the campaign" is
   one step. The admin page lists each invitation with its state —
   pending, used (by whom, when) or expired — and ends one before it is
   used; and it lists each account with the space its folders take and
   how many folders it owns ([0075](0075-server-packaging-and-storage.md)
   item 4).
   - Alternatives: an allowlist of addresses or of a domain that may sign
     up (useful for a company; adds a sign-up page to defend); open
     registration (rejected for a server holding private notes).
5. **Account recovery without a mail server** (0073's `[OPEN]`): the
   admin resets a member's password from the admin page — the member gets
   a reset link to use once, like an invitation; and the admin's own
   account is recovered by whoever runs the server, with
   `verso serve admin reset <e-mail>` run on the machine or inside the
   container (`docker exec`, the terminal CasaOS and ZimaOS offer), which
   prints a reset link, ends the account's sessions and writes the reset
   in the audit log. Access to the machine is the last factor, as it
   already is for the files. This is what the self-hosted services the
   maintainer pointed to as the reference do ("siga o que a comunidade
   preferir"): Grafana (`grafana cli admin reset-admin-password`), Gitea
   (`gitea admin user change-password`), Immich
   (`immich-admin reset-admin-password`), Nextcloud
   (`occ user:resetpassword`), Authentik (`ak create_recovery_key`),
   Keycloak (`kc.sh bootstrap-admin`).
6. **Two levels of role.** On the server: **admin** (accounts,
   invitations, the server's settings) or **member**. Per folder, as 0073
   item 5: **owner**, **editor**, **reader**. Decided: the admin role
   **does not** give access to every folder — an admin who wants into a
   folder grants it to themselves, and the grant is in the audit log
   (item 9) for the folder's owner to see. Whoever runs the server reads
   the disk anyway, and 0073 says so in those words; the point is that the
   interface does not show one member's notes to another by default.
   Several accounts per server (a family, a table of players, a team)
   answers 0073's `[OPEN]` on owners per server: the Foundry model the
   maintainer named is a game master and players on one server. Creating
   folders is a permission the admin grants, off for a new member, so an
   invited player only sees the folders shared with them.
7. *Proposed; accepted as written on 2026-10-09.* **Sessions in the browser: an opaque token in a cookie, kept on the
   server.** On sign-in the server makes a random 256-bit token, stores
   its SHA-256 with the account, the device's name and the dates, and
   sends the token in a cookie `__Host-verso-session` — `Secure`,
   `HttpOnly`, `SameSite=Lax`, path `/`. A session lasts 14 days without
   use and 90 days at most; Settings lists the sessions and ends any of
   them, or all ("sign out everywhere"); a password change ends the
   others. A request that changes anything checks `Origin` against
   `VERSO_PUBLIC_URL` and carries a CSRF token; the WebSocket of the
   contract checks `Origin` before it accepts the cookie (0073 item 6).
   - Alternative: a signed token the server does not keep (JWT) — rejected:
     revoking one before it expires needs a list kept on the server
     anyway, which is the session table with extra steps.
8. **Tokens for programs: personal access tokens.** A member creates a
   token in Settings with a name, an expiry (30 days by default, one year
   at most, or none, said in red), the folders it reaches and **read** or
   **read and write** — never more than the member's own role. The token
   is shown once, starts with `verso_pat_` — a recognisable prefix, as
   GitHub's own tokens have, which a secret scanner can be given as a
   pattern — and is stored as its SHA-256; it is
   sent as `Authorization: Bearer`. It serves the command line, scripts
   and an agent reaching the server, until the MCP authorization over the
   network of 0073 item 11 is settled. **The desktop app connecting to a
   server** does not ask the person to paste a token: it opens the
   server's sign-in page in the browser and receives a token for that
   device (the device-login flow `gh auth login` uses), listed among the
   sessions and revocable there. **Built in this round**, decided on
   2026-10-09 (K of the plan; [0073](0073-self-hosted-server-first.md)
   item 12): the desktop app's "connect to a server" and this sign-in ship
   with the first release of the server. The device's name, kept with its
   session, may be set by the person in Settings › Servers, the system's
   name by default (decided 2026-10-11, Revisions).
9. *Proposed; accepted as written on 2026-10-09.* **Limits and the audit log.** Sign-in attempts limited by address and
   by account, with a growing delay, never a lock that a stranger can use
   to keep the owner out; the same for invitation and reset links. An
   audit log in the server's data directory records sign-ins (succeeded
   and failed), sessions ended, tokens created and revoked, invitations,
   role changes and grants — who, when, from where — and never a password,
   a token or a link. The owner of a folder sees the entries about their
   folder.
10. *Proposed; accepted as written on 2026-10-09.* **Where accounts live.** In a SQLite database in the server's data
    directory (`VERSO_DATA_DIR`, on a local disk,
    [0075](0075-server-packaging-and-storage.md) item 3), beside — never inside —
    the folders it serves ([0011](0011-config-outside-tree-index-as-cache.md)).
    Unlike the index, it is **not a cache**: it is not rebuilt from the
    files, and the backup recipe of 0073 names it beside the folders. No
    note, no setting of a note and nothing of [0012](0012-files-are-source-of-truth.md)'s
    files moves into it.
11. *Proposed; accepted as written on 2026-10-09.* **The contract.** Every command carries the session that the transport
    authenticated (cookie or bearer token); the core resolves it to an
    account and a role in the folder **before** `verso-fs` acts, and a
    refusal is a contract error like the others, in both languages. The
    desktop app with a local folder keeps the implicit owner of
    [0045](0045-server-and-mcp-security.md) and asks for no sign-in. The
    window learns from the capabilities ([0027](0027-runtime-capabilities.md))
    whether it is signed in and with which role, and hides what the role
    cannot do rather than letting it fail.

The environment of `verso serve`, together:

| Variable | Needed | What it does |
|---|---|---|
| `VERSO_PUBLIC_URL` | no (optional since 2026-10-16: only with HTTPS in front) | the address people use; the passkeys' origin, the `Origin` check, the links in invitations |
| `VERSO_ADMIN_EMAIL` | on the first start | the first admin's e-mail |
| `VERSO_ADMIN_PASSWORD` or `VERSO_ADMIN_PASSWORD_FILE` | with the e-mail | the first admin's password, 12 characters at least |
| `VERSO_DATA_DIR` | no (a default in the image) | the accounts, the sessions, the audit log, the index |
| `VERSO_TRUSTED_PROXY` | behind a reverse proxy | the proxy's address, whose forwarded headers are believed (0073 item 6) |
| `VERSO_SMTP_URL` | no | the mail server: verified addresses, sign-in links, resets by e-mail |

## Consequences

- [0045](0045-server-and-mcp-security.md)'s contract group is answered by
  item 11 when this ADR and 0073 are accepted, with a dated Revisions line
  there; the generated bindings gain the session's errors and the
  capabilities' sign-in state (invariant 3).
- The server gains pages the desktop app never had — sign-in, invitation,
  reset, the admin page, sessions and tokens in Settings — in both
  languages, with the accessibility of the rest of the window
  ([0035](0035-cross-cutting-requirements.md)), and each with its e2e test
  in the harness, which gains the server's answers.
- New dependencies, each justified in its pull request: an Argon2
  implementation (the `argon2` crate, MIT or Apache-2.0), a WebAuthn
  implementation for passkeys (`webauthn-rs`, MPL-2.0), and, with a mail
  server, an SMTP client (`lettre`, MIT). `cargo-deny` decides.
- The threat model that 0073 asks for before the server is announced
  covers this ADR: the setup token in the log, the invitation links, the
  tokens at rest, the cookie, the reset by the operator.
- The documentation of the Docker image lists the variables above, says
  that the admin's variables are read once, and that the accounts database
  is backed up with the folders.

## Discarded alternatives

- **The admin's variables read on every start** (raised by the author):
  a password changed in the app came back on the next restart; the
  maintainer chose the first start only.
- **A one-shot variable that resets the admin, or a trigger file in the
  data directory** (raised by the author, the file from Jellyfin): for a
  host with only a panel; the maintainer asked for what the community
  does, which is a command on the machine.
- **A setup page open to the first visitor** (raised by the author, from
  Nextcloud and Jellyfin): the first visitor owns the server.
- **Open registration** (raised by the author): a server of private notes
  has no reason to accept strangers.
- **Sessions as JWT** (raised by the author): revocation needs server
  state anyway.
- **E-mail links as the only sign-in** (raised by the author, from
  Notion): most home servers have no mail server.

## Status

**Accepted on 2026-10-09** with [0073](0073-self-hosted-server-first.md);
the acceptance's words are in the paragraph after the list below.

*(History, the status before the acceptance:)* Proposed, decided in its
parts by the maintainer on 2026-10-09; to be read by Fable 5.1 and
accepted together with
[0073](0073-self-hosted-server-first.md). The maintainer raised the three
things in the Source, then answered each question:

1. The first admin from the environment, **on the first start only**,
   with a way back for a lost admin; the way back "as the community
   prefers": a command on the machine (item 5).
2. Sign-in: password and passkeys, e-mail links with a mail server; OpenID
   Connect later (item 3) — "ok pode seguir".
3. Invitation by the admin only, with an expiry and its use tracked, and
   the admin page showing what each account takes and how many folders it
   has (item 4).
4. The admin has no implicit access to the folders; a self-grant is
   logged (item 6).
5. Several accounts per server; creating folders granted by the admin
   (item 6).
6. Personal access tokens scoped by folder and by read or write; the
   desktop app signs in through the browser (item 8).

**Accepted on 2026-10-09** with [0073](0073-self-hosted-server-first.md),
in the answer quoted there: items 2, 7, 9, 10 and 11 as written (N of the
plan); the desktop app connecting through the browser built in this round
(item 8, K). Passkeys are built in this round too, after password sign-in
and once the packaging pipeline works — an order of work (M).

Where the server keeps its data, how it is installed, the space each
folder takes and which folders are synced:
[0075](0075-server-packaging-and-storage.md).
