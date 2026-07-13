#!/bin/sh
set -eu

load_secret() {
  variable="$1"
  file_variable="${variable}_FILE"
  eval "file_path=\${$file_variable:-}"
  if [ -n "$file_path" ]; then
    value="$(cat "$file_path")"
    export "$variable=$value"
    unset "$file_variable"
  fi
}

load_secret MINIO_ACCESS_KEY
load_secret MINIO_SECRET_KEY
load_secret OPENSEARCH_PASSWORD
load_secret ARANGO_PASSWORD

exec gosu worker "$@"
