#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NS="orchestrate"
# Path B storage overlay:
#   local-storage — Docker Desktop / Minikube (hostPath)
#   rwx-storage   — cloud clusters with ReadWriteMany PVC
OVERLAY="${1:-local-storage}"

echo "==> Orchestrate Kubernetes deploy (overlay: ${OVERLAY})"

if [ ! -f k8s/secrets.yaml ]; then
  echo "❌ k8s/secrets.yaml not found."
  echo "   Copy-Item k8s/secrets.example.yaml k8s/secrets.yaml  (PowerShell)"
  echo "   Fill JWT_SECRET, DB_PASS, and optional AWS_* for S3, then re-run."
  exit 1
fi

if [ ! -d "k8s/overlays/${OVERLAY}" ]; then
  echo "❌ Unknown overlay: ${OVERLAY}"
  echo "   Valid: local-storage | rwx-storage"
  exit 1
fi

if ! kubectl get deployment metrics-server -n kube-system &>/dev/null; then
  echo "⚠️  metrics-server not found in kube-system."
  echo "   HPA will show TARGETS <unknown>. Install metrics-server for autoscaling."
fi

echo "==> Applying namespace"
kubectl apply -f k8s/namespace.yaml

echo "==> Applying secrets"
kubectl apply -f k8s/secrets.yaml

echo "==> Applying manifests (kustomize overlay: ${OVERLAY})"
kubectl apply -k "k8s/overlays/${OVERLAY}"

echo "==> Waiting for rollouts"
kubectl rollout status deployment/postgres       -n "$NS" --timeout=300s
kubectl rollout status deployment/redis          -n "$NS" --timeout=300s
kubectl rollout status deployment/api            -n "$NS" --timeout=300s
kubectl rollout status deployment/media-worker   -n "$NS" --timeout=300s
kubectl rollout status deployment/ml-worker      -n "$NS" --timeout=300s
kubectl rollout status deployment/email-worker   -n "$NS" --timeout=300s
kubectl rollout status deployment/etl-worker     -n "$NS" --timeout=300s
kubectl rollout status deployment/report-worker  -n "$NS" --timeout=300s

echo ""
echo "==> Pod / PVC / HPA status"
kubectl get pods -n "$NS"
kubectl get pvc  -n "$NS" 2>/dev/null || true
kubectl get hpa  -n "$NS"

echo ""
echo "✅ Deployed (overlay: ${OVERLAY})."
echo "   Port-forward API:  kubectl port-forward -n $NS svc/api 3001:3001"
echo "   Dashboard:         http://localhost:3001/dashboard/"
echo "   Verify:            npm run verify:m1"
echo "   Full status:       npm run k8s:status"
