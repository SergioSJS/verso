# ADR 0119 — An iOS and iPadOS app from the same core and UI, first through AltStore

- Date: 2026-11-10
- Source: the maintainer, in session on 2026-11-10: *"no Brasil foi liberado
  o AltStore, então daria para disponibilizar ali. Só que [isso é] no
  iPhone; para iPad teria que usar o AltStore Classic para poder fazer
  instalações em iPads. Eu acho que é um caminho inicial que a gente pode
  seguir. Qualquer coisa depois a gente vê de conseguir financiamento da
  comunidade pra aparecer na loja oficial. Elabore esse ADR pra versão iOS e
  considere esses dois fluxos. Eu não tenho iPhone pra gente testar, então a
  gente vai ter que testar no iPad. Considere a geração do .ipa. É bem
  provável que a gente tenha que hospedar alguma coisa, um JSON. Pesquise o
  que precisa fazer."* (AltStore was opened up in Brazil, so we could offer
  it there — but on the iPhone; for the iPad we would have to use AltStore
  Classic to install on iPads. I think it is a first path we can take; later
  we may get community funding to appear in the official store. Write this
  ADR for the iOS version and consider both flows. I have no iPhone to test,
  so we will test on the iPad. Consider how the .ipa is made. We will likely
  have to host something, a JSON. Research what has to be done.) The
  external facts are from the pages linked where they are used, read on
  2026-11-10; the build facts from a reading of the code at `c2940cfb6`
  (now on `feat/app-server`).
- Revisions: 2026-11-12 — the maintainer answers part of item 10 (decisions
  doc of 2026-11-12, his recommendations left marked, with his laptop's
  policy pasted for B5); recorded in the table's rows and in Status.
- Revisions: 2026-11-12 — Phase 0 begun in the iOS Simulator ("Phase 0 as
  built so far", after §11); A13's row gets a recommendation; the minimum
  iOS 16.0 is recorded as Proposed.
- Revisions: 2026-11-10 — Fable reading
  ([review](../review/2026-11-10-adr-0119-ios.md)): 0 BLOCKING, 10 IMPORTANT,
  10 MINOR, every code claim held; applied the same day: §8's product rows
  carried from 0118 are Proposed and asked in §10 (I1); 2.5.2 quoted whole
  (I2); the privacy manifest moves to Phase 2 (I3); the iOS differences
  cross as capabilities, and `platform.ts` is listed (I4); the source's
  permissions rule (I5); the Phase 0 numbers cite 0118 (I6); the
  user-visible duties in Phase 1 (I7); each acceptance says how it is
  checked (I8); A2 split into three (I9); what he will be asked for (I10);
  M1–M10.
- Related: [0118](0118-a-native-android-app-from-the-same-core-and-ui.md)
  (the Android app: the seam `Host::Mobile`, the `cfg(mobile)` gates, the
  private folder, the phases this ADR copies),
  [0117](0117-this-app-is-a-universo-server.md) (this app is a UniVerso;
  `cloudflared`), [0073](0073-self-hosted-server-first.md) items 8 and 12 and
  0073.ipad, [0022](0022-target-platforms-macos-first.md) (iOS a target),
  [0023](0023-stack-core-and-editor.md) (Tauri v2, desktop and mobile),
  [0026](0026-core-ui-contract-inviolable-rules.md) rule 4,
  [0027](0027-runtime-capabilities.md), [0043](0043-placeholder-guard.md),
  [0044](0044-verso-fs-semantics.md), [0055](0055-in-app-updater.md),
  [0076](0076-the-window-on-every-screen.md) (phone layout), [0104](0104-external-cloud-storage-transports-and-quotas.md)
  (keys in the keyring), [0051](0051-development-flow-and-releases.md),
  [0009](0009-external-constraints.md).
- Status in the briefing: §9 "Target platforms: macOS, Windows, Linux, iOS,
  Android" `DECIDED`; "Initial mobile: web client (PWA)" `DECIDED` — a
  native client beside the PWA, as 0118. §4 lists the iOS constraints
  (document picker and security-scoped bookmarks; no watcher; restricted
  background).

## Context

0118 (2026-11-08) started a native Android app from `app/src-tauri` and
`app/ui`, and said *"the iPad stays in the browser"* (0118 item 1, after
0073.ipad of 2026-10-21: *"it stays in the browser until there is a concrete
complaint"*). The maintainer now asks for the iOS version. He owns an iPad,
no iPhone. 0118's seam serves iOS too: `Host::Mobile` and the off list are
under Tauri's `cfg(mobile)` (`app/src-tauri/src/mobile.rs`), which covers
iOS; Android's own setup is under `cfg(target_os = "android")`
(`src/android.rs`).

Apple's rules in Brazil since 2026-06-18 (CADE settlement):
[Apple Newsroom](https://www.apple.com/newsroom/2026/06/apple-announces-changes-to-ios-in-brazil/),
[App distribution in Brazil](https://developer.apple.com/support/app-distribution-in-brazil),
[Tecnoblog](https://tecnoblog.net/noticias/apple-muda-ios-no-brasil-apos-acordo-com-orgao-regulador/).
Alternative marketplaces for iOS 26.5+; their apps are notarized by Apple
(*"a baseline review that applies to all apps, regardless of their
distribution channel"*); the developer needs the paid Apple Developer Program
and the current agreement accepted by the Account Holder (members of
2026-06-18 had until 2026-07-06; a new member accepts it at enrolment); the
5% Core Technology Commission is on sales only — *"Developers that do not
sell digital goods and services will continue not to pay Apple any
commissions or fees"* (Newsroom). The Brazil pages speak of iOS only; the
[marketplace page](https://developer.apple.com/support/alternative-app-marketplace-br/)
names iPadOS only in an operator's eligibility criterion. Direct
distribution from a developer's own website is **not described** for
Brazil, while the [EU page](https://developer.apple.com/support/dma-and-apps-in-the-eu/)
says *"users in the EU can install notarized iOS and iPadOS apps from
alternative app marketplaces or directly from an authorized developer's
website."*

## Decision

### 1. An iOS and iPadOS app, from 0118's build `[DECIDED 2026-11-10]`

*"Elabore esse ADR pra versão iOS."* Tauri 2 iOS from the same Rust core and
`app/ui` in WKWebView, as 0118 item 2. This moves 0073.ipad and 0118 item
1's *"the iPad stays in the browser"*; the PWA stays beside it.

### 2. Two first flows; the App Store later `[DECIDED 2026-11-10]`

1. **iPhone: AltStore PAL**, in Brazil.
2. **iPad: AltStore Classic**, sideloaded, from a source JSON we host.
3. **The official App Store later**, perhaps with community funding
   (*"financiamento da comunidade"*); how is `[OPEN]` (B9).

### 3. Tested on his iPad `[DECIDED 2026-11-10]`

*"A gente vai ter que testar no iPad."* AltStore PAL needs an iPhone in
Brazil on iOS 26.5+, so the maintainer cannot verify flow 2.1 himself (B4).
How the iPhone's layout is checked without one is A10.

### 4. The two flows, as they are (`Constraint`)

| | AltStore PAL (2.1) | AltStore Classic (2.2) |
|---|---|---|
| Where | EU, Japan, Brazil only ([PAL v. Classic](https://faq.altstore.io/altstore-pal-v.-altstore-classic.md)); in Brazil: physically there, Safari, a Brazilian App Store account, iOS 26.5+ ([9to5Mac, 2026-06-18](https://9to5mac.com/2026/06/18/altstore-pal-now-available-in-brazil-as-apple-flips-the-switch-on-alternative-marketplaces/)) | Worldwide |
| iPad | Not stated for Brazil by Apple or AltStore; PAL fixed iPad icon bugs ([release notes](https://faq.altstore.io/release-notes/altstore-pal.md) 2.2, 2.3.1), the EU covers iPadOS | iPhone or iPad ([install, macOS](https://faq.altstore.io/altstore-classic/how-to-install-altstore-macos.md)) |
| Developer account | Paid Apple Developer Program ([Distribute with PAL](https://faq.altstore.io/developers/distribute-with-altstore-pal.md)) | None: *"distribute apps for free without a paid Apple Developer account"* ([Distribute with Classic](https://faq.altstore.io/developers/distribute-with-altstore-classic.md)) |
| Review | Apple notarization | None: *"Installs any .ipa file"* |
| What we ship | Apple's Alternative Distribution Package (ADP), hosted unchanged | An `.ipa` |
| On the device | No expiry, no app limit, no computer | The user's Apple ID signs it: 7-day expiry, 3 apps per device, 3 devices, 10 App IDs ([Apple, personal team](https://developer.apple.com/support/compare-memberships); [App IDs](https://faq.altstore.io/altstore-classic/app-ids.md)); AltServer (macOS 11+ or Windows) on the same Wi-Fi refreshes during the week ([AltServer](https://faq.altstore.io/altstore-classic/altserver.md)); Developer Mode on iOS 16+ |
| Fees | AltStore 0%; Apple 5% on sales only ([Fees](https://faq.altstore.io/developers/fees.md)); Verso sells nothing | AltStore 0%; Apple none |

SideStore ([sidestore.io](https://sidestore.io)) refreshes without a
computer after setup; mentioned only, not weighed.

### 5. What the developer does (facts)

**PAL** ([Distribute with PAL](https://faq.altstore.io/developers/distribute-with-altstore-pal.md),
[REST API](https://faq.altstore.io/developers/rest-api.md),
[App Store Connect](https://developer.apple.com/help/app-store-connect/managing-alternative-distribution/manage-distribution-on-an-alternative-app-marketplace/)):
`POST https://api.altstore.io/register` with the Developer ID → a token;
App Store Connect › Users and Access › Integrations › Marketplace › add the
token, choose the apps, "send notifications"; App Review › Review Type ›
**Notarization**; download the ADP (`GET https://api.altstore.io/adps/<id>`)
and host it **unchanged** (directory tree, hashes, `manifest.json` byte for
byte); the source's `downloadURL` is the ADP's `manifest.json`, and the app
needs `marketplaceID`. AltStore PAL's [app guidelines](https://faq.altstore.io/developers/app-guidelines.md):
Apple's notarization guidelines, honest metadata, legal and IP rights.

**Classic**: host the `.ipa` and a source JSON ([Make a Source](https://faq.altstore.io/developers/make-a-source.md)).
Required: `name`, `apps[]` (`name`, `bundleIdentifier`, `developerName`,
`localizedDescription`, `iconURL`, `versions[]` — `version` =
`CFBundleShortVersionString`, `buildVersion` = `CFBundleVersion`, `date`
ISO 8601, `downloadURL`, `size` in bytes — and `appPermissions` with
`entitlements` and `privacy`); `nsfw` is not marked optional; the format has
**no checksum field**. iPad screenshots need `width`/`height`;
`fediUsername` (source) and `marketplaceID` (app; *"Not required for
non-notarized apps distributed with AltStore Classic"*) are unmarked too.
*"AltStore requires that sources list **all** entitlements and privacy
permissions for every app"* and *"will refuse to install any app whose
permissions do not match"*: the release step reads both lists from the built
`.ipa` (its entitlements and every `…UsageDescription` key of its
`Info.plist`), never typed by hand. Whether one source can carry both the
Classic `.ipa` and the PAL package of the same app is to be observed. The
texts below are English only, for a Brazilian audience: both languages in
one text, or one source per language, is part of Phase 1 (I7). A minimal
source for Verso (Proposed; URLs per B3; the permissions are placeholders
until a build fills them):

```json
{
  "name": "Verso",
  "subtitle": "Markdown notes, boards and the table",
  "website": "https://versomd.com",
  "iconURL": "https://versomd.com/altstore/icon.png",
  "nsfw": false,
  "apps": [{
    "name": "Verso",
    "bundleIdentifier": "com.versomd.app",
    "developerName": "Sérgio J. Sousa",
    "localizedDescription": "Notes in Markdown, compatible with Obsidian.",
    "iconURL": "https://versomd.com/altstore/icon.png",
    "category": "utilities",
    "screenshots": { "ipad": [{ "imageURL": "https://versomd.com/altstore/ipad-1.png", "width": 2064, "height": 2752 }] },
    "versions": [{
      "version": "0.8.5",
      "buildVersion": "1",
      "date": "2026-11-10",
      "downloadURL": "https://<B3>/Verso-0.8.5.ipa",
      "size": 0,
      "minOSVersion": "16.0"
    }],
    "appPermissions": {
      "entitlements": [],
      "privacy": { "NSLocalNetworkUsageDescription": "Verso finds and reaches your Verso servers on this network." }
    }
  }],
  "news": []
}
```

### 6. Hosting (facts; the choice is B3)

- This repository is **private** (`gh repo view`: `PRIVATE`), and the
  updater reads its releases (`UPDATE_REPO = "SergioSJS/verso"`,
  `update.rs` 68): an AltStore on a stranger's iPad cannot download a
  private release's asset.
- `versomd.com` is Cloudflare Pages: *"The maximum file size for a single
  Cloudflare Pages site asset is 25 MiB"* ([limits](https://developers.cloudflare.com/pages/platform/limits/)).
  The source JSON, icon and screenshots fit; an `.ipa` likely does not (the
  Android debug APK was 222 MB: 0118 item 9, Phase 0 measured).
- GitHub release assets: *"under 2 GiB"* each ([about releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)).
- Recommended (not decided): the source JSON on `versomd.com/altstore/`;
  the `.ipa` and the ADP on a public host — a public releases-only GitHub
  repository or Cloudflare R2; the SHA-256 of each `.ipa` published beside
  it, since the source carries none.

### 7. Building the `.ipa` (facts, then Proposed)

- Tauri: *"iOS development requires Xcode and is only available on macOS"*;
  `rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim`;
  `brew install cocoapods` ([prerequisites](https://v2.tauri.app/start/prerequisites/)).
  Xcode 27.2 is now installed on this Mac (`xcodebuild -version`); the iOS
  Rust targets are not.
- `crate-type = ["staticlib", "cdylib", "rlib"]` for mobile
  ([migration guide](https://v2.tauri.app/start/migrate/from-tauri-1/));
  0118 added `cdylib` only (`app/src-tauri/Cargo.toml` 15). The
  `#[tauri::mobile_entry_point]` exists (`lib.rs` ~1102).
- `tauri ios build` (the repository pins `@tauri-apps/cli` 2.11.5; read in
  the [2.11.1 source](https://docs.rs/crate/tauri-cli/2.11.1/source/src/mobile/ios/build.rs)):
  `--export-method app-store-connect | release-testing | debugging` (Tauri's
  "ad hoc" is `release-testing`), `--no-sign` (zips the archived `.app` into
  an `.ipa` without Xcode's export), `--archive-only`, `--build-number`; the
  last three are in the source, not in the
  [CLI reference](https://v2.tauri.app/reference/cli/). The IPA lands in
  `src-tauri/gen/apple/build/arm64/<app>.ipa` ([App Store](https://v2.tauri.app/distribute/app-store/)).
  Signing: Xcode's account by default; `IOS_CERTIFICATE`,
  `IOS_CERTIFICATE_PASSWORD`, `IOS_MOBILE_PROVISION` for manual; debugging
  uses an Apple Development certificate, App Store Connect and ad hoc an
  Apple Distribution one ([iOS signing](https://v2.tauri.app/distribute/sign/ios/)).
  Tauri's page says *"Code signing on iOS requires enrolling to the Apple
  Developer program"*; Phase 0's Personal Team route below is Xcode's, not
  documented by Tauri — a failure there is to be expected, not a surprise.
- Per flow (Proposed): **Phase 0** — Xcode's *Personal Team* with his
  personal Apple ID, installed on the iPad over USB (7-day profile, 3 apps);
  **Classic** — an unsigned `.ipa` (`--no-sign`) that AltStore signs with
  the user's Apple ID, or a development-signed one (A9); **PAL** — an Apple
  Distribution build uploaded to App Store Connect for notarization.
- **This Mac** is a Globo work machine whose macOS login uses a work Apple
  ID. Xcode › Settings › Accounts holds its own accounts, separate from the
  login; certificates go to the login keychain. Whether the company's device
  policy (MDM) allows a personal Apple ID in Xcode, a personal device over
  USB and AltServer is `[OPEN]` (B5); none of it is checked here.
- **What he will be asked for**, in the order he meets it (items marked *
  are from knowledge, not a page read on 2026-11-10):
  1. Disk: Xcode's iOS platform (several GB) and iOS artifacts in
     `target/`; `df` before Phase 0, floor 40 GB.
  2. Xcode with his personal Apple ID on this Mac creates a signing
     certificate in the login keychain and registers the iPad to that
     account's Personal Team (B5).
  3. The Personal Team's id lands in the generated Xcode project; with
     `gen/apple` in the repository it must come from the environment, not
     be committed (A11).*
  4. The first build registers `com.versomd.app` to the Personal Team
     (§9).*
  5. On the iPad: Developer Mode (a restart), trusting the developer in
     Settings, and for Classic the Apple ID's password typed into AltServer
     ([install, macOS](https://faq.altstore.io/altstore-classic/how-to-install-altstore-macos.md));
     which Apple ID signs is B10.
  6. The Developer Program (B1): US$99 is the US price, the price in reais
     is not given; enrolment asks for identity verification* and two-factor
     authentication; the name shown is his legal name (B2).
  7. Phase 2: an app record in App Store Connect; whether the name "Verso"
     is free there is unknown (A12).*
  8. PAL also serves the EU and Japan; the EU asks a developer for trader
     details* (B11).
- **CI later**: a macOS runner bills 10× a Linux minute on GitHub
  Actions; local builds until a release flow is decided. An `.ipa` is
  not bit-reproducible (signature, timestamps): the release records the
  commit and the SHA-256.

### 8. iOS against 0118 (each checked)

| 0118 | iOS |
|---|---|
| Android System WebView | **WKWebView**, the macOS app's engine (App Review [guidelines](https://developer.apple.com/app-store/review/guidelines/), cited below by number) |
| Memory: 460 MB idle, 670 MB with a board, on the POCO (0118 item 9, Phase 0 measured; target 400) | iOS ends an app past an undocumented per-device limit (jetsam); `os_proc_available_memory` tells it; the [increased-memory-limit](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.kernel.increased-memory-limit) entitlement helps *"on supported devices"*. A risk until Phase 0 measures the iPad (A1) |
| Foreground service keeps the server (3.2) | **None.** In the background the app has *"five seconds"*, more with `beginBackgroundTask`, then is suspended ([UIKit](https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time)); background modes only *"for their intended purposes: VoIP, audio playback, location…"* (2.5.4). An iOS app that serves does so **only while Verso is on screen**. Whether the iPad serves at all is B12 (Proposed: yes, on screen); the screen lock, listening again after a suspension and a sync left mid-way are A2a–c |
| `cloudflared` bundled as an executable (3.3) | Not as an executable: an iOS app does not start other programs (no source read; to be observed in Phase 0). Guideline 2.5.2 forbids apps that *"download, install, or execute code which introduces or changes features or functionality of the app, including other apps"* — code that arrives or changes the app; it would not forbid a linked, signed library (A3's route). Proposed: the internet link off on iOS in v1 (A3) |
| mDNS with a `MulticastLock` (3.1) | Local Network privacy: `NSLocalNetworkUsageDescription`, `NSBonjourServices`; *"Listening for and accepting incoming TCP connections"* needs no access, sending UDP multicast does and needs the [multicast entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.multicast), *"permission from Apple"* ([TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)). `mdns-sd` (`crates/verso-server/Cargo.toml` 103) sends raw multicast: without the entitlement (believed unavailable to a free Apple ID; to be observed) pairing is by QR/address only (A4). Registering a named service listed in `NSBonjourServices` through Apple's API needs local-network access but not the entitlement (TN3179) |
| Private folder, POSIX (4.1) | Proposed (B13): the same in the app's container; `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` would show its `Documents` in Files (A5). No watcher for outside changes (briefing §4) |
| SAF folder deferred (4.3) | A picked folder or iCloud Drive needs the document picker and security-scoped bookmarks (briefing §4; 0026 rule 4, 0044 still open); the placeholder guard (0043) exists. Proposed (B13): deferred as on Android |
| Keyring's Android store | `keyring` 4.2's `apple-native-keyring-store` has iOS's *"protected data"* store ([docs](https://docs.rs/apple-native-keyring-store/latest/apple_native_keyring_store/)) |
| TLS via the platform verifier with JNI init | `rustls-platform-verifier` uses iOS `Security.framework`; *"no setup"* except on Android ([docs](https://docs.rs/rustls-platform-verifier/latest/rustls_platform_verifier/)); today it is an Android-only dependency |
| Off list (0118 item 5) | Proposed (B14): the same, already by `cfg(mobile)`; the updater stays off (AltStore and the stores update). Android keeps an updater on a sideloaded APK (0118 item 5, decided 2026-11-10); on iOS the AltStore source is that updater |
| Auto Backup off (A9) | iCloud backup of the container: `[OPEN]` (A6) |
| Privacy manifest | `PrivacyInfo.xcprivacy` with required-reason APIs; uploads without one are *"not accepted by App Store Connect"* ([required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)). PAL's build goes through that upload (*"You will still submit apps through App Store Connect"*, [Distribute with PAL](https://faq.altstore.io/developers/distribute-with-altstore-pal.md)), so Phase 2 expects it, with an app record and its questions (export compliance, age rating) — to be confirmed at the first upload |
| App Store later | Account deletion in the app when accounts are made in it (5.1.1(v), read through a summary, not verbatim) |

### 9. What the build must change (the code at `c2940cfb6`, facts)

- Android's setup (configuration directory, log, the phone's folder) is
  `cfg(target_os = "android")` (`lib.rs` 44, 1232); iOS needs its own arm.
- The host's gates name `target_os = "macos"`, so iOS (`target_os = "ios"`)
  falls into the "other" arms: ~17 `cfg(not(any(…)))` sites, e.g.
  `remote.rs` 528 (opens a browser with `xdg-open`), `files.rs` 524–624,
  `cli.rs` 154 (the macOS bundled-CLI branch, Android excluded, iOS not),
  `dns.rs` 955, `audio_share/mod.rs`. Phase 0 lists the breaks as 0118 item
  7 did.
- `staticlib` in `crate-type`; the iOS Rust targets; `tauri ios init`
  (generates `gen/apple`, kept in the repository as `gen/android`).
- The bundle id `com.versomd.app` (0004) must be registered by one Apple
  team, and Phase 0's first build already claims it for the Personal Team;
  re-signing tools are reported to suffix it with the team id (no source
  read; to be observed, A9).
- **The iOS differences cross as capabilities.** iOS and Android answer the
  same `Host::Mobile` and the same `Can` list
  (`crates/verso-contract/src/capabilities.rs` 19–80), but differ here: the
  internet link (A3), the announcement on the network (A4), serving only on
  screen (A2). The host tells Android apart with `cfg!(target_os =
  "android")` (`tunnel/mod.rs` 861); the window must learn it from
  capabilities (0026 rule 2, 0027; 0118 A6), never the user agent — a
  contract change (bindings regenerated, the N/N-1 window). Which values is
  A13.
- `app/ui/src/platform.ts` 8: `MAC` is true on an iPhone or iPad, on
  purpose for the keys (⌘ is Mod with a keyboard); every other reader of
  `MAC` is checked for the iPad in Phase 0.
- TLS: `tokio-tungstenite` uses `rustls-tls-native-roots`
  (`app/src-tauri/Cargo.toml` 74) and the platform verifier is wired for
  Android only (`Cargo.toml` 180–190, `android.rs` 85).
- C dependencies cross-compile for iOS: vendored `openssl`
  (`crates/verso-server/Cargo.toml` 106), `opus`
  (`app/src-tauri/Cargo.toml` 128).
- The `std::process::Command` sites (`remote.rs` 522–534, `files.rs`,
  `tunnel/run.rs`) compile on iOS and fail when run: they are not build
  breaks, so Phase 0 lists them by reading.
- `tauri.conf.json` has no iOS section yet.

### 10. Still open `[OPEN]`

Questions for the maintainer (B) and for the build (A):

| # | Question | Recommendation (not decided) |
|---|---|---|
| B1 | Buy the Apple Developer Program (US$99 a year, [programs](https://developer.apple.com/programs/)) — needed for PAL, not for Classic or Phase 0 | **Decided 2026-11-12:** not now; bought when Phase 1 runs on the iPad (with B2) |
| B2 | Individual or organisation enrolment, and the name AltStore and Apple show | **Decided 2026-11-12:** individual, his name |
| B3 | Where the `.ipa`, the ADP and the source live | **Decided 2026-11-12:** the source JSON at `versomd.com/altstore/`; the `.ipa` in the same public place as the Android APKs (0118 item 9; a public releases-only repo or R2, not yet chosen) |
| B4 | Who checks PAL on an iPhone in Brazil on iOS 26.5+ | — |
| B5 | Whether his employer's policy allows Xcode with a personal Apple ID, the iPad over USB and AltServer on this Mac | **Decided 2026-11-12:** this Mac is his employer's (Thoughtworks); its policy, as he pasted it: the personal Apple ID **only in Xcode › Settings › Accounts**, never signed in to macOS, iCloud Drive off; building and testing allowed; no server open to the Internet on it; the Developer Program never expensed; infosec asked before publishing from it. Phase 0 and the AltServer refresh run here |
| B6 | Which iPad: model, RAM, iPadOS version | **Decided 2026-11-12:** iPad Pro 11-inch (4th generation, M2, 8 GB); the iPadOS version still to read on the device |
| B7 | Whether PAL accepts an app that serves on the LAN (notarization) — answered by Apple's review, not by the maintainer | Submit after Phase 1 |
| B8 | Whether iPadOS is reachable through PAL in Brazil — answered by AltStore or a test | Ask AltStore; observe |
| B9 | The App Store: funding, timing | After PAL |
| B10 | Which Apple ID signs the app on the iPad: his personal one, already on it, or one made for this | **Decided 2026-11-12:** his personal Apple ID, already on the iPad |
| B11 | PAL: Verso listed in Brazil only, or the EU and Japan too (the EU asks for trader details) | — |
| B12 | Whether the iPad is a server at all (0118 item 3 was the phone as a mini server) | **Decided 2026-11-12:** as recommended |
| B13 | Where the iPad's notes live in v1: the app's private folder (as Android, deleted with the app unless synced) or a picked folder / iCloud Drive | **Decided 2026-11-12:** as recommended |
| B14 | The same off list as Android (terminal, CLI, windows, audio capture…); the updater off, the AltStore source updating | **Decided 2026-11-12:** as recommended |
| B15 | A check of the distribution-signed build on his iPad with the paid account: TestFlight (nobody has weighed it yet) | — |
| A1 | Memory on the iPad with a board open; the increased-memory entitlement (a task: Phase 0 measures and records) | Recorded only in Phase 0; a pass number after |
| A2 | Whether serving only on screen is enough, and what the window says when iOS suspends it | Say it in the server's panel |
| A2a | Keep the screen awake while serving (the iPad locks after a few minutes and suspends the app; battery) | — |
| A2b | After a suspension the listening socket may be gone: the server listens again when the app returns, and what the window says | Listen again; say it |
| A2c | A sync in flight when the app leaves the screen (0118 item 6 is Android's): stop and resume, or `beginBackgroundTask` / scheduled background tasks | Stop and resume on return |
| A3 | `cloudflared` as a linked library (gomobile) or the link off on iOS | **Decided 2026-11-12:** as recommended (`cloudflared` off on iOS in v1) |
| A4 | mDNS: request the multicast entitlement (paid account) or announce through Apple's Bonjour API (`NSBonjourServices`) | **Decided 2026-11-12:** as recommended (QR/address in v1) |
| A5 | Show the private folder in Files | — |
| A6 | Exclude the folder and `servers.json` from iCloud backup, as Android's A9 | **Decided 2026-11-12:** as recommended (excluded from iCloud backup) |
| A7 | Whether v1 is in V1's scope (Android is, 0118 A7 decided 2026-11-10) | — |
| A8 | VoiceOver pass (a task, not a question) | Phase 1's acceptance, as 0118 A5 |
| A9 | Classic: unsigned `.ipa` vs development-signed; the bundle id after re-signing | Phase 1 observes |
| A10 | The iPhone's layout without an iPhone: the harness's 390×844 projects (0076), and/or the iOS Simulator that comes with Xcode (the real WKWebView) | — |
| A11 | The Personal Team's id kept out of the committed `gen/apple` (from the environment) | **Decided 2026-11-12:** as recommended |
| A12 | Whether the name "Verso" is free in App Store Connect | Check at the app record (Phase 2) |
| A13 | How the iOS differences cross the contract: new `Can` values or something else (§9) | Three additive `Can` values the desktop and Android list and iOS does not: `Link` (the internet link, A3), `Discover` (mDNS announce and browse, A4), `ServeAway` (serving while the app is off screen, A2); the window hides the link and the "found on this network" list, and says the server runs only while Verso is open. A contract change: bindings regenerated, additive inside N/N-1. Not built in Phase 0 |

### 11. Phases, each with its acceptance

| Phase | What | Accepted when (recommended numbers, not decided) |
|---|---|---|
| 0 — spike | Xcode, iOS targets, `tauri ios init`, `staticlib`, §9's gates; a debug build installed on his iPad with the Personal Team (B5, B6) | On his iPad, measured from a Mac over USB with Safari's Web Inspector (times, frames) and Xcode's gauges (memory): opens a folder in private storage; the demo vault measured as 0118 Phase 0 (opens ≤ 3 s, typing ≤ 50 ms, board ≥ 30 fps with ~60 elements; memory recorded, A1); a TLS handshake to a real UniVerso; serving on the LAN while on screen, and again after a lock and unlock (A2b); the `MAC` readers checked (§9); breaks beyond §9 listed |
| 1 — Classic | A release `.ipa`, the source JSON hosted (B3) with its permissions read from the `.ipa`, installed through AltStore Classic on the iPad; the user-visible duties (CLAUDE.md §5, 0058): a tutorial lesson in both demo vaults on installing through AltStore and the 7-day refresh, the changelog, the walkthrough, rows in `docs/reference/manual-checks.md`; the `Info.plist` usage descriptions in both languages (`InfoPlist.strings`), and the source's texts for a Brazilian audience | Installed from the source URL, the source's permissions matching the `.ipa`; refreshed by AltServer after a day, on the machine named by B5; sync with a UniVerso, WebDAV or S3; both languages, the permission prompts included; VoiceOver; the iPad's sizes and the iPhone's layout (A10) |
| 2 — PAL | Paid account (B1), an app record in App Store Connect (A12) with the privacy manifest (expected, confirmed at the first upload), notarization, the ADP hosted, AltStore PAL registration | Listed in AltStore PAL in Brazil; installed on an iPhone (B4); the maintainer's own check of a distribution-signed build on his iPad is B15 |
| Later | The App Store (B9): account deletion, review | Its own decision |

Phase 0 as built so far (2026-11-12, `feat/app-server` `c6f785fc8` and
`8c1e19ce6`; on the **iOS Simulator only**, not on his iPad; facts and
applied recommendations, nothing here decided). Every number below is
the Simulator's, a debug build on this Mac's Apple silicon: it is not the
iPad's, and Phase 0's acceptance still needs the device.

- The build: the Rust targets `aarch64-apple-ios` and
  `aarch64-apple-ios-sim`; `tauri ios init` installed `xcodegen`,
  `libimobiledevice` and `cocoapods` through Homebrew; `gen/apple` kept in
  the repository without a development team (A11); `staticlib` added to
  `crate-type`; `cargo clippy -D warnings` green for
  `aarch64-apple-ios-sim`, `aarch64-linux-android` and the Mac.
- The minimum iOS is 16.0 (`tauri.ios.conf.json`), Proposed: Xcode 27.2
  refuses Tauri's default 14.0 (its range is 15.0–27.2), and iOS 16 is
  where Developer Mode, which a sideloaded app needs, begins.
- `src/ios.rs`, as `android.rs`: the configuration in
  `<app data>/config` (`Library/Application Support/com.versomd.app`),
  the log there, the notes in `<app data>/Verso` (B13). A cloud's
  secret in iOS's Protected Data keychain (keyring 4's Apple store with
  its `protected` feature, set on keyring-core as Android's is). The
  WebSocket's TLS through the system's verifier (no setup on iOS). The
  arms that were Android's but are a phone's became `cfg(mobile)`.
  `Can::Updates` is off on iOS (B14).
- Breaks beyond §9, found by building and running:
  1. `apple-native-keyring-store` does not build for iOS without its
     `protected` feature; keyring's own `Entry` refuses iOS.
  2. `local_server/owner.rs` had no `full_name` for iOS; `update.rs`
     left three unused names on iOS (clippy). `cli.rs` 154 was §9's.
  3. An app built with the iOS 27 SDK that does not adopt the scene
     life cycle stops at launch (SIGTRAP in UIKit's
     `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).
     tao 0.35 takes the scene path only with `UIApplicationSceneManifest`
     › `UIApplicationSupportsMultipleScenes` true, now in `project.yml`;
     what a second window of the app on the iPad shows is not checked.
  4. No page opens in the browser on iOS (`open_in_browser` is refused
     in words): signing in to a UniVerso, whose device flow opens the
     server's page, stops there. The refusal shows behind an unrelated
     prefix (*"That path cannot name a file of the folder."*). Phase 1
     needs an opener (a plugin or UIKit's `openURL`; a new dependency or
     `unsafe`, either asked).
  5. The device's name is `ios` (the `hostname` fallback).
  6. The window calls the iPad a phone (*"Verso on this phone"*,
     *"Serving to the phone"*), the dialog before serving describes
     Android's (*"stays awake even with the screen off, and a
     notification says so"*), and Settings offers the internet link and
     *Found on this network* — A13's values would hide or reword them.
  7. Settings › Notifications still lists *Updates*; Settings › General
     names *View › Open Console (⌘⌥I)*.
  8. The bundle's version is `1.0.0` (Tauri does not carry
     `0.8.4-beta.1`, not a number triple); the release must set it.
  9. The C objects of the Rust library (opus) are built for the SDK's
     27.2 and linked for 16.0 (linker warnings): the deployment target
     is to be handed to the C builds.
  10. The CLI's last step (renaming the `.app` into `gen/apple/build`)
      fails when an earlier build is there; the Simulator's `.app` in
      Xcode's DerivedData is whole.
  11. The `.app` carries the Mac's document types (`.md`, `.toml`) from
      `app/src-tauri/Info.plist`; what they do on iOS is not checked.
- The `MAC` readers (§9): the iPad's web view says `MacIntel` and a Mac
  user agent, the iPhone's `iPhone`; `MAC` is true on both, as meant for
  ⌘. The frame is not drawn (`Host::Mobile`), *Reveal* is absent with
  `Can::Reveal`, the terminal with `Can::Terminal`; the keys and the
  board's ⌘⌥[ read `MAC` for the modifier only. The notification hint's
  `mac` wording was not seen on screen.
- Checked in the Simulator (iOS 27.2; iPad Pro 11-inch (M5), 834×1210
  points; iPhone 18 Pro, 402×874): the app opens its own folder, the
  demo vault is imported (78 files in about 2 s) and a note, the Verso
  Tour board (70 cards), Settings and the server's settings show; the
  iPhone draws the phone layout (0076). First contentful paint 3.0–3.8 s
  after launch (6.9 s once); the board opens in 4.5 s on the iPad the
  first time (its code loaded), 1.3 s on the iPhone; panning by wheel
  events 49 fps, median frame 17 ms, 9 of 118 frames over 33 ms; memory
  as the Mac sees the Simulator's processes, 112 MB for the app and
  391 MB for its web content. Typing latency was not measured.
- TLS: the first step of signing in to `universo-test.casa.meioorc.com`
  (an HTTPS request through reqwest and the system's verifier) was
  answered; the `wss://` connection was not reached (item 4).
- Serving: turned on, the server listened on the Mac's own interfaces
  (the Simulator shares the Mac's network) and answered `https://` over
  TLS 1.3 from the Mac; turned off after. The lock and unlock (A2b), the
  screen lock and the device's network are the iPad's to test.
- Disk: the Simulator's debug build left 11 GB in
  `target/aarch64-apple-ios-sim` and 2.8 GB in `gen/apple` (ignored).

## Consequences

- One code base still: the Rust core, the sync engine and the UI ship to
  iOS as they are; iOS reuses 0118's seam and off list.
- On iOS the app is a server only while on screen and, if A3 is answered
  as recommended, without the internet link in v1: less than Android's 0117
  on a phone.
- Classic installs last 7 days unless AltServer refreshes them, and take one
  of the user's 3 app slots (that AltStore takes another is to be
  observed).
- A private folder is deleted with the app unless it syncs, as on Android.
- Hosting an `.ipa` publicly is new: today's releases are in a private
  repository.
- 0118 gets a dated line pointing here. 0073.ipad's answer is moved by the
  maintainer's request; 0073 gets its dated line when this ADR is read.
  0117 gets one when B12 is answered (an iPad that serves only on screen,
  perhaps without the link).

## Discarded alternatives

None recorded. The App Store first was not discarded: it comes later (item
2.3). SideStore is mentioned, not weighed.

## Status

**Item 10 answered in part (2026-11-12):** B1, B2, B3, B5, B6, B10, B12–B14,
A3, A4, A6 and A11 decided (their rows); A5, A7 and B11 still `[OPEN]`; B4,
B7–B9, B15 and the build's rows as they were.

**Accepted (2026-11-10)** for items 1–3 in the maintainer's words (Source):
the iOS app, the two flows (PAL for the iPhone, Classic for the iPad), the
App Store later, testing on his iPad. Items 4–9 are facts (`Constraint`) and
a reading of the code; their recommendations, the product rows of item 8
carried from 0118 (B12–B14), the hosting, the signing per flow, the phases'
numbers and every row of item 10 are Proposed or `[OPEN]`. Written by an
Opus session; Fable reading done 2026-11-10 and applied the same day
(Revisions).
