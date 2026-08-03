#!/usr/bin/env bash
set -euo pipefail

ZIP=/root/shanman-admin-server-v0.2.4-account-profile-20260803.zip
EXPECTED=EC1134C2E62356098492D4DC24C2AB77E5FCCF162F9353C465E6E5190A73FFDB

echo "$EXPECTED  $ZIP" | sha256sum -c -
STAMP=$(date +%Y%m%d-%H%M%S)
RELEASE=/opt/shanman/releases/v0.2.4-$STAMP
mkdir -p "$RELEASE" /opt/shanman/backups
unzip -oq "$ZIP" -d "$RELEASE"

cd /opt/shanman/server
tar -czf /opt/shanman/backups/server-before-v024-$STAMP.tar.gz --exclude=node_modules --exclude=storage .
cp -a "$RELEASE/." /opt/shanman/server/
grep -q '"version": "0.2.4"' /opt/shanman/server/package.json

docker compose up -d --build
READY=0
for _ in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:8080/health >/dev/null; then READY=1; break; fi
  sleep 3
done
test "$READY" = 1
curl -fsS http://127.0.0.1:8080/health
docker compose exec -T api node --input-type=module -e "import {config} from './src/config.js'; import {createLicenseAuthority,loadPrivateKey} from './src/license-signing.js'; const a=createLicenseAuthority({privateKeyPem:loadPrivateKey(config)}); if(!a.canSign)process.exit(2); console.log('SIGNER_OK '+a.publicKeyFingerprint)"

PROFILE_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH http://127.0.0.1:8080/api/me/profile -H 'content-type: application/json' --data '{}')
PASSWORD_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8080/api/me/password -H 'content-type: application/json' --data '{}')
test "$PROFILE_STATUS" = 401
test "$PASSWORD_STATUS" = 401
echo DEPLOY_V024_ACCOUNT_PROFILE_OK
