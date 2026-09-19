#!/usr/bin/env bash
set -Eeuo pipefail
test "$(id -u)" = 0
artifact=/home/urgentit/csa-setup/releases/auth-password-hotfix/gateway-csp-compatible.conf
config=/home/urgentit/csa-setup/deploy/gateway/nginx.conf
backup=/home/urgentit/csa-setup/backups/gateway-csp-$(date -u +%Y%m%dT%H%M%SZ).conf
printf '%s  %s\n' d6e41db954a7a9b6d681b340fb2dbfe2e0472def9068c416c9450f7af1b21c72 "$config" | sha256sum -c -
cp -p "$config" "$backup"
rollback() { cat "$backup" > "$config"; docker exec csa-gateway-1 nginx -t && docker exec csa-gateway-1 nginx -s reload; }
trap rollback ERR
# Preserve the inode used by the container's read-only bind mount.
cat "$artifact" > "$config"
docker exec csa-gateway-1 nginx -t
docker exec csa-gateway-1 nginx -s reload
trap - ERR
printf 'CSP hotfix applied. Backup: %s\n' "$backup"
