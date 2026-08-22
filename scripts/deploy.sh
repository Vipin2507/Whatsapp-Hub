#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Rebuilding app containers in $ROOT"
docker compose up -d --build --remove-orphans
docker image prune -f

echo "==> Checking Hub on :8080"
curl -fsS -o /dev/null -w "frontend HTTP %{http_code}\n" http://127.0.0.1:8080/ || true
echo "==> Deploy finished"
