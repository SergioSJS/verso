# Security policy

[Português (Brasil)](docs/pt-BR/SECURITY.md)

How to tell the project about a vulnerability in Verso or UniVerso, and
what happens next ([ADR 0083](docs/adr/0083-security-hardening-of-universo.md)
item 15).

## Reporting a vulnerability

Write to **security@versomd.com**. Say what is affected (the server, the
app, the site; the version, from `universo --version`, the app's About
window or the console's overview), what an attacker can do, and how to
reproduce it. Please write to the address rather than opening a public
issue, so that a fix can ship before the details are public.

Write in Portuguese or in English.

## What we promise

- An acknowledgement within **7 days** of your message.
- A fix in the next version of the supported line, which is the newest
  release.
- Credit in the release's notes, under the name you give, when you want
  it; none when you do not.

There is no bug bounty.

## Scope

In scope:

- **The server**, UniVerso (`verso serve`): its API, its WebSocket, the
  window it serves to a browser, its packages, image and installer script
  (`universo.sh`).
- **The app**, Verso on macOS, Windows and Linux, and its command line.
- **The site**, versomd.com, and the files it serves.

Out of scope:

- **The host's machine**: its operating system, its reverse proxy, its
  Docker host, its own configuration. Whoever hosts a server sees the
  notes on it by design ([the threat model](docs/reference/threat-model.md)).
- **A member's own data**: what a person can already read or change with
  their own access to a folder.
- **Denial of service against a server you do not run.** Test on a server
  of your own: [the installation guide](docs/reference/server-install.md)
  sets one up.

## Encrypted mail

The key for encrypted mail is not published yet: it is published here with
the first release that carries it.

## security.txt

Every UniVerso server answers `/.well-known/security.txt` (RFC 9116) with
this address, the languages, a link to this page and an expiry a year after
the release it runs.
