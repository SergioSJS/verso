#!/usr/bin/env bash
# Prints the name of the verso-ci image (scripts/ci/Dockerfile), building it
# first when this machine's Docker does not have it. The tag is a hash of the
# Dockerfile and of rust-toolchain.toml: a new toolchain or a changed image
# builds a new one, any other run reuses it. What the build prints goes to
# stderr, so `image="$(bash scripts/ci/image.sh)"` gets the name alone.
# Old tags are not removed: `docker image ls verso-ci` lists them.
set -euo pipefail
cd "$(dirname "$0")/../.."
rust="$(sed -n 's/^channel *= *"\(.*\)"/\1/p' rust-toolchain.toml)"
[ -n "$rust" ] || { echo "no channel in rust-toolchain.toml" >&2; exit 1; }
if command -v sha256sum >/dev/null; then sum=(sha256sum); else sum=(shasum -a 256); fi
hash="$(cat scripts/ci/Dockerfile rust-toolchain.toml | "${sum[@]}" | cut -c1-12)"
image="verso-ci:$hash"
if ! docker image inspect "$image" >/dev/null 2>&1; then
  printf '\n== building %s (Rust %s), once for this Dockerfile and toolchain\n' "$image" "$rust" >&2
  docker build --progress=plain --build-arg RUST_VERSION="$rust" -t "$image" - < scripts/ci/Dockerfile >&2
fi
echo "$image"
