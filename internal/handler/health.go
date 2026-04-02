package handler

import (
	"time"

	"github.com/gofiber/fiber/v3"
)

// Health 健康检查处理器
func Health(c fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status": "ok",
		"time":   time.Now().Unix(),
	})
}
