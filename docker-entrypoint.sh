#!/bin/sh
set -eu

export PORT="${APP_PORT:-8088}"
export HOSTNAME="${APP_HOST:-0.0.0.0}"

mkdir -p "${UPLOAD_PATH:-/app/uploads}" "${CONTRACTS_PATH:-/app/contracts}"
mkdir -p "${STARTUP_LOG_DIR:-/app/logs}"

LOG_FILE="${STARTUP_LOG_DIR:-/app/logs}/startup.log"
{
  echo "---- $(date -u '+%Y-%m-%dT%H:%M:%SZ') startup ----"
  echo "running prisma db push"
  npx prisma db push --skip-generate
  echo "running seed"
  node prisma/seed.js
  echo "starting app: $*"
} >> "$LOG_FILE" 2>&1

exec "$@" >> "$LOG_FILE" 2>&1
