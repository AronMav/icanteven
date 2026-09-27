#!/usr/bin/env bash
# Run from a release containing dist/, server/, and deploy/ on Debian 13.
set -euo pipefail
if [[ $EUID -ne 0 ]]; then
  echo 'Run this installer with sudo.' >&2
  exit 1
fi
release=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
for file in dist/index.html server/stats.py server/gunicorn.conf.py deploy/Caddyfile deploy/icanteven-stats.service; do
  test -f "$release/$file" || { echo "Missing $file" >&2; exit 1; }
done
if [[ -f /etc/caddy/Caddyfile ]] && ! grep -q '^# Managed by icanteven deploy/install.sh$' /etc/caddy/Caddyfile; then
  echo 'An unmanaged Caddyfile already exists. Integrate the site manually before deploying.' >&2
  exit 1
fi
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y caddy gunicorn curl
caddy validate --config "$release/deploy/Caddyfile" --adapter caddyfile
if ! id icanteven >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /var/lib/icanteven --no-create-home --shell /usr/sbin/nologin icanteven
fi
version=$(date -u +%Y%m%dT%H%M%S)-$$
web="/var/www/icanteven/releases/$version"
app="/opt/icanteven/releases/$version"
install -d -m 0755 "$web" "$app/server"
cp -R "$release/dist/." "$web/"
install -m 0644 "$release/server/stats.py" "$release/server/gunicorn.conf.py" "$app/server/"
chmod -R a+rX "$web" "$app"
if [[ -f /etc/caddy/Caddyfile ]]; then
  cp -p /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.before-$version"
fi
ln -s "$app" /opt/icanteven/current.next
mv -Tf /opt/icanteven/current.next /opt/icanteven/current
install -m 0644 "$release/deploy/icanteven-stats.service" /etc/systemd/system/icanteven-stats.service
systemctl daemon-reload
systemctl enable icanteven-stats
systemctl restart icanteven-stats
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:8787/stats
ln -s "$web" /var/www/icanteven/current.next
mv -Tf /var/www/icanteven/current.next /var/www/icanteven/current
install -m 0644 "$release/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl enable caddy
if systemctl is-active --quiet caddy; then
  systemctl reload caddy
else
  systemctl start caddy
fi
echo
echo "Installed release $version. Point the domain A record to this server for HTTPS."
echo 'Database: /var/lib/icanteven/statistics.sqlite3 (preserved across deployments).'
