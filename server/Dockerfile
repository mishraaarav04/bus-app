# RouteIQ server. Build from the server/ folder:  docker build -t wheelie-server .
FROM node:22-slim AS build
WORKDIR /app
# better-sqlite3 ships prebuilt binaries; these are only needed if one isn't available.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/wheelie.db PORT=8080 TRUST_PROXY=1 REQUIRE_HTTPS=true
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY scripts ./scripts
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "dist/index.js"]
