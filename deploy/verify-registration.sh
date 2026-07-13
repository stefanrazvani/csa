#!/usr/bin/env bash
set -euo pipefail

exec mongosh --quiet \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  /tmp/verify-registration.js
