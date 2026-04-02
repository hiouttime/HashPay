package service

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"hashpay/internal/model"
	"hashpay/internal/repository"
)

type OrderService struct {
	orders *repository.OrderRepo
	sites  *repository.SiteRepo
	config *repository.ConfigRepo
}

func NewOrderService(orders *repository.OrderRepo, sites *repository.SiteRepo, config *repository.ConfigRepo) *OrderService {
	return &OrderService{
		orders: orders,
		sites:  sites,
		config: config,
	}
}

type CreateOrderRequest struct {
	Amount   float64
	Currency string
	SiteID   string
	Callback string
}

func (s *OrderService) Create(req CreateOrderRequest) (*model.Order, error) {
	timeout := s.getTimeout()
	now := time.Now()
	currency := strings.ToUpper(strings.TrimSpace(req.Currency))

	order := &model.Order{
		ID:        generateOrderID(),
		Amount:    req.Amount,
		Currency:  currency,
		Status:    model.OrderPending,
		SiteID:    req.SiteID,
		Callback:  req.Callback,
		ExpireAt:  now.Add(timeout),
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.orders.Create(order); err != nil {
		return nil, err
	}

	return order, nil
}

func (s *OrderService) GetByID(id string) (*model.Order, error) {
	return s.orders.GetByID(id)
}

func (s *OrderService) GetPending() ([]model.Order, error) {
	return s.orders.GetPending()
}

func (s *OrderService) GetAll() ([]model.Order, error) {
	return s.orders.GetAll()
}

func (s *OrderService) SetPayment(orderID string, chain, currency, addr string, amount float64) error {
	return s.orders.UpdatePayment(orderID, chain, strings.ToUpper(strings.TrimSpace(currency)), addr, amount)
}

func (s *OrderService) ClearPayment(orderID string) error {
	return s.orders.ClearPayment(orderID)
}

func (s *OrderService) MarkPaid(orderID, txHash string) error {
	return s.orders.UpdateStatus(orderID, model.OrderPaid, txHash)
}

func (s *OrderService) MarkExpired(orderID string) error {
	return s.orders.UpdateStatus(orderID, model.OrderExpired, "")
}

func (s *OrderService) ExpirePending() (int64, error) {
	return s.orders.ExpirePending(time.Now().Unix())
}

func (s *OrderService) RefreshExpire(orderID string) (time.Time, error) {
	expireAt := time.Now().Add(s.getTimeout())
	if err := s.orders.RefreshExpire(orderID, expireAt.Unix()); err != nil {
		return time.Time{}, err
	}
	return expireAt, nil
}

func (s *OrderService) ValidateAPIKey(apiKey string) (*model.Site, error) {
	return s.sites.GetByAPIKey(apiKey)
}

func (s *OrderService) getTimeout() time.Duration {
	val, _ := s.config.Get("timeout")
	if val == "" {
		return 30 * time.Minute
	}
	var sec int64
	fmt.Sscanf(val, "%d", &sec)
	if sec <= 0 {
		return 30 * time.Minute
	}
	return time.Duration(sec) * time.Second
}

func generateOrderID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return strings.ToUpper(hex.EncodeToString(bytes))
}
