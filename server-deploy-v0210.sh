#!/usr/bin/env bash
set -euo pipefail

ZIP=/root/shanman-admin-server-v0.2.10-folder-hotfix-20260804.zip
EXPECTED=989398584A6CD476E3B89A0813C9E61B8A045FD46A3EFBFDA911D6951644780D

echo "$EXPECTED  $ZIP" | sha256sum -c -
STAMP=$(date +%Y%m%d-%H%M%S)
RELEASE=/opt/shanman/releases/v0.2.10-$STAMP
mkdir -p "$RELEASE" /opt/shanman/backups
unzip -oq "$ZIP" -d "$RELEASE"

cd /opt/shanman/server
tar -czf /opt/shanman/backups/server-before-v0210-$STAMP.tar.gz --exclude=node_modules --exclude=storage .
cp -a "$RELEASE/." /opt/shanman/server/

grep -q '"version": "0.2.10"' package.json
grep -q "optionalText('role'" src/agent-builder.js
grep -q 'applySkillUploadOverrides' src/package-upload.js
grep -q 'catch (error) { fail(error); }' src/package-upload.js
grep -q 'detachSkillFromLatestAgentManifests' src/routes/admin.js
grep -q 'confirmedSlug !== row.slug' src/routes/admin.js
grep -q 'data-action="permanent-delete"' public/admin/admin.js
grep -q 'admin.js?v=20260804-030' public/admin/index.html

docker compose up -d --build
READY=0
for _ in $(seq 1 60); do
  HEALTH=$(curl -fsS http://127.0.0.1:8080/health 2>/dev/null || true)
  if echo "$HEALTH" | grep -q '"version":"0.2.10"'; then READY=1; break; fi
  sleep 3
done
test "$READY" = 1
echo "$HEALTH"

# Run the full lifecycle against the real HTTP API and PostgreSQL. The self-test
# also verifies a malformed folder ZIP returns 400 without restarting the API.
API_CONTAINER=$(docker compose ps -q api)
test -n "$API_CONTAINER"
docker cp deploy/marketplace-selftest.mjs "$API_CONTAINER":/app/marketplace-selftest.mjs
docker compose exec -T api node /app/marketplace-selftest.mjs

curl -fsS http://127.0.0.1:8080/admin/admin.js | grep -q 'permanent?confirm='
curl -fsSI http://127.0.0.1:8080/api/marketplace/agents | grep -qi '^cache-control:.*no-store'
curl -fsSI http://127.0.0.1:8080/api/marketplace/skills | grep -qi '^cache-control:.*no-store'
echo DEPLOY_V0210_FOLDER_HOTFIX_OK
