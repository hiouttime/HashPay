package httpapi

import (
	"strings"

	"hashpay/internal/service"

	"github.com/gofiber/fiber/v3"
)

func (s *Server) registerMerchantRoutes() {
	group := s.app.Group("/api/merchant", s.requireRuntime)
	group.Post("/orders", s.merchantOrder)
	group.Get("/orders/:id", s.merchantAuth(), s.merchantGetOrder)
}

func (s *Server) merchantOrder(c fiber.Ctx) error {
	var req service.MerchantOrderRequest
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
		"pay_url":    c.BaseURL() + "/pay/" + order.ID,
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
