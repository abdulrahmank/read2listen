# Stage 1: install workspaces and build the SPA
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps ./apps
RUN npm run build --workspace apps/web

# Stage 2: runtime.
# Base is node:20-slim (Debian), NOT alpine — the Codex CLI ships a
# glibc-linked Rust binary that does not run on musl.
FROM node:20-slim
WORKDIR /app

RUN npm install -g @openai/codex

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev

COPY apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "apps/server/src/index.js"]
