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

## WebSocket / room surface — exercised live (dice) + analysed in code

A raw RFC6455 client (`lab/hostile/ws_attack.py`, Python stdlib, client
masking) carried the sign-in cookie onto `/api/ws` and ran two live tests:

| # | As | Attack | Result |
|---|----|--------|--------|
| W1 | member Bea | `open_server_folder` over the WS on a folder she is not in | **held** — `{"kind":"not_found"}` |
| W2 | two members in one note's room | Cadu makes a **secret** roll (`collab_roll` `secret:true`); does it reach Bea? | **held** — Bea received nothing. Control: a **plain** roll from Cadu did reach Bea (1 `collab-roll` push), so both were genuinely in the room |
| W3 | a player at a table (`ws_audience.py`) | Bea, a reader (so a veiled player) of a folder made a table, reads a note set to audience **hidden** | **held** — `read_note` on the hidden note → `not_found` (the player's projection excludes it), and its text never appeared in her sync stream. Control: she reads a note set to the whole **table** and gets its text |

W2 matches the code: a secret roll never calls `tell` (the room broadcast),
so it reaches only the roller and the folder's owners through the table
(`collab_dice.rs`), never another player in the room. W3 matches the
projection: a player sees the table's audience of a note, never a hidden
one, over `read_note` and over sync.

What the code shows for the rest of the room surface:

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

- The live secret-roll (W2) and audience-note (W3) cases are done. The
  **board-element veil** (a secret pin or a locked card inside a `.canvas`
  room, drawn over `collab_update`) was checked only through the green
  `board_sight_tests` unit tests (26 cases: "a secret pin is not there", "no
  hidden id or text reaches a player", "an update to an id not seen is
  refused"), not with two live board connections — the Excalidraw element
  entries were not reconstructed over the wire.
- A resource-bounds / load test against the item-18 limits — run separately
  on Proxmox VM 107 (1 core, 1 GB); see `docs/review/2026-11-13-load-vm107.md`
  when present.
- Passkey/WebAuthn flows (no authenticator in the lab).
- The automated lab does not replace **ADR 0083 item 16**: a penetration test
  by a person outside the project, before the public announcement.

## Verdict

Every HTTP attack the lab ran was held, and the two candidates were verified
false. The live WebSocket run held too: a member cannot open a folder she is
not in, a secret roll never reaches another player in the room, and a note
hidden from the players is unreadable by a player and absent from their sync
(all with passing positive controls). The VM-107 load flood held every bound
(`docs/review/2026-11-13-load-vm107.md`). The one remaining room case — a
board element's veil inside a `.canvas` room — is covered by the green
`board_sight_tests` unit tests, not yet live. Nothing here blocks opening the
test server to a few invited, known people (ADR 0083 item 16 gates the
*announcement*, not the first invited users). The live board-element case and
the outside-person pentest (item 16) remain before the announcement.

## When to run this whole suite again (the trigger)

This run is a snapshot: it proves the server held at `23b194183`, not forever.
Re-run the full suite (`lab/hostile/*` + the VM-107 flood) when a change could
move the access, visibility, auth or resource boundary — concretely:

**Server code that gates access, auth or limits changed.** Any diff under
`crates/verso-server/src/` in: `access.rs`, `access/` (`door.rs`, `rules.rs`),
`auth.rs`, `http.rs` (routes, `Origin`/CSRF, body limit), `rpc.rs`,
`rpc_collab.rs`, `rpc_open.rs`, `shares.rs`, `campaign*.rs`, `collab*.rs`,
`board_sight.rs`, `readers.rs`, `audience` logic, `limit.rs`, `inflight.rs`,
`listen.rs` (the caps), `pace.rs`, `fair.rs`, `visit.rs` (read links),
`device.rs`, `passkeys.rs`, `passwords.rs`, `crypto.rs`, `admin.rs`,
`db/access.rs`. A new route or a new `collab_*`/folder command always counts.

**The access model or a sharing/table feature changes by ADR.** e.g. ADR 0112
(device confirmation), 0117 R3–R8 (the owner pairs through the link, a
UniVerso's link), 0081 (sharing), 0113 (rights), 0110 (table), 0082 (co-edit),
or any new role/capability. A contract-version bump is a flag by itself.

**A security-relevant dependency moves.** `axum`, `tokio`, `rustls`/TLS,
`rusqlite`/`libsqlite3-sys`, `serde`/`serde_json`, the password hasher
(`argon2`), the WebAuthn/passkey crate, `tower-http`. A new `cargo deny`
advisory on any of these is a flag too.

**A release gate.** Before cutting a version that will be *announced publicly*
— this is where ADR 0083 item 16's outside-person pentest is required, not
just this automated suite.

**The audience widens.** Before opening a server to people beyond the first
known, invited few (a public sign-up, an unknown crowd, a bigger host).

**After any fix to a BLOCKING or visibility finding, anywhere** — re-run to
confirm the fix and catch a regression.

**A new platform/transport touches the server.** A new OS port of the server,
a change to the Cloudflare link / `cloudflared`, a new proxy in front, a
change to `VERSO_TRUSTED_PROXY` handling.

Not a trigger (no re-run needed): UI-only changes, docs, fixtures, the demo
vault, themes, or anything that does not reach `crates/verso-server` or the
access model.

*Suggestion (not a decision — the maintainer's to make, `[OPEN]`):* a CI check
that fails, or warns, when a PR touches any file in the first list above
without a line in the PR saying the hostile suite was re-run, so the trigger
is not forgotten.
