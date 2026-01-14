# shared/Dockerfile

FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build shared library
RUN npx tsc

# This image is NOT meant to run this is only a library bor workers and api so no need
# It only exists to be reused by api & workers
