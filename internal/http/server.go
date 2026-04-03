package httpapi

import (
	"sync"
	"time"

	"hashpay/internal/service"
	"hashpay/internal/utils/log"

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
	Debug     bool
}

type Server struct {
	app    *fiber.App
	config Config
	runMu  sync.RWMutex
	run    *Runtime
}

func New(config Config) *Server {
	s := &Server{
		app: fiber.New(fiber.Config{
			ErrorHandler: func(c fiber.Ctx, err error) error {
				if ferr, ok := err.(*fiber.Error); ok {
					if ferr.Code >= fiber.StatusInternalServerError {
						log.Error("HTTP %s %s -> %d %s", c.Method(), c.Path(), ferr.Code, ferr.Message)
					} else if config.Debug {
						log.Warn("HTTP %s %s -> %d %s", c.Method(), c.Path(), ferr.Code, ferr.Message)
					}
					return fail(c, ferr.Code, ferr.Message)
				}
				log.Error("HTTP %s %s -> %d %v", c.Method(), c.Path(), fiber.StatusInternalServerError, err)
				return fail(c, fiber.StatusInternalServerError, err.Error())
			},
		}),
		config: config,
	}
	if config.Debug {
		s.app.Use(func(c fiber.Ctx) error {
			start := time.Now()
			err := c.Next()
			log.Debug("HTTP %s %s -> %d (%s)", c.Method(), c.Path(), c.Response().StatusCode(), time.Since(start).Round(time.Millisecond))
			return err
		})
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
