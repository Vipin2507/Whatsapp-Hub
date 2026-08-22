#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Rebuilding app containers in $ROOT"
docker compose up -d --build --remove-orphans
docker image prune -f

echo "==> Checking Hub via Caddy"
curl -fsS -o /dev/null -w "http  %{http_code}\n" http://127.0.0.1/ || true
curl -kfsS -o /dev/null -w "https %{http_code}\n" https://127.0.0.1/ || true
echo "==> Deploy finished"
