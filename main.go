package main

import (
	"os"

	"hashpay/internal/app"
	"hashpay/internal/pkg/log"
)

func main() {
	if err := app.Run(); err != nil {
		log.Fatal("Failed to start: %v", err)
		os.Exit(1)
	}
}
