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
  location of the index, `[OPEN]` — answered on 2026-10-09:
  `~/.config/verso`, Status), [0029](0029-guardrails-in-ci.md)
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
  (496, 591); today no release asset names `linux`, so the Linux app finds
  no package at all (292–337); once one exists, the asset list puts an
  AppImage first (315–316), which would be opened as a ZIP; an AppImage is
  replaced through `current_exe()` (861–863),
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
  (wry's documentation, [0.56](https://docs.rs/crate/wry/0.56.0); the
  lock holds 0.55.1); NVIDIA under Wayland may show
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
*(History: the port started on 2026-10-09 and shipped in 0.6.0-beta.1
the same day; what the maintainer answered is in Status.)*

1. **x64 first.** ARM64 Linux (Raspberry Pi, ARM laptops) is a question,
   not a plan: `[OPEN]`. *(Answered on 2026-10-09: built beside x64 once
   the repository is public — Status.)*
2. **One build, three packages:** an AppImage for every distribution, a
   `.deb` for the Debian family (Debian, Ubuntu, Mint, Pop!_OS), an `.rpm`
   for Fedora and its family — the three out of one `tauri build`. This
   answers the maintainer's "feita pra qual distro?": for none in
   particular, as Obsidian. Flatpak is left for later: a Flatpak needs
   Flathub's review and a filesystem permission for the folders, and the
   command line and the MCP server, which a client starts as a program,
   would live inside the sandbox or need a second package.
3. **Built on Ubuntu 22.04, in a container:** the oldest base of the
   family, so the packages run on Ubuntu 22.04 and later, Debian 12 (now
   under LTS) and later, and current Fedora. The Debian 12 container of `check-linux.sh`
   keeps checking; it does not build what is shipped. The supported
   versions are a question: `[OPEN]`. *(Answered on 2026-10-09: no
   published list, the floor WebKitGTK 4.1 — Status.)*
4. **Tested on virtual machines on the Proxmox host**, set up unattended
   (Ubuntu's autoinstall, Fedora's kickstart, Debian's preseed), with
   snapshots and SSH by key, as the Windows machine is. The maintainer
   asked about two — the most used distribution and a very different one —
   and whether Debian would be covered; the author answered that Ubuntu
   covers the Debian family's packaging but not Debian's older libraries,
   and proposed three, all set up when the port starts (Decision 8):
   - **Ubuntu's current LTS, GNOME on Wayland** (26.04 today): the most
     used desktop; the `.deb` and the AppImage;
   - **Debian's oldest release still supported, GNOME** (12 today —
     oldstable, under LTS from 2026-07-11 until 2028-06; Debian 13 is the
     current stable, and no machine runs it): an older WebKitGTK, GStreamer
     and Mesa, and a bare system (codecs, clipboard tools not installed);
   - **Fedora's current release, KDE Plasma** (44 today; Wayland only
     since Fedora 40): the other family — the `.rpm`, SELinux, KDE instead
     of GNOME, newer libraries.

   Two or three machines: `[OPEN]`. No GPU in a virtual machine: the window
   renders in software there, good for correctness, not for the board's
   frame rate; NVIDIA on Wayland needs real hardware, which no machine here
   provides: `[OPEN]`. *(Answered on 2026-10-09: the three machines, set
   up when the port started; the NVIDIA check on the maintainer's
   desktop — Status.)*
5. **`scripts/check-linux-vm.sh`**, beside `check-linux.sh` and
   `check-windows.sh`: the same tree byte for byte to a VM, the package
   built and installed, the app launched; and the end-to-end suite's WebKit
   project run in a Linux container with Node beside Rust, whose Playwright
   WebKit is its own build of the GTK and WPE ports (Playwright's
   `browser_patches/webkit`) — near the Linux app's engine at no machine's
   cost. When it is required before a push, as `check-windows.sh` is when
   platform code changes (0069, item 5): `[OPEN]`. *(Answered on
   2026-10-09: only when it makes sense or for a closed package —
   Status.)* ADR 0029's list of local
   scripts gains it when it lands.
6. **CI when the port lands:** the pull-request job stays; a release builds
   and publishes the three packages beside macOS's, and Windows's once its
   release job exists.
7. **What the port brings, each with a test:**
   - the `linux` bundle section, and the beta beside the release: today both
     would install `/usr/bin/verso-app` and collide in a `.deb`/`.rpm`;
   - the updater's Linux path: fixed (the asset by format, the AppImage
     replaced through `$APPIMAGE`, the file the AppImage documentation
     names for it ([AppImage](https://docs.appimage.org/packaging-guide/environment-variables.html))), or left to the package manager for `.deb` and `.rpm`,
     or Tauri's updater plugin — set aside by ADR 0055 while the repository
     is private, it updates AppImage, `.deb` and `.rpm` since its 2.10.0
     and always requires a signature
     ([changelog](https://v2.tauri.app/release/updater/all-versions/)) (signing is ADR 0051's): `[OPEN]`
     *(answered on 2026-10-09: the asset by format, signed with ADR
     0055's release key — Status, "As built")*;
   - one instance — missing on Windows too, so one piece of work for both;
   - the command line on `PATH` without root (`~/.local/bin`, in the XDG
     base directory specification since 0.8,
     [XDG](https://specifications.freedesktop.org/basedir/latest/));
   - "Show in folder" selecting the file (the file manager's D-Bus
     interface `org.freedesktop.FileManager1`, Nautilus and Dolphin among
     its implementations,
     [freedesktop](https://wiki.freedesktop.org/www/Specifications/file-manager-interface/),
     else the folder); the menu
     item named per OS (Finder, Explorer, the file manager) — Windows
     included; "Copy full path" saying what to install when no clipboard
     tool is there;
   - "Add to Claude": Claude Desktop for Linux is in beta for Ubuntu and
     Debian ([Anthropic](https://claude.com/download)); where it reads its
     settings is not documented — `~/.config/Claude` is observed on a real
     install before it is relied on: `[OPEN]` *(answered on 2026-10-09:
     taken to be `~/.config/Claude`, to be observed — Status)*;
   - the periodic scan when the inotify watch limit runs out (ADR 0044);
   - network file systems: detected on Linux too, or recorded as not
     detected — ADR 0029 avoided a list of file system names on macOS,
     and Linux offers no flag like `MNT_LOCAL`;
   - extended attributes under SELinux: observed on the Fedora machine;
   - case: the tests that matter where two names differ only in case
     (links, renames, "exists"), and spec Q8 answered for Linux by the
     maintainer, Obsidian's behaviour on Linux observed first (ADR 0009);
   - child web views under Wayland: observed, and the GTK builder wry
     documents for Wayland tried; what does not work is shown as not
     working, never a blank pane;
   - cloud placeholders on Linux: `[OPEN]` (ADR 0043) *(answered on
     2026-10-09: none on Linux — Status)*;
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

**Shipped in 0.6.0-beta.1 on 2026-10-09** (`CHANGELOG.md`; pull request
#41, merged in 51f89f6): x64, as an AppImage, a `.deb` and an `.rpm`. The
items the maintainer answered on 2026-10-09 are listed below. Still
`[OPEN]`: Snap; Wayland native or X11 forced where child web views need
it; case-only names (spec Q8).

*(History, the status before the port shipped:)* Proposed. The port waits, by the maintainer's word on 2026-10-08 ("deixe
pra depois"); ADR 0022 is unchanged (Linux after Phase 2) until the
maintainer revises it *(revised on 2026-10-12:
[0022](0022-target-platforms-macos-first.md) records Linux shipped in
Phase 3, on 2026-10-09)*. **The port started on 2026-10-09**, by the
maintainer's word ("começar a trabalhar na versão Linux … eu confio na sua
seleção e também na implementação"): the three machines of item 4, set up
from the distributions' cloud images with cloud-init (`verso-linux-vm`,
outside the repository, as `verso-windows-vm`), and the order of item 8.
The core and the command line keep running without a display; only the
window needs one. **Answered by the maintainer on 2026-10-09**:
- ARM64 is built beside x64 — once the repository is public: GitHub's ARM
  runners serve public repositories, so until then the release builds x64
  alone (the maintainer, 2026-10-09: "se no GitHub Actions não tem o ARM
  para projeto privado, a gente espera … para quando a gente for tornar
  público").
- The versions follow Obsidian's lead: no published list. The floor is
  WebKitGTK 4.1, the library Tauri needs — Ubuntu 22.04, Debian 12,
  Fedora 36 and later.
- The NVIDIA-on-Wayland check runs on the maintainer's desktop, with a
  package.
- `check-linux-vm.sh` is not required before every push, only when it
  makes sense or for a closed package.
- Updates are signed with the release key of ADR 0055 (revised
  2026-10-09).
- Claude Desktop's settings are taken to be in `~/.config/Claude`
  (third-party guides; Anthropic's documents name only macOS and
  Windows), to be observed on a real install before it is relied on.
- Cloud placeholders: none on Linux — no system-level "online only"
  files, so a note is read as any file.
- The index and the log stay in `$XDG_CONFIG_HOME/verso` (`~/.config/verso`),
  as Obsidian keeps `~/.config/obsidian`.

`[OPEN]`: Snap; Wayland native or X11 forced where child web views need it;
case-only names (spec Q8).

**As built on 2026-10-09** (branch `feat/linux-port`, not merged when
written; merged by pull request #41, 51f89f6, and released in
0.6.0-beta.1):
- **The machines:** Ubuntu 26.04 with GNOME, Debian 12 with GNOME, Fedora 44
  with KDE Plasma, each with a `provisioned` snapshot. Fedora 44's KDE logs
  in through `plasmalogin`, not sddm, and runs the `plasma-setup` wizard
  until `/etc/plasma-setup-done` exists.
- **The packages:** the `linux` bundle section (`.deb` and `.rpm` depend on
  `xdg-utils`; the `.rpm` in zstd, about three times faster to build than
  the default gzip at the same size; the AppImage carries no GStreamer); the beta installs as
  `verso-app-beta` and `verso-beta`, beside the release.
- **The integration:** a package puts the command line in `/usr/bin`, and
  Settings says so instead of offering to install it; the beta takes
  `verso-beta`, never the release's `verso` beside it. The AppImage puts a
  script in `~/.local/bin`, under the command's name, that runs the
  command line inside the AppImage (`verso-app --cli`), so it follows the
  AppImage when it updates itself. "Show in file manager" asks the file manager over
  D-Bus to select the file, else opens the folder with `xdg-open`; the item
  is named per OS (Finder, File Explorer, file manager). "Copy full path" names `wl-clipboard` or `xclip` when
  neither is there.
- **The window:** a folder's window has no system title bar, as on
  Windows — the app draws minimize, maximize and close at the top right
  (ADR 0072, item 3: "until its port"). The maintainer, on 2026-10-09,
  on GNOME and KDE: "essa barra é gigantesca … muito espaço inútil". The
  window is built hidden and shown once built: tao shows a window before it
  turns its decorations off, and KDE's KWin kept its own bar (tao's issue
  "with_decorations(false) doesn't work on wayland kde"). Seen without the
  bar on Ubuntu 26.04 and Debian 12 (GNOME) and Fedora 44 (KDE).
- **The watcher:** when inotify runs out of watches or descriptors as the
  folder is opened, it watches the folder by polling every 30 seconds. Run
  out later (a new subfolder past the limit), it does not switch yet.
- **The updater:** the asset by format — the AppImage when the app runs
  from one (`$APPIMAGE`), else a `.deb` where `/etc/debian_version` exists,
  else an `.rpm`. The AppImage is written beside itself, flushed, and
  renamed over itself (the file is flushed, its directory is not, as on
  macOS and Windows); a `.deb` or `.rpm` is saved under its own name to
  the Downloads folder the desktop names (`user-dirs.dirs`), for the
  package manager.
- **The release job:** x64 on `ubuntu-22.04`; it builds the three
  packages and the command line's archive, signs them and checks the
  signatures. It has not run yet *(when written; it then ran for
  0.6.0-beta.1, tag `v0.6.0-beta.1`)*.
- **The engine:** the end-to-end suite's WebKit project, in Playwright's
  Linux container, passed 179 of 179. One product fix was needed: a board
  took Excalidraw's state from before it had loaded the board (a white
  background) as the board's own, so its real background counted as an
  edit and the board was written. Three tests were adjusted for the item's
  name per OS and the grip's hover timing.
- **Observed:** the `.rpm` installs and opens on Fedora 44 (KDE, Wayland);
  the AppImage opens on Ubuntu 26.04 (GNOME). Tauri's AppImage sets
  `GDK_BACKEND=x11` (its GTK plugin, Tauri issue 8541), so it runs under
  XWayland. Its log says GStreamer's `appsink` is missing, so a video in a
  note has not been checked there. A `.deb` built on Ubuntu 26.04 does not
  run on Debian 12 (glibc 2.38 and 2.39 asked, 2.36 there), as item 3
  expected; the beta's `.deb` built as the release job builds it, in an
  `ubuntu:22.04` container, installs and opens there (GNOME, Wayland). In
  that rehearsal the AppImage step hung on Tauri's download of its tools,
  on that machine's network; the release job's runners are to show it.
- **Not yet observed:** child web views under Wayland, NVIDIA, case-only
  names, SELinux's extended attributes, network file systems, one
  instance, and "Add to Claude".

*2026-10-21* — the maintainer marked, in the decisions questionnaire of 2026-10-20 (answered 2026-10-21), all option A: **0071.snap** `[DECIDED 2026-10-21]` no Snap for now (the `.deb`, `.rpm` and AppImage are enough; Snap's confinement complicates folders and child web views); **0071.wayland** `[DECIDED 2026-10-21]` observe, and show "does not work" where it does not, as this ADR says; **0071.case** `[DECIDED 2026-10-21]` names differing only in case: after V1, observing Obsidian on Linux first ([0009](0009-external-constraints.md)); **0071.all** `[DECIDED 2026-10-21]` the ADR is **Accepted** as a whole, already shipped in 0.6.0-beta.1. Nothing is `[OPEN]` any more in this Status.
