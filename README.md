# Verso

[Português (Brasil)](docs/pt-BR/README.md)

Official site: **https://versomd.com** (its source: [SergioSJS/versomd-site](https://github.com/SergioSJS/versomd-site)).
Builds and UniVerso's packages come only from this repository's releases,
signed with minisign `RWS1zv2nvs/ng1hA0YspwOg7wGda98zkXjVfx8m9CtT5obRW5zabNHaT`.

Verso is a notes app for plain Markdown files. Point it at a folder — an
Obsidian vault works as it is — and it gives you an editor, boards, bases,
search and a graph over those files, on macOS, Windows and Linux. Nothing is
locked in a database: the files are the notes, and Verso never rewrites one
you only opened. It is made first for preparing tabletop RPG sessions
([ADR 0036](docs/adr/0036-tabletop-rpg-support.md)), and is useful for any
body of linked notes.

The repository is private while the app matures; it is in Phase 2 of
[the roadmap](docs/roadmap.md), in daily use by the maintainer.

## Principles

- **Your files are the source of truth.** Notes are `.md` files, boards are
  `.canvas` files, bases are `.base` files, in a folder you choose. The index
  Verso keeps is a cache outside the folder, rebuilt from the files
  ([ADR 0012](docs/adr/0012-files-are-source-of-truth.md)).
- **Opening never rewrites.** No silent reformatting of frontmatter, line
  endings or spacing; every write is atomic and checks that the file on disk
  is still the one it read — if it changed, you see the difference first.
- **Compatible with Obsidian.** Verso reads and writes Obsidian's dialect —
  wikilinks, embeds, block ids, callouts, properties, JSON Canvas — and
  extends it without changing what any existing construct means
  ([ADR 0030](docs/adr/0030-base-dialect-obsidian-compatible.md)). You can
  open the same folder in both.
- **Local, no account.** No sign-in, no telemetry, no cloud of its own.
- **Portuguese and English** from the first line of code.

## What it does

- **Writing.** Reading, Edit and Source modes; blocks you drag by their
  handle and a `/` menu, as in Notion; tables edited as tables; a
  properties panel for the frontmatter; typed notes, where `type:` and a
  schema give a note its form; callouts, KaTeX math, Mermaid diagrams, code
  blocks with a copy button.
- **Linking.** Wikilinks to notes, headings and blocks (`^id`), embeds that
  show the note or the block, backlinks and outgoing links, unresolved
  links, renames that update every link, and an interactive graph.
- **Boards.** `.canvas` files drawn with Excalidraw: the folder's notes as
  cards you edit in place, pictures (which you can crop) and PDFs as cards, arrows that keep the
  point they were drawn to, typed relations, and drawings from Obsidian's
  Excalidraw plugin.
- **Bases.** `.base` files shown as tables, Kanban boards and lists, and
  embedded live in notes.
- **Organizing.** A file tree with multiple selection, stickers, colors and
  covers, folder pages, manual order and focuses shared with make.md, daily
  notes with a calendar, and templates offered when a note is created.
- **Media and the web.** A PDF reader with two-page spreads, pictures, web
  pages kept as notes, and HTML files.
- **Finding.** Full-text search, open by name, a command palette, find and
  replace across notes, tabs (pinned and preview), split panes, workspaces,
  and one folder per window.
- **Your way.** Themes, palettes, fonts, language and your own shortcuts.
- **Agents and the terminal.** The `verso` command indexes, searches and
  lists backlinks; `verso mcp` is a read-only MCP server, for one folder or
  for all of Verso, that Settings connects to Claude Desktop; every call an
  agent makes is logged.
- **Updates.** The app updates itself, and installs only an update whose
  signature verifies against the key it carries
  ([ADR 0055](docs/adr/0055-in-app-updater.md)).

## Installing

From the repository's [Releases page](https://github.com/SergioSJS/verso/releases).
Each release opens with *Which file do I download?* — the file for each
computer, as a link — and *How to install*, in English and in Portuguese.
A test release is published as "Verso Beta" — its files start with
`Verso-Beta-` — and installs beside the production app.

| Your computer | File | First run |
|---|---|---|
| Mac with an Apple chip (M1, M2, M3, M4…); a Mac with an Intel processor is not supported | `Verso-X.Y.Z-macos-arm64.zip`: unzip into `/Applications` | signed ad hoc, not by a registered developer: allow it once in System Settings → Privacy & Security → "Open Anyway" |
| Windows 10 and 11, x64 (run so far on Windows 11) | `Verso-X.Y.Z-windows-x64-setup.exe`, an installer for your user | unsigned: SmartScreen asks once (More info → Run anyway) |
| Linux, x64 | `Verso-X.Y.Z-linux-amd64.deb` for Ubuntu (22.04 and later), Linux Mint, Debian (12 and later), Pop!_OS; `Verso-X.Y.Z-linux-x86_64.rpm` for Fedora (36 and later); `Verso-X.Y.Z-linux-x86_64.AppImage` for any other | the AppImage: make it executable and run it. ARM64 comes once the repository is public |

`verso-X.Y.Z-SHA256SUMS` lists every file's sha256, and its `.sig` signs
the list with the key above: the app's updater and UniVerso's installer
check each file with them, and you can ignore both. (0.8.3 also carries a
`.sig` beside each file, for the apps before it; the releases after it do
not.)

The command line comes with the app. On macOS, Settings → Terminal and
agents → Install links it as `/usr/local/bin/verso`; on Windows `verso.exe`
sits beside the app; on Linux a package puts `verso` in `/usr/bin`, and an
AppImage's Settings put it in `~/.local/bin`. The `verso-cli` archives hold
the same command line for a machine without the app.

## Try it: the tutorial

Open a folder, and with no note open choose **Import the demo content**: Verso writes its
tutorial there — about twenty notes, one per area of the app, and two
boards. Start with the **Tour do Verso** board, then **Treino do Board** to
learn drawing ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md)). The
same content lives in `demo-vault/`.

## How it is built

A Rust core and a desktop window ([ADR 0028](docs/adr/0028-crate-structure.md)):

| Part | What it does |
|---|---|
| `crates/verso-dialect` | the Markdown parser — pure, no IO, compiles to WebAssembly |
| `crates/verso-fs` | the folder's files: opaque handles, the watcher, atomic writes, confinement to the folder |
| `crates/verso-index` | SQLite with FTS5: search, links, the graph |
| `crates/verso-core` | orchestrates the rest and exposes the contract |
| `crates/verso-cli` | the `verso` command and the MCP server |
| `crates/verso-contract` | the contract's types, no IO |
| `crates/verso-bench` | the benchmark, never shipped |
| `app/src-tauri`, `app/ui` | the Tauri window and its TypeScript interface (CodeMirror, Excalidraw) |

The window talks to the core only through the contract, whose TypeScript
types are generated from Rust
([ADR 0026](docs/adr/0026-core-ui-contract-inviolable-rules.md)). Behavior is
pinned by fixtures in `fixtures/`, and every decision has its
record in [docs/adr/](docs/adr/README.md).

## Build and run

```
cd app/ui && npm ci && npm run build && cd ../..
cargo build -p verso-app -p verso-cli
./target/debug/verso /path/to/a/folder
```

Node 22 is needed for the UI, and the Rust toolchain that
`rust-toolchain.toml` pins (`rustup` installs it). On Linux, Tauri's
libraries too (WebKitGTK 4.1 and the others the release workflow installs).
The command line alone — `verso index`, `verso search`, `verso backlinks`,
`verso mcp` — needs no UI: `./target/debug/verso help`.

## Test locally, before pushing

CI confirms; it should not be where a failure is first seen. These scripts
run the guardrails of CI ([ADR 0029](docs/adr/0029-guardrails-in-ci.md)) on
your machine:

| Script | Runs | Needs |
|---|---|---|
| `scripts/check.sh` | every guardrail of CI's Linux job, natively — on a Mac, this is the macOS check; and, which CI does not run, the window's end-to-end tests over the browser harness ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md)), in WebKit and in Chromium, the engines of the macOS and Windows apps ([ADR 0069](docs/adr/0069-windows-port.md)); on a Mac with one worker and no window captures, and refused while a browser or the Verso app is open (quit them first) | the toolchain, Node 22, `cargo install cargo-deny --locked`; Playwright's WebKit and Chromium, downloaded on the first run |
| `scripts/check-linux.sh` | fmt, clippy, the tests and the generated bindings in a Linux container, as an ordinary user | Docker; the UI bundle the first script builds |
| `scripts/check-windows.sh` | clippy and the tests on a Windows machine over SSH; `--bundle` also builds the installer ([ADR 0069](docs/adr/0069-windows-port.md)). Required when the diff touches platform code (`verso-fs`, `app/src-tauri`, configuration paths, `cfg(windows)`), optional otherwise | an SSH host named `verso-win` with the toolchain (the script's header lists it) |
| `scripts/check-linux-vm.sh` | clippy and the tests on a Linux machine over SSH; `--bundle` builds the `.deb`, `.rpm` and AppImage, `--install` opens the app on its desktop, `--webkit` runs the end-to-end suite on Linux's WebKit in a container ([ADR 0071](docs/adr/0071-linux-port.md)). When it makes sense, or for a closed package | an SSH host named `verso-ubuntu` (the script's header lists it); Docker for `--webkit` |
| `scripts/install-beta.sh` | on a Mac with Apple silicon, this checkout installed as "Verso Beta" over `/Applications/Verso Beta.app`: the window built first, the binaries natively, `ui-web` and the Info.plist keys in the bundle, signed ad hoc, the running beta quit without losing work, and a failure unless the log says it started this commit with no ERROR ([ADR 0051](docs/adr/0051-development-flow-and-releases.md)). The end of any change a user can see; `--dirty` installs uncommitted work | a Verso Beta already installed (a release, or one `tauri build` with an arm64 Node) |

```
scripts/check.sh && scripts/check-linux.sh
scripts/check-windows.sh   # when the diff touches platform code
```

What none of them covers:

- **macOS in a container** does not exist: Docker runs Linux. On a Mac,
  `scripts/check.sh` is the macOS check; CI repeats clippy and the tests on
  macOS after each merge into `main`.
- **The fuzzing and the benchmark**, which CI runs on `main`:
  `cargo +nightly fuzz run parse` in `crates/verso-dialect`, and
  `cargo run --release -p verso-bench -- --help`.

## Versions

Each version is listed in [CHANGELOG.md](CHANGELOG.md); what is merged but not
released yet sits under "Unreleased". `vX.Y.Z` is a production release,
`vX.Y.Z-beta.N` a test release
([ADR 0051](docs/adr/0051-development-flow-and-releases.md)).

- **Which one is running**: Settings → General → Version, the About panel, or
  `verso --version`.
- **Cutting one** happens only when the maintainer asks:
  `node scripts/release.mjs prepare X.Y.Z[-beta.N]`, on the branch of the
  pull request that releases, sets the version and moves the changelog in one
  commit; merging that pull request into `main` builds, signs, publishes and
  tags the release for every system. A rehearsal — Actions → release → Run
  workflow — builds the same files and publishes nothing.

## Documents

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to propose a change, sign-off, what
  never to do.
- [docs/roadmap.md](docs/roadmap.md) — the phases and their exit criteria.
- [docs/adr/](docs/adr/README.md) — one record per decision.
- [docs/spec/dialect.md](docs/spec/dialect.md) — the Markdown dialect, with its
  open questions.
- [docs/reference/app-decision.md](docs/reference/app-decision.md) — what the
  window does, and how to verify it without reading code.
- [docs/reference/server-hands-on.md](docs/reference/server-hands-on.md) —
  installing UniVerso step by step, with Docker or a package, beside other
  apps, up to the desktop app connected; the reference is
  [docs/reference/server-install.md](docs/reference/server-install.md).
