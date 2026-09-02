#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ZIP=${ZIP:-/tmp/shanman-admin-category-hotfix-20260902.zip}
EXPECTED=${EXPECTED:?请通过 EXPECTED 环境变量传入部署包 SHA-256}
SHANMAN_ROOT=${SHANMAN_ROOT:-/opt/shanman}
SERVER_DIR="$SHANMAN_ROOT/server"
TARGET="$SERVER_DIR/public/admin/admin.js"
EXPECTED_ADMIN_SHA=${EXPECTED_ADMIN_SHA:?请通过 EXPECTED_ADMIN_SHA 环境变量传入 admin.js SHA-256}

for command_name in sha256sum unzip docker curl grep cp mkdir mktemp rm date awk seq sleep; do
  command -v "$command_name" >/dev/null || {
    echo "缺少部署命令: $command_name" >&2
    exit 1
  }
done

test -f "$ZIP"
test -d "$SERVER_DIR"
test ! -L "$SERVER_DIR"
test -f "$TARGET"
test ! -L "$TARGET"
echo "$EXPECTED  $ZIP" | sha256sum -c -

ZIP_LIST=$(unzip -Z1 "$ZIP")
test "$ZIP_LIST" = 'public/admin/admin.js'

STAMP=$(date +%Y%m%d-%H%M%S)
STAGE=$(mktemp -d "/tmp/shanman-admin-category-hotfix-$STAMP.XXXXXX")
BACKUP_DIR="$SHANMAN_ROOT/backups"
BACKUP="$BACKUP_DIR/admin-js-before-category-hotfix-$STAMP.js"
mkdir -p "$BACKUP_DIR"

cleanup() {
  rm -rf -- "$STAGE"
}

rollback() {
  local status="${1:-1}"
  trap - ERR INT TERM
  set +e
  echo '后台静态资源热修复失败，正在恢复原文件' >&2
  cp -a -- "$BACKUP" "$TARGET"
  cd "$SERVER_DIR"
  docker compose build api
  docker compose up -d --force-recreate api
  cleanup
  exit "$status"
}

unzip -oq "$ZIP" -d "$STAGE"
NEW_ADMIN="$STAGE/public/admin/admin.js"
test -f "$NEW_ADMIN"
test ! -L "$NEW_ADMIN"
echo "$EXPECTED_ADMIN_SHA  $NEW_ADMIN" | sha256sum -c -
grep -Fq "['通用','漫剧','设计','视频','软件','写作','运营','电商','高级']" "$NEW_ADMIN"
grep -Fq "{研究:'软件',数据:'运营',效率:'电商'}" "$NEW_ADMIN"

cp -a -- "$TARGET" "$BACKUP"
trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
cp -- "$NEW_ADMIN" "$TARGET"

cd "$SERVER_DIR"
docker compose build api
docker compose up -d --force-recreate api

READY=0
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8080/health >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 3
done
test "$READY" = 1

SERVED_ADMIN="$STAGE/served-admin.js"
curl -fsS http://127.0.0.1:8080/admin/admin.js -o "$SERVED_ADMIN"
SERVED_SHA=$(sha256sum "$SERVED_ADMIN" | awk '{print toupper($1)}')
test "$SERVED_SHA" = "${EXPECTED_ADMIN_SHA^^}"
grep -Fq "['通用','漫剧','设计','视频','软件','写作','运营','电商','高级']" "$SERVED_ADMIN"

cleanup
trap - ERR INT TERM
echo "DEPLOY_ADMIN_CATEGORY_HOTFIX_OK backup=$BACKUP admin_sha=$SERVED_SHA"
