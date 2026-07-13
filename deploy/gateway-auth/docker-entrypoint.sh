#!/bin/sh
set -eu

if [ -n "${MINIO_ACCESS_KEY_FILE:-}" ]; then
  MINIO_ACCESS_KEY="$(cat "$MINIO_ACCESS_KEY_FILE")"
  export MINIO_ACCESS_KEY
  unset MINIO_ACCESS_KEY_FILE
fi
if [ -n "${MINIO_SECRET_KEY_FILE:-}" ]; then
  MINIO_SECRET_KEY="$(cat "$MINIO_SECRET_KEY_FILE")"
  export MINIO_SECRET_KEY
  unset MINIO_SECRET_KEY_FILE
fi

exec su-exec node "$@"
