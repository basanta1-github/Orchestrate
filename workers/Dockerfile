# worker/Dockerfile

FROM node:20-alpine

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci

# Copy TS config
COPY tsconfig.json ./


# Copy all worker source code
COPY . ./

# Build workers
# RUN npm run build
RUN npx tsc

# Default command (overridden in docker-compose) if used there can skip here
# CMD ["node", "dist/email/worker.js"]

CMD ["tail", "-f", "/dev/null"]