<p align="center">
  <img src="https://github.com/TGDash/HashPay/raw/main/images/banner.webp" alt="HashPay" width="100%">
</p>

<h1 align="center">HashPay</h1>

<p align="center">
  运行在 Cloudflare Wokers 上的加密货币收款网关
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-green?style=for-the-badge">
  <img alt="Runtime" src="https://img.shields.io/badge/runtime-Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare">
  <img alt="Frontend" src="https://img.shields.io/badge/frontend-Vue%203-42b883?style=for-the-badge&logo=vuedotjs">
  <img alt="Human" src="https://img.shields.io/badge/HUMAN- VERFIED-f6a10a?style=for-the-badge">
  <img alt="Telegram" src="https://img.shields.io/badge/Telegram-Mini%20App-2CA5E0?style=for-the-badge&logo=telegram">
</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/TGDash/HashPay">
    <img alt="Deploy to Cloudflare" src="https://deploy.workers.cloudflare.com/button">
  </a>
</p>

<!-- dash-content-start -->

## 🤔 这是什么

HashPay 是一款运行在 Cloudflare Wokers 上的加密货币收款网关。

支持多种区块链、交易所及第三方钱包收款。支持 Telegram Inline 发起收款以及 REST API 下单，轻松接入您的网站或机器人。

运行在 Cloudflare Wokers上，意味着你不需要准备服务器，一切都以高可用的状态准备着。
~~全球宕机不在高可用范围内~~

## 🚀 快速预览

<img src="https://github.com/TGDash/HashPay/raw/main/images/index.png" alt="Index" width="100%">

### 支持支付方式/网络

<img src="https://github.com/TGDash/HashPay/raw/main/images/network.png" alt="Index" width="40%">
<img src="https://github.com/TGDash/HashPay/raw/main/images/exchange.png" alt="Index" width="40%">

| 类型 | 通道 | 支持资产 |
| --- | --- | --- |
| 链上网络 | TRON / TRC20 | USDT、TRX |
| 链上网络 | Ethereum / ERC20 | USDT、USDC、ETH |
| 链上网络 | Base | USDT、USDC、ETH |
| 链上网络 | BNB Smart Chain / BEP20 | USDT、USDC、BNB |
| 链上网络 | Polygon | USDT、USDC、MATIC |
| 链上网络 | TON | USDT、GRAM |
| 链上网络 | Aptos | USDT、USDC |
| 交易所 | Binance Pay | USDT、USDC |
| 交易所 | OKX | USDT、USDC |
| 钱包 | OKPay | USDT、TRX |


### 典型使用场景

| 场景 | 用法 |
| --- | --- |
| 网站 / 网店 | 通过商户 API 创建订单，引导用户打开收银台付款 |
| Telegram 私域收款 | 管理员通过 inline query 发起收款 |
| 动态收款码 | 用户打开固定入口后自行选择网络和资产完成付款 |
| 交易所内部转账 | 使用 Binance Pay / OKX API 读取收款流水并匹配订单 |

## 🧩 技术栈

| 模块 | 技术 |
| --- | --- |
| Runtime | Cloudflare Workers |
| API | Hono |
| 前端 | Vue 3、Vue Router、Naive UI、Vite、SCSS |
| 数据库 | Cloudflare D1 |
| 静态资源 | Cloudflare Worker Assets |
| 队列 | Cloudflare Queues |
| 定时任务 | Cloudflare Cron Triggers |
| Telegram | grammY + Telegram Bot API |
| 测试 | Vitest |

<!-- dash-content-end -->

## ⚡ 极速开始

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/TGDash/HashPay">
    <img alt="Deploy to Cloudflare" src="https://deploy.workers.cloudflare.com/button">
</a>



完成配置：

| 字段 | 获取方法 |
| --- | --- |
| `TGBOT_TOKEN` | Telegram Bot Token，在 @Botfather 中创建机器人获取，这将作为通知及创建收款单的机器人。
| `APP_SECRET` | 随机生成，推荐32位，用于整个系统的加密，请勿设置过于简单 |

<img src="https://github.com/TGDash/HashPay/raw/main/images/setup.png" alt="Index" width="50%">

然后你就可以为 workers 配置域名，然后访问页面以开始配置。

## 💻 本地开发

环境要求：

- Node.js 20+
- npm
- Wrangler

安装依赖：

```sh
npm install
```

创建本地环境变量：

```sh
cp .dev.vars.example .dev.vars
```

填写 `.dev.vars`：

```text
TGBOT_TOKEN=
APP_SECRET=
```

启动 Vite 开发服务：

```sh
npm run dev
```

默认访问地址为 `http://localhost:8183`。

单独启动 Worker runtime：

```sh
npm run dev:worker
```

默认 Worker 端口为 `8787`。

本地应用 D1 迁移：

```sh
npm run db:migrate:local
```

常用检查：

```sh
npm run check
npm run test
npm run build
npm run deploy:dry
```

## 🔐 商户接入

后台新增商户后，系统会生成 RSA 密钥对：

- 公钥保存在 HashPay，用于验证商户请求签名。
- 私钥只在创建或轮换时返回一次，由商户系统自行保存。
- 回调密钥只在创建或轮换时返回一次，用于验证 HashPay 的 callback 通知签名。

### 创建订单

```http
POST /api/merchant/new
X-Merchant-Id: <merchant-id>
X-Timestamp: <unix-seconds>
X-Signature: <base64-rsa-sha256-signature>
Content-Type: application/json

{
  "merchantNo": "ORDER-10001",
  "amount": 1,
  "currency": "USD",
  "description": "Test order",
  "callback": "https://merchant.example.com/callback",
  "return_url": "https://merchant.example.com/return"
}
```

签名原文：

```text
METHOD
pathname + search
timestamp
body
```

例如：

```text
POST
/api/merchant/new
1782000000
{"merchantNo":"ORDER-10001","amount":1,"currency":"USD"}
```

响应包含：

| 字段 | 说明 |
| --- | --- |
| `checkout` | 用户访问的收银台地址 |
| `order` | 订单摘要 |
| `reused` | 同一商户、同一 `merchantNo` 重复请求时为 `true` |

### 回调签名

HashPay 投递 callback 时会附带以下请求头：

| Header | 说明 |
| --- | --- |
| `X-HashPay-Merchant` | 商户 ID |
| `X-HashPay-Timestamp` | 投递时的 Unix 秒时间戳 |
| `X-HashPay-Signature` | `HMAC-SHA256(callbackSecret, timestamp + "\\n" + body)` 的 hex 结果 |

商户系统应先校验时间戳窗口，再使用创建/轮换商户时返回的回调密钥验签。

### 查询订单

```http
GET /api/order/:orderId
X-Merchant-Id: <merchant-id>
X-Timestamp: <unix-seconds>
X-Signature: <base64-rsa-sha256-signature>
```

## 🔄 更新

通过本仓库创建的实例可以在 GitHub Actions 中运行 **Update HashPay** workflow，从上游 `tgdash/HashPay` 同步应用代码。

更新流程会保留当前实例的 `wrangler.jsonc` 部署资源配置，但自定义代码可能被覆盖。

## 🛡 安全注意

- 不要提交 `.dev.vars`、Bot Token、`APP_SECRET`、商户私钥或交易所 API 密钥。
- 交易所 API Key 只需要读取权限，不要开启提现权限。
- 商户私钥由商户系统保存，HashPay 只保存公钥。
- 生产环境应使用 HTTPS 域名完成初始化和 Telegram webhook 配置。

## 🙌 License

HashPay 使用 Apache-2.0 协议。
