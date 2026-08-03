#!/usr/bin/env bash
set -euo pipefail

ZIP=/root/shanman-admin-server-v0.2.8-skill-lifecycle-20260803.zip
EXPECTED=F44DB8F449AC319A4AFE34EC9E56530C5D74CC362354AA163F8ABE9DA4E63615

echo "$EXPECTED  $ZIP" | sha256sum -c -
STAMP=$(date +%Y%m%d-%H%M%S)
RELEASE=/opt/shanman/releases/v0.2.8-$STAMP
mkdir -p "$RELEASE" /opt/shanman/backups
unzip -oq "$ZIP" -d "$RELEASE"

cd /opt/shanman/server
tar -czf /opt/shanman/backups/server-before-v028-$STAMP.tar.gz --exclude=node_modules --exclude=storage .
cp -a "$RELEASE/." /opt/shanman/server/
grep -q '"version": "0.2.8"' /opt/shanman/server/package.json
grep -q 'const hasBody=options.body!==undefined&&options.body!==null' /opt/shanman/server/public/admin/admin.js
grep -q '>立即下架</button>' /opt/shanman/server/public/admin/admin.js
grep -q 'webkitdirectory' /opt/shanman/server/public/admin/admin.js
grep -q '上传后直接上架' /opt/shanman/server/public/admin/admin.js
grep -q 'requestedStatus' /opt/shanman/server/src/routes/admin.js
grep -q 'req.parts()' /opt/shanman/server/src/routes/admin.js
! grep -q 'unpublishAgentsUsingSkill' /opt/shanman/server/src/routes/admin.js
! grep -q "action==='unpublish'&&!confirm" /opt/shanman/server/public/admin/admin.js
! grep -q 'data-action="delete-product"' /opt/shanman/server/public/admin/admin.js
grep -q 'admin.js?v=20260803-028' /opt/shanman/server/public/admin/index.html

docker compose up -d --build
READY=0
for _ in $(seq 1 50); do
  if curl -fsS http://127.0.0.1:8080/health >/dev/null; then READY=1; break; fi
  sleep 3
done
test "$READY" = 1
curl -fsS http://127.0.0.1:8080/health

# 空 POST 先通过鉴权；技能生命周期不能级联修改智能体。
ID=11111111-1111-4111-8111-111111111111
for PATHNAME in \
  "/api/admin/agents/$ID/unpublish" \
  "/api/admin/skills/$ID/unpublish"; do
  STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:8080$PATHNAME")
  test "$STATUS" = 401
done

curl -fsS http://127.0.0.1:8080/admin/admin.js | grep -q 'webkitdirectory'
curl -fsS http://127.0.0.1:8080/admin/admin.js | grep -q '上传后直接上架'
curl -fsSI http://127.0.0.1:8080/api/marketplace/agents | grep -qi '^cache-control:.*no-store'
curl -fsSI http://127.0.0.1:8080/api/marketplace/skills | grep -qi '^cache-control:.*no-store'
echo DEPLOY_V028_SKILL_LIFECYCLE_UPLOAD_OK
