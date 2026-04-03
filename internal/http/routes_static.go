package httpapi

import (
	"strings"

	"hashpay/internal/bot"

	"github.com/gofiber/fiber/v3"
)

func (s *Server) registerStaticRoutes() {
	s.app.Get("/health", func(c fiber.Ctx) error {
		return ok(c, fiber.Map{"status": "ok"}, "")
	})

	s.app.Get("/media/banner", func(c fiber.Ctx) error {
		data, err := bot.BannerData()
		if err != nil {
			return fiber.NewError(fiber.StatusNotFound, "banner 不存在")
		}
		c.Type("jpg")
		return c.Send(data)
	})

	s.app.Get("/assets/*", func(c fiber.Ctx) error {
		return c.SendFile("./web/dist" + c.Path())
	})
	s.app.Get("/app/assets/*", func(c fiber.Ctx) error {
		path := strings.TrimPrefix(c.Path(), "/app")
		return c.SendFile("./miniapp/dist" + path)
	})
	s.app.Get("/app", func(c fiber.Ctx) error {
		if !s.config.Installed() {
			return c.Redirect().To("/app/setup")
		}
		if c.Path() == "/app" {
			return c.Redirect().To("/app/dashboard")
		}
		return c.SendFile("./miniapp/dist/index.html")
	})
	s.app.Get("/app/*", func(c fiber.Ctx) error {
		if strings.HasPrefix(c.Path(), "/app/assets") {
			return c.Next()
		}
		if !s.config.Installed() && c.Path() != "/app/setup" {
			return c.Redirect().To("/app/setup")
		}
		if s.config.Installed() && (c.Path() == "/app/setup" || c.Path() == "/app/setup/done") {
			return c.Redirect().To("/app/dashboard")
		}
		return c.SendFile("./miniapp/dist/index.html")
	})
	s.app.Get("/", func(c fiber.Ctx) error {
		return c.SendFile("./web/dist/index.html")
	})
	s.app.Get("/*", func(c fiber.Ctx) error {
		path := c.Path()
		if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/assets") || strings.HasPrefix(path, "/app") || strings.HasPrefix(path, "/media") {
			return c.Next()
		}
		return c.SendFile("./web/dist/index.html")
	})
}
