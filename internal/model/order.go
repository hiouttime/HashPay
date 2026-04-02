package model

import "time"

type OrderStatus int

const (
	OrderPending OrderStatus = 0
	OrderPaid    OrderStatus = 1
	OrderExpired OrderStatus = 2
	OrderFailed  OrderStatus = 3
)

func (s OrderStatus) String() string {
	switch s {
	case OrderPaid:
		return "paid"
	case OrderExpired:
		return "expired"
	case OrderFailed:
		return "failed"
	default:
		return "pending"
	}
}

type Order struct {
	ID          string
	Amount      float64
	Currency    string
	PayCurrency string
	PayAmount   float64
	PayAddr     string
	PayChain    string
	PayMethod   string
	TxHash      string
	Status      OrderStatus
	SiteID      string
	Callback    string
	ExpireAt    time.Time
	PaidAt      time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// IsExpired 检查订单是否已过期
func (o *Order) IsExpired() bool {
	return time.Now().After(o.ExpireAt)
}

// IsPending 检查订单是否待支付
func (o *Order) IsPending() bool {
	return o.Status == OrderPending && !o.IsExpired()
}
