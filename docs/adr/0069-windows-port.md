# ADR 0069 — The Windows port: x64, an installer, tested on a Windows machine over SSH

- Date: 2026-10-07
- Source: the maintainer, in session: "uma das coisas que a gente tem para
  fazer é implementar uma versão para Windows" (one of the things we have to
  do is build a Windows version), before a stable version with as many
  features as possible; then, asked five questions, "1. Sim, pode já fazer
  2. Qual o melhor no nosso caso? Pros e contras 3. Por enquanto sim
  4. Excelente pergunta, mas não tenho windows arm pra testar 5. Não sei"
  (1. yes, go ahead; 2. which is best in our case? pros and cons; 3. for now,
  yes; 4. excellent question, but I have no Windows on ARM to test on; 5. I
  don't know); and, given the pros and cons, "Prefiro nsis tb. Deixa win 10
  tb, muita máquina não recebe a atualização" (I prefer NSIS too. Keep
  Windows 10 as well, many machines don't get the upgrade). The test machine
  was set up in the same session.
- Related: [0022](0022-target-platforms-macos-first.md) (Windows ships,
  before Linux), [0029](0029-guardrails-in-ci.md) (the platform checks and
  the local scripts), [0043](0043-placeholder-guard.md) (OneDrive's
  placeholder, `[OPEN]`), [0051](0051-development-flow-and-releases.md)
  (releases, and Windows code signing deferred),
  [0055](0055-in-app-updater.md) (the updater's Windows path, unexercised).
- Status in the briefing: not present

## Context

ADR 0022 decided that Windows ships, before Linux, and that it joins CI's
platform checks on `main` and the packaging of a version when its port
lands. It did not say how the port is built and tested, and nothing in the
repository decides an installer format, an architecture or how Windows
code is run before a push.

Windows cannot run in Docker on a Mac ([0029](0029-guardrails-in-ci.md)),
so `scripts/check-linux.sh` has no Windows twin. Two Windows machines are at
hand: a Windows 11 virtual machine on the maintainer's Proxmox server on the
home network, built on 2026-10-07 by scripts that install it unattended and
leave it with the toolchain, SSH and Remote Desktop; and a gaming PC with a
real GPU. On that virtual machine `cargo test -p verso-dialect` passed,
93 tests of 93, with the toolchain pinned in `rust-toolchain.toml`.

The roadmap places the Windows app after Phase 2
([roadmap](../roadmap.md), "Also the Windows and Linux apps"). The
maintainer's words above bring it before a stable version; reconciling the
roadmap is theirs.

## Decision

1. **x64 only, Windows 10 and 11.** Windows on ARM is not built: there is no
   machine to test it on. Windows 10 stays although it left support in
   October 2025: many machines never got the upgrade to 11.
2. **The installer is NSIS, per user.** It installs without
   administrator rights, so the in-app updater
   ([0055](0055-in-app-updater.md)) runs the new installer silently with no
   UAC prompt; one installer carries pt-BR and EN
   ([0035](0035-cross-cutting-requirements.md)); "Verso Beta" installs beside
   "Verso" as on macOS ([0051](0051-development-flow-and-releases.md)). The
   Windows bundle targets NSIS only. Windows 11 ships WebView2 and Windows 10
   may lack it, so the installer embeds WebView2's bootstrapper (about 2 MB),
   which installs it when missing (proposed; Tauri's default downloads the
   bootstrapper at install time instead).
3. **Not code-signed for now.** SmartScreen warns on the first run of an
   unsigned installer, and that is accepted until public distribution, when
   [0051](0051-development-flow-and-releases.md) already places the code
   signing decision.
4. **Developed on the Mac, built and tested on a Windows machine reached
   over SSH.** The repository assumes only an SSH host named `verso-win`:
   Windows with OpenSSH, Windows PowerShell as its shell, the MSVC Build
   Tools, rustup, Node 22 and Git with `core.autocrlf false`. The scripts
   that build the maintainer's virtual machine stay outside the repository:
   they hold the home network's addresses. The gaming PC is the
   real-hardware check (GPU, high DPI), by hand, before a version.
5. **`scripts/check-windows.sh`**, beside `check-linux.sh`: it copies the
   working tree to the Windows host byte for byte (tracked files and
   untracked files that are not ignored, no line-ending conversion) and runs
   there the checks whose answer depends on the platform: `cargo clippy`
   with `-D warnings` and `cargo test --workspace`
   ([0029](0029-guardrails-in-ci.md)). Whether it must pass before every push
   is `[OPEN]`. Recorded recommendation: required when the diff touches
   platform-dependent code (`verso-fs`, `app/src-tauri`, configuration paths,
   anything under `cfg(windows)`), optional otherwise; for code that only
   Windows compiles, the pull request states the run as a step, as it does
   for macOS-only code today ([0029](0029-guardrails-in-ci.md)).
6. **CI, when the port lands.** `main` gains a Windows job with clippy and
   the tests on a pinned runner image, and the release workflow a Windows job
   that builds the installer. Pull requests stay on Linux. A Windows minute
   is billed as two Linux ones.
7. **The real app tested by machine on Windows** (proposed, its own pull
   request). Tauri's WebDriver (`tauri-driver`) works on Windows and not on
   macOS, so the walkthrough steps the browser harness cannot reach can run
   against the real window there.
8. **What the port brings, each item with a test.**
   - Atomic write by `MoveFileEx` with `REPLACE_EXISTING`, and an open handle
     (antivirus, OneDrive) making the rename fail
     ([0029](0029-guardrails-in-ci.md)).
   - OneDrive's placeholder, `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`, as a
     `verso-fs` fixture: the maintainer closes that provider's `[OPEN]` in
     [0043](0043-placeholder-guard.md) in the port's pull request.
   - Path confinement against Windows forms: drive letters, UNC paths, `\`,
     junctions, reserved names (`CON`, `NUL`), 8.3 short names, trailing dots
     and spaces, and case-insensitive names (Q8 of the dialect spec is
     `[OPEN]`).
   - The configuration location on Windows: `[OPEN]`;
     [0011](0011-config-outside-tree-index-as-cache.md) has no Windows counterpart.
   - The updater's Windows install path, which exists and has never run
     ([0055](0055-in-app-updater.md)), and its rollback.
   - The command line on `PATH`, and the keys the tutorial teaches, with Ctrl
     where macOS has ⌘.

## Consequences

- Two reference notes contradict ADR 0022 as revised on 2026-09-23:
  `docs/reference/mcp-decision.md` ("Windows is not a target", on the path
  separator) and `docs/reference/watcher-decision.md` ("Windows (not a
  target yet)", against its own table). The port's pull request corrects
  them, or records why not.
- `README.md` already promises a Windows build check beside the local
  scripts; item 5 is that check.
- The virtual machine runs the Windows 11 Enterprise evaluation, which
  expires after 90 days; its scripts rebuild it unattended.
- The virtual machine runs Windows 11. Windows 10 needs a machine of its
  own to be tested on (proposed: a second virtual machine, from the Windows
  10 Enterprise LTSC evaluation); until then Windows 10 is supported but not
  run.
- No GPU in the virtual machine: WebView2 renders in software there. The
  board's frame rate is judged on the gaming PC.
- Each Windows CI job costs twice a Linux one, only on `main` and on a
  release.

## Discarded alternatives

- **The gaming PC as the Windows machine.** It has a real GPU, but it is
  shared with games, has no snapshots to return to a clean install, and is
  in another room. Kept for real-hardware checks.
- **CI alone (`windows-latest`).** It builds and tests, but no one can look
  at the app, and every attempt costs runner minutes.
- **Cross-compiling from the Mac (`cargo-xwin`).** Tauri's support is
  experimental and NSIS only, and it builds without running anything.
- **MSI (WiX).** Per machine: the updater would raise a UAC prompt on every
  update; one MSI per language; it builds only on Windows. It suits
  enterprise deployment, which can add it later.
- **Windows on ARM.** No machine to test on.
- **Windows 11 only.** Proposed in the session, since Windows 10 left
  support; the maintainer kept Windows 10, because many machines never got
  the upgrade.

## Status

Proposed. Decided by the maintainer on 2026-10-07: x64 only, no ARM64, and
Windows 10 and 11 (item 1); NSIS per user (item 2); no code signing for now
(item 3, reading their "for now, yes" as accepting the unsigned installer).
Proposed: the embedded WebView2 bootstrapper (item 2), items 4 to 8, and a
Windows 10 test machine. `[OPEN]`: whether `scripts/check-windows.sh` must
pass before every push.
