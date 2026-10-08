# ADR 0071 — The Linux port: one build for every distribution, tested on virtual machines

- Date: 2026-10-08
- Source: the maintainer, in session, after the Windows port: "acione um
  agente … para verificar o que falta para termos uma versão do Verso para
  Linux" (start an agent to check what is missing for a Linux version of
  Verso); "acha que faz sentido subir umas duas máquinas linux no proxmox pra
  testar? pegando a distro mais usada e uma diferentona" (does it make sense
  to set up two or so Linux machines on Proxmox to test? the most used
  distro and a very different one); "com essas o debian taria coberto?"
  (would Debian be covered with those?); "como obsidian faz com linux? a
  versão linux é feita pra qual distro?" (how does Obsidian do Linux? which
  distro is the Linux version made for?); then "aproveite e já escreva o adr
  para linux, valide e corrija com fable. e deixe pra depois" (write the
  Linux ADR now, have Fable check it, and leave the port for later). The
  gap analysis was made the same day by a read-only agent over the
  repository; the Context cites its findings by file and line. Read by
  Fable 5.1 the same day and revised on its findings (ADR 0032).
- Related: [0022](0022-target-platforms-macos-first.md) (Linux after
  Phase 2), [0011](0011-config-outside-tree-index-as-cache.md) (the Linux
  location of the index, `[OPEN]`), [0029](0029-guardrails-in-ci.md)
  (guardrails and local scripts), [0043](0043-placeholder-guard.md)
  (placeholders: no Linux provider recognized),
  [0044](0044-verso-fs-semantics.md) (the watcher's periodic scan when the
  inotify watch limit runs out), [0051](0051-development-flow-and-releases.md)
  (releases and signing), [0055](0055-in-app-updater.md) (the updater),
  [0069](0069-windows-port.md) (the Windows port, the template),
  [0070](0070-what-travels-with-the-folder.md) (names every OS can keep).
- Status in the briefing: not present

## Context

What Linux has on 2026-10-08, from the repository:

- **The core and the app build and pass their tests on Linux on every pull
  request.** `scripts/check-linux.sh` (lines 23, 33–40, 60) runs `cargo
  fmt`, clippy, the tests and the bindings check in a Debian 12 container
  with WebKitGTK 4.1, where `verso-app` compiles and its host tests run on
  Tauri's mock runtime; CI runs the same on `ubuntu-24.04`
  (`.github/workflows/ci.yml`, 61, 150–163). Unlike Windows, the core's
  semantics need no port: the paths are `/`, a directory takes `fsync`, a
  rename over an open file works, and the names Windows refuses are already
  refused everywhere (ADR 0070). What `verso-fs` lacks on Linux is listed
  below.
- **No Linux package exists and the window has never been opened on Linux.**
  `app/src-tauri/tauri.conf.json` (26–45) has no `linux` section;
  `release.yml` (17–18, 89) publishes macOS only — it has no Windows job
  yet either; the end-to-end suite does not run on Linux.
- **The updater's Linux branch has never run, and reading it, it would
  fail** (`app/src-tauri/src/update.rs`): every download is opened as a ZIP
  (496, 591), while the asset list prefers an AppImage, a `.deb`, an `.rpm`
  or a `.tar.gz` (315–316) — with today's release names, the command line's
  `.tar.gz`; an AppImage is replaced through `current_exe()` (861–863),
  which points inside the read-only mount instead of `$APPIMAGE`.
- **The integration with the system assumes macOS or Windows:** installing
  the command line writes `/usr/local/bin`, with no elevation off macOS
  (`app/src-tauri/src/cli.rs`, 8, 119–143); "Add to Claude" assumes
  `~/.config/Claude` (184); a second launch opens a second process — no
  single instance anywhere, Windows included; "Show in folder" opens the
  parent folder through `xdg-open` without selecting the file
  (`app/src-tauri/src/files.rs`, 288–293); "Copy full path" needs `wl-copy`
  or `xclip` (346–373), often not installed; the menu item says "Finder" on
  every OS (`app/ui/src/strings.ts`, 147, 280 — already wrong on Windows).
- **WebKitGTK is not WKWebView:** wry documents child web views (web notes
  and embeds) as "Linux (X11 Only)", Wayland needing its GTK builder
  ([wry](https://docs.rs/crate/wry/0.56.0)); NVIDIA under Wayland may show
  a blank window ([Tauri](https://v2.tauri.app/develop/debug/linux-graphics/)),
  and the workarounds are environment variables
  (`__NV_DISABLE_EXPLICIT_SYNC`, `WEBKIT_DISABLE_DMABUF_RENDERER`), which
  the app cannot set itself: `std::env::set_var` is `unsafe` in Rust 2024
  and the workspace forbids `unsafe` (`Cargo.toml`, 16, 24) — a launcher
  (the AppImage's `AppRun`, the desktop file) can; the
  board, HiDPI and fractional scaling can only be judged on a real screen
  with a GPU.
- **`verso-fs` on Linux:** a queue overflow of inotify already becomes a
  rescan (`crates/verso-fs/src/watch.rs`, 192–197), but nothing handles the
  watch limit running out on a big folder, the periodic scan ADR 0044
  (76–80) asks for when Linux becomes a target; network file systems are
  detected on macOS only (`write.rs`, 318–325); extended attributes that
  fail to copy (SELinux on Fedora) are already reported, as on macOS
  (`write.rs`, 269–287), and only need observing.
- **A new axis Windows did not have: case.** macOS and Windows file systems
  ignore case; Linux file systems do not, and `Nota.md` and `nota.md` can
  stand side by side. Links, renames and "a file with that name already
  exists" were written with that slack (spec Q8, `docs/spec/dialect.md`,
  924–936, `[OPEN]`).
- **No cloud provider's placeholder is recognized on Linux** (ADR 0043
  covers iCloud, and Windows' attributes since 2026-10-08).

How Obsidian ships on Linux, from its download page and releases
([download](https://obsidian.md/download)): one build for every
distribution, not one per distribution — an AppImage (x64 and ARM64), a
`.deb` for amd64, `.tar.gz` archives, a Snap, and a Flatpak marked
"community maintained". It can, because Electron carries its own Chromium. Tauri
uses the system's WebKitGTK instead: Tauri's AppImage bundles it and its
dependencies (70 MB and more), while its `.deb` and `.rpm` depend on the
distribution's `libwebkit2gtk-4.1`; Tauri asks to build on the oldest base
to be supported, because a newer glibc does not run on an older system
([AppImage](https://v2.tauri.app/distribute/appimage/),
[Debian](https://v2.tauri.app/distribute/debian/)). Ubuntu 22.04 has
glibc 2.35 and Debian 12 has 2.36, so of the two the older base is Ubuntu
22.04 ([Ubuntu](https://packages.ubuntu.com/source/jammy/glibc)).

## Decision

All proposed by the author; the port waits ("deixe pra depois").

1. **x64 first.** ARM64 Linux (Raspberry Pi, ARM laptops) is a question,
   not a plan: `[OPEN]`.
2. **One build, three packages:** an AppImage for every distribution, a
   `.deb` for the Debian family (Debian, Ubuntu, Mint, Pop!_OS), an `.rpm`
   for Fedora and its family — the three out of one `tauri build`. This
   answers the maintainer's "feita pra qual distro?": for none in
   particular, as Obsidian. Flatpak is left for later: a Flatpak needs
   Flathub's review and a filesystem permission for the folders, and the
   command line and the MCP server, which a client starts as a program,
   would live inside the sandbox or need a second package.
3. **Built on Ubuntu 22.04, in a container:** the oldest base of the
   family, so the packages run on Ubuntu 22.04 and later, Debian 12 and
   later, and current Fedora. The Debian 12 container of `check-linux.sh`
   keeps checking; it does not build what is shipped. The supported
   versions are a question: `[OPEN]`.
4. **Tested on virtual machines on the Proxmox host**, set up unattended
   (Ubuntu's autoinstall, Fedora's kickstart, Debian's preseed), with
   snapshots and SSH by key, as the Windows machine is. The maintainer
   asked about two — the most used distribution and a very different one —
   and whether Debian would be covered; the author answered that Ubuntu
   covers the Debian family's packaging but not Debian's older libraries,
   and proposed three, the Debian one when the port starts:
   - **Ubuntu's current LTS, GNOME on Wayland** (26.04 today): the most
     used desktop; the `.deb` and the AppImage;
   - **Debian stable's oldest supported release, GNOME** (12 today): an
     older WebKitGTK, GStreamer and Mesa, and a bare system (codecs,
     clipboard tools not installed);
   - **Fedora's current release, KDE Plasma** (44 today; Wayland only
     since Fedora 40): the other family — the `.rpm`, SELinux, KDE instead
     of GNOME, newer libraries.

   Two or three machines: `[OPEN]`. No GPU in a virtual machine: the window
   renders in software there, good for correctness, not for the board's
   frame rate; NVIDIA on Wayland needs real hardware, which no machine here
   provides: `[OPEN]`.
5. **`scripts/check-linux-vm.sh`**, beside `check-linux.sh` and
   `check-windows.sh`: the same tree byte for byte to a VM, the package
   built and installed, the app launched; and the end-to-end suite's WebKit
   project run in a Linux container with Node beside Rust, whose Playwright
   WebKit is the GTK/WPE port — near the Linux app's engine at no machine's
   cost. When it is required before a push, as `check-windows.sh` is when
   platform code changes (0069, item 5): `[OPEN]`. ADR 0029's list of local
   scripts gains it when it lands.
6. **CI when the port lands:** the pull-request job stays; a release builds
   and publishes the three packages beside macOS's, and Windows's once its
   release job exists.
7. **What the port brings, each with a test:**
   - the `linux` bundle section, and the beta beside the release: today both
     would install `/usr/bin/verso-app` and collide in a `.deb`/`.rpm`;
   - the updater's Linux path: fixed (the asset by format, the AppImage
     replaced through `$APPIMAGE`, the file the AppImage documentation
     names for it), or left to the package manager for `.deb` and `.rpm`,
     or Tauri's updater plugin — set aside by ADR 0055 while the repository
     is private, it updates AppImage, `.deb` and `.rpm` since its 2.10.0
     and always requires a signature (signing is ADR 0051's): `[OPEN]`;
   - one instance — missing on Windows too, so one piece of work for both;
   - the command line on `PATH` without root (`~/.local/bin`, in the XDG
     base directory specification);
   - "Show in folder" selecting the file (the file manager's D-Bus
     interface `org.freedesktop.FileManager1`, else the folder); the menu
     item named per OS (Finder, Explorer, the file manager) — Windows
     included; "Copy full path" saying what to install when no clipboard
     tool is there;
   - "Add to Claude": Claude Desktop for Linux is in beta for Ubuntu and
     Debian ([Anthropic](https://claude.com/download)); where it reads its
     settings is not documented — `~/.config/Claude` is observed on a real
     install before it is relied on: `[OPEN]`;
   - the periodic scan when the inotify watch limit runs out (ADR 0044);
   - network file systems: detected on Linux too, or recorded as not
     detected — ADR 0029 avoided a list of file system magic numbers on
     macOS, and Linux offers no flag like `MNT_LOCAL`;
   - extended attributes under SELinux: observed on the Fedora machine;
   - case: the tests that matter where two names differ only in case
     (links, renames, "exists"), and spec Q8 answered for Linux by the
     maintainer, Obsidian's behaviour on Linux observed first (ADR 0009);
   - child web views under Wayland: observed, and the GTK builder wry
     documents for Wayland tried; what does not work is shown as not
     working, never a blank pane;
   - cloud placeholders on Linux: `[OPEN]` (ADR 0043);
   - the tutorial's keys with Ctrl, as on Windows.
8. **The order of work, when the port starts:** the machines and
   `check-linux-vm.sh`, and the WebKit suite in a container (no product
   code: they show how much the engine needs); then packaging and the
   integration with the system; `verso-fs`; the updater; the release job;
   the engine's pass last, its size known by then.

## Consequences

- What the Windows port did serves Linux at no cost: the cross-platform
  checklist, `/` paths, names every OS can keep, the index in transactions
  per run, Ctrl where macOS has ⌘, the updater's code shared between Windows
  and Linux, a configuration directory that tests can name, and the ADR,
  script and CI job to copy.
- More machines on the Proxmox host: about 4 GB of memory each while
  running, and disk only for what they write (thin provisioning).
- The engine is the unknown: if WebKitGTK behaves as WebKit does on the
  Mac, Linux costs less than Windows did; if not, about the same. The first
  step exists to measure it.
- A person on a distribution older than the build base cannot run the
  `.deb` or the `.rpm`; the AppImage is the one to try there, and on any
  distribution not packaged.
- The roadmap points to this ADR from its Linux line, as it points to 0069.

## Discarded alternatives

- **One package per distribution**: the maintainer asked which distribution
  the Linux version is made for; the author answered, from Obsidian's and
  Tauri's documentation, that one build serves them all (Decision 2).
- **Arch as the "very different" distribution**: raised by the author in
  session and set aside — Fedora tests more of what matters here (the
  `.rpm`, SELinux, KDE) and has more users.
- **Flatpak first**: raised by the author in session (Decision 2).
- **A virtual machine for the oldest base**: raised by the author in
  session — the build only needs that base's libraries, which a container
  gives; the machines are for running the app.

## Status

Proposed. The port waits, by the maintainer's word on 2026-10-08 ("deixe
pra depois"); ADR 0022 is unchanged (Linux after Phase 2) until the
maintainer revises it. `[OPEN]`: ARM64; the supported versions of each
distribution; two or three machines; real hardware for the GPU check; when
`check-linux-vm.sh` is required before a push; the updater on Linux (our
own, the package manager, or Tauri's plugin with signing); signing the
packages; where the index and the log live on Linux (ADR 0011:
`$XDG_CONFIG_HOME/verso` today — a cache may belong in `$XDG_CACHE_HOME` or
`$XDG_STATE_HOME`); where Claude Desktop on Linux reads its settings;
cloud placeholders on Linux;
Snap; Wayland native or X11 forced where child web views need it;
case-only names (spec Q8).
