package api

import (
	"database/sql"
	"errors"
	"time"

	"hashpay/internal/database"
	"hashpay/internal/payment"
	"hashpay/internal/ui"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/recover"
)

type Server struct {
	app       *fiber.App
	db        *database.DB
	scheduler *payment.APIScheduler
}

func NewServer(sqlDB *sql.DB) *Server {
	app := fiber.New(fiber.Config{
		AppName:      "HashPay",
		ErrorHandler: errorHandler,
	})

	app.Use(recover.New())
	app.Use(func(c fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		latency := time.Since(start)

		status := c.Response().StatusCode()
		if status == 0 {
			status = fiber.StatusOK
		}

		if err != nil {
			var fiberErr *fiber.Error
			if errors.As(err, &fiberErr) {
				status = fiberErr.Code
			} else if status < fiber.StatusBadRequest {
				status = fiber.StatusInternalServerError
			}
		}

		method := c.Method()
		path := c.OriginalURL()
		if path == "" {
			path = c.Path()
		}

		switch {
		case status >= fiber.StatusInternalServerError:
			if err != nil {
				ui.Error("%s %s => %d (%s) 错误: %v", method, path, status, latency, err)
			} else {
				ui.Error("%s %s => %d (%s)", method, path, status, latency)
			}
		case status >= fiber.StatusBadRequest:
			if err != nil {
				ui.Warn("%s %s => %d (%s) 错误: %v", method, path, status, latency, err)
			} else {
				ui.Warn("%s %s => %d (%s)", method, path, status, latency)
			}
		default:
			ui.Info("%s %s => %d (%s)", method, path, status, latency)
		}

		if err != nil {
			return err
		}
		return nil
	})
	app.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "X-Api-Key", "X-Sign"},
	}))

	var db *database.DB
	if sqlDB != nil {
		db = &database.DB{}
		db.DB = sqlDB
	}

	var scheduler *payment.APIScheduler
	if db != nil {
		scheduler = payment.NewScheduler(db, 30*time.Second)
	}

	server := &Server{
		app:       app,
		db:        db,
		scheduler: scheduler,
	}

	server.setupRoutes()
	server.setupScheduler()

	return server
}

func (s *Server) setupRoutes() {
	// 健康检查
	s.app.Get("/health", s.handleHealth)

	// 首页 - 返回Mini App页面
	s.app.Get("/", func(c fiber.Ctx) error {
		// 使用React版本的Mini App
		return c.SendFile("./miniapp/dist/index.html")
	})

	// 静态资源处理
	s.app.Get("/assets/*", func(c fiber.Ctx) error {
		return c.SendFile("./miniapp/dist" + c.Path())
	})

	// 处理其他Mini App路由 (React Router)
	s.app.Get("/*", func(c fiber.Ctx) error {
		path := c.Path()
		// API路由和静态资源除外
		if len(path) > 4 && (path[:4] == "/api" || path[:7] == "/assets") {
			return c.Next()
		}
		return c.SendFile("./miniapp/dist/index.html")
	})

	// API信息端点
	s.app.Get("/api", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"name":    "HashPay API",
			"version": "1.0.0",
			"status":  "running",
			"endpoints": fiber.Map{
				"health":  "/health",
				"api":     "/api",
				"payment": "/pay/:orderId",
			},
		})
	})
	s.app.Get("/pay/:orderId", s.handlePaymentPage)

	// API 路由
	api := s.app.Group("/api")

	// 商户接口
	api.Post("/order", s.authMiddleware, s.handleCreateOrder)
	api.Get("/order/:orderId", s.authMiddleware, s.handleGetOrder)
	api.Post("/webhook", s.handleWebhook)

	// 支付接口
	api.Get("/order/:orderId/payment-methods", s.handleGetPaymentMethods)
	api.Post("/order/:orderId/select-payment", s.handleSelectPayment)
	api.Get("/order/:orderId/status", s.handleCheckStatus)

	// 内部接口（Mini App 使用）
	api.Get("/config", s.internalAuth, s.handleGetConfig)
	api.Put("/config", s.internalAuth, s.handleUpdateConfig)
	api.Get("/payments", s.internalAuth, s.handleGetPayments)
	api.Post("/payments", s.internalAuth, s.handleAddPayment)
	api.Get("/stats", s.internalAuth, s.handleGetStats)
}

func (s *Server) setupScheduler() {
	if s.db == nil || s.scheduler == nil {
		return
	}

	// Get all payment methods and filter blockchain types
	payments, err := s.db.GetAllPayments()
	if err != nil {
		ui.Error("加载支付方式失败: %v", err)
		return
	}

	for _, p := range payments {
		// Only process blockchain payment methods
		if p.Type != "blockchain" {
			continue
		}
		chain := payment.ChainType(p.Chain.String)

		var api payment.ChainAPI
		switch chain {
		case payment.ChainTRON:
			api = payment.NewTronAPI("https://api.trongrid.io", p.ApiKey.String)
		case payment.ChainBSC:
			api = payment.NewBSCAPI("https://api.bscscan.com", p.ApiKey.String)
		}

		if api != nil {
			s.scheduler.RegisterChain(chain, api)
		}
	}

	s.scheduler.Start()
}

func (s *Server) Start(addr string) error {
	ui.Info("网页服务监听在 %s", addr)
	return s.app.Listen(addr, fiber.ListenConfig{
		DisableStartupMessage: true,
	})
}

func (s *Server) Stop() error {
	if s.scheduler != nil {
		s.scheduler.Stop()
	}
	return s.app.Shutdown()
}

func (s *Server) App() *fiber.App {
	return s.app
}

func (s *Server) ensureDB() error {
	if s.db == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "服务尚未初始化")
	}
	return nil
}
