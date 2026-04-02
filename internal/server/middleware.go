package server

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
	"time"

	"hashpay/internal/pkg/log"

	"github.com/gofiber/fiber/v3"
)

// requestLogger 请求日志中间件
func requestLogger() fiber.Handler {
	return func(c fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		latency := time.Since(start)

		status := c.Response().StatusCode()
		method := c.Method()
		path := c.Path()

		switch {
		case status >= 500:
			log.Error("%s %s => %d (%s)", method, path, status, latency)
		case status >= 400:
			log.Warn("%s %s => %d (%s)", method, path, status, latency)
		default:
			log.Info("%s %s => %d (%s)", method, path, status, latency)
		}

		return err
	}
}

// requireService 检查服务是否已初始化
func (s *Server) requireService(c fiber.Ctx) error {
	h := s.Handler()
	if h == nil || h.Order == nil || h.Payment == nil || h.Admin == nil {
		return c.Status(503).JSON(fiber.Map{
			"error": "服务未初始化",
			"code":  503,
		})
	}
	return c.Next()
}

// apiKeyAuth API Key 认证中间件
func (s *Server) apiKeyAuth(c fiber.Ctx) error {
	apiKey := c.Get("X-Api-Key")
	if apiKey == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "缺少 API Key")
	}

	h := s.Handler()
	if h == nil || h.Order == nil {
		return c.Status(503).JSON(fiber.Map{
			"error": "服务未初始化",
			"code":  503,
		})
	}

	site, err := h.Order.ValidateSite(apiKey)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "无效的 API Key")
	}

	c.Locals("site_id", site.ID)
	c.Locals("site", site)
	return c.Next()
}

// telegramAuth Telegram Mini App 认证中间件
func telegramAuth(adminID int64, botToken string) fiber.Handler {
	return func(c fiber.Ctx) error {
		if adminID <= 0 || botToken == "" {
			return fiber.NewError(fiber.StatusServiceUnavailable, "管理员鉴权未配置")
		}

		initData := c.Get("X-Tg-Init-Data")
		if initData == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "未授权")
		}

		userID, err := verifyTelegramInitData(initData, botToken, time.Now())
		if err != nil {
			log.Warn("Telegram 鉴权失败: %v", err)
			return fiber.NewError(fiber.StatusUnauthorized, "未授权")
		}
		if userID != adminID {
			return fiber.NewError(fiber.StatusForbidden, "无管理员权限")
		}

		c.Locals("tg_user_id", userID)
		return c.Next()
	}
}

func verifyTelegramInitData(initData, botToken string, now time.Time) (int64, error) {
	values, err := url.ParseQuery(initData)
	if err != nil {
		return 0, fmt.Errorf("initData 解析失败")
	}

	hashHex := values.Get("hash")
	if hashHex == "" {
		return 0, fmt.Errorf("缺少 hash")
	}
	receivedHash, err := hex.DecodeString(hashHex)
	if err != nil {
		return 0, fmt.Errorf("hash 格式错误")
	}

	pairs := make([]string, 0, len(values))
	for key, items := range values {
		if key == "hash" || len(items) == 0 {
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
	calculatedHash := checkMAC.Sum(nil)

	if !hmac.Equal(calculatedHash, receivedHash) {
		return 0, fmt.Errorf("hash 校验失败")
	}

	authDateRaw := values.Get("auth_date")
	authTimestamp, err := strconv.ParseInt(authDateRaw, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("auth_date 无效")
	}
	authTime := time.Unix(authTimestamp, 0)
	if now.Sub(authTime) > 24*time.Hour || authTime.After(now.Add(1*time.Minute)) {
		return 0, fmt.Errorf("授权已过期")
	}

	userRaw := values.Get("user")
	if userRaw == "" {
		return 0, fmt.Errorf("缺少 user 信息")
	}
	var user struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal([]byte(userRaw), &user); err != nil {
		return 0, fmt.Errorf("user 解析失败")
	}
	if user.ID <= 0 {
		return 0, fmt.Errorf("user.id 无效")
	}

	return user.ID, nil
}
