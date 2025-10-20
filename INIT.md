项目描述：
这是一个Telegram bot为核心的支付处理项目。以Telegram bot + mini app为友好的后台交互，便于用户使用与控制选项。
主要的处理支付来自区块链交易、交易所以及一些能够对接API的钱包。
主要代码使用golang实现，对外提供：
1、一个web页面，用于显示收款信息，引导用户选择支付方式，展示支付结果
2、一个telegram bot，用于简单命令交互
3、一个telegram mini app，用于完整的后台管理与控制

项目结构（大概，需要根据完整项目进行修改）
models ---- 项目模型
vendor ---- 依赖扩展
pages --- 网页页面
miniapp ---- 由 vue.js + vite 构建的miniapp页面
telegram ---- 一些telegram bot库没有，或者实现不够好的包装
utils ---- 一些实用工具
commands ---- 命令入口

