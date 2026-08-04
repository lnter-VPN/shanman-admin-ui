#!/usr/bin/env bash
set -euo pipefail

ZIP=/root/shanman-admin-server-v0.2.9-real-marketplace-20260804.zip
EXPECTED=4FE51C8B236581830D49E1AB351BFB6C8F2E21D3895FF92718402779A0F7F0AD

echo "$EXPECTED  $ZIP" | sha256sum -c -
STAMP=$(date +%Y%m%d-%H%M%S)
RELEASE=/opt/shanman/releases/v0.2.9-$STAMP
mkdir -p "$RELEASE" /opt/shanman/backups
unzip -oq "$ZIP" -d "$RELEASE"

cd /opt/shanman/server
tar -czf /opt/shanman/backups/server-before-v029-$STAMP.tar.gz --exclude=node_modules --exclude=storage .
cp -a "$RELEASE/." /opt/shanman/server/

grep -q '"version": "0.2.9"' package.json
grep -q "optionalText('role'" src/agent-builder.js
grep -q 'applySkillUploadOverrides' src/package-upload.js
grep -q 'detachSkillFromLatestAgentManifests' src/routes/admin.js
grep -q 'confirmedSlug !== row.slug' src/routes/admin.js
grep -q 'data-action="permanent-delete"' public/admin/admin.js
grep -q '云端技能.*平台内置技能' public/admin/admin.js
grep -q 'admin.js?v=20260804-029' public/admin/index.html

docker compose up -d --build
READY=0
for _ in $(seq 1 60); do
  HEALTH=$(curl -fsS http://127.0.0.1:8080/health 2>/dev/null || true)
  if echo "$HEALTH" | grep -q '"version":"0.2.9"'; then READY=1; break; fi
  sleep 3
done
test "$READY" = 1
echo "$HEALTH"

# 使用容器中现有管理员环境变量，经真实 HTTP 接口和 PostgreSQL 完成：
# 上传并上架技能 -> 创建带角色/简介的智能体 -> 下架技能但不级联 ->
# 永久删除技能并解除 manifest 引用 -> 永久删除智能体。临时数据由脚本自动清理。
docker compose exec -T api node deploy/marketplace-selftest.mjs

curl -fsS http://127.0.0.1:8080/admin/admin.js | grep -q 'permanent?confirm='
curl -fsS http://127.0.0.1:8080/admin/admin.js | grep -q '云端技能'
curl -fsSI http://127.0.0.1:8080/api/marketplace/agents | grep -qi '^cache-control:.*no-store'
curl -fsSI http://127.0.0.1:8080/api/marketplace/skills | grep -qi '^cache-control:.*no-store'
echo DEPLOY_V029_REAL_MARKETPLACE_OK
