package httpapi

import (
	"sync"

	"hashpay/internal/service"

	"github.com/gofiber/fiber/v3"
)

type Runtime struct {
	App *service.App
}

type DBConfig struct {
	Database struct {
		Type   string `json:"type"`
		SQLite struct {
			Path string `json:"path"`
		} `json:"sqlite"`
		MySQL struct {
			Host     string `json:"host"`
			Port     int    `json:"port"`
			Database string `json:"database"`
			Username string `json:"username"`
			Password string `json:"password"`
		} `json:"mysql"`
	} `json:"database"`
}

type Config struct {
	Installed func() bool
	BotToken  func() string
	AdminID   func() int64
	SetDB     func(req DBConfig) (string, error)
}

type Server struct {
	app    *fiber.App
	config Config
	runMu  sync.RWMutex
	run    *Runtime
}

func New(config Config) *Server {
	s := &Server{
		app:    fiber.New(),
		config: config,
	}
	s.registerAdminRoutes()
	s.registerMerchantRoutes()
	s.registerCheckoutRoutes()
	s.registerStaticRoutes()
	return s
}

func (s *Server) App() *fiber.App {
	return s.app
}

func (s *Server) SetRuntime(run *Runtime) {
	s.runMu.Lock()
	s.run = run
	s.runMu.Unlock()
}

func (s *Server) Runtime() *Runtime {
	s.runMu.RLock()
	defer s.runMu.RUnlock()
	return s.run
}

func (s *Server) Start(addr string) error {
	return s.app.Listen(addr, fiber.ListenConfig{
		DisableStartupMessage: true,
	})
}

func (s *Server) Stop() error {
	return s.app.Shutdown()
}
