#!/bin/bash
# MemGuard Database Backup Script
# Usage: ./scripts/backup.sh
# Cron: 0 3 * * * cd /path/to/memguard && ./scripts/backup.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/memguard_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# Dump from Docker container
docker exec memguard-postgres-1 pg_dump -U memguard memguard | gzip > "$BACKUP_FILE"

FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: $BACKUP_FILE ($FILESIZE)"

# Remove old backups
DELETED=$(find "$BACKUP_DIR" -name "memguard_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "[$(date)] Cleaned up $DELETED old backup(s)"
fi

echo "[$(date)] Done. Active backups:"
ls -lh "$BACKUP_DIR"/memguard_*.sql.gz 2>/dev/null | tail -5
