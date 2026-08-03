#!/usr/bin/env bash
set -euo pipefail

ZIP=/root/shanman-admin-server-v0.2.7-empty-body-fix-20260803.zip
EXPECTED=73B539D3CC0C40E50B959B297F40951525363E63BB88343DD2D79DC0A4EA8D9F

echo "$EXPECTED  $ZIP" | sha256sum -c -
STAMP=$(date +%Y%m%d-%H%M%S)
RELEASE=/opt/shanman/releases/v0.2.7-$STAMP
mkdir -p "$RELEASE" /opt/shanman/backups
unzip -oq "$ZIP" -d "$RELEASE"

cd /opt/shanman/server
tar -czf /opt/shanman/backups/server-before-v027-$STAMP.tar.gz --exclude=node_modules --exclude=storage .
cp -a "$RELEASE/." /opt/shanman/server/
grep -q '"version": "0.2.7"' /opt/shanman/server/package.json
grep -q 'const hasBody=options.body!==undefined&&options.body!==null' /opt/shanman/server/public/admin/admin.js
grep -q '>立即下架</button>' /opt/shanman/server/public/admin/admin.js
! grep -q "action==='unpublish'&&!confirm" /opt/shanman/server/public/admin/admin.js
! grep -q 'data-action="delete-product"' /opt/shanman/server/public/admin/admin.js
grep -q 'admin.js?v=20260803-027' /opt/shanman/server/public/admin/index.html

docker compose up -d --build
READY=0
for _ in $(seq 1 50); do
  if curl -fsS http://127.0.0.1:8080/health >/dev/null; then READY=1; break; fi
  sleep 3
done
test "$READY" = 1
curl -fsS http://127.0.0.1:8080/health

# Empty JSON POSTs must reach the auth guard instead of Fastify's JSON parser.
ID=11111111-1111-4111-8111-111111111111
for PATHNAME in \
  "/api/admin/agents/$ID/unpublish" \
  "/api/admin/skills/$ID/unpublish"; do
  STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:8080$PATHNAME")
  test "$STATUS" = 401
done

curl -fsS http://127.0.0.1:8080/admin/admin.js | grep -q 'const hasBody=options.body!==undefined&&options.body!==null'
curl -fsS http://127.0.0.1:8080/admin/admin.js | grep -q '>立即下架</button>'
curl -fsSI http://127.0.0.1:8080/api/marketplace/agents | grep -qi '^cache-control:.*no-store'
curl -fsSI http://127.0.0.1:8080/api/marketplace/skills | grep -qi '^cache-control:.*no-store'
echo DEPLOY_V027_EMPTY_BODY_UNPUBLISH_OK
