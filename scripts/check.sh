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
# One step CI does not run: the window's end-to-end tests in WebKit over the
# browser harness (ADR 0058), local only; Playwright's WebKit is downloaded
# on the first run.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n== %s\n' "$*"; }

step "docs mirror (ADR 0008)"
bash scripts/check-docs-mirror.sh
step "fixtures (ADR 0031)"
bash scripts/check-fixtures.sh
step "npm licenses (ADR 0029)"
node scripts/check-npm-licenses.mjs
step "source files under the size limit (ADR 0067)"
node scripts/check-sizes.mjs

step "demo vault built from its sources (ADR 0058)"
node scripts/demo-vault.mjs check
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
step "std::fs in verso-app only in src/update.rs and src/log.rs (ADR 0029)"
if grep -rnE --include='*.rs' '(std::fs|\bfs::|std::\{[^}]*\bfs\b)' app/src-tauri/src \
   | grep -vE '^app/src-tauri/src/(update|log)\.rs:' \
   | grep -vE '^[^:]+:[0-9]+:[[:space:]]*//'; then
  echo 'std::fs outside app/src-tauri/src/update.rs and src/log.rs (ADR 0029)'
  exit 1
fi
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
  npx playwright install webkit chromium >/dev/null
  npx playwright test
)
step "cargo clippy -D warnings"
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
step "cargo test"
cargo test --workspace --all-features --locked
step "the committed bindings are the generated ones (ADR 0026 rule 3)"
tmp="$(mktemp "${TMPDIR:-/tmp}/verso-bindings.XXXXXX")"
cargo run -q --locked -p verso-app -- --export-bindings "$tmp"
diff -u app/ui/src/bindings.ts "$tmp"
rm -f "$tmp"
step "verso-dialect compiles to wasm32 (ADR 0029)"
rustup target list --installed | grep -qx wasm32-unknown-unknown || rustup target add wasm32-unknown-unknown
cargo check --target wasm32-unknown-unknown -p verso-dialect --locked

printf '\nall guardrails green on %s\n' "$(uname -s)"
