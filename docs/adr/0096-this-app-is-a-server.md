# ADR 0096 — This app is a server: the desktop serving its folder on the local network

- Date: 2026-10-15
- Source: the maintainer's decision of 2026-10-14 that "this app is a
  server" (roadmap V.20) is in V1, in wave C, beside the phone offline
  ([0092](0092-the-phone-offline.md)); [0073](0073-self-hosted-server-first.md)
  item 2 (decided 2026-10-09), which names the feature in one sentence.
  The reading of 2026-10-15 found that the sentence decides the
  shape and none of the security, so the questions below were written
  down before anyone builds. Written by Sonnet 5.5 (not the author
  [0032](0032-author-and-reviewer-roles.md) names for documents; recorded
  here); to be read by another model before it is accepted.
- Related: [0073](0073-self-hosted-server-first.md) (items 2, 6, 8, 12 and
  the Consequences), [0074](0074-accounts-and-access-on-the-server.md)
  (items 4, 8, 9, 11: invitations, the device session, the audit log, the
  contract), [0075](0075-server-packaging-and-storage.md) (item 2: the
  platforms), [0076](0076-the-window-on-every-screen.md) (the window on a
  phone), [0079](0079-sync-a-local-folder-with-a-server.md) and
  [0082](0082-live-co-editing-of-a-synced-folder.md) (a folder that
  syncs), [0083](0083-security-hardening-of-universo.md) (the bounds, the
  proof, the device approval page), [0045](0045-server-and-mcp-security.md)
  (the implicit owner; `Host` and `Origin`), [0050](0050-outbound-network-access.md)
  (inbound and mDNS), [0056](0056-embedded-web-pages.md) (the host fetching
  for a note), [0092](0092-the-phone-offline.md) (a service worker needs a
  secure context), [0055](0055-in-app-updater.md), [0069](0069-windows-port.md),
  [0011](0011-config-outside-tree-index-as-cache.md),
  [0027](0027-runtime-capabilities.md), `docs/reference/threat-model.md`.
- Status in the briefing: not present; on acceptance.

## Context

**What 0073 item 2 decides.** One sentence, and a few more elsewhere. The
desktop app gains "this app is a server": *a toggle in Settings that
starts the same service on the local network, announced by mDNS to the
native apps, paired by a QR code that carries the address*; how the
phone's browser trusts the certificate is item 6's. From the rest of
0073: it is **the same service and the same code** as `verso serve`
(`crates/verso-service` holds the sessions and the dispatch, called by the
Tauri host and by the server alike); moving from the app to a dedicated
server is a change of address, never of protocol; the phone is a browser
first (item 8); TLS everywhere, the local network included (item 6): the
server refuses to serve a login without TLS, except on loopback or behind
a configured proxy, and accepts its own certificate and key
(`VERSO_TLS_CERT_FILE`, `VERSO_TLS_KEY_FILE`); the Tailscale recipe is the
documented path for a phone; ACME built in comes later. [0050](0050-outbound-network-access.md)
(revised 2026-10-09) allows "this app is a server" to take inbound
connections and to use mDNS. 0073 lists one thing about it as `[OPEN]`:
the app updating through [0055](0055-in-app-updater.md) while phones are
connected. Its Consequences say it "runs on macOS and Windows as well".

**What it does not decide, and what the code shows.** Not decided: whether
it is off by default, which interface it listens on, which folders it
serves, who may connect and as which account, what a QR carries and how
long it lives, the certificate (item 6's recipes are for a host that has a
domain or Tailscale, not for a laptop on a home Wi-Fi), the mDNS name and
what it announces, the operating systems' prompts, sleep, a folder that
also syncs with a UniVerso, which commands a paired phone runs, what is
logged and how a pairing is ended. In the code: `verso serve` exists
(`crates/verso-server`, with its own TLS in `tls.rs`, the device flow in
`device.rs`, the bounds in `listen.rs`, `limit.rs`, `pace.rs`, `fair.rs`),
and the desktop app already links `verso-service` and talks to a remote
server as a client (`app/src-tauri/src/remote.rs`, `sync.rs`); the app
**does not listen on any port** today (only tests bind), and no
code or dependency for mDNS or QR codes exists. `verso-server` is built
for Linux and macOS only: `crates/verso-cli/Cargo.toml` and
`crates/verso-server/Cargo.toml` say Windows has no server because
`webauthn-rs` needs OpenSSL there — which contradicts 0073's "macOS and
Windows as well" (item 17 below; per rule zero, a contradiction is
recorded, not resolved).

**The attack surface this opens.** Today the desktop app is a client: no
listening socket, nothing for the network to reach. With this feature the
laptop becomes a server on a network the person does not control — a
café's, a hotel's, a conference's. Everyone on that network can then try:
to reach the port (a scan finds it), to read what is announced by mDNS
(the computer's name, the person's name if the system name carries it,
that Verso is running), to guess or race a pairing, to sit between the
phone and the laptop (a rogue access point, ARP spoofing) while a
password-less pairing happens, to use a paired phone's session after the
phone is lost, to make the laptop do something it should not (read a
folder that was not offered, fetch a URL on the internal network on
behalf of a note — the web-embed proxy of [0056](0056-embedded-web-pages.md)
reaches the network from the host — or reach the desktop-only commands:
open a file in the system, reveal in the Finder, the updater), to exhaust
the laptop (connections, memory — the very bounds of
[0083](0083-security-hardening-of-universo.md), which this reuses), and to
come back later through a name the browser remembered. A VPN-less laptop
also gains the rebinding risk of [0045](0045-server-and-mcp-security.md)
for a page opened on the same machine. On the other side of the ledger,
three things already built carry over unchanged: the session and role
check before `verso-fs` acts, the bounds on connections and headers, the
`Host` and `Origin` checks, the fresh-proof rule and the revocable device
sessions.

## Decision

Accepted (2026-10-15): every item was an `[OPEN]` with its options and a
recommendation, and each is now `[DECIDED 2026-10-15]` **as its
recommendation** (Status). What
the other ADRs already decide and this one only applies is in the
Context. Throughout, **the recommendation is the most secure default that
still lets a phone on the same Wi-Fi read and write its notes.** None of
it changes an Accepted ADR; where one needs a line, the item says so.

1. **`[DECIDED 2026-10-15]` Off by default, and for how long it stays on.**
   - (a) Off by default; turning it on lasts until the app quits, and the
     toggle is off again at the next start.
   - (b) Off by default; the toggle is remembered across starts.
   - (c) On by default. (Not recommended: a first start would listen on
     whatever network the laptop is on.)
   - Recommendation: **(a)**, with "keep on at start" as a second,
     separate, off-by-default switch for the person who wants (b). It
     also stops by itself when the network changes (item 3). While on,
     the window shows it always — a mark in the status bar and in the
     menu bar or tray with the number of phones connected and a "Stop"
     — so that nothing listens without being visible.

2. **`[DECIDED 2026-10-15]` What is served, and which accounts exist.** The desktop has
   an implicit owner and no accounts ([0045](0045-server-and-mcp-security.md),
   [0074](0074-accounts-and-access-on-the-server.md) item 11); the service
   it would start checks a session and a role on every command.
   - (a) Only the folders the person ticks in Settings, none by default;
     one local owner account created by the app, with no password and no
     sign-in page (it signs in only by pairing, item 6); each paired
     phone is a device session of that owner, at a role chosen at
     pairing (item 12). No second person, no invitations, no admin
     console, no sharing between people.
   - (b) The full UniVerso model (e-mail accounts, invitations, roles per
     folder, the admin console): other people on the Wi-Fi get accounts.
   - (c) Every folder the app has open.
   - Recommendation: **(a)**. It is the smallest surface and it is what
     the feature is for ("my phone and my laptop"); (b) is a dedicated
     server's job, which UniVerso already is; (c) offers what the person
     did not choose. It is built by the server's own code with a
     single-account mode, not a second implementation.

3. **`[DECIDED 2026-10-15]` Which interface it listens on, and on which networks.**
   - (a) Every interface (`0.0.0.0`/`::`). Simple, and reachable from the
     internet if the machine has a public address.
   - (b) Only the addresses of interfaces in private ranges (RFC 1918,
     unique local IPv6, link-local), never a public one, never the
     wildcard; the set is recomputed when the network changes, and **when
     the set of addresses changes — another Wi-Fi, the VPN turning on —
     serving stops and asks again**, so a laptop carried from home to a
     café does not silently keep serving there.
   - (c) As (b), plus on Windows only when the network's profile is
     Private (the profile Windows itself asks the person to choose).
   - Recommendation: **(b)**, and **(c)** on Windows if the profile can be
     read without extra permission (to verify). Reading a Wi-Fi's name
     to tell "home" from "café" is not recommended: macOS requires the
     location permission for it. The network-change stop is the cheaper,
     permission-free answer. The check in the handshake that the peer's
     address is in a private range of the same subnet is part of (b).

4. **`[DECIDED 2026-10-15]` The port.**
   - (a) The server's own 7340.
   - (b) A port chosen at random once, on the first time it is turned on,
     kept in the configuration afterwards (so a bookmark, and a paired
     phone's origin, survive a restart).
   - (c) A new random port at every start.
   - Recommendation: **(b)**, from the dynamic range, shown in Settings.
     It keeps the usual scan of 7340 away from the laptop; it is not a
     defence and is not presented as one. (c) breaks every paired phone.

5. **`[DECIDED 2026-10-15]` The certificate, and the address the phone uses.** The
   hardest question. 0073 item 6 forbids a login without TLS and names
   recipes for a host with a domain or Tailscale; a laptop on a Wi-Fi
   has neither a domain nor a public certificate, and a browser on a phone
   can pin nothing from a QR code. The options:
   - (a) **A certificate of the app's own**, self-signed, generated on
     the first time it is turned on (key kept `0600` in the app's
     configuration directory, [0011](0011-config-outside-tree-index-as-cache.md)),
     naming the laptop's private addresses. The QR also carries the
     certificate's fingerprint, which a native Verso client pins. A phone's
     browser shows its warning once; the person accepts it. Costs: the
     browser does not treat the origin as a trustworthy secure context
     (a service worker, so the phone offline of [0092](0092-the-phone-offline.md);
     passkeys; `crypto.subtle` may be refused — to verify per browser), and
     the first connection is trust-on-first-use: **a person in the middle
     at the moment of pairing, offering their own certificate, is
     indistinguishable from the laptop to the browser.** The laptop's
     confirmation on pairing (item 6) bounds it, does not remove it.
   - (b) **A local certificate authority** the app creates, which the
     person installs on the phone (an iOS profile, an Android user
     certificate). A real trust anchor, with high friction, and a
     CA key on a laptop that can then sign for any name the phone trusts
     it for: not recommended.
   - (c) **A name under the project's own domain** whose certificate is
     obtained by the app through a DNS challenge run by a small service
     of the project (the model of Plex or Tailscale's names): a valid
     certificate and a secure context on the phone, nothing installed.
     It needs a service the project runs and pays for, the app reaching the
     network outbound (a change to [0050](0050-outbound-network-access.md)),
     and the name appears in public certificate logs. A decision of its own
     about cost and operation, in the spirit of 0073 item 4(c).
   - (d) **The host's own certificate and key** (`VERSO_TLS_CERT_FILE`),
     or `tailscale serve` in front, exactly as 0073 item 6: the app
     accepts files and, when it finds Tailscale running, says how. The
     secure path for the person who has it.
   - Recommendation: **ship (a) and (d) together in V1**: (d) as the path
     Settings recommends first when it applies, (a) as the zero-setup
     fallback, **labelled in Settings and in the pairing dialog as for a
     network the person trusts**, with the TOFU limit written in the
     words the person reads. The phone offline (V.8) on a laptop served
     with (a) is declared unavailable until (c) exists. Whether to build
     (c) after V1 is a separate question for the maintainer; the roadmap
     does not need it for V.20.
   - The address is a second question inside this one. The phone's
     origin is the laptop's current private address, which changes with
     DHCP, and the session cookie and the `Host` check are bound to that
     origin ([0045](0045-server-and-mcp-security.md), the threat model):
     **a new address means a new origin, and a phone must be paired
     again.** Options: (i) accept it and say so; (ii) a `.local` name
     announced by mDNS (stable, but a phone's browser resolving `.local`
     is unreliable on Android — to verify); (iii) (c)'s name.
     Recommendation: **(i) in V1**, the QR being cheap to show again,
     with (ii) tried and kept only if it resolves on the phones the
     maintainer owns (an Android phone and an iPad).

6. **`[DECIDED 2026-10-15]` Pairing: how a phone gets in.** Reusing what exists: the
   **invitation** of [0074](0074-accounts-and-access-on-the-server.md)
   item 4 (single use, 256 bits, an expiry) and the **approval page** of
   0074 item 8 and [0083](0083-security-hardening-of-universo.md) item 17
   (name, address and time of the request, *Was it you?*, never a code
   taken from a link). Here the trusted side is the laptop, so the
   direction is the invitation's, with the approval page's confirmation:
   1. In Settings, "Pair a phone" opens a dialog and mints one token (256
      bits). The dialog shows the QR code and, below it, the address and a
      short code for typing by hand, and a visible countdown.
   2. The QR carries `https://<address>:<port>/pair#<token>`: the token in
      the **fragment**, which the browser never sends in a request (it does
      not reach a proxy's log or the `Referer`; it does reach the page's
      script, so with option 5(a) an active person in the middle can read
      it — the stated limit).
   3. The phone opens the link; the page posts the token. The server
      answers one **pending pairing** and the laptop shows, in a dialog the
      app raises: the device's name (the browser's, as the phone sent it,
      made safe as in 0083 item 17), the address it came from and the
      time, *Was it you who scanned this?*, **Allow** or **Refuse**, and
      the role (item 12). Only Allow mints the device session; a refusal
      ends the token.
   4. The token is **single use** and lives **2 minutes** while the dialog
      is open; closing the dialog ends it; at most one pending pairing at
      a time; **three** wrong or reused attempts close the pairing window
      and say so on the laptop. Nothing about pairing is reachable when no
      dialog is open: the route answers as any unknown route does.
   5. The session that results is the device session of 0074 item 8, with
      its limits (14 days idle, 90 at most) and revocation.
   - Options for the numbers: the token's life (recommend 2 minutes; 10
     is the device code's in `device.rs`, built for a human typing and an
     away-from-the-keyboard approval, which this is not), the attempts
     (recommend 3; the device flow is slowed by address instead), and
     whether the laptop must also confirm (recommend yes, always — it is
     what turns a leaked QR photo into a request the owner sees).
   - Not recommended: a standing QR or a long-lived pairing link (the
     invitation's seven days are for a person far away; this is a person
     holding the phone), and approval by a code read aloud on the phone
     alone (nothing on the laptop to see).
   - A fresh proof ([0083](0083-security-hardening-of-universo.md) item
     6) for allowing a device: the person at the laptop is the OS user
     who unlocked it; recommend **no password prompt**, the click on the
     raised dialog being the proof. The alternative (the OS's own
     authentication prompt) is possible later and is not recommended
     for V1.

7. **`[DECIDED 2026-10-15]` What the QR carries, and nothing else.** The address and
   port, the one-time token in the fragment, the app's certificate
   fingerprint (for a native client; a browser ignores it), the contract
   version's hash ([0073](0073-self-hosted-server-first.md) item 2). It
   carries **no** folder path, no account, no name of the person, no
   long-lived secret. Recommendation: exactly this; a reviewer's
   guardrail is a test that decodes a QR and asserts the field list.

8. **`[DECIDED 2026-10-15]` mDNS: whether, when and what.** 0073 says "announced by mDNS
   to the native apps". A phone's browser cannot browse mDNS; only
   another Verso desktop ("connect to a server", 0074 item 8) could.
   - (a) Never announce; the QR/typed address is the only way.
   - (b) Announce while serving, with a minimal record.
   - (c) Announce only while the pairing dialog is open.
   - Recommendation: **(c)**, which gives a second desktop its discovery at
     the only moment it is also allowed to pair, and keeps the laptop
     invisible the rest of the time. Service type `_verso-local._tcp`
     (the name is mine; nothing is registered); the instance name
     `Verso-` and four random hexadecimal digits, **never the computer's
     or the person's name**; the TXT record only the protocol version and
     the port. No folder name, no account. A goodbye record is sent on
     stopping, on sleep and on quit. A second desktop that found it pairs
     by the same QR or typed code — discovery lists, it never trusts.
   - [0050](0050-outbound-network-access.md) allows mDNS "only to addresses
     the user wrote in a configuration", which multicast is not: it needs
     a one-line revision (a correction of scope, to be made on acceptance,
     not a change of decision).
   - A library for mDNS and one for the QR are new dependencies; each is
     justified in the pull request that adds it (CLAUDE.md
     §4), not here.

9. **`[DECIDED 2026-10-15]` The operating systems' prompts.** To confirm on the real
   machines (nothing here was run): macOS 15 and later asks for the
   **Local Network** permission the first time an app announces or
   browses on it (the usage description and the `NSBonjourServices` keys
   in the app's `Info.plist`), and its application firewall may ask
   *Allow incoming connections?* for a build that is not signed or
   notarized ([0095](0095-mac-notarization-and-windows-code-signing.md));
   Windows Defender Firewall asks the same on the first bind, with a
   choice of Private and Public networks. Options: (a) let the system's
   prompt appear unexplained; (b) **explain first**, then trigger it: a
   dialog before the first turn-on says what will be asked and why, and
   that *Public networks should stay unchecked*; (c) add the rule
   ourselves (needs administrator rights). Recommendation: **(b)**; never
   (c), and the app asks for no elevation. If the answer is a denial, a
   test connection from the app to its own address on the network fails
   and the toggle says so with the steps to allow it (the visible
   feedback of every action).

10. **`[DECIDED 2026-10-15]` Sleep, lid closed, network lost.** A sleeping laptop serves
    nothing; the process is suspended, the sockets die.
    - (a) Do nothing special: on waking, recompute the addresses; if they
      are the same, resume and re-announce; otherwise stop and ask (item
      3). The phone sees the server unavailable through the
      capabilities ([0027](0027-runtime-capabilities.md)) and, with the
      phone offline of [0092](0092-the-phone-offline.md), keeps working.
    - (b) Hold the laptop awake while serving (a power assertion).
    - Recommendation: **(a)**. Holding a laptop awake in a bag is a
      battery and heat risk and keeps a server alive nobody is looking at.
      A "keep awake while a phone is connected" switch, off by default,
      is left for later.

11. **`[DECIDED 2026-10-15]` A folder the laptop also syncs with a UniVerso.**
    [0079](0079-sync-a-local-folder-with-a-server.md) and
    [0082](0082-live-co-editing-of-a-synced-folder.md) make the local
    file a copy kept by sync, with **one writer in Verso** while a note is
    live: the server's room. A phone writing through the laptop's own
    service would be a second room and a second writer, away from the
    UniVerso's: two people editing the same note, one through the laptop,
    one through the UniVerso, would not meet.
    - (a) Allowed; the phone's edits are local changes that sync uploads
      by the ordinary rules (hash against the base, a conflict copy, the
      append-merge), with no live room across the two.
    - (b) **A folder that syncs with a UniVerso cannot be served by the
      app in V1**; the toggle says "this folder syncs with <server>: open
      that address on the phone instead".
    - (c) The laptop's service proxies the phone to the UniVerso.
    - Recommendation: **(b)** for V1. The phone reaches the UniVerso itself
      when there is one; the feature is for a folder that has none. (a)
      can be offered later with the limit written down.

12. **`[DECIDED 2026-10-15]` Which commands a paired phone may run.** The principle is
    **default deny, by role, the UniVerso's own dispatch and nothing
    more.** The phone's role is chosen on the laptop at pairing.
    - Roles: **reader** (the secret-blocks projection of
      [0087](0087-secret-blocks-hidden-from-readers.md) applies), **editor**.
      Never owner, never admin; no account, token, share or invitation
      commands, no console, no MCP, no `sync_*`, no folder opening or
      creating, no deletion of the folder, no trash emptying.
    - Never reachable by a phone even as editor: the desktop-only
      commands that act on the laptop outside the folder — open or
      reveal in the system, the updater, the settings of the app, the
      pairing dialog's own commands, the web-embed proxy and the
      reachability probe of [0056](0056-embedded-web-pages.md) (a note
      must not make the laptop fetch an address on the internal network
      for the phone), the log, the bug report.
    - Default role: (a) editor; (b) **reader, with "can edit" one tap on
      the laptop's confirmation**. Recommendation: **(b)**: the secure
      default that still works; an editor is one tap away and a lost phone
      then holds only what was given.
    - The list is an allowlist in the code with a test that every command
      of the contract is either on it or refused, so a new command is
      refused until someone adds it ([0074](0074-accounts-and-access-on-the-server.md)
      item 11's refusal, in both languages).

13. **`[DECIDED 2026-10-15]` Limits.** Reuse the bounds of
    [0083](0083-security-hardening-of-universo.md) unchanged — 512
    connections and 128 per address, 64 KiB heads, 30 seconds for headers,
    the 20 requests a second pace, the delays, the WebSocket limits — and
    add: the pairing window's own (item 6); **at most 4 phones** paired at
    once and **2** connected; a lower ceiling on connections on a laptop
    than on a host (recommend 64 in all, 16 per address). Recommendation:
    as written; the numbers are measured in the benchmark with the app's
    own load as 0083 item 18 does, then fixed.

14. **`[DECIDED 2026-10-15]` What is logged, and what the person sees.**
    - The app's log (`verso.log`): serving turned on or off, the addresses
      and the port, the pairing dialog opened and closed, a token redeemed,
      allowed, refused or expired, a device session created or ended, a
      connection refused by the bounds (once a minute, as 0083 item 1),
      the network changing. **Never** a token, the QR's contents, the
      fragment, a password or a note's content; the device's name made safe
      as in 0083.
    - The server's audit log ([0074](0074-accounts-and-access-on-the-server.md)
      item 9), in the app's configuration directory, kept 365 days as
      `VERSO_AUDIT_DAYS`, visible in Settings beside the device list.
    - Recommendation: as written; and a notification (the app's own, not
      the system's) the first time a new device connects after a pairing.

15. **`[DECIDED 2026-10-15]` Revoking a pairing.** Settings › This app is a server lists
    the paired phones — name, role, when paired, last seen, address —
    each with **Revoke** (the session ends and its open connections close
    at once, as 0074 item 8 and the console of
    [0077](0077-the-server-administration-console-and-folder-quotas.md)
    do), **Stop serving** (closes everything and the port), and **Forget
    all devices**. Options for turning it off: (a) paired devices stay
    for the next time; (b) turning off forgets them. Recommendation:
    **(a)** with the idle limit of 14 days; a regenerated certificate key
    (a button, "Replace this computer's identity") ends every pairing at
    once. A lost phone is ended from the laptop; a lost laptop is the
    phones' own problem (their sessions die with the laptop's key).

16. **`[DECIDED 2026-10-15]` Where its state lives.** The local server's database
    (the owner account, device sessions, the audit log) and the
    certificate key, outside the folders and outside the notes' index,
    in the app's configuration directory
    ([0011](0011-config-outside-tree-index-as-cache.md)), `0600`;
    on macOS the key in the Keychain is an option for later. Nothing of
    it is in the folder served, so it never syncs. Recommendation: the
    files, as the device token in `servers.json` is kept today.

17. **`[DECIDED 2026-10-15]` Windows, and the contradiction.** [0073](0073-self-hosted-server-first.md)
    says the feature runs on macOS and Windows; [0075](0075-server-packaging-and-storage.md)
    item 2 and the manifests say `verso-server` is not built for Windows
    (passkeys need OpenSSL there). Not resolved here. Options: (a) V.20
    ships on macOS and Linux and Windows follows; (b) the passkey code is
    a feature the local mode does not compile, and the service builds on
    Windows ([0069](0069-windows-port.md)); (c) V.20 waits for Windows.
    Recommendation: **(b)** if the cost is small (the local mode has no
    passkeys — it has no sign-in page), otherwise (a); a decision of the
    maintainer either way, and 0073's sentence gets a Revisions line.
    **Revised 2026-10-15:** the maintainer decided *"OpenSSL embutido no
    Windows"* — a fourth way, none of (a) to (c): `verso-server` builds on
    Windows whole, OpenSSL compiled in as on Unix
    ([0075](0075-server-packaging-and-storage.md) item 2, revised), and the
    local mode serves on Windows with the same code. 0073's sentence "runs
    on macOS and Windows as well" stands as written.

18. **`[DECIDED 2026-10-15]` The app updating while phones are connected** (the `[OPEN]` of
    0073's Consequences). Recommendation: the updater ([0055](0055-in-app-updater.md))
    behaves as today — the person is asked to restart; the restart ends
    the connections; the phones see the server unavailable, and when it
    returns at a new contract version the page reloads (0073 item 2's
    hash). It says "N phones are connected" in the restart dialog. Nothing
    is held back for a phone.

19. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)).
    The toggle, the pairing dialog (the QR has the typed address and code
    beside it, as text, for a person who cannot scan), the countdown, the
    prompts' explanation and the device list are keyboard-operable and
    announced; pt-BR and English.

## Consequences

- The app gains a listening socket for the first time, with everything
  that follows: Settings gains a section, the window a status mark, the
  threat model a section ("The laptop as a server") and a row in each of
  its tables, the install guide a page for the person who turns it on.
- New code, if accepted as recommended: a single-account mode of
  `verso-server` (item 2); the host starting it in-process; a pairing
  endpoint and its dialog; a self-signed certificate generator (item 5);
  an mDNS announcer and a QR encoder (two dependencies, each justified in
  its pull request); an allowlist and its test (item 12); the Local
  Network keys in the macOS bundle. Nothing in `verso-dialect`, nothing
  in `verso-fs`: the service reaches the folder only through
  `verso-core` and `verso-fs` as `verso serve` does (invariant 5).
- [0050](0050-outbound-network-access.md) gets a one-line correction on
  mDNS (item 8); [0073](0073-self-hosted-server-first.md) gets a
  Revisions line (the Windows sentence, item 17; the updating `[OPEN]`,
  item 18); the roadmap's V.20 row points here.
- Tests: the guardrails are written with the feature and seen to fail
  first (CLAUDE.md §3): a unit test that no address
  outside the private ranges is bound; one that a token lives 2 minutes,
  once; one that three failures close the window; one that the QR carries
  only the fields of item 7; one for the command allowlist; the benchmark
  with the app's load; the harness answers for the new commands; a manual
  check on a real phone and an iPad on a home network and in a network
  with client isolation, where the feature does not work and says so
  (`docs/reference/manual-checks.md`). The changelog and the tutorial get
  their lines.
- What stays true however it is decided: a laptop that serves is a
  laptop that can be reached. The honest limits are written where the
  person reads them — the TOFU of a self-signed certificate (item 5), and
  that a café's Wi-Fi with isolation will not route a phone to the laptop
  at all, which is the safer failure.

## Discarded alternatives

None recorded. (Plain HTTP on the local network was ruled out by
[0073](0073-self-hosted-server-first.md) item 6 before this ADR; the
options listed under each `[OPEN]` are for the maintainer to choose from,
not alternatives already considered and discarded.)

## As built

Built on 2026-10-15 on `feat/local-server-build`, for **macOS and Linux**;
Windows was added the same day (item 17, revised, below).
What the code settled where the items left room (none of it changes a
decision; each is a question for the maintainer if it should be otherwise):

- **Windows** (item 17, revised 2026-10-15): the first build took option
  (a) — `verso-server` was not built for Windows, and compiling the local
  mode without the passkey types was not cheap. The maintainer then
  decided *"OpenSSL embutido no Windows"* (vendored OpenSSL there, as on
  Unix; the build needs Perl, not NASM), so `verso-server` builds on
  Windows and the same local-server code serves there; the Windows stub is
  gone. Item 3's Windows *Private* profile is **not read**: it would need
  either a COM call (`INetworkListManager`; `unsafe` is forbidden in the
  workspace and it would be a new dependency), the registry (it maps a
  profile to an interface only through GUIDs, not a documented interface) or
  a subprocess whose output is localized. What keeps the guarantee on
  Windows is the rest of item 3 — private addresses only, a peer on a
  subnet of the machine, and stopping when the set of addresses changes —
  plus Windows Defender Firewall itself, which asks on the first bind and,
  with the box the window tells the person to leave unticked, lets only
  Private networks in (item 9). The dialog's "firewall refuses" help has
  a Windows paragraph.
- **Which address the pairing shows** (item 3, as built 2026-10-15): the
  first build showed the first private address it listed, which on one Mac
  was ZeroTier's virtual interface. Now the addresses are ranked: the one
  the system would use for its default route first — found by connecting a
  UDP socket to a documentation address (`192.0.2.1`), which asks the
  routing table and sends nothing, with no new dependency —, then
  interfaces that look real, then virtual ones by name (`utun*`, `feth*`,
  `zt*`, `tailscale*`, `wg*`, `tun*`, `tap*`, `docker*`, `br-*`, `vbox*`,
  `vmnet*`, `bridge*`, `veth*`, and Windows adapters named ZeroTier,
  Tailscale, VPN, Hyper-V, VirtualBox, vEthernet). The pairing dialog says
  which address and interface the QR is for ("192.168.3.122 — en7 (local
  network)") and a list lets the person pick another ("10.147.11.197 —
  feth237 (virtual network: ZeroTier?)"); picking opens a new pairing
  window — a new one-time token and code. The certificate needs no change:
  it already names **every** address served, so any pick is valid.
- **A paired phone's role can be changed** (items 6 and 15, as built
  2026-10-15): the first build fixed the role at pairing, so letting a
  reader edit meant forgetting the phone and pairing again. Each row of
  *Paired phones* has a *Can edit* switch (reader or editor, never above).
  The change holds from the phone's next command (the server reads the
  role again for every command), the phone's open windows are told, and an
  editor made a reader leaves the live rooms it wrote in through the same
  path as a member demoted in a share. It is logged (`verso.log`) and in
  *What happened* (`phone_role_editor`, `phone_role_reader`).
- **What the log holds** (item 14, as built 2026-10-15): the server crate's
  log lines also go to the app's `verso.log` (source `local`): serving on
  and off with the addresses and the port, the pairing window opening,
  ending, expiring, a pairing approved or refused, a phone connected,
  disconnected and revoked, a phone's role changed, and a command refused
  to a phone (WARN, at most once a minute). Never a token, a code, the QR's
  text, the fingerprint, a cookie or a note's words; a test looks for each.
- **What a phone's window asks while it loads** (item 12, as built
  2026-10-15): `set_walk_rules`, `set_folder_note_name` and `log_write` are
  answered and do nothing for a phone (they are the folder settings' and
  the log's, set from the computer); refusals carry their own error kinds
  (`not_on_phone`, `phone_reads`) so the window says them in its language.
- **A copyable pairing link** (item 7, as built 2026-10-15): beside the
  QR, *Copy link* copies the same `https://<address>:<port>/pair#…` the QR
  encodes, for the address chosen in the list, and says *Link copied — good
  for 2 minutes, once*. The link carries the **same one-time 2-minute
  token** as the QR; the token and the fingerprint are in the fragment, which
  a browser never sends to any server, so a messenger's link preview cannot
  read it; and the computer's *Was it you?* approval still gates the
  pairing, as for the QR. Anyone who gets the link inside the two minutes
  and opens it first is the one the computer asks about.
- **The server** is the same crate and the same dispatch as `verso serve`
  (`crates/verso-server/src/local`), with a smaller table of routes — no
  sign-in, invitation, account page, console, token, passkey or device
  flow —, 64 connections and 16 per address, and a peer admitted only from
  a private address on a subnet of the machine. A phone is a *browser*
  session of the one local owner, with its role (reader or editor) in a
  table of its own (schema 12); a session without that row opens nothing.
- **The QR** is `https://<address>:<port>/pair#t=<token>&fp=<fingerprint>&c=<contract>`
  (the item gave `#<token>`; the fingerprint and the contract hash need
  names). The typed code is the token's other form, eight letters, with
  the same single use and the same three attempts.
- **Addresses**: RFC 1918, IPv4 link-local and IPv6 unique-local. IPv6
  link-local is not bound: a browser needs a zone id in it (`fe80::1%en0`)
  that no QR gives it. The set is looked at every two seconds and on a
  wake; a different set stops serving.
- **The certificate** is ECDSA, valid 398 days (Apple's limit for a
  certificate not chained to a root they ship), made again over the same
  key when the addresses change or it nears its end; its key lives in the
  local database, `0600`, not in a file of its own. The host's own files
  (item 5 (d)) are read as `VERSO_TLS_CERT_FILE` is, with the name they are
  for.
- **The window's files** come from the app's resources
  (`bundle.resources`: `app/ui/dist` as `ui-web`), which adds the size of
  `dist` to the installed app; trimming it (no sourcemaps) is a build step
  for the maintainer to decide once the release is measured.
- **Folders** are shown to a phone by the name of their directory (made
  unique), never a path; the ticked list is kept in the local database,
  and a change needs serving off. A second index of each served folder is
  kept in the local directory's `indexes/`, apart from the desktop's.
- **Notifications** use the existing *Sharing* kind for a phone's first
  connection and for serving stopped by itself, so that no new row is
  added to *Settings › Notifications*.

## Status

**Accepted (2026-10-15).** Written by Sonnet 5.5 at the request of the
session that holds the roadmap (Proposed the same day). The maintainer,
answering the 18 recommendations with *"vamos seguir as suas
recomendações"* (let us follow your recommendations), decided every
numbered item as its recommendation, each marked `[DECIDED 2026-10-15]`
in place; the lines of the Consequences apply from now (the Revisions
lines of 0050 and 0073 are written with the feature). **Not built:** the
feature stays in V1, wave C, for its own pull request.
The roadmap's V.20 row ([`docs/roadmap.md`](../roadmap.md)) is "decided
2026-10-09; not built" and stays in V1, wave C
(`[DECIDED 2026-10-14]`). To be read by the other model before it is
accepted. Nothing was built or run to write it.
