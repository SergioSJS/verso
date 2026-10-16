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

2. **`[PROPOSED]` What is announced.** Service type `_verso._tcp` (the
   name is this project's; nothing is registered). The instance name is
   `UniVerso-` and six random hexadecimal digits, new at each start —
   **never the computer's, a folder's or an account's name**. The SRV
   record carries the port. The TXT record has three keys and no more:
   `v` (the server's version), `https` (`0` or `1`, whether the port
   speaks TLS) and `id` (the same six digits). Addresses are the machine's
   own, followed as they change. The other service,
   `_verso-local._tcp` ([0096](0096-this-app-is-a-server.md) item 8), is
   not merged with this one: it is the laptop's, short-lived and for
   pairing.

3. **`[PROPOSED]` When it is announced, and the off switch.** On by
   default when the server listens beyond loopback (`0.0.0.0`, a LAN
   address); never when it listens on loopback only. `VERSO_ANNOUNCE=off`
   (also `0`, `false`, `no`) turns it off. A failure to announce is logged
   at WARN and never stops the server: it works without being found. A
   goodbye record is sent when the server stops.

4. **Threat analysis of the announcement.**
   - *Spoofing.* Anyone on the network can announce a `_verso._tcp`
     service with any address. The worst it can do is **offer a wrong
     address** in the list. So: the app never connects, signs in or sends
     anything because of an announcement; it fills the address only after
     the person clicks, and **shows the address** it will use (and that it
     is `http` or `https`) in the row before the click. What follows the
     click is the sign-in as if typed: the browser opens the address'
     device-approval page, where the person types a password into a page
     they can see the address of, as with an address typed. A wrong
     server cannot take a credential the app sent, because the app sends
     none.
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

5. **`[PROPOSED]` The list.** *Encontrados nesta rede / Found on this
   network*: each row has the instance name, the address
   (`http(s)://ip[:port]`, an IPv4 private address first), *HTTPS* or *sem
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
   browser does.** *"Gosto de todos."* The rule, for every connection the
   desktop makes to a server, HTTP and WebSocket alike:
   - the name is resolved by the system, as always;
   - it is also asked of **each DNS server of the system's list, one by
     one** (a UDP query to port 53, A and AAAA, 1.2 seconds each, in
     parallel), at most once in five minutes per name, and the addresses
     that differ are tried **after** the system's;
   - the connection tries the addresses in order and the first that
     answers wins; it is remembered for ten minutes and goes first; a
     failure forgets it;
   - **the name is never replaced**: the connection goes to the IP, the
     URL keeps the name, so the TLS certificate is verified for the name
     the person typed, and the `Host` header is the name's;
   - **never a fall back from `https` to `http`**: the scheme is not
     touched by any of it, and an IP the DNS gave is only another address
     for the same URL;
   - not for `localhost` or `.local` names, nor when an address that worked
     is still among the system's own answers (nothing is wrong).
   The system's list: macOS `scutil --dns`; Linux `/etc/resolv.conf` and
   systemd-resolved's own `/run/systemd/resolve/resolv.conf`; Windows
   PowerShell's `Get-DnsClientServerAddress`. A scoped link-local server
   (`fe80::1%en0`) is left out. The DNS client is written here (about 150
   lines: one query, one answer, every length checked, every loop bounded,
   a random query id); see the Discarded alternatives.

8. **`[PROPOSED]` The error names what was tried.** An unreachable error's
   message is the server's address and, when the name was resolved, each
   IP tried on a line after it. The log says it once a minute:
   `unreachable: the server at https://universo.casa.meioorc.com: … [universo.casa.meioorc.com → 10.0.0.1 (system), 192.168.0.5 (dns 192.168.0.2): no answer]`.
   The window says: *"Não foi possível alcançar o servidor
   universo.casa.meioorc.com — ele está fora do ar ou sem rede.
   universo.casa.meioorc.com → 10.0.0.1: sem resposta. Confira o DNS desta
   rede: o nome pode estar apontando para o endereço errado."* (and in
   English), so a DNS problem reads as one. "No answer" is said for every
   address, whether it timed out or refused: the log has the real cause.

9. **`[PROPOSED]` The platforms.** *macOS:* the app's `Info.plist` lists
   `_verso._tcp` in `NSBonjourServices`, beside `_verso-local._tcp`, and
   the Local Network usage description says the app also looks for
   servers; macOS 15 and later asks for the permission the first time,
   and a browse without the key finds nothing, silently. *Windows:*
   Windows Defender Firewall may ask once about UDP 5353 for the server
   (announcing) and for the app (browsing); *Private* networks only. The
   DNS list comes from PowerShell, with no console window. *Linux:* the
   resolver files are read (`std::fs`, an exception to the confinement in
   `scripts/check.sh`, declared in `app/src-tauri/clippy.toml` and here:
   the system's configuration, not a file of any folder); a running
   Avahi should coexist, `mdns-sd` sharing port 5353 (to confirm in the
   manual check).

10. **Dependencies.** None new. `mdns-sd` is `verso-server`'s since
    [0096](0096-this-app-is-a-server.md); the desktop browses through
    `verso-server::discovery`, which it already depends on. `cargo deny`
    passes. A DNS library was not added (see the Discarded alternatives).

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
- `scripts/check.sh`'s `std::fs` confinement for the desktop crate gains
  `src/dns.rs`.

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

Accepted for items 1 and 7 (2026-10-16, *"Gosto de todos"*). Items marked
`[PROPOSED]` are the author's details of those decisions, built and waiting
for the maintainer. Open: **whether the compose file for CasaOS/ZimaOS
ships with `network_mode: host`** so discovery works out of the box. The
author's recommendation: keep the bridge network as the default — it works
on every machine and port 7340 is published the same way everywhere — and
offer host networking as a documented, opt-in variant for a home server
whose only job is UniVerso, where the `7340:7340` mapping adds nothing and
discovery then needs no step. Host networking shares the machine's whole
network with the container, and port 7340 must be free on it. Not decided:
the compose file is unchanged.
