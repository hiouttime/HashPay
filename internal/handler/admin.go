package handler

import (
	"sort"
	"strconv"

	"hashpay/internal/service"

	"github.com/gofiber/fiber/v3"
)

type AdminHandler struct {
	config   *service.ConfigService
	payments *service.PaymentService
	stats    *service.StatsService
	orders   *service.OrderService
	sites    *service.SiteService
}

func NewAdminHandler(config *service.ConfigService, payments *service.PaymentService, stats *service.StatsService, orders *service.OrderService, sites *service.SiteService) *AdminHandler {
	return &AdminHandler{
		config:   config,
		payments: payments,
		stats:    stats,
		orders:   orders,
		sites:    sites,
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

// GetOverview 获取运营概览（管理用）
func (h *AdminHandler) GetOverview(c fiber.Ctx) error {
	rangeKey := c.Query("range")
	overview, err := h.stats.GetOverview(rangeKey)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "获取运营概览失败")
	}

	siteNameMap := map[string]string{}
	sites, err := h.sites.GetAll()
	if err == nil {
		for _, s := range sites {
			siteNameMap[s.ID] = s.Name
		}
	}

	methodStats := make([]fiber.Map, 0, len(overview.MethodStats))
	for _, item := range overview.MethodStats {
		methodStats = append(methodStats, fiber.Map{
			"method": item.Method,
			"amount": item.Amount,
			"count":  item.Count,
		})
	}

	siteStats := make([]fiber.Map, 0, len(overview.SiteStats))
	for _, item := range overview.SiteStats {
		siteStats = append(siteStats, fiber.Map{
			"site_id":   item.SiteID,
			"site_name": siteNameMap[item.SiteID],
			"amount":    item.Amount,
		})
	}

	trend := make([]fiber.Map, 0, len(overview.Trend))
	for _, item := range overview.Trend {
		trend = append(trend, fiber.Map{
			"label":           item.Label,
			"current_orders":  item.CurrentOrders,
			"previous_orders": item.PreviousOrders,
			"current_amount":  item.CurrentAmount,
			"previous_amount": item.PreviousAmount,
		})
	}

	return c.JSON(fiber.Map{
		"range": fiber.Map{
			"key":            overview.Range.Key,
			"start":          overview.Range.Start.Unix(),
			"end":            overview.Range.End.Unix(),
			"previous_start": overview.Range.PreviousStart.Unix(),
			"previous_end":   overview.Range.PreviousEnd.Unix(),
		},
		"current": fiber.Map{
			"orders": overview.Current.OrderCount,
			"amount": overview.Current.PaidAmount,
		},
		"previous": fiber.Map{
			"orders": overview.Previous.OrderCount,
			"amount": overview.Previous.PaidAmount,
		},
		"payment_methods": methodStats,
		"sites":           siteStats,
		"trend":           trend,
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
		coins := decodePaymentCoins(p.Config, p.Currency)
		result = append(result, fiber.Map{
			"id":         p.ID,
			"type":       p.Type,
			"name":       p.Name,
			"platform":   p.Chain,
			"coins":      coins,
			"address":    p.Address,
			"enabled":    p.Enabled,
			"created_at": p.CreatedAt.Unix(),
			"updated_at": p.UpdatedAt.Unix(),
		})
	}

	return c.JSON(result)
}

// GetOrders 获取订单列表（管理用）
func (h *AdminHandler) GetOrders(c fiber.Ctx) error {
	orders, err := h.orders.GetAll()
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "获取订单失败")
	}

	sort.Slice(orders, func(i, j int) bool {
		return orders[i].CreatedAt.After(orders[j].CreatedAt)
	})

	limit := 20
	if limitRaw := c.Query("limit"); limitRaw != "" {
		parsed, parseErr := strconv.Atoi(limitRaw)
		if parseErr == nil && parsed > 0 {
			if parsed > 100 {
				parsed = 100
			}
			limit = parsed
		}
	}
	if len(orders) > limit {
		orders = orders[:limit]
	}

	result := make([]fiber.Map, 0, len(orders))
	for _, o := range orders {
		result = append(result, fiber.Map{
			"id":         o.ID,
			"amount":     o.Amount,
			"currency":   o.Currency,
			"status":     o.Status.String(),
			"site_id":    o.SiteID,
			"pay_chain":  o.PayChain,
			"created_at": o.CreatedAt.Unix(),
			"updated_at": o.UpdatedAt.Unix(),
		})
	}

	return c.JSON(result)
}

// GetSites 获取商户列表（管理用）
func (h *AdminHandler) GetSites(c fiber.Ctx) error {
	sites, err := h.sites.GetAll()
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "获取商户失败")
	}

	sort.Slice(sites, func(i, j int) bool {
		return sites[i].CreatedAt.After(sites[j].CreatedAt)
	})

	result := make([]fiber.Map, 0, len(sites))
	for _, s := range sites {
		result = append(result, fiber.Map{
			"id":         s.ID,
			"name":       s.Name,
			"api_key":    maskSecret(s.APIKey),
			"callback":   s.Callback,
			"created_at": s.CreatedAt.Unix(),
			"updated_at": s.UpdatedAt.Unix(),
		})
	}

	return c.JSON(result)
}

// AddSite 创建商户（管理用）
func (h *AdminHandler) AddSite(c fiber.Ctx) error {
	var req struct {
		Name     string `json:"name"`
		Callback string `json:"callback"`
		APIKey   string `json:"api_key"`
	}

	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}

	site, err := h.sites.Create(req.Name, req.Callback, req.APIKey)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "创建商户失败")
	}

	return c.JSON(fiber.Map{
		"id":         site.ID,
		"name":       site.Name,
		"api_key":    site.APIKey,
		"callback":   site.Callback,
		"created_at": site.CreatedAt.Unix(),
		"updated_at": site.UpdatedAt.Unix(),
	})
}

// DeleteSite 删除商户（管理用）
func (h *AdminHandler) DeleteSite(c fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return fiber.NewError(fiber.StatusBadRequest, "商户 ID 不能为空")
	}

	if err := h.sites.Delete(id); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "删除商户失败")
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// UpdateSite 更新商户（管理用）
func (h *AdminHandler) UpdateSite(c fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return fiber.NewError(fiber.StatusBadRequest, "商户 ID 不能为空")
	}

	var req struct {
		Name     string `json:"name"`
		Callback string `json:"callback"`
		APIKey   string `json:"api_key"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}

	site, err := h.sites.Update(id, req.Name, req.Callback, req.APIKey)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "更新商户失败")
	}

	return c.JSON(fiber.Map{
		"id":         site.ID,
		"name":       site.Name,
		"api_key":    maskSecret(site.APIKey),
		"callback":   site.Callback,
		"created_at": site.CreatedAt.Unix(),
		"updated_at": site.UpdatedAt.Unix(),
	})
}

func maskSecret(s string) string {
	if len(s) <= 8 {
		return "****"
	}
	return s[:4] + "****" + s[len(s)-4:]
}
