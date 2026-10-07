#!/bin/bash
# One-time setup for a fresh Ubuntu/Debian VM (e.g. Google Cloud e2-micro).
# Usage:  sudo bash setup.sh your-name.duckdns.org
set -euo pipefail

DOMAIN="${1:-}"
REPO="${REPO:-https://github.com/shahidthisside/WeText.git}"
[ -n "$DOMAIN" ] || { echo "Usage: sudo bash setup.sh your-domain.example"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Run with sudo"; exit 1; }

echo "==> Swap (the free VM only has ~1 GB of RAM; builds need more)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Packages"
apt-get update -y
apt-get install -y curl git sqlite3 build-essential ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "==> App user and folders"
id wetext >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin wetext
mkdir -p /opt/wetext /var/lib/wetext /var/backups/wetext
chown -R wetext:wetext /opt/wetext /var/lib/wetext

echo "==> Code and build"
if [ ! -d /opt/wetext/.git ]; then sudo -u wetext git clone "$REPO" /opt/wetext; fi
cd /opt/wetext
sudo -u wetext git pull --ff-only
sudo -u wetext npm ci
sudo -u wetext npm run build

echo "==> Site settings (/etc/wetext.env)"
if [ ! -f /etc/wetext.env ]; then
  cat > /etc/wetext.env <<ENV
# Public address of the site. Used in emailed links.
PUBLIC_URL=https://$DOMAIN
# Free email for password resets: create a Brevo account, verify a sender address,
# create an API key (SMTP & API, then API keys), and fill these in.
BREVO_API_KEY=
MAIL_FROM=
MAIL_FROM_NAME=WeText
ENV
  chmod 600 /etc/wetext.env
fi

echo "==> Service"
cp deploy/wetext.service /etc/systemd/system/wetext.service
systemctl daemon-reload
systemctl enable --now wetext

echo "==> HTTPS reverse proxy for $DOMAIN"
cp deploy/Caddyfile /etc/caddy/Caddyfile
mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=WETEXT_DOMAIN=%s\n' "$DOMAIN" > /etc/systemd/system/caddy.service.d/domain.conf
systemctl daemon-reload
systemctl enable caddy && systemctl restart caddy

echo "==> Nightly backup at 03:30"
install -m 755 deploy/backup.sh /usr/local/bin/wetext-backup
echo '30 3 * * * root /usr/local/bin/wetext-backup' > /etc/cron.d/wetext-backup

sleep 3
echo
echo "Health check:"; curl -s http://127.0.0.1:4000/api/health || true; echo
echo "Done. Open https://$DOMAIN (the certificate can take a minute on first visit)."
echo "Password-reset email: edit /etc/wetext.env (BREVO_API_KEY, MAIL_FROM), then: sudo systemctl restart wetext"
