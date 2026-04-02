package model

import (
	"time"

	"github.com/shopspring/decimal"
)

type Transaction struct {
	ID        int64
	OrderID   string
	Chain     string
	TxHash    string
	FromAddr  string
	ToAddr    string
	Amount    decimal.Decimal
	Currency  string
	BlockNum  int64
	Confirmed bool
	RawData   string
	CreatedAt time.Time
}
