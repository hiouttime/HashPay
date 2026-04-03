package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"hashpay/internal/config"
	"hashpay/internal/payments"
	"hashpay/internal/pkg/banner"
	"hashpay/internal/store"
	"hashpay/internal/usecase"

	"github.com/gofiber/fiber/v3"
)

type Runtime struct {
	App *usecase.App
}

type Setup interface {
	Status() fiber.Map
	Submit(c fiber.Ctx) error
}

type Server struct {
	app   *fiber.App
	cfg   *config.Config
	setup Setup
	runMu sync.RWMutex
	run   *Runtime
}

func New(cfg *config.Config, setup Setup) *Server {
	s := &Server{
		app:   fiber.New(),
		cfg:   cfg,
		setup: setup,
	}
	s.routes()
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
	return s.app.Listen(addr)
}

func (s *Server) routes() {
	s.app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	s.app.Get("/api/setup/status", func(c fiber.Ctx) error {
		return c.JSON(s.setup.Status())
	})
	s.app.Post("/api/setup/config", func(c fiber.Ctx) error {
		return s.setup.Submit(c)
	})

	s.app.Get("/api/admin/dashboard", s.requireRuntime, s.telegramAuth(), s.dashboard)
	s.app.Get("/api/admin/settings", s.requireRuntime, s.telegramAuth(), s.settings)
	s.app.Put("/api/admin/settings", s.requireRuntime, s.telegramAuth(), s.updateSettings)
	s.app.Post("/api/admin/banner", s.requireRuntime, s.telegramAuth(), s.uploadBanner)
	s.app.Get("/api/admin/payments/catalog", s.requireRuntime, s.telegramAuth(), s.catalog)
	s.app.Get("/api/admin/payments", s.requireRuntime, s.telegramAuth(), s.methods)
	s.app.Post("/api/admin/payments", s.requireRuntime, s.telegramAuth(), s.saveMethod)
	s.app.Put("/api/admin/payments/:id", s.requireRuntime, s.telegramAuth(), s.saveMethod)
	s.app.Delete("/api/admin/payments/:id", s.requireRuntime, s.telegramAuth(), s.deleteMethod)
	s.app.Get("/api/admin/merchants", s.requireRuntime, s.telegramAuth(), s.merchants)
	s.app.Post("/api/admin/merchants", s.requireRuntime, s.telegramAuth(), s.saveMerchant)
	s.app.Put("/api/admin/merchants/:id", s.requireRuntime, s.telegramAuth(), s.saveMerchant)
	s.app.Delete("/api/admin/merchants/:id", s.requireRuntime, s.telegramAuth(), s.deleteMerchant)
	s.app.Get("/api/admin/orders", s.requireRuntime, s.telegramAuth(), s.orders)
	s.app.Get("/api/admin/orders/:id", s.requireRuntime, s.telegramAuth(), s.order)

	s.app.Post("/api/merchant/orders", s.requireRuntime, s.merchantOrder)
	s.app.Get("/api/merchant/orders/:id", s.requireRuntime, s.merchantAuth(), s.merchantGetOrder)

	s.app.Get("/api/checkout/:id", s.requireRuntime, s.checkout)
	s.app.Post("/api/checkout/:id/route", s.requireRuntime, s.selectRoute)
	s.app.Get("/api/checkout/:id/status", s.requireRuntime, s.checkoutStatus)

	s.app.Get("/media/banner", func(c fiber.Ctx) error {
		return c.SendFile(banner.CurrentPath())
	})

	s.app.Get("/assets/*", func(c fiber.Ctx) error {
		return c.SendFile("./web/dist" + c.Path())
	})
	s.app.Get("/app/assets/*", func(c fiber.Ctx) error {
		path := strings.TrimPrefix(c.Path(), "/app")
		return c.SendFile("./miniapp/dist" + path)
	})
	s.app.Get("/app", func(c fiber.Ctx) error {
		return c.SendFile("./miniapp/dist/index.html")
	})
	s.app.Get("/app/*", func(c fiber.Ctx) error {
		if strings.HasPrefix(c.Path(), "/app/assets") {
			return c.Next()
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

func (s *Server) requireRuntime(c fiber.Ctx) error {
	if s.Runtime() == nil || s.Runtime().App == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "系统尚未完成初始化")
	}
	return c.Next()
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
	data["banner_url"] = "/media/banner"
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
	buf := make([]byte, file.Size)
	if _, err := src.Read(buf); err != nil && err.Error() != "EOF" {
		return fiber.NewError(fiber.StatusBadRequest, "读取横幅失败")
	}
	if err := banner.SaveAsJPEG(buf); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "仅支持 JPG、PNG、WebP 图片")
	}
	return c.JSON(fiber.Map{"status": "ok", "banner_url": "/media/banner"})
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
	item := &store.PaymentMethod{
		Driver:  req.Driver,
		Kind:    req.Kind,
		Name:    req.Name,
		Enabled: req.Enabled,
		Fields:  req.Fields,
	}
	if id := strings.TrimSpace(c.Params("id")); id != "" {
		if parsed, err := strconv.ParseInt(id, 10, 64); err == nil {
			item.ID = parsed
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
	data, err := s.Runtime().App.Store.ListMerchants()
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
	item := &store.Merchant{
		ID:          strings.TrimSpace(c.Params("id")),
		Name:        req.Name,
		CallbackURL: req.CallbackURL,
		Status:      first(req.Status, "active"),
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
	status := c.Query("status")
	limit, _ := strconv.Atoi(c.Query("limit"))
	data, err := s.Runtime().App.Orders(status, limit)
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

func (s *Server) merchantOrder(c fiber.Ctx) error {
	var req usecase.MerchantOrderRequest
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}
	order, reused, err := s.Runtime().App.CreateMerchantOrder(strings.TrimSpace(c.Get("X-Api-Key")), req)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(fiber.Map{
		"order_id":   order.ID,
		"status":     order.Status,
		"reused":     reused,
		"pay_url":    s.payURL(order.ID),
		"expire_at":  order.ExpireAt.Unix(),
		"amount":     order.FiatAmount,
		"currency":   order.FiatCurrency,
		"redirect":   order.RedirectURL,
		"created_at": order.CreatedAt.Unix(),
	})
}

func (s *Server) merchantGetOrder(c fiber.Ctx) error {
	order, err := s.Runtime().App.Order(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "订单不存在")
	}
	return c.JSON(order)
}

func (s *Server) checkout(c fiber.Ctx) error {
	data, err := s.Runtime().App.BuildCheckout(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "订单不存在")
	}
	return c.JSON(data)
}

func (s *Server) selectRoute(c fiber.Ctx) error {
	var req struct {
		MethodID int64  `json:"method_id"`
		Currency string `json:"currency"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}
	data, err := s.Runtime().App.SelectRoute(c.Params("id"), req.MethodID, req.Currency)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(data)
}

func (s *Server) checkoutStatus(c fiber.Ctx) error {
	data, err := s.Runtime().App.CheckoutStatus(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "订单不存在")
	}
	return c.JSON(data)
}

func (s *Server) payURL(orderID string) string {
	base := strings.TrimRight(strings.TrimSpace(s.cfg.Server.Public), "/")
	if base == "" {
		return "/pay/" + strings.TrimSpace(orderID)
	}
	return base + "/pay/" + strings.TrimSpace(orderID)
}

func (s *Server) telegramAuth() fiber.Handler {
	return func(c fiber.Ctx) error {
		initData := strings.TrimSpace(c.Get("X-Tg-Init-Data"))
		if initData == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "缺少 Telegram 鉴权")
		}
		userID, err := validateTelegram(initData, s.cfg.Bot.Token)
		if err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Telegram 鉴权失败")
		}
		isAdmin, err := s.Runtime().App.Store.IsAdmin(userID)
		if err != nil || !isAdmin {
			return fiber.NewError(fiber.StatusForbidden, "无权访问")
		}
		c.Locals("tg_id", userID)
		return c.Next()
	}
}

func (s *Server) merchantAuth() fiber.Handler {
	return func(c fiber.Ctx) error {
		key := strings.TrimSpace(c.Get("X-Api-Key"))
		if key == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "缺少 API Key")
		}
		merchant, err := s.Runtime().App.Store.GetMerchantByAPIKey(key)
		if err != nil || merchant == nil {
			return fiber.NewError(fiber.StatusUnauthorized, "API Key 无效")
		}
		c.Locals("merchant_id", merchant.ID)
		return c.Next()
	}
}

func validateTelegram(initData, botToken string) (int64, error) {
	values, err := url.ParseQuery(initData)
	if err != nil {
		return 0, err
	}
	hashValue := values.Get("hash")
	if hashValue == "" {
		return 0, fmt.Errorf("missing hash")
	}
	values.Del("hash")

	pairs := make([]string, 0, len(values))
	for key, items := range values {
		if len(items) == 0 {
			continue
		}
		pairs = append(pairs, key+"="+items[0])
	}
	sort.Strings(pairs)
	dataCheckString := strings.Join(pairs, "\n")

	secretMAC := hmac.New(sha256.New, []byte("WebAppData"))
	secretMAC.Write([]byte(botToken))
	secret := secretMAC.Sum(nil)

	checkMAC := hmac.New(sha256.New, secret)
	checkMAC.Write([]byte(dataCheckString))
	expected := hex.EncodeToString(checkMAC.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(hashValue)) {
		return 0, fmt.Errorf("bad hash")
	}

	authDate, _ := strconv.ParseInt(values.Get("auth_date"), 10, 64)
	if time.Since(time.Unix(authDate, 0)) > 24*time.Hour {
		return 0, fmt.Errorf("expired")
	}

	var user struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal([]byte(values.Get("user")), &user); err != nil {
		return 0, err
	}
	return user.ID, nil
}

func first(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func asSchema(reg *payments.Registry) map[string][]payments.Field {
	if reg == nil {
		return nil
	}
	return reg.Schemas()
}
