FROM ghcr.io/puppeteer/puppeteer:latest AS builder
WORKDIR /usr/src/app
ENV NODE_ENV=development \
	PUPPETEER_SKIP_DOWNLOAD=true \
	NODE_OPTIONS=--dns-result-order=ipv4first
COPY package*.json ./
RUN sh -c 'for i in 1 2 3; do \
	npm ci --fetch-retries=8 --fetch-retry-maxtimeout=120000 --fetch-retry-mintimeout=20000 --network-timeout=300000 && exit 0; \
	npm config set registry https://registry.npmmirror.com; \
	npm ci --fetch-retries=8 --fetch-retry-maxtimeout=120000 --fetch-retry-mintimeout=20000 --network-timeout=300000 && exit 0; \
	npm config set registry https://registry.npmjs.org; \
	echo "npm ci failed (attempt $i/3), retrying..."; \
	sleep $((i * 10)); \
done; exit 1'
COPY . .
RUN npm run build
FROM ghcr.io/puppeteer/puppeteer:latest AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production \
	PUPPETEER_SKIP_DOWNLOAD=true \
	PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome \
	NODE_OPTIONS=--dns-result-order=ipv4first
COPY package*.json ./
RUN sh -c 'for i in 1 2 3; do \
	npm ci --omit=dev --fetch-retries=8 --fetch-retry-maxtimeout=120000 --fetch-retry-mintimeout=20000 --network-timeout=300000 && exit 0; \
	npm config set registry https://registry.npmmirror.com; \
	npm ci --omit=dev --fetch-retries=8 --fetch-retry-maxtimeout=120000 --fetch-retry-mintimeout=20000 --network-timeout=300000 && exit 0; \
	npm config set registry https://registry.npmjs.org; \
	echo "npm ci --omit=dev failed (attempt $i/3), retrying..."; \
	sleep $((i * 10)); \
done; exit 1'
COPY --from=builder /usr/src/app/dist ./dist
USER pptruser
EXPOSE 3002
CMD ["node", "dist/server.js"]

