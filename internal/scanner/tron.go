package scanner

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/shopspring/decimal"
)

// TronAPI Tron 链 API 实现
type TronAPI struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

// NewTronAPI 创建 Tron API
func NewTronAPI(baseURL, apiKey string) *TronAPI {
	return &TronAPI{
		baseURL: baseURL,
		apiKey:  apiKey,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (t *TronAPI) ChainType() ChainType {
	return ChainTRON
}

func (t *TronAPI) GetTransactions(addr string, fromTime int64) ([]Transaction, error) {
	// 获取 TRC20 USDT 交易
	url := fmt.Sprintf("%s/v1/accounts/%s/transactions/trc20?limit=50&min_timestamp=%d",
		t.baseURL, addr, fromTime*1000)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	if t.apiKey != "" {
		req.Header.Set("TRON-PRO-API-KEY", t.apiKey)
	}

	resp, err := t.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			TransactionID string `json:"transaction_id"`
			From          string `json:"from"`
			To            string `json:"to"`
			Value         string `json:"value"`
			TokenInfo     struct {
				Symbol   string `json:"symbol"`
				Decimals int    `json:"decimals"`
			} `json:"token_info"`
			BlockTimestamp int64 `json:"block_timestamp"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var txs []Transaction
	for _, d := range result.Data {
		amount, _ := decimal.NewFromString(d.Value)
		decimals := d.TokenInfo.Decimals
		if decimals > 0 {
			amount = amount.Div(decimal.New(1, int32(decimals)))
		}

		txs = append(txs, Transaction{
			Hash:      d.TransactionID,
			From:      d.From,
			To:        d.To,
			Amount:    amount,
			Currency:  d.TokenInfo.Symbol,
			Timestamp: d.BlockTimestamp / 1000,
		})
	}

	return txs, nil
}

func (t *TronAPI) GetTransaction(hash string) (*Transaction, error) {
	url := fmt.Sprintf("%s/v1/transactions/%s", t.baseURL, hash)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	if t.apiKey != "" {
		req.Header.Set("TRON-PRO-API-KEY", t.apiKey)
	}

	resp, err := t.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// 简化实现，实际需要解析完整交易数据
	return nil, nil
}

func (t *TronAPI) ValidateAddress(addr string) bool {
	// TRON 地址以 T 开头，长度 34
	return len(addr) == 34 && addr[0] == 'T'
}
