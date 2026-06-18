# Orchestrate — Deployment Reference

> **Primary local guide:** full **Kubernetes from zero (Windows)** steps are in this document below.  
> **Shorter Minikube checklist:** [deploy/README.md](../deploy/README.md)  
> **Project overview:** [README.md](../README.md)

---

## Table of contents

1. [Local vs cloud at a glance](#local-vs-cloud-at-a-glance)
2. [Orchestrate Kubernetes deploy — from zero (Windows)](#orchestrate-kubernetes-deploy--from-zero-windows)
3. [Local Minikube — quick reference](#local-minikube--quick-reference)
4. [Architecture overview (cloud)](#architecture-overview-cloud)
5. [Option 1: Docker Compose (local)](#option-1-docker-compose-local)
6. [Option 2: Kubernetes — cloud production](#option-2-kubernetes--cloud-production)
7. [Options 3–5: AWS, GKE, DigitalOcean](#option-3-aws)
8. [CI/CD pipeline](#cicd-pipeline)
9. [Environment variables reference](#environment-variables-reference)
10. [Production checklist](#production-checklist)
11. [Troubleshooting](#troubleshooting)

---

## Local vs cloud at a glance

|               | Local Minikube                      | Local Docker Compose                    | Cloud                      |
| ------------- | ----------------------------------- | --------------------------------------- | -------------------------- |
| Cost          | $0                                  | $0                                      | Monthly fees               |
| Orchestration | Kubernetes                          | Docker Compose                          | K8s / App Platform         |
| DB            | In-cluster Postgres pod             | Compose `db` service                    | Managed RDS / DO Postgres  |
| Redis         | In-cluster Redis pod                | Compose `redis` service                 | Managed Redis              |
| Images        | GHCR pulled by kubelet              | Built locally (`docker compose build`)  | GHCR pulled by cloud nodes |
| Access        | port-forward or `orchestrate.local` | `localhost:3001`                        | Public HTTPS domain        |
| Full steps    | **Below (Steps 0–10)**              | [deploy/README.md](../deploy/README.md) | Below (cloud sections)     |

---

# Orchestrate Kubernetes deploy — from zero (Windows)

This walks you through **Path A** — deploy from your PC with `kubectl` on Windows, in order.

**Repo path (example):**

```
C:\Users\pokhr\Documents\NewBeginning\Own_backend_Projects\Orchestrate
```

Your PC runs **kubectl only**. Containers run **inside the cluster** (Minikube or Docker Desktop Kubernetes), not as your Windows login serving production traffic.

---

## What you are deploying

The `k8s/` folder deploys a full stack into namespace **`orchestrate`**:

| Component                               | What it does                                                         |
| --------------------------------------- | -------------------------------------------------------------------- |
| **API**                                 | NestJS + dashboard on port 3001                                      |
| **5 workers**                           | media, ml, email, etl, report (replica counts in `k8s/workers.yaml`) |
| **PostgreSQL**                          | Job metadata                                                         |
| **Redis**                               | BullMQ queues                                                        |
| **Prometheus + Grafana + Alertmanager** | Monitoring                                                           |
| **Ingress**                             | `orchestrate.local` → API + Grafana                                  |

**Images pulled from GHCR (public):**

```
ghcr.io/basanta1-github/orchestrate-api:latest
ghcr.io/basanta1-github/orchestrate-worker:latest
```

**RAM:** plan for **~8–12 GB** free for the cluster (many pods). Less than 8 GB often causes `Pending` / `CrashLoopBackOff`.

---

## Step 0 — Install tools

Install once, then **restart PowerShell**.

### 0.1 Git

Download: https://git-scm.com/download/win

```powershell
git --version
```

### 0.2 Node.js 20+

Download LTS: https://nodejs.org/ (v20 or v22)

```powershell
node --version   # v20.x or v22.x
npm --version
```

Needed for `npm run verify:m1` and optional DB migrations.

### 0.3 Docker Desktop

Download: https://www.docker.com/products/docker-desktop/

After install:

1. Docker Desktop → **Settings → Resources**
2. **Memory ≥ 8 GB** (12 GB if you can)
3. **CPUs ≥ 4**

If `docker pull` fails with CloudFront `EOF`, add in **Settings → Docker Engine**:

```json
{
  "registry-mirrors": ["https://mirror.gcr.io"]
}
```

Apply & restart Docker.

```powershell
docker --version
docker compose version
```

### 0.4 kubectl

**Option A** — often available after enabling Docker Desktop Kubernetes:

```powershell
kubectl version --client
```

**Option B** — standalone:

```powershell
winget install Kubernetes.kubectl
```

Or: https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/

---

## Step 1 — Choose and start a Kubernetes cluster

Pick **one** path.

### Path 1 — Docker Desktop Kubernetes

1. Docker Desktop → **Settings → Kubernetes**
2. Check **Enable Kubernetes**
3. **Apply & Restart** (wait until steady green)

```powershell
kubectl cluster-info
kubectl get nodes
```

One node should be `Ready`.

### Path 2 — Minikube (recommended for full K8s demo)

```powershell
winget install Kubernetes.minikube

minikube start --cpus=4 --memory=8192 --disk-size=6000 --driver=docker
minikube addons enable ingress
minikube addons enable metrics-server
kubectl cluster-info
kubectl config use-context minikube
```

> **`--disk-size=6000`** = 6 GB disk. Use this if Minikube fails with disk allocation / storage errors.

---

## Step 2 — Install Ingress NGINX + metrics-server

Ingress is **required** for `k8s/ingress.yaml` (`ingressClassName: nginx`).

metrics-server is needed for HPA CPU targets (not `<unknown>`).

### If you used Minikube

Already done if you ran addons above → **skip to Step 3**.

### If you used Docker Desktop

**Ingress NGINX:**

```powershell
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/cloud/deploy.yaml

kubectl wait --namespace ingress-nginx `
  --for=condition=ready pod `
  --selector=app.kubernetes.io/component=controller `
  --timeout=120s
```

**metrics-server:**

```powershell
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

If `kubectl top pods` fails later:

```powershell
kubectl patch deployment metrics-server -n kube-system --type=json `
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

**Verify:**

```powershell
kubectl get pods -n ingress-nginx
kubectl get pods -n kube-system -l k8s-app=metrics-server
```

---

## Step 3 — Open the project

```powershell
cd C:\Users\pokhr\Documents\NewBeginning\Own_backend_Projects\Orchestrate
```

Optional — install deps for verify / migrations:

```powershell
npm install
cd shared
npm install
cd ..
```

---

## Step 4 — Create secrets (the only file you must edit)

### 4.1 Copy the template

```powershell
Copy-Item k8s\secrets.example.yaml k8s\secrets.yaml
```

`k8s/secrets.yaml` is **gitignored** — never commit it.

### 4.2 Generate values

Open `k8s\secrets.yaml` in an editor.

**JWT_SECRET (required)** — 32+ characters:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

**DB_PASS (required)** — strong password:

```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
```

**Important:** same `DB_PASS` for PostgreSQL pod, API, and all workers.

**Optional** (leave empty for first ML-only demo): `AWS_*`, `SMTP_*`

### 4.3 Example filled `secrets.yaml`

```yaml
stringData:
  JWT_SECRET: a1b2c3d4e5f6...your-64-char-hex
  DB_PASS: YourStrongDbPassword123!

  AWS_ACCESS_KEY_ID: ""
  AWS_SECRET_ACCESS_KEY: ""
  AWS_REGION: ""
  S3_BUCKET: ""

  SMTP_HOST: ""
  SMTP_PORT: "587"
  SMTP_USER: ""
  SMTP_PASS: ""
```

---

## Step 5 — GHCR image pull secret (usually skip)

Published images are **public**. You typically **do not** need a pull secret.

Only if `ImagePullBackOff` / `401 Unauthorized`:

1. GitHub → **Settings → Developer settings → Personal access tokens**
2. Token with **`read:packages`**
3. Create secret:

```powershell
kubectl create secret docker-registry ghcr-pull `
  --docker-server=ghcr.io `
  --docker-username=YOUR_GITHUB_USERNAME `
  --docker-password=YOUR_GITHUB_PAT `
  -n orchestrate
```

4. Uncomment `imagePullSecrets` in `k8s/api.yaml` and `k8s/workers.yaml`:

```yaml
imagePullSecrets:
  - name: ghcr-pull
```

---

## Step 6 — Deploy

Run **in order**:

```powershell
cd C:\Users\pokhr\Documents\NewBeginning\Own_backend_Projects\Orchestrate

kubectl apply -f k8s\namespace.yaml
kubectl apply -f k8s\secrets.yaml
kubectl apply -k k8s\overlays\local-storage
```

Why **`local-storage`**? Minikube / Docker Desktop K8s use **hostPath** for shared media/report dirs (RWX PVCs often stay `Pending` locally).

**Git Bash alternative:**

```bash
bash scripts/deploy-k8s.sh local-storage
```

**How images arrive:** GitHub Actions builds and pushes to GHCR → cluster **kubelet pulls** on pod start. You do **not** need `docker build` on your PC for this path.

---

## Step 7 — Wait for pods

Watch pods (Ctrl+C to stop):

```powershell
kubectl get pods -n orchestrate -w
```

In another terminal:

```powershell
kubectl rollout status deployment/postgres -n orchestrate --timeout=180s
kubectl rollout status deployment/redis -n orchestrate --timeout=120s
kubectl rollout status deployment/api -n orchestrate --timeout=180s
kubectl rollout status deployment/ml-worker -n orchestrate --timeout=180s
npm run k8s:status
```

Healthy: pods `Running`, `READY` like `1/1`.

### If something is wrong

```powershell
kubectl describe pod POD_NAME -n orchestrate
kubectl logs deployment/api -n orchestrate --tail=80
kubectl logs deployment/ml-worker -n orchestrate --tail=80
kubectl get events -n orchestrate --sort-by='.lastTimestamp'
```

| Symptom                | Likely cause                   | Fix                                               |
| ---------------------- | ------------------------------ | ------------------------------------------------- |
| `ImagePullBackOff`     | Network / private GHCR         | Internet/VPN; pull secret (Step 5)                |
| `Pending`              | RAM / disk                     | `--memory=8192 --disk-size=6000`; reduce replicas |
| API `CrashLoopBackOff` | Wrong `DB_PASS` / DB not ready | Check postgres logs; secrets match                |
| HPA `<unknown>`        | No metrics-server              | Step 2                                            |

---

## Step 8 — Database migrations

K8s ConfigMap sets **`DB_SYNCHRONIZE=true`** — API **auto-creates tables** on first start. For local learning you can **skip migrations**.

For **production-style** setup, run migrations from your PC:

**Terminal 1 — port-forward Postgres**

If **local PostgreSQL already uses port 5432**, use **5433** on your PC (no need to stop local Postgres):

```powershell
kubectl port-forward -n orchestrate svc/postgres 5433:5432
```

If 5432 is free on your PC:

```powershell
kubectl port-forward -n orchestrate svc/postgres 5432:5432
```

**Terminal 2 — run migration** (same `DB_PASS` as secrets):

```powershell
cd C:\Users\pokhr\Documents\NewBeginning\Own_backend_Projects\Orchestrate

$env:DB_HOST="localhost"
$env:DB_PORT="5433"          # use 5432 if you forwarded 5432:5432
$env:DB_USER="postgres"
$env:DB_PASS="YOUR_SAME_DB_PASS_FROM_SECRETS"
$env:DB_NAME="job_que"

npm run migration:run
```

Format: `kubectl port-forward ... <local-port>:5432` — left = your PC, right = cluster.

---

## Step 9 — Access the API

### Option A — Port-forward (easiest on Windows)

```powershell
kubectl port-forward -n orchestrate svc/api 3001:3001
```

Leave running. Open:

| URL                              | Expected               |
| -------------------------------- | ---------------------- |
| http://localhost:3001/health     | `{"status":"ok"}`      |
| http://localhost:3001/dashboard/ | Register / submit jobs |

Grafana (optional, new terminal):

```powershell
kubectl port-forward -n orchestrate svc/grafana 3002:3000
```

### Option B — Ingress (`orchestrate.local`)

**Minikube:**

```powershell
minikube ip
# Example: 192.168.49.2
```

Edit `C:\Windows\System32\drivers\etc\hosts` (Admin):

```
192.168.49.2    orchestrate.local
```

Admin PowerShell — keep open:

```powershell
minikube tunnel
```

- http://orchestrate.local/health
- http://orchestrate.local/dashboard/
- http://orchestrate.local/grafana

**Docker Desktop K8s:** try `127.0.0.1 orchestrate.local` in hosts, or use Option A.

---

## Step 10 — Verify

With port-forward on 3001:

```powershell
cd C:\Users\pokhr\Documents\NewBeginning\Own_backend_Projects\Orchestrate
npm run verify:m1:health
npm run verify:m1
```

**Manual dashboard test:**

1. http://localhost:3001/dashboard/
2. **Register** — tenant + admin
3. Submit `ml-jobs` → `text_summarization` with **≥ 20 characters**
4. Watch: `QUEUED` → `PROCESSING` → `COMPLETED`

---

## Quick reference — full command sequence

```powershell
# 0. Tools + cluster (Minikube OR Docker Desktop K8s)
kubectl cluster-info

# 1. Ingress + metrics (Docker Desktop only if not Minikube addons)
# ... see Step 2 ...

# 2. Secrets
cd C:\Users\pokhr\Documents\NewBeginning\Own_backend_Projects\Orchestrate
Copy-Item k8s\secrets.example.yaml k8s\secrets.yaml
# Edit JWT_SECRET + DB_PASS

# 3. Deploy
kubectl apply -f k8s\namespace.yaml
kubectl apply -f k8s\secrets.yaml
kubectl apply -k k8s\overlays\local-storage

# 4. Wait
kubectl get pods -n orchestrate -w

# 5. Access
kubectl port-forward -n orchestrate svc/api 3001:3001

# 6. Verify (new terminal)
npm run verify:m1:health
npm run verify:m1
```

---

## Secrets cheat sheet

| Secret                       | Where to get it                     | Required?                  |
| ---------------------------- | ----------------------------------- | -------------------------- |
| `JWT_SECRET`                 | Generate locally (PowerShell above) | **Yes**                    |
| `DB_PASS`                    | You choose; must match everywhere   | **Yes**                    |
| `AWS_*` / `S3_BUCKET`        | AWS IAM + S3 bucket                 | Media + S3 only            |
| `SMTP_*`                     | Email provider                      | Email worker only          |
| GitHub PAT (`read:packages`) | GitHub Developer settings           | Only if GHCR private       |
| `KUBE_CONFIG_DATA`           | Base64 kubeconfig                   | GitHub Actions deploy only |

---

## What you do NOT need for first local K8s test

- AWS account
- SMTP credentials
- GitHub PAT (if public GHCR pulls work)
- Building Docker images locally (uses GHCR `latest`)
- `.env` file (K8s uses ConfigMap + Secret)

---

## Easiest path first — Docker Compose

Validate before K8s:

```powershell
Copy-Item .env.example .env
# Edit JWT_SECRET
docker compose up --build -d
npm run verify:m1
```

Same API and verify scripts — less infra than Kubernetes.

---

## After you change code — repull images on cluster

Kubernetes does **not** update from local file edits.

1. `git commit` → `git push origin main`
2. Wait for **docker-publish.yml** on GitHub Actions
3. Restart deployments:

```powershell
kubectl rollout restart deployment/api -n orchestrate
kubectl rollout restart deployment/ml-worker -n orchestrate
kubectl rollout restart deployment/media-worker -n orchestrate
kubectl rollout restart deployment/email-worker -n orchestrate
kubectl rollout restart deployment/etl-worker -n orchestrate
kubectl rollout restart deployment/report-worker -n orchestrate
```

---

## Local Minikube — quick reference

```powershell
minikube start --cpus=4 --memory=8192 --disk-size=6000
minikube addons enable ingress
minikube addons enable metrics-server

Copy-Item k8s\secrets.example.yaml k8s\secrets.yaml

kubectl apply -f k8s\namespace.yaml
kubectl apply -f k8s\secrets.yaml
kubectl apply -k k8s\overlays\local-storage

kubectl get pods -n orchestrate -w
kubectl port-forward -n orchestrate svc/api 3001:3001

npm run verify:m1
```

---

## Architecture overview (cloud)

```
                    ┌─────────────┐
                    │   Ingress   │
                    │  (TLS/HTTPS)│
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │   orchestrate-api       │
              │   (NestJS + Dashboard)  │
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

---

## Option 1: Docker Compose (local)

See [deploy/README.md § Docker Compose](../deploy/README.md).

```bash
cp .env.example .env
docker compose up --build -d
docker compose --profile monitoring up -d
npm run verify:m1
```

---

## Option 2: Kubernetes — cloud production

### Prerequisites

- Cloud Kubernetes cluster (EKS, GKE, AKS, DOKS)
- `kubectl` configured
- NGINX Ingress Controller
- metrics-server (HPA)
- cert-manager (TLS) — recommended
- Images on GHCR (from `docker-publish.yml`)

### Deploy

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -k k8s/overlays/rwx-storage
kubectl rollout status deployment/api -n orchestrate
kubectl get hpa -n orchestrate
```

### Managed databases

1. Create managed PostgreSQL + Redis.
2. Patch `k8s/configmap.yaml`: `DB_HOST`, `REDIS_HOST` → external endpoints.
3. Remove `postgres.yaml` and `redis.yaml` from kustomization.
4. Set `DB_SYNCHRONIZE=false` + run `npm run migration:run`.

### Ingress + TLS

Edit `k8s/ingress.yaml` with your domain. Use cert-manager or:

```bash
kubectl create secret tls orchestrate-tls \
  --cert=fullchain.pem \
  --key=privkey.pem \
  -n orchestrate
```

### Queue-depth scaling (optional)

Install [KEDA](https://keda.sh) and uncomment `keda-scaledobject.yaml` in `k8s/kustomization.yaml`.

---

## Option 3: AWS

| Component     | AWS Service                 |
| ------------- | --------------------------- |
| API + Workers | EKS or ECS Fargate          |
| PostgreSQL    | RDS PostgreSQL 15           |
| Redis         | ElastiCache Redis 7         |
| File storage  | S3 (Block Public Access ON) |
| Load balancer | ALB + ACM certificate       |
| CI/CD         | GitHub Actions → GHCR → EKS |

### S3 setup

1. Private S3 bucket — Block all public access ON.
2. ConfigMap / secrets: `USE_S3=true`, `AWS_REGION`, `S3_BUCKET`, `AWS_*`.
3. Production: use IAM roles (IRSA on EKS) instead of static keys.

### EKS quick path

1. Push images via `docker-publish.yml`.
2. Replace in-cluster Postgres/Redis with RDS + ElastiCache.
3. Deploy with `kubectl apply -k k8s/overlays/rwx-storage`.

---

## Option 4: Google Cloud (GKE)

1. `gcloud container clusters create orchestrate --num-nodes=3`
2. Artifact Registry or mirror GHCR images.
3. Cloud SQL for PostgreSQL + Memorystore for Redis.
4. Update ConfigMap endpoints.
5. Google-managed SSL on Ingress.

---

## Option 5: DigitalOcean

1. Create DOKS cluster.
2. Managed PostgreSQL + Redis.
3. Install NGINX Ingress.
4. Apply `k8s/` manifests; point DNS to Load Balancer IP.

**App Platform alternative:** `deploy/digitalocean/app.yaml` — requires S3.

---

## CI/CD pipeline

| Workflow             | Trigger            | Purpose                               |
| -------------------- | ------------------ | ------------------------------------- |
| `ci.yml`             | Push / PR          | Build, lint, test, Docker smoke build |
| `docker-publish.yml` | Push to main, tags | Publish API + Worker to GHCR          |
| `deploy-k8s.yml`     | Manual             | Deploy to remote cluster              |

### GitHub secrets (remote deploy only)

| Secret             | Description       |
| ------------------ | ----------------- |
| `KUBE_CONFIG_DATA` | Base64 kubeconfig |
| `JWT_SECRET`       | JWT signing       |
| `DB_PASS`          | Postgres password |

---

## Environment variables reference

| Variable             | Required     | Description                             |
| -------------------- | ------------ | --------------------------------------- |
| `JWT_SECRET`         | Yes          | Long random string                      |
| `DB_HOST`            | Yes          | PostgreSQL host                         |
| `DB_PASS`            | Yes          | PostgreSQL password                     |
| `REDIS_HOST`         | Yes          | Redis host                              |
| `WORKER_TYPE`        | Workers      | `media`, `ml`, `email`, `etl`, `report` |
| `RUN_WORKERS_IN_API` | API          | `false` in prod-like setups             |
| `USE_S3`             | No           | S3 storage for processed assets         |
| `MEDIA_OUTPUT_DIR`   | Path B       | `/app/shared/media` in Docker/K8s       |
| `REPORT_OUTPUT_DIR`  | Path B       | `/app/shared/reports`                   |
| `SMTP_*`             | Email worker | SMTP credentials                        |
| `HUNTER_API_KEY`     | Email worker | Hunter.io verification                  |

---

## Production checklist

- [ ] Strong `JWT_SECRET` and rotate periodically
- [ ] `DB_SYNCHRONIZE=false` — run migrations
- [ ] Managed Postgres + Redis (cloud)
- [ ] TLS on Ingress
- [ ] Postgres/Redis not publicly exposed
- [ ] S3 with Block Public Access; presigned URLs for downloads
- [ ] Grafana alerts configured
- [ ] HPA min/max tuned per worker
- [ ] GitHub branch protection + required CI checks

---

## Troubleshooting

| Symptom                         | Fix                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API healthcheck fails           | Check DB/Redis connectivity                                                                                                                                                                |
| Media jobs fail                 | Rebuild worker image: `docker compose build --no-cache`                                                                                                                                    |
| Prometheus can't scrape         | Verify target hostnames in cluster                                                                                                                                                         |
| Jobs stuck in STAGED            | Tenant cap limits — check promoter logs                                                                                                                                                    |
| Worker HPA not scaling          | `kubectl top pods -n orchestrate` — metrics-server                                                                                                                                         |
| ImagePullBackOff                | GHCR access / pull secret                                                                                                                                                                  |
| Docker pull EOF                 | `"registry-mirrors": ["https://mirror.gcr.io"]` in Docker Desktop → Docker Engine                                                                                                          |
| Postgres port-forward fails     | Local Postgres on 5432 — use `5433:5432` and `DB_PORT=5433`                                                                                                                                |
| Minikube disk allocation failed | `minikube start --disk-size=6000`                                                                                                                                                          |
| K8s runs old code after edits   | Push to GitHub → `docker-publish.yml` → `kubectl rollout restart deployment/...`                                                                                                           |
| Grafana login fails             | Docker: `docker compose exec grafana grafana-cli admin reset-admin-password admin` · K8s: `kubectl exec -n orchestrate deployment/grafana -- grafana-cli admin reset-admin-password admin` |

See **[README.md § Troubleshooting](../README.md#troubleshooting)** for expanded sections.
