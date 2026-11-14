#!/usr/bin/env sh
# The installer's channel (ADR 0051, amendment of 2026-11-14): with
# FINALS=1, universo.sh's pick_asset skips test releases, so a server on a
# final version updates only to finals. pick_asset reads GitHub's answer
# with jq or with python3; each one present is checked.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
printf '%s' '[{"tag_name":"v0.9.1-beta.1","draft":false,"prerelease":true,"assets":[{"name":"universo-0.9.1-beta.1-amd64.deb","url":"u1"}]},{"tag_name":"v0.9.0","draft":false,"prerelease":false,"assets":[{"name":"universo-0.9.0-amd64.deb","url":"u2"}]}]' > "$tmp/rels.json"

# A PATH with python3 and not jq, for the second reader.
mkdir "$tmp/nojq"
for c in sh cut cat printf; do ln -s "$(command -v "$c")" "$tmp/nojq/$c"; done
if command -v python3 >/dev/null 2>&1; then
  ln -s "$(python3 -c 'import sys; print(sys.executable)')" "$tmp/nojq/python3"
fi

ran=0
check() { # reader PATH
  for want in 0:v0.9.1-beta.1 1:v0.9.0; do
    got=$(PATH=$2 UNIVERSO_SH_FUNCTIONS=1 FINALS=${want%%:*} sh -c ". '$here/packaging/server/universo.sh'; PKG_RE='amd64\\.deb\$'; pick_asset '$tmp/rels.json'" | cut -f1)
    if [ "$got" != "${want#*:}" ]; then
      echo "FAILED ($1): FINALS=${want%%:*} picked '$got', not ${want#*:}" >&2
      exit 1
    fi
  done
  ran=$((ran + 1))
}
if command -v jq >/dev/null 2>&1; then check jq "$PATH"; fi
if [ -e "$tmp/nojq/python3" ]; then check python3 "$tmp/nojq"; fi
[ "$ran" -gt 0 ] || { echo "neither jq nor python3 here: the installer's channel was not checked" >&2; exit 1; }
echo "the installer's channel: a final takes only finals ($ran reader(s) checked)"
