package api

import (
	"database/sql"
	"hashpay/internal/database"
	"hashpay/internal/payment"
	"log"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
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
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "X-Api-Key", "X-Sign"},
	}))
	
	db := &database.DB{}
	db.DB = sqlDB
	scheduler := payment.NewScheduler(db, 30*time.Second)
	
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
	
	// 静态文件和支付页面
	// Fiber v3 removed Static method, use Get instead
	s.app.Get("/", func(c fiber.Ctx) error {
		return c.SendFile("./web/index.html")
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
	// Get all payment methods and filter blockchain types
	payments, err := s.db.GetAllPayments()
	if err != nil {
		log.Printf("Failed to load payment methods: %v", err)
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
	log.Printf("Server starting on %s", addr)
	return s.app.Listen(addr)
}

func (s *Server) Stop() error {
	s.scheduler.Stop()
	return s.app.Shutdown()
}

