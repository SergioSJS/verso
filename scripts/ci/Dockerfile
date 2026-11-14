# verso-ci: the image the Linux checks run in on a developer's machine
# (scripts/check-linux.sh, scripts/check-server-image.sh, scripts/check-e2e.sh;
# the maintainer's decision of 2026-11-02, fix release 0.8.5 item C2).
# Before it, every run of check-linux.sh started from rust:1-bookworm,
# installed WebKitGTK with apt-get and gave its ~20 GB of volumes to the `ci`
# user with chown -R; all of that is done once here.
#
# Built with no context (`docker build - < scripts/ci/Dockerfile`) by
# scripts/ci/image.sh, tagged with a hash of this file and of
# rust-toolchain.toml, so a change to either builds it again and nothing else
# does.
#
# - Rust: the official image of the version rust-toolchain.toml pins (passed
#   as RUST_VERSION by image.sh), with that file's components, the musl target of this
#   machine's architecture (the server's static build) and wasm32.
# - The system libraries the Tauri shell links against on Linux, as CI's
#   Linux job installs them (.github/workflows/ci.yml), and musl-gcc.
# - cargo-deny (the version CI uses) and cargo-nextest (the test runner of
#   the checks, with a per-test timeout: .config/nextest.toml).
# - Node, for what of the checks needs it in the container.
# - A user `ci` (uid 1000) that owns cargo's home and the mount points of
#   the volumes: the checks run as an ordinary user, as on a CI runner (root
#   ignores file permissions, and some tests deny access on purpose), and a
#   new named volume takes its owner from the image's directory. The
#   toolchain stays root's: it is only read.
ARG RUST_VERSION=1
FROM node:24.20.0-bookworm-slim AS node

FROM rust:${RUST_VERSION}-bookworm
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev \
      librsvg2-dev cmake musl-tools \
 && rm -rf /var/lib/apt/lists/*
RUN rustup component add rustfmt clippy \
 && rustup target add "$(uname -m)-unknown-linux-musl" wasm32-unknown-unknown
RUN cargo install --locked cargo-deny@0.20.2 \
 && cargo install --locked cargo-nextest@0.9.145 \
 && rm -rf /usr/local/cargo/registry/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && useradd -m -u 1000 ci \
 && mkdir -p /target /src /usr/local/cargo/registry \
 && chown -R ci:ci /target /src /usr/local/cargo
USER ci
ENV CARGO_TARGET_DIR=/target CARGO_INCREMENTAL=0
WORKDIR /src
