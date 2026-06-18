# Orchestrate — Deployment Guide

> **Full K8s from zero (Windows):** **[docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)** — Steps 0–10, migrations, secrets, verify  
> **This file:** shorter Minikube checklist + Docker Compose + cloud

**Local deployment (free, $0)** · **Cloud deployment (optional, paid)**

| Path | Cost | Best for |
|------|------|----------|
| **Minikube + kubectl** | $0 | Full Kubernetes demo — **primary path for this project** |
| **Docker Compose** | $0 | Fastest first run (~10 min) |
| **Cloud (DO / AWS / GKE)** | $$ | Public HTTPS URL |

---

# Part 1 — Local Minikube Kubernetes (recommended)

Your PC runs **Minikube** and **kubectl** only. All services run as **Pods inside Minikube**, not as your Windows host serving traffic.

## What gets deployed

```
Namespace: orchestrate
├── api                 NestJS :3001 + dashboard + /metrics
├── media-worker ×2     FFmpeg / Sharp — queue: media-jobs
├── ml-worker           ML inference — queue: ml-jobs
├── email-worker        SMTP — queue: email-jobs
├── etl-worker          ETL pipelines — queue: etl-jobs
├── report-worker       PDF — queue: report-jobs
├── postgres            PostgreSQL 15
├── redis               Redis 7 / BullMQ
├── prometheus          Scrapes API + workers
├── grafana             JobQue dashboards
├── alertmanager        Demo alert config
├── ingress             orchestrate.local → api, grafana
└── HPA                 CPU autoscaling (needs metrics-server)
```

## Prerequisites

```powershell
winget install Kubernetes.minikube
winget install Kubernetes.kubectl
node --version   # v20+
```

**RAM:** 8 GB+ for Minikube (`--memory=8192`).

## Step 1 — Start Minikube

```powershell
minikube start --cpus=4 --memory=8192 --disk-size=6000 --driver=docker
minikube addons enable ingress
minikube addons enable metrics-server
kubectl cluster-info
kubectl config use-context minikube
```

> **Disk:** use `--disk-size=6000` (6 GB) if Minikube reports disk allocation or storage errors.

## Step 2 — Create secrets

```powershell
cd Orchestrate
Copy-Item k8s\secrets.example.yaml k8s\secrets.yaml
```

Edit `k8s\secrets.yaml`:

| Key | How to get it |
|-----|---------------|
| `JWT_SECRET` | 64-char random hex |
| `DB_PASS` | Strong password — **same** for Postgres + API + all workers |

Generate JWT (PowerShell):

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

**Never commit `k8s/secrets.yaml`** — gitignored.

Optional (leave empty for ML-only demo): `AWS_*`, `SMTP_*`, `SLACK_WEBHOOK_URL`

## Step 3 — Deploy manifests

```powershell
kubectl apply -f k8s\namespace.yaml
kubectl apply -f k8s\secrets.yaml
kubectl apply -k k8s\overlays\local-storage
```

**Why `local-storage`?** Minikube is single-node. ReadWriteMany PVCs often stay `Pending`. This overlay uses **hostPath**:

- `/var/lib/orchestrate/media` — shared by API + media-worker
- `/var/lib/orchestrate/reports` — shared by API + report-worker

**Git Bash alternative:**

```bash
bash scripts/deploy-k8s.sh local-storage
```

### Optional Minikube overlay

`k8s/overlays/minikube/` sets `imagePullPolicy: IfNotPresent` and reduces `media-worker` to 1 replica (saves RAM). For low-memory machines, reduce replicas in `k8s/workers.yaml` manually.

## Step 4 — Wait for pods

```powershell
kubectl get pods -n orchestrate -w
kubectl rollout status deployment/postgres -n orchestrate --timeout=300s
kubectl rollout status deployment/redis -n orchestrate --timeout=120s
kubectl rollout status deployment/api -n orchestrate --timeout=300s
kubectl rollout status deployment/ml-worker -n orchestrate --timeout=300s
npm run k8s:status
```

All pods should show `Running` and `READY 1/1`.

## Step 5 — Access services

### Port-forward (easiest on Windows)

```powershell
kubectl port-forward -n orchestrate svc/api 3001:3001
```

| URL | Expected |
|-----|----------|
| http://localhost:3001/health | `{"status":"ok"}` |
| http://localhost:3001/dashboard/ | Register → submit jobs |

Grafana (separate terminal):

```powershell
kubectl port-forward -n orchestrate svc/grafana 3002:3000
```

Default login: `admin` / `admin` — change in production.

### Ingress (`orchestrate.local`)

```powershell
minikube ip
```

Edit `C:\Windows\System32\drivers\etc\hosts` (Admin):

```
<minikube-ip>    orchestrate.local
```

Run in Admin PowerShell (keep open):

```powershell
minikube tunnel
```

| URL | Service |
|-----|---------|
| http://orchestrate.local/health | API |
| http://orchestrate.local/dashboard/ | Dashboard |
| http://orchestrate.local/grafana | Grafana |

## Step 6 — Verify

```powershell
npm run verify:m1:health
npm run verify:m1
```

Or with Git Bash:

```bash
bash scripts/verify-k8s.sh
```

## Step 7 — Migrations (optional)

K8s ConfigMap has `DB_SYNCHRONIZE=true` — tables auto-create for local learning.

Production-style:

```powershell
# Use 5433 locally if Postgres is already running on 5432 on your PC — no need to kill it
kubectl port-forward -n orchestrate svc/postgres 5433:5432

$env:DB_HOST="localhost"
$env:DB_PORT="5433"
$env:DB_USER="postgres"
$env:DB_PASS="YOUR_SECRET_DB_PASS"
$env:DB_NAME="job_que"
npm run migration:run
```

---

## How Kubernetes pulls images (read this once)

### You do NOT build on your PC for K8s (unless you choose to)

```
┌─────────────────────┐
│  GitHub push main   │
└──────────┬──────────┘
           ▼
┌─────────────────────┐     push      ┌─────────────────────────────────────┐
│ docker-publish.yml  │ ────────────► │ GHCR                                │
│ (GitHub Actions)    │               │ orchestrate-api:latest              │
└─────────────────────┘               │ orchestrate-worker:latest           │
                                      └──────────────────┬──────────────────┘
                                                         │ pull
┌─────────────────────┐     apply YAML    ┌──────────────▼──────────────────┐
│ Your PC (kubectl)   │ ──────────────────► │ Minikube node                   │
│ NOT the server      │                     │ kubelet pulls image → starts Pod│
└─────────────────────┘                     └─────────────────────────────────┘
```

Manifests reference:

```yaml
image: ghcr.io/basanta1-github/orchestrate-api:latest
imagePullPolicy: Always   # re-check GHCR on every pod start
```

**One worker image, five roles:** `WORKER_TYPE=media|ml|email|etl|report`

| GHCR visibility | Symptom | Fix |
|-----------------|---------|-----|
| Public (this repo) | Works out of the box | Nothing |
| Private | `ImagePullBackOff`, `401` | Create `ghcr-pull` secret + uncomment `imagePullSecrets` in `k8s/api.yaml` and `k8s/workers.yaml` |

Create pull secret (private only):

```powershell
kubectl create secret docker-registry ghcr-pull `
  --docker-server=ghcr.io `
  --docker-username=YOUR_GITHUB_USER `
  --docker-password=YOUR_GITHUB_PAT `
  -n orchestrate
```

PAT needs `read:packages` scope.

### Refresh images after you push code to GitHub

Kubernetes does **not** pick up local file edits. After changing code:

1. `git commit` → `git push origin main`
2. Wait for **docker-publish.yml** to complete on GitHub Actions
3. Restart deployments so Minikube re-pulls from GHCR:

```powershell
kubectl rollout restart deployment/api -n orchestrate
kubectl rollout restart deployment/media-worker -n orchestrate
kubectl rollout restart deployment/ml-worker -n orchestrate
kubectl rollout restart deployment/email-worker -n orchestrate
kubectl rollout restart deployment/etl-worker -n orchestrate
kubectl rollout restart deployment/report-worker -n orchestrate
kubectl rollout status deployment/api -n orchestrate
```

### Manual build + push (if you fork the repo)

```bash
docker build -f api/Dockerfile -t ghcr.io/YOUR_USER/orchestrate-api:latest .
docker build -f workers/Dockerfile -t ghcr.io/YOUR_USER/orchestrate-worker:latest .
docker push ghcr.io/YOUR_USER/orchestrate-api:latest
docker push ghcr.io/YOUR_USER/orchestrate-worker:latest
```

Update `k8s/kustomization.yaml` `images:` section with your registry path.

---

## Minikube troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ImagePullBackOff` | Can't reach GHCR | Internet/VPN; or add pull secret |
| Pod `Pending` | Not enough RAM | `minikube delete` then `--memory=8192` |
| API `CrashLoopBackOff` | DB/Redis or wrong `DB_PASS` | `kubectl logs deployment/api -n orchestrate` |
| Job stuck `QUEUED` | Worker down | `kubectl get pods -n orchestrate` |
| HPA `<unknown>` | No metrics-server | `minikube addons enable metrics-server` |
| Ingress not reachable | No tunnel / hosts | `minikube tunnel` + hosts file |
| Postgres port-forward fails | Local Postgres on **5432** | Use `5433:5432` — see below |
| Minikube disk / volume errors | Default disk too small | `minikube delete` then `--disk-size=6000` |
| K8s runs old code | Images cached / not repulled | Push to GitHub → CI publish → `kubectl rollout restart` |
| Docker pull `EOF` / timeout | Docker Hub / network | Google mirror — see below |

### Postgres port-forward — avoid local port 5432 conflict

If PostgreSQL is **already running on your PC** on port `5432`, forward cluster Postgres to another local port:

```powershell
kubectl port-forward -n orchestrate svc/postgres 5433:5432
$env:DB_HOST="localhost"
$env:DB_PORT="5433"
npm run migration:run
```

You do **not** need to stop local Postgres.

### Minikube disk allocation

```powershell
minikube delete
minikube start --cpus=4 --memory=8192 --disk-size=6000 --driver=docker
```

### Reset Grafana password

| Environment | Command |
|-------------|---------|
| Docker Compose | `docker compose exec grafana grafana-cli admin reset-admin-password admin` |
| Kubernetes | `kubectl exec -n orchestrate deployment/grafana -- grafana-cli admin reset-admin-password admin` |

### Docker — pull errors (Google registry mirror)

Docker Desktop → **Settings → Docker Engine** → add (merge with existing JSON):

```json
{
  "registry-mirrors": ["https://mirror.gcr.io"]
}
```

Apply & restart Docker, then `docker compose up --build -d` again.

Optional helpers:

```json
{
  "registry-mirrors": ["https://mirror.gcr.io"],
  "dns": ["8.8.8.8", "1.1.1.1"],
  "max-concurrent-downloads": 1
}
```

---

## Local Minikube checklist

- [ ] Minikube started with ingress + metrics-server
- [ ] `k8s/secrets.yaml` created (not committed)
- [ ] `kubectl apply -k k8s/overlays/local-storage`
- [ ] All pods `Running`
- [ ] Port-forward or ingress works
- [ ] `npm run verify:m1` passes
- [ ] Dashboard: ML job reaches `COMPLETED`

---

# Part 2 — Docker Compose (alternative local)

Fastest path if you don't need Kubernetes.

## Steps

```bash
git clone https://github.com/basanta1-github/Orchestrate.git
cd Orchestrate

cp .env.example .env                    # Linux/Mac
# Copy-Item .env.example .env           # Windows

docker compose up --build -d
docker compose --profile monitoring up -d
# Or: npm run docker:full
```

## URLs

| Service | URL |
|---------|-----|
| API health | http://localhost:3001/health |
| Dashboard | http://localhost:3001/dashboard/ |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3002 (admin/admin) |
| Alertmanager | http://localhost:9093 |

## Verify

```bash
npm run verify:m1:health
npm run verify:m1
```

## Grafana password reset

**Docker Compose:**

```bash
docker compose exec grafana grafana-cli admin reset-admin-password admin
```

**Kubernetes / Minikube:**

```powershell
kubectl exec -n orchestrate deployment/grafana -- grafana-cli admin reset-admin-password admin
```

## Storage (Path B — local volumes)

| Type | Container path | Compose volume |
|------|----------------|----------------|
| Media | `/app/shared/media` | `media_data` |
| Reports | `/app/shared/reports` | `report_data` |

```bash
docker compose exec api ls -la /app/shared/media
docker compose cp api:/app/shared/reports/<file>.pdf ./downloads/
```

## Persistence

| Action | Data kept? |
|--------|------------|
| `docker compose down` | Yes (volumes remain) |
| `docker compose down -v` | No |

---

# Part 3 — Cloud deployment (optional, paid)

> Skip if you don't want monthly costs. **Minikube + Docker Compose fully complete the project.**

## GitHub Actions workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to `main`, `develop` | Build, lint, test, Docker smoke build |
| `docker-publish.yml` | Push to `main`, tags `v*` | Build & push API + worker images to GHCR |
| `deploy-k8s.yml` | Manual (`workflow_dispatch`) | Deploy to remote Kubernetes cluster |

### Before first remote K8s deploy via GitHub Actions

1. Run **Docker Publish** once.
2. Create repository secrets:

| Secret | Required | Notes |
|--------|----------|-------|
| `KUBE_CONFIG_DATA` | Yes | Base64 kubeconfig |
| `JWT_SECRET` | Yes | Long random string |
| `DB_PASS` | Yes | Postgres password in cluster |
| `AWS_ACCESS_KEY_ID` | S3 path | Media/report storage |
| `AWS_SECRET_ACCESS_KEY` | S3 path | |
| `AWS_REGION` | S3 path | e.g. `us-east-1` |
| `S3_BUCKET` | S3 path | |
| `SMTP_*` | Email worker | Optional |
| `HUNTER_API_KEY` | Email verification | Optional |

3. Trigger **Deploy to Kubernetes**:
   - `image_tag`: `latest` or release tag
   - `storage_overlay`: `local-storage` or `rwx-storage`

---

## Option 1: DigitalOcean App Platform

> **Storage:** No shared disk between services — **S3 required** (`USE_S3=true`).

1. Fork/push repo to GitHub.
2. Create Managed PostgreSQL + Redis on DigitalOcean.
3. Update `deploy/digitalocean/app.yaml` with your repo name.
4. Deploy:

```bash
doctl apps create --spec deploy/digitalocean/app.yaml
```

5. Set encrypted env vars in dashboard: `JWT_SECRET`, `AWS_*`, optional `SMTP_*`.

---

## Option 2: Kubernetes — cloud (DOKS, EKS, GKE)

### Storage overlays

| Overlay | Use when |
|---------|----------|
| `local-storage` | Docker Desktop K8s, Minikube (hostPath) |
| `rwx-storage` | Cloud clusters with ReadWriteMany PVC |

Path A (S3): `USE_S3=true` in configmap + AWS keys in secrets.

### Deploy

```powershell
Copy-Item k8s\secrets.example.yaml k8s\secrets.yaml
bash scripts/deploy-k8s.sh rwx-storage
```

### Manual kubectl

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -k k8s/overlays/rwx-storage
```

For managed Postgres/Redis: patch `k8s/configmap.yaml`, remove in-cluster `postgres.yaml` / `redis.yaml`.

See **[docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)** for AWS, GKE, DigitalOcean details.

---

## Post-deploy checklist (all environments)

- [ ] `npm run verify:m1:health`
- [ ] `npm run verify:m1` — ML job → COMPLETED
- [ ] Dashboard register + manual job submit
- [ ] Submit `image_resize` → `local.url` and/or `s3` in result
- [ ] Grafana queue panels show data (if monitoring deployed)

## Cloud-only extras

- [ ] `API_BASE=https://YOUR_DOMAIN npm run verify:m1`
- [ ] TLS on ingress
- [ ] `DB_SYNCHRONIZE=false` + migrations
- [ ] Managed Postgres + Redis (not in-cluster)
- [ ] S3 for media in cloud
- [ ] Grafana admin password changed
