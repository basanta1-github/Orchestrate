# shared/Dockerfile — build @jobque/shared artifact (used by CI or local pack)
FROM node:20-alpine AS builder

WORKDIR /build/shared

RUN apk add --no-cache python3 make g++

COPY shared/package*.json ./
RUN npm ci

COPY shared/tsconfig.json ./
COPY shared/src ./src

RUN npm run build && npm pack && mv jobque-shared-*.tgz /tmp/jobque-shared.tgz

# Export-only stage (not meant to run as a service)
FROM scratch AS export
COPY --from=builder /tmp/jobque-shared.tgz /