# ADR 0050 — Outbound network access from the window

- Date: 2026-09-23
- Source: `docs/review/phase-2.md` §6, item 5;
  [0049](0049-phase-2-scope-widened.md), Consequences
- Status in the briefing: not present
- Revisions: 2026-09-29 — revised by two decisions of the maintainer, taken
  in session, each in an ADR of its own; the text below is kept as it was
  decided on 2026-09-23. [0055](0055-in-app-updater.md) is the updater's own
  decision, which the second Consequence asked for: the app checks the
  project's releases at startup, with a setting to turn it off.
  [0056](0056-embedded-web-pages.md) adds a fifth way to the four the
  Decision enumerates: a web page embedded in a note, fetched by the host's
  proxy. *(0056 was revised the same day: the page loads itself in its
  frame, from an origin the user approved, and the host fetches nothing.)*
  2026-10-09 — revised by [0073](0073-self-hosted-server-first.md),
  accepted by the maintainer that day, and by the server's update check
  ([0075](0075-server-packaging-and-storage.md) item 7, decided the same
  night); the text below is kept as it was decided. Decision item 1 and
  the first Consequence ("the core never reaches the network"): the core
  still reaches no network. A Verso server — `verso serve`, and "this app
  is a server" — takes inbound connections, and reaches outbound only
  addresses the user or the host wrote in a configuration: a bucket, the
  server a window connects to, mDNS on the local network, a mail server
  ([0074](0074-accounts-and-access-on-the-server.md)). Besides those, and
  only for this check, the server asks the project's release feed whether
  a new version exists, to tell the admin; it never updates itself, and
  the check can be turned off. `docs/reference/app-decision.md` §7 says
  the same.
  2026-10-16 — revised by [0097](0097-universo-found-on-the-network-and-a-bad-dns-survived.md)
  (the maintainer: "Gosto de todos", on finding a UniVerso on the home
  network and surviving a bad DNS); the text below is kept as it was
  decided. Three reaches are added, none to an address the user did not
  already mean: the desktop app **browses mDNS** (`_verso._tcp`) on the
  local network, only while Settings › Servers is open, and lists what it
  finds without connecting to it; after a connection to a server it
  already uses has failed, it sends **UDP DNS queries to the system's own
  DNS servers** for that server's name and tries the other addresses they
  give, the name and the scheme unchanged; and a Verso server **announces
  itself** by mDNS by default when it listens beyond loopback
  (`VERSO_ANNOUNCE=off` stops it). 2026-10-21 — revised by [0104](0104-external-cloud-storage-transports-and-quotas.md): a cloud provider the person connected is polled without a click (a new reach, like 0055's update check, 0073's server, 0096/0097's local server); the core still reaches no network — the adapters live on the desktop host's side (0104 item 3).

## Context

Nothing in Phase 1 reached the network. The Phase 2 window does, in four ways
that came with the maintainer's requests
([0049](0049-phase-2-scope-widened.md)): a web note loads its page in a web
view; an http(s) link clicked in the window opens its page in a window of its
own; a web note's icon is asked of the site; an image a note takes from the web
loads when the note is shown. Its first version asked a third party for every
icon, which the Opus reading of 2026-09-23 found and which was removed. No
decision said what the app may ask of the network:
[0027](0027-runtime-capabilities.md), Proposed, only names a `net:fetch`
permission.

## Decision

Decided on 2026-09-23 by the maintainer, on the author's recommendation
(`docs/review/phase-2.md` §6, item 5; the answer: *"a e b ok"*):

1. **Verso asks the network only for addresses written in the user's notes, or
   clicked by the user.** No telemetry, no server of its own, and no third
   party in a site's place: a site's icon is asked of the site.
2. **The four ways stay**: a web note's page, a clicked link (in a window of
   its own), a web note's icon, a remote image in a note.
3. **A "load remote content" setting covers the two that need no click**: a
   web note's icon, asked as soon as a list or a tab shows the note, and a
   remote image, loaded when the note is shown. Off, nothing reaches the
   network until a click — a remote image becomes a link to itself, an inline
   style loses what it would fetch, and a web note shows a globe instead of its
   site's icon.
4. **The `url` property keeps the meaning Verso gave it**: a note whose
   frontmatter holds an http(s) `url` is a web note. That meaning changes
   nothing in the file, and Obsidian gives the property none; the page opens
   by itself only when the note has no body, and otherwise at a click.

## Consequences

- The core never reaches the network ([0026](0026-core-ui-contract-inviolable-rules.md));
  the window does only in the four ways above.
- By the same principle, an update check — a request to a server of Verso's
  — is not allowed; an updater would need a decision of its own.
- The setting is a preference, not a boundary. The window's content security
  policy still allows `https:` images, and the setting is applied where the
  window cleans the core's HTML (`app/ui/src/sanitize.ts`) and where it draws a
  web note's icon. A plugin or a server that fetches, after Phase 2, needs
  [0027](0027-runtime-capabilities.md)'s `net:fetch` or a decision of its own.
- A note made elsewhere with a `url` property — by a clipping tool, a bookmark
  export — becomes a web note in Verso; its text stays as it is, and its page
  opens only at a click when the note has a body.
- **Provisional — the setting's default.** It is on, as the window behaved
  before the setting existed and as Obsidian loads remote images. The
  maintainer asked for the setting without naming a default; the default is
  the author's, and the maintainer may choose off.
  `[DECIDED 2026-10-21]` (the maintainer's mark, option A): **on**, as it is;
  the same as Obsidian, and turning it off is a click in Settings.

## Discarded alternatives

- Asking a third party for the icons (`icons.duckduckgo.com`), as the first
  version did — removed after the Opus reading of 2026-09-23
  (`docs/review/phase-2.md`): it told that party every site the user keeps a
  note about.
- A setting for each of the four ways — raised in
  [0049](0049-phase-2-scope-widened.md) ("whether each needs a setting") and
  not chosen: opening a web note and clicking a link are already the user's
  request.

## Status

Accepted on 2026-09-23. The setting's default: provisional (Consequences).
Revised on 2026-09-29 by [0055](0055-in-app-updater.md) (the update check)
and [0056](0056-embedded-web-pages.md) (embedded web pages). Revised on
2026-10-09 by [0073](0073-self-hosted-server-first.md) and
[0075](0075-server-packaging-and-storage.md) item 7 (a server's traffic,
and its update check). Revised on 2026-10-15 by
[0096](archive/0096-this-app-is-a-server.md) item 8 (a correction of scope, not a
change of decision): the "mDNS on the local network" of the 2026-10-09
revision is multicast, which is not "an address the user wrote in a
configuration". "This app is a server" may announce itself by mDNS
(`_verso-local._tcp`) **only while its pairing dialog is open**, with an
instance name of four random hexadecimal digits and a record of the
protocol version and the port, and listens for connections inbound on the
private addresses of its machine, only while the person has turned it on;
nothing else of 0050 changes: the core reaches no network.
