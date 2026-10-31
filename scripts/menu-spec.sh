#!/usr/bin/env bash
# Writes app/ui/src/harness/menuSpec.json, the window's menus as the host
# exposes them, for the browser harness, which has no host. The spec comes
# from the host's own test (app/src-tauri/src/menu_spec.rs), which prints it
# when VERSO_PRINT_MENU_SPEC is set; the file is written here because the
# app's crate keeps no `std::fs` (ADR 0029).
set -euo pipefail
cd "$(dirname "$0")/.."
out=app/ui/src/harness/menuSpec.json
printed=$(VERSO_PRINT_MENU_SPEC=1 cargo test -q -p verso-app --lib \
  the_harness_has_the_spec_the_host_exposes -- --nocapture)
spec=$(printf '%s\n' "$printed" | tr -d '\r' \
  | awk '/^<<<menu-spec$/{on=1; next} /^menu-spec>>>/{on=0} on')
if [ -z "$spec" ]; then
  echo "menu-spec: the host's test did not print the spec" >&2
  exit 1
fi
printf '%s\n' "$spec" > "$out"
echo "menu-spec: wrote $out"
