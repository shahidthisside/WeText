#!/bin/bash
# Nightly backup of the database (photos are stored in it too). Keeps 7 days.
# Safe while the server is running (sqlite3 .backup takes a consistent snapshot).
set -euo pipefail
DEST=/var/backups/wetext
STAMP=$(date +%F)
mkdir -p "$DEST"
sqlite3 /var/lib/wetext/wetext.db ".backup '$DEST/wetext-$STAMP.db'"
gzip -f "$DEST/wetext-$STAMP.db"
find "$DEST" -type f -mtime +7 -delete
