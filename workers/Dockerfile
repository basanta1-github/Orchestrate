# worker/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy shared library from root context and the worker package files
COPY shared/package*.json ./shared/
COPY workers/package*.json ./workers/

# Install deps
WORKDIR /app/workers
RUN npm install

#copy source code 
COPY shared/. ../shared/
COPY workers/. ./

# build worker
# RUN npm run build
# RUN npx nest build
RUN npx tsc

# Default command (overridden in docker-compose) if used there can skip here
# CMD ["node", "dist/email/worker.js"]

# CMD ["tail", "-f", "/dev/null"]