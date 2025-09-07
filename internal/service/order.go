package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"hashpay/internal/database/sqlc"
	"time"

	"github.com/shopspring/decimal"
)

type OrderService struct {
	db    db.Querier
	rates *RateService
}

func NewOrderService(database db.Querier, rates *RateService) *OrderService {
	return &OrderService{
		db:    database,
		rates: rates,
	}
}

func (s *OrderService) CreateOrder(ctx context.Context, amount decimal.Decimal, currency string, siteID *string) (*db.Order, error) {
	orderID := s.genOrderID()
	now := time.Now().Unix()
	
	timeout, err := s.db.GetConfig(ctx, "timeout")
	if err != nil {
		timeout = "1800"
	}
	
	var timeoutSec int64 = 1800
	fmt.Sscanf(timeout, "%d", &timeoutSec)
	
	expireAt := now + timeoutSec
	
	order, err := s.db.CreateOrder(ctx, db.CreateOrderParams{
		ID:        orderID,
		Amount:    amount.InexactFloat64(),
		Currency:  currency,
		Status:    0,
		SiteID:    siteID,
		ExpireAt:  expireAt,
		CreatedAt: now,
		UpdatedAt: now,
	})
	
	if err != nil {
		return nil, fmt.Errorf("create order: %w", err)
	}
	
	return &order, nil
}

func (s *OrderService) GetOrder(ctx context.Context, orderID string) (*db.Order, error) {
	order, err := s.db.GetOrder(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("get order: %w", err)
	}
	return &order, nil
}

func (s *OrderService) SetPaymentMethod(ctx context.Context, orderID string, chain, currency, addr string) error {
	order, err := s.db.GetOrder(ctx, orderID)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}
	
	amount := decimal.NewFromFloat(order.Amount)
	rate := s.rates.GetRate(order.Currency, currency)
	payAmount := amount.Div(rate)
	
	now := time.Now().Unix()
	
	err = s.db.UpdateOrderStatus(ctx, db.UpdateOrderStatusParams{
		ID:        orderID,
		Status:    order.Status,
		UpdatedAt: now,
	})
	
	if err != nil {
		return fmt.Errorf("update order: %w", err)
	}
	
	return nil
}

func (s *OrderService) CheckExpired(ctx context.Context) error {
	now := time.Now().Unix()
	return s.db.ExpireOrders(ctx, db.ExpireOrdersParams{
		UpdatedAt: now,
		ExpireAt:  now,
	})
}

func (s *OrderService) genOrderID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return fmt.Sprintf("PAY%s%d", hex.EncodeToString(bytes), time.Now().Unix()%1000000)
}

func (s *OrderService) GetPendingOrders(ctx context.Context) ([]db.Order, error) {
	now := time.Now().Unix()
	return s.db.GetPendingOrders(ctx, now)
}

func (s *OrderService) GetOrdersByAddress(ctx context.Context, addr string) ([]db.Order, error) {
	now := time.Now().Unix()
	return s.db.GetOrdersByAddress(ctx, db.GetOrdersByAddressParams{
		PayAddr:  &addr,
		ExpireAt: now,
	})
}

func (s *OrderService) ConfirmOrder(ctx context.Context, orderID string, txHash string) error {
	now := time.Now().Unix()
	
	return s.db.UpdateOrderStatus(ctx, db.UpdateOrderStatusParams{
		ID:        orderID,
		Status:    1,
		TxHash:    &txHash,
		PaidAt:    &now,
		UpdatedAt: now,
	})
}