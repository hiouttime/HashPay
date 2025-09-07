package middleware

import (
	"hashpay/internal/utils"
	"time"

	"github.com/gofiber/fiber/v3"
)

func LoggerMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		
		// 处理请求
		err := c.Next()
		
		// 记录请求日志
		duration := time.Since(start)
		status := c.Response().StatusCode()
		
		utils.LogRequest(c.Method(), c.Path(), status, duration)
		
		// 记录错误
		if err != nil {
			utils.Error("Request failed",
				"method", c.Method(),
				"path", c.Path(),
				"error", err,
				"ip", c.IP(),
			)
		}
		
		return err
	}
}

func RecoverMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		defer func() {
			if r := recover(); r != nil {
				utils.Error("Panic recovered in HTTP handler",
					"panic", r,
					"method", c.Method(),
					"path", c.Path(),
					"ip", c.IP(),
				)
				
				c.Status(500).JSON(fiber.Map{
					"error": "Internal server error",
				})
			}
		}()
		
		return c.Next()
	}
}