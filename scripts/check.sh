#!/usr/bin/env bash
# The CI guardrails on this machine (ADR 0029): what the Linux job of
# .github/workflows/ci.yml runs, in the same order, natively — on a Mac this
# is the macOS check. Run it, and scripts/check-linux.sh, before pushing: CI
# confirms; it should not be where a failure is first seen. Keep the two in
# step with the workflow.
#
# Needs the Rust toolchain of rust-toolchain.toml, Node 22 for the UI and
# cargo-deny (`cargo install cargo-deny --locked`); the wasm32 target is added
# here if missing. The fuzzing and the benchmark are not run (see README.md).
# One step CI does not run: the window's end-to-end tests in WebKit and
# Chromium over the browser harness (ADR 0058), local only; Playwright's
# browsers are downloaded on the first run. On a Mac they run with one
# worker, without screen captures, after a pre-flight that refuses to start
# while a browser or the Verso app is open, and under a watch that stops
# them if the window server's surfaces climb (app/ui/e2e/preflight.mjs;
# ADR 0069 item 8, revised 2026-10-12: four WindowServer aborts).
set -euo pipefail
cd "$(dirname "$0")/.."
# The commit checked, so that a kept log names it.
printf 'checking %s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo 'no git')"

step() { printf '\n== %s\n' "$*"; }

# The end-to-end steps come late: what would refuse them refuses now, before
# the rest is built (app/ui/e2e/preflight.mjs; it does nothing off macOS).
node app/ui/e2e/preflight.mjs

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
step "std::fs in verso-app only in src/update.rs, src/log.rs and src/resolv_conf.rs (ADR 0029, ADR 0097)"
if grep -rnE --include='*.rs' '(std::fs|\bfs::|std::\{[^}]*\bfs\b)' app/src-tauri/src \
   | grep -vE '^app/src-tauri/src/(update|log|resolv_conf)\.rs:' \
   | grep -vE '^[^:]+:[0-9]+:[[:space:]]*//'; then
  echo 'std::fs outside app/src-tauri/src/update.rs, src/log.rs and src/resolv_conf.rs (ADR 0029, ADR 0097)'
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
step "UI: end-to-end tests in the browser harness (ADR 0058, local only)"
(
  cd app/ui
  # Nothing else drawing on this Mac's window server while they run
  # (ADR 0069 item 8, revised 2026-10-12); one worker on a Mac.
  node e2e/preflight.mjs
  npx playwright install webkit chromium >/dev/null
  if [ "$(uname -s)" = Darwin ]; then
    npx playwright test --workers=1
  else
    npx playwright test --workers=3
  fi
)
step "cargo clippy -D warnings"
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
step "cargo test"
cargo test --workspace --all-features --locked
step "the server's end-to-end tests: the window in a browser against verso serve (ADR 0073, local only)"
cargo build -q --locked -p verso-cli
(
  cd app/ui
  node e2e/preflight.mjs
  npx playwright test -c playwright.server.config.mjs --workers=1
)
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

printf '\nall guardrails green on %s\n' "$(uname -s)"
