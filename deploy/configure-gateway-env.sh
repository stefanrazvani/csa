#!/usr/bin/env bash
set -euo pipefail

env_file="${1:-.env}"
touch "$env_file"
chmod 600 "$env_file"

if ! grep -q '^CSA_GATEWAY_SECRET=' "$env_file"; then
  printf 'CSA_GATEWAY_SECRET=%s\n' "$(openssl rand -hex 32)" >> "$env_file"
fi
if ! grep -q '^CSA_GATEWAY_ORIGIN=' "$env_file"; then
  printf 'CSA_GATEWAY_ORIGIN=http://192.168.177.68:18610\n' >> "$env_file"
fi
if ! grep -q '^CSA_GATEWAY_COOKIE_SECURE=' "$env_file"; then
  printf 'CSA_GATEWAY_COOKIE_SECURE=0\n' >> "$env_file"
fi
if ! grep -q '^CSA_GATEWAY_SESSION_HOURS=' "$env_file"; then
  printf 'CSA_GATEWAY_SESSION_HOURS=8\n' >> "$env_file"
fi
if ! grep -q '^CSA_TENANT_ADMIN_EMAILS=' "$env_file"; then
  printf 'CSA_TENANT_ADMIN_EMAILS=razvan.stefan.i@gmail.com\n' >> "$env_file"
fi
if ! grep -q '^CSA_PLATFORM_ADMIN_EMAILS=' "$env_file"; then
  printf 'CSA_PLATFORM_ADMIN_EMAILS=razvan.stefan.i@gmail.com\n' >> "$env_file"
fi
if ! grep -q '^CSA_CRAFT_ADMIN_GRADE_BYPASS=' "$env_file"; then
  printf 'CSA_CRAFT_ADMIN_GRADE_BYPASS=1\n' >> "$env_file"
fi

test "$(sed -n 's/^CSA_GATEWAY_SECRET=//p' "$env_file" | wc -c)" -ge 65
echo 'gateway-env:ok'
