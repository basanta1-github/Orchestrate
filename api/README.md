# Orchestrate — API Service

NestJS HTTP application for the Orchestrate (JobQue) distributed job queue platform.

## What this service does

| Responsibility | Details |
|----------------|---------|
| Accept jobs | `POST /jobs`, `POST /jobs/workflow` |
| Authentication | `POST /auth/register`, `POST /auth/login` — JWT |
| Job tracking | `GET /jobs`, `GET /jobs/:id` — tenant-scoped |
| Dashboard | Serves static UI at `/dashboard/` |
| Metrics | `/metrics`, `/metrics/health`, `/metrics/queues` |
| Health | `/health` for load balancers |

**Does NOT run heavy processing** — workers in `../workers/` handle FFmpeg, ML, PDF, email, ETL.

## Architecture position

```
Client → api (this service) → PostgreSQL (metadata)
                            → Redis/BullMQ (enqueue)
Workers ← Redis/BullMQ ←────────────────────────────
Workers → PostgreSQL (status updates)
```

Shared business logic: `../shared/` (jobs, auth, queue, metrics).

## Run locally

From repo root after `npm run build:all`:

```bash
cd api
npm run start:dev
```

Requires PostgreSQL + Redis:

```bash
docker compose up -d db redis
# .env: DB_HOST=localhost, REDIS_HOST=localhost
```

## Run in Docker

From repo root:

```bash
docker compose up --build -d api
```

## Run in Kubernetes

Deployed as `deployment/api` in namespace `orchestrate`.  
Image: `ghcr.io/basanta1-github/orchestrate-api:latest` (pulled by cluster, not built on your PC).

## Key files

| File | Purpose |
|------|---------|
| `src/main.ts` | Bootstrap, CORS, static dashboard |
| `src/app.module.ts` | Root module, TypeORM, shared imports |
| `src/health.controller.ts` | `/health` |
| `Dockerfile` | Production container build |

## Environment

| Source | When |
|--------|------|
| `.env` | Docker Compose, local dev |
| `k8s/configmap.yaml` + `k8s/secrets.yaml` | Kubernetes |

Critical: `JWT_SECRET`, `DB_*`, `REDIS_*`, `RUN_WORKERS_IN_API=false` in production-like setups.

## Tests

```bash
npm run test
npm run test:e2e
```

## Related docs

- [Root README](../README.md) — full architecture, Minikube deploy, milestones
- [deploy/README.md](../deploy/README.md) — deployment guides
- [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) — cloud reference
