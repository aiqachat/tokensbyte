FROM rust:1.94-slim-bullseye as builder

WORKDIR /usr/src/app
RUN apt-get update && apt-get install -y pkg-config libssl-dev libsqlite3-dev git
COPY backend/ ./backend/
COPY .git/ ./.git/
WORKDIR /usr/src/app/backend
RUN cargo build --release

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y libssl1.1 libsqlite3-0 ca-certificates postgresql-client wget && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /usr/src/app/backend/target/release/tokensbyte-server /app/tokensbyte-server
RUN mkdir -p /data
EXPOSE 3000
CMD ["/app/tokensbyte-server"]
