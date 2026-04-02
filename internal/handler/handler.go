package handler

import (
	"hashpay/internal/service"
)

// Handler 聚合所有 HTTP 处理器
type Handler struct {
	Order   *OrderHandler
	Payment *PaymentHandler
	Admin   *AdminHandler
	Init    *InitHandler
}

// Services 服务依赖
type Services struct {
	Order   *service.OrderService
	Payment *service.PaymentService
	Rate    *service.RateService
	Stats   *service.StatsService
	User    *service.UserService
	Config  *service.ConfigService
	Site    *service.SiteService
}

// New 创建 Handler 实例
func New(svc *Services) *Handler {
	h := &Handler{
		Init: NewInitHandler(nil, nil),
	}

	if svc != nil {
		h.Order = NewOrderHandler(svc.Order, svc.Payment, svc.Rate)
		h.Payment = NewPaymentHandler(svc.Payment, svc.Rate)
		h.Admin = NewAdminHandler(svc.Config, svc.Payment, svc.Stats, svc.Order, svc.Site)
		h.Init = NewInitHandler(svc.Config, svc.User)
	}

	return h
}
