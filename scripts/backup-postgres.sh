#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
backup_dir="${BACKUP_DIR:-backups}"
mkdir -p "$backup_dir"
output="$backup_dir/telegram-church-bot-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$output"
printf '%s\n' "$output"
