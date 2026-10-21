# ADR 0078 — UniVerso: the name of Verso as a server

- Date: 2026-10-10
- Source: the maintainer, in session on 2026-10-10, on the clash of
  `/usr/bin/verso` between the desktop app's packages and the server's:
  *"eu tinha até a proposta de chamar de uni-verso o verso pra rodar em
  servidor e syncar coisas, fica um trocadilho legal"*. Written by Opus 5.5;
  to be read by Fable 5.1 ([0032](0032-author-and-reviewer-roles.md))
  before it is accepted.
- Related: [0075](0075-server-packaging-and-storage.md) (items 1 and 2:
  one binary, three ways to install; the image on GitHub's registry),
  [0073](0073-self-hosted-server-first.md) (the server; item 10, sync
  through it), [0004](0004-project-name-verso.md) (the product's name),
  [0071](0071-linux-port.md) (the desktop app's `.deb`/`.rpm`).
- Status in the briefing: not present; on acceptance, beside the product's
  name.
- Revisions: 2026-10-12 — the name is spelled UniVerso, with a capital V,
  decided by the maintainer (Decision, the revision below).

## Context

The server is `verso serve`, a subcommand of the `verso` binary (0075
item 1). Its `.deb` and `.rpm` install that binary as `/usr/bin/verso`;
so does the desktop app's production package (its command line beside
the app). On one Linux machine the second package is refused. Test
releases do not clash (the desktop beta installs `verso-beta`), so
0.7.0-beta.1 shipped without the problem showing; the first production
version would.

The maintainer had a name for Verso as a server, never written down until
now: **UniVerso** — *uni-verso*, the verses together; the server where
several people's folders meet and, with sync (0073 item 10), where a
person's devices meet.

## Decision

Accepted (2026-10-10, Status).

1. **UniVerso names Verso as a server.** The app stays Verso; the
   self-hosted server — today `verso serve`, tomorrow the hub sync goes
   through — is UniVerso. One code base, one binary (0075 item 1): the
   name is the server's packaging and how it is spoken of.
2. **Invoked as `universo`, the binary is the server.** The binary looks
   at the name it was started by: `universo` runs what `verso serve` runs,
   and `universo admin reset <e-mail>` what `verso serve admin reset`
   does; `universo --web`, `universo --help`, `universo --version` as
   expected. `verso serve` keeps working, unchanged.
3. **The server's artifacts carry the name**:
   - packages `universo-<version>-<arch>.deb` and
     `universo-<version>-<arch>.rpm` (the release's own naming), installing the binary as
     `/usr/bin/universo`, the unit `universo.service`, the environment
     file `/etc/universo/universo.env`, the user `universo`, the data in
     `/var/lib/universo` — no path the desktop app's package installs;
   - the archive `universo-<version>-<arch>.tar.gz`;
   - the image `ghcr.io/sergiosjs/universo`, its compose file's service
     and the CasaOS card named UniVerso.
4. **The variables stay `VERSO_*`.** They are the server's configuration
   and already documented; renaming them would change every install for no
   gain. Recommended; `[OPEN]` for the maintainer. *(Decided on
   2026-10-10 as recommended — Status.)*
5. **What a person sees.** The pages the server serves before the window
   — signing in, an invitation, a reset — and the administration console
   ([0077](0077-the-server-administration-console-and-folder-quotas.md))
   say "UniVerso" beside the Verso mark ("UniVerso · a Verso server");
   the window itself is Verso, wherever it is served. In the desktop app,
   Settings › Servers is named for what it connects to: `[OPEN]` whether
   it becomes "UniVerso" or stays "Servers". Recommended: "Servers", with
   "UniVerso" in its description, since a person connects to a server
   someone runs, by its address. *(Decided on 2026-10-10 as recommended —
   Status.)*
6. **0.7.0-beta.1's names are not carried along.** The image
   `ghcr.io/sergiosjs/verso` and the `verso-server-*` packages stop at
   0.7.0-beta.1; the next release publishes UniVerso's. Only the
   maintainer runs a server yet, so no migration is shipped; the install
   page says how to move a data directory from `/var/lib/verso` to
   `/var/lib/universo` for a package install.

### Revised: the name is spelled UniVerso — decided on 2026-10-12

The maintainer decided on 2026-10-12 that the server's name is spelled
**UniVerso**, with a capital V: the capital makes the reading *uni-verso*,
the verses together, visible in the name itself. The spelling applies
wherever the name is shown or written in prose — the server's pages and
console, the desktop app's strings, the command line's help, the packages'
descriptions, the documents and the demo vault. Identifiers stay in
lowercase, as item 3 lists them: the command and the binary `universo`,
the packages and archives `universo-<version>-<arch>`, the unit
`universo.service`, the user and group `universo`, `/etc/universo`,
`/var/lib/universo`, `share/universo`, the image
`ghcr.io/sergiosjs/universo`, the compose file's service and the file
names, these records' among them. The variables stay `VERSO_*` (item 4).

## Consequences

- `verso-cli` gains the dispatch on the name it was started by; the
  release workflow, `packaging/server/*`, the compose file, the install
  pages (both languages) and the threat model change names; the demo
  vault's note on the server says UniVerso.
- The desktop app's production `.deb`/`.rpm` and UniVerso's install on the
  same machine.
- A domain or a logo of its own for UniVerso is not decided here.

## Discarded alternatives

- **A conflict declared between the two packages** (nfpm `conflicts:`),
  with the desktop's `verso` used to serve on a machine with both —
  proposed in session on 2026-10-10; the maintainer answered with the name
  instead.

## Status

**Accepted on 2026-10-10** by the maintainer, with every recommendation,
in session: *"com exceção do 6, pode seguir o recomendado, o 6 pode já implementar"*. Item 4: the variables stay `VERSO_*`. Item 5:
Settings › Servers keeps its name, with UniVerso in its description. To be
read by Fable 5.1 with the round's code *(history: read by Fable 5.1 on
2026-10-10/11, in the sync campaign's session; its final report,
`verso-sync-campaign/relatorio-final.md`, is outside the repository)*.

*2026-10-21* — the decisions questionnaire of 2026-10-20 (answered 2026-10-21): `[DECIDED 2026-10-21]` (option A) no domain or logo of its own for UniVerso for now; it uses versomd.com. It is a product name inside Verso, not a separate brand.
