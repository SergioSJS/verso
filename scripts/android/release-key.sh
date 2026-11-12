#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# The key that signs every release of the Android app (ADR 0118 item 10.1,
# decided 2026-11-12). FOR THE MAINTAINER, on a computer of his own — not
# the Thoughtworks laptop, which keeps no personal secret. The key is for
# ever: an APK signed by another key does not install over Verso, so a lost
# key means every phone uninstalls (and loses an unsynced folder).
#
# What it does: makes a PKCS12 keystore with one RSA 4096 key valid for 30
# years, in a new directory under the current one, with a random password
# (the key's password is the same, as PKCS12 wants), and prints:
#   - the four values for the password manager;
#   - the four GitHub secrets the release workflow reads, the keystore as
#     base64 (VERSO_ANDROID_KEYSTORE_B64);
#   - the keystore's SHA-256 fingerprint (what phones see; it can be
#     published).
# It sends nothing anywhere. Afterwards: put the values in the password
# manager, add the secrets (gh secret set …, the commands are printed), then
# delete the directory — or keep the .p12 only inside the password manager.
#
# Usage: scripts/android/release-key.sh ["Common Name"]
# Needs: keytool (any JDK 17+), openssl, base64.

set -euo pipefail

name=${1:-Verso}
alias=verso-release
dir="verso-android-key-$(date +%Y%m%d-%H%M%S)"
umask 077
mkdir "$dir"
store="$dir/verso-release.p12"
password=$(openssl rand -base64 33 | tr -d '/+=' | cut -c1-40)

keytool -genkeypair -v \
  -storetype PKCS12 -keystore "$store" -storepass "$password" \
  -alias "$alias" -keypass "$password" \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -dname "CN=$name, O=Verso, C=BR" >/dev/null 2>&1

base64 < "$store" | tr -d '\n' > "$dir/verso-release.p12.base64"
fingerprint=$(keytool -list -v -keystore "$store" -storepass "$password" -alias "$alias" | sed -n 's/^.*SHA256: //p')

cat <<OUT

The release key is in $dir/ (only you can read it).

1. In the password manager, one entry "Verso Android release key":
   - attach $store
   - keystore password: $password
   - key alias: $alias
   - key password: the same as the keystore's
   - SHA-256 fingerprint: $fingerprint

2. The repository's secrets (the release workflow reads them):
   gh secret set VERSO_ANDROID_KEYSTORE_B64 < $dir/verso-release.p12.base64
   gh secret set VERSO_ANDROID_KEYSTORE_PASSWORD --body '$password'
   gh secret set VERSO_ANDROID_KEY_ALIAS --body '$alias'
   gh secret set VERSO_ANDROID_KEY_PASSWORD --body '$password'

3. A release built by hand with this key (on your own computer):
   export VERSO_ANDROID_KEYSTORE=\$PWD/$store
   export VERSO_ANDROID_KEYSTORE_PASSWORD='$password'
   export VERSO_ANDROID_KEY_ALIAS=$alias
   export VERSO_ANDROID_KEY_PASSWORD='$password'

4. Then delete $dir/ (rm -rf $dir) once the password manager holds the
   file and the four values.

The first APK signed with this key does not install over one signed with
the debug key: sync the phone's folder, uninstall Verso, install the new one.
OUT
