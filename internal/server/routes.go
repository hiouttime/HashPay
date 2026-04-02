package server

import (
	"hashpay/internal/handler"

	"github.com/gofiber/fiber/v3"
)

func (s *Server) setupRoutes(cfg *Config) {
	initOnly := false
	if cfg != nil {
		initOnly = cfg.InitOnly
	}

	// 健康检查
	s.app.Get("/health", handler.Health)

	// API 信息
	s.app.Get("/api", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"name":    "HashPay API",
			"version": "2.0.0",
			"status":  "running",
		})
	})

	// 系统状态与初始化
	s.app.Get("/api/status", s.handler.Init.Status)
	s.app.All("/api/config", s.handler.Init.Config)

	if !initOnly {
		adminID := int64(0)
		if cfg != nil {
			adminID = cfg.AdminID
		}

		// 支付页面
		s.app.Get("/pay/:orderId", s.handlePayPage)

		// 商户 API（需要 API Key 认证）
		s.app.Post("/api/order", s.requireService, s.apiKeyAuth, s.handler.Order.Create)
		s.app.Get("/api/order/:orderId", s.requireService, s.apiKeyAuth, s.handler.Order.Get)

		// 支付 API（公开）
		s.app.Get("/api/order/:orderId/payment-methods", s.requireService, s.handler.Order.GetPaymentMethods)
		s.app.Post("/api/order/:orderId/select-payment", s.requireService, s.handler.Order.SelectPayment)
		s.app.Get("/api/order/:orderId/status", s.requireService, s.handler.Order.CheckStatus)

		// 管理 API（需要 Telegram 认证）
		admin := s.app.Group("/api/admin", s.requireService, telegramAuth(adminID))
		admin.Get("/config", s.handler.Admin.GetConfig)
		admin.Put("/config", s.handler.Admin.UpdateConfig)
		admin.Get("/payments", s.handler.Admin.GetPayments)
		admin.Post("/payments", s.handler.Payment.Add)
		admin.Put("/payments/:id", s.handler.Payment.Update)
		admin.Delete("/payments/:id", s.handler.Payment.Delete)
		admin.Patch("/payments/:id/toggle", s.handler.Payment.Toggle)
		admin.Get("/stats", s.handler.Admin.GetStats)
	}

	// 静态资源
	s.app.Get("/assets/*", func(c fiber.Ctx) error {
		return c.SendFile("./web/dist" + c.Path())
	})

	// Mini App SPA 路由
	s.app.Get("/", serveIndex)
	s.app.Get("/*", func(c fiber.Ctx) error {
		path := c.Path()
		if len(path) >= 4 && path[:4] == "/api" {
			return c.Next()
		}
		if len(path) >= 7 && path[:7] == "/assets" {
			return c.Next()
		}
		return serveIndex(c)
	})
}

func (s *Server) handlePayPage(c fiber.Ctx) error {
	if s.handler.Payment == nil {
		return c.Status(503).JSON(fiber.Map{"error": "服务未初始化"})
	}
	return s.handler.Payment.PayPage(c)
}

func serveIndex(c fiber.Ctx) error {
	return c.SendFile("./web/dist/index.html")
}
