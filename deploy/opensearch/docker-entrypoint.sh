#!/bin/bash
set -euo pipefail

export OPENSEARCH_INITIAL_ADMIN_PASSWORD="$(cat /run/secrets/opensearch-admin-password)"
chown -R 1000:1000 /usr/share/opensearch/data /usr/share/opensearch/snapshots
exec setpriv --reuid=1000 --regid=1000 --init-groups /usr/share/opensearch/opensearch-docker-entrypoint.sh "$@"
