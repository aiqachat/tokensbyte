# syntax=docker/dockerfile:1
#
# 后端镜像 Dockerfile（优化版：依赖分层缓存 + 白名单源码拷贝 + 必备语言包）
#

ARG USE_PREBUILT=0
ARG CARGO_BUILD_JOBS=1

# ── 1. 源码编译阶段 ──
FROM rust:slim-bookworm AS builder
ARG CARGO_BUILD_JOBS
ARG USE_PREBUILT

ENV CARGO_INCREMENTAL=0 \
    RUSTFLAGS="-C linker=clang -C link-arg=-fuse-ld=mold"

WORKDIR /usr/src/app/backend

# 精简安装构建必需的编译与链接工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    make \
    g++ \
    perl \
    clang \
    mold \
    && rm -rf /var/lib/apt/lists/*

# A. 仅拷贝 Cargo 依赖清单，预构建第三方依赖（稳固的 Docker 依赖缓存层）
COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs

# 预编译所有 Cargo 第三方依赖库
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/src/app/backend/target \
    if [ "$USE_PREBUILT" = "0" ]; then \
        cargo build --release ${CARGO_BUILD_JOBS:+-j $CARGO_BUILD_JOBS} || true ; \
    fi

# B. 精准白名单拷贝：仅拷贝编译必需的代码文件与编译期绑定的 Portal 语言包
COPY backend/src ./src
COPY backend/build.rs ./
COPY backend/git_log.txt* ./
COPY frontend/src/pages/Plugins/SitePortal/locales/portal /usr/src/app/frontend/src/pages/Plugins/SitePortal/locales/portal

# 编译最终的可执行文件
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/src/app/backend/target \
    if [ "$USE_PREBUILT" = "1" ] && [ -f "/usr/src/app/tokensbyte-server-bin" ]; then \
        cp /usr/src/app/tokensbyte-server-bin /tokensbyte-server ; \
    else \
        cargo build --release ${CARGO_BUILD_JOBS:+-j $CARGO_BUILD_JOBS} && \
        cp target/release/tokensbyte-server /tokensbyte-server ; \
    fi

# ── 2. 运行阶段 ──
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 \
    libsqlite3-0 \
    ca-certificates \
    postgresql-client \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /tokensbyte-server /app/tokensbyte-server
RUN mkdir -p /app/data

EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["/app/tokensbyte-server"]
