package handler

import (
	"fmt"

	"hashpay/internal/model"
	"hashpay/internal/service"

	"github.com/gofiber/fiber/v3"
)

type OrderHandler struct {
	orders   *service.OrderService
	payments *service.PaymentService
	rates    *service.RateService
}

func NewOrderHandler(orders *service.OrderService, payments *service.PaymentService, rates *service.RateService) *OrderHandler {
	return &OrderHandler{
		orders:   orders,
		payments: payments,
		rates:    rates,
	}
}

// Create 创建订单
func (h *OrderHandler) Create(c fiber.Ctx) error {
	var req struct {
		Amount   float64 `json:"amount"`
		Currency string  `json:"currency"`
		Callback string  `json:"callback"`
	}

	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}

	if req.Amount <= 0 {
		return fiber.NewError(fiber.StatusBadRequest, "金额无效")
	}

	// 从中间件获取站点信息
	siteID := c.Locals("site_id").(string)

	order, err := h.orders.Create(service.CreateOrderRequest{
		Amount:   req.Amount,
		Currency: req.Currency,
		SiteID:   siteID,
		Callback: req.Callback,
	})
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "创建订单失败")
	}

	return c.JSON(fiber.Map{
		"order_id":  order.ID,
		"pay_url":   fmt.Sprintf("/pay/%s", order.ID),
		"amount":    order.Amount,
		"currency":  order.Currency,
		"expire_at": order.ExpireAt.Unix(),
	})
}

// Get 获取订单详情
func (h *OrderHandler) Get(c fiber.Ctx) error {
	orderID := c.Params("orderId")

	order, err := h.orders.GetByID(orderID)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "订单不存在")
	}

	return c.JSON(fiber.Map{
		"order_id":   order.ID,
		"amount":     order.Amount,
		"currency":   order.Currency,
		"status":     order.Status.String(),
		"tx_hash":    order.TxHash,
		"paid_at":    order.PaidAt.Unix(),
		"expire_at":  order.ExpireAt.Unix(),
		"created_at": order.CreatedAt.Unix(),
	})
}

// GetPaymentMethods 获取订单可用支付方式
func (h *OrderHandler) GetPaymentMethods(c fiber.Ctx) error {
	orderID := c.Params("orderId")

	order, err := h.orders.GetByID(orderID)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "订单不存在")
	}

	payments, err := h.payments.GetEnabled()
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "获取支付方式失败")
	}

	methods := make([]fiber.Map, 0, len(payments))
	for _, p := range payments {
		rate := h.rates.GetRate(order.Currency, p.Currency)
		payAmount := h.rates.Convert(order.Amount, order.Currency, p.Currency)

		methods = append(methods, fiber.Map{
			"id":       p.ID,
			"type":     p.Type,
			"chain":    p.Chain,
			"currency": p.Currency,
			"name":     p.DisplayName(),
			"rate":     rate.InexactFloat64(),
			"amount":   payAmount.InexactFloat64(),
		})
	}

	return c.JSON(methods)
}

// SelectPayment 选择支付方式
func (h *OrderHandler) SelectPayment(c fiber.Ctx) error {
	orderID := c.Params("orderId")

	var req struct {
		MethodID int64 `json:"method_id"`
	}

	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}

	order, err := h.orders.GetByID(orderID)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "订单不存在")
	}

	payment, err := h.payments.GetByID(req.MethodID)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "支付方式不存在")
	}

	payAmount := h.rates.Convert(order.Amount, order.Currency, payment.Currency)

	// 更新订单支付信息
	err = h.orders.SetPayment(orderID, payment.Chain, payment.Currency, payment.Address, payAmount.InexactFloat64())
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "更新订单失败")
	}

	response := fiber.Map{
		"currency": payment.Currency,
		"amount":   payAmount.InexactFloat64(),
		"chain":    payment.Chain,
	}

	if payment.IsBlockchain() {
		response["address"] = payment.Address
	} else {
		response["redirect_url"] = fmt.Sprintf("/pay/%s/redirect", orderID)
	}

	return c.JSON(response)
}

// CheckStatus 检查订单状态
func (h *OrderHandler) CheckStatus(c fiber.Ctx) error {
	orderID := c.Params("orderId")

	order, err := h.orders.GetByID(orderID)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "订单不存在")
	}

	return c.JSON(fiber.Map{
		"status":  order.Status.String(),
		"tx_hash": order.TxHash,
		"paid_at": order.PaidAt.Unix(),
	})
}

// ValidateSite 验证站点 API Key
func (h *OrderHandler) ValidateSite(apiKey string) (*model.Site, error) {
	return h.orders.ValidateAPIKey(apiKey)
}
