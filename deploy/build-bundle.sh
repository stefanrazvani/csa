#!/usr/bin/env bash

set -eo pipefail

APP_DIR="${APP_DIR:-/var/meteor/csa}"
NEXT_DIR="${NEXT_DIR:-/var/meteor/csa-build.next}"

resolved_app="$(readlink -f "$APP_DIR")"
case "$resolved_app" in
  /var/meteor/csa|/var/meteor/csa.next) ;;
  *)
    echo "APP_DIR invalid: $APP_DIR" >&2
    exit 1
    ;;
esac

if [[ "$(readlink -m "$NEXT_DIR")" != "/var/meteor/csa-build.next" ]]; then
  echo "NEXT_DIR invalid: $NEXT_DIR" >&2
  exit 1
fi

cd "$APP_DIR"
meteor npm install

rm -rf -- "$NEXT_DIR"
meteor build "$NEXT_DIR" --directory --server-only

SERVER_DIR="$NEXT_DIR/bundle/programs/server"
chmod u+w "$SERVER_DIR/package.json"
cd "$SERVER_DIR"

npm install --omit=dev
npm pkg set overrides.tar=7.5.16
npm install --omit=dev --save-exact tar@7.5.16 underscore@1.13.8
# Buildurile se opresc pentru vulnerabilități high/critical. Nivelurile mai
# mici sunt raportate separat, fără a bloca promovarea unui bundle verificat.
npm audit --omit=dev --audit-level=high

echo "Bundle verificat: $NEXT_DIR/bundle"
