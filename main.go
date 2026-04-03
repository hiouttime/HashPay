package main

import (
	"hashpay/internal/bootstrap"
	"hashpay/internal/pkg/log"
)

func main() {
	if err := bootstrap.Run(); err != nil {
		log.Fatal("Failed to start: %v", err)
	}
}
