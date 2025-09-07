#!/bin/bash

# HashPay 部署脚本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}HashPay 部署脚本${NC}"
echo "================================"

# 检查依赖
check_dependencies() {
    echo -e "${YELLOW}检查依赖...${NC}"
    
    if ! command -v go &> /dev/null; then
        echo -e "${RED}Error: Go 未安装${NC}"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js 未安装${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}依赖检查通过${NC}"
}

# 构建后端
build_backend() {
    echo -e "${YELLOW}构建后端...${NC}"
    
    go mod download
    go build -o hashpay cmd/main.go
    
    echo -e "${GREEN}后端构建完成${NC}"
}

# 构建前端
build_frontend() {
    echo -e "${YELLOW}构建 Mini App...${NC}"
    
    cd miniapp
    npm install
    npm run build
    cd ..
    
    echo -e "${GREEN}Mini App 构建完成${NC}"
}

# 初始化数据库
init_database() {
    echo -e "${YELLOW}初始化数据库...${NC}"
    
    if [ ! -d "data" ]; then
        mkdir -p data
    fi
    
    if [ ! -f "data/hashpay.db" ]; then
        sqlite3 data/hashpay.db < internal/database/migrations/001_init.sql
        echo -e "${GREEN}数据库初始化完成${NC}"
    else
        echo -e "${YELLOW}数据库已存在，跳过初始化${NC}"
    fi
}

# 创建配置文件
create_config() {
    if [ ! -f "config.yaml" ]; then
        echo -e "${YELLOW}创建配置文件...${NC}"
        cp config.yaml.example config.yaml
        echo -e "${GREEN}配置文件已创建，请编辑 config.yaml${NC}"
    fi
}

# 创建 systemd 服务
create_service() {
    echo -e "${YELLOW}创建系统服务...${NC}"
    
    cat > /tmp/hashpay.service << EOF
[Unit]
Description=HashPay Payment System
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(pwd)/hashpay
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    sudo mv /tmp/hashpay.service /etc/systemd/system/
    sudo systemctl daemon-reload
    
    echo -e "${GREEN}系统服务创建完成${NC}"
    echo -e "使用以下命令管理服务："
    echo -e "  sudo systemctl start hashpay   # 启动服务"
    echo -e "  sudo systemctl stop hashpay    # 停止服务"
    echo -e "  sudo systemctl status hashpay  # 查看状态"
    echo -e "  sudo systemctl enable hashpay  # 开机自启"
}

# 主函数
main() {
    check_dependencies
    build_backend
    build_frontend
    init_database
    create_config
    
    echo ""
    echo -e "${GREEN}部署完成！${NC}"
    echo ""
    echo "下一步："
    echo "1. 编辑 config.yaml 配置文件"
    echo "2. 运行 ./hashpay 启动服务"
    echo ""
    
    read -p "是否创建系统服务？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        create_service
    fi
}

main