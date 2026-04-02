package scanner

import "github.com/shopspring/decimal"

// ChainType 区块链类型
type ChainType string

const (
	ChainTRON ChainType = "TRON"
	ChainBSC  ChainType = "BSC"
	ChainETH  ChainType = "ETH"
)

// Transaction 链上交易
type Transaction struct {
	Hash      string
	From      string
	To        string
	Amount    decimal.Decimal
	Currency  string
	BlockNum  int64
	Timestamp int64
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
