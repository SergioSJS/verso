#!/usr/bin/env bash
# Hostile-lab runner (ADR 0083 item 19): build the server image, start one
# throwaway container bound to 127.0.0.1 only (never 0.0.0.0 — no service is
# exposed off this machine), run the attacks, tear the container down.
# Local Docker only. Not shipped to users.
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT="${PORT:-18443}"
NAME=universo-hostile
LAB="$HOME/.cache/verso-kit/hostile-lab"
mkdir -p "$LAB/certs"

echo "== build the image (scripts/check-server-image.sh)"
PORT=17340 bash scripts/check-server-image.sh >"$LAB/image-build.log" 2>&1
tail -1 "$LAB/image-build.log"

C="$LAB/certs"
[ -f "$C/cert.pem" ] || openssl req -x509 -newkey ec \
  -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 1 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost -keyout "$C/key.pem" -out "$C/cert.pem" 2>/dev/null
chmod 644 "$C"/*.pem

docker rm -f "$NAME" >/dev/null 2>&1 || true
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:7340" \
  --read-only --tmpfs /tmp --cap-drop ALL --cap-add CHOWN --cap-add SETUID \
  --cap-add SETGID --security-opt no-new-privileges:true \
  -v "$C":/certs:ro \
  -e VERSO_PUBLIC_URL="https://localhost:$PORT" \
  -e VERSO_TLS_CERT_FILE=/certs/cert.pem -e VERSO_TLS_KEY_FILE=/certs/key.pem \
  -e VERSO_ADMIN_EMAIL=admin@verso.test \
  -e VERSO_ADMIN_PASSWORD='uma senha bem longa de teste' \
  -e VERSO_UPDATE_CHECK=off universo:check >/dev/null

for _ in $(seq 1 30); do
  curl -sk "https://localhost:$PORT/api/state" >/dev/null 2>&1 && break
  sleep 1
done

echo "== attacks"
python3 -I lab/hostile/attack.py "https://localhost:$PORT"
