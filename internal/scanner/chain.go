package scanner

import (
	"strings"

	"github.com/shopspring/decimal"
)

// ChainType 区块链类型
type ChainType string

const (
	ChainTRON    ChainType = "tron"
	ChainETH     ChainType = "eth"
	ChainBSC     ChainType = "bsc"
	ChainPolygon ChainType = "polygon"
	ChainSolana  ChainType = "solana"
	ChainTON     ChainType = "ton"
	ChainEVM     ChainType = "evm"
)

// Transaction 链上交易
type Transaction struct {
	Hash      string
	Chain     ChainType
	From      string
	To        string
	Amount    decimal.Decimal
	Currency  string
	BlockNum  int64
	Timestamp int64
}

func normalizeChain(raw string) ChainType {
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
	case "evm":
		return ChainEVM
	default:
		return ChainType(strings.ToLower(strings.TrimSpace(raw)))
	}
}

// ChainAPI 链 API 接口
type ChainAPI interface {
	// GetTransactions 获取指定地址的交易记录
	GetTransactions(addr string, fromTime int64) ([]Transaction, error)

	// GetTransaction 获取指定交易详情
	GetTransaction(hash string) (*Transaction, error)

	// ValidateAddress 验证地址格式
	ValidateAddress(addr string) bool

	// ChainType 返回链类型
	ChainType() ChainType
}
