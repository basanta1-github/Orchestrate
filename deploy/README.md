# Cloud Deployment Guide

## Option 1: DigitalOcean App Platform

1. Fork/push this repo to GitHub.
2. Create a Managed PostgreSQL + Redis database on DigitalOcean.
3. Update `deploy/digitalocean/app.yaml` with your repo name.
4. Deploy via CLI:

```bash
doctl apps create --spec deploy/digitalocean/app.yaml
```

5. Set `JWT_SECRET` as an encrypted env var in the App Platform dashboard.

## Option 2: Kubernetes (any cloud — DOKS, EKS, GKE)

1. Build and push images (or use GitHub Actions `docker-publish` workflow):

```bash
docker build -f api/Dockerfile -t ghcr.io/<you>/orchestrate-api:latest .
docker build -f workers/Dockerfile -t ghcr.io/<you>/orchestrate-worker:latest .
docker push ghcr.io/<you>/orchestrate-api:latest
docker push ghcr.io/<you>/orchestrate-worker:latest
```

2. Copy secrets and deploy:

```bash
cp k8s/secrets.example.yaml k8s/secrets.yaml
# edit k8s/secrets.yaml
./scripts/deploy-k8s.sh
```

3. Expose via LoadBalancer or Ingress:

```bash
kubectl port-forward -n orchestrate svc/api 3001:3001
```

## Option 3: Local Docker (fastest demo)

```bash
cp .env.example .env
docker compose up --build -d
docker compose --profile monitoring up -d
```

- API: http://localhost:3001
- Dashboard: http://localhost:3001/dashboard/
- Grafana: http://localhost:3002 (admin/admin)

## Post-deploy checklist (run against live URL when ready)

- [ ] `API_BASE=https://YOUR_DOMAIN node scripts/verify-m1.js`
- [ ] Register tenant via dashboard
- [ ] Submit `image_resize` → COMPLETED
- [ ] Submit `ml-jobs` → COMPLETED
- [ ] Grafana queue panels show data
- [ ] Prometheus scrapes `/metrics`

## Pre-deploy (do now, before live URL)

- [x] Fix job routing (`resolveQueueName`)
- [x] All 5 workers in DO spec / K8s manifests
- [x] CI publishes images on `main` + tags
- [x] `deploy-k8s.yml` applies secrets
- [ ] Commit + push `.github/workflows/`
- [ ] Create GitHub secrets: `JWT_SECRET`, `DB_PASS`, `KUBE_CONFIG_DATA`
- [ ] Run `docker-publish` workflow once
