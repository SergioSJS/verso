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
  2026-11-04, later the same day — **the lean version**, in place: the app
  holds folders as a UniVerso does and who sees what is the UniVerso's
  shares and tables (D1, D2); the host is the window where the table is made
  (D4); synced folders served, a received one not (D4, built); the owner
  pairs through the link (D5); the UniVerso's own link reuses the tunnel
  module (D4, a plan); one function per administrator's act (D18, new);
  D15 and D16 say what is built and what is left.
  2026-11-04, evening — D14's seven questions answered by the maintainer,
  *"confirmo tudo"*: each decided as recommended and moved into the
  decision it belongs to (D4.2, D4.3, D5, D6, D7, D8); D14 keeps only the
  build's smallest choices still open. 0077 item 6 and 0081 item 4 carry a
  dated revision for (c) and (e).
  2026-11-08 — extended to Android by [0118](0118-a-native-android-app-from-the-same-core-and-ui.md)
  item 3: the phone serves too; there `cloudflared` ships in the APK, not
  downloaded (D11 item 5 stays for desktop).
  2026-11-13 — the build's open details answered by the maintainer,
  *"aceito todas suas recomendações tudo na v1"*: R3 (D5), R4 (D2), R5
  (D4.2), R6 (D7 (e)) and the table's move (D8, now R9) decided as the
  session recommended, all in V1; *Sit* dropped from R4 (D13 Q3 had
  removed it); D14 confirmed as built.
  2026-11-13, later — R6 built (`205cdfb8`), D7 (e) says how; two
  `[OPEN]` details of the build there.
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

**The lean version (2026-11-04).** The app holds folders as a UniVerso does:
a served folder is registered as the folder of this computer's owner
account, and who sees what inside it comes only from the UniVerso's own
**shares** ([0081](0081-sharing-between-people-on-one-universo.md)) and
**tables** ([0110](0110-a-table-is-a-campaign-folder.md),
[0113](0113-one-access-model-for-a-table.md)) — no rule of the app's own
decides it. 0096's "served in part" (the hide lock on its id, the parts as
shares of the owner) stays **for the owner's own phones only**; no player
reaches anything by it. *(2026-11-05, R1 built:)* a folder served in part
is registered as the owner's too — the holder account that owned it went —
so the owner's window sits at it and makes tables and shares in any folder
inside it; the hide lock judges phones alone; the owner's grant in a share
of his own folder is a phone's part and is shown to no one as a person.

### D2. Per folder or subfolder, on the folder's page `[DECIDED 2026-11-04]`

*"Deveria ser possível abrir servidor em uma sub-pasta assim como fazemos
com mesa, inclusive, daria para aproveitar a mesma tela."*

- What is served is chosen **on the folder's page**, in the table card
  ([0110](0110-a-table-is-a-campaign-folder.md); `app/ui/src/tableCard.ts`,
  which today shows nothing on a folder of this computer): any folder or
  subfolder, served from this computer, then made a table, given access and
  invited to as on a UniVerso. Sitting at the table (D13 Q3) happens there
  by itself (revised 2026-11-05). A subfolder for a player is what it is on a UniVerso — a share
  of it (*Share…*, or its invitation) or a table rooted in it — not a served
  root of the app's own (D1).
- **Inviting is at the folder's page**, as on a UniVerso: a table's
  *Invite players*, and for a folder with no table *Share…* with an e-mail
  no account has, which offers an invitation link (built, `a9c9b5b60`).
- **Settings keep the transport and the people**: the switch, *On my
  network*, *By an internet link*, *Use my own address*, the list of
  invitations (with *End*) and the people invited (new password, end
  sessions, remove) — no form that invites (built, `a9c9b5b60`) — and a
  **read-only list** of what is served (each entry opens its folder's page;
  not built, R4).
- *(Revised in place 2026-11-05, the maintainer: "por que quando o mestre
  transforma o app num servidor ele não tem o menu de Conta? Só
  jogadores?")* **The game master has an Account** in this app's Settings
  while it serves (or the window sits at its own table): his name for the
  players — moved there from *Transformar em servidor*, its one place —
  the language (the app's own setting, the same control as *Geral*'s), and
  where he comes in as the owner (this window and the paired phones, with
  a way to them in *Transformar em servidor*, where a phone is ended). No
  password or passkey row: the owner has none here (D5, D14 (b)). Built
  with the host's existing commands (`localServerOwnerName`,
  `localServerStatus`), no new route (`dialogs/masterAccount.ts`).
- *(Decided 2026-11-13, the maintainer: "aceito todas suas
  recomendações", `[DECIDED 2026-11-13]`; R4:)*
  1. *Serve from this computer* is offered in **both** places, the table
     card on the folder's page and the folder's menu in the tree, as
     *Tornar esta pasta uma mesa* already is.
  2. With this computer's server off, the click asks *Turn the server on
     and serve this folder?* and does both in one step; never an error
     sending the person to Settings.
  3. *Stop serving* is on the folder's page and on Settings' read-only
     list (every hide has a way back). On a folder with a table that has
     players it confirms first, naming how many lose access until it is
     served again; the table, its chat and rolls are kept.
  4. *Copy the table's link* copies the internet link's route
     (`/?folder=<id>`, D6) when the link is on; otherwise the network
     address, with words saying it works only on this network.
  5. There is no *Sit* (D13 Q3, revised 2026-11-05): the window sits by
     itself.
  6. *(Chosen by the session building R4, 2026-11-13, for the
     maintainer's reading:)* what is served changes **while serving**, at
     once — ADR 0096 item 2 changed it only with serving off, which here
     would stop the server on every *Serve* or *Stop serving*: a quick
     link's address would change and every table's players would be cut.
     A folder unticked **rests** (its registration, table, players, chat
     and rolls kept; reached by no one; served again under the same id),
     its open windows are told it is gone, and a window sitting at it
     comes back to this computer's folder as when serving stops. Found on
     the way and fixed: an untick deleted the folder's registration at
     the next start, the table and chat with it, and a served folder's
     name came from the order of the ticked ones, so unticking one gave
     its name and players to another of the same name (`3f76ee9c`).

### D3. N tables, N served folders, several active `[DECIDED 2026-11-04]`

*"Eu posso ter N mesas dentro de uma pasta … consequentemente, eu posso ter N
pastas servidas. Eu posso ter mais de uma mesa ativa."* A table is (folder,
root inside it) as 0110 "As built (one chat per table)" made it; several
served folders and several tables run at once on one host. A window opens
one folder ([0065](0065-a-folder-per-window.md)), so the game master sits at
each table from its own window.

### D4. The host is the window where the table is made; a synced folder is no reason to refuse `[DECIDED 2026-11-04]`

*"Se eu tenho um servidor sincronizando, não deveria ser motivo para não
poder abrir a minha máquina como servidor para outras pessoas."* *"Eu
deveria ser possível escolher se vou servir a mesa pelo UniVerso … ou pelo
app Desktop, e em ambos os casos ser possível ter links do cloudflare."*

1. The refusal of a synced folder (0096 item 11 (b); the first text's D3
   item 11) **goes** (built, `96123d8f4`: the sync carries what is edited
   here by its rules, the server's writes check what they read, D8). **The
   host is the window where the table is made** (the lean version): a table
   made in a window that sits at this computer's own server is hosted here;
   one made in a window on the UniVerso is the UniVerso's. Nothing else
   chooses it.
2. A Cloudflare link — quick or own address — exists on **both hosts**. On
   this computer it is built (D11, D10). **On a UniVerso it is new scope,
   built in R5 (below)**: the UniVerso **reuses this app's tunnel
   module** (`app/src-tauri/src/tunnel/`: the pinned download and its
   checksums, the quick link, the own address, the stop on exit), moved
   into a crate both hosts use rather than written again; on the server it
   is turned on by an environment variable and by `universo.sh` (the names
   decided 2026-11-13, below), for the `.deb`, Docker compose and ZimaOS alike, the
   public origin then set at runtime (today `VERSO_PUBLIC_URL` is read once
   at start; the spike restarted the server when the quick link's address
   was known). *(Decided 2026-11-04, was D14 (c), `[DECIDED 2026-11-04]`:)*
   the UniVerso's link is turned on and off **from the admin console** as
   well as by the environment variable and `universo.sh` (for a server
   with no browser); a quick link keeps the 12 hours with *Extend*. This
   revises [0077](0077-the-server-administration-console-and-folder-quotas.md)
   item 6 (no setting edited in the console), dated there. Built in R5 (below).
   *(Decided 2026-11-13, `[DECIDED 2026-11-13]`:)* in V1, built **last**
   of R3–R9 (it serves a UniVerso with no domain of its own; this
   computer's table and the first invited people do not need it). The
   environment variables are `VERSO_TUNNEL=off|quick|own` and
   `VERSO_TUNNEL_HOSTNAME`; `universo.sh` offers the same three. An own
   address on a server with no browser uses **a tunnel token** made in
   Cloudflare's dashboard and pasted in the console or given by a variable
   (its name the build's choice), not `cloudflared tunnel login` and its
   account-wide `cert.pem`; R5's spike confirms it before the code.
   *Built 2026-11-14 (R5: `80f32160` the module moved into
   `crates/verso-tunnel`, `b04eaca7` the server, `4bba6553` the console,
   `b58d71e0` `universo.sh` and the packaging; the spike in As built).* The
   server runs the tunnel itself (`verso_server::tunnel`) — on a UniVerso
   it is the host — through the desktop's own door, the link listener of
   `local/link.rs`, its origin and named proxies now
   `local::link::LinkOrigin`, held by this computer's policy and by a
   UniVerso alike; `Server::public_origin()` is `VERSO_PUBLIC_URL` when set,
   else the link's origin while it has one. The own address on a server is
   by a token only (`Mode::Token`: `cloudflared tunnel run` with
   `TUNNEL_TOKEN` in its environment), the token's variable
   `VERSO_TUNNEL_TOKEN` / `VERSO_TUNNEL_TOKEN_FILE`. Smallest choices kept
   in the code, `[OPEN]` for the maintainer (R5): the own address's
   loopback port is fixed, `VERSO_TUNNEL_PORT`, 7341 by default — the
   dashboard's service names it (a quick link's port is the system's, as
   on this computer); a token pasted in the console holds for that run
   only, never written down (the environment keeps one across starts); the
   console's *Turn on* and *Extend* want a fresh proof, *Turn off* only the
   admin; the address is never logged, so a server whose admin has no
   browser reaching its console learns it there only; whether the
   dashboard's Public Hostname service or the `--url` the server passes
   decides where a remotely-managed tunnel's requests go is not verified
   (no account: a manual check).
3. A folder this person did not share as its owner (a share received from
   another account, synced to this computer) is not served from here: by
   [0081](0081-sharing-between-people-on-one-universo.md) item 4
   (`[DECIDED 2026-10-10]`) a receiver does not re-share. Built so
   (`96123d8f4`): a synced folder whose server last said this person is not
   its owner is refused at ticking, start, pairing and the link, in words
   (`received_from`); one whose role was not said yet is served.
   *(Decided 2026-11-04, was D14 (g), `[DECIDED 2026-11-04]`:)* confirmed;
   said in words on the folder's row (built) and, when R4 builds it, on the
   folder's page.

### D5. The owner reaches a table on this computer from his own browser and phone `[DECIDED 2026-11-04]`

*"Se eu quiser abrir num navegador com minha conta para ver como tá ficando
e testar"*; *"se fizer assim a gente mata a feature de abrir no celular
usando o app desktop como servidor"* — it must not. The owner's phones keep
working as built (pairing on the network, D12), and the owner reaches the
host **through the link** too. Today he cannot: pairing answers only on the
network (`64eeb999b`), and this computer's owner account has no password and
opens no browser session that is not a paired phone (`49e1d91ed`). **The
owner pairs through the link** *(decided 2026-11-04, was D14 (b),
`[DECIDED 2026-11-04]`)*: the phone's pairing, offered on the link's sign-in
page too — a code typed in the browser, approved in the app (*Foi você?*),
two minutes, three attempts — making a device of the owner, reader or
editor as 0096 item 12 says; no owner password. **Built** (R3,
`2e7a35cb`; see D16).
*(Decided 2026-11-13, `[DECIDED 2026-11-13]`:)* (1) through the link,
pairing answers **only after the owner pressed *Pair a device*** in the
app, for its two minutes, as on the network; at any other time the link's
pairing route refuses without trying a code. (2) *Foi você?* asks reader
or editor, **editor chosen first**. (3) A device paired through a quick
link ends with that link's address (12 hours, D11 item 6), as a passkey
bound to it does; through an own address it stays. Accepted as is. R3
reaches authentication over the internet: the hostile lab runs again
before it merges (the trigger in `docs/review/2026-11-13-hostile-lab.md`).

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
  slug) does not exist. *(Decided 2026-11-04, was D14 (d),
  `[DECIDED 2026-11-04]`:)* not now; each table's route is the existing
  `/?folder=<id>` — the opaque id is the "hash" — on the host's link,
  copied from the table card; sign-in or an invitation still required.

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
| …nor that the folder exists | **Does not hold**: the console lists every folder's name, owners, members, space and audit ([0077](0077-the-server-administration-console-and-folder-quotas.md) item 3) | `console.rs:81` — kept, below (f) |
| A game master invites players to their table | **Gap**: only the server's admin invites a person who has no account (0081 item 4, revision 2026-10-12); a member gives a place only to an existing account | `campaign_cmds.rs:945-949`, `can_invite` at `:763` — closed, below (e) |

*Decided 2026-11-04 (were D14 (e) and (f), `[DECIDED 2026-11-04]`):*

- **(e)** An account the admin lets make folders may also invite people who
  have no account into tables of its own folders — readers, audited, in the
  console's invitations; never into another's folder. This revises
  [0081](0081-sharing-between-people-on-one-universo.md) item 4's answer of
  2026-10-12 ("only the admin invites"), dated there. Not built (R6).
  *(Decided 2026-11-13, `[DECIDED 2026-11-13]`:)* at most **20 pending
  invitations** per such game master at once; an account made by one of
  their invitations starts without *may create folders*. When the admin
  takes *may create folders* away, that game master's pending invitations
  end and the people who already accepted keep their places. On this
  computer nothing changes: only the owner owns folders here.
  *Built 2026-11-13 (R6, `205cdfb8`):* one rule in `admin::acts::Inviter`
  for both ways a folder's owner invites a person with no account — the
  table's *Invite players* (`campaign_invite`) and the share dialog's
  *Make an invitation link* (`shares::invite`), each already the folder's
  owner's only; a game master's invitation is at reading (another role is
  refused in words), the 21st pending is refused in words, counted and
  made under one lock; `campaign_status`'s `can_invite` is true for them,
  so the window offers both. Taking *may create folders* away ends every
  invitation the account made that is still pending, each
  `invitation_ended` in the audit. The console's invitations gain *Made
  by*. Tests: `tests_gm_invites.rs`.
  *Review of R6, fixed 2026-11-14:* who may invite is the one answer,
  `access::may` with `InviteNew { role }` ([0113](0113-one-access-model-for-a-table.md)):
  the folder's owner who is the admin at any role, or who may make
  folders on a UniVerso, to read (`access::invites_new`; the shared
  vectors carry *may create folders*); the door reads the account's powers
  again for each invitation (`Door::with_powers`), so a window opened
  before a power was taken away invites no one after; the row is written
  only while its maker still holds the power and owns the folder, and has
  fewer than 20 waiting — read under the lock it is written under
  (`db::Still`). What a game master invited into a folder waits no more
  once they stop being its owner (a role lowered, taken out) or their
  account is removed; a folder forgotten ends the invitations into it,
  which would otherwise carry nothing; each in the audit. A share made for
  a refused invitation goes again.
  `[OPEN]` (no code): an invitation into a folder that rests on this
  computer (D2, `Server::rests`) is still shown and, accepted, gives its
  place — reached again when the folder is served. Refusing it at accept
  would end the owner's invitation while the folder only pauses; his to
  say.
  `[OPEN]` (smallest choice kept): a game master has no list of their own
  invitations, so cannot end one; the 21st's words say to wait or ask the
  admin. `[OPEN]` (smallest choice kept): an account that loses both
  *admin* and *may create folders* at once has every pending invitation it
  made ended, those made as the admin too.
- **(f)** The console keeps listing every folder's name and members to the
  admin (space and quotas need the list); the content stays closed, and a
  self-grant is in the owner's audit; the lesson says so in words. Nothing
  to build beyond the lesson (R7).

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

*Decided 2026-11-04 (was D14 (a), `[DECIDED 2026-11-04]`):* a table may move
to the other host once players joined; the players are invited again on
the new host; the old host's chat, rolls and grants are not migrated and
stay there until that table is turned back into a folder (0110 item 1).
Not built. *(Decided 2026-11-13, the maintainer: "tudo na v1",
`[DECIDED 2026-11-13]`:)* in V1, as **R9**.

### D9. What of the UniVerso works here `[DECIDED 2026-11-03: parity is the goal]`

*"Esse modo seria compatível com tudo que temos relacionado ao UniVerso,
certo?"* Parity with a UniVerso; what differs is only what a laptop imposes
(it is on while the table runs, as with Foundry; a quick link lasts a
session). "Through the link" results are the spike's (As built).

| UniVerso feature | Here | Where |
|---|---|---|
| Live co-editing in the browser, presence | **Works**, accounts and phones; through the link PASS (two accounts, named carets, 85–115 ms) | `local/allow.rs`, `presence.rs` |
| Another person's desktop app signs in and syncs (0074 item 8, 0079, 0082) | **Built** (S11, `d3077a49b`); phones run no `sync_*`; listed in Settings with *End* (`f6ad84687`) | `local/devices.rs` |
| Accounts, roles, invitations, shares | **Built** (S3 `49e1d91ed`; shares from the seat `ab79feac8`; people managed `27eece626`); invitations and shares to a served subfolder (R1, 2026-11-05). An account makes no folder on a laptop | `local/invites.rs`, `shares.rs` |
| One access model (0113) | **Works**: `may()` for accounts and phones. The hide lock of a folder served in part holds for the owner's phones alone (R1, 2026-11-05) | `access.rs:23-31` |
| Tables (0110 phase 1) | **Works** from the seat (S4 `32bacc553`), N per served folder, in any subfolder of it, served whole or in part (R1, 2026-11-05) | `local/seat.rs`, `local/parts.rs` |
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
| The owner's own browser or phone through the link (D5) | **Built** (R3 `2e7a35cb`): pairing through the link while *Pair a phone* is open; a quick link's device ends with its address | `local/routes.rs`, `local/link_pair.rs`, `web/pages.ts` |
| A UniVerso's own Cloudflare link (D4) | **Built** (R5, 2026-11-14): a quick link and an own address by a token, from `VERSO_TUNNEL`, `universo.sh link` and the console; through Cloudflare PASS (R5 spike: `Host`, `Origin`, a forged `X-Forwarded-For`, the switch with no restart, the stops) | `crates/verso-tunnel`, `verso-server/src/tunnel.rs`, `console.rs`, `web/consoleLink.ts` |

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
   never by `verso-server`. `flate2` + `tar`. Built (S5). *(2026-11-14, R5:
   the module is `crates/verso-tunnel`, both hosts' (`80f32160`); this
   computer's is still run by the Tauri host, a UniVerso's by the server,
   its only host; same pin, into `VERSO_DATA_DIR/tunnel/`.)*
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
window; 8 WebSockets per account, phone or read link; 48 per address (16
until the re-test of 2026-11-04, when ten players behind one address were
refused). Through any proxy, the window's own files take no place among an
address's requests in flight, and a signed-in player's requests count under
their account (32) and the address's signed-in 128 (`crate::http`). The
numbers stay as built (D14, confirmed 2026-11-13).

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
*2026-11-08 — "phone" here is the window served to a phone's browser; the native Android app of [0118](0118-a-native-android-app-from-the-same-core-and-ui.md) has the desktop app's role: it syncs, and may host.*
*2026-11-12 — *Keep on at start* (0096 item 1), amended for iOS by the maintainer (*"bora"*, to the question of [0119](0119-an-ios-and-ipados-app-through-altstore.md) B12/A2): iOS may end the app while it serves off the screen (a locked device); a start less than ten minutes after it went away, when the person had turned serving on, serves again by itself once the app is on the screen, and says so; later, serving stays off and says why. Elsewhere, and on iOS after a stop by hand, a start serves only with *Keep on at start*.*

### D13. Decided 2026-11-03 (was D4; *"gosto de todas sugestões"*) — built

- **Q2** Two boxes under one switch; the link may run alone, on loopback.
- **Q3** The owner's window sits at the table as a client of its own server,
  through an in-memory door (no socket), with an owner session minted in
  process. Built (S4). *(Revised in place 2026-11-05, the maintainer trying
  the build: "PQ EU PRECISO CLICAR NUM BOTÃO SENTAR À MESA se eu estou com o
  app aberto?! … esse ato de 'sentar numa mesa' deveria acontecer ao ativar
  uma pasta como mesa aberta.")* There is **no** *Sentar à mesa* and no
  *Sair da mesa*: a window whose folder this app serves, while it serves,
  sits **by itself** — (a) when its folder already has a table on this
  computer's server (opened, or served while open; the host says how many
  in `LocalFolder.tables`), and (b) at the owner's first act on it: the
  folder's menu offers *Tornar esta pasta uma mesa* / *Tornar a pasta toda
  uma mesa*, *Compartilhar…* and the read link as on a UniVerso, and the
  click sits first, then does it (`seatFirst`, `localServerSeat.ts`). The
  seat underneath is the same (`localServerSitAtTable`); it leaves by
  itself when serving stops, as built. Chosen by the session building it
  as the smallest trigger: sitting whenever a folder is served was not
  taken, because a seated window is a server's client and a folder's sync
  with a UniVerso runs only while a window shows the folder itself
  (`sync.rs`) — sitting only for a table keeps that as it was.
  *(Revised in place 2026-11-06, the maintainer, asked whether that sync
  may pause while the window sits: "Não deve parar".)* A served folder's
  sync with a UniVerso **does not pause** while a window sits at the table
  this computer serves from it: the seat holds this computer's folder open
  in the app's service (a client that is no window, `seat:<label>`,
  `local_server/seat.rs`) while the folder syncs, so the sync's task goes
  on; what the window and the players write through this computer's
  server lands in the same files and the folder's watcher hands it to the
  sync, and what the UniVerso sends comes in as a change outside Verso
  that this computer's server reconciles (the hides of 0113 hold, D8).
  The hold is let go once the window shows a folder again (the same one
  as it comes back when serving stops, so the sync runs on throughout) or
  closes. No new opening: the app's service keeps the one session it had
  for the folder before the window sat, as while serving with the window
  on the folder itself. The same day, the two ends that left open: the
  hold **follows the sync** turned on or off while the window sits, from
  any window (and a share revoked): held while the folder syncs, opened
  again here if no window had it, let go once it does not
  (`seat::follow`, run as each sync task starts and ends); and the seated
  window **shows the folder's sync** as a window on the folder does — the
  status bar, an error, a pause before deleting and its yes, conflict
  copies, turning it on or off (the sync's commands take the seat's
  folder, `key_of`) — while for its notes, table and access the window's
  folder does not sync: those are the table's server's (`sync_rights` and
  the live notes keep refusing a seated window; the window's
  `verso:sync-state` says off). A hold that cannot open the folder
  again (moved, its drive gone) is the sync's error, problem `held`, said
  in every window of the folder — the seated one too — with the reason in
  its language and **Sync now** to try again; the folder shown in a window
  again tries it at once, and the log keeps the line (2026-11-07, the rule
  that every act gives visible feedback; `sync/hold.rs`). For a served
  folder that also syncs with a UniVerso, a table made in its window while
  this app serves it is this computer's (D4.1: the host is the window the
  table is made in); the table's dialog says where it is hosted.
- **Q4** The owner's click in the app is the fresh proof; no owner password.
- **Q5** A player's identifier is an e-mail-shaped string; nothing is sent.
- **Q6** Twelve hours, with *Extend*. **Q7** `flate2` + `tar`.
- **Q8** Invitations on the network too, with the TOFU warning in words.
- **Q9** The spike on the maintainer's OK; run 2026-11-03 by an Opus session
  on VM 107 with his authorisation, not from his Mac (As built).

### D14. The build's smallest choices `[DECIDED 2026-11-13]`

*Confirmed by the maintainer on 2026-11-13 ("aceito todas suas
recomendações"): each choice below stays as built.* The text as it stood
before:

Its seven questions, (a)–(g), were answered by the maintainer on 2026-11-04
— *"confirmo tudo"*, each as recommended — and are recorded where they
belong: (a) in D8, (b) in D5, (c) in D4.2, (d) in D6, (e) and (f) in D7,
(g) in D4.3. What stays here is open:

Left `[OPEN]` by the build, the smallest choice kept in the code: an
invited account never made owner of a laptop folder (`ab79feac8`); an
invitation reads or edits, never owns (`49e1d91ed`); the connection
numbers (`c0ce21237`); read links a switch, off (`dbebb66b5`); passkeys
not on the network even with the host's own certificate files
(`cd5bc9289`); the tunnel named `verso-<hostname>` (`2efa3056b`); with both
boxes on, a change of network stops both (`780e2cadc`); the seat's address
`https://this-computer.invalid` before any address exists (`32bacc553`);
the `std::fs` exception for `tunnel/files.rs`, ratified by the maintainer on
2026-11-04 ([0029](0029-guardrails-in-ci.md); `8453abd86`) — the same file
moved with R5 to `crates/verso-tunnel/src/files.rs`, touching the same
directory, its guard moved with it in `scripts/check.sh` and `ci.yml`
(`80f32160`): not a new exception.

### D15. What is built on `feat/app-server`: stays, changes, goes

| | What | State | Where |
|---|---|---|---|
| Stays | The network (D12), the link (D11), the own address (D10), accounts, the seat and the click as proof, shares from the seat, read links, device sync, tokens and passkeys, the people invited, the connection shares, the sign-in and offline pages, the tray, the guardrail fixes | Built | S2–S7c, S11–S13 |
| Stays | 0096's parts for the owner's phones (holder, hide lock, parts as the owner's shares) | Built; kept for phones only (D1) | `local/parts.rs`, `db/local.rs` |
| Changed | One function per administrator's act (D18) | **Built** 2026-11-04 | `admin/acts.rs` and its callers |
| Changed | Invitations made at the folder's page; Settings lists them and the people, invites no one (D2) | **Built** (`a9c9b5b60`); the share dialog's invitation mailed by a UniVerso that mails (`3b054132d`) | `shares.rs`, `app/ui/src/shares.ts`, `dialogs/localServerInvites.ts` |
| Changed | The refusal of a synced folder → only a folder received from another account is refused (D4) | **Built** (`96123d8f4`) | `local_server/platform.rs` (`received_from`) |
| Changed | A player accepting an invitation is told to the table's windows | **Built** (`22a2eea9d`) | `campaign_cmds::people_changed` |
| Changed | A served subfolder for players = a share or a table root on the owner's registered folder (D1, D2) — nothing of the app's own | **Built** 2026-11-05 (R1) | `local/parts.rs`, `access.rs`, `shares.rs`, `readlinks.rs`, `local/tests_subfolders.rs` |
| Changed | The folder's page: serve from this computer (card and tree), stop serving with its confirmation, the table's link; what is served changes while serving (D2, 2026-11-13) | **Built** 2026-11-13 (R4; `3f76ee9c`, `a7e392a6` and the UI commit). Settings' list stays tickable, not read-only: the phones' parts tree (D1) lives there and has no other place — `[OPEN]` for the maintainer | `tableCard.ts`, `dialogs/servedFolders.ts` |
| Changed | The owner pairs through the link (D5, decided 2026-11-04 and 2026-11-13) | **Built** (`2e7a35cb`, R3) | `local/routes.rs`, `local/link_pair.rs`, `dialogs/localServerPairLink.ts`, `web/pages.ts` |
| Changed | The UniVerso's link from the admin console (D4.2, decided 2026-11-04; revises 0077 item 6) | **Built** 2026-11-14 (R5, `b04eaca7` routes, `4bba6553` page) | `console.rs`, `app/ui/src/web/consoleLink.ts` |
| Changed | A game master who may make folders invites into their own tables (D7 (e), decided 2026-11-04; revises 0081 item 4) | **Built** 2026-11-13 (R6, `205cdfb8`) | `admin/acts.rs` (`Inviter`), `campaign_cmds.rs`, `shares.rs`, `db/invitations.rs` |
| To build | Moving a table to the other host (D8, decided 2026-11-04; in V1 2026-11-13) | Not built: R9 | — |
| Changed | A UniVerso's own link, reusing the tunnel module (D4.2) | **Built** 2026-11-14 (R5, `80f32160`, `b04eaca7`, `b58d71e0`) | `app/src-tauri/src/tunnel/` → `crates/verso-tunnel`; `verso-server/src/tunnel.rs` |
| To build | Lessons 22, 23 and the UniVerso's 31 for its link; manual checks; the threat model's rows | Partly (29 and 28 say the folder's page, synced folders, received ones) | `demo-vault*/`, `docs/reference/` |

### D16. The build that remains (one commit each, with tests; was D8)

| Step | What | Tier |
|---|---|---|
| R1 | **Built 2026-11-05.** Served subfolders the lean way: the ticked folder registered as the owner's; a player reaches a subfolder by a share or a table root only; 0096's parts kept for phones. Tests (`local/tests_subfolders.rs`): a player in A never reaches B or the rest (id, share, list, file, link, device); the owner's phones as before. Found by the maintainer, 2026-11-05: he ticked *Campanha Fractal* inside his vault and got nothing — the window could not sit at a folder served in part | Opus |
| R2 | ~~Synced folders served; a received share refused~~ — **built** (`96123d8f4`); the host per table follows D4.1 with nothing more to build | — |
| R3 | **Built 2026-11-13** (`2e7a35cb`). The owner pairs through the link (D5): the link's pairing answers only while *Pair a phone* is open; *Was it you?* says the link, an editor first; the dialog shows the link's QR (alone) or switches to it (beside the network); the link's sign-in page offers the code; a quick link's device ends with its address (its session ended when the address ends, the next start for one a crash left), an own address's stays. The three attempts are the window's, not per address, so no forwarded address resets them; the audit keeps the tunnel's address. Tests (`local/tests_link_pair.rs`): refused until opened, works once allowed, refused when the app says no, three wrong codes with forged addresses, a new forwarded address resets nothing, never the owner, a quick link's device ends, an own address's stays. Left for R7: lessons, walkthrough, manual checks, threat-model row; for R8: the hostile lab (D5) | Opus |
| R4 | **Built 2026-11-13.** The folder's page: serve from this computer (the card and the tree's menu; the server turned on in the same step), *Stop serving* with its confirmation, *Copy the table's link*; Settings' read-only list (D2, decided 2026-11-13). Both languages, keyboard, 390×844, e2e in Docker | Sonnet |
| R5 | **Built 2026-11-14** (`80f32160`, `ed9f2457`, `b04eaca7`, `4bba6553`, `b58d71e0`; its spike in As built; `[OPEN]` items in D4.2). A UniVerso's own link (D4.2): the tunnel module moved into a crate both hosts use; a spike first (a quick link's address with no window; a named tunnel on a headless server); the runtime origin in `verso-server`; an environment variable and `universo.sh` for the `.deb`, Docker compose and ZimaOS; on and off from the console as well (D4.2, decided). Tests: `Host`/`Origin` follow the runtime origin; a forged header moves no limit | Opus |
| R6 | **Built 2026-11-13** (`205cdfb8`). D7 (e), decided: a game master who may make folders invites people into their own tables. Tests (`tests_gm_invites.rs`): never into another's folder; audited; at most 20 pending; the power taken away ends the pending ones | Opus |
| R7 | Docs: lessons 22, 23 and the UniVerso's 31 for its link, the walkthrough, manual checks, threat-model rows (a synced folder served, a UniVerso's link); the site's wiki imported again | Sonnet |
| R8 | The guardrails seen failing; the checks on the three systems; the hostile lab run again (R3 and R6 touch access); the beta installed on the maintainer's OK | Opus |
| R9 | A table moved to the other host (D8, in V1 2026-11-13): the players invited again there; the old host's chat, rolls and grants stay where they were. Tests: nothing of the old host's log reaches the new one; the old table keeps its log until made a folder again | Opus |

Order (2026-11-13): R4 → R3 → R6 → R9 → R7 → R8, then R5 with its own
lessons and checks.

### D17. 0107 item 9

0107 item 9 says a desktop serving its folder holds the table. Since S4 the
owner's window sits at that table, so the sentence now holds; 0107 is not
edited.

### D18. One function per administrator's act, for both hosts `[DECIDED 2026-11-04]`

Decided by the maintainer on 2026-11-04, on the audit of what the build
duplicated of the UniVerso:

1. The administrator's acts are **one function each** in `verso-server`'s
   `admin::acts` — an invitation made (`make_invitation`), ended and
   listed; a new password's link (`reset_link`); an account's sessions
   ended; an account removed — and `readlinks::turn` for the read links'
   switch. The console's routes, this app's Settings, the table's
   `campaign_invite`, the share dialog's invitation (`shares::invite`) and
   `verso serve admin reset` on the machine call them; each caller keeps
   who may act (the admin with a fresh proof; the owner's click) and adds
   only its own rules on top (never this computer's own accounts, never the
   owner's role here, serving on, the lock on what is not served). Not the
   console's routes: they stay off this computer (D9). Built: `b86830335`,
   `b96767ef8`, `d667a58c9`, `d26443bde`.
2. **(1.2)** A new password's link ends every session of the account and
   revokes its tokens, on a UniVerso as in the app, as `verso serve admin
   reset` did; an admin resetting their own account keeps the session
   asking. Built (`d667a58c9`; it was `[OPEN]` here, `27eece626`).
3. **(1.3)** Removing an account is refused on both while a folder would be
   left with no owner. Built (`d667a58c9`).
4. The audit names an account by its id on both (its e-mail once removed);
   Settings shows the e-mail. Links handed out by the app (a table's
   invitation, Settings', a reset) open at one address, `Policy::links_base`
   (`2c4e55aa1`). With a mail server, the share dialog's invitation is
   mailed as the console's is; the app has none and never mails
   (`3b054132d`).

Found on the way and fixed (not a decision): an invitation accepted told
no window, so the game master's table kept "no players" ("Jogadores 0")
until the folder was opened again; the folder's windows now hear it
(`22a2eea9d`).

## Consequences

- Serving is a property of a folder, set where its table is, as on a
  UniVerso; Settings hold only the transport. A person runs tables on this
  computer, on their UniVerso, or both, each with a Cloudflare link.
- A folder that syncs can be served here: two hosts write one set of files,
  meeting by the sync's rules, with no live room across them (D8). A table
  is on one host at a time.
- The UniVerso gains `cloudflared` — downloaded at runtime into its data
  directory, pinned and checked, not shipped in its packages — and a
  runtime public origin (R5): a new outbound reach for
  [0050](0050-outbound-network-access.md) (dated there 2026-11-14) and new
  rows in the threat model (*A UniVerso's own Cloudflare link*).
- D7's gaps are decided (2026-11-04): (e) closes the invitation gap (R6,
  built 2026-11-13);
  (f) keeps the console's folder list, said in the lesson.
- The laptop faces the internet while a link is on; the mitigations are
  D11's. The residual risk is a bug in the HTTP stack reachable by anyone
  with the link.
- Who sees what on this computer is decided by the same code and the same
  rules as on a UniVerso; the app adds transport and the owner's phones.
- Cost left: R4 M, R5 M plus its spike, R6 S, R7 M, R9 M (R3 built
  2026-11-13; the session's estimate, 2026-11-13).
  Phase 3, V1 (roadmap V.20, V.45).

## Discarded alternatives

Only alternatives actually considered:

- **A new ADR superseding this one** ([README](README.md) rule 6): the
  maintainer, 2026-11-04: *"pq fazer outra adr se essa aí tá toda errada?
  vai gerar mais lixo se pensar que ela nem foi concluída ainda."*
- **One host for everything** (all of a person's tables on this computer,
  or all on the UniVerso): discarded by D4 — the host is chosen per table.
- **Refusing a synced folder** (0096 item 11 (b), built): discarded by D4;
  only a folder received from another account is refused (0081 item 4).
- **Served roots of the app's own for players** (the first rewrite's R1:
  0096's parts widened to everyone): discarded by the lean version — the
  UniVerso's shares and tables already say who sees a subfolder.
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

**2026-11-04, the lean version.** Rewritten in place again, from the
maintainer's direction of that day as relayed to the session building it
("the app holds folders as a UniVerso does; who sees what = the UniVerso's
shares and tables on the folder page; host = the window you make the table
in; keep phones' parts as built") and his decisions on the audit (D18).
D14 (b) was written as the lean version took it, pending his confirmation.

**2026-11-04, evening.** The maintainer answered D14: *"confirmo tudo"* —
(a)–(g) decided as recommended, (c) despite 0077 item 6 and (e) changing
0081 item 4's revision of 2026-10-12; both carry a dated revision. Recorded
by an Opus session; nothing of (a), (b), (c) or (e) is built. Written by an Opus session;
awaits the maintainer's reading; no Fable reading.

**2026-11-13.** The session laid out each remaining step with its options
and a recommendation (R3, R4, R5, R6, the table's move, D14); the
maintainer: *"aceito todas suas recomendações tudo na v1"*. Recorded in
D2, D4.2, D5, D7 (e), D8 and D14; the move becomes R9, in V1 with R5. Read
by the session as "in V1" also for the move, which it had recommended for
after V1. Recorded by an Opus session; nothing of it is built.

**2026-11-14, R5.** Built on `feat/r5-universo-link` from `58f2749f`
(commits in D16's R5 row) by an Opus session, after its spike (As built);
the decided text of D4.2 kept, *Built* and its `[OPEN]` items added there;
D9, D11 item 5, D14, D15, D16 and Consequences say what was built. 0050
and 0077 item 6 carry their dated revisions; the threat model its rows.
Awaits the maintainer's reading; no Fable reading.

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

## As built: the R5 spike (2026-11-14)

Run from `~/.cache/verso-kit/tunnel-spike/` (`RESULTS-R5.md`) on VM 107,
never on the maintainer's Mac, with the server built from the branch on VM
104; a throwaway UniVerso on `127.0.0.1:7399`, removed after. (1) **A quick
link's address with no window**: `VERSO_TUNNEL=quick` under `nohup`, the
pinned `cloudflared` downloaded and checked in 3 s, the link on in 10 s,
the address read from the console's API and never in the log; through
Cloudflare `/api/state` 200 (`secure`), the server's own listener 421 with
the link's name, the link's listener 421 with a loopback name; three wrong
passwords under three forged `X-Forwarded-For` 401, the fourth 429, the
audit naming the real address only. (2) **The origin switched with no
restart**: off, on with a new name and extended from the console's API, the
server's process the same, the old name 421 and its `Origin` 403 on the new
listener; SIGTERM stops `cloudflared`, `kill -9` of the server leaves it
1 s (the watcher). (3) **The own address by a token** (no account): the
pinned version takes `tunnel run --token` / `--token-file` /
`TUNNEL_TOKEN`; a malformed token is refused at start by the server's own
check; a well-formed token of no tunnel makes `cloudflared` log `Register
tunnel error from server side error="Failed to get tunnel"` and retry for
ever, which the build reads as a refusal (the start fails in 1 s, said in
words). A real token, the dashboard's routing, the image and the package
under their hardening: manual checks (`docs/reference/manual-checks.md`).
