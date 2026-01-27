#!/bin/bash

echo "======================================"
echo "  Tracker Rebuild Script"
echo "======================================"
echo ""

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

./backup-db.sh

# データディレクトリの確認と作成
echo -e "${YELLOW}[1/6] Checking data directory...${NC}"
if [ ! -d "./data" ]; then
    echo "Creating ./data directory..."
    mkdir -p ./data
    echo -e "${GREEN}✓ Data directory created${NC}"
else
    echo -e "${GREEN}✓ Data directory exists${NC}"
fi
echo ""

# MongoDBデータの存在確認
if [ -d "./data" ] && [ "$(ls -A ./data)" ]; then
    echo -e "${YELLOW}⚠️  Existing MongoDB data found in ./data${NC}"
    echo "This data will be preserved during rebuild."
    echo ""
    read -p "Continue with rebuild? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Rebuild cancelled."
        exit 0
    fi
fi

# アップロードディレクトリの確認
echo -e "${YELLOW}[2/6] Checking uploads directory...${NC}"
if [ ! -d "./backend/public/uploads" ]; then
    echo "Creating uploads directory..."
    mkdir -p ./backend/public/uploads
    echo -e "${GREEN}✓ Uploads directory created${NC}"
else
    echo -e "${GREEN}✓ Uploads directory exists${NC}"
fi
echo ""

# exportsディレクトリの確認
echo -e "${YELLOW}[3/6] Checking exports directory...${NC}"
if [ ! -d "./backend/exports" ]; then
    echo "Creating exports directory..."
    mkdir -p ./backend/exports
    echo -e "${GREEN}✓ Exports directory created${NC}"
else
    echo -e "${GREEN}✓ Exports directory exists${NC}"
fi
echo ""

# 既存のコンテナを停止
echo -e "${YELLOW}[4/6] Stopping existing containers...${NC}"
docker compose down -v --remove-orphans
echo -e "${GREEN}✓ Containers stopped${NC}"
echo ""

# イメージを再ビルド
echo -e "${YELLOW}[5/6] Building Docker images...${NC}"
docker compose build --no-cache
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
echo ""

# コンテナを起動
echo -e "${YELLOW}[6/6] Starting containers...${NC}"
docker compose up -d
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Containers started${NC}"
else
    echo -e "${RED}✗ Failed to start containers${NC}"
    exit 1
fi
echo ""

# 起動待機
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 5

# ステータス確認
echo ""
echo "======================================"
echo "  Container Status"
echo "======================================"
docker compose ps
echo ""