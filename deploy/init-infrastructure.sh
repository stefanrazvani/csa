#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

apply_sysctl=0
if [[ "${1:-}" == "--apply-sysctl" ]]; then
  apply_sysctl=1
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--apply-sysctl]" >&2
  exit 2
fi

for binary in docker openssl; do
  command -v "$binary" >/dev/null 2>&1 || {
    echo "Lipsește comanda necesară: $binary" >&2
    exit 1
  }
done

volumes=(
  csa_mongo_data
  csa_mongo_config
  csa_meteor_data
  csa_meteor_home
  csa_minio_data
  csa_arangodb_data
  csa_opensearch_data
  csa_search_snapshots
  csa_clamav_signatures
)

for volume in "${volumes[@]}"; do
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    docker volume create \
      --label "ro.via-nova.project=csa" \
      --label "ro.via-nova.environment=${CSA_ENVIRONMENT:-production}" \
      --label "ro.via-nova.persistence=required" \
      "$volume" >/dev/null
    echo "Creat volum: $volume"
  else
    echo "Volum existent, păstrat: $volume"
  fi
done

install -d -m 700 secrets
install -d -m 700 \
  "${CSA_BACKUP_ROOT:-./backups}/mongo" \
  "${CSA_BACKUP_ROOT:-./backups}/minio" \
  "${CSA_BACKUP_ROOT:-./backups}/arango" \
  "${CSA_BACKUP_ROOT:-./backups}/manifests"

create_secret() {
  local destination="$1"
  local generator="$2"
  if [[ ! -s "$destination" ]]; then
    umask 077
    eval "$generator" > "$destination"
    echo "Creat secret: $destination"
  else
    echo "Secret existent, păstrat: $destination"
  fi
  chmod 600 "$destination"
}

create_secret secrets/mongo-keyfile "openssl rand -base64 756 | tr -d '\\n'"
create_secret secrets/minio-root-user "printf '%s\\n' csa_minio_admin"
create_secret secrets/minio-root-password "printf 'Csa!%s\\n' \"\$(openssl rand -hex 30)\""
create_secret secrets/arangodb-root-password "printf 'Csa!%s\\n' \"\$(openssl rand -hex 30)\""
create_secret secrets/opensearch-admin-password "printf 'Csa!%s\\n' \"\$(openssl rand -hex 30)\""

current_map_count="$(sysctl -n vm.max_map_count 2>/dev/null || printf '0')"
if (( current_map_count < 262144 )); then
  if (( apply_sysctl == 1 )); then
    if (( EUID != 0 )); then
      echo "--apply-sysctl trebuie rulat cu sudo/root." >&2
      exit 1
    fi
    printf 'vm.max_map_count=262144\n' > /etc/sysctl.d/99-csa-opensearch.conf
    sysctl --system >/dev/null
    echo "Aplicat vm.max_map_count=262144"
  else
    echo "ATENȚIE: vm.max_map_count=$current_map_count; înainte de OpenSearch rulați sudo $0 --apply-sysctl" >&2
  fi
fi

if [[ ! -f .env ]]; then
  echo "ATENȚIE: lipsește .env; copiați .env.example și înlocuiți valorile replace_me." >&2
fi
if [[ ! -f secrets/mail.env ]]; then
  echo "ATENȚIE: lipsește secrets/mail.env; porniți de la secrets/mail.env.example." >&2
fi

echo "infrastructure-init:ok"
