package payments

import (
	"math"
	"strings"

	"github.com/shopspring/decimal"
)

type Chain string

const (
	ChainTRON    Chain = "tron"
	ChainETH     Chain = "eth"
	ChainBSC     Chain = "bsc"
	ChainPolygon Chain = "polygon"
	ChainSolana  Chain = "solana"
	ChainTON     Chain = "ton"
)

type Transaction struct {
	Hash      string
	Chain     Chain
	From      string
	To        string
	Amount    decimal.Decimal
	Currency  string
	BlockNum  int64
	Timestamp int64
}

type Scanner interface {
	Scan(route Route, fromTime int64) ([]Transaction, error)
	Match(method Method, route Route, tx Transaction) bool
}

func normalizeChain(raw string) Chain {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "tron", "trc20":
		return ChainTRON
	case "eth", "ethereum", "erc20":
		return ChainETH
	case "bsc", "bnb", "bep20":
		return ChainBSC
	case "polygon", "matic":
		return ChainPolygon
	case "sol", "solana":
		return ChainSolana
	case "ton":
		return ChainTON
	default:
		return Chain(strings.ToLower(strings.TrimSpace(raw)))
	}
}

type ChainAPI interface {
	GetTransactions(addr string, fromTime int64) ([]Transaction, error)
	GetTransaction(hash string) (*Transaction, error)
	ValidateAddress(addr string) bool
	ChainType() Chain
}

type chainScanner struct {
	api       ChainAPI
	chain     Chain
	tolerance float64
}

func (s chainScanner) Scan(route Route, fromTime int64) ([]Transaction, error) {
	if s.api == nil {
		return nil, nil
	}
	return s.api.GetTransactions(route.Address, fromTime)
}

func (s chainScanner) Match(method Method, route Route, tx Transaction) bool {
	if tx.Hash == "" || !strings.EqualFold(strings.TrimSpace(tx.Currency), strings.TrimSpace(route.Currency)) {
		return false
	}
	if route.Address != "" && tx.To != "" && !addressMatch(normalizeChain(route.Network), route.Address, tx.To) {
		return false
	}
	return amountMatch(route.Amount, tx.Amount, s.tolerance)
}

func addressMatch(chain Chain, a, b string) bool {
	left := strings.TrimSpace(a)
	right := strings.TrimSpace(b)
	if left == "" || right == "" {
		return false
	}
	switch chain {
	case ChainETH, ChainBSC, ChainPolygon:
		return strings.EqualFold(left, right)
	default:
		return left == right
	}
}

func amountMatch(expect float64, got decimal.Decimal, tolerance float64) bool {
	if tolerance <= 0 {
		tolerance = 0.000001
	}
	return math.Abs(got.InexactFloat64()-expect) <= tolerance
}
