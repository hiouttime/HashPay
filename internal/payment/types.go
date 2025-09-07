package payment

import (
	"time"

	"github.com/shopspring/decimal"
)

type ChainType string
type PaymentType string
type OrderStatus int

const (
	ChainTRON   ChainType = "TRON"
	ChainETH    ChainType = "ETH"
	ChainBSC    ChainType = "BSC"
	ChainMATIC  ChainType = "MATIC"
	ChainSOL    ChainType = "SOL"
	ChainTON    ChainType = "TON"
)

const (
	PayTypeBlockchain PaymentType = "blockchain"
	PayTypeExchange   PaymentType = "exchange"
	PayTypeWallet     PaymentType = "wallet"
)

const (
	OrderPending OrderStatus = 0
	OrderPaid    OrderStatus = 1
	OrderExpired OrderStatus = 2
	OrderFailed  OrderStatus = 3
)

type Transaction struct {
	Hash      string
	From      string
	To        string
	Amount    decimal.Decimal
	Currency  string
	BlockNum  int64
	Timestamp int64
	Status    string
}

type PaymentMethod struct {
	Type     PaymentType
	Chain    ChainType
	Currency string
	Address  string
	Enabled  bool
}

type Order struct {
	ID          string
	Amount      decimal.Decimal
	Currency    string
	PayAmount   decimal.Decimal
	PayCurrency string
	PayAddr     string
	PayChain    string
	Status      OrderStatus
	ExpireAt    time.Time
	CreatedAt   time.Time
}

type ChainAPI interface {
	GetTxs(addr string, from int64) ([]Transaction, error)
	GetTx(hash string) (*Transaction, error)
	ValidateAddr(addr string) bool
}

type ExchangeAPI interface {
	GetDeposits(currency string, from int64) ([]Transaction, error)
	GetBalance(currency string) (decimal.Decimal, error)
}

type WalletAPI interface {
	CheckPay(orderId string) (bool, error)
	CreatePay(amount decimal.Decimal, currency string) (string, error)
}

type PaymentProcessor struct {
	chains    map[ChainType]ChainAPI
	exchanges map[string]ExchangeAPI
	wallets   map[string]WalletAPI
	scheduler *APIScheduler
}