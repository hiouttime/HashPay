
![](https://files.mdnice.com/user/39773/8c15d030-04a2-42b5-964f-38623173ed8a.png)

<p align="center">
<img alt="GitHub" src="https://img.shields.io/github/license/hiouttime/HashPay?style=for-the-badge">
<img alt="GitHub tag (latest by date)" src="https://img.shields.io/github/v/tag/hiouttime/HashPay?label=version&style=for-the-badge">
<img alt="Telegram" src="https://img.shields.io/static/v1?label=Telegram&logo=Telegram&message=@TheHashPay&style=for-the-badge&color=blue&&link=https://t.me/TheHashpay">
</p>

## 🤔 这是什么

HashPay 是一款由Golang打造的跨平台加密货币收款一站式解决方案。充分利用Telegram的特性，让你能在站点、对话、机器人中轻松发起收款，而无需重复管理基础支付架构。

## 🚀 功能特性

### 核心功能
- **支持超多网络及币种**: TRON、BNB Smart Chain、ETH、Polygon、Solana、TON... 可以利用API扩展更多！
- **交易所内部转账监听支持**: 利用交易所API，实现对内部转账的收款监听，提升用户好感
- **更支持一些三方钱包**: 如汇旺(Huione)、OKPay
- **智能汇率管理**: 自动获取、固定汇率、汇率微调
- **0开发使用**: 支持作为动态“收款码”，轻松发起收款，再也不用管理一大堆收款信息
- **超友好的管理界面**: 使用Telegram mini app实现可视化的管理配置。

### 支持订单渠道
- **网页/网店**: 通过对接API，实现网店/网站发起收款，在浏览器上完成。
- **Telegram Bot**: 机器人可跳转到收款机器人，一站式处理收款、查询订单、订单追踪等能力，无需重复开发收款
- **Telegramm 收款码**: 在对话中发送收款码，让付款者能自行选择付款方式，并提供即时确认反馈。

## 快速开始

### 环境要求
- Go 1.21+
- Node.js 18+ (可选，如果你需要定制后台或在线收款页)

**首次运行流程：**
1. 下载、授予可执行权限、运行
2. 根据提示，创建及输入 Telegram Bot Token
3. 向你的机器人发送开始消息
4. 输入控制台生成的PIN码进行验证
5. 开始配置

**就是这么简单！** 无需手动初始化数据库，无需复杂配置，系统会自动处理一切。

## 贡献指南

欢迎提交 Issue 和 Pull Request！

提交代码前请确保：
- 通过所有测试
- 代码风格符合 Go 规范
- Mini App 代码符合 React 最佳实践
- 更新相关文档


## :raised_hands: License

HashPay 采用 [MPL-2.0](#MPL-2.0-1-ov-file) 开源。
