# ADR 0097 — UniVerso found on the home network, and a bad DNS survived

- Date: 2026-10-16
- Source: the maintainer, 2026-10-16, after installing UniVerso on his
  ZimaOS took a long chase. The desktop app could not reach
  `https://universo.casa.meioorc.com`: the Mac's system resolver returned
  a wrong address (`10.0.0.1`), from the router's IPv6 DNS, while the
  ZimaOS DNS — third in the list — had the right one and the browser, with
  its own DNS client, worked. His words: *"Era pra simplesmente plugar e
  funcionar como qualquer outro sincronizador … LiveSync do Obsidian. É só
  instalar e o negócio já funciona."* Asked whether to do (2) discovery on
  the local network and (3) a DNS that survives, he answered *"Gosto de
  todos"*. Written by Sonnet 5.5 (not the author
  [0032](0032-author-and-reviewer-roles.md) names for documents; recorded
  here); to be read by another model before the details are confirmed.
- Related: [0073](0073-self-hosted-server-first.md) (items 2, 6: the
  server, plain HTTP), [0074](0074-accounts-and-access-on-the-server.md)
  item 8 (the desktop connects to a server; the device approval),
  [0083](0083-security-hardening-of-universo.md) (the device approval
  page), [0096](0096-this-app-is-a-server.md) item 8 (the other mDNS
  announcement, `_verso-local._tcp`, while the pairing dialog is open),
  [0050](0050-outbound-network-access.md) (inbound and mDNS),
  [0029](0029-guardrails-in-ci.md) (the `std::fs` confinement, an exception
  declared here), [0069](0069-windows-port.md), `docs/reference/threat-model.md`.
- Status in the briefing: not present.
- Revisions: 2026-10-21 — the maintainer marked the options of the decisions
  questionnaire of 2026-10-20 (answered 2026-10-21), all as recommended:
  items 2, 3, 5, 7a, 9 and 10 and the limits of the discovery (item 4) are
  decided as built (0097.2, 0097.3, 0097.4, 0097.5, 0097.7a-i, 0097.7a-ii,
  0097.9, 0097.10). Item 8 (the text of the "unreachable" error) was not
  answered then and stayed `[PROPOSED]`; the maintainer answered it later the
  same day (0097.8, option A), and it is `[DECIDED 2026-10-21]`.

## Context

**What happened.** Putting a UniVerso on a home server needed an address
typed by hand, and the desktop app then said, in its log, *"WARN host
unreachable: the server at https://… operation timed out"* and, in the
window, *"Não foi possível alcançar o servidor … fora do ar ou sem rede"*.
The server was up. The name resolved, in the app, to the wrong address,
because the app asked the one resolver the operating system chose first;
a browser asks the other servers of the list when an answer does not
connect. Nothing in the message said a name had resolved to `10.0.0.1`.

**What exists.** The server announces nothing on the network
([0096](0096-this-app-is-a-server.md) item 8 announces the *laptop* serving
a phone, only while a pairing dialog is open). The desktop's HTTP client
for servers (`app/src-tauri/src/remote.rs`) and its WebSocket
(`tokio-tungstenite`) resolved names with the system's resolver alone. The
unreachable error carried the server's address and nothing else
(`reach.rs`).

**Constraints.** The announcement is **unauthenticated**: anyone on the
network can make one, so nothing may be trusted or sent because of it.
Docker's default bridge network does not carry multicast to the home
network. `std::fs` is confined in the desktop crate
([0029](0029-guardrails-in-ci.md)). `mdns-sd` (MIT OR Apache-2.0) is
already in the tree since [0096](0096-this-app-is-a-server.md).

## Decision

1. **`[DECIDED 2026-10-16]` The desktop app finds UniVerso servers on the
   home network by itself.** *"Gosto de todos"* (the maintainer, on doing
   (2) and (3)). The server announces itself by mDNS/DNS-SD (Bonjour); the
   desktop app lists what it finds while *Settings › Servers* is open; one
   click goes on to the sign-in as typing the address would. Typing an
   address stays possible.

2. **`[DECIDED 2026-10-21]` What is announced** (0097.2, option A: keep as
   built, TXT only `v`/`https`/`id`, `url` only with `VERSO_PUBLIC_URL`). Service type `_verso._tcp` (the
   name is this project's; nothing is registered). The instance name is
   `UniVerso-` and six random hexadecimal digits, new at each start —
   **never the computer's, a folder's or an account's name**. The SRV
   record carries the port. The TXT record has three keys and no more:
   `v` (the server's version), `https` (`0` or `1`, whether the port
   speaks TLS) and `id` (the same six digits). Addresses are the machine's
   own, followed as they change. The other service,
   `_verso-local._tcp` ([0096](0096-this-app-is-a-server.md) item 8), is
   not merged with this one: it is the laptop's, short-lived and for
   pairing. A fourth key, `url`, is added **only when `VERSO_PUBLIC_URL` is
   set**: that address (`scheme://host[:port]`, at most 200 characters) is
   the only one the server answers (it refuses other `Host` names), so it is
   what a client must use, and `https` then says whether *it* is https.
   With the server's own TLS (`VERSO_TLS_CERT_FILE`) and no public address
   there is no address to offer — a certificate is for a name, not for an
   IP — so the window lists the server and says to set `VERSO_PUBLIC_URL`.
   Behind a proxy with no public address the announcement is the IP and
   `https=0`, which the server accepts.

3. **`[DECIDED 2026-10-21]` When it is announced, and the off switch**
   (0097.3, option A). On by
   default when the server listens beyond loopback (`0.0.0.0`, a LAN
   address); never when it listens on loopback only. `VERSO_ANNOUNCE=off`
   (also `0`, `false`, `no`) turns it off. It is announced **only on the
   private (RFC 1918) and unique-local interfaces** of the machine — or on
   the listen address itself when one is given, if that is private —
   never on a public or link-local one, as the pairing announcement of
   [0096](0096-this-app-is-a-server.md) is. A failure to announce is logged
   at WARN and never stops the server: it works without being found. A
   goodbye record is sent when the server stops.

4. **Threat analysis of the announcement.** `[DECIDED 2026-10-21]`
   (0097.4, option A: keep the limits — 40 characters, 50 announcements, a
   browse only with Settings › Servers open, nothing connecting without a
   click).
   - *Spoofing.* Anyone on the network can announce a `_verso._tcp`
     service with any address. The worst it can do is **offer a wrong
     address** in the list. So: the app never connects, signs in or sends
     anything because of an announcement; it fills the address only after
     the person clicks, and **shows the address** it will use (and that it
     is `http` or `https`) in the row before the click. What follows the
     click is the sign-in as if typed: the app asks that address to start
     a device approval — and sends it **the device's name** (the person's,
     or the system's), nothing else — and the browser opens the address'
     approval page, where the person types a password into a page they can
     see the address of, as with an address typed. A wrong server learns a
     device name and gets no credential, because the app sends none.
   - *Flooding.* What arrives from the network is bounded: names and
     versions are cut to 40 printable characters, an announcement without
     a port or a usable address (loopback, unspecified, multicast,
     link-local) is dropped, and a browse keeps 50 announcements at most.
   - *Disclosure.* Announcing says that a Verso server is at an address on
     the network, its version and whether it speaks TLS. That is what the
     off switch is for; no name, folder or account is in it.
   - *Browsing.* The desktop browses only while the servers section is on
     the screen; it stops when the section closes (or another section is
     chosen), so the app asks the network nothing the rest of the time.
     Only the desktop host browses: a window in a browser cannot, and the
     section is not shown there.

5. **`[DECIDED 2026-10-21]` The list** (0097.5, option A: keep as described,
   with the three commands of the contract). *Encontrados nesta rede / Found on this
   network*: each row has the instance name, the address
   (the public address the server announced, else `http://ip[:port]`, an IPv4 private address first), *HTTPS* or *sem
   HTTPS* / *no HTTPS*, and a *Conectar / Connect* button. A line under
   the list says that any device on the network can announce itself and to
   check the address. With none found it says what to do (the server must
   be on the same network; in Docker, host networking) and that the
   address can be typed. Three commands cross the contract
   (`discover_servers_start`, `_list`, `_stop`), not available to a paired
   phone.

6. **Docker and ZimaOS.** A container on Docker's default bridge network
   cannot send multicast to the home network, so the announcement does not
   leave it. `network_mode: host` in the compose file makes it work, at
   the price of the container sharing the machine's network (the port
   mapping `7340:7340` is then not used; the server listens on 7340 of the
   machine). **The compose file is not changed by this ADR** — see the
   Status: whether to ship it with host networking is the maintainer's. The
   guides say that discovery needs it and that, without it, the address is
   typed as before.

7. **`[DECIDED 2026-10-16]` The desktop survives a bad DNS the way a
   browser does, and says which address failed.** *"Gosto de todos"* (the
   maintainer, on doing (3)). When a connection to a server fails because
   the name resolved to an address that does not answer, the app tries the
   other addresses the system's DNS servers give, as a browser does; it
   never changes the name the certificate is checked for and never falls
   back from `https` to `http`; and the error names the addresses tried.

7a. **`[DECIDED 2026-10-21]` How, in detail** (0097.7a-i, option A: the
    times and the http/https rule as built — a name suspected for 10
    minutes, an answer kept 5 minutes, 15 seconds when nothing came, 1.2 s
    per server, up to 6; for `http` only an on-link address, for `https`
    any; and 0097.7a-ii, option A: the hand-written DNS client, no
    `hickory-resolver`):
    - the name is resolved by the system, as always, and **nothing else is
      asked while connections work**;
    - when a connection **fails**, the name is suspect for ten minutes and
      is asked of **each global DNS server of the system, one by one** (a
      UDP query to port 53, A and AAAA, 1.2 seconds each, in parallel; six
      servers at most), answers kept five minutes — fifteen seconds when
      none came, so a network that was down is asked again soon; the
      addresses that differ are tried **after** the system's. The scoped and
      supplemental resolvers of macOS (`scutil --dns`: those with a
      `domain`, `Supplemental`, `Scoped`, and the part "for scoped
      queries") are not asked. Elsewhere the global list is not separable
      from the per-link ones and that is **not claimed**: on Linux
      `/etc/resolv.conf` is read, and only when it names nothing but this
      machine (systemd-resolved's stub) the `/run/systemd/resolve/resolv.conf`
      beside it, which lists **every link's** servers, a VPN's included; on
      Windows the physical adapters that are up (`Get-NetAdapter -Physical`),
      so a VPN's or a virtual switch's are not asked. What protects against a
      wrong answer from any of them is the policy below, not the list;
    - **what the other servers say is believed only as far as the scheme
      allows.** When the system said the name does not exist, nothing they
      say is used for an `http` server — a token would go in the clear to
      whatever an ISP's resolver invents — and for an `http` server they are
      accepted otherwise only when **on-link**: inside the subnet of one of this
      machine's own interfaces — a home's LAN. A wide prefix says nothing about
      where a host is, so an IPv4 interface shorter than /16 (a VPN's or a
      TAP adapter's /8 or /10) and an IPv6 one shorter than /32 count for
      nothing; carrier-grade NAT's 100.64.0.0/10 is other customers of the
      ISP and never ours; loopback is never believed from another resolver.
      Tailscale is not covered (its interface is a /32 on macOS and Linux); For an `https` server any address
      will do, because the certificate is checked for the name;
    - an address that **failed** — a refused or timed-out connection, a
      handshake that does not complete — goes to the end of the order for ten
      minutes; an address that **worked** — the handshake done and, for
      HTTP, a successful answer, not a TCP accept — goes first for ten
      minutes, **but only among the addresses the current resolution
      returned**: an address remembered at home is not tried on a café's
      network, and a bearer token never goes to an address no current
      resolver gave for the name;
    - the WebSocket makes the TCP connection and the TLS and WebSocket
      handshakes **per address** (the dial as a whole has a 25-second
      ceiling), and a request that fails to connect is sent once more — only
      when that can end differently: after a failure of the TCP connection
      itself every address offered has been tried, so only an address that
      was not in the answer before is worth it (a dual-stack name whose
      server is down does not take twice as long to fail); after a failed
      handshake only the first was tried, so the retry is worth it when the
      new resolution puts another address first. A 401 ends the dial only
      when it is the server's: over `wss://` any (the certificate was
      checked), over `ws://` only with the header every refusal of the
      server carries (`x-verso-sync`, the sync protocol's) — a router's
      basic-auth page answers 401 too, and so can a NAS's JSON API, and the
      body is not trusted because it may arrive after the headers. The policy is keyed
      by the name, which is all a resolver is given: a name that was ever
      used over plain `http` is treated as `http` (the strict case);
    - **the name is never replaced**: the connection goes to the IP, the
      URL keeps the name, so the certificate is verified for it, and the
      `Host` header is the name's; **never `https` to `http`**: nothing here
      touches the scheme;
    - not for `localhost` or `.local` names;
    - the system's list: macOS `scutil --dns`; Linux `/etc/resolv.conf` and
      systemd-resolved's own `/run/systemd/resolve/resolv.conf`; Windows
      the system's own PowerShell by absolute path, the **physical** adapters
      that are up (`-Physical`: a Hyper-V external vSwitch's `vEthernet`, an
      RNDIS tethering and a VM's virtio NIC may then list nothing, and the
      fallback finds nothing — it fails safe),
      without the three placeholder `fec0:0:0:ffff::1`–`3`. A scoped
      link-local server (`fe80::1%en0`) is left out;
    - the DNS client is written here (about 150 lines: one query, one
      answer whose question, owner names and CNAMEs are checked, every length
      checked, every loop bounded, a random query id), not `hickory`; see
      the Discarded alternatives.

8. **`[DECIDED 2026-10-21]` The error names what was tried** (0097.8, option
   A, as built). An unreachable error's
   message is the server's address and, when the name was resolved, each
   IP tried on a line after it. The log says it once a minute:
   `unreachable: the server at https://universo.casa.meioorc.com: … [universo.casa.meioorc.com → 10.0.0.1 (system), 192.168.0.5 (dns 192.168.0.2): no answer]`.
   The window says: *"Não foi possível alcançar o servidor
   universo.casa.meioorc.com — ele está fora do ar ou sem rede.
   universo.casa.meioorc.com → 10.0.0.1: sem resposta. Confira o DNS desta
   rede: o nome pode estar apontando para o endereço errado."* (and in
   English), so a DNS problem reads as one; the hint about the DNS is said
   only when more than one address was tried. "No answer" is said for
   every address, whether it timed out or refused: the log has the real
   cause.

9. **`[DECIDED 2026-10-21]` The platforms** (0097.9, option A: keep as
   described). *macOS:* the app's `Info.plist` lists
   `_verso._tcp` in `NSBonjourServices`, beside `_verso-local._tcp`, and
   the Local Network usage description says the app also looks for
   servers; macOS 15 and later asks for the permission the first time,
   and a browse without the key finds nothing, silently. *Windows:*
   Windows Defender Firewall may ask once about UDP 5353 for the server
   (announcing) and for the app (browsing); *Private* networks only. The
   permission also gates the app's **unicast DNS queries** on macOS 15 and
   later (it is the local network): denied, the browse finds nothing and
   the DNS fallback finds nothing either, silently. *Linux:* the resolver
   files are read in `app/src-tauri/src/resolv_conf.rs`, which uses
   `std::fs`; that file alone is exempt from the confinement in
   `scripts/check.sh` **and in `.github/workflows/ci.yml`** (the two change
   together, ADR 0029), declared in `app/src-tauri/clippy.toml` and here —
   the system's configuration, not a file of any folder. **This exception
   awaits the maintainer's ratification.** A running Avahi should coexist,
   `mdns-sd` sharing port 5353 (to confirm in the manual check).

10. **Dependencies.** None new in what ships. `mdns-sd` is `verso-server`'s since
    [0096](0096-this-app-is-a-server.md); the desktop browses through
    `verso-server::discovery`, which it already depends on. `cargo deny`
    passes. Two **dev-dependencies are new** to `verso-app` (tests only, both
    already in the tree through `verso-server` and `reqwest`, licences
    unchanged): `rcgen` (MIT OR Apache-2.0), to make a certificate for a name
    in the TLS tests, and `rustls` on ring, to serve it. A DNS library was not
    added (see the Discarded alternatives). `[DECIDED 2026-10-21]`
    (0097.10, option A): the two dev-dependencies are accepted.

## Consequences

- The shortest path to a working UniVerso becomes: install it, open the
  desktop app, *Ajustes › Servidores*, pick it from *Encontrados nesta
  rede*, and approve this computer in the browser. Typing an address is the
  fallback and the only way over a different network or a bridge network.
- A server on a LAN is visible to the LAN by default: the switch is
  `VERSO_ANNOUNCE=off`, and the threat model says so.
- The desktop's connections to a UniVerso survive a bad system DNS. The
  cost is a handful of UDP queries once in five minutes per name when the
  system answer is not known to work.
- The error is longer and says more: a wrong DNS no longer looks like a
  server that is down.
- New code: `crates/verso-server/src/discovery.rs`,
  `app/src-tauri/src/{dns,discover}.rs`, `serversFound.ts`; the contract
  gains `FoundServer` and three commands; `Info.plist` gains a service.
- Tests: the TXT content has no folder or account; the off switch; no
  announcement on loopback; the flood bound; the order of addresses with
  the TLS name kept and no scheme change (the resolver returns addresses
  only); the wire format, with hostile input; a DNS server on loopback
  answering by UDP; the error text naming the IP; the list and its
  lifecycle (units and a Docker e2e). Manual checks
  (`docs/reference/manual-checks.md`): discovery on the maintainer's LAN,
  a bad-DNS check.
- The `std::fs` confinement for the desktop crate, in `scripts/check.sh`
  and in `.github/workflows/ci.yml`, gains `src/resolv_conf.rs` alone
  (item 9); it awaits the maintainer's ratification.
- [0050](0050-outbound-network-access.md) gets a dated revision note: the
  desktop browses mDNS only while Settings › Servers is open, sends UDP DNS
  queries to the system's resolvers after a failure, and a server announces
  itself by default beyond loopback.

## Discarded alternatives

- **A DNS library (`hickory-resolver`).** Considered by the author: it
  reads the system configuration on every platform (including Windows
  adapters) and speaks DNS fully. It is not in the tree and brings dozens
  of crates for what is here one query for two record types. The trade-off
  is that the query and the answer are parsed in this repository; they are
  bounded, tested with hostile input and kept to the little needed. If the
  maintainer prefers the library, `dns::ask` and the three list readers are
  what it replaces.
- **Connecting to an announced server by itself.** Considered and ruled out
  by the brief: an unauthenticated announcement must never start a
  connection or send a credential.
- **Announcing only while a dialog is open**, as
  [0096](0096-this-app-is-a-server.md) does for the laptop. Ruled out: a
  server has no dialog, and "just install it" is the point.

## Status

Accepted for items 1 and 7 (2026-10-16, *"Gosto de todos"*), which are the
maintainer's sentences. The author's details of those decisions (what is
announced, the `url` key, the switch, the limits, the list, the DNS rule's
timings and policy, the hand-written client, the platforms, the
dev-dependencies) were decided by the maintainer on 2026-10-21, as built.
**Item 8** (the text of the "unreachable" error) was `[PROPOSED]` and was decided
on 2026-10-21 (0097.8, option A: list each IP tried and give the DNS hint when
more than one was tried; option B, a short message without IPs, was not
chosen: cleaner, but hard to diagnose). The `std::fs` exception of `src/resolv_conf.rs` (item 9) was **ratified** on
2026-10-16 (*"Pode seguir a sua sugestão"*). Decided on 2026-10-16: **the compose
file keeps bridge networking as the default**, and
`packaging/server/docker-compose.host-network.yml` is provided as the
documented opt-in variant with `network_mode: host` for home servers where
discovery is desired without extra configuration.
