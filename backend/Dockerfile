FROM rust:1.94-slim-bullseye as builder

WORKDIR /usr/src/app
RUN apt-get update && apt-get install -y pkg-config libssl-dev libsqlite3-dev
COPY . .
RUN cargo build --release

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y libssl1.1 libsqlite3-0 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /usr/src/app/target/release/tokensbyte-server /app/tokensbyte-server
RUN mkdir -p /data
EXPOSE 3300
CMD ["/app/tokensbyte-server"]
