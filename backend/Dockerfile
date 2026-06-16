FROM rust:1.94-slim-bullseye as builder

WORKDIR /usr/src/app
RUN apt-get update && apt-get install -y pkg-config libssl-dev libsqlite3-dev git
# 拷贝 .git 目录以便 build.rs 能够获取到最新提交记录
COPY .git/ ./.git/
# 配置 git 安全目录权限，防止 dubious ownership 问题导致读取失败
RUN git config --global --add safe.directory /usr/src/app

COPY backend/ ./backend/
WORKDIR /usr/src/app/backend
RUN cargo build --release

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y libssl1.1 libsqlite3-0 ca-certificates postgresql-client wget && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /usr/src/app/backend/target/release/tokensbyte-server /app/tokensbyte-server
RUN mkdir -p /app/data
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["/app/tokensbyte-server"]
