# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

HashPay 是一个以 Telegram Bot 为核心的支付处理系统，通过 Telegram Bot + Mini App 提供友好的后台交互界面。主要处理来自区块链交易、交易所以及支持 API 对接的钱包的支付。

### 对外提供的服务
1. **Web 页面** - 显示收款信息，引导用户选择支付方式，展示支付结果
2. **Telegram Bot** - 用于简单命令交互和支付通知
3. **Telegram Mini App** - 完整的后台管理与控制面板

## 技术栈

- **后端**: Go 1.25.0
- **Web框架**: Fiber v3 (RESTful API 和 Web 页面)
- **Bot框架**: Telebot v4 (Telegram Bot 交互)
- **数据库**: SQLite3 / MySQL (可配置)
- **Mini App**: React + Vite (在 miniapp/ 目录)
- **数据库代码生成**: sqlc
- **支付集成**: 区块链支付（当前实现：TRON、BSC；其余链处于规划阶段）

## 项目结构

```
/main.go                 - 精简入口，调用 internal/app 启动服务
/internal/
  ├── app/               - 应用生命周期管理、初始化流程、配置读写
  ├── api/               - HTTP API 服务端点和 Web 页面
  ├── bot/               - Telegram Bot 适配层
  ├── command/           - 细分的命令处理器（/start、/help 等）
  ├── database/          - 数据库访问与实体封装
  ├── payment/           - 支付处理逻辑（当前实现 Tron/BSC 链）
  ├── service/           - 业务服务层（占位，含订单/统计等逻辑）
  ├── middleware/        - HTTP 中间件
  └── utils/             - 工具函数
/miniapp/                - React + Vite Mini App 前端
/web/                    - Web 收款页面与静态资源
```

## 常用开发命令

```bash
# 构建和运行
make build              # 构建可执行文件
make run                # 运行项目 (go run .)
make dev                # 开发模式运行

# 测试
make test               # 运行所有测试

# 数据库相关
make sqlc               # 生成 sqlc 代码
make migrate            # 执行数据库迁移

# 依赖管理
make deps               # 安装和整理依赖

# Mini App 开发
make miniapp-dev        # 启动前端开发服务器
make miniapp-build      # 构建前端生产版本

# 跨平台编译
make build-all          # 构建所有平台版本
```

## 核心架构

### 1. 初始化流程 (internal/app)
- 首次运行时通过 PIN 码验证管理员身份
- 通过 Mini App 配置数据库和系统参数
- 自动创建数据库表和初始配置
- 配置完成后自动启动服务

### 2. 数据库层 (internal/database/)
- 封装了 SQL 操作，支持 SQLite 和 MySQL 双数据库
- 使用 sqlc 生成类型安全的查询代码（计划中）
- 配置和状态持久化存储

### 3. 支付处理核心 (internal/payment/)
- **区块链支持**: 现成实现包括 Tron 与 BSC，其他链条在规划或占位阶段
- **交易调度**: 利用 `APIScheduler` 轮询链上交易状态
- **扩展点**: exchange、wallet 相关文件为占位实现，补充时需完善

### 4. Telegram 集成
- **Bot 服务** (internal/bot/): 命令处理、用户交互、支付通知
- **Mini App**: 完整的管理后台，包括订单管理、统计分析、系统配置
- **用户系统**: 权限控制、管理员验证

### 5. Web 服务 (internal/api/)
- **收款页面**: 用户友好的支付界面
- **RESTful API**: 对外提供支付接口
- **Mini App 后端**: 管理面板的数据接口
- **中间件支持**: 认证、日志、错误处理

## 数据库迁移

迁移文件位于：
- `/internal/database/migrations/init.sql`（通过 `internal/database` 包嵌入，可直接执行）

## 配置文件格式

系统配置存储在 `config.yaml`：
```yaml
bot:
  token: "telegram_bot_token"
database:
  type: "sqlite" # 或 "mysql"
  sqlite:
    path: "./data/hashpay.db"
system:
  currency: "CNY"
  timeout: 1800
  fast_confirm: true
  rate_adjust: 0.00
admin:
  tg_id: 123456789
```

## 注意事项

1. 入口文件保持精简，请将业务初始化放在 `internal/app` 内
2. SQLite 驱动通过 `internal/app/config.go` 中的匿名导入注册
3. Bot 命令拆分在 `internal/command` 下，新增命令时按文件夹拆分
4. 提交前请确认未将真实凭据写入 `config.yaml`，建议改用 `config.yaml.example`
