# The static `verso` (musl) of scripts/check-server-image.sh, built in the
# verso-ci image (scripts/ci/Dockerfile) of this machine's architecture. The
# build output and the cargo registry live in BuildKit cache mounts, kept
# from one run to the next by the builder (`docker builder prune` frees
# them); before 2026-11-03 a volume held them and was removed after every
# run, so each one compiled the server from nothing. The binary comes out
# with `--output type=local`: no image is made.
#
#   docker build -f scripts/ci/musl.Dockerfile --build-arg CI_IMAGE=verso-ci:… \
#     --output type=local,dest=out <sources>
ARG CI_IMAGE
FROM ${CI_IMAGE} AS build
COPY --chown=ci:ci . /src
RUN --mount=type=cache,id=verso-musl-target,target=/target,uid=1000,gid=1000 \
    --mount=type=cache,id=verso-musl-registry,target=/usr/local/cargo/registry,uid=1000,gid=1000 \
    set -e; \
    arch="$(uname -m)"; \
    export "CC_${arch}_unknown_linux_musl=musl-gcc"; \
    cargo build --release --locked -p verso-cli --target "${arch}-unknown-linux-musl"; \
    cp "/target/${arch}-unknown-linux-musl/release/verso" /tmp/verso

FROM scratch
COPY --from=build /tmp/verso /verso
