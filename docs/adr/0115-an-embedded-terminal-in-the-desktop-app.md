# ADR 0115 — An embedded terminal in the desktop app

- Date: 2026-10-31
- Source: the maintainer, in session, 2026-10-31, in pt-BR: *"O quão difícil
  seria da gente incorporar terminal dentro do verso? No sentido de...
  terminal mesmo de computador, né? Tipo, um terminal onde a pessoa habilita
  para mostrar a tela e ali ela consegue abrir o Claude Code, por exemplo, o
  Antigravity CLI ou outros CLIs de IA"* (how hard would it be to put a
  terminal inside Verso — a real computer terminal, one the person enables
  to show the screen, and there she can open Claude Code, for example, the
  Antigravity CLI or other AI CLIs). Then: *"bota o Fable para fazer esse ADR
  do terminal. Bota ele para fazer apenas o ADR, não é para implementar
  não"* (have Fable write this terminal ADR; only the ADR, not the
  implementation). Written by Fable 5.1 from the maintainer's words and the
  session's analysis, which this record checks and turns into options.
  Nothing is built.
- Related: [0054](0054-terminal-and-agents-from-the-app.md) (the `verso`
  command and the MCP set up from Settings; agents' calls logged),
  [0026](0026-core-ui-contract-inviolable-rules.md) (rules 1, 3, 4, 5),
  [0027](0027-runtime-capabilities.md) and
  [0076](0076-the-window-on-every-screen.md) item 11 (what the side cannot
  do is absent), [0073](0073-self-hosted-server-first.md),
  [0012](0012-files-are-source-of-truth.md) and invariants 7–11 of
  `CLAUDE.md` §2.2, [0044](0044-verso-fs-semantics.md) (the watcher),
  [0091](0091-version-history.md) (a change made outside
  Verso is a version), [0103](0103-feature-presets-and-capability-flags.md) (feature
  switches), [0114](0114-opening-one-markdown-file-without-a-folder.md)
  item 9 (the loose-files window has no terminal),
  [0069](0069-windows-port.md), [0071](0071-linux-port.md),
  [0029](0029-guardrails-in-ci.md) and [0067](0067-source-files-stay-small.md)
  (guardrails), [0005](0005-license.md) (licences),
  [0035](0035-cross-cutting-requirements.md) (two languages, accessibility),
  [0058](0058-demo-vault-as-tutorial.md) (the tutorial),
  [0101](0101-3d-dice-physics-overlay.md) item 1 (a lazy chunk),
  [0111](0111-online-mode-a-table-from-this-app-through-a-tunnel.md) item 6
  (a child process killed on quit; a Job Object on Windows), roadmap
  After-V1 item 7, and
  [the cross-platform checklist](../reference/cross-platform-checklist.md).
- Status in the briefing: not present.

## Context

**What exists.** Settings has a section *Terminal e agentes* / *Terminal and
agents* ([0054](0054-terminal-and-agents-from-the-app.md)): it links the
`verso` command line onto the `PATH` and writes an MCP entry for Claude
Desktop, so that a terminal *outside* Verso and an agent *outside* Verso
reach the folder. Verso itself has no terminal. The section is gated by the
capability `agents`, present only on the desktop host
(`app/src-tauri/src/lib.rs`, `capabilities`); on a server's folder it stays
hidden, deferred by the maintainer on 2026-10-23 (roadmap After-V1 item 7).
That item is about *this section* on a server's folder, not about a
terminal pane; the two share a name and nothing else.

**What the maintainer asked for.** A real terminal inside a Verso pane — a
shell of the computer, with the open folder as its working directory — so
that the person can run Claude Code, Gemini CLI, Codex, Antigravity's CLI
or any other command-line tool beside the notes, without leaving the app.
The person *enables* it; it is not there by itself.

**Why it is a distinct thing from 0054.** 0054 lets an agent *read* the
folder through `verso mcp`, read-only, every call logged in `agents.log`.
A terminal lets the person run any program as themselves, including agents
that write files. The first is a door Verso guards; the second is the
person's own shell, which Verso only hosts. This record keeps the two apart
and says where they meet (item 15).

**How others do it (public documentation only).** VS Code's integrated
terminal is xterm.js in the window over a pseudo-terminal (node-pty) in the
host, with the workspace folder as its directory; its shortcuts that
collide with the shell are configurable, and it can send a chosen set of
keys to the shell. Obsidian has no terminal; a community plugin provides
one — not consulted, and nothing of Obsidian's internals is claimed
([0009](0009-external-constraints.md)).

**What was verified while writing** (2026-10-31, the registries):

- `@xterm/xterm` 6.0.0, MIT; `@xterm/addon-fit` 0.11.0, `@xterm/addon-web-links`
  0.12.0, `@xterm/addon-unicode11` 0.9.0, `@xterm/addon-webgl` 0.19.0, all
  MIT — on the npm allowlist (`scripts/check-npm-licenses.mjs`).
- `portable-pty` 0.9.0, MIT (WezTerm's), `openpty` on macOS and Linux,
  ConPTY (`CreatePseudoConsole`) on Windows; its tree: `anyhow`,
  `downcast-rs`, `filedescriptor`, `libc`, `log`, `nix` 0.28, `serial2`,
  `shell-words`; on Windows `winapi`, `winreg`, `bitflags`, `lazy_static`,
  `shared_library`. It carries its own `unsafe` (as `libc` and Tauri do);
  `scripts/check-unsafe.mjs` scans the repository's files, not
  dependencies, so the guardrail is untouched; `cargo deny check` decides
  the licences of the tree in the PR. `serial2` (serial ports, not used) is
  not optional in 0.9.0: a dependency we carry for nothing, to be weighed
  in the PR.
- Both engines of the window (WKWebView, WebView2) run xterm.js; the WebGL
  renderer falls back to the DOM renderer when a context is refused.

## Decision

### Decided by the maintainer (2026-10-31)

1. **There will be an embedded terminal in the desktop app**: a real shell
   of the computer in a Verso pane, which the person enables, able to run
   AI command-line tools (Claude Code, Gemini CLI, Codex, Antigravity's CLI
   and the like). This record is the proposal of how; nothing below item 1
   is decided.

### Proposed (the author's; every fork is `[OPEN]` below)

**A. Where the shell runs, and how it reaches the window**

2. **A PTY in the desktop host** (`app/src-tauri`, a module of its own,
   split under the 1500-line limit of [0067](0067-source-files-stay-small.md)),
   through `portable-pty`: `openpty` on macOS and Linux, ConPTY on Windows
   ([0069](0069-windows-port.md): Windows 10 and 11, which have it). No PTY
   code in `verso-core`, `verso-service` or `verso-server`: the server is
   transport-free and must never grow a way to run a program.
3. **The person's shell, as a login and interactive shell.** On macOS and
   Linux `$SHELL` (fallback `/bin/zsh` on macOS, `/bin/bash` on Linux),
   started `-l -i`, so `/etc/zprofile` (`path_helper`), `~/.zprofile` and
   `~/.zshrc` run and the `PATH` the person's own terminal has — Homebrew,
   `~/.local/bin`, npm's global bin, where `claude`, `gemini`, `codex` live
   — is the PATH here too. This is the one answer to "a GUI app does not
   inherit the shell PATH": the shell builds it, Verso guesses nothing.
   `TERM=xterm-256color`, `COLORTERM=truecolor`, `LANG` as the system's.
   Windows: `[OPEN]` Q7.
4. **The working directory is the open folder's root**, resolved on the host
   from the window's folder (`Workspace::absolute`, as `reveal` does): the
   path is formed at the edge and goes to the operating system only; no
   path crosses the contract in either direction
   ([0026](0026-core-ui-contract-inviolable-rules.md) rule 4). `[OPEN]` Q2
   (the note's folder instead).
5. **Contract and transport.** Types in `verso-contract`
   (`TerminalId`, `TerminalSize { cols, rows }`, `TerminalEnded { code }`),
   TypeScript generated by `specta` (rule 3). The commands live in the host
   like `reveal` does — `terminal_open(size) -> TerminalId`,
   `terminal_write(id, bytes)`, `terminal_resize(id, size)`,
   `terminal_close(id)` — registered in `build.rs` and
   `capabilities/default.json`, for the app's windows only (never a child
   web view of [0056](0056-embedded-web-pages.md)). Output streams on a
   Tauri channel (`tauri::ipc::Channel`, bytes), one per terminal; the
   end of the process is an event with the exit code. The server has no
   route for any of them.
6. **A capability `terminal`** (`Can::Terminal`, serialised `terminal`),
   listed by the desktop host only, and only when the window shows a
   folder of this computer: absent on a server (`rpc_open.rs` never lists
   it), on the web and phone window, in the loose-files window
   ([0114](0114-opening-one-markdown-file-without-a-folder.md) item 9
   already says "no terminal"), and in a desktop window that shows a
   server's folder (there is no local directory to start in; roadmap
   item 7). Where it is absent nothing is drawn ([0027](0027-runtime-capabilities.md)
   item 3) — and the host *refuses* `terminal_open` where it would not list
   the capability, so the "cannot" is enforced, not only hidden.
7. **The person's switch** (the maintainer's "habilita"): a switch in
   Settings, in the existing *Terminal and agents* section, kept with the
   person's settings as the switches of [0103](0103-feature-presets-and-capability-flags.md)
   are. The host is told its state and refuses `terminal_open` while it is
   off. `[OPEN]` Q5: on or off by default.
8. **Flow control and throughput.** A reader thread per PTY feeds the
   channel in chunks; the window writes to xterm.js with its write
   callback and tells the host when it is behind, so an agent printing a
   megabyte of logs stalls the shell for a moment rather than the window.
   The WebGL addon when a context is given, the DOM renderer otherwise.
   The terminal's code is a **lazy chunk** loaded on first open, as the 3D
   dice are ([0101](0101-3d-dice-physics-overlay.md) item 1): a window that
   never opens a terminal downloads none of it.

**B. The pane**

9. **A terminal is a tab (a leaf), like a note**: a new `Kind`
   (`terminal`) in `app/ui/src/paths.ts`, a `TerminalLeaf` in
   `app/ui/src/leaves/`; opened from the command palette ("New terminal"),
   from the folder's context menu ("Open terminal here" on a folder, Q2),
   and from the *Terminal and agents* section. Several at once, each a
   tab; the pane layout places it anywhere a note goes (split, popout,
   phone layout untouched since the capability is absent there).
   `[OPEN]` Q1 (a fixed bottom panel instead).
10. **Keys.** xterm.js takes every key except a pass-through set that stays
    the app's: the tab and pane navigation (`Mod-Shift-[`, `Mod-Shift-]`,
    `Mod-1`…`Mod-9`, `Mod-Shift-w`), the palette (`Mod-p`, `Mod-Shift-p`),
    Settings (`Mod-,`), and `Mod-w` closes the terminal tab (asking if a
    process runs, item 13). `Mod-c`
    with a selection copies, without one it goes to the shell (so Ctrl+C
    on Windows and Linux still interrupts; on macOS ⌘C never reaches the
    shell, as in Terminal.app, and Ctrl+C always does); `Mod-v` pastes with
    bracketed paste. **Option is not Meta by default on macOS**
    (`macOptionIsMeta: false`), so Option-typed characters and dead keys
    for accents keep working; a setting turns Meta on for Emacs-style
    keys. `Mod-k` is a genuine clash (the app's search vs "clear scrollback"
    in Terminal.app): proposed — the app's, with "Clear" in the tab's menu.
    The whole table is one TypeScript module with a unit test, so a change
    is a diff, not a surprise.
11. **Text.** `unicode11` for wide characters and emoji, `web-links` for
    URLs (opened by the host in the system browser, as other links are),
    truecolor, the alternate screen (TUIs: Claude Code's own UI, `vim`,
    `htop`), mouse reporting, `SIGWINCH` on resize through the fit addon.
    Dead keys and the IME (Portuguese accents, `ç`, `~`+`a`) go through
    xterm's composition handling; verified on the real engines (item 23).
12. **Theme and font.** Colours from the appearance tokens
    ([0109](0109-themes-v2-more-tokens-and-a-catalogue.md)) — background,
    foreground, selection, the sixteen ANSI colours derived with the 3:1
    contrast floor the catalogue already enforces; the monospace stack of
    the editor, which must cover Portuguese and box-drawing characters.
13. **Lifecycle.** Closing the tab kills the shell *and its process tree*:
    on Unix a signal to the process group the PTY made (`setsid` in the
    child), `SIGHUP` then `SIGKILL` after a grace; on Windows the pseudo
    console is closed and the process tree is in a **Job Object** with
    kill-on-close ([0111](0111-online-mode-a-table-from-this-app-through-a-tunnel.md)
    item 6's rule), so a crash of the host leaves no orphan `node`
    running an agent. Quitting the app with a terminal whose foreground
    process is not the shell itself asks first, as it asks for unsaved
    text; where that cannot be told (Windows), it asks whenever a terminal
    is open. A shell that exits closes the tab with its exit code on the
    status line. `[OPEN]` Q6 (a window reload, a restored layout).
14. **AI-CLI shortcuts** — `[OPEN]` Q3: buttons in the terminal's empty
    state and the *Terminal and agents* section that **detect** installed
    CLIs by asking the login shell (`command -v claude gemini codex …`, run
    once in that same shell, never a guess of paths) and start the chosen
    one in a new terminal at the folder's root; an absent one shows its
    install page (a fixed address the host opens, as 0054 does for Claude
    Desktop). Detection runs only on a click, never at start.
15. **Where it meets 0054.** The `verso` command and `verso mcp` work in
    this terminal as in any other, so an agent started here can be given
    Verso's own MCP for the folder (`verso mcp --key <key>`, the entry 0054
    shows ready to copy). What the agent reads *through the MCP* is logged
    in `agents.log`; what it does *through the shell* is not — it is
    recorded by the history instead (section C).

**C. Data: an agent in the terminal writes files directly**

16. **The honest statement.** A program in this terminal reads and writes
    the folder's files with no step of Verso's between: no atomic write,
    no stamp check, no diff. Invariants 7–11 bind *Verso's* code, and that
    code changes nothing here — the shell is the person's own program, as
    Finder, `git`, VS Code or an editor on the same folder are today.
    Invariant 8 ("conversion only by user action, with a visible diff;
    also applies to writing by an agent") was written for an agent Verso
    drives ([0018](0018-llm-native-mcp-in-core.md), roadmap item 5); an
    agent the person runs in their shell is an outside program to Verso.
    This record does **not** read that as licence to weaken anything: it
    says what protects the person instead, and leaves the one real fork
    `[OPEN]` (Q8).
17. **What protects the person.** The watcher sees every write
    ([0044](0044-verso-fs-semantics.md)); an open tab with nothing typed
    takes the disk's text, one with typing shows the conflict banner with
    the diff (invariant 11, the existing path); the version history
    records each change as *made outside Verso*
    ([0091](0091-version-history.md)), so one agent
    edit or a whole run can be brought back; the index follows. Nothing
    new to build for this; the tests of item 22 prove it holds with a
    terminal as the writer.
18. **A notice, once** — `[OPEN]` Q8: the recommendation is one line the
    first time a terminal opens in a folder: *"Programs run here change
    the folder's files directly; Verso records each change in the history."*
    No modal, no repeat.
19. **Confinement (rule 5).** Verso's code touches no file of the folder in
    this feature: the host forms the folder's path for the OS (item 4) and
    writes nothing — no `std::fs`, no exception to `app/src-tauri/clippy.toml`
    or to the grep in `scripts/check.sh`. Starting a shell is not a
    subprocess that does denied work ([0029](0029-guardrails-in-ci.md),
    "Working around a guardrail"): it does the person's work, chosen by
    them, not Verso's. A reviewer still reads it as such; the terminal
    module is the one place a process is spawned with the folder as its
    directory, and it never spawns anything but the shell (and, for
    item 14, that same shell with a `command -v`).

**D. Security**

20. **No new privilege on the machine.** The shell runs as the person, with
    what their own Terminal has. On macOS a child of a GUI app inherits the
    app's TCC attribution: the first `ls ~/Documents` prompts "Verso wants
    to access Documents" (0054 noted the same for `verso mcp`); Windows
    and Linux have no such gate.
21. **The window becomes a way to run commands.** Today the window's
    JavaScript can ask the host to reveal, open links, write notes through
    the core; with this feature, `terminal_write` lets anything that
    executes in the app's web view run arbitrary commands as the person.
    That is the one new security consideration, and the defences are: the
    CSP (`default-src 'self'`, no inline script); notes render no script
    ([0114](0114-opening-one-markdown-file-without-a-folder.md) item 24);
    embedded web pages are *child* web views with no IPC to these commands
    (item 5); the commands are refused where the capability is absent and
    while the switch is off (items 6–7); a terminal starts only on
    `terminal_open`, which the window sends on a gesture. A review of the
    PR must confirm no remote content ever runs in the app's own web view.
22. **Prompt injection, wider than 0054.** A note's text can tell an agent
    to do things; an agent with a shell can do anything the person can.
    This is the agent's own problem (Claude Code and the others ask before
    running commands and editing files) and the person's choice to run it;
    Verso adds no confirmation of its own and claims none. The per-folder
    MCP of 0054 remains the bound that survives such an agent, exactly as
    0054 says.
23. **Never remote.** The capability, the commands and the PTY exist in the
    desktop host alone. A terminal on a server's folder — through the web
    window, through a desktop window on a remote folder — is remote code
    execution and stays After V1 under its own security ADR (roadmap item
    7). `[OPEN]` Q4.

**E. Cross-platform** (the checklist's §3 and §4)

- macOS: login shell for the PATH (item 3); `⌘` vs Ctrl (item 10); NFD
  names in output are the shell's business; the TCC prompt (item 20).
- Windows: ConPTY; the shell choice Q7; `CREATE_NO_WINDOW` so no console
  flashes; a Job Object (item 13); paths the shell prints have `\`, which
  is right there — nothing of them crosses to the contract; WebView2 is
  Chromium, where a click focuses the terminal's textarea by itself (the
  checklist's §4 rule applies in reverse: focus explicitly in WebKit).
- Linux: `$SHELL` from the environment of the `.desktop` launch (may be
  unset under some display managers: fall back to `/bin/bash`); AppImage
  launches must not leak its `LD_LIBRARY_PATH` into the shell (strip the
  AppImage's variables before spawning, verified on VM 104); Wayland
  clipboard through the web view, as the editor does.
- All: `scripts/check-linux.sh` builds in the container; `check-windows.sh`
  on VM 103 runs the host tests; the PTY tests need a TTY-less CI
  (`openpty` works without one; ConPTY on a Windows runner too).

**F. Accessibility and languages** ([0035](0035-cross-cutting-requirements.md))

24. xterm's `screenReaderMode` on when the person's setting asks for it (or
    when the system reports a screen reader, where the host can tell),
    which announces new output through a live region; the tab named
    "Terminal — <folder>" (with a number when several); a visible focus
    ring on the terminal; the pass-through keys of item 10 are the way out
    of the terminal by keyboard, and the tab's menu lists them; the
    empty-state buttons of item 14 are real buttons; "reduce motion" turns
    the cursor blink off. Every string in `strings.ts`, pt-BR and EN:
    palette entries, the section, the notice, the quit question, the exit
    code line, the detection results.

**G. Tests and guardrails** (feature group, each seen failing first, [0029](0029-guardrails-in-ci.md))

- `app/src-tauri`: the shell command is built with the folder's root as
  its directory and never with a path from the window; `terminal_open` is
  refused with the switch off, in a loose window, in a window on a
  server's folder; a closed terminal leaves no process of its tree alive
  (`sleep` as a child, checked gone); the quit question fires with a
  foreground child and not with an idle shell (Unix); contract types carry
  no path; the Tauri permission names every new command (the host test
  that guards `build.rs` and `capabilities/default.json`).
- `verso-contract`: `Can::Terminal` serialises as `terminal`; the server's
  `capabilities` never lists it.
- UI unit (`node --test`): the key pass-through table; the chunked write
  and the "behind" signal.
- Harness (`app/ui/src/harness/terminal.ts`): fake answers for the four
  commands and a scripted output stream, so e2e runs with no PTY.
- e2e: open a terminal from the palette, see the prompt, type, see output;
  resize sends a size; `Mod-Shift-]` leaves the terminal; close kills;
  `?side=server` and a loose window draw no terminal entry anywhere
  (`capabilities.spec.mjs` grows the case); the a11y pass includes the
  terminal tab; the switch off hides the entries and a stale command is
  refused.
- Manual checks, per system (macOS, Windows VM 103, Linux VM 104), listed
  in `manual-checks.md`: `claude`, `gemini`, `npx` found in the terminal;
  `ç`, `ã`, `é` typed at the prompt and inside Claude Code's prompt;
  Claude Code's full-screen UI, resize, mouse, paste of several lines;
  Ctrl+C interrupts; a tab closed with `sleep 1000 &` running leaves no
  process; quit asks; emoji and box-drawing align; WebGL and DOM renderer;
  VoiceOver, NVDA and Orca read new output; the TCC prompt on macOS names
  Verso; PowerShell 7 and 5.1 on Windows.

**H. What `CLAUDE.md` §5 obliges**

Strings in both languages; a `CHANGELOG.md` entry under *Unreleased*; a
lesson note in `demo-vault/` ("Terminal e agentes de IA") and `demo-vault-en/`
("Terminal and AI agents") paired in `names.mjs`, with the real commands
(`claude`, `gemini`, `verso mcp`), `tour.mjs` updated, the vaults rebuilt
and checked; a walkthrough section; the harness answers; the e2e tests; the
manual checks; the beta installed through `scripts/install-beta.sh`. The
PR justifies the two new dependencies (what they replace: hand-written
`openpty`/ConPTY bindings that would need `unsafe` in our tree, and a
terminal emulator of our own) and shows `cargo deny check` and the npm
licence check green. Roadmap: After-V1 item 7 gains a line pointing here
when this record is accepted.

## Consequences

- The person runs AI CLIs beside their notes; what an agent changes is
  seen by the watcher and kept by the history, as any outside edit is.
- Two dependencies (`portable-pty`, `@xterm/xterm` with four addons), a
  module in the host, a leaf in the window, a capability, four commands,
  a switch. Cost, as estimated in session: a good first version on three
  systems is a few days of agent work plus real-machine checks on Mac,
  Windows and Ubuntu; the polish of items 9 (several terminals, "open
  terminal here"), 12 and 14 a few days more.
- The host grows its first long-lived child process that is not Verso's
  own (0096 and 0111 start servers and a tunnel; this starts the person's
  shell). Its lifecycle rules (item 13) are the ones 0111 set.
- The security surface of the app's web view matters more (item 21); the
  CSP and "no script from a note" become things a terminal depends on.
- Nothing changes for the server, the web window, the phone, the MCP or
  `verso-fs`.

## Discarded alternatives

None recorded. The options under each question below are not discarded
until the maintainer chooses.

## Status

**Proposed** (2026-10-31). Item 1 is the maintainer's decision; items 2–24
are the author's proposal. The questions below are `[OPEN]`, each with a
recommendation, for the maintainer. Whether the feature enters V1 is Q9.

### Open questions

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | Where it opens | (a) a tab (leaf) like a note, placed anywhere a note goes; (b) a fixed bottom panel, VS Code style | **(a)**: the pane layout, split, popout and keyboard already work for a leaf; (b) is a second layout to build and to make accessible |
| Q2 | Starting directory | (a) the open folder's root; (b) the current note's folder | **(a)**: one predictable place, where `verso mcp --key` and the agents' config files live; "Open terminal here" on a folder in the tree gives (b) when wanted |
| Q3 | AI-CLI shortcuts | (a) buttons that detect installed CLIs through the login shell and start them; (b) a plain terminal only | **(a)**, detection on click only; (b) first if the PR must be small — the buttons are additive |
| Q4 | Scope | (a) desktop only, a folder of this computer; (b) also a desktop window on a server's folder; (c) also the web window | **(a)**; (b) and (c) are remote code execution and need their own security ADR After V1 (roadmap item 7) |
| Q5 | The switch's default | (a) on by default, the rule of 0103 item 2; (b) off by default, a third exception under 0103 item 7 (with 3D dice) | **(b)**: the maintainer's own word was "habilita"; a shell in a notes app is not a writing feature and surprises the reader audience; the way back is the switch in Settings, visible |
| Q6 | A window reload, a restored layout | (a) a reload reattaches to the live shell, with the last 256 KiB of output kept host side; a restored layout at start opens a fresh shell in the same place; (b) a reload closes the terminals | **(a)**: a reload happens after an update and must not kill an agent's run; nothing survives an app restart (a PTY dies with the host) |
| Q7 | The Windows shell | (a) `pwsh.exe` when found, else `powershell.exe`, with `cmd.exe` as a choice in the section; (b) `cmd.exe`; (c) WSL's default distribution when installed | **(a)**; (c) as a later option — `wsl.exe` works in (a) by typing it |
| Q8 | The notice about direct writes | (a) one line the first time a terminal opens in a folder; (b) a line in the lesson only; (c) nothing | **(a)**: invariant 8's spirit is "the person knows"; one line, once, no modal |
| Q9 | Phase | (a) after the V1 blockers, as a V1.x item; (b) into V1; (c) after V1 release | **(a)**, as 0114's Q11 was; the maintainer's call |
