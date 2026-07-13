#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$deploy_dir"
compose=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  compose=(docker-compose)
fi

usage() {
  echo "Usage: $0 <backup-id> <mongo|minio|arangodb|opensearch|all> --confirm RESTORE_CSA" >&2
  exit 2
}

backup_id="${1:-}"
component="${2:-}"
[[ "${3:-}" == "--confirm" && "${4:-}" == "RESTORE_CSA" ]] || usage
[[ "$backup_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] || usage
[[ "$component" =~ ^(mongo|minio|arangodb|opensearch|all)$ ]] || usage

backup_root="${CSA_BACKUP_ROOT:-./backups}"
manifest="$backup_root/manifests/${backup_id}.manifest"
[[ -f "$manifest" ]] || {
  echo "Lipsește manifestul $manifest" >&2
  exit 1
}

manifest_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$manifest"
}

restore_mongo() {
  local archive
  local archive_entry
  archive_entry="$(manifest_value mongo_archive)"
  [[ "$archive_entry" == "mongo/${backup_id}.archive.gz" ]] || { echo "Manifest Mongo invalid." >&2; exit 1; }
  archive="$backup_root/$archive_entry"
  [[ -s "$archive" ]] || { echo "Lipsește $archive" >&2; exit 1; }
  local expected actual
  expected="$(manifest_value mongo_sha256)"
  actual="$(sha256sum "$archive" | awk '{print $1}')"
  [[ "$expected" == "$actual" ]] || { echo "Checksum Mongo invalid." >&2; exit 1; }
  local container_id
  container_id="$("${compose[@]}" ps -q mongo)"
  docker cp "$archive" "$container_id:/tmp/csa-restore-${backup_id}.archive.gz"
  "${compose[@]}" exec -T mongo bash -ec "
    mongorestore --host 127.0.0.1 --username \"\$MONGO_INITDB_ROOT_USERNAME\" --password \"\$MONGO_INITDB_ROOT_PASSWORD\" --authenticationDatabase admin --db csa --drop --archive=/tmp/csa-restore-${backup_id}.archive.gz --gzip
    rm -f /tmp/csa-restore-${backup_id}.archive.gz
  "
}

restore_minio() {
  local source_dir container_id
  source_dir="$backup_root/minio/${backup_id}"
  [[ -d "$source_dir" ]] || { echo "Lipsește $source_dir" >&2; exit 1; }
  container_id="$("${compose[@]}" ps -q minio)"
  "${compose[@]}" exec -T minio rm -rf "/tmp/csa-restore-${backup_id}"
  docker cp "$source_dir/." "$container_id:/tmp/csa-restore-${backup_id}"
  "${compose[@]}" exec -T minio sh -ec "
    test -d /tmp/csa-restore-${backup_id}
    mc alias set csa http://127.0.0.1:9000 \"\$(cat /run/secrets/minio-root-user)\" \"\$(cat /run/secrets/minio-root-password)\" >/dev/null
    mc mb --ignore-existing csa/csa-documents >/dev/null
    mc version enable csa/csa-documents >/dev/null
    mc mirror --overwrite --preserve /tmp/csa-restore-${backup_id} csa/csa-documents
    rm -rf /tmp/csa-restore-${backup_id}
  "
}

restore_arangodb() {
  local source_dir container_id
  source_dir="$backup_root/arango/${backup_id}"
  [[ -d "$source_dir" ]] || { echo "Lipsește $source_dir" >&2; exit 1; }
  container_id="$("${compose[@]}" ps -q arangodb)"
  "${compose[@]}" exec -T arangodb rm -rf "/tmp/csa-restore-${backup_id}"
  docker cp "$source_dir/." "$container_id:/tmp/csa-restore-${backup_id}"
  "${compose[@]}" exec -T arangodb sh -ec "
    test -d /tmp/csa-restore-${backup_id}
    arangorestore --server.endpoint tcp://127.0.0.1:8529 --server.username root --server.password \"\$(cat /run/secrets/arangodb-root-password)\" --server.database csa --create-database true --input-directory /tmp/csa-restore-${backup_id} --overwrite true
    rm -rf /tmp/csa-restore-${backup_id}
  "
}

restore_opensearch() {
  local snapshot
  snapshot="$(manifest_value opensearch_snapshot)"
  [[ "$snapshot" =~ ^csa-[a-z0-9.-]+$ ]] || { echo "Snapshot OpenSearch invalid în manifest." >&2; exit 1; }
  "${compose[@]}" exec -T opensearch bash -ec "
    auth=\"admin:\$(cat /run/secrets/opensearch-admin-password)\"
    existing=\"\$(curl --silent --fail --insecure --user \"\$auth\" 'https://127.0.0.1:9200/_cat/indices/csa-*?h=index' || true)\"
    test -z \"\$existing\" || { echo 'Există deja indexuri csa-*; restore OpenSearch este refuzat pentru a evita suprascrierea.' >&2; exit 1; }
    curl --silent --show-error --fail --insecure --user \"\$auth\" -H 'Content-Type: application/json' \\
      -X POST 'https://127.0.0.1:9200/_snapshot/csa_fs/${snapshot}/_restore?wait_for_completion=true' \\
      -d '{\"indices\":\"csa-*\",\"include_global_state\":false}'
  "
}

if [[ "$component" == "all" || "$component" == "mongo" ]]; then restore_mongo; fi
if [[ "$component" == "all" || "$component" == "minio" ]]; then restore_minio; fi
if [[ "$component" == "all" || "$component" == "arangodb" ]]; then restore_arangodb; fi
if [[ "$component" == "all" || "$component" == "opensearch" ]]; then restore_opensearch; fi

echo "restore:ok id=$backup_id component=$component"
