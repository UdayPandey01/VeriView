FROM ghcr.io/puppeteer/puppeteer:latest AS builder
WORKDIR /usr/src/app
ENV NODE_ENV=development PUPPETEER_SKIP_DOWNLOAD=true
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM ghcr.io/puppeteer/puppeteer:latest AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /usr/src/app/dist ./dist
USER pptruser
EXPOSE 3002
CMD ["node", "dist/server.js"]

