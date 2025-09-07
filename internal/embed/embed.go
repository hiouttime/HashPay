package embed

import (
	_ "embed"
	"embed"
)

// Web 静态文件
//go:embed all:web
var WebFiles embed.FS

// Mini App 静态文件
//go:embed all:miniapp/dist
var MiniAppFiles embed.FS

// 支付页面模板
//go:embed templates/payment.html
var PaymentTemplate string

// 回调页面模板
//go:embed templates/callback.html
var CallbackTemplate string

// 错误页面模板
//go:embed templates/error.html
var ErrorTemplate string