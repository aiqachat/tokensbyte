# syntax=docker/dockerfile:1
#
# 双模式后端镜像（默认安全，可选加速）：
#
# 1) 默认 USE_PREBUILT=0 — 容器内多阶段编译（Win/Mac/Linux 打给云服务器都安全）
#    docker compose build
#
# 2) 加速 USE_PREBUILT=1 — 使用仓库根目录预编译的 Linux 二进制 tokensbyte-server-bin
#    须为目标平台的 Linux ELF（amd64 云服务器一般为 x86_64），架构不符会直接构建失败
#    USE_PREBUILT=1 docker compose build
#
# 预编译示例（在 Linux 或交叉编译出 linux/amd64 后）：
#   cp target/release/tokensbyte-server ./tokensbyte-server-bin

ARG USE_PREBUILT=0

# ── 源码编译（默认路径）──
FROM rust:slim-bullseye AS build-from-source
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    make \
    g++ \
    perl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
COPY backend ./backend
COPY frontend/src/pages/Plugins/SitePortal/locales/portal ./frontend/src/pages/Plugins/SitePortal/locales/portal
WORKDIR /usr/src/app/backend
RUN cargo build --release -j 2 \
    && cp target/release/tokensbyte-server /tokensbyte-server

# ── 预编译二进制（可选加速；校验 ELF + 架构，防止 Win/Mac 本机二进制误打进镜像）──
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

# 按 USE_PREBUILT 选择二进制来源（BuildKit 会跳过未用到的分支）
FROM build-from-source AS binary-0
FROM build-from-prebuilt AS binary-1
FROM binary-${USE_PREBUILT} AS binary

# ── 运行阶段 ──
FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y \
    libssl1.1 \
    libsqlite3-0 \
    ca-certificates \
    postgresql-client \
    wget \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=binary /tokensbyte-server /app/tokensbyte-server
RUN mkdir -p /app/data
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["/app/tokensbyte-server"]
