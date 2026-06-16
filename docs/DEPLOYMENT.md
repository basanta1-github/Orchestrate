# Orchestrate — Cloud Deployment Guide

This guide covers deploying Orchestrate to production using Docker, Kubernetes, and managed cloud services.

## Architecture Overview

```
                    ┌─────────────┐
                    │   Ingress   │
                    │  (TLS/HTTPS)│
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │   orchestrate-api     │
              │   (NestJS + Dashboard)│
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌─────▼─────┐     ┌─────▼─────┐
    │  Redis  │      │ PostgreSQL │     │    S3     │
    │ BullMQ  │      │  metadata  │     │  assets   │
    └────┬────┘      └────────────┘     └───────────┘
         │
    ┌────┴────────────────────────────┐
    │  Workers (media/ml/email/etl/   │
    │  report) — scaled via HPA/KEDA  │
    └─────────────────────────────────┘
```

## Option 1: Docker Compose (Demo / Small Deploy)

### Prerequisites
- Docker Desktop or Docker Engine + Compose v2
- 4 GB RAM minimum

### Steps

```bash
git clone https://github.com/basanta1-github/Orchestrate.git
cd Orchestrate
cp .env.example .env
# Edit JWT_SECRET and credentials

npm run build:all
docker compose up --build -d

# Optional: start monitoring stack
docker compose -f monitoring/docker-compose.monitoring.yml up -d
```

### Verify

```bash
npm run verify:m1
curl http://localhost:3001/health
# Open dashboard: http://localhost:3001/dashboard/
# Grafana: http://localhost:3002 (admin/admin)
# Prometheus: http://localhost:9090
```

---

## Option 2: Kubernetes (Production)

### Prerequisites
- Kubernetes cluster (EKS, GKE, AKS, or DigitalOcean Kubernetes)
- `kubectl` configured
- NGINX Ingress Controller installed
- Container images published to GHCR (via GitHub Actions)

### Deploy

```bash
# 1. Create secrets (never commit real values)
kubectl create namespace orchestrate
kubectl create secret generic orchestrate-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -hex 32) \
  --from-literal=DB_PASS=your-secure-password \
  -n orchestrate

# 2. Apply all manifests
kubectl apply -k k8s/

# 3. Watch rollout
kubectl rollout status deployment/orchestrate-api -n orchestrate
kubectl get hpa -n orchestrate
```

### Update Ingress

Edit `k8s/ingress.yaml` and replace `orchestrate.example.com` with your domain. Create a TLS secret:

```bash
kubectl create secret tls orchestrate-tls \
  --cert=fullchain.pem \
  --key=privkey.pem \
  -n orchestrate
```

### Queue-depth scaling (optional)

Install [KEDA](https://keda.sh) and apply:

```bash
kubectl apply -f k8s/keda-scaledobject.yaml
```

---

## Option 3: AWS

### Recommended stack

| Component | AWS Service |
|-----------|-------------|
| API + Workers | EKS or ECS Fargate |
| PostgreSQL | RDS PostgreSQL 15 |
| Redis | ElastiCache Redis 7 |
| File storage | S3 (Block Public Access ON) |
| Load balancer | ALB + ACM certificate |
| CI/CD | GitHub Actions → ECR → EKS |

### S3 setup

1. Create a private S3 bucket with **Block all public access** enabled.
2. Set in ConfigMap / `.env`:
   ```
   USE_S3=true
   AWS_REGION=us-east-1
   S3_BUCKET=your-bucket
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   ```
3. Use IAM roles (IRSA on EKS) instead of static keys in production.

### EKS quick path

1. Push images via GitHub Actions (`docker-publish.yml`).
2. Replace in-cluster Postgres/Redis with RDS + ElastiCache (update `k8s/configmap.yaml`).
3. Remove `postgres.yaml` and `redis.yaml` from `k8s/kustomization.yaml`.
4. Deploy with `kubectl apply -k k8s/`.

---

## Option 4: Google Cloud (GKE)

1. Create GKE cluster: `gcloud container clusters create orchestrate --num-nodes=3`
2. Enable Artifact Registry; mirror GHCR images or build locally.
3. Use **Cloud SQL for PostgreSQL** and **Memorystore for Redis**.
4. Update `DB_HOST` and `REDIS_HOST` in ConfigMap to managed endpoints.
5. Use Google-managed SSL certificates on Ingress.

---

## Option 5: DigitalOcean

1. Create a DO Kubernetes cluster (DOKS).
2. Add managed PostgreSQL and managed Redis databases.
3. Install NGINX Ingress: `kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml`
4. Push images to DO Container Registry or GHCR.
5. Apply `k8s/` manifests and point DNS to the Load Balancer IP.

---

## CI/CD Pipeline

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `.github/workflows/ci.yml` | Push / PR | Build, lint, test, Docker build verify |
| `.github/workflows/docker-publish.yml` | Push to main | Publish API + Worker images to GHCR |
| `.github/workflows/deploy-k8s.yml` | Manual dispatch | Deploy to staging/production |

### Required GitHub secrets (for K8s deploy)

| Secret | Description |
|--------|-------------|
| `KUBE_CONFIG` | Base64-encoded kubeconfig file |

### GitHub Environments

Create `staging` and `production` environments in repo settings for approval gates on deploy.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Long random string for JWT signing |
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PASS` | Yes | PostgreSQL password |
| `REDIS_HOST` | Yes | Redis host |
| `WORKER_TYPE` | Workers | `media`, `ml`, `email`, `etl`, or `report` |
| `USE_S3` | No | Enable S3 storage for processed assets |
| `SMTP_*` | Email worker | SMTP credentials for email jobs |

---

## Production Checklist

- [ ] Set strong `JWT_SECRET` and rotate periodically
- [ ] Disable TypeORM `synchronize: true` — run migrations instead
- [ ] Use managed Postgres + Redis (not in-cluster StatefulSets)
- [ ] Enable TLS on Ingress
- [ ] Restrict `/metrics` via network policy or IP allow-list
- [ ] Configure S3 with Block Public Access; use presigned URLs for downloads
- [ ] Set up Grafana alerts (see `monitoring/alerts.yml`)
- [ ] Configure HPA min/max replicas per worker load profile
- [ ] Enable GitHub branch protection + required CI checks

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| API healthcheck fails | Ensure `/health` endpoint is reachable; check DB/Redis connectivity |
| Media jobs fail in Docker | Worker image includes ffmpeg + tesseract; rebuild with `docker compose build --no-cache` |
| Prometheus can't scrape | Metrics endpoints are public; verify network and target hostnames |
| Jobs stuck in STAGED | Check tenant cap limits and queue promoter logs |
| Worker HPA not scaling | Verify metrics-server installed: `kubectl top pods -n orchestrate` |
