#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$deploy_dir"
compose=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  compose=(docker-compose)
fi

backup_id="${1:-$(date -u +%Y%m%dT%H%M%SZ)}"
[[ "$backup_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] || {
  echo "ID de backup invalid." >&2
  exit 2
}

backup_root="${CSA_BACKUP_ROOT:-./backups}"
install -d -m 700 "$backup_root/mongo" "$backup_root/minio" "$backup_root/arango" "$backup_root/manifests"

for service in mongo minio arangodb opensearch; do
  container_id="$("${compose[@]}" ps -q "$service")"
  [[ -n "$container_id" ]] || {
    echo "Serviciul $service nu rulează." >&2
    exit 1
  }
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
  [[ "$health" == "healthy" ]] || {
    echo "Serviciul $service nu este healthy ($health)." >&2
    exit 1
  }
done

echo "MongoDB..."
mongo_container="$("${compose[@]}" ps -q mongo)"
"${compose[@]}" exec -T mongo bash -ec "
  umask 077
  mongodump --host 127.0.0.1 --username \"\$MONGO_INITDB_ROOT_USERNAME\" --password \"\$MONGO_INITDB_ROOT_PASSWORD\" --authenticationDatabase admin --db csa --archive=/tmp/${backup_id}.archive.gz --gzip
"
docker cp "$mongo_container:/tmp/${backup_id}.archive.gz" "$backup_root/mongo/${backup_id}.archive.gz"
"${compose[@]}" exec -T mongo rm -f "/tmp/${backup_id}.archive.gz"

echo "MinIO (copie logică a versiunii curente a obiectelor)..."
minio_container="$("${compose[@]}" ps -q minio)"
"${compose[@]}" exec -T minio sh -ec "
  umask 077
  rm -rf /tmp/csa-backup-${backup_id}
  mkdir -p /tmp/csa-backup-${backup_id}
  mc alias set csa http://127.0.0.1:9000 \"\$(cat /run/secrets/minio-root-user)\" \"\$(cat /run/secrets/minio-root-password)\" >/dev/null
  mc mirror --overwrite --preserve csa/csa-documents /tmp/csa-backup-${backup_id}
"
install -d -m 700 "$backup_root/minio/${backup_id}"
docker cp "$minio_container:/tmp/csa-backup-${backup_id}/." "$backup_root/minio/${backup_id}"
"${compose[@]}" exec -T minio rm -rf "/tmp/csa-backup-${backup_id}"

echo "ArangoDB..."
arango_container="$("${compose[@]}" ps -q arangodb)"
"${compose[@]}" exec -T arangodb sh -ec "
  umask 077
  rm -rf /tmp/csa-backup-${backup_id}
  arangodump --server.endpoint tcp://127.0.0.1:8529 --server.username root --server.password \"\$(cat /run/secrets/arangodb-root-password)\" --server.database csa --output-directory /tmp/csa-backup-${backup_id} --overwrite true
"
install -d -m 700 "$backup_root/arango/${backup_id}"
docker cp "$arango_container:/tmp/csa-backup-${backup_id}/." "$backup_root/arango/${backup_id}"
"${compose[@]}" exec -T arangodb rm -rf "/tmp/csa-backup-${backup_id}"

echo "OpenSearch snapshot..."
snapshot_name="csa-${backup_id,,}"
snapshot_name="${snapshot_name//_/-}"
"${compose[@]}" exec -T opensearch bash -ec "
  auth=\"admin:\$(cat /run/secrets/opensearch-admin-password)\"
  curl --silent --show-error --fail --insecure --user \"\$auth\" -H 'Content-Type: application/json' \\
    -X PUT 'https://127.0.0.1:9200/_snapshot/csa_fs/${snapshot_name}?wait_for_completion=true' \\
    -d '{\"indices\":\"csa-*\",\"ignore_unavailable\":true,\"include_global_state\":false}'
" > "$backup_root/manifests/${backup_id}.opensearch.json"

mongo_file="$backup_root/mongo/${backup_id}.archive.gz"
[[ -s "$mongo_file" ]] || {
  echo "Backupul Mongo nu a fost creat." >&2
  exit 1
}
mongo_sha="$(sha256sum "$mongo_file" | awk '{print $1}')"
cat > "$backup_root/manifests/${backup_id}.manifest" <<EOF
backup_id=${backup_id}
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mongo_archive=mongo/${backup_id}.archive.gz
mongo_sha256=${mongo_sha}
minio_current=minio/${backup_id}
arangodb_dump=arango/${backup_id}
opensearch_repository=csa_fs
opensearch_snapshot=${snapshot_name}
EOF
chmod 600 "$backup_root/manifests/${backup_id}.manifest" "$backup_root/manifests/${backup_id}.opensearch.json"

echo "backup:ok id=$backup_id"
