#!/bin/bash

# MongoDBリストアスクリプト

BACKUP_DIR="./backups"

echo "======================================"
echo "  MongoDB Restore Script"
echo "======================================"
echo ""

# バックアップファイル一覧の表示
echo "Available backups:"
ls -lh ${BACKUP_DIR}/mongo_backup_*.tar.gz 2>/dev/null

if [ $? -ne 0 ]; then
    echo "No backups found in ${BACKUP_DIR}"
    exit 1
fi

echo ""
read -p "Enter backup filename (without path): " BACKUP_FILE

if [ ! -f "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
    echo "Backup file not found: ${BACKUP_DIR}/${BACKUP_FILE}"
    exit 1
fi

echo ""
echo "⚠️  WARNING: This will replace all current data!"
read -p "Are you sure you want to restore? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo ""
echo "Restoring from: ${BACKUP_FILE}"

# バックアップをコンテナにコピー
docker compose cp ${BACKUP_DIR}/${BACKUP_FILE} mongodb:/tmp/${BACKUP_FILE}

# 展開してリストア
docker compose exec -T mongodb bash -c "
    cd /tmp && \
    tar xzf ${BACKUP_FILE} && \
    mongorestore \
        --username=admin \
        --password=changeme \
        --authenticationDatabase=admin \
        --db=trackerDB \
        --drop \
        /tmp/trackerDB && \
    rm -rf /tmp/trackerDB /tmp/${BACKUP_FILE}
"

if [ $? -eq 0 ]; then
    echo "✓ Restore completed successfully!"
else
    echo "✗ Restore failed!"
    exit 1
fi
