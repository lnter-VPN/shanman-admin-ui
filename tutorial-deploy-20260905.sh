#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ZIP=${ZIP:?ZIP required}
EXPECTED=${EXPECTED:?SHA256 required}
SELFTEST=${SELFTEST:?SELFTEST required}
ROOT=/opt/shanman
LIVE=$ROOT/server
test "$(realpath "$LIVE")" = "$LIVE"
exec 9>"$ROOT/tutorial-deploy.lock"
flock -n 9
echo "$EXPECTED  $ZIP" | sha256sum -c -
cd "$LIVE"
echo 'f0ab9a2d4490222f8479ba751f587f40367f81c69838b9603574e67259de5f6d  src/app.js' | sha256sum -c -
echo '205150265c7f32dec3c218db125a0e0521deb947e80df9eef700a831e396941a  src/avatar-storage.js' | sha256sum -c -
test "$(df -PB1 "$ROOT" | awk 'NR==2 {print $4}')" -gt 2147483648
STAMP=$(date +%Y%m%d-%H%M%S)
WORK=$(mktemp -d "$ROOT/tutorial-deploy-$STAMP.XXXXXX")
STAGE=$WORK/server
BACKUP=$ROOT/backups/tutorial-$STAMP
PREVIOUS=$ROOT/server.before-tutorial-$STAMP
FAILED=$ROOT/server.failed-tutorial-$STAMP
NET=shanman-tutorial-test-$STAMP
DB=$NET-db
API=$NET-api
IMAGE=shanman-tutorial:$STAMP
OLD_IMAGE=$(docker inspect "$(docker compose ps -q api)" --format '{{.Image}}')
test "$(docker inspect "$(docker compose ps -q api)" --format '{{.Config.Image}}')" = server-api
MOVED=0
PAUSED=0
cleanup_lab(){
  docker rm -f "$API" "$DB" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
rollback(){
  status=$?
  trap - ERR INT TERM
  set +e
  cleanup_lab
  if [ "$MOVED" = 1 ]; then
    if [ -d "$LIVE" ]; then (cd "$LIVE" && docker compose stop -t 30 api); mv "$LIVE" "$FAILED"; fi
    mv "$PREVIOUS" "$LIVE" || { echo 'MANUAL_RECOVERY_REQUIRED code restore failed'; exit "$status"; }
    docker tag "$OLD_IMAGE" server-api
  fi
  if [ "$PAUSED" = 1 ]; then (cd "$LIVE" && docker compose up -d --no-build api); fi
  echo "DEPLOY_FAILED code rolled back; additive tutorial tables and all customer data preserved; backup=$BACKUP"
  exit "$status"
}
trap rollback ERR INT TERM
mkdir -p "$STAGE" "$BACKUP"
unzip -Z1 "$ZIP" > "$WORK/zip-files"
if grep -Eq '(^/|(^|/)\.\.(/|$)|\\|(^|/)(\.env|node_modules|storage)(/|$))' "$WORK/zip-files"; then exit 2; fi
test "$(wc -l < "$WORK/zip-files")" = 12
unzip -q "$ZIP" -d "$WORK/delta"
test -z "$(find "$WORK/delta" -type l -print -quit)"
(cd "$WORK/delta" && sha256sum -c SHA256SUMS)
for file in src/app.js src/tutorials.js src/tutorial-images.js src/routes/tutorials.js migrations/010_tutorials.sql migrations/011_tutorial_categories_images.sql public/admin/index.html public/admin/admin.js public/admin/admin.css public/admin/tutorial-publisher.js public/admin/tutorial-publisher.css; do
  test -f "$WORK/delta/$file"
done
# Clone the live release, including its private configuration only on this host.
# The uploaded delta cannot replace credentials, dependencies, or other services.
tar -C "$LIVE" --exclude='./node_modules' --exclude='./storage' -cf - . | tar -C "$STAGE" -xf -
cp -a "$WORK/delta/src/." "$STAGE/src/"
cp -a "$WORK/delta/migrations/." "$STAGE/migrations/"
cp -a "$WORK/delta/public/." "$STAGE/public/"
test -z "$(find "$STAGE" -type l -print -quit)"
docker build -q -t "$IMAGE" "$STAGE"
docker network create --internal "$NET" >/dev/null
TEST_SECRET=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
docker run -d --name "$DB" --network "$NET" --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=shanman -e POSTGRES_DB=shanman -e "POSTGRES_PASSWORD=$TEST_SECRET" postgres:16-alpine >/dev/null
for i in $(seq 1 30); do docker exec "$DB" pg_isready -U shanman -d shanman >/dev/null 2>&1 && break; sleep 1; done
docker run -d --name "$API" --network "$NET" --security-opt no-new-privileges:true -e NODE_ENV=production -e "DATABASE_URL=postgres://shanman:$TEST_SECRET@$DB:5432/shanman" -e "JWT_SECRET=$TEST_SECRET" -e ADMIN_USERNAME=deploytest -e ADMIN_EMAIL=deploytest@example.invalid -e "ADMIN_PASSWORD=$TEST_SECRET" -e SHANMAN_ISOLATED_TEST=1 "$IMAGE" >/dev/null
READY=0
for i in $(seq 1 45); do
  if docker exec "$API" node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
test "$READY" = 1
docker cp "$SELFTEST" "$API":/app/tutorial-selftest.mjs
docker exec "$API" node /app/tutorial-selftest.mjs
cleanup_lab
echo 'PREFLIGHT_PASSED live service still unchanged'
cd "$LIVE"
DB_SIZE=$(docker compose exec -T db psql -U shanman -d shanman -Atc "SELECT pg_database_size('shanman')")
STORAGE_SIZE=$(docker compose exec -T api sh -c "du -sk /app/storage | cut -f1")
FREE=$(df -PB1 "$BACKUP" | awk 'NR==2 {print $4}')
test "$FREE" -gt "$((DB_SIZE + STORAGE_SIZE * 1024 + 1073741824))"
tar -C "$LIVE" --exclude='./.env' --exclude='./node_modules' --exclude='./storage' -czf "$BACKUP/code.tar.gz" .
PAUSED=1
docker compose stop -t 30 api
docker compose exec -T db pg_dump -U shanman -d shanman -Fc > "$BACKUP/postgres.dump"
docker compose exec -T db pg_restore --list < "$BACKUP/postgres.dump" >/dev/null
docker compose run --rm --no-deps --user root --entrypoint tar api -C /app/storage -czf - . > "$BACKUP/storage.tar.gz"
tar -tzf "$BACKUP/storage.tar.gz" >/dev/null
cd "$ROOT"
mv "$LIVE" "$PREVIOUS"
MOVED=1
mv "$STAGE" "$LIVE"
docker tag "$IMAGE" server-api
cd "$LIVE"
docker compose up -d --no-build --force-recreate api
READY=0
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8080/api/tutorials > "$WORK/public-tutorials.json"; then READY=1; break; fi
  sleep 2
done
test "$READY" = 1
CONTAINER=$(docker compose ps -q api)
docker cp "$SELFTEST" "$CONTAINER":/app/tutorial-selftest.mjs
docker compose exec -T -e PRODUCTION_CHECK_ONLY=1 api node /app/tutorial-selftest.mjs
for file in index.html admin.js admin.css tutorial-publisher.js tutorial-publisher.css; do
  curl -fsS "http://127.0.0.1:8080/admin/$file" -o "$WORK/served-$file"
  test "$(sha256sum "$WORK/served-$file" | cut -d' ' -f1)" = "$(sha256sum "public/admin/$file" | cut -d' ' -f1)"
done
docker compose exec -T db psql -U shanman -d shanman -Atc "SELECT filename FROM schema_migrations WHERE filename LIKE '01%' ORDER BY filename"
curl -fsS http://127.0.0.1:8080/health
trap - ERR INT TERM
echo "DEPLOY_TUTORIAL_20260905_OK backup=$BACKUP previous=$PREVIOUS artifact_sha=$EXPECTED"
