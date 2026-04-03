package httpapi

import (
	"strings"

	"github.com/gofiber/fiber/v3"
)

func (s *Server) merchantAuth() fiber.Handler {
	return func(c fiber.Ctx) error {
		key := strings.TrimSpace(c.Get("X-Api-Key"))
		if key == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "缺少 API Key")
		}
		merchant, err := s.Runtime().App.MerchantByAPIKey(key)
		if err != nil || merchant == nil {
			return fiber.NewError(fiber.StatusUnauthorized, "API Key 无效")
		}
		c.Locals("merchant_id", merchant.ID)
		return c.Next()
	}
}
