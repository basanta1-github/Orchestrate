# workers/Dockerfile — multi-stage: shared (pack) → workers (build) → runtime
# =============================================================================

# ── Stage 1: Build @jobque/shared ────────────────────────────────────────────
FROM node:20-alpine AS shared-builder

WORKDIR /build/shared

RUN apk add --no-cache python3 make g++

COPY shared/package*.json ./
RUN npm ci

COPY shared/tsconfig.json ./
COPY shared/src ./src

RUN npm run build && npm pack && mv jobque-shared-*.tgz /tmp/jobque-shared.tgz

# ── Stage 2: Build @jobque/workers ────────────────────────────────────────────
FROM node:20-alpine AS workers-builder

WORKDIR /build/workers

RUN apk add --no-cache python3 make g++

# Tarball built in stage 1 — path must match package-lock "file:../shared/..."
COPY --from=shared-builder /tmp/jobque-shared.tgz /build/shared/jobque-shared-1.0.0.tgz

COPY workers/package*.json ./

# RUN npm ci
# refresh internal tarbell hash, then ci for registery deps
RUN npm install file:/build/shared/jobque-shared-1.0.0.tgz && npm ci

COPY workers/tsconfig.json ./
COPY workers/src ./src

RUN npm run build && npm prune --omit=dev

# ── Stage 3: Production runtime ──────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app/workers

# ffmpeg required for media-worker (video/audio transcode)
RUN apk add --no-cache ffmpeg

ENV NODE_ENV=production

COPY --from=workers-builder /build/workers/dist ./dist
COPY --from=workers-builder /build/workers/node_modules ./node_modules
COPY --from=workers-builder /build/workers/package.json ./

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=60s \
    CMD node -e "fetch('http://127.0.0.1:3001/metrics').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]