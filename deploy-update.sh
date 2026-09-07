#!/bin/bash
# Update the LIVE droplet (racecontrol.bitepointracing.com) to current main.
# Run ON the droplet as root:
#     ssh root@45.55.216.21
#     bash <(curl -fsSL https://raw.githubusercontent.com/TNrockytop21/bpr-race-control/main/deploy-update.sh)
# Safe to re-run. Keeps data/ (steward accounts, jwt secret, race-control ledger).
set -e
APP="${APP_DIR:-}"
if [ -z "$APP" ]; then
  for d in /opt/bpr-telemetry /opt/bpr-race-control /root/bpr-race-control /var/www/bpr-race-control; do
    [ -f "$d/package.json" ] && APP="$d" && break
  done
fi
if [ -z "$APP" ] && command -v pm2 >/dev/null; then
  APP=$(pm2 jlist 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);const p=j[0];console.log(p?p.pm2_env.pm_cwd.replace(/\/apps\/server.*$/,''):'')}catch{console.log('')}})")
fi
[ -z "$APP" ] && { echo "Could not find the app directory — run with APP_DIR=/path/to/repo"; exit 1; }
echo "==> app dir: $APP"
cd "$APP"
if [ -d .git ]; then
  git fetch --all --quiet
  git checkout -q main
  git pull --ff-only
else
  if ! git ls-remote https://github.com/TNrockytop21/bpr-race-control.git >/dev/null 2>&1; then echo "no network to GitHub"; exit 1; fi
  echo "==> no git checkout here; cloning fresh next to it and moving data/"
  git clone --quiet https://github.com/TNrockytop21/bpr-race-control.git "$APP.new"
  [ -d "$APP/data" ] && cp -a "$APP/data" "$APP.new/"
  mv "$APP" "$APP.old-$(date +%Y%m%d%H%M)" && mv "$APP.new" "$APP" && cd "$APP"
fi
echo "==> $(git log --oneline -1)"
echo "==> npm install"
npm install --no-audit --no-fund --loglevel=error
echo "==> building broadcast site"
(cd apps/web && npx vite build --logLevel error)
echo "==> restarting server"
if pm2 jlist 2>/dev/null | grep -q '"name"'; then pm2 restart all --update-env; else pm2 start apps/server/src/main.js --name bpr-racecontrol; fi
pm2 save >/dev/null 2>&1 || true
sleep 2
echo "==> health: $(curl -s localhost:8080/health)"
echo "==> race control: $(curl -s localhost:8080/api/rc/state | head -c 160)"
echo "done."
