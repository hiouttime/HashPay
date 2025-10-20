package embed

import (
	_ "embed"
)

// 注意: miniapp/dist 需要在构建前先执行 npm run build
// 开发时可以直接从文件系统读取

// 支付页面模板
//go:embed templates/payment.html
var PaymentTemplate string

// 回调页面模板
//go:embed templates/callback.html
var CallbackTemplate string

// 错误页面模板
//go:embed templates/error.html
var ErrorTemplate string