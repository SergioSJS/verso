# ADR 0118 — A native Android app from the same core and UI

- Date: 2026-11-08
- Source: the maintainer, in session on 2026-11-08: *"Eu estou pensando em a
  gente já começar essa implementação dessa primeira versão do APK"* (I am
  thinking we start implementing this first version of the APK now); on
  whether the server part has to go, *"A parte do servidor precisa sair?
  Hoje em dia a gente tem muitas pessoas usando o celular como mini
  servidores"* (does the server part have to go? Many people use their phone
  as a mini server nowadays). The strategy, the storage of v1, the list of
  what is off and sync only while open (items 2, 4, 5, 6) were decided the
  same day in the session that planned this, his words not kept verbatim.
  The build facts are from a reading of the code at `cce63611b`
  (`feat/android`, made from `feat/app-server`).
- Related: [0073](0073-self-hosted-server-first.md) items 8 and 12 (native
  mobile is Tauri 2 mobile from the same UI and core, never a separate code
  base; "native mobile if needed", last), [0023](0023-stack-core-and-editor.md)
  (Tauri v2, desktop and mobile), [0022](0022-target-platforms-macos-first.md)
  (Android a target; per-platform limits fine when explicit),
  [0026](0026-core-ui-contract-inviolable-rules.md) rules 4–5 and
  [0044](0044-verso-fs-semantics.md) (opaque handle; the Android SAF URI
  left for a native mobile client), [0027](0027-runtime-capabilities.md)
  (capabilities), [0076](0076-the-window-on-every-screen.md) (phone layout,
  built), [0092](0092-the-phone-offline.md) (PWA offline; the sync engine
  ported to TypeScript), [0115](0115-an-embedded-terminal-in-the-desktop-app.md),
  [0116](0116-music-and-sound-at-the-table-heard-by-everyone.md) (terminal,
  audio capture: desktop), [0117](0117-this-app-is-a-universo-server.md)
  (this app is a UniVerso; `cloudflared`), [0055](0055-in-app-updater.md)
  (updater), [0065](0065-a-folder-per-window.md) (windows),
  [0104](0104-external-cloud-storage-transports-and-quotas.md) (WebDAV, S3,
  keys in the keyring), [0097](0097-universo-found-on-the-network-and-a-bad-dns-survived.md) (the app's resolver),
  [0009](0009-external-constraints.md).
- Status in the briefing: §9 "Shell: Tauri v2 (desktop and mobile)"
  `DECIDED`; "Initial mobile: web client (PWA)" `DECIDED` — this ADR adds a
  native client beside the PWA, it does not replace it.

## Context

The phone reaches Verso today through the window a UniVerso serves (0073
item 8, 0076), offline since 0092. 0073 left a native app last in Phase 3's
order, "if needed", from the same UI and core. The maintainer asks to start
it now, and to keep what makes Verso a server (0117) on the phone.

The briefing's mobile constraints (§4): bulk work through
Android's Storage Access Framework (SAF) is slow; background work is
restricted by the OS; no Node; no resident process. Rules 4–5 of 0026 and
0044 left open how a native mobile client holds access (a SAF URI is not a
path). 0092's offline window runs a TypeScript port of the sync engine, held
to the Rust engine's vectors: two engines already exist because the core
does not run in the browser.

## Decision

### 1. Start a first Android APK now `[DECIDED 2026-11-08]`

*"Eu estou pensando em a gente já começar essa implementação dessa primeira
versão do APK."* This moves 0073 item 12's "native mobile if needed"
forward for Android; the iPad stays in the browser (0073 Status, 0073.ipad,
2026-10-21). Phases in item 9.

### 2. Tauri 2 Android: the same Rust core and the same web UI `[DECIDED 2026-11-08]`

The app is `app/src-tauri` built for Android, with `app/ui` unchanged in
its WebView, as 0073 item 8 and 0023 said. Weighed and rejected (Discarded
alternatives): a WebView shell with the core in wasm, Kotlin with UniFFI,
Flutter or React Native.

### 3. The phone can be a server: 0117 on Android `[DECIDED 2026-11-08]`

*"Hoje em dia a gente tem muitas pessoas usando o celular como mini
servidores."* 0117 extends to Android: the in-process local server on the
LAN, the seat, accounts, invitations and the internet link, as on desktop.
How, from the platform's rules (`Constraint` unless marked):

1. **mDNS** while pairing needs a `WifiManager.MulticastLock` held for that
   time.
2. **Serving with the screen off**: an Android foreground service with a
   persistent notification, in a small Kotlin Tauri plugin; it keeps the
   **server** alive, nothing else (item 6). Its `foregroundServiceType`
   (required since Android 14; `dataSync` is capped at 6 hours a day on
   Android 15, `specialUse` needs a Play justification) is `[OPEN]`.
3. **The internet link**: `cloudflared` **shipped inside the APK** as a
   native library under `jniLibs/` and run from the app's native library
   directory. An app targeting API 29+ cannot execute a file it wrote to its
   own data (Android 10's W^X rule), and Play allows code shipped in the
   package, not code downloaded. The download of 0117 D11 item 5 stays for
   desktop. Whether Cloudflare's `linux-arm64` build runs as is on Android
   or a build for `GOOS=android` is needed is for the spike (`[OPEN]`).
4. On **mobile data** only the Cloudflare link reaches the phone (carrier
   NAT); the LAN mode needs Wi-Fi.
5. While serving, the app says it drains the battery and heats the phone,
   and suggests charging.

0117 gets a dated line pointing here.

### 4. Where notes live in v1 `[DECIDED 2026-11-08]`

1. **A folder in the app's private storage** — a POSIX directory, so
   `verso-fs` works unchanged (atomic rename, `fsync`, the watcher) —
   synced with a UniVerso (0079), WebDAV or S3 (0104) by the **same Rust
   sync engine** as desktop.
2. **A window on a UniVerso folder**, as the desktop app opens one (0074
   item 8).
3. **A folder the person picks in shared storage** (a SAF `content://`
   tree) is **deferred**: it needs a new `verso-fs` backend (no atomic
   rename, no inotify, slow bulk listing). The open item of 0026 rule 4 and
   0044 (how a SAF capability crosses) stays open.

### 5. What is off on Android `[DECIDED 2026-11-08]`; the seam `[OPEN]`

Off, by the host's capability list (0027: a feature the side cannot do is
not shown):

| Off | Why / instead |
|---|---|
| Terminal (0115) | No shell for the person; no resident process |
| CLI on the `PATH`, MCP install | No `PATH`, no other process to call it |
| Several windows, the loose-files window (0114), pop-outs (0065) | One activity; Android intents later (Phase 2) |
| Native child web views (0056) | The UI's iframe path instead |
| Self-updater (0055) | Play forbids it; whether a sideloaded APK keeps one is `[OPEN]` |
| Tray, native menus, single instance | Replaced later by intents: open a `.md`, share to Verso (Phase 2) |
| Capture of other apps' audio (0116) | Possible later through `AudioPlaybackCapture` (Android 10+); not in v1 |

`[OPEN]`: the seam — a `Host::Mobile` (or equivalent) value the host
reports in its capabilities, `cfg(mobile)` / `cfg(desktop)` in the host
only, or both.

### 6. Sync runs only while the app is open in v1 `[DECIDED 2026-11-08]`

No `WorkManager` job in v1. The foreground service of item 3.2 keeps the
server only; a folder's sync stops when the app goes to the background and
the OS stops it, and resumes when it opens.

### 7. What the build must change (the code at `cce63611b`, facts)

Gated by `cfg(desktop)` or given an Android arm:

| What | Where |
|---|---|
| `tauri-plugin-single-instance` (init and destroy) | `app/src-tauri/src/lib.rs` ~490, ~1135 |
| `pick_folder` — the dialog plugin's folder pick is desktop-only; file picks return `content://` on Android | `lib.rs` ~388–405 |
| `add_child` (native child web view) | `app/src-tauri/src/web.rs` ~332 |
| `unminimize` ×4 | `app/src-tauri/src/loose.rs` 145, 164, 342, 408 |
| `full_name()` has macOS, Linux and Windows arms, none for `target_os = "android"` | `app/src-tauri/src/local_server/owner.rs` ~30 |
| `system_servers()` falls to its empty arm on Android: what the resolver then asks is for the spike | `app/src-tauri/src/dns.rs` ~955 |

Missing: `crate-type = ["staticlib", "cdylib", "rlib"]` under `[lib]` of
`app/src-tauri/Cargo.toml` and `#[cfg_attr(mobile, tauri::mobile_entry_point)]`
on the entry function. Also:

- `app/ui/src/platform.ts` reports Linux on Android (`/Linux/` on
  `navigator.platform`); it needs an Android answer, from the host's
  capabilities rather than the user agent.
- TLS: `rustls-platform-verifier` (through `reqwest`) needs its JNI
  initialisation on Android; `openssl` vendored (for `webauthn-rs`,
  `verso-server`) and `aws-lc-sys` (through `rustls`) must cross-compile with
  the NDK.
- `keyring` needs its Android store feature (0104's keys).
- `verso-core::config_dir()` must point at app-private storage
  (`VERSO_CONFIG_DIR`, or a directory the host passes).
- The tunnel (`app/src-tauri/src/tunnel/fetch.rs`) downloads `cloudflared`
  at run time; on Android it runs the bundled library (item 3.3).

### 8. Still open `[OPEN]`

| # | Question | Recommendation (not decided) |
|---|---|---|
| A1 | `minSdk` | 29 (Android 10): the exec rule of item 3.3 and scoped storage are the floor anyway |
| A2 | Distribution: sideloaded APK, F-Droid, Play | — |
| A3 | Package id: `com.versomd.app` on Android too (0004's bundle id; `.beta` for betas) | — |
| A4 | `verso-server` behind a cargo feature, for a smaller client-only build | — |
| A5 | The TalkBack pass (0035 item 2, 0076 item 9) | — |
| A6 | The seam of item 5; the foreground service type (3.2); `cloudflared`'s build (3.3); the updater on a sideloaded APK (item 5) | — |
| A7 | Whether v1 is in V1's scope or after it (roadmap V.53) | — |

### 9. Phases, each with its acceptance

| Phase | What | Accepted when |
|---|---|---|
| 0 — spike | Android SDK/NDK set up; a debug APK built from `app/src-tauri` with item 7's gates | On a real device over `adb`: opens a folder in private storage; CodeMirror and the board (Excalidraw) measured on the demo vault in Android's WebView; the build breaks found beyond item 7 listed |
| 1 — v1 | Items 3–6: private folder synced with UniVerso / WebDAV / S3; a window on a UniVerso folder; the phone as a server on the LAN and by the bundled link, with the foreground service; the off list; a signed APK | The checks of 0117 that apply, run from the phone; sync's vectors green on Android; both languages; 390×844 and the device's own size |
| 2 — later | Android intents (open a `.md`, share to Verso), a SAF folder import, audio capture, Play Store, iOS | Each by its own decision |

## Consequences

- One code base still (0073 item 8): the Rust core, the sync engine and the
  UI ship to the phone as they are; no third sync engine.
- A folder in private storage is invisible to other apps (Obsidian cannot
  open it) and is **deleted with the app** unless it syncs somewhere; the
  UI says so where such a folder is made.
- Background sync is not there in v1: a phone that edits and closes the app
  sends at the next opening.
- The APK carries `cloudflared` (Apache-2.0): its licence notice ships
  with it, and its version is pinned in the build as 0117 D11 pins the
  download.
- A phone serving on mobile data faces the internet only through the link;
  0117's mitigations (D11 item 8) apply unchanged.
- New platform code (Kotlin plugin, JNI init) enters the host only; the
  `unsafe` guardrail and the `std::fs` confinement are unchanged.

## Discarded alternatives

Weighed in the session of 2026-11-08:

- **A WebView shell (Capacitor) with the core in wasm**: the core does not
  run in wasm (SQLite, the filesystem), and 0092 already had to port sync
  to TypeScript for the browser — a third engine.
- **Kotlin UI with the core through UniFFI**: a rewrite of the UI.
- **Flutter or React Native**: a rewrite of the UI.
- **The phone as a client only** (dropping the server part): the
  maintainer, *"A parte do servidor precisa sair?"* — no.
- **Downloading `cloudflared` on the phone as on desktop**: forbidden by
  the exec rule and by Play (item 3.3).

## Status

**Accepted (2026-11-08)** for items 1–6 in the maintainer's decisions of
that day. Item 7 is a reading of the code, not a decision. Items 3.2's
service type, 3.3's `cloudflared` build, 5's seam and updater, and 8
(A1–A7) are `[OPEN]`; A1's recommendation is Proposed. Phase 0 started on
`feat/android` the same day. Written by an Opus session; awaits the
maintainer's reading; no Fable reading.
