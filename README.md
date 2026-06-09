# Orchestrate — Distributed Job Queue & Worker System

Enterprise-grade asynchronous job processing platform built with **NestJS**, **BullMQ**, **Redis**, and **PostgreSQL**.

## Architecture (Milestone 1)

Orchestrate/ ├── api/ # NestJS REST API (job submission, auth, metrics) ├── workers/ # BullMQ worker processes (media, ml, email, etl, report) ├── shared/ # @jobque/shared — entities, queue, auth, metrics ├── monitoring/ # Prometheus + Grafana (Milestone 18) └── docker-compose.yml

**Package dependency chain:**
shared → workers → api (tgz) (tgz) (imports both)

## Prerequisites

- Node.js **20+**
- Docker Desktop (with Compose v2)
- Git

## Quick Start (Docker — recommended)

```bash
# 1. Clone
git clone <your-repo-url>
cd Orchestrate
# 2. Environment
cp .env.example .env        # Linux/Mac
# Copy-Item .env.example .env   # Windows PowerShell
# 3. Start everything
docker compose up --build -d
# 4. Verify
curl http://localhost:3001/health
Expected response:


{ "status": "ok", "service": "api", "timestamp": "..." }

Quick Start (Local dev without Docker)
# 1. Start Postgres + Redis yourself (or use Docker for infra only)
docker compose up -d db redis
# 2. Update .env for localhost
#    DB_HOST=localhost
#    REDIS_HOST=localhost
# 3. Build packages in order
npm run build:all
# 4. Start API
npm run dev:api
# 5. Start a worker (separate terminal)
cd workers
set WORKER_TYPE=media          # Windows CMD
# $env:WORKER_TYPE="media"      # PowerShell
node dist/main.js
Services (Docker)
Service	Port	Purpose
api
3001
REST API
redis
6379
BullMQ queue backend
db (Postgres)
5432
Job metadata & users
*-worker
3001*
Worker metrics (internal)
NPM Scripts (root)
Script	Description
npm run build:all
Build shared → workers → api
npm run docker:up
Build & start all Docker services
npm run docker:down
Stop all services
npm run verify:m1
Check M1 setup health
Milestone Progress

 M1 — Project setup, Docker, README

 M2 — Database schemas & migrations

 M3 — POST /jobs
...through M19
Tech Stack
Runtime: Node.js 20
Framework: NestJS 11
Queue: BullMQ 5 + Redis 7
Database: PostgreSQL 15 + TypeORM
Container: Docker Compose
```
