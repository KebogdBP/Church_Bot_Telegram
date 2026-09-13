#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${1:?Usage: scripts/restore-postgres.sh BACKUP.dump}"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$1"
