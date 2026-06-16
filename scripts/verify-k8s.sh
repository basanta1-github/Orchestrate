#!/usr/bin/env bash
set -euo pipefail

NS="${K8S_NAMESPACE:-orchestrate}"

echo "==> K8s resource check (namespace: $NS)"
kubectl get pods,svc,hpa -n "$NS"

echo ""
echo "==> Waiting for api pods Ready"
kubectl wait --for=condition=Ready pod -l app=api -n "$NS" --timeout=120s

echo ""
echo "==> Port-forward + health (background)"
kubectl port-forward -n "$NS" svc/api 3001:3001 &
PF_PID=$!
sleep 3
trap "kill $PF_PID 2>/dev/null" EXIT

npm run verify:m1
echo "✅ In-cluster API reachable via port-forward"