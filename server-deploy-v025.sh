#!/usr/bin/env bash
set -euo pipefail

ZIP=/root/shanman-admin-server-v0.2.5-market-lifecycle-20260803.zip
EXPECTED=B553663E48CC73AF98A8BED108C5FBEE57FE573DE65E9B12A614C892E5594B8D

echo "$EXPECTED  $ZIP" | sha256sum -c -
STAMP=$(date +%Y%m%d-%H%M%S)
RELEASE=/opt/shanman/releases/v0.2.5-$STAMP
mkdir -p "$RELEASE" /opt/shanman/backups
unzip -oq "$ZIP" -d "$RELEASE"

cd /opt/shanman/server
tar -czf /opt/shanman/backups/server-before-v025-$STAMP.tar.gz --exclude=node_modules --exclude=storage .
cp -a "$RELEASE/." /opt/shanman/server/
grep -q '"version": "0.2.5"' /opt/shanman/server/package.json
grep -q 'unpublishAgentsUsingSkill' /opt/shanman/server/src/routes/admin.js

docker compose up -d --build
READY=0
for _ in $(seq 1 50); do
  if curl -fsS http://127.0.0.1:8080/health >/dev/null; then READY=1; break; fi
  sleep 3
done
test "$READY" = 1
curl -fsS http://127.0.0.1:8080/health
docker compose exec -T api node --input-type=module -e "import {config} from './src/config.js'; import {createLicenseAuthority,loadPrivateKey} from './src/license-signing.js'; const a=createLicenseAuthority({privateKeyPem:loadPrivateKey(config)}); if(!a.canSign)process.exit(2); console.log('SIGNER_OK '+a.publicKeyFingerprint)"

ID=11111111-1111-4111-8111-111111111111
for SPEC in \
  "POST /api/admin/agents/$ID/publish" \
  "POST /api/admin/agents/$ID/unpublish" \
  "DELETE /api/admin/agents/$ID" \
  "DELETE /api/admin/agents/$ID/permanent" \
  "POST /api/admin/skills/$ID/publish" \
  "POST /api/admin/skills/$ID/unpublish" \
  "DELETE /api/admin/skills/$ID" \
  "DELETE /api/admin/skills/$ID/permanent"; do
  METHOD=${SPEC%% *}
  PATHNAME=${SPEC#* }
  STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X "$METHOD" "http://127.0.0.1:8080$PATHNAME")
  test "$STATUS" = 401
done

curl -fsSI http://127.0.0.1:8080/api/marketplace/agents | grep -qi '^cache-control:.*no-store'
curl -fsSI http://127.0.0.1:8080/api/marketplace/skills | grep -qi '^cache-control:.*no-store'
echo DEPLOY_V025_MARKET_LIFECYCLE_OK
