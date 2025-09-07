package api

import (
	"strings"

	"github.com/gofiber/fiber/v3"
)

// 商户 API 认证
func (s *Server) authMiddleware(c fiber.Ctx) error {
	apiKey := c.Get("X-Api-Key")
	if apiKey == "" {
		return fiber.NewError(401, "缺少 API Key")
	}
	
	_, err := s.db.GetSiteByKey(apiKey)
	if err != nil {
		return fiber.NewError(401, "API Key 无效")
	}
	
	return c.Next()
}

// 内部 API 认证
func (s *Server) internalAuth(c fiber.Ctx) error {
	// 检查请求来源
	auth := c.Get("Authorization")
	if auth == "" {
		return fiber.NewError(401, "未授权")
	}
	
	// 验证 Token
	token := strings.TrimPrefix(auth, "Bearer ")
	if token == "" {
		return fiber.NewError(401, "Token 无效")
	}
	
	// TODO: 验证 Mini App 的 JWT Token
	
	return c.Next()
}

// 错误处理
func errorHandler(c fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	message := "服务器错误"
	
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		message = e.Message
	}
	
	return c.Status(code).JSON(fiber.Map{
		"error": message,
		"code":  code,
	})
}