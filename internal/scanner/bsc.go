package scanner

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

// BSCAPI BSC 链 API 实现
type BSCAPI struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

// NewBSCAPI 创建 BSC API
func NewBSCAPI(baseURL, apiKey string) *BSCAPI {
	return &BSCAPI{
		baseURL: baseURL,
		apiKey:  apiKey,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (b *BSCAPI) ChainType() ChainType {
	return ChainBSC
}

func (b *BSCAPI) GetTransactions(addr string, fromTime int64) ([]Transaction, error) {
	// BscScan API 获取 BEP20 代币交易
	url := fmt.Sprintf("%s/api?module=account&action=tokentx&address=%s&startblock=0&endblock=99999999&sort=desc&apikey=%s",
		b.baseURL, addr, b.apiKey)

	resp, err := b.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Status  string `json:"status"`
		Message string `json:"message"`
		Result  []struct {
			Hash            string `json:"hash"`
			From            string `json:"from"`
			To              string `json:"to"`
			Value           string `json:"value"`
			TokenSymbol     string `json:"tokenSymbol"`
			TokenDecimal    string `json:"tokenDecimal"`
			BlockNumber     string `json:"blockNumber"`
			TimeStamp       string `json:"timeStamp"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if result.Status != "1" {
		return nil, fmt.Errorf("API error: %s", result.Message)
	}

	var txs []Transaction
	for _, r := range result.Result {
		// 解析时间戳
		var ts int64
		fmt.Sscanf(r.TimeStamp, "%d", &ts)

		if ts < fromTime {
			continue
		}

		// 解析金额
		amount, _ := decimal.NewFromString(r.Value)
		var decimals int
		fmt.Sscanf(r.TokenDecimal, "%d", &decimals)
		if decimals > 0 {
			amount = amount.Div(decimal.New(1, int32(decimals)))
		}

		// 解析区块号
		var blockNum int64
		fmt.Sscanf(r.BlockNumber, "%d", &blockNum)

		txs = append(txs, Transaction{
			Hash:      r.Hash,
			From:      r.From,
			To:        r.To,
			Amount:    amount,
			Currency:  r.TokenSymbol,
			BlockNum:  blockNum,
			Timestamp: ts,
		})
	}

	return txs, nil
}

func (b *BSCAPI) GetTransaction(hash string) (*Transaction, error) {
	url := fmt.Sprintf("%s/api?module=proxy&action=eth_getTransactionByHash&txhash=%s&apikey=%s",
		b.baseURL, hash, b.apiKey)

	resp, err := b.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// 简化实现
	return nil, nil
}

func (b *BSCAPI) ValidateAddress(addr string) bool {
	// BSC 地址格式与 ETH 相同，以 0x 开头，长度 42
	return len(addr) == 42 && strings.HasPrefix(addr, "0x")
}
