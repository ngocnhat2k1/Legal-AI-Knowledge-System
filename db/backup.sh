#!/usr/bin/env bash
# Nightly backup of the two things that cannot be regenerated from git:
#   - lookup_confirmation  (staff HS rulings, verify-on-use)   — lost once with the old VPS
#   - legal_document verification state (who vouched for which document)
# NOT backed up, on purpose: conversation, conversation_turn, decision_log — they carry
# third-party personal data and live 30 days by rule (business-rules.md R14).
# Needs an rclone remote named `gdrive` for the user that runs it (cron: root).
set -euo pipefail

# Cron gives PATH=/usr/bin:/bin and an arbitrary cwd; standalone docker-compose and rclone
# usually live in /usr/local/bin. Dumps hold staff names and rulings: owner-only files.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
umask 077
cd "$(dirname "$0")/.."

# Some hosts only have standalone docker-compose v2.15.1, not the `docker compose` plugin.
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  COMPOSE=(docker-compose)
fi

if ! command -v rclone >/dev/null 2>&1; then
  echo "backup: rclone is not installed" >&2
  exit 1
fi
if ! rclone listremotes | grep -qx 'gdrive:'; then
  echo "backup: rclone remote 'gdrive' is not configured" >&2
  exit 1
fi

STAMP=$(date +%F)
# Everything (dumps and archive) lives under WORK, which the trap removes on every exit path.
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir "$WORK/dump"

"${COMPOSE[@]}" exec -T db pg_dump -U app -d customs_assistant --data-only -t lookup_confirmation \
  > "$WORK/dump/lookup_confirmation.sql"
"${COMPOSE[@]}" exec -T db psql -U app -d customs_assistant -At -c \
  "COPY (SELECT number, verification, verified_by FROM legal_document ORDER BY number) TO STDOUT WITH CSV HEADER" \
  > "$WORK/dump/legal_document_verification.csv"

tar -czf "$WORK/customs-backup-$STAMP.tgz" -C "$WORK/dump" .
rclone copy "$WORK/customs-backup-$STAMP.tgz" "gdrive:Legal-AI-Backup/"
echo "backup $STAMP ok"
