package server

import (
	"hashpay/internal/handler"
	"strings"

	"github.com/gofiber/fiber/v3"
)

func (s *Server) setupRoutes(cfg *Config) {
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
	s.app.Get("/api/status", func(c fiber.Ctx) error {
		return s.Handler().Init.Status(c)
	})
	s.app.All("/api/config", func(c fiber.Ctx) error {
		return s.Handler().Init.Config(c)
	})

	adminID := int64(0)
	botToken := ""
	if cfg != nil {
		adminID = cfg.AdminID
		botToken = cfg.BotToken
	}

	// 支付页面
	s.app.Get("/pay/:orderId", s.handlePayPage)

	// 商户 API（需要 API Key 认证）
	s.app.Post("/api/order", s.requireService, s.apiKeyAuth, func(c fiber.Ctx) error {
		return s.Handler().Order.Create(c)
	})
	s.app.Get("/api/order/:orderId", s.requireService, s.apiKeyAuth, func(c fiber.Ctx) error {
		return s.Handler().Order.Get(c)
	})

	// 支付 API（公开）
	s.app.Get("/api/order/:orderId/payment-methods", s.requireService, func(c fiber.Ctx) error {
		return s.Handler().Order.GetPaymentMethods(c)
	})
	s.app.Post("/api/order/:orderId/select-payment", s.requireService, func(c fiber.Ctx) error {
		return s.Handler().Order.SelectPayment(c)
	})
	s.app.Get("/api/order/:orderId/status", s.requireService, func(c fiber.Ctx) error {
		return s.Handler().Order.CheckStatus(c)
	})

	// 管理 API（需要 Telegram 认证）
	admin := s.app.Group("/api/admin", s.requireService, telegramAuth(adminID, botToken))
	admin.Get("/config", func(c fiber.Ctx) error {
		return s.Handler().Admin.GetConfig(c)
	})
	admin.Put("/config", func(c fiber.Ctx) error {
		return s.Handler().Admin.UpdateConfig(c)
	})
	admin.Get("/payments", func(c fiber.Ctx) error {
		return s.Handler().Admin.GetPayments(c)
	})
	admin.Post("/payments", func(c fiber.Ctx) error {
		return s.Handler().Payment.Add(c)
	})
	admin.Put("/payments/:id", func(c fiber.Ctx) error {
		return s.Handler().Payment.Update(c)
	})
	admin.Delete("/payments/:id", func(c fiber.Ctx) error {
		return s.Handler().Payment.Delete(c)
	})
	admin.Patch("/payments/:id/toggle", func(c fiber.Ctx) error {
		return s.Handler().Payment.Toggle(c)
	})
	admin.Get("/stats", func(c fiber.Ctx) error {
		return s.Handler().Admin.GetStats(c)
	})
	admin.Get("/overview", func(c fiber.Ctx) error {
		return s.Handler().Admin.GetOverview(c)
	})
	admin.Get("/orders", func(c fiber.Ctx) error {
		return s.Handler().Admin.GetOrders(c)
	})
	admin.Get("/sites", func(c fiber.Ctx) error {
		return s.Handler().Admin.GetSites(c)
	})
	admin.Post("/sites", func(c fiber.Ctx) error {
		return s.Handler().Admin.AddSite(c)
	})
	admin.Put("/sites/:id", func(c fiber.Ctx) error {
		return s.Handler().Admin.UpdateSite(c)
	})
	admin.Delete("/sites/:id", func(c fiber.Ctx) error {
		return s.Handler().Admin.DeleteSite(c)
	})

	// Web 静态资源
	s.app.Get("/assets/*", func(c fiber.Ctx) error {
		return c.SendFile("./web/dist" + c.Path())
	})
	// Mini App 静态资源
	s.app.Get("/app/assets/*", func(c fiber.Ctx) error {
		path := strings.TrimPrefix(c.Path(), "/app")
		return c.SendFile("./miniapp/dist" + path)
	})

	// Mini App SPA 路由（/app）
	s.app.Get("/app", serveMiniAppIndex)
	s.app.Get("/app/*", func(c fiber.Ctx) error {
		if strings.HasPrefix(c.Path(), "/app/assets") {
			return c.Next()
		}
		return serveMiniAppIndex(c)
	})

	// Web SPA 路由（/）
	s.app.Get("/", serveWebIndex)
	s.app.Get("/*", func(c fiber.Ctx) error {
		path := c.Path()
		if strings.HasPrefix(path, "/api") {
			return c.Next()
		}
		if strings.HasPrefix(path, "/assets") {
			return c.Next()
		}
		if strings.HasPrefix(path, "/app") {
			return c.Next()
		}
		return serveWebIndex(c)
	})
}

func (s *Server) handlePayPage(c fiber.Ctx) error {
	h := s.Handler()
	if h == nil || h.Payment == nil {
		return c.Status(503).JSON(fiber.Map{"error": "服务未初始化"})
	}
	return h.Payment.PayPage(c)
}

func serveWebIndex(c fiber.Ctx) error {
	return c.SendFile("./web/dist/index.html")
}

func serveMiniAppIndex(c fiber.Ctx) error {
	return c.SendFile("./miniapp/dist/index.html")
}
