# ADR 0118 — A native Android app from the same core and UI

- Date: 2026-11-08
- Source: the maintainer, in session on 2026-11-08: *"Eu estou pensando em a
  gente já começar essa implementação dessa primeira versão do APK"* (I am
  thinking we start implementing this first version of the APK now); on
  whether the server part has to go, *"A parte do servidor precisa sair?
  Hoje em dia a gente tem muitas pessoas usando o celular como mini
  servidores"* (does the server part have to go? Many people use their phone
  as a mini server nowadays). On the plan that listed the features turned
  off, SAF deferred and the notes in app-private storage (items 2, 4, 5):
  *"Gostei, gostei dos seus adendos, da correção que você mencionou"* (I
  liked it, I liked your additions, the correction you mentioned). Item 6
  has no words of his. The build facts are from a reading of the code at
  `cce63611b` (`feat/android`, made from `feat/app-server`) and, for the
  Fable reading's additions, at `b52019c5c` (line numbers approximate: the
  host is being changed on this branch).
- Revisions: 2026-11-08 — Fable reading: 1 BLOCKING, 9 IMPORTANT, 10 MINOR;
  applied the same day: the Source quotes the acceptance of items 2, 4, 5
  and item 6 goes back to Proposed (B1); item 7 gains the build breaks found
  (I1), TLS (I2) and the configuration directory (I3); the Consequences no
  longer say the `unsafe` guardrail is unchanged, and A8 asks for the
  exception (I3); item 3.2 gains the locks, permissions and the Doze test
  (I4); item 3.3 its mechanics (I5); 0079 item 14, 0117 D12 and 0104 item 1
  get a dated line (I6); A6 gains its recommendation (I7); A9, Android's
  backup (I8); item 9's acceptance gets a device and numbers (I9);
  citations, A1's reasons, A3 as applied, the keyring store, the watch
  limit, the DNS servers, the WebView floor, TalkBack and the briefing row
  (M1–M10).
- Related: [0073](0073-self-hosted-server-first.md) items 2, 8 and 12 (one
  service, one code base; native mobile is Tauri 2 mobile from the same UI
  and core; "native mobile if needed", last),
  [0023](0023-stack-core-and-editor.md) (Tauri v2, desktop and mobile),
  [0022](0022-target-platforms-macos-first.md) (Android a target;
  per-platform limits fine when explicit),
  [0026](0026-core-ui-contract-inviolable-rules.md) rule 4's scope paragraph
  and [0044](0044-verso-fs-semantics.md)'s re-open bullet (a SAF URI is a
  capability still to cross), [0027](0027-runtime-capabilities.md)
  (capabilities), [0076](0076-the-window-on-every-screen.md) (phone layout,
  built), [0092](0092-the-phone-offline.md) (PWA offline; the sync engine
  ported to TypeScript), [0115](0115-an-embedded-terminal-in-the-desktop-app.md),
  [0116](0116-music-and-sound-at-the-table-heard-by-everyone.md) (terminal,
  audio capture: desktop; Q9's `unsafe` exception), [0117](0117-this-app-is-a-universo-server.md)
  (this app is a UniVerso; `cloudflared`), [0055](0055-in-app-updater.md)
  (updater), [0065](0065-a-folder-per-window.md) (windows),
  [0079](0079-sync-a-local-folder-with-a-server.md) (sync),
  [0104](0104-external-cloud-storage-transports-and-quotas.md) (WebDAV, S3,
  keys in the keyring), [0097](0097-universo-found-on-the-network-and-a-bad-dns-survived.md) (the app's resolver),
  [0009](0009-external-constraints.md).
- Status in the briefing: §9 "Shell: Tauri v2 (desktop and mobile)"
  `DECIDED`; "Initial mobile: web client (PWA)" `DECIDED` — this ADR adds a
  native client beside the PWA, it does not replace it. §9 has no row for a
  native Android app; the maintainer may add a v0.x line (not edited here).

## Context

The phone reaches Verso today through the window a UniVerso serves (0073
item 8, 0076), offline since 0092. 0073 left a native app last in Phase 3's
order, "if needed", from the same UI and core. The maintainer asks to start
it now, and to keep what makes Verso a server (0117) on the phone.

The briefing's mobile constraints (§4): bulk work through
Android's Storage Access Framework (SAF) is slow; background work is
restricted by the OS; no Node; no resident process. 0026 rule 4's scope
paragraph and 0044's re-open bullet left open how a native mobile client
holds access (a SAF URI is not a path). 0092's offline window runs a
TypeScript port of the sync engine, held to the Rust engine's vectors: two
engines already exist because the core does not run in the browser.

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
   time (`CHANGE_WIFI_MULTICAST_STATE`).
2. **Serving with the screen off**: an Android foreground service with a
   persistent notification, in a small Kotlin Tauri plugin; it keeps the
   **server** alive, nothing else (item 6). It holds a `PARTIAL_WAKE_LOCK`
   and a `WifiManager.WifiLock` (Wi-Fi sleeps with the screen off). The
   manifest declares `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_<TYPE>` and
   `POST_NOTIFICATIONS` (Android 13+). Its `foregroundServiceType` (required
   since Android 14; `dataSync` is capped at 6 hours a day on Android 15,
   `specialUse` needs a Play justification) is `[OPEN]`; recommended
   (not decided): `specialUse` for a sideloaded or F-Droid APK, Play's
   justification depending on A2.
3. **The internet link**: `cloudflared` **shipped inside the APK** as a
   native library and run from the app's native library directory. An app
   targeting API 29+ cannot execute a file it wrote to its own data
   (Android 10's W^X rule), and Play allows code shipped in the package,
   not code downloaded. The download of 0117 D11 item 5 stays for desktop.
   Mechanics: named `lib….so`; `extractNativeLibs="true"` /
   `useLegacyPackaging = true` so it lands on disk; `jniLibs/` is
   gitignored, so a build step places the pinned binary and runs the
   SHA-256 check (moved from `tunnel/fetch.rs`); the Kotlin plugin hands
   `nativeLibraryDir` to Rust. Play's 16 KB page-size check would reject a
   Go executable (only if A2 = Play). Whether Cloudflare's `linux-arm64`
   build runs as is or a `GOOS=android` build is needed is for the spike
   (`[OPEN]`): test `linux-arm64` first; non-Android Go reads
   `/etc/resolv.conf` (absent) and falls back to `127.0.0.1:53`.
4. On **mobile data** only the Cloudflare link reaches the phone (carrier
   NAT); the LAN mode needs Wi-Fi.
5. While serving, the app says it drains the battery and heats the phone,
   and suggests charging.

0117 gets a dated line pointing here.

### 4. Where notes live in v1 `[DECIDED 2026-11-08]`

1. **A folder in the app's private storage** — a POSIX directory, so
   `verso-fs` works unchanged (atomic rename, `fsync`, the watcher) —
   synced with a UniVerso (0079), WebDAV or S3 (0104) by the **same Rust
   sync engine** as desktop. Risk: inotify's watch limit (about 8192 per
   user on many devices) can be short for a large vault.
2. **A window on a UniVerso folder**, as the desktop app opens one (0073
   item 2, 0079).
3. **A folder the person picks in shared storage** (a SAF `content://`
   tree) is **deferred**: it needs a new `verso-fs` backend (no atomic
   rename, no inotify, slow bulk listing). The open item of 0026 rule 4's
   scope paragraph and 0044's re-open bullet (how a SAF capability crosses)
   stays open.

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

`[OPEN]`: the seam (A6).

### 6. Sync runs only while the app is open in v1 — Proposed `[OPEN]` (maintainer to confirm)

No `WorkManager` job in v1. The foreground service of item 3.2 keeps the
server only; a folder's sync stops when the app goes to the background and
the OS stops it, and resumes when it opens.

### 7. What the build must change (the code at `cce63611b` / `b52019c5c`, facts)

Gated by `cfg(desktop)` or given an Android arm:

| What | Where |
|---|---|
| `tauri-plugin-single-instance` (init and destroy) | `app/src-tauri/src/lib.rs` ~490, ~1135 |
| `pick_folder` — the dialog plugin's folder pick is desktop-only; file picks return `content://` on Android | `lib.rs` ~388–405 |
| `add_child` (native child web view) | `app/src-tauri/src/web.rs` ~332 |
| `unminimize` ×4 | `app/src-tauri/src/loose.rs` 145, 164, 342, 408 |
| `full_name()` has macOS, Linux and Windows arms, none for `target_os = "android"` | `app/src-tauri/src/local_server/owner.rs` ~30 |
| `system_servers()` falls to its empty arm on Android; the DNS servers come from Kotlin (`ConnectivityManager.getLinkProperties().dnsServers`) | `app/src-tauri/src/dns.rs` ~955 |
| The local server serves the UI with `ServeDir` from `resource_dir()/ui-web`; on Android `resource_dir()` is `asset://localhost`, so the phone serves no UI. Fix: copy `ui-web` out of the APK's assets into the private directory on first run (a declared `std::fs` exception, host side) or embed `dist-web` on Android | `crates/verso-server/src/http.rs` ~318; `local_server/platform.rs` ~24–26 |
| The link's watcher spawns `/bin/sh` (absent; Android has `/system/bin/sh`) | `tunnel/run.rs` ~339–355 |
| `open_in_browser` runs `xdg-open`: UniVerso sign-in never opens a browser. Fix: `tauri-plugin-opener` or an Intent; the same in `files.rs` ~510–555 and `cli.rs` ~449–454 | `remote.rs` ~523–535 |
| `capabilities()` answers the same on every platform: the seam (A6) | `lib.rs` ~620–660 |
| `pick_asset` falls to `linux` | `update.rs` ~206–211 |
| The device's name via `scutil` / `hostname`; on Android from Kotlin (`Build.MODEL` or the `device_name` setting) | `device.rs` ~64–68 |
| Direct `verso_core::config_dir()` callers | `log.rs` ~47, `tunnel/mod.rs` ~841, `local_server/platform.rs` ~21 |

Missing: `crate-type = ["staticlib", "cdylib", "rlib"]` under `[lib]` of
`app/src-tauri/Cargo.toml` and `#[cfg_attr(mobile, tauri::mobile_entry_point)]`
on the entry function. Also:

- `app/ui/src/platform.ts` reports Linux on Android (`/Linux/` on
  `navigator.platform`), read in 10 places (`settings.ts`,
  `agentControls.ts`, `audio/source.ts`, `table/sound/sharePick.ts`, …);
  it needs an Android answer, from the host's capabilities (A6).
- **TLS**: `tokio-tungstenite` with `rustls-tls-native-roots`
  (`app/src-tauri/Cargo.toml` ~71; `remote.rs` ~906–918; `reach.rs` ~326)
  finds no roots on Android (`openssl-probe`), so every `wss://` fails. Fix:
  a `Connector` from a rustls `ClientConfig` with `rustls-platform-verifier`,
  whose Kotlin component goes into Gradle and which needs
  `init_with_env` / `init_with_runtime`. `ring` is the installed default
  provider (`crates/verso-server/src/lib.rs` ~254–256); `aws-lc-sys` comes
  only through `reqwest`'s `rustls` feature, and `rustls-no-provider` would
  spare its NDK build. `openssl` vendored (`webauthn-rs`, `verso-server`)
  must cross-compile with the NDK.
- `keyring` needs its Android store (`android-native-keyring-store`, 0104's
  keys), initialised with the same Android context.
- **The configuration directory**: edition 2024 makes `std::env::set_var`
  `unsafe`, so `VERSO_CONFIG_DIR` is no route. The host passes the
  app-private directory (`Service::new(Some(app_config_dir))`), and the
  direct callers in the table take it too.
- **JNI**: the verifier's and the keyring's initialisation need a `JavaVM`;
  `JavaVM::from_raw` is `unsafe` unless Tauri hands one safely (A8).
- The tunnel (`app/src-tauri/src/tunnel/fetch.rs`) downloads `cloudflared`
  at run time; on Android it runs the bundled library (item 3.3).
- The manifest drops the generated `LEANBACK_LAUNCHER` category (no TV
  build); the Android System WebView has a version floor, named in the
  spike.

### 8. Still open `[OPEN]`

| # | Question | Recommendation (not decided) |
|---|---|---|
| A1 | `minSdk` (generated: 24; `targetSdk` 36, which is what brings the W^X rule) | 29 (Android 10): the keyring's Android store, a recent WebView, `AudioPlaybackCapture` |
| A2 | Distribution: sideloaded APK, F-Droid, Play | — |
| A3 | Package id: `com.versomd.app` on Android too (0004's bundle id; `.beta` for betas) | Applied in the build (`applicationId = "com.versomd.app"`); `.beta` needs an `applicationIdSuffix` |
| A4 | `verso-server` behind a cargo feature, for a smaller client-only build | — |
| A5 | The TalkBack pass (0035 item 2, 0076 item 9) | Part of Phase 1's acceptance (item 9) |
| A6 | The seam of item 5; the foreground service type (3.2); `cloudflared`'s build (3.3); the updater on a sideloaded APK (item 5) | Seam: `Host::Mobile` reported by the host in its capabilities (the UI reads capabilities, never the user agent — 0026 rule 2) plus `cfg(target_os = "android")` gates in the host. A contract change: bindings regenerated, the N/N-1 compatibility window applies. Service type: 3.2 |
| A7 | Whether v1 is in V1's scope or after it (roadmap V.53) | — |
| A8 | An `unsafe` exception for one Android JNI-init file, with `SAFETY:` comments (as 0116 Q9), if Tauri gives no safe `JavaVM` | The maintainer's decision |
| A9 | Android Auto Backup: the generated manifest sets no `allowBackup` / `dataExtractionRules`, so the notes, the sync base database and `servers.json` with the device token go to Google's backup | `allowBackup="false"` (or exclusion rules for the folder and configuration directories) |

### 9. Phases, each with its acceptance

| Phase | What | Accepted when |
|---|---|---|
| 0 — spike | Android SDK/NDK set up; a debug APK built from `app/src-tauri` with item 7's gates | On the maintainer's POCO X3 Pro (M2102J20SG, Android 16 / API 36, arm64) over `adb`: opens a folder in private storage; the demo vault measured in Android's WebView — recommended pass numbers, not decided: opens in ≤ 3 s, typing latency ≤ 50 ms on a long note, the board at ≥ 30 fps with ~60 elements, memory ≤ 400 MB; a TLS handshake to a real UniVerso; the Doze test (`adb shell dumpsys deviceidle force-idle` with a client connected: the server still answers); the build breaks found beyond item 7 listed |
| 1 — v1 | Items 3–6: private folder synced with UniVerso / WebDAV / S3; a window on a UniVerso folder; the phone as a server on the LAN and by the bundled link, with the foreground service; the off list; a signed APK | The rows of [`docs/reference/manual-checks.md`](../reference/manual-checks.md) "This app is a server" that apply, run from the phone; sync's vectors green on Android (cross-built host tests or an on-device runner: `[OPEN]`); the Doze test again; TalkBack; both languages, the foreground notification's text included; 390×844 and the device's own size |
| 2 — later | Android intents (open a `.md`, share to Verso), a SAF folder import, audio capture, Play Store, iOS | Each by its own decision |

## Consequences

- One code base still (0073 item 8): the Rust core, the sync engine and the
  UI ship to the phone as they are; no third sync engine.
- A folder in private storage is invisible to other apps (Obsidian cannot
  open it) and is **deleted with the app** unless it syncs somewhere; the
  UI says so where such a folder is made.
- Background sync is not there in v1 if item 6 is confirmed: a phone that
  edits and closes the app sends at the next opening.
- The APK carries `cloudflared` (Apache-2.0): its licence notice ships
  with it, and its version is pinned in the build as 0117 D11 pins the
  download.
- A phone serving on mobile data faces the internet only through the link;
  0117's mitigations (D11 item 8) apply unchanged.
- New platform code (Kotlin plugin, JNI init) enters the host only; the
  `std::fs` confinement gains at most the declared `ui-web` copy (item 7).
  The `unsafe` guardrail is unchanged only if Tauri hands a `JavaVM`
  safely; otherwise it needs A8's exception.
- 0079 item 14, 0117 D12 and 0104 item 1 say "phone" for the window served
  to a phone's browser; the native app has the desktop app's role there
  (it syncs, it may host). Each carries a dated line.

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

**Accepted (2026-11-08)** for items 1–5 in the maintainer's words of that
day (Source). Item 6 is Proposed, `[OPEN]` until the maintainer confirms
it. Item 7 is a reading of the code, not a decision. Items 3.2's service
type, 3.3's `cloudflared` build, 5's seam and updater, 9's pass numbers and
on-device vectors, and 8 (A1–A9) are `[OPEN]`; their recommendations are
Proposed. Phase 0 started on `feat/android` the same day. Written by an
Opus session; Fable reading done 2026-11-08 (Revisions); awaits the
maintainer's reading.
