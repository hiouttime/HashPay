package httpapi

import "github.com/gofiber/fiber/v3"

func (s *Server) registerCheckoutRoutes() {
	group := s.app.Group("/api/checkout", s.requireRuntime)
	group.Get("/:id", s.checkout)
	group.Post("/:id/route", s.selectRoute)
	group.Get("/:id/status", s.checkoutStatus)
}

func (s *Server) checkout(c fiber.Ctx) error {
	data, err := s.Runtime().App.BuildCheckout(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "订单不存在")
	}
	return ok(c, data, "")
}

func (s *Server) selectRoute(c fiber.Ctx) error {
	var req struct {
		MethodID int64  `json:"method_id"`
		Currency string `json:"currency"`
	}
	if err := bindEnvelope(c, &req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}
	data, err := s.Runtime().App.SelectRoute(c.Params("id"), req.MethodID, req.Currency)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return ok(c, data, "")
}

func (s *Server) checkoutStatus(c fiber.Ctx) error {
	data, err := s.Runtime().App.CheckoutStatus(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "订单不存在")
	}
	return ok(c, data, "")
}
