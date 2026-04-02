package server

import (
	"sync"

	"hashpay/internal/handler"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/recover"
)

type Server struct {
	app     *fiber.App
	mu      sync.RWMutex
	handler *handler.Handler
}

type Config struct {
	AdminID  int64
	BotToken string
}

func New(h *handler.Handler, cfg *Config) *Server {
	app := fiber.New(fiber.Config{
		AppName:      "HashPay",
		ErrorHandler: errorHandler,
	})

	app.Use(recover.New())
	app.Use(requestLogger())
	app.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "X-Api-Key", "X-Sign", "X-Tg-Init-Data"},
	}))

	s := &Server{
		app:     app,
		handler: h,
	}

	s.setupRoutes(cfg)

	return s
}

func (s *Server) Start(addr string, onReady func()) error {
	return s.app.Listen(addr, fiber.ListenConfig{
		DisableStartupMessage: true,
		BeforeServeFunc: func(*fiber.App) error {
			if onReady != nil {
				onReady()
			}
			return nil
		},
	})
}

func (s *Server) Stop() error {
	return s.app.Shutdown()
}

func (s *Server) App() *fiber.App {
	return s.app
}

// Handler 返回 handler 实例
func (s *Server) Handler() *handler.Handler {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.handler
}

// SetHandler 更新 handler 实例
func (s *Server) SetHandler(h *handler.Handler) {
	s.mu.Lock()
	s.handler = h
	s.mu.Unlock()
}

func errorHandler(c fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	message := "Internal Server Error"

	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		message = e.Message
	}

	return c.Status(code).JSON(fiber.Map{
		"error": message,
		"code":  code,
	})
}
