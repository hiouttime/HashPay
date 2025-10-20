package main

import (
	"os"

	"hashpay/internal/app"
	"hashpay/internal/ui"
)

func main() {
	if err := app.Run(); err != nil {
		ui.Error("启动失败: %v", err)
		os.Exit(1)
	}
}
