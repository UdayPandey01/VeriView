FROM rust:1.77-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release || true && rm -rf src
COPY src ./src
RUN cargo build --release
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 veriview
WORKDIR /app
COPY --from=builder /app/target/release/core-gateway /usr/local/bin/core-gateway
USER veriview
EXPOSE 8082
CMD ["core-gateway"]