# Cloud Deployment Guide

## GitHub Actions workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to `main`, `develop` | Build, lint, test, Docker smoke build |
| `docker-publish.yml` | Push to `main`, tags `v*` | Build & push API + worker images to GHCR |
| `deploy-k8s.yml` | Manual (`workflow_dispatch`) | Deploy to Kubernetes cluster |

### Before first K8s deploy via GitHub Actions

1. Run **Docker Publish** once (push to `main` or trigger manually).
2. Create repository secrets (Settings → Secrets and variables → Actions):

| Secret | Required | Notes |
|--------|----------|-------|
| `KUBE_CONFIG_DATA` | Yes | `cat ~/.kube/config \| base64 -w0` (Linux) or `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.kube\config"))` (PowerShell) |
| `JWT_SECRET` | Yes | Long random string |
| `DB_PASS` | Yes | Must match Postgres password in cluster |
| `AWS_ACCESS_KEY_ID` | Path A (S3) | Media/report durable storage |
| `AWS_SECRET_ACCESS_KEY` | Path A | |
| `AWS_REGION` | Path A | e.g. `ca-central-1` |
| `S3_BUCKET` | Path A | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email worker | Optional |
| `HUNTER_API_KEY` | Email verification | Optional |

3. Trigger **Deploy to Kubernetes** workflow:
   - `image_tag`: `latest` or a git SHA / release tag
   - `storage_overlay`: `local-storage` (Docker Desktop/Minikube) or `rwx-storage` (cloud RWX PVC)

---

## Option 1: DigitalOcean App Platform

> **Storage:** DO App Platform has **no shared disk** between API and workers.
> Use **S3 only** (`USE_S3=true` + AWS secrets). `deploy/digitalocean/app.yaml` is configured for Path A.

1. Fork/push this repo to GitHub.
2. Create Managed PostgreSQL + Redis on DigitalOcean.
3. Update `deploy/digitalocean/app.yaml` with your repo name.
4. Deploy:

```bash
doctl apps create --spec deploy/digitalocean/app.yaml
```

5. In the App Platform dashboard, set encrypted env vars:
   - `JWT_SECRET`
   - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`
   - Optional SMTP secrets for email worker

---

## Option 2: Kubernetes (local or cloud)

### Storage overlays (Path B)

| Overlay | Use when |
|---------|----------|
| `local-storage` | Docker Desktop K8s, Minikube (hostPath shared dirs) |
| `rwx-storage` | EKS, GKE, AKS with ReadWriteMany PVC support |

Path A (S3) is configured in `k8s/configmap.yaml` (`USE_S3: "true"`) + AWS keys in `k8s/secrets.yaml`.

### Local deploy (PowerShell / Git Bash)

```powershell
Copy-Item k8s\secrets.example.yaml k8s\secrets.yaml
# Edit JWT_SECRET, DB_PASS, AWS_* (for S3)

# Docker Desktop / Minikube:
bash scripts/deploy-k8s.sh local-storage

# Cloud with RWX PVC:
bash scripts/deploy-k8s.sh rwx-storage
```

### Manual kubectl

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -k k8s/overlays/local-storage   # or rwx-storage
kubectl port-forward -n orchestrate svc/api 3001:3001
```

### Build and push images manually

```bash
docker build -f api/Dockerfile -t ghcr.io/<you>/orchestrate-api:latest .
docker build -f workers/Dockerfile -t ghcr.io/<you>/orchestrate-worker:latest .
docker push ghcr.io/<you>/orchestrate-api:latest
docker push ghcr.io/<you>/orchestrate-worker:latest
```

---

## Option 3: Local Docker Compose (fastest demo)

```bash
cp .env.example .env
# Edit JWT_SECRET; optional AWS_* for S3
docker compose up --build -d
docker compose --profile monitoring up -d
```

- API: http://localhost:3001
- Dashboard: http://localhost:3001/dashboard/
- Grafana: http://localhost:3002 (admin/admin)

Path B (local URLs) uses `media_data` / `report_data` volumes in `docker-compose.yml`.

---

## Post-deploy checklist

- [ ] `npm run verify:m1:health` (with port-forward on 3001)
- [ ] `npm run verify:m1` (register + ML job → COMPLETED)
- [ ] Submit `image_resize` → `local.url` and `s3` in result
- [ ] Submit `video_transcode` with `"format": "mp4"` in metadata
- [ ] Grafana queue panels show data (if monitoring deployed)

## Pre-deploy checklist

- [x] Separate workers (`RUN_WORKERS_IN_API=false`)
- [x] Path A (S3) + Path B (shared storage overlays)
- [x] CI publishes images on `main` + tags
- [x] `deploy-k8s.yml` applies secrets + storage overlay
- [ ] Commit + push workflow changes
- [ ] Create GitHub secrets (see table above)
- [ ] Run `docker-publish` workflow once
- [ ] Start Kubernetes cluster (`kubectl cluster-info` works)
