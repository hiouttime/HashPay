package server

import (
	"time"

	"hashpay/internal/pkg/log"

	"github.com/gofiber/fiber/v3"
)

// requestLogger 请求日志中间件
func requestLogger() fiber.Handler {
	return func(c fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		latency := time.Since(start)

		status := c.Response().StatusCode()
		method := c.Method()
		path := c.Path()

		switch {
		case status >= 500:
			log.Error("%s %s => %d (%s)", method, path, status, latency)
		case status >= 400:
			log.Warn("%s %s => %d (%s)", method, path, status, latency)
		default:
			log.Info("%s %s => %d (%s)", method, path, status, latency)
		}

		return err
	}
}

// requireService 检查服务是否已初始化
func (s *Server) requireService(c fiber.Ctx) error {
	if s.handler.Order == nil {
		return c.Status(503).JSON(fiber.Map{
			"error": "服务未初始化",
			"code":  503,
		})
	}
	return c.Next()
}

// apiKeyAuth API Key 认证中间件
func (s *Server) apiKeyAuth(c fiber.Ctx) error {
	apiKey := c.Get("X-Api-Key")
	if apiKey == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "缺少 API Key")
	}

	site, err := s.handler.Order.ValidateSite(apiKey)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "无效的 API Key")
	}

	c.Locals("site_id", site.ID)
	c.Locals("site", site)
	return c.Next()
}

// telegramAuth Telegram Mini App 认证中间件
func telegramAuth(adminID int64) fiber.Handler {
	return func(c fiber.Ctx) error {
		// TODO: 实现 Telegram Mini App InitData 验证
		initData := c.Get("X-Tg-Init-Data")
		if initData == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "未授权")
		}
		return c.Next()
	}
}
