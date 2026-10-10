#!/usr/bin/env bash
# The sync lab (docs/reference/sync-lab.md): a Universo on this machine with
# the test vault, three people and two folders, kept under target/sync-lab
# between runs so that campaigns and load tests reuse it.
#
#   scripts/sync-lab/lab.sh up       build verso if needed, seed the vault once, start the
#                                    server on VERSO_LAB_PORT (7351), make the people and folders
#   scripts/sync-lab/lab.sh down     stop the server
#   scripts/sync-lab/lab.sh status   whether it runs, and lab.json
#   scripts/sync-lab/lab.sh reset    stop it and delete target/sync-lab (asks first)
#   scripts/sync-lab/lab.sh load [--devices N] [--seconds S] [--label "…"]
#                                    the load test against the lab's "Carga" folder
#
# Everything here is test data: the passwords are generated, kept in
# target/sync-lab/lab.json (mode 600), and never leave this machine.
set -euo pipefail

cd "$(dirname "$0")/../.."
LAB="${VERSO_LAB_DIR:-$PWD/target/sync-lab}"
PORT="${VERSO_LAB_PORT:-7351}"
URL="http://localhost:$PORT"
ADMIN="admin@lab.test"
mkdir -p "$LAB"

running() { [ -f "$LAB/server.pid" ] && kill -0 "$(cat "$LAB/server.pid")" 2>/dev/null; }

case "${1:-}" in
  up)
    if [ ! -x target/release/verso ]; then
      cargo build --release --locked -p verso-cli
    fi
    if [ ! -d "$LAB/folders/Caderno" ]; then
      mkdir -p "$LAB/folders"
      node scripts/sync-lab/seed.mjs "$LAB/folders/Caderno"
    fi
    [ -f "$LAB/admin.password" ] || { head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$LAB/admin.password"; chmod 600 "$LAB/admin.password"; }
    if running; then
      echo "the lab's server runs already (pid $(cat "$LAB/server.pid"))"
    else
      env VERSO_DATA_DIR="$LAB/data" VERSO_FOLDERS_DIR="$LAB/folders" VERSO_LISTEN="127.0.0.1:$PORT" \
        VERSO_ADMIN_EMAIL="$ADMIN" VERSO_ADMIN_PASSWORD="$(cat "$LAB/admin.password")" \
        VERSO_UPDATE_CHECK=false \
        nohup target/release/verso serve --web >> "$LAB/server.log" 2>&1 &
      echo $! > "$LAB/server.pid"
      for _ in $(seq 1 30); do
        curl -s -o /dev/null "$URL/" && break
        sleep 0.5
      done
    fi
    node scripts/sync-lab/setup.mjs "$URL" "$LAB" "$ADMIN" "$(cat "$LAB/admin.password")"
    echo "server: $URL (log $LAB/server.log)"
    ;;
  down)
    if running; then kill "$(cat "$LAB/server.pid")"; rm -f "$LAB/server.pid"; echo stopped; else echo "not running"; fi
    ;;
  status)
    if running; then echo "running: pid $(cat "$LAB/server.pid"), $URL"; else echo "not running"; fi
    [ -f "$LAB/lab.json" ] && sed 's/"password": "[^"]*"/"password": "…"/' "$LAB/lab.json"
    ;;
  reset)
    read -r -p "Delete $LAB (the lab's server data, folders and passwords)? [y/N] " yes
    [ "$yes" = "y" ] || exit 1
    "$0" down || true
    rm -rf "$LAB"
    ;;
  load)
    shift
    running || { echo "the lab's server is not running: scripts/sync-lab/lab.sh up"; exit 1; }
    accounts=$(node -e 'const l=require(process.argv[1]); console.log(l.accounts.filter(a=>a.password).map(a=>a.email+":"+a.password).join(","))' "$LAB/lab.json")
    folder=$(node -e 'console.log(require(process.argv[1]).folders.Carga)' "$LAB/lab.json")
    node scripts/server-load.mjs --url "$URL" --folder "$folder" --disk "$LAB/folders/Carga" --accounts "$accounts" "$@"
    ;;
  *)
    sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
