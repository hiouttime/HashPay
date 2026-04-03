package test

import (
	"testing"

	"hashpay/internal/payments"

	"github.com/shopspring/decimal"
)

type fakeFX struct{}

func (fakeFX) Convert(amount float64, from, to string) float64 {
	if from == to {
		return amount
	}
	return amount / 7
}

func (fakeFX) Rate(from, to string) float64 {
	if from == to {
		return 1
	}
	return 7
}

func TestRegistryAndDriverFlow(t *testing.T) {
	reg := payments.DefaultRegistry()
	driver, ok := reg.Driver("chain/evm")
	if !ok {
		t.Fatalf("missing evm driver")
	}
	if driver.Meta().Kind != "chain" {
		t.Fatalf("unexpected kind: %s", driver.Meta().Kind)
	}
	if len(driver.FormSchema()) == 0 {
		t.Fatalf("schema should not be empty")
	}

	quotes, err := driver.Quote(payments.QuoteRequest{
		Method: payments.Method{
			ID:      1,
			Name:    "Main EVM",
			Driver:  "chain/evm",
			Kind:    "chain",
			Enabled: true,
			Fields: map[string]string{
				"network":    "eth",
				"address":    "0x1111111111111111111111111111111111111111",
				"currencies": "USDT,ETH",
			},
		},
		FiatAmount:   700,
		FiatCurrency: "CNY",
	}, fakeFX{})
	if err != nil {
		t.Fatalf("quote: %v", err)
	}
	if len(quotes) != 2 {
		t.Fatalf("expected 2 quotes, got %d", len(quotes))
	}

	route, err := driver.Assign(payments.AssignRequest{
		Method: payments.Method{
			ID:      1,
			Name:    "Main EVM",
			Driver:  "chain/evm",
			Kind:    "chain",
			Enabled: true,
			Fields: map[string]string{
				"network": "eth",
				"address": "0x1111111111111111111111111111111111111111",
			},
		},
		FiatAmount:   700,
		FiatCurrency: "CNY",
		Currency:     "USDT",
	}, fakeFX{})
	if err != nil {
		t.Fatalf("assign: %v", err)
	}
	if route.Network != "eth" || route.Address == "" {
		t.Fatalf("unexpected route: %+v", route)
	}
}

func TestExchangeDriverWithoutScanner(t *testing.T) {
	reg := payments.DefaultRegistry()
	driver, ok := reg.Driver("exchange/binance")
	if !ok {
		t.Fatalf("missing exchange driver")
	}
	route, err := driver.Assign(payments.AssignRequest{
		Method: payments.Method{
			ID:     2,
			Name:   "Binance",
			Driver: "exchange/binance",
			Kind:   "exchange",
			Fields: map[string]string{
				"account_name": "UID123",
				"memo":         "memo",
			},
		},
		FiatAmount:   70,
		FiatCurrency: "USD",
		Currency:     "USDT",
	}, fakeFX{})
	if err != nil {
		t.Fatalf("assign exchange: %v", err)
	}
	if route.AccountName != "UID123" {
		t.Fatalf("unexpected account name: %s", route.AccountName)
	}
	if driver.Scanner(payments.Method{}, false) != nil {
		t.Fatalf("exchange driver should not expose scanner")
	}
}

func TestScanMatch(t *testing.T) {
	reg := payments.DefaultRegistry()
	driver, ok := reg.Driver("chain/tron")
	if !ok {
		t.Fatalf("missing tron driver")
	}
	scan := driver.Scanner(payments.Method{
		Fields: map[string]string{
			"confirm_tolerance": "0.01",
		},
	}, false)
	if scan == nil {
		t.Fatalf("expected scanner")
	}
	ok = scan.Match(payments.Method{}, payments.Route{
		Network:  "tron",
		Currency: "USDT",
		Amount:   12.34,
		Address:  "TTestAddress111111111111111111111111",
	}, payments.Transaction{
		Hash:     "tx-1",
		Chain:    payments.ChainTRON,
		To:       "TTestAddress111111111111111111111111",
		Currency: "USDT",
		Amount:   decimal.NewFromFloat(12.341),
	})
	if !ok {
		t.Fatalf("expected transaction match")
	}
}
