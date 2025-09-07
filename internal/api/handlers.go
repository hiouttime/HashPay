package api

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"hashpay/internal/database"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/shopspring/decimal"
)

// 生成订单ID
func genOrderID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return fmt.Sprintf("PAY%s", hex.EncodeToString(bytes))
}

// 健康检查
func (s *Server) handleHealth(c fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status": "ok",
		"time":   time.Now().Unix(),
	})
}

// 支付页面
func (s *Server) handlePaymentPage(c fiber.Ctx) error {
	orderID := c.Params("orderId")
	
	order, err := s.db.GetOrder(orderID)
	if err != nil {
		return c.Status(404).SendString("订单不存在")
	}
	
	// TODO: 使用内嵌的 HTML 模板
	return c.JSON(fiber.Map{
		"orderID":  order.ID,
		"amount":   order.Amount,
		"currency": order.Currency,
		"status":   order.Status,
		"expireAt": order.ExpireAt,
	})
}

// 创建订单
func (s *Server) handleCreateOrder(c fiber.Ctx) error {
	var req struct {
		Amount   float64 `json:"amount"`
		Currency string  `json:"currency"`
		Callback string  `json:"callback"`
		Notify   string  `json:"notify"`
	}
	
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(400, "请求格式错误")
	}
	
	if req.Amount <= 0 {
		return fiber.NewError(400, "金额无效")
	}
	
	apiKey := c.Get("X-Api-Key")
	
	// 验证 API Key
	site, err := s.db.GetSiteByKey(apiKey)
	if err != nil {
		return fiber.NewError(401, "API Key 无效")
	}
	
	// 获取超时设置
	timeout, _ := s.db.GetConfig("timeout")
	if timeout == "" {
		timeout = "1800"
	}
	var timeoutSec int64 = 1800
	fmt.Sscanf(timeout, "%d", &timeoutSec)
	
	now := time.Now().Unix()
	orderID := genOrderID()
	
	// 创建订单
	order := &database.Order{
		ID:        orderID,
		Amount:    req.Amount,
		Currency:  req.Currency,
		Status:    sql.NullInt64{Int64: 0, Valid: true},
		SiteID:    sql.NullString{String: site.ID, Valid: true},
		Callback:  sql.NullString{String: req.Callback, Valid: true},
		ExpireAt:  now + timeoutSec,
		CreatedAt: now,
		UpdatedAt: now,
	}
	
	err = s.db.CreateOrder(order)
	
	if err != nil {
		return fiber.NewError(500, "创建订单失败")
	}
	
	return c.JSON(fiber.Map{
		"order_id":  order.ID,
		"pay_url":   fmt.Sprintf("/pay/%s", order.ID),
		"amount":    order.Amount,
		"currency":  order.Currency,
		"expire_at": order.ExpireAt,
	})
}

// 查询订单
func (s *Server) handleGetOrder(c fiber.Ctx) error {
	orderID := c.Params("orderId")
	
	order, err := s.db.GetOrder(orderID)
	if err != nil {
		return fiber.NewError(404, "订单不存在")
	}
	
	return c.JSON(fiber.Map{
		"order_id":   order.ID,
		"amount":     order.Amount,
		"currency":   order.Currency,
		"status":     order.Status,
		"tx_hash":    order.TxHash,
		"paid_at":    order.PaidAt,
		"expire_at":  order.ExpireAt,
		"created_at": order.CreatedAt,
	})
}

// 获取支付方式
func (s *Server) handleGetPaymentMethods(c fiber.Ctx) error {
	orderID := c.Params("orderId")
	
	order, err := s.db.GetOrder(orderID)
	if err != nil {
		return fiber.NewError(404, "订单不存在")
	}
	
	// 获取启用的支付方式
	// 获取启用的支付方式
	payments, err := s.db.GetEnabledPayments()
	if err != nil {
		return fiber.NewError(500, "获取支付方式失败")
	}
	
	// 获取汇率
	baseCurrency := order.Currency
	methods := []fiber.Map{}
	
	for _, p := range payments {
		// 计算支付金额
		rate := getRate(baseCurrency, p.Currency.String)
		payAmount := decimal.NewFromFloat(order.Amount).Div(decimal.NewFromFloat(rate))
		
		method := fiber.Map{
			"id":       p.ID,
			"type":     p.Type,
			"chain":    p.Chain,
			"currency": p.Currency,
			"name":     getPaymentName(p),
			"rate":     rate,
			"amount":   payAmount.InexactFloat64(),
		}
		methods = append(methods, method)
	}
	
	return c.JSON(methods)
}

// 选择支付方式
func (s *Server) handleSelectPayment(c fiber.Ctx) error {
	orderID := c.Params("orderId")
	
	var req struct {
		MethodID int64 `json:"method_id"`
	}
	
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(400, "请求格式错误")
	}
	
	// 获取订单
	order, err := s.db.GetOrder(orderID)
	if err != nil {
		return fiber.NewError(404, "订单不存在")
	}
	
	// 获取支付方式
	// 获取所有支付方式并查找
	payments, err := s.db.GetAllPayments()
	if err != nil {
		return fiber.NewError(500, "获取支付方式失败")
	}
	
	var payment *database.Payment
	for _, p := range payments {
		if p.ID == req.MethodID {
			payment = &p
			break
		}
	}
	
	if payment == nil {
		return fiber.NewError(404, "支付方式不存在")
	}
	
	// 计算支付金额
	rate := getRate(order.Currency, payment.Currency.String)
	payAmount := decimal.NewFromFloat(order.Amount).Div(decimal.NewFromFloat(rate))
	
	// 更新订单
	// TODO: 实现 UpdateOrderPayment 方法
	// 暂时只更新状态
	err = s.db.UpdateOrderStatus(orderID, 0, "")
	
	if err != nil {
		return fiber.NewError(500, "更新订单失败")
	}
	
	// 返回支付信息
	response := fiber.Map{
		"currency": payment.Currency,
		"amount":   payAmount.InexactFloat64(),
		"chain":    payment.Chain,
	}
	
	if payment.Type == "blockchain" {
		response["address"] = payment.Address
	} else if payment.Type == "exchange" {
		// TODO: 生成交易所支付链接
		response["redirect_url"] = fmt.Sprintf("/exchange/pay/%s", orderID)
	} else if payment.Type == "wallet" {
		// TODO: 生成钱包支付链接
		response["redirect_url"] = fmt.Sprintf("/wallet/pay/%s", orderID)
	}
	
	return c.JSON(response)
}

// 检查订单状态
func (s *Server) handleCheckStatus(c fiber.Ctx) error {
	orderID := c.Params("orderId")
	
	order, err := s.db.GetOrder(orderID)
	if err != nil {
		return fiber.NewError(404, "订单不存在")
	}
	
	status := "pending"
	if order.Status.Valid {
		switch order.Status.Int64 {
		case 1:
			status = "paid"
		case 2:
			status = "expired"
		case 3:
			status = "failed"
		}
	}
	
	return c.JSON(fiber.Map{
		"status": status,
		"tx_hash": order.TxHash,
		"paid_at": order.PaidAt,
	})
}

// Webhook 处理
func (s *Server) handleWebhook(c fiber.Ctx) error {
	// TODO: 处理第三方回调
	return c.JSON(fiber.Map{"status": "ok"})
}

// 获取配置
func (s *Server) handleGetConfig(c fiber.Ctx) error {
	configs, err := s.db.GetAllConfigs()
	if err != nil {
		return fiber.NewError(500, "获取配置失败")
	}
	
	result := make(map[string]string)
	for _, cfg := range configs {
		result[cfg.Key] = cfg.Value
	}
	
	return c.JSON(result)
}

// 更新配置
func (s *Server) handleUpdateConfig(c fiber.Ctx) error {
	var req map[string]string
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(400, "请求格式错误")
	}
	
	for key, value := range req {
		err := s.db.SetConfig(key, value)
		if err != nil {
			return fiber.NewError(500, fmt.Sprintf("更新配置 %s 失败", key))
		}
	}
	
	return c.JSON(fiber.Map{"status": "ok"})
}

// 获取支付方式列表
func (s *Server) handleGetPayments(c fiber.Ctx) error {
	payments, err := s.db.GetAllPayments()
	if err != nil {
		return fiber.NewError(500, "获取支付方式失败")
	}
	
	return c.JSON(payments)
}

// 添加支付方式
func (s *Server) handleAddPayment(c fiber.Ctx) error {
	var req struct {
		Type      string  `json:"type"`
		Chain     string  `json:"chain"`
		Currency  string  `json:"currency"`
		Address   string  `json:"address"`
		APIKey    string  `json:"api_key"`
		APISecret string  `json:"api_secret"`
		Config    string  `json:"config"`
		Enabled   bool    `json:"enabled"`
	}
	
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(400, "请求格式错误")
	}
	
	now := time.Now().Unix()
	
	enabled := int64(0)
	if req.Enabled {
		enabled = 1
	}
	
	payment := &database.Payment{
		Type:      req.Type,
		Chain:     sql.NullString{String: req.Chain, Valid: req.Chain != ""},
		Currency:  sql.NullString{String: req.Currency, Valid: req.Currency != ""},
		Address:   sql.NullString{String: req.Address, Valid: req.Address != ""},
		ApiKey:    sql.NullString{String: req.APIKey, Valid: req.APIKey != ""},
		ApiSecret: sql.NullString{String: req.APISecret, Valid: req.APISecret != ""},
		Config:    sql.NullString{String: req.Config, Valid: req.Config != ""},
		Enabled:   sql.NullInt64{Int64: enabled, Valid: true},
		CreatedAt: now,
		UpdatedAt: now,
	}
	
	err := s.db.CreatePayment(payment)
	
	if err != nil {
		return fiber.NewError(500, "添加支付方式失败")
	}
	
	return c.JSON(payment)
}

// 获取统计信息
func (s *Server) handleGetStats(c fiber.Ctx) error {
	// 今日统计
	today := time.Now().Truncate(24 * time.Hour).Unix()
	todayOrders, _ := s.db.GetOrdersAfter(today)
	
	var todayAmount float64
	var todayCount int
	for _, order := range todayOrders {
		if order.Status.Valid && order.Status.Int64 == 1 { // 已支付
			todayAmount += order.Amount
			todayCount++
		}
	}
	
	// 总计统计
	totalOrders, _ := s.db.GetAllOrders()
	var totalAmount float64
	var totalCount int
	for _, order := range totalOrders {
		if order.Status.Valid && order.Status.Int64 == 1 {
			totalAmount += order.Amount
			totalCount++
		}
	}
	
	return c.JSON(fiber.Map{
		"today": fiber.Map{
			"amount": todayAmount,
			"count":  todayCount,
		},
		"total": fiber.Map{
			"amount": totalAmount,
			"count":  totalCount,
		},
	})
}

// 辅助函数：获取汇率
func getRate(from, to string) float64 {
	// TODO: 实现汇率获取逻辑
	// 暂时返回固定汇率
	rates := map[string]map[string]float64{
		"CNY": {
			"USDT": 7.2,
			"USDC": 7.2,
			"TRX":  0.5,
			"TON":  45.0,
		},
		"USD": {
			"USDT": 1.0,
			"USDC": 1.0,
			"TRX":  0.07,
			"TON":  6.5,
		},
	}
	
	if rateMap, ok := rates[from]; ok {
		if rate, ok := rateMap[to]; ok {
			return rate
		}
	}
	
	return 1.0
}

// 辅助函数：获取支付方式名称
func getPaymentName(p database.Payment) string {
	if p.Type == "blockchain" {
		return fmt.Sprintf("%s (%s)", p.Chain.String, p.Currency.String)
	} else if p.Type == "exchange" {
		return "OKX 交易所"
	} else if p.Type == "wallet" {
		if p.Chain.String == "Huione" {
			return "汇旺钱包"
		}
		return "OKPay 钱包"
	}
	return "未知"
}