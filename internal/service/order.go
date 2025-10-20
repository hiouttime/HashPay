package service

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"hashpay/internal/database"
	"time"

	"github.com/shopspring/decimal"
)

type OrderService struct {
	db    *database.DB
	rates *RateService
}

func NewOrderService(database *database.DB, rates *RateService) *OrderService {
	return &OrderService{
		db:    database,
		rates: rates,
	}
}

func (s *OrderService) CreateOrder(ctx context.Context, amount decimal.Decimal, currency string, siteID *string) (*database.Order, error) {
	orderID := s.genOrderID()
	now := time.Now().Unix()
	
	timeout, err := s.db.GetConfig("timeout")
	if err != nil {
		timeout = "1800"
	}
	
	var timeoutSec int64 = 1800
	fmt.Sscanf(timeout, "%d", &timeoutSec)
	
	expireAt := now + timeoutSec
	
	order := &database.Order{
		ID:        orderID,
		Amount:    amount.InexactFloat64(),
		Currency:  currency,
		Status:    sql.NullInt64{Int64: 0, Valid: true},
		ExpireAt:  expireAt,
		CreatedAt: now,
		UpdatedAt: now,
	}
	
	if siteID != nil {
		order.SiteID = sql.NullString{String: *siteID, Valid: true}
	}
	
	err = s.db.CreateOrder(order)
	if err != nil {
		return nil, fmt.Errorf("create order: %w", err)
	}
	
	return order, nil
}

func (s *OrderService) GetOrder(ctx context.Context, orderID string) (*database.Order, error) {
	order, err := s.db.GetOrder(orderID)
	if err != nil {
		return nil, fmt.Errorf("get order: %w", err)
	}
	return order, nil
}

func (s *OrderService) SetPaymentMethod(ctx context.Context, orderID string, chain, currency, addr string) error {
	order, err := s.db.GetOrder(orderID)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}
	
	amount := decimal.NewFromFloat(order.Amount)
	rate := s.rates.GetRate(order.Currency, currency)
	payAmount := amount.Div(rate)
	
	// 更新订单支付信息
	order.PayChain = sql.NullString{String: chain, Valid: true}
	order.PayCurrency = sql.NullString{String: currency, Valid: true}
	order.PayAddr = sql.NullString{String: addr, Valid: true}
	order.PayAmount = sql.NullFloat64{Float64: payAmount.InexactFloat64(), Valid: true}
	order.UpdatedAt = time.Now().Unix()
	
	// TODO: 实现更新订单支付方式的方法
	return nil
}

func (s *OrderService) CheckExpired(ctx context.Context) error {
	// TODO: 实现过期订单检查
	return nil
}

func (s *OrderService) genOrderID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return fmt.Sprintf("PAY%s%d", hex.EncodeToString(bytes), time.Now().Unix()%1000000)
}

func (s *OrderService) GetPendingOrders(ctx context.Context) ([]*database.Order, error) {
	orders, err := s.db.GetPendingOrders()
	if err != nil {
		return nil, err
	}
	
	// 转换为指针切片
	result := make([]*database.Order, len(orders))
	for i := range orders {
		result[i] = &orders[i]
	}
	return result, nil
}

func (s *OrderService) GetOrdersByAddress(ctx context.Context, addr string) ([]*database.Order, error) {
	// TODO: 实现按地址获取订单
	return nil, nil
}

func (s *OrderService) ConfirmOrder(ctx context.Context, orderID string, txHash string) error {
	return s.db.UpdateOrderStatus(orderID, 1, txHash)
}