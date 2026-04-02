# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

HashPay 是一个以 Telegram Bot 为核心的加密货币支付网关系统，通过 Telegram Bot + Mini App 提供友好的管理界面。

### 核心功能
1. **Web 支付页面** - 显示收款信息，引导用户选择支付方式，展示支付结果
2. **Telegram Bot** - 命令交互和支付通知
3. **Telegram Mini App** - 完整的后台管理面板
4. **区块链扫描器** - 自动确认链上支付

## 技术栈

- **后端**: Go 1.25.0 + Fiber v3
- **Bot 框架**: Telebot v4
- **数据库**: SQLite / MySQL
- **前端**: React + Vite
- **区块链**: TRON、BSC（可扩展）

## 项目结构

```
/main.go                    - 精简入口
/internal/
  ├── app/                  - 应用启动与初始化
  │   ├── bootstrap.go      - 启动流程
  │   └── setup.go          - 首次运行设置
  ├── config/               - 配置管理
  │   └── config.go         - 加载/保存 config.yaml
  ├── server/               - HTTP 服务
  │   ├── server.go         - Fiber 实例
  │   ├── routes.go         - 路由注册
  │   └── middleware.go     - 中间件
  ├── handler/              - HTTP 处理器
  │   ├── handler.go        - 聚合入口
  │   ├── health.go         - 健康检查
  │   ├── order.go          - 订单 API
  │   ├── payment.go        - 支付 API
  │   ├── admin.go          - 管理 API
  │   └── init.go           - 初始化 API
  ├── service/              - 业务逻辑层
  │   ├── order.go          - 订单服务
  │   ├── payment.go        - 支付方式服务
  │   ├── rate.go           - 汇率服务
  │   ├── stats.go          - 统计服务
  │   ├── user.go           - 用户服务
  │   └── config.go         - 配置服务
  ├── repository/           - 数据访问层
  │   ├── db.go             - 数据库连接
  │   ├── order.go          - 订单表
  │   ├── payment.go        - 支付方式表
  │   ├── user.go           - 用户表
  │   ├── config.go         - 配置表
  │   ├── transaction.go    - 交易记录表
  │   ├── site.go           - 站点表
  │   └── migrations/       - SQL 迁移
  ├── model/                - 数据模型
  │   ├── order.go
  │   ├── payment.go
  │   ├── user.go
  │   ├── transaction.go
  │   └── site.go
  ├── scanner/              - 区块链扫描器
  │   ├── scanner.go        - 调度器
  │   ├── chain.go          - Chain 接口定义
  │   ├── tron.go           - TRON 实现
  │   └── bsc.go            - BSC 实现
  ├── bot/                  - Telegram Bot
  │   ├── bot.go            - Bot 实例
  │   └── handler.go        - 命令处理
  └── pkg/                  - 工具包
      └── log/              - 日志
/web/                       - 前端（React + Vite）
  ├── src/
  │   ├── App.jsx
  │   ├── main.jsx
  │   ├── pages/            - 页面组件
  │   ├── services/         - API 封装
  │   └── styles/           - 样式
  └── vite.config.js
```

## 常用开发命令

```bash
# 构建和运行
make build              # 构建可执行文件
make run                # 运行项目

# 前端开发
cd web && npm install   # 安装前端依赖
cd web && npm run dev   # 启动前端开发服务器
cd web && npm run build # 构建前端生产版本
```

## 核心架构

### 分层架构
```
Handler → Service → Repository → Database
```

- **Handler**: 处理 HTTP 请求，参数校验，返回响应
- **Service**: 业务逻辑，组合多个 Repository
- **Repository**: 数据访问，纯 CRUD 操作
- **Model**: 数据模型定义

### 扫描器设计
- `ChainAPI` 接口定义链交互规范
- 具体链（TRON、BSC）实现该接口
- `Scanner` 调度器轮询待支付订单，匹配链上交易

### 初始化流程
1. 检查 config.yaml 是否存在
2. 若不存在，启动 setup 流程
3. 输入 Bot Token，验证有效性
4. 生成 PIN 码，等待管理员通过 Bot 确认
5. 保存配置，启动服务

## 配置文件

```yaml
bot:
  token: "telegram_bot_token"
  admin: 123456789  # 管理员 Telegram ID
server:
  bind: ":8181"
database:
  type: "sqlite"  # 或 "mysql"
  sqlite:
    path: "./data/hashpay.db"
  mysql:
    host: "localhost"
    port: 3306
    database: "hashpay"
    username: "root"
    password: ""
```

## API 端点

### 公开接口
- `GET /health` - 健康检查
- `GET /api/status` - 系统状态
- `GET /pay/:orderId` - 支付页面
- `GET /api/order/:orderId/payment-methods` - 获取支付方式
- `POST /api/order/:orderId/select-payment` - 选择支付方式
- `GET /api/order/:orderId/status` - 订单状态

### 商户接口（需 API Key）
- `POST /api/order` - 创建订单
- `GET /api/order/:orderId` - 查询订单

### 管理接口（需 Telegram 认证）
- `GET /api/admin/config` - 获取配置
- `PUT /api/admin/config` - 更新配置
- `GET /api/admin/payments` - 支付方式列表
- `POST /api/admin/payments` - 添加支付方式
- `GET /api/admin/stats` - 统计数据

## 设计原则

1. **单一职责**: 每个文件/模块只做一件事
2. **依赖注入**: handler → service → repository
3. **接口抽象**: Chain 扫描器定义接口，按需实现具体链
4. **无防御性编程**: 信任内部调用，只在边界校验
