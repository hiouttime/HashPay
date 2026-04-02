package handler

import (
	"fmt"

	"hashpay/internal/model"
	"hashpay/internal/service"

	"github.com/gofiber/fiber/v3"
)

type PaymentHandler struct {
	payments *service.PaymentService
	rates    *service.RateService
}

func NewPaymentHandler(payments *service.PaymentService, rates *service.RateService) *PaymentHandler {
	return &PaymentHandler{
		payments: payments,
		rates:    rates,
	}
}

// PayPage 支付页面
func (h *PaymentHandler) PayPage(c fiber.Ctx) error {
	// 返回支付页面的 HTML
	// 实际支付逻辑由前端 + API 配合完成
	return c.SendFile("./web/dist/index.html")
}

// List 获取所有支付方式
func (h *PaymentHandler) List(c fiber.Ctx) error {
	payments, err := h.payments.GetAll()
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "获取支付方式失败")
	}

	result := make([]fiber.Map, 0, len(payments))
	for _, p := range payments {
		result = append(result, fiber.Map{
			"id":         p.ID,
			"type":       p.Type,
			"chain":      p.Chain,
			"currency":   p.Currency,
			"address":    p.Address,
			"enabled":    p.Enabled,
			"created_at": p.CreatedAt.Unix(),
		})
	}

	return c.JSON(result)
}

// Add 添加支付方式
func (h *PaymentHandler) Add(c fiber.Ctx) error {
	var req struct {
		Type      string `json:"type"`
		Chain     string `json:"chain"`
		Currency  string `json:"currency"`
		Address   string `json:"address"`
		APIKey    string `json:"api_key"`
		APISecret string `json:"api_secret"`
		Config    string `json:"config"`
		Enabled   bool   `json:"enabled"`
	}

	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}

	payment, err := h.payments.Add(service.AddPaymentRequest{
		Type:      model.PaymentType(req.Type),
		Chain:     req.Chain,
		Currency:  req.Currency,
		Address:   req.Address,
		APIKey:    req.APIKey,
		APISecret: req.APISecret,
		Config:    req.Config,
		Enabled:   req.Enabled,
	})
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "添加支付方式失败")
	}

	return c.JSON(fiber.Map{
		"id":       payment.ID,
		"type":     payment.Type,
		"chain":    payment.Chain,
		"currency": payment.Currency,
		"enabled":  payment.Enabled,
	})
}

// Update 更新支付方式
func (h *PaymentHandler) Update(c fiber.Ctx) error {
	idStr := c.Params("id")
	var id int64
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "无效的 ID")
	}

	payment, err := h.payments.GetByID(id)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "支付方式不存在")
	}

	var req struct {
		Chain     string `json:"chain"`
		Currency  string `json:"currency"`
		Address   string `json:"address"`
		APIKey    string `json:"api_key"`
		APISecret string `json:"api_secret"`
		Config    string `json:"config"`
		Enabled   bool   `json:"enabled"`
	}

	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}

	payment.Chain = req.Chain
	payment.Currency = req.Currency
	payment.Address = req.Address
	payment.APIKey = req.APIKey
	payment.APISecret = req.APISecret
	payment.Config = req.Config
	payment.Enabled = req.Enabled

	if err := h.payments.Update(payment); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "更新失败")
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// Delete 删除支付方式
func (h *PaymentHandler) Delete(c fiber.Ctx) error {
	idStr := c.Params("id")
	var id int64
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "无效的 ID")
	}

	if err := h.payments.Delete(id); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "删除失败")
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// Toggle 切换启用状态
func (h *PaymentHandler) Toggle(c fiber.Ctx) error {
	idStr := c.Params("id")
	var id int64
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "无效的 ID")
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}

	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}

	if err := h.payments.Toggle(id, req.Enabled); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "更新失败")
	}

	return c.JSON(fiber.Map{"status": "ok"})
}
