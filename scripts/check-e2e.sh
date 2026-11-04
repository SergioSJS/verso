#!/usr/bin/env bash
# The window's end-to-end tests, in Docker (ADR 0058; the maintainer's
# decision of 2026-11-02, fix release 0.8.5 item C2): never on a Mac's own
# window server, which aborted under Playwright three times (ADR 0069 item
# 8), and with several workers, which a Mac could not afford. On a Mac
# they took 1 h 10 with one worker.
#
# Two suites, both in Playwright's own image (the version of
# app/ui/package.json), in one container:
#
# - the browser harness (app/ui/playwright.config.mjs), every project of
#   the config — WebKit, Chromium and the phone and tablet sizes — with
#   E2E_WORKERS workers (default 3);
# - the server's (app/ui/playwright.server.config.mjs): the window against
#   a real `verso serve`, one worker as its config says (one server, one
#   database). Its `verso` is a Linux build of verso-cli, made first in a
#   Rust container and handed over in a volume.
#
# One after the other, not at once: run together on 2026-11-03 (a 4-CPU
# Docker machine) the two suites took 48 min and starved each other's
# browsers — 14 timing failures (the 3D dice in Chromium's software WebGL,
# a board's pan and zoom, a session's end), every one green when run again
# alone. The harness's own fault on any console error or log line is kept:
# the specs and fixtures are the repository's, unchanged.
#
# The repository goes in read-only and is copied inside (no target/, .git,
# node_modules or earlier results), so nothing here touches the checkout but
# the results: on a failure, Playwright's traces and screenshots are copied
# back to app/ui/e2e/results and app/ui/e2e-server/results.
#
# `--ui` runs the harness's suite alone, `--server` the server's; any other
# argument goes to both `playwright test` runs (a file, `-g`, `--project`).
# Needs Docker; the npm cache and the Rust build live in named volumes, so a
# second run starts in about a minute.
set -euo pipefail
cd "$(dirname "$0")/.."
printf 'checking %s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo 'no git')"
command -v docker >/dev/null || { echo "docker not found"; exit 1; }

ui=1 server=1
case "${1:-}" in
  --ui) server=0; shift ;;
  --server) ui=0; shift ;;
esac
workers="${E2E_WORKERS:-3}"
pw="$(node -p 'require("./app/ui/package.json").devDependencies["@playwright/test"]')"
image="mcr.microsoft.com/playwright:v${pw}-noble"

if [ "$server" = 1 ]; then
  printf '\n== verso-cli for the server suite, in a Linux container\n'
  docker run --rm \
    -v "$PWD":/src:ro -w /src \
    -v verso-e2e-target:/target -e CARGO_TARGET_DIR=/target \
    -e CARGO_PROFILE_DEV_DEBUG=0 -e CARGO_INCREMENTAL=0 -e VERSO_COMMIT=e2e \
    -v verso-e2e-cargo:/usr/local/cargo/registry \
    -v verso-e2e-bin:/out \
    rust:1-bookworm bash -c 'cargo build -q --locked -p verso-cli && mkdir -p /out/debug && cp /target/debug/verso /out/debug/verso'
fi

# Only this run's results come back.
rm -rf app/ui/e2e/results app/ui/e2e-server/results
mkdir -p app/ui/e2e/results app/ui/e2e-server/results
printf '\n== the end-to-end tests in %s (harness: %s workers)\n' "$image" "$workers"
# --init reaps the browsers' children; --ipc=host as Playwright's docs ask
# for Chromium, which otherwise runs out of shared memory.
docker run --rm --init --ipc=host \
  -v "$PWD":/src:ro \
  -v verso-e2e-npm:/root/.npm \
  -v verso-e2e-bin:/verso-bin:ro \
  -v "$PWD/app/ui/e2e/results":/out/e2e \
  -v "$PWD/app/ui/e2e-server/results":/out/e2e-server \
  -e UI="$ui" -e SERVER="$server" -e WORKERS="$workers" \
  -e OWNER="$(id -u):$(id -g)" \
  "$image" bash -c '
set -uo pipefail
mkdir /work && cd /src
tar --exclude=./target --exclude=./.git --exclude=./.claude --exclude="*/node_modules" \
  --exclude=./app/ui/e2e/.site --exclude=./app/ui/e2e/results \
  --exclude=./app/ui/e2e-server/results --exclude=./docs/media -cf - . | tar -xf - -C /work
cd /work/app/ui
npm ci --no-audit --no-fund --loglevel=error >/dev/null || exit 1
npm run build >/dev/null 2>&1 || { npm run build; exit 1; }
rc=0
if [ "$UI" = 1 ]; then
  start=$(date +%s)
  printf "\n== the harness suite, %s workers\n" "$WORKERS"
  npx playwright test --workers="$WORKERS" "$@" || { rc=1; cp -R e2e/results/. /out/e2e/; }
  printf "\nthe harness suite: %s s\n" "$(( $(date +%s) - start ))"
fi
if [ "$SERVER" = 1 ]; then
  start=$(date +%s)
  printf "\n== the server suite\n"
  CARGO_TARGET_DIR=/verso-bin npx playwright test -c playwright.server.config.mjs "$@" \
    || { rc=1; cp -R e2e-server/results/. /out/e2e-server/; }
  printf "\nthe server suite: %s s\n" "$(( $(date +%s) - start ))"
fi
chown -R "$OWNER" /out
exit $rc
' e2e "$@"
