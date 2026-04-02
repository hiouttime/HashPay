package handler

import (
	"hashpay/internal/service"

	"github.com/gofiber/fiber/v3"
)

type AdminHandler struct {
	config   *service.ConfigService
	payments *service.PaymentService
	stats    *service.StatsService
}

func NewAdminHandler(config *service.ConfigService, payments *service.PaymentService, stats *service.StatsService) *AdminHandler {
	return &AdminHandler{
		config:   config,
		payments: payments,
		stats:    stats,
	}
}

// GetConfig 获取所有配置
func (h *AdminHandler) GetConfig(c fiber.Ctx) error {
	configs, err := h.config.GetAll()
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "获取配置失败")
	}
	return c.JSON(configs)
}

// UpdateConfig 更新配置
func (h *AdminHandler) UpdateConfig(c fiber.Ctx) error {
	var req map[string]string
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}

	for key, value := range req {
		if err := h.config.Set(key, value); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "更新配置失败")
		}
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// GetStats 获取统计数据
func (h *AdminHandler) GetStats(c fiber.Ctx) error {
	stats, err := h.stats.Get()
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "获取统计失败")
	}

	return c.JSON(fiber.Map{
		"today": fiber.Map{
			"amount": stats.TodayAmount,
			"count":  stats.TodayCount,
		},
		"total": fiber.Map{
			"amount": stats.TotalAmount,
			"count":  stats.TotalCount,
		},
	})
}

// GetPayments 获取所有支付方式（管理用）
func (h *AdminHandler) GetPayments(c fiber.Ctx) error {
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
			"api_key":    maskSecret(p.APIKey),
			"enabled":    p.Enabled,
			"created_at": p.CreatedAt.Unix(),
			"updated_at": p.UpdatedAt.Unix(),
		})
	}

	return c.JSON(result)
}

func maskSecret(s string) string {
	if len(s) <= 8 {
		return "****"
	}
	return s[:4] + "****" + s[len(s)-4:]
}
