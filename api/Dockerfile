# api/Dockerfile — multi-stage: shared (pack) → workers (pack) → api (nest build)
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

# ── Stage 2: Build @jobque/workers (pack only — API imports worker module) ───
FROM node:20-alpine AS workers-builder

WORKDIR /build/workers

RUN apk add --no-cache python3 make g++

COPY --from=shared-builder /tmp/jobque-shared.tgz /build/shared/jobque-shared-1.0.0.tgz
COPY workers/package*.json ./

RUN npm install file:/build/shared/jobque-shared-1.0.0.tgz && npm ci

COPY workers/tsconfig.json ./
COPY workers/src ./src

RUN npm run build && npm pack && mv jobque-workers-*.tgz /tmp/jobque-workers.tgz

# ── Stage 3: Build API ───────────────────────────────────────────────────────
FROM node:20-alpine AS api-builder

WORKDIR /build/api

RUN apk add --no-cache python3 make g++

COPY --from=shared-builder /tmp/jobque-shared.tgz /build/shared/jobque-shared-1.0.0.tgz
COPY --from=workers-builder /tmp/jobque-workers.tgz /build/workers/jobque-workers-1.0.0.tgz
COPY api/package*.json ./

# FIX: both internal tarballs before npm ci
RUN npm install file:/build/shared/jobque-shared-1.0.0.tgz file:/build/workers/jobque-workers-1.0.0.tgz && npm ci


COPY api/tsconfig*.json api/nest-cli.json ./
COPY api/src ./src

RUN npm run build && npm prune --omit=dev

# ── Stage 4: Production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app/api

RUN apk add --no-cache wget

ENV NODE_ENV=production

COPY --from=api-builder /build/api/dist ./dist
COPY --from=api-builder /build/api/node_modules ./node_modules
COPY --from=api-builder /build/api/package.json ./
COPY dashboard /app/dashboard

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=40s \
    CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/main.js"]