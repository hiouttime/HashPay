#!/bin/bash

# HashPay 备份脚本

set -e

# 配置
BACKUP_DIR="./backups"
DB_FILE="./data/hashpay.db"
CONFIG_FILE="./config.yaml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}HashPay 备份工具${NC}"
echo "================================"

# 创建备份目录
if [ ! -d "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
fi

# 备份数据库
backup_database() {
    echo -e "${YELLOW}备份数据库...${NC}"
    
    if [ -f "$DB_FILE" ]; then
        sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/hashpay_${TIMESTAMP}.db'"
        echo -e "${GREEN}数据库备份完成${NC}"
    else
        echo -e "${YELLOW}数据库文件不存在${NC}"
    fi
}

# 备份配置
backup_config() {
    echo -e "${YELLOW}备份配置文件...${NC}"
    
    if [ -f "$CONFIG_FILE" ]; then
        cp "$CONFIG_FILE" "$BACKUP_DIR/config_${TIMESTAMP}.yaml"
        echo -e "${GREEN}配置文件备份完成${NC}"
    fi
}

# 清理旧备份
clean_old_backups() {
    echo -e "${YELLOW}清理旧备份...${NC}"
    
    # 保留最近30天的备份
    find "$BACKUP_DIR" -type f -mtime +30 -delete
    
    echo -e "${GREEN}清理完成${NC}"
}

# 压缩备份
compress_backup() {
    echo -e "${YELLOW}压缩备份文件...${NC}"
    
    cd "$BACKUP_DIR"
    tar -czf "backup_${TIMESTAMP}.tar.gz" \
        "hashpay_${TIMESTAMP}.db" \
        "config_${TIMESTAMP}.yaml" 2>/dev/null || true
    
    # 删除原始文件
    rm -f "hashpay_${TIMESTAMP}.db" "config_${TIMESTAMP}.yaml"
    
    cd - > /dev/null
    
    echo -e "${GREEN}备份压缩完成: backup_${TIMESTAMP}.tar.gz${NC}"
}

# 主函数
main() {
    backup_database
    backup_config
    compress_backup
    clean_old_backups
    
    echo ""
    echo -e "${GREEN}备份完成！${NC}"
    echo "备份文件: $BACKUP_DIR/backup_${TIMESTAMP}.tar.gz"
}

main