# Stage 1: install workspaces and build the SPA
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps ./apps
RUN npm run build --workspace apps/web

# Stage 2: runtime.
# Base is node:22-slim (Debian), NOT alpine — the Codex CLI ships a
# glibc-linked Rust binary that does not run on musl.
FROM node:22-slim
WORKDIR /app

# ca-certificates: node:22-slim ships without a system trust store (Node has
# its own bundled roots), but codex is a Rust binary that reads /etc/ssl/certs
# — without this it rejects every TLS peer with UnknownIssuer.
# poppler-utils: pdftotext, so the agent can read uploaded PDFs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates poppler-utils \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @openai/codex

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
# The container is the isolation boundary; codex's own bubblewrap sandbox
# cannot create namespaces under Docker's default seccomp profile.
ENV CODEX_SANDBOX=danger-full-access
VOLUME /data
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "apps/server/src/index.js"]
