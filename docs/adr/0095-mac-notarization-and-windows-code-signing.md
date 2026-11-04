# ADR 0095 — Mac notarization and Windows code signing, and the Mac Intel build

- Date: 2026-10-14
- Source: `docs/roadmap.md`, revision 8, row V.11 and decision R3 —
  *"Mac notarization and Windows code signing: how, and at what cost"*,
  `[DECIDED 2026-10-14]` as recommended (*"Sim, todas"*): **an ADR of
  its own, revising 0051 and 0069**; row V.21, the Mac Intel app, brought
  into V1 by the maintainer's answer of 2026-10-14 on the core gaps.
  Written by Opus 5.5 at the maintainer's request; to be read by the
  other model before it is accepted ([0032](0032-author-and-reviewer-roles.md)).
  The facts below were read on 2026-10-14 at the sources linked; prices
  are list prices of that day.
- Related: [0051](0051-development-flow-and-releases.md) (releases; the
  app signed ad hoc, *"a Developer ID … is a decision for before public
  distribution; so is Windows code signing"*), [0069](0069-windows-port.md)
  item 3 (*"Not code-signed for now"*), [0055](0055-in-app-updater.md)
  (the release key and the signed checksums list), [0022](0022-target-platforms-macos-first.md),
  [0071](0071-linux-port.md), [0054](0054-terminal-and-agents-from-the-app.md)
  (the command line inside the app), [0001](0001-open-tool-no-company.md)
  (no company; donations only), [0007](archive/0007-private-repo-until-license.md)
  (the repository private until the licence; roadmap V.12),
  [0029](0029-guardrails-in-ci.md) (CI's cost), [0005](0005-license.md).
- Status in the briefing: not present.
- Revisions: 2026-10-15 — **Mac notarization dropped.** The maintainer:
  *"NÃO VOU ME INSCREVER NESSA MERDA DE APPLE DEVELOPER PROGRAM, NÃO VOU
  PAGAR NADA"* (I will not enroll in that Apple Developer Program, I will
  pay nothing). No enrollment and no payment to Apple, ever. Items 1, 2,
  7 (the Apple secrets), 8 (the macOS steps) and 10 are **superseded**
  (marked below); the Mac app stays signed ad hoc, as built; items 3, 4,
  5, 6 (Windows), 9 stand. See the Status.

## Context

**What exists.** The macOS app is built for arm64 only, on `macos-latest`,
and signed **ad hoc** (`"signingIdentity": "-"` in
`app/src-tauri/tauri.conf.json`); the release workflow copies the command
line into the bundle after Tauri builds it and signs the bundle again,
ad hoc, with `codesign --force --deep --sign -`
(`.github/workflows/release.yml`). macOS asks once, on first open, to
allow it. The Windows NSIS installer is **unsigned** ([0069](0069-windows-port.md)
item 3); the command line travels in it as Tauri's `externalBin`. The
Linux AppImage, `.deb` and `.rpm` carry no signature of their own. Every
release file is in one checksums list signed with Verso's release key,
which the in-app updater verifies ([0055](0055-in-app-updater.md)); that
key proves the release came from Verso's workflow, and no operating
system reads it. The updater picks this platform's file by name, by an
architecture word — `arm64`/`aarch64` or `x64`/`x86_64`/`amd64`
(`pick_asset`, `app/src-tauri/src/update.rs`). The repository is private
(V.12); the maintainer lives in Brazil; the project has no company and
lives on donations ([0001](0001-open-tool-no-company.md)).

**macOS.**

- The Apple Developer Program costs *"99 USD per membership year. Prices
  may vary by region and are listed in local currency during the
  enrollment process"* ([enroll](https://developer.apple.com/programs/enroll/));
  the price in reais is shown only at checkout. An individual needs an
  Apple Account with two-factor authentication; an organization *"must
  have a D-U-N-S Number"*. The fee waiver is for nonprofits, schools and
  governments, and requires *"Not be an individual"*
  ([fee waivers](https://developer.apple.com/help/account/membership/fee-waivers/)).
  Notarization is a feature of the membership; no page names a fee of
  its own.
- Notarization needs a *"Developer ID"* application certificate, *"the
  Hardened Runtime capability for your app and command line targets"*, *"a
  secure timestamp"*, and no `get-task-allow` entitlement; *"all software
  built after June 1, 2019, and distributed with Developer ID must be
  notarized"* ([Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)).
  Only the Account Holder can make the Developer ID certificate
  ([Developer ID](https://developer.apple.com/developer-id/)). `altool`
  was turned away on 1 November 2023 ([news](https://developer.apple.com/news/?id=y5mjxqmn));
  `notarytool` takes *"an app-specific password or an App Store Connect
  API key"* ([TN3147](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool)),
  and `stapler` attaches the ticket to the app.
- Since macOS 15, *"users will no longer be able to Control-click to
  override Gatekeeper"*; they go to System Settings › Privacy & Security
  ([news, 2024-08-06](https://developer.apple.com/news/?id=saqachfa)). No
  Apple statement of a further change in macOS 26 was found.
- Tauri 2 signs with `APPLE_CERTIFICATE` (the `.p12`, base64),
  `APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY`, and
  notarizes and staples during `tauri build` when `APPLE_API_KEY`,
  `APPLE_API_ISSUER` (with the key's `.p8`) or `APPLE_ID`,
  `APPLE_PASSWORD`, `APPLE_TEAM_ID` are set
  ([Tauri: macOS signing](https://v2.tauri.app/distribute/sign/macos/),
  `crates/tauri-cli/ENVIRONMENT_VARIABLES.md`); the hardened runtime is
  on by default (`bundle.macOS.hardenedRuntime`). Neither Tauri nor Apple
  says whether a WKWebView app needs a JIT entitlement: the web content
  runs in WebKit's own process, so likely not — to be seen by notarizing
  and running with none.
- GitHub's Intel macOS image `macos-13` was retired by 4 December 2025;
  `macos-15-intel` is the last, until autumn 2027
  ([changelog](https://github.blog/changelog/2025-09-19-github-actions-macos-13-runner-image-is-closing-down/)).
  Tauri's own CI example builds `x86_64-apple-darwin` on the arm64
  `macos-latest` ([GitHub pipeline](https://v2.tauri.app/distribute/pipelines/github/)),
  a target Rust keeps at Tier 2 with host tools since 1.90
  ([Rust blog](https://blog.rust-lang.org/2025/08/19/demoting-x86-64-apple-darwin-to-tier-2-with-host-tools/)).

**Windows.**

- Since 1 June 2023 a code signing certificate's private key must live in
  a hardware module — a token, a cloud HSM or a signing service —
  certified FIPS 140-2 Level 2 or Common Criteria EAL 4+; since 1 March
  2026 a certificate lasts 460 days at most
  ([CA/B Forum Code Signing BR](https://cabforum.org/working-groups/code-signing/requirements/)
  §6.2.7.4.1, §6.3.2). A key in a file in CI's secrets is no longer
  possible.
- *"EV certificates no longer bypass SmartScreen"*; *"Unsigned files must
  build reputation anew with every update"*, while a signed file builds
  the certificate's reputation, which later versions inherit; an
  unsigned file shows *"Windows protected your PC"* until "Run anyway"
  ([SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)).
  **Smart App Control**, where it is on, *"will block execution of
  unsigned files unless the file has a positive reputation"*, and *"There
  is currently no way to bypass Smart App Control protection for
  individual apps"* ([What is Smart App Control](https://support.microsoft.com/en-us/topic/what-is-smart-app-control-285ea03d-fa88-4d56-882e-6698afdb7003)).
- **Azure Artifact Signing** (formerly Trusted Signing): $9.99 a month
  for 5,000 signatures, $0.005 each beyond (Azure's retail prices). But
  *"Public Trust certificates are available to organizations in the
  United States, Canada, the European Union, the United Kingdom,
  Australia, New Zealand, Japan, South Korea, Singapore, Switzerland,
  Norway, and Israel. Individual developers must be located in the United
  States or Canada"* ([quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)):
  **not open to the maintainer in Brazil**, as a person or as an
  organization.
- Certificates, list prices: SSL.com's individual-validated or OV
  certificate from $129 a year, its cloud signing (eSigner) from $20 a
  month for 20 signatures, or a YubiKey at $379
  ([SSL.com](https://www.ssl.com/certificates/code-signing/buy/),
  [eSigner pricing](https://www.ssl.com/guide/esigner-pricing-for-code-signing/));
  DigiCert's from $696 a year; Sectigo's from $536.25 a year. **Certum's
  Open Source Code Signing**, in its cloud (SimplySign), from €49, for a
  public open-source project, its subject "Open Source Developer
  *name*" ([Certum](https://shop.certum.eu/open-source-code-signing-on-simplysign.html));
  whether its one-time codes can be driven from CI was not confirmed.
- **SignPath Foundation** signs open-source projects free of charge:
  an OSI licence (MPL-2.0 is one), no proprietary component, a released
  project, multi-factor authentication for every member, a code signing
  policy on the project's page, builds on GitHub-hosted runners; and
  *"The code signing certificate is issued to SignPath Foundation"* —
  the publisher Windows shows is SignPath Foundation, not Verso
  ([terms](https://signpath.org/terms), [GitHub](https://docs.signpath.io/trusted-build-systems/github)).
  Its signing is a request submitted from the workflow and answered
  later; Tauri signs the app's executable before NSIS packs it, through
  `bundle.windows.signCommand` ([Tauri: Windows signing](https://v2.tauri.app/distribute/sign/windows/)),
  so the two have to be fitted together.

**Linux.** No operating system check stands between a person and a
downloaded AppImage, `.deb` or `.rpm`. Tauri can sign an AppImage
(`SIGN=1`; *"AppImage does not validate the signature"*) and an `.rpm`
(`TAURI_SIGNING_RPM_KEY`) ([Tauri: Linux signing](https://v2.tauri.app/distribute/sign/linux/),
[RPM](https://v2.tauri.app/distribute/rpm/)); an APT repository of one's
own *"MUST be signed with an OpenPGP certificate"*
([Debian](https://wiki.debian.org/DebianRepository/UseThirdParty)).
Verso publishes no package repository.

**CI's cost.** macOS runs at $0.062 a minute, Linux at $0.006, Windows
at $0.010, and *"GitHub Actions usage is free … for public
repositories that use standard GitHub-hosted runners"*
([pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing),
[billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)).

## Decision

Proposed (2026-10-14). Accepted on 2026-10-14 (Status): each `[DECIDED 2026-10-14]` was decided as
recommended and is marked `[DECIDED 2026-10-14]`. This ADR revises
[0051](0051-development-flow-and-releases.md) (its Consequence on the ad
hoc signature) and [0069](0069-windows-port.md) (item 3) when accepted.

1. **macOS: Developer ID and notarization.** *(Dropped 2026-10-15: see the
   Revisions and the Status; the Mac app stays signed ad hoc, and a
   person installs it with "Open Anyway".)* The app is signed with a
   Developer ID Application certificate, the hardened runtime on, with a
   secure timestamp, notarized with `notarytool` and stapled — by `tauri
   build` itself, given the certificate and the notary's credentials.
   The command line inside the bundle becomes Tauri's `externalBin`, as
   on Windows, so that it is signed with the bundle and before it,
   instead of being copied in afterwards and the bundle signed again ad
   hoc. The command line's own archive holds a binary signed the same
   way and submitted to the notary (a bare binary takes no stapled
   ticket; Gatekeeper finds it online). No entitlement unless the first
   notarized build shows one is needed, and then the narrowest. The zip
   stays ([0051](0051-development-flow-and-releases.md), Discarded: a
   `.dmg`).
2. **Who enrolls and pays.** *(Dropped 2026-10-15 for Apple: no
   enrollment, no payment, ever.)* `[DECIDED 2026-10-14]`. Decided: **the maintainer, as
   an individual**, 99 USD a year (in reais at checkout): an organization
   needs a D-U-N-S number and a legal entity the project does not have
   ([0001](0001-open-tool-no-company.md)), and no waiver applies to a
   person. The certificate names the maintainer as the developer.
3. **Windows: which signing.** `[DECIDED 2026-10-14]`. The options open to a person in
   Brazil: (a) **unsigned**, as now — "Run anyway" under SmartScreen, and
   **blocked with no way around** where Smart App Control is on;
   (b) **SignPath Foundation**, free, publisher "SignPath Foundation",
   once the repository is public, its request fitted into Tauri's
   signing of the inner executable; (c) **Certum's open-source
   certificate** in its cloud, about €49, publisher "Open Source
   Developer *maintainer*", if its codes can be driven from CI;
   (d) **a commercial certificate with cloud signing**, about $129 a year
   plus about $240 a year of eSigner's smallest plan (SSL.com, list
   prices), publisher the maintainer. Azure Artifact Signing is not
   open to the maintainer (Context). Decided: **(b)**, applied for as
   soon as the repository is public; **(c)** if SignPath declines or
   cannot sign inside Tauri's build; **(d)** only if neither works. Not
   (a) at V1: Smart App Control turns a warning into a refusal.
4. **What is signed on Windows**: the app's executable, the command
   line's `verso.exe` and the NSIS installer — every executable a person
   or the updater runs — each with a SHA-256 digest and a timestamp, and
   checked with `signtool verify /pa` in the workflow before anything is
   published. SmartScreen may still warn on the first signed releases,
   until the certificate gathers reputation; the release page says so.
5. **Linux: no operating-system signing.** The signed checksums list
   ([0055](0055-in-app-updater.md)) stays what proves a Linux file.
   `[DECIDED 2026-10-14]`: whether the `.rpm` (and the AppImage) are signed with an
   OpenPGP key as well. Decided: **not in V1** — nothing checks an
   AppImage's signature, and an `.rpm`'s helps only someone who imported
   the key; an APT or RPM repository, if one is ever published, signs
   its index then.
6. **When.** *(The Apple half dropped 2026-10-15; Windows signing stands,
   when the repository is public.)* `[DECIDED 2026-10-14]`. Decided: **enroll in Apple's programme now**
   — its identity check takes days — and sign and notarize **every
   release from the first one after the certificate exists, the betas
   too**, so that the path is proven long before V1; Windows signing
   **when the repository is public** (V.12), as (b) and (c) require; both
   before the announcement and V1's release. A rehearsal run of the
   release workflow signs and notarizes as a release does.
7. **The secrets in CI.** *(Dropped 2026-10-15 for the Apple secrets — the
   certificate and the App Store Connect key; the environment `release` and
   the Windows credentials stand.)* `[DECIDED 2026-10-14]`. Decided: a GitHub environment
   `release`, its secrets usable only by jobs running on `main` — the
   Developer ID certificate (`.p12`, base64) and its password, and **an
   App Store Connect API key** (issuer, key id, `.p8`) for the notary,
   not an Apple ID's app-specific password, which is the maintainer's
   personal account; the Windows signing credentials as the chosen
   option needs them. Only the release workflow's build jobs read them;
   pull requests never do. The maintainer keeps an offline copy of the
   certificate's `.p12`, as of the release key ([0055](0055-in-app-updater.md)).
   A certificate expires or is revoked: the next release signs with the
   new one; installed apps are unaffected, since the updater trusts the
   release key, not the certificate.
8. **The release workflow** changes *(2026-10-15: the macOS part is
   dropped — the ad hoc re-signing step stays, and the release page keeps
   "Open Anyway"; the Windows part stands)*: the macOS job builds with the
   secrets and checks its result with `codesign --verify --strict`,
   `xcrun stapler validate` and `spctl --assess --type execute`; the
   ad hoc re-signing step goes; the Windows job signs through
   `signCommand` and verifies (item 4); the release page
   ([0051](0051-development-flow-and-releases.md), revised 2026-10-14)
   loses "Open Anyway" for macOS and says what Windows shows; the README
   too.
9. **The Mac Intel app** (V.21). *(2026-10-15: unaffected, except that it
   is signed ad hoc like the arm64 one, not notarized.)* `[DECIDED 2026-10-14]`: a universal binary or a
   separate x64 build. A universal app holds both and doubles every Mac
   download; Verso's updater picks a file by its architecture word, and a
   `universal` name matches neither (Context), so it would change too.
   Decided: **a separate `macos-x64` build**, cross-compiled for
   `x86_64-apple-darwin` in the same macOS job on the arm64 runner, as
   Tauri's example does — no Intel runner, which GitHub retires in 2027 —
   signed and notarized like the arm64 one, named so the updater finds it
   as it is; the release page gains its row ("a Mac with an Intel
   processor"). With no Intel Mac at hand, it is tested by running it
   under Rosetta on the maintainer's Mac, and its results said as such.
10. **What a person sees once.** *(Dropped 2026-10-15: there is no
    Developer ID release.)* The first Developer ID release replaces
    an ad hoc app: macOS may ask again for permissions it gave the ad hoc
    one (access to a folder in Documents, for instance). Seen on that
    release and said in its notes, not assumed here.

## Consequences

- [0051](0051-development-flow-and-releases.md) gains a Revisions line
  (its Consequence on the ad hoc signature answered), and
  [0069](0069-windows-port.md) one on item 3, when this ADR is accepted;
  `release.yml`'s header comment and the README follow.
- Costs, by the recommendations: 99 USD a year to Apple; nothing for
  Windows by (b), about €49 by (c), about $370 a year by (d); CI free
  once the repository is public, and until then a release's macOS job
  grows by the notary's wait and, with item 9, a second build.
- `docs/reference/manual-checks.md` gains the checks no machine can
  make: a downloaded release opening on a Mac with no warning, the
  installer on a Windows 11 machine with Smart App Control on, the x64
  app under Rosetta.
- The project page carries the code signing policy SignPath asks for, if
  (b) is chosen.

## Discarded alternatives

None recorded.

## Status

**Revised 2026-10-15: Mac notarization dropped.** The maintainer will
not enroll in the Apple Developer Program and will pay Apple nothing
(Revisions). The Mac app stays signed ad hoc, as built; installing it
means *Open Anyway* (System Settings › Privacy & Security, scroll down,
*Open Anyway* beside the app, confirm; on macOS 14 or earlier, right-click
the app › *Open*), which the release page (`scripts/release-page.mjs`) and
the README already say. Windows signing through **SignPath Foundation**
(free, once the repository is public, item 3 (b)) stays, and so does the
separate Mac Intel build (item 9), ad hoc signed. Roadmap V.11 is now
"Windows code signing" only.

**Accepted (2026-10-14).** The maintainer, that night, answered the
questions of 0093, 0094 and 0095 with *"Sim, todas"* (yes, all): every
`[OPEN]` decided as recommended, marked `[DECIDED 2026-10-14]` in place. R3
of `docs/roadmap.md`, revision 8, decided that this ADR exists; this
answer decided its content. Revisions lines in
[0051](0051-development-flow-and-releases.md) (its Consequence on the ad
hoc signature) and [0069](0069-windows-port.md) (item 3). The Mac Intel
build (item 9) comes when the repository is public (V.12), as the wave of
V.21 was decided on 2026-10-14 (`docs/roadmap.md`, "Core gaps in V1").

*(History, before the acceptance above:)* Proposed (2026-10-14). For the
maintainer, each with a recommendation: who enrolls and pays (item 2),
the Windows option (item 3), Linux package signatures (item 5), when
(item 6), the secrets (item 7), a universal or a separate x64 Mac build
(item 9).

**2026-10-31.** The beta installed on the maintainer's Mac by
`scripts/install-beta.sh` is signed with a fixed local certificate, so macOS
keeps its permissions ([0051](0051-development-flow-and-releases.md),
amendment of the same day). The release builds stay ad hoc, as above.
