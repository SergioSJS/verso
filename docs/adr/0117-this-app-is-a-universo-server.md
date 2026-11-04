# ADR 0117 — This app is a UniVerso server: one feature, on the network and by an internet link

- Date: 2026-11-03
- Source: the maintainer, 2026-11-03, reading the plan for the online mode
  (`~/.cache/verso-kit/plan-online-mode-2026-11-03.md`, written by Fable
  from [0111](archive/0111-online-mode-a-table-from-this-app-through-a-tunnel.md)
  and the code). He asked first: *"esse modo online seria o mesmo do app
  como servidor, não? aí teria um toggle pra gerar ou não link do
  Cloudflare."* On the analysis: *"pra mim essa tabela deveria ser tudo
  sobre a mesma funcionalidade, transformar o app em um servidor UniVerso,
  concordo, precisa de revisão na 0111 e na 96 também, deveria ser uma
  feature só com essas nuances aí."* On the form of the change (the plan's
  Q1): *"adr nova substituindo, inclusive arquivando adrs que não fazem
  sentido"* (a new ADR superseding; also archiving ADRs that no longer make
  sense). On the plan's Q2 to Q9: *"gosto de todas sugestões"* (all the
  recommendations, as written there). Later the same day, after the plan's
  "limits" were read back to him: *"caralho, eu aceitei mas estou mudando de
  ideia para fazer a aplicação ficar mais consistente. zero problemas no fato
  do computador ter que ficar ligado, é assim com foundry rodando, não muda
  nada, não conheço sessões de rpg que durem mais de 12h, sem falar que a
  pessoa pode configurar um DNS fixo se quiser, e deveria ser fácil"* — the
  one-feature change is his move for consistency; the machine staying on and
  the twelve hours are how it works, as with Foundry; and **a fixed address
  is in the scope of this feature and must be easy** (D10).
- Supersedes: [0096](archive/0096-this-app-is-a-server.md) (built; its rules are
  carried over below and stay built) and
  [0111](archive/0111-online-mode-a-table-from-this-app-through-a-tunnel.md)
  (accepted, never built; its rules are carried over below as the link).
  A reader needs neither: this text is complete.
- Related: [0073](0073-self-hosted-server-first.md) (items 2 and 6),
  [0074](0074-accounts-and-access-on-the-server.md) (accounts, invitations,
  the device session), [0081](0081-sharing-between-people-on-one-universo.md)
  (shares, invitations with a path), [0083](0083-security-hardening-of-universo.md)
  (bounds, trusted proxies, fresh proof), [0045](0045-server-and-mcp-security.md)
  (`Host`, rebinding), [0050](0050-outbound-network-access.md) (outbound
  reaches), [0055](0055-in-app-updater.md), [0005](0005-license.md),
  [0107](0107-the-table-a-shared-roll-and-chat-log.md) and
  [0110](0110-a-table-is-a-campaign-folder.md) (the table),
  [0113](0113-one-access-model-for-a-table.md), [0092](0092-the-phone-offline.md),
  [0097](0097-universo-found-on-the-network-and-a-bad-dns-survived.md),
  [0069](0069-windows-port.md), [0029](0029-guardrails-in-ci.md),
  [0058](0058-demo-vault-as-tutorial.md), [0035](0035-cross-cutting-requirements.md),
  [the cross-platform checklist](../reference/cross-platform-checklist.md),
  `docs/reference/threat-model.md` ("The laptop as a server").
- Status in the briefing: not present.

## Context

**Two ADRs for one thing.** [0096](archive/0096-this-app-is-a-server.md) (built
2026-10-15) made the desktop app a server on the local network: Settings ›
*Transformar em servidor* / *Turn into a server*, the same service and code
as `verso serve` (`crates/verso-server/src/local`), private addresses only,
its own certificate, no accounts but one implicit owner, phones paired by a
QR and a *Was it you?*, an allowlist of commands, a tray mark with *Stop*.
[0111](archive/0111-online-mode-a-table-from-this-app-through-a-tunnel.md)
(accepted 2026-10-23, never built) added a second mode beside it: a
Cloudflare Quick Tunnel giving a `*.trycloudflare.com` link, player accounts
by invitation, loopback-only listening, a separate switch. The maintainer's
goal for the link is Foundry's: a game master turns it on at home and sends
players a link; they sign in and play at the Table ([0107](0107-the-table-a-shared-roll-and-chat-log.md),
[0110](0110-a-table-is-a-campaign-folder.md)) as on a UniVerso.

**Why one feature.** The maintainer's reason is consistency (*"estou
mudando de ideia para fazer a aplicação ficar mais consistente"*): one
section, one server, one set of lists; a person who serves their phone on
the Wi-Fi and a game master who sends a link are doing the same thing.

**What the review of 2026-11-03 found in the code** (state of `main` at
5653f5b13):

- The desktop's own window has **no table on a folder of this computer,
  served or not**: every `table_*` and `campaign_*` command of the host
  refuses (`app/src-tauri/src/table.rs:14-27`, `campaign.rs:17-19`) and the
  window keeps its local roll list (`app/ui/src/table/join.ts`). Paired
  phones do get the server's table (`crates/verso-server/src/local/allow.rs:81-99`).
  A game master could not make a table, invite, or sit at it from the app.
  0111 did not see this.
- The local server has no path for a second person: the owner is a
  passwordless, non-admin account "This computer"
  (`crates/verso-server/src/db/local.rs:56-61`); a browser session without
  a phone row opens nothing (`auth.rs:384-390`); every bearer token is
  refused (`auth.rs:343-345`); the route table has no sign-in, invitation,
  accept or join (`local/routes.rs:32-54`); a campaign invitation needs an
  admin with a fresh proof (`campaign_cmds.rs:936-951`).
- Nothing listens on loopback and no proxy is believed: the LAN admit
  refuses loopback (`local/net.rs:191-197`), `Config::for_local` trusts no
  proxy (`config.rs:320`), every listener speaks TLS (`local/mod.rs:896-899`),
  `public_url` is `None` and immutable (`config.rs:314`; `lib.rs:163-168`
  hands a bare path as a link). `CF-Connecting-IP` is read nowhere; only
  `X-Forwarded-For` (`proxy.rs:11-16`).
- The "served in part" lock hides a part's folder id from **phones** only
  (`access.rs:28`); with accounts it must hold for every non-owner, or a
  note of a folder not shared is one id away (a visibility leak is
  BLOCKING).
- No `cloudflared` code exists. The host has `reqwest` and `sha2`
  (`app/src-tauri/Cargo.toml:74-76`, used by `update.rs:387-635`) and no
  gzip/tar crate; the macOS release asset is a `.tgz`.

**The attack surface**, both halves: a laptop on a network it does not
control (a café's, a hotel's), and, with the link, a hostname on the open
internet reaching that laptop — anyone with the link can try to sign in,
flood, or attack the HTTP stack. What answers it is what UniVerso already
has ([0083](0083-security-hardening-of-universo.md): limits, pace, bounds,
headers, audit, password list, fuzzed inputs) **provided every limit sees
the player's address and not `127.0.0.1`**, plus the switch, the ceiling, a
new link each run, and the confinement of what is served.

## Decision

### D1. One feature `[DECIDED 2026-11-03]`

*Transformar em servidor* / *Turn into a server* is the one feature, in the
maintainer's words above. Its section in Settings keeps its switch and its
list of served folders, and gains **two boxes under the switch** (Q2,
decided 2026-11-03): **Na minha rede** / **On my network** (what 0096
built) and **Por um link na internet (Cloudflare, modo de teste)** / **By an
internet link (Cloudflare, testing mode)**. At least one is ticked to start;
the link alone listens on loopback only and survives a change of Wi-Fi. One
server, one status mark, one list of served folders, one list of paired
phones, one list of invitations. "Online mode" as a name is retired.

### D2. Carried over from 0096, unchanged and built

Every item of 0096 holds as decided and as built, under the one feature.
The table names each with where it lives; the "As built" of 0096 (ranked
addresses, *Can edit* per phone, the log's content, the copyable pairing
link, the folder list as the switcher's, the section's name, the tray on
macOS and Windows and not Linux) is accepted as built (`[DECIDED 2026-10-21]`)
and stays.

| Rule (0096 item) | Decided | Built in |
|---|---|---|
| Off by default; on until quit; *Keep on at start* a separate switch (1) | 2026-10-15 | `local/mod.rs` (`LocalSettings.keep_on`), `app/src-tauri/src/local_server/platform.rs:468-492` |
| Only the ticked folders, whole or in part; nothing by default; the attachments folder read by name; unticking the last part unticks the folder (2, amended 2026-10-16 and 2026-10-21) | 2026-10-15/16/21 | `local/parts.rs`, `db/local.rs` (vault holder), `access.rs:28` (hide lock) |
| Private addresses only (RFC 1918, IPv4 link-local, IPv6 unique-local; not IPv6 link-local); stop when the set changes; peer on a subnet of the machine (3) | 2026-10-15 | `local/net.rs` (`rank`, `admits`), the watcher in `local/mod.rs` |
| One random port, kept (4) | 2026-10-15 | `local/bind.rs` |
| Own ECDSA certificate, 398 days, key in the local database; the host's own files when given; TOFU said in words; address change = new origin (5; (c) left for after V1, 2026-10-21) | 2026-10-15/21 | `local/cert.rs`, `tls.rs` |
| Pairing: one token, 256 bits, 2 minutes, once, QR or 8-letter code, *Was it you?* on the laptop, three attempts close it, the click is the proof (6) | 2026-10-15 | `local/pairing.rs`, `local/routes.rs:76-130` |
| The QR carries address, port, token, fingerprint and contract hash in the fragment; nothing else (7) | 2026-10-15 | `local/qr.rs` |
| mDNS `_verso-local._tcp` only while the pairing dialog is open; `Verso-xxxx`; TXT `v` and `port` (8) | 2026-10-15 | `local/announce.rs` |
| The system's prompts explained first; no elevation; self-test of reachability (9) | 2026-10-15 | `local/bind.rs:17` (`reachable`), the dialog |
| Sleep: resume if the addresses are the same, else stop and ask (10) | 2026-10-15 | the watcher |
| A folder that syncs with a UniVerso is never served (11) | 2026-10-15 | `platform.rs:272-292` |
| A phone runs an allowlist, reader or editor, never owner; desktop-only commands refused; a test fails on a command with no verdict (12; owner's phone deletes, amended 2026-11-01 with 0113) | 2026-10-15, 2026-11-01 | `local/allow.rs`, `local/tests_parts.rs` |
| 64 connections, 16 per address; 4 phones paired; *Devices connected at once* 1–16, default 4 (13, amended 2026-10-16) | 2026-10-15/16 | `listen.rs:129-139`, `local/mod.rs` (`CONNECTED*`) |
| What is logged and never logged; the audit log in the configuration directory; a notification on a phone's first connection (14) | 2026-10-15 | `local/mod.rs`, `audit.rs` |
| *Revoke*, *Stop serving*, *Forget all devices*, *Replace this computer's identity* (15) | 2026-10-15 | `local/mod.rs:1313-1416` |
| State in the app's configuration directory, `0600`, never in a folder (16) | 2026-10-15 | `platform.rs:12-37` (`config.join("local-server")`) |
| Windows serves with OpenSSL compiled in (17, revised 2026-10-15) | 2026-10-15 | `crates/verso-server/Cargo.toml` |
| The updater restarts as today; "N phones are connected" in the dialog (18) | 2026-10-15 | `update.rs` |
| Keyboard, screen reader, pt-BR and EN (19) | 2026-10-15 | `app/ui/src/dialogs/localServer.ts`, `localServerStrings.ts` |

### D3. The internet link `[DECIDED 2026-10-23, read inside one feature]`

Carried over from 0111 with the changes of 2026-11-03. The maintainer's
three points of 2026-10-23 stand: build it now on Cloudflare Quick Tunnels,
the link changing at each run accepted and preferred (*"zero problemas o
link mudar ... fica mais seguro"*); on only when the person wants; an
official mode later (D6).

1. **What the link serves.** What the person shares, by the UniVerso's own
   rules ([0074](0074-accounts-and-access-on-the-server.md),
   [0081](0081-sharing-between-people-on-one-universo.md),
   [0110](0110-a-table-is-a-campaign-folder.md)): a folder shared with an
   account, or made a table and joined by invitation, is reachable by that
   account at its role; nothing by default; sharing everything is the
   person's choice. A folder served *in part* is never reachable by an
   account (the hide lock of 0096 item 2 widened to every non-owner).
2. **Accounts and how a player gets in** (changed: no longer only with the
   link, see D4 Q8). Accounts in the local server's database; a player is
   invited by a single-use link (7 days, [0074](0074-accounts-and-access-on-the-server.md)
   item 4), accepts with an e-mail-shaped identifier, a name and a password
   (nothing is mailed; "any e-mail you own", Q5), and signs in under
   [0083](0083-security-hardening-of-universo.md)'s limits. An account of
   another table on this server joins the link signed in. The owner is this
   local server's **admin**; a paired phone stays a device of the owner.
3. **Where it listens** (replaces 0111 item 3). With the link box ticked
   the one server also listens on `127.0.0.1`, a random port, **plain
   HTTP**, admitting loopback alone; `cloudflared` is told that address.
   The network listener keeps D2's rules; the two run at once when both
   boxes are ticked (Q2).
4. **TLS, the proxy and the origin.** Cloudflare ends HTTPS; the loopback
   hop is HTTP, which [0073](0073-self-hosted-server-first.md) item 6 allows.
   `127.0.0.1` and `::1` are the local server's **named** trusted proxies
   ([0083](0083-security-hardening-of-universo.md) item 5), so the forwarded
   address keys every delay, pace and count and a forwarded loopback is not
   "this machine" (0083 item 7). The link's hostname is added to the
   policy's `Host` list at runtime and removed the moment the link is off;
   `Origin` follows it; the cookie is `Secure` from `X-Forwarded-Proto`;
   invitation and share links are built from the link's origin. Which
   header a client cannot forge (`CF-Connecting-IP` or the
   `X-Forwarded-For` walk) is the spike's answer (D5); a spoofed value must
   move no limit.
5. **The `cloudflared` binary.** Downloaded on first use, a **pinned**
   version with its SHA-256 written in Verso's source, from
   `github.com/cloudflare/cloudflared/releases`, into the app's data
   directory, never "latest", never `PATH` by default (a path given in
   Settings is the only alternative). Owner of the code: the Tauri host
   (`app/src-tauri/src/tunnel/`), which already downloads and checks the
   update; `verso-server` and `verso-service` spawn nothing. The macOS asset
   is a `.tgz`: extracted in Rust with `flate2` and `tar` (Q7; both
   allowlisted licences, justified in the pull request). Apache-2.0: a
   notice on the Credits page. The version moves with Verso's releases.
   Signing, Gatekeeper, SmartScreen and the binary's size are tried on the
   real systems in the build and written in "As built".
6. **Lifecycle and visibility.** The link is **never kept on** across
   starts (*Keep on at start* keeps the network serving only); a new link
   at each run, said so; while on, always visible: the status mark, the
   tray entry (macOS, Windows) with *Stop*, the link with *Copy* and a QR
   and a countdown in Settings. It stops on *Stop*, on quit (the child is
   killed; a Job Object on Windows; on Unix the host kills it and the
   stderr reader exits it if the app's pid is gone), after **12 hours**
   with *Extend* re-arming it for 12 more on the same link (Q6; the
   maintainer: *"não conheço sessões de rpg que durem mais de 12h"* — a
   session's length, not a limit), and when `cloudflared` exits by itself —
   then "offline", no silent restart. The machine stays on while the table
   runs, as it does with Foundry (*"zero problemas no fato do computador ter
   que ficar ligado, é assim com foundry rodando"*). Players' pages say the table is offline, in their
   language, and offer to retry.
7. **The limits of Quick Tunnels**, from Cloudflare's page: testing and
   development only, no uptime guarantee, a new hostname each run, 200
   in-flight requests with `429` beyond, no SSE (Verso's rooms, sync and
   table are WebSockets). The box is labelled *testing mode*; the measured
   numbers (cold load, upload bound, WebSocket life) go in "As built".
8. **Security review for the build**: everything [0083](0083-security-hardening-of-universo.md)
   lists; the laptop's other folders never reachable; desktop-only commands
   not served; the logs hold no link, cookie or password; a test for each
   guardrail seen failing before merge ([0029](0029-guardrails-in-ci.md)).
9. **Accessibility, languages, phones**: the served window is the existing
   web window; the section, its messages and the offline page in pt-BR and
   EN, keyboard-reachable, the link, the QR and the state readable by a
   screen reader; a player on a phone at 390×844 reaches every panel and
   every hide has a way back ([0035](0035-cross-cutting-requirements.md)).
10. **The tutorial** ([0058](0058-demo-vault-as-tutorial.md)): a lesson
    *Mesa pela Internet* / *A Table over the Internet* in both vaults with
    the real steps, followed in the app before the pull request.
11. **Coexistence with the sync**: D2's rule (0096 item 11) for both boxes;
    the link never serves a folder made a table on someone else's UniVerso.

### D4. Decided on 2026-11-03 (*"gosto de todas sugestões"*)

- **Q2 `[DECIDED 2026-11-03]`** Two boxes under one switch (D1): the link
  may be on with the network box off, on loopback only.
- **Q3 `[DECIDED 2026-11-03]` The game master at the table.** The owner's
  window on a served folder joins the table **as a client of its own
  server**: the host mints, in process and with no route, a device session
  for the local owner (its token kept in memory, marked as the owner's
  window; `auth.rs:343`'s refusal of bearer tokens lets that one through),
  and the window opens the folder through the existing "connect to a
  server" path (`app/src-tauri/src/remote.rs`) against the loopback
  listener — or, with only the network box ticked, the LAN address with the
  own certificate pinned by fingerprint — offered as *Sentar à mesa* / *Sit
  at the table* on a served folder. The window then has the table, the
  campaign commands and the invitation exactly as the desktop connected to
  a UniVerso does; closing the table returns to the local window. Nothing
  in `verso-server`'s table or campaign code changes.
- **Q4 `[DECIDED 2026-11-03]`** The owner's fresh proof
  ([0083](0083-security-hardening-of-universo.md) item 6, needed to invite
  and to change a table) is the click in the app, as 0096 item 6 decided for
  pairing: the host stamps `proved_at` on the owner's token when the owner
  acts from the window. No owner password.
- **Q5 `[DECIDED 2026-11-03]`** A player's identifier is the e-mail-shaped
  string the accept form already asks (`api.rs:329-335`); nothing is sent;
  the tutorial says so. No new account kind.
- **Q6 `[DECIDED 2026-11-03]`** The ceiling is 12 hours, with *Extend*.
- **Q7 `[DECIDED 2026-11-03]`** `flate2` + `tar` for the macOS `.tgz`.
- **Q8 `[DECIDED 2026-11-03]`** Invitations exist on the network too: a
  friend on the same Wi-Fi is invited with `https://<address>:<port>/invite/<token>`
  (own certificate, the TOFU warning in words). Accounts are part of the one
  feature whether the link is on or not.
- **Q9 `[DECIDED 2026-11-03]`** The spike (D5) is run by the maintainer
  from his Mac with the plan's `spike.sh`; a session runs nothing that opens
  a tunnel or a browser on his Mac without his OK.

### D9. What of the UniVerso works here `[DECIDED 2026-11-03: parity is the goal]`

The maintainer, 2026-11-03: *"esse modo seria compatível com tudo que temos
relacionado ao UniVerso, certo? edição conjunta, permissões, chat comum,
rolagens, música, etc"*. The goal is **parity with a UniVerso**: the same
server code serves, so what differs is only what the laptop's posture
imposes. Verified against the code on 2026-11-03; the rows marked *spike*
are measured in D5 and tried in the manual checks (S8). The four rows
that said "not in this mode" were put to the maintainer on 2026-11-03 and
answered *"Sim para todas"*: another desktop app connecting and syncing,
read links, passkeys and tokens are **in** the feature; the console and
sign-in by mail are **out**.

How it works, in every row and not counted against parity: the game
master's machine is on and awake while the table runs, as with Foundry (a
sleeping laptop serves nothing, D2 item 10), and a quick link lasts a
session — twelve hours, extendable — and changes at the next run (an own
address, D10, does not). What differs from a UniVerso and may cost a
feature: Cloudflare's 200 in-flight requests and the upload bound of a Quick
Tunnel (D3 item 7, measured in D5), and the origin — on the network a
self-signed certificate, which is no secure context in the browser; through
Cloudflare a real HTTPS one.

| UniVerso feature | Here | Where it is decided by the code |
|---|---|---|
| Live co-editing of a note in the browser (0073 item 7, 0082's rooms; presence: cursors and names) | **Works as on a UniVerso** for accounts (the UniVerso dispatch) and for phones (`collab_join`, `collab_awareness`, `collab_present` for any phone; `collab_update`, `collab_save` for an editor). Through the tunnel: *spike* (WebSocket) | `local/allow.rs:79-80, 101-102, 133-134`; `presence.rs:5-12` |
| Live co-editing of a **synced desktop folder** (0082 proper) and **sync of a local folder** (0079) from another person's desktop app | **In this feature, needs S11** `[DECIDED 2026-11-03]`: the desktop's "connect to a server" device sign-in (0074 item 8), whose routes the local table lacks today, is added for accounts; `sync_*` stays refused to phones. Until S11 a player uses the browser; the owner's window joins by Q3 | `local/routes.rs:32-54`; `allow.rs:281-286`; `app/src-tauri/src/remote.rs:1-10`; `device.rs` |
| Accounts, roles, invitations (0074), shares (0081) | **Needs S3** (accounts, invitations, `who()`); then as on a UniVerso, the owner sharing from their window (Q3). **Limit:** an account creates no folder on the laptop — the owner's folders only (`folders_dir` is a dead path) | `config.rs:315`; `allow.rs:233-236` (phones never share) |
| One access model, per-path access, hides (0113) | **Works**: `may()` judges every answer for accounts and phones alike. **Needs S3** for the hide of a folder served in part, today phone-only (G8) | `access.rs:28`; `table_sound.rs:335` (one `may()` call among many) |
| Campaign folder: tables, released notes, players' rights (0110 phase 1) | **Works** once the owner's window is at the table (Q3); phones never make or change a table. The dashboard, sessions and notices (0110 phase 2) are not built on a UniVerso either (roadmap V.43) | `allow.rs:261-269`; `app/src-tauri/src/campaign.rs:17-19` |
| Chat, rolls, secret rolls, 3D dice (0107) | **Works as on a UniVerso**: `table_join`, `table_say`, `table_roll`, `table_history`, `table_pin`, `table_delete` for any phone; secret rolls are the server's; the 3D fall is the window's. Through the tunnel: *spike* | `allow.rs:84-91`; `collab_dice.rs:29-49` |
| Images at the table (0107 item 3) | **Works with a limit**: `table_send_image`, `table_attach` for an editor phone and for accounts by right; the upload bound through the tunnel is *spike* | `allow.rs:139-140` |
| Music and shared audio (0116) | **Works with a limit**: the game master alone controls (`may(Play)`; `table_play`, `audio_share_*` refused to phones); listening (`table_share_listen`) for everyone; the relay is **binary WebSocket messages, no UDP**, so it crosses the tunnel if WebSockets do — a ten-minute share is *spike*; the share starts from the game master's connection, which with Q3 is the owner's window as a client of its own server | `audio_relay.rs:5-8`; `table_sound.rs:12-16, 335`; `allow.rs:99, 244-260` |
| Notifications in the window (0084) | In-window: **works**. The system's notifications need a secure context: **not on the network's certificate**, **yes through Cloudflare** (0073 item 6 (d)) | `app/ui/src/web/plainHttp.ts:6-12` |
| The phone offline (0092) | **Works with a limit**: the service worker needs a secure context — not on the network's certificate (D2 item 5), yes through Cloudflare, but the cached origin dies with the link at the next run | `app/ui/src/web/offline/manager.ts:480` |
| Trash (0080) and version history (0091) | **Works**: `trash_list/restore/delete`, `history_*` for an editor; the daily expiry runs; `trash_empty` and the days are the owner's | `allow.rs:141-147, 278-280`; `local/mod.rs:909-911` |
| Admin console and quotas (0077) | **Not in this feature** `[DECIDED 2026-11-03]`: the owner administers from the app — Settings › *Turn into a server* is the console (phones, accounts, invitations, audit); no quota on a laptop | `local/routes.rs:5-11`; `config.rs:322` |
| The web window on a phone (0076) | **Works**; the cold load against 200 in-flight requests is *spike* | `local/routes.rs:33-36, 53` |
| Read links without an account (0105) | **In this feature, needs S12** `[DECIDED 2026-11-03]`: the refusal in local mode is lifted for the owner; a link's page is served on the network and through the link | `readlinks.rs:148, 414, 529` |
| Sign-in by mail and "forgot the password" | **Not in this feature** `[DECIDED 2026-11-03]`: no mail server on a laptop; a player's password is reset by the owner, as 0074 item 5's admin does | `api.rs:759`; `mail.rs:5-10` |
| Passkeys and tokens for programs (0074 items 3 and 8) | **In this feature, needs S13** `[DECIDED 2026-11-03]`: the passkey and token routes join the local table for accounts; a passkey needs a secure context, so it is registered through the link or the own address, not on the network's certificate; a `verso_pat_` token of an account is accepted (the refusal of every bearer in local mode is narrowed to phones) | `auth.rs:343-345`; `passkeys.rs`; `api.rs:624-690` |

### D10. "My own address" `[DECIDED 2026-11-03]`: a named Cloudflare Tunnel, and what the person does by hand

Read on 2026-11-03 from Cloudflare's "Create a locally-managed tunnel" page
and the `cloudflared` source (`cmd/cloudflared/tunnel/{login,subcommands,cmd}.go`,
`config/configuration.go`), and Tailscale's Funnel page. Nothing was run.

- **(a) A named Cloudflare Tunnel on the person's own account and domain.**
  Facts: it needs a Cloudflare account and **a domain whose nameservers are
  at Cloudflare** (free plan; the Zero Trust dashboard is not needed; every
  step is `cloudflared`'s). The steps and who does them:
  1. The person owns a domain and adds it to Cloudflare (by hand, once; the
     app links to Cloudflare's "Add a website" page and says what to do).
  2. `cloudflared tunnel login` — the app runs it; it opens
     `https://dash.cloudflare.com/argotunnel` in the browser, the person
     signs in and picks the domain; `cloudflared` writes `cert.pem` into its
     own directory (`~/.cloudflared` on every system; the login command has
     no flag to put it elsewhere and does not overwrite one that exists).
     That file is the person's Cloudflare credential, as the CLI leaves it;
     the app reads it through `--origincert`/`TUNNEL_ORIGIN_CERT` and never
     copies it.
  3. `cloudflared tunnel create <name> --credentials-file <app data dir>/tunnel/<uuid>.json`
     — the app runs it; the tunnel's own credentials stay in the app's data
     directory, `0600`.
  4. `cloudflared tunnel route dns <name> <hostname>` — the app runs it with
     the hostname the person typed (`mesa.example.com`): a CNAME to
     `<uuid>.cfargotunnel.com`.
  5. `cloudflared tunnel run --no-autoupdate --url http://127.0.0.1:<port> --credentials-file … <name>`
     — the app runs it at each start of the box (`--url` is a flag of
     `tunnel run`, `configureProxyFlags`); the same binary, the same
     loopback listener, the same proxy and `Host` rules as the quick link,
     the hostname being the person's. `cloudflared tunnel delete` when the
     person forgets the address.
  By hand: own a domain, add it to Cloudflare, click through the login,
  type the hostname. By the app: everything else. The same pinned binary;
  no new dependency.
- **(b) Tailscale Funnel.** Facts: Tailscale installed and signed in on the
  laptop (on macOS the open-source variant, not the App Store app),
  MagicDNS and HTTPS certificates on, the Funnel attribute approved in the
  tailnet's policy (the CLI opens a page for it; owner or admin rights),
  `tailscale funnel <port>`; the address is `<machine>.<tailnet>.ts.net`;
  ports 443, 8443 and 10000 only; "currently in beta"; "non-configurable
  bandwidth limits"; WebSocket support not stated; certificates may take
  minutes and are rate-limited by Let's Encrypt. The app can detect
  `tailscale` (it already does, D2 item 5 (d)) and run the command; the
  person installs Tailscale and approves the policy.
- **(c) The UniVerso on a host**: exists ([0073](0073-self-hosted-server-first.md)); outside this feature.
- **Decided 2026-11-03: (a)** (*"Sim para todas"*); (b) is discarded, see
  below. (a) uses the binary and
  the code the quick link already has; the person's own domain is the
  address they wanted; the steps by hand are the ones no program can do for
  them. A test checks that the app never reads or writes outside
  `~/.cloudflared/cert.pem` and its own data directory.
- **The twelve hours** `[DECIDED 2026-11-03]`: the own address has no
  twelve-hour stop and follows *Keep on at start* (it is the person's
  account and domain; a stable link is meant to stay up, as Foundry does);
  the quick link keeps 12 hours and is never kept on.
- **Build** (in D8): S5b the named tunnel in the manager (login,
  create, route dns, run, delete; the hostname and the tunnel's uuid in
  `LocalSettings`); S6b `local_server_link_mode` (`quick` | `own`) and
  `local_server_own_address`; S7b *Use my own address* under the link box,
  with the hostname field, the three by-hand steps written where the person
  reads them, and the state of the DNS record; S8b the lesson's section.
- **Spike** (in D5): from the maintainer's Mac, the login from a
  spawned process lands `cert.pem` where expected and the browser flow
  completes; create, route dns and run with `--credentials-file` in a
  chosen directory; how long until the hostname resolves; the WebSocket and
  the table through the named tunnel as through the quick one; `tunnel
  delete` leaves the DNS record or not (then the app removes it, or says
  so).

### D5. The first build step is the spike (from 0111 item 12)

A script, no product code (`~/.cache/verso-kit/tunnel-spike/`), whose
results are written in "As built" before any code: the checksum and
Gatekeeper on the downloaded binary; the exact stderr line that carries the
URL; from a phone on mobile data, sign-in, a note, the table, a roll, an
image, co-editing one note from two phones with cursors seen, a secret
roll, a ten-minute shared-audio stream and a music track, and a WebSocket
held idle for 30 minutes (the rows of D9 marked *spike*); from a second
desktop app, the device sign-in through the link and a shared folder
synced and co-edited; a passkey registered and used through the link;
which forwarded header a client cannot forge; the first upload size that fails; `429` on a cold load
of the window; whether the child outlives a killed parent. **If the
WebSocket fails through a Quick Tunnel, nothing is built on it** and D6 is
brought forward.

### D6. The fixed address is part of this feature `[DECIDED 2026-11-03]`

0111 item 13 left a stable address to "a later official mode" and a future
ADR, with three candidates listed on 2026-10-23 (*"perfeita a lista para
modo oficial"*): (a) a named Cloudflare Tunnel on the person's own account
and domain; (b) Tailscale Funnel; (c) the UniVerso on a host
([0073](0073-self-hosted-server-first.md)). On 2026-11-03 the maintainer
pulled it into this feature: *"a pessoa pode configurar um DNS fixo se
quiser, e deveria ser fácil"*. So the link box has two forms — a **quick
link** (random, new each run; the default) and **my own address** (stable,
the person's) — and which mechanism serves the second is D10. This changes
0111 item 13 and D3 as written on 2026-10-23: (c) stays what it is, the
UniVerso itself, outside this feature.

### D7. A contradiction recorded, not resolved

[0107](0107-the-table-a-shared-roll-and-chat-log.md) item 9 (accepted as
built 2026-10-28) says that *on a desktop serving its folder the desktop is
the server and holds the table*. The desktop's window has no table on any
folder of this computer (`app/src-tauri/src/table.rs:14-27`); only the
phones' half of the sentence is true today. Q3 makes it true from the
owner's side when built; 0107's sentence is left as written until then.

### D8. The build, in order (one commit each; from the plan)

S1 these documents; S2 the loopback listener, the named loopback proxy, the
runtime `Host`/origin; S3 accounts in the local server (owner admin, the
routes, `who()`, the hide lock for accounts, the invitations list); S4 the
owner's session and *Sit at the table*; S5 the `cloudflared` manager
(fetch, verify, run, parse, stop, Job Object, ceiling); S6 contract types
and commands (`local_server_link_on/off`, `local_server_invite`,
`local_server_invitations`, `local_server_invitation_revoke`,
`local_server_sit_at_table`; `build.rs` and `capabilities/default.json`;
bindings regenerated; harness); S7 the UI, the web sign-in beside pairing,
the offline page, the tray words; S8 changelog, the lesson, the walkthrough,
manual checks per OS with one line per row of D9; S5b, S6b, S7b and S8b the own address (D10); S11 the device sign-in routes and page in the local table for accounts, so a desktop app connects and syncs a shared folder (0074 item 8, 0079, 0082; phones still refused `sync_*`; tests: a device token of an account opens its share, a phone's cannot, the owner's in-process token of S4 is not listed as a device); S12 read links in the local server (`readlinks.rs` refusals lifted for the owner; the hide lock of G8 judged for a link's reader; test: a link never opens a part's folder); S13 passkeys and tokens for accounts (routes added; the bearer refusal narrowed to phones; passkeys only on a secure origin, said in words on the network); S9 the guardrails seen failing; S10 the closing checks
on the three systems and the beta installed on the maintainer's OK.

## Consequences

- One section, one switch, two boxes. A game master runs a table from the
  laptop and sends a link; no host, no domain, no Cloudflare account. The
  link changes each run.
- The local server gains accounts, an admin owner, invitations and a
  loopback HTTP listener; the owner's window can be a client of its own
  server. The phones' allowlist, pairing and the LAN rules are untouched.
- The app downloads and runs a third-party binary: a line in
  [0050](0050-outbound-network-access.md) (one pinned host for the download;
  the tunnel's outbound connection to Cloudflare while the box is ticked),
  a notice on the Credits page, two new dependencies justified in the pull
  request.
- The laptop faces the internet while the link is on; the mitigations are
  the box, loopback-only listening, the ceiling, the new link per run,
  what is shared and nothing else, and 0083's limits keyed on the forwarded
  address. The residual risk is a bug in the HTTP stack reachable by anyone
  with the link.
- The feature depends on a free testing service with no guarantee; when it
  changes, the link stops working until D6 exists.
- Guardrails, each seen failing first: the pinned URL host and 64-hex sums;
  no secret in the logs; `Host` of the link refused when the link is off; a
  forged `X-Forwarded-For` moving no limit; a part's id refused to an
  account; the allowlist table for every new command; the fuzz targets
  still compiling; the host test that every new command is permitted.
- Documents: the roadmap rows V.20 and V.45 point here; the threat model
  gains rows under "The laptop as a server"; the walkthrough and the manual
  checks their lines; 0096 and 0111 carry a pointer to this ADR and are
  not edited further.
- Cost: S for the process and the link, M for the loopback listener and
  the proxy handling, M for accounts in the local server, M for the owner's
  session and *Sit at the table*, plus the spike. Phase 3, V1.

## Discarded alternatives

Only alternatives actually considered:

- **Two separate switches** (0111 item 3 as accepted): discarded by the
  maintainer on 2026-11-03 — one feature.
- **Amending 0096 and 0111 in place** (the plan's Q1 (a)): discarded by the
  maintainer — a superseding ADR, as `docs/adr/README.md` rule 6 asks.
- **The link only with the network serving on**, or **always both** (Q2 (a),
  (c)): discarded for the GM on a hotel Wi-Fi who wants nothing listening
  on that network.
- **Bridging the host's table commands into the in-process server** (Q3 (b)):
  new code into `verso-server`'s internals and two windows on one folder.
  **The GM in the browser at the local address** (Q3 (c)): a browser
  session is a phone of the owner, reader or editor, never owner.
- **An owner password for the fresh proof** (Q4 (b)).
- **A name-only account kind** (Q5 (b)).
- **The system's `tar`** or **bundling the binary in the installers** (Q7
  (b), (c); the latter is 0111 item 5 (b), about 35 MB per platform).
- **Invitations only while the link is on** (Q8 (b)).
- **Tailscale Funnel for the own address** (D10 (b)): it needs Tailscale
  installed and signed in (the open-source client on macOS), a policy
  approval with admin rights, three fixed ports, is in beta with
  non-configurable bandwidth limits and does not state WebSocket support;
  the named Cloudflare Tunnel uses the binary and code the quick link
  already has. Discarded 2026-11-03.
- From 0111: port forwarding or UPnP (fails behind carrier-grade NAT); a
  secret token in the URL instead of accounts (leaks through screenshots,
  history, previews); downloading "latest" (an unpinned binary with no
  check).
- From 0096: none recorded (plain HTTP on the local network was ruled out
  by 0073 item 6 before it).

## Status

**Accepted (2026-11-03)** for the decided content: D1 and Q1 in the
maintainer's words; Q2 to Q9 as the plan recommended (*"gosto de todas
sugestões"*); D2 as 0096 decided and built; D3 as 0111 decided on
2026-10-23, read inside one feature; D6 (the fixed address inside this
feature) in the maintainer's words of the same day; D10 and the four rows
of D9 decided the same evening (*"Sim para todas"*). Written by Fable 5.1 on 2026-11-03
from the plan and the maintainer's answers, on `docs/app-server`; **the text
awaits the maintainer's reading**, and the other model's reading goes with
the build pull request ([0032](0032-author-and-reviewer-roles.md)). The
network half is built (0096's "As built", `feat/local-server-build`,
`3a721c11`); the link, the accounts and the owner's seat at the table are
not built; the first step is the spike (D5). How the superseded ADRs are
archived is a question put to the maintainer; until it is answered, 0096
and 0111 stay in place with their pointer lines.
