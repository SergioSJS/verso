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
  has the same paths without the password prompt, Windows waits for its port.

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
memo.
