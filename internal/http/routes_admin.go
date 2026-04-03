package httpapi

import (
	"io"
	"strconv"
	"strings"

	"hashpay/internal/bot"
	"hashpay/internal/models"

	"github.com/gofiber/fiber/v3"
)

func (s *Server) registerAdminRoutes() {
	group := s.app.Group("/api/admin")
	group.Get("/install", s.install)
	group.Post("/install", s.submitInstall)

	auth := group.Group("", s.requireRuntime, s.telegramAuth())
	auth.Get("/dashboard", s.dashboard)
	auth.Get("/settings", s.settings)
	auth.Put("/settings", s.updateSettings)
	auth.Post("/banner", s.uploadBanner)
	auth.Get("/payments/catalog", s.catalog)
	auth.Get("/payments", s.methods)
	auth.Post("/payments", s.saveMethod)
	auth.Put("/payments/:id", s.saveMethod)
	auth.Delete("/payments/:id", s.deleteMethod)
	auth.Get("/merchants", s.merchants)
	auth.Post("/merchants", s.saveMerchant)
	auth.Put("/merchants/:id", s.saveMerchant)
	auth.Delete("/merchants/:id", s.deleteMerchant)
	auth.Get("/orders", s.orders)
	auth.Get("/orders/:id", s.order)
}

func (s *Server) install(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"installed": s.config.Installed()})
}

func (s *Server) submitInstall(c fiber.Ctx) error {
	if s.config.SetDB == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "安装处理未就绪")
	}
	var req DBConfig
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}
	message, err := s.config.SetDB(req)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{
		"status":  "ok",
		"ready":   true,
		"message": message,
	})
}

func (s *Server) dashboard(c fiber.Ctx) error {
	data, err := s.Runtime().App.Dashboard()
	if err != nil {
		return err
	}
	return c.JSON(data)
}

func (s *Server) settings(c fiber.Ctx) error {
	data, err := s.Runtime().App.Settings()
	if err != nil {
		return err
	}
	data["banner_url"] = bot.RelativeURL()
	return c.JSON(data)
}

func (s *Server) updateSettings(c fiber.Ctx) error {
	var req map[string]string
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}
	if err := s.Runtime().App.SaveSettings(req); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "ok"})
}

func (s *Server) uploadBanner(c fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil || file == nil {
		return fiber.NewError(fiber.StatusBadRequest, "请选择横幅图片")
	}
	src, err := file.Open()
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "读取横幅失败")
	}
	defer src.Close()

	body, err := io.ReadAll(src)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "读取横幅失败")
	}
	if err := bot.SaveBanner(body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "仅支持 JPG、PNG、WebP 图片")
	}
	return c.JSON(fiber.Map{"status": "ok", "banner_url": bot.RelativeURL()})
}

func (s *Server) catalog(c fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"drivers": s.Runtime().App.Registry.Catalog(),
		"schema":  s.Runtime().App.Registry.Schemas(),
	})
}

func (s *Server) methods(c fiber.Ctx) error {
	data, err := s.Runtime().App.Methods()
	if err != nil {
		return err
	}
	return c.JSON(data)
}

func (s *Server) saveMethod(c fiber.Ctx) error {
	var req struct {
		Driver  string            `json:"driver"`
		Kind    string            `json:"kind"`
		Name    string            `json:"name"`
		Enabled bool              `json:"enabled"`
		Fields  map[string]string `json:"fields"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}
	item := &models.PaymentMethod{
		Driver:  req.Driver,
		Kind:    req.Kind,
		Name:    req.Name,
		Enabled: req.Enabled,
		Fields:  req.Fields,
	}
	if raw := strings.TrimSpace(c.Params("id")); raw != "" {
		if id, err := strconv.ParseInt(raw, 10, 64); err == nil {
			item.ID = id
		}
	}
	if item.Kind == "" {
		if driver, ok := s.Runtime().App.Registry.Driver(item.Driver); ok {
			item.Kind = driver.Meta().Kind
		}
	}
	if err := s.Runtime().App.SaveMethod(item); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(item)
}

func (s *Server) deleteMethod(c fiber.Ctx) error {
	id, _ := strconv.ParseInt(c.Params("id"), 10, 64)
	if err := s.Runtime().App.DeleteMethod(id); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "ok"})
}

func (s *Server) merchants(c fiber.Ctx) error {
	data, err := s.Runtime().App.Merchants()
	if err != nil {
		return err
	}
	return c.JSON(data)
}

func (s *Server) saveMerchant(c fiber.Ctx) error {
	var req struct {
		Name        string `json:"name"`
		CallbackURL string `json:"callback_url"`
		Status      string `json:"status"`
		APIKey      string `json:"api_key"`
		SecretKey   string `json:"secret_key"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}
	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = "active"
	}
	item := &models.Merchant{
		ID:          strings.TrimSpace(c.Params("id")),
		Name:        req.Name,
		CallbackURL: req.CallbackURL,
		Status:      status,
		APIKey:      req.APIKey,
		SecretKey:   req.SecretKey,
	}
	if err := s.Runtime().App.SaveMerchant(item); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(item)
}

func (s *Server) deleteMerchant(c fiber.Ctx) error {
	if err := s.Runtime().App.DeleteMerchant(c.Params("id")); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "ok"})
}

func (s *Server) orders(c fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit"))
	data, err := s.Runtime().App.Orders(c.Query("status"), limit)
	if err != nil {
		return err
	}
	return c.JSON(data)
}

func (s *Server) order(c fiber.Ctx) error {
	data, err := s.Runtime().App.Order(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "订单不存在")
	}
	return c.JSON(data)
}
