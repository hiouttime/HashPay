项目描述：
HashPay 是一个围绕 Telegram Bot 与 Mini App 的支付处理系统。后端使用 Go 编写，负责对接区块链/交易所 API、管理支付订单，并通过 Web 页面展示收款信息。

主要特性：
1. Web 页面：展示订单状态、引导用户完成支付
2. Telegram Bot：提供命令与通知能力
3. Telegram Mini App：作为后台管理与配置面板

- 项目结构（与当前代码保持一致）：
- `main.go`：精简入口，委托 `internal/app` 负责应用启动
- `internal/app/`：配置加载、初始化流程、生命周期管理
- `internal/api/`：Fiber HTTP 服务、REST API、静态资源分发
- `internal/bot/`：Telebot 适配层，负责注册事件
- `internal/command/`：按命令拆分的处理逻辑（/start、/help、/stats 等）
- `internal/database/`：数据库访问封装，包含嵌入的迁移脚本
- `internal/payment/`：支付相关逻辑（现实现 Tron/BSC 链轮询，其他链为占位）
- `internal/service/`、`internal/utils/` 等：业务与工具层
- `miniapp/`：React + Vite Mini App 前端
- `web/`：传统收款页面及静态资源

运行方式：
- 首次运行需执行 `go run .` 或 `make run`，将触发 PIN 验证 + Mini App 配置流程，并生成 `config.yaml`
- 日常开发可使用 `make dev` 或 `make run`，`go run .` 现已可直接工作

注意事项：
- 仓库中提供 `config.yaml.example`，请勿提交包含真实凭据的 `config.yaml`
- 新增或调整 Bot 命令时，请在 `internal/command` 下创建独立目录并注册至 `internal/bot`
- 若需扩展链路，请在 `internal/payment` 中实现对应 API，并在 `internal/api/server.go` 的调度逻辑注册
