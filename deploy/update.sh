#!/bin/bash
# Deploy the latest code from GitHub:  sudo bash /opt/wetext/deploy/update.sh
set -euo pipefail
cd /opt/wetext
sudo -u wetext git pull --ff-only
sudo -u wetext npm ci
sudo -u wetext npm run build
systemctl restart wetext
sleep 2; curl -s http://127.0.0.1:4000/api/health; echo
