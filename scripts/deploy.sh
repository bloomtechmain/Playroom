#!/usr/bin/env bash
# Deploy the committed code (git HEAD) to the Lightsail server and restart the app.
#
#   scripts/deploy.sh
#
# Settings (environment): DEPLOY_HOST (default ubuntu@3.7.232.71), DEPLOY_KEY (default ~/.ssh/playroom_lightsail).
# The server keeps its own database and /opt/playroom/.env.production. Before switching over, the live
# database is backed up to /var/backups/playroom (last 10 kept). The new version is built next to the
# running one, so a failed build leaves the live site untouched. Schema changes (database.sql) are
# applied by hand on the server.
set -euo pipefail
HOST=${DEPLOY_HOST:-ubuntu@3.7.232.71}
KEY=${DEPLOY_KEY:-$HOME/.ssh/playroom_lightsail}
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Commit your changes first — only committed code is deployed." >&2
  exit 1
fi
REV=$(git rev-parse --short HEAD)
echo "Deploying $REV to $HOST…"

git archive --format=tar.gz HEAD | ssh -i "$KEY" "$HOST" "cat > /tmp/playroom-app.tgz"
ssh -i "$KEY" "$HOST" "sudo REV=$REV bash -s" <<'REMOTE'
set -euo pipefail
APP=/opt/playroom/app
mkdir -p /var/backups/playroom
sudo -u postgres pg_dump -Fc playroom > "/var/backups/playroom/pre-deploy-$(date +%Y%m%d-%H%M%S).dump"
ls -1t /var/backups/playroom/pre-deploy-*.dump | tail -n +11 | xargs -r rm --
rm -rf "$APP.new" && mkdir -p "$APP.new" && tar -xzf /tmp/playroom-app.tgz -C "$APP.new" && rm /tmp/playroom-app.tgz
cp /opt/playroom/.env.production "$APP.new/.env" && chmod 600 "$APP.new/.env"
chown -R playroom:playroom "$APP.new"
sudo -u playroom -H bash -c "cd $APP.new && export NEXT_TELEMETRY_DISABLED=1 && npm ci --no-audit --no-fund --loglevel=error && npm run build > /tmp/playroom-build.log 2>&1 || { tail -30 /tmp/playroom-build.log; exit 1; }"
rm -rf "$APP.old" && mv "$APP" "$APP.old" && mv "$APP.new" "$APP"
systemctl restart playroom
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:3000/login && break; sleep 2; done
echo "$REV" > /opt/playroom/DEPLOYED
echo "app: $(systemctl is-active playroom) · previous version kept in $APP.old"
REMOTE
echo "Deployed $REV — https://3-7-232-71.sslip.io"
