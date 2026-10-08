# ADR 0054 — The command line and agents, set up from the app

- Date: 2026-09-24
- Source: the maintainer, in session, on 2026-09-24 ("na tela de settings
  deveria ter opção de habilitar o cli/mcp e aproveitar e simplificar a
  instalação do path pra funcionar os comandos verso no terminal") and two
  answers, recorded in the memo
  [`docs/reference/views-decision.md`](../reference/views-decision.md),
  section 5; [0042](0042-open-from-command-line.md) (`verso <folder>`),
  [0018](0018-llm-native-mcp-in-core.md) and
  [0045](0045-server-and-mcp-security.md) (MCP, read-only),
  [0051](0051-development-flow-and-releases.md) (releases),
  [0026](0026-core-ui-contract-inviolable-rules.md) rule 4
- Status in the briefing: not present
- Revisions: 2026-09-29 — the `[OPEN]` on the system's tools closed by the
  maintainer, in session ("arrume essa parte do cli, tem que ficar 100%"):
  the link is made through `std::fs` in the shell's `src/update.rs`, with
  `osascript` kept for the administrator prompt alone
  ([0029](0029-guardrails-in-ci.md), revision of 2026-09-29).
- Revisions: 2026-10-08 — **decided by the maintainer**: Windows' command
  line comes with the app; the host says what "Add to Claude" writes; the
  download page where Claude Desktop is missing (Status).
- Revisions: 2026-10-08 — **decided by the maintainer**: two MCP modes (per folder, the default; all of Verso), folders hidden from agents until marked, agents' calls logged (points 3–6).

## Context

The command line ships as an archive of its own beside the app, and whoever
wants `verso` in a terminal unpacks it, clears its quarantine and puts it on
the `PATH` by hand (README, "Installing one"). `verso mcp <folder>` serves a
folder to an agent over stdio; a client such as Claude Desktop starts it from
an entry written by hand in its configuration file, with the folder's path.
The maintainer asked for both from the settings.

## Decision

**Decided on 2026-09-24 by the maintainer**, in session, choosing among
options the author put with its recommendation:

1. **The command line is linked from the settings** — the recommendation:
   the command line travels inside the app, beside its binary, and Settings →
   Terminal and agents links it as `/usr/local/bin/verso`, on the `PATH` of
   every shell (`/etc/paths`), as editors install theirs. Where that directory
   is not the person's, macOS asks for an administrator's password, once.
2. **An agent is connected in one click, with what goes in shown first** —
   the recommendation: "Add to Claude Desktop" shows the entry it will write,
   and on a yes writes it into Claude Desktop's configuration file, leaving a
   copy of the file as it was beside it; the entry for Claude Code and for any
   other client is shown ready to copy.

How the author built them (the memo, section 5):

- **The folder is named by its key**, the one the app already gives it:
  the entry starts `verso mcp --key <key>`, a new form of the command. No path
  of the folder crosses to the window or goes into a client's configuration
  (rule 4); the app and the command line find the folder through the index's
  sidecar ([0011](0011-config-outside-tree-index-as-cache.md)).
- **The client's file is written like a note**: read and written through
  `verso-fs` — atomically, and only over the version that was read — its
  other keys and servers kept; a file that is not JSON is left alone.
- **The link is made with the system's own tools** (`ln`, `readlink`, and
  `osascript` for the password), as the window's "Reveal in Finder" uses
  `open`: none of these paths is the folder's (rule 5), and the app reads no
  file of its own there. The download's quarantine is taken off the command
  line when it is linked; something else already at that path is replaced
  only after asking; "Remove" takes away this app's link only. [OPEN]
  Whether the host should do this through `std::fs`, with an exception
  declared in its own `clippy.toml`, rather than through the system's
  tools — the reading saw the tools as a way around the guardrail (the
  memo, section 8): the maintainer's to rule. *(Closed on 2026-09-29: the
  link, its check and its removal go through `std::fs` in
  `app/src-tauri/src/update.rs`, under the exception
  [0029](0029-guardrails-in-ci.md) ratified that day, and the quarantine
  through the `xattr` crate; `test`, `readlink`, `ln`, `rm` and `xattr` are no
  longer started. `osascript` stays, only when the plain call is refused,
  for the administrator's password — declared in
  [0029](0029-guardrails-in-ci.md).)*
- **The release puts the command line inside the app** and signs the bundle
  again, ad hoc as before; the separate archive stays.

### One server per folder, or one for all of Verso (2026-10-08)

Asked by the maintainer ("se eu tiver vários vaults, como é que o MCP vai
saber qual … coloque como opção nas configurações se a pessoa vai usar MCP
por Vault ou se vai usar MCP por verso inteiro"), with the author's
recommendations accepted ("pode seguir"):

3. **Two modes, chosen in Settings → Terminal and agents.** *One server per
   folder*, the default and the way so far: "Add to Claude Desktop" writes
   `verso-<folder>` with `verso mcp --key <key>`, which sees that folder
   alone. *One server for all of Verso*: one entry, `verso`, with
   `verso mcp --all`, added once; it serves the folders Verso has opened
   that are marked visible to agents, through a `list_folders` tool (each
   folder's name and key, never its path) and a `folder` argument on every
   tool: the key, or a name only where exactly one visible folder bears it
   — otherwise the call is refused with the candidates' keys.
4. **A folder is hidden from agents until the person marks it visible**
   (per folder, in the same section). The marks live in the configuration
   directory (`<config>/agents.json`, keyed by the folder's key, written as
   the index's sidecar is, in the same module), not in the window's
   storage: the server runs without the app. A moved folder gets a new key,
   so it is hidden again until marked. The per-folder server needs no mark — adding it is the
   person's choice of that folder.
5. **The app need not be running, nor the folder open**: a client starts
   the command line, which opens the folder from disk through the core and
   shares the index with the app (SQLite in WAL with a 5 s busy timeout,
   verso-index). A folder must have been opened in Verso once: its key
   names its index's sidecar, which says where it is. The all-of-Verso
   server answers `list_folders` from the sidecars and the marks without
   opening anything, opens a folder (`Workspace::reopen`, which refuses a
   folder that is gone) the first time a call names it, and a folder that
   fails to open fails that call, never the server.
6. **What an agent read is logged**: every tool call — the tool, the folder
   and the note or the words — goes to `agents.log` in the configuration
   directory (the last 2,000 calls), so the person can see afterwards what
   an agent looked at. Its own file, rewritten whole each time: the core
   may not append to a file there (its `clippy.toml`, ADR 0029).

**Security, as weighed in session.** A program running as the person can
read the notes from disk already, outside macOS's protected folders: the server opens no new door on the
machine (the notes, the index and the client's configuration are the
person's files; replacing `verso.exe` or the link needs the same rights).
It listens on no port — standard input and output only — and **never gets
a network transport without authentication**. The risk it adds is prompt
injection: a note's text can tell an agent to read more and send it away
through another tool the agent has. A per-folder server bounds that to its
folder; the all-of-Verso server to the folders marked visible — hence the
default mode and the hidden-by-default marks. The marks hold only against
an agent whose other tools cannot write the configuration directory: an
agent with a shell or a file tool can mark every folder visible itself.
The per-folder server is the bound that survives such an agent — a second
reason for it being the default. To verify on macOS: a process
started by an app without access to the protected folders (Documents,
Desktop, iCloud) reaches them through `verso` only if macOS credits the
access to Verso rather than to the app that started it (a prompt would
then name the client, not Verso); Windows has no such gate (ADR 0069).
`[OPEN]`: two folders with the same name collide already in per-folder
mode — the second "Add to Claude Desktop" replaces the first entry
(`verso-<name>`); the entry's name for that case is the maintainer's to
choose.

## Consequences

- `verso` works in a new terminal after one click; `verso .` opens the folder
  in the app ([0042](0042-open-from-command-line.md)).
- A client connected from the app reads the folder through the read-only
  server of [0045](0045-server-and-mcp-security.md): nothing it asks is
  written.
- A beta's command line is the beta's: linked from the beta, `verso` opens
  Verso Beta; the link follows the last app that set it.
- Only Claude Desktop is written into, and only on the person's yes; other
  clients get the text to paste.
- Windows and Linux: the link and the one-click entry are macOS-first; Linux
  has the same paths without the password prompt, Windows waits for its port
  (superseded on 2026-10-08 for Windows: Status).

## Discarded alternatives

- **`~/.local/bin` and a line in `~/.zprofile`** — no password, but the app
  would write into the person's shell file; put to the maintainer and set
  aside.
- **Instructions only**, the app writing nothing outside itself — put to the
  maintainer and set aside.
- **Copy-only for the agents**, no file of another app written — put to the
  maintainer and set aside.

## Status

Accepted on 2026-09-24 by the maintainer, in session: points 1 and 2 of the
Decision. The rest is the author's, built under it and labelled as such in the
memo. Revised on 2026-10-08, the maintainer accepting the author's
recommendations: on Windows the command line comes with the app (`verso.exe`
beside it, ADR 0069) and nothing is installed onto a PATH; what "Add to
Claude" writes is the host's to say (`McpStatus.command`), so the window
shows exactly what goes in (point 2) on every system; and where Claude
Desktop is not installed, the settings offer its download page —
`https://claude.com/download`, opened by the host in the system's browser,
a fixed address that nothing from the window can change (the maintainer's
idea).
