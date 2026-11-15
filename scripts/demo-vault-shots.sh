#!/usr/bin/env bash
# The English screenshots of the demo vault (ADR 0058, B6; roadmap V.31), in
# Docker, in Playwright's own image — as scripts/check-e2e.sh runs the
# window's tests, and never on a Mac's window server. The scenes are the
# ones of app/ui/e2e/demo-vault-shots.spec.mjs (the browser harness and the
# server's pages with their API answered by the spec, the window in
# English); the pictures are written into demo-vault-en/assets/. Run it
# again after any change to a screen they show: `node scripts/demo-vault.mjs
# shots` calls this.
#
# One container (no other Playwright one should run: `docker ps`). The
# repository goes in read-only and is copied inside, as check-e2e.sh does.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
pw="$(node -p 'require("./app/ui/package.json").devDependencies["@playwright/test"]')"
image="mcr.microsoft.com/playwright:v${pw}-noble"
out="$PWD/demo-vault-en/assets"
mkdir -p "$out"
docker run --rm --init --ipc=host \
  -v "$PWD":/src:ro \
  -v verso-e2e-npm:/root/.npm \
  -v "$out":/out \
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
SHOTS=/out npx playwright test e2e/demo-vault-shots.spec.mjs --project=chromium --workers=1 || rc=1
chown -R "$OWNER" /out
exit $rc
'
