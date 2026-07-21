# syntax=docker/dockerfile:1
# USE_PREBUILT=0 容器内编译；=1 用根目录 Linux ELF。JOBS/CACHE 由 compose/脚本注入。

ARG USE_PREBUILT=0
ARG ENABLE_CARGO_CACHE=1
ARG CARGO_BUILD_JOBS=1

FROM rust:slim-bullseye AS build-deps
ARG CARGO_BUILD_JOBS=1
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse \
    CARGO_INCREMENTAL=0 \
    RUSTFLAGS="-C link-arg=-fuse-ld=lld"
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev make g++ perl ca-certificates lld \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
COPY backend ./backend
COPY frontend/src/pages/Plugins/SitePortal/locales/portal ./frontend/src/pages/Plugins/SitePortal/locales/portal
WORKDIR /usr/src/app/backend

# 无 cache：交叉架构（QEMU）更稳，避免 mount + qemu segfault
FROM build-deps AS build-plain
ARG CARGO_BUILD_JOBS=1
RUN cargo build --release -j "${CARGO_BUILD_JOBS:-1}" \
    && cp -f target/release/tokensbyte-server /tokensbyte-server

# 有 cache：同架构重复构建更快
FROM build-deps AS build-cached
ARG CARGO_BUILD_JOBS=1
ARG TARGETARCH
RUN --mount=type=cache,id=tb-cargo-reg-${TARGETARCH},target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=tb-cargo-git-${TARGETARCH},target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,id=tb-cargo-tgt-${TARGETARCH},target=/usr/src/app/backend/target,sharing=locked \
    cargo build --release -j "${CARGO_BUILD_JOBS:-1}" \
    && cp -f target/release/tokensbyte-server /tokensbyte-server

FROM build-plain AS src-0
FROM build-cached AS src-1
FROM src-${ENABLE_CARGO_CACHE} AS build-from-source

FROM debian:bullseye-slim AS build-from-prebuilt
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends file \
    && rm -rf /var/lib/apt/lists/*
COPY tokensbyte-server-bin /tokensbyte-server
RUN set -eu; \
    info="$(file -b /tokensbyte-server)"; \
    echo "prebuilt: $info (TARGETARCH=${TARGETARCH})"; \
    echo "$info" | grep -q 'ELF' || { echo "ERROR: tokensbyte-server-bin 必须是 Linux ELF，不能是 Windows/macOS 本机二进制"; exit 1; }; \
    case "${TARGETARCH}" in \
      amd64) echo "$info" | grep -Eq 'x86-64|x86_64' || { echo "ERROR: 目标 amd64，但预编译二进制架构不匹配: $info"; exit 1; } ;; \
      arm64|aarch64) echo "$info" | grep -Eq 'aarch64|ARM aarch64' || { echo "ERROR: 目标 arm64，但预编译二进制架构不匹配: $info"; exit 1; } ;; \
      *) echo "ERROR: 不支持的 TARGETARCH=${TARGETARCH}"; exit 1 ;; \
    esac; \
    chmod +x /tokensbyte-server

FROM build-from-source AS binary-0
FROM build-from-prebuilt AS binary-1
FROM binary-${USE_PREBUILT} AS binary

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl1.1 libsqlite3-0 ca-certificates postgresql-client wget \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=binary /tokensbyte-server /app/tokensbyte-server
RUN mkdir -p /app/data
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["/app/tokensbyte-server"]
