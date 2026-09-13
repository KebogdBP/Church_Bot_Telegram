#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
backup_file="${1:-${BACKUP_FILE:-}}"
: "${backup_file:?Usage: scripts/restore-postgres.sh BACKUP.dump}"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$backup_file"
