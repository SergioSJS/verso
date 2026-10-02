# Verso

[Português (Brasil)](docs/pt-BR/README.md)

Verso is an open Markdown notes application: plain files on disk, compatible
with Obsidian vaults, made first for preparing tabletop RPG sessions
([ADR 0036](docs/adr/0036-tabletop-rpg-support.md)). It is in Phase 2 of
[the roadmap](docs/roadmap.md): a desktop window on macOS, in daily use by the
maintainer. The repository stays private until it is ready.

## Build and run

```
cd app/ui && npm ci && npm run build && cd ../..
cargo build -p verso-app -p verso-cli
./target/debug/verso /path/to/a/folder
```

Node 22 is needed for the UI, and the Rust toolchain that
`rust-toolchain.toml` pins (`rustup` installs it). The command line alone —
`verso index`, `verso search`, `verso backlinks`, `verso mcp` — needs no UI:
`./target/debug/verso help`.

## Test locally, before pushing

CI confirms; it should not be where a failure is first seen. Two scripts run
the guardrails of CI ([ADR 0029](docs/adr/0029-guardrails-in-ci.md)) on your
machine:

| Script | Runs | Needs |
|---|---|---|
| `scripts/check.sh` | every guardrail of CI's Linux job, natively — on a Mac, this is the macOS check; and, which CI does not run, the window's end-to-end tests in WebKit over the browser harness ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md)) | the toolchain, Node 22, `cargo install cargo-deny --locked`; Playwright's WebKit, downloaded on the first run |
| `scripts/check-linux.sh` | fmt, clippy, the tests and the generated bindings in a Linux container, as an ordinary user | Docker; the UI bundle the first script builds |

```
scripts/check.sh && scripts/check-linux.sh
```

The first Linux run downloads an image, a toolchain and the dependencies; the
next ones take about a minute. What neither covers:

- **macOS in a container** does not exist: Docker runs Linux. On a Mac,
  `scripts/check.sh` is the macOS check; CI repeats clippy and the tests on
  macOS after each merge into `main`.
- **Windows**: Docker on a Mac or on Linux cannot run Windows, and Verso does
  not build for Windows yet. With the Windows port
  ([ADR 0022](docs/adr/0022-target-platforms-macos-first.md)), a check of the
  Windows build joins these scripts, and the tests run on Windows in CI.
- **The fuzzing and the benchmark**, which CI runs on `main`:
  `cargo +nightly fuzz run parse` in `crates/verso-dialect`, and
  `cargo run --release -p verso-bench -- --help`.

## Versions

Each version is listed in [CHANGELOG.md](CHANGELOG.md); what is merged but not
released yet sits under "Unreleased". `vX.Y.Z` is a production release,
`vX.Y.Z-beta.N` a test release, published as "Verso Beta", which installs
beside the production app with its own window settings
([ADR 0051](docs/adr/0051-development-flow-and-releases.md)).

- **Installing one**: from the repository's Releases page, unzip the app
  into `/Applications`. It is signed ad hoc, not by a registered developer:
  the first time, macOS refuses to open it — allow it once in System Settings
  → Privacy & Security → "Open Anyway". The command line comes inside the
  app: Settings → Terminal and agents → Install links it as
  `/usr/local/bin/verso` (macOS asks for your password if that directory is
  not yours), and the same page connects Claude Desktop and shows the entry
  for other MCP clients ([ADR 0054](docs/adr/0054-terminal-and-agents-from-the-app.md)).
  The `verso-cli` archive holds the same command line for a machine without
  the app; extracted by the Finder, it is held back on its first run: allow
  it in the same place, or run `xattr -d com.apple.quarantine verso` once.
- **Which one is running**: Settings → General → Version, the About panel, or
  `verso --version`.
- **Cutting one** happens only when the maintainer asks:
  `node scripts/release.mjs prepare X.Y.Z[-beta.N]`, on the branch of the
  pull request that releases, sets the version and moves the changelog in one
  commit; merging that pull request into `main` builds, publishes and tags
  the release. A rehearsal — Actions → release → Run workflow — builds the
  same files and publishes nothing.

## Documents

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to propose a change, sign-off, what
  never to do.
- [docs/roadmap.md](docs/roadmap.md) — the phases and their exit criteria.
- [docs/adr/](docs/adr/README.md) — one record per decision.
- [docs/spec/dialect.md](docs/spec/dialect.md) — the Markdown dialect, with its
  open questions.
- [docs/reference/app-decision.md](docs/reference/app-decision.md) — what the
  window does, and how to verify it without reading code.
