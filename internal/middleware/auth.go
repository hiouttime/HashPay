package middleware

import (
	"context"
	"hashpay/internal/database/sqlc"
	"hashpay/internal/utils"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
)

func AuthMiddleware(db db.Querier) fiber.Handler {
	return func(c *fiber.Ctx) error {
		apiKey := c.Get("X-Api-Key")
		if apiKey == "" {
			return c.Status(401).JSON(utils.NewErrorResponse(utils.ErrUnauthorized))
		}
		
		ctx := context.Background()
		site, err := db.GetSiteByKey(ctx, apiKey)
		if err != nil {
			utils.Warn("Invalid API key attempt", "key", apiKey, "ip", c.IP())
			return c.Status(401).JSON(utils.NewErrorResponse(utils.ErrAPIInvalidKey))
		}
		
		// 存储站点信息到上下文
		c.Locals("site", site)
		c.Locals("site_id", site.ID)
		
		return c.Next()
	}
}

func AdminAuthMiddleware(db db.Querier) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := c.Get("Authorization")
		if !strings.HasPrefix(token, "Bearer ") {
			return c.Status(401).JSON(utils.NewErrorResponse(utils.ErrUnauthorized))
		}
		
		// TODO: 验证 Telegram Mini App 的 initData
		// 这里需要验证 Telegram 提供的签名
		
		return c.Next()
	}
}

func RateLimitMiddleware(limit int, window time.Duration) fiber.Handler {
	type visitor struct {
		lastSeen time.Time
		count    int
	}
	
	visitors := make(map[string]*visitor)
	
	return func(c *fiber.Ctx) error {
		ip := c.IP()
		now := time.Now()
		
		v, exists := visitors[ip]
		if !exists {
			visitors[ip] = &visitor{lastSeen: now, count: 1}
			return c.Next()
		}
		
		if now.Sub(v.lastSeen) > window {
			v.count = 1
			v.lastSeen = now
			return c.Next()
		}
		
		v.count++
		if v.count > limit {
			utils.Warn("Rate limit exceeded", "ip", ip)
			return c.Status(429).JSON(utils.NewErrorResponse(utils.ErrTooManyRequests))
		}
		
		return c.Next()
	}
}