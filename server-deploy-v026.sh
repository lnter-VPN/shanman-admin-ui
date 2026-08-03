#!/usr/bin/env bash
set -euo pipefail

ZIP=/root/shanman-admin-server-v0.2.6-one-click-unpublish-20260803.zip
EXPECTED=A00F3EA291122FB6017FE08EC8E354A18A8A161D8944635C7DA2C3A8858E30C2

echo "$EXPECTED  $ZIP" | sha256sum -c -
STAMP=$(date +%Y%m%d-%H%M%S)
RELEASE=/opt/shanman/releases/v0.2.6-$STAMP
mkdir -p "$RELEASE" /opt/shanman/backups
unzip -oq "$ZIP" -d "$RELEASE"

cd /opt/shanman/server
tar -czf /opt/shanman/backups/server-before-v026-$STAMP.tar.gz --exclude=node_modules --exclude=storage .
cp -a "$RELEASE/." /opt/shanman/server/
grep -q '"version": "0.2.6"' /opt/shanman/server/package.json
grep -q '>立即下架</button>' /opt/shanman/server/public/admin/admin.js
! grep -q "action==='unpublish'&&!confirm" /opt/shanman/server/public/admin/admin.js
! grep -q 'data-action="delete-product"' /opt/shanman/server/public/admin/admin.js
grep -q 'admin.js?v=20260803-026' /opt/shanman/server/public/admin/index.html

docker compose up -d --build
READY=0
for _ in $(seq 1 50); do
  if curl -fsS http://127.0.0.1:8080/health >/dev/null; then READY=1; break; fi
  sleep 3
done
test "$READY" = 1
curl -fsS http://127.0.0.1:8080/health

ID=11111111-1111-4111-8111-111111111111
for SPEC in \
  "POST /api/admin/agents/$ID/unpublish" \
  "POST /api/admin/skills/$ID/unpublish"; do
  METHOD=${SPEC%% *}
  PATHNAME=${SPEC#* }
  STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X "$METHOD" "http://127.0.0.1:8080$PATHNAME")
  test "$STATUS" = 401
done

curl -fsS http://127.0.0.1:8080/admin/admin.js | grep -q '>立即下架</button>'
curl -fsS http://127.0.0.1:8080/admin/admin.js | grep -q 'verifyProductState'
curl -fsSI http://127.0.0.1:8080/api/marketplace/agents | grep -qi '^cache-control:.*no-store'
curl -fsSI http://127.0.0.1:8080/api/marketplace/skills | grep -qi '^cache-control:.*no-store'
echo DEPLOY_V026_ONE_CLICK_UNPUBLISH_OK
