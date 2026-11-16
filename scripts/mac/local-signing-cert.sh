#!/usr/bin/env bash
# Creates, once, the fixed local code-signing identity "Verso Local Signing"
# that scripts/install-beta.sh signs the Mac beta with (ADR 0051 amendment of
# 2026-10-31, ADR 0095). Signed ad hoc, every install is a new app to macOS,
# which asks again for Downloads/Documents access and for Keychain items;
# signed with one fixed identity, the app keeps its designated requirement
# and macOS remembers what it was allowed.
#
#   scripts/mac/local-signing-cert.sh            create it (asks your login password)
#   scripts/mac/local-signing-cert.sh --remove   take it away again
#
# What it does, exactly:
#  1. openssl makes a self-signed certificate (RSA 2048, valid 10 years,
#     CN "Verso Local Signing", extended key usage codeSigning) and its key in
#     a private temporary directory, deleted when the script ends.
#  2. `security import` puts the key and the certificate in the login keychain
#     (the key is usable by codesign without a prompt on every build:
#     `security set-key-partition-list`, which needs the keychain password).
#  3. `security add-trusted-cert -p codeSign` trusts the certificate for code
#     signing only, for your user (macOS asks for your password).
# Nothing is written inside the repository, and no key leaves the keychain.
#
# To remove it: run this script with --remove (deletes the certificate, its
# key and the trust setting), or delete "Verso Local Signing" in Keychain
# Access. The next install-beta.sh then signs ad hoc again.
#
# For testing the script itself, VERSO_SIGNING_KEYCHAIN=<path> uses another
# keychain, VERSO_SIGNING_KEYCHAIN_PASSWORD its password (otherwise asked),
# and VERSO_SIGNING_NO_TRUST=1 skips step 3 (the trust setting is per user,
# not per keychain).
set -euo pipefail

NAME="Verso Local Signing"
KC="${VERSO_SIGNING_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"
fail() { echo "error: $*" >&2; exit 1; }
[ "$(uname -s)" = "Darwin" ] || fail "this is for macOS"
[ -f "$KC" ] || fail "keychain not found: $KC"

if [ "${1:-}" = "--remove" ]; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  if security find-certificate -c "$NAME" -p "$KC" > "$tmp/c.pem" 2>/dev/null; then
    [ -n "${VERSO_SIGNING_NO_TRUST:-}" ] || security remove-trusted-cert "$tmp/c.pem" 2>/dev/null || true
    security delete-identity -c "$NAME" "$KC" 2>/dev/null || security delete-certificate -c "$NAME" "$KC"
    echo "removed \"$NAME\" from $KC"
  else
    echo "\"$NAME\" is not in $KC"
  fi
  exit 0
fi

if security find-certificate -c "$NAME" "$KC" >/dev/null 2>&1; then
  echo "\"$NAME\" is already in $KC: nothing to do."
  exit 0
fi

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
chmod 700 "$tmp"
cat > "$tmp/openssl.cnf" <<CNF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CNF
# /usr/bin/openssl (LibreSSL) writes a .p12 that `security import` reads.
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -config "$tmp/openssl.cnf" -keyout "$tmp/key.pem" -out "$tmp/cert.pem" 2>/dev/null
pass="$(/usr/bin/openssl rand -hex 12)"
/usr/bin/openssl pkcs12 -export -inkey "$tmp/key.pem" -in "$tmp/cert.pem" \
  -name "$NAME" -passout "pass:$pass" -out "$tmp/id.p12"

kcpass="${VERSO_SIGNING_KEYCHAIN_PASSWORD:-}"
if [ -z "$kcpass" ]; then
  printf 'Password of the keychain (%s): ' "$(basename "$KC")" >&2
  read -r -s kcpass; echo >&2
fi
security unlock-keychain -p "$kcpass" "$KC"
security import "$tmp/id.p12" -k "$KC" -P "$pass" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$kcpass" "$KC" >/dev/null
if [ -z "${VERSO_SIGNING_NO_TRUST:-}" ]; then
  security add-trusted-cert -r trustRoot -p codeSign -k "$KC" "$tmp/cert.pem"
fi
echo "created \"$NAME\" in $KC"
security find-identity -p codesigning "$KC" | grep -F "$NAME" || true
