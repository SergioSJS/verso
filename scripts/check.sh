#!/usr/bin/env bash
# The CI guardrails on this machine (ADR 0029): what the Linux job of
# .github/workflows/ci.yml runs, in the same order, natively — on a Mac this
# is the macOS check. Run it, and scripts/check-linux.sh, before pushing: CI
# confirms; it should not be where a failure is first seen. Keep the two in
# step with the workflow.
#
# Needs the Rust toolchain of rust-toolchain.toml, Node 22 for the UI and
# cargo-deny (`cargo install cargo-deny --locked`), and cargo-nextest for the
# tests as CI runs them (`cargo install cargo-nextest --locked`; without it,
# `cargo test`); the wasm32 target is added here if missing. The fuzzing and
# the benchmark are not run (see README.md).
#
# One step CI does not run: the window's end-to-end tests (ADR 0058), the
# browser harness's and the server's, local only. They run in Docker, in
# Playwright's Linux image, never on this machine's own window server
# (scripts/check-e2e.sh; the maintainer's decision of 2026-11-02, fix
# release item C2: on a Mac they ran here with one worker for 1 h 10, and
# the window server aborted under them four times, ADR 0069 item 8).
# Without Docker they are skipped and the last line says so. `--no-e2e`
# skips them on purpose, e.g. while scripts/check-e2e.sh runs on its own.
set -euo pipefail
cd "$(dirname "$0")/.."
# The commit checked, so that a kept log names it.
printf 'checking %s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo 'no git')"

e2e=1
[ "${1:-}" = "--no-e2e" ] && e2e=0

step() { printf '\n== %s\n' "$*"; }

step "docs mirror (ADR 0008)"
bash scripts/check-docs-mirror.sh
step "fixtures (ADR 0031)"
bash scripts/check-fixtures.sh
step "npm licenses (ADR 0029)"
node scripts/check-npm-licenses.mjs
step "npm advisories (ADR 0083 item 13)"
node scripts/check-npm-audit.mjs
step "source files under the size limit (ADR 0067)"
node scripts/check-sizes.mjs

step "demo vault built from its sources (ADR 0058)"
node scripts/demo-vault.mjs check
step "theme catalogue: shape, contrast floor, credits (ADR 0109)"
node scripts/check-theme-catalogue.mjs
step "the release page names the files the release workflow builds (ADR 0051)"
node --test scripts/release-page.test.mjs
step "file associations: a handler for .md on three systems, never the default (ADR 0114)"
node scripts/check-file-associations.mjs
step "std::fs in verso-core only in src/sidecar.rs (ADR 0029)"
if grep -rnE --include='*.rs' '(std::fs|\bfs::|std::\{[^}]*\bfs\b)' crates/verso-core/src \
   | grep -v '^crates/verso-core/src/sidecar.rs:' \
   | grep -vE '^[^:]+:[0-9]+:[[:space:]]*//'; then
  echo 'std::fs outside crates/verso-core/src/sidecar.rs (ADR 0029)'
  exit 1
fi
step "std::fs in verso-server only in src/data.rs (ADR 0029, ADR 0075)"
if grep -rnE --include='*.rs' '(std::fs|\bfs::|std::\{[^}]*\bfs\b)' crates/verso-server/src \
   | grep -v '^crates/verso-server/src/data.rs:' \
   | grep -vE '^[^:]+:[0-9]+:[[:space:]]*//'; then
  echo 'std::fs outside crates/verso-server/src/data.rs (ADR 0029)'
  exit 1
fi
step "std::fs in verso-app only in src/update.rs, src/log.rs, src/resolv_conf.rs and src/tunnel/files.rs (ADR 0029, ADR 0097, ADR 0117)"
if grep -rnE --include='*.rs' '(std::fs|\bfs::|std::\{[^}]*\bfs\b)' app/src-tauri/src \
   | grep -vE '^app/src-tauri/src/(update|log|resolv_conf|tunnel/files)\.rs:' \
   | grep -vE '^[^:]+:[0-9]+:[[:space:]]*//'; then
  echo 'std::fs outside app/src-tauri/src/update.rs, src/log.rs, src/resolv_conf.rs and src/tunnel/files.rs (ADR 0029, ADR 0097, ADR 0117)'
  exit 1
fi
step "unsafe only in web_clip/{macos,windows}.rs and audio_share/{macos,windows,linux}.rs (ADR 0029, 0116)"
node --test scripts/check-unsafe.test.mjs
node scripts/check-unsafe.mjs
step "cargo fmt --check"
cargo fmt --all --check
step "cargo deny"
if ! command -v cargo-deny >/dev/null; then
  echo "cargo-deny is not installed: cargo install cargo-deny --locked"
  exit 1
fi
cargo deny check
# The UI before any Rust build: the Tauri shell embeds app/ui/dist when it
# compiles. `npm ci` only when the lockfile is newer than the installed tree.
step "UI: type check, bundle and unit tests"
(
  cd app/ui
  [ node_modules/.package-lock.json -nt package-lock.json ] || npm ci
  npm run check
  npm run build
  npm test
)
step "cargo clippy -D warnings"
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
# cargo-nextest when it is installed, as CI runs the tests: each test in a
# process of its own, stopped at the limit of .config/nextest.toml if it
# hangs; the doctests, which nextest does not run, with `cargo test --doc`.
if command -v cargo-nextest >/dev/null; then
  step "cargo nextest, and the doctests"
  cargo nextest run --workspace --all-features --locked
  cargo test --doc --workspace --all-features --locked
else
  step "cargo test (no time limit per test: cargo install cargo-nextest --locked)"
  cargo test --workspace --all-features --locked
fi
step "the committed bindings are the generated ones (ADR 0026 rule 3)"
tmp="$(mktemp "${TMPDIR:-/tmp}/verso-bindings.XXXXXX")"
cargo run -q --locked -p verso-app -- --export-bindings "$tmp"
diff -u app/ui/src/bindings.ts "$tmp"
rm -f "$tmp"
step "the fuzz harnesses compile (ADR 0029, ADR 0083 item 14)"
# Packages of their own, outside the workspace, so neither clippy nor the
# tests above build them: on 2026-11-02 a field added to the server's host
# check broke one on main's CI after this machine had passed. Checked here,
# into the workspace's target; run only in CI's fuzz job, on nightly.
for fuzz in crates/verso-dialect/fuzz crates/verso-server/fuzz; do
  cargo check -q --locked --manifest-path "$fuzz/Cargo.toml" --target-dir target --all-targets
done
step "verso-dialect compiles to wasm32 (ADR 0029)"
rustup target list --installed | grep -qx wasm32-unknown-unknown || rustup target add wasm32-unknown-unknown
cargo check --target wasm32-unknown-unknown -p verso-dialect --locked

# Last, as the longest: in Docker, whatever this machine is (ADR 0058,
# decision of 2026-11-02).
e2e_said="the end-to-end tests with them, in Docker"
if [ "$e2e" = 0 ]; then
  e2e_said="WITHOUT the end-to-end tests (--no-e2e): run scripts/check-e2e.sh"
elif ! docker info >/dev/null 2>&1; then
  e2e_said="WITHOUT the end-to-end tests: Docker is not running here; run scripts/check-e2e.sh where it is"
else
  step "the window's end-to-end tests, the harness's and the server's, in Docker (ADR 0058, ADR 0073, local only)"
  bash scripts/check-e2e.sh
fi

printf '\nall guardrails green on %s; %s\n' "$(uname -s)" "$e2e_said"
