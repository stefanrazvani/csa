#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
compose=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  compose=(docker-compose)
fi

required=(
  secrets/minio-root-user
  secrets/minio-root-password
  secrets/arangodb-root-password
  secrets/opensearch-admin-password
)
for secret in "${required[@]}"; do
  [[ -s "$secret" ]] || {
    echo "Lipsește $secret; rulați ./init-infrastructure.sh." >&2
    exit 1
  }
done

"${compose[@]}" up -d minio clamav arangodb opensearch

for service in minio clamav arangodb opensearch; do
  echo "Aștept serviciul $service..."
  for _ in {1..60}; do
    container_id="$("${compose[@]}" ps -q "$service")"
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
    [[ "$health" == "healthy" ]] && break
    [[ "$health" == "unhealthy" ]] && {
      echo "$service este unhealthy; verificați docker compose logs $service" >&2
      exit 1
    }
    sleep 5
  done
  [[ "${health:-}" == "healthy" ]] || {
    echo "Timeout la inițializarea $service" >&2
    exit 1
  }
done

# shellcheck disable=SC2016
"${compose[@]}" exec -T minio sh -ec '
  mc alias set csa http://127.0.0.1:9000 "$(cat /run/secrets/minio-root-user)" "$(cat /run/secrets/minio-root-password)" >/dev/null
  mc mb --ignore-existing csa/csa-documents >/dev/null
  mc version enable csa/csa-documents >/dev/null
'

# shellcheck disable=SC2016
"${compose[@]}" exec -T arangodb sh -ec '
  arangosh --server.endpoint tcp://127.0.0.1:8529 --server.username root --server.password "$(cat /run/secrets/arangodb-root-password)" --javascript.execute-string '\''if (db._databases().indexOf("csa") === -1) { db._createDatabase("csa"); }'\''
' >/dev/null

# shellcheck disable=SC2016
"${compose[@]}" exec -T opensearch bash -ec '
  auth="admin:$(cat /run/secrets/opensearch-admin-password)"
  curl --silent --fail --insecure --user "$auth" \
    -H "Content-Type: application/json" \
    -X PUT https://127.0.0.1:9200/_snapshot/csa_fs \
    -d '\''{"type":"fs","settings":{"location":"/usr/share/opensearch/snapshots","compress":true}}'\'' >/dev/null
  curl --silent --fail --insecure --user "$auth" \
    -H "Content-Type: application/json" \
    -X PUT https://127.0.0.1:9200/_index_template/csa_text_v1 \
    -d '\''{"index_patterns":["csa-text-*"],"template":{"mappings":{"dynamic":"strict","properties":{"eId":{"type":"keyword"},"workId":{"type":"keyword"},"versionId":{"type":"keyword"},"nodeId":{"type":"keyword"},"type":{"type":"keyword"},"minGrade":{"type":"byte"},"title":{"type":"text","analyzer":"romanian"},"text":{"type":"text","analyzer":"romanian"},"page":{"type":"integer"},"updatedAt":{"type":"date"}}}}}'\'' >/dev/null
'

"${compose[@]}" up -d content-worker
echo "content-services-init:ok"
