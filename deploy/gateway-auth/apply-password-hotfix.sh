#!/usr/bin/env bash
set -Eeuo pipefail
export COMPOSE_ANSI=never COMPOSE_PROGRESS=plain BUILDKIT_PROGRESS=plain
# Run from the reviewed hotfix directory; changes only gateway-auth.
artifact=$(cd -- "$(dirname -- "$0")" && pwd)
deploy=/home/urgentit/csa-setup/deploy
test "$(id -u)" = 0 || { echo 'Run this script with sudo.' >&2; exit 1; }
exec 9>/var/lock/csa-gateway-auth-hotfix.lock
flock -n 9 || { echo 'Another auth update is running.' >&2; exit 1; }
cd "$artifact"
sha256sum -c SHA256SUMS
cd "$deploy"
compose() {
  if docker compose version >/dev/null 2>&1; then docker compose "$@";
  else docker-compose "$@"; fi
}
printf '%s  %s\n' df31f16c897f609b4955c0a91e8f7f508c421e4b8f146a98e8458aabe64de3a5 gateway-auth/server.js 9d2e388930e88a7b5b08c9d9919bd39ced04ccce9e6200d20248918b35fb271e gateway-auth/Dockerfile | sha256sum -c -
container=$(compose ps -q gateway-auth)
test -n "$container"
previous=$(docker inspect --format '{{.Image}}' "$container")
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/home/urgentit/csa-setup/backups/auth-password-$stamp
mkdir -m 700 "$backup"
cp -a gateway-auth "$backup/source"
docker tag "$previous" "csa/gateway-auth:rollback-$stamp"
rollback() {
  echo "Auth update failed; restoring $backup" >&2
  cp -a "$backup/source/." gateway-auth/
  docker tag "$previous" csa/gateway-auth:1.0.0
  compose up -d --no-deps --no-build gateway-auth
  compose exec -T gateway nginx -s reload
}
trap 'echo "Failed at line $LINENO: $BASH_COMMAND" >&2; rollback' ERR
install -m 644 "$artifact/server.js" "$artifact/Dockerfile" "$artifact/password-utils.js" gateway-auth/
compose build gateway-auth
compose up -d --no-deps --no-build gateway-auth
container=$(compose ps -q gateway-auth)
healthy=false
for attempt in $(seq 1 36); do
  if test "$(docker inspect --format '{{.State.Health.Status}}' "$container")" = healthy; then healthy=true; break; fi
  sleep 5
done
test "$healthy" = true
compose exec -T gateway-auth node --input-type=module -e 'import { hashMeteorPassword, verifyGatewayPassword } from "./password-utils.js"; const p="ephemeral-deployment-check"; const h=await hashMeteorPassword(p); if (!(await verifyGatewayPassword(p,h)).valid || (await verifyGatewayPassword("wrong",h)).valid) process.exit(1);'
compose exec -T gateway nginx -s reload
curl --fail --silent --output /dev/null http://192.168.177.68:18610/
trap - ERR
printf 'Auth password hotfix healthy. Backup: %s\n' "$backup"
