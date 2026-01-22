# worker/Dockerfile

FROM node:20-alpine

WORKDIR /app


#  build shared first
# Copy shared library from root context
COPY shared ./shared


# Build shared library inside container
WORKDIR /app/shared
RUN npm install
RUN npm run build
# RUN npx tsc


# install workers deps (which installs @jobque/shared properly)
#copy the worker package file
WORKDIR /app 
COPY workers/package*.json ./workers/

# manual symlink
RUN mkdir -p node_modules/@jobque && cp -r /app/shared node_modules/@jobque/shared


# Install deps
WORKDIR /app/workers
RUN npm install

# copy worker source and build
# Copy all worker source code (includes tsconfig.json)
COPY  workers/. ./

# Build workers
# RUN npm run build
RUN npx tsc

# Default command (overridden in docker-compose) if used there can skip here
# CMD ["node", "dist/email/worker.js"]

# CMD ["tail", "-f", "/dev/null"]