#!/bin/bash

# MongoDBバックアップスクリプト

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="mongo_backup_${TIMESTAMP}"

echo "======================================"
echo "  MongoDB Backup Script"
echo "======================================"
echo ""

# バックアップディレクトリの作成
if [ ! -d "$BACKUP_DIR" ]; then
    echo "Creating backup directory..."
    mkdir -p "$BACKUP_DIR"
fi

echo "Creating backup: $BACKUP_NAME"
echo ""

# MongoDBコンテナからデータをダンプ
docker compose exec -T mongodb mongodump \
    --username=admin \
    --password=changeme \
    --authenticationDatabase=admin \
    --db=trackerDB \
    --out=/tmp/backup

# バックアップファイルをホストにコピー
docker compose exec -T mongodb tar czf /tmp/${BACKUP_NAME}.tar.gz -C /tmp/backup .
docker compose cp mongodb:/tmp/${BACKUP_NAME}.tar.gz ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz

if [ $? -eq 0 ]; then
    echo "✓ Backup created successfully!"
    echo "Location: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
    
    # クリーンアップ
    docker compose exec -T mongodb rm -rf /tmp/backup /tmp/${BACKUP_NAME}.tar.gz
    
    # 古いバックアップの削除（7日以上前のものを削除）
    find ${BACKUP_DIR} -name "mongo_backup_*.tar.gz" -mtime +7 -delete
    
    echo ""
    echo "Available backups:"
    ls -lh ${BACKUP_DIR}/mongo_backup_*.tar.gz 2>/dev/null || echo "No backups found"
else
    echo "✗ Backup failed!"
    exit 1
fi
