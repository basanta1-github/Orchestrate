#!/usr/bin/env bash
set -euo pipefail

PROM="${PROM_URL:-http://localhost:9090}"
GRAFANA="${GRAFANA_URL:-http://localhost:3002}"

echo "==> Prometheus health"
curl -sf "$PROM/-/healthy" && echo " OK"

echo "==> Prometheus targets"
curl -sf "$PROM/api/v1/targets" | grep -o '"health":"[^"]*"' | head -10

echo "==> Sample metrics"
curl -sf "$PROM/api/v1/query?query=jobque_queue_depth" | head -c 500
echo ""

echo "==> Grafana health"
curl -sf "$GRAFANA/api/health" && echo ""

echo "✅ Monitoring stack reachable"
echo "   Grafana:     $GRAFANA"
echo "   Prometheus:  $PROM"
echo "   Alertmanager http://localhost:9093"