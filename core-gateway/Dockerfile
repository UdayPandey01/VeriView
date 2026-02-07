FROM rust:1.75 as builder
WORKDIR /app
COPY . .
RUN cargo build --release

# Runtime Stage (Tiny Image)
FROM debian:bookworm-slim
WORKDIR /app
# Install OpenSSL (Required for HTTP requests)
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/core-gateway .
CMD ["./core-gateway"]