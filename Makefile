.PHONY: build run test clean sqlc migrate dev miniapp-build miniapp-dev

# 构建项目
build: miniapp-build
	go build -o hashpay .

# 运行项目
run: miniapp-build
	go run .

# 开发模式
dev: miniapp-build
	go run .

# 运行测试
test:
	go test ./...

# 清理构建文件
clean:
	rm -f hashpay
	rm -rf ./data/*.db

# 生成 sqlc 代码
sqlc:
	sqlc generate

# 执行数据库迁移
migrate:
	@echo "Applying database migrations..."
	@sqlite3 ./data/hashpay.db < internal/database/migrations/init.sql

# 安装依赖
deps:
	go mod download
	go mod tidy

# 构建 Mini App
miniapp-dev:
	cd miniapp && npm run dev

miniapp-build:
	cd miniapp && npm run build

# 跨平台编译
build-linux:
	GOOS=linux GOARCH=amd64 go build -o hashpay-linux-amd64 .

build-mac:
	GOOS=darwin GOARCH=amd64 go build -o hashpay-darwin-amd64 .
	GOOS=darwin GOARCH=arm64 go build -o hashpay-darwin-arm64 .

build-windows:
	GOOS=windows GOARCH=amd64 go build -o hashpay-windows-amd64.exe .

build-all: build-linux build-mac build-windows

# 帮助信息
help:
	@echo "HashPay Makefile 命令:"
	@echo "  make build       - 构建项目"
	@echo "  make run         - 运行项目"
	@echo "  make dev         - 开发模式运行"
	@echo "  make test        - 运行测试"
	@echo "  make clean       - 清理构建文件"
	@echo "  make sqlc        - 生成 sqlc 代码"
	@echo "  make migrate     - 执行数据库迁移"
	@echo "  make deps        - 安装依赖"
	@echo "  make build-all   - 跨平台编译"
