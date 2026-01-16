# worker/Dockerfile

FROM node:20-alpine

WORKDIR /app

# Copy shared library from root context
COPY shared ./shared


# Build shared library inside container
WORKDIR /app/shared
RUN npm install
RUN npx tsc

#copy the worker package file
WORKDIR /app 
COPY workers/package*.json ./workers/

# Install deps
WORKDIR /app/workers
RUN npm install


# Copy all worker source code (includes tsconfig.json)
COPY  workers/. ./

# Build workers
# RUN npm run build
RUN npx tsc

# Default command (overridden in docker-compose) if used there can skip here
# CMD ["node", "dist/email/worker.js"]

CMD ["tail", "-f", "/dev/null"]