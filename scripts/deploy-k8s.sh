#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NS="orchestrate"

echo "==> Orchestrate Kubernetes deploy"

if [ ! -f k8s/secrets.yaml ]; then
  echo "❌ k8s/secrets.yaml not found."
  echo "   Copy-Item k8s/secrets.example.yaml k8s/secrets.yaml  (PowerShell)"
  echo "   Fill JWT_SECRET and DB_PASS, then re-run."
  exit 1
fi

# Check metrics-server (HPA needs it)
if ! kubectl get deployment metrics-server -n kube-system &>/dev/null; then
  echo "⚠️  metrics-server not found in kube-system."
  echo "   HPA will show TARGETS <unknown>. Install metrics-server for autoscaling."
fi

echo "==> Applying secrets"
kubectl apply -f k8s/secrets.yaml

echo "==> Applying manifests (kustomize)"
kubectl apply -k k8s/

echo "==> Waiting for core rollouts"
kubectl rollout status deployment/postgres -n "$NS" --timeout=180s
kubectl rollout status deployment/redis    -n "$NS" --timeout=120s
kubectl rollout status deployment/api      -n "$NS" --timeout=180s

echo ""
echo "==> HPA status"
kubectl get hpa -n "$NS"

echo ""
echo "✅ Deployed."
echo "   Port-forward API:  kubectl port-forward -n $NS svc/api 3001:3001"
echo "   Dashboard:         http://localhost:3001/dashboard/"
echo "   Verify:            npm run verify:m1"
echo "   Full status:       npm run k8s:status"