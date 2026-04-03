package httpapi

import "github.com/gofiber/fiber/v3"

func (s *Server) requireRuntime(c fiber.Ctx) error {
	if s.Runtime() == nil || s.Runtime().App == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "系统尚未完成初始化")
	}
	return c.Next()
}
