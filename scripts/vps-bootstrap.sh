#!/usr/bin/env bash
# Run once on the VPS as root (or a docker-capable user).
# After this, GitHub Actions can rsync + docker compose on every push to main.
set -euo pipefail

APP_DIR="${1:-/root/buildesk}"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

mkdir -p "$APP_DIR/backend/instance"
chmod 700 "$APP_DIR/backend/instance"

if [ ! -f /root/.ssh/authorized_keys ]; then
  echo "Add the GitHub Actions deploy public key to /root/.ssh/authorized_keys"
fi

echo "==> Ready. App directory: $APP_DIR"
echo "    1. Put this machine's public key into GitHub is not needed for rsync deploys."
echo "    2. Put the GitHub Actions private key's matching PUBLIC key in ~/.ssh/authorized_keys"
echo "    3. Add GitHub secrets: VPS_HOST, VPS_USER, VPS_SSH_KEY"
echo "    4. Push to main."
