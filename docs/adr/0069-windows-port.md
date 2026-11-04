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
  was set up in the same session. The five questions themselves are not in
  this record, only the answers; the reading of answer 3 below is the
  author's. Revised on 2026-10-07 by Fable 5.1, applying its own reading at
  the maintainer's request, who decided to start now ("Tô querendo já
  iniciar windows"); read by Opus 5.5 the same day and revised again on its
  findings (ADR 0032). The revision: ADR 0022 revised, the real app driven
  through a second fixture of the end-to-end suite, and the questions
  opened below.
- Related: [0022](0022-target-platforms-macos-first.md) (Windows ships,
  before Linux), [0029](0029-guardrails-in-ci.md) (the platform checks and
  the local scripts), [0043](0043-placeholder-guard.md) (OneDrive's
  placeholder, `[OPEN]` — decided on 2026-10-08, handled as iCloud's,
  Status), [0051](0051-development-flow-and-releases.md)
  (releases, and Windows code signing deferred),
  [0055](0055-in-app-updater.md) (the updater's Windows path, unexercised).
- Status in the briefing: not present
- Revisions: 2026-10-11 — on macOS a new or renamed file now takes its
  name by `renamex_np` with `RENAME_EXCL`, an atomic rename that fails
  with `EEXIST` instead of replacing, and no longer by `link` and `unlink`:
  FSEvents never reports the removal of a file whose name was given by
  `link`, so a file Verso created or renamed, then deleted outside the app
  (Finder, `rm`), stayed in the tree and reached sync only at its next scan
  (seen on 2026-10-11). A volume without the flag falls back to `link`.
  Linux and Windows unchanged: inotify and `ReadDirectoryChangesW` report
  that removal. Through `rustix` (no `unsafe`); the guard against replacing
  a file and the directory `fsync` after it are as before. The macOS
  placing revision was confirmed by the maintainer on 2026-10-11, in
  session: *"Mas eu tinha confirmado"* (but I had confirmed) — their
  *"Gostei das recomendações, pode seguir"* of 2026-10-10 covers every
  recommended option, this revision among them.
  2026-10-12 — the items still Proposed accepted by the maintainer as
  built and shipped in 0.5.0-beta.1, in session, answering the ADR audit:
  *"Ajuste tudo que precisar. Está aprovado os ADRs"* (adjust whatever
  needs it; the ADRs are approved): the embedded WebView2 bootstrapper
  (item 2), items 4, 6 to 9 and the order of the work (Consequences).
  2026-10-12 — item 8 on the Mac: after the fourth WindowServer abort in
  two days, every one during `scripts/check.sh`'s end-to-end step, the
  maintainer, in session: *"esse check.sh deve estar com pau, bugada ou mal
  otimizada"* (this check.sh must be broken, buggy or badly optimized), and
  *"resolver de uma vez por todas… para que não trave meu Mac mais"* (solve
  it once and for all… so that it does not freeze my Mac again). The
  cause, from the three crash reports and the unified log: the
  WindowServer ran out of IOSurfaces — it held 64,084 of the system's
  65,536 at 15:39:49 on 2026-10-12 (the kernel's "IOSurface count of 65024
  approaching limit of 65536"), and aborted creating one more for a window
  capture (`_XWindowListCreateImage` → `captureWindowList` →
  `CompositorMetal::CreateCaptureSurface` → `WSIOSurfaceDebugTallyAndAbort`)
  of a 1500 × 1000 window, the harness's viewport, in all three. Who asks
  for those captures: Playwright's WebKit, which on macOS draws in a real
  window of the window server and takes a screenshot or a frame of a
  screencast by capturing it (its WebKit imports `CGSHWCaptureWindowList`
  and `WebCore::cgWindowListCreateImage`). The suites asked for one per
  frame: `trace: "retain-on-failure"` records a trace for every test and
  drops it when the test passes, and a trace's screencast takes a frame
  every 200 ms, and every frame for 500 ms after each action, in every
  page. The Verso app captures nothing. The revision, applied by the AI at
  the maintainer's order, for their confirmation: on macOS the two
  Playwright configs record traces without the screencast (the DOM of each
  step is kept) and take no screenshot on failure, and the harness's
  suite runs with one worker; Linux keeps both. A pre-flight,
  `app/ui/e2e/preflight.mjs`, run by `scripts/check.sh`, the npm scripts
  and both configs, refuses to start while a browser, another Playwright
  run or the Verso app is alive, or while the system already holds more
  than 16,000 IOSurfaces, and stops a run, as Ctrl-C would, when the count
  passes 24,000. WebKit stays on the Mac: running it only on Linux was
  proposed the same day and declined by the maintainer (*"mandar rodar no
  linux é meio merda"*). And a fixture closes and reports what a test
  leaves open (`app/ui/e2e/leaks.mjs`).
  2026-11-04 — item 8 on the Mac, superseded in its way of running (fix
  release 0.8.5, item C2, the maintainer's decision of 2026-11-02,
  recorded after their approval of 2026-11-04): the end-to-end suites no
  longer run on the Mac's window server at all. `scripts/check-e2e.sh` runs
  both of them, the UI harness (WebKit, Chromium, phone and tablet sizes)
  and the server's, in Playwright's Linux Docker image (1.63.0), with 3
  workers for the harness, so no WebKit window capture reaches the
  WindowServer: Docker is the answer to the crashes above.
  `scripts/check.sh` calls it when Docker runs; `--no-e2e` leaves it out.
  Playwright is never run directly on the Mac. What stays in the code, as
  the 2026-10-12 revision left it: the macOS settings of the two configs
  (traces without the screencast, no screenshot on failure, one worker for
  the harness on a Mac), the pre-flight `app/ui/e2e/preflight.mjs` behind
  `npm run e2e` and `npm run e2e:server`, and `leaks.mjs`. They guard a run
  started by hand on a Mac, which `check.sh` no longer starts. The reasons
  above are kept.
  2026-10-14 — item 3 answered by
  [0095](0095-mac-notarization-and-windows-code-signing.md), accepted by
  the maintainer that night (*"Sim, todas"*): the Windows app signed
  through SignPath Foundation once the repository is public, Certum's
  open-source certificate the fallback; unsigned no longer accepted at V1.

## Context

ADR 0022 decided that Windows ships, before Linux and **after Phase 2**, and
that it joins CI's platform checks on `main` and the packaging of a version
when its port lands. It did not say how the port is built and tested, and
nothing in the repository decides an installer format, an architecture or
how Windows code is run before a push. On 2026-10-07 the maintainer brought
the Windows app forward ("Tô querendo já iniciar windows"): ADR 0022 and the
roadmap carry that revision, dated, and this ADR is how.

Windows cannot run in Docker on a Mac ([0029](0029-guardrails-in-ci.md)),
so `scripts/check-linux.sh` has no Windows twin. Two Windows machines are at
hand: a Windows 11 virtual machine on the maintainer's Proxmox server on the
home network, built on 2026-10-07 by scripts that install it unattended and
leave it with the toolchain, SSH and Remote Desktop; and a gaming PC with a
real GPU. On that virtual machine `cargo test -p verso-dialect` passed,
93 tests of 93, with the toolchain pinned in `rust-toolchain.toml`.

The window is tuned to WKWebView today: drags by pointer events because
HTML5 drag and drop is dead there, embeds in child web views, a cache that
survives updates. WebView2 is Chromium. The end-to-end suite
(`app/ui/e2e`, Playwright) runs in WebKit only.

What was checked outside the repository on 2026-10-07, for the items
below: Tauri's NSIS template (`crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi`
and `utils.nsh` in the Tauri repository) takes `/S` (silent), `/P` (passive)
and `/UPDATE`, prompts to kill the running app and does so in silent mode,
and detects a previous MSI (WiX) install and offers to uninstall it;
`webviewInstallMode` is `downloadBootstrapper` by default,
`embedBootstrapper` adds about 1.8 MB, `offlineInstaller` about 127 MB
([Windows Installer](https://v2.tauri.app/distribute/windows-installer/)); `tauri-driver` runs on Windows and Linux only, while WebdriverIO's
`@wdio/tauri-service` runs an embedded WebDriver server inside the app on
Windows, Linux and macOS
([WebDriver](https://v2.tauri.app/develop/tests/webdriver/)); Playwright
attaches to a WebView2 app over the Chrome DevTools Protocol when the app
is started with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`,
one `WEBVIEW2_USER_DATA_FOLDER` per test
([Playwright, WebView2](https://playwright.dev/docs/webview2)); `MoveFileEx`
with `MOVEFILE_WRITE_THROUGH` is documented in two sentences — "the function
does not return until the file is actually moved on the disk" and "setting
this value guarantees that a move performed as a copy and delete operation
is flushed to disk before the function returns" — so the explicit guarantee
is about the copy case, and without `MOVEFILE_COPY_ALLOWED` a move never
falls back to a copy ([MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw));
a Windows minute of GitHub Actions costs about 1.7 times a Linux one by
price ($0.010 against $0.006 on 2-core runners,
[GitHub's pricing](https://github.com/pricing/calculator)).

Two things about the Windows machine were not checked and must be, on
`verso-win`, before items 5 and 7 are built: `cargo test --workspace`
there — the atomic write syncs the directory with `File::open(dir)` and
`sync_all` (`crates/verso-fs/src/write.rs`), which Windows refuses, so every
write would answer `durability_not_confirmed` and the tests that assert no
warning would fail until item 9's first entry lands; and whether a window
started from an SSH command gets a desktop at all, since OpenSSH's service
runs its commands in session 0, with no interactive desktop — item 7 may
need a logged-on session and a scheduled task, or an open Remote Desktop
session, to start the app in.

Measured on `verso-win` on 2026-10-08, by the port's first pull requests.
The workspace did not compile there at all: `xattr` was a dependency of
`verso-fs` on every OS, and `verso-fs` stopped the build on purpose where
only the Unix half of its directory identity existed. **A directory opened
with write access and `FILE_FLAG_BACKUP_SEMANTICS`, through std's stable
`OpenOptionsExt`, takes `FlushFileBuffers` (`sync_all`)**; opened for
reading only it is refused with "Access is denied". That is a directory
`fsync` on Windows with no `unsafe` and no dependency, a new fact for item
9's first `[OPEN]`: the port flushes the directory that way, and the
question stays the maintainer's. `Path::join` put `\` in paths relative to
the folder, and a board and a link were written with it. Reading the notes
of a directory raised a "modified" event for the directory itself, which
would have made every pass of the index start the next. The desktop host's
test harness died at start (`STATUS_ENTRYPOINT_NOT_FOUND`) without the
application manifest tauri-build embeds in the app alone. A note is
renamed by `link` and `unlink` there too (NTFS has hard links), and Windows
refuses to rename a folder while any file in it is open. (On macOS, since
2026-10-11, by an exclusive rename instead: see Revisions.)

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
   may lack it, so the installer embeds WebView2's bootstrapper (about 1.8 MB),
   which installs it when missing (proposed; Tauri's default downloads the
   bootstrapper at install time instead). *(Accepted on 2026-10-12, as
   built and shipped.)*
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
   with `-D warnings` and `cargo test --workspace`. This goes further than
   [0029](0029-guardrails-in-ci.md), which gives Windows "a check of its
   build here and its tests in CI": the tests run here too, since the
   machine exists. **Decided on 2026-10-07 by the maintainer
   ("Recomendado")**: required when the diff touches
   platform-dependent code (`verso-fs`, `app/src-tauri`, configuration paths,
   anything under `cfg(windows)`), optional otherwise; for code that only
   Windows compiles, the pull request states the run as a step, as it does
   for macOS-only code today ([0029](0029-guardrails-in-ci.md)).
6. **CI, when the port lands.** `main` gains a Windows job with clippy and
   the tests on a pinned runner image, and the release workflow a Windows job
   that builds the installer, in the pull request that lands the atomic
   write of item 9 — before it the tests fail on Windows (Context). Pull
   requests stay on Linux. A Windows minute costs about 1.7 times a Linux
   one. *Done on 2026-10-08:* `ci.yml` runs clippy and the tests on
   `windows-2025` after a merge; `release.yml` builds the installer
   (`Verso[-Beta]-X.Y.Z-windows-x64-setup.exe`, named as the updater looks
   for it) and `verso-cli-X.Y.Z-windows-x64.zip`, the UI built in Git's
   bash, and publishes them with macOS's files.
7. **The real app tested by machine on Windows, through the end-to-end
   suite the repository already has** (proposed, its own pull request;
   accepted on 2026-10-12, as built).
   WebView2 is Chromium: started with
   `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`,
   the real window takes Playwright over the Chrome DevTools Protocol. The
   suite today is built on the harness (`e2e/fixtures.mjs` opens
   `harness.html`, reads files, inspects contract calls and emits
   `folder-changed` through `window.__harness`), so this is a second fixture
   of `app/ui/e2e`, attached over CDP to the app with a real folder per
   test, running the specs that do not depend on the harness's in-memory
   core; the walkthrough steps the harness cannot reach become tests there.
   One user data folder per test (`WEBVIEW2_USER_DATA_FOLDER`), since the
   control shares one by default; and a desktop for the window (Context). `tauri-driver` is the alternative, Windows
   and Linux only; WebdriverIO's `@wdio/tauri-service` would reach the real
   window on the Mac too, with an embedded WebDriver server — a decision of
   its own, not this ADR's.
8. **Before any Windows machine: the end-to-end suite in Chromium on the
   Mac** (proposed, the port's first step; accepted on 2026-10-12, as
   built). A Playwright `chromium` project
   beside the `webkit` one, in `scripts/check.sh`; what differs between the
   two engines is most of what will differ in WebView2, and it costs no
   runner and no SSH. *(Revised on 2026-10-12, for the maintainer's
   confirmation: on macOS no window captures — traces without the
   screencast, no screenshot on failure — one worker, and a pre-flight and
   an IOSurface watch around the run; see Revisions. `[REVISED 2026-11-04]`
   The suites now run in Docker through `scripts/check-e2e.sh`, 3 workers,
   not on the Mac; see Revisions.)*
9. **What the port brings, each item with a test.**
   - Atomic write: `FlushFileBuffers` on the temporary file (`sync_all`),
     then `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH`
     and without `MOVEFILE_COPY_ALLOWED`, so the move blocks until it is on
     disk and never degrades to a copy; and an open handle (antivirus,
     OneDrive) making the rename fail, with the retry the test pins
     ([0029](0029-guardrails-in-ci.md)). `std::fs::rename` offers no
     `MOVEFILE_WRITE_THROUGH`, and calling `MoveFileExW` with it needs
     `unsafe`, which the workspace forbids: the pull request names the
     dependency that wraps the call safely (justified, passing
     `cargo-deny`) or the guardrail exception, before the code
     (`CLAUDE.md` §3). **`[OPEN]`: invariant 9 of `CLAUDE.md` and ADR 0029
     ask for an `fsync` of the directory after the rename, and Windows has
     no such call on a directory handle.** Recorded recommendation: on
     Windows `MOVEFILE_WRITE_THROUGH` stands in for the directory `fsync`,
     the strongest the documented API offers for a same-volume rename,
     though not documented as its equivalent (Context); the guardrail's
     text says so. The maintainer, asked on 2026-10-07, does not know yet
     ("Não sei"): the port proceeds on this recommendation as a provisional
     fact, and the maintainer decides on the pull request that lands it.
     **What the port does, 2026-10-08**: the temporary file's `sync_all`,
     then `std::fs::rename` (which never degrades to a copy), then the
     directory flushed — `FlushFileBuffers` on a handle opened with write
     access and backup semantics, which Windows takes (measured, Context).
     So a directory flush exists on Windows and `MOVEFILE_WRITE_THROUGH` is
     not used: no new dependency, no `unsafe`. A rename that meets a held
     handle is tried again for up to about 2.5 s, and before each try the
     target is checked to be still the file that was read (invariant 11) —
     changed, the write stops and the diff is shown. A held target answers
     "Access is denied" (measured), the error a read-only target gives for
     good: a read-only target is told apart first and fails at once.
     **Decided by the maintainer on 2026-10-09** ("Recomendado"): this
     flush counts as the directory `fsync` of invariant 9 — the same
     purpose, a rename that survives a power loss, by the platform's own
     means; `CLAUDE.md` §2 item 9 says so.
   - **The path separator: `/`, decided definitive by the maintainer on
     2026-10-09** (asked whether any reason stood against it, none did).
     A note's path crosses the contract as
     a string relative to the open folder (ADR 0026, rule 4), wikilink
     targets and the index hold paths, and `docs/reference/mcp-decision.md`
     chose `/` while "Windows is not a target". Recorded recommendation: `/`
     in every path relative to the open folder — the contract, the index,
     the MCP — and `verso-fs` alone turns it into the OS's form at its
     edge; the text of a link inside a note is the file's content and is
     not touched (invariants 7 and 12). Obsidian's public API exposes
     `normalizePath` (`obsidian.d.ts`); its documentation in the package of
     version 1.14.4 gives `normalizePath('foo\\bar'); // foo/bar` — Obsidian's
     own paths use `/` on every OS, as Verso's do. The maintainer, asked on 2026-10-07,
     does not know yet ("Não sei"): the port proceeds on this
     recommendation as a provisional fact, and the maintainer decides on
     the pull request that lands it, with Q8 (case) beside it. The absolute paths at
     the entry edge (invariant 4) stay in the OS's form.
   - The watcher (`verso-fs/src/watch.rs`) on `ReadDirectoryChangesW`: the
     events a save, a rename and a OneDrive hydration raise, against what
     `docs/reference/watcher-decision.md` records for macOS.
   - OneDrive's placeholder, `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`, as a
     `verso-fs` fixture: the maintainer closes that provider's `[OPEN]` in
     [0043](0043-placeholder-guard.md) in the port's pull request.
     **Decided by the maintainer on 2026-10-08** ("deveria funcionar
     igual" ao iCloud), recorded in 0043: a file carrying
     `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`, `FILE_ATTRIBUTE_RECALL_ON_OPEN`
     or `FILE_ATTRIBUTE_OFFLINE`, read through std's `file_attributes()`
     (no dependency, no `unsafe`), is a placeholder. Tested with
     `attrib +O`, as the test machine has no OneDrive account; a real
     OneDrive placeholder is still to be observed.
   - Path confinement against Windows forms: drive letters, UNC paths, `\`,
     junctions, reserved names (`CON`, `NUL`), 8.3 short names, trailing dots
     and spaces, and case-insensitive names (Q8 of the dialect spec is
     `[OPEN]`). 8.3 short names, 2026-10-08: a name of that shape (a `~`
     and a digit) that names something is looked up in its folder, and a
     short spelling of another entry — `OBSIDI~1` for `.obsidian` — is
     refused, so it cannot get past the hidden and ignored rules.
   - The configuration location on Windows, with the log and the index
     file that live beside it on macOS (`~/Library/Application Support/verso`):
     `[OPEN]`; [0011](0011-config-outside-tree-index-as-cache.md) has no
     Windows counterpart. The maintainer, asked on 2026-10-07, does not know
     yet ("Não sei"): the port proposes a location in its pull request, with
     the reasons, and the maintainer decides there. **Decided on
     2026-10-08**, the maintainer leaving the choice to the port ("pode
     decidir a melhor abordagem que fizer mais sentido, qualquer coisa copia
     obsidian"): `%LOCALAPPDATA%\verso`, after `VERSO_CONFIG_DIR` and
     `XDG_CONFIG_HOME` and ahead of `HOME`. What lives there — the index,
     its sidecar, the log — is the machine's layer of ADR 0070, never
     synced; `%APPDATA%` is the roaming profile a company network copies
     between machines, and Windows' guidance keeps caches out of it. The
     settings are in the web view's storage, which Tauri keeps under
     `%LOCALAPPDATA%` already. Obsidian keeps everything in
     `%APPDATA%\obsidian`; copying it was the fallback for doubt, and the
     platform's rule left none. Claude Desktop's configuration, which "Add
     to Claude" writes, is `%APPDATA%\Claude`, theirs.
   - The updater's Windows install path, which exists and has never run
     ([0055](0055-in-app-updater.md)), and its rollback.
   - The command line on `PATH`, and the keys the tutorial teaches, with Ctrl
     where macOS has ⌘. **Decided by the maintainer on 2026-10-08**,
     accepting the author's recommendation: the installer puts `verso.exe`
     beside `verso-app.exe` (Tauri's `externalBin`), and "Add to Claude"
     writes its absolute path into Claude Desktop's configuration — the
     folder's path still goes nowhere, only its key. On `PATH` it is not
     put yet. The `externalBin` is given at bundle time only, in the config
     file `scripts/check-windows.sh --bundle` writes (in `tauri.conf.json`
     every build would need the file); the Windows release job, when it
     exists, passes the same.

## Consequences

- **Order of the work** (recorded recommendation, the maintainer's call;
  accepted on 2026-10-12, as followed):
  the port branches from `main` after pull request #37 merges; its first
  pull request is infrastructure only — item 8, `scripts/check-windows.sh`,
  an NSIS build that installs and opens — and touches no `verso-fs` code;
  `verso-fs` and the CI job follow, in large pull requests as ADR 0033 rule
  1 has it until the whole flow exists, each item of 9 with its test and
  named in the pull request's What, since `verso-fs` is the crate under
  invariants 5, 9 and 11.
- Two reference notes contradict ADR 0022 as revised on 2026-09-23:
  `docs/reference/mcp-decision.md` ("Windows is not a target", on the path
  separator) and `docs/reference/watcher-decision.md` ("Windows (not a
  target yet)", against its own table). The port's pull request corrects
  them, or records why not.
- `README.md` already promises a Windows build check beside the local
  scripts; item 5 is that check, and more than ADR 0029 asked (the tests
  too). ADR 0029's platform table gains the line when item 5 lands.
- The virtual machine runs the Windows 11 Enterprise evaluation, which
  expires after 90 days; its scripts rebuild it unattended.
- The virtual machine runs Windows 11. Windows 10 needs a machine of its
  own to be tested on (proposed: a second virtual machine, from the Windows
  10 Enterprise LTSC evaluation); until then Windows 10 is supported but not
  run. **Decided on 2026-10-07 by the maintainer**: the machine comes
  later ("fica pra depois"), item 1 stands, and the port is written with
  Windows 10 in mind from the start ("já desenvolve com win 10 em mente"):
  no API that Windows 11 alone has, WebView2 installed by the installer
  where it is missing, and every `cfg(windows)` choice checked against
  Windows 10's documentation. The first Windows beta may ship before
  Windows 10 is run; the release notes say so. *(2026-10-31: the machine is
  made now, Status.)*
- **Asked by the maintainer on 2026-10-08**: what had to be fixed for the
  first Windows build is written down where agents read it, so that work
  done on the Mac is right on Windows the first time ("tomar nota de todos
  os problemas que foram corrigidos para que a versão Windows fosse gerada
  e a gente não repetisse"):
  [`cross-platform-checklist.md`](../reference/cross-platform-checklist.md),
  pointed to from `CLAUDE.md` §4. It records habits and their fixes; it
  decides nothing new.
- **Measured on 2026-10-08**: the first index of 5,000 notes took 228 s
  on the Windows machine against 3.4 s on macOS — one SQLite commit per
  note, each a real `FlushFileBuffers` on Windows. The index, a cache
  (ADR 0011), now runs in WAL with `synchronous = NORMAL` and one
  transaction per index run: 9.1 s on Windows, 2.6 s on macOS. Recorded in
  the cross-platform checklist.
- No GPU in the virtual machine: WebView2 renders in software there. The
  board's frame rate is judged on the gaming PC.
- Each Windows CI job costs about 1.7 times a Linux one, only on `main`
  and on a release.

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

**Decided in parts (2026-10-07/09); the port shipped in 0.5.0-beta.1**
(2026-10-08, `CHANGELOG.md`; release commit 20095da). **Accepted on
2026-10-12** in what was still Proposed: the embedded WebView2
bootstrapper (item 2), items 4, 6 to 9 and the order of the work,
accepted by the maintainer as built and shipped, answering the ADR audit
(*"Ajuste tudo que precisar. Está aprovado os ADRs"*). *(Until 2026-10-12
this lead ended: "Still Proposed: the items named Proposed below.")*

*(The lead until 2026-10-12, kept as history: "Proposed.")* Decided by
the maintainer on 2026-10-07: the Windows app starts
now and goes ahead of the rest of Phase 2's work — it is part of Phase 2's
scope, and ships before Phase 2 closes ("Vou passar windows na frente";
ADR 0022 and the roadmap revised the same day); x64 only, no ARM64, and
Windows 10 and 11 (item 1); NSIS per user (item 2); no code signing for now
(item 3, reading their "for now, yes" as accepting the unsigned installer);
`scripts/check-windows.sh` required when the diff touches platform
code, optional otherwise (item 5, "Recomendado"); the Windows 10 machine
later, the port written with Windows 10 in mind from the start
(Consequences). Proposed: the embedded WebView2 bootstrapper (item 2),
items 4, 6 to 9, and the order of the work *(accepted on 2026-10-12, as
built)*. **Decided by the maintainer
on 2026-10-09** (item 9; `CLAUDE.md` §2 item 9): the directory's
`FlushFileBuffers` counts as the directory `fsync`; the path separator in
a path relative to the open folder is `/`, definitive. *(History: until
then both were `[OPEN]`, the maintainer not knowing yet ("Não sei") and
the port proceeding on the recorded recommendation as a provisional fact
until its pull request: what the directory `fsync` means on Windows
(item 9); the path separator in a path relative to the open folder (item
9).)* Decided on 2026-10-08: the
configuration location, `%LOCALAPPDATA%\verso` (item 9, the choice left to
the port); OneDrive's placeholder handled as iCloud's (item 9, ADR 0043).

**Decided (2026-10-31): Windows 10 gets its virtual machine now.**
`[DECIDED 2026-10-31, to be done]` Put to the maintainer as B5 of the list of
2026-10-31 — Windows 10 has never been run; a) the author makes a Windows 10
virtual machine and tests there, b) Windows 10 leaves the promise — and
approved as recommended, a: *"Todo resto pode ir de recomendado e aprovado"* (everything else may go as recommended, and is approved). Item 1 stands (Windows 10 and 11): a
second virtual machine on the Proxmox host runs Windows 10, and the port's
checks run on it as on the Windows 11 one (the Consequences' "the machine
comes later" of 2026-10-07 ends).
