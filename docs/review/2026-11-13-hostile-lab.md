# Hostile-lab validation — 2026-11-13 (ADR 0083 item 19)

Times in UTC-3. This is the automated hostile-lab run ADR 0083 item 19 asks
for: the running server attacked in an isolated local lab, as an attacker who
has read the open source. It does **not** replace item 16's penetration test
by a person outside the project, which is still a condition of the public
announcement.

## Setup

- Code at `feat/app-server`, HEAD `23b194183` (the server crate unchanged
  since `d93bb0e`, where `check.sh` was green; `23b194183` adds only docs).
- Image built with `scripts/check-server-image.sh` (`universo:check`): the
  static musl `verso` in a Linux container, the image from
  `packaging/server/Dockerfile`, run `--read-only --tmpfs /tmp --cap-drop ALL
  --cap-add CHOWN/SETUID/SETGID --security-opt no-new-privileges`.
- One container, **bound to `127.0.0.1:18443` only** (never `0.0.0.0`; this is
  a Thoughtworks laptop, no service exposed to the LAN or the internet), over
  its own self-signed TLS. No remote host was touched.
- Seed: an admin (`VERSO_ADMIN_*`), two ordinary members (Bea, Cadu, created
  through `/api/admin/accounts` + `/api/reset/{token}`), a folder owned by the
  admin ("Segredos"). Fake data only.
- Harness: `lab/hostile/attack.py` (Python stdlib, no network beyond the lab),
  run with `python3 -I`. Each candidate was verified adversarially before
  being called a finding.

## Attacks and results — HTTP/REST surface

| # | As | Attack | Result |
|---|----|--------|--------|
| A1 | stranger | `GET /api/me`, `…/folders/{fa}/members`, `…/audit`, `/api/admin/overview`, `/api/admin/accounts` | **held** — 401 |
| A1 | stranger | `GET /f/{fa}/Segredos.md` (folder file) | **held** — 401 |
| A2 | stranger | path traversal on `/f/{folder}/{*path}`: `../../../../etc/passwd`, `..%2f…`, `....//…`, `/etc/passwd`, `%2e%2e/…` | **held** — 401, no file bytes |
| A3 | stranger | `POST /api/signin` with `Origin: https://evil.example` | **held** — 403 |
| A3 | member | write with a valid cookie but **no** `x-verso-csrf` header | **held** — 403 |
| A3 | member | write with a foreign `Origin` | **held** — 403 |
| B1 | member Bea | `GET …/folders/{fa}/members`, `…/audit`, `GET /f/{fa}/…` on the admin's folder she is not in | **held** — 404 (a folder one may not see does not exist, to them) |
| B1 | member Bea | `POST …/folders/{fa}/shares/invite` with a **valid** body; `PUT …/members/{bea}` role owner | **held** — 404 |
| B2 | member Bea | every `/api/admin/*` route, incl. `…/accounts/{id}/reset` | **held** — 403 |
| B3 | stranger | 25 MiB body, and a well-formed 2 MiB body, over the 1 MiB `API_BODY` limit | **held** — connection reset at the limit; `GET /api/state` after = 200 (no crash) |

### Two candidates, both verified NOT findings

1. **`shares/invite` returned 422, not 404, at first.** A malformed body (no
   `path`) is rejected by axum's JSON extractor *before* the handler's
   `owned()` authorization runs — a 422 deserialization error, not access.
   Re-run with a valid body (`{"path":"","role":"reader","email":…}`): Bea
   gets **404**. Access holds. False positive of the harness.
2. **25 MiB body "dropped the connection".** That is the `DefaultBodyLimit`
   (1 MiB, `http.rs:548`) closing the stream. The server stays up and answers
   afterwards (200). Documented behaviour (threat-model gap 8). Not a defect.

**HTTP/REST surface: 0 confirmed findings.** Stranger blocked, cross-member
access 404, admin routes 403, path traversal blocked, CSRF + `Origin`
enforced, body limit enforced without a crash.

## WebSocket / room surface — analysed in code, not yet exercised live

Not fully scripted over the wire in this run (an honest gap, below). What the
code shows:

- `/api/ws` upgrade (`rpc.rs:120`) runs the same `Origin` check as the REST
  routes for a browser, and tokens for the app/programs.
- A window joins a folder's room only through the `open` path
  (`rpc_open.rs`), which resolves the folder through `access::role` /
  `opening()` — the same 404-for-non-members gate the REST tests above
  exercised. `access::Door::of` (`access/door.rs:88`) builds every room
  capability from `rpc::role_here` (the role the server stored for that
  window), so a member cannot forge a window onto a folder they may not
  reach.
- The visibility cases that would be BLOCKING — a secret roll, audience-
  limited content, hidden board pins/ids/text reaching a player — are covered
  by the project's adversarial **unit** tests, green at this HEAD through
  `check.sh`: `board_sight_tests.rs` (26 tests: "a secret pin is not there",
  "no hidden id or text reaches a player", "an update to an id not seen is
  refused", "a players' canvas never writes over what they do not see"),
  `access/vectors.rs` (27 access-decision vectors), `collab_tests.rs`.

## Not covered (why item 16 still stands)

- A full over-the-wire WebSocket attack with two live player connections
  against one table (secret rolls and audience, live, not only in unit tests).
- A resource-bounds / load test against the item-18 limits — belongs on
  Proxmox VM 107 (1 core, 1 GB), not this shared box; not run here.
- Passkey/WebAuthn flows (no authenticator in the lab).
- The automated lab does not replace **ADR 0083 item 16**: a penetration test
  by a person outside the project, before the public announcement.

## Verdict

Every HTTP attack the lab ran was held, and the two candidates were verified
false. The WebSocket room gate reuses the same access check, and the
visibility leaks are guarded by green adversarial unit tests. Nothing here
blocks opening the test server to a few invited, known people (ADR 0083
item 16 gates the *announcement*, not the first invited users). The live
WebSocket attack and the outside-person pentest remain to be done before the
announcement.
