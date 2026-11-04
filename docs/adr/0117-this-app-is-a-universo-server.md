# ADR 0117 — This app is a UniVerso server: a folder or a table served from this computer, on the network and by a link

- Date: 2026-11-03; **rewritten in place 2026-11-04** (see Status).
- Source: the maintainer. 2026-11-03, reading the plan for the online mode
  (`~/.cache/verso-kit/plan-online-mode-2026-11-03.md`): *"deveria ser uma
  feature só com essas nuances aí"*; *"gosto de todas sugestões"* (the
  plan's Q2–Q9); *"a pessoa pode configurar um DNS fixo se quiser, e deveria
  ser fácil"*. 2026-11-04, testing the build, after serving refused a folder
  that syncs with a UniVerso (commit `8c9a77376`): *"merda de adr 96, a
  lógica era pra ser a mesma de compartilhar mesa no UniVerso, só que usando
  o app local"*, and the points quoted in D1–D8.
- Supersedes: [0096](archive/0096-this-app-is-a-server.md) (built) and
  [0111](archive/0111-online-mode-a-table-from-this-app-through-a-tunnel.md)
  (never built), both archived. A reader needs neither.
- Revisions: 2026-11-04 — rewritten in place by the maintainer's decision
  (Status). The first text is at `62b901672`; the build's commits before
  this date cite its numbers, which map to this text as: old D2 → D12,
  old D3 (items kept) → D11, old D4 (Q2–Q9) → D13, old D5 → "As built: the
  spike", old D6 → D10, old D7 → D17, old D8 → D16; D9 and D10 keep theirs.
- Related: [0073](0073-self-hosted-server-first.md), [0074](0074-accounts-and-access-on-the-server.md),
  [0077](0077-the-server-administration-console-and-folder-quotas.md),
  [0079](0079-sync-a-local-folder-with-a-server.md), [0081](0081-sharing-between-people-on-one-universo.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md), [0083](0083-security-hardening-of-universo.md),
  [0105](0105-read-links-without-an-account.md), [0107](0107-the-table-a-shared-roll-and-chat-log.md),
  [0110](0110-a-table-is-a-campaign-folder.md), [0113](0113-one-access-model-for-a-table.md),
  [0050](0050-outbound-network-access.md), [0065](0065-a-folder-per-window.md),
  `docs/reference/threat-model.md` ("The laptop as a server").
- Status in the briefing: not present.

## Context

[0096](archive/0096-this-app-is-a-server.md) (built 2026-10-15) let the
owner's **phones** reach folders of this computer: a switch in Settings, a
list of folders ticked there "whole or in part", no other person, and a
folder that syncs with a UniVerso never served (its item 11 (b)). The first
text of this ADR (2026-11-03) joined it with 0111's internet link into one
feature and then put the UniVerso's accounts, invitations, shares, tables,
read links, device sync, tokens and passkeys **on top of 0096's frame**: the
global folder list in Settings, "in part" meaning *for the owner's phones
only*, invitations to whole folders only, and the synced-folder refusal. The
build on `feat/app-server` (`a9305e645..62b901672`) followed that text.

That frame was the wrong model. The maintainer, 2026-11-04: the logic is the
UniVerso's — a person makes a folder available, makes tables in it, invites
people — with this desktop app as the host. What the build made (the server
code, the link, accounts, the seat at the table) is the UniVerso's and
stays; what came from 0096's frame changes (D15).

## Decision

### D1. The model is the UniVerso's, with this app as the host `[DECIDED 2026-11-04]`

*"A lógica era pra ser a mesma de compartilhar mesa no UniVerso, só que
usando o app local."* Serving follows the UniVerso's sharing of a folder and
of a table ([0081](0081-sharing-between-people-on-one-universo.md),
[0110](0110-a-table-is-a-campaign-folder.md),
[0113](0113-one-access-model-for-a-table.md)): nothing reachable by default;
a served folder is reached by the people invited or shared into it, at
their role; the same server code judges every answer.

### D2. Per folder or subfolder, on the folder's page `[DECIDED 2026-11-04]`

*"Deveria ser possível abrir servidor em uma sub-pasta assim como fazemos
com mesa, inclusive, daria para aproveitar a mesma tela."*

- What is served is chosen **on the folder's page**, in the table card
  ([0110](0110-a-table-is-a-campaign-folder.md); `app/ui/src/tableCard.ts`,
  which today shows nothing on a folder of this computer): any folder or
  subfolder, served from this computer, then made a table, given access and
  invited to as on a UniVerso. Sitting at the table (D13 Q3) is offered
  there too.
- **Settings keep the transport**: the switch, *On my network*, *By an
  internet link*, *Use my own address*, invitations and the people invited,
  and a **read-only list** of what is served (each entry opens its folder's
  page).

### D3. N tables, N served folders, several active `[DECIDED 2026-11-04]`

*"Eu posso ter N mesas dentro de uma pasta … consequentemente, eu posso ter N
pastas servidas. Eu posso ter mais de uma mesa ativa."* A table is (folder,
root inside it) as 0110 "As built (one chat per table)" made it; several
served folders and several tables run at once on one host. A window opens
one folder ([0065](0065-a-folder-per-window.md)), so the game master sits at
each table from its own window.

### D4. The host is chosen per table; a synced folder is no reason to refuse `[DECIDED 2026-11-04]`

*"Se eu tenho um servidor sincronizando, não deveria ser motivo para não
poder abrir a minha máquina como servidor para outras pessoas."* *"Eu
deveria ser possível escolher se vou servir a mesa pelo UniVerso … ou pelo
app Desktop, e em ambos os casos ser possível ter links do cloudflare."*

1. The refusal of a synced folder (0096 item 11 (b); the first text's D3
   item 11) **goes**. For a folder that syncs with a UniVerso, each table
   (and each served folder) is hosted **on that UniVerso or on this
   computer**, chosen on the folder's page.
2. A Cloudflare link — quick or own address — exists on **both hosts**. On
   this computer it is built (D11, D10). **On a UniVerso it is new scope**:
   `cloudflared` beside the server in each way it is installed (the `.deb`
   and `universo.sh`, Docker compose, ZimaOS), the public origin set at
   runtime (today `VERSO_PUBLIC_URL` is read once at start; the spike
   restarted the server when the quick link's address was known).
3. A folder this person did not share as its owner (a share received from
   another account, synced to this computer) is not served from here: by
   [0081](0081-sharing-between-people-on-one-universo.md) item 4
   (`[DECIDED 2026-10-10]`) a receiver does not re-share. Confirmation asked
   in D14 (g).

### D5. The owner reaches a table on this computer from his own browser and phone `[DECIDED 2026-11-04]`

*"Se eu quiser abrir num navegador com minha conta para ver como tá ficando
e testar"*; *"se fizer assim a gente mata a feature de abrir no celular
usando o app desktop como servidor"* — it must not. The owner's phones keep
working as built (pairing on the network, D12), and the owner reaches the
host **through the link** too. Today he cannot: pairing answers only on the
network (`64eeb999b`), and this computer's owner account has no password and
opens no browser session that is not a paired phone (`49e1d91ed`). How he
signs in through the link is D14 (b).

### D6. One link per host, routes per folder and table; a link may expire `[DECIDED 2026-11-04]`

*"O link pode expirar, não tem problema, a pessoa pode gerar um novo. Da
mesma forma que a pessoa pode ter um link único para o universo inteiro e
gerar rotas específicas para cada pasta … Talvez o hash também."*

- One link per host (this computer's; a UniVerso's), its routes leading to
  the folders and tables on it. A quick link ends (12 hours, D11 item 6) and
  a new one is made; an own address stays.
- Routes that exist today (`crates/verso-server/src/http.rs:487-496`,
  `app/ui/src/web/bridge.ts:432-440`): `/?folder=<id>` (and `&note=`), the
  folder's or share's opaque id, sign-in required; `/invite/<token>`
  (single use, 7 days); `/r/<token>` read links ([0105](0105-read-links-without-an-account.md));
  `/signin`, `/device`, `/reset/<token>`. A **readable route by name** (a
  slug) does not exist: D14 (d).

### D7. Several game masters on one UniVerso, each seeing only their own `[DECIDED 2026-11-04]`

*"A gente conseguiria ter mais de um usuário dentro do universo servindo
mesas … escolho ali algumas pessoas que vão ter permissões para isso … uma
não vai ver o da outra, nem eu, se eu não tiver acesso, exceto, claro, se
essa pessoa me convidar."* Read against the code on 2026-11-04:

| Point | Today | Where |
|---|---|---|
| The admin chooses who may make folders | **Holds**: *may create folders* per account, off for a new member ([0074](0074-accounts-and-access-on-the-server.md) item 6) | `folders.rs:51`, `admin.rs:108` |
| A member's folders and tables are theirs | **Holds**: the maker owns the folder; the owner is the game master (0110 item 15) | `folders.rs:45-75` |
| One member does not see another's folders | **Holds**: a member lists only their own and the shares given to them; another's id answers 404 | `folders.rs:31-38`, `access.rs:17-45` |
| The admin does not see a member's notes | **Holds for content**: the admin has no role in a folder not granted; entering is a self-grant in the audit log, which the folder's owner reads | `access.rs:7`, `admin.rs:356-378`, `/api/folders/{id}/audit` |
| …nor that the folder exists | **Does not hold**: the console lists every folder's name, owners, members, space and audit ([0077](0077-the-server-administration-console-and-folder-quotas.md) item 3) | `console.rs:81` — D14 (f) |
| A game master invites players to their table | **Gap**: only the server's admin invites a person who has no account (0081 item 4, revision 2026-10-12); a member gives a place only to an existing account | `campaign_cmds.rs:945-949`, `can_invite` at `:763` — D14 (e) |

### D8. A table lives on one host; the files are the same through sync `[DECIDED 2026-11-04]`

A table's players, access rows, grants, chat, rolls and pins live in its
host's database ([0113](0113-one-access-model-for-a-table.md), schema 20+).
The files are one set kept by [0079](0079-sync-a-local-folder-with-a-server.md):
an edit made through this computer's server is a local change the sync
uploads; edits on both sides meet by the sync's rules — the base hash, the
append-merge, otherwise a conflict copy, **both kept**. There is no live
room across the two hosts (0096 item 11 (a)'s limit): two people on one
note, one per host, meet at the next sync, not keystroke by keystroke.
Secret blocks ([0087](0087-secret-blocks-hidden-from-readers.md)) are in the
file and hold on both; a note's audience is its host's.

### D9. What of the UniVerso works here `[DECIDED 2026-11-03: parity is the goal]`

*"Esse modo seria compatível com tudo que temos relacionado ao UniVerso,
certo?"* Parity with a UniVerso; what differs is only what a laptop imposes
(it is on while the table runs, as with Foundry; a quick link lasts a
session). "Through the link" results are the spike's (As built).

| UniVerso feature | Here | Where |
|---|---|---|
| Live co-editing in the browser, presence | **Works**, accounts and phones; through the link PASS (two accounts, named carets, 85–115 ms) | `local/allow.rs`, `presence.rs` |
| Another person's desktop app signs in and syncs (0074 item 8, 0079, 0082) | **Built** (S11, `d3077a49b`); phones run no `sync_*`; listed in Settings with *End* (`f6ad84687`) | `local/devices.rs` |
| Accounts, roles, invitations, shares | **Built** (S3 `49e1d91ed`; shares from the seat `ab79feac8`; people managed `27eece626`). **Changes (R1):** invitations and shares to a served subfolder. An account makes no folder on a laptop | `local/invites.rs`, `shares.rs` |
| One access model (0113) | **Works**: `may()` for accounts and phones. The lock on what is not served holds for every non-owner (built); its meaning changes with D2 (R1) | `access.rs:23-31` |
| Tables (0110 phase 1) | **Works** from the seat (S4 `32bacc553`), N per served folder; in a served subfolder **R1** (the code's `[OPEN]` of S4) | `local/seat.rs` |
| Chat, rolls, secret rolls, 3D dice (0107) | **Works**; through the link PASS (secret roll at the protocol) | `collab_dice.rs` |
| Images at the table | **Works**; the table's limit binds, not Cloudflare (none up to 120 MiB) | `table_image.rs` |
| Music and shared audio (0116) | **Works**, the game master alone controls; a short share PASS through the link; a ten-minute share not yet tried (manual check) | `audio_relay.rs` |
| Notifications (0084) | In the window: works. The system's: through the link yes, on the network's own certificate no | `web/plainHttp.ts` |
| The phone offline (0092) | Through the link PASS; a quick link's origin dies with it, the own address keeps it | `web/offline/manager.ts` |
| Trash, history (0080, 0091) | **Works** | `allow.rs` |
| Admin console, quotas (0077) | **Not on this computer** `[DECIDED 2026-11-03]`: Settings is the console | — |
| The web window on a phone (0076) | **Works**; cold load peaks at 52 requests in flight (cap 200), no 429 | — |
| Read links (0105) | **Built** (S12 `dbebb66b5`, a switch, off at first); never into what is not served | `readlinks.rs`, `local/read_links.rs` |
| Sign-in by mail, "forgot the password" | **Out** `[DECIDED 2026-11-03]`; the owner makes a new-password link (`27eece626`) | `local/players.rs` |
| Passkeys, tokens (0074 items 3, 8) | **Built** (S13 `cd5bc9289`); a passkey only through the link; a quick link's passkey dies with it | `passkeys.rs` |
| The owner's own browser or phone through the link (D5) | **No**: pairing is the network's; **R3** after D14 (b) | `local/routes.rs` |
| A UniVerso's own Cloudflare link (D4) | **New**: **R5** | — |

### D10. "My own address": a named Cloudflare Tunnel `[DECIDED 2026-11-03]`

A fixed address is in this feature (*"deveria ser fácil"*), on the person's
Cloudflare account and a domain whose nameservers are at Cloudflare. By
hand: own the domain, add it to Cloudflare, click through the login, type
the hostname. By the app: `cloudflared tunnel login` (`cert.pem` stays in
`~/.cloudflared`, read through `--origincert`, never copied), `tunnel
create --credentials-file <config>/tunnel/<uuid>.json` (`0600`), `tunnel
route dns`, `tunnel run --url http://127.0.0.1:<port>`, `tunnel delete`. No
twelve-hour stop; follows *Keep on at start*. Built (S5b `8453abd86`, S6b
`2efa3056b`, S7b `59ac81d77`; forgetting removes the credentials,
`4c92cd24c`). Tailscale Funnel discarded. The own-address spike has not run
(`8453abd86`): the readers of `cloudflared`'s words are from its source.

### D11. The internet link (from 0111; was D3, items kept) — built

1. What the link serves: what is shared, by D1; nothing by default.
2. Accounts in the local server; a player invited by a single-use link
   (7 days), accepts with an e-mail-shaped identifier, a name, a password
   (nothing mailed); the owner is the local server's admin; a paired phone
   is a device of the owner. Built (S3).
3. With the link on, the one server also listens on `127.0.0.1`, a random
   port, plain HTTP, loopback peers only; with both boxes, both listeners.
   Built (S2 `780e2cadc`).
4. `127.0.0.1` and `::1` are named trusted proxies on that listener only;
   the rightmost `X-Forwarded-For` (unforgeable, spike S0.5) keys every
   limit; `Host` and `Origin` are the link's alone; `Secure` from
   `X-Forwarded-Proto`; handed-out links carry the link's origin. Built.
5. `cloudflared` 2026.10.3, downloaded on first use from GitHub's releases
   only, pinned per system (on macOS the `.tgz`'s and the binary's
   SHA-256), into the app's data directory, never `PATH`; one download at a
   time (`29340f43f`); run by the Tauri host (`app/src-tauri/src/tunnel/`),
   never by `verso-server`. `flate2` + `tar`. Built (S5).
6. Never kept on across starts; a new quick link each run; visible in the
   status mark, the tray (macOS, Windows), Settings with *Copy*, a QR and
   the time left; stops on *Stop*, quit (Job Object on Windows, a watcher
   on Unix), after **12 hours on the wall clock** (`812a26caf`) with
   *Extend*, and when `cloudflared` ends (offline, no restart); *Stop*
   during the first download starts nothing (`e08eafd57`). QUIC, then
   HTTP/2 when no registration in 10 s. Players' pages say "offline" and
   retry (`64eeb999b`).
7. Quick Tunnels are testing-mode: 200 requests in flight, an origin
   answer cut at ~100 s, a WebSocket cut now and then (the window
   reconnects). The box says *testing mode*.
8. Security: 0083's limits on the forwarded address; nothing outside what
   is served; desktop-only commands never served; no link, cookie or
   password in a log; each guardrail seen failing before merge.
9. Both languages, keyboard, screen reader, 390×844 for a player's phone.
10. The lesson *Mesa pela Internet* / *A Table over the Internet* (39).
11. *Rewritten by D4*: synced folders are served; a received share is not.

The link's share of the laptop's 64 connections (`c0ce21237`): the link at
most 32; network and link together at most 56, 8 kept for the owner's
window; 8 WebSockets per account, phone or read link; 16 per address. The
numbers are `[OPEN]` (D14, the build's list).

### D12. The network (from 0096; was D2) — built, unchanged but two items

Off by default, on until quit, *Keep on at start*; private addresses only,
stop when the set changes; one random port, kept; own ECDSA certificate
(398 days) or the host's files, TOFU said in words; pairing by one 256-bit
token, 2 minutes, QR or 8-letter code, *Was it you?*, three attempts; mDNS
only while pairing; sleep resumes on the same addresses; a phone runs an
allowlist, reader or editor, never owner; 64 connections, 16 per address,
4 phones; the audit log; *Revoke*, *Stop serving*, *Forget all devices*,
*Replace this computer's identity*; state in the configuration directory,
`0600`; OpenSSL on Windows; both languages (`crates/verso-server/src/local/`,
`app/src-tauri/src/local_server/`). **Changed:** 0096 item 2 (the folders
ticked in Settings, whole or in part) by D2. **Gone:** 0096 item 11 by D4.

### D13. Decided 2026-11-03 (was D4; *"gosto de todas sugestões"*) — built

- **Q2** Two boxes under one switch; the link may run alone, on loopback.
- **Q3** The owner's window sits at the table as a client of its own server,
  through an in-memory door (no socket), with an owner session minted in
  process; *Sentar à mesa* / *Sit at the table*. Built (S4).
- **Q4** The owner's click in the app is the fresh proof; no owner password.
- **Q5** A player's identifier is an e-mail-shaped string; nothing is sent.
- **Q6** Twelve hours, with *Extend*. **Q7** `flate2` + `tar`.
- **Q8** Invitations on the network too, with the TOFU warning in words.
- **Q9** The spike on the maintainer's OK; run 2026-11-03 by an Opus session
  on VM 107 with his authorisation, not from his Mac (As built).

### D14. Open `[OPEN]` — the maintainer's to answer; a recommendation each

- **(a) Moving a table to the other host once players joined.**
  Recommended: allowed; players are invited again on the new host; the old
  host's chat, rolls and grants are not migrated and stay there until that
  table is turned back into a folder (0110 item 1).
- **(b) How the owner signs in through the link (D5).** Recommended: the
  phone's pairing, offered on the link's sign-in page too — a code typed in
  the browser, approved in the app (*Foi você?*), two minutes, three
  attempts — making a device of the owner, reader or editor as 0096 item 12
  says; no owner password.
- **(c) A UniVerso's link turned on from the admin console (D4.2).**
  Recommended: yes, plus an environment variable and `universo.sh` for a
  server with no browser; a quick link keeps the 12 hours with *Extend*.
  **Contradiction recorded, not resolved:** 0077 item 6
  (`[DECIDED 2026-10-10]`) says no setting of the server is edited in the
  console; a yes here changes it.
- **(d) A readable route by name** (`/mesa/<slug>`). Recommended: not now;
  each table's route is the existing `/?folder=<id>` — the opaque id is
  the "hash" — on the host's link, copied from the table card; sign-in or
  an invitation still required.
- **(e) A game master who is not the admin invites new people (D7).**
  Recommended: an account the admin lets make folders may also invite
  people into tables of its own folders (reader, audited, in the console's
  invitations). This changes 0081 item 4's revision of 2026-10-12.
- **(f) The console shows every folder's name and members to the admin
  (D7).** Recommended: keep it (space and quotas need the list); the
  content stays closed and a self-grant is in the owner's audit; the
  lesson says so in words.
- **(g) A received share synced here is not served (D4.3).** Recommended:
  confirm; said in words on the folder's page.

Left `[OPEN]` by the build, the smallest choice kept in the code: an
invited account never made owner of a laptop folder (`ab79feac8`); an
invitation reads or edits, never owns (`49e1d91ed`); the connection
numbers (`c0ce21237`); read links a switch, off (`dbebb66b5`); passkeys
not on the network even with the host's own certificate files
(`cd5bc9289`); the tunnel named `verso-<hostname>` (`2efa3056b`); with both
boxes on, a change of network stops both (`780e2cadc`); the seat's address
`https://this-computer.invalid` before any address exists (`32bacc553`);
the admin's reset link ending sessions here and not on a UniVerso
(`27eece626`); the `std::fs` exception for `tunnel/files.rs`, ratified by the maintainer on
2026-11-04 ([0029](0029-guardrails-in-ci.md); `8453abd86`).

### D15. What is built on `feat/app-server`: stays, changes, goes

| | What | Where |
|---|---|---|
| Stays | The network (D12 but two items), the link (D11), the own address (D10), accounts and invitations, the seat and the click as proof, shares from the seat, read links, device sync, tokens and passkeys, people managed, the connection shares, the sign-in and offline pages, the tray, the guardrail fixes | S2–S7c, S11–S13 |
| Changes | **"Served in part" for phones → served subfolders for everyone**: a served subfolder can be invited to, shared, made a table and sat at; what is not served stays unreachable to every non-owner (the lock of `access.rs:23-31`, `shares::scope_for`, `readlinks::live`) | `local/parts.rs`, `db/local.rs` (the holder) |
| Changes | **The folder list in Settings moves to the folder's page** (D2); Settings keep a read-only list. *Sit at the table* and *Invite* on the folder's card | `dialogs/servedFolders.ts`, `servedTree.ts`, `servedParts.ts`, `localServerSeat.ts`, `tableCard.ts` |
| Changes | Invitations to "a served whole folder (or none)" → to any served folder, subfolder or table | `local/invites.rs`, `dialogs/localServerInvites.ts` |
| Changes | Pairing only on the network → also through the link, after D14 (b) | `local/routes.rs`, `web/localTable.ts` |
| Changes | Lessons 22, 23 and 39, the changelog's entries, the walkthrough and manual checks say the folder's page and synced folders | `demo-vault*/`, `CHANGELOG.md`, `docs/reference/` |
| Goes | **The refusal of a synced folder** and its words | `local_server/platform.rs:195-199` (on tick), `check_not_synced` at `:296-316` and its callers (`:323`, `:348`, `:508`, `link.rs:55`); the words of `8c9a77376` |

### D16. The build that remains (one commit each, with tests; was D8)

| Step | What | Tier |
|---|---|---|
| R1 | Served subfolders for everyone: served roots instead of phone-only parts; invitations, shares, read links, tables and the seat on a served subfolder; what was ticked carries over. Tests: a player in A never reaches B or the rest (id, share, list, file, link, device); the owner's phones as before | Opus |
| R2 | Synced folders served: the refusal removed; a received share refused (D4.3); the host chosen per table. Tests: a served synced folder; a player's edit synced up; both sides edited → conflict copy, both kept; a received share refused in words | Opus |
| R3 | The owner through the link, after D14 (b). Tests: the code works only once approved in the app; limits by forwarded address; no owner role through it | Opus |
| R4 | The folder's page: serve from this computer, the host for a synced folder, *Sit*, *Invite*, *Copy the table's link*; Settings' read-only list. Both languages, keyboard, 390×844, e2e in Docker | Sonnet |
| R5 | A UniVerso's own link (D4.2): a spike first (finding a quick link's address with no window; a named tunnel on a headless server), then the runtime origin in `verso-server`, `cloudflared` in the `.deb`/`universo.sh`, Docker compose and ZimaOS, on and off after D14 (c). Tests: `Host`/`Origin` follow the runtime origin; a forged header moves no limit | Opus |
| R6 | After D14 (e): a game master invites people into their own tables. Tests: never into another's folder; audited | Opus |
| R7 | Docs: the lessons (22, 23, 39, and the UniVerso's 31 for its link), changelog, walkthrough, manual checks, threat-model rows (a synced folder served, a UniVerso's link); the site's wiki imported again | Sonnet |
| R8 | The guardrails seen failing; the checks on the three systems; the beta installed on the maintainer's OK | Opus |

### D17. 0107 item 9

0107 item 9 says a desktop serving its folder holds the table. Since S4 the
owner's window sits at that table, so the sentence now holds; 0107 is not
edited.

## Consequences

- Serving is a property of a folder, set where its table is, as on a
  UniVerso; Settings hold only the transport. A person runs tables on this
  computer, on their UniVerso, or both, each with a Cloudflare link.
- A folder that syncs can be served here: two hosts write one set of files,
  meeting by the sync's rules, with no live room across them (D8). A table
  is on one host at a time.
- The UniVerso gains `cloudflared` in its packages and a runtime public
  origin (R5): a new outbound reach for [0050](0050-outbound-network-access.md)
  and new rows in the threat model.
- D7's gaps wait for the maintainer (D14 (e), (f)) before any code.
- The laptop faces the internet while a link is on; the mitigations are
  D11's. The residual risk is a bug in the HTTP stack reachable by anyone
  with the link.
- Cost: R1 and R2 M each, R3 S, R4 M, R5 M plus its spike, R6 S, R7 M.
  Phase 3, V1 (roadmap V.20, V.45).

## Discarded alternatives

Only alternatives actually considered:

- **A new ADR superseding this one** ([README](README.md) rule 6): the
  maintainer, 2026-11-04: *"pq fazer outra adr se essa aí tá toda errada?
  vai gerar mais lixo se pensar que ela nem foi concluída ainda."*
- **One host for everything** (all of a person's tables on this computer,
  or all on the UniVerso): discarded by D4 — the host is chosen per table.
- **Refusing a synced folder** (0096 item 11 (b), built): discarded by D4.
- From 2026-11-03: two separate switches; the link only with the network
  on, or always both; bridging the host's table commands into the server
  (Q3 (b)); the game master in the browser as the owner (Q3 (c)); an owner
  password (Q4 (b)); a name-only account (Q5 (b)); the system's `tar` or
  the binary in the installers (Q7); invitations only while the link is on
  (Q8 (b)); Tailscale Funnel (D10).
- From 0111: port forwarding or UPnP; a secret token in the URL instead of
  accounts; downloading "latest".

## Status

**Accepted (2026-11-03)**: the one feature, Q2–Q9, D9's rows and D10 in the
maintainer's words of that day.

**2026-11-04 rewrite.** Rewritten in place, not superseded, by the
maintainer's decision: *"pq fazer outra adr se essa aí tá toda errada? vai
gerar mais lixo se pensar que ela nem foi concluída ainda"* — the feature is
unreleased and the ADR not concluded. This departs from [README](README.md)
rule 6 for this ADR only, recorded here. D1–D8 are decided in his words of
2026-11-04; D14 is open. Written by an Opus session on `feat/app-server`
from `62b901672` and the build's commits; awaits the maintainer's reading;
no Fable reading.

## As built: the spike (2026-11-03)

Run from `~/.cache/verso-kit/tunnel-spike/` (`RESULTS.md`) against a
throwaway UniVerso on VM 107, clients through `*.trycloudflare.com`: the
WebSocket held past 30 minutes idle (cut now and then, close 1006); wait for
"Registered tunnel connection", not the URL line; QUIC blocked by a VPN,
HTTP/2 connected in 7 s; the child outlives a killed parent (hence the
watcher and the Job Object); two forwarded headers a client cannot forge;
no upload bound from Cloudflare up to 120 MiB; cold load 52 in flight, no
429; every D9 row reachable from a browser passed, the two failures being
the same without the tunnel; a passkey is bound to the quick link's name.
Not run: the own address, a ten-minute audio share, a real phone.
