package main

import (
	"errors"

	"hashpay/internal/app"
	"hashpay/internal/pkg/log"
)

func main() {
	if err := app.Run(); err != nil {
		if errors.Is(err, app.ErrInterrupted) {
			log.Info("已取消，程序退出")
			return
		}
		log.Fatal("Failed to start: %v", err)
	}
}
