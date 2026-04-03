package scanner

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
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
	// 获取 TRC20 交易
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
				Address  string `json:"address"`
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
		if !t.isAllowedTRC20(d.TokenInfo.Symbol, d.TokenInfo.Address) {
			continue
		}

		amount, _ := decimal.NewFromString(d.Value)
		decimals := d.TokenInfo.Decimals
		if decimals > 0 {
			amount = amount.Div(decimal.New(1, int32(decimals)))
		}

		txs = append(txs, Transaction{
			Hash:      d.TransactionID,
			Chain:     ChainTRON,
			From:      d.From,
			To:        d.To,
			Amount:    amount,
			Currency:  strings.ToUpper(strings.TrimSpace(d.TokenInfo.Symbol)),
			Timestamp: d.BlockTimestamp / 1000,
		})
	}

	nativeTxs, err := t.getNativeTransactions(addr, fromTime)
	if err != nil {
		return nil, err
	}
	txs = append(txs, nativeTxs...)
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

func (t *TronAPI) getNativeTransactions(addr string, fromTime int64) ([]Transaction, error) {
	url := fmt.Sprintf("%s/v1/accounts/%s/transactions?limit=50&only_to=true&min_timestamp=%d",
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
			TxID           string `json:"txID"`
			BlockTimestamp int64  `json:"block_timestamp"`
			RawData        struct {
				Contract []struct {
					Type      string `json:"type"`
					Parameter struct {
						Value struct {
							Amount int64  `json:"amount"`
							Owner  string `json:"owner_address"`
							To     string `json:"to_address"`
						} `json:"value"`
					} `json:"parameter"`
				} `json:"contract"`
			} `json:"raw_data"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	txs := make([]Transaction, 0, len(result.Data))
	for _, item := range result.Data {
		if item.TxID == "" {
			continue
		}
		if len(item.RawData.Contract) == 0 {
			continue
		}
		contract := item.RawData.Contract[0]
		if contract.Type != "TransferContract" {
			continue
		}
		if contract.Parameter.Value.Amount <= 0 {
			continue
		}
		txs = append(txs, Transaction{
			Hash:      item.TxID,
			Chain:     ChainTRON,
			From:      contract.Parameter.Value.Owner,
			To:        addr,
			Amount:    decimal.NewFromInt(contract.Parameter.Value.Amount).Div(decimal.New(1, 6)),
			Currency:  "TRX",
			Timestamp: item.BlockTimestamp / 1000,
		})
	}
	return txs, nil
}

func (t *TronAPI) isAllowedTRC20(symbol, contract string) bool {
	coin := strings.ToUpper(strings.TrimSpace(symbol))
	addr := strings.TrimSpace(contract)
	if coin == "" || addr == "" {
		return false
	}

	for _, item := range t.allowedTRC20Contracts(coin) {
		if strings.EqualFold(strings.TrimSpace(item), addr) {
			return true
		}
	}
	return false
}

func (t *TronAPI) allowedTRC20Contracts(symbol string) []string {
	coin := strings.ToUpper(strings.TrimSpace(symbol))
	if coin == "" {
		return nil
	}

	if strings.Contains(strings.ToLower(strings.TrimSpace(t.baseURL)), "nile") {
		switch coin {
		case "USDT":
			return []string{"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"}
		default:
			return nil
		}
	}

	switch coin {
	case "USDT":
		return []string{"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"}
	default:
		return nil
	}
}
