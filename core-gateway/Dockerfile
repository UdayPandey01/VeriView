FROM debian:bookworm-slim AS runtime
RUN echo 'Acquire::http::Pipeline-Depth 0;' > /etc/apt/apt.conf.d/99custom && \
	echo 'Acquire::http::No-Cache true;' >> /etc/apt/apt.conf.d/99custom && \
	echo 'Acquire::BrokenProxy "true";' >> /etc/apt/apt.conf.d/99custom && \
	apt-get update -o Acquire::ForceIPv4=true -o Acquire::Retries=3 && \
	apt-get install -y --no-install-recommends ca-certificates libssl3 passwd && \
	rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 veriview
WORKDIR /app
COPY target/release/core-gateway /usr/local/bin/core-gateway
USER veriview
EXPOSE 8082
CMD ["core-gateway"]